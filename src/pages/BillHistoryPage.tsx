import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Barcode,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  HardHat,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
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
import { buildWhatsAppDirectUrl, buildWhatsAppReceiptText, formatWhatsAppPhone } from '../lib/whatsapp';
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
import { ModalPortal } from '../components/ModalPortal';

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
    approvalRequests,
    editBillAtomic,
    recordPaymentAtomic,
    cancelBillAtomic,
    softDeleteBillAtomic,
    softDeleteBillsBulkAtomic,
    recordRefundAtomic,
    requestBillEditApproval,
    logMessageDispatch,
  } = useBillingData();
  const { isAdmin, activeUid, language } = useAuth();

  const [sectionTab, setSectionTab] = useState<HistorySectionTab>(() => (isAdmin ? 'all' : 'bills'));
  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBill, setActiveBill] = useState<Bill | null>(null);
  const [editingFullBill, setEditingFullBill] = useState<Bill | null>(null);
  const [requestEditBill, setRequestEditBill] = useState<Bill | null>(null);
  const [editRequestReason, setEditRequestReason] = useState('');
  const [requestingEdit, setRequestingEdit] = useState(false);
  const [requestEditErr, setRequestEditErr] = useState<string | null>(null);
  const [approvalBanner, setApprovalBanner] = useState<string | null>(null);
  const [paymentModalBill, setPaymentModalBill] = useState<Bill | null>(null);
  const [cancelModalBill, setCancelModalBill] = useState<Bill | null>(null);
  const [refundModalBill, setRefundModalBill] = useState<Bill | null>(null);
  const [deleteModalBill, setDeleteModalBill] = useState<Bill | null>(null);
  const [deletingBill, setDeletingBill] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);

  const pendingEditBillIdSet = useMemo(
    () =>
      new Set(
        approvalRequests
          .filter((r) => r.requestType === 'bill_edit' && r.status === 'pending' && r.billId)
          .map((r) => r.billId!)
      ),
    [approvalRequests]
  );

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
        (isAdmin ? getBillVerificationBarcode(b).toLowerCase().includes(q) : b.billNumber.toLowerCase().includes(q)) ||
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

  const canCancel = isAdmin;
  const showBillsSection = !isAdmin || sectionTab === 'all' || sectionTab === 'bills';

  const deletableScopedBills = useMemo(
    () => (isAdmin ? scopedBills : []),
    [scopedBills, isAdmin]
  );

  const selectedIdSet = useMemo(() => new Set(selectedBillIds), [selectedBillIds]);

  const visibleSelectedBills = useMemo(
    () => deletableScopedBills.filter((b) => selectedIdSet.has(b.id)),
    [deletableScopedBills, selectedIdSet]
  );

  const allVisibleSelected =
    deletableScopedBills.length > 0 && visibleSelectedBills.length === deletableScopedBills.length;
  const selectionModeActive = visibleSelectedBills.length > 0;
  const remainingSelectableCount = Math.max(
    0,
    deletableScopedBills.length - visibleSelectedBills.length
  );

  const selectedTotalAmount = useMemo(
    () => visibleSelectedBills.reduce((sum, b) => sum + Number(b.grandTotal || 0), 0),
    [visibleSelectedBills]
  );

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  };

  const toggleBillSelection = (billId: string) => {
    setBulkNotice(null);
    setSelectedBillIds((prev) =>
      prev.includes(billId) ? prev.filter((id) => id !== billId) : [...prev, billId]
    );
  };

  const selectRemainingAllVisible = () => {
    setBulkNotice(null);
    const merged = new Set(selectedBillIds);
    deletableScopedBills.forEach((b) => merged.add(b.id));
    setSelectedBillIds(Array.from(merged));
  };

  const clearSelection = () => {
    setSelectedBillIds([]);
  };

  const handleBillPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    billId: string,
    canSelect: boolean
  ) => {
    if (!canSelect) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, label')) return;

    clearLongPressTimer();
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      pointerStartRef.current = null;
      suppressNextClickRef.current = true;
      setBulkNotice(null);
      setSelectedBillIds((prev) => (prev.includes(billId) ? prev : [...prev, billId]));
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(18);
        } catch {
          // Ignore vibration errors on unsupported devices
        }
      }
    }, 450);
  };

  const handleBillPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!pointerStartRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    if (Math.hypot(dx, dy) > 10) {
      clearLongPressTimer();
    }
  };

  const handleBillClick = (
    e: React.MouseEvent<HTMLElement>,
    bill: Bill,
    canSelect: boolean
  ) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, label')) return;
    if (selectionModeActive) {
      if (canSelect) toggleBillSelection(bill.id);
      return;
    }
    setActiveBill(bill);
  };

  const handleBillContextMenu = (
    e: React.MouseEvent<HTMLElement>,
    canSelect: boolean
  ) => {
    if (!canSelect) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) return;
    if (selectionModeActive || suppressNextClickRef.current || longPressTimerRef.current !== null) {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Summary Cards with Animated Counters */}
      {isAdmin ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MotionCard
            delay={0}
            className="bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl p-3.5 shadow-sm slp-card-lift"
          >
            <div className="text-[11px] font-semibold tracking-wide text-[#6D665E] dark:text-slate-400">
              {tr(language, 'Bills', 'బిల్లులు')} ({scopedBills.length})
            </div>
            <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums text-[#0A2240] dark:text-white">
              <AnimatedNumber value={totals.billSales} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard
            delay={0.04}
            className="bg-white dark:bg-slate-900 border border-[#F0D9B5] dark:border-amber-900/60 rounded-2xl p-3.5 shadow-sm slp-card-lift"
          >
            <div className="text-[11px] font-semibold tracking-wide text-[#6D665E] dark:text-slate-400">
              {tr(language, 'Labour Work', 'లేబర్ పని')} ({labourWorks.length})
            </div>
            <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums text-[#9A4307] dark:text-amber-400">
              <AnimatedNumber value={totals.labourTotal} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard
            delay={0.08}
            className="bg-white dark:bg-slate-900 border border-[#C5E8D1] dark:border-emerald-900/60 rounded-2xl p-3.5 shadow-sm slp-card-lift"
          >
            <div className="text-[11px] font-semibold tracking-wide text-[#6D665E] dark:text-slate-400">
              {tr(language, 'Shop Income', 'షాప్ ఆదాయం')}
            </div>
            <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums text-[#15803D] dark:text-emerald-400">
              +<AnimatedNumber value={totals.shopIncome} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard
            delay={0.12}
            className="bg-white dark:bg-slate-900 border border-[#F5C6C0] dark:border-rose-900/60 rounded-2xl p-3.5 shadow-sm slp-card-lift"
          >
            <div className="text-[11px] font-semibold tracking-wide text-[#6D665E] dark:text-slate-400">
              {tr(language, 'Shop Expenses', 'షాప్ ఖర్చులు')}
            </div>
            <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums text-[#C23B2B] dark:text-rose-400">
              -<AnimatedNumber value={totals.shopExpense} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <MotionCard
            delay={0}
            className="bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl p-3.5 shadow-sm slp-card-lift"
          >
            <div className="text-[11px] font-semibold tracking-wide text-[#6D665E] dark:text-slate-400">
              {tr(language, 'My Bills', 'నా బిల్లులు')} ({scopedBills.length})
            </div>
            <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums text-[#0A2240] dark:text-white">
              <AnimatedNumber value={totals.billSales} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard
            delay={0.05}
            className="bg-white dark:bg-slate-900 border border-[#F5C6C0] dark:border-rose-900/60 rounded-2xl p-3.5 shadow-sm slp-card-lift"
          >
            <div className="text-[11px] font-semibold tracking-wide text-[#6D665E] dark:text-slate-400">
              {tr(language, 'My Bills Due', 'నా బిల్లుల బాకీ')}
            </div>
            <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums text-[#C23B2B] dark:text-rose-400">
              <AnimatedNumber value={totals.pendingTotal} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
        </div>
      )}

      {/* Admin Section Switcher with Sliding Pill */}
      {isAdmin && (
        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[#F3EDE5] dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800">
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
                className={`relative py-2 px-2 rounded-xl text-[11px] sm:text-xs font-display font-semibold transition-colors truncate ${
                  active
                    ? 'text-white'
                    : 'text-[#0A2240] dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/70'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="history-section-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-[#0A2240] dark:bg-[#1E3A5F] shadow-sm"
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
        <div className="bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row gap-2.5">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8A8279] dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAdmin
                    ? tr(language, 'Search barcode, customer name, product...', 'బార్‌కోడ్, కస్టమర్ పేరు, ఉత్పత్తి వెతకండి...')
                    : tr(language, 'Search bill #, customer name, product...', 'బిల్ నంబర్, కస్టమర్ పేరు, ఉత్పత్తి వెతకండి...')
                }
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800/80 text-[#0A2240] dark:text-slate-100 placeholder:text-[#8A8279] dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A2240] dark:focus:ring-amber-400/60"
              />
            </div>
            {isAdmin && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0A2240] dark:bg-[#1E3A5F] hover:bg-[#13325B] dark:hover:bg-[#264A77] text-white text-xs font-semibold shrink-0 transition"
              >
                <Camera className="w-3.5 h-3.5 text-amber-300" />
                <span>{tr(language, 'Scan Barcode', 'బార్‌కోడ్ స్కాన్')}</span>
              </motion.button>
            )}
          </div>
          {isAdmin && (
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#F3EDE5] dark:bg-slate-800/80 border border-[#E5DDD3] dark:border-slate-700 shrink-0">
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
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                    creatorFilter === f.id
                      ? 'bg-[#0A2240] dark:bg-[#1E3A5F] text-white shadow-xs'
                      : 'text-[#0A2240] dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700/70'
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
        <div className="bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-[#FAF8F5] dark:bg-slate-800/60 border-b border-[#E5DDD3] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-display font-bold text-[#0A2240] dark:text-slate-100">
              <ReceiptText className="w-4 h-4 text-[#9A4307] dark:text-amber-400" />
              <span>
                {isAdmin
                  ? `${tr(language, 'Bills History', 'బిల్లుల చరిత్ర')} (${scopedBills.length})`
                  : `${tr(language, 'My Created Bills', 'నేను చేసిన బిల్లులు')} (${scopedBills.length})`}
              </span>
            </div>
            {isAdmin && !selectionModeActive && deletableScopedBills.length > 0 && (
              <span className="text-[11px] font-medium text-[#6D665E] dark:text-slate-400">
                {tr(language, 'Long-press any bill to select', 'ఎంచుకోవడానికి ఏదైనా బిల్లును లాంగ్-ప్రెస్ చేయండి')}
              </span>
            )}
          </div>

          <AnimatePresence>
            {approvalBanner && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-2.5 bg-[#FDF3DF] dark:bg-amber-950/50 border-b border-[#F0D9B5] dark:border-amber-900/60 flex items-center justify-between gap-2 text-xs font-medium text-[#9A4307] dark:text-amber-200"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 shrink-0" />
                  {approvalBanner}
                </span>
                <button
                  type="button"
                  onClick={() => setApprovalBanner(null)}
                  className="p-0.5 text-[#9A4307] dark:text-amber-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {bulkNotice && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-2.5 bg-[#E7F6EC] dark:bg-emerald-950/50 border-b border-[#C5E8D1] dark:border-emerald-900/60 flex items-center justify-between gap-2 text-xs font-medium text-[#15803D] dark:text-emerald-200"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0" />
                  {bulkNotice}
                </span>
                <button
                  type="button"
                  onClick={() => setBulkNotice(null)}
                  className="p-0.5 text-[#15803D] dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectionModeActive && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="px-4 py-2.5 bg-[#0A2240] dark:bg-slate-950 border-b border-[#E5DDD3] dark:border-slate-800 text-white flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded-md bg-white/15 font-display font-bold tabular-nums text-white">
                    {visibleSelectedBills.length} {tr(language, 'selected', 'ఎంచుకున్నవి')}
                  </span>
                  <span className="text-[#E5DDD3]">
                    {tr(language, 'Total:', 'మొత్తం:')}{' '}
                    <strong className="font-display font-bold tabular-nums text-white">
                      {formatCurrency(selectedTotalAmount)}
                    </strong>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!allVisibleSelected && remainingSelectableCount > 0 && (
                    <button
                      type="button"
                      onClick={selectRemainingAllVisible}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#9A4307] hover:bg-[#B45309] text-white text-[11px] font-bold shadow-xs transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-200" />
                      {tr(language, 'Select Remaining All', 'మిగిలినవన్నీ ఎంచుకో')} ({remainingSelectableCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDeleteError(null);
                      setBulkDeleteModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C23B2B] hover:bg-[#A32E20] text-white text-[11px] font-bold shadow-sm transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {tr(language, 'Delete', 'తొలగించు')} ({visibleSelectedBills.length})
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    aria-label={tr(language, 'Exit selection mode', 'ఎంపిక మోడ్ మూసివేయి')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    {tr(language, 'Cancel', 'రద్దు')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Card Layout (No Horizontal Scroll Overflow) */}
          <div className="md:hidden divide-y divide-[#EFEAE2] dark:divide-slate-800/80">
            {scopedBills.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-[#8A8279] dark:text-slate-500">
                {isAdmin
                  ? tr(language, 'No bills recorded yet.', 'ఇంకా బిల్లులు నమోదు కాలేదు.')
                  : tr(language, 'You have not created any bills yet. Open New Billing to create one.', 'మీరు ఇంకా బిల్లులు చేయలేదు. కొత్త బిల్లు తెరిచి సృష్టించండి.')}
              </div>
            ) : (
              scopedBills.map((bill) => {
                const dt = formatTimestamp(bill.createdAt);
                const isOwnBill = bill.createdByUid === activeUid;
                const canSelect = isAdmin;
                const isSelected = selectedIdSet.has(bill.id);
                const isApprovedToEdit =
                  !isAdmin &&
                  isOwnBill &&
                  bill.billStatus === 'active' &&
                  bill.editApprovedForUid === activeUid &&
                  Boolean(bill.editApprovalRequestId);
                const isWaitingApproval =
                  !isAdmin &&
                  isOwnBill &&
                  bill.billStatus === 'active' &&
                  !isApprovedToEdit &&
                  pendingEditBillIdSet.has(bill.id);
                return (
                  <div
                    key={bill.id}
                    onPointerDown={(e) => handleBillPointerDown(e, bill.id, canSelect)}
                    onPointerMove={handleBillPointerMove}
                    onPointerUp={clearLongPressTimer}
                    onPointerCancel={clearLongPressTimer}
                    onPointerLeave={clearLongPressTimer}
                    onContextMenu={(e) => handleBillContextMenu(e, canSelect)}
                    onClick={(e) => handleBillClick(e, bill, canSelect)}
                    className={`p-3.5 space-y-2.5 transition-colors select-none sm:select-auto cursor-pointer ${
                      isSelected
                        ? 'bg-[#F6F1EA] dark:bg-amber-950/25 ring-1 ring-inset ring-[#9A4307]/40 dark:ring-amber-400/50'
                        : 'hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-[#9A4307] dark:text-amber-400 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isAdmin ? (
                              <span className="inline-flex items-center gap-1 font-display font-bold tabular-nums text-xs text-[#0A2240] dark:text-slate-100">
                                <Barcode className="w-3.5 h-3.5 text-[#9A4307] dark:text-amber-400" />
                                {getBillVerificationBarcode(bill)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-display font-bold tabular-nums text-xs text-[#0A2240] dark:text-slate-100">
                                <ReceiptText className="w-3.5 h-3.5 text-[#9A4307] dark:text-amber-400" />
                                {bill.billNumber}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                bill.paymentStatus === 'paid'
                                  ? 'bg-[#E7F6EC] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300'
                                  : bill.paymentStatus === 'cancelled' || bill.paymentStatus === 'refunded'
                                  ? 'bg-[#FCE8E6] dark:bg-rose-950/60 text-[#C23B2B] dark:text-rose-300'
                                  : 'bg-[#FDF3DF] dark:bg-amber-950/60 text-[#9A4307] dark:text-amber-300'
                              }`}
                            >
                              {translateStatus(bill.paymentStatus, language)}
                            </span>
                            {Boolean(bill.editedAt) && (
                              <span className="px-1.5 py-0.5 rounded bg-[#F3EDE5] dark:bg-slate-800 text-[#9A4307] dark:text-amber-300 text-[10px] font-bold">
                                {tr(language, 'Edited', 'సవరించబడింది')}
                              </span>
                            )}
                          </div>
                          <div className="font-display text-[13px] font-bold text-[#0A2240] dark:text-slate-100 mt-0.5 truncate">
                            {translateCustomerName(bill.customerName, language)}{' '}
                            {bill.customerMobile ? (
                              <span className="font-sans font-medium tabular-nums text-[11px] text-[#6D665E] dark:text-slate-400">
                                · {bill.customerMobile}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] font-medium text-[#6D665E] dark:text-slate-400 truncate mt-0.5">
                            {bill.itemsSummary
                              ? translateItemsSummary(bill.itemsSummary, products, language)
                              : `${bill.itemCount} ${tr(language, 'items', 'వస్తువులు')}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display tabular-nums font-bold text-sm text-[#0A2240] dark:text-white">
                          {formatCurrency(bill.grandTotal)}
                        </div>
                        {bill.pendingBalance > 0 && (
                          <div className="font-display tabular-nums text-[11px] font-bold text-[#C23B2B] dark:text-rose-400">
                            {tr(language, 'Due', 'బాకీ')} {formatCurrency(bill.pendingBalance)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#6D665E] dark:text-slate-400">
                      <span className="tabular-nums font-medium">
                        {formatAppDate(dt, language)} ·{' '}
                        {dt.toLocaleTimeString(getAppLocale(language), { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="truncate max-w-[140px]">
                        {tr(language, 'By:', 'ద్వారా:')}{' '}
                        <strong className="font-semibold text-[#0A2240] dark:text-slate-200">{bill.createdByName}</strong>
                        {!isOwnBill && isAdmin ? ` (${tr(language, 'Staff', 'సిబ్బంది')})` : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {Boolean(formatWhatsAppPhone(bill.customerMobile)) && (() => {
                        const publicUrl = `${window.location.origin}/?invoice=${bill.publicToken}${language === 'te' ? '&lang=te' : ''}`;
                        const items = billItems.filter((bi) => bi.billId === bill.id);
                        const msg = buildWhatsAppReceiptText({ bill, items, business, products, publicUrl, language });
                        const waHref = buildWhatsAppDirectUrl(bill.customerMobile, msg);
                        return (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              logMessageDispatch({
                                channel: 'whatsapp',
                                recipientMobile: bill.customerMobile || '',
                                billId: bill.id,
                                billNumber: bill.billNumber,
                                messageBody: msg,
                                status: 'opened_share_screen',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-[11px] font-bold"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            {tr(language, 'WhatsApp', 'వాట్సాప్')}
                          </a>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setActiveBill(bill)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0A2240] hover:bg-[#13325B] text-white text-[11px] font-bold"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        {tr(language, 'Share / Receipt', 'షేర్ / రసీదు')}
                      </button>
                      {isAdmin && bill.billStatus === 'active' && (
                        <button
                          type="button"
                          onClick={() => setEditingFullBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0A2240] dark:bg-slate-800 hover:bg-[#13325B] dark:hover:bg-slate-700 text-white text-[11px] font-bold"
                        >
                          <Pencil className="w-3 h-3" />
                          {tr(language, 'Edit Bill', 'బిల్ సవరించు')}
                        </button>
                      )}
                      {isApprovedToEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingFullBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-[11px] font-bold"
                        >
                          <Pencil className="w-3 h-3" />
                          {tr(language, 'Edit Bill (Approved)', 'బిల్ సవరించు (ఆమోదించబడింది)')}
                        </button>
                      )}
                      {isWaitingApproval && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FDF3DF] border border-[#F0D9B5] text-[#9A4307] text-[11px] font-bold">
                          <Clock className="w-3 h-3" />
                          {tr(language, 'Waiting Owner Approval', 'యజమాని ఆమోదం కోసం వేచి ఉంది')}
                        </span>
                      )}
                      {!isAdmin && isOwnBill && bill.billStatus === 'active' && !isApprovedToEdit && !isWaitingApproval && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestEditErr(null);
                            setEditRequestReason('');
                            setRequestEditBill(bill);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#F0D9B5] bg-[#FDF3DF] hover:bg-[#FCE8C8] text-[#9A4307] text-[11px] font-bold"
                        >
                          <Send className="w-3 h-3" />
                          {tr(language, 'Request Edit', 'సవరణ అభ్యర్థించండి')}
                        </button>
                      )}
                      {isAdmin && bill.billStatus === 'active' && bill.pendingBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#C5E8D1] dark:border-emerald-800 text-[#15803D] dark:text-emerald-300 text-[11px] font-semibold"
                        >
                          <Wallet className="w-3 h-3" />
                          {tr(language, 'Pay', 'చెల్లించు')}
                        </button>
                      )}
                      {canCancel && bill.billStatus === 'active' && (
                        <button
                          type="button"
                          onClick={() => setCancelModalBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#F5C6C0] dark:border-rose-800 text-[#C23B2B] dark:text-rose-300 text-[11px] font-semibold"
                        >
                          <Ban className="w-3 h-3" />
                          {tr(language, 'Cancel', 'రద్దు')}
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteModalBill(bill);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#F5C6C0] dark:border-rose-800 bg-[#FCE8E6] dark:bg-rose-950/40 text-[#C23B2B] dark:text-rose-300 text-[11px] font-semibold"
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
            <table className="w-full text-xs text-left font-sans">
              <thead className="bg-[#FAF8F5] dark:bg-slate-800/70 border-b border-[#E5DDD3] dark:border-slate-800 text-[11px] uppercase tracking-wider font-display font-bold text-[#6D665E] dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-bold">
                    {isAdmin ? tr(language, 'Barcode', 'బార్‌కోడ్') : tr(language, 'Bill No.', 'బిల్ నంబర్')}
                  </th>
                  <th className="py-3 px-4 font-bold">{tr(language, 'Date & Time', 'తేదీ & సమయం')}</th>
                  <th className="py-3 px-4 font-bold">{tr(language, 'Customer', 'కస్టమర్')}</th>
                  <th className="py-3 px-4 font-bold">{tr(language, 'Products', 'ఉత్పత్తులు')}</th>
                  <th className="py-3 px-4 font-bold text-right">{tr(language, 'Total', 'మొత్తం')}</th>
                  <th className="py-3 px-4 font-bold text-right">{tr(language, 'Balance', 'బాకీ')}</th>
                  <th className="py-3 px-4 font-bold">{tr(language, 'Payment', 'చెల్లింపు')}</th>
                  <th className="py-3 px-4 font-bold">{tr(language, 'Creator', 'బిల్ చేసినవారు')}</th>
                  <th className="py-3 px-4 font-bold text-right">{tr(language, 'Actions', 'చర్యలు')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE2] dark:divide-slate-800/80">
                {scopedBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-[#6D665E] dark:text-slate-400 font-medium">
                      {isAdmin
                        ? tr(language, 'No bills recorded yet.', 'ఇంకా బిల్లులు నమోదు కాలేదు.')
                        : tr(language, 'You have not created any bills yet.', 'మీరు ఇంకా బిల్లులు చేయలేదు.')}
                    </td>
                  </tr>
                ) : (
                  scopedBills.map((bill) => {
                    const dt = formatTimestamp(bill.createdAt);
                    const isOwnBill = bill.createdByUid === activeUid;
                    const canSelect = isAdmin;
                    const isSelected = selectedIdSet.has(bill.id);
                    const isApprovedToEdit =
                      !isAdmin &&
                      isOwnBill &&
                      bill.billStatus === 'active' &&
                      bill.editApprovedForUid === activeUid &&
                      Boolean(bill.editApprovalRequestId);
                    const isWaitingApproval =
                      !isAdmin &&
                      isOwnBill &&
                      bill.billStatus === 'active' &&
                      !isApprovedToEdit &&
                      pendingEditBillIdSet.has(bill.id);
                    return (
                      <tr
                        key={bill.id}
                        onPointerDown={(e) => handleBillPointerDown(e, bill.id, canSelect)}
                        onPointerMove={handleBillPointerMove}
                        onPointerUp={clearLongPressTimer}
                        onPointerCancel={clearLongPressTimer}
                        onPointerLeave={clearLongPressTimer}
                        onContextMenu={(e) => handleBillContextMenu(e, canSelect)}
                        onClick={(e) => handleBillClick(e, bill, canSelect)}
                        className={`transition-colors cursor-pointer ${
                          selectionModeActive ? 'select-none' : ''
                        } ${
                          isSelected
                            ? 'bg-[#F6F1EA] dark:bg-amber-950/25 hover:bg-[#EFE8DF] dark:hover:bg-amber-950/40'
                            : 'hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4 font-display font-bold tabular-nums text-[#0A2240] dark:text-slate-100 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {isSelected && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#9A4307] dark:text-amber-400 shrink-0" />
                            )}
                            {isAdmin ? (
                              <>
                                <Barcode className="w-3.5 h-3.5 text-[#9A4307] dark:text-amber-400" />
                                <span>{getBillVerificationBarcode(bill)}</span>
                              </>
                            ) : (
                              <>
                                <ReceiptText className="w-3.5 h-3.5 text-[#9A4307] dark:text-amber-400" />
                                <span>{bill.billNumber}</span>
                              </>
                            )}
                          </div>
                          {Boolean(bill.editedAt) && (
                            <span className="block w-fit mt-0.5 px-1.5 py-0.5 rounded bg-[#F3EDE5] dark:bg-slate-800 text-[#9A4307] dark:text-amber-300 text-[10px] font-sans font-bold">
                              {tr(language, 'Edited', 'సవరించబడింది')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#6D665E] dark:text-slate-400 whitespace-nowrap tabular-nums font-medium">
                          {formatAppDate(dt, language)} ·{' '}
                          {dt.toLocaleTimeString(getAppLocale(language), { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-display font-bold text-[#0A2240] dark:text-slate-100">
                            {translateCustomerName(bill.customerName, language)}
                          </div>
                          {bill.customerMobile && (
                            <div className="text-[11px] tabular-nums font-medium text-[#6D665E] dark:text-slate-400">{bill.customerMobile}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[220px] truncate text-[#6D665E] dark:text-slate-300 font-medium">
                          {bill.itemsSummary
                            ? translateItemsSummary(bill.itemsSummary, products, language)
                            : `${bill.itemCount} ${tr(language, 'items', 'వస్తువులు')}`}
                        </td>
                        <td className="py-3 px-4 text-right font-display font-bold tabular-nums whitespace-nowrap text-[#0A2240] dark:text-white">
                          {formatCurrency(bill.grandTotal)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-display tabular-nums whitespace-nowrap ${
                            bill.pendingBalance > 0
                              ? 'font-bold text-[#C23B2B] dark:text-rose-400'
                              : 'font-medium text-[#6D665E] dark:text-slate-400'
                          }`}
                        >
                          {formatCurrency(bill.pendingBalance)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-[#0A2240] dark:text-slate-200">
                            {translatePaymentMethod(bill.paymentMethod, language)}
                          </span>
                          <span className="text-[#8A8279] dark:text-slate-600"> · </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              bill.paymentStatus === 'paid'
                                ? 'bg-[#E7F6EC] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300'
                                : bill.paymentStatus === 'cancelled' || bill.paymentStatus === 'refunded'
                                ? 'bg-[#FCE8E6] dark:bg-rose-950/60 text-[#C23B2B] dark:text-rose-300'
                                : 'bg-[#FDF3DF] dark:bg-amber-950/60 text-[#9A4307] dark:text-amber-300'
                            }`}
                          >
                            {translateStatus(bill.paymentStatus, language)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#6D665E] dark:text-slate-300 whitespace-nowrap">
                          <span className="font-semibold text-[#0A2240] dark:text-slate-200">{bill.createdByName}</span>
                          {isAdmin && !isOwnBill && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#FDF3DF] dark:bg-amber-950/60 text-[#9A4307] dark:text-amber-300 text-[10px] font-bold">
                              {tr(language, 'Staff', 'సిబ్బంది')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {Boolean(formatWhatsAppPhone(bill.customerMobile)) && (() => {
                              const publicUrl = `${window.location.origin}/?invoice=${bill.publicToken}${language === 'te' ? '&lang=te' : ''}`;
                              const items = billItems.filter((bi) => bi.billId === bill.id);
                              const msg = buildWhatsAppReceiptText({ bill, items, business, products, publicUrl, language });
                              const waHref = buildWhatsAppDirectUrl(bill.customerMobile, msg);
                              return (
                                <a
                                  href={waHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() =>
                                    logMessageDispatch({
                                      channel: 'whatsapp',
                                      recipientMobile: bill.customerMobile || '',
                                      billId: bill.id,
                                      billNumber: bill.billNumber,
                                      messageBody: msg,
                                      status: 'opened_share_screen',
                                    })
                                  }
                                  title={tr(language, 'Send 1-Click WhatsApp Receipt (Saved or Unsaved)', '1-క్లిక్ వాట్సాప్ రసీదు పంపండి')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#16A34A] hover:bg-[#15803D] text-white text-[11px] font-semibold"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  {tr(language, 'WhatsApp', 'వాట్సాప్')}
                                </a>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={() => setActiveBill(bill)}
                              title={tr(language, 'Share Bill to Customer', 'కస్టమర్‌కు బిల్ పంపండి')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0A2240] text-white text-[11px] font-semibold hover:bg-[#13325B]"
                            >
                              <Share2 className="w-3 h-3" />
                              {tr(language, 'Share', 'షేర్')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveBill(bill)}
                              title={tr(language, 'View & Print Receipt', 'రసీదు చూడండి & ప్రింట్')}
                              className="p-1.5 rounded-md border border-[#E5DDD3] dark:border-slate-700 text-[#2D3138] dark:text-slate-300 hover:bg-[#F3EDE5] dark:hover:bg-slate-800"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && bill.billStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() => setEditingFullBill(bill)}
                                title={tr(language, 'Admin Edit Bill Items, Prices & Total', 'బిల్ వస్తువులు, ధరలు సవరించండి')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0A2240] dark:bg-slate-800 text-white text-[11px] font-semibold hover:bg-[#13325B] dark:hover:bg-slate-700"
                              >
                                <Pencil className="w-3 h-3" />
                                {tr(language, 'Edit', 'సవరించు')}
                              </button>
                            )}
                            {isApprovedToEdit && (
                              <button
                                type="button"
                                onClick={() => setEditingFullBill(bill)}
                                title={tr(language, 'Owner Approved Edit', 'యజమాని ఆమోదించిన సవరణ')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#15803D] text-white text-[11px] font-semibold hover:bg-[#166534]"
                              >
                                <Pencil className="w-3 h-3" />
                                {tr(language, 'Edit Bill (Approved)', 'సవరించు (ఆమోదించబడింది)')}
                              </button>
                            )}
                            {isWaitingApproval && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#FDF3DF] border border-[#F0D9B5] text-[#9A4307] text-[11px] font-semibold">
                                <Clock className="w-3 h-3" />
                                {tr(language, 'Waiting Owner Approval', 'యజమాని ఆమోదం కోసం వేచి ఉంది')}
                              </span>
                            )}
                            {!isAdmin && isOwnBill && bill.billStatus === 'active' && !isApprovedToEdit && !isWaitingApproval && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRequestEditErr(null);
                                  setEditRequestReason('');
                                  setRequestEditBill(bill);
                                }}
                                title={tr(language, 'Request Owner Approval to Edit Bill', 'బిల్ సవరించడానికి యజమాని ఆమోదం అభ్యర్థించండి')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#F0D9B5] bg-[#FDF3DF] hover:bg-[#FCE8C8] text-[#9A4307] text-[11px] font-semibold"
                              >
                                <Send className="w-3 h-3" />
                                {tr(language, 'Request Edit', 'సవరణ అభ్యర్థించండి')}
                              </button>
                            )}
                            {isAdmin && bill.billStatus === 'active' && bill.pendingBalance > 0 && (
                              <button
                                type="button"
                                onClick={() => setPaymentModalBill(bill)}
                                title={tr(language, 'Record Payment', 'చెల్లింపు నమోదు చేయి')}
                                className="p-1.5 rounded-md border border-[#C5E8D1] dark:border-emerald-800 text-[#15803D] dark:text-emerald-300 hover:bg-[#E7F6EC] dark:hover:bg-emerald-950/50"
                              >
                                <Wallet className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin && bill.billStatus === 'active' && bill.amountPaid > 0 && (
                              <button
                                type="button"
                                onClick={() => setRefundModalBill(bill)}
                                title={tr(language, 'Record Refund', 'వాపసు నమోదు చేయి')}
                                className="p-1.5 rounded-md border border-[#F0D9B5] dark:border-amber-800 text-[#9A4307] dark:text-amber-300 hover:bg-[#FDF3DF] dark:hover:bg-amber-950/50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canCancel && bill.billStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() => setCancelModalBill(bill)}
                                title={tr(language, 'Cancel Bill', 'బిల్ రద్దు చేయి')}
                                className="p-1.5 rounded-md border border-[#F5C6C0] dark:border-rose-800 text-[#C23B2B] dark:text-rose-300 hover:bg-[#FCE8E6] dark:hover:bg-rose-950/50"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteModalBill(bill);
                                }}
                                title={tr(language, 'Delete Bill (Moves to Settings for 10 Days)', 'బిల్ తొలగించు (10 రోజులు సెట్టింగ్స్‌లో ఉంటుంది)')}
                                className="p-1.5 rounded-md border border-[#F5C6C0] dark:border-rose-800 bg-[#FCE8E6] dark:bg-rose-950/40 text-[#C23B2B] dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70"
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
        <div className="bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-[#FAF8F5] dark:bg-slate-800/60 border-b border-[#E5DDD3] dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-display font-bold text-[#0A2240] dark:text-slate-100">
              <HardHat className="w-4 h-4 text-[#9A4307] dark:text-amber-400" />
              <span>{tr(language, 'Labour Work', 'లేబర్ పని')} ({sortedLabour.length})</span>
            </div>
            <span className="text-xs font-display tabular-nums font-bold text-[#9A4307] dark:text-amber-400">
              {formatCurrency(totals.labourTotal)}
            </span>
          </div>

          {sortedLabour.length === 0 ? (
            <div className="py-10 text-center text-xs font-medium text-[#6D665E] dark:text-slate-400">
              {tr(language, 'No labour work entries recorded yet.', 'లేబర్ పని వివరాలు ఇంకా నమోదు కాలేదు.')}
            </div>
          ) : (
            <div className="divide-y divide-[#EFEAE2] dark:divide-slate-800/80">
              {sortedLabour.map((work) => (
                <div key={work.id} className="p-3.5 sm:px-4 flex items-start justify-between gap-3 hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-xs font-bold text-[#0A2240] dark:text-slate-100">{work.workerName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-[#F3EDE5] dark:bg-slate-800 text-[#9A4307] dark:text-amber-300 tabular-nums text-[10px] font-semibold">
                        {work.workDate}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          work.paymentMethod === 'Unpaid'
                            ? 'bg-[#FDF3DF] dark:bg-amber-950/60 text-[#9A4307] dark:text-amber-300'
                            : 'bg-[#E7F6EC] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300'
                        }`}
                      >
                        {translatePaymentMethod(work.paymentMethod, language)}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-[#2D3138] dark:text-slate-300 mt-1">{work.workDone}</div>
                    {work.note && (
                      <div className="text-[11px] text-[#6D665E] dark:text-slate-400 mt-0.5">
                        {tr(language, 'Note:', 'గమనిక:')} {translateSystemText(work.note, language)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display tabular-nums font-bold text-xs text-[#9A4307] dark:text-amber-400">
                      {formatCurrency(work.wageAmount)}
                    </div>
                    {work.recordedByName && (
                      <div className="text-[10px] font-medium text-[#6D665E] dark:text-slate-400 mt-0.5">{work.recordedByName}</div>
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
        <div className="bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-[#FAF8F5] dark:bg-slate-800/60 border-b border-[#E5DDD3] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-display font-bold text-[#0A2240] dark:text-slate-100">
              <Wallet className="w-4 h-4 text-[#9A4307] dark:text-amber-400" />
              <span>
                {tr(language, 'Shop Cashbook · Income & Expenses', 'షాప్ నగదు పుస్తకం · ఆదాయం & ఖర్చులు')} ({sortedCashbook.length})
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-display tabular-nums font-bold">
              <span className="text-[#15803D] dark:text-emerald-400">
                {tr(language, 'In:', 'ఆదాయం:')} +{formatCurrency(totals.shopIncome)}
              </span>
              <span className="text-[#C23B2B] dark:text-rose-400">
                {tr(language, 'Out:', 'ఖర్చు:')} -{formatCurrency(totals.shopExpense)}
              </span>
            </div>
          </div>

          {sortedCashbook.length === 0 ? (
            <div className="py-10 text-center text-xs font-medium text-[#6D665E] dark:text-slate-400">
              {tr(language, 'No shop income or expense entries recorded yet.', 'ఆదాయం లేదా ఖర్చు వివరాలు ఇంకా నమోదు కాలేదు.')}
            </div>
          ) : (
            <div className="divide-y divide-[#EFEAE2] dark:divide-slate-800/80">
              {sortedCashbook.map((entry) => {
                const isIncome = entry.type === 'income';
                return (
                  <div key={entry.id} className="p-3.5 sm:px-4 flex items-start justify-between gap-3 hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isIncome
                            ? 'bg-[#E7F6EC] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-400'
                            : 'bg-[#FCE8E6] dark:bg-rose-950/60 text-[#C23B2B] dark:text-rose-400'
                        }`}
                      >
                        {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-display text-xs font-bold text-[#0A2240] dark:text-slate-100">
                            {translateSystemText(entry.title, language)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isIncome
                                ? 'bg-[#E7F6EC] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-300'
                                : entry.isLabourDerived
                                ? 'bg-[#FDF3DF] dark:bg-amber-950/60 text-[#9A4307] dark:text-amber-300'
                                : 'bg-[#FCE8E6] dark:bg-rose-950/60 text-[#C23B2B] dark:text-rose-300'
                            }`}
                          >
                            {entry.isLabourDerived
                              ? tr(language, 'Labour Expense', 'లేబర్ ఖర్చు')
                              : translateStatus(entry.type, language)}
                          </span>
                        </div>
                        <div className="text-[11px] font-medium text-[#6D665E] dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="tabular-nums">{entry.entryDate}</span>
                          {entry.category && <span>· {translateCategory(entry.category, [], language)}</span>}
                          <span>· {translatePaymentMethod(entry.paymentMethod, language)}</span>
                        </div>
                        {entry.note && (
                          <div className="text-[11px] text-[#6D665E] dark:text-slate-400 mt-0.5">
                            {tr(language, 'Note:', 'గమనిక:')} {translateSystemText(entry.note, language)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={`font-display tabular-nums font-bold text-xs shrink-0 ${
                        isIncome ? 'text-[#15803D] dark:text-emerald-400' : 'text-[#C23B2B] dark:text-rose-400'
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

      {/* Full Edit Bill Modal (Admin or Owner-Approved Staff) */}
      {editingFullBill &&
        (isAdmin ||
          (editingFullBill.createdByUid === activeUid &&
            editingFullBill.editApprovedForUid === activeUid &&
            Boolean(editingFullBill.editApprovalRequestId))) && (
          <EditBillModal
            bill={editingFullBill}
            existingItems={billItems.filter((bi) => bi.billId === editingFullBill.id)}
            products={products}
            onClose={() => setEditingFullBill(null)}
            onSave={async (payload) => {
              await editBillAtomic(payload);
              setEditingFullBill(null);
              if (!isAdmin) {
                setApprovalBanner(
                  tr(
                    language,
                    `Bill ${editingFullBill.billNumber} updated and owner notified.`,
                    `బిల్ ${editingFullBill.billNumber} నవీకరించబడింది మరియు యజమానికి తెలియజేయబడింది.`
                  )
                );
              }
            }}
          />
        )}

      {/* Staff Request Bill Edit Approval Modal */}
      {requestEditBill && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/55 p-2 sm:p-4 overflow-y-auto">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setRequestingEdit(true);
                setRequestEditErr(null);
                try {
                  await requestBillEditApproval({
                    billId: requestEditBill.id,
                    reason: editRequestReason,
                  });
                  setApprovalBanner(
                    tr(
                      language,
                      `Edit approval request sent to Owner for ${requestEditBill.billNumber}. Once approved, you can edit this bill here.`,
                      `${requestEditBill.billNumber} సవరించడానికి యజమానికి ఆమోద అభ్యర్థన పంపబడింది. ఆమోదించిన తర్వాత మీరు ఇక్కడే బిల్ సవరించవచ్చు.`
                    )
                  );
                  setRequestEditBill(null);
                } catch (err) {
                  setRequestEditErr(
                    err instanceof Error
                      ? err.message
                      : tr(language, 'Failed to send request.', 'అభ్యర్థన పంపడం విఫలమైంది.')
                  );
                } finally {
                  setRequestingEdit(false);
                }
              }}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-[#F0D9B5] dark:border-amber-900/60 shadow-2xl p-5 space-y-4 max-h-[92dvh] overflow-y-auto font-sans"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-display font-bold text-[#0A2240] dark:text-slate-100">
                    {tr(language, 'Request Bill Edit Approval', 'బిల్ సవరణ ఆమోదం అభ్యర్థించండి')}
                  </h3>
                  <p className="text-xs text-[#6D665E] dark:text-slate-400 mt-1">
                    {requestEditBill.billNumber} · {translateCustomerName(requestEditBill.customerName, language)} ·{' '}
                    <span className="font-display font-bold text-[#0A2240] dark:text-white">
                      {formatCurrency(requestEditBill.grandTotal)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRequestEditBill(null)}
                  className="p-1 text-[#8A8279] hover:text-[#0A2240] dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-xl bg-[#FDF3DF] dark:bg-amber-950/40 border border-[#F0D9B5] dark:border-amber-900/60 p-3 text-xs text-[#7C3405] dark:text-amber-200 leading-relaxed">
                {tr(
                  language,
                  'The business owner will receive an instant notification. Once approved, an "Edit Bill (Approved)" button will appear on this bill.',
                  'వ్యాపార యజమానికి వెంటనే నోటిఫికేషన్ వెళ్తుంది. వారు ఆమోదించిన వెంటనే ఈ బిల్లుపై "బిల్ సవరించు (ఆమోదించబడింది)" బటన్ కనిపిస్తుంది.'
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
                  {tr(language, 'Reason for edit (Optional)', 'సవరణకు కారణం (ఐచ్ఛికం)')}
                </label>
                <textarea
                  rows={2}
                  value={editRequestReason}
                  onChange={(e) => setEditRequestReason(e.target.value)}
                  placeholder={tr(language, 'e.g. Quantity or customer phone correction', 'ఉదా. పరిమాణం లేదా ఫోన్ నంబర్ సవరణ')}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
                />
              </div>

              {requestEditErr && (
                <div className="rounded-xl bg-[#FCE8E6] dark:bg-rose-950/50 border border-[#F5C6C0] p-2.5 text-xs text-[#C23B2B]">
                  {requestEditErr}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={requestingEdit}
                  onClick={() => setRequestEditBill(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#E5DDD3] dark:border-slate-700 text-[#0A2240] dark:text-slate-300"
                >
                  {tr(language, 'Cancel', 'రద్దు')}
                </button>
                <button
                  type="submit"
                  disabled={requestingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {requestingEdit
                    ? tr(language, 'Sending...', 'పంపుతోంది...')
                    : tr(language, 'Send Request to Owner', 'యజమానికి అభ్యర్థన పంపండి')}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}

      {/* Record Payment Modal */}
      {isAdmin && paymentModalBill && (
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
      {isAdmin && cancelModalBill && (
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
      {isAdmin && refundModalBill && (
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

      {/* Delete Bill Confirmation Modal (Soft Delete to 10-Day Recovery Bin) */}
      {deleteModalBill && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/55 p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-[#F5C6C0] dark:border-rose-900/60 shadow-2xl p-5 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-[#0A2240] dark:text-slate-100">
                  {tr(language, 'Delete Bill', 'బిల్ తొలగించు')} · {getBillVerificationBarcode(deleteModalBill)}?
                </h3>
                <p className="text-xs text-[#6D665E] dark:text-slate-400 mt-1 leading-relaxed">
                  {translateCustomerName(deleteModalBill.customerName, language)} ·{' '}
                  <span className="font-display tabular-nums font-bold text-[#0A2240] dark:text-white">
                    {formatCurrency(deleteModalBill.grandTotal)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalBill(null)}
                className="p-1 text-[#8A8279] hover:text-[#0A2240] dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#FDF3DF] dark:bg-amber-950/40 border border-[#F0D9B5] dark:border-amber-900/60 p-3 text-xs text-[#7C3405] dark:text-amber-200 leading-relaxed">
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
              <div className="rounded-xl bg-[#FCE8E6] dark:bg-rose-950/50 border border-[#F5C6C0] dark:border-rose-900/60 p-2.5 text-xs text-[#C23B2B] dark:text-rose-300">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingBill}
                onClick={() => setDeleteModalBill(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#E5DDD3] dark:border-slate-700 text-[#0A2240] dark:text-slate-300 hover:bg-[#FAF8F5] dark:hover:bg-slate-800"
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
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#C23B2B] hover:bg-[#A32E20] text-white disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingBill
                  ? tr(language, 'Moving...', 'తరలిస్తోంది...')
                  : tr(language, 'Move to Removed Bills', 'తొలగించిన జాబితాకు తరలించు')}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Bulk Delete Selected Bills Modal */}
      {bulkDeleteModalOpen && visibleSelectedBills.length > 0 && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/55 p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-[#F5C6C0] dark:border-rose-900/60 shadow-2xl p-5 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-[#0A2240] dark:text-slate-100">
                  {language === 'te'
                    ? `ఎంచుకున్న ${visibleSelectedBills.length} బిల్లులను తొలగించాలా?`
                    : `Delete ${visibleSelectedBills.length} Selected Bill${visibleSelectedBills.length === 1 ? '' : 's'}?`}
                </h3>
                <p className="text-xs text-[#6D665E] dark:text-slate-400 mt-1 leading-relaxed">
                  {tr(language, 'Combined Value:', 'మొత్తం విలువ:')}{' '}
                  <span className="font-display tabular-nums font-bold text-[#0A2240] dark:text-white">
                    {formatCurrency(selectedTotalAmount)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="p-1 text-[#8A8279] hover:text-[#0A2240] dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#FAF8F5] dark:bg-slate-800/70 border border-[#E5DDD3] dark:border-slate-700 p-3 space-y-1.5 max-h-36 overflow-y-auto">
              {visibleSelectedBills.slice(0, 5).map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between gap-2 text-xs text-[#6D665E] dark:text-slate-300"
                >
                  <span className="truncate font-medium">
                    <span className="font-display tabular-nums font-bold text-[#0A2240] dark:text-slate-100">
                      {getBillVerificationBarcode(bill)}
                    </span>{' '}
                    · {translateCustomerName(bill.customerName, language)}
                  </span>
                  <span className="font-display tabular-nums font-bold text-[#0A2240] dark:text-white shrink-0">
                    {formatCurrency(bill.grandTotal)}
                  </span>
                </div>
              ))}
              {visibleSelectedBills.length > 5 && (
                <div className="text-[11px] font-semibold text-[#6D665E] dark:text-slate-400 pt-1 border-t border-[#E5DDD3] dark:border-slate-700">
                  {language === 'te'
                    ? `+మరో ${visibleSelectedBills.length - 5} ఎంచుకున్న బిల్లులు`
                    : `+${visibleSelectedBills.length - 5} more selected bill${visibleSelectedBills.length - 5 === 1 ? '' : 's'}`}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-[#FDF3DF] dark:bg-amber-950/40 border border-[#F0D9B5] dark:border-amber-900/60 p-3 text-xs text-[#7C3405] dark:text-amber-200 leading-relaxed">
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
              <div className="rounded-xl bg-[#FCE8E6] dark:bg-rose-950/50 border border-[#F5C6C0] dark:border-rose-900/60 p-2.5 text-xs text-[#C23B2B] dark:text-rose-300">
                {bulkDeleteError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#E5DDD3] dark:border-slate-700 text-[#2D3138] dark:text-slate-300 hover:bg-[#FAF8F5] dark:hover:bg-slate-800"
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
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#C23B2B] hover:bg-[#A32E20] text-white disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting
                  ? tr(language, 'Moving...', 'తరలిస్తోంది...')
                  : tr(language, `Move ${visibleSelectedBills.length} to Removed`, `${visibleSelectedBills.length} తొలగించిన జాబితాకు తరలించు`)}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
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
  onClose: () => void;
  onSave: (payload: {
    billId: string;
    customerName: string;
    customerMobile?: string;
    customerAddress?: string;
    items: CartItemInput[];
    overallDiscount: number;
    gstType: GstType;
    labourCharge?: number;
    labourRatePerPiece?: number;
    autoCharge?: number;
    amountPaid: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }) => Promise<void>;
}> = ({ bill, existingItems, products, onClose, onSave }) => {
  const { language, isAdmin } = useAuth();
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
        taxRate: 0,
      }));
    }
    return [];
  });

  const itemDiscountsSum = existingItems.reduce((s, it) => s + Number(it.discount || 0), 0);
  const [overallDiscount, setOverallDiscount] = useState<number>(() =>
    Math.max(0, Math.round((Number(bill.discountAmount || 0) - itemDiscountsSum) * 100) / 100)
  );
  const [labourApplicable, setLabourApplicable] = useState<boolean>(Number(bill.labourCharge || 0) > 0);
  const [labourMode, setLabourMode] = useState<'per_piece' | 'fixed'>(() =>
    Number(bill.labourRatePerPiece || 0) > 0 ? 'per_piece' : 'fixed'
  );
  const [labourRatePerPiece, setLabourRatePerPiece] = useState<number>(() => Number(bill.labourRatePerPiece || 0));
  const [labourFixedAmount, setLabourFixedAmount] = useState<number>(() => Number(bill.labourCharge || 0));
  const [autoApplicable, setAutoApplicable] = useState<boolean>(Number(bill.autoCharge || 0) > 0);
  const [autoCharge, setAutoCharge] = useState<number>(() => Number(bill.autoCharge || 0));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(bill.paymentMethod);
  const [amountPaid, setAmountPaid] = useState<number>(bill.amountPaid);
  const [notes, setNotes] = useState(bill.notes || '');
  const [addProductId, setAddProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPieces = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.quantity || 0), 0),
    [items]
  );

  const preview = useMemo(() => {
    let subtotal = 0;
    let itemDisc = 0;
    items.forEach((it) => {
      const gross = it.quantity * it.unitPrice;
      const d = Math.min(gross, Math.max(0, it.discount || 0));
      subtotal += gross;
      itemDisc += d;
    });
    const extra = Math.min(Math.max(0, overallDiscount), Math.max(0, subtotal - itemDisc));
    const totalDisc = itemDisc + extra;
    const taxable = Math.max(0, subtotal - totalDisc);
    const totalTax = 0;
    const resolvedLabourRate =
      labourApplicable && labourMode === 'per_piece' ? Math.max(0, labourRatePerPiece || 0) : 0;
    const resolvedLabour = !labourApplicable
      ? 0
      : labourMode === 'per_piece'
      ? Math.round(totalPieces * resolvedLabourRate * 100) / 100
      : Math.max(0, Math.round((labourFixedAmount || 0) * 100) / 100);
    const resolvedAuto = autoApplicable ? Math.max(0, Math.round((autoCharge || 0) * 100) / 100) : 0;
    const grandTotal = Math.round((taxable + resolvedLabour + resolvedAuto) * 100) / 100;
    const paid = paymentMethod === 'Unpaid' ? 0 : Math.min(grandTotal, Math.max(0, amountPaid));
    const pending = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);
    return {
      subtotal,
      totalDisc,
      totalTax,
      labourRate: resolvedLabourRate,
      labourCharge: resolvedLabour,
      autoCharge: resolvedAuto,
      grandTotal,
      paid,
      pending,
    };
  }, [
    items,
    totalPieces,
    overallDiscount,
    labourApplicable,
    labourMode,
    labourRatePerPiece,
    labourFixedAmount,
    autoApplicable,
    autoCharge,
    amountPaid,
    paymentMethod,
  ]);

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
        taxRate: 0,
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
        gstType: 'NONE',
        labourCharge: preview.labourCharge,
        labourRatePerPiece: preview.labourRate,
        autoCharge: preview.autoCharge,
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
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 shadow-2xl overflow-hidden max-h-[94dvh] flex flex-col"
      >
        <div className="px-5 py-3.5 bg-[#0A2240] dark:bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-white/10">
          <div>
            <h3 className="text-sm sm:text-base font-display font-bold tracking-tight">
              {tr(language, 'Edit Bill', 'బిల్ సవరించు')} · {isAdmin ? getBillVerificationBarcode(bill) : bill.billNumber}
            </h3>
            <p className="text-[11px] text-[#E5DDD3]">
              {tr(language, 'Created by', 'చేసినవారు:')} {bill.createdByName} ·{' '}
              {tr(language, 'Modify prices, quantities, customer & payment', 'ధరలు, పరిమాణాలు, కస్టమర్ & చెల్లింపు మార్చండి')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[#E5DDD3] hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto text-xs font-sans">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
                {tr(language, 'Customer Name *', 'కస్టమర్ పేరు *')}
              </label>
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0A2240] dark:focus:ring-amber-400/60"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
                {tr(language, 'Mobile', 'మొబైల్')}
              </label>
              <input
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0A2240] dark:focus:ring-amber-400/60"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
                {tr(language, 'Address / Site', 'చిరునామా / స్థలం')}
              </label>
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0A2240] dark:focus:ring-amber-400/60"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-[#0A2240] dark:text-slate-100">
                {tr(language, 'Line Items', 'వస్తువులు')} ({items.length})
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  value={addProductId}
                  onChange={(e) => setAddProductId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 max-w-[180px]"
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
                  className="px-2.5 py-1.5 rounded-lg bg-[#0A2240] hover:bg-[#13325B] dark:bg-[#1E3A5F] text-white font-semibold disabled:opacity-40 transition"
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
                className="p-3 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800/60 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display font-bold text-[#0A2240] dark:text-slate-100 truncate">
                    {translateProductName(matchedProd, language, item.productName)}{' '}
                    {item.variantLabel ? (
                      <span className="font-sans font-medium text-[#6D665E] dark:text-slate-400">
                        ({translateVariantLabel(item.variantLabel, language)})
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-[#8A8279] hover:text-[#C23B2B] dark:hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <div>
                    <label className="text-[10px] font-medium text-[#6D665E] dark:text-slate-400 block mb-0.5">
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
                      className="w-full px-2 py-1.5 font-display font-semibold tabular-nums rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[#6D665E] dark:text-slate-400 block mb-0.5">
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
                        className="p-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-200"
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
                        className="w-full text-center font-display font-semibold tabular-nums py-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100"
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
                        className="p-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-200"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-[#6D665E] dark:text-slate-400 block mb-0.5">
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
                      className="w-full px-2 py-1.5 font-display font-semibold tabular-nums rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
                {tr(language, 'Extra Discount (₹)', 'అదనపు తగ్గింపు (₹)')}
              </label>
              <input
                type="number"
                min={0}
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2.5 py-2 font-display font-semibold tabular-nums rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
                {tr(language, 'Payment Method', 'చెల్లింపు విధానం')}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-2.5 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 font-medium"
              >
                <option value="Cash">{translatePaymentMethod('Cash', language)}</option>
                <option value="UPI">{translatePaymentMethod('UPI', language)}</option>
                <option value="Bank Transfer">{translatePaymentMethod('Bank Transfer', language)}</option>
                <option value="Other">{translatePaymentMethod('Other', language)}</option>
                <option value="Unpaid">{translatePaymentMethod('Unpaid', language)}</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
                {tr(language, 'Amount Paid (₹)', 'చెల్లించిన మొత్తం (₹)')}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={paymentMethod === 'Unpaid'}
                value={paymentMethod === 'Unpaid' ? 0 : amountPaid}
                onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2.5 py-2 font-display font-semibold tabular-nums rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#15803D] dark:text-emerald-400 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Optional Labour & Auto Charges */}
          <div className="p-3 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#F6F1EA] dark:bg-slate-800/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-[#0A2240] dark:text-slate-100">
                {tr(language, 'Additional Charges (If Applicable)', 'అదనపు ఛార్జీలు (వర్తిస్తే)')}
              </span>
              <span className="font-display tabular-nums text-[11px] font-semibold text-[#9A4307] dark:text-amber-400">
                {tr(language, `Cart: ${totalPieces} pcs`, `కార్ట్: ${totalPieces} పీసులు`)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#0A2240] dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={labourApplicable}
                      onChange={(e) => setLabourApplicable(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-[#0A2240]"
                    />
                    {tr(language, 'Labour Charges', 'లేబర్ ఛార్జీలు')}
                  </span>
                  {labourApplicable && (
                    <span className="font-display tabular-nums font-bold text-[#9A4307] dark:text-amber-400">{formatCurrency(preview.labourCharge)}</span>
                  )}
                </label>
                {labourApplicable && (
                  <div className="space-y-1.5 pl-5">
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => setLabourMode('per_piece')}
                        className={`py-1 px-2 rounded-md text-[10px] font-semibold transition ${
                          labourMode === 'per_piece'
                            ? 'bg-[#0A2240] dark:bg-[#1E3A5F] text-white'
                            : 'bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-700 text-[#6D665E] dark:text-slate-400'
                        }`}
                      >
                        {tr(language, `Per Piece (×${totalPieces})`, `పీస్‌కు (×${totalPieces})`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLabourMode('fixed')}
                        className={`py-1 px-2 rounded-md text-[10px] font-semibold transition ${
                          labourMode === 'fixed'
                            ? 'bg-[#0A2240] dark:bg-[#1E3A5F] text-white'
                            : 'bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-700 text-[#6D665E] dark:text-slate-400'
                        }`}
                      >
                        {tr(language, 'Total Amount', 'మొత్తం విలువ')}
                      </button>
                    </div>
                    {labourMode === 'per_piece' ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={labourRatePerPiece}
                        onChange={(e) => setLabourRatePerPiece(Math.max(0, Number(e.target.value) || 0))}
                        placeholder={tr(language, 'Rate / piece (₹)', 'ఒక్కో పీస్ ధర (₹)')}
                        className="w-full px-2.5 py-1.5 font-display tabular-nums rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100"
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={labourFixedAmount}
                        onChange={(e) => setLabourFixedAmount(Math.max(0, Number(e.target.value) || 0))}
                        placeholder={tr(language, 'Labour total (₹)', 'లేబర్ మొత్తం (₹)')}
                        className="w-full px-2.5 py-1.5 font-display tabular-nums rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#0A2240] dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={autoApplicable}
                      onChange={(e) => setAutoApplicable(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-[#0A2240]"
                    />
                    {tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}
                  </span>
                  {autoApplicable && (
                    <span className="font-display tabular-nums font-bold text-[#9A4307] dark:text-amber-400">{formatCurrency(preview.autoCharge)}</span>
                  )}
                </label>
                {autoApplicable && (
                  <div className="pl-5">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={autoCharge}
                      onChange={(e) => setAutoCharge(Math.max(0, Number(e.target.value) || 0))}
                      placeholder={tr(language, 'Auto charge (₹)', 'ఆటో ఛార్జీ (₹)')}
                      className="w-full px-2.5 py-1.5 font-display tabular-nums rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0A2240] dark:text-slate-100"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
              {tr(language, 'Bill Notes', 'బిల్ గమనికలు')}
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr(language, 'Optional notes', 'ఐచ్ఛిక గమనికలు')}
              className="w-full px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-[#F6F1EA] dark:bg-slate-800/80 border border-[#E5DDD3] dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-[#6D665E] dark:text-slate-400">
                {tr(language, 'New Grand Total', 'కొత్త మొత్తం బిల్లు')}
              </div>
              <div className="text-base font-display tabular-nums font-bold text-[#0A2240] dark:text-white">{formatCurrency(preview.grandTotal)}</div>
            </div>
            <div className="text-right space-y-0.5">
              <div className="text-[11px] font-display tabular-nums font-semibold">
                <span className="text-[#15803D] dark:text-emerald-400">
                  {tr(language, 'Paid:', 'చెల్లించినది:')} {formatCurrency(preview.paid)}
                </span>
                <span className="text-[#8A8279] mx-1.5">·</span>
                <span className={preview.pending > 0 ? 'text-[#C23B2B] dark:text-rose-400' : 'text-[#6D665E] dark:text-slate-400'}>
                  {tr(language, 'Due:', 'బాకీ:')} {formatCurrency(preview.pending)}
                </span>
              </div>
              <div className="text-[11px] tabular-nums font-medium text-[#6D665E] dark:text-slate-400">
                {tr(language, 'Previous Total:', 'పాత మొత్తం:')} {formatCurrency(bill.grandTotal)}
              </div>
            </div>
          </div>

          {err && <div className="text-xs text-[#C23B2B] dark:text-rose-400 font-medium">{err}</div>}
        </div>

        <div className="px-5 py-3.5 border-t border-[#E5DDD3] dark:border-slate-800 bg-[#FAF8F5] dark:bg-slate-900 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 text-xs font-semibold text-[#0A2240] dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition"
          >
            {tr(language, 'Cancel', 'రద్దు')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[#0A2240] hover:bg-[#13325B] dark:bg-[#1E3A5F] dark:hover:bg-[#264A77] text-white text-xs font-bold disabled:opacity-50 transition"
          >
            {saving ? tr(language, 'Saving Bill Changes...', 'మార్పులు సేవ్ అవుతున్నాయి...') : tr(language, 'Save Updated Bill', 'మార్చిన బిల్ సేవ్ చేయి')}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
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
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-2 sm:p-4 overflow-y-auto">
      <form onSubmit={handle} className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 shadow-2xl p-6 space-y-4 max-h-[92dvh] overflow-y-auto font-sans">
        <div>
          <h3 className="text-base font-display font-bold text-[#0A2240] dark:text-slate-100">{title}</h3>
          <p className="text-xs font-medium text-[#6D665E] dark:text-slate-400 mt-1">{subtitle}</p>
        </div>

        {defaultAmount !== undefined && (
          <div>
            <label className="block text-xs font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
              {tr(language, 'Amount (₹)', 'మొత్తం (₹)')}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={defaultAmount}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-display font-bold tabular-nums rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0A2240] dark:focus:ring-amber-400/60"
            />
          </div>
        )}

        {showMethod && (
          <div>
            <label className="block text-xs font-semibold text-[#6D665E] dark:text-slate-400 mb-1">
              {tr(language, 'Payment Method', 'చెల్లింపు విధానం')}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-[#0A2240] dark:focus:ring-amber-400/60"
            >
              <option value="Cash">{translatePaymentMethod('Cash', language)}</option>
              <option value="UPI">{translatePaymentMethod('UPI', language)}</option>
              <option value="Bank Transfer">{translatePaymentMethod('Bank Transfer', language)}</option>
              <option value="Other">{translatePaymentMethod('Other', language)}</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#6D665E] dark:text-slate-400 mb-1">{reasonLabel}</label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-800 text-[#0A2240] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0A2240] dark:focus:ring-amber-400/60"
          />
        </div>

        {err && <div className="text-xs font-medium text-[#C23B2B] dark:text-rose-400">{err}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#E5DDD3] dark:border-slate-700 text-[#0A2240] dark:text-slate-300 hover:bg-[#FAF8F5] dark:hover:bg-slate-800 transition"
          >
            {tr(language, 'Cancel', 'రద్దు')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-4 py-2 text-xs font-bold rounded-xl text-white transition ${
              danger ? 'bg-[#C23B2B] hover:bg-[#A32E20]' : 'bg-[#0A2240] hover:bg-[#13325B] dark:bg-[#1E3A5F] dark:hover:bg-[#264A77]'
            }`}
          >
            {busy ? tr(language, 'Processing...', 'ప్రాసెస్ అవుతోంది...') : confirmLabel}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
};
