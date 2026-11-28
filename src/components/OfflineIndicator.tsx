import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, CloudOff, RefreshCw, X } from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { tr } from '../lib/i18n';

export const OfflineIndicator: React.FC = () => {
  const { cloudNotice, dismissCloudNotice, pendingSyncCount, syncState } = useBillingData();
  const { language } = useAuth();

  const notice =
    cloudNotice ||
    (syncState === 'offline'
      ? {
          id: 0,
          status: 'offline' as const,
          message:
            pendingSyncCount > 0
              ? tr(
                  language,
                  `Offline Mode · ${pendingSyncCount} pending cloud sync`,
                  `ఆఫ్‌లైన్ మోడ్ · ${pendingSyncCount} క్లౌడ్ సింక్ పెండింగ్‌లో ఉన్నాయి`
                )
              : tr(
                  language,
                  'Offline Mode · Saves locally & auto-syncs',
                  'ఆఫ్‌లైన్ మోడ్ · లోకల్‌గా సేవ్ అవుతుంది & ఆటోమేటిక్‌గా సింక్ అవుతుంది'
                ),
        }
      : null);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={`${notice.status}-${notice.id}`}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className={`fixed bottom-[74px] lg:bottom-4 left-3 z-40 max-w-[calc(100vw-24px)] sm:max-w-sm flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-lg ${
            notice.status === 'offline'
              ? 'bg-amber-600 shadow-amber-900/20'
              : notice.status === 'syncing'
              ? 'bg-[#0A2240] shadow-[#0A2240]/25'
              : 'bg-emerald-600 shadow-emerald-900/20'
          }`}
        >
          {notice.status === 'offline' && <CloudOff className="w-3.5 h-3.5 shrink-0" />}
          {notice.status === 'syncing' && <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />}
          {notice.status === 'synced' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}

          <span className="truncate">{notice.message}</span>

          {cloudNotice && (
            <button
              type="button"
              onClick={dismissCloudNotice}
              className="p-0.5 rounded-full hover:bg-white/20 shrink-0"
              aria-label={tr(language, 'Dismiss cloud status notification', 'నోటిఫికేషన్‌ను మూసివేయండి')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
