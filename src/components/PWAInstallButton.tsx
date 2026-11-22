import React, { useState } from 'react';
import { CheckCircle2, Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'light-header' | 'drawer' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isInIframe, install } = usePWAInstall();
  const [installing, setInstalling] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  const handleDirectInstall = async () => {
    setInstalling(true);
    setStatusLabel(null);
    try {
      const result = await install();
      if (result === 'installed') {
        setStatusLabel('Installed');
      } else if (result === 'unavailable') {
        setStatusLabel('Use Chrome / Safari');
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
              Sri Lakshmi Penchil Narasimha Swamy Cement Work App Active
            </h3>
            <p className="text-xs text-slate-500">
              Installed on this device in standalone full-screen mode with offline sync enabled.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If previewed inside an embedded iframe where browser suppresses beforeinstallprompt,
  // direct click opens the standalone URL in the main browser so one-tap install triggers immediately.
  const openStandaloneFallback = !isInstallable && isInIframe;

  const buttonLabel = statusLabel || (installing ? 'Installing...' : 'Install App');

  if (variant === 'card') {
    return (
      <div className="rounded-2xl bg-gradient-to-r from-[#0B1F44] to-[#1D4ED8] text-white p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">Install Mobile App</h3>
            <p className="text-xs text-blue-100">
              Download Sri Lakshmi Penchil Narasimha Swamy Cement Work directly to your phone with offline sync.
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
              Install App
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
          Install App
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
        title="Install Mobile App"
        aria-label="Install Mobile App"
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
        <span>Install App</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDirectInstall}
      disabled={installing}
      title="Install Mobile App"
      aria-label="Install Mobile App"
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
