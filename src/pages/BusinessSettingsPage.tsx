import React, { useEffect, useState } from 'react';
import {
  Building2,
  Download,
  Globe,
  MessageSquare,
  Printer,
  Save,
  Upload,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from '../components/PWAInstallButton';

export const BusinessSettingsPage: React.FC = () => {
  const {
    business,
    businessSettings,
    products,
    customers,
    bills,
    payments,
    categories,
    saveBusinessProfile,
    saveBusinessSettings,
  } = useBillingData();
  const { isAdmin, language, toggleLanguage } = useAuth();

  // Business Profile State
  const [name, setName] = useState(business?.name || '');
  const [proprietor, setProprietor] = useState(business?.proprietor || '');
  const [phone, setPhone] = useState(business?.phone || '');
  const [address, setAddress] = useState(business?.address || '');
  const [gstin, setGstin] = useState(business?.gstin || '');
  const [taxEnabled, setTaxEnabled] = useState(Boolean(business?.taxEnabled));
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(business?.defaultTaxRate ?? 18);
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
  const [whatsappEnabled, setWhatsappEnabled] = useState(businessSettings?.whatsappEnabled ?? true);
  const [smsEnabled, setSmsEnabled] = useState(businessSettings?.smsEnabled ?? true);
  const [smsSenderId, setSmsSenderId] = useState(businessSettings?.smsSenderId || 'SLPBIL');
  const [smsDltTemplateId, setSmsDltTemplateId] = useState(businessSettings?.smsDltTemplateId || '');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<string | null>(null);

  useEffect(() => {
    if (business) {
      setName(business.name || '');
      setProprietor(business.proprietor || '');
      setPhone(business.phone || '');
      setAddress(business.address || '');
      setGstin(business.gstin || '');
      setTaxEnabled(Boolean(business.taxEnabled));
      setDefaultTaxRate(business.defaultTaxRate ?? 18);
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
      setWhatsappEnabled(businessSettings.whatsappEnabled ?? true);
      setSmsEnabled(businessSettings.smsEnabled ?? true);
      setSmsSenderId(businessSettings.smsSenderId || 'SLPBIL');
      setSmsDltTemplateId(businessSettings.smsDltTemplateId || '');
    }
  }, [businessSettings]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 350 * 1024) {
      setError('Logo image must be under 350 KB.');
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
      setError('Only administrators can modify central business settings.');
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
        gstin: gstin.trim().toUpperCase(),
        taxEnabled,
        defaultTaxRate: Number(defaultTaxRate || 0),
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
        whatsappEnabled,
        smsEnabled,
        smsSenderId: smsSenderId.trim().toUpperCase(),
        smsDltTemplateId: smsDltTemplateId.trim(),
      });
      setFeedback('All business settings saved and synchronized across every terminal.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
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
        `Verified backup from ${parsed.exportedAt || 'unknown date'}: ${parsed.products?.length || 0} products, ${parsed.customers?.length || 0} customers, ${parsed.bills?.length || 0} bills, ${parsed.payments?.length || 0} payments.`
      );
    } catch {
      setRestorePreview('Invalid JSON backup archive.');
    }
  };

  return (
    <form onSubmit={handleSaveAll} className="space-y-6">
      {feedback && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Mobile App Installation (Android & iOS) */}
      <PWAInstallButton variant="card" />

      {/* Language Preference */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Catalog Language</h3>
          <p className="text-xs text-slate-500">Switch product names between English and Telugu.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50/70 text-[#0B1F44] text-xs font-semibold hover:bg-blue-100"
          >
            <Globe className="w-4 h-4 text-[#1D4ED8]" />
            Catalog Language: {language === 'te' ? 'తెలుగు (Telugu)' : 'English'}
          </button>
        </div>
      </div>

      {/* Business Profile & GST */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Building2 className="w-4 h-4 text-[#1D4ED8]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Business Identity, GST & Invoice Numbering
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Business Emblem"
              className="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
          )}
          <div className="space-y-1 text-xs">
            <div className="font-medium text-slate-700 dark:text-slate-300">Business Seal / Logo</div>
            {isAdmin && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Upload className="w-3.5 h-3.5" /> Upload Logo Image
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Business Name *</label>
            <input
              required
              disabled={!isAdmin}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Proprietor Name</label>
            <input
              disabled={!isAdmin}
              value={proprietor}
              onChange={(e) => setProprietor(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Phone Number</label>
            <input
              disabled={!isAdmin}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">GSTIN (Optional)</label>
            <input
              disabled={!isAdmin}
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="e.g. 37AAAAA0000A1Z5"
              className="w-full px-3 py-2 font-mono uppercase rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Yard / Shop Address</label>
            <input
              disabled={!isAdmin}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Invoice Prefix</label>
            <input
              disabled={!isAdmin}
              value={billPrefix}
              onChange={(e) => setBillPrefix(e.target.value)}
              className="w-full px-3 py-2 font-mono uppercase rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Next Bill Number</label>
            <input
              type="number"
              disabled={!isAdmin}
              value={nextBillNumber}
              onChange={(e) => setNextBillNumber(Number(e.target.value))}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <input
              type="checkbox"
              id="taxEnabled"
              disabled={!isAdmin}
              checked={taxEnabled}
              onChange={(e) => setTaxEnabled(e.target.checked)}
            />
            <label htmlFor="taxEnabled" className="font-medium text-slate-700 dark:text-slate-300">
              Enable GST Tax Calculation by Default
            </label>
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Default GST Rate (%)</label>
            <input
              type="number"
              min={0}
              max={28}
              disabled={!isAdmin}
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(Number(e.target.value))}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
        </div>
      </div>

      {/* Thermal Printer & Receipt Defaults */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Printer className="w-4 h-4 text-[#1D4ED8]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Thermal Printer & Receipt Customization
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Thermal Paper Width</label>
            <select
              disabled={!isAdmin}
              value={paperWidth}
              onChange={(e) => setPaperWidth(e.target.value as '58mm' | '80mm')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="58mm">58mm Compact Thermal</option>
              <option value="80mm">80mm Standard POS Thermal</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Receipt Font Density</label>
            <select
              disabled={!isAdmin}
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as 'sm' | 'md' | 'lg')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="sm">Compact</option>
              <option value="md">Standard</option>
              <option value="lg">Large Print</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Receipt Thank-You Footer</label>
            <input
              disabled={!isAdmin}
              value={footerMessage}
              onChange={(e) => setFooterMessage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">A4 Invoice Terms / Notes</label>
            <input
              disabled={!isAdmin}
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div className="space-y-2.5 pt-2 md:col-span-2">
            <label className="flex items-start justify-between gap-3 rounded-xl border border-blue-100 dark:border-slate-800 bg-blue-50/40 dark:bg-slate-950 p-3 cursor-pointer">
              <div>
                <div className="font-semibold text-[#0B1F44] dark:text-white">
                  Print Business Logo on Thermal Receipts
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Turn off to skip logo bitmap printing on 58mm / 80mm thermal receipts and optimize printer memory &amp; print speed.
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={showThermalLogo}
                onChange={(e) => setShowThermalLogo(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#1D4ED8] shrink-0"
              />
            </label>
            <div className="flex flex-wrap gap-5 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" disabled={!isAdmin} checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} />
                Print Business Logo on A4 Invoices
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={showQrCode}
                  onChange={(e) => setShowQrCode(e.target.checked)}
                />
                Print UPI QR Code on Invoices &amp; Receipts
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Messaging Gateways */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <MessageSquare className="w-4 h-4 text-[#1D4ED8]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            WhatsApp & MSG91 SMS Gateway Settings
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
            />
            Enable WhatsApp Invoice Sharing
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={smsEnabled}
              onChange={(e) => setSmsEnabled(e.target.checked)}
            />
            Enable MSG91 SMS Dispatch
          </label>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">MSG91 Sender ID</label>
            <input
              disabled={!isAdmin}
              value={smsSenderId}
              onChange={(e) => setSmsSenderId(e.target.value)}
              className="w-full px-3 py-2 font-mono uppercase rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">DLT Template / Flow ID</label>
            <input
              disabled={!isAdmin}
              value={smsDltTemplateId}
              onChange={(e) => setSmsDltTemplateId(e.target.value)}
              placeholder="Configured in environment or DLT portal"
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          API credentials (`MSG91_AUTH_KEY`, `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) are read strictly on the backend server from environment secrets and are never exposed in client UI.
        </p>
      </div>

      {/* Backup & Restore */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cloud Data Backup & Verification</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handleExportCloudBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" /> Export Full JSON Cloud Backup
          </button>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            <Upload className="w-3.5 h-3.5" /> Verify Backup File
            <input type="file" accept="application/json" onChange={handleInspectBackupFile} className="hidden" />
          </label>
        </div>
        {restorePreview && <p className="text-xs text-[#1D4ED8]">{restorePreview}</p>}
      </div>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving Settings...' : 'Save & Sync All Settings'}
          </button>
        </div>
      )}
    </form>
  );
};
