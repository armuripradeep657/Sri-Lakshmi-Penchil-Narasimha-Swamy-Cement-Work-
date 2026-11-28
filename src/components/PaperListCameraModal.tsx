import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Trash2,
  AlertCircle,
  X,
} from 'lucide-react';
import { CartItemInput } from '../context/BillingDataContext';
import { parseVariants } from '../lib/seedData';
import { formatCurrency } from '../lib/upiAndExport';
import { tr, translateProductName, translateVariantLabel } from '../lib/i18n';
import { Language, Product } from '../types/billing';
import { ModalPortal } from './ModalPortal';

interface ApiScannedRow {
  writtenText: string;
  matchedProductId: string;
  matchedVariantLabel: string;
  quantity: number;
  unitPrice: number;
  confidence: 'high' | 'medium' | 'low';
}

interface ReviewRow {
  rowId: string;
  checked: boolean;
  writtenText: string;
  productId: string;
  variantLabel: string;
  quantity: number;
  unitPrice: number;
  confidence: 'high' | 'medium' | 'low';
}

interface PaperListCameraModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  taxEnabled: boolean;
  language: Language;
  onSaveAllToCart: (items: CartItemInput[]) => void;
}

function makeRowId(): string {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatReadableScanError(raw: string, language: Language): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return tr(
      language,
      'Could not read items from photo. Please try again.',
      'ఫోటో నుండి వస్తువులను చదవడం సాధ్యం కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.'
    );
  }
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
        code?: number;
        message?: string;
        status?: string;
      };
      const inner = parsed.error ?? parsed;
      const msg = inner.message || '';
      if (
        inner.code === 503 ||
        inner.status === 'UNAVAILABLE' ||
        /high demand|unavailable|overloaded|try again/i.test(msg)
      ) {
        return tr(
          language,
          'AI scanner is temporarily busy due to high demand. Please tap Try Again in a moment or add items manually below.',
          'ప్రస్తుతం సర్వర్ రద్దీగా ఉంది. దయచేసి కొన్ని క్షణాల తర్వాత "మళ్లీ ప్రయత్నించు" నొక్కండి లేదా క్రింద వస్తువులను జోడించండి.'
        );
      }
      if (msg) return msg;
    } catch {
      // fall through
    }
  }
  if (/high demand|503|UNAVAILABLE/i.test(trimmed)) {
    return tr(
      language,
      'AI scanner is temporarily busy due to high demand. Please tap Try Again in a moment or add items manually below.',
      'ప్రస్తుతం సర్వర్ రద్దీగా ఉంది. దయచేసి కొన్ని క్షణాల తర్వాత "మళ్లీ ప్రయత్నించు" నొక్కండి లేదా క్రింద వస్తువులను జోడించండి.'
    );
  }
  return trimmed;
}

async function compressImageSource(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): Promise<string> {
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(srcWidth || 1, srcHeight || 1));
  const targetW = Math.max(1, Math.round(srcWidth * scale));
  const targetH = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.84);
}

async function compressFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = async () => {
        try {
          const dataUrl = await compressImageSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const PaperListCameraModal: React.FC<PaperListCameraModalProps> = ({
  open,
  onClose,
  products,
  taxEnabled,
  language,
  onSaveAllToCart,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) =>
      translateProductName(a, language).localeCompare(translateProductName(b, language))
    );
  }, [products, language]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        tr(
          language,
          'Live camera is unavailable here. Use "Choose Photo" below to snap or upload your paper list.',
          'ఈ బ్రౌజర్‌లో లైవ్ కెమెరా అందుబాటులో లేదు. కాగితం జాబితా ఫోటో తీయడానికి లేదా ఎంచుకోవడానికి క్రింది "ఫోటో ఎంచుకోండి" నొక్కండి.'
        )
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch {
      setCameraError(
        tr(
          language,
          'Camera permission blocked or no camera detected. Use "Choose Photo" below to capture or pick an image.',
          'కెమెరా అనుమతి లేదు లేదా కెమెరా కనుగొనబడలేదు. ఫోటో తీయడానికి లేదా ఎంచుకోవడానికి క్రింది "ఫోటో ఎంచుకోండి" బటన్ ఉపయోగించండి.'
        )
      );
    }
  }, [facingMode, language, stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    if (!capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, capturedImage, startCamera, stopCamera]);

  useEffect(() => {
    if (!open) {
      setCapturedImage(null);
      setRows([]);
      setScanError(null);
      setScanning(false);
    }
  }, [open]);

  const resolveDefaultUnitPrice = useCallback(
    (productId: string, variantLabel: string): number => {
      const p = productMap.get(productId);
      if (!p) return 0;
      const variants = parseVariants(p.variantsSummary);
      if (variantLabel) {
        const vMatch = variants.find((v) => v.label.toLowerCase() === variantLabel.toLowerCase());
        if (vMatch) return vMatch.price;
      }
      if (variants.length > 0 && !variantLabel) {
        return variants[0].price;
      }
      return p.sellingPrice;
    },
    [productMap]
  );

  const scanPaperPhoto = useCallback(
    async (imageDataUrl: string) => {
      setScanning(true);
      setScanError(null);
      setRows([]);

      try {
        const catalogPayload = products.map((p) => ({
          id: p.id,
          productCode: p.productCode,
          name: p.name,
          nameTe: p.nameTe || '',
          category: p.category,
          sellingPrice: p.sellingPrice,
          variantsSummary: p.variantsSummary || '',
        }));

        const resp = await fetch('/api/ai/scan-paper-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl,
            catalog: catalogPayload,
            language,
          }),
        });

        let data: { items?: ApiScannedRow[]; error?: string } = {};
        try {
          data = (await resp.json()) as { items?: ApiScannedRow[]; error?: string };
        } catch {
          data = {};
        }
        if (!resp.ok) {
          throw new Error(
            formatReadableScanError(
              data.error ||
                (resp.status === 503
                  ? '503 UNAVAILABLE'
                  : tr(
                      language,
                      'Could not read items from photo.',
                      'ఫోటో నుండి వస్తువులను చదవడం సాధ్యం కాలేదు.'
                    )),
              language
            )
          );
        }

        const apiItems = Array.isArray(data.items) ? data.items : [];
        if (apiItems.length === 0) {
          setScanError(
            tr(
              language,
              'No written items were detected in this photo. Try taking a clearer, well-lit photo or add rows manually.',
              'ఈ ఫోటోలో వ్రాసిన వస్తువులు ఏవీ కనిపించలేదు. దయచేసి స్పష్టమైన వెలుతురులో మళ్లీ ఫోటో తీయండి లేదా క్రింద వస్తువులను జోడించండి.'
            )
          );
          return;
        }

        const mapped: ReviewRow[] = apiItems.map((item) => {
          const prod = item.matchedProductId ? productMap.get(item.matchedProductId) : undefined;
          const variants = prod ? parseVariants(prod.variantsSummary) : [];
          let resolvedVariant = '';
          if (variants.length > 0) {
            const exact = variants.find(
              (v) => v.label.toLowerCase() === (item.matchedVariantLabel || '').toLowerCase()
            );
            resolvedVariant = exact ? exact.label : variants[0].label;
          }
          const resolvedPrice =
            item.unitPrice > 0
              ? item.unitPrice
              : prod
              ? resolveDefaultUnitPrice(prod.id, resolvedVariant)
              : 0;

          return {
            rowId: makeRowId(),
            checked: Boolean(prod),
            writtenText: item.writtenText || (prod ? translateProductName(prod, language) : ''),
            productId: prod ? prod.id : '',
            variantLabel: resolvedVariant,
            quantity: item.quantity > 0 ? item.quantity : 1,
            unitPrice: resolvedPrice,
            confidence: item.confidence || 'medium',
          };
        });

        setRows(mapped);
      } catch (err) {
        const rawErr =
          err instanceof Error
            ? err.message
            : tr(
                language,
                'Failed to process photo. Please try again.',
                'ఫోటోను ప్రాసెస్ చేయడం విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి.'
              );
        setScanError(formatReadableScanError(rawErr, language));
      } finally {
        setScanning(false);
      }
    },
    [language, productMap, products, resolveDefaultUnitPrice]
  );

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    try {
      const dataUrl = await compressImageSource(video, video.videoWidth, video.videoHeight);
      setCapturedImage(dataUrl);
      await scanPaperPhoto(dataUrl);
    } catch {
      setCameraError(
        tr(language, 'Failed to capture camera frame.', 'కెమెరా ఫోటో తీయడం విఫలమైంది.')
      );
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressFileToDataUrl(file);
      setCapturedImage(dataUrl);
      await scanPaperPhoto(dataUrl);
    } catch {
      setScanError(
        tr(
          language,
          'Could not read the selected photo. Please try another image.',
          'ఎంచుకున్న ఫోటోను చదవడం సాధ్యం కాలేదు. దయచేసి మరొక ఫోటోను ఎంచుకోండి.'
        )
      );
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setRows([]);
    setScanError(null);
    setScanning(false);
  };

  const updateRow = (rowId: string, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const handleChangeRowProduct = (rowId: string, nextProductId: string) => {
    const prod = productMap.get(nextProductId);
    if (!prod) {
      updateRow(rowId, { productId: '', variantLabel: '', unitPrice: 0, checked: false });
      return;
    }
    const variants = parseVariants(prod.variantsSummary);
    const nextVariant = variants.length > 0 ? variants[0].label : '';
    const nextPrice = variants.length > 0 ? variants[0].price : prod.sellingPrice;
    updateRow(rowId, {
      productId: prod.id,
      variantLabel: nextVariant,
      unitPrice: nextPrice,
      checked: true,
    });
  };

  const handleChangeRowVariant = (rowId: string, productId: string, nextVariant: string) => {
    const nextPrice = resolveDefaultUnitPrice(productId, nextVariant);
    updateRow(rowId, { variantLabel: nextVariant, unitPrice: nextPrice });
  };

  const handleAddEmptyRow = () => {
    const firstProd = sortedProducts[0];
    if (!firstProd) return;
    const variants = parseVariants(firstProd.variantsSummary);
    const defaultVar = variants.length > 0 ? variants[0].label : '';
    const defaultPrice = variants.length > 0 ? variants[0].price : firstProd.sellingPrice;
    setRows((prev) => [
      ...prev,
      {
        rowId: makeRowId(),
        checked: true,
        writtenText: tr(language, 'Manual item', 'చేతితో జోడించిన వస్తువు'),
        productId: firstProd.id,
        variantLabel: defaultVar,
        quantity: 1,
        unitPrice: defaultPrice,
        confidence: 'high',
      },
    ]);
  };

  const validSelectedRows = useMemo(
    () => rows.filter((r) => r.checked && r.productId && r.quantity > 0),
    [rows]
  );

  const estimatedTotal = useMemo(
    () =>
      validSelectedRows.reduce((sum, r) => sum + Math.max(0, r.quantity) * Math.max(0, r.unitPrice), 0),
    [validSelectedRows]
  );

  const handleSaveAllToCart = () => {
    if (validSelectedRows.length === 0) return;

    const cartItems: CartItemInput[] = [];
    validSelectedRows.forEach((r) => {
      const prod = productMap.get(r.productId);
      if (!prod) return;
      cartItems.push({
        productId: prod.id,
        productCode: prod.productCode,
        productName: translateProductName(prod, language),
        variantLabel: r.variantLabel || undefined,
        barcode: prod.barcode,
        imageUrl: prod.imageUrl || '',
        quantity: Math.max(0.01, Math.round(r.quantity * 100) / 100),
        unitPrice: Math.max(0, Math.round(r.unitPrice * 100) / 100),
        discount: 0,
        taxRate: 0,
      });
    });

    if (cartItems.length > 0) {
      onSaveAllToCart(cartItems);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <ModalPortal>
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl border border-[#DFD7CC] dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-[#0A2240] text-white flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold truncate">
                  {tr(language, 'Camera · Scan Paper Item List', 'కెమెరా · కాగితం వస్తువుల జాబితా స్కాన్')}
                </h2>
                <p className="text-[11px] text-[#E5DDD3] truncate">
                  {tr(
                    language,
                    'Snap a photo of handwritten or printed items to save all directly into the cart',
                    'కాగితంపై వ్రాసిన వస్తువుల ఫోటో తీసి అన్నింటినీ ఒకేసారి కార్ట్‌లో సేవ్ చేయండి'
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr(language, 'Close', 'మూసివేయి')}
              className="p-2 rounded-xl hover:bg-white/15 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChosen}
            className="hidden"
          />

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
            {!capturedImage ? (
              <div className="space-y-3.5">
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[4/3] sm:aspect-video flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className={`w-full h-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
                  />

                  {!cameraReady && !cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#E5DDD3]">
                      <Loader2 className="w-7 h-7 animate-spin" />
                      <span className="text-xs font-medium">
                        {tr(language, 'Starting camera...', 'కెమెరా ప్రారంభమవుతోంది...')}
                      </span>
                    </div>
                  )}

                  {cameraError && (
                    <div className="absolute inset-0 p-5 flex flex-col items-center justify-center text-center gap-3 bg-slate-950/90">
                      <Camera className="w-10 h-10 text-amber-400" />
                      <p className="text-xs sm:text-sm text-slate-200 max-w-md">{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs sm:text-sm font-semibold flex items-center gap-2"
                      >
                        <ImagePlus className="w-4 h-4" />
                        {tr(language, 'Take or Choose Photo', 'ఫోటో తీయండి లేదా ఎంచుకోండి')}
                      </button>
                    </div>
                  )}

                  {cameraReady && (
                    <>
                      {/* Subtle framing guide */}
                      <div className="pointer-events-none absolute inset-4 sm:inset-6 rounded-xl border-2 border-dashed border-amber-300/70" />
                      <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/75 text-[11px] font-medium text-white">
                        {tr(
                          language,
                          'Keep the written paper list flat & well-lit',
                          'వ్రాసిన కాగితాన్ని స్పష్టమైన వెలుతురులో ఉంచండి'
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                        }
                        title={tr(language, 'Switch camera', 'కెమెరా మార్చండి')}
                        className="absolute top-3 right-3 px-2.5 py-1.5 rounded-xl bg-slate-950/75 hover:bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {tr(language, 'Flip', 'మార్చు')}
                      </button>
                    </>
                  )}
                </div>

                {/* Capture actions */}
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    disabled={!cameraReady}
                    onClick={handleCaptureFrame}
                    className="flex-1 min-w-[200px] sm:flex-none px-6 py-3 rounded-xl bg-[#0A2240] hover:bg-[#13325B] disabled:opacity-45 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#0A2240]/25"
                  >
                    <Camera className="w-4 h-4" />
                    {tr(language, 'Capture Paper & Read Items', 'ఫోటో తీసి వస్తువులను చదవండి')}
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-3 rounded-xl border border-[#DFD7CC] dark:border-slate-700 bg-[#F6F1EA] dark:bg-slate-800 hover:bg-[#EFE8DF] dark:hover:bg-slate-700 text-[#0A2240] dark:text-slate-100 text-xs sm:text-sm font-semibold flex items-center gap-2"
                  >
                    <ImagePlus className="w-4 h-4 text-[#9A4307]" />
                    {tr(language, 'Choose Photo', 'ఫోటో ఎంచుకోండి')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Captured photo preview bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-[#F6F1EA] dark:bg-slate-800/70 border border-[#E5DDD3] dark:border-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={capturedImage}
                      alt={tr(language, 'Captured paper list', 'తీసిన కాగితం ఫోటో')}
                      className="w-20 h-14 rounded-xl object-cover border border-[#DFD7CC] dark:border-slate-600 shrink-0 bg-white"
                    />
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-[#0A2240] dark:text-white flex items-center gap-1.5">
                        {scanning ? (
                          <>
                            <Sparkles className="w-4 h-4 text-[#9A4307] animate-pulse shrink-0" />
                            <span>
                              {tr(
                                language,
                                'Reading handwritten items...',
                                'కాగితంపై వ్రాసిన వస్తువులను చదువుతోంది...'
                              )}
                            </span>
                          </>
                        ) : rows.length > 0 ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                            <span>
                              {tr(
                                language,
                                `Detected ${rows.length} line item(s) — verify and save to cart`,
                                `${rows.length} వస్తువులు గుర్తించబడ్డాయి — సరిచూసి కార్ట్‌లో సేవ్ చేయండి`
                              )}
                            </span>
                          </>
                        ) : (
                          <span>
                            {tr(language, 'Paper Photo Ready', 'కాగితం ఫోటో సిద్ధంగా ఉంది')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#6D665E] dark:text-slate-400 mt-0.5">
                        {tr(
                          language,
                          'You can adjust any product, size, quantity, or price before adding to cart.',
                          'కార్ట్‌లో సేవ్ చేసే ముందు ఉత్పత్తి, సైజు, సంఖ్య లేదా ధరను మార్చుకోవచ్చు.'
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={scanning}
                      onClick={handleRetake}
                      className="px-3 py-2 rounded-xl border border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-[#F6F1EA] text-xs font-semibold text-[#0A2240] dark:text-slate-100 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {tr(language, 'Retake', 'మళ్లీ తీయండి')}
                    </button>
                    {!scanning && (
                      <button
                        type="button"
                        onClick={() => scanPaperPhoto(capturedImage)}
                        className="px-3 py-2 rounded-xl bg-[#EFE8DF] dark:bg-slate-700 hover:bg-[#DFD3C3] text-xs font-semibold text-[#9A4307] dark:text-amber-300 flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {tr(language, 'Re-read', 'మళ్లీ చదువు')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Loading Skeleton */}
                {scanning && (
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((k) => (
                      <div
                        key={k}
                        className="h-16 rounded-xl bg-[#F6F1EA] dark:bg-slate-800/70 animate-pulse border border-[#E5DDD3] dark:border-slate-700"
                      />
                    ))}
                  </div>
                )}

                {/* Scan Error */}
                {scanError && !scanning && (
                  <div className="p-3.5 rounded-xl bg-[#FCE8E6] dark:bg-rose-950/40 border border-[#F5C6C0] dark:border-rose-900 text-[#C23B2B] dark:text-rose-300 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-relaxed">{scanError}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => scanPaperPhoto(capturedImage)}
                      className="px-3 py-1.5 rounded-lg bg-[#C23B2B] hover:bg-[#A32E20] text-white text-xs font-bold inline-flex items-center gap-1.5 self-end sm:self-center shrink-0 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {tr(language, 'Try Again', 'మళ్లీ ప్రయత్నించు')}
                    </button>
                  </div>
                )}

                {/* Review List */}
                {!scanning && (
                  <div className="space-y-2.5">
                    {rows.map((row) => {
                      const prod = row.productId ? productMap.get(row.productId) : undefined;
                      const variants = prod ? parseVariants(prod.variantsSummary) : [];
                      const confLabel =
                        row.confidence === 'high'
                          ? tr(language, 'Matched', 'సరిపోయింది')
                          : row.confidence === 'medium'
                          ? tr(language, 'Check', 'సరిచూడండి')
                          : tr(language, 'Unsure', 'సందేహం');

                      return (
                        <div
                          key={row.rowId}
                          className={`p-3 rounded-2xl border transition-colors space-y-2.5 ${
                            row.checked && row.productId
                              ? 'border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-950/60'
                              : 'border-[#F0D9B5] dark:border-amber-900/60 bg-[#FDF3DF]/40 dark:bg-amber-950/15'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <label className="flex items-start gap-2.5 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                checked={row.checked}
                                disabled={!row.productId}
                                onChange={(e) => updateRow(row.rowId, { checked: e.target.checked })}
                                className="mt-0.5 w-4 h-4 rounded accent-[#0A2240] shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#0A2240] dark:text-slate-100 truncate">
                                  {tr(language, 'Paper:', 'కాగితంలో:')} &ldquo;{row.writtenText}&rdquo;
                                </div>
                              </div>
                            </label>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  row.productId && row.confidence === 'high'
                                    ? 'bg-emerald-100 text-[#15803D] dark:bg-emerald-950 dark:text-emerald-300'
                                    : row.productId
                                    ? 'bg-[#EFE8DF] text-[#9A4307] dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-amber-100 text-[#9A4307] dark:bg-amber-950 dark:text-amber-300'
                                }`}
                              >
                                {row.productId ? confLabel : tr(language, 'Select Product', 'ఉత్పత్తి ఎంచుకోండి')}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setRows((prev) => prev.filter((item) => item.rowId !== row.rowId))
                                }
                                title={tr(language, 'Remove row', 'తొలగించు')}
                                className="p-1 rounded-lg text-rose-500 hover:bg-[#FCE8E6] dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            {/* Product selector */}
                            <div className={variants.length > 0 ? 'sm:col-span-5' : 'sm:col-span-7'}>
                              <select
                                value={row.productId}
                                onChange={(e) => handleChangeRowProduct(row.rowId, e.target.value)}
                                className="w-full px-2.5 py-2 text-xs rounded-xl border border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
                              >
                                <option value="">
                                  {tr(language, '-- Select Product --', '-- ఉత్పత్తిని ఎంచుకోండి --')}
                                </option>
                                {sortedProducts.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {translateProductName(p, language)} ({p.productCode})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Variant selector when available */}
                            {variants.length > 0 && (
                              <div className="sm:col-span-2">
                                <select
                                  value={row.variantLabel}
                                  onChange={(e) =>
                                    handleChangeRowVariant(row.rowId, row.productId, e.target.value)
                                  }
                                  className="w-full px-2 py-2 text-xs rounded-xl border border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
                                >
                                  {variants.map((v) => (
                                    <option key={v.label} value={v.label}>
                                      {translateVariantLabel(v.label, language)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Quantity */}
                            <div className="sm:col-span-3 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateRow(row.rowId, {
                                    quantity: Math.max(1, Math.round((row.quantity - 1) * 100) / 100),
                                  })
                                }
                                className="w-7 h-8 rounded-lg border border-[#DFD7CC] dark:border-slate-700 flex items-center justify-center hover:bg-[#F6F1EA] dark:hover:bg-slate-800 shrink-0"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min={0.01}
                                step="any"
                                value={row.quantity}
                                onChange={(e) =>
                                  updateRow(row.rowId, {
                                    quantity: Math.max(0.01, Number(e.target.value) || 1),
                                  })
                                }
                                aria-label={tr(language, 'Quantity', 'సంఖ్య')}
                                className="w-full px-2 py-1.5 text-center text-xs font-mono font-bold rounded-lg border border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateRow(row.rowId, {
                                    quantity: Math.round((row.quantity + 1) * 100) / 100,
                                  })
                                }
                                className="w-7 h-8 rounded-lg border border-[#DFD7CC] dark:border-slate-700 flex items-center justify-center hover:bg-[#F6F1EA] dark:hover:bg-slate-800 shrink-0"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Rate */}
                            <div className="sm:col-span-2 flex items-center gap-1">
                              <span className="text-xs text-[#8A8279]">₹</span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={row.unitPrice}
                                onChange={(e) =>
                                  updateRow(row.rowId, {
                                    unitPrice: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                aria-label={tr(language, 'Unit Price', 'ధర')}
                                className="w-full px-2 py-1.5 text-right text-xs font-mono font-semibold rounded-lg border border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddEmptyRow}
                      className="w-full py-2.5 rounded-xl border border-dashed border-[#D5CBBE] dark:border-slate-700 text-xs font-semibold text-[#9A4307] dark:text-amber-400 hover:bg-[#F6F1EA] dark:hover:bg-slate-800/60 flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {tr(language, 'Add Another Item Row', 'మరొక వస్తువును జోడించండి')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {capturedImage && !scanning && (
            <div className="px-4 py-3 border-t border-[#E5DDD3] dark:border-slate-800 bg-[#F6F1EA] dark:bg-slate-950/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs">
                <span className="text-[#6D665E] dark:text-slate-400">
                  {tr(language, 'Selected Total:', 'ఎంచుకున్న మొత్తం:')}{' '}
                </span>
                <span className="font-mono font-bold text-[#0A2240] dark:text-white text-sm tabular-nums">
                  {formatCurrency(estimatedTotal)}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2.5 rounded-xl border border-[#E5DDD3] dark:border-slate-700 text-xs font-semibold text-[#2D3138] dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                >
                  {tr(language, 'Cancel', 'రద్దు చేయండి')}
                </button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  disabled={validSelectedRows.length === 0}
                  onClick={handleSaveAllToCart}
                  className="px-4 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] disabled:opacity-45 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-[#0A2240]/25"
                >
                  <ShoppingCart className="w-4 h-4" />
                  {tr(
                    language,
                    `Save All to Cart (${validSelectedRows.length})`,
                    `కార్ట్‌లో అన్నీ సేవ్ చేయండి (${validSelectedRows.length})`
                  )}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
    </ModalPortal>
  );
};
