import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Download,
  Printer,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Smartphone,
  Share2,
  Image as ImageIcon,
  Copy,
  Check,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { db } from '../lib/firebase';
import { buildPhonePeUri, buildUpiUri, formatCurrency } from '../lib/upiAndExport';
import {
  drawCode128OnCanvas,
  generateCode128SvgDataUrl,
  generateShareableBillImage,
  getPublicInvoiceVerificationBarcode,
} from '../lib/barcodeAndBillImage';
import { getDefaultProductImage, resolveProductImage } from '../lib/productImages';
import { DEFAULT_BUSINESS_LOGO } from '../lib/seedData';
import { Bill, BillItem, Business, PublicInvoice, UpiSetting } from '../types/billing';

interface ParsedPublicItem {
  n: string;
  v?: string;
  q: number;
  p: number;
  t: number;
  img?: string;
}

export const PublicInvoicePortal: React.FC<{ token: string }> = ({ token }) => {
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);

  useEffect(() => {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) {
      setError('Invalid invoice link format.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      doc(db, 'publicInvoices', token),
      async (snap) => {
        if (!snap.exists()) {
          setError('Invoice link not found or has been revoked by the business.');
          setInvoice(null);
          setLoading(false);
          return;
        }
        const data = snap.data() as PublicInvoice;
        if (data.revoked) {
          setError('This customer invoice link has been revoked by the administrator.');
          setInvoice(null);
          setLoading(false);
          return;
        }
        setInvoice(data);
        setLoading(false);

        if ((data.pendingBalance || 0) > 0 && data.upiId && data.paymentStatus !== 'cancelled' && data.paymentStatus !== 'refunded') {
          const uri = buildUpiUri({
            upiId: data.upiId,
            payeeName: data.upiName || data.businessName,
            amount: data.pendingBalance,
            billNumber: data.invoiceNumber,
          });
          const qr = await QRCode.toDataURL(uri, { width: 220, margin: 1 });
          setQrUrl(qr);
        } else {
          setQrUrl('');
        }
      },
      (err) => {
        setError(err instanceof Error ? err.message : 'Unable to load this invoice. It may have been revoked or expired.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [token]);

  const parsedItems: ParsedPublicItem[] = useMemo(() => {
    if (!invoice) return [];
    if (invoice.itemsJson) {
      try {
        const arr = JSON.parse(invoice.itemsJson);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {
        // fall back to itemsSummary parsing
      }
    }
    return (invoice.itemsSummary || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((s) => s.trim());
        const namePart = parts[0] || line;
        const pricePart = parts[1] || '';
        const qMatch = pricePart.match(/^([\d.]+)\s*x\s*₹?([\d.]+)\s*=\s*₹?([\d.]+)/i);
        return {
          n: namePart,
          q: qMatch ? Number(qMatch[1]) : 1,
          p: qMatch ? Number(qMatch[2]) : 0,
          t: qMatch ? Number(qMatch[3]) : 0,
        };
      });
  }, [invoice]);

  const verificationCode = useMemo(
    () => (invoice ? getPublicInvoiceVerificationBarcode(invoice) : ''),
    [invoice]
  );

  const barcodeSvgUrl = useMemo(
    () => (verificationCode ? generateCode128SvgDataUrl(verificationCode) : ''),
    [verificationCode]
  );

  const isDue = Boolean(
    invoice &&
      (invoice.pendingBalance || 0) > 0 &&
      invoice.paymentStatus !== 'cancelled' &&
      invoice.paymentStatus !== 'refunded'
  );

  const upiPayUri = useMemo(() => {
    if (!invoice || !isDue || !invoice.upiId) return '';
    return buildUpiUri({
      upiId: invoice.upiId,
      payeeName: invoice.upiName || invoice.businessName,
      amount: invoice.pendingBalance,
      billNumber: invoice.invoiceNumber,
    });
  }, [invoice, isDue]);

  const phonePeUri = useMemo(() => {
    if (!invoice || !isDue || !invoice.upiId) return '';
    return buildPhonePeUri({
      upiId: invoice.upiId,
      payeeName: invoice.upiName || invoice.businessName,
      amount: invoice.pendingBalance,
      billNumber: invoice.invoiceNumber,
    });
  }, [invoice, isDue]);

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    pdf.setFillColor(11, 31, 68);
    pdf.rect(0, 0, 210, 34, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(invoice.businessName, 14, 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(
      [invoice.businessPhone ? `Ph: ${invoice.businessPhone}` : '', invoice.businessGstin ? `GSTIN: ${invoice.businessGstin}` : '']
        .filter(Boolean)
        .join(' | '),
      14,
      22
    );
    pdf.text(`Bill #: ${invoice.invoiceNumber}`, 196, 15, { align: 'right' });
    pdf.text(isDue ? `DUE Rs. ${Number(invoice.pendingBalance || 0).toFixed(2)}` : 'AMOUNT PAID', 196, 22, {
      align: 'right',
    });

    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(10);
    pdf.text(`Customer: ${invoice.customerName}`, 14, 46);
    if (invoice.customerPhoneMasked) pdf.text(`Phone: ${invoice.customerPhoneMasked}`, 14, 52);
    if (invoice.customerAddress) pdf.text(`Address: ${invoice.customerAddress}`, 14, 58);

    let y = 70;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Items', 14, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    parsedItems.forEach((it, idx) => {
      const label = `${idx + 1}. ${it.n}${it.v ? ` (${it.v})` : ''} - ${it.q} x Rs.${it.p.toFixed(2)} = Rs.${it.t.toFixed(2)}`;
      pdf.text(label, 14, y);
      y += 6;
    });

    y += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Grand Total: Rs. ${Number(invoice.grandTotal || 0).toFixed(2)}`, 14, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Paid: Rs. ${Number(invoice.amountPaid || 0).toFixed(2)}`, 14, y);
    y += 6;
    pdf.text(`Balance Due: Rs. ${Number(invoice.pendingBalance || 0).toFixed(2)}`, 14, y);
    y += 10;

    if (isDue && qrUrl) {
      pdf.addImage(qrUrl, 'PNG', 14, y, 28, 28);
      pdf.text(`Scan QR to Pay Due: Rs. ${Number(invoice.pendingBalance || 0).toFixed(2)}`, 46, y + 12);
    } else {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(4, 120, 87);
      pdf.text('STATUS: AMOUNT PAID IN FULL', 14, y + 6);
    }

    // Add Code128 verification barcode
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 420;
      canvas.height = 84;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawCode128OnCanvas(ctx, verificationCode || getPublicInvoiceVerificationBarcode(invoice), 10, 4, 400, 54);
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 65, 255, 80, 17);
      }
    } catch {
      // ignore canvas fallback
    }

    pdf.save(`${invoice.invoiceNumber}_Customer_Bill.pdf`);
  };

  const handleSharePaymentLink = async () => {
    if (!invoice) return;
    const url = window.location.href;
    const msg = `${invoice.businessName} · Bill ${invoice.invoiceNumber}\nCustomer: ${invoice.customerName}\n${
      isDue
        ? `Due Balance: ₹${Number(invoice.pendingBalance || 0).toFixed(2)}\nPay via PhonePe / GPay / Any UPI:`
        : `Status: AMOUNT PAID (₹${Number(invoice.amountPaid || 0).toFixed(2)})`
    }\n${url}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `Bill ${invoice.invoiceNumber}`, text: msg, url });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareWhatsAppImage = async () => {
    if (!invoice) return;
    setSharingImage(true);
    try {
      const pseudoBill: Bill = {
        id: invoice.token,
        businessId: invoice.businessId,
        ownerUid: invoice.ownerUid,
        authorizedUids: [],
        billNumber: invoice.invoiceNumber,
        verificationBarcode: verificationCode || getPublicInvoiceVerificationBarcode(invoice),
        customerName: invoice.customerName,
        customerMobile: invoice.customerPhoneMasked,
        customerAddress: invoice.customerAddress,
        itemCount: parsedItems.length,
        subtotal: invoice.subtotal || invoice.grandTotal,
        discountAmount: invoice.discountAmount || 0,
        taxableAmount: invoice.grandTotal - (invoice.totalTax || 0),
        gstType: 'NONE',
        totalTax: invoice.totalTax || 0,
        grandTotal: invoice.grandTotal,
        amountPaid: invoice.amountPaid || 0,
        pendingBalance: invoice.pendingBalance || 0,
        paymentMethod: (invoice.paymentMethod as Bill['paymentMethod']) || 'UPI',
        paymentStatus: invoice.paymentStatus,
        billStatus: 'active',
        publicToken: invoice.token,
        publicLinkRevoked: invoice.revoked,
        createdByUid: invoice.ownerUid,
        createdByName: invoice.businessName,
        createdAt: invoice.issuedAtIso || new Date().toISOString(),
      };
      const pseudoItems: BillItem[] = parsedItems.map((it, idx) => ({
        id: `pi_${idx}`,
        billId: invoice.token,
        businessId: invoice.businessId,
        ownerUid: invoice.ownerUid,
        authorizedUids: [],
        productId: `p_${idx}`,
        productName: it.n,
        variantLabel: it.v,
        imageUrl: it.img,
        quantity: it.q,
        unitPrice: it.p,
        discount: 0,
        taxRate: 0,
        taxAmount: 0,
        lineTotal: it.t,
      }));
      const pseudoBiz: Business = {
        id: invoice.businessId,
        name: invoice.businessName,
        phone: invoice.businessPhone,
        address: invoice.businessAddress,
        gstin: invoice.businessGstin,
        logoUrl: invoice.businessLogoUrl,
        ownerUid: invoice.ownerUid,
        authorizedUids: [],
      };
      const pseudoUpi: UpiSetting | null = invoice.upiId
        ? {
            id: invoice.businessId,
            businessId: invoice.businessId,
            ownerUid: invoice.ownerUid,
            authorizedUids: [],
            upiId: invoice.upiId,
            accountHolderName: invoice.upiName || invoice.businessName,
            businessName: invoice.businessName,
            activeMode: 'generated',
          }
        : null;

      const { dataUrl, file } = await generateShareableBillImage({
        bill: pseudoBill,
        items: pseudoItems,
        business: pseudoBiz,
        upi: pseudoUpi,
      });

      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({
          title: `${invoice.invoiceNumber} - ${invoice.businessName}`,
          text: `${invoice.businessName} Bill #${invoice.invoiceNumber}\n${window.location.href}`,
          files: [file],
        });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${invoice.invoiceNumber}_Bill.png`;
        a.click();
        window.open(
          `https://wa.me/?text=${encodeURIComponent(`${invoice.businessName} Bill #${invoice.invoiceNumber}\n${window.location.href}`)}`,
          '_blank',
          'noopener,noreferrer'
        );
      }
    } finally {
      setSharingImage(false);
    }
  };

  const portalLogo = invoice?.businessLogoUrl || DEFAULT_BUSINESS_LOGO;

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[#F4F8FF] flex items-center justify-center p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[1] flex items-center justify-center"
        >
          <img
            src={DEFAULT_BUSINESS_LOGO}
            alt=""
            referrerPolicy="no-referrer"
            className="w-56 h-56 sm:w-72 sm:h-72 rounded-full object-cover opacity-[0.06] mix-blend-multiply select-none"
          />
        </div>
        <div className="relative z-10 max-w-lg w-full bg-white rounded-2xl border border-blue-100 p-8 space-y-4 animate-pulse shadow-sm">
          <div className="h-6 bg-blue-100 rounded w-1/2" />
          <div className="h-4 bg-blue-100 rounded w-1/3" />
          <div className="h-32 bg-blue-50 rounded" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="relative min-h-screen bg-[#F4F8FF] flex items-center justify-center p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[1] flex items-center justify-center"
        >
          <img
            src={DEFAULT_BUSINESS_LOGO}
            alt=""
            referrerPolicy="no-referrer"
            className="w-56 h-56 sm:w-72 sm:h-72 rounded-full object-cover opacity-[0.06] mix-blend-multiply select-none"
          />
        </div>
        <div className="relative z-10 max-w-md w-full bg-white rounded-2xl border border-blue-100 p-6 text-center space-y-3 shadow-sm">
          <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
          <h1 className="text-lg font-bold text-[#0B1F44]">Invoice Unavailable</h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#F4F8FF] py-5 px-3 sm:px-4 overflow-x-hidden">
      {/* Centered Middle App Logo Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] flex items-center justify-center"
      >
        <img
          src={portalLogo}
          alt=""
          referrerPolicy="no-referrer"
          className="w-56 h-56 sm:w-72 sm:h-72 rounded-full object-cover opacity-[0.06] mix-blend-multiply select-none"
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto space-y-3.5">
        <div className="no-print flex flex-col sm:flex-row items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-blue-100 shadow-sm">
          <div className="flex items-center justify-center gap-2 min-w-0">
            <img
              src={portalLogo}
              alt={invoice.businessName}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full object-cover border border-blue-200 shrink-0"
            />
            <span className="text-xs font-bold text-[#0B1F44] truncate">
              {invoice.businessName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleSharePaymentLink}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 text-[#0B1F44] text-xs font-semibold hover:bg-blue-100"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-[#1D4ED8]" />}
              {copiedLink ? 'Copied' : 'Share Link'}
            </button>
            <button
              onClick={handleShareWhatsAppImage}
              disabled={sharingImage}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {sharingImage ? 'Rendering...' : 'WhatsApp Image'}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-blue-200 bg-white text-[#0B1F44] text-xs font-semibold hover:bg-blue-50"
            >
              <Printer className="w-3.5 h-3.5 text-[#1D4ED8]" />
              Print
            </button>
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF]"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
        </div>

        <div className="print-only-container bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-[#0B1F44] text-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {invoice.businessLogoUrl && (
                <img
                  src={invoice.businessLogoUrl}
                  alt={invoice.businessName}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full object-cover bg-white p-0.5 shrink-0"
                />
              )}
              <div>
                <h1 className="text-base font-bold">{invoice.businessName}</h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  {[invoice.businessPhone ? `Ph: ${invoice.businessPhone}` : '', invoice.businessGstin ? `GSTIN: ${invoice.businessGstin}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {invoice.businessAddress && <p className="text-xs text-slate-300">{invoice.businessAddress}</p>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-sky-300 font-semibold uppercase">Bill / Invoice</div>
              <div className="font-mono text-lg font-bold">{invoice.invoiceNumber}</div>
              {invoice.issuedAtIso && (
                <div className="text-xs text-slate-300">{new Date(invoice.issuedAtIso).toLocaleDateString('en-IN')}</div>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs text-slate-500">Customer</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{invoice.customerName}</div>
                {invoice.customerPhoneMasked && (
                  <div className="text-xs text-slate-600 font-mono">Phone: {invoice.customerPhoneMasked}</div>
                )}
                {invoice.customerAddress && <div className="text-xs text-slate-600">{invoice.customerAddress}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Live Status</div>
                <div
                  className={`inline-flex items-center gap-1.5 mt-1 text-sm font-bold ${
                    isDue ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {isDue ? (
                    <>
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>DUE {formatCurrency(invoice.pendingBalance || 0)}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>AMOUNT PAID</span>
                    </>
                  )}
                </div>
                {invoice.paymentMethod && <div className="text-xs text-slate-500">Via {invoice.paymentMethod}</div>}
              </div>
            </div>

            {/* Purchased Items with Images */}
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">Items in Bill ({parsedItems.length})</div>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {parsedItems.map((it, i) => {
                  const thumb = it.img || resolveProductImage(null, it.n);
                  return (
                    <div key={i} className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={thumb}
                          alt={it.n}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fallback = getDefaultProductImage(it.n);
                            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                          }}
                          className="w-11 h-11 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                            {it.n}
                            {it.v ? <span className="text-slate-500 font-normal"> ({it.v})</span> : null}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {it.q} × ₹{Number(it.p || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 shrink-0">
                        {formatCurrency(it.t)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conditional Scanner if Due > 0 else AMOUNT PAID */}
            <div className="flex flex-wrap items-start justify-between gap-5 pt-4 border-t border-slate-200">
              <div className="flex-1 min-w-[240px]">
                {isDue ? (
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-3">
                    <div className="flex items-center gap-3.5">
                      {qrUrl && (
                        <img
                          src={qrUrl}
                          alt="UPI Payment Scanner"
                          className="w-24 h-24 object-contain bg-white rounded-lg p-1 border border-amber-200 shrink-0"
                        />
                      )}
                      <div className="text-xs space-y-1">
                        <div className="font-bold text-amber-900 text-sm">
                          Due: {formatCurrency(invoice.pendingBalance || 0)}
                        </div>
                        <div className="text-amber-800">Scan QR or tap PhonePe / UPI below to pay</div>
                        {invoice.upiId && <div className="font-mono text-slate-700">{invoice.upiId}</div>}
                      </div>
                    </div>

                    {upiPayUri && (
                      <div className="no-print flex flex-wrap gap-2">
                        <a
                          href={phonePeUri || upiPayUri}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#5F259F] text-white text-xs font-semibold hover:opacity-90"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          Pay with PhonePe
                        </a>
                        <a
                          href={upiPayUri}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#13326b]"
                        >
                          Pay via GPay / Any UPI
                        </a>
                        <button
                          onClick={handleSharePaymentLink}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 text-xs font-semibold hover:bg-amber-100"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Share Payment Link
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                    <CheckCircle2 className="w-9 h-9 text-emerald-600 shrink-0" />
                    <div>
                      <div className="text-base font-bold text-emerald-800">AMOUNT PAID</div>
                      <div className="text-xs font-mono text-emerald-700">
                        Paid {formatCurrency(invoice.amountPaid || invoice.grandTotal)} · {invoice.paymentMethod || 'Settled'}
                      </div>
                      <div className="text-[11px] text-emerald-600 mt-0.5">No pending balance due on this bill</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-full sm:w-64 ml-auto space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-600">
                  <span className="font-sans">Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal || invoice.grandTotal)}</span>
                </div>
                {(invoice.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span className="font-sans">Discount</span>
                    <span>-{formatCurrency(invoice.discountAmount || 0)}</span>
                  </div>
                )}
                {(invoice.totalTax || 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span className="font-sans">Tax (GST)</span>
                    <span>{formatCurrency(invoice.totalTax || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-[#0B1F44] pt-2 border-t border-slate-200">
                  <span className="font-sans">Grand Total</span>
                  <span>{formatCurrency(invoice.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span className="font-sans">Amount Paid</span>
                  <span>{formatCurrency(invoice.amountPaid || 0)}</span>
                </div>
                <div className={`flex justify-between font-semibold ${isDue ? 'text-rose-700' : 'text-slate-500'}`}>
                  <span className="font-sans">Pending Balance</span>
                  <span>{formatCurrency(invoice.pendingBalance || 0)}</span>
                </div>
              </div>
            </div>

            {/* Scannable Code128 Bill Verification Barcode */}
            {barcodeSvgUrl && (
              <div className="pt-4 border-t border-slate-200 flex flex-col items-center gap-1">
                <img src={barcodeSvgUrl} alt={`Bill Verification Barcode ${verificationCode}`} className="h-14 w-auto object-contain" />
                <span className="text-[11px] text-slate-500">
                  Verify Code: <span className="font-mono font-semibold text-slate-700">{verificationCode}</span> · Scan at store to verify this bill
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
