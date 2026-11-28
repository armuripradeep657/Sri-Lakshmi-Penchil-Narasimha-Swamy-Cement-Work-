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
  Globe,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { db } from '../lib/firebase';
import { buildPhonePeUri, buildUpiUri, formatCurrency, loadFadedWatermarkDataUrl } from '../lib/upiAndExport';
import {
  drawCode128OnCanvas,
  generateCode128SvgDataUrl,
  generateShareableBillImage,
  getPublicInvoiceVerificationBarcode,
} from '../lib/barcodeAndBillImage';
import { getDefaultProductImage, resolveProductImage } from '../lib/productImages';
import { LegalFooterLinks } from '../components/LegalModals';
import { DEFAULT_BUSINESS_LOGO, resolveBusinessLogoUrl } from '../lib/seedData';
import { Bill, BillItem, Business, Language, PublicInvoice, UpiSetting } from '../types/billing';
import {
  formatAppDate,
  getCopyrightNoticeLocalized,
  tr,
  translateAddress,
  translateBusinessName,
  translateCartProductName,
  translateCustomerName,
  translatePaymentMethod,
  translateVariantLabel,
} from '../lib/i18n';

interface ParsedPublicItem {
  n: string;
  v?: string;
  q: number;
  p: number;
  t: number;
  img?: string;
}

function getInitialPortalLanguage(): Language {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');
    if (urlLang === 'te' || urlLang === 'en') return urlLang;
    const stored = localStorage.getItem('slp_lang');
    if (stored === 'te' || stored === 'en') return stored;
  } catch {
    // ignore
  }
  return 'en';
}

export const PublicInvoicePortal: React.FC<{ token: string }> = ({ token }) => {
  const [language, setLanguage] = useState<Language>(getInitialPortalLanguage);
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);

  const togglePortalLanguage = () => {
    setLanguage((prev) => {
      const next: Language = prev === 'te' ? 'en' : 'te';
      try {
        localStorage.setItem('slp_lang', next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.lang = language === 'te' ? 'te' : 'en';
  }, [language]);

  useEffect(() => {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) {
      setError(
        language === 'te'
          ? 'చెల్లని ఇన్వాయిస్ లింక్ ఫార్మాట్.'
          : 'Invalid invoice link format.'
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      doc(db, 'publicInvoices', token),
      async (snap) => {
        if (!snap.exists()) {
          setError(
            language === 'te'
              ? 'ఇన్వాయిస్ లింక్ కనుగొనబడలేదు లేదా వ్యాపారం ద్వారా రద్దు చేయబడింది.'
              : 'Invoice link not found or has been revoked by the business.'
          );
          setInvoice(null);
          setLoading(false);
          return;
        }
        const data = snap.data() as PublicInvoice;
        if (data.revoked) {
          setError(
            language === 'te'
              ? 'ఈ కస్టమర్ ఇన్వాయిస్ లింక్ అడ్మిన్ ద్వారా రద్దు చేయబడింది.'
              : 'This customer invoice link has been revoked by the administrator.'
          );
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
        setError(
          err instanceof Error
            ? err.message
            : language === 'te'
            ? 'ఈ ఇన్వాయిస్‌ను లోడ్ చేయడం సాధ్యం కాలేదు.'
            : 'Unable to load this invoice. It may have been revoked or expired.'
        );
        setLoading(false);
      }
    );

    return () => unsub();
  }, [token, language]);

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

  const buildPseudoBillData = () => {
    if (!invoice) return null;
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
      labourCharge: invoice.labourCharge || 0,
      labourRatePerPiece: invoice.labourRatePerPiece || 0,
      autoCharge: invoice.autoCharge || 0,
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
    return { pseudoBill, pseudoItems, pseudoBiz, pseudoUpi };
  };

  const handleDownloadPdf = async () => {
    if (!invoice) return;

    if (language === 'te') {
      const built = buildPseudoBillData();
      if (built) {
        const { dataUrl } = await generateShareableBillImage({
          bill: built.pseudoBill,
          items: built.pseudoItems,
          business: built.pseudoBiz,
          upi: built.pseudoUpi,
          language: 'te',
        });
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        });
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const ratio = img.width > 0 ? img.height / img.width : 1.35;
        let renderW = pageW - 12;
        let renderH = renderW * ratio;
        if (renderH > pageH - 12) {
          renderH = pageH - 12;
          renderW = renderH / ratio;
        }
        const x = (pageW - renderW) / 2;
        pdf.addImage(dataUrl, 'PNG', x, 6, renderW, renderH);
        pdf.save(`${invoice.invoiceNumber}_Telugu_Bill.pdf`);
        return;
      }
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const wmLogo = await loadFadedWatermarkDataUrl(resolveBusinessLogoUrl(invoice.businessLogoUrl), false, 0.12);
    if (wmLogo) {
      pdf.addImage(wmLogo, 'PNG', 55, 108, 100, 100);
    }
    pdf.setFillColor(11, 31, 68);
    pdf.rect(0, 0, 210, 34, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(invoice.businessName, 14, 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(
      invoice.businessPhone ? `Ph: ${invoice.businessPhone}` : '',
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
    if ((invoice.labourCharge || 0) > 0) {
      pdf.text(`Labour Charges: + Rs. ${Number(invoice.labourCharge || 0).toFixed(2)}`, 14, y);
      y += 6;
    }
    if ((invoice.autoCharge || 0) > 0) {
      pdf.text(`Auto Charges: + Rs. ${Number(invoice.autoCharge || 0).toFixed(2)}`, 14, y);
      y += 6;
    }
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
    const dispBiz = translateBusinessName(invoice.businessName, language);
    const dispCust = translateCustomerName(invoice.customerName, language);
    const msg =
      language === 'te'
        ? `${dispBiz} · బిల్ ${invoice.invoiceNumber}\nకస్టమర్: ${dispCust}\n${
            isDue
              ? `బాకీ మొత్తం: ₹${Number(invoice.pendingBalance || 0).toFixed(2)}\nఫోన్‌పే / జీపే / యూపీఐ ద్వారా చెల్లించండి:`
              : `స్థితి: పూర్తిగా చెల్లించబడింది (₹${Number(invoice.amountPaid || 0).toFixed(2)})`
          }\n${url}`
        : `${dispBiz} · Bill ${invoice.invoiceNumber}\nCustomer: ${dispCust}\n${
            isDue
              ? `Due Balance: ₹${Number(invoice.pendingBalance || 0).toFixed(2)}\nPay via PhonePe / GPay / Any UPI:`
              : `Status: AMOUNT PAID (₹${Number(invoice.amountPaid || 0).toFixed(2)})`
          }\n${url}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${tr(language, 'Bill', 'బిల్')} ${invoice.invoiceNumber}`,
          text: msg,
          url,
        });
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
    const built = buildPseudoBillData();
    if (!built) return;
    setSharingImage(true);
    try {
      const { dataUrl, file } = await generateShareableBillImage({
        bill: built.pseudoBill,
        items: built.pseudoItems,
        business: built.pseudoBiz,
        upi: built.pseudoUpi,
        language,
      });

      const dispBiz = translateBusinessName(invoice.businessName, language);
      const shareTitle = `${invoice.invoiceNumber} - ${dispBiz}`;
      const shareText = `${dispBiz} ${tr(language, 'Bill', 'బిల్')} #${invoice.invoiceNumber}\n${window.location.href}`;

      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({
          title: shareTitle,
          text: shareText,
          files: [file],
        });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${invoice.invoiceNumber}_Bill.png`;
        a.click();
        const link = document.createElement('a');
        link.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }
    } finally {
      setSharingImage(false);
    }
  };

  const portalLogo = resolveBusinessLogoUrl(invoice?.businessLogoUrl);

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[#F6F1EA] flex items-center justify-center p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[25] flex items-center justify-center"
        >
          <img
            src={DEFAULT_BUSINESS_LOGO}
            alt=""
            referrerPolicy="no-referrer"
            className="w-64 h-64 sm:w-80 sm:h-80 rounded-3xl object-contain opacity-[0.095] mix-blend-multiply select-none"
          />
        </div>
        <div className="relative z-10 max-w-lg w-full bg-white rounded-2xl border border-[#E5DDD3] p-8 space-y-4 animate-pulse shadow-sm">
          <div className="h-6 bg-[#EFE8DF] rounded w-1/2" />
          <div className="h-4 bg-[#EFE8DF] rounded w-1/3" />
          <div className="h-32 bg-[#F6F1EA] rounded" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="relative min-h-screen bg-[#F6F1EA] flex items-center justify-center p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[25] flex items-center justify-center"
        >
          <img
            src={DEFAULT_BUSINESS_LOGO}
            alt=""
            referrerPolicy="no-referrer"
            className="w-64 h-64 sm:w-80 sm:h-80 rounded-3xl object-contain opacity-[0.095] mix-blend-multiply select-none"
          />
        </div>
        <div className="relative z-10 max-w-md w-full bg-white rounded-2xl border border-[#E5DDD3] p-6 text-center space-y-3 shadow-sm">
          <ShieldAlert className="w-10 h-10 text-[#C23B2B] mx-auto" />
          <h1 className="text-lg font-bold text-[#0A2240]">
            {tr(language, 'Invoice Unavailable', 'ఇన్వాయిస్ అందుబాటులో లేదు')}
          </h1>
          <p className="text-sm text-[#6D665E]">{error}</p>
        </div>
      </div>
    );
  }

  const displayBizName = translateBusinessName(invoice.businessName, language);
  const displayBizAddress = translateAddress(invoice.businessAddress, language);
  const displayCustomerName = translateCustomerName(invoice.customerName, language);

  return (
    <div className="relative min-h-screen bg-[#F6F1EA] py-5 px-3 sm:px-4 overflow-x-hidden">
      {/* Centered Middle App Logo Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[25] flex items-center justify-center"
      >
        <img
          src={portalLogo}
          alt=""
          referrerPolicy="no-referrer"
          className="w-64 h-64 sm:w-80 sm:h-80 rounded-3xl object-contain opacity-[0.095] mix-blend-multiply select-none"
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto space-y-3.5">
        <div className="no-print flex flex-col sm:flex-row items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-[#E5DDD3] shadow-sm">
          <div className="flex items-center justify-center gap-2 min-w-0">
            <img
              src={portalLogo}
              alt={displayBizName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-xl object-contain bg-white p-0.5 border border-[#DFD7CC] shrink-0"
            />
            <span className="text-xs font-bold text-[#0A2240] truncate">
              {displayBizName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={togglePortalLanguage}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#DFD7CC] bg-[#F6F1EA] text-[#0A2240] text-xs font-semibold hover:bg-[#EFE8DF]"
            >
              <Globe className="w-3.5 h-3.5 text-[#9A4307]" />
              {language === 'te' ? 'ఇంగ్లీష్' : 'తెలుగు'}
            </button>
            <button
              onClick={handleSharePaymentLink}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#DFD7CC] bg-[#F6F1EA] text-[#0A2240] text-xs font-semibold hover:bg-[#EFE8DF]"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Share2 className="w-3.5 h-3.5 text-[#9A4307]" />}
              {copiedLink ? tr(language, 'Copied', 'కాపీ అయింది') : tr(language, 'Share Link', 'లింక్ షేర్')}
            </button>
            <button
              onClick={handleShareWhatsAppImage}
              disabled={sharingImage}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {sharingImage
                ? tr(language, 'Rendering...', 'తయారవుతోంది...')
                : tr(language, 'WhatsApp Image', 'వాట్సాప్ బిల్ చిత్రం')}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#DFD7CC] bg-white text-[#0A2240] text-xs font-semibold hover:bg-[#F6F1EA]"
            >
              <Printer className="w-3.5 h-3.5 text-[#9A4307]" />
              {tr(language, 'Print', 'ప్రింట్')}
            </button>
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B]"
            >
              <Download className="w-3.5 h-3.5" />
              {tr(language, 'PDF', 'పీడీఎఫ్')}
            </button>
          </div>
        </div>

        <div className="print-only-container bg-white rounded-2xl border border-[#E5DDD3] shadow-sm overflow-hidden">
          <div className="bg-[#0A2240] text-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {portalLogo && (
                <img
                  src={portalLogo}
                  alt={displayBizName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-contain bg-white p-0.5 shrink-0"
                />
              )}
              <div>
                <h1 className="text-base font-bold">{displayBizName}</h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  {invoice.businessPhone ? `${tr(language, 'Ph:', 'ఫోన్:')} ${invoice.businessPhone}` : ''}
                </p>
                {displayBizAddress && <p className="text-xs text-slate-300">{displayBizAddress}</p>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-sky-300 font-semibold uppercase">
                {tr(language, 'Bill / Invoice', 'బిల్ / ఇన్వాయిస్')}
              </div>
              <div className="font-mono text-lg font-bold">{invoice.invoiceNumber}</div>
              {invoice.issuedAtIso && (
                <div className="text-xs text-slate-300">
                  {formatAppDate(new Date(invoice.issuedAtIso), language)}
                </div>
              )}
            </div>
          </div>

          <div className="relative p-5 sm:p-6">
            {portalLogo && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
              >
                <img
                  src={portalLogo}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-56 h-56 sm:w-72 sm:h-72 rounded-3xl object-contain opacity-[0.12] mix-blend-multiply select-none"
                />
              </div>
            )}
            <div className="relative z-10 space-y-5">
            <div className="flex flex-wrap justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
              <div>
                <div className="text-xs text-[#6D665E]">{tr(language, 'Customer', 'కస్టమర్')}</div>
                <div className="text-sm font-bold text-[#0A2240] mt-0.5">{displayCustomerName}</div>
                {invoice.customerPhoneMasked && (
                  <div className="text-xs text-[#6D665E] font-mono">
                    {tr(language, 'Phone:', 'ఫోన్:')} {invoice.customerPhoneMasked}
                  </div>
                )}
                {invoice.customerAddress && <div className="text-xs text-[#6D665E]">{invoice.customerAddress}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-[#6D665E]">{tr(language, 'Live Status', 'ప్రస్తుత స్థితి')}</div>
                <div
                  className={`inline-flex items-center gap-1.5 mt-1 text-sm font-bold ${
                    isDue ? 'text-[#9A4307]' : 'text-[#15803D]'
                  }`}
                >
                  {isDue ? (
                    <>
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>
                        {tr(language, 'DUE', 'బాకీ')} {formatCurrency(invoice.pendingBalance || 0)}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                      <span>{tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')}</span>
                    </>
                  )}
                </div>
                {invoice.paymentMethod && (
                  <div className="text-xs text-[#6D665E]">
                    {tr(language, 'Via', 'చెల్లింపు విధానం:')} {translatePaymentMethod(invoice.paymentMethod, language)}
                  </div>
                )}
              </div>
            </div>

            {/* Purchased Items with Images */}
            <div>
              <div className="text-xs font-semibold text-[#6D665E] mb-2">
                {tr(language, 'Items in Bill', 'బిల్‌లోని వస్తువులు')} ({parsedItems.length})
              </div>
              <div className="rounded-xl border border-[#E5DDD3] divide-y divide-[#EFEAE2]">
                {parsedItems.map((it, i) => {
                  const thumb = it.img || resolveProductImage(null, it.n);
                  const dispItemName = translateCartProductName(it.n, undefined, [], language);
                  const dispVar = it.v ? translateVariantLabel(it.v, language) : '';
                  return (
                    <div key={i} className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={thumb}
                          alt={dispItemName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fallback = getDefaultProductImage(it.n);
                            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                          }}
                          className="w-11 h-11 rounded-lg object-cover border border-[#E5DDD3] bg-[#FAF8F5] shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-[#0A2240] truncate">
                            {dispItemName}
                            {dispVar ? <span className="text-[#6D665E] font-normal"> ({dispVar})</span> : null}
                          </div>
                          <div className="text-[11px] font-mono text-[#6D665E]">
                            {it.q} × ₹{Number(it.p || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono font-bold text-xs sm:text-sm text-[#0A2240] shrink-0">
                        {formatCurrency(it.t)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conditional Scanner if Due > 0 else AMOUNT PAID */}
            <div className="flex flex-wrap items-start justify-between gap-5 pt-4 border-t border-[#E5DDD3]">
              <div className="flex-1 min-w-[240px]">
                {isDue ? (
                  <div className="p-4 rounded-xl border border-[#F0D9B5] bg-[#FDF3DF] space-y-3">
                    <div className="flex items-center gap-3.5">
                      {qrUrl && (
                        <img
                          src={qrUrl}
                          alt={tr(language, 'UPI Payment Scanner', 'యూపీఐ చెల్లింపు స్కానర్')}
                          className="w-24 h-24 object-contain bg-white rounded-lg p-1 border border-[#F0D9B5] shrink-0"
                        />
                      )}
                      <div className="text-xs space-y-1">
                        <div className="font-bold text-[#7C3405] text-sm">
                          {tr(language, 'Due:', 'బాకీ:')} {formatCurrency(invoice.pendingBalance || 0)}
                        </div>
                        <div className="text-[#9A4307]">
                          {tr(
                            language,
                            'Scan QR or tap PhonePe / UPI below to pay',
                            'చెల్లించడానికి క్యూఆర్ స్కాన్ చేయండి లేదా కింది ఫోన్‌పే / యూపీఐ బటన్ నొక్కండి'
                          )}
                        </div>
                        {invoice.upiId && <div className="font-mono text-[#2D3138]">{invoice.upiId}</div>}
                      </div>
                    </div>

                    {upiPayUri && (
                      <div className="no-print flex flex-wrap gap-2">
                        <a
                          href={phonePeUri || upiPayUri}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#5F259F] text-white text-xs font-semibold hover:opacity-90"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          {tr(language, 'Pay with PhonePe', 'ఫోన్‌పే ద్వారా చెల్లించండి')}
                        </a>
                        <a
                          href={upiPayUri}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B]"
                        >
                          {tr(language, 'Pay via GPay / Any UPI', 'జీపే / ఇతర యూపీఐ ద్వారా చెల్లించండి')}
                        </a>
                        <button
                          onClick={handleSharePaymentLink}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-white text-[#7C3405] text-xs font-semibold hover:bg-amber-100"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {tr(language, 'Share Payment Link', 'చెల్లింపు లింక్ షేర్ చేయండి')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-[#C5E8D1] bg-[#E7F6EC]">
                    <CheckCircle2 className="w-9 h-9 text-[#15803D] shrink-0" />
                    <div>
                      <div className="text-base font-bold text-emerald-800">
                        {tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')}
                      </div>
                      <div className="text-xs font-mono text-[#15803D]">
                        {tr(language, 'Paid', 'చెల్లించినది')} {formatCurrency(invoice.amountPaid || invoice.grandTotal)} ·{' '}
                        {invoice.paymentMethod
                          ? translatePaymentMethod(invoice.paymentMethod, language)
                          : tr(language, 'Settled', 'పూర్తయింది')}
                      </div>
                      <div className="text-[11px] text-[#15803D] mt-0.5">
                        {tr(language, 'No pending balance due on this bill', 'ఈ బిల్‌పై ఎలాంటి బాకీ లేదు')}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-full sm:w-64 ml-auto space-y-2 text-xs font-mono">
                <div className="flex justify-between text-[#6D665E]">
                  <span className="font-sans">{tr(language, 'Subtotal', 'మొత్తం')}</span>
                  <span>{formatCurrency(invoice.subtotal || invoice.grandTotal)}</span>
                </div>
                {(invoice.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-[#15803D]">
                    <span className="font-sans">{tr(language, 'Discount', 'తగ్గింపు')}</span>
                    <span>-{formatCurrency(invoice.discountAmount || 0)}</span>
                  </div>
                )}
                {(invoice.labourCharge || 0) > 0 && (
                  <div className="flex justify-between text-[#2D3138]">
                    <span className="font-sans">
                      {(invoice.labourRatePerPiece || 0) > 0
                        ? tr(
                            language,
                            `Labour Charges (₹${Number(invoice.labourRatePerPiece).toFixed(2)}/pc)`,
                            `లేబర్ ఛార్జీలు (₹${Number(invoice.labourRatePerPiece).toFixed(2)}/పీస్)`
                          )
                        : tr(language, 'Labour Charges', 'లేబర్ ఛార్జీలు')}
                    </span>
                    <span>+{formatCurrency(invoice.labourCharge || 0)}</span>
                  </div>
                )}
                {(invoice.autoCharge || 0) > 0 && (
                  <div className="flex justify-between text-[#2D3138]">
                    <span className="font-sans">{tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}</span>
                    <span>+{formatCurrency(invoice.autoCharge || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-[#0A2240] pt-2 border-t border-[#E5DDD3]">
                  <span className="font-sans">{tr(language, 'Grand Total', 'తుది మొత్తం')}</span>
                  <span>{formatCurrency(invoice.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-[#15803D] font-semibold">
                  <span className="font-sans">{tr(language, 'Amount Paid', 'చెల్లించిన మొత్తం')}</span>
                  <span>{formatCurrency(invoice.amountPaid || 0)}</span>
                </div>
                <div className={`flex justify-between font-semibold ${isDue ? 'text-[#C23B2B]' : 'text-[#6D665E]'}`}>
                  <span className="font-sans">{tr(language, 'Pending Balance', 'బాకీ మొత్తం')}</span>
                  <span>{formatCurrency(invoice.pendingBalance || 0)}</span>
                </div>
              </div>
            </div>

            {/* Scannable Code128 Bill Verification Barcode */}
            {barcodeSvgUrl && (
              <div className="pt-4 border-t border-[#E5DDD3] flex flex-col items-center gap-1">
                <img
                  src={barcodeSvgUrl}
                  alt={`${tr(language, 'Bill Verification Barcode', 'బిల్ ధృవీకరణ బార్‌కోడ్')} ${verificationCode}`}
                  className="h-14 w-auto object-contain"
                />
                <span className="text-[11px] text-[#6D665E]">
                  {tr(language, 'Verify Code:', 'ధృవీకరణ కోడ్:')}{' '}
                  <span className="font-mono font-semibold text-[#2D3138]">{verificationCode}</span> ·{' '}
                  {tr(language, 'Scan at store to verify this bill', 'ఈ బిల్ నిర్ధారణకు షాప్ వద్ద స్కాన్ చేయండి')}
                </span>
              </div>
            )}
            </div>
          </div>
        </div>

        <footer className="text-center text-xs text-[#6D665E] pt-1 pb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>{getCopyrightNoticeLocalized(invoice.businessName, language)}</span>
          <span aria-hidden="true" className="text-[#B8AEA2]">
            ·
          </span>
          <LegalFooterLinks language={language} businessName={invoice.businessName} />
        </footer>
      </div>
    </div>
  );
};
