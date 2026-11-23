import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  QrCode,
  ScanLine,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { buildUpiUri, generateAndVerifyUpiQr } from '../lib/upiAndExport';
import { ScannerModal } from '../components/ScannerModal';

export const UpiQrPage: React.FC = () => {
  const { upiSetting, business, saveUpiSettings, products } = useBillingData();
  const { isAdmin } = useAuth();

  const [upiId, setUpiId] = useState(upiSetting?.upiId || '');
  const [accountHolderName, setAccountHolderName] = useState(
    upiSetting?.accountHolderName || business?.proprietor || 'A. Prasad'
  );
  const [businessName, setBusinessName] = useState(
    upiSetting?.businessName || business?.name || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work'
  );
  const [paymentDescription, setPaymentDescription] = useState(
    upiSetting?.paymentDescription || 'SLP Cement Work Payment'
  );
  const [activeMode, setActiveMode] = useState<'generated' | 'uploaded'>(
    upiSetting?.activeMode || 'generated'
  );
  const [uploadedQrDataUrl, setUploadedQrDataUrl] = useState(upiSetting?.uploadedQrDataUrl || '');

  const [previewAmount, setPreviewAmount] = useState<string>('');
  const [generatedQrUrl, setGeneratedQrUrl] = useState<string>('');
  const [verifiedDecoded, setVerifiedDecoded] = useState<string | null>(null);
  const [qrValid, setQrValid] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (upiSetting) {
      setUpiId(upiSetting.upiId || '');
      setAccountHolderName(upiSetting.accountHolderName || business?.proprietor || 'A. Prasad');
      setBusinessName(upiSetting.businessName || business?.name || '');
      setPaymentDescription(upiSetting.paymentDescription || '');
      setActiveMode(upiSetting.activeMode || 'generated');
      setUploadedQrDataUrl(upiSetting.uploadedQrDataUrl || '');
    }
  }, [upiSetting, business]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!upiId.trim()) {
        setGeneratedQrUrl('');
        setVerifiedDecoded(null);
        setQrValid(false);
        return;
      }
      const amt = Number(previewAmount);
      const uri = buildUpiUri({
        upiId,
        payeeName: accountHolderName || businessName || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work',
        amount: Number.isFinite(amt) && amt > 0 ? amt : undefined,
        note: paymentDescription || 'Cement Work Payment',
      });
      const res = await generateAndVerifyUpiQr(uri);
      if (active) {
        setGeneratedQrUrl(res.dataUrl);
        setVerifiedDecoded(res.verifiedDecodedText);
        setQrValid(res.isValid);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [upiId, accountHolderName, businessName, paymentDescription, previewAmount]);

  const handleUploadQrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) {
      setError('Uploaded QR image must be smaller than 400 KB for fast multi-device sync.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedQrDataUrl(reader.result);
        setActiveMode('uploaded');
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Only administrators can update business UPI QR settings.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveUpiSettings({
        upiId: upiId.trim(),
        accountHolderName: accountHolderName.trim(),
        businessName: businessName.trim(),
        paymentDescription: paymentDescription.trim(),
        activeMode,
        uploadedQrDataUrl,
      });
      setFeedback('UPI QR settings saved and synchronized across all billing counters & public invoices.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save UPI configuration.');
    } finally {
      setSaving(false);
    }
  };

  const activeQrDisplay = activeMode === 'uploaded' && uploadedQrDataUrl ? uploadedQrDataUrl : generatedQrUrl;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Configuration Form */}
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            UPI QR Payment Settings
          </h2>
          <QrCode className="w-6 h-6 text-[#1D4ED8]" />
        </div>

        {feedback && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            {feedback}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              Merchant UPI ID (VPA) *
            </label>
            <input
              required
              disabled={!isAdmin}
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. 9912179771@ybl"
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              Account Holder Name *
            </label>
            <input
              required
              disabled={!isAdmin}
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              Display Business Name
            </label>
            <input
              disabled={!isAdmin}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              Default Payment Note
            </label>
            <input
              disabled={!isAdmin}
              value={paymentDescription}
              onChange={(e) => setPaymentDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Active QR Source</label>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => setActiveMode('generated')}
              className={`p-3 rounded-lg border text-left transition ${
                activeMode === 'generated'
                  ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="font-semibold">Dynamic Bill-Amount QR</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Auto-encodes exact payable amount & bill # via NPCI UPI URI.
              </div>
            </button>
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => setActiveMode('uploaded')}
              className={`p-3 rounded-lg border text-left transition ${
                activeMode === 'uploaded'
                  ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="font-semibold">Uploaded Bank Standee QR</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Use your static PhonePe / GPay / SBI merchant QR image.
              </div>
            </button>
          </div>
        </div>

        {activeMode === 'uploaded' && isAdmin && (
          <div className="p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-700 dark:text-slate-300">Upload Static QR Image (PNG/JPG)</div>
              <div className="text-[11px] text-slate-500">Max 400 KB · Synced to all counters</div>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-medium cursor-pointer hover:bg-slate-200">
              <Upload className="w-3.5 h-3.5" /> Choose File
              <input type="file" accept="image/*" onChange={handleUploadQrFile} className="hidden" />
            </label>
          </div>
        )}

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Cashier verification note: Displaying or scanning a UPI QR code does not automatically confirm bank settlement. Always verify the UTR/payment alert in your merchant app before recording a payment as Completed.
          </span>
        </div>

        {isAdmin && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              {saving ? 'Saving to Cloud...' : 'Save & Sync UPI Configuration'}
            </button>
          </div>
        )}
      </form>

      {/* Live Preview & Decoder Verification */}
      <div className="lg:col-span-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center text-center space-y-4">
        <div className="w-full flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Live Counter QR Preview</span>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center gap-1 text-[#1D4ED8] font-medium hover:underline"
          >
            <ScanLine className="w-3.5 h-3.5" /> Test QR Scanner
          </button>
        </div>

        <div className="w-full max-w-[220px]">
          <input
            type="number"
            min={0}
            value={previewAmount}
            onChange={(e) => setPreviewAmount(e.target.value)}
            placeholder="Test amount ₹ (optional)"
            className="w-full px-3 py-1.5 text-xs font-mono text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
        </div>

        {activeQrDisplay ? (
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
            <img src={activeQrDisplay} alt="Business UPI QR" className="w-52 h-52 object-contain mx-auto" />
            <div className="mt-2 text-xs font-bold text-[#0B1F44]">{businessName}</div>
            <div className="text-[11px] font-mono text-slate-500">{upiId || 'Uploaded QR'}</div>
          </div>
        ) : (
          <div className="w-52 h-52 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs text-slate-400 p-4">
            Enter a Merchant UPI ID or upload a static QR image to preview.
          </div>
        )}

        {activeMode === 'generated' && verifiedDecoded && (
          <div className="w-full rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-left space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {qrValid ? <ShieldCheck className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              jsQR Payload Verification Passed
            </div>
            <div className="text-[11px] font-mono text-slate-500 break-all">{verifiedDecoded}</div>
          </div>
        )}

      </div>

      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        products={products}
        title="Verify UPI QR or Product Barcode"
      />
    </div>
  );
};
