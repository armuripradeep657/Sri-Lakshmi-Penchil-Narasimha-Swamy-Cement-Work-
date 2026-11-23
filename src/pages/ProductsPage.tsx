import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Barcode,
  Download,
  Edit3,
  Image as ImageIcon,
  Languages,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { parseVariants } from '../lib/seedData';
import { Product } from '../types/billing';
import { getDefaultProductImage, resolveProductImage } from '../lib/productImages';
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
                taxRate: 18,
                unit: 'Piece',
                variantsSummary: '',
              })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs font-bold hover:bg-[#1E40AF] shadow-sm"
          >
            <Plus className="w-4 h-4" /> {tr(language, 'Add Product', 'కొత్త ఉత్పత్తి చేర్చండి')}
          </motion.button>
        </div>
      )}

      {statusMsg && (
        <div className="px-4 py-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-200">
          {statusMsg}
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr(
              language,
              'Search products in English, తెలుగు, code, or barcode...',
              'ఉత్పత్తి పేరు, కోడ్ లేదా బార్‌కోడ్ ద్వారా వెతకండి...'
            )}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
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

      {/* Product Cards Grid with Animated Sizes & Blue-White Styling */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((product) => {
          const variants = parseVariants(product.variantsSummary);
          const isLow = product.stock <= (product.lowStockThreshold ?? 10);
          const isCardActive = pressedSize?.product.id === product.id;

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
              className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 flex gap-4 justify-between transition-colors shadow-sm shadow-blue-900/5 ${
                isCardActive
                  ? 'border-[#1D4ED8] ring-2 ring-[#1D4ED8]/20'
                  : 'border-blue-100 dark:border-slate-800'
              }`}
            >
              <div className="w-20 h-20 rounded-xl bg-blue-50/50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
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
                    <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white truncate">
                      {translateProductName(product, language)}
                    </h3>
                    {language !== 'te' && product.nameTe && (
                      <div className="text-xs font-medium text-[#1D4ED8] dark:text-sky-400 truncate">
                        {product.nameTe}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {translateCategory(product.category, categories, language)} ·{' '}
                      <span className="font-mono">{product.productCode}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditing(product)}
                        className="p-1.5 rounded-lg border border-blue-200 dark:border-slate-700 text-[#0B1F44] dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800"
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
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
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
                              ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white shadow-md shadow-blue-600/25'
                              : 'bg-blue-50/70 dark:bg-slate-800 border-blue-200/80 dark:border-slate-700 text-[#0B1F44] dark:text-slate-200 hover:border-[#1D4ED8]'
                          }`}
                        >
                          {isPressed && (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 rounded-lg border-2 border-[#1D4ED8] animate-slp-ring"
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
                      className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-slate-800 border border-blue-200/80 dark:border-slate-700 font-mono text-xs font-bold text-[#1D4ED8] dark:text-sky-300"
                    >
                      ₹{product.sellingPrice}
                    </motion.button>
                  )}
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {tr(language, 'Stock:', 'స్టాక్:')}{' '}
                    <strong className={`font-mono ${isLow ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                      {product.stock} {translateUnit(product.unit, language)}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBarcodePreviewProduct(product)}
                    className="inline-flex items-center gap-1 font-mono text-[#1D4ED8] hover:underline"
                    title={tr(language, 'View / Download Code 128 Barcode', 'కోడ్ 128 బార్‌కోడ్ చూడండి / డౌన్‌లోడ్ చేయండి')}
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    {product.barcode || deriveMixedVerificationCode(product.id || product.productCode)}
                  </button>
                </div>
              </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white">
                  {tr(language, 'Code 128 Product Barcode', 'కోడ్ 128 ఉత్పత్తి బార్‌కోడ్')}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {translateProductName(barcodePreviewProduct, language)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBarcodePreviewProduct(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col items-center">
              <img
                src={generateCode128SvgDataUrl(
                  barcodePreviewProduct.barcode ||
                    deriveMixedVerificationCode(barcodePreviewProduct.id || barcodePreviewProduct.productCode)
                )}
                alt={translateProductName(barcodePreviewProduct, language)}
                className="h-16 w-auto object-contain"
              />
              <span className="text-[11px] text-slate-500 mt-1">
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
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF]"
            >
              <Download className="w-3.5 h-3.5" />
              {tr(language, 'Download Code 128 Label (PNG)', 'కోడ్ 128 లేబుల్ డౌన్‌లోడ్ (పీఎన్‌జీ)')}
            </button>
          </div>
        </div>
      )}

      {deleteConfirmProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#0B1F44] dark:text-white">
                  {tr(language, 'Remove Product', 'ఉత్పత్తిని తొలగించు')} · {translateProductName(deleteConfirmProduct, language)}?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {deleteConfirmProduct.productCode} · ₹{deleteConfirmProduct.sellingPrice}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
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
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
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
                    setStatusMsg(err instanceof Error ? err.message : tr(language, 'Failed to remove product.', 'ఉత్పత్తిని తొలగించడం విఫలమైంది.'));
                    setDeleteConfirmProduct(null);
                  } finally {
                    setDeletingProd(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingProd
                  ? tr(language, 'Removing...', 'తొలగిస్తోంది...')
                  : tr(language, 'Move to Removed Products', 'తొలగించిన జాబితాకు తరలించు')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ProductEditorModal: React.FC<{
  initial: Partial<Product>;
  categories: string[];
  language: 'en' | 'te';
  onClose: () => void;
  onSave: (data: Partial<Product> & { name: string; category: string; purchasePrice: number; sellingPrice: number; stock: number; taxRate: number }) => Promise<void>;
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
    taxRate: initial.taxRate ?? 18,
    unit: initial.unit || 'Piece',
    variantsSummary: initial.variantsSummary || '',
    imageUrl: initial.imageUrl || '',
    description: initial.description || '',
  });
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [translating, setTranslating] = useState(false);
  const [generatingImg, setGeneratingImg] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTranslateTe = async () => {
    if (!form.name.trim()) return;
    setTranslating(true);
    setAiError(null);
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
      setAiError(err instanceof Error ? err.message : tr(language, 'Translation unavailable.', 'అనువాదం అందుబాటులో లేదు.'));
    } finally {
      setTranslating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!form.name.trim()) return;
    setGeneratingImg(true);
    setAiError(null);
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
      setForm((f) => ({ ...f, imageUrl: data.imageDataUrl }));
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : tr(language, 'Image generation requires a billing-enabled Gemini key in Secrets.', 'చిత్రం తయారీకి సర్వర్ కీ అవసరం.')
      );
    } finally {
      setGeneratingImg(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 my-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {form.id ? tr(language, 'Edit Product', 'ఉత్పత్తిని సవరించండి') : tr(language, 'Add Product', 'కొత్త ఉత్పత్తి చేర్చండి')}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'Product Name (English) *', 'ఉత్పత్తి పేరు (ఇంగ్లీష్) *')}
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-600 dark:text-slate-300">
                {tr(language, 'Telugu Name (తెలుగు)', 'తెలుగు పేరు *')}
              </label>
              <button
                type="button"
                onClick={handleTranslateTe}
                disabled={translating}
                className="inline-flex items-center gap-1 text-[11px] text-[#1D4ED8] hover:underline"
              >
                <Languages className="w-3 h-3" />{' '}
                {translating ? tr(language, 'Translating...', 'అనువదిస్తోంది...') : tr(language, 'Auto-Translate', 'స్వయంచాలక అనువాదం')}
              </button>
            </div>
            <input
              value={form.nameTe}
              onChange={(e) => setForm({ ...form, nameTe: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'Category *', 'వర్గం *')}
            </label>
            <input
              required
              list="slp-categories"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
            <datalist id="slp-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-600 dark:text-slate-300">
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
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] hover:underline"
              >
                <Barcode className="w-3 h-3" /> {tr(language, 'Generate Code 128', 'కోడ్ 128 తయారు చేయి')}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.productCode}
                onChange={(e) => setForm({ ...form, productCode: e.target.value })}
                placeholder="SLP-001"
                className="px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder={tr(language, 'Code 128 Barcode', 'కోడ్ 128 బార్‌కోడ్')}
                className="px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            {(form.barcode || form.id || form.productCode) && (() => {
              const previewCode =
                form.barcode || deriveMixedVerificationCode(form.id || form.productCode || form.name || 'PROD');
              return (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-2">
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 text-[11px] font-semibold text-[#1D4ED8] hover:bg-blue-50 shrink-0"
                  >
                    <Download className="w-3 h-3" /> {tr(language, 'PNG', 'పీఎన్‌జీ')}
                  </button>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'Purchase Price (₹)', 'కొనుగోలు ధర (₹)')}
            </label>
            <input
              type="number"
              min={0}
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'Default Selling Price (₹) *', 'అమ్మకం ధర (₹) *')}
            </label>
            <input
              required
              type="number"
              min={0}
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'Stock & Low Threshold', 'స్టాక్ & కనీస పరిమితి')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                className="px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <input
                type="number"
                min={0}
                value={form.lowStockThreshold}
                onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                className="px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              {tr(language, 'GST % & Unit', 'జీఎస్టీ % & యూనిట్')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
                className="px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
              {language === 'te' ? (
                <>
                  సైజు రకాలు (ఉదా: <code className="font-mono">6FT:620|6½FT:620</code>)
                </>
              ) : (
                <>
                  Size Variants (Format: <code className="font-mono">6FT:620|6½FT:620</code>)
                </>
              )}
            </label>
            <input
              value={form.variantsSummary}
              onChange={(e) => setForm({ ...form, variantsSummary: e.target.value })}
              placeholder={tr(language, 'Small:220|Medium:320|Large:420', 'చిన్నది:220|మధ్యస్థం:320|పెద్దది:420')}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          {/* High-Quality Image Generation (1K / 2K / 4K) */}
          <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[#1D4ED8]" />{' '}
                {tr(language, 'Product Image URL or Studio Generator', 'ఉత్పత్తి చిత్రం లింక్ లేదా ఫోటో తయారీ')}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as '1K' | '2K' | '4K')}
                  className="px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
                <button
                  type="button"
                  onClick={handleGenerateImage}
                  disabled={generatingImg}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0B1F44] text-white text-xs font-medium disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />{' '}
                  {generatingImg
                    ? tr(language, 'Generating...', 'తయారవుతోంది...')
                    : tr(language, 'Generate Studio Photo', 'ఫోటో తయారు చేయి')}
                </button>
              </div>
            </div>
            <input
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder={tr(language, 'https://... or generated image', 'చిత్రం లింక్...')}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            {aiError && <p className="text-[11px] text-amber-700 dark:text-amber-400">{aiError}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700">
            {tr(language, 'Cancel', 'రద్దు')}
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1D4ED8] text-white">
            {saving ? tr(language, 'Saving...', 'సేవ్ అవుతోంది...') : tr(language, 'Save Product', 'ఉత్పత్తిని సేవ్ చేయి')}
          </button>
        </div>
      </form>
    </div>
  );
};
