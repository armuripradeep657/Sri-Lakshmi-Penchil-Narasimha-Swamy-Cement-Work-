import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import jsQR from 'jsqr';
import { Camera, RefreshCw, Search, ShieldAlert, X, CheckCircle2, QrCode, Barcode, ReceiptText } from 'lucide-react';
import { Bill, Product } from '../types/billing';
import { formatTimestamp } from '../lib/firebase';
import { deriveMixedVerificationCode, getBillVerificationBarcode } from '../lib/barcodeAndBillImage';
import { useAuth } from '../context/AuthContext';
import {
  formatAppDate,
  tr,
  translateCustomerName,
  translateProductName,
  translateStatus,
} from '../lib/i18n';
import { Language } from '../types/billing';
import { ModalPortal } from './ModalPortal';

export interface ScanClassification {
  rawText: string;
  kind: 'upi' | 'product_barcode' | 'bill_barcode' | 'unsupported';
  upiDetails?: { pa?: string; pn?: string; am?: string; tn?: string };
  matchedProduct?: Product;
  matchedBill?: Bill;
  reason: string;
}

interface ScannerModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  bills?: Bill[];
  onProductFound?: (product: Product) => void;
  onBillFound?: (bill: Bill) => void;
  title?: string;
}

export function classifyScannedPayload(
  rawText: string,
  products: Product[],
  bills: Bill[] = [],
  language: Language = 'en',
  hideBarcodeMatter = false
): ScanClassification {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      rawText: trimmed,
      kind: 'unsupported',
      reason: tr(
        language,
        'Empty scan payload received. Point the camera clearly at a barcode or UPI QR code.',
        'ఖాళీ స్కాన్ అందింది. దయచేసి బార్‌కోడ్ లేదా యూపీఐ క్యూఆర్ కోడ్ వైపు కెమెరాను స్పష్టంగా చూపించండి.'
      ),
    };
  }

  // 1. Check UPI URI
  if (/^upi:\/\/pay\?/i.test(trimmed)) {
    const queryStr = trimmed.split('?')[1] || '';
    const params = new URLSearchParams(queryStr);
    const pa = params.get('pa') || undefined;
    const pn = params.get('pn') || undefined;
    const am = params.get('am') || undefined;
    const tn = params.get('tn') || undefined;
    return {
      rawText: trimmed,
      kind: 'upi',
      upiDetails: { pa, pn, am, tn },
      reason: pa
        ? tr(
            language,
            `Detected valid UPI payment QR for ${pn || 'Payee'} (${pa}). Note: Scanning a UPI QR only reads payee details and does NOT verify completed payment.`,
            `${pn || 'చెల్లింపుదారు'} (${pa}) కోసం సరైన యూపీఐ చెల్లింపు క్యూఆర్ గుర్తించబడింది. గమనిక: క్యూఆర్ స్కాన్ ద్వారా కేవలం ఖాతా వివరాలు మాత్రమే వస్తాయి, చెల్లింపు నిర్ధారణ కాదు.`
          )
        : tr(language, 'Detected UPI URI missing payee VPA (pa).', 'యూపీఐ క్యూఆర్‌లో మర్చంట్ ఐడి లేదు.'),
    };
  }

  const lower = trimmed.toLowerCase();

  // 2. Check Bill Verification Barcode (SLP-XXXXXXXX-XXXX, legacy raw code, plus bill # / ID)
  const strippedLower = lower.replace(/^slp-?/, '').replace(/[^a-z0-9]/g, '');
  const matchedBill = bills.find((b) => {
    const formattedCode = getBillVerificationBarcode(b).toLowerCase();
    const rawCode = (b.verificationBarcode || '').toLowerCase();
    const rawStripped = rawCode.replace(/^slp-?/, '').replace(/[^a-z0-9]/g, '');
    return (
      (rawCode && rawCode === lower) ||
      formattedCode === lower ||
      (strippedLower.length >= 8 && rawStripped === strippedLower) ||
      b.billNumber.toLowerCase() === lower ||
      b.id.toLowerCase() === lower
    );
  });
  if (matchedBill) {
    const verifyCode = getBillVerificationBarcode(matchedBill);
    const statusText =
      matchedBill.billStatus !== 'active'
        ? translateStatus(matchedBill.billStatus, language)
        : matchedBill.pendingBalance <= 0
        ? tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')
        : `${tr(language, 'DUE', 'బాకీ')} ₹${matchedBill.pendingBalance.toFixed(2)}`;
    return {
      rawText: trimmed,
      kind: 'bill_barcode',
      matchedBill,
      reason: hideBarcodeMatter
        ? tr(
            language,
            `Matched bill ${matchedBill.billNumber} for ${matchedBill.customerName} (${statusText}).`,
            `${translateCustomerName(matchedBill.customerName, 'te')} కోసం బిల్ ${matchedBill.billNumber} గుర్తించబడింది (${statusText}).`
          )
        : tr(
            language,
            `Verified authentic bill ${matchedBill.billNumber} (Code ${verifyCode}) for ${matchedBill.customerName} (${statusText}).`,
            `${translateCustomerName(matchedBill.customerName, 'te')} కోసం అసలు బిల్ ${matchedBill.billNumber} (కోడ్ ${verifyCode}) నిర్ధారించబడింది (${statusText}).`
          ),
    };
  }

  // 3. Check Product Barcode (unique mixed code or derived code) or Product Code
  const matched = products.find(
    (p) =>
      (p.barcode && p.barcode.toLowerCase() === lower) ||
      deriveMixedVerificationCode(p.id || p.productCode).toLowerCase() === lower ||
      p.productCode.toLowerCase() === lower ||
      p.name.toLowerCase() === lower
  );

  if (matched) {
    const dispProd = translateProductName(matched, language);
    return {
      rawText: trimmed,
      kind: 'product_barcode',
      matchedProduct: matched,
      reason: hideBarcodeMatter
        ? tr(language, `Matched product "${matched.name}" in catalog.`, `కేటలాగ్‌లో "${dispProd}" ఉత్పత్తి గుర్తించబడింది.`)
        : tr(
            language,
            `Matched product "${matched.name}" (${matched.productCode}) in catalog.`,
            `కేటలాగ్‌లో "${dispProd}" (${matched.productCode}) ఉత్పత్తి గుర్తించబడింది.`
          ),
    };
  }

  // Numeric/alphanumeric barcode not in catalog vs arbitrary QR
  const looksLikeBarcode = /^[0-9A-Za-z\-_]{4,32}$/.test(trimmed);
  return {
    rawText: trimmed,
    kind: 'unsupported',
    reason: looksLikeBarcode
      ? tr(
          language,
          `Scanned code "${trimmed}" did not match any product barcode or bill number in the cloud database.`,
          `స్కాన్ చేసిన కోడ్ "${trimmed}" ఏ ఉత్పత్తి బార్‌కోడ్ లేదా బిల్ నంబర్‌తోనూ సరిపోలలేదు.`
        )
      : tr(
          language,
          `Unsupported QR content detected ("${trimmed.slice(0, 80)}"). Only product barcodes, bill barcodes, and UPI payment URIs are supported.`,
          `మద్దతు లేని క్యూఆర్ వివరాలు ("${trimmed.slice(0, 80)}"). కేవలం ఉత్పత్తి బార్‌కోడ్‌లు, బిల్ బార్‌కోడ్‌లు మరియు యూపీఐ క్యూఆర్‌లకు మాత్రమే మద్దతు ఉంది.`
        ),
  };
}

export interface ScannerPanelProps {
  active?: boolean;
  products: Product[];
  bills?: Bill[];
  onProductFound?: (product: Product) => void;
  onBillFound?: (bill: Bill) => void;
  onClose?: () => void;
  title?: string;
  embedded?: boolean;
}

export const ScannerPanel: React.FC<ScannerPanelProps> = ({
  active = true,
  products,
  bills = [],
  onProductFound,
  onBillFound,
  onClose,
  title,
  embedded = false,
}) => {
  const { language, isAdmin } = useAuth();
  const resolvedTitle = title || tr(language, 'QR & Barcode Scanner', 'క్యూఆర్ & బార్‌కోడ్ స్కానర్');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const productsRef = useRef<Product[]>(products);
  const billsRef = useRef<Bill[]>(bills);
  const languageRef = useRef<Language>(language);
  const isAdminRef = useRef<boolean>(isAdmin);
  productsRef.current = products;
  billsRef.current = bills;
  languageRef.current = language;
  isAdminRef.current = isAdmin;

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [classification, setClassification] = useState<ScanClassification | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const stopStream = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        // ignore video cleanup errors
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!active) {
      stopStream();
      setClassification(null);
      setCameraError(null);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let lastZxingAt = 0;
    const zxingReader = new BrowserMultiFormatReader();

    async function openStreamWithFallback(): Promise<MediaStream> {
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { facingMode: { ideal: 'environment' } },
          audio: false,
        };
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
    }

    async function startCamera() {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          tr(
            languageRef.current,
            'Camera access is not available in this browser context. Use Manual Entry below.',
            'ఈ బ్రౌజర్‌లో కెమెరా అందుబాటులో లేదు. కింద మాన్యువల్ నమోదు ఉపయోగించండి.'
          )
        );
        return;
      }

      try {
        const stream = await openStreamWithFallback();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraActive(true);

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            setCameras(devices.filter((d) => d.kind === 'videoinput'));
          }
        } catch {
          // enumerateDevices optional
        }

        const videoEl = videoRef.current;
        if (!videoEl || cancelled) return;

        videoEl.srcObject = stream;
        try {
          await videoEl.play();
        } catch {
          // Ignore play interruption if modal closed or autoPlay deferred
        }
        if (cancelled) return;

        const scanFrame = (now: number) => {
          if (cancelled) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (
            video &&
            canvas &&
            video.readyState >= video.HAVE_CURRENT_DATA &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              try {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const qr = jsQR(imgData.data, canvas.width, canvas.height);
                if (qr?.data && !cancelled) {
                  setClassification(
                    classifyScannedPayload(
                      qr.data,
                      productsRef.current,
                      billsRef.current,
                      languageRef.current,
                      !isAdminRef.current
                    )
                  );
                }
              } catch {
                // ignore frame read error
              }

              if (now - lastZxingAt >= 160) {
                lastZxingAt = now;
                try {
                  const zxingResult = zxingReader.decodeFromCanvas(canvas);
                  const text = zxingResult?.getText();
                  if (text && !cancelled) {
                    setClassification(
                      classifyScannedPayload(
                        text,
                        productsRef.current,
                        billsRef.current,
                        languageRef.current,
                        !isAdminRef.current
                      )
                    );
                  }
                } catch {
                  // Expected on non-barcode frames
                }
              }
            }
          }
          rafId = requestAnimationFrame(scanFrame);
        };
        rafId = requestAnimationFrame(scanFrame);
      } catch (err) {
        const msg = err instanceof Error ? err.message : tr(languageRef.current, 'Unable to open camera', 'కెమెరా తెరవడం సాధ్యం కాలేదు');
        setCameraError(
          tr(
            languageRef.current,
            `Camera permission denied or hardware unavailable (${msg}). Enter a verification barcode (e.g. SLP-W2TMKGYE-TDF6), bill #, product barcode, or UPI URI manually below.`,
            `కెమెరా అనుమతి నిరాకరించబడింది లేదా అందుబాటులో లేదు (${msg}). ధృవీకరణ బార్‌కోడ్, బిల్ నంబర్, ఉత్పత్తి బార్‌కోడ్ లేదా యూపీఐ వివరాలు కింద మాన్యువల్‌గా నమోదు చేయండి.`
          )
        );
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      stopStream();
    };
  }, [active, selectedDeviceId]);

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const res = classifyScannedPayload(manualInput, products, bills, language, !isAdmin);
    setClassification(res);
  };

  const handleSwitchCamera = () => {
    if (cameras.length < 2) return;
    const idx = cameras.findIndex((c) => c.deviceId === selectedDeviceId);
    const next = cameras[(idx + 1) % cameras.length];
    setSelectedDeviceId(next.deviceId);
  };

  return (
    <div
      className={
        embedded
          ? 'w-full rounded-2xl bg-white border border-[#E5DDD3] shadow-sm overflow-hidden'
          : 'w-full sm:max-w-xl min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl bg-white border-0 sm:border border-[#E5DDD3] shadow-xl overflow-hidden sm:max-h-[92vh] overflow-y-auto'
      }
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-2.5">
          <Camera className="w-5 h-5 text-[#9A4307]" />
          <h3 className="text-base font-semibold text-[#0A2240]">{resolvedTitle}</h3>
        </div>
        <div className="flex items-center gap-2">
          {cameras.length > 1 && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E5DDD3] text-xs font-medium text-[#2D3138] hover:bg-[#F3EDE5]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {tr(language, 'Switch', 'కెమెరా మార్చు')}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8A8279] hover:text-[#2D3138]"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {cameraActive && (
            <div className="pointer-events-none absolute inset-6 border-2 border-sky-400/70 rounded-lg" />
          )}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
              <ShieldAlert className="w-8 h-8 text-amber-400 mb-2" />
              <p className="text-xs text-slate-200 max-w-sm leading-relaxed">{cameraError}</p>
            </div>
          )}
        </div>

        <form onSubmit={handleManualLookup} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8A8279] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder={
                isAdmin
                  ? tr(
                      language,
                      'Enter verification barcode, bill #, product code, or upi://pay?...',
                      'ధృవీకరణ బార్‌కోడ్, బిల్ నంబర్, ఉత్పత్తి కోడ్ లేదా యూపీఐ లింక్ నమోదు చేయండి'
                    )
                  : tr(
                      language,
                      'Enter bill # to look up...',
                      'బిల్ నంబర్ నమోదు చేయండి...'
                    )
              }
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-[#E5DDD3] bg-white text-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-[#0A2240] text-white text-sm font-medium hover:bg-[#13325B] whitespace-nowrap"
          >
            {tr(language, 'Verify', 'తనిఖీ చేయి')}
          </button>
        </form>

        {classification && (
          <div className="rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {classification.kind === 'bill_barcode' && (
                  <>
                    <ReceiptText className="w-4 h-4 text-[#15803D]" />
                    <span className="text-[#15803D]">{tr(language, 'BILL VERIFIED', 'బిల్ నిర్ధారించబడింది')}</span>
                  </>
                )}
                {classification.kind === 'product_barcode' && (
                  <>
                    <Barcode className="w-4 h-4 text-[#15803D]" />
                    <span className="text-[#15803D]">
                      {tr(language, 'Product Barcode Matched', 'ఉత్పత్తి బార్‌కోడ్ సరిపోయింది')}
                    </span>
                  </>
                )}
                {classification.kind === 'upi' && (
                  <>
                    <QrCode className="w-4 h-4 text-sky-600" />
                    <span className="text-sky-700">
                      {tr(language, 'UPI Payment QR Detected', 'యూపీఐ చెల్లింపు క్యూఆర్ గుర్తించబడింది')}
                    </span>
                  </>
                )}
                {classification.kind === 'unsupported' && (
                  <>
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span className="text-[#9A4307]">
                      {tr(language, 'Unmatched / Unsupported Content', 'సరిపోలని / మద్దతు లేని వివరాలు')}
                    </span>
                  </>
                )}
              </div>
              {isAdmin && (
                <span className="font-mono text-xs text-[#6D665E] truncate max-w-[180px]">
                  {classification.rawText}
                </span>
              )}
            </div>

            <p className="text-xs text-[#6D665E] leading-relaxed">{classification.reason}</p>

            {classification.kind === 'bill_barcode' && classification.matchedBill && (
              <div className="p-3 rounded-lg bg-white border border-[#C5E8D1] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono font-bold text-sm text-[#0A2240]">
                      {classification.matchedBill.billNumber}
                    </div>
                    {isAdmin && (
                      <div className="text-[11px] font-mono text-[#15803D]">
                        {tr(language, 'Verify Code:', 'ధృవీకరణ కోడ్:')}{' '}
                        {getBillVerificationBarcode(classification.matchedBill)}
                      </div>
                    )}
                    <div className="text-[#6D665E]">
                      {translateCustomerName(classification.matchedBill.customerName, language)} ·{' '}
                      {formatAppDate(formatTimestamp(classification.matchedBill.createdAt), language)}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md font-bold text-[11px] uppercase ${
                      classification.matchedBill.pendingBalance <= 0 &&
                      classification.matchedBill.billStatus === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-[#9A4307]'
                    }`}
                  >
                    {classification.matchedBill.pendingBalance <= 0 &&
                    classification.matchedBill.billStatus === 'active'
                      ? tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')
                      : `${tr(language, 'DUE', 'బాకీ')} ₹${classification.matchedBill.pendingBalance.toFixed(2)}`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#EFEAE2] font-mono">
                  <div>
                    <span className="text-[#8A8279] block text-[10px]">{tr(language, 'TOTAL', 'మొత్తం')}</span>
                    <span className="font-bold">₹{classification.matchedBill.grandTotal.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#8A8279] block text-[10px]">{tr(language, 'PAID', 'చెల్లించినది')}</span>
                    <span className="font-bold text-[#15803D]">
                      ₹{classification.matchedBill.amountPaid.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8279] block text-[10px]">{tr(language, 'BALANCE', 'బాకీ')}</span>
                    <span className="font-bold text-amber-600">
                      ₹{classification.matchedBill.pendingBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
                {onBillFound && (
                  <button
                    type="button"
                    onClick={() => {
                      onBillFound(classification.matchedBill!);
                      onClose?.();
                    }}
                    className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {tr(language, 'Open Bill & Share Receipt', 'బిల్ తెరవండి & రసీదు షేర్ చేయండి')}
                  </button>
                )}
              </div>
            )}

            {classification.kind === 'upi' && classification.upiDetails && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5DDD3] text-xs">
                <div>
                  <span className="text-[#6D665E]">{tr(language, 'UPI ID:', 'యూపీఐ ఐడి:')}</span>{' '}
                  <span className="font-mono font-medium text-[#0A2240]">
                    {classification.upiDetails.pa || tr(language, 'N/A', 'లేదు')}
                  </span>
                </div>
                <div>
                  <span className="text-[#6D665E]">{tr(language, 'Payee Name:', 'చెల్లింపుదారు పేరు:')}</span>{' '}
                  <span className="font-medium text-[#0A2240]">
                    {classification.upiDetails.pn || tr(language, 'N/A', 'లేదు')}
                  </span>
                </div>
              </div>
            )}

            {classification.kind === 'product_barcode' && classification.matchedProduct && (
              <div className="flex items-center justify-between pt-2 border-t border-[#E5DDD3]">
                <div>
                  <p className="text-sm font-semibold text-[#0A2240]">
                    {translateProductName(classification.matchedProduct, language)}
                  </p>
                  <p className="text-xs text-[#6D665E]">
                    ₹{classification.matchedProduct.sellingPrice.toFixed(2)} ·{' '}
                    {tr(language, 'Stock:', 'స్టాక్:')} {classification.matchedProduct.stock}
                  </p>
                </div>
                {onProductFound && (
                  <button
                    type="button"
                    onClick={() => {
                      onProductFound(classification.matchedProduct!);
                      onClose?.();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {tr(language, 'Use Product', 'ఉత్పత్తిని జోడించు')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ScannerModal: React.FC<ScannerModalProps> = ({
  open,
  onClose,
  products,
  bills = [],
  onProductFound,
  onBillFound,
  title,
}) => {
  if (!open) return null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 sm:pt-6 sm:px-4 overflow-y-auto">
      <ScannerPanel
        active={open}
        onClose={onClose}
        products={products}
        bills={bills}
        onProductFound={onProductFound}
        onBillFound={onBillFound}
        title={title}
      />
    </div>
    </ModalPortal>
  );
};

