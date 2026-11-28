import React, { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, MoreVertical, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAuth } from '../context/AuthContext';
import { tr } from '../lib/i18n';
import { ModalPortal } from './ModalPortal';

interface PWAInstallButtonProps {
  variant?: 'header' | 'light-header' | 'drawer' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } = usePWAInstall();
  const { language } = useAuth();
  const [installing, setInstalling] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const handleDirectInstall = async () => {
    setInstalling(true);
    setStatusLabel(null);
    try {
      const result = await install();
      if (result === 'installed') {
        setStatusLabel(tr(language, 'Installed', 'ఇన్‌స్టాల్ అయింది'));
      } else if (result === 'manual') {
        setGuideOpen(true);
      }
    } finally {
      setInstalling(false);
    }
  };

  if (isInstalled) {
    if (variant !== 'card') return null;
    return (
      <div className="rounded-2xl bg-white border border-[#E5DDD3] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E7F6EC] text-[#15803D] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0A2240]">
              {tr(
                language,
                'SLP Billing Standalone App Active',
                'SLP బిల్లింగ్ స్వతంత్ర యాప్ సక్రియంగా ఉంది'
              )}
            </h3>
            <p className="text-xs text-[#6D665E]">
              {tr(
                language,
                'Running as a separate standalone app on this device without the Chrome browser bar.',
                'క్రోమ్ బ్రౌజర్ బార్ లేకుండా ఈ పరికరంలో ప్రత్యేక స్వతంత్ర యాప్‌గా నడుస్తోంది.'
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const buttonLabel =
    statusLabel ||
    (installing
      ? tr(language, 'Installing...', 'ఇన్‌స్టాల్ అవుతోంది...')
      : tr(language, 'Install App', 'యాప్ ఇన్‌స్టాల్'));

  const guideModal = guideOpen ? (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-[#0A2240]/55 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
        onClick={() => setGuideOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tr(language, 'Install as Standalone App', 'ప్రత్యేక యాప్‌గా ఇన్‌స్టాల్ చేయండి')}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md my-4 bg-white border border-[#E5DDD3] rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="bg-[#0A2240] text-white px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Smartphone className="w-5 h-5 text-amber-300 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold truncate">
                  {tr(language, 'Install as Standalone App', 'ప్రత్యేక యాప్‌గా ఇన్‌స్టాల్ చేయండి')}
                </h2>
                <p className="text-[11px] text-slate-300 truncate">
                  {tr(language, 'Opens like a real app without Chrome', 'క్రోమ్ లేకుండా నేరుగా ప్రత్యేక యాప్‌లా తెరుచుకుంటుంది')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              aria-label={tr(language, 'Close', 'మూసివేయి')}
              className="p-1.5 rounded-lg text-slate-200 hover:bg-white/10 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 bg-[#FAF8F5] text-xs text-[#2D3138] leading-relaxed">
            {isInIframe && (
              <div className="rounded-xl bg-[#FDF3DF] border border-[#F0D9B5] p-3.5 space-y-2.5">
                <div className="font-bold text-[#7C3405]">
                  {tr(
                    language,
                    'Step 1: Open Dedicated App Window First',
                    'దశ 1: ముందుగా ప్రత్యేక యాప్ విండోను తెరవండి'
                  )}
                </div>
                <p className="text-[#9A4307]">
                  {tr(
                    language,
                    'You are viewing inside a preview frame. Open the standalone app link first, then tap Install so it opens outside Chrome.',
                    'మీరు ప్రస్తుతం ప్రివ్యూ ఫ్రేమ్‌లో చూస్తున్నారు. క్రోమ్ వెలుపల ప్రత్యేక యాప్‌గా ఇన్‌స్టాల్ చేయడానికి ముందుగా కింది యాప్ లింక్‌ను తెరవండి.'
                  )}
                </p>
                <a
                  href={window.location.origin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white font-semibold transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  {tr(language, 'Open App Link to Install', 'ఇన్‌స్టాల్ కోసం యాప్ లింక్ తెరవండి')}
                </a>
              </div>
            )}

            {isIOS ? (
              <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                <div className="font-bold text-[#0A2240] flex items-center gap-2">
                  <Share className="w-4 h-4 text-[#9A4307]" />
                  {tr(language, 'iPhone / iPad (Safari)', 'ఐఫోన్ / ఐప్యాడ్ (సఫారీ)')}
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[#6D665E]">
                  <li>{tr(language, 'Open this page in Safari', 'ఈ పేజీని సఫారీ బ్రౌజర్‌లో తెరవండి')}</li>
                  <li>{tr(language, 'Tap the Share button at the bottom', 'కింద ఉన్న షేర్ (Share) బటన్ నొక్కండి')}</li>
                  <li>
                    {tr(
                      language,
                      'Tap "Add to Home Screen" → "Add" to launch without browser bars',
                      '"Add to Home Screen" → "Add" నొక్కితే ప్రత్యేక యాప్‌లా తెరుచుకుంటుంది'
                    )}
                  </li>
                </ol>
              </div>
            ) : (
              <div className="rounded-xl bg-white border border-[#E5DDD3] p-4 space-y-2">
                <div className="font-bold text-[#0A2240] flex items-center gap-2">
                  <MoreVertical className="w-4 h-4 text-[#9A4307]" />
                  {isAndroid
                    ? tr(language, 'Android Chrome Standalone Install', 'ఆండ్రాయిడ్ క్రోమ్ ప్రత్యేక యాప్ ఇన్‌స్టాల్')
                    : tr(language, 'Chrome / Edge Standalone Install', 'క్రోమ్ / ఎడ్జ్ ప్రత్యేక యాప్ ఇన్‌స్టాల్')}
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-[#6D665E]">
                  <li>
                    {tr(
                      language,
                      'Tap Chrome menu (⋮) in the top-right corner (or the Install icon in the address bar on desktop).',
                      'పై కుడి మూలలో ఉన్న క్రోమ్ మెనూ (⋮) నొక్కండి (డెస్క్‌టాప్‌లో అడ్రస్ బార్‌లోని ఇన్‌స్టాల్ ఐకాన్ నొక్కండి).'
                    )}
                  </li>
                  <li>
                    {tr(
                      language,
                      'Choose "Add to home screen" → "Install" (or "Install app").',
                      '"Add to home screen" → "Install" (లేదా "Install app") ఎంచుకోండి.'
                    )}
                  </li>
                  <li className="text-[#9A4307] font-semibold">
                    {tr(
                      language,
                      'Tip: Select "Install", NOT "Create shortcut" — installing creates a separate app without Chrome.',
                      'సూచన: "Create shortcut" కాకుండా "Install" ఎంచుకుంటే క్రోమ్ లేకుండా ప్రత్యేక యాప్‌లా తెరుచుకుంటుంది.'
                    )}
                  </li>
                </ol>
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-white border-t border-[#E5DDD3] flex justify-end">
            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="px-4 py-1.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-semibold transition"
            >
              {tr(language, 'Got It', 'సరే')}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  ) : null;

  if (variant === 'card') {
    return (
      <>
        <div className="rounded-2xl bg-[#0A2240] text-white p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold">{tr(language, 'Install Standalone App', 'ప్రత్యేక యాప్ ఇన్‌స్టాల్ చేయండి')}</h3>
              <p className="text-xs text-[#E5DDD3]">
                {tr(
                  language,
                  'Install SLP Billing on your home screen as a separate standalone app with offline sync.',
                  'ఆఫ్‌లైన్ సింక్‌తో క్రోమ్ లేకుండా ప్రత్యేక యాప్‌గా మీ ఫోన్‌లో ఇన్‌స్టాల్ చేసుకోండి.'
                )}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleDirectInstall}
              disabled={installing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-[#0A2240] hover:bg-[#F6F1EA] px-4 py-2 text-xs font-bold shadow-sm transition disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5 text-[#9A4307]" />
              {isInstallable
                ? buttonLabel
                : isInIframe
                ? tr(language, 'Open & Install App', 'యాప్ తెరిచి ఇన్‌స్టాల్ చేయండి')
                : buttonLabel}
            </button>
          </div>
        </div>
        {guideModal}
      </>
    );
  }

  if (variant === 'drawer') {
    return (
      <>
        <button
          type="button"
          onClick={handleDirectInstall}
          disabled={installing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white text-[#0A2240] hover:bg-[#F6F1EA] text-xs font-bold shadow-sm transition disabled:opacity-60"
        >
          <Download className="w-4 h-4 text-[#9A4307]" />
          {buttonLabel}
        </button>
        {guideModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDirectInstall}
        disabled={installing}
        title={tr(language, 'Install Standalone App', 'ప్రత్యేక యాప్ ఇన్‌స్టాల్ చేయండి')}
        aria-label={tr(language, 'Install Standalone App', 'ప్రత్యేక యాప్ ఇన్‌స్టాల్ చేయండి')}
        className={
          variant === 'light-header'
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B] transition-colors whitespace-nowrap shrink-0 shadow-sm disabled:opacity-60'
            : 'inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-3 rounded-xl border border-white/25 lg:border-[#0A2240] bg-white/15 lg:bg-[#0A2240] text-white text-[11px] sm:text-xs font-semibold hover:bg-white/25 lg:hover:bg-[#13325B] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60'
        }
      >
        <Download
          className={
            variant === 'light-header'
              ? 'w-3.5 h-3.5 text-white'
              : 'w-3.5 h-3.5 text-amber-300 lg:text-white'
          }
        />
        <span>{buttonLabel}</span>
      </button>
      {guideModal}
    </>
  );
};
