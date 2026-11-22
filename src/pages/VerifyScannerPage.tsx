import React, { useState } from 'react';
import { ScanBarcode, ShieldCheck } from 'lucide-react';
import { ScannerPanel } from '../components/ScannerModal';
import { PostBillActionsModal } from '../components/InvoiceViews';
import { useBillingData } from '../context/BillingDataContext';
import { Bill } from '../types/billing';

export const VerifyScannerPage: React.FC<{
  onQuickAddProduct?: (productId: string) => void;
}> = ({ onQuickAddProduct }) => {
  const { products, bills, billItems } = useBillingData();
  const [verifiedBill, setVerifiedBill] = useState<Bill | null>(null);

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-slp-in">
      <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center shrink-0">
          <ScanBarcode className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-bold text-[#0B1F44] flex items-center gap-2">
            Bill &amp; Barcode Verification Scanner
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Scan a printed or WhatsApp bill Code 128 barcode, or type the unique verification code / bill number below to confirm bill authenticity, paid amount, and due balance.
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shrink-0">
          <ShieldCheck className="w-3.5 h-3.5" />
          Live Cloud Check
        </span>
      </div>

      <ScannerPanel
        embedded
        active
        products={products}
        bills={bills}
        title="Verify Bill Barcode / Product Code"
        onBillFound={(b) => setVerifiedBill(b)}
        onProductFound={(p) => {
          onQuickAddProduct?.(p.id);
        }}
      />

      <PostBillActionsModal
        bill={verifiedBill}
        items={verifiedBill ? billItems.filter((bi) => bi.billId === verifiedBill.id) : []}
        onClose={() => setVerifiedBill(null)}
      />
    </div>
  );
};
