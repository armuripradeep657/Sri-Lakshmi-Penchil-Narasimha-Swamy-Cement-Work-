import React, { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck, X } from 'lucide-react';
import { Language } from '../types/billing';
import { tr, translateBusinessName } from '../lib/i18n';
import { ModalPortal } from './ModalPortal';

export type LegalDocType = 'privacy' | 'license';

interface LegalDocumentModalProps {
  docType: LegalDocType | null;
  onClose: () => void;
  language: Language;
  businessName?: string;
}

export const LegalDocumentModal: React.FC<LegalDocumentModalProps> = ({
  docType,
  onClose,
  language,
  businessName,
}) => {
  useEffect(() => {
    if (!docType) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [docType, onClose]);

  if (!docType) return null;

  const bizTitle = translateBusinessName(businessName, language);
  const isPrivacy = docType === 'privacy';

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-[#0A2240]/55 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            isPrivacy
              ? tr(language, 'Privacy Policy', 'గోప్యతా విధానం')
              : tr(language, 'Software License', 'సాఫ్ట్‌వేర్ లైసెన్స్')
          }
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl my-4 bg-white border border-[#E5DDD3] rounded-2xl shadow-2xl overflow-hidden text-left"
        >
          <div className="bg-[#0A2240] text-white px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {isPrivacy ? (
                <ShieldCheck className="w-5 h-5 text-amber-300 shrink-0" />
              ) : (
                <FileCheck2 className="w-5 h-5 text-amber-300 shrink-0" />
              )}
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold truncate">
                  {isPrivacy
                    ? tr(language, 'Privacy Policy', 'గోప్యతా విధానం')
                    : tr(language, 'License & Usage Terms', 'లైసెన్స్ & వినియోగ నిబంధనలు')}
                </h2>
                <p className="text-[11px] text-slate-300 truncate">{bizTitle} · SLP Billing</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr(language, 'Close', 'మూసివేయి')}
              className="p-1.5 rounded-lg text-slate-200 hover:bg-white/10 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 max-h-[72vh] overflow-y-auto space-y-4 text-xs sm:text-sm text-[#2D3138] leading-relaxed bg-[#FAF8F5]">
            {isPrivacy ? (
              <>
                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '1. Business & Customer Data', '1. వ్యాపార & కస్టమర్ వివరాలు')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      'SLP Billing stores business profiles, product catalog prices, customer names, mobile numbers, bills, payment records, and shop cashbook entries securely in Google Cloud Firestore solely for authorized multi-device business operations and accounting.',
                      'SLP బిల్లింగ్ వ్యాపార వివరాలు, ఉత్పత్తుల ధరలు, కస్టమర్ పేర్లు, మొబైల్ నంబర్లు, బిల్లులు, చెల్లింపులు మరియు ఖాతా పుస్తక వివరాలను కేవలం మీ వ్యాపార నిర్వహణ కోసం మాత్రమే గూగుల్ క్లౌడ్ ఫైర్‌స్టోర్‌లో సురక్షితంగా భద్రపరుస్తుంది.'
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '2. Camera & Scanner Permissions', '2. కెమెరా & స్కానర్ అనుమతులు')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      'Device camera access is activated only when you open the Verify Barcode Scanner, Paper List Camera Reader, or Product Photo Capture. Video feeds are never recorded or stored in the background.',
                      'వెరిఫై బార్‌కోడ్ స్కానర్, పేపర్ లిస్ట్ కెమెరా రీడర్ లేదా ఉత్పత్తి ఫోటో క్యాప్చర్ తెరిచినప్పుడు మాత్రమే కెమెరా ఉపయోగించబడుతుంది. నేపథ్యంలో ఎలాంటి వీడియో రికార్డ్ చేయబడదు.'
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '3. WhatsApp Sharing & Public Bill Links', '3. వాట్సాప్ షేరింగ్ & పబ్లిక్ బిల్ లింక్‌లు')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      'Customer bill links and WhatsApp messages are opened only when triggered by staff or the shop owner. Shared invoice links mask sensitive internal cost data and can be revoked anytime from Bill History.',
                      'సిబ్బంది లేదా యజమాని ఎంచుకున్నప్పుడు మాత్రమే కస్టమర్ బిల్ లింక్‌లు మరియు వాట్సాప్ సందేశాలు తెరుచుకుంటాయి. షేర్ చేసిన బిల్ లింక్‌లను ఎప్పుడైనా రద్దు చేయవచ్చు.'
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '4. Authentication & Offline Storage', '4. భద్రత & ఆఫ్‌లైన్ నిల్వ')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      'Passwords are never stored in plain text. Browser offline storage caches only authorized app assets and pending sync operations locally on trusted devices until cloud synchronization completes.',
                      'పాస్‌వర్డ్‌లు సాధారణ టెక్స్ట్‌గా ఎప్పుడూ సేవ్ చేయబడవు. ఆఫ్‌లైన్ నిల్వ కేవలం యాప్ ఫైళ్లు మరియు పెండింగ్ సింక్ వివరాలను మాత్రమే తాత్కాలికంగా ఉంచుతుంది.'
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '1. Commercial Business Grant', '1. వాణిజ్య వినియోగ లైసెన్స్')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      `SLP Billing is licensed to ${bizTitle} for commercial point-of-sale billing, inventory tracking, customer ledger management, thermal receipt printing, and cloud synchronization across authorized store devices.`,
                      `${bizTitle} వ్యాపార బిల్లింగ్, స్టాక్ నిర్వహణ, కస్టమర్ ఖాతాలు, థర్మల్ రసీదు ప్రింటింగ్ మరియు ఆమోదిత పరికరాల్లో క్లౌడ్ సింక్ కోసం SLP బిల్లింగ్ లైసెన్స్ ఇవ్వబడింది.`
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '2. Role Controls & Audit Trail', '2. వినియోగదారు నియంత్రణ & ఆడిట్ చరిత్ర')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      'Administrators manage staff accounts, permissions, and active devices. All bill edits, cancellations, and deletions are logged for accountability and cannot be bypassed by unauthorized sessions.',
                      'అడ్మిన్లు సిబ్బంది ఖాతాలు, అనుమతులు మరియు పరికరాలను నియంత్రిస్తారు. బిల్ సవరణలు, రద్దులు మరియు తొలగింపులన్నీ ఆడిట్ చరిత్రలో నమోదవుతాయి.'
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '3. Open-Source Libraries & Attribution', '3. ఓపెన్-సోర్స్ లైబ్రరీలు')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      'This application incorporates standard open-source packages (React, Vite, Tailwind CSS, Motion, Lucide, jsPDF, QRCode, ZXing, jsQR, and Excel/CSV export utilities) used in accordance with their MIT / Apache-2.0 licenses.',
                      'ఈ యాప్ MIT / Apache-2.0 లైసెన్స్‌ల ప్రకారం React, Vite, Tailwind CSS, Motion, Lucide, jsPDF, QRCode, ZXing, jsQR వంటి ప్రామాణిక ఓపెన్-సోర్స్ లైబ్రరీలను ఉపయోగిస్తుంది.'
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                  <h3 className="font-bold text-[#0A2240]">
                    {tr(language, '4. Backup & Operational Responsibility', '4. బ్యాకప్ & నిర్వహణ బాధ్యత')}
                  </h3>
                  <p className="text-xs text-[#6D665E]">
                    {tr(
                      language,
                      'Business owners are encouraged to export periodic JSON/CSV backups from Business Settings and keep active admin credentials private.',
                      'వ్యాపార యజమానులు బిజినెస్ సెట్టింగ్స్ నుండి క్రమం తప్పకుండా బ్యాకప్ తీసుకోవాలని మరియు అడ్మిన్ లాగిన్ వివరాలను గోప్యంగా ఉంచాలని సూచించబడుతోంది.'
                    )}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="px-5 py-3 bg-white border-t border-[#E5DDD3] flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[#8A8279] font-mono">SLP Billing · v1.0</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-semibold transition"
            >
              {tr(language, 'Close', 'మూసివేయి')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export const LegalFooterLinks: React.FC<{
  language: Language;
  businessName?: string;
  className?: string;
}> = ({ language, businessName, className = '' }) => {
  const [activeDoc, setActiveDoc] = useState<LegalDocType | null>(null);

  return (
    <>
      <span className={`inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 ${className}`}>
        <button
          type="button"
          onClick={() => setActiveDoc('privacy')}
          className="text-[#6D665E] hover:text-[#0A2240] dark:text-slate-400 dark:hover:text-white underline decoration-[#D5CBBE] underline-offset-2 transition-colors"
        >
          {tr(language, 'Privacy Policy', 'గోప్యతా విధానం')}
        </button>
        <span aria-hidden="true" className="text-[#B8AEA2]">
          ·
        </span>
        <button
          type="button"
          onClick={() => setActiveDoc('license')}
          className="text-[#6D665E] hover:text-[#0A2240] dark:text-slate-400 dark:hover:text-white underline decoration-[#D5CBBE] underline-offset-2 transition-colors"
        >
          {tr(language, 'License', 'లైసెన్స్')}
        </button>
      </span>
      <LegalDocumentModal
        docType={activeDoc}
        onClose={() => setActiveDoc(null)}
        language={language}
        businessName={businessName}
      />
    </>
  );
};
