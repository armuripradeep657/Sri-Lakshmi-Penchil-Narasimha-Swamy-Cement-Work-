import React, { useState } from 'react';
import { CheckCircle2, Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAuth } from '../context/AuthContext';
import { tr } from '../lib/i18n';

interface PWAInstallButtonProps {
  variant?: 'header' | 'light-header' | 'drawer' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isInIframe, install } = usePWAInstall();
  const { language } = useAuth();
  const [installing, setInstalling] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  const handleDirectInstall = async () => {
    setInstalling(true);
    setStatusLabel(null);
    try {
      const result = await install();
      if (result === 'installed') {
        setStatusLabel(tr(language, 'Installed', 'ఇన్‌స్టాల్ అయింది'));
      } else if (result === 'unavailable') {
        setStatusLabel(tr(language, 'Use Chrome / Safari', 'క్రోమ్ / సఫారీ వాడండి'));
        window.setTimeout(() => setStatusLabel(null), 2600);
      }
    } finally {
      setInstalling(false);
    }
  };

  if (isInstalled) {
    if (variant !== 'card') return null;
    return (
      <div className="rounded-2xl bg-white border border-blue-100 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0B1F44]">
              {tr(
                language,
                'Sri Lakshmi Penchil Narasimha Swamy Cement Work App Active',
                'శ్రీ లక్ష్మి పెంచిల్ నరసింహ స్వామి సిమెంట్ వర్క్స్ యాప్ సక్రియంగా ఉంది'
              )}
            </h3>
            <p className="text-xs text-slate-500">
              {tr(
                language,
                'Installed on this device in standalone full-screen mode with offline sync enabled.',
                'ఆఫ్‌లైన్ సింక్‌తో ఫుల్-స్క్రీన్ మోడ్‌లో ఈ పరికరంలో ఇన్‌స్టాల్ చేయబడింది.'
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const openStandaloneFallback = !isInstallable && isInIframe;

  const buttonLabel =
    statusLabel ||
    (installing ? tr(language, 'Installing...', 'ఇన్‌స్టాల్ అవుతోంది...') : tr(language, 'Install App', 'యాప్ ఇన్‌స్టాల్ చేయండి'));

  if (variant === 'card') {
    return (
      <div className="rounded-2xl bg-gradient-to-r from-[#0B1F44] to-[#1D4ED8] text-white p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{tr(language, 'Install Mobile App', 'మొబైల్ యాప్ ఇన్‌స్టాల్ చేయండి')}</h3>
            <p className="text-xs text-blue-100">
              {tr(
                language,
                'Download Sri Lakshmi Penchil Narasimha Swamy Cement Work directly to your phone with offline sync.',
                'ఆఫ్‌లైన్ సింక్‌తో మీ ఫోన్‌లో నేరుగా శ్రీ లక్ష్మి పెంచిల్ నరసింహ స్వామి సిమెంట్ వర్క్స్‌ను డౌన్‌లోడ్ చేసుకోండి.'
              )}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {openStandaloneFallback ? (
            <a
              href={window.location.origin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-[#0B1F44] hover:bg-blue-50 px-4 py-2 text-xs font-bold shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
              {tr(language, 'Install App', 'యాప్ ఇన్‌స్టాల్ చేయండి')}
            </a>
          ) : (
            <button
              type="button"
              onClick={handleDirectInstall}
              disabled={installing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-[#0B1F44] hover:bg-blue-50 px-4 py-2 text-xs font-bold shadow-sm transition disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
              {buttonLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'drawer') {
    if (openStandaloneFallback) {
      return (
        <a
          href={window.location.origin}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white text-[#0B1F44] hover:bg-blue-50 text-xs font-bold shadow-sm transition"
        >
          <Download className="w-4 h-4 text-[#1D4ED8]" />
          {tr(language, 'Install App', 'యాప్ ఇన్‌స్టాల్ చేయండి')}
        </a>
      );
    }

    return (
      <button
        type="button"
        onClick={handleDirectInstall}
        disabled={installing}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white text-[#0B1F44] hover:bg-blue-50 text-xs font-bold shadow-sm transition disabled:opacity-60"
      >
        <Download className="w-4 h-4 text-[#1D4ED8]" />
        {buttonLabel}
      </button>
    );
  }

  if (openStandaloneFallback) {
    return (
      <a
        href={window.location.origin}
        target="_blank"
        rel="noopener noreferrer"
        title={tr(language, 'Install Mobile App', 'మొబైల్ యాప్ ఇన్‌స్టాల్ చేయండి')}
        aria-label={tr(language, 'Install Mobile App', 'మొబైల్ యాప్ ఇన్‌స్టాల్ చేయండి')}
        className={
          variant === 'light-header'
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 shadow-sm'
            : 'inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-3 rounded-xl border border-white/25 lg:border-[#1D4ED8] bg-white/15 lg:bg-[#1D4ED8] text-white text-[11px] sm:text-xs font-semibold hover:bg-white/25 lg:hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0'
        }
      >
        <Download
          className={
            variant === 'light-header'
              ? 'w-3.5 h-3.5 text-white'
              : 'w-3.5 h-3.5 text-cyan-300 lg:text-white'
          }
        />
        <span>{tr(language, 'Install App', 'యాప్ ఇన్‌స్టాల్')}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDirectInstall}
      disabled={installing}
      title={tr(language, 'Install Mobile App', 'మొబైల్ యాప్ ఇన్‌స్టాల్ చేయండి')}
      aria-label={tr(language, 'Install Mobile App', 'మొబైల్ యాప్ ఇన్‌స్టాల్ చేయండి')}
      className={
        variant === 'light-header'
          ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 shadow-sm disabled:opacity-60'
          : 'inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-3 rounded-xl border border-white/25 lg:border-[#1D4ED8] bg-white/15 lg:bg-[#1D4ED8] text-white text-[11px] sm:text-xs font-semibold hover:bg-white/25 lg:hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60'
      }
    >
      <Download
        className={
          variant === 'light-header'
            ? 'w-3.5 h-3.5 text-white'
            : 'w-3.5 h-3.5 text-cyan-300 lg:text-white'
        }
      />
      <span>{buttonLabel}</span>
    </button>
  );
};
