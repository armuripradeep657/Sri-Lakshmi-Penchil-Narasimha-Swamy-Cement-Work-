import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  MessageCircle,
  MessageSquare,
  Printer,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import { Bill, BillItem, Business, BusinessSettings, Language, Product, UpiSetting } from '../types/billing';
import {
  buildPhonePeUri,
  buildUpiUri,
  formatCurrency,
  generateAndVerifyUpiQr,
} from '../lib/upiAndExport';
import {
  generateCode128SvgDataUrl,
  generateShareableBillImage,
  getBillVerificationBarcode,
} from '../lib/barcodeAndBillImage';
import { getDefaultProductImage, resolveProductImage } from '../lib/productImages';
import { formatTimestamp } from '../lib/firebase';
import { resolveBusinessLogoUrl } from '../lib/seedData';
import {
  buildWhatsAppDirectUrl,
  buildWhatsAppReceiptText,
  buildWhatsAppThankYouText,
  formatReadableWhatsAppPhone,
  formatWhatsAppPhone,
  openExternalLinkSafely,
} from '../lib/whatsapp';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import {
  formatAppDate,
  getCopyrightNoticeLocalized,
  tr,
  translateAddress,
  translateBusinessName,
  translateCartProductName,
  translateCustomerName,
  translateFooterMessage,
  translatePaymentMethod,
  translateProprietor,
  translateVariantLabel,
} from '../lib/i18n';

function renderFormattedWhatsAppLine(line: string, lineKey: number): React.ReactNode {
  if (line.trim() === '') {
    return <div key={lineKey} className="h-2" />;
  }
  if (/^-{6,}$/.test(line.trim())) {
    return <div key={lineKey} className="my-1.5 border-t border-dashed border-emerald-700/25 dark:border-emerald-200/20" />;
  }

  // Safely tokenize *bold* spans and https:// links into React elements
  const tokenRegex = /(\*[^*\n]+\*|https?:\/\/[^\s]+)/g;
  const parts = line.split(tokenRegex);

  return (
    <div key={lineKey} className="whitespace-pre-wrap">
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return (
            <strong key={idx} className="font-bold text-[#0A2240] dark:text-white">
              {part.slice(1, -1)}
            </strong>
          );
        }
        if (/^https?:\/\//i.test(part)) {
          return (
            <span
              key={idx}
              className="text-[#027EB5] dark:text-sky-300 underline break-all font-medium"
            >
              {part}
            </span>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </div>
  );
}

function renderFormattedWhatsAppMessage(text: string): React.ReactNode {
  return text.split('\n').map((line, index) => renderFormattedWhatsAppLine(line, index));
}

interface PostBillActionsModalProps {
  bill: Bill | null;
  items: BillItem[];
  onClose: () => void;
  justSaved?: boolean;
}

export const PostBillActionsModal: React.FC<PostBillActionsModalProps> = ({
  bill,
  items,
  onClose,
  justSaved = false,
}) => {
  const { business, businessSettings, upiSetting, products, logMessageDispatch } = useBillingData();
  const { language, isAdmin } = useAuth();
  const autoWhatsAppThankYouEnabled = businessSettings?.autoWhatsAppThankYou !== false;
  const shouldAutoTriggerThankYou = justSaved && autoWhatsAppThankYouEnabled;

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [viewMode, setViewMode] = useState<'a4' | 'thermal'>('a4');
  const [thermalWidth, setThermalWidth] = useState<'58mm' | '80mm'>(businessSettings?.paperWidth || '80mm');
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWaText, setCopiedWaText] = useState(false);
  const [showWaPreview, setShowWaPreview] = useState(!justSaved || autoWhatsAppThankYouEnabled);
  const [waMessageMode, setWaMessageMode] = useState<'thank_you' | 'full_receipt'>(
    shouldAutoTriggerThankYou ? 'thank_you' : 'full_receipt'
  );
  const [sendingSms, setSendingSms] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [whatsappMobile, setWhatsappMobile] = useState(bill?.customerMobile || '');

  useEffect(() => {
    setWhatsappMobile(bill?.customerMobile || '');
    setStatusBanner(null);
    setCopiedWaText(false);
    const autoTrigger = justSaved && autoWhatsAppThankYouEnabled;
    setWaMessageMode(autoTrigger ? 'thank_you' : 'full_receipt');
    setShowWaPreview(!justSaved || autoWhatsAppThankYouEnabled);
  }, [bill?.id, bill?.customerMobile, justSaved, autoWhatsAppThankYouEnabled]);

  const productImagesMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.imageUrl) map.set(p.id, p.imageUrl);
    });
    return map;
  }, [products]);

  useEffect(() => {
    if (!bill || bill.pendingBalance <= 0 || !upiSetting?.upiId) {
      setQrDataUrl('');
      return;
    }
    if (upiSetting.activeMode === 'uploaded' && upiSetting.uploadedQrDataUrl) {
      setQrDataUrl(upiSetting.uploadedQrDataUrl);
      return;
    }
    const uri = buildUpiUri({
      upiId: upiSetting.upiId,
      payeeName: upiSetting.accountHolderName || business?.name || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work',
      amount: bill.pendingBalance,
      billNumber: bill.billNumber,
    });
    generateAndVerifyUpiQr(uri).then((res) => setQrDataUrl(res.dataUrl));
  }, [bill, upiSetting, business]);

  if (!bill || !business) return null;

  const publicUrl = `${window.location.origin}/?invoice=${bill.publicToken}${language === 'te' ? '&lang=te' : ''}`;
  const isDue = bill.pendingBalance > 0 && bill.billStatus === 'active';
  const bizDisplay = translateBusinessName(business.name, language);
  const custDisplay = translateCustomerName(bill.customerName, language);
  const methodDisplay = translatePaymentMethod(bill.paymentMethod, language);
  const effectiveMobile = (whatsappMobile || bill.customerMobile || '').trim();
  const waTarget = formatWhatsAppPhone(effectiveMobile);
  const thankYouText = buildWhatsAppThankYouText({
    bill,
    business,
    publicUrl,
    language,
  });
  const fullReceiptText = buildWhatsAppReceiptText({
    bill,
    items,
    business,
    products,
    publicUrl,
    language,
  });
  const activeWhatsAppText = waMessageMode === 'thank_you' ? thankYouText : fullReceiptText;
  const directWhatsAppUrl = buildWhatsAppDirectUrl(effectiveMobile, activeWhatsAppText);
  const upiPayUri =
    isDue && upiSetting?.upiId
      ? buildUpiUri({
          upiId: upiSetting.upiId,
          payeeName: upiSetting.accountHolderName || business.name,
          amount: bill.pendingBalance,
          billNumber: bill.billNumber,
        })
      : '';
  const phonePeUri =
    isDue && upiSetting?.upiId
      ? buildPhonePeUri({
          upiId: upiSetting.upiId,
          payeeName: upiSetting.accountHolderName || business.name,
          amount: bill.pendingBalance,
          billNumber: bill.billNumber,
        })
      : '';

  const handleLogDirectWhatsApp = () => {
    if (waTarget) {
      logMessageDispatch({
        channel: 'whatsapp',
        recipientMobile: effectiveMobile || waTarget,
        billId: bill.id,
        billNumber: bill.billNumber,
        messageBody: activeWhatsAppText,
        status: 'opened_share_screen',
      });
      setStatusBanner({
        type: 'success',
        text: tr(
          language,
          `Opening WhatsApp chat directly for ${formatReadableWhatsAppPhone(effectiveMobile)} (works even if unsaved).`,
          `${formatReadableWhatsAppPhone(effectiveMobile)} కోసం నేరుగా వాట్సాప్ చాట్ తెరుస్తోంది (కాంటాక్ట్ సేవ్ లేకపోయినా పనిచేస్తుంది).`
        ),
      });
    } else {
      setStatusBanner({
        type: 'info',
        text: tr(
          language,
          'Opened WhatsApp share screen. Enter a 10-digit customer mobile above to send in 1 click without saving the contact.',
          'వాట్సాప్ షేర్ స్క్రీన్ తెరవబడింది. కాంటాక్ట్ సేవ్ చేయకుండా 1 క్లిక్‌లో పంపడానికి పైన 10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.'
        ),
      });
    }
  };

  const handleShareBillImageWhatsApp = async () => {
    setSharingImage(true);
    setStatusBanner(null);
    try {
      const { dataUrl, file } = await generateShareableBillImage({
        bill,
        items,
        business,
        upi: upiSetting,
        productImagesMap,
        products,
        language,
      });

      const statusNote = isDue
        ? language === 'te'
          ? `బాకీ మొత్తం: ₹${bill.pendingBalance.toFixed(2)}\nమీ బిల్ లింక్ ద్వారా ఫోన్‌పే / జీపే / యూపీఐతో చెల్లించండి:`
          : `Due Balance: ₹${bill.pendingBalance.toFixed(2)}\nPay using PhonePe / GPay / Any UPI on your bill link:`
        : language === 'te'
          ? `స్థితి: పూర్తిగా చెల్లించబడింది (₹${bill.amountPaid.toFixed(2)} · ${methodDisplay})`
          : `Status: AMOUNT PAID (₹${bill.amountPaid.toFixed(2)} via ${bill.paymentMethod})`;

      const shareText =
        language === 'te'
          ? `${bizDisplay}\n${custDisplay} బిల్ #${bill.billNumber}\nమొత్తం: ₹${bill.grandTotal.toFixed(2)}\n${statusNote}\n${publicUrl}`
          : `${business.name}\nBill #${bill.billNumber} for ${bill.customerName}\nTotal: ₹${bill.grandTotal.toFixed(2)}\n${statusNote}\n${publicUrl}`;

      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({
          title: `${tr(language, 'Bill', 'బిల్')} ${bill.billNumber} - ${bizDisplay}`,
          text: shareText,
          files: [file],
        });
        if (effectiveMobile) {
          await logMessageDispatch({
            channel: 'whatsapp',
            recipientMobile: effectiveMobile,
            billId: bill.id,
            billNumber: bill.billNumber,
            messageBody: shareText,
            status: 'opened_share_screen',
          });
        }
        setStatusBanner({
          type: 'success',
          text: tr(
            language,
            'Shared bill image via device share sheet (select WhatsApp).',
            'పరికర షేర్ మెనూ ద్వారా బిల్ చిత్రం షేర్ చేయబడింది (వాట్సాప్ ఎంచుకోండి).'
          ),
        });
        return;
      }

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${bill.billNumber}_Bill.png`;
      a.click();

      const waUrl = buildWhatsAppDirectUrl(effectiveMobile, shareText);
      openExternalLinkSafely(waUrl);
      if (effectiveMobile) {
        await logMessageDispatch({
          channel: 'whatsapp',
          recipientMobile: effectiveMobile,
          billId: bill.id,
          billNumber: bill.billNumber,
          messageBody: shareText,
          status: 'opened_share_screen',
        });
      }
      setStatusBanner({
        type: 'info',
        text:
          language === 'te'
            ? `${bill.billNumber}_Bill.png సేవ్ చేయబడింది మరియు వాట్సాప్ తెరవబడింది. డౌన్‌లోడ్ చేసిన బిల్ చిత్రాన్ని వాట్సాప్‌లో జతచేయండి!`
            : `Saved ${bill.billNumber}_Bill.png and opened WhatsApp. Attach the downloaded bill image in WhatsApp!`,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : tr(language, 'Unable to share bill image.', 'బిల్ చిత్రాన్ని షేర్ చేయడం సాధ్యం కాలేదు.'),
      });
    } finally {
      setSharingImage(false);
    }
  };

  const handleSharePaymentLink = async () => {
    const paymentMsg =
      language === 'te'
        ? `${bizDisplay} - బిల్ #${bill.billNumber} చెల్లింపు లింక్\nకస్టమర్: ${custDisplay}\nమొత్తం: ₹${bill.grandTotal.toFixed(2)} | బాకీ: ₹${bill.pendingBalance.toFixed(2)}\nఫోన్‌పే / జీపే / యూపీఐ ద్వారా చెల్లించండి & ప్రత్యక్ష స్థితిని చూడండి:\n${publicUrl}`
        : `${business.name} - Payment Link for Bill #${bill.billNumber}\nCustomer: ${bill.customerName}\nTotal: ₹${bill.grandTotal.toFixed(2)} | Due Balance: ₹${bill.pendingBalance.toFixed(2)}\nPay via PhonePe / GPay / Any UPI & View Live Status:\n${publicUrl}`;

    if (navigator.share && !waTarget) {
      try {
        await navigator.share({
          title: `${tr(language, 'Pay Due', 'బాకీ చెల్లించండి')} ${formatCurrency(bill.pendingBalance)} · ${bill.billNumber}`,
          text: paymentMsg,
          url: publicUrl,
        });
        setStatusBanner({
          type: 'success',
          text: tr(language, 'Shared customer payment link.', 'కస్టమర్ చెల్లింపు లింక్ షేర్ చేయబడింది.'),
        });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }

    await navigator.clipboard.writeText(paymentMsg).catch(() => {});
    const waUrl = buildWhatsAppDirectUrl(effectiveMobile, paymentMsg);
    openExternalLinkSafely(waUrl);
    if (effectiveMobile) {
      logMessageDispatch({
        channel: 'whatsapp',
        recipientMobile: effectiveMobile,
        billId: bill.id,
        billNumber: bill.billNumber,
        messageBody: paymentMsg,
        status: 'opened_share_screen',
      });
    }
    setStatusBanner({
      type: 'success',
      text: tr(
        language,
        'Copied PhonePe/UPI payment link & opened direct WhatsApp chat.',
        'ఫోన్‌పే/యూపీఐ చెల్లింపు లింక్ కాపీ చేసి నేరుగా వాట్సాప్ చాట్ తెరవబడింది.'
      ),
    });
  };

  const handleSmsSend = async () => {
    if (!effectiveMobile) {
      setStatusBanner({
        type: 'error',
        text: tr(language, 'Customer mobile number is required to send SMS.', 'ఎస్‌ఎంఎస్ పంపడానికి కస్టమర్ మొబైల్ నంబర్ అవసరం.'),
      });
      return;
    }
    setSendingSms(true);
    setStatusBanner(null);
    const messageBody =
      language === 'te'
        ? `${bizDisplay}: బిల్ ${bill.billNumber} · మొత్తం ₹${bill.grandTotal.toFixed(2)}${
            bill.pendingBalance > 0 ? ` · బాకీ ₹${bill.pendingBalance.toFixed(2)}` : ' · పూర్తిగా చెల్లించబడింది'
          }. బిల్ చూడండి: ${publicUrl}`
        : `${business.name}: Bill ${bill.billNumber} · Total ₹${bill.grandTotal.toFixed(2)}${
            bill.pendingBalance > 0 ? ` · Due ₹${bill.pendingBalance.toFixed(2)}` : ' · AMOUNT PAID'
          }. View bill: ${publicUrl}`;
    try {
      const cleanPhone = effectiveMobile.replace(/[^0-9+]/g, '');
      window.location.href = `sms:${cleanPhone}?body=${encodeURIComponent(messageBody)}`;
      await logMessageDispatch({
        channel: 'sms',
        recipientMobile: effectiveMobile,
        billId: bill.id,
        billNumber: bill.billNumber,
        messageBody,
        status: 'opened_share_screen',
      });
      setStatusBanner({
        type: 'success',
        text: tr(language, 'Opened device SMS app with bill details.', 'బిల్ వివరాలతో ఎస్‌ఎంఎస్ యాప్ తెరవబడింది.'),
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : tr(language, 'Unable to open SMS app.', 'ఎస్‌ఎంఎస్ యాప్ తెరవడం సాధ్యం కాలేదు.'),
      });
    } finally {
      setSendingSms(false);
    }
  };

  const handleCopyPublicLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyWhatsAppText = async () => {
    await navigator.clipboard.writeText(activeWhatsAppText);
    setCopiedWaText(true);
    setTimeout(() => setCopiedWaText(false), 2000);
  };

  const previewTimeLabel = new Date().toLocaleTimeString(language === 'te' ? 'te-IN' : 'en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/65 p-1.5 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 shadow-2xl overflow-hidden max-h-[94dvh] flex flex-col">
        {/* Header */}
        <div className="no-print flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#E5DDD3] dark:border-slate-800 bg-[#0A2240] text-white shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-semibold">
              {tr(language, 'Invoice & Receipt', 'ఇన్వాయిస్ & రసీదు')} · {bill.billNumber}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              {custDisplay} · {formatCurrency(bill.grandTotal)} ·{' '}
              {isDue
                ? `${tr(language, 'DUE', 'బాకీ')} ${formatCurrency(bill.pendingBalance)}`
                : tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
        {/* 1-Click Direct WhatsApp Customer Share Bar (Works for Saved & Unsaved Numbers) */}
        <div className="no-print p-3 sm:px-4 sm:py-3 border-b border-[#C5E8D1]/80 dark:border-emerald-900 bg-[#E7F6EC]/75 dark:bg-emerald-950/30 space-y-2.5">
          {shouldAutoTriggerThankYou && (
            <div className="px-3 py-2 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0" />
              <span>
                {tr(
                  language,
                  `Invoice ${bill.billNumber} saved! Auto-Send WhatsApp 'Thank You' preview is ready below — review and confirm to send.`,
                  `ఇన్వాయిస్ ${bill.billNumber} సేవ్ చేయబడింది! వాట్సాప్ 'ధన్యవాదాలు' మెసేజ్ ప్రివ్యూ క్రింద సిద్ధంగా ఉంది — సరిచూసి పంపడానికి నిర్ధారించండి.`
                )}
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white dark:bg-slate-900 border border-[#C5E8D1] dark:border-emerald-800 rounded-xl px-3 py-1.5">
              <MessageCircle className="w-4 h-4 text-[#16A34A] shrink-0" />
              <input
                type="tel"
                value={whatsappMobile}
                onChange={(e) => setWhatsappMobile(e.target.value)}
                placeholder={tr(
                  language,
                  'Enter customer WhatsApp mobile (10 digits)',
                  'కస్టమర్ వాట్సాప్ మొబైల్ నంబర్ (10 అంకెలు)'
                )}
                className="w-full bg-transparent text-xs sm:text-sm font-mono text-[#0A2240] dark:text-slate-100 focus:outline-none"
              />
            </div>

            <a
              href={directWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLogDirectWhatsApp}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold shadow-sm transition shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              {waTarget
                ? waMessageMode === 'thank_you'
                  ? tr(
                      language,
                      `Confirm & Send (${formatReadableWhatsAppPhone(effectiveMobile)})`,
                      `నిర్ధారించి పంపండి (${formatReadableWhatsAppPhone(effectiveMobile)})`
                    )
                  : tr(
                      language,
                      `Send Receipt (${formatReadableWhatsAppPhone(effectiveMobile)})`,
                      `రసీదు పంపండి (${formatReadableWhatsAppPhone(effectiveMobile)})`
                    )
                : waMessageMode === 'thank_you'
                ? tr(language, 'Confirm & Send on WhatsApp', 'నిర్ధారించి వాట్సాప్‌లో పంపండి')
                : tr(language, 'Send on WhatsApp (1-Click)', 'వాట్సాప్‌లో పంపండి (1-క్లిక్)')}
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/90 dark:bg-slate-900 border border-[#C5E8D1] dark:border-emerald-800">
              <button
                type="button"
                onClick={() => setWaMessageMode('thank_you')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                  waMessageMode === 'thank_you'
                    ? 'bg-[#16A34A] text-white shadow-sm'
                    : 'text-emerald-900 dark:text-emerald-300 hover:bg-[#E7F6EC] dark:hover:bg-emerald-950/60'
                }`}
              >
                {tr(language, 'Thank You + Link', 'ధన్యవాదాలు + లింక్')}
              </button>
              <button
                type="button"
                onClick={() => setWaMessageMode('full_receipt')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                  waMessageMode === 'full_receipt'
                    ? 'bg-[#16A34A] text-white shadow-sm'
                    : 'text-emerald-900 dark:text-emerald-300 hover:bg-[#E7F6EC] dark:hover:bg-emerald-950/60'
                }`}
              >
                {tr(language, 'Full Itemized Receipt', 'పూర్తి రసీదు')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowWaPreview((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white/90 dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold hover:bg-emerald-100/70 dark:hover:bg-emerald-950/60 transition shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {showWaPreview
                  ? tr(language, 'Hide Message Preview', 'మెసేజ్ ప్రివ్యూ దాచండి')
                  : tr(language, 'Preview WhatsApp Message', 'వాట్సాప్ మెసేజ్ ప్రివ్యూ')}
              </span>
              {showWaPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showWaPreview && (
            <div className="rounded-xl border border-[#C5E8D1] dark:border-emerald-800/80 overflow-hidden shadow-sm bg-[#EFEAE2] dark:bg-[#0B141A]">
              {/* WhatsApp Preview Header */}
              <div className="px-3 py-2 bg-[#075E54] dark:bg-[#202C33] text-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/30 border border-white/25 flex items-center justify-center text-xs font-bold shrink-0">
                    {custDisplay.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {tr(language, 'WhatsApp Preview', 'వాట్సాప్ ప్రివ్యూ')} · {custDisplay}
                    </div>
                    <div className="text-[10px] text-emerald-100/90 font-mono truncate">
                      {waTarget
                        ? formatReadableWhatsAppPhone(effectiveMobile)
                        : tr(language, 'Select recipient in WhatsApp', 'వాట్సాప్‌లో స్వీకర్తను ఎంచుకోండి')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyWhatsAppText}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold transition shrink-0"
                >
                  {copiedWaText ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedWaText ? tr(language, 'Copied', 'కాపీ అయింది') : tr(language, 'Copy Text', 'టెక్స్ట్ కాపీ')}
                </button>
              </div>

              {/* WhatsApp Outgoing Chat Bubble */}
              <div className="p-2.5 sm:p-3 max-h-40 overflow-y-auto flex justify-end">
                <div className="relative max-w-[94%] sm:max-w-[82%] rounded-xl rounded-tr-none bg-[#D9FDD3] dark:bg-[#005C4B] text-[#0A2240] dark:text-slate-100 px-3 py-2 shadow-sm border border-[#C5E8D1]/70 dark:border-emerald-900/60">
                  <div className="text-xs leading-relaxed break-words space-y-0.5">
                    {renderFormattedWhatsAppMessage(activeWhatsAppText)}
                  </div>
                  <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-[#6D665E] dark:text-emerald-200/80 font-mono">
                    <span>{previewTimeLabel}</span>
                    <CheckCheck className="w-3.5 h-3.5 text-[#0284C7] dark:text-sky-300" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="no-print p-3 sm:p-4 border-b border-[#E5DDD3] dark:border-slate-800 bg-[#FAF8F5] dark:bg-slate-950 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#16346e]"
          >
            <Printer className="w-3.5 h-3.5" />
            {tr(language, 'Print / PDF', 'ప్రింట్ / పీడీఎఫ్')}
          </button>

          <button
            type="button"
            onClick={handleShareBillImageWhatsApp}
            disabled={sharingImage}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {sharingImage
              ? tr(language, 'Rendering PNG...', 'చిత్రం తయారవుతోంది...')
              : tr(language, 'Share Bill Image (PNG)', 'బిల్ చిత్రం షేర్ చేయండి')}
          </button>

          {isDue && (
            <button
              type="button"
              onClick={handleSharePaymentLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              <Smartphone className="w-3.5 h-3.5" />
              {tr(language, 'Share PhonePe / UPI Pay Link', 'ఫోన్‌పే / యూపీఐ చెల్లింపు లింక్ షేర్')}
            </button>
          )}

          <button
            type="button"
            onClick={handleSmsSend}
            disabled={sendingSms}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B] disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {tr(language, 'SMS', 'ఎస్‌ఎంఎస్')}
          </button>
        </div>

        {/* Public Invoice URL + Mode Switch */}
        <div
          className={`no-print px-4 sm:px-5 py-3 border-b border-[#E5DDD3] dark:border-slate-800 flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 ${
            isAdmin ? 'justify-between' : 'justify-end'
          }`}
        >
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#6D665E]">{tr(language, 'Customer Bill Link:', 'కస్టమర్ బిల్ లింక్:')}</span>
              <code className="font-mono text-[#2D3138] dark:text-slate-300 bg-[#F3EDE5] dark:bg-slate-800 px-2 py-1 rounded max-w-[210px] sm:max-w-[260px] truncate">
                {publicUrl}
              </code>
              <button
                onClick={handleCopyPublicLink}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E5DDD3] dark:border-slate-700 text-[#2D3138] dark:text-slate-200 hover:bg-[#F3EDE5] dark:hover:bg-slate-800"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? tr(language, 'Copied', 'కాపీ అయింది') : tr(language, 'Copy', 'కాపీ')}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E5DDD3] dark:border-slate-700 text-[#9A4307] dark:text-sky-400 hover:bg-[#F3EDE5] dark:hover:bg-slate-800"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {tr(language, 'Open', 'తెరువు')}
              </a>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#F3EDE5] dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setViewMode('a4')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'a4' ? 'bg-white dark:bg-slate-900 text-[#0A2240] dark:text-white shadow-sm' : 'text-[#6D665E]'
                }`}
              >
                {tr(language, 'A4 Invoice', 'ఏ4 ఇన్వాయిస్')}
              </button>
              <button
                onClick={() => setViewMode('thermal')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'thermal' ? 'bg-white dark:bg-slate-900 text-[#0A2240] dark:text-white shadow-sm' : 'text-[#6D665E]'
                }`}
              >
                {tr(language, 'Thermal Slip', 'థర్మల్ స్లిప్')}
              </button>
            </div>

            {viewMode === 'thermal' && (
              <div className="flex items-center gap-1 p-1 bg-[#F3EDE5] dark:bg-slate-800 rounded-lg">
                <button
                  onClick={() => setThermalWidth('58mm')}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md ${
                    thermalWidth === '58mm' ? 'bg-white dark:bg-slate-900 text-[#0A2240] dark:text-white shadow-sm' : 'text-[#6D665E]'
                  }`}
                >
                  {language === 'te' ? '58 మి.మీ.' : '58mm'}
                </button>
                <button
                  onClick={() => setThermalWidth('80mm')}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md ${
                    thermalWidth === '80mm' ? 'bg-white dark:bg-slate-900 text-[#0A2240] dark:text-white shadow-sm' : 'text-[#6D665E]'
                  }`}
                >
                  {language === 'te' ? '80 మి.మీ.' : '80mm'}
                </button>
              </div>
            )}
          </div>
        </div>

        {statusBanner && (
          <div
            className={`no-print mx-4 sm:mx-5 mt-3 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
              statusBanner.type === 'success'
                ? 'bg-[#E7F6EC] text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-[#C5E8D1] dark:border-emerald-800'
                : statusBanner.type === 'error'
                ? 'bg-[#FCE8E6] text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-[#F5C6C0] dark:border-rose-800'
                : 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
        )}

        {/* Preview Area */}
        <div className="p-2.5 sm:p-5 bg-[#F3EDE5] dark:bg-slate-950 flex justify-center">
          {viewMode === 'a4' ? (
            <A4InvoicePreview
              bill={bill}
              items={items}
              business={business}
              settings={businessSettings}
              products={products}
              qrDataUrl={qrDataUrl}
              upiId={upiSetting?.upiId}
              upiPayUri={upiPayUri}
              phonePeUri={phonePeUri}
              language={language}
              hideBarcodeMatter={!isAdmin}
            />
          ) : (
            <ThermalReceiptPreview
              bill={bill}
              items={items}
              business={business}
              settings={businessSettings}
              paperWidth={thermalWidth}
              qrDataUrl={qrDataUrl}
              products={products}
              language={language}
              hideBarcodeMatter={!isAdmin}
            />
          )}
        </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export const A4InvoicePreview: React.FC<{
  bill: Bill;
  items: BillItem[];
  business: Business;
  settings?: BusinessSettings | null;
  products?: Product[];
  qrDataUrl?: string;
  upiId?: string;
  upiPayUri?: string;
  phonePeUri?: string;
  language?: Language;
  hideBarcodeMatter?: boolean;
}> = ({
  bill,
  items,
  business,
  settings,
  products = [],
  qrDataUrl,
  upiId,
  upiPayUri,
  phonePeUri,
  language = 'en',
  hideBarcodeMatter = false,
}) => {
  const isDue = bill.pendingBalance > 0 && bill.billStatus === 'active';
  const verificationCode = useMemo(() => getBillVerificationBarcode(bill), [bill]);
  const barcodeDataUrl = useMemo(() => generateCode128SvgDataUrl(verificationCode), [verificationCode]);
  const bizName = translateBusinessName(business.name, language);
  const bizProp = translateProprietor(business.proprietor, language);
  const bizAddress = translateAddress(business.address, language);
  const custName = translateCustomerName(bill.customerName, language);
  const payMethod = translatePaymentMethod(bill.paymentMethod, language);

  const logoUrl = resolveBusinessLogoUrl(business.logoUrl);

  return (
    <div className="print-only-container relative w-full max-w-[780px] bg-white text-[#0A2240] rounded-xl border border-[#E5DDD3] shadow-sm overflow-hidden">
      <div className="bg-[#0A2240] text-white px-4 py-4 sm:px-6 sm:py-5 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {settings?.showLogo !== false && (
            <img
              src={resolveBusinessLogoUrl(business.logoUrl)}
              alt={bizName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-contain bg-white p-1 shrink-0"
            />
          )}
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold tracking-tight break-words">{bizName}</h2>
            <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 break-words">
              {[
                bizProp ? `${tr(language, 'Prop:', 'యజమాని:')} ${bizProp}` : '',
                business.phone ? `${tr(language, 'Ph:', 'ఫోన్:')} ${business.phone}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {bizAddress && <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 break-words">{bizAddress}</p>}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs sm:text-sm font-bold tracking-wider uppercase text-sky-300">
            {tr(language, 'Invoice', 'ఇన్వాయిస్')}
          </div>
          <div className="font-mono text-sm sm:text-base font-bold mt-0.5">{bill.billNumber}</div>
          <div className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
            {formatAppDate(formatTimestamp(bill.createdAt), language, true)}
          </div>
        </div>
      </div>

      <div className="relative p-3.5 sm:p-6">
        {logoUrl && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
          >
            <img
              src={logoUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-56 h-56 sm:w-72 sm:h-72 rounded-3xl object-contain opacity-[0.12] mix-blend-multiply select-none"
            />
          </div>
        )}
        <div className="relative z-10 space-y-4 sm:space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-5 pb-3.5 sm:pb-4 border-b border-[#E5DDD3]">
          <div>
            <div className="text-xs font-semibold text-[#6D665E]">{tr(language, 'Billed To', 'బిల్ చేయబడినవారు')}</div>
            <div className="text-sm font-bold text-[#0A2240] mt-1">{custName}</div>
            {bill.customerMobile && (
              <div className="text-xs text-[#6D665E] mt-0.5">
                {tr(language, 'Mobile:', 'మొబైల్:')} {bill.customerMobile}
              </div>
            )}
            {bill.customerAddress && <div className="text-xs text-[#6D665E] mt-0.5 break-words">{bill.customerAddress}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-semibold text-[#6D665E]">{tr(language, 'Payment Summary', 'చెల్లింపు సారాంశం')}</div>
            <div className={`text-sm font-bold mt-1 ${isDue ? 'text-[#9A4307]' : 'text-[#15803D]'}`}>
              {isDue
                ? `${tr(language, 'DUE', 'బాకీ')} ${formatCurrency(bill.pendingBalance)}`
                : tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')}{' '}
              · {payMethod}
            </div>
            <div className="text-xs text-[#6D665E] mt-0.5">
              {tr(language, 'Billed by:', 'బిల్ చేసినవారు:')} {bill.createdByName}
            </div>
          </div>
        </div>

        {/* Mobile Stacked Item List (Zero horizontal cut-off) */}
        <div className="sm:hidden print:hidden space-y-2.5">
          {items.map((item, idx) => {
            const matchedProd = products.find((p) => p.id === item.productId);
            const imgSrc = item.imageUrl || resolveProductImage(matchedProd, item.productName);
            const itemName = translateCartProductName(item.productName, item.productId, products, language);
            const varLabel = translateVariantLabel(item.variantLabel, language);
            return (
              <div key={item.id || idx} className="p-2.5 rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={imgSrc}
                    alt={itemName}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const fallback = getDefaultProductImage(item.productName);
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                    className="w-10 h-10 rounded-lg object-cover border border-[#E5DDD3] bg-white shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#0A2240] truncate">
                      {idx + 1}. {itemName}
                      {varLabel ? <span className="text-[#6D665E]"> ({varLabel})</span> : null}
                    </div>
                    <div className="text-[11px] font-mono text-[#6D665E] mt-0.5">
                      {item.quantity} × ₹{item.unitPrice.toFixed(2)}
                      {item.discount > 0 ? ` · -₹${item.discount.toFixed(2)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono font-bold text-[#0A2240] tabular-nums shrink-0">
                  ₹{item.lineTotal.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop & Print Full 6-Column Invoice Table */}
        <div className="hidden sm:block print:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#E5DDD3] text-xs text-[#6D665E]">
                <th className="py-2.5 text-left font-semibold">#</th>
                <th className="py-2.5 text-left font-semibold">{tr(language, 'Item & Photo', 'వస్తువు & చిత్రం')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Qty', 'పరిమాణం')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Rate', 'ధర')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Disc', 'తగ్గింపు')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Total', 'మొత్తం')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] font-mono text-xs">
              {items.map((item, idx) => {
                const matchedProd = products.find((p) => p.id === item.productId);
                const imgSrc = item.imageUrl || resolveProductImage(matchedProd, item.productName);
                const itemName = translateCartProductName(item.productName, item.productId, products, language);
                const varLabel = translateVariantLabel(item.variantLabel, language);
                return (
                  <tr key={item.id || idx}>
                    <td className="py-2.5 text-[#6D665E]">{idx + 1}</td>
                    <td className="py-2.5 font-sans font-medium text-[#0A2240]">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={imgSrc}
                          alt={itemName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fallback = getDefaultProductImage(item.productName);
                            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                          }}
                          className="w-10 h-10 rounded-lg object-cover border border-[#E5DDD3] bg-[#FAF8F5] shrink-0"
                        />
                        <div>
                          <div>
                            {itemName}
                            {varLabel ? <span className="text-[#6D665E]"> ({varLabel})</span> : null}
                          </div>
                          {!hideBarcodeMatter && item.productCode && (
                            <div className="text-[10px] font-mono text-[#8A8279]">{item.productCode}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.unitPrice.toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.discount.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{item.lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Conditional Payment QR Scanner if Due > 0, else AMOUNT PAID */}
        <div className="flex flex-wrap items-start justify-between gap-6 pt-4 border-t border-[#E5DDD3]">
          <div className="flex-1 min-w-[240px]">
            {isDue ? (
              <div className="p-3.5 rounded-xl border border-[#F0D9B5] bg-[#FDF3DF] space-y-3">
                <div className="flex items-center gap-3">
                  {qrDataUrl && settings?.showQrCode !== false && (
                    <img
                      src={qrDataUrl}
                      alt={tr(language, 'UPI Payment QR', 'యూపీఐ చెల్లింపు క్యూఆర్')}
                      className="w-24 h-24 object-contain bg-white rounded-lg p-1 border border-[#F0D9B5]"
                    />
                  )}
                  <div className="text-xs">
                    <div className="font-bold text-[#7C3405]">
                      {tr(language, 'Due Balance:', 'బాకీ మొత్తం:')} {formatCurrency(bill.pendingBalance)}
                    </div>
                    <div className="text-[#9A4307] mt-0.5">
                      {tr(language, 'Scan QR with PhonePe / GPay / Any UPI', 'ఫోన్‌పే / జీపే / ఏదైనా యూపీఐతో క్యూఆర్ స్కాన్ చేయండి')}
                    </div>
                    {upiId && <div className="font-mono text-[#2D3138] mt-1">{upiId}</div>}
                  </div>
                </div>
                {upiPayUri && (
                  <div className="no-print flex flex-wrap gap-2">
                    <a
                      href={phonePeUri || upiPayUri}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5F259F] text-white text-xs font-semibold hover:opacity-90"
                    >
                      {tr(language, 'Pay via PhonePe', 'ఫోన్‌పే ద్వారా చెల్లించండి')}
                    </a>
                    <a
                      href={upiPayUri}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B]"
                    >
                      {tr(language, 'Pay Any UPI App', 'ఏదైనా యూపీఐ యాప్')}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="inline-flex items-center gap-3 p-4 rounded-xl border border-[#C5E8D1] bg-[#E7F6EC]">
                <CheckCircle2 className="w-8 h-8 text-[#15803D] shrink-0" />
                <div>
                  <div className="text-sm font-bold text-emerald-800">
                    {tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')}
                  </div>
                  <div className="text-xs text-[#15803D] font-mono">
                    {formatCurrency(bill.amountPaid)} · {payMethod}
                  </div>
                  <div className="text-[11px] text-[#15803D] mt-0.5">
                    {tr(language, 'Settled in full · No due remaining', 'పూర్తిగా చెల్లించబడింది · బాకీ లేదు')}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full sm:w-64 space-y-2 text-xs font-mono">
            <div className="flex justify-between text-[#6D665E]">
              <span className="font-sans">{tr(language, 'Subtotal', 'ఉప మొత్తం')}</span>
              <span className="tabular-nums">{formatCurrency(bill.subtotal)}</span>
            </div>
            {bill.discountAmount > 0 && (
              <div className="flex justify-between text-[#15803D]">
                <span className="font-sans">{tr(language, 'Discount', 'తగ్గింపు')}</span>
                <span className="tabular-nums">-{formatCurrency(bill.discountAmount)}</span>
              </div>
            )}
            {(bill.labourCharge || 0) > 0 && (
              <div className="flex justify-between text-[#2D3138]">
                <span className="font-sans">
                  {(bill.labourRatePerPiece || 0) > 0
                    ? tr(
                        language,
                        `Labour Charges (₹${Number(bill.labourRatePerPiece).toFixed(2)}/pc)`,
                        `లేబర్ ఛార్జీలు (₹${Number(bill.labourRatePerPiece).toFixed(2)}/పీస్)`
                      )
                    : tr(language, 'Labour Charges', 'లేబర్ ఛార్జీలు')}
                </span>
                <span className="tabular-nums">+{formatCurrency(bill.labourCharge || 0)}</span>
              </div>
            )}
            {(bill.autoCharge || 0) > 0 && (
              <div className="flex justify-between text-[#2D3138]">
                <span className="font-sans">{tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}</span>
                <span className="tabular-nums">+{formatCurrency(bill.autoCharge || 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-[#0A2240] pt-2 border-t border-[#E5DDD3]">
              <span className="font-sans">{tr(language, 'Grand Total', 'మొత్తం విలువ')}</span>
              <span className="tabular-nums">{formatCurrency(bill.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-[#15803D] font-semibold">
              <span className="font-sans">{tr(language, 'Amount Paid', 'చెల్లించిన మొత్తం')}</span>
              <span className="tabular-nums">{formatCurrency(bill.amountPaid)}</span>
            </div>
            <div className={`flex justify-between font-semibold ${isDue ? 'text-[#C23B2B]' : 'text-[#6D665E]'}`}>
              <span className="font-sans">{tr(language, 'Balance Due', 'బాకీ మొత్తం')}</span>
              <span className="tabular-nums">{formatCurrency(bill.pendingBalance)}</span>
            </div>
          </div>
        </div>

        {/* Scannable Code128 Bill Verification Barcode */}
        <div className="pt-4 border-t border-[#E5DDD3] flex flex-col items-center gap-1.5">
          {!hideBarcodeMatter && (
            <img
              src={barcodeDataUrl}
              alt={`${tr(language, 'Verification Barcode', 'తనిఖీ బార్‌కోడ్')} ${verificationCode}`}
              className="h-14 w-auto object-contain"
            />
          )}
          <div className="text-[11px] text-[#6D665E]">
            {!hideBarcodeMatter && (
              <>
                {tr(language, 'Verify Code:', 'తనిఖీ కోడ్:')}{' '}
                <span className="font-mono font-semibold text-[#2D3138]">{verificationCode}</span> ·{' '}
              </>
            )}
            {translateFooterMessage(settings?.footerMessage, language)}
          </div>
          <div className="text-[10px] text-[#8A8279]">
            {getCopyrightNoticeLocalized(business.name, language)}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export const ThermalReceiptPreview: React.FC<{
  bill: Bill;
  items: BillItem[];
  business: Business;
  settings?: BusinessSettings | null;
  paperWidth: '58mm' | '80mm';
  qrDataUrl?: string;
  products?: Product[];
  language?: Language;
  hideBarcodeMatter?: boolean;
}> = ({
  bill,
  items,
  business,
  settings,
  paperWidth,
  qrDataUrl,
  products = [],
  language = 'en',
  hideBarcodeMatter = false,
}) => {
  const widthClass = paperWidth === '58mm' ? 'w-[240px]' : 'w-[320px]';
  const fontSizeClass =
    settings?.fontSize === 'sm' ? 'text-[10px]' : settings?.fontSize === 'lg' ? 'text-[13px]' : 'text-[11px]';
  const isDue = bill.pendingBalance > 0 && bill.billStatus === 'active';
  const verificationCode = useMemo(() => getBillVerificationBarcode(bill), [bill]);
  const barcodeDataUrl = useMemo(() => generateCode128SvgDataUrl(verificationCode), [verificationCode]);
  const bizName = translateBusinessName(business.name, language);
  const bizAddress = translateAddress(business.address, language);
  const custName = translateCustomerName(bill.customerName, language);
  const payMethod = translatePaymentMethod(bill.paymentMethod, language);

  const thermalBgLogoUrl = resolveBusinessLogoUrl(business.logoUrl);

  return (
    <div
      className={`print-only-container relative overflow-hidden ${widthClass} max-w-full mx-auto bg-white text-black font-mono ${fontSizeClass} p-4 rounded border border-[#DFD7CC] shadow-sm leading-snug`}
    >
      {thermalBgLogoUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
        >
          <img
            src={thermalBgLogoUrl}
            alt=""
            referrerPolicy="no-referrer"
            className={`${
              paperWidth === '58mm' ? 'w-32 h-32' : 'w-44 h-44'
            } rounded-2xl object-contain grayscale opacity-[0.14] mix-blend-multiply select-none`}
          />
        </div>
      )}
      <div className="relative z-10">
      <div className="text-center space-y-1 pb-2 border-b border-dashed border-slate-400">
        {(settings?.showThermalLogo ?? settings?.showLogo) !== false && (
          <img
            src={resolveBusinessLogoUrl(business.logoUrl)}
            alt={bizName}
            referrerPolicy="no-referrer"
            className="w-14 h-14 rounded-lg mx-auto object-contain grayscale"
          />
        )}
        <div className="font-bold text-xs uppercase">{bizName}</div>
        {bizAddress && <div className="text-[10px]">{bizAddress}</div>}
        {business.phone && (
          <div>
            {tr(language, 'Ph:', 'ఫోన్:')} {business.phone}
          </div>
        )}
      </div>

      <div className="py-2 space-y-0.5 border-b border-dashed border-slate-400">
        <div className="flex justify-between">
          <span>{tr(language, 'Bill:', 'బిల్:')}</span>
          <span className="font-bold">{bill.billNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>{tr(language, 'Date:', 'తేదీ:')}</span>
          <span>{formatAppDate(formatTimestamp(bill.createdAt), language, true)}</span>
        </div>
        <div>
          {tr(language, 'Cust:', 'కస్టమర్:')} {custName}
        </div>
        {bill.customerMobile && (
          <div>
            {tr(language, 'Mob :', 'మొబైల్:')} {bill.customerMobile}
          </div>
        )}
      </div>

      <div className="py-2 space-y-1.5 border-b border-dashed border-slate-400">
        {items.map((item, idx) => {
          const itemName = translateCartProductName(item.productName, item.productId, products, language);
          const varLabel = translateVariantLabel(item.variantLabel, language);
          return (
            <div key={item.id || idx}>
              <div className="font-semibold break-words">
                {itemName}
                {varLabel ? ` (${varLabel})` : ''}
              </div>
              <div className="flex justify-between tabular-nums">
                <span>
                  {item.quantity} × {item.unitPrice.toFixed(2)}
                </span>
                <span>{item.lineTotal.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="py-2 space-y-0.5 border-b border-dashed border-slate-400 tabular-nums">
        <div className="flex justify-between">
          <span>{tr(language, 'Subtotal', 'ఉప మొత్తం')}</span>
          <span>{bill.subtotal.toFixed(2)}</span>
        </div>
        {bill.discountAmount > 0 && (
          <div className="flex justify-between">
            <span>{tr(language, 'Discount', 'తగ్గింపు')}</span>
            <span>-{bill.discountAmount.toFixed(2)}</span>
          </div>
        )}
        {(bill.labourCharge || 0) > 0 && (
          <div className="flex justify-between">
            <span>{tr(language, 'Labour Charges', 'లేబర్ ఛార్జీలు')}</span>
            <span>+{Number(bill.labourCharge || 0).toFixed(2)}</span>
          </div>
        )}
        {(bill.autoCharge || 0) > 0 && (
          <div className="flex justify-between">
            <span>{tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}</span>
            <span>+{Number(bill.autoCharge || 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm pt-1 border-t border-dotted border-slate-400">
          <span>{tr(language, 'GRAND TOTAL', 'మొత్తం విలువ')}</span>
          <span>₹{bill.grandTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between pt-1">
          <span>
            {tr(language, 'Paid', 'చెల్లించినది')} ({payMethod})
          </span>
          <span>₹{bill.amountPaid.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>{tr(language, 'Balance', 'బాకీ')}</span>
          <span>₹{bill.pendingBalance.toFixed(2)}</span>
        </div>
      </div>

      {isDue && qrDataUrl && settings?.showQrCode !== false ? (
        <div className="py-3 text-center border-b border-dashed border-slate-400">
          <img src={qrDataUrl} alt={tr(language, 'UPI QR', 'యూపీఐ క్యూఆర్')} className="w-28 h-28 mx-auto object-contain" />
          <div className="text-[10px] font-bold mt-1">
            {tr(language, 'Scan to Pay Due:', 'బాకీ చెల్లించడానికి స్కాన్ చేయండి:')} ₹{bill.pendingBalance.toFixed(2)}
          </div>
        </div>
      ) : (
        <div className="py-2.5 text-center border-b border-dashed border-slate-400 font-bold text-xs">
          {tr(language, '*** AMOUNT PAID ***', '*** పూర్తిగా చెల్లించబడింది ***')}
        </div>
      )}

      {!hideBarcodeMatter && (
        <div className="py-2 text-center border-b border-dashed border-slate-400">
          <img
            src={barcodeDataUrl}
            alt={`${tr(language, 'Verification Barcode', 'తనిఖీ బార్‌కోడ్')} ${verificationCode}`}
            className="h-11 mx-auto object-contain"
          />
        </div>
      )}

      <div className="pt-2 text-center text-[10px]">
        {translateFooterMessage(settings?.footerMessage, language)}
      </div>
      </div>
    </div>
  );
};

