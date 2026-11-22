import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
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
import { exportRowsToExcel, formatCurrency } from '../lib/upiAndExport';
import { LabourWork, ShopEntry } from '../types/billing';

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return toLocalDateStr(new Date());
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateStr(dt);
}

function formatReadableDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const WORK_PRESETS = [
  'Darwaja Casting',
  'Window Frame Work',
  'Slab Casting',
  'Cement Mixing',
  'Loading & Unloading',
  'Curing & Finishing',
];

const EXPENSE_CATEGORIES = [
  'Raw Material',
  'Transport',
  'Snacks / Tea',
  'Tools & Repair',
  'Electricity / Rent',
  'Misc Expense',
];

const INCOME_CATEGORIES = [
  'Extra Sales',
  'Delivery Charge',
  'Scrap / Mould',
  'Advance / Other',
];

interface LabourAndCashbookPageProps {
  sectionMode?: 'labour' | 'cashbook';
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
  const { firebaseUser, isAdmin, language } = useAuth();

  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [dateScope, setDateScope] = useState<'day' | 'all'>('day');
  const [activeTab, setActiveTab] = useState<'labour' | 'cashbook'>(sectionMode || 'labour');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (sectionMode) {
      setActiveTab(sectionMode);
    }
  }, [sectionMode]);

  // Labour form state
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [workDate, setWorkDate] = useState(todayStr);
  const [wageAmount, setWageAmount] = useState('');
  const [workPayMethod, setWorkPayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Unpaid'>('Cash');
  const [workNote, setWorkNote] = useState('');
  const [savingWork, setSavingWork] = useState(false);

  // Shop income/expense form state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('expense');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryCategory, setEntryCategory] = useState('Raw Material');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(todayStr);
  const [entryPayMethod, setEntryPayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Other'>('Cash');
  const [entryNote, setEntryNote] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  const handleDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    if (!editingWorkId) setWorkDate(nextDate);
    if (!editingEntryId) setEntryDate(nextDate);
  };

  // Unique recent worker names for 1-tap selection
  const recentWorkers = useMemo(() => {
    const names = new Set<string>();
    labourWorks.forEach((w) => {
      if (w.workerName?.trim()) names.add(w.workerName.trim());
    });
    return Array.from(names).slice(0, 8);
  }, [labourWorks]);

  // Day-level real-time summary (always reflects selectedDate)
  const daySummary = useMemo(() => {
    const dayBills = bills.filter(
      (b) => b.billStatus === 'active' && toLocalDateStr(formatTimestamp(b.createdAt)) === selectedDate
    );
    const dayBilledTotal = dayBills.reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);

    const dayPayments = payments.filter(
      (p) => toLocalDateStr(formatTimestamp(p.createdAt)) === selectedDate
    );
    const salesCollected = dayPayments.reduce((sum, p) => {
      if (p.type === 'refund') return sum - Number(p.amount || 0);
      if (p.status === 'completed') return sum + Number(p.amount || 0);
      return sum;
    }, 0);

    const dayEntries = shopEntries.filter((e) => e.entryDate === selectedDate);
    const otherIncome = dayEntries
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const shopExpenses = dayEntries
      .filter((e) => e.type === 'expense')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const dayLabour = labourWorks.filter((w) => w.workDate === selectedDate);
    const labourTotal = dayLabour.reduce((sum, w) => sum + Number(w.wageAmount || 0), 0);
    const labourPaid = dayLabour
      .filter((w) => w.paymentMethod !== 'Unpaid')
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
      labourTotal,
      labourPaid,
      labourUnpaid,
      totalDayIncome,
      totalDayOutflow,
      netDayBalance,
    };
  }, [bills, payments, shopEntries, labourWorks, selectedDate]);

  const filteredLabour = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labourWorks
      .filter((w) => {
        if (dateScope === 'day' && w.workDate !== selectedDate) return false;
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
  }, [labourWorks, dateScope, selectedDate, search]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shopEntries
      .filter((e) => {
        if (dateScope === 'day' && e.entryDate !== selectedDate) return false;
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
  }, [shopEntries, dateScope, selectedDate, search]);

  const resetLabourForm = () => {
    setEditingWorkId(null);
    setWorkerName('');
    setWorkDone('');
    setWorkDate(selectedDate);
    setWageAmount('');
    setWorkPayMethod('Cash');
    setWorkNote('');
  };

  const resetEntryForm = (nextType: 'income' | 'expense' = entryType) => {
    setEditingEntryId(null);
    setEntryType(nextType);
    setEntryTitle('');
    setEntryCategory(nextType === 'expense' ? 'Raw Material' : 'Extra Sales');
    setEntryAmount('');
    setEntryDate(selectedDate);
    setEntryPayMethod('Cash');
    setEntryNote('');
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
        text: editingWorkId ? 'Labour work record updated.' : 'Labour work saved to cloud.',
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

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const amt = Number(entryAmount);
    if (!entryTitle.trim() || !Number.isFinite(amt) || amt <= 0) {
      setFeedback({ type: 'error', text: 'Enter description and a valid amount greater than ₹0.' });
      return;
    }
    setSavingEntry(true);
    try {
      await saveShopEntry({
        id: editingEntryId || undefined,
        entryDate,
        type: entryType,
        title: entryTitle.trim(),
        category: entryCategory.trim(),
        amount: amt,
        paymentMethod: entryPayMethod,
        note: entryNote.trim(),
      });
      setFeedback({
        type: 'success',
        text: editingEntryId
          ? 'Shop entry updated.'
          : `Saved ${entryType === 'income' ? 'Shop Income' : 'Shop Expense'} to cloud.`,
      });
      setSelectedDate(entryDate);
      resetEntryForm(entryType);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save shop entry.',
      });
    } finally {
      setSavingEntry(false);
    }
  };

  const handleEditEntry = (entry: ShopEntry) => {
    setEditingEntryId(entry.id);
    setEntryType(entry.type);
    setEntryTitle(entry.title);
    setEntryCategory(entry.category || '');
    setEntryAmount(String(entry.amount));
    setEntryDate(entry.entryDate);
    setEntryPayMethod(entry.paymentMethod);
    setEntryNote(entry.note || '');
    setActiveTab('cashbook');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEntry = async (entry: ShopEntry) => {
    setFeedback(null);
    try {
      await deleteShopEntry(entry.id);
      if (editingEntryId === entry.id) resetEntryForm();
      setFeedback({ type: 'success', text: `Deleted "${entry.title}".` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete shop entry.',
      });
    }
  };

  const handleExportExcel = () => {
    if (activeTab === 'labour') {
      exportRowsToExcel(
        filteredLabour.map((w) => ({
          Date: w.workDate,
          WorkerName: w.workerName,
          WorkDone: w.workDone,
          WageAmount: w.wageAmount,
          PaymentMode: w.paymentMethod,
          Note: w.note || '',
          RecordedBy: w.recordedByName || '',
        })),
        `SLP_Labour_Work_${dateScope === 'day' ? selectedDate : 'All'}`,
        'LabourWork'
      );
    } else {
      exportRowsToExcel(
        filteredEntries.map((e) => ({
          Date: e.entryDate,
          Type: e.type.toUpperCase(),
          Title: e.title,
          Category: e.category || '',
          Amount: e.amount,
          PaymentMode: e.paymentMethod,
          Note: e.note || '',
          RecordedBy: e.recordedByName || '',
        })),
        `SLP_Shop_Cashbook_${dateScope === 'day' ? selectedDate : 'All'}`,
        'ShopCashbook'
      );
    }
  };

  const canModifyRecord = (recordedByUid: string) =>
    isAdmin || (firebaseUser?.uid && recordedByUid === firebaseUser.uid);

  return (
    <div className="space-y-4 animate-slp-in">
      {/* Header + Date Controls */}
      <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0B1F44] dark:text-white flex items-center gap-2">
              <HardHat className="w-5 h-5 text-[#1D4ED8]" />
              {language === 'te' ? 'లేబర్ పని & రోజువారీ ఖాతా' : 'Labour Work & Daily Shop Ledger'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatReadableDate(selectedDate)} · Track worker tasks, wages, shop income, and daily expenses
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 dark:border-slate-700 bg-blue-50/70 dark:bg-slate-800 text-xs font-semibold text-[#0B1F44] dark:text-slate-100 hover:bg-blue-100 dark:hover:bg-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
            Export Excel
          </button>
        </div>

        {/* Date Picker + Step Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-blue-200 dark:border-slate-700 bg-[#F4F8FF] dark:bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => handleDateChange(shiftDateStr(selectedDate, -1))}
              className="p-2 rounded-lg text-[#0B1F44] dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <Calendar className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && handleDateChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#0B1F44] dark:text-white focus:outline-none font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => handleDateChange(shiftDateStr(selectedDate, 1))}
              className="p-2 rounded-lg text-[#0B1F44] dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {selectedDate !== todayStr && (
            <button
              type="button"
              onClick={() => handleDateChange(todayStr)}
              className="px-3 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF]"
            >
              Today
            </button>
          )}

          <div className="inline-flex rounded-xl border border-blue-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDateScope('day')}
              className={`px-3 py-1.5 rounded-lg transition ${
                dateScope === 'day'
                  ? 'bg-[#0B1F44] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Selected Day
            </button>
            <button
              type="button"
              onClick={() => setDateScope('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                dateScope === 'all'
                  ? 'bg-[#0B1F44] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              All Dates
            </button>
          </div>

          <div className="relative flex-1 min-w-[190px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search worker, work, expense or note..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* Day Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm shadow-blue-900/5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Day Shop Income</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[#0B1F44] dark:text-white">
            {formatCurrency(daySummary.totalDayIncome)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Bills: {formatCurrency(daySummary.salesCollected)} · Other: {formatCurrency(daySummary.otherIncome)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm shadow-blue-900/5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Shop Expenses</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
            {formatCurrency(daySummary.shopExpenses)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {daySummary.expensesCount} {daySummary.expensesCount === 1 ? 'expense' : 'expenses'} on {selectedDate}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm shadow-blue-900/5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Labour Work</span>
            <HardHat className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-[#0B1F44] dark:text-white">
            {formatCurrency(daySummary.labourTotal)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {daySummary.labourCount} logs · Paid {formatCurrency(daySummary.labourPaid)}
            {daySummary.labourUnpaid > 0 ? ` · Due ${formatCurrency(daySummary.labourUnpaid)}` : ''}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#0B1F44] to-[#1D4ED8] text-white rounded-2xl p-3.5 shadow-sm shadow-blue-900/15">
          <div className="flex items-center justify-between text-[11px] font-semibold text-blue-100">
            <span>Net Day Balance</span>
            <Wallet className="w-4 h-4 text-cyan-300" />
          </div>
          <div
            className={`mt-1 text-lg font-bold font-mono tabular-nums ${
              daySummary.netDayBalance >= 0 ? 'text-white' : 'text-amber-200'
            }`}
          >
            {formatCurrency(daySummary.netDayBalance)}
          </div>
          <div className="mt-1 text-[11px] text-blue-100">
            Income − (Expenses + Paid Labour)
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-blue-100/70 dark:bg-slate-900 border border-blue-200/70 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('labour')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition ${
            activeTab === 'labour'
              ? 'bg-[#1D4ED8] text-white shadow-sm'
              : 'text-[#0B1F44] dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
          }`}
        >
          <HardHat className="w-4 h-4" />
          <span>{language === 'te' ? 'లేబర్ పని వివరాలు' : 'Labour Work'} ({filteredLabour.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cashbook')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition ${
            activeTab === 'cashbook'
              ? 'bg-[#1D4ED8] text-white shadow-sm'
              : 'text-[#0B1F44] dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
          }`}
        >
          <IndianRupee className="w-4 h-4" />
          <span>
            {language === 'te' ? 'షాప్ ఆదాయం & ఖర్చులు' : 'Shop Income & Expenses'} ({filteredEntries.length})
          </span>
        </button>
      </div>

      {feedback && (
        <div
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
        </div>
      )}

      {activeTab === 'labour' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Add / Edit Labour Work Form */}
          <form
            onSubmit={handleSubmitLabour}
            className="xl:col-span-5 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#1D4ED8]" />
                {editingWorkId ? 'Edit Labour Work' : 'Add Labour Work'}
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
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="e.g. Raju, Venkat, Suresh..."
                maxLength={160}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              {recentWorkers.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {recentWorkers.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setWorkerName(name)}
                      className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-slate-800 border border-blue-200/80 dark:border-slate-700 text-[11px] font-semibold text-[#1D4ED8] dark:text-sky-300 hover:bg-blue-100"
                    >
                      {name}
                    </button>
                  ))}
                </div>
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
                placeholder="e.g. Cast 12 Darwaja frames, loading..."
                maxLength={300}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {WORK_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setWorkDone(preset)}
                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-[#1D4ED8]"
                  >
                    {preset}
                  </button>
                ))}
              </div>
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
                  Wage / Pay (₹)
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
                  Payment Status
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
                Note (If Any)
              </label>
              <textarea
                rows={2}
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
                placeholder="Optional note (hours, advance, overtime, remarks)..."
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
                ? 'Saving to Cloud...'
                : editingWorkId
                ? 'Update Labour Work'
                : 'Save Labour Work'}
            </motion.button>
          </form>

          {/* Labour Work Records List */}
          <div className="xl:col-span-7 space-y-2.5">
            {filteredLabour.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
                No labour work records found for {dateScope === 'day' ? selectedDate : 'this filter'}.
              </div>
            ) : (
              filteredLabour.map((work) => (
                <div
                  key={work.id}
                  className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 flex items-start justify-between gap-3"
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
                      {work.workDone}
                    </div>

                    {work.note && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-[#F4F8FF] dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5 mt-1">
                        <NotebookPen className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{work.note}</span>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 pt-0.5">
                      Recorded by {work.recordedByName || 'Staff'}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-sm font-bold font-mono tabular-nums text-[#0B1F44] dark:text-white">
                      {work.wageAmount > 0 ? formatCurrency(work.wageAmount) : 'Work Log'}
                    </div>

                    {canModifyRecord(work.recordedByUid) && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditLabour(work)}
                          className="p-2 rounded-xl border border-blue-200 dark:border-slate-700 text-[#0B1F44] dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800"
                          aria-label="Edit labour work"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLabour(work)}
                          className="p-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                          aria-label="Delete labour work"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Add / Edit Shop Income or Expense Form */}
          <form
            onSubmit={handleSubmitEntry}
            className="xl:col-span-5 bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F44] dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#1D4ED8]" />
                {editingEntryId ? 'Edit Shop Entry' : 'Add Shop Income / Expense'}
              </h3>
              {editingEntryId && (
                <button
                  type="button"
                  onClick={() => resetEntryForm()}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Income / Expense Toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setEntryType('income');
                  if (!editingEntryId) setEntryCategory('Extra Sales');
                }}
                className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  entryType === 'income'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" /> Shop Income (+)
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryType('expense');
                  if (!editingEntryId) setEntryCategory('Raw Material');
                }}
                className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  entryType === 'expense'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" /> Shop Expense (-)
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {entryType === 'income' ? 'Income Title / Source *' : 'Expense Description *'}
              </label>
              <input
                required
                type="text"
                value={entryTitle}
                onChange={(e) => setEntryTitle(e.target.value)}
                placeholder={
                  entryType === 'income'
                    ? 'e.g. Scrap sale, Mould rent, Opening cash...'
                    : 'e.g. Cement bags, Sand, Tea & Tiffin, Diesel...'
                }
                maxLength={160}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Category
              </label>
              <input
                type="text"
                value={entryCategory}
                onChange={(e) => setEntryCategory(e.target.value)}
                placeholder="Category"
                maxLength={80}
                className="w-full px-3 py-2 text-xs rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(entryType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEntryCategory(cat)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition ${
                      entryCategory === cat
                        ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
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
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Date *
                </label>
                <input
                  required
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Mode
                </label>
                <select
                  value={entryPayMethod}
                  onChange={(e) =>
                    setEntryPayMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')
                  }
                  className="w-full px-2.5 py-2 text-xs rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
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
                Note (If Any)
              </label>
              <textarea
                rows={2}
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
                placeholder="Optional note or vendor / receipt reference..."
                maxLength={500}
                className="w-full px-3 py-2 text-xs rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white resize-none"
              />
            </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              disabled={savingEntry}
              className={`w-full py-3 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 ${
                entryType === 'income'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#0B1F44] hover:bg-[#13326b]'
              }`}
            >
              {savingEntry ? <Loader2 className="w-4 h-4 animate-spin" /> : <IndianRupee className="w-4 h-4" />}
              {savingEntry
                ? 'Saving to Cloud...'
                : editingEntryId
                ? 'Update Entry'
                : entryType === 'income'
                ? 'Save Shop Income'
                : 'Save Shop Expense'}
            </motion.button>
          </form>

          {/* Separate Shop Income & Shop Expenses Sections (Down Side) */}
          <div className="xl:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* 1. SHOP INCOME SECTION (SEPARATE) */}
            <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#0B1F44]">
                      {language === 'te' ? 'షాప్ ఆదాయం' : 'Shop Income'}
                    </h4>
                    <div className="text-[11px] text-slate-500">
                      Bills + {filteredEntries.filter((e) => e.type === 'income').length} manual entries
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold font-mono tabular-nums text-emerald-600">
                    +{formatCurrency(daySummary.totalDayIncome)}
                  </div>
                  <div className="text-[10px] text-slate-400">{selectedDate}</div>
                </div>
              </div>

              {/* Auto Bill Income Row */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
                    <ReceiptText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0B1F44] truncate">
                      Bill Sales ({selectedDate})
                    </div>
                    <div className="text-[10px] text-slate-600 truncate">
                      {daySummary.dayBillsCount} bills ({formatCurrency(daySummary.dayBilledTotal)})
                    </div>
                  </div>
                </div>
                <div className="text-xs font-bold font-mono tabular-nums text-emerald-600 shrink-0">
                  +{formatCurrency(daySummary.salesCollected)}
                </div>
              </div>

              {/* Manual Shop Income Items */}
              <div className="space-y-2">
                {filteredEntries.filter((e) => e.type === 'income').length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-400 border border-dashed border-emerald-200/70 rounded-xl">
                    No other shop income entries for {dateScope === 'day' ? selectedDate : 'this filter'}.
                  </div>
                ) : (
                  filteredEntries
                    .filter((e) => e.type === 'income')
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-xs font-bold text-[#0B1F44] truncate">{entry.title}</div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{entry.entryDate}</span>
                            {entry.category ? ` · ${entry.category}` : ''} · {entry.paymentMethod}
                          </div>
                          {entry.note && (
                            <div className="flex items-start gap-1 text-[11px] text-slate-600 bg-white rounded-lg px-2 py-1 mt-1 border border-emerald-100">
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
                              <button
                                type="button"
                                onClick={() => handleEditEntry(entry)}
                                className="p-1.5 rounded-lg border border-blue-200 bg-white text-[#0B1F44] hover:bg-blue-50"
                                aria-label="Edit income entry"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(entry)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                aria-label="Delete income entry"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* 2. SHOP EXPENSES SECTION (SEPARATE) */}
            <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-sm shadow-blue-900/5 space-y-3">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#0B1F44]">
                      {language === 'te' ? 'షాప్ ఖర్చులు' : 'Shop Expenses'}
                    </h4>
                    <div className="text-[11px] text-slate-500">
                      {filteredEntries.filter((e) => e.type === 'expense').length} expense entries
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold font-mono tabular-nums text-rose-600">
                    -{formatCurrency(daySummary.shopExpenses)}
                  </div>
                  <div className="text-[10px] text-slate-400">{selectedDate}</div>
                </div>
              </div>

              <div className="space-y-2">
                {filteredEntries.filter((e) => e.type === 'expense').length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-400 border border-dashed border-rose-200/70 rounded-xl">
                    No shop expenses recorded for {dateScope === 'day' ? selectedDate : 'this filter'}.
                  </div>
                ) : (
                  filteredEntries
                    .filter((e) => e.type === 'expense')
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-rose-100 bg-rose-50/30 p-3 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-xs font-bold text-[#0B1F44] truncate">{entry.title}</div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{entry.entryDate}</span>
                            {entry.category ? ` · ${entry.category}` : ''} · {entry.paymentMethod}
                          </div>
                          {entry.note && (
                            <div className="flex items-start gap-1 text-[11px] text-slate-600 bg-white rounded-lg px-2 py-1 mt-1 border border-rose-100">
                              <NotebookPen className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                              <span>{entry.note}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="text-xs font-bold font-mono tabular-nums text-rose-600">
                            -{formatCurrency(entry.amount)}
                          </div>
                          {canModifyRecord(entry.recordedByUid) && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditEntry(entry)}
                                className="p-1.5 rounded-lg border border-blue-200 bg-white text-[#0B1F44] hover:bg-blue-50"
                                aria-label="Edit expense entry"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(entry)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                aria-label="Delete expense entry"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
