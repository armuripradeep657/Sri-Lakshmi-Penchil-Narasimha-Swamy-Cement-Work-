import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Barcode,
  Camera,
  Download,
  Edit3,
  Image as ImageIcon,
  Languages,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { parseVariants } from '../lib/seedData';
import { exportRowsToExcel, parseExcelProducts } from '../lib/upiAndExport';
import { Product } from '../types/billing';
import { ScannerModal } from '../components/ScannerModal';
import { getDefaultProductImage, resolveProductImage } from '../lib/productImages';
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
  const { isAdmin, userAccount } = useAuth();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [barcodePreviewProduct, setBarcodePreviewProduct] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pressedSize, setPressedSize] = useState<{
    key: string;
    product: Product;
    label?: string;
    price: number;
    nonce: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  const handleExportExcel = () => {
    exportRowsToExcel(
      products.map((p) => ({
        ProductCode: p.productCode,
        Name: p.name,
        NameTelugu: p.nameTe || '',
        Category: p.category,
        Barcode: p.barcode || '',
        PurchasePrice: p.purchasePrice,
        SellingPrice: p.sellingPrice,
        Stock: p.stock,
        LowStockThreshold: p.lowStockThreshold ?? 10,
        TaxRate: p.taxRate,
        Unit: p.unit || 'Piece',
        Variants: p.variantsSummary || '',
      })),
      'SLP_Billing_Products',
      'Products'
    );
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcelProducts(file);
      let imported = 0;
      for (const row of rows) {
        const name = String(row.Name || row.name || '').trim();
        if (!name) continue;
        await saveProduct({
          productCode: String(row.ProductCode || row.productCode || ''),
          name,
          nameTe: String(row.NameTelugu || row.nameTe || ''),
          category: String(row.Category || row.category || 'General'),
          barcode: String(row.Barcode || row.barcode || ''),
          purchasePrice: Number(row.PurchasePrice || row.purchasePrice || 0),
          sellingPrice: Number(row.SellingPrice || row.sellingPrice || 0),
          stock: Number(row.Stock || row.stock || 0),
          lowStockThreshold: Number(row.LowStockThreshold || 10),
          taxRate: Number(row.TaxRate || row.taxRate || 0),
          unit: String(row.Unit || 'Piece'),
          variantsSummary: String(row.Variants || ''),
        });
        imported += 1;
      }
      setStatusMsg(`Imported ${imported} products into cloud catalog.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Excel import failed.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5 animate-slp-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Product Catalog</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Centralized catalog with bilingual Telugu names, size variants, and real-time sync
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            <Camera className="w-3.5 h-3.5 text-[#1D4ED8]" /> Scan Barcode
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
          {canManage && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportExcel} />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
              >
                <Upload className="w-3.5 h-3.5" /> Import Excel
              </button>
              <button
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF]"
              >
                <Plus className="w-4 h-4" /> Add Product
              </button>
            </>
          )}
        </div>
      </div>

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
            placeholder="Search products in English, తెలుగు, code, or barcode..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="All">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name} {c.nameTe ? `(${c.nameTe})` : ''}
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
                    <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white truncate">{product.name}</h3>
                    {product.nameTe && (
                      <div className="text-xs font-medium text-[#1D4ED8] dark:text-sky-400 truncate">
                        {product.nameTe}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {product.category} · <span className="font-mono">{product.productCode}</span>
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
                          onClick={() => deleteProduct(product.id)}
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
                          {v.label}: ₹{v.price}
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
                    Stock:{' '}
                    <strong className={`font-mono ${isLow ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                      {product.stock} {product.unit}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBarcodePreviewProduct(product)}
                    className="inline-flex items-center gap-1 font-mono text-[#1D4ED8] hover:underline"
                    title="View / Download Code 128 Barcode"
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

      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        products={products}
        onProductFound={(p) => setSearch(p.productCode)}
        title="Scan Product Barcode"
      />

      {barcodePreviewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white">
                  Code 128 Product Barcode
                </h3>
                <p className="text-xs text-slate-500 truncate">{barcodePreviewProduct.name}</p>
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
                alt={`Code 128 barcode for ${barcodePreviewProduct.name}`}
                className="h-16 w-auto object-contain"
              />
              <span className="text-[11px] text-slate-500 mt-1">Symbology: Code 128</span>
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
              Download Code 128 Label (PNG)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ProductEditorModal: React.FC<{
  initial: Partial<Product>;
  categories: string[];
  onClose: () => void;
  onSave: (data: Partial<Product> & { name: string; category: string; purchasePrice: number; sellingPrice: number; stock: number; taxRate: number }) => Promise<void>;
}> = ({ initial, categories, onClose, onSave }) => {
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
      setAiError(err instanceof Error ? err.message : 'Translation unavailable.');
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
      setAiError(err instanceof Error ? err.message : 'Image generation requires a billing-enabled Gemini key in Secrets.');
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
            {form.id ? 'Edit Product' : 'Add Product'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Product Name (English) *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-600 dark:text-slate-300">Telugu Name (తెలుగు)</label>
              <button
                type="button"
                onClick={handleTranslateTe}
                disabled={translating}
                className="inline-flex items-center gap-1 text-[11px] text-[#1D4ED8] hover:underline"
              >
                <Languages className="w-3 h-3" /> {translating ? 'Translating...' : 'Auto-Translate'}
              </button>
            </div>
            <input
              value={form.nameTe}
              onChange={(e) => setForm({ ...form, nameTe: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Category *</label>
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
                Product Code / Code 128 Barcode
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
                <Barcode className="w-3 h-3" /> Generate Code 128
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
                placeholder="Code 128 Barcode"
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
                    alt="Code 128 Barcode Preview"
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
                    <Download className="w-3 h-3" /> PNG
                  </button>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Purchase Price (₹)</label>
            <input
              type="number"
              min={0}
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Default Selling Price (₹) *</label>
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
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Stock &amp; Low Threshold</label>
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
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">GST % &amp; Unit</label>
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
              Size Variants (Format: <code className="font-mono">6FT:620|6½FT:620</code>)
            </label>
            <input
              value={form.variantsSummary}
              onChange={(e) => setForm({ ...form, variantsSummary: e.target.value })}
              placeholder="Small:220|Medium:320|Large:420"
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          {/* High-Quality Image Generation (1K / 2K / 4K) */}
          <div className="sm:col-span-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[#1D4ED8]" /> Product Image URL or Studio Generator
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
                  <Sparkles className="w-3 h-3" /> {generatingImg ? 'Generating...' : 'Generate Studio Photo'}
                </button>
              </div>
            </div>
            <input
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://... or generated image"
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            {aiError && <p className="text-[11px] text-amber-700 dark:text-amber-400">{aiError}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1D4ED8] text-white">
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </form>
    </div>
  );
};
