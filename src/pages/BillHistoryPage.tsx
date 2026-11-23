import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Barcode,
  Camera,
  CheckCircle2,
  Edit3,
  Eye,
  HardHat,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { CartItemInput, useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency } from '../lib/upiAndExport';
import { getBillVerificationBarcode } from '../lib/barcodeAndBillImage';
import {
  formatAppDate,
  getAppLocale,
  tr,
  translateCategory,
  translateCustomerName,
  translateItemsSummary,
  translatePaymentMethod,
  translateProductName,
  translateStatus,
  translateSystemText,
  translateVariantLabel,
} from '../lib/i18n';
import { AnimatedNumber, MotionCard } from '../components/MotionPrimitives';
import { Bill, BillItem, GstType, PaymentMethod } from '../types/billing';
import { PostBillActionsModal } from '../components/InvoiceViews';
import { ScannerModal } from '../components/ScannerModal';

type HistorySectionTab = 'all' | 'bills' | 'labour' | 'cashbook';
type CreatorFilter = 'all' | 'staff' | 'mine';

export const BillHistoryPage: React.FC = () => {
  const {
    bills,
    billItems,
    products,
    business,
    labourWorks,
    shopEntries,
    editBillAtomic,
    recordPaymentAtomic,
    cancelBillAtomic,
    softDeleteBillAtomic,
    softDeleteBillsBulkAtomic,
    recordRefundAtomic,
    updateBillNotes,
  } = useBillingData();
  const { isAdmin, userAccount, activeUid, language } = useAuth();

  const [sectionTab, setSectionTab] = useState<HistorySectionTab>(() => (isAdmin ? 'all' : 'bills'));
  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBill, setActiveBill] = useState<Bill | null>(null);
  const [editingFullBill, setEditingFullBill] = useState<Bill | null>(null);
  const [paymentModalBill, setPaymentModalBill] = useState<Bill | null>(null);
  const [cancelModalBill, setCancelModalBill] = useState<Bill | null>(null);
  const [refundModalBill, setRefundModalBill] = useState<Bill | null>(null);
  const [editNotesBill, setEditNotesBill] = useState<Bill | null>(null);
  const [deleteModalBill, setDeleteModalBill] = useState<Bill | null>(null);
  const [deletingBill, setDeletingBill] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  const scopedBills = useMemo(() => {
    const myUid = activeUid || '';
    const base = isAdmin
      ? bills.filter((b) => {
          if (creatorFilter === 'mine') return b.createdByUid === myUid;
          if (creatorFilter === 'staff') return b.createdByUid !== myUid;
          return true;
        })
      : bills.filter((b) => b.createdByUid === myUid);

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (b) =>
        getBillVerificationBarcode(b).toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        (b.customerMobile && b.customerMobile.toLowerCase().includes(q)) ||
        b.createdByName.toLowerCase().includes(q) ||
        (b.itemsSummary && b.itemsSummary.toLowerCase().includes(q))
    );
  }, [bills, isAdmin, activeUid, creatorFilter, searchQuery]);

  const sortedLabour = useMemo(() => {
    return [...labourWorks].sort((a, b) => {
      if (a.workDate !== b.workDate) return b.workDate.localeCompare(a.workDate);
      return formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime();
    });
  }, [labourWorks]);

  const sortedCashbook = useMemo(() => {
    const manualRows = shopEntries.map((e) => ({
      ...e,
      isLabourDerived: false,
    }));
    const labourExpenseRows = labourWorks
      .filter((w) => w.wageAmount > 0 && w.paymentMethod !== 'Unpaid')
      .map((w) => ({
        id: `labour_exp_${w.id}`,
        businessId: w.businessId,
        ownerUid: w.ownerUid,
        authorizedUids: w.authorizedUids,
        entryDate: w.workDate,
        type: 'expense' as const,
        title: `${w.workerName} · ${w.workDone}`,
        category: 'Labour Money Taken',
        amount: Number(w.wageAmount || 0),
        paymentMethod: w.paymentMethod as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other',
        note: w.note,
        recordedByUid: w.recordedByUid,
        recordedByName: w.recordedByName,
        createdAt: w.createdAt,
        isLabourDerived: true,
      }));
    return [...manualRows, ...labourExpenseRows].sort((a, b) => {
      if (a.entryDate !== b.entryDate) return b.entryDate.localeCompare(a.entryDate);
      return formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime();
    });
  }, [shopEntries, labourWorks]);

  const totals = useMemo(() => {
    const billSales = scopedBills
      .filter((b) => b.billStatus === 'active')
      .reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);
    const pendingTotal = scopedBills
      .filter((b) => b.billStatus === 'active')
      .reduce((sum, b) => sum + Number(b.pendingBalance || 0), 0);
    const labourTotal = labourWorks.reduce((sum, w) => sum + Number(w.wageAmount || 0), 0);
    const labourPaid = labourWorks
      .filter((w) => w.wageAmount > 0 && w.paymentMethod !== 'Unpaid')
      .reduce((sum, w) => sum + Number(w.wageAmount || 0), 0);
    const shopIncome = shopEntries
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const manualExpense = shopEntries
      .filter((e) => e.type === 'expense')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const shopExpense = manualExpense + labourPaid;
    return { billSales, pendingTotal, labourTotal, shopIncome, shopExpense };
  }, [scopedBills, labourWorks, shopEntries]);

  const canEditNotes = isAdmin || Boolean(userAccount?.canEditBills);
  const canCancel = isAdmin || Boolean(userAccount?.canCancelBills);
  const showBillsSection = !isAdmin || sectionTab === 'all' || sectionTab === 'bills';

  const deletableScopedBills = useMemo(
    () => scopedBills.filter((b) => isAdmin || b.createdByUid === activeUid),
    [scopedBills, isAdmin, activeUid]
  );

  const selectedIdSet = useMemo(() => new Set(selectedBillIds), [selectedBillIds]);

  const visibleSelectedBills = useMemo(
    () => deletableScopedBills.filter((b) => selectedIdSet.has(b.id)),
    [deletableScopedBills, selectedIdSet]
  );

  const allVisibleSelected =
    deletableScopedBills.length > 0 && visibleSelectedBills.length === deletableScopedBills.length;
  const someVisibleSelected =
    visibleSelectedBills.length > 0 && visibleSelectedBills.length < deletableScopedBills.length;

  const selectedTotalAmount = useMemo(
    () => visibleSelectedBills.reduce((sum, b) => sum + Number(b.grandTotal || 0), 0),
    [visibleSelectedBills]
  );

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleBillSelection = (billId: string) => {
    setBulkNotice(null);
    setSelectedBillIds((prev) =>
      prev.includes(billId) ? prev.filter((id) => id !== billId) : [...prev, billId]
    );
  };

  const toggleSelectAllVisible = () => {
    setBulkNotice(null);
    if (allVisibleSelected) {
      const visibleIds = new Set(deletableScopedBills.map((b) => b.id));
      setSelectedBillIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const merged = new Set(selectedBillIds);
      deletableScopedBills.forEach((b) => merged.add(b.id));
      setSelectedBillIds(Array.from(merged));
    }
  };

  const clearSelection = () => {
    setSelectedBillIds([]);
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards with Animated Counters */}
      {isAdmin ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MotionCard delay={0} className="bg-white border border-blue-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-slate-500">
              {tr(language, 'Bills', 'బిల్లులు')} ({scopedBills.length})
            </div>
            <div className="mt-1 text-base font-bold font-mono text-[#0B1F44]">
              <AnimatedNumber value={totals.billSales} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.04} className="bg-white border border-blue-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-slate-500">
              {tr(language, 'Labour Work', 'లేబర్ పని')} ({labourWorks.length})
            </div>
            <div className="mt-1 text-base font-bold font-mono text-[#1D4ED8]">
              <AnimatedNumber value={totals.labourTotal} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.08} className="bg-white border border-emerald-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-emerald-700">
              {tr(language, 'Shop Income', 'షాప్ ఆదాయం')}
            </div>
            <div className="mt-1 text-base font-bold font-mono text-emerald-700">
              +<AnimatedNumber value={totals.shopIncome} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.12} className="bg-white border border-rose-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-rose-700">
              {tr(language, 'Shop Expenses', 'షాప్ ఖర్చులు')}
            </div>
            <div className="mt-1 text-base font-bold font-mono text-rose-700">
              -<AnimatedNumber value={totals.shopExpense} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <MotionCard delay={0} className="bg-white border border-blue-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-slate-500">
              {tr(language, 'My Bills', 'నా బిల్లులు')} ({scopedBills.length})
            </div>
            <div className="mt-1 text-base font-bold font-mono text-[#0B1F44]">
              <AnimatedNumber value={totals.billSales} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.05} className="bg-white border border-amber-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-amber-700">
              {tr(language, 'My Bills Due', 'నా బిల్లుల బాకీ')}
            </div>
            <div className="mt-1 text-base font-bold font-mono text-amber-700">
              <AnimatedNumber value={totals.pendingTotal} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
        </div>
      )}

      {/* Admin Section Switcher with Sliding Pill */}
      {isAdmin && (
        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-blue-100/70 border border-blue-200/70">
          {(
            [
              { id: 'all', label: tr(language, 'All', 'అన్నీ') },
              { id: 'bills', label: `${tr(language, 'Bills', 'బిల్లులు')} (${scopedBills.length})` },
              { id: 'labour', label: `${tr(language, 'Labour', 'లేబర్')} (${labourWorks.length})` },
              { id: 'cashbook', label: `${tr(language, 'Income & Expenses', 'ఆదాయం & ఖర్చులు')} (${sortedCashbook.length})` },
            ] as Array<{ id: HistorySectionTab; label: string }>
          ).map((tab) => {
            const active = sectionTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setSectionTab(tab.id)}
                className={`relative py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition-colors truncate ${
                  active ? 'text-white' : 'text-[#0B1F44] hover:bg-white/60'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="history-section-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-[#1D4ED8] shadow-sm"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Search, Scan Barcode & Admin Creator Filter */}
      {showBillsSection && (
        <div className="bg-white border border-blue-100 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row gap-2.5">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr(language, 'Search barcode, customer name, product...', 'బార్‌కోడ్, కస్టమర్ పేరు, ఉత్పత్తి వెతకండి...')}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => setScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-semibold shrink-0 transition"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-300" />
              <span>{tr(language, 'Scan Barcode', 'బార్‌కోడ్ స్కాన్')}</span>
            </motion.button>
          </div>
          {isAdmin && (
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-blue-50 border border-blue-100 shrink-0">
              {(
                [
                  { id: 'all', label: tr(language, 'All Bills', 'అన్ని బిల్లులు') },
                  { id: 'staff', label: tr(language, 'Staff Bills', 'సిబ్బంది బిల్లులు') },
                  { id: 'mine', label: tr(language, 'My Bills', 'నా బిల్లులు') },
                ] as Array<{ id: CreatorFilter; label: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCreatorFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${
                    creatorFilter === f.id
                      ? 'bg-[#0B1F44] text-white'
                      : 'text-[#0B1F44] hover:bg-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bills History Section */}
      {showBillsSection && (
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-[#F4F8FF] border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B1F44]">
              <ReceiptText className="w-4 h-4 text-[#1D4ED8]" />
              <span>
                {isAdmin
                  ? `${tr(language, 'Bills History', 'బిల్లుల చరిత్ర')} (${scopedBills.length})`
                  : `${tr(language, 'My Created Bills', 'నేను చేసిన బిల్లులు')} (${scopedBills.length})`}
              </span>
            </div>
            {deletableScopedBills.length > 0 && (
              <div className="flex items-center gap-2.5">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0B1F44] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="w-4 h-4 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8] accent-[#1D4ED8] cursor-pointer"
                  />
                  <span>
                    {allVisibleSelected
                      ? tr(language, 'Deselect All', 'అన్నీ తీసివేయి')
                      : tr(language, 'Select All', 'అన్నీ ఎంచుకో')}
                  </span>
                </label>
                {visibleSelectedBills.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDeleteError(null);
                      setBulkDeleteModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-xs transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    {tr(language, 'Delete', 'తొలగించు')} ({visibleSelectedBills.length})
                  </button>
                )}
              </div>
            )}
          </div>

          <AnimatePresence>
            {bulkNotice && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-2 text-xs font-medium text-emerald-800"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  {bulkNotice}
                </span>
                <button
                  type="button"
                  onClick={() => setBulkNotice(null)}
                  className="p-0.5 text-emerald-600 hover:text-emerald-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {visibleSelectedBills.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="px-4 py-2.5 bg-[#0B1F44] text-white flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-md bg-[#1D4ED8] font-bold font-mono">
                    {visibleSelectedBills.length} {tr(language, 'selected', 'ఎంచుకున్నవి')}
                  </span>
                  <span className="text-blue-100">
                    {tr(language, 'Total:', 'మొత్తం:')}{' '}
                    <strong className="font-mono text-white">
                      {formatCurrency(selectedTotalAmount)}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition"
                  >
                    <X className="w-3 h-3" />
                    {tr(language, 'Clear', 'క్లియర్')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDeleteError(null);
                      setBulkDeleteModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-sm transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {tr(language, 'Delete Selected', 'ఎంచుకున్నవి తొలగించు')} ({visibleSelectedBills.length})
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Card Layout (No Horizontal Scroll Overflow) */}
          <div className="md:hidden divide-y divide-slate-100">
            {scopedBills.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-slate-400">
                {isAdmin
                  ? tr(language, 'No bills recorded yet.', 'ఇంకా బిల్లులు నమోదు కాలేదు.')
                  : tr(language, 'You have not created any bills yet. Open New Billing to create one.', 'మీరు ఇంకా బిల్లులు చేయలేదు. కొత్త బిల్లు తెరిచి సృష్టించండి.')}
              </div>
            ) : (
              scopedBills.map((bill) => {
                const dt = formatTimestamp(bill.createdAt);
                const isOwnBill = bill.createdByUid === activeUid;
                const canSelect = isAdmin || isOwnBill;
                const isSelected = selectedIdSet.has(bill.id);
                return (
                  <div
                    key={bill.id}
                    className={`p-3.5 space-y-2.5 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {canSelect && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBillSelection(bill.id)}
                            aria-label={`${tr(language, 'Select bill', 'బిల్ ఎంచుకో')} ${getBillVerificationBarcode(bill)}`}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8] accent-[#1D4ED8] shrink-0 cursor-pointer"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#0B1F44]">
                              <Barcode className="w-3.5 h-3.5 text-[#1D4ED8]" />
                              {getBillVerificationBarcode(bill)}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                bill.paymentStatus === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : bill.paymentStatus === 'cancelled' || bill.paymentStatus === 'refunded'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {translateStatus(bill.paymentStatus, language)}
                            </span>
                            {Boolean(bill.editedAt) && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#1D4ED8] text-[10px] font-bold">
                                {tr(language, 'Edited', 'సవరించబడింది')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                            {translateCustomerName(bill.customerName, language)}{' '}
                            {bill.customerMobile ? `· ${bill.customerMobile}` : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {bill.itemsSummary
                              ? translateItemsSummary(bill.itemsSummary, products, language)
                              : `${bill.itemCount} ${tr(language, 'items', 'వస్తువులు')}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-sm text-[#0B1F44]">
                          {formatCurrency(bill.grandTotal)}
                        </div>
                        {bill.pendingBalance > 0 && (
                          <div className="font-mono text-[11px] font-semibold text-amber-700">
                            {tr(language, 'Due', 'బాకీ')} {formatCurrency(bill.pendingBalance)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-mono">
                        {formatAppDate(dt, language)} ·{' '}
                        {dt.toLocaleTimeString(getAppLocale(language), { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="truncate max-w-[140px]">
                        {tr(language, 'By:', 'ద్వారా:')} <strong className="text-slate-700">{bill.createdByName}</strong>
                        {!isOwnBill && isAdmin ? ` (${tr(language, 'Staff', 'సిబ్బంది')})` : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveBill(bill)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-[11px] font-bold"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        {tr(language, 'Share / Receipt', 'షేర్ / రసీదు')}
                      </button>
                      {isAdmin && bill.billStatus === 'active' && (
                        <button
                          type="button"
                          onClick={() => setEditingFullBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B1F44] text-white text-[11px] font-bold"
                        >
                          <Pencil className="w-3 h-3" />
                          {tr(language, 'Edit Bill', 'బిల్ సవరించు')}
                        </button>
                      )}
                      {bill.billStatus === 'active' && bill.pendingBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-[11px] font-semibold"
                        >
                          <Wallet className="w-3 h-3" />
                          {tr(language, 'Pay', 'చెల్లించు')}
                        </button>
                      )}
                      {canCancel && bill.billStatus === 'active' && (
                        <button
                          type="button"
                          onClick={() => setCancelModalBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-[11px] font-semibold"
                        >
                          <Ban className="w-3 h-3" />
                          {tr(language, 'Cancel', 'రద్దు')}
                        </button>
                      )}
                      {(isAdmin || isOwnBill) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteModalBill(bill);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50/70 text-rose-700 text-[11px] font-semibold"
                        >
                          <Trash2 className="w-3 h-3" />
                          {tr(language, 'Delete', 'తొలగించు')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={deletableScopedBills.length === 0}
                      onChange={toggleSelectAllVisible}
                      aria-label={tr(language, 'Select all bills', 'అన్ని బిల్లులను ఎంచుకో')}
                      className="w-4 h-4 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8] accent-[#1D4ED8] cursor-pointer disabled:opacity-40"
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold">{tr(language, 'Barcode', 'బార్‌కోడ్')}</th>
                  <th className="py-3 px-4 font-semibold">{tr(language, 'Date & Time', 'తేదీ & సమయం')}</th>
                  <th className="py-3 px-4 font-semibold">{tr(language, 'Customer', 'కస్టమర్')}</th>
                  <th className="py-3 px-4 font-semibold">{tr(language, 'Products', 'ఉత్పత్తులు')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Total', 'మొత్తం')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Balance', 'బాకీ')}</th>
                  <th className="py-3 px-4 font-semibold">{tr(language, 'Payment', 'చెల్లింపు')}</th>
                  <th className="py-3 px-4 font-semibold">{tr(language, 'Creator', 'బిల్ చేసినవారు')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Actions', 'చర్యలు')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scopedBills.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      {isAdmin
                        ? tr(language, 'No bills recorded yet.', 'ఇంకా బిల్లులు నమోదు కాలేదు.')
                        : tr(language, 'You have not created any bills yet.', 'మీరు ఇంకా బిల్లులు చేయలేదు.')}
                    </td>
                  </tr>
                ) : (
                  scopedBills.map((bill) => {
                    const dt = formatTimestamp(bill.createdAt);
                    const isOwnBill = bill.createdByUid === activeUid;
                    const canSelect = isAdmin || isOwnBill;
                    const isSelected = selectedIdSet.has(bill.id);
                    return (
                      <tr
                        key={bill.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="py-3 pl-4 pr-2 align-middle">
                          {canSelect && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleBillSelection(bill.id)}
                              aria-label={`${tr(language, 'Select bill', 'బిల్ ఎంచుకో')} ${getBillVerificationBarcode(bill)}`}
                              className="w-4 h-4 rounded border-slate-300 text-[#1D4ED8] focus:ring-[#1D4ED8] accent-[#1D4ED8] cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-[#0B1F44] whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Barcode className="w-3.5 h-3.5 text-[#1D4ED8]" />
                            <span>{getBillVerificationBarcode(bill)}</span>
                          </div>
                          {Boolean(bill.editedAt) && (
                            <span className="block w-fit mt-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-[#1D4ED8] text-[10px] font-sans font-bold">
                              {tr(language, 'Edited', 'సవరించబడింది')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono">
                          {formatAppDate(dt, language)} ·{' '}
                          {dt.toLocaleTimeString(getAppLocale(language), { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {translateCustomerName(bill.customerName, language)}
                          </div>
                          {bill.customerMobile && (
                            <div className="text-[11px] font-mono text-slate-500">{bill.customerMobile}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[220px] truncate text-slate-600">
                          {bill.itemsSummary
                            ? translateItemsSummary(bill.itemsSummary, products, language)
                            : `${bill.itemCount} ${tr(language, 'items', 'వస్తువులు')}`}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                          {formatCurrency(bill.grandTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap text-amber-700">
                          {formatCurrency(bill.pendingBalance)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-medium text-slate-800">
                            {translatePaymentMethod(bill.paymentMethod, language)}
                          </span>
                          <span className="text-slate-400"> · </span>
                          <span
                            className={
                              bill.paymentStatus === 'paid'
                                ? 'text-emerald-600 font-semibold uppercase'
                                : bill.paymentStatus === 'cancelled' || bill.paymentStatus === 'refunded'
                                ? 'text-rose-600 font-semibold uppercase'
                                : 'text-amber-600 font-semibold uppercase'
                            }
                          >
                            {translateStatus(bill.paymentStatus, language)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          <span className="font-medium">{bill.createdByName}</span>
                          {isAdmin && !isOwnBill && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold">
                              {tr(language, 'Staff', 'సిబ్బంది')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveBill(bill)}
                              title={tr(language, 'Share Bill to Customer', 'కస్టమర్‌కు బిల్ పంపండి')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#1D4ED8] text-white text-[11px] font-semibold hover:bg-[#1E40AF]"
                            >
                              <Share2 className="w-3 h-3" />
                              {tr(language, 'Share', 'షేర్')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveBill(bill)}
                              title={tr(language, 'View & Print Receipt', 'రసీదు చూడండి & ప్రింట్')}
                              className="p-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && bill.billStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() => setEditingFullBill(bill)}
                                title={tr(language, 'Admin Edit Bill Items, Prices & Total', 'బిల్ వస్తువులు, ధరలు సవరించండి')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0B1F44] text-white text-[11px] font-semibold hover:bg-[#13326b]"
                              >
                                <Pencil className="w-3 h-3" />
                                {tr(language, 'Edit', 'సవరించు')}
                              </button>
                            )}
                            {bill.billStatus === 'active' && bill.pendingBalance > 0 && (
                              <button
                                type="button"
                                onClick={() => setPaymentModalBill(bill)}
                                title={tr(language, 'Record Payment', 'చెల్లింపు నమోదు చేయి')}
                                className="p-1.5 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              >
                                <Wallet className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canEditNotes && bill.billStatus === 'active' && !isAdmin && (
                              <button
                                type="button"
                                onClick={() => setEditNotesBill(bill)}
                                title={tr(language, 'Edit Notes', 'గమనికలు సవరించు')}
                                className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin && bill.billStatus === 'active' && bill.amountPaid > 0 && (
                              <button
                                type="button"
                                onClick={() => setRefundModalBill(bill)}
                                title={tr(language, 'Record Refund', 'వాపసు నమోదు చేయి')}
                                className="p-1.5 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canCancel && bill.billStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() => setCancelModalBill(bill)}
                                title={tr(language, 'Cancel Bill', 'బిల్ రద్దు చేయి')}
                                className="p-1.5 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(isAdmin || isOwnBill) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteModalBill(bill);
                                }}
                                title={tr(language, 'Delete Bill (Moves to Settings for 10 Days)', 'బిల్ తొలగించు (10 రోజులు సెట్టింగ్స్‌లో ఉంటుంది)')}
                                className="p-1.5 rounded-md border border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Labour Work History Section (Admin Only) */}
      {isAdmin && (sectionTab === 'all' || sectionTab === 'labour') && (
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-[#F4F8FF] border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B1F44]">
              <HardHat className="w-4 h-4 text-[#1D4ED8]" />
              <span>{tr(language, 'Labour Work', 'లేబర్ పని')} ({sortedLabour.length})</span>
            </div>
            <span className="text-xs font-mono font-bold text-[#1D4ED8]">
              {formatCurrency(totals.labourTotal)}
            </span>
          </div>

          {sortedLabour.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {tr(language, 'No labour work entries recorded yet.', 'లేబర్ పని వివరాలు ఇంకా నమోదు కాలేదు.')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedLabour.map((work) => (
                <div key={work.id} className="p-3.5 sm:px-4 flex items-start justify-between gap-3 hover:bg-blue-50/30">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#0B1F44]">{work.workerName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1D4ED8] font-mono text-[10px] font-semibold">
                        {work.workDate}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          work.paymentMethod === 'Unpaid'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {translatePaymentMethod(work.paymentMethod, language)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 mt-1">{work.workDone}</div>
                    {work.note && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {tr(language, 'Note:', 'గమనిక:')} {translateSystemText(work.note, language)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-xs text-[#0B1F44]">
                      {formatCurrency(work.wageAmount)}
                    </div>
                    {work.recordedByName && (
                      <div className="text-[10px] text-slate-400 mt-0.5">{work.recordedByName}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shop Cashbook (Income & Expenses) History Section (Admin Only) */}
      {isAdmin && (sectionTab === 'all' || sectionTab === 'cashbook') && (
        <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-[#F4F8FF] border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B1F44]">
              <Wallet className="w-4 h-4 text-[#1D4ED8]" />
              <span>
                {tr(language, 'Shop Cashbook · Income & Expenses', 'షాప్ నగదు పుస్తకం · ఆదాయం & ఖర్చులు')} ({sortedCashbook.length})
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono font-bold">
              <span className="text-emerald-700">
                {tr(language, 'In:', 'ఆదాయం:')} +{formatCurrency(totals.shopIncome)}
              </span>
              <span className="text-rose-700">
                {tr(language, 'Out:', 'ఖర్చు:')} -{formatCurrency(totals.shopExpense)}
              </span>
            </div>
          </div>

          {sortedCashbook.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {tr(language, 'No shop income or expense entries recorded yet.', 'ఆదాయం లేదా ఖర్చు వివరాలు ఇంకా నమోదు కాలేదు.')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedCashbook.map((entry) => {
                const isIncome = entry.type === 'income';
                return (
                  <div key={entry.id} className="p-3.5 sm:px-4 flex items-start justify-between gap-3 hover:bg-blue-50/30">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-[#0B1F44]">
                            {translateSystemText(entry.title, language)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isIncome
                                ? 'bg-emerald-50 text-emerald-700'
                                : entry.isLabourDerived
                                ? 'bg-blue-50 text-[#1D4ED8]'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {entry.isLabourDerived
                              ? tr(language, 'Labour Expense', 'లేబర్ ఖర్చు')
                              : translateStatus(entry.type, language)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono">{entry.entryDate}</span>
                          {entry.category && <span>· {translateCategory(entry.category, [], language)}</span>}
                          <span>· {translatePaymentMethod(entry.paymentMethod, language)}</span>
                        </div>
                        {entry.note && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {tr(language, 'Note:', 'గమనిక:')} {translateSystemText(entry.note, language)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={`font-mono font-bold text-xs shrink-0 ${
                        isIncome ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {isIncome ? '+' : '-'}
                      {formatCurrency(entry.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View / Print / Share Modal */}
      <PostBillActionsModal
        bill={activeBill}
        items={activeBill ? billItems.filter((bi) => bi.billId === activeBill.id) : []}
        onClose={() => setActiveBill(null)}
      />

      {/* Admin Full Edit Bill Modal */}
      {isAdmin && editingFullBill && (
        <EditBillModal
          bill={editingFullBill}
          existingItems={billItems.filter((bi) => bi.billId === editingFullBill.id)}
          products={products}
          taxEnabled={Boolean(business?.taxEnabled)}
          onClose={() => setEditingFullBill(null)}
          onSave={async (payload) => {
            await editBillAtomic(payload);
            setEditingFullBill(null);
          }}
        />
      )}

      {/* Record Payment Modal */}
      {paymentModalBill && (
        <SimpleActionModal
          title={`${tr(language, 'Record Payment', 'చెల్లింపు నమోదు')} · ${getBillVerificationBarcode(paymentModalBill)}`}
          subtitle={`${tr(language, 'Pending Balance:', 'బాకీ మొత్తం:')} ${formatCurrency(paymentModalBill.pendingBalance)}`}
          defaultAmount={paymentModalBill.pendingBalance}
          showMethod
          reasonLabel={tr(language, 'Payment Reference / Notes', 'చెల్లింపు రిఫరెన్స్ / గమనికలు')}
          confirmLabel={tr(language, 'Confirm Payment', 'చెల్లింపు నిర్ధారించు')}
          language={language}
          onClose={() => setPaymentModalBill(null)}
          onSubmit={async ({ amount, method, reason }) => {
            await recordPaymentAtomic({
              billId: paymentModalBill.id,
              amount,
              method,
              referenceId: reason,
            });
            setPaymentModalBill(null);
          }}
        />
      )}

      {/* Cancel Bill Modal */}
      {cancelModalBill && (
        <SimpleActionModal
          title={`${tr(language, 'Cancel Bill', 'బిల్ రద్దు చేయి')} · ${getBillVerificationBarcode(cancelModalBill)}`}
          subtitle={tr(
            language,
            'Stock will be automatically restocked and an immutable audit entry recorded.',
            'స్టాక్ స్వయంచాలకంగా తిరిగి చేర్చబడుతుంది మరియు ఆడిట్ రికార్డు నమోదు అవుతుంది.'
          )}
          reasonLabel={tr(language, 'Cancellation Reason *', 'రద్దు చేయడానికి కారణం *')}
          requireReason
          confirmLabel={tr(language, 'Confirm Cancellation', 'రద్దు నిర్ధారించు')}
          danger
          language={language}
          onClose={() => setCancelModalBill(null)}
          onSubmit={async ({ reason }) => {
            await cancelBillAtomic(cancelModalBill.id, reason);
            setCancelModalBill(null);
          }}
        />
      )}

      {/* Refund Modal */}
      {refundModalBill && (
        <SimpleActionModal
          title={`${tr(language, 'Record Refund', 'వాపసు నమోదు')} · ${getBillVerificationBarcode(refundModalBill)}`}
          subtitle={`${tr(language, 'Max refundable:', 'గరిష్ట వాపసు మొత్తం:')} ${formatCurrency(refundModalBill.amountPaid)}`}
          defaultAmount={refundModalBill.amountPaid}
          showMethod
          reasonLabel={tr(language, 'Refund Reason *', 'వాపసు కారణం *')}
          requireReason
          confirmLabel={tr(language, 'Record Refund', 'వాపసు నమోదు చేయి')}
          danger
          language={language}
          onClose={() => setRefundModalBill(null)}
          onSubmit={async ({ amount, method, reason }) => {
            await recordRefundAtomic({
              billId: refundModalBill.id,
              amount,
              method,
              reason,
            });
            setRefundModalBill(null);
          }}
        />
      )}

      {/* Edit Notes Modal */}
      {editNotesBill && (
        <SimpleActionModal
          title={`${tr(language, 'Edit Notes', 'గమనికలు సవరించు')} · ${getBillVerificationBarcode(editNotesBill)}`}
          subtitle={tr(language, 'Financial figures remain locked for audit compliance.', 'ఆడిట్ భద్రత కోసం బిల్ లెక్కలు లాక్ చేయబడ్డాయి.')}
          reasonLabel={tr(language, 'Bill Notes', 'బిల్ గమనికలు')}
          defaultReason={editNotesBill.notes || ''}
          confirmLabel={tr(language, 'Save Notes', 'గమనికలు సేవ్ చేయి')}
          language={language}
          onClose={() => setEditNotesBill(null)}
          onSubmit={async ({ reason }) => {
            await updateBillNotes(editNotesBill.id, reason);
            setEditNotesBill(null);
          }}
        />
      )}

      {/* Delete Bill Confirmation Modal (Soft Delete to 10-Day Recovery Bin) */}
      {deleteModalBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-rose-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0B1F44]">
                  {tr(language, 'Delete Bill', 'బిల్ తొలగించు')} · {getBillVerificationBarcode(deleteModalBill)}?
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {translateCustomerName(deleteModalBill.customerName, language)} ·{' '}
                  <span className="font-mono font-bold text-[#0B1F44]">
                    {formatCurrency(deleteModalBill.grandTotal)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalBill(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
              {language === 'te' ? (
                <>
                  ఈ బిల్ <strong>సెట్టింగ్స్ &rarr; తొలగించిన బిల్లులు &amp; ఉత్పత్తులు</strong> లోకి తరలించబడుతుంది మరియు శాశ్వత తొలగింపుకు ముందు <strong>10 రోజులు</strong> సురక్షితంగా ఉంటుంది.
                </>
              ) : (
                <>
                  This bill will be moved to <strong>Settings &rarr; Removed Bills &amp; Products</strong> and kept safely for <strong>10 days</strong> so an Admin can restore it anytime before permanent deletion.
                </>
              )}
            </div>

            {deleteError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingBill}
                onClick={() => setDeleteModalBill(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {tr(language, 'Cancel', 'రద్దు')}
              </button>
              <button
                type="button"
                disabled={deletingBill}
                onClick={async () => {
                  setDeletingBill(true);
                  setDeleteError(null);
                  try {
                    await softDeleteBillAtomic(deleteModalBill.id);
                    setSelectedBillIds((prev) => prev.filter((id) => id !== deleteModalBill.id));
                    setDeleteModalBill(null);
                  } catch (err) {
                    setDeleteError(err instanceof Error ? err.message : tr(language, 'Failed to delete bill.', 'బిల్ తొలగించడం విఫలమైంది.'));
                  } finally {
                    setDeletingBill(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingBill
                  ? tr(language, 'Moving...', 'తరలిస్తోంది...')
                  : tr(language, 'Move to Removed Bills', 'తొలగించిన జాబితాకు తరలించు')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Selected Bills Modal */}
      {bulkDeleteModalOpen && visibleSelectedBills.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-rose-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0B1F44]">
                  {language === 'te'
                    ? `ఎంచుకున్న ${visibleSelectedBills.length} బిల్లులను తొలగించాలా?`
                    : `Delete ${visibleSelectedBills.length} Selected Bill${visibleSelectedBills.length === 1 ? '' : 's'}?`}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {tr(language, 'Combined Value:', 'మొత్తం విలువ:')}{' '}
                  <span className="font-mono font-bold text-[#0B1F44]">
                    {formatCurrency(selectedTotalAmount)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5 max-h-36 overflow-y-auto">
              {visibleSelectedBills.slice(0, 5).map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between gap-2 text-xs text-slate-700"
                >
                  <span className="truncate font-medium">
                    <span className="font-mono font-bold text-[#0B1F44]">
                      {getBillVerificationBarcode(bill)}
                    </span>{' '}
                    · {translateCustomerName(bill.customerName, language)}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 shrink-0">
                    {formatCurrency(bill.grandTotal)}
                  </span>
                </div>
              ))}
              {visibleSelectedBills.length > 5 && (
                <div className="text-[11px] font-semibold text-slate-500 pt-1 border-t border-slate-200">
                  {language === 'te'
                    ? `+మరో ${visibleSelectedBills.length - 5} ఎంచుకున్న బిల్లులు`
                    : `+${visibleSelectedBills.length - 5} more selected bill${visibleSelectedBills.length - 5 === 1 ? '' : 's'}`}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
              {language === 'te' ? (
                <>
                  ఈ బిల్లులు <strong>సెట్టింగ్స్ &rarr; తొలగించిన బిల్లులు &amp; ఉత్పత్తులు</strong> లోకి తరలించబడతాయి మరియు శాశ్వత తొలగింపుకు ముందు <strong>10 రోజులు</strong> సురక్షితంగా ఉంటాయి.
                </>
              ) : (
                <>
                  These bills will be moved to <strong>Settings &rarr; Removed Bills &amp; Products</strong> and kept safely for <strong>10 days</strong> so an Admin can restore them anytime before permanent deletion.
                </>
              )}
            </div>

            {bulkDeleteError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                {bulkDeleteError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {tr(language, 'Cancel', 'రద్దు')}
              </button>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={async () => {
                  setBulkDeleting(true);
                  setBulkDeleteError(null);
                  try {
                    const movedCount = await softDeleteBillsBulkAtomic(
                      visibleSelectedBills.map((b) => b.id)
                    );
                    setSelectedBillIds([]);
                    setBulkDeleteModalOpen(false);
                    setBulkNotice(
                      tr(
                        language,
                        `Moved ${movedCount} bill${movedCount === 1 ? '' : 's'} to Settings → Removed Bills & Products (kept for 10 days).`,
                        `${movedCount} బిల్లులు సెట్టింగ్స్ → తొలగించిన బిల్లులు & ఉత్పత్తులలోకి తరలించబడ్డాయి (10 రోజులు ఉంటాయి).`
                      )
                    );
                  } catch (err) {
                    setBulkDeleteError(
                      err instanceof Error
                        ? err.message
                        : tr(language, 'Failed to delete selected bills.', 'ఎంచుకున్న బిల్లులను తొలగించడం విఫలమైంది.')
                    );
                  } finally {
                    setBulkDeleting(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting
                  ? tr(language, 'Moving...', 'తరలిస్తోంది...')
                  : tr(language, `Move ${visibleSelectedBills.length} to Removed`, `${visibleSelectedBills.length} తొలగించిన జాబితాకు తరలించు`)}
              </button>
            </div>
          </div>
        </div>
      )}

      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        products={products}
        bills={bills}
        onBillFound={(b) => setActiveBill(b)}
        onProductFound={(p) => setSearchQuery(translateProductName(p, language))}
        title={tr(language, 'Scan Bill or Product Barcode', 'బిల్ లేదా ఉత్పత్తి బార్‌కోడ్ స్కాన్ చేయండి')}
      />
    </div>
  );
};

const EditBillModal: React.FC<{
  bill: Bill;
  existingItems: BillItem[];
  products: ReturnType<typeof useBillingData>['products'];
  taxEnabled: boolean;
  onClose: () => void;
  onSave: (payload: {
    billId: string;
    customerName: string;
    customerMobile?: string;
    customerAddress?: string;
    items: CartItemInput[];
    overallDiscount: number;
    gstType: GstType;
    amountPaid: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }) => Promise<void>;
}> = ({ bill, existingItems, products, taxEnabled, onClose, onSave }) => {
  const { language } = useAuth();
  const [customerName, setCustomerName] = useState(bill.customerName);
  const [customerMobile, setCustomerMobile] = useState(bill.customerMobile || '');
  const [customerAddress, setCustomerAddress] = useState(bill.customerAddress || '');

  const [items, setItems] = useState<CartItemInput[]>(() => {
    if (existingItems.length > 0) {
      return existingItems.map((bi) => ({
        productId: bi.productId,
        productCode: bi.productCode || '',
        productName: bi.productName,
        variantLabel: bi.variantLabel || '',
        barcode: bi.barcode || '',
        imageUrl: bi.imageUrl || '',
        quantity: bi.quantity,
        unitPrice: bi.unitPrice,
        discount: bi.discount || 0,
        taxRate: bi.taxRate || 0,
      }));
    }
    return [];
  });

  const itemDiscountsSum = existingItems.reduce((s, it) => s + Number(it.discount || 0), 0);
  const [overallDiscount, setOverallDiscount] = useState<number>(() =>
    Math.max(0, Math.round((Number(bill.discountAmount || 0) - itemDiscountsSum) * 100) / 100)
  );
  const [gstType, setGstType] = useState<GstType>(taxEnabled ? bill.gstType : 'NONE');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(bill.paymentMethod);
  const [amountPaid, setAmountPaid] = useState<number>(bill.amountPaid);
  const [notes, setNotes] = useState(bill.notes || '');
  const [addProductId, setAddProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => {
    let subtotal = 0;
    let itemDisc = 0;
    let rawTax = 0;
    items.forEach((it) => {
      const gross = it.quantity * it.unitPrice;
      const d = Math.min(gross, Math.max(0, it.discount || 0));
      const net = gross - d;
      const t = taxEnabled && gstType !== 'NONE' ? (net * (it.taxRate || 0)) / 100 : 0;
      subtotal += gross;
      itemDisc += d;
      rawTax += t;
    });
    const extra = Math.min(Math.max(0, overallDiscount), Math.max(0, subtotal - itemDisc));
    const totalDisc = itemDisc + extra;
    const taxable = Math.max(0, subtotal - totalDisc);
    const factor = subtotal - itemDisc > 0 ? taxable / (subtotal - itemDisc) : 1;
    const totalTax = taxEnabled && gstType !== 'NONE' ? Math.round(rawTax * factor * 100) / 100 : 0;
    const grandTotal = Math.round((taxable + totalTax) * 100) / 100;
    const paid = paymentMethod === 'Unpaid' ? 0 : Math.min(grandTotal, Math.max(0, amountPaid));
    const pending = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);
    return { subtotal, totalDisc, totalTax, grandTotal, paid, pending };
  }, [items, overallDiscount, gstType, taxEnabled, amountPaid, paymentMethod]);

  const handleAddProduct = () => {
    if (!addProductId) return;
    const p = products.find((prod) => prod.id === addProductId);
    if (!p) return;
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        productCode: p.productCode,
        productName: p.name,
        barcode: p.barcode,
        imageUrl: p.imageUrl || '',
        quantity: 1,
        unitPrice: p.sellingPrice,
        discount: 0,
        taxRate: taxEnabled ? p.taxRate : 0,
      },
    ]);
    setAddProductId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!customerName.trim()) {
      setErr(tr(language, 'Customer name is required.', 'కస్టమర్ పేరు తప్పనిసరి.'));
      return;
    }
    if (items.length === 0) {
      setErr(tr(language, 'Bill must contain at least one product.', 'బిల్‌లో కనీసం ఒక ఉత్పత్తి ఉండాలి.'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        billId: bill.id,
        customerName: customerName.trim(),
        customerMobile: customerMobile.trim(),
        customerAddress: customerAddress.trim(),
        items,
        overallDiscount,
        gstType: taxEnabled ? gstType : 'NONE',
        amountPaid: preview.paid,
        paymentMethod: preview.paid === 0 ? 'Unpaid' : paymentMethod,
        notes: notes.trim(),
      });
    } catch (error) {
      setErr(error instanceof Error ? error.message : tr(language, 'Failed to update bill.', 'బిల్ సవరించడం విఫలమైంది.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-0 sm:p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-2xl min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-auto"
      >
        <div className="px-5 py-3.5 bg-[#0B1F44] text-white flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold">
              {tr(language, 'Edit Bill', 'బిల్ సవరించు')} · {getBillVerificationBarcode(bill)}
            </h3>
            <p className="text-[11px] text-blue-200">
              {tr(language, 'Created by', 'చేసినవారు:')} {bill.createdByName} ·{' '}
              {tr(language, 'Modify prices, quantities, customer & payment', 'ధరలు, పరిమాణాలు, కస్టమర్ & చెల్లింపు మార్చండి')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-blue-100 hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">
                {tr(language, 'Customer Name *', 'కస్టమర్ పేరు *')}
              </label>
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">
                {tr(language, 'Mobile', 'మొబైల్')}
              </label>
              <input
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">
                {tr(language, 'Address / Site', 'చిరునామా / స్థలం')}
              </label>
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#0B1F44]">
                {tr(language, 'Line Items', 'వస్తువులు')} ({items.length})
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  value={addProductId}
                  onChange={(e) => setAddProductId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 max-w-[180px]"
                >
                  <option value="">{tr(language, '+ Add Product...', '+ ఉత్పత్తి చేర్చు...')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {translateProductName(p, language)} (₹{p.sellingPrice})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddProduct}
                  disabled={!addProductId}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1D4ED8] text-white font-semibold disabled:opacity-40"
                >
                  {tr(language, 'Add', 'చేర్చు')}
                </button>
              </div>
            </div>

            {items.map((item, idx) => {
              const matchedProd = products.find((p) => p.id === item.productId);
              return (
              <div
                key={`${item.productId}-${idx}`}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[#0B1F44] truncate">
                    {translateProductName(matchedProd, language, item.productName)}{' '}
                    {item.variantLabel ? `(${translateVariantLabel(item.variantLabel, language)})` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <div>
                    <label className="text-[10px] text-slate-500 block">
                      {tr(language, 'Rate (₹)', 'ధర (₹)')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, unitPrice: Math.max(0, Number(e.target.value) || 0) } : it
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 font-mono rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">
                      {tr(language, 'Qty', 'సంఖ్య')}
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it
                            )
                          )
                        }
                        className="p-1.5 rounded-lg border border-slate-200 bg-white"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, quantity: Math.max(1, Number(e.target.value) || 1) } : it
                            )
                          )
                        }
                        className="w-full text-center font-mono py-1.5 rounded-lg border border-slate-200 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, quantity: it.quantity + 1 } : it
                            )
                          )
                        }
                        className="p-1.5 rounded-lg border border-slate-200 bg-white"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">
                      {tr(language, 'Disc (₹)', 'తగ్గింపు (₹)')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={item.discount}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, discount: Math.max(0, Number(e.target.value) || 0) } : it
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 font-mono rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">
                {tr(language, 'Extra Discount (₹)', 'అదనపు తగ్గింపు (₹)')}
              </label>
              <input
                type="number"
                min={0}
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2.5 py-2 font-mono rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                {tr(language, 'GST Mode', 'జీఎస్టీ విధానం')}
              </label>
              <select
                value={taxEnabled ? gstType : 'NONE'}
                disabled={!taxEnabled}
                onChange={(e) => setGstType(e.target.value as GstType)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50"
              >
                <option value="NONE">{tr(language, 'No GST', 'జీఎస్టీ లేదు')}</option>
                <option value="CGST_SGST">{tr(language, 'CGST + SGST', 'సీజీఎస్టీ + ఎస్‌జీఎస్టీ')}</option>
                <option value="IGST">{tr(language, 'IGST', 'ఐజీఎస్టీ')}</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                {tr(language, 'Payment Method', 'చెల్లింపు విధానం')}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50"
              >
                <option value="Cash">{translatePaymentMethod('Cash', language)}</option>
                <option value="UPI">{translatePaymentMethod('UPI', language)}</option>
                <option value="Bank Transfer">{translatePaymentMethod('Bank Transfer', language)}</option>
                <option value="Other">{translatePaymentMethod('Other', language)}</option>
                <option value="Unpaid">{translatePaymentMethod('Unpaid', language)}</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                {tr(language, 'Amount Paid (₹)', 'చెల్లించిన మొత్తం (₹)')}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={paymentMethod === 'Unpaid'}
                value={paymentMethod === 'Unpaid' ? 0 : amountPaid}
                onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2.5 py-2 font-mono rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 mb-1">
              {tr(language, 'Bill Notes', 'బిల్ గమనికలు')}
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr(language, 'Optional notes', 'ఐచ్ఛిక గమనికలు')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-wrap items-center justify-between gap-2 font-mono">
            <div>
              <div className="text-[11px] text-slate-500">
                {tr(language, 'New Grand Total', 'కొత్త మొత్తం బిల్లు')}
              </div>
              <div className="text-base font-bold text-[#0B1F44]">{formatCurrency(preview.grandTotal)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">
                {tr(language, 'Paid:', 'చెల్లించినది:')} {formatCurrency(preview.paid)} ·{' '}
                {tr(language, 'Due:', 'బాకీ:')} {formatCurrency(preview.pending)}
              </div>
              <div className="text-[11px] text-slate-500">
                {tr(language, 'Previous Total:', 'పాత మొత్తం:')} {formatCurrency(bill.grandTotal)}
              </div>
            </div>
          </div>

          {err && <div className="text-xs text-rose-600 font-medium">{err}</div>}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
          >
            {tr(language, 'Cancel', 'రద్దు')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-bold disabled:opacity-50"
          >
            {saving ? tr(language, 'Saving Bill Changes...', 'మార్పులు సేవ్ అవుతున్నాయి...') : tr(language, 'Save Updated Bill', 'మార్చిన బిల్ సేవ్ చేయి')}
          </button>
        </div>
      </form>
    </div>
  );
};

const SimpleActionModal: React.FC<{
  title: string;
  subtitle: string;
  defaultAmount?: number;
  showMethod?: boolean;
  reasonLabel: string;
  defaultReason?: string;
  requireReason?: boolean;
  confirmLabel: string;
  danger?: boolean;
  language: 'en' | 'te';
  onClose: () => void;
  onSubmit: (vals: { amount: number; method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other'; reason: string }) => Promise<void>;
}> = ({
  title,
  subtitle,
  defaultAmount,
  showMethod,
  reasonLabel,
  defaultReason = '',
  requireReason,
  confirmLabel,
  danger,
  language,
  onClose,
  onSubmit,
}) => {
  const [amount, setAmount] = useState(defaultAmount ?? 0);
  const [method, setMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Other'>('Cash');
  const [reason, setReason] = useState(defaultReason);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      setErr(tr(language, 'Please provide a reason.', 'దయచేసి కారణం నమోదు చేయండి.'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({ amount, method, reason });
    } catch (error) {
      setErr(error instanceof Error ? error.message : tr(language, 'Action failed.', 'చర్య విఫలమైంది.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handle} className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>

        {defaultAmount !== undefined && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {tr(language, 'Amount (₹)', 'మొత్తం (₹)')}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={defaultAmount}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 bg-white"
            />
          </div>
        )}

        {showMethod && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {tr(language, 'Payment Method', 'చెల్లింపు విధానం')}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
            >
              <option value="Cash">{translatePaymentMethod('Cash', language)}</option>
              <option value="UPI">{translatePaymentMethod('UPI', language)}</option>
              <option value="Bank Transfer">{translatePaymentMethod('Bank Transfer', language)}</option>
              <option value="Other">{translatePaymentMethod('Other', language)}</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{reasonLabel}</label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
          />
        </div>

        {err && <div className="text-xs text-rose-600">{err}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200">
            {tr(language, 'Cancel', 'రద్దు')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-4 py-2 text-xs font-semibold rounded-lg text-white ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0B1F44] hover:bg-[#13326b]'
            }`}
          >
            {busy ? tr(language, 'Processing...', 'ప్రాసెస్ అవుతోంది...') : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
