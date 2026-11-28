import React, { useState } from 'react';
import { ScanBarcode, ShieldCheck } from 'lucide-react';
import { ScannerPanel } from '../components/ScannerModal';
import { PostBillActionsModal } from '../components/InvoiceViews';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { Bill } from '../types/billing';
import { tr } from '../lib/i18n';

export const VerifyScannerPage: React.FC<{
  onQuickAddProduct?: (productId: string) => void;
}> = ({ onQuickAddProduct }) => {
  const { products, bills, billItems } = useBillingData();
  const { language, isAdmin } = useAuth();
  const [verifiedBill, setVerifiedBill] = useState<Bill | null>(null);

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-slp-in">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#F6F1EA] text-[#9A4307] flex items-center justify-center shrink-0">
          <ScanBarcode className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-bold text-[#0A2240] flex items-center gap-2">
            {isAdmin
              ? tr(language, 'Bill & Barcode Verification Scanner', 'బిల్ & బార్‌కోడ్ ధృవీకరణ స్కానర్')
              : tr(language, 'Bill Scanner', 'బిల్ స్కానర్')}
          </h2>
          {isAdmin && (
            <p className="text-xs text-[#6D665E] mt-0.5 leading-relaxed">
              {tr(
                language,
                'Scan a printed or WhatsApp bill Code 128 barcode, or type the unique verification code / bill number below to confirm bill authenticity, paid amount, and due balance.',
                'బిల్ అసలైనదా కాదా, చెల్లించిన మొత్తం మరియు బాకీ వివరాలను నిర్ధారించుకోవడానికి ప్రింటెడ్ లేదా వాట్సాప్ బిల్ కోడ్ 128 బార్‌కోడ్‌ను స్కాన్ చేయండి లేదా ధృవీకరణ కోడ్ / బిల్ నంబర్‌ను కింద నమోదు చేయండి.'
              )}
            </p>
          )}
        </div>
        {isAdmin && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E7F6EC] text-[#15803D] border border-[#C5E8D1] text-[11px] font-bold shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            {tr(language, 'Live Cloud Check', 'లైవ్ క్లౌడ్ తనిఖీ')}
          </span>
        )}
      </div>

      <ScannerPanel
        embedded
        active
        products={products}
        bills={bills}
        title={
          isAdmin
            ? tr(language, 'Verify Bill Barcode / Product Code', 'బిల్ బార్‌కోడ్ / ఉత్పత్తి కోడ్ తనిఖీ')
            : tr(language, 'Scan Any Business Bill', 'ఏ వ్యాపార బిల్ అయినా స్కాన్ చేయండి')
        }
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
