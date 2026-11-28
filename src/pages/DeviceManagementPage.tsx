import React from 'react';
import { Laptop, ShieldAlert, ShieldCheck, Smartphone, Tablet } from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import {
  formatAppDate,
  tr,
  translateBusinessName,
  translateDeviceName,
  translateStatus,
} from '../lib/i18n';

export const DeviceManagementPage: React.FC = () => {
  const { devices, setDeviceStatus, business } = useBillingData();
  const { currentDevice, isAdmin, language } = useAuth();

  const renderIcon = (type: string) => {
    if (type === 'mobile') return <Smartphone className="w-5 h-5 text-[#9A4307]" />;
    if (type === 'tablet') return <Tablet className="w-5 h-5 text-[#9A4307]" />;
    return <Laptop className="w-5 h-5 text-[#9A4307]" />;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#0A2240] dark:text-white">
            {tr(language, 'Connected Devices & Active Terminals', 'కనెక్ట్ అయిన పరికరాలు & టెర్మినల్స్')}
          </h2>
          <p className="text-xs text-[#6D665E] mt-0.5">
            {tr(
              language,
              'Every smartphone, tablet, and counter PC signed into Sri Lakshmi Penchil Narasimha Swamy Cement Work synchronizes in real time. Administrators can revoke any terminal immediately.',
              `${translateBusinessName(business?.name, 'te')} లో లాగిన్ అయిన ప్రతి ఫోన్, టాబ్లెట్ మరియు కౌంటర్ కంప్యూటర్ రియల్-టైమ్‌లో సింక్ అవుతాయి. అడ్మిన్ ఏ పరికరాన్నైనా వెంటనే రద్దు చేయవచ్చు.`
            )}
          </p>
        </div>
        <div className="text-xs font-mono text-[#6D665E]">
          {devices.filter((d) => d.status === 'authorized').length}{' '}
          {tr(language, 'authorized', 'అనుమతించబడినవి')} · {devices.length}{' '}
          {tr(language, 'total', 'మొత్తం')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((dev) => {
          const isCurrent = currentDevice?.id === dev.id;
          const isRevoked = dev.status === 'revoked';
          return (
            <div
              key={dev.id}
              className={`rounded-xl bg-white dark:bg-slate-900 border p-5 space-y-3 ${
                isRevoked
                  ? 'border-[#F5C6C0] dark:border-rose-900/50 opacity-75'
                  : isCurrent
                    ? 'border-[#0A2240]'
                    : 'border-[#E5DDD3] dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-[#F3EDE5] dark:bg-slate-800">
                    {renderIcon(dev.deviceType)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#0A2240] dark:text-white">
                      {translateDeviceName(dev.deviceName, language)}
                    </div>
                    <div className="text-[11px] text-[#6D665E]">
                      {dev.userName || dev.userEmail}{' '}
                      {isCurrent ? `· ${tr(language, 'This Device', 'ఈ పరికరం')}` : ''}
                    </div>
                  </div>
                </div>
                {isRevoked ? (
                  <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
              </div>

              <div className="text-[11px] text-[#6D665E] space-y-1 font-mono">
                <div>
                  {tr(language, 'Email:', 'ఇమెయిల్:')} {dev.userEmail}
                </div>
                <div>
                  {tr(language, 'Type:', 'రకం:')}{' '}
                  {translateStatus(dev.deviceType, language)} · {translateDeviceName(dev.browser, language)}
                </div>
                <div>
                  {tr(language, 'Last Active:', 'చివరి యాక్టివ్:')}{' '}
                  {formatAppDate(formatTimestamp(dev.lastActiveAt), language, true)}
                </div>
                <div>
                  {tr(language, 'Status:', 'స్థితి:')}{' '}
                  <strong className={isRevoked ? 'text-[#C23B2B]' : 'text-[#15803D]'}>
                    {language === 'te' ? translateStatus(dev.status, 'te') : dev.status.toUpperCase()}
                  </strong>
                </div>
              </div>

              {isAdmin && !isCurrent && (
                <div className="pt-2 border-t border-[#EFEAE2] dark:border-slate-800 flex justify-end">
                  {isRevoked ? (
                    <button
                      onClick={() => setDeviceStatus(dev.id, 'authorized')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                    >
                      {tr(language, 'Restore Access', 'అనుమతి పునరుద్ధరించు')}
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeviceStatus(dev.id, 'revoked')}
                      className="px-3 py-1.5 rounded-lg bg-[#C23B2B] text-white text-xs font-semibold hover:bg-[#A32E20]"
                    >
                      {tr(language, 'Revoke Terminal', 'పరికరం రద్దు చేయి')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
