import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  Download,
  Edit3,
  MapPin,
  Phone,
  Plus,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { formatTimestamp } from '../lib/firebase';
import { exportRowsToExcel, formatCurrency } from '../lib/upiAndExport';
import { Customer } from '../types/billing';

export const CustomersPage: React.FC = () => {
  const { customers, bills, saveCustomer, recordPaymentAtomic } = useBillingData();

  const [search, setSearch] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [settlingBillId, setSettlingBillId] = useState<string>('');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Other'>('Cash');
  const [settleRef, setSettleRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filterPending && (c.outstandingBalance || 0) <= 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.mobile || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
      );
    });
  }, [customers, search, filterPending]);

  const customerBills = useMemo(() => {
    if (!selectedCustomer) return [];
    return bills.filter(
      (b) =>
        b.customerId === selectedCustomer.id ||
        b.customerName.toLowerCase() === selectedCustomer.name.toLowerCase()
    );
  }, [bills, selectedCustomer]);

  const pendingCustomerBills = useMemo(
    () => customerBills.filter((b) => b.billStatus === 'active' && b.pendingBalance > 0),
    [customerBills]
  );

  const totalReceivables = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.outstandingBalance || 0), 0),
    [customers]
  );

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer?.name?.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveCustomer({
        id: editingCustomer.id,
        name: editingCustomer.name.trim(),
        mobile: editingCustomer.mobile || '',
        email: editingCustomer.email || '',
        address: editingCustomer.address || '',
        totalPurchases: editingCustomer.totalPurchases || 0,
        outstandingBalance: editingCustomer.outstandingBalance || 0,
        billCount: editingCustomer.billCount || 0,
      });
      setEditingCustomer(null);
      setFeedback('Customer profile saved and synchronized across devices.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettleBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingBillId || settleAmount <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordPaymentAtomic({
        billId: settlingBillId,
        amount: settleAmount,
        method: settleMethod,
        referenceId: settleRef,
        notes: 'Settled from Customer Ledger',
      });
      setFeedback(`Payment of ${formatCurrency(settleAmount)} recorded and ledger updated.`);
      setSettlingBillId('');
      setSettleAmount(0);
      setSettleRef('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment settlement failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#1D4ED8]" /> Registered Customers
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">{customers.length}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Pending Balances</div>
            <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatCurrency(totalReceivables)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, area..."
              className="pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={filterPending}
              onChange={(e) => setFilterPending(e.target.checked)}
              className="rounded"
            />
            Pending Only
          </label>
          <button
            onClick={() =>
              exportRowsToExcel(
                filteredCustomers.map((c) => ({
                  Name: c.name,
                  Mobile: c.mobile || '',
                  Address: c.address || '',
                  Bills: c.billCount || 0,
                  TotalPurchases: c.totalPurchases || 0,
                  PendingBalance: c.outstandingBalance || 0,
                })),
                'slp-customers',
                'Customers'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <button
            onClick={() => setEditingCustomer({ name: '', mobile: '', email: '', address: '' })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8]"
          >
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Customer Directory */}
        <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Contact</th>
                <th className="py-3 px-4 font-semibold text-right">Bills</th>
                <th className="py-3 px-4 font-semibold text-right">Total Purchases</th>
                <th className="py-3 px-4 font-semibold text-right">Pending</th>
                <th className="py-3 px-4 font-semibold text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.map((c) => {
                const isSelected = selectedCustomer?.id === c.id;
                return (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setSettlingBillId('');
                      setError(null);
                    }}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#1D4ED8]/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                      {c.address && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" /> {c.address}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {c.mobile || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{c.billCount || 0}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(c.totalPurchases || 0)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold ${
                        (c.outstandingBalance || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrency(c.outstandingBalance || 0)}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditingCustomer(c)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Edit customer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No customers match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Customer Ledger & Quick Settlement */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          {selectedCustomer ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedCustomer.name}
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                    {selectedCustomer.mobile && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {selectedCustomer.mobile}
                      </div>
                    )}
                    {selectedCustomer.address && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {selectedCustomer.address}
                      </div>
                    )}
                  </div>
                </div>
                <UserCheck className="w-5 h-5 text-[#1D4ED8]" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
                  <div className="text-slate-500">Lifetime Billed</div>
                  <div className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {formatCurrency(selectedCustomer.totalPurchases || 0)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                  <div className="text-amber-700 dark:text-amber-300">Pending Balance</div>
                  <div className="text-sm font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                    {formatCurrency(selectedCustomer.outstandingBalance || 0)}
                  </div>
                </div>
              </div>

              {/* Settle Pending Bill */}
              {pendingCustomerBills.length > 0 && (
                <form
                  onSubmit={handleSettleBalance}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2.5 text-xs bg-slate-50/70 dark:bg-slate-950/60"
                >
                  <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[#1D4ED8]" /> Settle Pending Bill
                  </div>
                  {error && <div className="text-rose-600">{error}</div>}
                  <select
                    required
                    value={settlingBillId}
                    onChange={(e) => {
                      const bId = e.target.value;
                      setSettlingBillId(bId);
                      const matched = pendingCustomerBills.find((b) => b.id === bId);
                      if (matched) setSettleAmount(matched.pendingBalance);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="">Select pending bill...</option>
                    {pendingCustomerBills.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.billNumber} · Due {formatCurrency(b.pendingBalance)}
                      </option>
                    ))}
                  </select>

                  {settlingBillId && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0.01}
                          required
                          value={settleAmount}
                          onChange={(e) => setSettleAmount(Number(e.target.value))}
                          placeholder="Amount"
                          className="px-2.5 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <select
                          value={settleMethod}
                          onChange={(e) =>
                            setSettleMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')
                          }
                          className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <input
                        value={settleRef}
                        onChange={(e) => setSettleRef(e.target.value)}
                        placeholder="UPI / Bank reference (optional)"
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-2 rounded-lg bg-[#0B1F44] text-white font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
                      >
                        {submitting ? 'Recording...' : 'Record Payment'}
                      </button>
                    </>
                  )}
                </form>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Invoice History ({customerBills.length})
                </h4>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {customerBills.map((b) => (
                    <div
                      key={b.id}
                      className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {b.billNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatTimestamp(b.createdAt).toLocaleDateString('en-IN')} · {b.paymentStatus}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(b.grandTotal)}
                        </div>
                        {b.pendingBalance > 0 && (
                          <div className="text-[11px] text-amber-600">Due {formatCurrency(b.pendingBalance)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {customerBills.length === 0 && (
                    <p className="text-xs text-slate-400">No invoices linked to this customer yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              Select a customer from the directory to inspect their purchase ledger and settle pending balances.
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingCustomer.id ? 'Edit Customer' : 'Register Customer'}
              </h3>
              <button type="button" onClick={() => setEditingCustomer(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <div className="text-xs text-rose-600">{error}</div>}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Customer Name *
                </label>
                <input
                  required
                  value={editingCustomer.name || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  placeholder="Full name or firm"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Mobile Number (Optional)
                </label>
                <input
                  value={editingCustomer.mobile || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                  placeholder="10-digit mobile for WhatsApp/SMS"
                  className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={editingCustomer.email || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Village / Address (Optional)
                </label>
                <textarea
                  rows={2}
                  value={editingCustomer.address || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Customer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
