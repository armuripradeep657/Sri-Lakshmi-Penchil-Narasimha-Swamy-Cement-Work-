import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BrainCircuit,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useBillingData } from '../context/BillingDataContext';
import { formatTimestamp } from '../lib/firebase';
import { exportRowsToCsv, exportRowsToExcel, formatCurrency } from '../lib/upiAndExport';

type ReportType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom'
  | 'products'
  | 'customers'
  | 'payments'
  | 'gst'
  | 'profit_loss'
  | 'outstanding'
  | 'inventory';

export const ReportsPage: React.FC = () => {
  const { bills, billItems, payments, products, customers, business } = useBillingData();

  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const activeBills = useMemo(() => bills.filter((b) => b.billStatus === 'active'), [bills]);

  const dateFilteredBills = useMemo(() => {
    const now = new Date();
    return activeBills.filter((b) => {
      const dt = formatTimestamp(b.createdAt);
      if (reportType === 'daily') {
        return dt.toDateString() === now.toDateString();
      }
      if (reportType === 'weekly') {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return dt >= weekAgo;
      }
      if (reportType === 'monthly') {
        return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
      }
      if (reportType === 'yearly') {
        return dt.getFullYear() === now.getFullYear();
      }
      if (reportType === 'custom') {
        const s = new Date(`${startDate}T00:00:00`);
        const e = new Date(`${endDate}T23:59:59`);
        return dt >= s && dt <= e;
      }
      return true;
    });
  }, [activeBills, reportType, startDate, endDate]);

  const summary = useMemo(() => {
    const grossSales = dateFilteredBills.reduce((s, b) => s + b.grandTotal, 0);
    const collected = dateFilteredBills.reduce((s, b) => s + b.amountPaid, 0);
    const pending = dateFilteredBills.reduce((s, b) => s + b.pendingBalance, 0);
    const totalDiscount = dateFilteredBills.reduce((s, b) => s + b.discountAmount, 0);
    const totalTax = dateFilteredBills.reduce((s, b) => s + b.totalTax, 0);

    // Cost of goods sold estimate from matching active billItems
    const billIdSet = new Set(dateFilteredBills.map((b) => b.id));
    const productMap = new Map(products.map((p) => [p.id, p]));
    let estimatedCogs = 0;
    for (const item of billItems) {
      if (billIdSet.has(item.billId)) {
        const prod = productMap.get(item.productId);
        estimatedCogs += Number(prod?.purchasePrice || 0) * item.quantity;
      }
    }
    const netExTaxRevenue = grossSales - totalTax;
    const grossProfit = netExTaxRevenue - estimatedCogs;

    return {
      billCount: dateFilteredBills.length,
      grossSales,
      collected,
      pending,
      totalDiscount,
      totalTax,
      estimatedCogs,
      grossProfit,
    };
  }, [dateFilteredBills, billItems, products]);

  const { columns, rows, chartData } = useMemo(() => {
    if (reportType === 'products') {
      const map = new Map<string, { name: string; qty: number; revenue: number; tax: number; cost: number }>();
      const prodMap = new Map(products.map((p) => [p.id, p]));
      const activeIds = new Set(activeBills.map((b) => b.id));
      for (const bi of billItems) {
        if (!activeIds.has(bi.billId)) continue;
        const cur = map.get(bi.productId) || { name: bi.productName, qty: 0, revenue: 0, tax: 0, cost: 0 };
        const p = prodMap.get(bi.productId);
        cur.qty += bi.quantity;
        cur.revenue += bi.lineTotal;
        cur.tax += bi.taxAmount;
        cur.cost += Number(p?.purchasePrice || 0) * bi.quantity;
        map.set(bi.productId, cur);
      }
      const list = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
      return {
        columns: ['Product', 'Units Sold', 'Revenue (₹)', 'Tax (₹)', 'Est. Profit (₹)'],
        rows: list.map((r) => ({
          Product: r.name,
          'Units Sold': r.qty,
          'Revenue (₹)': Number(r.revenue.toFixed(2)),
          'Tax (₹)': Number(r.tax.toFixed(2)),
          'Est. Profit (₹)': Number((r.revenue - r.tax - r.cost).toFixed(2)),
        })),
        chartData: list.slice(0, 8).map((r) => ({ label: r.name.slice(0, 14), value: Math.round(r.revenue) })),
      };
    }

    if (reportType === 'customers') {
      const list = [...customers].sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0));
      return {
        columns: ['Customer', 'Mobile', 'Bills', 'Total Purchases (₹)', 'Pending Balance (₹)'],
        rows: list.map((c) => ({
          Customer: c.name,
          Mobile: c.mobile || '—',
          Bills: c.billCount || 0,
          'Total Purchases (₹)': Number((c.totalPurchases || 0).toFixed(2)),
          'Pending Balance (₹)': Number((c.outstandingBalance || 0).toFixed(2)),
        })),
        chartData: list.slice(0, 8).map((c) => ({ label: c.name.slice(0, 14), value: Math.round(c.totalPurchases || 0) })),
      };
    }

    if (reportType === 'payments') {
      const byMethod = new Map<string, { method: string; count: number; total: number }>();
      for (const p of payments) {
        if (p.type === 'refund') continue;
        const cur = byMethod.get(p.method) || { method: p.method, count: 0, total: 0 };
        cur.count += 1;
        cur.total += p.amount;
        byMethod.set(p.method, cur);
      }
      const list = Array.from(byMethod.values());
      return {
        columns: ['Payment Method', 'Transactions', 'Total Collected (₹)'],
        rows: list.map((r) => ({
          'Payment Method': r.method,
          Transactions: r.count,
          'Total Collected (₹)': Number(r.total.toFixed(2)),
        })),
        chartData: list.map((r) => ({ label: r.method, value: Math.round(r.total) })),
      };
    }

    if (reportType === 'gst') {
      return {
        columns: ['Bill #', 'Date', 'Customer', 'Taxable (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total Tax (₹)', 'Grand Total (₹)'],
        rows: dateFilteredBills.map((b) => ({
          'Bill #': b.billNumber,
          Date: formatTimestamp(b.createdAt).toLocaleDateString('en-IN'),
          Customer: b.customerName,
          'Taxable (₹)': b.taxableAmount,
          'CGST (₹)': b.cgstAmount || 0,
          'SGST (₹)': b.sgstAmount || 0,
          'IGST (₹)': b.igstAmount || 0,
          'Total Tax (₹)': b.totalTax,
          'Grand Total (₹)': b.grandTotal,
        })),
        chartData: dateFilteredBills.slice(0, 10).map((b) => ({ label: b.billNumber, value: Math.round(b.totalTax) })),
      };
    }

    if (reportType === 'outstanding') {
      const open = activeBills.filter((b) => b.pendingBalance > 0);
      return {
        columns: ['Bill #', 'Date', 'Customer', 'Mobile', 'Grand Total (₹)', 'Paid (₹)', 'Pending (₹)'],
        rows: open.map((b) => ({
          'Bill #': b.billNumber,
          Date: formatTimestamp(b.createdAt).toLocaleDateString('en-IN'),
          Customer: b.customerName,
          Mobile: b.customerMobile || '—',
          'Grand Total (₹)': b.grandTotal,
          'Paid (₹)': b.amountPaid,
          'Pending (₹)': b.pendingBalance,
        })),
        chartData: open.slice(0, 8).map((b) => ({ label: b.customerName.slice(0, 12), value: Math.round(b.pendingBalance) })),
      };
    }

    if (reportType === 'inventory') {
      return {
        columns: ['Code', 'Product', 'Category', 'Stock', 'Purchase Price (₹)', 'Cost Valuation (₹)', 'Retail Valuation (₹)'],
        rows: products.map((p) => ({
          Code: p.productCode,
          Product: p.name,
          Category: p.category,
          Stock: p.stock,
          'Purchase Price (₹)': p.purchasePrice,
          'Cost Valuation (₹)': Number((p.stock * p.purchasePrice).toFixed(2)),
          'Retail Valuation (₹)': Number((p.stock * p.sellingPrice).toFixed(2)),
        })),
        chartData: products.slice(0, 8).map((p) => ({
          label: p.name.slice(0, 14),
          value: Math.round(p.stock * p.purchasePrice),
        })),
      };
    }

    // Sales / Daily / Weekly / Monthly / Yearly / Custom / Profit & Loss
    const byDate = new Map<string, number>();
    for (const b of dateFilteredBills) {
      const d = formatTimestamp(b.createdAt).toLocaleDateString('en-IN');
      byDate.set(d, (byDate.get(d) || 0) + b.grandTotal);
    }

    return {
      columns: ['Bill #', 'Date', 'Customer', 'Subtotal (₹)', 'Discount (₹)', 'Tax (₹)', 'Grand Total (₹)', 'Paid (₹)', 'Status'],
      rows: dateFilteredBills.map((b) => ({
        'Bill #': b.billNumber,
        Date: formatTimestamp(b.createdAt).toLocaleDateString('en-IN'),
        Customer: b.customerName,
        'Subtotal (₹)': b.subtotal,
        'Discount (₹)': b.discountAmount,
        'Tax (₹)': b.totalTax,
        'Grand Total (₹)': b.grandTotal,
        'Paid (₹)': b.amountPaid,
        Status: b.paymentStatus.toUpperCase(),
      })),
      chartData: Array.from(byDate.entries())
        .slice(0, 14)
        .map(([label, value]) => ({ label, value: Math.round(value) })),
    };
  }, [reportType, dateFilteredBills, activeBills, billItems, products, customers, payments]);

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    doc.setFillColor(11, 31, 68);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`${business?.name || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work'} — ${reportType.toUpperCase()} REPORT`, 14, 14);

    autoTable(doc, {
      startY: 28,
      head: [columns],
      body: rows.map((r) => columns.map((c) => String((r as Record<string, unknown>)[c] ?? ''))),
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 68], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });
    doc.save(`slp-report-${reportType}.pdf`);
  };

  const handleRunDeepInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/deep-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summaryData: {
            reportType,
            summary,
            topProducts: rows.slice(0, 12),
            lowStockCount: products.filter((p) => p.stock <= (p.lowStockThreshold ?? 10)).length,
          },
          question: 'Analyze sales trends, profit margins, receivable risks, and precast cement restocking priorities.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiInsights(data.analysis);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Deep AI insights unavailable.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Report Selector Bar */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1D4ED8]" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Cloud Financial & Inventory Analytics
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
            <button
              onClick={() => exportRowsToExcel(rows as Record<string, unknown>[], `slp-report-${reportType}`, 'Report')}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
            <button
              onClick={() => exportRowsToCsv(rows as Record<string, unknown>[], `slp-report-${reportType}`)}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={handleRunDeepInsights}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#06B6D4]/15 text-[#0284C7] dark:text-[#06B6D4] text-xs font-semibold hover:bg-[#06B6D4]/25"
            >
              <BrainCircuit className="w-3.5 h-3.5" /> {aiLoading ? 'Analyzing...' : 'AI Analyst'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['daily', 'Daily Sales'],
              ['weekly', 'Weekly Sales'],
              ['monthly', 'Monthly Sales'],
              ['yearly', 'Yearly Sales'],
              ['custom', 'Custom Date'],
              ['products', 'Product Sales'],
              ['customers', 'Customer Ledger'],
              ['payments', 'Payments'],
              ['gst', 'GST Tax'],
              ['profit_loss', 'Profit & Loss'],
              ['outstanding', 'Pending Dues'],
              ['inventory', 'Inventory Valuation'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setReportType(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                reportType === id
                  ? 'bg-[#0B1F44] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {reportType === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          </div>
        )}
      </div>

      {/* Period Financial Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500">Gross Revenue</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {formatCurrency(summary.grossSales)}
          </div>
          <div className="text-[11px] text-slate-400">{summary.billCount} invoices</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500">Collected</div>
          <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            {formatCurrency(summary.collected)}
          </div>
          <div className="text-[11px] text-slate-400">Discounts: {formatCurrency(summary.totalDiscount)}</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500">Pending Dues</div>
          <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
            {formatCurrency(summary.pending)}
          </div>
          <div className="text-[11px] text-slate-400">Receivable balance</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500">GST Output Tax</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {formatCurrency(summary.totalTax)}
          </div>
          <div className="text-[11px] text-slate-400">CGST/SGST/IGST</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-[#06B6D4]" /> Est. Gross Profit
          </div>
          <div className="text-base font-bold font-mono text-[#1D4ED8] dark:text-[#06B6D4] mt-0.5">
            {formatCurrency(summary.grossProfit)}
          </div>
          <div className="text-[11px] text-slate-400">COGS: {formatCurrency(summary.estimatedCogs)}</div>
        </div>
      </div>

      {aiError && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          {aiError}
        </div>
      )}

      {aiInsights && (
        <div className="rounded-xl border border-[#06B6D4]/40 bg-white dark:bg-slate-900 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0284C7] dark:text-[#06B6D4] flex items-center gap-1.5">
              <BrainCircuit className="w-4 h-4" /> Financial & Inventory Insights
            </h3>
            <button onClick={() => setAiInsights(null)} className="text-xs text-slate-400 hover:text-slate-600">
              Close
            </button>
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
            {aiInsights}
          </div>
        </div>
      )}

      {/* Visual Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Visual Breakdown ({reportType.replace('_', ' ')})
          </h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Report Data Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <tr>
              {columns.map((col) => (
                <th key={col} className="py-3 px-4 font-semibold whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                {columns.map((col) => (
                  <td key={col} className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {String((row as Record<string, unknown>)[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-slate-400">
                  No records match this report period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
