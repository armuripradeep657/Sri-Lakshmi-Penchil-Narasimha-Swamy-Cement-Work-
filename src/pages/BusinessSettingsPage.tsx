import React, { useEffect, useState } from 'react';
import {
  Building2,
  Clock,
  Download,
  Globe,
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
          <img
            src={resolveBusinessLogoUrl(logoUrl)}
            alt="Business Emblem"
            className="w-16 h-16 rounded-xl object-contain bg-white p-0.5 border border-slate-200 dark:border-slate-700"
          />
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

      {/* Removed Bills & Products (10-Day Recovery Bin) */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" />
              Removed Bills &amp; Products
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Deleted bills and products stay here for 10 days so you can restore them anytime, then auto-delete permanently.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
            <Clock className="w-3.5 h-3.5" /> 10-Day Auto-Purge
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-blue-50 dark:bg-slate-950 border border-blue-100 dark:border-slate-800 max-w-sm">
          <button
            type="button"
            onClick={() => {
              setRecoveryTab('bills');
              setConfirmPermanentId(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              recoveryTab === 'bills'
                ? 'bg-[#0B1F44] text-white shadow-sm'
                : 'text-[#0B1F44] dark:text-slate-300 hover:bg-white'
            }`}
          >
            <ReceiptText className="w-3.5 h-3.5" />
            Removed Bills ({removedBills.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setRecoveryTab('products');
              setConfirmPermanentId(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              recoveryTab === 'products'
                ? 'bg-[#0B1F44] text-white shadow-sm'
                : 'text-[#0B1F44] dark:text-slate-300 hover:bg-white'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Removed Products ({removedProducts.length})
          </button>
        </div>

        {recoveryNotice && (
          <div
            className={`rounded-xl px-3.5 py-2.5 text-xs font-medium ${
              recoveryNotice.type === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            {recoveryNotice.text}
          </div>
        )}

        {recoveryTab === 'bills' ? (
          removedBills.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No removed bills in the 10-day recovery bin.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {removedBills.map((bill) => {
                const daysLeft = computeDaysLeft(bill.deletedAtMs, bill.deleteExpiresAtMs);
                const deletedDate = bill.deletedAtMs
                  ? new Date(bill.deletedAtMs).toLocaleDateString('en-IN')
                  : formatTimestamp(bill.updatedAt).toLocaleDateString('en-IN');
                const isBusy = recoveryBusyId === bill.id;
                const isConfirming = confirmPermanentId === bill.id;
                return (
                  <div
                    key={bill.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs text-[#0B1F44] dark:text-white">
                          {bill.billNumber}
                        </span>
                        <span className="font-mono font-bold text-xs text-[#1D4ED8]">
                          {formatCurrency(bill.grandTotal)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                          {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {bill.customerName} {bill.customerMobile ? `· ${bill.customerMobile}` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Removed on {deletedDate}
                        {bill.deletedByName ? ` by ${bill.deletedByName}` : ''} ·{' '}
                        {bill.itemsSummary || `${bill.itemCount} items`}
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
                                text: `Restored bill ${bill.billNumber} back to Bill History.`,
                              });
                            } catch (err) {
                              setRecoveryNotice({
                                type: 'err',
                                text: err instanceof Error ? err.message : 'Failed to restore bill.',
                              });
                            } finally {
                              setRecoveryBusyId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore
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
                                    text: `Permanently removed bill ${bill.billNumber}.`,
                                  });
                                } catch (err) {
                                  setRecoveryNotice({
                                    type: 'err',
                                    text:
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to delete bill permanently.',
                                  });
                                } finally {
                                  setRecoveryBusyId(null);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmPermanentId(null)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmPermanentId(bill.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Permanently
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
          <div className="py-8 text-center text-xs text-slate-400">
            No removed products in the 10-day recovery bin.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {removedProducts.map((product) => {
              const daysLeft = computeDaysLeft(product.deletedAtMs, product.deleteExpiresAtMs);
              const deletedDate = product.deletedAtMs
                ? new Date(product.deletedAtMs).toLocaleDateString('en-IN')
                : formatTimestamp(product.updatedAt).toLocaleDateString('en-IN');
              const isBusy = recoveryBusyId === product.id;
              const isConfirming = confirmPermanentId === product.id;
              return (
                <div
                  key={product.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-xs text-[#0B1F44] dark:text-white">
                        {product.name}
                      </span>
                      <span className="font-mono text-xs text-[#1D4ED8] font-bold">
                        {formatCurrency(product.sellingPrice)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                        {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {product.category} · <span className="font-mono">{product.productCode}</span> · Stock:{' '}
                      {product.stock} {product.unit}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Removed on {deletedDate}
                      {product.deletedByName ? ` by ${product.deletedByName}` : ''}
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
                              text: `Restored product "${product.name}" back to Products.`,
                            });
                          } catch (err) {
                            setRecoveryNotice({
                              type: 'err',
                              text: err instanceof Error ? err.message : 'Failed to restore product.',
                            });
                          } finally {
                            setRecoveryBusyId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
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
                                  text: `Permanently removed product "${product.name}".`,
                                });
                              } catch (err) {
                                setRecoveryNotice({
                                  type: 'err',
                                  text:
                                    err instanceof Error
                                      ? err.message
                                      : 'Failed to delete product permanently.',
                                });
                              } finally {
                                setRecoveryBusyId(null);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmPermanentId(null)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmPermanentId(product.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Permanently
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
