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
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { exportRowsToCsv, exportRowsToExcel, formatCurrency } from '../lib/upiAndExport';
import {
  formatAppDate,
  tr,
  translateBusinessName,
  translateCartProductName,
  translateCategory,
  translateCustomerName,
  translatePaymentMethod,
  translateProductName,
  translateStatus,
} from '../lib/i18n';

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
  const { bills, billItems, payments, products, customers, business, categories } = useBillingData();
  const { language } = useAuth();

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

  const reportTabs = useMemo(
    () =>
      [
        ['daily', tr(language, 'Daily Sales', 'రోజువారీ అమ్మకాలు')],
        ['weekly', tr(language, 'Weekly Sales', 'వారపు అమ్మకాలు')],
        ['monthly', tr(language, 'Monthly Sales', 'నెలవారీ అమ్మకాలు')],
        ['yearly', tr(language, 'Yearly Sales', 'వార్షిక అమ్మకాలు')],
        ['custom', tr(language, 'Custom Date', 'ఎంచుకున్న తేదీలు')],
        ['products', tr(language, 'Product Sales', 'ఉత్పత్తుల అమ్మకాలు')],
        ['customers', tr(language, 'Customer Ledger', 'కస్టమర్ ఖాతా')],
        ['payments', tr(language, 'Payments', 'చెల్లింపులు')],
        ['gst', tr(language, 'GST Tax', 'జీఎస్టీ పన్ను')],
        ['profit_loss', tr(language, 'Profit & Loss', 'లాభం & నష్టం')],
        ['outstanding', tr(language, 'Pending Dues', 'బాకీ వివరాలు')],
        ['inventory', tr(language, 'Inventory Valuation', 'స్టాక్ విలువ')],
      ] as const,
    [language]
  );

  const reportTypeLabel = useMemo(
    () => reportTabs.find(([id]) => id === reportType)?.[1] || reportType,
    [reportTabs, reportType]
  );

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
        const displayName = translateCartProductName(bi.productName, bi.productId, products, language);
        const cur = map.get(bi.productId) || { name: displayName, qty: 0, revenue: 0, tax: 0, cost: 0 };
        const p = prodMap.get(bi.productId);
        cur.qty += bi.quantity;
        cur.revenue += bi.lineTotal;
        cur.tax += bi.taxAmount;
        cur.cost += Number(p?.purchasePrice || 0) * bi.quantity;
        map.set(bi.productId, cur);
      }
      const list = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
      const colProduct = tr(language, 'Product', 'వస్తువు');
      const colUnits = tr(language, 'Units Sold', 'అమ్మిన సంఖ్య');
      const colRev = tr(language, 'Revenue (₹)', 'ఆదాయం (₹)');
      const colTax = tr(language, 'Tax (₹)', 'పన్ను (₹)');
      const colProfit = tr(language, 'Est. Profit (₹)', 'అంచనా లాభం (₹)');
      return {
        columns: [colProduct, colUnits, colRev, colTax, colProfit],
        rows: list.map((r) => ({
          [colProduct]: r.name,
          [colUnits]: r.qty,
          [colRev]: Number(r.revenue.toFixed(2)),
          [colTax]: Number(r.tax.toFixed(2)),
          [colProfit]: Number((r.revenue - r.tax - r.cost).toFixed(2)),
        })),
        chartData: list.slice(0, 8).map((r) => ({ label: r.name.slice(0, 14), value: Math.round(r.revenue) })),
      };
    }

    if (reportType === 'customers') {
      const list = [...customers].sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0));
      const colCust = tr(language, 'Customer', 'కస్టమర్');
      const colMob = tr(language, 'Mobile', 'మొబైల్');
      const colBills = tr(language, 'Bills', 'బిల్లులు');
      const colTot = tr(language, 'Total Purchases (₹)', 'మొత్తం కొనుగోళ్లు (₹)');
      const colPend = tr(language, 'Pending Balance (₹)', 'బాకీ మొత్తం (₹)');
      return {
        columns: [colCust, colMob, colBills, colTot, colPend],
        rows: list.map((c) => {
          const name = translateCustomerName(c.name, language);
          return {
            [colCust]: name,
            [colMob]: c.mobile || '—',
            [colBills]: c.billCount || 0,
            [colTot]: Number((c.totalPurchases || 0).toFixed(2)),
            [colPend]: Number((c.outstandingBalance || 0).toFixed(2)),
          };
        }),
        chartData: list.slice(0, 8).map((c) => ({
          label: translateCustomerName(c.name, language).slice(0, 14),
          value: Math.round(c.totalPurchases || 0),
        })),
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
      const colMethod = tr(language, 'Payment Method', 'చెల్లింపు విధానం');
      const colTx = tr(language, 'Transactions', 'లావాదేవీలు');
      const colTot = tr(language, 'Total Collected (₹)', 'మొత్తం వసూలు (₹)');
      return {
        columns: [colMethod, colTx, colTot],
        rows: list.map((r) => ({
          [colMethod]: translatePaymentMethod(r.method, language),
          [colTx]: r.count,
          [colTot]: Number(r.total.toFixed(2)),
        })),
        chartData: list.map((r) => ({
          label: translatePaymentMethod(r.method, language),
          value: Math.round(r.total),
        })),
      };
    }

    if (reportType === 'gst') {
      const cBill = tr(language, 'Bill #', 'బిల్ #');
      const cDate = tr(language, 'Date', 'తేదీ');
      const cCust = tr(language, 'Customer', 'కస్టమర్');
      const cTaxable = tr(language, 'Taxable (₹)', 'పన్ను వర్తించేది (₹)');
      const cCgst = tr(language, 'CGST (₹)', 'సీజీఎస్టీ (₹)');
      const cSgst = tr(language, 'SGST (₹)', 'ఎస్‌జీఎస్టీ (₹)');
      const cIgst = tr(language, 'IGST (₹)', 'ఐజీఎస్టీ (₹)');
      const cTotTax = tr(language, 'Total Tax (₹)', 'మొత్తం పన్ను (₹)');
      const cGrand = tr(language, 'Grand Total (₹)', 'మొత్తం విలువ (₹)');
      return {
        columns: [cBill, cDate, cCust, cTaxable, cCgst, cSgst, cIgst, cTotTax, cGrand],
        rows: dateFilteredBills.map((b) => ({
          [cBill]: b.billNumber,
          [cDate]: formatAppDate(formatTimestamp(b.createdAt), language),
          [cCust]: translateCustomerName(b.customerName, language),
          [cTaxable]: b.taxableAmount,
          [cCgst]: b.cgstAmount || 0,
          [cSgst]: b.sgstAmount || 0,
          [cIgst]: b.igstAmount || 0,
          [cTotTax]: b.totalTax,
          [cGrand]: b.grandTotal,
        })),
        chartData: dateFilteredBills.slice(0, 10).map((b) => ({ label: b.billNumber, value: Math.round(b.totalTax) })),
      };
    }

    if (reportType === 'outstanding') {
      const open = activeBills.filter((b) => b.pendingBalance > 0);
      const cBill = tr(language, 'Bill #', 'బిల్ #');
      const cDate = tr(language, 'Date', 'తేదీ');
      const cCust = tr(language, 'Customer', 'కస్టమర్');
      const cMob = tr(language, 'Mobile', 'మొబైల్');
      const cGrand = tr(language, 'Grand Total (₹)', 'మొత్తం విలువ (₹)');
      const cPaid = tr(language, 'Paid (₹)', 'చెల్లించినది (₹)');
      const cPend = tr(language, 'Pending (₹)', 'బాకీ (₹)');
      return {
        columns: [cBill, cDate, cCust, cMob, cGrand, cPaid, cPend],
        rows: open.map((b) => ({
          [cBill]: b.billNumber,
          [cDate]: formatAppDate(formatTimestamp(b.createdAt), language),
          [cCust]: translateCustomerName(b.customerName, language),
          [cMob]: b.customerMobile || '—',
          [cGrand]: b.grandTotal,
          [cPaid]: b.amountPaid,
          [cPend]: b.pendingBalance,
        })),
        chartData: open.slice(0, 8).map((b) => ({
          label: translateCustomerName(b.customerName, language).slice(0, 12),
          value: Math.round(b.pendingBalance),
        })),
      };
    }

    if (reportType === 'inventory') {
      const cCode = tr(language, 'Code', 'కోడ్');
      const cProd = tr(language, 'Product', 'వస్తువు');
      const cCat = tr(language, 'Category', 'వర్గం');
      const cStock = tr(language, 'Stock', 'స్టాక్');
      const cCost = tr(language, 'Purchase Price (₹)', 'కొనుగోలు ధర (₹)');
      const cCostVal = tr(language, 'Cost Valuation (₹)', 'కొనుగోలు విలువ (₹)');
      const cRetVal = tr(language, 'Retail Valuation (₹)', 'అమ్మకపు విలువ (₹)');
      return {
        columns: [cCode, cProd, cCat, cStock, cCost, cCostVal, cRetVal],
        rows: products.map((p) => ({
          [cCode]: p.productCode,
          [cProd]: translateProductName(p, language),
          [cCat]: translateCategory(p.category, categories, language),
          [cStock]: p.stock,
          [cCost]: p.purchasePrice,
          [cCostVal]: Number((p.stock * p.purchasePrice).toFixed(2)),
          [cRetVal]: Number((p.stock * p.sellingPrice).toFixed(2)),
        })),
        chartData: products.slice(0, 8).map((p) => ({
          label: translateProductName(p, language).slice(0, 14),
          value: Math.round(p.stock * p.purchasePrice),
        })),
      };
    }

    const byDate = new Map<string, number>();
    for (const b of dateFilteredBills) {
      const d = formatAppDate(formatTimestamp(b.createdAt), language);
      byDate.set(d, (byDate.get(d) || 0) + b.grandTotal);
    }

    const cBill = tr(language, 'Bill #', 'బిల్ #');
    const cDate = tr(language, 'Date', 'తేదీ');
    const cCust = tr(language, 'Customer', 'కస్టమర్');
    const cSub = tr(language, 'Subtotal (₹)', 'ఉప మొత్తం (₹)');
    const cDisc = tr(language, 'Discount (₹)', 'తగ్గింపు (₹)');
    const cTax = tr(language, 'Tax (₹)', 'పన్ను (₹)');
    const cGrand = tr(language, 'Grand Total (₹)', 'మొత్తం విలువ (₹)');
    const cPaid = tr(language, 'Paid (₹)', 'చెల్లించినది (₹)');
    const cStat = tr(language, 'Status', 'స్థితి');

    return {
      columns: [cBill, cDate, cCust, cSub, cDisc, cTax, cGrand, cPaid, cStat],
      rows: dateFilteredBills.map((b) => ({
        [cBill]: b.billNumber,
        [cDate]: formatAppDate(formatTimestamp(b.createdAt), language),
        [cCust]: translateCustomerName(b.customerName, language),
        [cSub]: b.subtotal,
        [cDisc]: b.discountAmount,
        [cTax]: b.totalTax,
        [cGrand]: b.grandTotal,
        [cPaid]: b.amountPaid,
        [cStat]: language === 'te' ? translateStatus(b.paymentStatus, 'te') : b.paymentStatus.toUpperCase(),
      })),
      chartData: Array.from(byDate.entries())
        .slice(0, 14)
        .map(([label, value]) => ({ label, value: Math.round(value) })),
    };
  }, [reportType, dateFilteredBills, activeBills, billItems, products, customers, payments, categories, language]);

  const handleExportPdf = () => {
    const isLandscape = columns.length > 6;
    const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

    if (language === 'te') {
      // Paginated Canvas 2D table rendering so Telugu Unicode glyphs display cleanly in PDF
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const pxW = isLandscape ? 1400 : 1000;
      const rowH = 38;
      const headerH = 92;
      const rowsPerPage = 22;
      const chunks: Array<typeof rows> = [];
      for (let i = 0; i < Math.max(1, rows.length); i += rowsPerPage) {
        chunks.push(rows.slice(i, i + rowsPerPage));
      }

      chunks.forEach((chunk, pageIdx) => {
        if (pageIdx > 0) doc.addPage();
        const pxH = headerH + 44 + chunk.length * rowH + 24;
        const canvas = document.createElement('canvas');
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, pxW, pxH);

        ctx.fillStyle = '#0B1F44';
        ctx.fillRect(0, 0, pxW, 68);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`${translateBusinessName(business?.name, 'te')} — ${reportTypeLabel}`, 24, 42);

        const colW = (pxW - 40) / columns.length;
        ctx.fillStyle = '#F1F5F9';
        ctx.fillRect(20, 84, pxW - 40, 38);
        ctx.fillStyle = '#0B1F44';
        ctx.font = 'bold 13px sans-serif';
        columns.forEach((c, ci) => {
          ctx.fillText(c.slice(0, 18), 28 + ci * colW, 108);
        });

        ctx.font = '13px sans-serif';
        chunk.forEach((r, ri) => {
          const y = 122 + ri * rowH;
          if (ri % 2 === 1) {
            ctx.fillStyle = '#F8FAFC';
            ctx.fillRect(20, y, pxW - 40, rowH);
          }
          ctx.strokeStyle = '#E2E8F0';
          ctx.beginPath();
          ctx.moveTo(20, y + rowH);
          ctx.lineTo(pxW - 20, y + rowH);
          ctx.stroke();

          ctx.fillStyle = '#0F172A';
          columns.forEach((c, ci) => {
            const val = String((r as Record<string, unknown>)[c] ?? '');
            ctx.fillText(val.slice(0, 20), 28 + ci * colW, y + 24);
          });
        });

        const drawW = pageW - 16;
        const drawH = Math.min(pageH - 16, (drawW * pxH) / pxW);
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', 8, 8, drawW, drawH);
      });

      doc.save(`slp-report-${reportType}.pdf`);
      return;
    }

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
          summaryPayload: {
            reportType,
            summary,
            topProducts: rows.slice(0, 12),
            lowStockCount: products.filter((p) => p.stock <= (p.lowStockThreshold ?? 10)).length,
            language,
          },
          language,
          question:
            language === 'te'
              ? 'అమ్మకాల ధోరణులు, లాభ మార్జిన్లు, బాకీల రిస్క్ మరియు సిమెంట్ ఉత్పత్తుల స్టాక్ ప్రాధాన్యతలను పూర్తిగా తెలుగులో విశ్లేషించండి.'
              : 'Analyze sales trends, profit margins, receivable risks, and precast cement restocking priorities.',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          language === 'te'
            ? 'ఏఐ విశ్లేషణ ప్రస్తుతం అందుబాటులో లేదు. దయచేసి సెట్టింగ్స్‌లోని కీను తనిఖీ చేయండి.'
            : data.error || 'Deep AI insights unavailable.'
        );
      }
      setAiInsights(data.text || data.analysis || '');
    } catch (err) {
      setAiError(
        language === 'te'
          ? 'ఏఐ విశ్లేషణ ప్రస్తుతం అందుబాటులో లేదు.'
          : err instanceof Error
            ? err.message
            : 'Deep AI insights unavailable.'
      );
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
              {tr(language, 'Cloud Financial & Inventory Analytics', 'క్లౌడ్ ఆర్థిక & స్టాక్ విశ్లేషణలు')}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5" /> {tr(language, 'PDF', 'పీడీఎఫ్')}
            </button>
            <button
              onClick={() =>
                exportRowsToExcel(
                  rows as Record<string, unknown>[],
                  `slp-report-${reportType}`,
                  tr(language, 'Report', 'నివేదిక')
                )
              }
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> {tr(language, 'Excel', 'ఎక్సెల్')}
            </button>
            <button
              onClick={() => exportRowsToCsv(rows as Record<string, unknown>[], `slp-report-${reportType}`)}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> {tr(language, 'CSV', 'సీఎస్‌వీ')}
            </button>
            <button
              onClick={handleRunDeepInsights}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#06B6D4]/15 text-[#0284C7] dark:text-[#06B6D4] text-xs font-semibold hover:bg-[#06B6D4]/25"
            >
              <BrainCircuit className="w-3.5 h-3.5" />{' '}
              {aiLoading ? tr(language, 'Analyzing...', 'విశ్లేషిస్తోంది...') : tr(language, 'AI Analyst', 'ఏఐ విశ్లేషకుడు')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {reportTabs.map(([id, label]) => (
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
            <span className="text-slate-400">{tr(language, 'to', 'నుండి వరకు')}</span>
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
          <div className="text-[11px] text-slate-500">{tr(language, 'Gross Revenue', 'మొత్తం ఆదాయం')}</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {formatCurrency(summary.grossSales)}
          </div>
          <div className="text-[11px] text-slate-400">
            {language === 'te' ? `${summary.billCount} ఇన్వాయిస్‌లు` : `${summary.billCount} invoices`}
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500">{tr(language, 'Collected', 'వసూలైనది')}</div>
          <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            {formatCurrency(summary.collected)}
          </div>
          <div className="text-[11px] text-slate-400">
            {tr(language, 'Discounts:', 'తగ్గింపులు:')} {formatCurrency(summary.totalDiscount)}
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500">{tr(language, 'Pending Dues', 'రావాల్సిన బాకీలు')}</div>
          <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
            {formatCurrency(summary.pending)}
          </div>
          <div className="text-[11px] text-slate-400">{tr(language, 'Receivable balance', 'రావాల్సిన బ్యాలెన్స్')}</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500">{tr(language, 'GST Output Tax', 'జీఎస్టీ అవుట్‌పుట్ పన్ను')}</div>
          <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
            {formatCurrency(summary.totalTax)}
          </div>
          <div className="text-[11px] text-slate-400">{tr(language, 'CGST/SGST/IGST', 'సీజీఎస్టీ/ఎస్‌జీఎస్టీ/ఐజీఎస్టీ')}</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-[#06B6D4]" /> {tr(language, 'Est. Gross Profit', 'అంచనా స్థూల లాభం')}
          </div>
          <div className="text-base font-bold font-mono text-[#1D4ED8] dark:text-[#06B6D4] mt-0.5">
            {formatCurrency(summary.grossProfit)}
          </div>
          <div className="text-[11px] text-slate-400">
            {tr(language, 'COGS:', 'కొనుగోలు ఖర్చు:')} {formatCurrency(summary.estimatedCogs)}
          </div>
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
              <BrainCircuit className="w-4 h-4" />{' '}
              {tr(language, 'Financial & Inventory Insights', 'ఆర్థిక & స్టాక్ విశ్లేషణలు')}
            </h3>
            <button onClick={() => setAiInsights(null)} className="text-xs text-slate-400 hover:text-slate-600">
              {tr(language, 'Close', 'మూసివేయి')}
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
            {tr(language, 'Visual Breakdown', 'గ్రాఫ్ విశ్లేషణ')} ({reportTypeLabel})
          </h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [formatCurrency(Number(v || 0)), tr(language, 'Value', 'విలువ')]}
                />
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
                  {tr(language, 'No records match this report period.', 'ఈ వ్యవధికి సరిపోలే నమోదులు ఏవీ లేవు.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
