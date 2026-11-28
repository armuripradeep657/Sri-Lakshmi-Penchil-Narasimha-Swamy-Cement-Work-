import React, { useMemo, useState } from 'react';
import {
  CreditCard,
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
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency } from '../lib/upiAndExport';
import {
  formatAppDate,
  tr,
  translateCustomerName,
  translatePaymentMethod,
  translateStatus,
} from '../lib/i18n';
import { AnimatedNumber } from '../components/MotionPrimitives';
import { PostBillActionsModal } from '../components/InvoiceViews';
import { ModalPortal } from '../components/ModalPortal';
import { Bill, Customer } from '../types/billing';

export const CustomersPage: React.FC = () => {
  const { customers, bills, billItems, saveCustomer, recordPaymentAtomic } = useBillingData();
  const { language } = useAuth();

  const [search, setSearch] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [previewBill, setPreviewBill] = useState<Bill | null>(null);
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
      setFeedback(
        tr(
          language,
          'Customer profile saved and synchronized across devices.',
          'కస్టమర్ వివరాలు సేవ్ చేయబడి, అన్ని పరికరాలకు సింక్ చేయబడ్డాయి.'
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : tr(language, 'Failed to save customer.', 'కస్టమర్ వివరాలు సేవ్ చేయడం విఫలమైంది.'));
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
      setFeedback(
        tr(
          language,
          `Payment of ${formatCurrency(settleAmount)} recorded and ledger updated.`,
          `${formatCurrency(settleAmount)} చెల్లింపు నమోదై, ఖాతా నవీకరించబడింది.`
        )
      );
      setSettlingBillId('');
      setSettleAmount(0);
      setSettleRef('');
    } catch (err) {
      setError(err instanceof Error ? err.message : tr(language, 'Payment settlement failed.', 'చెల్లింపు నమోదు విఫలమైంది.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-slp-in">
      {/* Header summary */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-[#6D665E] flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#9A4307]" /> {tr(language, 'Customers', 'కస్టమర్లు')}
            </div>
            <div className="text-lg font-bold font-mono text-[#0A2240] dark:text-white">
              <AnimatedNumber value={customers.length} />
            </div>
          </div>
          <div>
            <div className="text-xs text-[#6D665E]">{tr(language, 'Pending Balances', 'రావలసిన బాకీలు')}</div>
            <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
              <AnimatedNumber value={totalReceivables} format={(n) => formatCurrency(n)} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8A8279] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr(language, 'Search name, phone, area...', 'పేరు, ఫోన్, ప్రాంతం ద్వారా వెతకండి...')}
              className="pl-9 pr-3 py-2 text-xs rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={filterPending}
              onChange={(e) => setFilterPending(e.target.checked)}
              className="rounded"
            />
            {tr(language, 'Pending Only', 'బాకీ ఉన్నవారు మాత్రమే')}
          </label>
          <button
            onClick={() => setEditingCustomer({ name: '', mobile: '', email: '', address: '' })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#0A2240] transition"
          >
            <Plus className="w-3.5 h-3.5" /> {tr(language, 'Add Customer', 'కొత్త కస్టమర్')}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-[#C5E8D1] dark:border-emerald-900/50 bg-[#E7F6EC] dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-[#15803D] dark:text-emerald-300 flex justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="underline">
            {tr(language, 'Dismiss', 'మూసివేయి')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Customer Directory */}
        <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#FAF8F5] dark:bg-slate-950 text-[#6D665E] border-b border-[#E5DDD3] dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Customer', 'కస్టమర్')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Contact', 'ఫోన్')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Bills', 'బిల్లులు')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Total Purchases', 'మొత్తం కొనుగోళ్లు')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Pending', 'బాకీ')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Edit', 'సవరించు')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
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
                        ? 'bg-[#0A2240]/10'
                        : 'hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0A2240] dark:text-white">
                        {translateCustomerName(c.name, language)}
                      </div>
                      {c.address && (
                        <div className="text-[11px] text-[#6D665E] flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" /> {c.address}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#6D665E] dark:text-slate-300">
                      {c.mobile || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{c.billCount || 0}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[#0A2240] dark:text-white">
                      {formatCurrency(c.totalPurchases || 0)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold ${
                        (c.outstandingBalance || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[#15803D]'
                      }`}
                    >
                      {formatCurrency(c.outstandingBalance || 0)}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditingCustomer(c)}
                        className="p-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 hover:bg-[#F3EDE5] dark:hover:bg-slate-800"
                        title={tr(language, 'Edit customer', 'కస్టమర్‌ను సవరించు')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#8A8279]">
                    {tr(language, 'No customers match your filter.', 'మీ ఫిల్టర్‌కు సరిపోయే కస్టమర్లు లేరు.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Customer Ledger & Quick Settlement */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-5 space-y-4">
          {selectedCustomer ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#0A2240] dark:text-white">
                    {translateCustomerName(selectedCustomer.name, language)}
                  </h3>
                  <div className="text-xs text-[#6D665E] mt-0.5 space-y-0.5">
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
                <UserCheck className="w-5 h-5 text-[#9A4307]" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-[#FAF8F5] dark:bg-slate-950">
                  <div className="text-[#6D665E]">{tr(language, 'Lifetime Billed', 'మొత్తం కొనుగోళ్లు')}</div>
                  <div className="text-sm font-bold font-mono text-[#0A2240] dark:text-white mt-0.5">
                    {formatCurrency(selectedCustomer.totalPurchases || 0)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#FDF3DF] dark:bg-amber-950/30">
                  <div className="text-[#9A4307] dark:text-amber-300">{tr(language, 'Pending Balance', 'రావలసిన బాకీ')}</div>
                  <div className="text-sm font-bold font-mono text-[#9A4307] dark:text-amber-300 mt-0.5">
                    {formatCurrency(selectedCustomer.outstandingBalance || 0)}
                  </div>
                </div>
              </div>

              {/* Settle Pending Bill */}
              {pendingCustomerBills.length > 0 && (
                <form
                  onSubmit={handleSettleBalance}
                  className="rounded-lg border border-[#E5DDD3] dark:border-slate-800 p-3 space-y-2.5 text-xs bg-[#FAF8F5] dark:bg-slate-950/60"
                >
                  <div className="font-semibold text-[#0A2240] dark:text-white flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[#9A4307]" /> {tr(language, 'Settle Pending Bill', 'బాకీ బిల్ చెల్లింపు')}
                  </div>
                  {error && <div className="text-[#C23B2B]">{error}</div>}
                  <select
                    required
                    value={settlingBillId}
                    onChange={(e) => {
                      const bId = e.target.value;
                      setSettlingBillId(bId);
                      const matched = pendingCustomerBills.find((b) => b.id === bId);
                      if (matched) setSettleAmount(matched.pendingBalance);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="">{tr(language, 'Select pending bill...', 'బాకీ బిల్ ఎంచుకోండి...')}</option>
                    {pendingCustomerBills.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.billNumber} · {tr(language, 'Due', 'బాకీ')} {formatCurrency(b.pendingBalance)}
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
                          placeholder={tr(language, 'Amount', 'మొత్తం')}
                          className="px-2.5 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <select
                          value={settleMethod}
                          onChange={(e) =>
                            setSettleMethod(e.target.value as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other')
                          }
                          className="px-2.5 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="Cash">{translatePaymentMethod('Cash', language)}</option>
                          <option value="UPI">{translatePaymentMethod('UPI', language)}</option>
                          <option value="Bank Transfer">{translatePaymentMethod('Bank Transfer', language)}</option>
                          <option value="Other">{translatePaymentMethod('Other', language)}</option>
                        </select>
                      </div>
                      <input
                        value={settleRef}
                        onChange={(e) => setSettleRef(e.target.value)}
                        placeholder={tr(language, 'UPI / Bank reference (optional)', 'యూపీఐ / బ్యాంక్ రిఫరెన్స్ (ఐచ్ఛికం)')}
                        className="w-full px-2.5 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-2 rounded-lg bg-[#0A2240] text-white font-semibold hover:bg-[#0A2240] disabled:opacity-50"
                      >
                        {submitting ? tr(language, 'Recording...', 'నమోదవుతోంది...') : tr(language, 'Record Payment', 'చెల్లింపు నమోదు చేయి')}
                      </button>
                    </>
                  )}
                </form>
              )}

              <div>
                <h4 className="text-xs font-semibold text-[#2D3138] dark:text-slate-300 mb-2">
                  {tr(language, 'Invoice History', 'బిల్లుల చరిత్ర')} ({customerBills.length})
                </h4>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {customerBills.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setPreviewBill(b)}
                      className="w-full text-left p-2.5 rounded-lg border border-[#EFEAE2] dark:border-slate-800 hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40 text-xs flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="font-mono font-semibold text-[#0A2240] dark:text-white">
                          {b.billNumber}
                        </div>
                        <div className="text-[11px] text-[#6D665E]">
                          {formatAppDate(formatTimestamp(b.createdAt), language)} · {translateStatus(b.paymentStatus, language)}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-semibold text-[#0A2240] dark:text-white">
                          {formatCurrency(b.grandTotal)}
                        </div>
                        {b.pendingBalance > 0 && (
                          <div className="text-[11px] text-amber-600">
                            {tr(language, 'Due', 'బాకీ')} {formatCurrency(b.pendingBalance)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                  {customerBills.length === 0 && (
                    <p className="text-xs text-[#8A8279]">
                      {tr(language, 'No invoices linked to this customer yet.', 'ఈ కస్టమర్‌కు ఇంకా బిల్లులు లేవు.')}
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-[#8A8279]">
              {tr(
                language,
                'Select a customer from the directory to inspect their purchase ledger and settle pending balances.',
                'కొనుగోలు వివరాలు చూడటానికి మరియు బాకీలు చెల్లించడానికి జాబితా నుండి కస్టమర్‌ను ఎంచుకోండి.'
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {editingCustomer && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-6 space-y-4 max-h-[92dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0A2240] dark:text-white">
                {editingCustomer.id
                  ? tr(language, 'Edit Customer', 'కస్టమర్ వివరాలు సవరించు')
                  : tr(language, 'Register Customer', 'కొత్త కస్టమర్ నమోదు')}
              </h3>
              <button type="button" onClick={() => setEditingCustomer(null)} className="text-[#8A8279]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <div className="text-xs text-[#C23B2B]">{error}</div>}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Customer Name *', 'కస్టమర్ పేరు *')}
                </label>
                <input
                  required
                  value={editingCustomer.name || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  placeholder={tr(language, 'Full name or firm', 'పూర్తి పేరు లేదా సంస్థ')}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Mobile Number (Optional)', 'మొబైల్ నంబర్ (ఐచ్ఛికం)')}
                </label>
                <input
                  value={editingCustomer.mobile || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                  placeholder={tr(language, '10-digit mobile for WhatsApp/SMS', 'వాట్సాప్ / ఎస్‌ఎంఎస్ కోసం 10 అంకెల నంబర్')}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Email (Optional)', 'ఇమెయిల్ (ఐచ్ఛికం)')}
                </label>
                <input
                  type="email"
                  value={editingCustomer.email || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block font-medium text-[#6D665E] dark:text-slate-300 mb-1">
                  {tr(language, 'Village / Address (Optional)', 'గ్రామం / చిరునామా (ఐచ్ఛికం)')}
                </label>
                <textarea
                  rows={2}
                  value={editingCustomer.address || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 text-xs font-medium"
              >
                {tr(language, 'Cancel', 'రద్దు')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#0A2240] disabled:opacity-50"
              >
                {submitting ? tr(language, 'Saving...', 'సేవ్ అవుతోంది...') : tr(language, 'Save Customer', 'కస్టమర్‌ను సేవ్ చేయి')}
              </button>
            </div>
          </form>
        </div>
        </ModalPortal>
      )}

      <PostBillActionsModal
        bill={previewBill}
        items={previewBill ? billItems.filter((bi) => bi.billId === previewBill.id) : []}
        onClose={() => setPreviewBill(null)}
      />
    </div>
  );
};
