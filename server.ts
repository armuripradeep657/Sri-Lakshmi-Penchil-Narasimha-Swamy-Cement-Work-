import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '2mb' }));

// Simple in-memory rate limiter for API routes (120 req/min per IP)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  if (bucket.count >= 120) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }
  bucket.count += 1;
  return next();
}

app.use('/api', apiRateLimit);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'slp-billing-api',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

// Server-side financial calculation and validation for bills
interface CalcItemInput {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

app.post('/api/bills/calculate', (req: Request, res: Response) => {
  try {
    const {
      items,
      overallDiscount = 0,
      taxEnabled = false,
      gstType = 'NONE',
      labourCharge = 0,
      autoCharge = 0,
      amountPaid = 0,
    } = req.body as {
      items?: CalcItemInput[];
      overallDiscount?: number;
      taxEnabled?: boolean;
      gstType?: 'NONE' | 'CGST_SGST' | 'IGST';
      labourCharge?: number;
      autoCharge?: number;
      amountPaid?: number;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one valid line item is required.' });
    }
    if (items.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 items per bill.' });
    }

    let subtotal = 0;
    let totalItemDiscount = 0;
    let totalTax = 0;

    const calculatedItems = items.map((item) => {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);
      const itemDisc = Math.max(0, Number(item.discount || 0));
      const rate = taxEnabled ? Math.max(0, Math.min(100, Number(item.taxRate || 0))) : 0;

      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
        throw new Error(`Invalid quantity or price for ${item.productName || 'item'}`);
      }

      const gross = Math.round(qty * price * 100) / 100;
      const clampedDisc = Math.min(gross, Math.round(itemDisc * 100) / 100);
      const netBeforeTax = Math.round((gross - clampedDisc) * 100) / 100;
      const itemTax = taxEnabled && gstType !== 'NONE'
        ? Math.round((netBeforeTax * rate / 100) * 100) / 100
        : 0;
      const lineTotal = Math.round((netBeforeTax + itemTax) * 100) / 100;

      subtotal += gross;
      totalItemDiscount += clampedDisc;
      totalTax += itemTax;

      return {
        productId: String(item.productId),
        productName: String(item.productName),
        quantity: qty,
        unitPrice: price,
        discount: clampedDisc,
        taxRate: rate,
        taxAmount: itemTax,
        lineTotal,
      };
    });

    subtotal = Math.round(subtotal * 100) / 100;
    const extraDiscount = Math.max(0, Math.round(Number(overallDiscount || 0) * 100) / 100);
    const maxExtraDiscount = Math.max(0, subtotal - totalItemDiscount);
    const clampedExtraDiscount = Math.min(extraDiscount, maxExtraDiscount);
    const discountAmount = Math.round((totalItemDiscount + clampedExtraDiscount) * 100) / 100;

    const taxableAmount = Math.round((subtotal - discountAmount) * 100) / 100;

    // Proportionally adjust tax if overall discount was applied
    if (clampedExtraDiscount > 0 && subtotal - totalItemDiscount > 0) {
      const factor = taxableAmount / (subtotal - totalItemDiscount);
      totalTax = Math.round(totalTax * factor * 100) / 100;
    } else {
      totalTax = Math.round(totalTax * 100) / 100;
    }

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (taxEnabled && gstType === 'CGST_SGST') {
      cgstAmount = Math.round((totalTax / 2) * 100) / 100;
      sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;
    } else if (taxEnabled && gstType === 'IGST') {
      igstAmount = totalTax;
    } else {
      totalTax = 0;
    }

    const safeLabourCharge = Math.max(0, Math.round((Number(labourCharge) || 0) * 100) / 100);
    const safeAutoCharge = Math.max(0, Math.round((Number(autoCharge) || 0) * 100) / 100);

    const grandTotal = Math.round((taxableAmount + totalTax + safeLabourCharge + safeAutoCharge) * 100) / 100;
    const paid = Math.max(0, Math.min(grandTotal, Math.round(Number(amountPaid || 0) * 100) / 100));
    const pendingBalance = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);

    let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending';
    if (grandTotal === 0 || pendingBalance === 0) {
      paymentStatus = 'paid';
    } else if (paid > 0) {
      paymentStatus = 'partial';
    }

    return res.json({
      items: calculatedItems,
      subtotal,
      discountAmount,
      taxableAmount,
      gstType: taxEnabled ? gstType : 'NONE',
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTax,
      labourCharge: safeLabourCharge,
      autoCharge: safeAutoCharge,
      grandTotal,
      amountPaid: paid,
      pendingBalance,
      paymentStatus,
    });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid bill calculation payload.' });
  }
});

// Low-latency AI assistant (gemini-3.1-flash-lite)
app.post('/api/ai/quick-assist', async (req: Request, res: Response) => {
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(400).json({ error: 'Gemini API key is not configured in Settings > Secrets.' });
  }
  const { task, input } = req.body as { task?: string; input?: string };
  if (!input || typeof input !== 'string') {
    return res.status(400).json({ error: 'Input text is required.' });
  }

  try {
    const prompt =
      task === 'translate_telugu'
        ? `Translate this building/cement product name concisely into Telugu script (return only the Telugu translation, max 6 words): "${input.slice(0, 200)}"`
        : `You are a concise assistant for SLP Billing (cement & construction products business). Respond clearly and briefly in plain text:\n${input.slice(0, 1500)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
    });
    return res.json({ text: (response.text || '').trim(), model: 'gemini-3.1-flash-lite' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gemini quick assist failed.';
    return res.status(500).json({ error: msg });
  }
});

// High-Thinking Deep Business Insights (gemini-4-carbon with ThinkingLevel.HIGH, no maxOutputTokens)
app.post('/api/ai/deep-insights', async (req: Request, res: Response) => {
  const ai = getGeminiClient();
  const { summaryPayload, summaryData, question, language } = req.body as {
    summaryPayload?: unknown;
    summaryData?: unknown;
    question?: string;
    language?: string;
  };
  if (!ai) {
    return res.status(400).json({
      error:
        language === 'te'
          ? 'సెట్టింగ్స్‌లో జెమినీ ఏపీఐ కీ కాన్ఫిగర్ చేయబడలేదు.'
          : 'Gemini API key is not configured in Settings > Secrets.',
    });
  }

  try {
    const payload = summaryPayload ?? summaryData ?? {};
    const langInstruction =
      language === 'te'
        ? 'CRITICAL: Respond 100% in Telugu script (తెలుగు) only. Do NOT include any English words or Latin characters anywhere in your response.'
        : 'Keep it structured and practical.';
    const prompt = `Analyze the following live SLP Billing business metrics and answer the owner's question with actionable financial, inventory restocking, pending-receivables collection, and margin insights. ${langInstruction}\n\nQuestion: ${String(question || 'Provide a complete business performance and risk audit.').slice(0, 500)}\n\nLive Business Data:\n${JSON.stringify(payload).slice(0, 12000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-carbon',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });
    const text = (response.text || '').trim();
    return res.json({ text, analysis: text, model: 'gemini-4-carbon' });
  } catch (err: unknown) {
    const msg =
      language === 'te'
        ? 'లోతైన విశ్లేషణ కోసం చెల్లుబాటు అయ్యే జెమినీ ఏపీఐ కీ అవసరం.'
        : err instanceof Error
          ? err.message
          : 'Deep analysis requires a billing-enabled Gemini API key in Settings > Secrets.';
    return res.status(500).json({ error: msg });
  }
});

// High-Quality Product / Brand Image Generation (gemini-3-pro-image-preview with 1K / 2K / 4K)
app.post('/api/ai/generate-product-image', async (req: Request, res: Response) => {
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(400).json({ error: 'Gemini API key is not configured in Settings > Secrets.' });
  }
  const { prompt, imageSize = '1K', aspectRatio = '1:1' } = req.body as {
    prompt?: string;
    imageSize?: '1K' | '2K' | '4K';
    aspectRatio?: '1:1' | '4:3' | '16:9';
  };

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Image prompt is required.' });
  }
  const validSizes = ['1K', '2K', '4K'];
  const selectedSize = validSizes.includes(imageSize) ? imageSize : '1K';
  const validRatios = ['1:1', '4:3', '16:9'];
  const selectedRatio = validRatios.includes(aspectRatio) ? aspectRatio : '1:1';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            text: `Clean commercial studio product photography of precast concrete / cement building item: ${prompt.slice(0, 500)}. Crisp daylight, neat construction yard or neutral architectural stone background, sharp edges, realistic concrete texture.`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: selectedRatio,
          imageSize: selectedSize,
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        return res.json({
          imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
          imageSize: selectedSize,
          model: 'gemini-3-pro-image-preview',
        });
      }
    }
    return res.status(502).json({ error: 'Model did not return an image part.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Image generation requires a billing-enabled Gemini API key in Settings > Secrets.';
    return res.status(500).json({ error: msg });
  }
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SLP Billing server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
