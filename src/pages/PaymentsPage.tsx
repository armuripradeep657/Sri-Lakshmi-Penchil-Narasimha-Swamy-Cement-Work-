import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Download,
  Plus,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { formatTimestamp } from '../lib/firebase';
import { exportRowsToExcel, formatCurrency } from '../lib/upiAndExport';

export const PaymentsPage: React.FC = () => {
  const { payments, bills, recordPaymentAtomic } = useBillingData();

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'payment' | 'refund'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedBillId, setSelectedBillId] = useState('');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Other'>('Cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const pendingBills = useMemo(
    () => bills.filter((b) => b.billStatus === 'active' && b.pendingBalance > 0),
    [bills]
  );

  const totals = useMemo(() => {
    let collected = 0;
    let refunded = 0;
    let cash = 0;
    let upi = 0;
    let bank = 0;
    for (const p of payments) {
      if (p.type === 'refund') {
        refunded += p.amount;
      } else {
        collected += p.amount;
        if (p.method === 'Cash') cash += p.amount;
        else if (p.method === 'UPI') upi += p.amount;
        else if (p.method === 'Bank Transfer') bank += p.amount;
      }
    }
    const totalPending = pendingBills.reduce((s, b) => s + b.pendingBalance, 0);
    return { collected, refunded, cash, upi, bank, totalPending };
  }, [payments, pendingBills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (methodFilter !== 'ALL' && p.method !== methodFilter) return false;
      if (typeFilter !== 'ALL' && p.type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.billNumber.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        (p.referenceId || '').toLowerCase().includes(q)
      );
    });
  }, [payments, search, methodFilter, typeFilter]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillId || payAmount <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordPaymentAtomic({
        billId: selectedBillId,
        amount: payAmount,
        method: payMethod,
        referenceId: payRef,
        notes: payNotes,
      });
      setFeedback(`Payment of ${formatCurrency(payAmount)} confirmed and linked to invoice.`);
      setModalOpen(false);
      setSelectedBillId('');
      setPayAmount(0);
      setPayRef('');
      setPayNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> Total Collected
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCurrency(totals.collected)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Cash: {formatCurrency(totals.cash)}
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-[#1D4ED8]" /> UPI & Bank Transfers
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {formatCurrency(totals.upi + totals.bank)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            UPI {formatCurrency(totals.upi)} · Bank {formatCurrency(totals.bank)}
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-amber-500" /> Pending Receivables
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrency(totals.totalPending)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{pendingBills.length} open bills</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" /> Refunds Issued
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
            {formatCurrency(totals.refunded)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Atomic audit-logged refunds</div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter & Record Bar */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bill #, customer, UTR ref..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          >
            <option value="ALL">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Other">Other</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'payment' | 'refund')}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          >
            <option value="ALL">Payments & Refunds</option>
            <option value="payment">Payments Only</option>
            <option value="refund">Refunds Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportRowsToExcel(
                filtered.map((p) => ({
                  Date: formatTimestamp(p.createdAt).toLocaleString('en-IN'),
                  BillNumber: p.billNumber,
                  Customer: p.customerName,
                  Type: p.type,
                  Method: p.method,
                  Amount: p.amount,
                  Reference: p.referenceId || '',
                  RecordedBy: p.recordedByName || '',
                })),
                'slp-payments-ledger',
                'Payments'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <button
            onClick={() => {
              setError(null);
              if (pendingBills.length > 0 && !selectedBillId) {
                setSelectedBillId(pendingBills[0].id);
                setPayAmount(pendingBills[0].pendingBalance);
              }
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8]"
          >
            <Plus className="w-3.5 h-3.5" /> Record Payment
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4 font-semibold">Date & Time</th>
              <th className="py-3 px-4 font-semibold">Bill #</th>
              <th className="py-3 px-4 font-semibold">Customer</th>
              <th className="py-3 px-4 font-semibold">Type</th>
              <th className="py-3 px-4 font-semibold">Method</th>
              <th className="py-3 px-4 font-semibold">Reference / Notes</th>
              <th className="py-3 px-4 font-semibold">Staff</th>
              <th className="py-3 px-4 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                  {formatTimestamp(p.createdAt).toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-4 font-mono font-semibold text-[#1D4ED8]">{p.billNumber}</td>
                <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{p.customerName}</td>
                <td className="py-3 px-4 uppercase font-semibold text-[11px]">
                  <span className={p.type === 'refund' ? 'text-rose-600' : 'text-emerald-600'}>
                    {p.type}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{p.method}</td>
                <td className="py-3 px-4 text-slate-500">
                  {p.referenceId ? <span className="font-mono">{p.referenceId} · </span> : null}
                  {p.notes || '—'}
                </td>
                <td className="py-3 px-4 text-slate-500">{p.recordedByName || '—'}</td>
                <td
                  className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                    p.type === 'refund' ? 'text-rose-600' : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {p.type === 'refund' ? '-' : ''}
                  {formatCurrency(p.amount)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  No payment records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Record Payment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Record Payment Against Pending Bill
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            {pendingBills.length === 0 ? (
              <div className="text-xs text-slate-500 py-4">
                All active bills are currently settled with zero pending balance.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Select Open Bill *
                  </label>
                  <select
                    required
                    value={selectedBillId}
                    onChange={(e) => {
                      setSelectedBillId(e.target.value);
                      const matched = pendingBills.find((b) => b.id === e.target.value);
                      if (matched) setPayAmount(matched.pendingBalance);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="">Choose bill...</option>
                    {pendingBills.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.billNumber} · {b.customerName} · Due {formatCurrency(b.pendingBalance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Amount Received (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0.01}
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Payment Method *
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) =>
                        setPayMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                    UTR / Transaction Reference (Optional)
                  </label>
                  <input
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="UPI UTR or bank reference ID"
                    className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Notes</label>
                  <input
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="Cashier remarks"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
                  >
                    {submitting ? 'Confirming...' : 'Confirm Payment'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
