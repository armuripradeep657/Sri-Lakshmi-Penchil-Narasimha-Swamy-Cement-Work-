import React from 'react';
import { Laptop, ShieldAlert, ShieldCheck, Smartphone, Tablet } from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';

export const DeviceManagementPage: React.FC = () => {
  const { devices, setDeviceStatus } = useBillingData();
  const { currentDevice, isAdmin } = useAuth();

  const renderIcon = (type: string) => {
    if (type === 'mobile') return <Smartphone className="w-5 h-5 text-[#1D4ED8]" />;
    if (type === 'tablet') return <Tablet className="w-5 h-5 text-[#1D4ED8]" />;
    return <Laptop className="w-5 h-5 text-[#1D4ED8]" />;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Connected Devices & Active Terminals
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every smartphone, tablet, and counter PC signed into Sri Lakshmi Penchil Narasimha Swamy Cement Work synchronizes in real time. Administrators can revoke any terminal immediately.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">
          {devices.filter((d) => d.status === 'authorized').length} authorized · {devices.length} total
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
                  ? 'border-rose-200 dark:border-rose-900/50 opacity-75'
                  : isCurrent
                    ? 'border-[#1D4ED8]'
                    : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                    {renderIcon(dev.deviceType)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {dev.deviceName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {dev.userName || dev.userEmail} {isCurrent ? '· This Device' : ''}
                    </div>
                  </div>
                </div>
                {isRevoked ? (
                  <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
              </div>

              <div className="text-[11px] text-slate-500 space-y-1 font-mono">
                <div>Email: {dev.userEmail}</div>
                <div>Type: {dev.deviceType.toUpperCase()} · {dev.browser}</div>
                <div>Last Active: {formatTimestamp(dev.lastActiveAt).toLocaleString('en-IN')}</div>
                <div>
                  Status:{' '}
                  <strong className={isRevoked ? 'text-rose-600' : 'text-emerald-600'}>
                    {dev.status.toUpperCase()}
                  </strong>
                </div>
              </div>

              {isAdmin && !isCurrent && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  {isRevoked ? (
                    <button
                      onClick={() => setDeviceStatus(dev.id, 'authorized')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                    >
                      Restore Access
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeviceStatus(dev.id, 'revoked')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                    >
                      Revoke Terminal
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
