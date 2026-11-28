import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

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

interface ParsedGeminiError {
  code: number;
  status: string;
  message: string;
  isTransient: boolean;
}

function parseGeminiError(err: unknown): ParsedGeminiError {
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const rawObj = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>;
  let code = typeof rawObj.status === 'number' ? rawObj.status : typeof rawObj.code === 'number' ? rawObj.code : 500;
  let status = typeof rawObj.status === 'string' ? rawObj.status : '';
  let message = rawMessage;

  const jsonStart = rawMessage.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
        code?: number;
        message?: string;
        status?: string;
      };
      const inner = parsed.error ?? parsed;
      if (typeof inner.code === 'number') code = inner.code;
      if (typeof inner.status === 'string') status = inner.status;
      if (typeof inner.message === 'string' && inner.message.trim()) {
        message = inner.message.trim();
      }
    } catch {
      // Keep original message if not valid JSON
    }
  }

  const isTransient =
    code === 503 ||
    code === 429 ||
    code === 502 ||
    code === 504 ||
    status === 'UNAVAILABLE' ||
    status === 'RESOURCE_EXHAUSTED' ||
    /high demand|unavailable|overloaded|temporarily|try again later|rate limit|timeout|etimedout|econnreset|fetch failed/i.test(
      message
    );

  return { code, status, message, isTransient };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCleanAiError(parsed: ParsedGeminiError, isTe: boolean, fallbackEn: string, fallbackTe: string): {
  statusCode: number;
  error: string;
} {
  if (
    parsed.code === 400 ||
    parsed.code === 403 ||
    parsed.status === 'PERMISSION_DENIED' ||
    /API_KEY_INVALID|permission denied/i.test(parsed.message)
  ) {
    return {
      statusCode: parsed.code === 403 ? 403 : 400,
      error: isTe
        ? 'జెమినీ ఏపీఐ కీ చెల్లుబాటు కావడం లేదు. దయచేసి Settings > Secrets లో తనిఖీ చేయండి.'
        : 'Gemini API key issue detected. Please check your key in Settings > Secrets.',
    };
  }
  if (parsed.isTransient) {
    return {
      statusCode: 503,
      error: isTe
        ? 'ప్రస్తుతం సర్వర్ రద్దీగా ఉంది. దయచేసి కొన్ని క్షణాల తర్వాత "మళ్లీ చదువు" నొక్కండి లేదా క్రింద వస్తువులను జోడించండి.'
        : 'AI scanner is temporarily busy due to high demand. Please tap Re-read in a moment or add items manually below.',
    };
  }
  return {
    statusCode: 500,
    error: isTe ? fallbackTe : parsed.message || fallbackEn,
  };
}

function parseJsonObjectSafe<T>(rawText: string, fallback: T): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return fallback;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
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
      const rate = 0;

      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
        throw new Error(`Invalid quantity or price for ${item.productName || 'item'}`);
      }

      const gross = Math.round(qty * price * 100) / 100;
      const clampedDisc = Math.min(gross, Math.round(itemDisc * 100) / 100);
      const netBeforeTax = Math.round((gross - clampedDisc) * 100) / 100;
      const itemTax = 0;
      const lineTotal = netBeforeTax;

      subtotal += gross;
      totalItemDiscount += clampedDisc;

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
    totalTax = 0;
    const cgstAmount = 0;
    const sgstAmount = 0;
    const igstAmount = 0;

    const safeLabourCharge = Math.max(0, Math.round((Number(labourCharge) || 0) * 100) / 100);
    const safeAutoCharge = Math.max(0, Math.round((Number(autoCharge) || 0) * 100) / 100);

    const grandTotal = Math.round((taxableAmount + safeLabourCharge + safeAutoCharge) * 100) / 100;
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
      gstType: 'NONE',
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

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
    let lastParsedErr: ParsedGeminiError | null = null;
    for (const modelName of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
          });
          return res.json({ text: (response.text || '').trim(), model: modelName });
        } catch (err: unknown) {
          lastParsedErr = parseGeminiError(err);
          if (!lastParsedErr.isTransient) break;
          if (attempt === 0) await sleep(500);
        }
      }
      if (lastParsedErr && !lastParsedErr.isTransient) break;
    }

    const formatted = formatCleanAiError(
      lastParsedErr || { code: 500, status: '', message: 'Gemini quick assist failed.', isTransient: false },
      false,
      'Gemini quick assist failed.',
      'జెమినీ సహాయకుడు విఫలమైంది.'
    );
    return res.status(formatted.statusCode).json({ error: formatted.error });
  } catch (err: unknown) {
    const parsed = parseGeminiError(err);
    const formatted = formatCleanAiError(parsed, false, 'Gemini quick assist failed.', 'జెమినీ సహాయకుడు విఫలమైంది.');
    return res.status(formatted.statusCode).json({ error: formatted.error });
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

// Scan handwritten / printed paper item list photo and match against shop product catalog
interface CatalogSummaryInput {
  id: string;
  productCode?: string;
  name: string;
  nameTe?: string;
  category?: string;
  sellingPrice?: number;
  variantsSummary?: string;
}

app.post('/api/ai/scan-paper-list', async (req: Request, res: Response) => {
  const { imageDataUrl, catalog, language } = req.body as {
    imageDataUrl?: string;
    catalog?: CatalogSummaryInput[];
    language?: string;
  };
  const isTe = language === 'te';

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(400).json({
      error: isTe
        ? 'సెట్టింగ్స్ > సీక్రెట్స్‌లో జెమినీ ఏపీఐ కీ కాన్ఫిగర్ చేయబడలేదు.'
        : 'Gemini API key is not configured in Settings > Secrets.',
    });
  }

  if (!imageDataUrl || typeof imageDataUrl !== 'string' || imageDataUrl.length > 9_000_000) {
    return res.status(400).json({
      error: isTe
        ? 'చెల్లుబాటు అయ్యే ఫోటో పంపబడలేదు.'
        : 'A valid camera or gallery photo is required.',
    });
  }

  const dataUrlMatch = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    imageDataUrl.trim()
  );
  if (!dataUrlMatch) {
    return res.status(400).json({
      error: isTe
        ? 'ఫోటో ఫార్మాట్ చెల్లదు. దయచేసి మళ్లీ ఫోటో తీయండి.'
        : 'Unsupported image format. Please capture or choose a JPEG, PNG, or WebP photo.',
    });
  }

  const rawMime = dataUrlMatch[1].toLowerCase();
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const base64Data = dataUrlMatch[2];

  const safeCatalog = Array.isArray(catalog) ? catalog.slice(0, 300) : [];
  const validCatalogIds = new Set(safeCatalog.map((p) => String(p.id)));
  const catalogLines = safeCatalog
    .map((p) => {
      const tePart = p.nameTe ? ` / ${p.nameTe}` : '';
      const variantsPart = p.variantsSummary ? ` | Variants: ${p.variantsSummary}` : '';
      return `ID=${p.id} | Code=${p.productCode || ''} | Name=${p.name}${tePart} | Price=${Number(p.sellingPrice || 0)}${variantsPart}`;
    })
    .join('\n');

  try {
    const prompt = `You are an expert billing clerk reading a photo of a handwritten or printed customer item list on paper (written in English, Telugu script, Telugu written in English letters, or mixed numbers).

Extract EVERY item row written on the paper and match each row to the closest product and variant from the Shop Product Catalog below.

Rules:
1. Extract every visible item line (do not skip lines).
2. "writtenText": exact brief text as seen on paper for that line (e.g. "Darwaja 6FT - 2" or "గగులు 3ft x 4").
3. "matchedProductId": exact ID from the catalog below if there is a reasonable match; otherwise "".
4. "matchedVariantLabel": if the product has Variants listed and the paper mentions a size/variant (like 6FT, 9inch, 3ft, etc.), output the exact variant label string from the catalog; otherwise "".
5. "quantity": numeric quantity ordered on that line (must be > 0, default 1 if quantity is omitted).
6. "unitPrice": numeric rate per single unit ONLY if a unit rate is explicitly written on the paper for that item; otherwise 0 (0 tells the billing app to use the catalog/variant selling price).
7. "confidence": "high", "medium", or "low".

Shop Product Catalog:
${catalogLines || '(Empty catalog)'}`;

    const scanSchema = {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              writtenText: { type: Type.STRING },
              matchedProductId: { type: Type.STRING },
              matchedVariantLabel: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              unitPrice: { type: Type.NUMBER },
              confidence: { type: Type.STRING },
            },
            required: [
              'writtenText',
              'matchedProductId',
              'matchedVariantLabel',
              'quantity',
              'unitPrice',
              'confidence',
            ],
          },
        },
      },
      required: ['items'],
    };

    const contentsPayload = {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        { text: prompt },
      ],
    };

    const modelAttempts: Array<{ model: string; useThinkingLow: boolean }> = [
      { model: 'gemini-4-hydrogen', useThinkingLow: true },
      { model: 'gemini-4-hydrogen', useThinkingLow: true },
      { model: 'gemini-3.1-flash-lite', useThinkingLow: false },
      { model: 'gemini-3.1-flash-lite', useThinkingLow: false },
    ];

    let responseText = '';
    let usedModel = 'gemini-4-hydrogen';
    let lastParsedErr: ParsedGeminiError | null = null;

    for (let i = 0; i < modelAttempts.length; i++) {
      const { model, useThinkingLow } = modelAttempts[i];
      try {
        const response = await ai.models.generateContent({
          model,
          contents: contentsPayload,
          config: {
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            responseSchema: scanSchema,
          },
        });
        responseText = response.text || '';
        usedModel = model;
        lastParsedErr = null;
        break;
      } catch (err: unknown) {
        lastParsedErr = parseGeminiError(err);
        if (!lastParsedErr.isTransient) {
          break;
        }
        if (i < modelAttempts.length - 1) {
          await sleep(i === 0 ? 550 : 800);
        }
      }
    }

    if (lastParsedErr) {
      const formatted = formatCleanAiError(
        lastParsedErr,
        isTe,
        'Failed to scan paper item list. Please try again with a clearer photo.',
        'కాగితం జాబితాను చదవడం విఫలమైంది. దయచేసి స్పష్టమైన ఫోటోతో మళ్లీ ప్రయత్నించండి.'
      );
      return res.status(formatted.statusCode).json({ error: formatted.error });
    }

    const parsed = parseJsonObjectSafe<{ items?: unknown[] }>(responseText, {});

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const normalizedItems = rawItems
      .slice(0, 100)
      .map((entry) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const rawPid = typeof row.matchedProductId === 'string' ? row.matchedProductId.trim() : '';
        const matchedProductId = validCatalogIds.has(rawPid) ? rawPid : '';
        const qtyNum = Number(row.quantity);
        const quantity =
          Number.isFinite(qtyNum) && qtyNum > 0
            ? Math.min(10000, Math.round(qtyNum * 100) / 100)
            : 1;
        const priceNum = Number(row.unitPrice);
        const unitPrice =
          Number.isFinite(priceNum) && priceNum > 0
            ? Math.min(10_000_000, Math.round(priceNum * 100) / 100)
            : 0;
        const confRaw = String(row.confidence || 'medium').toLowerCase();
        const confidence =
          confRaw === 'high' || confRaw === 'medium' || confRaw === 'low' ? confRaw : 'medium';

        return {
          writtenText: String(row.writtenText || '').trim().slice(0, 140),
          matchedProductId,
          matchedVariantLabel: matchedProductId
            ? String(row.matchedVariantLabel || '').trim().slice(0, 60)
            : '',
          quantity,
          unitPrice,
          confidence,
        };
      })
      .filter((item) => item.writtenText.length > 0 || item.matchedProductId.length > 0);

    return res.json({
      items: normalizedItems,
      model: usedModel,
    });
  } catch (err: unknown) {
    const parsed = parseGeminiError(err);
    const formatted = formatCleanAiError(
      parsed,
      isTe,
      'Failed to scan paper item list. Please try again with a clearer photo.',
      'కాగితం జాబితాను చదవడం విఫలమైంది. దయచేసి స్పష్టమైన ఫోటోతో మళ్లీ ప్రయత్నించండి.'
    );
    return res.status(formatted.statusCode).json({ error: formatted.error });
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
