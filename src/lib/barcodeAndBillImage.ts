import QRCode from 'qrcode';
import { Bill, BillItem, Business, Language, Product, UpiSetting } from '../types/billing';
import { formatTimestamp } from './firebase';
import { getDefaultProductImage } from './productImages';
import { resolveBusinessLogoUrl } from './seedData';
import { buildUpiUri, formatCurrency } from './upiAndExport';
import {
  formatAppDate,
  getCopyrightNoticeLocalized,
  tr,
  translateAddress,
  translateBusinessName,
  translateCartProductName,
  translateCustomerName,
  translatePaymentMethod,
  translateProprietor,
  translateVariantLabel,
} from './i18n';

// Official ISO/IEC 15417 Code128 bar/space patterns (values 0..106)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export function encodeCode128BModules(text: string): number[] {
  const safe = (text || 'SLP-BILL').replace(/[^\x20-\x7E]/g, '').slice(0, 40) || 'SLP-BILL';
  const codes: number[] = [104]; // Start Code B
  let checksum = 104;

  for (let i = 0; i < safe.length; i++) {
    const val = safe.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  const modules: number[] = [];
  for (const code of codes) {
    const pat = CODE128_PATTERNS[code];
    for (let j = 0; j < pat.length; j++) {
      modules.push(Number(pat[j]));
    }
  }
  return modules;
}

const BARCODE_DIGITS = '23456789';
const BARCODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCryptoBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

/**
 * Generates a unique 12-character mixed numbers + letters verification code (never uses SLP prefix).
 * Guarantees an alternating/shuffled mix of digits and uppercase letters for Code 128.
 */
export function generateUniqueMixedBarcode(): string {
  const bytes = randomCryptoBytes(16);
  const chars: string[] = [];
  // Interleave digits and letters (6 digits + 6 letters) then Fisher-Yates shuffle
  for (let i = 0; i < 6; i++) {
    chars.push(BARCODE_DIGITS[bytes[i] % BARCODE_DIGITS.length]);
    chars.push(BARCODE_LETTERS[bytes[i + 6] % BARCODE_LETTERS.length]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[(i + 3) % bytes.length] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  const code = chars.join('');
  return code.startsWith('SLP') ? `9${code.slice(1)}` : code;
}

/**
 * Deterministic mixed numbers + letters verification code for legacy records without stored verificationBarcode.
 */
export function deriveMixedVerificationCode(seed: string): string {
  const input = seed || 'VERIFIED-BILL';
  let h1 = 2166136261;
  let h2 = 3735928559;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i * 31), 2246822519) >>> 0;
  }
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    h1 = (Math.imul(h1, 1664525) + 1013904223) >>> 0;
    h2 = (Math.imul(h2, 214013) + 2531011) >>> 0;
    if (i % 2 === 0) {
      out.push(BARCODE_DIGITS[(h1 >>> 16) % BARCODE_DIGITS.length]);
    } else {
      out.push(BARCODE_LETTERS[(h2 >>> 16) % BARCODE_LETTERS.length]);
    }
  }
  const code = out.join('');
  return code.startsWith('SLP') ? `8${code.slice(1)}` : code;
}

export function getBillVerificationBarcode(bill: {
  verificationBarcode?: string;
  publicToken?: string;
  id: string;
}): string {
  if (bill.verificationBarcode && bill.verificationBarcode.trim().length >= 6) {
    return bill.verificationBarcode.trim();
  }
  return deriveMixedVerificationCode(bill.publicToken || bill.id);
}

export function getPublicInvoiceVerificationBarcode(invoice: {
  verificationBarcode?: string;
  token: string;
}): string {
  if (invoice.verificationBarcode && invoice.verificationBarcode.trim().length >= 6) {
    return invoice.verificationBarcode.trim();
  }
  return deriveMixedVerificationCode(invoice.token);
}

export function generateCode128Value(_seed?: string): string {
  return generateUniqueMixedBarcode();
}

export function drawCode128OnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  targetWidth: number,
  barHeight: number
): void {
  const modules = encodeCode128BModules(text);
  const totalUnits = modules.reduce((a, b) => a + b, 0);
  const quietUnits = 10;
  const unitWidth = targetWidth / (totalUnits + quietUnits * 2);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, targetWidth, barHeight + 20);

  let cursor = x + quietUnits * unitWidth;
  ctx.fillStyle = '#000000';
  for (let i = 0; i < modules.length; i++) {
    const w = modules[i] * unitWidth;
    if (i % 2 === 0) {
      ctx.fillRect(Math.round(cursor), y + 2, Math.max(1, Math.round(w)), barHeight);
    }
    cursor += w;
  }

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + targetWidth / 2, y + barHeight + 16);
  ctx.textAlign = 'left';
}

export function generateCode128SvgDataUrl(text: string): string {
  const modules = encodeCode128BModules(text);
  const totalUnits = modules.reduce((a, b) => a + b, 0);
  const quiet = 10;
  const barHeight = 46;
  const width = totalUnits * 2 + quiet * 4;
  let cursor = quiet * 2;
  const rects: string[] = [];

  for (let i = 0; i < modules.length; i++) {
    const w = modules[i] * 2;
    if (i % 2 === 0) {
      rects.push(`<rect x="${cursor}" y="4" width="${w}" height="${barHeight}" fill="#000000"/>`);
    }
    cursor += w;
  }

  const safeLabel = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 70" width="${width}" height="70" shape-rendering="crispEdges">
    <rect width="${width}" height="70" rx="6" fill="#FFFFFF"/>
    ${rects.join('')}
    <text x="${width / 2}" y="64" font-family="monospace" font-size="11" font-weight="700" fill="#0F172A" text-anchor="middle">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function downloadCode128Png(text: string, filename?: string): void {
  const safeValue = (text || 'SLP-CODE128').trim() || 'SLP-CODE128';
  const canvas = document.createElement('canvas');
  canvas.width = 460;
  canvas.height = 110;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCode128OnCanvas(ctx, safeValue, 20, 12, 420, 68);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename || `${safeValue.replace(/[^a-zA-Z0-9_-]/g, '_')}_Code128.png`;
  a.click();
}

async function loadImageSafe(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function generateShareableBillImage(params: {
  bill: Bill;
  items: BillItem[];
  business: Business;
  upi?: UpiSetting | null;
  productImagesMap?: Map<string, string>;
  products?: Product[];
  language?: Language;
}): Promise<{ blob: Blob; dataUrl: string; file: File }> {
  const { bill, items, business, upi, productImagesMap, products = [], language = 'en' } = params;
  const width = 880;
  const rowHeight = 64;
  const headerH = 152;
  const custH = 112;
  const tableHeaderH = 40;
  const itemsH = Math.max(1, items.length) * rowHeight;
  const totalsAndQrH = 260;
  const barcodeFooterH = 128;
  const totalHeight = headerH + custH + tableHeaderH + itemsH + totalsAndQrH + barcodeFooterH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalHeight);

  // Navy Header
  ctx.fillStyle = '#0B1F44';
  ctx.fillRect(0, 0, width, headerH);

  // Logo (Uncropped Rounded Square HD Badge)
  const logoImg = await loadImageSafe(resolveBusinessLogoUrl(business.logoUrl));
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(30, 38, 76, 76, 14);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(30, 38, 76, 76);
    ctx.drawImage(logoImg, 32, 40, 72, 72);
    ctx.restore();
  }

  const bizName = translateBusinessName(business.name, language);
  const bizProp = translateProprietor(business.proprietor, language);
  const bizAddress = translateAddress(business.address, language);

  const textStartX = logoImg ? 124 : 36;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(bizName.slice(0, 52), textStartX, 64);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '14px sans-serif';
  const subParts = [
    bizProp ? `${tr(language, 'Prop:', 'యజమాని:')} ${bizProp}` : '',
    business.phone ? `${tr(language, 'Ph:', 'ఫోన్:')} ${business.phone}` : '',
    business.gstin ? `${tr(language, 'GSTIN:', 'జీఎస్టీఐఎన్:')} ${business.gstin}` : '',
  ].filter(Boolean);
  ctx.fillText(subParts.join('  ·  '), textStartX, 92);
  if (bizAddress) {
    ctx.fillText(bizAddress.slice(0, 62), textStartX, 116);
  }

  // Right Header Bill Meta
  ctx.textAlign = 'right';
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(
    bill.totalTax > 0 ? tr(language, 'TAX INVOICE', 'ట్యాక్స్ ఇన్వాయిస్') : tr(language, 'CUSTOMER BILL', 'కస్టమర్ బిల్'),
    width - 36,
    54
  );
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(bill.billNumber, width - 36, 86);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '13px monospace';
  ctx.fillText(formatAppDate(formatTimestamp(bill.createdAt), language, true), width - 36, 112);
  ctx.textAlign = 'left';

  // Customer & Status Strip
  let y = headerH;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, y, width, custH);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + custH);
  ctx.lineTo(width, y + custH);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(tr(language, 'BILLED TO', 'బిల్ చేయబడినవారు'), 36, y + 28);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText(translateCustomerName(bill.customerName, language), 36, y + 54);
  ctx.fillStyle = '#475569';
  ctx.font = '14px sans-serif';
  const custMeta = [
    bill.customerMobile ? `${tr(language, 'Mob:', 'మొబైల్:')} ${bill.customerMobile}` : '',
    bill.customerAddress ? bill.customerAddress : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (custMeta) ctx.fillText(custMeta.slice(0, 60), 36, y + 80);

  // Payment Status Badge on Right
  const isPaid = bill.pendingBalance <= 0 && bill.billStatus === 'active';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(tr(language, 'BILL STATUS', 'బిల్ స్థితి'), width - 36, y + 28);
  ctx.fillStyle = isPaid ? '#059669' : '#D97706';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(
    isPaid
      ? tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')
      : `${tr(language, 'DUE', 'బాకీ')} ${formatCurrency(bill.pendingBalance)}`,
    width - 36,
    y + 56
  );
  ctx.fillStyle = '#475569';
  ctx.font = '13px sans-serif';
  ctx.fillText(`${tr(language, 'Method:', 'విధానం:')} ${translatePaymentMethod(bill.paymentMethod, language)}`, width - 36, y + 80);
  ctx.textAlign = 'left';

  // Table Header
  y += custH;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, y, width, tableHeaderH);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(tr(language, 'ITEM', 'వస్తువు'), 36, y + 25);
  ctx.textAlign = 'right';
  ctx.fillText(tr(language, 'QTY', 'పరిమాణం'), 580, y + 25);
  ctx.fillText(tr(language, 'RATE', 'ధర'), 700, y + 25);
  ctx.fillText(tr(language, 'TOTAL', 'మొత్తం'), width - 36, y + 25);
  ctx.textAlign = 'left';

  // Line Items with Thumbnails
  y += tableHeaderH;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowY = y + i * rowHeight;

    const fallbackSvg = getDefaultProductImage(item.productName);
    const preferredSrc = item.imageUrl || productImagesMap?.get(item.productId) || fallbackSvg;
    let thumb = await loadImageSafe(preferredSrc);
    if (!thumb && preferredSrc !== fallbackSvg) {
      thumb = await loadImageSafe(fallbackSvg);
    }

    if (thumb) {
      ctx.drawImage(thumb, 36, rowY + 10, 44, 44);
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 15px sans-serif';
    const itemName = translateCartProductName(item.productName, item.productId, products, language);
    const varLabel = translateVariantLabel(item.variantLabel, language);
    const label = varLabel ? `${itemName} (${varLabel})` : itemName;
    ctx.fillText(label.slice(0, 38), 94, rowY + 30);

    ctx.fillStyle = '#64748B';
    ctx.font = '12px monospace';
    ctx.fillText(item.productCode || `#${i + 1}`, 94, rowY + 49);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '15px monospace';
    ctx.fillText(String(item.quantity), 580, rowY + 38);
    ctx.fillText(item.unitPrice.toFixed(2), 700, rowY + 38);
    ctx.font = 'bold 15px monospace';
    ctx.fillText(formatCurrency(item.lineTotal), width - 36, rowY + 38);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(36, rowY + rowHeight);
    ctx.lineTo(width - 36, rowY + rowHeight);
    ctx.stroke();
  }

  // Conditional Payment QR Scanner OR Amount Paid Block + Totals
  y += itemsH + 22;
  if (bill.pendingBalance > 0 && upi?.upiId) {
    const uri = buildUpiUri({
      upiId: upi.upiId,
      payeeName: upi.accountHolderName || business.name,
      amount: bill.pendingBalance,
      billNumber: bill.billNumber,
    });
    const qrUrl =
      upi.activeMode === 'uploaded' && upi.uploadedQrDataUrl
        ? upi.uploadedQrDataUrl
        : await QRCode.toDataURL(uri, { width: 170, margin: 1 });
    const qrImg = await loadImageSafe(qrUrl);

    ctx.fillStyle = '#FFFBEB';
    ctx.strokeStyle = '#FCD34D';
    ctx.lineWidth = 1.5;
    ctx.fillRect(36, y, 400, 186);
    ctx.strokeRect(36, y, 400, 186);

    if (qrImg) {
      ctx.drawImage(qrImg, 54, y + 18, 148, 148);
    }
    ctx.fillStyle = '#92400E';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(tr(language, 'SCAN TO PAY BALANCE DUE', 'బాకీ చెల్లించడానికి స్కాన్ చేయండి'), 218, y + 48);
    ctx.fillStyle = '#B45309';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(formatCurrency(bill.pendingBalance), 218, y + 82);
    ctx.fillStyle = '#475569';
    ctx.font = '13px sans-serif';
    ctx.fillText(tr(language, 'PhonePe · GPay · Paytm · Any UPI', 'ఫోన్‌పే · జీపే · పేటీఎం · ఏదైనా యూపీఐ'), 218, y + 114);
    ctx.font = '12px monospace';
    ctx.fillText(upi.upiId.slice(0, 26), 218, y + 140);
  } else {
    ctx.fillStyle = '#ECFDF5';
    ctx.strokeStyle = '#6EE7B7';
    ctx.lineWidth = 2;
    ctx.fillRect(36, y + 20, 380, 130);
    ctx.strokeRect(36, y + 20, 380, 130);

    ctx.fillStyle = '#047857';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(tr(language, '✓ AMOUNT PAID', '✓ పూర్తిగా చెల్లించబడింది'), 62, y + 72);
    ctx.fillStyle = '#065F46';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${formatCurrency(bill.amountPaid)} · ${translatePaymentMethod(bill.paymentMethod, language)}`, 62, y + 106);
    ctx.fillStyle = '#047857';
    ctx.font = '13px sans-serif';
    ctx.fillText(tr(language, 'Settled in Full · No Balance Due', 'పూర్తిగా చెల్లించబడింది · బాకీ లేదు'), 62, y + 132);
  }

  // Right Totals Breakdown
  const rx = width - 36;
  const lx = 490;
  let ty = y + 20;
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(tr(language, 'Subtotal', 'ఉప మొత్తం'), lx, ty);
  ctx.textAlign = 'right';
  ctx.font = '15px monospace';
  ctx.fillText(formatCurrency(bill.subtotal), rx, ty);
  ctx.textAlign = 'left';
  ty += 28;

  if (bill.discountAmount > 0) {
    ctx.fillStyle = '#059669';
    ctx.font = '15px sans-serif';
    ctx.fillText(tr(language, 'Discount', 'తగ్గింపు'), lx, ty);
    ctx.textAlign = 'right';
    ctx.font = '15px monospace';
    ctx.fillText(`-${formatCurrency(bill.discountAmount)}`, rx, ty);
    ctx.textAlign = 'left';
    ty += 28;
  }

  if (bill.totalTax > 0) {
    ctx.fillStyle = '#475569';
    ctx.font = '15px sans-serif';
    ctx.fillText(tr(language, 'Tax (GST)', 'పన్ను (జీఎస్టీ)'), lx, ty);
    ctx.textAlign = 'right';
    ctx.font = '15px monospace';
    ctx.fillText(formatCurrency(bill.totalTax), rx, ty);
    ctx.textAlign = 'left';
    ty += 28;
  }

  ctx.strokeStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(lx, ty - 8);
  ctx.lineTo(rx, ty - 8);
  ctx.stroke();

  ctx.fillStyle = '#0B1F44';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(tr(language, 'Grand Total', 'మొత్తం విలువ'), lx, ty + 18);
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(formatCurrency(bill.grandTotal), rx, ty + 18);
  ctx.textAlign = 'left';
  ty += 48;

  ctx.fillStyle = '#059669';
  ctx.font = '15px sans-serif';
  ctx.fillText(tr(language, 'Amount Paid', 'చెల్లించిన మొత్తం'), lx, ty);
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(formatCurrency(bill.amountPaid), rx, ty);
  ctx.textAlign = 'left';
  ty += 28;

  ctx.fillStyle = bill.pendingBalance > 0 ? '#DC2626' : '#64748B';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(tr(language, 'Balance Due', 'బాకీ మొత్తం'), lx, ty);
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(formatCurrency(bill.pendingBalance), rx, ty);
  ctx.textAlign = 'left';

  // Bottom Verification Barcode (unique mixed numbers + letters, never SLP number)
  const verificationCode = getBillVerificationBarcode(bill);
  const barcodeY = totalHeight - barcodeFooterH + 12;
  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(36, barcodeY - 12);
  ctx.lineTo(width - 36, barcodeY - 12);
  ctx.stroke();

  drawCode128OnCanvas(ctx, verificationCode, width / 2 - 170, barcodeY + 6, 340, 52);

  ctx.fillStyle = '#64748B';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${tr(language, 'Scan barcode to verify bill', 'బిల్ తనిఖీ కోసం బార్‌కోడ్ స్కాన్ చేయండి')} · ${getCopyrightNoticeLocalized(business.name, language)}`,
    width / 2,
    totalHeight - 16
  );
  ctx.textAlign = 'left';

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to render bill PNG image.'))), 'image/png');
  });
  const dataUrl = canvas.toDataURL('image/png');
  const file = new File([blob], `${bill.billNumber}_Bill.png`, { type: 'image/png' });

  return { blob, dataUrl, file };
}
