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
    smsConfigured: Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_DLT_TEMPLATE_ID),
    whatsappConfigured: Boolean(process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
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
      amountPaid = 0,
    } = req.body as {
      items?: CalcItemInput[];
      overallDiscount?: number;
      taxEnabled?: boolean;
      gstType?: 'NONE' | 'CGST_SGST' | 'IGST';
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

    const grandTotal = Math.round((taxableAmount + totalTax) * 100) / 100;
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
      grandTotal,
      amountPaid: paid,
      pendingBalance,
      paymentStatus,
    });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid bill calculation payload.' });
  }
});

// MSG91 DLT-Compliant Indian SMS Gateway Endpoint
app.post('/api/messages/sms', async (req: Request, res: Response) => {
  const { mobile, billNumber, grandTotal, invoiceUrl, businessName, senderId, templateId } = req.body as {
    mobile?: string;
    billNumber?: string;
    grandTotal?: number;
    invoiceUrl?: string;
    businessName?: string;
    senderId?: string;
    templateId?: string;
  };

  const cleanMobile = String(mobile || '').replace(/\D/g, '');
  if (cleanMobile.length < 10 || cleanMobile.length > 13) {
    return res.status(400).json({ error: 'Valid 10-13 digit customer mobile number is required for SMS.' });
  }
  const formattedMobile = cleanMobile.length === 10 ? `91${cleanMobile}` : cleanMobile;

  const authKey = process.env.MSG91_AUTH_KEY;
  const effectiveTemplateId = templateId || process.env.MSG91_DLT_TEMPLATE_ID;
  const effectiveSenderId = senderId || process.env.MSG91_SENDER_ID || 'SLPBIL';

  const messagePreview = `${businessName || 'SLP Billing'}: Invoice ${billNumber} generated successfully. Total ₹${Number(grandTotal || 0).toFixed(2)}. View invoice: ${invoiceUrl}. Thank you!`;

  if (!authKey || !effectiveTemplateId) {
    return res.status(200).json({
      sent: false,
      configured: false,
      provider: 'MSG91',
      senderId: effectiveSenderId,
      messagePreview,
      error: 'MSG91_AUTH_KEY or DLT Template ID is not configured in server secrets. Configure Secrets to enable automated SMS delivery.',
    });
  }

  try {
    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: effectiveTemplateId,
        sender: effectiveSenderId,
        short_url: '1',
        recipients: [
          {
            mobiles: formattedMobile,
            var1: billNumber || '',
            var2: String(Number(grandTotal || 0).toFixed(2)),
            var3: invoiceUrl || '',
          },
        ],
      }),
    });

    const data = (await response.json()) as { type?: string; message?: string; request_id?: string };
    if (!response.ok || data.type === 'error') {
      return res.status(502).json({
        sent: false,
        configured: true,
        provider: 'MSG91',
        error: data.message || 'MSG91 gateway rejected the SMS request.',
      });
    }

    return res.json({
      sent: true,
      configured: true,
      provider: 'MSG91',
      providerMessageId: data.request_id || 'msg91-queued',
      messagePreview,
    });
  } catch (err) {
    return res.status(502).json({
      sent: false,
      configured: true,
      provider: 'MSG91',
      error: err instanceof Error ? err.message : 'Network error connecting to MSG91.',
    });
  }
});

// Official WhatsApp Business Platform Cloud API Endpoint
app.post('/api/messages/whatsapp', async (req: Request, res: Response) => {
  const { mobile, billNumber, dateStr, grandTotal, paymentStatus, invoiceUrl, businessName } = req.body as {
    mobile?: string;
    billNumber?: string;
    dateStr?: string;
    grandTotal?: number;
    paymentStatus?: string;
    invoiceUrl?: string;
    businessName?: string;
  };

  const cleanMobile = String(mobile || '').replace(/\D/g, '');
  if (cleanMobile.length < 10 || cleanMobile.length > 13) {
    return res.status(400).json({ error: 'Valid customer mobile number is required for WhatsApp.' });
  }
  const formattedMobile = cleanMobile.length === 10 ? `91${cleanMobile}` : cleanMobile;

  const messageText = [
    'Dear Customer,',
    'Thank you for shopping with us!',
    'Your invoice has been generated.',
    '',
    `Business: ${businessName || 'SLP Billing'}`,
    `Invoice Number: ${billNumber || ''}`,
    `Date: ${dateStr || new Date().toLocaleDateString('en-IN')}`,
    `Total Amount: ₹${Number(grandTotal || 0).toFixed(2)}`,
    `Payment Status: ${(paymentStatus || 'pending').toUpperCase()}`,
    '',
    'View your invoice:',
    invoiceUrl || '',
    '',
    'Thank you for choosing us.',
  ].join('\n');

  const waShareUrl = `https://wa.me/${formattedMobile}?text=${encodeURIComponent(messageText)}`;
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return res.json({
      sent: false,
      configured: false,
      waShareUrl,
      messageText,
      info: 'WhatsApp Business Cloud API credentials are not configured. Use the official WhatsApp share link to open WhatsApp Web/App with the pre-filled invoice.',
    });
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedMobile,
        type: 'text',
        text: { preview_url: true, body: messageText },
      }),
    });

    const data = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!response.ok || data.error) {
      return res.status(502).json({
        sent: false,
        configured: true,
        waShareUrl,
        messageText,
        error: data.error?.message || 'WhatsApp Cloud API returned an error.',
      });
    }

    return res.json({
      sent: true,
      configured: true,
      providerMessageId: data.messages?.[0]?.id || 'wa-sent',
      waShareUrl,
      messageText,
    });
  } catch (err) {
    return res.status(502).json({
      sent: false,
      configured: true,
      waShareUrl,
      messageText,
      error: err instanceof Error ? err.message : 'Network error calling WhatsApp Business API.',
    });
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
  if (!ai) {
    return res.status(400).json({ error: 'Gemini API key is not configured in Settings > Secrets.' });
  }
  const { summaryPayload, question } = req.body as { summaryPayload?: unknown; question?: string };

  try {
    const prompt = `Analyze the following live SLP Billing business metrics and answer the owner's question with actionable financial, inventory restocking, pending-receivables collection, and margin insights. Keep it structured and practical.\n\nQuestion: ${String(question || 'Provide a complete business performance and risk audit.').slice(0, 500)}\n\nLive Business Data:\n${JSON.stringify(summaryPayload || {}).slice(0, 12000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-carbon',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });
    return res.json({ text: (response.text || '').trim(), model: 'gemini-4-carbon' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Deep analysis requires a billing-enabled Gemini API key in Settings > Secrets.';
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
