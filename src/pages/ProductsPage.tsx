import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Barcode,
  Camera,
  Check,
  Download,
  Edit3,
  Image as ImageIcon,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { parseVariants } from '../lib/seedData';
import { Product } from '../types/billing';
import { getDefaultProductImage, resolveProductImage } from '../lib/productImages';
import { ModalPortal } from '../components/ModalPortal';
import {
  tr,
  translateCategory,
  translateProductName,
  translateUnit,
  translateVariantLabel,
} from '../lib/i18n';
import {
  deriveMixedVerificationCode,
  downloadCode128Png,
  generateCode128SvgDataUrl,
  generateCode128Value,
} from '../lib/barcodeAndBillImage';

interface ProductsPageProps {
  onQuickAddToBill?: (product: Product, variantLabel?: string, variantPrice?: number, openCart?: boolean) => void;
}

interface SizeRow {
  key: string;
  label: string;
  price: string;
}

const makeRowKey = () => `sz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function variantsToSizeRows(variantsSummary?: string): SizeRow[] {
  return parseVariants(variantsSummary).map((v) => ({
    key: makeRowKey(),
    label: v.label,
    price: Number.isFinite(v.price) ? String(v.price) : '',
  }));
}

function serializeSizeRows(rows: SizeRow[]): string {
  return rows
    .map((r) => {
      const cleanLabel = r.label.replace(/[:|]/g, '').trim();
      const numPrice = Number(r.price);
      if (!cleanLabel || !Number.isFinite(numPrice) || numPrice < 0) return null;
      return `${cleanLabel}:${Math.round(numPrice * 100) / 100}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join('|')
    .slice(0, 1000);
}

function compressCanvasSource(
  source: HTMLImageElement | HTMLVideoElement,
  naturalWidth: number,
  naturalHeight: number,
  maxDim = 512,
  quality = 0.84
): string {
  const scale = Math.min(1, maxDim / Math.max(naturalWidth, naturalHeight));
  const targetW = Math.max(1, Math.round(naturalWidth * scale));
  const targetH = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing unavailable in this browser.');
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (dataUrl.length > 340000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.68);
  }
  return dataUrl;
}

async function compressImageSource(input: File | string): Promise<string> {
  if (typeof input === 'string' && !input.startsWith('data:') && !input.startsWith('blob:')) {
    return input;
  }

  const objectUrl = typeof input === 'string' ? null : URL.createObjectURL(input);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image.'));
      el.src = objectUrl || (input as string);
    });
    return compressCanvasSource(img, img.naturalWidth || 512, img.naturalHeight || 512);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ onQuickAddToBill }) => {
  const { products, categories, saveProduct, deleteProduct, saveCategory } = useBillingData();
  const { isAdmin, userAccount, language } = useAuth();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [barcodePreviewProduct, setBarcodePreviewProduct] = useState<Product | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [deletingProd, setDeletingProd] = useState(false);

  // Inline Quick Size & Price Editor state per Product Card
  const [editingSizesProductId, setEditingSizesProductId] = useState<string | null>(null);
  const [cardSizeRows, setCardSizeRows] = useState<SizeRow[]>([]);
  const [cardBasePrice, setCardBasePrice] = useState<string>('0');
  const [savingCardSizes, setSavingCardSizes] = useState(false);
  const [savedCardSizesId, setSavedCardSizesId] = useState<string | null>(null);

  const [pressedSize, setPressedSize] = useState<{
    key: string;
    product: Product;
    label?: string;
    price: number;
    nonce: number;
  } | null>(null);
  const popTimerRef = useRef<number | null>(null);

  const canManage = isAdmin || Boolean(userAccount?.canManageProducts);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== 'All' && p.category !== catFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.nameTe && p.nameTe.toLowerCase().includes(q)) ||
        p.productCode.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });
  }, [products, search, catFilter]);

  const openInlineSizeEditor = (product: Product) => {
    if (editingSizesProductId === product.id) {
      setEditingSizesProductId(null);
      return;
    }
    setEditingSizesProductId(product.id);
    setCardSizeRows(variantsToSizeRows(product.variantsSummary));
    setCardBasePrice(String(product.sellingPrice ?? 0));
  };

  const handleSaveInlineSizes = async (product: Product) => {
    setSavingCardSizes(true);
    try {
      const serialized = serializeSizeRows(cardSizeRows);
      const parsedNext = parseVariants(serialized);
      const parsedBase = Number(cardBasePrice);
      const nextSellingPrice =
        parsedNext.length > 0
          ? Number.isFinite(parsedBase) && parsedBase > 0
            ? parsedBase
            : parsedNext[0].price
          : Number.isFinite(parsedBase) && parsedBase >= 0
          ? parsedBase
          : product.sellingPrice;

      await saveProduct({
        ...product,
        variantsSummary: serialized,
        sellingPrice: nextSellingPrice,
      });

      setEditingSizesProductId(null);
      setSavedCardSizesId(product.id);
      window.setTimeout(() => {
        setSavedCardSizesId((curr) => (curr === product.id ? null : curr));
      }, 2000);
    } catch (err) {
      setStatusMsg(
        err instanceof Error
          ? err.message
          : tr(language, 'Could not save size prices.', 'సైజు ధరలు సేవ్ చేయడం విఫలమైంది.')
      );
    } finally {
      setSavingCardSizes(false);
    }
  };

  return (
    <div className="space-y-4 animate-slp-in">
      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() =>
              setEditing({
                name: '',
                nameTe: '',
                category: categories[0]?.name || 'Darwaja',
                barcode: generateCode128Value(),
                purchasePrice: 0,
                sellingPrice: 0,
                stock: 20,
                lowStockThreshold: 10,
                taxRate: 0,
                unit: 'Piece',
                variantsSummary: '',
              })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-bold hover:bg-[#13325B] shadow-sm"
          >
            <Plus className="w-4 h-4" /> {tr(language, 'Add Product', 'కొత్త ఉత్పత్తి చేర్చండి')}
          </motion.button>
        </div>
      )}

      {statusMsg && (
        <div className="px-4 py-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-200 flex items-center justify-between gap-2">
          <span>{statusMsg}</span>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-sky-600 hover:text-sky-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8A8279] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr(
              language,
              'Search products in English, తెలుగు, code, or barcode...',
              'ఉత్పత్తి పేరు, కోడ్ లేదా బార్‌కోడ్ ద్వారా వెతకండి...'
            )}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="All">{tr(language, 'All Categories', 'అన్ని వర్గాలు')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {language === 'te'
                ? translateCategory(c.name, categories, 'te')
                : `${c.name}${c.nameTe ? ` (${c.nameTe})` : ''}`}
            </option>
          ))}
        </select>
      </div>

      {/* Product Cards Grid with Animated Sizes, Photos & Inline Size-Price Editing */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((product) => {
          const variants = parseVariants(product.variantsSummary);
          const isLow = product.stock <= (product.lowStockThreshold ?? 10);
          const isCardActive = pressedSize?.product.id === product.id;
          const isEditingSizes = editingSizesProductId === product.id;
          const justSavedSizes = savedCardSizesId === product.id;

          const handleSizeTap = (label?: string, price?: number) => {
            const key = `${product.id}::${label || 'BASE'}`;
            const finalPrice = price ?? product.sellingPrice;
            if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
            setPressedSize({
              key,
              product,
              label,
              price: finalPrice,
              nonce: Date.now() + Math.random(),
            });
            onQuickAddToBill?.(product, label, finalPrice, false);
            popTimerRef.current = window.setTimeout(() => setPressedSize(null), 900);
          };

          return (
            <motion.div
              key={product.id}
              whileHover={{ y: -2 }}
              animate={isCardActive ? { scale: [1, 1.015, 1] } : { scale: 1 }}
              transition={{ duration: 0.25 }}
              className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 transition-colors shadow-sm shadow-[#0A2240]/5 ${
                isCardActive
                  ? 'border-[#0A2240] ring-2 ring-[#0A2240]/20'
                  : isEditingSizes
                  ? 'border-[#0A2240]/60 ring-1 ring-[#0A2240]/15'
                  : 'border-[#E5DDD3] dark:border-slate-800'
              }`}
            >
              <div className="flex gap-3.5 justify-between">
                <div className="w-20 h-20 rounded-xl bg-[#F6F1EA] dark:bg-slate-800 border border-[#E5DDD3] dark:border-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                  <img
                    src={resolveProductImage(product)}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const fallback = getDefaultProductImage(product.name, product.category);
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#0A2240] dark:text-white truncate">
                        {translateProductName(product, language)}
                      </h3>
                      {language !== 'te' && product.nameTe && (
                        <div className="text-xs font-medium text-[#9A4307] dark:text-sky-400 truncate">
                          {product.nameTe}
                        </div>
                      )}
                      <div className="text-[11px] text-[#6D665E] mt-0.5">
                        {translateCategory(product.category, categories, language)} ·{' '}
                        <span className="font-mono">{product.productCode}</span>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openInlineSizeEditor(product)}
                          title={tr(language, 'Edit Sizes & Prices', 'సైజులు & ధరలు సవరించు')}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            isEditingSizes
                              ? 'bg-[#0A2240] border-[#0A2240] text-white'
                              : 'border-[#DFD7CC] dark:border-slate-700 text-[#9A4307] dark:text-sky-300 hover:bg-[#F6F1EA] dark:hover:bg-slate-800'
                          }`}
                        >
                          <Ruler className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(product)}
                          title={tr(language, 'Edit Full Product & Photo', 'ఉత్పత్తి & ఫోటో సవరించు')}
                          className="p-1.5 rounded-lg border border-[#DFD7CC] dark:border-slate-700 text-[#0A2240] dark:text-slate-300 hover:bg-[#F6F1EA] dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmProduct(product)}
                            title={tr(
                              language,
                              'Move Product to Removed Bills & Products (10-Day Recovery)',
                              'ఉత్పత్తిని తొలగించిన జాబితాకు తరలించండి (10 రోజుల పునరుద్ధరణ)'
                            )}
                            className="p-1.5 rounded-lg border border-[#F5C6C0] dark:border-rose-900 text-[#C23B2B] hover:bg-[#FCE8E6] dark:hover:bg-rose-950"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Size Chips (Tap adds to bill) */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {variants.length > 0 ? (
                      variants.map((v) => {
                        const chipKey = `${product.id}::${v.label}`;
                        const isPressed = pressedSize?.key === chipKey;
                        return (
                          <motion.button
                            key={v.label}
                            type="button"
                            whileTap={{ scale: 0.86 }}
                            whileHover={{ scale: 1.04 }}
                            animate={isPressed ? { scale: [0.9, 1.08, 1] } : { scale: 1 }}
                            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => handleSizeTap(v.label, v.price)}
                            className={`relative overflow-visible px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold transition-colors ${
                              isPressed
                                ? 'bg-[#0A2240] border-[#0A2240] text-white shadow-md shadow-[#0A2240]/25'
                                : 'bg-[#F6F1EA] dark:bg-slate-800 border-[#DFD7CC] dark:border-slate-700 text-[#0A2240] dark:text-slate-200 hover:border-[#0A2240]'
                            }`}
                          >
                            {isPressed && (
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 rounded-lg border-2 border-[#0A2240] animate-slp-ring"
                              />
                            )}
                            {translateVariantLabel(v.label, language)}: ₹{v.price}
                          </motion.button>
                        );
                      })
                    ) : (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleSizeTap(undefined, product.sellingPrice)}
                        className="px-2.5 py-1 rounded-lg bg-[#F6F1EA] dark:bg-slate-800 border border-[#DFD7CC] dark:border-slate-700 font-mono text-xs font-bold text-[#9A4307] dark:text-sky-300"
                      >
                        ₹{product.sellingPrice}
                      </motion.button>
                    )}

                    {canManage && !isEditingSizes && (
                      <button
                        type="button"
                        onClick={() => openInlineSizeEditor(product)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-[#D5CBBE] dark:border-slate-600 text-[10px] font-semibold text-[#9A4307] dark:text-sky-400 hover:bg-[#F6F1EA] dark:hover:bg-slate-800"
                      >
                        <Ruler className="w-3 h-3" />
                        {tr(language, 'Edit Prices', 'ధరలు మార్చు')}
                      </button>
                    )}

                    {justSavedSizes && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#15803D] dark:text-emerald-400">
                        <Check className="w-3 h-3" /> {tr(language, 'Saved', 'సేవ్ అయింది')}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#6D665E]">
                    <span>
                      {tr(language, 'Stock:', 'స్టాక్:')}{' '}
                      <strong className={`font-mono ${isLow ? 'text-[#C23B2B]' : 'text-[#1F242B] dark:text-slate-200'}`}>
                        {product.stock} {translateUnit(product.unit, language)}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setBarcodePreviewProduct(product)}
                      className="inline-flex items-center gap-1 font-mono text-[#9A4307] hover:underline"
                      title={tr(language, 'View / Download Code 128 Barcode', 'కోడ్ 128 బార్‌కోడ్ చూడండి / డౌన్‌లోడ్ చేయండి')}
                    >
                      <Barcode className="w-3.5 h-3.5" />
                      {product.barcode || deriveMixedVerificationCode(product.id || product.productCode)}
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline Quick Size Name & Price Editor Directly Inside Product Card */}
              {canManage && isEditingSizes && (
                <div className="pt-3 border-t border-[#E5DDD3] dark:border-slate-800 space-y-2.5 bg-[#F6F1EA] dark:bg-slate-950/50 -mx-4 -mb-4 p-3.5 rounded-b-2xl">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#0A2240] dark:text-sky-300 flex items-center gap-1.5">
                      <Ruler className="w-3.5 h-3.5 text-[#9A4307]" />
                      {tr(language, 'Quick Size & Price Editor', 'సైజు & ధర సులభ సవరణ')}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCardSizeRows((prev) => [
                          ...prev,
                          { key: makeRowKey(), label: '', price: cardBasePrice || '0' },
                        ])
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0A2240] text-white text-[10px] font-semibold hover:bg-[#13325B]"
                    >
                      <Plus className="w-3 h-3" /> {tr(language, 'Add Size', 'సైజు చేర్చు')}
                    </button>
                  </div>

                  {cardSizeRows.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_96px_30px] gap-1.5 text-[10px] font-semibold text-[#6D665E] px-0.5">
                        <span>{tr(language, 'Size Name', 'సైజు పేరు')}</span>
                        <span>{tr(language, 'Price (₹)', 'ధర (₹)')}</span>
                        <span />
                      </div>
                      {cardSizeRows.map((row) => (
                        <div key={row.key} className="grid grid-cols-[1fr_96px_30px] gap-1.5 items-center">
                          <input
                            type="text"
                            value={row.label}
                            onChange={(e) =>
                              setCardSizeRows((prev) =>
                                prev.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r))
                              )
                            }
                            placeholder={tr(language, 'e.g. 6FT', 'ఉదా: 6 అడుగులు')}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.price}
                            onChange={(e) =>
                              setCardSizeRows((prev) =>
                                prev.map((r) => (r.key === row.key ? { ...r, price: e.target.value } : r))
                              )
                            }
                            placeholder="0"
                            className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => setCardSizeRows((prev) => prev.filter((r) => r.key !== row.key))}
                            title={tr(language, 'Remove Size', 'సైజు తొలగించు')}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-[#FCE8E6] dark:hover:bg-rose-950/40 flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-medium text-[#6D665E] dark:text-slate-300 shrink-0">
                        {tr(language, 'Selling Price (₹):', 'అమ్మకం ధర (₹):')}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={cardBasePrice}
                        onChange={(e) => setCardBasePrice(e.target.value)}
                        className="w-32 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={savingCardSizes}
                      onClick={() => setEditingSizesProductId(null)}
                      className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-[#2D3138] dark:text-slate-300"
                    >
                      {tr(language, 'Cancel', 'రద్దు')}
                    </button>
                    <button
                      type="button"
                      disabled={savingCardSizes}
                      onClick={() => handleSaveInlineSizes(product)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0A2240] hover:bg-[#0A2240] text-white text-[11px] font-bold disabled:opacity-50"
                    >
                      {savingCardSizes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {savingCardSizes
                        ? tr(language, 'Saving...', 'సేవ్ అవుతోంది...')
                        : tr(language, 'Save Prices', 'ధరలు సేవ్ చేయి')}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {editing && (
        <ProductEditorModal
          initial={editing}
          categories={categories.map((c) => c.name)}
          language={language}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (data.category && !categories.some((c) => c.name === data.category)) {
              await saveCategory(data.category);
            }
            await saveProduct(data);
            setEditing(null);
          }}
        />
      )}

      {barcodePreviewProduct && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-5 space-y-4 shadow-xl max-h-[92dvh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0A2240] dark:text-white">
                    {tr(language, 'Code 128 Product Barcode', 'కోడ్ 128 ఉత్పత్తి బార్‌కోడ్')}
                  </h3>
                  <p className="text-xs text-[#6D665E] truncate">
                    {translateProductName(barcodePreviewProduct, language)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBarcodePreviewProduct(null)}
                  className="p-1.5 rounded-lg text-[#8A8279] hover:text-[#2D3138]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-white rounded-xl border border-[#E5DDD3] p-3 flex flex-col items-center">
                <img
                  src={generateCode128SvgDataUrl(
                    barcodePreviewProduct.barcode ||
                      deriveMixedVerificationCode(barcodePreviewProduct.id || barcodePreviewProduct.productCode)
                  )}
                  alt={translateProductName(barcodePreviewProduct, language)}
                  className="h-16 w-auto object-contain"
                />
                <span className="text-[11px] text-[#6D665E] mt-1">
                  {tr(language, 'Symbology: Code 128', 'రకం: కోడ్ 128')}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadCode128Png(
                    barcodePreviewProduct.barcode ||
                      deriveMixedVerificationCode(barcodePreviewProduct.id || barcodePreviewProduct.productCode),
                    `${barcodePreviewProduct.productCode}_Code128.png`
                  )
                }
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B]"
              >
                <Download className="w-3.5 h-3.5" />
                {tr(language, 'Download Code 128 Label (PNG)', 'కోడ్ 128 లేబుల్ డౌన్‌లోడ్ (పీఎన్‌జీ)')}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {deleteConfirmProduct && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-[#F5C6C0] dark:border-rose-900 p-5 space-y-4 shadow-2xl max-h-[92dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#0A2240] dark:text-white">
                    {tr(language, 'Remove Product', 'ఉత్పత్తిని తొలగించు')} · {translateProductName(deleteConfirmProduct, language)}?
                  </h3>
                  <p className="text-xs text-[#6D665E] mt-0.5 font-mono">
                    {deleteConfirmProduct.productCode} · ₹{deleteConfirmProduct.sellingPrice}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmProduct(null)}
                  className="p-1 text-[#8A8279] hover:text-[#2D3138]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-xl bg-[#FDF3DF] border border-[#F0D9B5] p-3 text-xs text-[#7C3405] leading-relaxed">
                {language === 'te' ? (
                  <>
                    &quot;{translateProductName(deleteConfirmProduct, 'te')}&quot; <strong>సెట్టింగ్స్ &rarr; తొలగించిన బిల్లులు &amp; ఉత్పత్తులు</strong> లోకి తరలించబడుతుంది మరియు శాశ్వత తొలగింపుకు ముందు <strong>10 రోజులు</strong> ఉంచబడుతుంది.
                  </>
                ) : (
                  <>
                    &quot;{deleteConfirmProduct.name}&quot; will be moved to{' '}
                    <strong>Settings &rarr; Removed Bills &amp; Products</strong> and kept for{' '}
                    <strong>10 days</strong> before permanent removal.
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={deletingProd}
                  onClick={() => setDeleteConfirmProduct(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5DDD3] text-xs font-semibold text-[#2D3138]"
                >
                  {tr(language, 'Cancel', 'రద్దు')}
                </button>
                <button
                  type="button"
                  disabled={deletingProd}
                  onClick={async () => {
                    setDeletingProd(true);
                    try {
                      const removedName = translateProductName(deleteConfirmProduct, language);
                      await deleteProduct(deleteConfirmProduct.id);
                      setDeleteConfirmProduct(null);
                      setStatusMsg(
                        tr(
                          language,
                          `Moved "${removedName}" to Settings → Removed Bills & Products (kept for 10 days).`,
                          `"${removedName}" సెట్టింగ్స్ → తొలగించిన బిల్లులు & ఉత్పత్తులలోకి తరలించబడింది (10 రోజులు ఉంటుంది).`
                        )
                      );
                    } catch (err) {
                      setStatusMsg(
                        err instanceof Error
                          ? err.message
                          : tr(language, 'Failed to remove product.', 'ఉత్పత్తిని తొలగించడం విఫలమైంది.')
                      );
                      setDeleteConfirmProduct(null);
                    } finally {
                      setDeletingProd(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C23B2B] hover:bg-[#A32E20] text-white text-xs font-bold disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingProd
                    ? tr(language, 'Removing...', 'తొలగిస్తోంది...')
                    : tr(language, 'Move to Removed Products', 'తొలగించిన జాబితాకు తరలించు')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

const ProductEditorModal: React.FC<{
  initial: Partial<Product>;
  categories: string[];
  language: 'en' | 'te';
  onClose: () => void;
  onSave: (
    data: Partial<Product> & {
      name: string;
      category: string;
      purchasePrice: number;
      sellingPrice: number;
      stock: number;
      taxRate: number;
    }
  ) => Promise<void>;
}> = ({ initial, categories, language, onClose, onSave }) => {
  const [form, setForm] = useState({
    id: initial.id,
    productCode: initial.productCode || '',
    name: initial.name || '',
    nameTe: initial.nameTe || '',
    category: initial.category || categories[0] || 'Darwaja',
    barcode: initial.barcode || '',
    purchasePrice: initial.purchasePrice ?? 0,
    sellingPrice: initial.sellingPrice ?? 0,
    stock: initial.stock ?? 0,
    lowStockThreshold: initial.lowStockThreshold ?? 10,
    taxRate: 0,
    unit: initial.unit || 'Piece',
    variantsSummary: initial.variantsSummary || '',
    imageUrl: initial.imageUrl || '',
    description: initial.description || '',
  });
  const [sizeRows, setSizeRows] = useState<SizeRow[]>(() => variantsToSizeRows(initial.variantsSummary));
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [translating, setTranslating] = useState(false);
  const [generatingImg, setGeneratingImg] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Live Camera Photo state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFileFallbackRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (!cameraOpen) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    setCameraError(null);
    setCameraReady(false);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          tr(
            language,
            'Live camera unavailable here. Use "Device Camera File" or "Upload Photo".',
            'లైవ్ కెమెరా ఇక్కడ అందుబాటులో లేదు. "పరికర కెమెరా" లేదా "ఫోటో అప్‌లోడ్" వాడండి.'
          )
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (!cancelled) setCameraReady(true);
        }
      } catch {
        if (!cancelled) {
          setCameraError(
            tr(
              language,
              'Camera permission denied or blocked. Use "Device Camera File" or "Upload Photo" below.',
              'కెమెరా అనుమతి నిరాకరించబడింది. క్రింద ఉన్న "పరికర కెమెరా" లేదా "ఫోటో అప్‌లోడ్" వాడండి.'
            )
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen, facingMode, language, stopCameraStream]);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProcessingPhoto(true);
    setPhotoError(null);
    try {
      const compressed = await compressImageSource(file);
      setForm((f) => ({ ...f, imageUrl: compressed }));
      setCameraOpen(false);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : tr(language, 'Could not process image file.', 'చిత్రాన్ని ప్రాసెస్ చేయడం సాధ్యం కాలేదు.')
      );
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleCaptureCameraFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    setProcessingPhoto(true);
    setPhotoError(null);
    try {
      const compressed = compressCanvasSource(video, video.videoWidth, video.videoHeight);
      setForm((f) => ({ ...f, imageUrl: compressed }));
      setCameraOpen(false);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : tr(language, 'Failed to capture camera photo.', 'కెమెరా ఫోటో తీయడం విఫలమైంది.')
      );
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleTranslateTe = async () => {
    if (!form.name.trim()) return;
    setTranslating(true);
    setPhotoError(null);
    try {
      const res = await fetch('/api/ai/quick-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'translate_telugu', input: form.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm((f) => ({ ...f, nameTe: data.text }));
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : tr(language, 'Translation unavailable.', 'అనువాదం అందుబాటులో లేదు.')
      );
    } finally {
      setTranslating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!form.name.trim()) {
      setPhotoError(tr(language, 'Enter Product Name first to generate a photo.', 'ఫోటో తయారు చేయడానికి ముందు ఉత్పత్తి పేరు నమోదు చేయండి.'));
      return;
    }
    setGeneratingImg(true);
    setPhotoError(null);
    try {
      const res = await fetch('/api/ai/generate-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${form.name} (${form.category}) ${form.description}`,
          imageSize,
          aspectRatio: '1:1',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const compressed = await compressImageSource(data.imageDataUrl);
      setForm((f) => ({ ...f, imageUrl: compressed }));
      setCameraOpen(false);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : tr(
              language,
              'AI studio photo generation failed. You can upload from device or take a camera photo anytime.',
              'ఏఐ ఫోటో తయారీ విఫలమైంది. మీరు పరికరం నుండి అప్‌లోడ్ చేయవచ్చు లేదా కెమెరాతో ఫోటో తీయవచ్చు.'
            )
      );
    } finally {
      setGeneratingImg(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const serializedVariants = serializeSizeRows(sizeRows);
      const parsedVariants = parseVariants(serializedVariants);
      const effectiveSellingPrice =
        Number(form.sellingPrice) > 0
          ? Number(form.sellingPrice)
          : parsedVariants[0]?.price ?? 0;

      stopCameraStream();
      await onSave({
        ...form,
        variantsSummary: serializedVariants,
        sellingPrice: effectiveSellingPrice,
      });
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = resolveProductImage({
    name: form.name || 'Product',
    category: form.category,
    imageUrl: form.imageUrl,
  });

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        >
          {/* Pinned Header */}
          <div className="px-4 sm:px-6 py-3.5 bg-[#0A2240] text-white flex items-center justify-between shrink-0">
            <h3 className="text-sm sm:text-base font-bold">
              {form.id
                ? tr(language, 'Edit Product', 'ఉత్పత్తిని సవరించండి')
                : tr(language, 'Add Product', 'కొత్త ఉత్పత్తి చేర్చండి')}
            </h3>
            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Product Name (English) *', 'ఉత్పత్తి పేరు (ఇంగ్లీష్) *')}
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-[#6D665E] dark:text-slate-300">
                    {tr(language, 'Telugu Name (తెలుగు)', 'తెలుగు పేరు *')}
                  </label>
                  <button
                    type="button"
                    onClick={handleTranslateTe}
                    disabled={translating}
                    className="inline-flex items-center gap-1 text-[11px] text-[#9A4307] hover:underline"
                  >
                    <Languages className="w-3 h-3" />{' '}
                    {translating
                      ? tr(language, 'Translating...', 'అనువదిస్తోంది...')
                      : tr(language, 'Auto-Translate', 'స్వయంచాలక అనువాదం')}
                  </button>
                </div>
                <input
                  value={form.nameTe}
                  onChange={(e) => setForm({ ...form, nameTe: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Category *', 'వర్గం *')}
                </label>
                <input
                  required
                  list="slp-categories"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
                <datalist id="slp-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-[#6D665E] dark:text-slate-300">
                    {tr(language, 'Product Code / Code 128 Barcode', 'ఉత్పత్తి కోడ్ / కోడ్ 128 బార్‌కోడ్')}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        barcode: generateCode128Value(f.productCode || f.name),
                      }))
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9A4307] hover:underline"
                  >
                    <Barcode className="w-3 h-3" /> {tr(language, 'Generate Code 128', 'కోడ్ 128 తయారు చేయి')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={form.productCode}
                    onChange={(e) => setForm({ ...form, productCode: e.target.value })}
                    placeholder="SLP-001"
                    className="px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                  />
                  <input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder={tr(language, 'Code 128 Barcode', 'కోడ్ 128 బార్‌కోడ్')}
                    className="px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                  />
                </div>
                {(form.barcode || form.id || form.productCode) &&
                  (() => {
                    const previewCode =
                      form.barcode || deriveMixedVerificationCode(form.id || form.productCode || form.name || 'PROD');
                    return (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white p-2">
                        <img
                          src={generateCode128SvgDataUrl(previewCode)}
                          alt={tr(language, 'Code 128 Barcode Preview', 'కోడ్ 128 బార్‌కోడ్')}
                          className="h-11 w-auto object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            downloadCode128Png(
                              previewCode,
                              `${(form.productCode || 'product').replace(/[^a-zA-Z0-9_-]/g, '_')}_Code128.png`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#DFD7CC] text-[11px] font-semibold text-[#9A4307] hover:bg-[#F6F1EA] shrink-0"
                        >
                          <Download className="w-3 h-3" /> {tr(language, 'PNG', 'పీఎన్‌జీ')}
                        </button>
                      </div>
                    );
                  })()}
              </div>

              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Purchase Price (₹)', 'కొనుగోలు ధర (₹)')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Default Selling Price (₹) *', 'అమ్మకం ధర (₹) *')}
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Stock & Low Threshold', 'స్టాక్ & కనీస పరిమితి')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                    className="px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={0}
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                    className="px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Unit', 'యూనిట్')}
                </label>
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder={tr(language, 'e.g. piece, bag, bundle', 'ఉదా: పీస్, బస్తా, కట్ట')}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>

              {/* Separate Size Names & Prices Rows */}
              <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#DFD7CC] dark:border-slate-800 bg-[#F6F1EA] dark:bg-slate-950 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#1F242B] dark:text-slate-100 flex items-center gap-1.5">
                      <Ruler className="w-4 h-4 text-[#9A4307]" />
                      {tr(language, 'Size Names & Prices', 'సైజు పేర్లు & ధరలు')}
                    </div>
                    <p className="text-[11px] text-[#6D665E]">
                      {tr(
                        language,
                        'Add each size name and its selling price separately for one-tap billing.',
                        'ప్రతి సైజు పేరు మరియు దాని అమ్మకం ధరను విడివిడిగా నమోదు చేయండి.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSizeRows((prev) => [
                        ...prev,
                        { key: makeRowKey(), label: '', price: form.sellingPrice ? String(form.sellingPrice) : '' },
                      ])
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B]"
                  >
                    <Plus className="w-3.5 h-3.5" /> {tr(language, 'Add Size', 'సైజు చేర్చు')}
                  </button>
                </div>

                {sizeRows.length === 0 ? (
                  <div className="text-[11px] text-[#6D665E] bg-white dark:bg-slate-900 border border-dashed border-[#E5DDD3] dark:border-slate-700 rounded-lg px-3 py-2.5 text-center">
                    {tr(
                      language,
                      'No separate sizes added. Default selling price above will be used, or click "+ Add Size".',
                      'ప్రత్యేక సైజులు లేవు. పైనున్న అమ్మకం ధర వర్తిస్తుంది లేదా "+ సైజు చేర్చు" నొక్కండి.'
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_115px_36px] gap-2 text-[11px] font-semibold text-[#6D665E] px-1">
                      <span>{tr(language, 'Size Name (e.g. 6FT, Medium)', 'సైజు పేరు (ఉదా: 6 అడుగులు)')}</span>
                      <span>{tr(language, 'Price (₹)', 'ధర (₹)')}</span>
                      <span />
                    </div>
                    {sizeRows.map((row) => (
                      <div key={row.key} className="grid grid-cols-[1fr_115px_36px] gap-2 items-center">
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) =>
                            setSizeRows((prev) =>
                              prev.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r))
                            )
                          }
                          placeholder={tr(language, 'e.g. 6½FT', 'ఉదా: 6½ అడుగులు')}
                          className="px-3 py-2 text-xs rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.price}
                          onChange={(e) =>
                            setSizeRows((prev) =>
                              prev.map((r) => (r.key === row.key ? { ...r, price: e.target.value } : r))
                            )
                          }
                          placeholder="0"
                          className="px-3 py-2 text-xs font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setSizeRows((prev) => prev.filter((r) => r.key !== row.key))}
                          title={tr(language, 'Delete Size', 'సైజు తొలగించు')}
                          className="p-2 rounded-lg border border-[#F5C6C0] dark:border-rose-900 text-[#C23B2B] hover:bg-[#FCE8E6] dark:hover:bg-rose-950/40 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Photo: Generate Studio Photo + Upload from Device + Take Camera Photo */}
              <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#E5DDD3] dark:border-slate-800 bg-[#FAF8F5] dark:bg-slate-950 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#1F242B] dark:text-slate-100 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#9A4307]" />{' '}
                    {tr(language, 'Product Photo (Generate, Upload, or Camera)', 'ఉత్పత్తి ఫోటో (తయారీ, అప్‌లోడ్ లేదా కెమెరా)')}
                  </span>
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-[#6D665E] hover:text-[#C23B2B]"
                    >
                      <RotateCcw className="w-3 h-3" /> {tr(language, 'Reset Photo', 'ఫోటో తీసివేయి')}
                    </button>
                  )}
                </div>

                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadFile}
                  className="hidden"
                />
                <input
                  ref={cameraFileFallbackRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleUploadFile}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  {/* Live Square Photo Preview */}
                  <div className="w-24 h-24 rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-700 shrink-0 overflow-hidden flex items-center justify-center relative">
                    <img
                      src={previewSrc}
                      alt={form.name || 'Product preview'}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const fallback = getDefaultProductImage(form.name || 'Product', form.category);
                        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                      }}
                      className="w-full h-full object-cover"
                    />
                    {processingPhoto && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* 3 Photo Action Controls */}
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={processingPhoto}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-200 text-xs font-semibold hover:bg-[#F6F1EA] dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#9A4307]" />
                        {tr(language, 'Upload from Device', 'పరికరం నుండి అప్‌లోడ్')}
                      </button>

                      <button
                        type="button"
                        onClick={() => setCameraOpen((prev) => !prev)}
                        disabled={processingPhoto}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
                          cameraOpen
                            ? 'bg-[#0A2240] border-[#0A2240] text-white'
                            : 'border-[#DFD7CC] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-200 hover:bg-[#F6F1EA] dark:hover:bg-slate-800'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {cameraOpen
                          ? tr(language, 'Close Camera', 'కెమెరా మూసివేయి')
                          : tr(language, 'Take Camera Photo', 'కెమెరాతో ఫోటో తీయి')}
                      </button>

                      <div className="inline-flex items-center gap-1">
                        <select
                          value={imageSize}
                          onChange={(e) => setImageSize(e.target.value as '1K' | '2K' | '4K')}
                          className="px-2 py-1.5 text-xs font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="1K">1K</option>
                          <option value="2K">2K</option>
                          <option value="4K">4K</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleGenerateImage}
                          disabled={generatingImg || processingPhoto}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#0A2240] disabled:opacity-50"
                        >
                          {generatingImg ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          )}
                          {generatingImg
                            ? tr(language, 'Generating...', 'తయారవుతోంది...')
                            : tr(language, 'Generate Photo', 'ఫోటో తయారు చేయి')}
                        </button>
                      </div>
                    </div>

                    <input
                      value={form.imageUrl.startsWith('data:') ? '' : form.imageUrl}
                      onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                      placeholder={
                        form.imageUrl.startsWith('data:')
                          ? tr(
                              language,
                              'Custom compressed photo attached (saved automatically)',
                              'కస్టమ్ ఫోటో జతచేయబడింది (స్వయంచాలకంగా సేవ్ అవుతుంది)'
                            )
                          : tr(language, 'Or paste image URL (https://...)', 'లేదా చిత్రం లింక్ (https://...)')
                      }
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                {/* Inline Live Camera Capture Panel */}
                {cameraOpen && (
                  <div className="rounded-xl border border-[#DFD7CC] dark:border-slate-700 bg-slate-950 overflow-hidden space-y-2 p-2.5">
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className={`w-full h-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
                      />
                      {!cameraReady && !cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#E5DDD3] text-xs">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span>{tr(language, 'Starting camera...', 'కెమెరా ప్రారంభమవుతోంది...')}</span>
                        </div>
                      )}
                      {cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-amber-200">
                          <p>{cameraError}</p>
                          <button
                            type="button"
                            onClick={() => cameraFileFallbackRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A2240] text-white font-semibold"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            {tr(language, 'Open Device Camera', 'పరికర కెమెరా తెరవండి')}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-[11px] font-semibold hover:bg-slate-700"
                        >
                          <RefreshCw className="w-3 h-3" /> {tr(language, 'Flip', 'మార్చు')}
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraFileFallbackRef.current?.click()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-[11px] font-semibold hover:bg-slate-700"
                        >
                          <Upload className="w-3 h-3" /> {tr(language, 'Device Camera File', 'పరికర కెమెరా ఫైల్')}
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={!cameraReady}
                        onClick={handleCaptureCameraFrame}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-45"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {tr(language, 'Capture Photo', 'ఫోటో తీయి')}
                      </button>
                    </div>
                  </div>
                )}

                {photoError && <p className="text-[11px] text-[#9A4307] dark:text-amber-400">{photoError}</p>}
              </div>
            </div>
          </div>

          {/* Pinned Footer */}
          <div className="px-4 sm:px-6 py-3 border-t border-[#E5DDD3] dark:border-slate-800 bg-[#FAF8F5] dark:bg-slate-950 flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                onClose();
              }}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {tr(language, 'Cancel', 'రద్దు')}
            </button>
            <button
              type="submit"
              disabled={saving || processingPhoto}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0A2240] text-white hover:bg-[#13325B] disabled:opacity-50"
            >
              {saving ? tr(language, 'Saving...', 'సేవ్ అవుతోంది...') : tr(language, 'Save Product', 'ఉత్పత్తిని సేవ్ చేయి')}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
};
