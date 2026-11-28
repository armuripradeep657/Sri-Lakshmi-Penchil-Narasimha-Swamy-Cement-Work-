import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Bill, BillItem, Business, BusinessSettings, Language, Product, UpiSetting } from '../types/billing';
import { formatTimestamp } from './firebase';
import { drawCode128OnCanvas, generateShareableBillImage, getBillVerificationBarcode } from './barcodeAndBillImage';
import { resolveBusinessLogoUrl } from './seedData';
import {
  formatAppDate,
  translateAddress,
  translateBusinessName,
  translateCartProductName,
  translateCustomerName,
  translateFooterMessage,
  translatePaymentMethod,
  translateVariantLabel,
} from './i18n';

export function buildUpiUri(params: {
  upiId: string;
  payeeName: string;
  amount?: number;
  note?: string;
  billNumber?: string;
}): string {
  const pa = encodeURIComponent(params.upiId.trim());
  const pn = encodeURIComponent(params.payeeName.trim() || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work');
  const tn = encodeURIComponent(params.note || (params.billNumber ? `Bill ${params.billNumber}` : 'Cement Work Payment'));
  const am = params.amount && params.amount > 0 ? `&am=${params.amount.toFixed(2)}` : '';
  const tr = params.billNumber ? `&tr=${encodeURIComponent(params.billNumber)}` : '';
  return `upi://pay?pa=${pa}&pn=${pn}&tn=${tn}${am}${tr}&cu=INR`;
}

export function buildPhonePeUri(params: {
  upiId: string;
  payeeName: string;
  amount?: number;
  note?: string;
  billNumber?: string;
}): string {
  const upi = buildUpiUri(params);
  return upi.replace(/^upi:\/\/pay\?/, 'phonepe://pay?');
}

function renderBarcodePngDataUrl(text: string): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 84;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawCode128OnCanvas(ctx, text, 10, 4, 400, 54);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function generateAndVerifyUpiQr(upiUri: string): Promise<{
  dataUrl: string;
  verifiedDecodedText: string | null;
  isValid: boolean;
}> {
  const dataUrl = await QRCode.toDataURL(upiUri, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0A2240',
      light: '#FFFFFF',
    },
  });

  // Decode back from rendered image canvas using jsQR to validate payload integrity
  try {
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('QR image decode failed'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl, verifiedDecodedText: null, isValid: false };
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = jsQR(imageData.data, canvas.width, canvas.height);
    const decodedText = decoded?.data || null;
    const isValid = Boolean(decodedText && decodedText.startsWith('upi://pay?'));
    return { dataUrl, verifiedDecodedText: decodedText, isValid };
  } catch {
    return { dataUrl, verifiedDecodedText: null, isValid: false };
  }
}

export function formatCurrency(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function generateA4InvoicePdf(params: {
  bill: Bill;
  items: BillItem[];
  business: Business;
  settings?: BusinessSettings | null;
  upi?: UpiSetting | null;
  products?: Product[];
  language?: Language;
}): Promise<jsPDF> {
  const { bill, items, business, settings, upi, products = [], language = 'en' } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // jsPDF built-in Helvetica does not support Telugu Unicode glyphs; render crisp Canvas-2D PNG and embed onto A4.
  if (language === 'te') {
    const { dataUrl } = await generateShareableBillImage({
      bill,
      items,
      business,
      upi: settings?.showQrCode === false ? null : upi,
      products,
      language: 'te',
    });
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    const pageW = 210;
    const pageH = 297;
    const marginMm = 8;
    const maxW = pageW - marginMm * 2;
    const maxH = pageH - marginMm * 2;
    const aspect = img.width && img.height ? img.height / img.width : 1.3;
    let drawW = maxW;
    let drawH = drawW * aspect;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH / aspect;
    }
    const offsetX = (pageW - drawW) / 2;
    doc.addImage(dataUrl, 'PNG', offsetX, marginMm, drawW, drawH);
    return doc;
  }

  // Centered paper background logo watermark
  const wmLogoUrl = await loadFadedWatermarkDataUrl(resolveBusinessLogoUrl(business.logoUrl), false, 0.12);
  if (wmLogoUrl) {
    doc.addImage(wmLogoUrl, 'PNG', 55, 108, 100, 100);
  }

  // Navy header bar
  doc.setFillColor(11, 31, 68);
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(business.name || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const contactLine = [
    business.proprietor ? `Proprietor: ${business.proprietor}` : '',
    business.phone ? `Ph: ${business.phone}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  doc.text(contactLine, 14, 22);
  if (business.address) {
    doc.text(business.address, 14, 28);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('INVOICE', 196, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Bill #: ${bill.billNumber}`, 196, 22, { align: 'right' });
  doc.text(`Date: ${formatTimestamp(bill.createdAt).toLocaleString('en-IN')}`, 196, 28, { align: 'right' });

  // Customer block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BILL TO:', 14, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(bill.customerName, 14, 52);
  if (bill.customerMobile) doc.text(`Mobile: ${bill.customerMobile}`, 14, 57);
  if (bill.customerAddress) doc.text(`Address: ${bill.customerAddress}`, 14, 62);

  // Status block on right
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT STATUS:', 196, 46, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.paymentStatus.toUpperCase()} (${bill.paymentMethod})`, 196, 52, { align: 'right' });
  doc.text(`Created By: ${bill.createdByName}`, 196, 57, { align: 'right' });

  // Items table
  const tableRows = items.map((item, index) => [
    String(index + 1),
    item.variantLabel ? `${item.productName} (${item.variantLabel})` : item.productName,
    String(item.quantity),
    item.unitPrice.toFixed(2),
    item.discount.toFixed(2),
    item.lineTotal.toFixed(2),
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['#', 'Product & Specification', 'Qty', 'Rate (₹)', 'Disc (₹)', 'Total (₹)']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [11, 31, 68], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 130;
  let y = finalY + 10;

  // Totals box on right
  doc.setFontSize(9.5);
  doc.text(`Subtotal:`, 140, y);
  doc.text(`Rs. ${bill.subtotal.toFixed(2)}`, 196, y, { align: 'right' });
  y += 6;

  if (bill.discountAmount > 0) {
    doc.text(`Discount:`, 140, y);
    doc.text(`- Rs. ${bill.discountAmount.toFixed(2)}`, 196, y, { align: 'right' });
    y += 6;
  }

  if ((bill.labourCharge || 0) > 0) {
    const labLabel =
      (bill.labourRatePerPiece || 0) > 0
        ? `Labour (Rs.${Number(bill.labourRatePerPiece).toFixed(2)}/pc):`
        : `Labour Charges:`;
    doc.text(labLabel, 140, y);
    doc.text(`+ Rs. ${(bill.labourCharge || 0).toFixed(2)}`, 196, y, { align: 'right' });
    y += 6;
  }

  if ((bill.autoCharge || 0) > 0) {
    doc.text(`Auto Charges:`, 140, y);
    doc.text(`+ Rs. ${(bill.autoCharge || 0).toFixed(2)}`, 196, y, { align: 'right' });
    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Grand Total:`, 140, y + 2);
  doc.text(`Rs. ${bill.grandTotal.toFixed(2)}`, 196, y + 2, { align: 'right' });
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Amount Paid:`, 140, y);
  doc.text(`Rs. ${bill.amountPaid.toFixed(2)}`, 196, y, { align: 'right' });
  y += 6;
  doc.text(`Pending Balance:`, 140, y);
  doc.text(`Rs. ${bill.pendingBalance.toFixed(2)}`, 196, y, { align: 'right' });

  // Conditional UPI QR on left ONLY if due > 0, otherwise AMOUNT PAID badge
  if (bill.pendingBalance > 0 && upi?.upiId && settings?.showQrCode !== false) {
    const uri = buildUpiUri({
      upiId: upi.upiId,
      payeeName: upi.accountHolderName || business.name,
      amount: bill.pendingBalance,
      billNumber: bill.billNumber,
    });
    const qrData = await QRCode.toDataURL(uri, { width: 140, margin: 1 });
    doc.addImage(qrData, 'PNG', 14, finalY + 8, 28, 28);
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Scan to Pay Due: Rs. ${bill.pendingBalance.toFixed(2)}`, 14, finalY + 39);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(upi.upiId, 14, finalY + 43);
  } else {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(110, 231, 183);
    doc.roundedRect(14, finalY + 10, 68, 24, 2, 2, 'FD');
    doc.setTextColor(4, 120, 87);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('AMOUNT PAID', 19, finalY + 21);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Rs. ${bill.amountPaid.toFixed(2)} (${bill.paymentMethod})`, 19, finalY + 28);
  }

  // Verification Barcode at bottom
  const verificationCode = getBillVerificationBarcode(bill);
  const barcodePng = renderBarcodePngDataUrl(verificationCode);
  if (barcodePng) {
    doc.addImage(barcodePng, 'PNG', 65, 253, 80, 17);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Scan Barcode to Verify Bill (${verificationCode})`, 105, 274, { align: 'center' });
  }

  // Footer
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const footer = settings?.footerMessage || 'Thank you for your business!';
  doc.text(footer, 105, 282, { align: 'center' });

  return doc;
}

export async function loadFadedWatermarkDataUrl(
  src?: string,
  monochrome = false,
  alpha = 0.12
): Promise<string | null> {
  if (!src) return null;
  try {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Watermark logo load failed'));
      img.src = src;
    });
    const size = 240;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (monochrome) {
      ctx.filter = 'grayscale(100%) contrast(115%)';
    }
    ctx.drawImage(img, 0, 0, size, size);
    ctx.restore();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function loadMonochromeLogoDataUrl(src?: string): Promise<string | null> {
  if (!src) return null;
  try {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Logo load failed'));
      img.src = src;
    });
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.filter = 'grayscale(100%) contrast(120%)';
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function renderTeluguThermalReceiptCanvas(params: {
  bill: Bill;
  items: BillItem[];
  business: Business;
  paperWidth: '58mm' | '80mm';
  upi?: UpiSetting | null;
  showLogo: boolean;
  showQrCode: boolean;
  footerMessage?: string;
  products: Product[];
}): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const { bill, items, business, paperWidth, upi, showLogo, showQrCode, footerMessage, products } = params;
  const widthPx = paperWidth === '58mm' ? 384 : 520;
  const pad = 22;
  const resolvedLogoUrl = showLogo ? resolveBusinessLogoUrl(business.logoUrl) : '';
  const hasQr = bill.pendingBalance > 0 && showQrCode && Boolean(upi?.upiId);
  const extraRowsCount =
    ((bill.labourCharge || 0) > 0 ? 1 : 0) + ((bill.autoCharge || 0) > 0 ? 1 : 0);
  const estHeight =
    340 +
    (resolvedLogoUrl ? 92 : 0) +
    items.length * 56 +
    extraRowsCount * 24 +
    (hasQr ? 190 : 54) +
    150;

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = estHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  ctx.clearRect(0, 0, widthPx, estHeight);
  ctx.fillStyle = '#0F172A';

  let y = 24;
  const cx = widthPx / 2;

  if (resolvedLogoUrl) {
    const logoData = await loadMonochromeLogoDataUrl(resolvedLogoUrl);
    if (logoData) {
      const img = new Image();
      img.src = logoData;
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
      });
      ctx.drawImage(img, cx - 34, y, 68, 68);
      y += 82;
    }
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 17px sans-serif';
  const bizTitle = translateBusinessName(business.name, 'te');
  const words = bizTitle.split(/\s+/);
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > widthPx - pad * 2) {
      ctx.fillText(line, cx, y);
      y += 22;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, cx, y);
    y += 22;
  }

  ctx.font = '13px sans-serif';
  const addr = translateAddress(business.address, 'te');
  if (addr) {
    ctx.fillText(addr.slice(0, 48), cx, y);
    y += 18;
  }
  if (business.phone) {
    ctx.fillText(`ఫోన్: ${business.phone}`, cx, y);
    y += 18;
  }

  const drawDash = () => {
    ctx.strokeStyle = '#64748B';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(widthPx - pad, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 18;
  };

  y += 4;
  drawDash();

  ctx.textAlign = 'left';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`బిల్: ${bill.billNumber}`, pad, y);
  y += 20;
  ctx.font = '13px sans-serif';
  ctx.fillText(`తేదీ: ${formatAppDate(formatTimestamp(bill.createdAt), 'te', true)}`, pad, y);
  y += 20;
  ctx.fillText(`కస్టమర్: ${translateCustomerName(bill.customerName, 'te')}`, pad, y);
  y += 20;
  if (bill.customerMobile) {
    ctx.fillText(`మొబైల్: ${bill.customerMobile}`, pad, y);
    y += 20;
  }
  drawDash();

  for (const item of items) {
    const pName = translateCartProductName(item.productName, item.productId, products, 'te');
    const vLabel = translateVariantLabel(item.variantLabel, 'te');
    const full = vLabel ? `${pName} (${vLabel})` : pName;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(full.slice(0, 34), pad, y);
    y += 20;
    ctx.font = '13px monospace';
    ctx.fillText(`${item.quantity} × ${item.unitPrice.toFixed(2)}`, pad, y);
    ctx.textAlign = 'right';
    ctx.fillText(item.lineTotal.toFixed(2), widthPx - pad, y);
    ctx.textAlign = 'left';
    y += 24;
  }

  drawDash();
  ctx.font = '14px sans-serif';
  const rowKV = (k: string, v: string, bold = false) => {
    ctx.font = bold ? 'bold 17px sans-serif' : '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(k, pad, y);
    ctx.textAlign = 'right';
    ctx.fillText(v, widthPx - pad, y);
    ctx.textAlign = 'left';
    y += bold ? 26 : 21;
  };

  rowKV('ఉప మొత్తం', bill.subtotal.toFixed(2));
  if (bill.discountAmount > 0) rowKV('తగ్గింపు', `-${bill.discountAmount.toFixed(2)}`);
  if ((bill.labourCharge || 0) > 0) rowKV('లేబర్ ఛార్జీలు', `+${Number(bill.labourCharge || 0).toFixed(2)}`);
  if ((bill.autoCharge || 0) > 0) rowKV('ఆటో ఛార్జీలు', `+${Number(bill.autoCharge || 0).toFixed(2)}`);
  rowKV('మొత్తం విలువ', `₹${bill.grandTotal.toFixed(2)}`, true);
  rowKV(`చెల్లించినది (${translatePaymentMethod(bill.paymentMethod, 'te')})`, `₹${bill.amountPaid.toFixed(2)}`);
  rowKV('బాకీ మొత్తం', `₹${bill.pendingBalance.toFixed(2)}`);

  y += 4;
  drawDash();

  if (hasQr && upi?.upiId) {
    const uri = buildUpiUri({
      upiId: upi.upiId,
      payeeName: upi.accountHolderName || business.name,
      amount: bill.pendingBalance,
      billNumber: bill.billNumber,
    });
    const qrData =
      upi.activeMode === 'uploaded' && upi.uploadedQrDataUrl
        ? upi.uploadedQrDataUrl
        : await QRCode.toDataURL(uri, { width: 150, margin: 1 });
    const qrImg = new Image();
    qrImg.src = qrData;
    await new Promise<void>((res) => {
      qrImg.onload = () => res();
      qrImg.onerror = () => res();
    });
    ctx.drawImage(qrImg, cx - 72, y, 144, 144);
    y += 160;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`బాకీ చెల్లించడానికి స్కాన్ చేయండి: ₹${bill.pendingBalance.toFixed(2)}`, cx, y);
    y += 22;
  } else {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('*** పూర్తిగా చెల్లించబడింది ***', cx, y);
    y += 26;
  }

  const code = getBillVerificationBarcode(bill);
  const bw = Math.min(widthPx - pad * 2, 320);
  drawCode128OnCanvas(ctx, code, cx - bw / 2, y, bw, 46);
  y += 82;

  ctx.textAlign = 'center';
  ctx.font = '13px sans-serif';
  ctx.fillText(translateFooterMessage(footerMessage, 'te').slice(0, 56), cx, y);
  y += 24;

  // Crop canvas cleanly to actual used height y and place centered background logo watermark
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = widthPx;
  finalCanvas.height = Math.max(y + 10, 300);
  const fCtx = finalCanvas.getContext('2d');
  if (fCtx) {
    fCtx.fillStyle = '#FFFFFF';
    fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    const wmData = await loadFadedWatermarkDataUrl(resolveBusinessLogoUrl(business.logoUrl), true, 0.14);
    if (wmData) {
      const wmImg = new Image();
      wmImg.src = wmData;
      await new Promise<void>((res) => {
        wmImg.onload = () => res();
        wmImg.onerror = () => res();
      });
      const wmSize = paperWidth === '58mm' ? 180 : 250;
      fCtx.drawImage(
        wmImg,
        (finalCanvas.width - wmSize) / 2,
        (finalCanvas.height - wmSize) / 2,
        wmSize,
        wmSize
      );
    }
    fCtx.drawImage(canvas, 0, 0);
  }
  return {
    dataUrl: finalCanvas.toDataURL('image/png'),
    widthPx: finalCanvas.width,
    heightPx: finalCanvas.height,
  };
}

export async function generateThermalReceiptPdf(params: {
  bill: Bill;
  items: BillItem[];
  business: Business;
  paperWidth: '58mm' | '80mm';
  upi?: UpiSetting | null;
  showLogo?: boolean;
  showQrCode?: boolean;
  footerMessage?: string;
  products?: Product[];
  language?: Language;
}): Promise<jsPDF> {
  const {
    bill,
    items,
    business,
    paperWidth,
    upi,
    showLogo = true,
    showQrCode = true,
    footerMessage,
    products = [],
    language = 'en',
  } = params;
  const widthMm = paperWidth === '58mm' ? 58 : 80;

  if (language === 'te') {
    const rendered = await renderTeluguThermalReceiptCanvas({
      bill,
      items,
      business,
      paperWidth,
      upi,
      showLogo,
      showQrCode,
      footerMessage,
      products,
    });
    const heightMm = Math.max(80, Math.ceil((widthMm * rendered.heightPx) / rendered.widthPx) + 4);
    const doc = new jsPDF({ unit: 'mm', format: [widthMm, heightMm] });
    doc.addImage(rendered.dataUrl, 'PNG', 0, 2, widthMm, (widthMm * rendered.heightPx) / rendered.widthPx);
    return doc;
  }

  const margin = 4;
  const contentWidth = widthMm - margin * 2;
  const resolvedLogoUrl = resolveBusinessLogoUrl(business.logoUrl);
  const logoDataUrl = showLogo && resolvedLogoUrl ? await loadMonochromeLogoDataUrl(resolvedLogoUrl) : null;
  const extraThermalRows =
    ((bill.labourCharge || 0) > 0 ? 1 : 0) + ((bill.autoCharge || 0) > 0 ? 1 : 0);
  const estHeight =
    128 +
    (logoDataUrl ? 16 : 0) +
    items.length * 10 +
    extraThermalRows * 4 +
    (bill.pendingBalance > 0 && showQrCode ? 34 : 10);

  const doc = new jsPDF({
    unit: 'mm',
    format: [widthMm, estHeight],
  });

  const thermalWm = await loadFadedWatermarkDataUrl(resolvedLogoUrl, true, 0.14);
  let y = 7;
  const centerX = widthMm / 2;
  if (thermalWm) {
    const wmMm = paperWidth === '58mm' ? 30 : 42;
    doc.addImage(thermalWm, 'PNG', centerX - wmMm / 2, estHeight / 2 - wmMm / 2, wmMm, wmMm);
  }

  if (logoDataUrl) {
    const logoSize = 12;
    doc.addImage(logoDataUrl, 'PNG', centerX - logoSize / 2, y - 2, logoSize, logoSize);
    y += logoSize + 2;
  }

  doc.setFont('courier', 'bold');
  doc.setFontSize(paperWidth === '58mm' ? 8.5 : 10);
  const titleLines = doc.splitTextToSize(business.name || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work', contentWidth);
  doc.text(titleLines, centerX, y, { align: 'center' });
  y += titleLines.length * 4;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  if (business.phone) {
    doc.text(`Ph: ${business.phone}`, centerX, y, { align: 'center' });
    y += 3.5;
  }

  doc.text('-'.repeat(paperWidth === '58mm' ? 30 : 42), centerX, y, { align: 'center' });
  y += 4;

  doc.text(`Bill: ${bill.billNumber}`, margin, y);
  y += 3.5;
  doc.text(`Date: ${formatTimestamp(bill.createdAt).toLocaleString('en-IN')}`, margin, y);
  y += 3.5;
  doc.text(`Cust: ${bill.customerName}`, margin, y);
  y += 3.5;
  if (bill.customerMobile) {
    doc.text(`Mob : ${bill.customerMobile}`, margin, y);
    y += 3.5;
  }
  doc.text('-'.repeat(paperWidth === '58mm' ? 30 : 42), centerX, y, { align: 'center' });
  y += 4;

  for (const item of items) {
    const label = item.variantLabel ? `${item.productName} (${item.variantLabel})` : item.productName;
    const wrapped = doc.splitTextToSize(label, contentWidth);
    doc.setFont('courier', 'bold');
    doc.text(wrapped, margin, y);
    y += wrapped.length * 3.5;
    doc.setFont('courier', 'normal');
    doc.text(`${item.quantity} x ${item.unitPrice.toFixed(2)}`, margin, y);
    doc.text(item.lineTotal.toFixed(2), widthMm - margin, y, { align: 'right' });
    y += 4;
  }

  doc.text('-'.repeat(paperWidth === '58mm' ? 30 : 42), centerX, y, { align: 'center' });
  y += 4;

  doc.text(`Subtotal`, margin, y);
  doc.text(bill.subtotal.toFixed(2), widthMm - margin, y, { align: 'right' });
  y += 3.5;
  if (bill.discountAmount > 0) {
    doc.text(`Discount`, margin, y);
    doc.text(`-${bill.discountAmount.toFixed(2)}`, widthMm - margin, y, { align: 'right' });
    y += 3.5;
  }
  if ((bill.labourCharge || 0) > 0) {
    doc.text(`Labour Charges`, margin, y);
    doc.text(`+${Number(bill.labourCharge || 0).toFixed(2)}`, widthMm - margin, y, { align: 'right' });
    y += 3.5;
  }
  if ((bill.autoCharge || 0) > 0) {
    doc.text(`Auto Charges`, margin, y);
    doc.text(`+${Number(bill.autoCharge || 0).toFixed(2)}`, widthMm - margin, y, { align: 'right' });
    y += 3.5;
  }

  doc.setFont('courier', 'bold');
  doc.setFontSize(paperWidth === '58mm' ? 9.5 : 11);
  doc.text(`TOTAL`, margin, y + 1);
  doc.text(`Rs.${bill.grandTotal.toFixed(2)}`, widthMm - margin, y + 1, { align: 'right' });
  y += 5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Paid (${bill.paymentMethod}): Rs.${bill.amountPaid.toFixed(2)}`, margin, y);
  y += 3.5;
  doc.text(`Balance: Rs.${bill.pendingBalance.toFixed(2)}`, margin, y);
  y += 5;

  if (bill.pendingBalance > 0 && showQrCode && upi?.upiId) {
    const uri = buildUpiUri({
      upiId: upi.upiId,
      payeeName: upi.accountHolderName || business.name,
      amount: bill.pendingBalance,
      billNumber: bill.billNumber,
    });
    const qrData = await QRCode.toDataURL(uri, { width: 120, margin: 1 });
    const qrSize = 24;
    doc.addImage(qrData, 'PNG', centerX - qrSize / 2, y, qrSize, qrSize);
    y += qrSize + 2;
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.text(`SCAN TO PAY DUE: Rs.${bill.pendingBalance.toFixed(2)}`, centerX, y, { align: 'center' });
    y += 4;
  } else {
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.text('*** AMOUNT PAID ***', centerX, y, { align: 'center' });
    y += 5;
  }

  // Bill verification barcode
  const barcodePng = renderBarcodePngDataUrl(getBillVerificationBarcode(bill));
  if (barcodePng) {
    const bw = Math.min(contentWidth, 48);
    doc.addImage(barcodePng, 'PNG', centerX - bw / 2, y, bw, 11);
    y += 13;
  }

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  const fLines = doc.splitTextToSize(footerMessage || 'Thank you! Visit Again.', contentWidth);
  doc.text(fLines, centerX, y, { align: 'center' });

  return doc;
}

export function buildEscPosReceiptBytes(bill: Bill, items: BillItem[], business: Business, footer?: string): Uint8Array {
  const lines: string[] = [
    business.name || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work',
    business.phone ? `Ph: ${business.phone}` : '',
    '--------------------------------',
    `Bill: ${bill.billNumber}`,
    `Date: ${formatTimestamp(bill.createdAt).toLocaleString('en-IN')}`,
    `Cust: ${bill.customerName}`,
    '--------------------------------',
  ];
  for (const item of items) {
    lines.push(`${item.productName}${item.variantLabel ? ` (${item.variantLabel})` : ''}`);
    lines.push(`  ${item.quantity} x ${item.unitPrice.toFixed(2)} = ${item.lineTotal.toFixed(2)}`);
  }
  lines.push('--------------------------------');
  lines.push(`SUBTOTAL : Rs.${bill.subtotal.toFixed(2)}`);
  if (bill.discountAmount > 0) lines.push(`DISCOUNT : -Rs.${bill.discountAmount.toFixed(2)}`);
  if ((bill.labourCharge || 0) > 0) lines.push(`LABOUR   : +Rs.${Number(bill.labourCharge || 0).toFixed(2)}`);
  if ((bill.autoCharge || 0) > 0) lines.push(`AUTO CHG : +Rs.${Number(bill.autoCharge || 0).toFixed(2)}`);
  lines.push(`GRAND TOTAL: Rs.${bill.grandTotal.toFixed(2)}`);
  lines.push(`PAID (${bill.paymentMethod}): Rs.${bill.amountPaid.toFixed(2)}`);
  lines.push(`BALANCE  : Rs.${bill.pendingBalance.toFixed(2)}`);
  lines.push('--------------------------------');
  lines.push(footer || 'Thank you for your business!');
  lines.push('\n\n\n');

  const encoder = new TextEncoder();
  const init = new Uint8Array([0x1b, 0x40]); // ESC @
  const body = encoder.encode(lines.filter(Boolean).join('\n'));
  const cut = new Uint8Array([0x1d, 0x56, 0x41, 0x10]); // GS V A

  const result = new Uint8Array(init.length + body.length + cut.length);
  result.set(init, 0);
  result.set(body, init.length);
  result.set(cut, init.length + body.length);
  return result;
}

export function exportRowsToExcel(rows: Record<string, unknown>[], filename: string, sheetName = 'Sheet1'): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportRowsToCsv(rows: Record<string, unknown>[], filename: string): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseExcelProducts(file: File): Promise<Array<Record<string, unknown>>> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet]);
}
