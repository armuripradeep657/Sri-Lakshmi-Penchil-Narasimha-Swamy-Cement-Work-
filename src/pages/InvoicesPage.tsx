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
import { formatAppDate, tr, translateCustomerName } from '../lib/i18n';

export const InvoicesPage: React.FC = () => {
  const { bills, billItems, products, business, businessSettings, upiSetting, togglePublicInvoiceRevoke } = useBillingData();
  const { isAdmin, language } = useAuth();
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
    const pdf = await generateA4InvoicePdf({
      bill,
      items,
      business,
      settings: businessSettings,
      upi: upiSetting,
      products,
      language,
    });
    pdf.save(`${bill.billNumber}_Tax_Invoice.pdf`);
  };

  const buildPortalUrl = (token: string) =>
    `${window.location.origin}/?invoice=${token}${language === 'te' ? '&lang=te' : ''}`;

  const handleCopy = async (bill: Bill) => {
    const url = buildPortalUrl(bill.publicToken);
    await navigator.clipboard.writeText(url);
    setCopiedId(bill.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 animate-slp-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#8A8279] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr(language, 'Search invoice # or customer...', 'ఇన్వాయిస్ # లేదా కస్టమర్ పేరు వెతకండి...')}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
          />
        </div>
        <button
          onClick={() => setScannerOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A2240] hover:bg-[#0A2240] text-white text-xs font-semibold shrink-0 transition"
        >
          <ScanBarcode className="w-4 h-4 text-amber-300" />
          {tr(language, 'Verify Bill', 'బిల్ తనిఖీ')}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#FAF8F5] dark:bg-slate-950 border-b border-[#E5DDD3] dark:border-slate-800 text-[#6D665E]">
              <tr>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Invoice #', 'ఇన్వాయిస్ #')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Date', 'తేదీ')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Customer', 'కస్టమర్')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Grand Total', 'మొత్తం విలువ')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Portal Link', 'పోర్టల్ లింక్')}</th>
                <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Actions', 'చర్యలు')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#8A8279]">
                    {tr(language, 'No invoices generated yet.', 'ఇంకా ఇన్వాయిస్‌లు ఏవీ రూపొందించబడలేదు.')}
                  </td>
                </tr>
              ) : (
                filtered.map((bill) => (
                  <tr
                    key={bill.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement | null)?.closest('button, a')) return;
                      setSelectedBill(bill);
                    }}
                    className="cursor-pointer hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-[#0A2240] dark:text-sky-400">
                      <div>{bill.billNumber}</div>
                      <div className="text-[10px] font-normal text-[#6D665E]">
                        {tr(language, 'Verify:', 'తనిఖీ:')} {getBillVerificationBarcode(bill)}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#6D665E] whitespace-nowrap">
                      {formatAppDate(formatTimestamp(bill.createdAt), language)}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#0A2240] dark:text-white">
                      {translateCustomerName(bill.customerName, language)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      {formatCurrency(bill.grandTotal)}
                    </td>
                    <td className="py-3 px-4">
                      {bill.publicLinkRevoked ? (
                        <span className="text-[#C23B2B] font-semibold">{tr(language, 'Revoked', 'రద్దు చేయబడింది')}</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopy(bill)}
                            className="inline-flex items-center gap-1 text-[#9A4307] dark:text-sky-400 hover:underline"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedId === bill.id ? tr(language, 'Copied', 'కాపీ అయింది') : tr(language, 'Copy Link', 'లింక్ కాపీ')}
                          </button>
                          <a
                            href={`/?invoice=${bill.publicToken}${language === 'te' ? '&lang=te' : ''}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#8A8279] hover:text-[#2D3138]"
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
                          title={tr(language, 'Preview & Share', 'ప్రివ్యూ & షేర్')}
                          className="p-1.5 rounded border border-[#E5DDD3] dark:border-slate-700 hover:bg-[#F3EDE5] dark:hover:bg-slate-800"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(bill)}
                          title={tr(language, 'Download A4 PDF', 'ఏ4 పీడీఎఫ్ డౌన్‌లోడ్')}
                          className="p-1.5 rounded border border-[#E5DDD3] dark:border-slate-700 hover:bg-[#F3EDE5] dark:hover:bg-slate-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => togglePublicInvoiceRevoke(bill.id, bill.publicToken, !bill.publicLinkRevoked)}
                            title={
                              bill.publicLinkRevoked
                                ? tr(language, 'Restore Customer Link', 'కస్టమర్ లింక్‌ను పునరుద్ధరించండి')
                                : tr(language, 'Revoke Customer Link', 'కస్టమర్ లింక్‌ను రద్దు చేయండి')
                            }
                            className={`p-1.5 rounded border ${
                              bill.publicLinkRevoked
                                ? 'border-[#C5E8D1] text-[#15803D] hover:bg-[#E7F6EC]'
                                : 'border-[#F5C6C0] text-[#C23B2B] hover:bg-[#FCE8E6]'
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
        title={tr(language, 'Scan Bill Barcode to Verify Invoice', 'ఇన్వాయిస్ తనిఖీ కోసం బిల్ బార్‌కోడ్ స్కాన్ చేయండి')}
      />
    </div>
  );
};
