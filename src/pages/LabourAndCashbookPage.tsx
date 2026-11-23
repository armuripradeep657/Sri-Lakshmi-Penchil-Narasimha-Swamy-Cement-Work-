import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Edit3,
  HardHat,
  IndianRupee,
  Loader2,
  NotebookPen,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency } from '../lib/upiAndExport';
import { AnimatedNumber, MotionCard } from '../components/MotionPrimitives';
import { LabourWork, ShopEntry } from '../types/billing';

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type SectionTab = 'labour' | 'cashbook';

interface LabourAndCashbookPageProps {
  sectionMode?: SectionTab;
}

export const LabourAndCashbookPage: React.FC<LabourAndCashbookPageProps> = ({ sectionMode }) => {
  const {
    bills,
    payments,
    labourWorks,
    shopEntries,
    saveLabourWork,
    deleteLabourWork,
    saveShopEntry,
    deleteShopEntry,
  } = useBillingData();
  const { activeUid, isAdmin, language } = useAuth();

  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<SectionTab>(sectionMode || 'labour');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (sectionMode) {
      setActiveTab(sectionMode);
      setCategoryFilter('ALL');
    }
  }, [sectionMode]);

  // Labour form state (Work Done + Money Taken)
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [workDate, setWorkDate] = useState(todayStr);
  const [wageAmount, setWageAmount] = useState('');
  const [workPayMethod, setWorkPayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Unpaid'>('Cash');
  const [workNote, setWorkNote] = useState('');
  const [savingWork, setSavingWork] = useState(false);

  // Separate Shop Income form state
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [incomeTitle, setIncomeTitle] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState(todayStr);
  const [incomePayMethod, setIncomePayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Other'>('Cash');
  const [incomeNote, setIncomeNote] = useState('');
  const [savingIncome, setSavingIncome] = useState(false);

  // Separate Shop Expense form state
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayStr);
  const [expensePayMethod, setExpensePayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Other'>('Cash');
  const [expenseNote, setExpenseNote] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  // Worker name autocomplete suggestions (native datalist, no pill buttons)
  const recentWorkers = useMemo(() => {
    const names = new Set<string>();
    labourWorks.forEach((w) => {
      if (w.workerName?.trim()) names.add(w.workerName.trim());
    });
    return Array.from(names).slice(0, 15);
  }, [labourWorks]);

  const hasDateRange = Boolean(fromDate || toDate);

  const inSelectedRange = (dateStr: string) => {
    if (fromDate && dateStr < fromDate) return false;
    if (toDate && dateStr > toDate) return false;
    return true;
  };

  const rangeLabel = useMemo(() => {
    if (fromDate && toDate) return `${fromDate} → ${toDate}`;
    if (fromDate) return `From ${fromDate}`;
    if (toDate) return `Up to ${toDate}`;
    return selectedDate;
  }, [fromDate, toDate, selectedDate]);

  const customShopCategories = useMemo(() => {
    const set = new Set<string>();
    shopEntries.forEach((e) => {
      const cat = (e.category || '').trim();
      if (cat && cat !== 'Shop Income' && cat !== 'Shop Expense') {
        set.add(cat);
      }
    });
    return Array.from(set).sort();
  }, [shopEntries]);

  // Day-level or selected Date Range real-time summary
  const daySummary = useMemo(() => {
    const matchesSummaryDate = (dateStr: string) =>
      hasDateRange ? inSelectedRange(dateStr) : dateStr === selectedDate;

    const dayBills = bills.filter(
      (b) => b.billStatus === 'active' && matchesSummaryDate(toLocalDateStr(formatTimestamp(b.createdAt)))
    );
    const dayBilledTotal = dayBills.reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);

    const dayPayments = payments.filter((p) =>
      matchesSummaryDate(toLocalDateStr(formatTimestamp(p.createdAt)))
    );
    const salesCollected = dayPayments.reduce((sum, p) => {
      if (p.type === 'refund') return sum - Number(p.amount || 0);
      if (p.status === 'completed') return sum + Number(p.amount || 0);
      return sum;
    }, 0);

    const dayEntries = shopEntries.filter((e) => matchesSummaryDate(e.entryDate));
    const otherIncome = dayEntries
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const shopExpenses = dayEntries
      .filter((e) => e.type === 'expense')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const dayLabour = labourWorks.filter((w) => matchesSummaryDate(w.workDate));
    const labourTotal = dayLabour.reduce((sum, w) => sum + Number(w.wageAmount || 0), 0);
    const labourPaid = dayLabour
      .filter((w) => w.paymentMethod !== 'Unpaid' && Number(w.wageAmount || 0) > 0)
      .reduce((sum, w) => sum + Number(w.wageAmount || 0), 0);
    const labourUnpaid = Math.max(0, labourTotal - labourPaid);

    const totalDayIncome = salesCollected + otherIncome;
    const totalDayOutflow = shopExpenses + labourPaid;
    const netDayBalance = totalDayIncome - totalDayOutflow;

    return {
      dayBillsCount: dayBills.length,
      dayBilledTotal,
      salesCollected,
      otherIncome,
      otherIncomeCount: dayEntries.filter((e) => e.type === 'income').length,
      shopExpenses,
      expensesCount: dayEntries.filter((e) => e.type === 'expense').length,
      labourCount: dayLabour.length,
      labourPaidCount: dayLabour.filter((w) => w.paymentMethod !== 'Unpaid' && Number(w.wageAmount || 0) > 0).length,
      labourTotal,
      labourPaid,
      labourUnpaid,
      totalDayIncome,
      totalDayOutflow,
      netDayBalance,
    };
  }, [bills, payments, shopEntries, labourWorks, selectedDate, hasDateRange, fromDate, toDate]);

  const filteredLabour = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labourWorks
      .filter((w) => {
        if (!inSelectedRange(w.workDate)) return false;
        if (categoryFilter === 'PAID' && w.paymentMethod === 'Unpaid') return false;
        if (
          categoryFilter !== 'ALL' &&
          categoryFilter !== 'PAID' &&
          w.paymentMethod !== categoryFilter
        ) {
          return false;
        }
        if (!q) return true;
        return (
          w.workerName.toLowerCase().includes(q) ||
          w.workDone.toLowerCase().includes(q) ||
          (w.note && w.note.toLowerCase().includes(q)) ||
          w.workDate.includes(q)
        );
      })
      .sort((a, b) => {
        if (a.workDate !== b.workDate) return b.workDate.localeCompare(a.workDate);
        return formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime();
      });
  }, [labourWorks, search, fromDate, toDate, categoryFilter]);

  const filteredIncomeEntries = useMemo(() => {
    if (categoryFilter === 'EXPENSE' || categoryFilter === 'LABOUR_MONEY') {
      return [];
    }
    const q = search.trim().toLowerCase();
    return shopEntries
      .filter((e) => e.type === 'income')
      .filter((e) => {
        if (!inSelectedRange(e.entryDate)) return false;
        if (
          categoryFilter !== 'ALL' &&
          categoryFilter !== 'INCOME'
        ) {
          if (['Cash', 'UPI', 'Bank Transfer', 'Other'].includes(categoryFilter)) {
            if (e.paymentMethod !== categoryFilter) return false;
          } else if ((e.category || '').trim() !== categoryFilter) {
            return false;
          }
        }
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          (e.category && e.category.toLowerCase().includes(q)) ||
          (e.note && e.note.toLowerCase().includes(q)) ||
          e.entryDate.includes(q)
        );
      })
      .sort((a, b) => {
        if (a.entryDate !== b.entryDate) return b.entryDate.localeCompare(a.entryDate);
        return formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime();
      });
  }, [shopEntries, search, fromDate, toDate, categoryFilter]);

  type CombinedExpenseRow =
    | { kind: 'shop'; date: string; createdAt: unknown; amount: number; entry: ShopEntry }
    | { kind: 'labour'; date: string; createdAt: unknown; amount: number; work: LabourWork };

  // Expenses list automatically includes both Manual Shop Expenses AND Labour Money Taken on that day
  const combinedExpenses = useMemo<CombinedExpenseRow[]>(() => {
    if (categoryFilter === 'INCOME') return [];
    const q = search.trim().toLowerCase();

    const includeManual = categoryFilter !== 'LABOUR_MONEY';
    const includeLabour =
      categoryFilter === 'ALL' ||
      categoryFilter === 'LABOUR_MONEY' ||
      ['Cash', 'UPI', 'Bank Transfer'].includes(categoryFilter);

    const manualRows: CombinedExpenseRow[] = includeManual
      ? shopEntries
          .filter((e) => e.type === 'expense')
          .filter((e) => {
            if (!inSelectedRange(e.entryDate)) return false;
            if (categoryFilter !== 'ALL' && categoryFilter !== 'EXPENSE') {
              if (['Cash', 'UPI', 'Bank Transfer', 'Other'].includes(categoryFilter)) {
                if (e.paymentMethod !== categoryFilter) return false;
              } else if ((e.category || '').trim() !== categoryFilter) {
                return false;
              }
            }
            if (!q) return true;
            return (
              e.title.toLowerCase().includes(q) ||
              (e.category && e.category.toLowerCase().includes(q)) ||
              (e.note && e.note.toLowerCase().includes(q)) ||
              e.entryDate.includes(q)
            );
          })
          .map((entry) => ({
            kind: 'shop',
            date: entry.entryDate,
            createdAt: entry.createdAt,
            amount: Number(entry.amount || 0),
            entry,
          }))
      : [];

    const labourMoneyTakenRows: CombinedExpenseRow[] = includeLabour
      ? labourWorks
          .filter((w) => Number(w.wageAmount || 0) > 0 && w.paymentMethod !== 'Unpaid')
          .filter((w) => {
            if (!inSelectedRange(w.workDate)) return false;
            if (['Cash', 'UPI', 'Bank Transfer'].includes(categoryFilter)) {
              if (w.paymentMethod !== categoryFilter) return false;
            }
            if (!q) return true;
            return (
              w.workerName.toLowerCase().includes(q) ||
              w.workDone.toLowerCase().includes(q) ||
              (w.note && w.note.toLowerCase().includes(q)) ||
              w.workDate.includes(q) ||
              'labour'.includes(q)
            );
          })
          .map((work) => ({
            kind: 'labour',
            date: work.workDate,
            createdAt: work.createdAt,
            amount: Number(work.wageAmount || 0),
            work,
          }))
      : [];

    return [...manualRows, ...labourMoneyTakenRows].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime();
    });
  }, [shopEntries, labourWorks, search, fromDate, toDate, categoryFilter]);

  const combinedExpensesTotal = useMemo(
    () => combinedExpenses.reduce((sum, row) => sum + row.amount, 0),
    [combinedExpenses]
  );

  const manualIncomeTotal = useMemo(
    () => filteredIncomeEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [filteredIncomeEntries]
  );

  const resetLabourForm = () => {
    setEditingWorkId(null);
    setWorkerName('');
    setWorkDone('');
    setWorkDate(selectedDate);
    setWageAmount('');
    setWorkPayMethod('Cash');
    setWorkNote('');
  };

  const resetIncomeForm = () => {
    setEditingIncomeId(null);
    setIncomeTitle('');
    setIncomeAmount('');
    setIncomeDate(selectedDate);
    setIncomePayMethod('Cash');
    setIncomeNote('');
  };

  const resetExpenseForm = () => {
    setEditingExpenseId(null);
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseDate(selectedDate);
    setExpensePayMethod('Cash');
    setExpenseNote('');
  };

  const handleSubmitLabour = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!workerName.trim() || !workDone.trim()) {
      setFeedback({ type: 'error', text: 'Enter worker name and work done.' });
      return;
    }
    setSavingWork(true);
    try {
      await saveLabourWork({
        id: editingWorkId || undefined,
        workerName: workerName.trim(),
        workDone: workDone.trim(),
        workDate,
        wageAmount: Number(wageAmount || 0),
        paymentMethod: workPayMethod,
        note: workNote.trim(),
      });
      setFeedback({
        type: 'success',
        text: editingWorkId ? 'Labour record updated.' : 'Labour work & money taken saved.',
      });
      setSelectedDate(workDate);
      resetLabourForm();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save labour work.',
      });
    } finally {
      setSavingWork(false);
    }
  };

  const handleEditLabour = (work: LabourWork) => {
    setEditingWorkId(work.id);
    setWorkerName(work.workerName);
    setWorkDone(work.workDone);
    setWorkDate(work.workDate);
    setWageAmount(work.wageAmount > 0 ? String(work.wageAmount) : '');
    setWorkPayMethod(work.paymentMethod);
    setWorkNote(work.note || '');
    setActiveTab('labour');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteLabour = async (work: LabourWork) => {
    setFeedback(null);
    try {
      await deleteLabourWork(work.id);
      if (editingWorkId === work.id) resetLabourForm();
      setFeedback({ type: 'success', text: `Deleted labour log for ${work.workerName}.` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete labour record.',
      });
    }
  };

  const handleSubmitIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const amt = Number(incomeAmount);
    if (!incomeTitle.trim() || !Number.isFinite(amt) || amt <= 0) {
      setFeedback({ type: 'error', text: 'Enter income title and a valid amount greater than ₹0.' });
      return;
    }
    setSavingIncome(true);
    try {
      await saveShopEntry({
        id: editingIncomeId || undefined,
        entryDate: incomeDate,
        type: 'income',
        title: incomeTitle.trim(),
        category: 'Shop Income',
        amount: amt,
        paymentMethod: incomePayMethod,
        note: incomeNote.trim(),
      });
      setFeedback({
        type: 'success',
        text: editingIncomeId ? 'Shop income updated.' : 'Shop income saved.',
      });
      setSelectedDate(incomeDate);
      resetIncomeForm();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save shop income.',
      });
    } finally {
      setSavingIncome(false);
    }
  };

  const handleEditIncome = (entry: ShopEntry) => {
    setEditingIncomeId(entry.id);
    setIncomeTitle(entry.title);
    setIncomeAmount(String(entry.amount));
    setIncomeDate(entry.entryDate);
    setIncomePayMethod(entry.paymentMethod);
    setIncomeNote(entry.note || '');
    setActiveTab('cashbook');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const amt = Number(expenseAmount);
    if (!expenseTitle.trim() || !Number.isFinite(amt) || amt <= 0) {
      setFeedback({ type: 'error', text: 'Enter expense description and a valid amount greater than ₹0.' });
      return;
    }
    setSavingExpense(true);
    try {
      await saveShopEntry({
        id: editingExpenseId || undefined,
        entryDate: expenseDate,
        type: 'expense',
        title: expenseTitle.trim(),
        category: 'Shop Expense',
        amount: amt,
        paymentMethod: expensePayMethod,
        note: expenseNote.trim(),
      });
      setFeedback({
        type: 'success',
        text: editingExpenseId ? 'Shop expense updated.' : 'Shop expense saved.',
      });
      setSelectedDate(expenseDate);
      resetExpenseForm();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save shop expense.',
      });
    } finally {
      setSavingExpense(false);
    }
  };

  const handleEditExpense = (entry: ShopEntry) => {
    setEditingExpenseId(entry.id);
    setExpenseTitle(entry.title);
    setExpenseAmount(String(entry.amount));
    setExpenseDate(entry.entryDate);
    setExpensePayMethod(entry.paymentMethod);
    setExpenseNote(entry.note || '');
    setActiveTab('cashbook');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEntry = async (entry: ShopEntry) => {
    setFeedback(null);
    try {
      await deleteShopEntry(entry.id);
      if (editingIncomeId === entry.id) resetIncomeForm();
      if (editingExpenseId === entry.id) resetExpenseForm();
      setFeedback({ type: 'success', text: `Deleted "${entry.title}".` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete shop entry.',
      });
    }
  };

  const canModifyRecord = (recordedByUid: string) =>
    isAdmin || Boolean(activeUid && recordedByUid === activeUid);

  return (
    <div className="space-y-4">
      {/* Page-Specific Summary Strip with Animated Counters */}
      {activeTab === 'labour' ? (
        <div className="grid grid-cols-2 gap-3">
          <MotionCard
            delay={0}
            className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm shadow-blue-900/5 slp-card-lift"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Work Entries ({rangeLabel})</span>
              <HardHat className="w-4 h-4 text-[#1D4ED8]" />
            </div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[#0B1F44] dark:text-white">
              <AnimatedNumber
                value={daySummary.labourCount}
                format={(n) => `${Math.round(n)} ${Math.round(n) === 1 ? 'Work' : 'Works'}`}
              />
            </div>
          </MotionCard>
          <MotionCard
            delay={0.05}
            className="bg-gradient-to-br from-[#0B1F44] to-[#1D4ED8] text-white rounded-2xl p-3.5 shadow-sm shadow-blue-900/15 slp-card-lift"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-blue-100">
              <span>Money Taken ({rangeLabel})</span>
              <Wallet className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-white">
              <AnimatedNumber value={daySummary.labourPaid} format={(n) => formatCurrency(n)} />
            </div>
            {daySummary.labourUnpaid > 0 && (
              <div className="mt-0.5 text-[11px] text-amber-200 font-mono">
                Unpaid Due: {formatCurrency(daySummary.labourUnpaid)}
              </div>
            )}
          </MotionCard>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MotionCard
            delay={0}
            className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm shadow-blue-900/5 slp-card-lift"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>{hasDateRange ? 'Range Income' : 'Day Shop Income'}</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              <AnimatedNumber value={daySummary.totalDayIncome} format={(n) => formatCurrency(n)} />
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Bills: {formatCurrency(daySummary.salesCollected)} · Other: {formatCurrency(daySummary.otherIncome)}
            </div>
          </MotionCard>
          <MotionCard
            delay={0.05}
            className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm shadow-blue-900/5 slp-card-lift"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>{hasDateRange ? 'Range Expenses' : 'Total Day Expenses'}</span>
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
              <AnimatedNumber value={daySummary.totalDayOutflow} format={(n) => formatCurrency(n)} />
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Shop: {formatCurrency(daySummary.shopExpenses)} · Labour: {formatCurrency(daySummary.labourPaid)}
            </div>
          </MotionCard>
          <MotionCard
            delay={0.1}
            className="bg-gradient-to-br from-[#0B1F44] to-[#1D4ED8] text-white rounded-2xl p-3.5 shadow-sm shadow-blue-900/15 slp-card-lift"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-blue-100">
              <span>{hasDateRange ? 'Net Range Balance' : 'Net Day Balance'}</span>
              <Wallet className="w-4 h-4 text-cyan-300" />
            </div>
            <div
              className={`mt-1 text-lg font-bold font-mono tabular-nums ${
                daySummary.netDayBalance >= 0 ? 'text-white' : 'text-amber-200'
              }`}
            >
              <AnimatedNumber value={daySummary.netDayBalance} format={(n) => formatCurrency(n)} />
            </div>
            <div className="mt-1 text-[11px] text-blue-100 truncate">{rangeLabel}</div>
          </MotionCard>
        </div>
      )}

      {/* Search, Date Range Selector & Category Filter */}
      <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="relative md:col-span-5">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === 'labour'
                  ? 'Search worker, work done, or date...'
                  : 'Search income, expense, labour, or date...'
              }
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-blue-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 md:col-span-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-blue-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
              <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">From</span>
              <input
                type="date"
                aria-label="From date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full min-w-0 bg-transparent text-xs font-mono font-semibold text-[#0B1F44] dark:text-white focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-blue-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
              <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">To</span>
              <input
                type="date"
                aria-label="To date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full min-w-0 bg-transparent text-xs font-mono font-semibold text-[#0B1F44] dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:col-span-3">
            <select
              aria-label="Category filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-semibold rounded-xl border border-blue-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#0B1F44] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            >
              {activeTab === 'labour' ? (
                <>
                  <option value="ALL">All Payment Modes</option>
                  <option value="PAID">Paid Only</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Unpaid">Unpaid / Credit</option>
                </>
              ) : (
                <>
                  <option value="ALL">All Categories</option>
                  <option value="INCOME">Shop Income Only</option>
                  <option value="EXPENSE">Shop Expenses Only</option>
                  <option value="LABOUR_MONEY">Labour Money Taken</option>
                  <option value="Cash">Mode: Cash</option>
                  <option value="UPI">Mode: UPI</option>
                  <option value="Bank Transfer">Mode: Bank Transfer</option>
                  <option value="Other">Mode: Other</option>
                  {customShopCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </>
              )}
            </select>
            {(hasDateRange || categoryFilter !== 'ALL' || search.trim() !== '') && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setCategoryFilter('ALL');
                  setSearch('');
                }}
                className="px-2.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-bold shrink-0 hover:bg-rose-100 transition"
              >
                Clear
              </motion.button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
            }`}
          >
            <span>{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)} className="p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TAB 1: LABOUR WORK (ONLY Work Done & Money Taken on That Day) */}
      {activeTab === 'labour' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          <form
            onSubmit={handleSubmitLabour}
            className="xl:col-span-5 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#1D4ED8]" />
                {editingWorkId ? 'Edit Labour Entry' : 'Add Labour Work & Money Taken'}
              </h3>
              {editingWorkId && (
                <button
                  type="button"
                  onClick={resetLabourForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Worker Name *
              </label>
              <input
                required
                type="text"
                list="slp-worker-datalist"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="Enter worker name"
                maxLength={160}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              {recentWorkers.length > 0 && (
                <datalist id="slp-worker-datalist">
                  {recentWorkers.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Work Done *
              </label>
              <input
                required
                type="text"
                value={workDone}
                onChange={(e) => setWorkDone(e.target.value)}
                placeholder="Enter work done on this day"
                maxLength={300}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Date *
                </label>
                <input
                  required
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Money Taken (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={wageAmount}
                  onChange={(e) => setWageAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Payment Mode
                </label>
                <select
                  value={workPayMethod}
                  onChange={(e) =>
                    setWorkPayMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Unpaid')
                  }
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="Cash">Paid · Cash</option>
                  <option value="UPI">Paid · UPI</option>
                  <option value="Bank Transfer">Paid · Bank</option>
                  <option value="Unpaid">Unpaid / Credit</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Note (Optional)
              </label>
              <textarea
                rows={2}
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
                placeholder="Optional note..."
                maxLength={500}
                className="w-full px-3 py-2 text-xs rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white resize-none"
              />
            </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              disabled={savingWork}
              className="w-full py-3 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {savingWork ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardHat className="w-4 h-4" />}
              {savingWork
                ? 'Saving...'
                : editingWorkId
                ? 'Update Labour Entry'
                : 'Save Labour Work'}
            </motion.button>
          </form>

          {/* Labour Work Done & Money Taken List */}
          <div className="xl:col-span-7 space-y-2.5">
            {filteredLabour.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
                No labour work records found.
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredLabour.map((work, index) => (
                  <motion.div
                    key={work.id}
                    layout="position"
                    initial={{ opacity: 0, y: 10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.18) }}
                    className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 slp-card-lift flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-sm font-bold text-[#0B1F44] dark:text-white">
                          {work.workerName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {work.workDate}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            work.paymentMethod === 'Unpaid'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {work.paymentMethod === 'Unpaid' ? 'Unpaid / Credit' : `Paid (${work.paymentMethod})`}
                        </span>
                      </div>

                      <div className="text-xs font-medium text-[#1D4ED8] dark:text-sky-400">
                        Work Done: {work.workDone}
                      </div>

                      {work.note && (
                        <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-[#F4F8FF] dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5 mt-1">
                          <NotebookPen className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>{work.note}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-semibold uppercase text-slate-400">
                          Money Taken
                        </div>
                        <div className="text-sm font-bold font-mono tabular-nums text-[#0B1F44] dark:text-white">
                          {work.wageAmount > 0 ? formatCurrency(work.wageAmount) : '₹0.00'}
                        </div>
                      </div>

                      {canModifyRecord(work.recordedByUid) && (
                        <div className="flex items-center gap-1">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleEditLabour(work)}
                            className="p-2 rounded-xl border border-blue-200 dark:border-slate-700 text-[#0B1F44] dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                            aria-label="Edit labour work"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </motion.button>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDeleteLabour(work)}
                            className="p-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                            aria-label="Delete labour work"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      )}

      {/* SHOP INCOME & SHOP EXPENSES (One Page Portion with Separate Income & Expenses Under It) */}
      {activeTab === 'cashbook' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* SECTION 1: SHOP INCOME (Form + List Separate) */}
          <div className="space-y-4">
            <form
              onSubmit={handleSubmitIncome}
              className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3"
            >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                {editingIncomeId ? 'Edit Shop Income' : 'Add Shop Income'}
              </h3>
              {editingIncomeId && (
                <button
                  type="button"
                  onClick={resetIncomeForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Income Title / Source *
              </label>
              <input
                required
                type="text"
                value={incomeTitle}
                onChange={(e) => setIncomeTitle(e.target.value)}
                placeholder="Enter income description"
                maxLength={160}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Amount (₹) *
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  step="any"
                  value={incomeAmount}
                  onChange={(e) => setIncomeAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Date *
                </label>
                <input
                  required
                  type="date"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Mode
                </label>
                <select
                  value={incomePayMethod}
                  onChange={(e) =>
                    setIncomePayMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')
                  }
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Note (Optional)
              </label>
              <textarea
                rows={2}
                value={incomeNote}
                onChange={(e) => setIncomeNote(e.target.value)}
                placeholder="Optional note..."
                maxLength={500}
                className="w-full px-3 py-2 text-xs rounded-xl border border-emerald-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white resize-none"
              />
            </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              disabled={savingIncome}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {savingIncome ? <Loader2 className="w-4 h-4 animate-spin" /> : <IndianRupee className="w-4 h-4" />}
              {savingIncome
                ? 'Saving...'
                : editingIncomeId
                ? 'Update Shop Income'
                : 'Save Shop Income'}
            </motion.button>
          </form>

            {/* Shop Income List */}
            <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#0B1F44] dark:text-white">
                      {language === 'te' ? 'షాప్ ఆదాయం వివరాలు' : 'Shop Income'}
                    </h4>
                    <div className="text-[11px] text-slate-500">
                      Bills + {filteredIncomeEntries.length} manual entries
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold font-mono tabular-nums text-emerald-600">
                    +<AnimatedNumber value={manualIncomeTotal + daySummary.salesCollected} format={(n) => formatCurrency(n)} />
                  </div>
                  <div className="text-[10px] text-slate-400">Bills + Manual</div>
                </div>
              </div>

              {/* Auto Bill Income Row */}
              <div className="bg-blue-50/80 dark:bg-slate-800/70 border border-blue-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
                    <ReceiptText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0B1F44] dark:text-white truncate">
                      Bill Sales ({selectedDate})
                    </div>
                    <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                      {daySummary.dayBillsCount} bills ({formatCurrency(daySummary.dayBilledTotal)})
                    </div>
                  </div>
                </div>
                <div className="text-xs font-bold font-mono tabular-nums text-emerald-600 shrink-0">
                  +{formatCurrency(daySummary.salesCollected)}
                </div>
              </div>

              <div className="space-y-2">
                {filteredIncomeEntries.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-emerald-200/70 rounded-xl">
                    No manual shop income entries found.
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {filteredIncomeEntries.map((entry, idx) => (
                      <motion.div
                        key={entry.id}
                        layout="position"
                        initial={{ opacity: 0, y: 8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.2, delay: Math.min(idx * 0.025, 0.15) }}
                        className="rounded-xl border border-emerald-100 dark:border-slate-800 bg-emerald-50/30 dark:bg-slate-800/40 p-3 slp-card-lift flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-xs font-bold text-[#0B1F44] dark:text-white truncate">
                            {entry.title}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{entry.entryDate}</span> · {entry.paymentMethod}
                          </div>
                          {entry.note && (
                            <div className="flex items-start gap-1 text-[11px] text-slate-600 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 mt-1 border border-emerald-100 dark:border-slate-700">
                              <NotebookPen className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                              <span>{entry.note}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="text-xs font-bold font-mono tabular-nums text-emerald-600">
                            +{formatCurrency(entry.amount)}
                          </div>
                          {canModifyRecord(entry.recordedByUid) && (
                            <div className="flex items-center gap-1">
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleEditIncome(entry)}
                                className="p-1.5 rounded-lg border border-blue-200 bg-white text-[#0B1F44] hover:bg-blue-50"
                                aria-label="Edit income entry"
                              >
                                <Edit3 className="w-3 h-3" />
                              </motion.button>
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleDeleteEntry(entry)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                aria-label="Delete income entry"
                              >
                                <Trash2 className="w-3 h-3" />
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: SHOP EXPENSES (Form + List incl. Labour Money Taken) */}
          <div className="space-y-4">
            <form
              onSubmit={handleSubmitExpense}
              className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3"
            >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-rose-600" />
                {editingExpenseId ? 'Edit Shop Expense' : 'Add Shop Expense'}
              </h3>
              {editingExpenseId && (
                <button
                  type="button"
                  onClick={resetExpenseForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Expense Description *
              </label>
              <input
                required
                type="text"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="Enter expense description"
                maxLength={160}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Amount (₹) *
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  step="any"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Date *
                </label>
                <input
                  required
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Mode
                </label>
                <select
                  value={expensePayMethod}
                  onChange={(e) =>
                    setExpensePayMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')
                  }
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Note (Optional)
              </label>
              <textarea
                rows={2}
                value={expenseNote}
                onChange={(e) => setExpenseNote(e.target.value)}
                placeholder="Optional note..."
                maxLength={500}
                className="w-full px-3 py-2 text-xs rounded-xl border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white resize-none"
              />
            </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              disabled={savingExpense}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {savingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : <IndianRupee className="w-4 h-4" />}
              {savingExpense
                ? 'Saving...'
                : editingExpenseId
                ? 'Update Shop Expense'
                : 'Save Shop Expense'}
            </motion.button>
          </form>

            {/* Combined Shop Expenses + Labour Money Taken List */}
            <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3">
            <div className="flex items-center justify-between border-b border-rose-100 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#0B1F44] dark:text-white">
                    {language === 'te' ? 'షాప్ ఖర్చులు & లేబర్ డబ్బు' : 'Shop Expenses'}
                  </h4>
                  <div className="text-[11px] text-slate-500">
                    {combinedExpenses.length} expense items (includes paid labour money taken)
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono tabular-nums text-rose-600">
                  -<AnimatedNumber value={combinedExpensesTotal} format={(n) => formatCurrency(n)} />
                </div>
                <div className="text-[10px] text-slate-400">Shop + Labour</div>
              </div>
            </div>

            <div className="space-y-2">
              {combinedExpenses.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-rose-200/70 rounded-xl">
                  No expenses or labour money taken recorded yet.
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {combinedExpenses.map((row, idx) =>
                    row.kind === 'labour' ? (
                      <motion.div
                        key={`labour_${row.work.id}`}
                        layout="position"
                        initial={{ opacity: 0, y: 8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.2, delay: Math.min(idx * 0.025, 0.15) }}
                        className="rounded-xl border border-blue-200 dark:border-slate-700 bg-blue-50/40 dark:bg-slate-800/50 p-3 slp-card-lift flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[#0B1F44] dark:text-white">
                              {row.work.workerName}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-[#0B1F44] text-white text-[10px] font-bold">
                              Labour Money Taken
                            </span>
                          </div>
                          <div className="text-[11px] font-medium text-[#1D4ED8] dark:text-sky-400">
                            Work Done: {row.work.workDone}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{row.work.workDate}</span> · {row.work.paymentMethod}
                          </div>
                          {row.work.note && (
                            <div className="flex items-start gap-1 text-[11px] text-slate-600 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 mt-1 border border-blue-100 dark:border-slate-700">
                              <NotebookPen className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                              <span>{row.work.note}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="text-xs font-bold font-mono tabular-nums text-rose-600">
                            -{formatCurrency(row.work.wageAmount)}
                          </div>
                          {canModifyRecord(row.work.recordedByUid) && (
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleEditLabour(row.work)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 bg-white text-[10px] font-semibold text-[#0B1F44] hover:bg-blue-50"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </motion.button>
                          )}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={row.entry.id}
                        layout="position"
                        initial={{ opacity: 0, y: 8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.2, delay: Math.min(idx * 0.025, 0.15) }}
                        className="rounded-xl border border-rose-100 dark:border-slate-800 bg-rose-50/30 dark:bg-slate-800/40 p-3 slp-card-lift flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-xs font-bold text-[#0B1F44] dark:text-white truncate">
                            {row.entry.title}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{row.entry.entryDate}</span> · {row.entry.paymentMethod}
                          </div>
                          {row.entry.note && (
                            <div className="flex items-start gap-1 text-[11px] text-slate-600 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 mt-1 border border-rose-100 dark:border-slate-700">
                              <NotebookPen className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                              <span>{row.entry.note}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="text-xs font-bold font-mono tabular-nums text-rose-600">
                            -{formatCurrency(row.entry.amount)}
                          </div>
                          {canModifyRecord(row.entry.recordedByUid) && (
                            <div className="flex items-center gap-1">
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleEditExpense(row.entry)}
                                className="p-1.5 rounded-lg border border-blue-200 bg-white text-[#0B1F44] hover:bg-blue-50"
                                aria-label="Edit expense entry"
                              >
                                <Edit3 className="w-3 h-3" />
                              </motion.button>
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleDeleteEntry(row.entry)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                aria-label="Delete expense entry"
                              >
                                <Trash2 className="w-3 h-3" />
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
