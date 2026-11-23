import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Barcode,
  Camera,
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
    recordRefundAtomic,
    updateBillNotes,
  } = useBillingData();
  const { isAdmin, userAccount, activeUid } = useAuth();

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
  const [scannerOpen, setScannerOpen] = useState(false);

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

  return (
    <div className="space-y-4">
      {/* Summary Cards with Animated Counters */}
      {isAdmin ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MotionCard delay={0} className="bg-white border border-blue-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-slate-500">Bills ({scopedBills.length})</div>
            <div className="mt-1 text-base font-bold font-mono text-[#0B1F44]">
              <AnimatedNumber value={totals.billSales} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.04} className="bg-white border border-blue-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-slate-500">Labour Work ({labourWorks.length})</div>
            <div className="mt-1 text-base font-bold font-mono text-[#1D4ED8]">
              <AnimatedNumber value={totals.labourTotal} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.08} className="bg-white border border-emerald-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-emerald-700">Shop Income</div>
            <div className="mt-1 text-base font-bold font-mono text-emerald-700">
              +<AnimatedNumber value={totals.shopIncome} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.12} className="bg-white border border-rose-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-rose-700">Shop Expenses</div>
            <div className="mt-1 text-base font-bold font-mono text-rose-700">
              -<AnimatedNumber value={totals.shopExpense} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <MotionCard delay={0} className="bg-white border border-blue-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-slate-500">My Bills ({scopedBills.length})</div>
            <div className="mt-1 text-base font-bold font-mono text-[#0B1F44]">
              <AnimatedNumber value={totals.billSales} format={(n) => formatCurrency(n)} />
            </div>
          </MotionCard>
          <MotionCard delay={0.05} className="bg-white border border-amber-100 rounded-2xl p-3.5 shadow-sm slp-card-lift">
            <div className="text-[11px] font-semibold text-amber-700">My Bills Due</div>
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
              { id: 'all', label: 'All' },
              { id: 'bills', label: `Bills (${scopedBills.length})` },
              { id: 'labour', label: `Labour (${labourWorks.length})` },
              { id: 'cashbook', label: `Income & Expenses (${sortedCashbook.length})` },
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
                placeholder="Search barcode, customer name, product..."
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
              <span>Scan Barcode</span>
            </motion.button>
          </div>
          {isAdmin && (
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-blue-50 border border-blue-100 shrink-0">
              {(
                [
                  { id: 'all', label: 'All Bills' },
                  { id: 'staff', label: 'Staff Bills' },
                  { id: 'mine', label: 'My Bills' },
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
          <div className="px-4 py-3 bg-[#F4F8FF] border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B1F44]">
              <ReceiptText className="w-4 h-4 text-[#1D4ED8]" />
              <span>
                {isAdmin
                  ? `Bills History (${scopedBills.length})`
                  : `My Created Bills (${scopedBills.length})`}
              </span>
            </div>
          </div>

          {/* Mobile Card Layout (No Horizontal Scroll Overflow) */}
          <div className="md:hidden divide-y divide-slate-100">
            {scopedBills.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-slate-400">
                {isAdmin
                  ? 'No bills recorded yet.'
                  : 'You have not created any bills yet. Open New Billing to create one.'}
              </div>
            ) : (
              scopedBills.map((bill) => {
                const dt = formatTimestamp(bill.createdAt);
                const isOwnBill = bill.createdByUid === activeUid;
                return (
                  <div key={bill.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
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
                            {bill.paymentStatus}
                          </span>
                          {Boolean(bill.editedAt) && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#1D4ED8] text-[10px] font-bold">
                              Edited
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                          {bill.customerName} {bill.customerMobile ? `· ${bill.customerMobile}` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {bill.itemsSummary || `${bill.itemCount} items`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-sm text-[#0B1F44]">
                          {formatCurrency(bill.grandTotal)}
                        </div>
                        {bill.pendingBalance > 0 && (
                          <div className="font-mono text-[11px] font-semibold text-amber-700">
                            Due {formatCurrency(bill.pendingBalance)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-mono">
                        {dt.toLocaleDateString('en-IN')} ·{' '}
                        {dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="truncate max-w-[140px]">
                        By: <strong className="text-slate-700">{bill.createdByName}</strong>
                        {!isOwnBill && isAdmin ? ' (Staff)' : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveBill(bill)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-[11px] font-bold"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Share / Receipt
                      </button>
                      {isAdmin && bill.billStatus === 'active' && (
                        <button
                          type="button"
                          onClick={() => setEditingFullBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B1F44] text-white text-[11px] font-bold"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit Bill
                        </button>
                      )}
                      {bill.billStatus === 'active' && bill.pendingBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-[11px] font-semibold"
                        >
                          <Wallet className="w-3 h-3" />
                          Pay
                        </button>
                      )}
                      {canCancel && bill.billStatus === 'active' && (
                        <button
                          type="button"
                          onClick={() => setCancelModalBill(bill)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-[11px] font-semibold"
                        >
                          <Ban className="w-3 h-3" />
                          Cancel
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
                          Delete
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
                  <th className="py-3 px-4 font-semibold">Barcode</th>
                  <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 font-semibold">Products</th>
                  <th className="py-3 px-4 font-semibold text-right">Total</th>
                  <th className="py-3 px-4 font-semibold text-right">Balance</th>
                  <th className="py-3 px-4 font-semibold">Payment</th>
                  <th className="py-3 px-4 font-semibold">Creator</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scopedBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      {isAdmin
                        ? 'No bills recorded yet.'
                        : 'You have not created any bills yet.'}
                    </td>
                  </tr>
                ) : (
                  scopedBills.map((bill) => {
                    const dt = formatTimestamp(bill.createdAt);
                    const isOwnBill = bill.createdByUid === activeUid;
                    return (
                      <tr key={bill.id} className="hover:bg-blue-50/40">
                        <td className="py-3 px-4 font-mono font-semibold text-[#0B1F44] whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Barcode className="w-3.5 h-3.5 text-[#1D4ED8]" />
                            <span>{getBillVerificationBarcode(bill)}</span>
                          </div>
                          {Boolean(bill.editedAt) && (
                            <span className="block w-fit mt-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-[#1D4ED8] text-[10px] font-sans font-bold">
                              Edited
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono">
                          {dt.toLocaleDateString('en-IN')} ·{' '}
                          {dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{bill.customerName}</div>
                          {bill.customerMobile && (
                            <div className="text-[11px] font-mono text-slate-500">{bill.customerMobile}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[220px] truncate text-slate-600">
                          {bill.itemsSummary || `${bill.itemCount} items`}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                          {formatCurrency(bill.grandTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap text-amber-700">
                          {formatCurrency(bill.pendingBalance)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-medium text-slate-800">{bill.paymentMethod}</span>
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
                            {bill.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          <span className="font-medium">{bill.createdByName}</span>
                          {isAdmin && !isOwnBill && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold">
                              Staff
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveBill(bill)}
                              title="Share Bill to Customer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#1D4ED8] text-white text-[11px] font-semibold hover:bg-[#1E40AF]"
                            >
                              <Share2 className="w-3 h-3" />
                              Share
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveBill(bill)}
                              title="View & Print Receipt"
                              className="p-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && bill.billStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() => setEditingFullBill(bill)}
                                title="Admin Edit Bill Items, Prices & Total"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0B1F44] text-white text-[11px] font-semibold hover:bg-[#13326b]"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                            )}
                            {bill.billStatus === 'active' && bill.pendingBalance > 0 && (
                              <button
                                type="button"
                                onClick={() => setPaymentModalBill(bill)}
                                title="Record Payment"
                                className="p-1.5 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              >
                                <Wallet className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canEditNotes && bill.billStatus === 'active' && !isAdmin && (
                              <button
                                type="button"
                                onClick={() => setEditNotesBill(bill)}
                                title="Edit Notes"
                                className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin && bill.billStatus === 'active' && bill.amountPaid > 0 && (
                              <button
                                type="button"
                                onClick={() => setRefundModalBill(bill)}
                                title="Record Refund"
                                className="p-1.5 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canCancel && bill.billStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() => setCancelModalBill(bill)}
                                title="Cancel Bill"
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
                                title="Delete Bill (Moves to Settings for 10 Days)"
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
              <span>Labour Work ({sortedLabour.length})</span>
            </div>
            <span className="text-xs font-mono font-bold text-[#1D4ED8]">
              {formatCurrency(totals.labourTotal)}
            </span>
          </div>

          {sortedLabour.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No labour work entries recorded yet.
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
                        {work.paymentMethod}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 mt-1">{work.workDone}</div>
                    {work.note && <div className="text-[11px] text-slate-500 mt-0.5">Note: {work.note}</div>}
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
              <span>Shop Cashbook · Income &amp; Expenses ({sortedCashbook.length})</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono font-bold">
              <span className="text-emerald-700">In: +{formatCurrency(totals.shopIncome)}</span>
              <span className="text-rose-700">Out: -{formatCurrency(totals.shopExpense)}</span>
            </div>
          </div>

          {sortedCashbook.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No shop income or expense entries recorded yet.
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
                          <span className="text-xs font-bold text-[#0B1F44]">{entry.title}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isIncome
                                ? 'bg-emerald-50 text-emerald-700'
                                : entry.isLabourDerived
                                ? 'bg-blue-50 text-[#1D4ED8]'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {entry.isLabourDerived ? 'Labour Expense' : entry.type}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono">{entry.entryDate}</span>
                          {entry.category && <span>· {entry.category}</span>}
                          <span>· {entry.paymentMethod}</span>
                        </div>
                        {entry.note && <div className="text-[11px] text-slate-500 mt-0.5">Note: {entry.note}</div>}
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
          title={`Record Payment · ${getBillVerificationBarcode(paymentModalBill)}`}
          subtitle={`Pending Balance: ${formatCurrency(paymentModalBill.pendingBalance)}`}
          defaultAmount={paymentModalBill.pendingBalance}
          showMethod
          reasonLabel="Payment Reference / Notes"
          confirmLabel="Confirm Payment"
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
          title={`Cancel Bill · ${getBillVerificationBarcode(cancelModalBill)}`}
          subtitle="Stock will be automatically restocked and an immutable audit entry recorded."
          reasonLabel="Cancellation Reason *"
          requireReason
          confirmLabel="Confirm Cancellation"
          danger
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
          title={`Record Refund · ${getBillVerificationBarcode(refundModalBill)}`}
          subtitle={`Max refundable: ${formatCurrency(refundModalBill.amountPaid)}`}
          defaultAmount={refundModalBill.amountPaid}
          showMethod
          reasonLabel="Refund Reason *"
          requireReason
          confirmLabel="Record Refund"
          danger
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
          title={`Edit Notes · ${getBillVerificationBarcode(editNotesBill)}`}
          subtitle="Financial figures remain locked for audit compliance."
          reasonLabel="Bill Notes"
          defaultReason={editNotesBill.notes || ''}
          confirmLabel="Save Notes"
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
                  Delete Bill · {getBillVerificationBarcode(deleteModalBill)}?
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {deleteModalBill.customerName} ·{' '}
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
              This bill will be moved to <strong>Settings &rarr; Removed Bills &amp; Products</strong> and kept safely for <strong>10 days</strong> so an Admin can restore it anytime before permanent deletion.
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
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBill}
                onClick={async () => {
                  setDeletingBill(true);
                  setDeleteError(null);
                  try {
                    await softDeleteBillAtomic(deleteModalBill.id);
                    setDeleteModalBill(null);
                  } catch (err) {
                    setDeleteError(err instanceof Error ? err.message : 'Failed to delete bill.');
                  } finally {
                    setDeletingBill(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingBill ? 'Moving...' : 'Move to Removed Bills'}
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
        onProductFound={(p) => setSearchQuery(p.name)}
        title="Scan Bill or Product Barcode"
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
      setErr('Customer name is required.');
      return;
    }
    if (items.length === 0) {
      setErr('Bill must contain at least one product.');
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
      setErr(error instanceof Error ? error.message : 'Failed to update bill.');
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
            <h3 className="text-sm sm:text-base font-bold">Edit Bill · {getBillVerificationBarcode(bill)}</h3>
            <p className="text-[11px] text-blue-200">
              Created by {bill.createdByName} · Modify prices, quantities, customer &amp; payment
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-blue-100 hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Customer Name *</label>
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Mobile</label>
              <input
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Address / Site</label>
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#0B1F44]">Line Items ({items.length})</span>
              <div className="flex items-center gap-1.5">
                <select
                  value={addProductId}
                  onChange={(e) => setAddProductId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 max-w-[180px]"
                >
                  <option value="">+ Add Product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (₹{p.sellingPrice})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddProduct}
                  disabled={!addProductId}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1D4ED8] text-white font-semibold disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>

            {items.map((item, idx) => (
              <div
                key={`${item.productId}-${idx}`}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[#0B1F44] truncate">
                    {item.productName} {item.variantLabel ? `(${item.variantLabel})` : ''}
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
                    <label className="text-[10px] text-slate-500 block">Rate (₹)</label>
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
                    <label className="text-[10px] text-slate-500 block">Qty</label>
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
                    <label className="text-[10px] text-slate-500 block">Disc (₹)</label>
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
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">Extra Discount (₹)</label>
              <input
                type="number"
                min={0}
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2.5 py-2 font-mono rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">GST Mode</label>
              <select
                value={taxEnabled ? gstType : 'NONE'}
                disabled={!taxEnabled}
                onChange={(e) => setGstType(e.target.value as GstType)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50"
              >
                <option value="NONE">No GST</option>
                <option value="CGST_SGST">CGST + SGST</option>
                <option value="IGST">IGST</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Other">Other</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Amount Paid (₹)</label>
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
            <label className="block text-slate-600 mb-1">Bill Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-wrap items-center justify-between gap-2 font-mono">
            <div>
              <div className="text-[11px] text-slate-500">New Grand Total</div>
              <div className="text-base font-bold text-[#0B1F44]">{formatCurrency(preview.grandTotal)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500">
                Paid: {formatCurrency(preview.paid)} · Due: {formatCurrency(preview.pending)}
              </div>
              <div className="text-[11px] text-slate-500">Previous Total: {formatCurrency(bill.grandTotal)}</div>
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-bold disabled:opacity-50"
          >
            {saving ? 'Saving Bill Changes...' : 'Save Updated Bill'}
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
      setErr('Please provide a reason.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({ amount, method, reason });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Action failed.');
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
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount (₹)</label>
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
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Other">Other</option>
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-4 py-2 text-xs font-semibold rounded-lg text-white ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0B1F44] hover:bg-[#13326b]'
            }`}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
