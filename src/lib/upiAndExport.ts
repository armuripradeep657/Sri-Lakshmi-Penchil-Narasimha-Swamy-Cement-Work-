import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Bill, BillItem, Business, BusinessSettings, UpiSetting } from '../types/billing';
import { formatTimestamp } from './firebase';
import { drawCode128OnCanvas, getBillVerificationBarcode } from './barcodeAndBillImage';

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
      dark: '#0B1F44',
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
}): Promise<jsPDF> {
  const { bill, items, business, settings, upi } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

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
    business.gstin ? `GSTIN: ${business.gstin}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  doc.text(contactLine, 14, 22);
  if (business.address) {
    doc.text(business.address, 14, 28);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(bill.totalTax > 0 ? 'TAX INVOICE' : 'INVOICE', 196, 15, { align: 'right' });
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
    item.taxRate > 0 ? `${item.taxRate}% (${item.taxAmount.toFixed(2)})` : '0.00',
    item.lineTotal.toFixed(2),
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['#', 'Product & Specification', 'Qty', 'Rate (₹)', 'Disc (₹)', 'Tax (₹)', 'Total (₹)']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [11, 31, 68], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 15, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
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

  if (bill.totalTax > 0) {
    doc.text(`Taxable Value:`, 140, y);
    doc.text(`Rs. ${bill.taxableAmount.toFixed(2)}`, 196, y, { align: 'right' });
    y += 6;
    if (bill.gstType === 'CGST_SGST') {
      doc.text(`CGST:`, 140, y);
      doc.text(`Rs. ${(bill.cgstAmount || 0).toFixed(2)}`, 196, y, { align: 'right' });
      y += 6;
      doc.text(`SGST:`, 140, y);
      doc.text(`Rs. ${(bill.sgstAmount || 0).toFixed(2)}`, 196, y, { align: 'right' });
      y += 6;
    } else if (bill.gstType === 'IGST') {
      doc.text(`IGST:`, 140, y);
      doc.text(`Rs. ${(bill.igstAmount || 0).toFixed(2)}`, 196, y, { align: 'right' });
      y += 6;
    }
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

export async function generateThermalReceiptPdf(params: {
  bill: Bill;
  items: BillItem[];
  business: Business;
  paperWidth: '58mm' | '80mm';
  upi?: UpiSetting | null;
  showLogo?: boolean;
  showQrCode?: boolean;
  footerMessage?: string;
}): Promise<jsPDF> {
  const { bill, items, business, paperWidth, upi, showLogo = true, showQrCode = true, footerMessage } = params;
  const widthMm = paperWidth === '58mm' ? 58 : 80;
  const margin = 4;
  const contentWidth = widthMm - margin * 2;
  const logoDataUrl = showLogo && business.logoUrl ? await loadMonochromeLogoDataUrl(business.logoUrl) : null;
  const estHeight = 128 + (logoDataUrl ? 16 : 0) + items.length * 10 + (bill.pendingBalance > 0 && showQrCode ? 34 : 10);

  const doc = new jsPDF({
    unit: 'mm',
    format: [widthMm, estHeight],
  });

  let y = 7;
  const centerX = widthMm / 2;

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
  if (business.gstin) {
    doc.text(`GSTIN: ${business.gstin}`, centerX, y, { align: 'center' });
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
  if (bill.totalTax > 0) {
    doc.text(`Tax (GST)`, margin, y);
    doc.text(bill.totalTax.toFixed(2), widthMm - margin, y, { align: 'right' });
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
  if (bill.totalTax > 0) lines.push(`TAX      : Rs.${bill.totalTax.toFixed(2)}`);
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
