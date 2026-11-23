import React, { useEffect, useState } from 'react';
import { Bluetooth, Download, Printer, Save, Usb } from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import {
  buildEscPosReceiptBytes,
  buildUpiUri,
  generateAndVerifyUpiQr,
  generateThermalReceiptPdf,
} from '../lib/upiAndExport';
import { ThermalReceiptPreview } from '../components/InvoiceViews';
import { tr, translateCustomerName, translateFooterMessage } from '../lib/i18n';

export const ThermalReceiptsPage: React.FC = () => {
  const { bills, billItems, products, business, businessSettings, upiSetting, saveBusinessSettings } = useBillingData();
  const { isAdmin, language } = useAuth();

  const [selectedBillId, setSelectedBillId] = useState(bills[0]?.id || '');
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(businessSettings?.paperWidth || '80mm');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>(businessSettings?.fontSize || 'md');
  const [showThermalLogo, setShowThermalLogo] = useState(
    (businessSettings?.showThermalLogo ?? businessSettings?.showLogo) !== false
  );
  const [showQrCode, setShowQrCode] = useState(businessSettings?.showQrCode !== false);
  const [footerMessage, setFooterMessage] = useState(
    translateFooterMessage(businessSettings?.footerMessage, language)
  );
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const selectedBill = bills.find((b) => b.id === selectedBillId) || bills[0] || null;
  const items = selectedBill ? billItems.filter((bi) => bi.billId === selectedBill.id) : [];

  useEffect(() => {
    if (!selectedBill && bills.length > 0) setSelectedBillId(bills[0].id);
  }, [bills, selectedBill]);

  useEffect(() => {
    if (!selectedBill || !upiSetting?.upiId) {
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
      amount: selectedBill.pendingBalance > 0 ? selectedBill.pendingBalance : selectedBill.grandTotal,
      billNumber: selectedBill.billNumber,
    });
    generateAndVerifyUpiQr(uri).then((r) => setQrDataUrl(r.dataUrl));
  }, [selectedBill, upiSetting, business]);

  useEffect(() => {
    if (businessSettings) {
      setPaperWidth(businessSettings.paperWidth || '80mm');
      setFontSize(businessSettings.fontSize || 'md');
      setShowThermalLogo((businessSettings.showThermalLogo ?? businessSettings.showLogo) !== false);
      setShowQrCode(businessSettings.showQrCode !== false);
      setFooterMessage(translateFooterMessage(businessSettings.footerMessage, language));
    }
  }, [businessSettings, language]);

  const handleSavePrefs = async () => {
    await saveBusinessSettings({ paperWidth, fontSize, showThermalLogo, showQrCode, footerMessage });
    setStatus(tr(language, 'Thermal receipt preferences saved to cloud.', 'థర్మల్ రసీదు సెట్టింగ్స్ క్లౌడ్‌లో సేవ్ చేయబడ్డాయి.'));
  };

  const handleDownloadPdf = async () => {
    if (!selectedBill || !business) return;
    const doc = await generateThermalReceiptPdf({
      bill: selectedBill,
      items,
      business,
      paperWidth,
      upi: upiSetting,
      showLogo: showThermalLogo,
      showQrCode,
      footerMessage,
      products,
      language,
    });
    doc.save(`${selectedBill.billNumber}_${paperWidth}.pdf`);
  };

  const handleBluetoothPrint = async () => {
    if (!selectedBill || !business) return;
    try {
      const nav = navigator as unknown as { bluetooth?: { requestDevice: (o: unknown) => Promise<unknown> } };
      if (!nav.bluetooth) {
        setStatus(
          tr(
            language,
            'Web Bluetooth is not supported on this browser. Use Browser Print or Thermal PDF.',
            'ఈ బ్రౌజర్‌లో బ్లూటూత్ ప్రింటింగ్ అందుబాటులో లేదు. బ్రౌజర్ ప్రింట్ లేదా థర్మల్ పీడీఎఫ్ ఉపయోగించండి.'
          )
        );
        return;
      }
      const device = (await nav.bluetooth.requestDevice({ acceptAllDevices: true })) as {
        gatt?: { connect: () => Promise<{ getPrimaryServices: () => Promise<Array<{ getCharacteristics: () => Promise<Array<{ properties: { write?: boolean; writeWithoutResponse?: boolean }; writeValue: (v: Uint8Array) => Promise<void> }>> }>> }> };
      };
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error(tr(language, 'Bluetooth connection failed.', 'బ్లూటూత్ కనెక్షన్ విఫలమైంది.'));
      }
      const svcs = await server.getPrimaryServices();
      const bytes = buildEscPosReceiptBytes(selectedBill, items, business, footerMessage);
      for (const s of svcs) {
        const chars = await s.getCharacteristics();
        const ch = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (ch) {
          for (let i = 0; i < bytes.length; i += 100) {
            await ch.writeValue(bytes.slice(i, i + 100));
          }
          setStatus(tr(language, 'Sent ESC/POS slip to Bluetooth thermal printer.', 'బ్లూటూత్ థర్మల్ ప్రింటర్‌కు రసీదు పంపబడింది.'));
          return;
        }
      }
      setStatus(tr(language, 'No writable print service found on Bluetooth device.', 'బ్లూటూత్ పరికరంలో ప్రింట్ సేవ కనుగొనబడలేదు.'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : tr(language, 'Bluetooth printing cancelled.', 'బ్లూటూత్ ప్రింటింగ్ రద్దు చేయబడింది.'));
    }
  };

  const handleUsbPrint = async () => {
    if (!selectedBill || !business) return;
    try {
      const nav = navigator as unknown as {
        usb?: {
          requestDevice: (o: unknown) => Promise<{
            open: () => Promise<void>;
            selectConfiguration: (n: number) => Promise<void>;
            claimInterface: (n: number) => Promise<void>;
            transferOut: (e: number, d: Uint8Array) => Promise<void>;
          }>;
        };
      };
      if (!nav.usb) {
        setStatus(
          tr(
            language,
            'WebUSB is not supported on this browser. Use Browser Print or Thermal PDF.',
            'ఈ బ్రౌజర్‌లో యూఎస్‌బీ ప్రింటింగ్ అందుబాటులో లేదు. బ్రౌజర్ ప్రింట్ లేదా థర్మల్ పీడీఎఫ్ ఉపయోగించండి.'
          )
        );
        return;
      }
      const dev = await nav.usb.requestDevice({ filters: [] });
      await dev.open();
      await dev.selectConfiguration(1);
      await dev.claimInterface(0);
      await dev.transferOut(1, buildEscPosReceiptBytes(selectedBill, items, business, footerMessage));
      setStatus(tr(language, 'Sent ESC/POS slip to USB thermal printer.', 'యూఎస్‌బీ థర్మల్ ప్రింటర్‌కు రసీదు పంపబడింది.'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : tr(language, 'USB printing cancelled.', 'యూఎస్‌బీ ప్రింటింగ్ రద్దు చేయబడింది.'));
    }
  };

  const fontSizeLabel = (sz: 'sm' | 'md' | 'lg') => {
    if (language !== 'te') return sz;
    if (sz === 'sm') return 'చిన్నది';
    if (sz === 'md') return 'మధ్యస్థం';
    return 'పెద్దది';
  };

  return (
    <div className="space-y-4 animate-slp-in">

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'Select Bill to Preview', 'ప్రివ్యూ కోసం బిల్ ఎంచుకోండి')}
            </label>
            <select
              value={selectedBill?.id || ''}
              onChange={(e) => setSelectedBillId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              {bills.length === 0 && <option value="">{tr(language, 'No bills created yet', 'ఇంకా బిల్లులు లేవు')}</option>}
              {bills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.billNumber} · {translateCustomerName(b.customerName, language)} (₹{b.grandTotal.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Paper Width', 'పేపర్ వెడల్పు')}
              </label>
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['58mm', '80mm'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setPaperWidth(w)}
                    className={`flex-1 py-1.5 text-xs font-mono rounded-md ${
                      paperWidth === w ? 'bg-white dark:bg-slate-900 font-bold shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {language === 'te' ? w.replace('mm', ' మి.మీ.') : w}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Font Size', 'అక్షర పరిమాణం')}
              </label>
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['sm', 'md', 'lg'] as const).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setFontSize(sz)}
                    className={`flex-1 py-1.5 text-xs uppercase rounded-md ${
                      fontSize === sz ? 'bg-white dark:bg-slate-900 font-bold shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {fontSizeLabel(sz)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showThermalLogo}
                onChange={(e) => setShowThermalLogo(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                {tr(language, 'Print business logo on thermal slip', 'థర్మల్ స్లిప్‌పై వ్యాపార లోగోను ప్రింట్ చేయండి')}{' '}
                <span className="block text-[11px] text-slate-400">
                  {tr(
                    language,
                    'Turn off to optimize thermal printer memory and print speed',
                    'ప్రింటర్ మెమరీ మరియు వేగం పెంచడానికి దీన్ని ఆఫ్ చేయవచ్చు'
                  )}
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showQrCode} onChange={(e) => setShowQrCode(e.target.checked)} />
              <span>{tr(language, 'Include UPI QR code on thermal slip', 'థర్మల్ స్లిప్‌పై యూపీఐ క్యూఆర్ కోడ్ చూపించండి')}</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'Receipt Footer Message', 'రసీదు అడుగు సందేశం')}
            </label>
            <input
              type="text"
              value={footerMessage}
              onChange={(e) => setFooterMessage(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          {isAdmin && (
            <button
              onClick={handleSavePrefs}
              className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Save className="w-3.5 h-3.5" />
              {tr(language, 'Save Thermal Settings Across Devices', 'అన్ని పరికరాలలో థర్మల్ సెట్టింగ్స్ సేవ్ చేయండి')}
            </button>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
            <button
              onClick={() => window.print()}
              disabled={!selectedBill}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" /> {tr(language, 'Browser Print', 'బ్రౌజర్ ప్రింట్')}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!selectedBill}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> {tr(language, 'Thermal PDF', 'థర్మల్ పీడీఎఫ్')}
            </button>
            <button
              onClick={handleBluetoothPrint}
              disabled={!selectedBill}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-50"
            >
              <Bluetooth className="w-3.5 h-3.5" /> {tr(language, 'Bluetooth Print', 'బ్లూటూత్ ప్రింట్')}
            </button>
            <button
              onClick={handleUsbPrint}
              disabled={!selectedBill}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-50"
            >
              <Usb className="w-3.5 h-3.5" /> {tr(language, 'USB Print', 'యూఎస్‌బీ ప్రింట్')}
            </button>
          </div>

          {status && <p className="text-xs text-[#1D4ED8] dark:text-sky-400">{status}</p>}
        </div>

        <div className="lg:col-span-7 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex justify-center min-h-[420px] items-start">
          {selectedBill && business ? (
            <ThermalReceiptPreview
              bill={selectedBill}
              items={items}
              business={business}
              settings={{
                ...(businessSettings || {
                  id: business.id,
                  businessId: business.id,
                  ownerUid: business.ownerUid,
                  authorizedUids: business.authorizedUids,
                }),
                paperWidth,
                fontSize,
                showLogo: businessSettings?.showLogo ?? true,
                showThermalLogo,
                showQrCode,
                footerMessage,
              }}
              paperWidth={paperWidth}
              qrDataUrl={qrDataUrl}
              products={products}
              language={language}
            />
          ) : (
            <div className="text-sm text-slate-400 py-20">
              {tr(language, 'Create a bill first to preview its thermal receipt.', 'థర్మల్ రసీదు చూడటానికి ముందుగా బిల్ సృష్టించండి.')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
