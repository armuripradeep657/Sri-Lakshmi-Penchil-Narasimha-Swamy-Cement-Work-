import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
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
  translateGstType,
  translatePaymentMethod,
  translateProprietor,
  translateVariantLabel,
} from '../lib/i18n';

interface PostBillActionsModalProps {
  bill: Bill | null;
  items: BillItem[];
  onClose: () => void;
}

export const PostBillActionsModal: React.FC<PostBillActionsModalProps> = ({ bill, items, onClose }) => {
  const { business, businessSettings, upiSetting, products, logMessageDispatch } = useBillingData();
  const { language } = useAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [viewMode, setViewMode] = useState<'a4' | 'thermal'>('a4');
  const [thermalWidth, setThermalWidth] = useState<'58mm' | '80mm'>(businessSettings?.paperWidth || '80mm');
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);

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
        if (bill.customerMobile) {
          await logMessageDispatch({
            channel: 'whatsapp',
            recipientMobile: bill.customerMobile,
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

      const cleanPhone = (bill.customerMobile || '').replace(/[^0-9]/g, '');
      const waTarget = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const waUrl = waTarget
        ? `https://wa.me/${waTarget}?text=${encodeURIComponent(shareText)}`
        : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

      window.open(waUrl, '_blank', 'noopener,noreferrer');
      if (bill.customerMobile) {
        await logMessageDispatch({
          channel: 'whatsapp',
          recipientMobile: bill.customerMobile,
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
    const cleanPhone = (bill.customerMobile || '').replace(/[^0-9]/g, '');
    const waTarget = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    if (navigator.share) {
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

    await navigator.clipboard.writeText(paymentMsg);
    const waUrl = waTarget
      ? `https://wa.me/${waTarget}?text=${encodeURIComponent(paymentMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(paymentMsg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    setStatusBanner({
      type: 'success',
      text: tr(language, 'Copied PhonePe/UPI payment link & opened WhatsApp.', 'ఫోన్‌పే/యూపీఐ చెల్లింపు లింక్ కాపీ చేసి వాట్సాప్ తెరవబడింది.'),
    });
  };

  const handleSmsSend = async () => {
    if (!bill.customerMobile) {
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
      const cleanPhone = bill.customerMobile.replace(/[^0-9+]/g, '');
      window.location.href = `sms:${cleanPhone}?body=${encodeURIComponent(messageBody)}`;
      await logMessageDispatch({
        channel: 'sms',
        recipientMobile: bill.customerMobile,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="no-print flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-[#0B1F44] text-white">
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

        {/* Action Toolbar */}
        <div className="no-print p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center gap-2">
          <button
            onClick={handleShareBillImageWhatsApp}
            disabled={sharingImage}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {sharingImage
              ? tr(language, 'Rendering PNG...', 'చిత్రం తయారవుతోంది...')
              : tr(language, 'Share Bill Image (WhatsApp)', 'బిల్ చిత్రాన్ని షేర్ చేయండి (వాట్సాప్)')}
          </button>

          {isDue && (
            <button
              onClick={handleSharePaymentLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              <Smartphone className="w-3.5 h-3.5" />
              {tr(language, 'Share PhonePe / UPI Pay Link', 'ఫోన్‌పే / యూపీఐ చెల్లింపు లింక్ షేర్')}
            </button>
          )}

          <button
            onClick={handleSmsSend}
            disabled={sendingSms}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {tr(language, 'SMS', 'ఎస్‌ఎంఎస్')}
          </button>
        </div>

        {/* Public Invoice URL + Mode Switch */}
        <div className="no-print px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">{tr(language, 'Customer Bill Link:', 'కస్టమర్ బిల్ లింక్:')}</span>
            <code className="font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded max-w-[210px] sm:max-w-[260px] truncate">
              {publicUrl}
            </code>
            <button
              onClick={handleCopyPublicLink}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? tr(language, 'Copied', 'కాపీ అయింది') : tr(language, 'Copy', 'కాపీ')}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[#1D4ED8] dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {tr(language, 'Open', 'తెరువు')}
            </a>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setViewMode('a4')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'a4' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                {tr(language, 'A4 Invoice', 'ఏ4 ఇన్వాయిస్')}
              </button>
              <button
                onClick={() => setViewMode('thermal')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'thermal' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                {tr(language, 'Thermal Slip', 'థర్మల్ స్లిప్')}
              </button>
            </div>

            {viewMode === 'thermal' && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  onClick={() => setThermalWidth('58mm')}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md ${
                    thermalWidth === '58mm' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {language === 'te' ? '58 మి.మీ.' : '58mm'}
                </button>
                <button
                  onClick={() => setThermalWidth('80mm')}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md ${
                    thermalWidth === '80mm' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
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
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : statusBanner.type === 'error'
                ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                : 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>{statusBanner.text}</span>
          </div>
        )}

        {/* Preview Area */}
        <div className="p-3 sm:p-5 max-h-[60vh] overflow-y-auto bg-slate-100 dark:bg-slate-950 flex justify-center">
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
            />
          )}
        </div>
      </div>
    </div>
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
}) => {
  const isDue = bill.pendingBalance > 0 && bill.billStatus === 'active';
  const verificationCode = useMemo(() => getBillVerificationBarcode(bill), [bill]);
  const barcodeDataUrl = useMemo(() => generateCode128SvgDataUrl(verificationCode), [verificationCode]);
  const bizName = translateBusinessName(business.name, language);
  const bizProp = translateProprietor(business.proprietor, language);
  const bizAddress = translateAddress(business.address, language);
  const custName = translateCustomerName(bill.customerName, language);
  const payMethod = translatePaymentMethod(bill.paymentMethod, language);

  return (
    <div className="print-only-container w-full max-w-[780px] bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-[#0B1F44] text-white px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {settings?.showLogo !== false && (
            <img
              src={resolveBusinessLogoUrl(business.logoUrl)}
              alt={bizName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-xl object-contain bg-white p-1 shrink-0"
            />
          )}
          <div>
            <h2 className="text-lg font-bold tracking-tight">{bizName}</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {[
                bizProp ? `${tr(language, 'Prop:', 'యజమాని:')} ${bizProp}` : '',
                business.phone ? `${tr(language, 'Ph:', 'ఫోన్:')} ${business.phone}` : '',
                business.gstin ? `${tr(language, 'GSTIN:', 'జీఎస్టీఐఎన్:')} ${business.gstin}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {bizAddress && <p className="text-xs text-slate-300 mt-0.5">{bizAddress}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold tracking-wider uppercase text-sky-300">
            {bill.totalTax > 0 ? tr(language, 'Tax Invoice', 'ట్యాక్స్ ఇన్వాయిస్') : tr(language, 'Invoice', 'ఇన్వాయిస్')}
          </div>
          <div className="font-mono text-base font-bold mt-0.5">{bill.billNumber}</div>
          <div className="text-xs text-slate-300 mt-0.5">
            {formatAppDate(formatTimestamp(bill.createdAt), language, true)}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-semibold text-slate-500">{tr(language, 'Billed To', 'బిల్ చేయబడినవారు')}</div>
            <div className="text-sm font-bold text-slate-900 mt-1">{custName}</div>
            {bill.customerMobile && (
              <div className="text-xs text-slate-600 mt-0.5">
                {tr(language, 'Mobile:', 'మొబైల్:')} {bill.customerMobile}
              </div>
            )}
            {bill.customerAddress && <div className="text-xs text-slate-600 mt-0.5">{bill.customerAddress}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-semibold text-slate-500">{tr(language, 'Payment Summary', 'చెల్లింపు సారాంశం')}</div>
            <div className={`text-sm font-bold mt-1 ${isDue ? 'text-amber-700' : 'text-emerald-700'}`}>
              {isDue
                ? `${tr(language, 'DUE', 'బాకీ')} ${formatCurrency(bill.pendingBalance)}`
                : tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')}{' '}
              · {payMethod}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {tr(language, 'Billed by:', 'బిల్ చేసినవారు:')} {bill.createdByName}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 text-left font-semibold">#</th>
                <th className="py-2.5 text-left font-semibold">{tr(language, 'Item & Photo', 'వస్తువు & చిత్రం')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Qty', 'పరిమాణం')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Rate', 'ధర')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Disc', 'తగ్గింపు')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Tax', 'పన్ను')}</th>
                <th className="py-2.5 text-right font-semibold">{tr(language, 'Total', 'మొత్తం')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {items.map((item, idx) => {
                const matchedProd = products.find((p) => p.id === item.productId);
                const imgSrc = item.imageUrl || resolveProductImage(matchedProd, item.productName);
                const itemName = translateCartProductName(item.productName, item.productId, products, language);
                const varLabel = translateVariantLabel(item.variantLabel, language);
                return (
                  <tr key={item.id || idx}>
                    <td className="py-2.5 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 font-sans font-medium text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={imgSrc}
                          alt={itemName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fallback = getDefaultProductImage(item.productName);
                            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                          }}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0"
                        />
                        <div>
                          <div>
                            {itemName}
                            {varLabel ? <span className="text-slate-500"> ({varLabel})</span> : null}
                          </div>
                          {item.productCode && (
                            <div className="text-[10px] font-mono text-slate-400">{item.productCode}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.unitPrice.toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums">{item.discount.toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {item.taxRate > 0 ? `${item.taxRate}% (${item.taxAmount.toFixed(2)})` : '0.00'}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{item.lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Conditional Payment QR Scanner if Due > 0, else AMOUNT PAID */}
        <div className="flex flex-wrap items-start justify-between gap-6 pt-4 border-t border-slate-200">
          <div className="flex-1 min-w-[240px]">
            {isDue ? (
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 space-y-3">
                <div className="flex items-center gap-3">
                  {qrDataUrl && settings?.showQrCode !== false && (
                    <img
                      src={qrDataUrl}
                      alt={tr(language, 'UPI Payment QR', 'యూపీఐ చెల్లింపు క్యూఆర్')}
                      className="w-24 h-24 object-contain bg-white rounded-lg p-1 border border-amber-200"
                    />
                  )}
                  <div className="text-xs">
                    <div className="font-bold text-amber-900">
                      {tr(language, 'Due Balance:', 'బాకీ మొత్తం:')} {formatCurrency(bill.pendingBalance)}
                    </div>
                    <div className="text-amber-800 mt-0.5">
                      {tr(language, 'Scan QR with PhonePe / GPay / Any UPI', 'ఫోన్‌పే / జీపే / ఏదైనా యూపీఐతో క్యూఆర్ స్కాన్ చేయండి')}
                    </div>
                    {upiId && <div className="font-mono text-slate-700 mt-1">{upiId}</div>}
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#13326b]"
                    >
                      {tr(language, 'Pay Any UPI App', 'ఏదైనా యూపీఐ యాప్')}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="inline-flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-emerald-800">
                    {tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')}
                  </div>
                  <div className="text-xs text-emerald-700 font-mono">
                    {formatCurrency(bill.amountPaid)} · {payMethod}
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">
                    {tr(language, 'Settled in full · No due remaining', 'పూర్తిగా చెల్లించబడింది · బాకీ లేదు')}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full sm:w-64 space-y-2 text-xs font-mono">
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">{tr(language, 'Subtotal', 'ఉప మొత్తం')}</span>
              <span className="tabular-nums">{formatCurrency(bill.subtotal)}</span>
            </div>
            {bill.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span className="font-sans">{tr(language, 'Discount', 'తగ్గింపు')}</span>
                <span className="tabular-nums">-{formatCurrency(bill.discountAmount)}</span>
              </div>
            )}
            {bill.totalTax > 0 && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span className="font-sans">{tr(language, 'Taxable Amount', 'పన్ను వర్తించే మొత్తం')}</span>
                  <span className="tabular-nums">{formatCurrency(bill.taxableAmount)}</span>
                </div>
                {bill.gstType === 'CGST_SGST' ? (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">{tr(language, 'CGST', 'సీజీఎస్టీ')}</span>
                      <span className="tabular-nums">{formatCurrency(bill.cgstAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">{tr(language, 'SGST', 'ఎస్‌జీఎస్టీ')}</span>
                      <span className="tabular-nums">{formatCurrency(bill.sgstAmount || 0)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-slate-600">
                    <span className="font-sans">{tr(language, 'IGST', 'ఐజీఎస్టీ')}</span>
                    <span className="tabular-nums">{formatCurrency(bill.igstAmount || 0)}</span>
                  </div>
                )}
              </>
            )}
            {(bill.labourCharge || 0) > 0 && (
              <div className="flex justify-between text-slate-700">
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
              <div className="flex justify-between text-slate-700">
                <span className="font-sans">{tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}</span>
                <span className="tabular-nums">+{formatCurrency(bill.autoCharge || 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-[#0B1F44] pt-2 border-t border-slate-200">
              <span className="font-sans">{tr(language, 'Grand Total', 'మొత్తం విలువ')}</span>
              <span className="tabular-nums">{formatCurrency(bill.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-semibold">
              <span className="font-sans">{tr(language, 'Amount Paid', 'చెల్లించిన మొత్తం')}</span>
              <span className="tabular-nums">{formatCurrency(bill.amountPaid)}</span>
            </div>
            <div className={`flex justify-between font-semibold ${isDue ? 'text-rose-700' : 'text-slate-500'}`}>
              <span className="font-sans">{tr(language, 'Balance Due', 'బాకీ మొత్తం')}</span>
              <span className="tabular-nums">{formatCurrency(bill.pendingBalance)}</span>
            </div>
          </div>
        </div>

        {/* Scannable Code128 Bill Verification Barcode */}
        <div className="pt-4 border-t border-slate-200 flex flex-col items-center gap-1.5">
          <img
            src={barcodeDataUrl}
            alt={`${tr(language, 'Verification Barcode', 'తనిఖీ బార్‌కోడ్')} ${verificationCode}`}
            className="h-14 w-auto object-contain"
          />
          <div className="text-[11px] text-slate-500">
            {tr(language, 'Verify Code:', 'తనిఖీ కోడ్:')}{' '}
            <span className="font-mono font-semibold text-slate-700">{verificationCode}</span> ·{' '}
            {translateFooterMessage(settings?.footerMessage, language)}
          </div>
          <div className="text-[10px] text-slate-400">
            {getCopyrightNoticeLocalized(business.name, language)}
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
}> = ({ bill, items, business, settings, paperWidth, qrDataUrl, products = [], language = 'en' }) => {
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

  return (
    <div
      className={`print-only-container ${widthClass} bg-white text-black font-mono ${fontSizeClass} p-4 rounded border border-slate-300 shadow-sm leading-snug`}
    >
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
        {business.gstin && (
          <div>
            {tr(language, 'GSTIN:', 'జీఎస్టీఐఎన్:')} {business.gstin}
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
        {bill.totalTax > 0 && (
          <div className="flex justify-between">
            <span>
              {tr(language, 'Tax', 'పన్ను')} ({translateGstType(bill.gstType, language)})
            </span>
            <span>{bill.totalTax.toFixed(2)}</span>
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

      <div className="py-2 text-center border-b border-dashed border-slate-400">
        <img
          src={barcodeDataUrl}
          alt={`${tr(language, 'Verification Barcode', 'తనిఖీ బార్‌కోడ్')} ${verificationCode}`}
          className="h-11 mx-auto object-contain"
        />
      </div>

      <div className="pt-2 text-center text-[10px]">
        {translateFooterMessage(settings?.footerMessage, language)}
      </div>
    </div>
  );
};

