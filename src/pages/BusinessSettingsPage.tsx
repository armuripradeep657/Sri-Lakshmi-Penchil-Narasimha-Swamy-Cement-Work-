import React, { useEffect, useState } from 'react';
import {
  Building2,
  Clock,
  Download,
  Globe,
  MessageCircle,
  Package,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency } from '../lib/upiAndExport';
import { resolveBusinessLogoUrl } from '../lib/seedData';
import { PWAInstallButton } from '../components/PWAInstallButton';
import {
  formatAppDate,
  tr,
  translateCategory,
  translateCustomerName,
  translateItemsSummary,
  translateProductName,
  translateUnit,
} from '../lib/i18n';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export const BusinessSettingsPage: React.FC = () => {
  const {
    business,
    businessSettings,
    products,
    removedProducts,
    customers,
    bills,
    removedBills,
    payments,
    categories,
    saveBusinessProfile,
    saveBusinessSettings,
    restoreDeletedBillAtomic,
    permanentlyDeleteBillAtomic,
    restoreDeletedProduct,
    permanentlyDeleteProduct,
  } = useBillingData();
  const { isAdmin, language, toggleLanguage } = useAuth();

  // Business Profile State
  const [name, setName] = useState(business?.name || '');
  const [proprietor, setProprietor] = useState(business?.proprietor || '');
  const [phone, setPhone] = useState(business?.phone || '');
  const [address, setAddress] = useState(business?.address || '');
  const [billPrefix, setBillPrefix] = useState(business?.billPrefix || 'SLP');
  const [nextBillNumber, setNextBillNumber] = useState<number>(business?.nextBillNumber ?? 1001);
  const [logoUrl, setLogoUrl] = useState(business?.logoUrl || '');

  // Receipt, Printer & Messaging State
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(businessSettings?.paperWidth || '80mm');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>(businessSettings?.fontSize || 'md');
  const [showLogo, setShowLogo] = useState(businessSettings?.showLogo ?? true);
  const [showThermalLogo, setShowThermalLogo] = useState(
    businessSettings?.showThermalLogo ?? businessSettings?.showLogo ?? true
  );
  const [showQrCode, setShowQrCode] = useState(businessSettings?.showQrCode ?? true);
  const [footerMessage, setFooterMessage] = useState(businessSettings?.footerMessage || '');
  const [invoiceNotes, setInvoiceNotes] = useState(businessSettings?.invoiceNotes || '');
  const [autoWhatsAppThankYou, setAutoWhatsAppThankYou] = useState(
    businessSettings?.autoWhatsAppThankYou ?? true
  );
  const [togglingAutoWa, setTogglingAutoWa] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<string | null>(null);
  const [recoveryTab, setRecoveryTab] = useState<'bills' | 'products'>('bills');
  const [recoveryBusyId, setRecoveryBusyId] = useState<string | null>(null);
  const [confirmPermanentId, setConfirmPermanentId] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (business) {
      setName(business.name || '');
      setProprietor(business.proprietor || '');
      setPhone(business.phone || '');
      setAddress(business.address || '');
      setBillPrefix(business.billPrefix || 'SLP');
      setNextBillNumber(business.nextBillNumber ?? 1001);
      setLogoUrl(business.logoUrl || '');
    }
  }, [business]);

  useEffect(() => {
    if (businessSettings) {
      setPaperWidth(businessSettings.paperWidth || '80mm');
      setFontSize(businessSettings.fontSize || 'md');
      setShowLogo(businessSettings.showLogo ?? true);
      setShowThermalLogo(businessSettings.showThermalLogo ?? businessSettings.showLogo ?? true);
      setShowQrCode(businessSettings.showQrCode ?? true);
      setFooterMessage(businessSettings.footerMessage || '');
      setInvoiceNotes(businessSettings.invoiceNotes || '');
      setAutoWhatsAppThankYou(businessSettings.autoWhatsAppThankYou ?? true);
    }
  }, [businessSettings]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 350 * 1024) {
      setError(tr(language, 'Logo image must be under 350 KB.', 'లోగో చిత్రం 350 కేబీ కంటే తక్కువగా ఉండాలి.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setLogoUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError(
        tr(
          language,
          'Only administrators can modify central business settings.',
          'వ్యాపార సెట్టింగ్స్‌ను అడ్మిన్ మాత్రమే మార్చగలరు.'
        )
      );
      return;
    }
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await saveBusinessProfile({
        name: name.trim(),
        proprietor: proprietor.trim(),
        phone: phone.trim(),
        address: address.trim(),
        gstin: '',
        taxEnabled: false,
        defaultTaxRate: 0,
        billPrefix: billPrefix.trim().toUpperCase() || 'SLP',
        nextBillNumber: Number(nextBillNumber || 1001),
        logoUrl: logoUrl.trim(),
      });
      await saveBusinessSettings({
        paperWidth,
        fontSize,
        showLogo,
        showThermalLogo,
        showQrCode,
        footerMessage: footerMessage.trim(),
        invoiceNotes: invoiceNotes.trim(),
        autoWhatsAppThankYou,
      });
      setFeedback(
        tr(
          language,
          'All business settings saved and synchronized across every terminal.',
          'అన్ని వ్యాపార సెట్టింగ్స్ సేవ్ చేయబడి, అన్ని పరికరాల్లో సింక్ చేయబడ్డాయి.'
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr(language, 'Failed to save settings.', 'సెట్టింగ్స్ సేవ్ చేయడం విఫలమైంది.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExportCloudBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      business,
      businessSettings,
      categories,
      products,
      customers,
      bills,
      payments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slp-billing-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInspectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setRestorePreview(
        tr(
          language,
          `Verified backup from ${parsed.exportedAt || 'unknown date'}: ${parsed.products?.length || 0} products, ${parsed.customers?.length || 0} customers, ${parsed.bills?.length || 0} bills, ${parsed.payments?.length || 0} payments.`,
          `ధృవీకరించబడిన బ్యాకప్ (${parsed.exportedAt || 'తెలియని తేదీ'}): ${parsed.products?.length || 0} ఉత్పత్తులు, ${parsed.customers?.length || 0} కస్టమర్లు, ${parsed.bills?.length || 0} బిల్లులు, ${parsed.payments?.length || 0} చెల్లింపులు.`
        )
      );
    } catch {
      setRestorePreview(tr(language, 'Invalid JSON backup archive.', 'చెల్లని బ్యాకప్ ఫైల్.'));
    }
  };

  const computeDaysLeft = (deletedAtMs?: number, deleteExpiresAtMs?: number) => {
    const expiry =
      Number(deleteExpiresAtMs || 0) ||
      (Number(deletedAtMs || 0) > 0 ? Number(deletedAtMs) + TEN_DAYS_MS : Date.now() + TEN_DAYS_MS);
    const remaining = Math.max(0, expiry - Date.now());
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  };

  return (
    <div className="space-y-6">
    <form onSubmit={handleSaveAll} className="space-y-6">
      {feedback && (
        <div className="rounded-xl border border-[#C5E8D1] dark:border-emerald-900/50 bg-[#E7F6EC] dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-[#15803D] dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-[#F5C6C0] dark:border-rose-900/50 bg-[#FCE8E6] dark:bg-rose-950/30 px-4 py-2.5 text-xs text-[#C23B2B] dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Mobile App Installation (Android & iOS) */}
      <PWAInstallButton variant="card" />

      {/* Language Preference */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[#0A2240] dark:text-white">
            {tr(language, 'Catalog & App Language', 'యాప్ & కేటలాగ్ భాష')}
          </h3>
          <p className="text-xs text-[#6D665E]">
            {tr(
              language,
              'Switch product names and the entire app between English and Telugu.',
              'ఉత్పత్తుల పేర్లు మరియు మొత్తం యాప్‌ను తెలుగు లేదా ఇంగ్లీష్ లోకి మార్చుకోండి.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#DFD7CC] bg-[#F6F1EA] text-[#0A2240] text-xs font-semibold hover:bg-[#EFE8DF]"
          >
            <Globe className="w-4 h-4 text-[#9A4307]" />
            {language === 'te' ? 'యాప్ భాష: తెలుగు' : 'Catalog Language: English'}
          </button>
        </div>
      </div>

      {/* Business Profile */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EFEAE2] dark:border-slate-800 pb-3">
          <Building2 className="w-4 h-4 text-[#9A4307]" />
          <h3 className="text-sm font-bold text-[#0A2240] dark:text-white">
            {tr(language, 'Business Identity & Invoice Numbering', 'వ్యాపార వివరాలు & బిల్ నంబర్లు')}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <img
            src={resolveBusinessLogoUrl(logoUrl)}
            alt={tr(language, 'Business Emblem', 'వ్యాపార లోగో')}
            className="w-16 h-16 rounded-xl object-contain bg-white p-0.5 border border-[#E5DDD3] dark:border-slate-700"
          />
          <div className="space-y-1 text-xs">
            <div className="font-medium text-[#2D3138] dark:text-slate-300">
              {tr(language, 'Business Seal / Logo', 'వ్యాపార సీల్ / లోగో')}
            </div>
            {isAdmin && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 cursor-pointer hover:bg-[#FAF8F5] dark:hover:bg-slate-800">
                <Upload className="w-3.5 h-3.5" /> {tr(language, 'Upload Logo Image', 'లోగో చిత్రం అప్‌లోడ్ చేయండి')}
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Business Name *', 'వ్యాపార పేరు *')}
            </label>
            <input
              required
              disabled={!isAdmin}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Proprietor Name', 'యజమాని పేరు')}
            </label>
            <input
              disabled={!isAdmin}
              value={proprietor}
              onChange={(e) => setProprietor(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Phone Number', 'ఫోన్ నంబర్')}
            </label>
            <input
              disabled={!isAdmin}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Yard / Shop Address', 'యార్డ్ / షాప్ చిరునామా')}
            </label>
            <input
              disabled={!isAdmin}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Invoice Prefix', 'ఇన్వాయిస్ ప్రిఫిక్స్')}
            </label>
            <input
              disabled={!isAdmin}
              value={billPrefix}
              onChange={(e) => setBillPrefix(e.target.value)}
              className="w-full px-3 py-2 font-mono uppercase rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Next Bill Number', 'తదుపరి బిల్ నంబర్')}
            </label>
            <input
              type="number"
              disabled={!isAdmin}
              value={nextBillNumber}
              onChange={(e) => setNextBillNumber(Number(e.target.value))}
              className="w-full px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
        </div>
      </div>

      {/* Thermal Printer & Receipt Defaults */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EFEAE2] dark:border-slate-800 pb-3">
          <Printer className="w-4 h-4 text-[#9A4307]" />
          <h3 className="text-sm font-bold text-[#0A2240] dark:text-white">
            {tr(language, 'Thermal Printer & Receipt Customization', 'థర్మల్ ప్రింటర్ & రసీదు సెట్టింగ్స్')}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Thermal Paper Width', 'థర్మల్ పేపర్ వెడల్పు')}
            </label>
            <select
              disabled={!isAdmin}
              value={paperWidth}
              onChange={(e) => setPaperWidth(e.target.value as '58mm' | '80mm')}
              className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            >
              <option value="58mm">{tr(language, '58mm Compact Thermal', '58 మి.మీ. కాంపాక్ట్ థర్మల్')}</option>
              <option value="80mm">{tr(language, '80mm Standard POS Thermal', '80 మి.మీ. స్టాండర్డ్ థర్మల్')}</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Receipt Font Density', 'రసీదు అక్షరాల పరిమాణం')}
            </label>
            <select
              disabled={!isAdmin}
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as 'sm' | 'md' | 'lg')}
              className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            >
              <option value="sm">{tr(language, 'Compact', 'చిన్నది')}</option>
              <option value="md">{tr(language, 'Standard', 'మధ్యస్థం')}</option>
              <option value="lg">{tr(language, 'Large Print', 'పెద్దది')}</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'Receipt Thank-You Footer', 'రసీదు ధన్యవాద సందేశం')}
            </label>
            <input
              disabled={!isAdmin}
              value={footerMessage}
              onChange={(e) => setFooterMessage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
              {tr(language, 'A4 Invoice Terms / Notes', 'ఏ4 ఇన్వాయిస్ నియమాలు / గమనికలు')}
            </label>
            <input
              disabled={!isAdmin}
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <div className="space-y-2.5 pt-2 md:col-span-2">
            <label className="flex items-start justify-between gap-3 rounded-xl border border-[#E5DDD3] dark:border-slate-800 bg-[#F6F1EA] dark:bg-slate-950 p-3 cursor-pointer">
              <div>
                <div className="font-semibold text-[#0A2240] dark:text-white">
                  {tr(language, 'Print Business Logo on Thermal Receipts', 'థర్మల్ రసీదులపై వ్యాపార లోగో ముద్రించండి')}
                </div>
                <div className="text-[11px] text-[#6D665E] dark:text-slate-400 mt-0.5">
                  {tr(
                    language,
                    'Turn off to skip logo bitmap printing on 58mm / 80mm thermal receipts and optimize printer memory & print speed.',
                    '58 మి.మీ. / 80 మి.మీ. థర్మల్ రసీదులపై వేగంగా ప్రింట్ కావడానికి లోగోను ఆఫ్ చేయవచ్చు.'
                  )}
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={showThermalLogo}
                onChange={(e) => setShowThermalLogo(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#0A2240] shrink-0"
              />
            </label>
            <div className="flex flex-wrap gap-5 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" disabled={!isAdmin} checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} />
                {tr(language, 'Print Business Logo on A4 Invoices', 'ఏ4 ఇన్వాయిస్‌లపై వ్యాపార లోగో ముద్రించు')}
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={showQrCode}
                  onChange={(e) => setShowQrCode(e.target.checked)}
                />
                {tr(language, 'Print UPI QR Code on Invoices & Receipts', 'ఇన్వాయిస్‌లు & రసీదులపై యూపీఐ క్యూఆర్ కోడ్ ముద్రించు')}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Auto-Messaging */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EFEAE2] dark:border-slate-800 pb-3">
          <MessageCircle className="w-4 h-4 text-[#16A34A]" />
          <h3 className="text-sm font-bold text-[#0A2240] dark:text-white">
            {tr(language, 'WhatsApp Customer Messaging', 'వాట్సాప్ కస్టమర్ మెసేజింగ్')}
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-[#C5E8D1]/80 dark:border-emerald-900/60 bg-[#E7F6EC]/50 dark:bg-emerald-950/20 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-[#0A2240] dark:text-white">
                {tr(language, 'Auto-Send WhatsApp Thank You', 'ఆటో-సెండ్ వాట్సాప్ ధన్యవాదాలు')}
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  autoWhatsAppThankYou
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                    : 'bg-slate-200 text-[#2D3138] dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {autoWhatsAppThankYou
                  ? tr(language, 'Enabled', 'ఆన్')
                  : tr(language, 'Disabled', 'ఆఫ్')}
              </span>
            </div>
            <p className="text-xs text-[#6D665E] dark:text-slate-300">
              {tr(
                language,
                'When enabled, saving a new invoice automatically triggers a preview of the Thank You message (with your business name & bill link) so you can confirm sending via WhatsApp.',
                'ఇది ఆన్ చేసినప్పుడు, కొత్త ఇన్వాయిస్ సేవ్ చేసిన వెంటనే మీ వ్యాపార పేరు & బిల్ లింక్‌తో ధన్యవాదాలు మెసేజ్ ప్రివ్యూ స్వయంచాలకంగా కనిపిస్తుంది మరియు వాట్సాప్ ద్వారా పంపడానికి నిర్ధారించవచ్చు.'
              )}
            </p>
            {!isAdmin && (
              <p className="text-[11px] text-[#9A4307] dark:text-amber-300 font-medium">
                {tr(language, 'Only admins can change this setting.', 'ఈ సెట్టింగ్‌ను అడ్మిన్ మాత్రమే మార్చగలరు.')}
              </p>
            )}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoWhatsAppThankYou}
            aria-label={tr(language, 'Auto-Send WhatsApp Thank You', 'ఆటో-సెండ్ వాట్సాప్ ధన్యవాదాలు')}
            disabled={!isAdmin || togglingAutoWa}
            onClick={async () => {
              if (!isAdmin) return;
              const nextVal = !autoWhatsAppThankYou;
              setAutoWhatsAppThankYou(nextVal);
              setTogglingAutoWa(true);
              setError(null);
              try {
                await saveBusinessSettings({ autoWhatsAppThankYou: nextVal });
                setFeedback(
                  nextVal
                    ? tr(
                        language,
                        'Auto-Send WhatsApp Thank You enabled across all devices.',
                        'అన్ని పరికరాల్లో ఆటో-సెండ్ వాట్సాప్ ధన్యవాదాలు ఆన్ చేయబడింది.'
                      )
                    : tr(
                        language,
                        'Auto-Send WhatsApp Thank You disabled across all devices.',
                        'అన్ని పరికరాల్లో ఆటో-సెండ్ వాట్సాప్ ధన్యవాదాలు ఆఫ్ చేయబడింది.'
                      )
                );
              } catch (err) {
                setAutoWhatsAppThankYou(!nextVal);
                setError(
                  err instanceof Error
                    ? err.message
                    : tr(language, 'Failed to update WhatsApp setting.', 'వాట్సాప్ సెట్టింగ్ మార్చడం విఫలమైంది.')
                );
              } finally {
                setTogglingAutoWa(false);
              }
            }}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#16A34A] disabled:opacity-50 ${
              autoWhatsAppThankYou
                ? 'bg-[#16A34A] border-[#15803D]'
                : 'bg-slate-300 dark:bg-slate-700 border-slate-400/50 dark:border-slate-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoWhatsAppThankYou ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#0A2240] dark:text-white">
          {tr(language, 'Cloud Data Backup & Verification', 'క్లౌడ్ డేటా బ్యాకప్ & ధృవీకరణ')}
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handleExportCloudBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 font-semibold hover:bg-[#FAF8F5] dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" /> {tr(language, 'Export Full JSON Cloud Backup', 'పూర్తి క్లౌడ్ బ్యాకప్ డౌన్‌లోడ్ చేయి')}
          </button>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 font-semibold cursor-pointer hover:bg-[#FAF8F5] dark:hover:bg-slate-800">
            <Upload className="w-3.5 h-3.5" /> {tr(language, 'Verify Backup File', 'బ్యాకప్ ఫైల్ తనిఖీ చేయి')}
            <input type="file" accept="application/json" onChange={handleInspectBackupFile} className="hidden" />
          </label>
        </div>
        {restorePreview && <p className="text-xs text-[#9A4307]">{restorePreview}</p>}
      </div>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#0A2240] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />{' '}
            {saving
              ? tr(language, 'Saving Settings...', 'సెట్టింగ్స్ సేవ్ అవుతున్నాయి...')
              : tr(language, 'Save & Sync All Settings', 'అన్ని సెట్టింగ్స్ సేవ్ & సింక్ చేయి')}
          </button>
        </div>
      )}
    </form>

      {/* Removed Bills & Products (10-Day Recovery Bin) */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEAE2] dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A2240] dark:text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-[#C23B2B]" />
              {tr(language, 'Removed Bills & Products', 'తొలగించిన బిల్లులు & ఉత్పత్తులు')}
            </h3>
            <p className="text-xs text-[#6D665E] mt-0.5">
              {tr(
                language,
                'Deleted bills and products stay here for 10 days so you can restore them anytime, then auto-delete permanently.',
                'తొలగించిన బిల్లులు మరియు ఉత్పత్తులు 10 రోజుల పాటు ఇక్కడ ఉంటాయి. మీరు ఎప్పుడైనా పునరుద్ధరించవచ్చు, ఆ తర్వాత శాశ్వతంగా తొలగించబడతాయి.'
              )}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FDF3DF] border border-[#F0D9B5] text-[#9A4307] text-[11px] font-bold">
            <Clock className="w-3.5 h-3.5" /> {tr(language, '10-Day Auto-Purge', '10-రోజుల ఆటో తొలగింపు')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F6F1EA] dark:bg-slate-950 border border-[#E5DDD3] dark:border-slate-800 max-w-sm">
          <button
            type="button"
            onClick={() => {
              setRecoveryTab('bills');
              setConfirmPermanentId(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              recoveryTab === 'bills'
                ? 'bg-[#0A2240] text-white shadow-sm'
                : 'text-[#0A2240] dark:text-slate-300 hover:bg-white'
            }`}
          >
            <ReceiptText className="w-3.5 h-3.5" />
            {tr(language, 'Removed Bills', 'తొలగించిన బిల్లులు')} ({removedBills.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setRecoveryTab('products');
              setConfirmPermanentId(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              recoveryTab === 'products'
                ? 'bg-[#0A2240] text-white shadow-sm'
                : 'text-[#0A2240] dark:text-slate-300 hover:bg-white'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            {tr(language, 'Removed Products', 'తొలగించిన ఉత్పత్తులు')} ({removedProducts.length})
          </button>
        </div>

        {recoveryNotice && (
          <div
            className={`rounded-xl px-3.5 py-2.5 text-xs font-medium ${
              recoveryNotice.type === 'ok'
                ? 'bg-[#E7F6EC] border border-[#C5E8D1] text-[#15803D]'
                : 'bg-[#FCE8E6] border border-[#F5C6C0] text-[#C23B2B]'
            }`}
          >
            {recoveryNotice.text}
          </div>
        )}

        {recoveryTab === 'bills' ? (
          removedBills.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8A8279]">
              {tr(language, 'No removed bills in the 10-day recovery bin.', '10-రోజుల రికవరీ బిన్‌లో తొలగించిన బిల్లులు ఏవీ లేవు.')}
            </div>
          ) : (
            <div className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
              {removedBills.map((bill) => {
                const daysLeft = computeDaysLeft(bill.deletedAtMs, bill.deleteExpiresAtMs);
                const deletedDate = bill.deletedAtMs
                  ? formatAppDate(new Date(bill.deletedAtMs), language)
                  : formatAppDate(formatTimestamp(bill.updatedAt), language);
                const isBusy = recoveryBusyId === bill.id;
                const isConfirming = confirmPermanentId === bill.id;
                return (
                  <div
                    key={bill.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs text-[#0A2240] dark:text-white">
                          {bill.billNumber}
                        </span>
                        <span className="font-mono font-bold text-xs text-[#9A4307]">
                          {formatCurrency(bill.grandTotal)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#FDF3DF] border border-[#F0D9B5] text-[#9A4307] text-[10px] font-bold">
                          {daysLeft}{' '}
                          {language === 'te'
                            ? daysLeft === 1
                              ? 'రోజు మిగిలి ఉంది'
                              : 'రోజులు మిగిలి ఉన్నాయి'
                            : `${daysLeft === 1 ? 'day' : 'days'} left`}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-[#2D3138] dark:text-slate-300 truncate">
                        {translateCustomerName(bill.customerName, language)}{' '}
                        {bill.customerMobile ? `· ${bill.customerMobile}` : ''}
                      </div>
                      <div className="text-[11px] text-[#6D665E]">
                        {tr(language, 'Removed on', 'తొలగించిన తేదీ')} {deletedDate}
                        {bill.deletedByName ? ` ${tr(language, 'by', '·')} ${bill.deletedByName}` : ''} ·{' '}
                        {bill.itemsSummary
                          ? translateItemsSummary(bill.itemsSummary, products, language)
                          : `${bill.itemCount} ${tr(language, 'items', 'వస్తువులు')}`}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={async () => {
                            setRecoveryBusyId(bill.id);
                            setRecoveryNotice(null);
                            try {
                              await restoreDeletedBillAtomic(bill.id);
                              setRecoveryNotice({
                                type: 'ok',
                                text: tr(
                                  language,
                                  `Restored bill ${bill.billNumber} back to Bill History.`,
                                  `బిల్ ${bill.billNumber} తిరిగి బిల్ చరిత్రలోకి పునరుద్ధరించబడింది.`
                                ),
                              });
                            } catch (err) {
                              setRecoveryNotice({
                                type: 'err',
                                text:
                                  err instanceof Error
                                    ? err.message
                                    : tr(language, 'Failed to restore bill.', 'బిల్ పునరుద్ధరణ విఫలమైంది.'),
                              });
                            } finally {
                              setRecoveryBusyId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {tr(language, 'Restore', 'పునరుద్ధరించు')}
                        </button>
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setRecoveryBusyId(bill.id);
                                setRecoveryNotice(null);
                                try {
                                  await permanentlyDeleteBillAtomic(bill.id);
                                  setConfirmPermanentId(null);
                                  setRecoveryNotice({
                                    type: 'ok',
                                    text: tr(
                                      language,
                                      `Permanently removed bill ${bill.billNumber}.`,
                                      `బిల్ ${bill.billNumber} శాశ్వతంగా తొలగించబడింది.`
                                    ),
                                  });
                                } catch (err) {
                                  setRecoveryNotice({
                                    type: 'err',
                                    text:
                                      err instanceof Error
                                        ? err.message
                                        : tr(
                                            language,
                                            'Failed to delete bill permanently.',
                                            'బిల్ శాశ్వతంగా తొలగించడం విఫలమైంది.'
                                          ),
                                  });
                                } finally {
                                  setRecoveryBusyId(null);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#C23B2B] hover:bg-[#A32E20] text-white text-xs font-bold disabled:opacity-50"
                            >
                              {tr(language, 'Confirm Delete', 'తొలగింపు నిర్ధారించు')}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmPermanentId(null)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#E5DDD3] text-xs font-medium text-[#6D665E]"
                            >
                              {tr(language, 'Cancel', 'రద్దు')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmPermanentId(bill.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#F5C6C0] text-[#C23B2B] hover:bg-[#FCE8E6] text-xs font-semibold disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {tr(language, 'Delete Permanently', 'శాశ్వతంగా తొలగించు')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : removedProducts.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8A8279]">
            {tr(
              language,
              'No removed products in the 10-day recovery bin.',
              '10-రోజుల రికవరీ బిన్‌లో తొలగించిన ఉత్పత్తులు ఏవీ లేవు.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
            {removedProducts.map((product) => {
              const daysLeft = computeDaysLeft(product.deletedAtMs, product.deleteExpiresAtMs);
              const deletedDate = product.deletedAtMs
                ? formatAppDate(new Date(product.deletedAtMs), language)
                : formatAppDate(formatTimestamp(product.updatedAt), language);
              const isBusy = recoveryBusyId === product.id;
              const isConfirming = confirmPermanentId === product.id;
              const dispProdName = translateProductName(product, language);
              return (
                <div
                  key={product.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-xs text-[#0A2240] dark:text-white">
                        {dispProdName}
                      </span>
                      <span className="font-mono text-xs text-[#9A4307] font-bold">
                        {formatCurrency(product.sellingPrice)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#FDF3DF] border border-[#F0D9B5] text-[#9A4307] text-[10px] font-bold">
                        {daysLeft}{' '}
                        {language === 'te'
                          ? daysLeft === 1
                            ? 'రోజు మిగిలి ఉంది'
                            : 'రోజులు మిగిలి ఉన్నాయి'
                          : `${daysLeft === 1 ? 'day' : 'days'} left`}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6D665E]">
                      {translateCategory(product.category, categories, language)} ·{' '}
                      <span className="font-mono">{product.productCode}</span> ·{' '}
                      {tr(language, 'Stock:', 'స్టాక్:')} {product.stock} {translateUnit(product.unit, language)}
                    </div>
                    <div className="text-[11px] text-[#6D665E]">
                      {tr(language, 'Removed on', 'తొలగించిన తేదీ')} {deletedDate}
                      {product.deletedByName ? ` ${tr(language, 'by', '·')} ${product.deletedByName}` : ''}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setRecoveryBusyId(product.id);
                          setRecoveryNotice(null);
                          try {
                            await restoreDeletedProduct(product.id);
                            setRecoveryNotice({
                              type: 'ok',
                              text: tr(
                                language,
                                `Restored product "${product.name}" back to Products.`,
                                `ఉత్పత్తి "${dispProdName}" తిరిగి ఉత్పత్తులలోకి పునరుద్ధరించబడింది.`
                              ),
                            });
                          } catch (err) {
                            setRecoveryNotice({
                              type: 'err',
                              text:
                                err instanceof Error
                                  ? err.message
                                  : tr(language, 'Failed to restore product.', 'ఉత్పత్తి పునరుద్ధరణ విఫలమైంది.'),
                            });
                          } finally {
                            setRecoveryBusyId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {tr(language, 'Restore', 'పునరుద్ధరించు')}
                      </button>
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setRecoveryBusyId(product.id);
                              setRecoveryNotice(null);
                              try {
                                await permanentlyDeleteProduct(product.id);
                                setConfirmPermanentId(null);
                                setRecoveryNotice({
                                  type: 'ok',
                                  text: tr(
                                    language,
                                    `Permanently removed product "${product.name}".`,
                                    `ఉత్పత్తి "${dispProdName}" శాశ్వతంగా తొలగించబడింది.`
                                  ),
                                });
                              } catch (err) {
                                setRecoveryNotice({
                                  type: 'err',
                                  text:
                                    err instanceof Error
                                      ? err.message
                                      : tr(
                                          language,
                                          'Failed to delete product permanently.',
                                          'ఉత్పత్తిని శాశ్వతంగా తొలగించడం విఫలమైంది.'
                                        ),
                                });
                              } finally {
                                setRecoveryBusyId(null);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#C23B2B] hover:bg-[#A32E20] text-white text-xs font-bold disabled:opacity-50"
                          >
                            {tr(language, 'Confirm Delete', 'తొలగింపు నిర్ధారించు')}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmPermanentId(null)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E5DDD3] text-xs font-medium text-[#6D665E]"
                          >
                            {tr(language, 'Cancel', 'రద్దు')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmPermanentId(product.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#F5C6C0] text-[#C23B2B] hover:bg-[#FCE8E6] text-xs font-semibold disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {tr(language, 'Delete Permanently', 'శాశ్వతంగా తొలగించు')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
