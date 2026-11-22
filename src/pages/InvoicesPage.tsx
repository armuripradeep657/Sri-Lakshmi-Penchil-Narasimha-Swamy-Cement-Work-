import React, { useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, Eye, Link2Off, Link2, ScanBarcode, Search } from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency, generateA4InvoicePdf } from '../lib/upiAndExport';
import { Bill } from '../types/billing';
import { PostBillActionsModal } from '../components/InvoiceViews';
import { ScannerModal } from '../components/ScannerModal';
import { getBillVerificationBarcode } from '../lib/barcodeAndBillImage';

export const InvoicesPage: React.FC = () => {
  const { bills, billItems, products, business, businessSettings, upiSetting, togglePublicInvoiceRevoke } = useBillingData();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter((b) => {
      if (!q) return true;
      return (
        b.billNumber.toLowerCase().includes(q) ||
        getBillVerificationBarcode(b).toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        (b.customerMobile && b.customerMobile.includes(q))
      );
    });
  }, [bills, search]);

  const handleDownload = async (bill: Bill) => {
    if (!business) return;
    const items = billItems.filter((bi) => bi.billId === bill.id);
    const pdf = await generateA4InvoicePdf({ bill, items, business, settings: businessSettings, upi: upiSetting });
    pdf.save(`${bill.billNumber}_Tax_Invoice.pdf`);
  };

  const handleCopy = async (bill: Bill) => {
    const url = `${window.location.origin}/?invoice=${bill.publicToken}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(bill.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-5 animate-slp-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tax Invoices &amp; Customer Links</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Download A4 invoices, inspect GST splits, and manage revocable customer portal links
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or customer..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <button
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1F44] hover:bg-[#13326b] text-white text-xs font-semibold shrink-0"
          >
            <ScanBarcode className="w-4 h-4 text-cyan-300" />
            Verify Bill
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-3 px-4 font-semibold">Invoice #</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold text-right">Taxable</th>
                <th className="py-3 px-4 font-semibold text-right">GST</th>
                <th className="py-3 px-4 font-semibold text-right">Grand Total</th>
                <th className="py-3 px-4 font-semibold">Portal Link</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No invoices generated yet.
                  </td>
                </tr>
              ) : (
                filtered.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-semibold text-[#0B1F44] dark:text-sky-400">
                      <div>{bill.billNumber}</div>
                      <div className="text-[10px] font-normal text-slate-500">
                        Verify: {getBillVerificationBarcode(bill)}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatTimestamp(bill.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{bill.customerName}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatCurrency(bill.taxableAmount)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(bill.totalTax)} <span className="text-[10px] text-slate-400">({bill.gstType})</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      {formatCurrency(bill.grandTotal)}
                    </td>
                    <td className="py-3 px-4">
                      {bill.publicLinkRevoked ? (
                        <span className="text-rose-600 font-semibold">Revoked</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopy(bill)}
                            className="inline-flex items-center gap-1 text-[#1D4ED8] dark:text-sky-400 hover:underline"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedId === bill.id ? 'Copied' : 'Copy Link'}
                          </button>
                          <a
                            href={`/?invoice=${bill.publicToken}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 hover:text-slate-700"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setSelectedBill(bill)}
                          title="Preview & Share"
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(bill)}
                          title="Download A4 PDF"
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => togglePublicInvoiceRevoke(bill.id, bill.publicToken, !bill.publicLinkRevoked)}
                            title={bill.publicLinkRevoked ? 'Restore Customer Link' : 'Revoke Customer Link'}
                            className={`p-1.5 rounded border ${
                              bill.publicLinkRevoked
                                ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                : 'border-rose-200 text-rose-700 hover:bg-rose-50'
                            }`}
                          >
                            {bill.publicLinkRevoked ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PostBillActionsModal
        bill={selectedBill}
        items={selectedBill ? billItems.filter((bi) => bi.billId === selectedBill.id) : []}
        onClose={() => setSelectedBill(null)}
      />

      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        products={products}
        bills={bills}
        onBillFound={(b) => setSelectedBill(b)}
        title="Scan Bill Barcode to Verify Invoice"
      />
    </div>
  );
};
