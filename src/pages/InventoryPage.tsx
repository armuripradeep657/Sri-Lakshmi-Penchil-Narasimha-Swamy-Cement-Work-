import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowUpRight,
  History,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency } from '../lib/upiAndExport';
import { AnimatedNumber, MotionCard } from '../components/MotionPrimitives';
import { Product } from '../types/billing';

export const InventoryPage: React.FC = () => {
  const { products, inventoryTransactions, adjustStockAtomic } = useBillingData();
  const { isAdmin, userAccount, language } = useAuth();
  const canEditStock = isAdmin || Boolean(userAccount?.canManageProducts);

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'low' | 'out'>('all');
  const [tab, setTab] = useState<'levels' | 'ledger'>('levels');
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<'restock' | 'adjustment' | 'return'>('restock');
  const [quantityInput, setQuantityInput] = useState<number>(10);
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    let totalUnits = 0;
    let purchaseValuation = 0;
    let retailValuation = 0;
    let lowCount = 0;
    let outCount = 0;
    for (const p of products) {
      const stk = Number(p.stock || 0);
      const thresh = Number(p.lowStockThreshold ?? 10);
      totalUnits += stk;
      purchaseValuation += stk * Number(p.purchasePrice || 0);
      retailValuation += stk * Number(p.sellingPrice || 0);
      if (stk <= 0) outCount++;
      else if (stk <= thresh) lowCount++;
    }
    return { totalUnits, purchaseValuation, retailValuation, lowCount, outCount };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        const thresh = Number(p.lowStockThreshold ?? 10);
        if (filterMode === 'low' && !(p.stock > 0 && p.stock <= thresh)) return false;
        if (filterMode === 'out' && p.stock > 0) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.nameTe || '').toLowerCase().includes(q) ||
          p.productCode.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.stock - b.stock);
  }, [products, search, filterMode]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventoryTransactions;
    return inventoryTransactions.filter(
      (t) =>
        t.productName.toLowerCase().includes(q) ||
        (t.billNumber || '').toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q)
    );
  }, [inventoryTransactions, search]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    if (!quantityInput || Number.isNaN(quantityInput)) {
      setError('Enter a valid non-zero quantity.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const delta = adjustType === 'restock' || adjustType === 'return' ? Math.abs(quantityInput) : quantityInput;
      await adjustStockAtomic(
        adjustingProduct.id,
        delta,
        adjustType,
        noteInput.trim() || `${adjustType} (+${delta})`
      );
      setFeedback(`Updated stock for ${adjustingProduct.name} by ${delta > 0 ? `+${delta}` : delta}.`);
      setAdjustingProduct(null);
      setQuantityInput(10);
      setNoteInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MotionCard delay={0} className="rounded-2xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-[#1D4ED8]" /> Total Units in Yard
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            <AnimatedNumber value={stats.totalUnits} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{products.length} catalog SKUs</div>
        </MotionCard>
        <MotionCard delay={0.04} className="rounded-2xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" /> Cost Valuation
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            <AnimatedNumber value={stats.purchaseValuation} format={(n) => formatCurrency(n)} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Retail: {formatCurrency(stats.retailValuation)}
          </div>
        </MotionCard>
        <MotionCard delay={0.08} className="rounded-2xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Low Stock Alerts
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            <AnimatedNumber value={stats.lowCount} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">At or below threshold</div>
        </MotionCard>
        <MotionCard delay={0.12} className="rounded-2xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ArrowDownUp className="w-3.5 h-3.5 text-rose-500" /> Out of Stock
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
            <AnimatedNumber value={stats.outCount} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Zero units remaining</div>
        </MotionCard>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('levels')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              tab === 'levels'
                ? 'bg-[#0B1F44] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            Stock Levels ({products.length})
          </button>
          <button
            onClick={() => setTab('ledger')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              tab === 'ledger'
                ? 'bg-[#0B1F44] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Adjustment Ledger ({inventoryTransactions.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, product, bill #..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          {tab === 'levels' && (
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as 'all' | 'low' | 'out')}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="all">All Stock Status</option>
              <option value="low">Low Stock Only</option>
              <option value="out">Out of Stock Only</option>
            </select>
          )}

        </div>
      </div>

      {tab === 'levels' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Code</th>
                <th className="py-3 px-4 font-semibold">Product</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold text-right">Stock</th>
                <th className="py-3 px-4 font-semibold text-right">Threshold</th>
                <th className="py-3 px-4 font-semibold text-right">Cost Value</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                {canEditStock && <th className="py-3 px-4 font-semibold text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((p) => {
                const thresh = Number(p.lowStockThreshold ?? 10);
                const isOut = p.stock <= 0;
                const isLow = p.stock > 0 && p.stock <= thresh;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-slate-500">{p.productCode}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {language === 'te' && p.nameTe ? p.nameTe : p.name}
                      </div>
                      {p.nameTe && (
                        <div className="text-[11px] text-slate-500">
                          {language === 'te' ? p.name : p.nameTe}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{p.category}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {p.stock} <span className="text-[10px] font-normal text-slate-400">{p.unit || 'Pc'}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500">{thresh}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(p.stock * p.purchasePrice)}
                    </td>
                    <td className="py-3 px-4">
                      {isOut ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">Out of Stock</span>
                      ) : isLow ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">Low Stock</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Healthy</span>
                      )}
                    </td>
                    {canEditStock && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setAdjustingProduct(p);
                            setAdjustType('restock');
                            setQuantityInput(10);
                            setNoteInput('');
                            setError(null);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B1F44] text-white text-[11px] font-medium hover:bg-[#1D4ED8]"
                        >
                          <SlidersHorizontal className="w-3 h-3" /> Adjust
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No matching inventory items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Product</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold text-right">Change</th>
                <th className="py-3 px-4 font-semibold text-right">Prev → New</th>
                <th className="py-3 px-4 font-semibold">Reference / Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {formatTimestamp(tx.createdAt).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{tx.productName}</td>
                  <td className="py-3 px-4 uppercase font-semibold text-[11px] text-slate-600 dark:text-slate-300">
                    {tx.type}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono font-bold ${
                      tx.quantityChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {tx.quantityChange > 0 ? `+${tx.quantityChange}` : tx.quantityChange}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {tx.previousStock} → {tx.newStock}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {tx.billNumber ? `${tx.billNumber} · ` : ''}
                    {tx.note}
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No inventory movement records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleAdjustSubmit}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Adjust Stock · {adjustingProduct.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Current Stock: {adjustingProduct.stock} {adjustingProduct.unit || 'units'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Transaction Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['restock', 'return', 'adjustment'] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setAdjustType(t)}
                      className={`py-2 rounded-lg border font-semibold capitalize ${
                        adjustType === t
                          ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {adjustType === 'adjustment'
                    ? 'Quantity Change (use negative for shrinkage/damage)'
                    : 'Quantity to Add'}
                </label>
                <input
                  type="number"
                  required
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Reason / Batch Note</label>
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="e.g. Yard casting batch #14 or breakage correction"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> {saving ? 'Updating...' : 'Apply Atomic Update'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
