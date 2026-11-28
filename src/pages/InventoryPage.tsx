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
import { ModalPortal } from '../components/ModalPortal';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency } from '../lib/upiAndExport';
import {
  formatAppDate,
  tr,
  translateCategory,
  translateProductName,
  translateStatus,
  translateSystemText,
  translateUnit,
} from '../lib/i18n';
import { AnimatedNumber, MotionCard } from '../components/MotionPrimitives';
import { Product } from '../types/billing';

export const InventoryPage: React.FC = () => {
  const { products, categories, inventoryTransactions, adjustStockAtomic } = useBillingData();
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
      setError(tr(language, 'Enter a valid non-zero quantity.', 'సున్నా కాని సరైన సంఖ్యను నమోదు చేయండి.'));
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
      setFeedback(
        tr(
          language,
          `Updated stock for ${adjustingProduct.name} by ${delta > 0 ? `+${delta}` : delta}.`,
          `${translateProductName(adjustingProduct, 'te')} స్టాక్ ${delta > 0 ? `+${delta}` : delta} మార్చబడింది.`
        )
      );
      setAdjustingProduct(null);
      setQuantityInput(10);
      setNoteInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : tr(language, 'Stock adjustment failed.', 'స్టాక్ మార్పు విఫలమైంది.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MotionCard delay={0} className="rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-[#6D665E] flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-[#9A4307]" /> {tr(language, 'Total Units in Yard', 'యార్డ్‌లో మొత్తం యూనిట్లు')}
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#0A2240] dark:text-white mt-1">
            <AnimatedNumber value={stats.totalUnits} />
          </div>
          <div className="text-[11px] text-[#6D665E] mt-0.5">
            {products.length} {tr(language, 'catalog SKUs', 'రకాల ఉత్పత్తులు')}
          </div>
        </MotionCard>
        <MotionCard delay={0.04} className="rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-[#6D665E] flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-[#15803D]" /> {tr(language, 'Cost Valuation', 'కొనుగోలు విలువ')}
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#0A2240] dark:text-white mt-1">
            <AnimatedNumber value={stats.purchaseValuation} format={(n) => formatCurrency(n)} />
          </div>
          <div className="text-[11px] text-[#6D665E] mt-0.5">
            {tr(language, 'Retail:', 'అమ్మకం విలువ:')} {formatCurrency(stats.retailValuation)}
          </div>
        </MotionCard>
        <MotionCard delay={0.08} className="rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-[#6D665E] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> {tr(language, 'Low Stock Alerts', 'తక్కువ స్టాక్ హెచ్చరికలు')}
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            <AnimatedNumber value={stats.lowCount} />
          </div>
          <div className="text-[11px] text-[#6D665E] mt-0.5">
            {tr(language, 'At or below threshold', 'కనీస పరిమితి వద్ద లేదా తక్కువ')}
          </div>
        </MotionCard>
        <MotionCard delay={0.12} className="rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-4 shadow-sm slp-card-lift">
          <div className="text-xs text-[#6D665E] flex items-center gap-1.5">
            <ArrowDownUp className="w-3.5 h-3.5 text-rose-500" /> {tr(language, 'Out of Stock', 'స్టాక్ లేదు')}
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#C23B2B] dark:text-rose-400 mt-1">
            <AnimatedNumber value={stats.outCount} />
          </div>
          <div className="text-[11px] text-[#6D665E] mt-0.5">
            {tr(language, 'Zero units remaining', 'సున్నా యూనిట్లు మిగిలాయి')}
          </div>
        </MotionCard>
      </div>

      {feedback && (
        <div className="rounded-xl border border-[#C5E8D1] dark:border-emerald-900/50 bg-[#E7F6EC] dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-[#15803D] dark:text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline">
            {tr(language, 'Dismiss', 'మూసివేయి')}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('levels')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              tab === 'levels'
                ? 'bg-[#0A2240] text-white'
                : 'bg-[#F3EDE5] dark:bg-slate-800 text-[#6D665E] dark:text-slate-300'
            }`}
          >
            {tr(language, 'Stock Levels', 'స్టాక్ స్థాయిలు')} ({products.length})
          </button>
          <button
            onClick={() => setTab('ledger')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              tab === 'ledger'
                ? 'bg-[#0A2240] text-white'
                : 'bg-[#F3EDE5] dark:bg-slate-800 text-[#6D665E] dark:text-slate-300'
            }`}
          >
            <History className="w-3.5 h-3.5" /> {tr(language, 'Adjustment Ledger', 'స్టాక్ మార్పుల ఖాతా')} ({inventoryTransactions.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-4 h-4 text-[#8A8279] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr(language, 'Search SKU, product, bill #...', 'కోడ్, ఉత్పత్తి లేదా బిల్ ద్వారా వెతకండి...')}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>

          {tab === 'levels' && (
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as 'all' | 'low' | 'out')}
              className="px-3 py-2 text-xs rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            >
              <option value="all">{tr(language, 'All Stock Status', 'అన్ని స్టాక్ స్థితులు')}</option>
              <option value="low">{tr(language, 'Low Stock Only', 'తక్కువ స్టాక్ మాత్రమే')}</option>
              <option value="out">{tr(language, 'Out of Stock Only', 'స్టాక్ లేనివి మాత్రమే')}</option>
            </select>
          )}

        </div>
      </div>

      {tab === 'levels' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#FAF8F5] dark:bg-slate-950 text-[#6D665E] border-b border-[#E5DDD3] dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Code', 'కోడ్')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Product', 'ఉత్పత్తి')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Category', 'వర్గం')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Stock', 'స్టాక్')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Threshold', 'కనీస పరిమితి')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Cost Value', 'ఖరీదు విలువ')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Status', 'స్థితి')}</th>
                {canEditStock && <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Action', 'చర్య')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
              {filteredProducts.map((p) => {
                const thresh = Number(p.lowStockThreshold ?? 10);
                const isOut = p.stock <= 0;
                const isLow = p.stock > 0 && p.stock <= thresh;
                return (
                  <tr key={p.id} className="hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-[#6D665E]">{p.productCode}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0A2240] dark:text-white">
                        {translateProductName(p, language)}
                      </div>
                      {language !== 'te' && p.nameTe && (
                        <div className="text-[11px] text-[#6D665E]">{p.nameTe}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#6D665E] dark:text-slate-300">
                      {translateCategory(p.category, categories, language)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-[#0A2240] dark:text-white">
                      {p.stock}{' '}
                      <span className="text-[10px] font-normal text-[#8A8279]">
                        {translateUnit(p.unit || 'Piece', language)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#6D665E]">{thresh}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(p.stock * p.purchasePrice)}
                    </td>
                    <td className="py-3 px-4">
                      {isOut ? (
                        <span className="text-[#C23B2B] dark:text-rose-400 font-semibold">
                          {tr(language, 'Out of Stock', 'స్టాక్ లేదు')}
                        </span>
                      ) : isLow ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          {tr(language, 'Low Stock', 'తక్కువ స్టాక్')}
                        </span>
                      ) : (
                        <span className="text-[#15803D] dark:text-emerald-400 font-medium">
                          {tr(language, 'Healthy', 'బాగుంది')}
                        </span>
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
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0A2240] text-white text-[11px] font-medium hover:bg-[#0A2240]"
                        >
                          <SlidersHorizontal className="w-3 h-3" /> {tr(language, 'Adjust', 'మార్చు')}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#8A8279]">
                    {tr(language, 'No matching inventory items.', 'సరిపోయే నిల్వ వస్తువులు కనుగొనబడలేదు.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#FAF8F5] dark:bg-slate-950 text-[#6D665E] border-b border-[#E5DDD3] dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Date & Time', 'తేదీ & సమయం')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Product', 'ఉత్పత్తి')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Type', 'రకం')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Change', 'మార్పు')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Prev → New', 'పాత → కొత్త')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Reference / Note', 'వివరాలు / గమనిక')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
              {filteredTransactions.map((tx) => {
                const matchedProd = products.find((pr) => pr.id === tx.productId);
                return (
                <tr key={tx.id} className="hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-[#6D665E] whitespace-nowrap">
                    {formatAppDate(formatTimestamp(tx.createdAt), language, true)}
                  </td>
                  <td className="py-3 px-4 font-medium text-[#0A2240] dark:text-white">
                    {translateProductName(matchedProd, language, tx.productName)}
                  </td>
                  <td className="py-3 px-4 uppercase font-semibold text-[11px] text-[#6D665E] dark:text-slate-300">
                    {translateStatus(tx.type, language)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono font-bold ${
                      tx.quantityChange >= 0 ? 'text-[#15803D]' : 'text-[#C23B2B]'
                    }`}
                  >
                    {tx.quantityChange > 0 ? `+${tx.quantityChange}` : tx.quantityChange}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#6D665E] dark:text-slate-300">
                    {tx.previousStock} → {tx.newStock}
                  </td>
                  <td className="py-3 px-4 text-[#6D665E]">
                    {tx.billNumber ? `${tx.billNumber} · ` : ''}
                    {translateSystemText(tx.note, language)}
                  </td>
                </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#8A8279]">
                    {tr(language, 'No inventory movement records found.', 'స్టాక్ కదలికల రికార్డులు కనుగొనబడలేదు.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleAdjustSubmit}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-6 space-y-4 max-h-[92dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#0A2240] dark:text-white">
                  {tr(language, 'Adjust Stock', 'స్టాక్ మార్చు')} · {translateProductName(adjustingProduct, language)}
                </h3>
                <p className="text-xs text-[#6D665E]">
                  {tr(language, 'Current Stock:', 'ప్రస్తుత స్టాక్:')} {adjustingProduct.stock}{' '}
                  {translateUnit(adjustingProduct.unit || 'units', language)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="p-1 text-[#8A8279] hover:text-[#2D3138]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-lg bg-[#FCE8E6] dark:bg-rose-950/30 border border-[#F5C6C0] dark:border-rose-900/50 px-3 py-2 text-xs text-[#C23B2B] dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Transaction Type', 'లావాదేవీ రకం')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['restock', 'return', 'adjustment'] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setAdjustType(t)}
                      className={`py-2 rounded-lg border font-semibold capitalize ${
                        adjustType === t
                          ? 'border-[#0A2240] bg-[#0A2240]/10 text-[#9A4307]'
                          : 'border-[#E5DDD3] dark:border-slate-700'
                      }`}
                    >
                      {translateStatus(t, language)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {adjustType === 'adjustment'
                    ? tr(language, 'Quantity Change (use negative for shrinkage/damage)', 'పరిమాణ మార్పు (నష్టం/తగ్గింపుకు మైనస్ వాడండి)')
                    : tr(language, 'Quantity to Add', 'చేర్చవలసిన పరిమాణం')}
                </label>
                <input
                  type="number"
                  required
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Reason / Batch Note', 'కారణం / బ్యాచ్ గమనిక')}
                </label>
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder={tr(language, 'e.g. Yard casting batch #14 or breakage correction', 'ఉదా: యార్డ్ బ్యాచ్ #14 లేదా విరిగిన సరుకు')}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="px-4 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 text-xs font-medium"
              >
                {tr(language, 'Cancel', 'రద్దు')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#0A2240] disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />{' '}
                {saving ? tr(language, 'Updating...', 'నవీకరిస్తోంది...') : tr(language, 'Apply Atomic Update', 'స్టాక్ నవీకరించు')}
              </button>
            </div>
          </form>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
