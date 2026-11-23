import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  FileText,
  MessageSquare,
  Settings,
  UserPlus,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { NavPageId } from '../types/billing';
import { formatAppDate, tr, translateStatus, translateSystemText } from '../lib/i18n';

interface NotificationsPageProps {
  onNavigate: (page: NavPageId) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNavigate }) => {
  const { notifications, messageLogs, markNotificationRead, markAllNotificationsRead } = useBillingData();
  const { language } = useAuth();
  const [tab, setTab] = useState<'alerts' | 'messages'>('alerts');

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = async (id: string, type: string) => {
    await markNotificationRead(id);
    if (type === 'bill' || type === 'cancellation') onNavigate('bill-history');
    else if (type === 'payment' || type === 'refund') onNavigate('payments');
    else if (type === 'low_stock') onNavigate('inventory');
    else if (type === 'customer') onNavigate('customers');
    else if (type === 'settings') onNavigate('settings');
    else if (type === 'device') onNavigate('devices');
  };

  const renderIcon = (type: string) => {
    if (type === 'low_stock') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    if (type === 'payment' || type === 'refund') return <CreditCard className="w-4 h-4 text-emerald-600" />;
    if (type === 'customer') return <UserPlus className="w-4 h-4 text-[#1D4ED8]" />;
    if (type === 'settings') return <Settings className="w-4 h-4 text-slate-500" />;
    return <FileText className="w-4 h-4 text-[#1D4ED8]" />;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('alerts')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold ${
              tab === 'alerts'
                ? 'bg-[#0B1F44] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />{' '}
            {language === 'te' ? `వ్యాపార హెచ్చరికలు (${unreadCount} చదవనివి)` : `Business Alerts (${unreadCount} unread)`}
          </button>
          <button
            onClick={() => setTab('messages')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold ${
              tab === 'messages'
                ? 'bg-[#0B1F44] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />{' '}
            {language === 'te' ? `వాట్సాప్ & ఎస్‌ఎంఎస్ లాగ్స్ (${messageLogs.length})` : `WhatsApp & SMS Logs (${messageLogs.length})`}
          </button>
        </div>

        {tab === 'alerts' && unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> {tr(language, 'Mark All Read', 'అన్నీ చదివినట్లు గుర్తుపెట్టు')}
          </button>
        )}
      </div>

      {tab === 'alerts' ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleNotificationClick(n.id, n.type)}
              className={`w-full text-left p-4 flex items-start justify-between gap-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                !n.isRead ? 'bg-[#1D4ED8]/5' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 mt-0.5">{renderIcon(n.type)}</div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    {translateSystemText(n.title, language)}
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#1D4ED8]" />}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {translateSystemText(n.message, language)}
                  </p>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {formatAppDate(formatTimestamp(n.createdAt), language, true)}
                    {n.creatorName ? ` · ${n.creatorName}` : ''}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-[#1D4ED8] font-medium shrink-0">
                {tr(language, 'Open →', 'తెరువు →')}
              </span>
            </button>
          ))}
          {notifications.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-400">
              {tr(
                language,
                'No business notifications yet. Bills, payments, and low-stock events appear here in real time.',
                'ఇంకా వ్యాపార హెచ్చరికలు ఏవీ లేవు. బిల్లులు, చెల్లింపులు మరియు తక్కువ స్టాక్ వివరాలు ఇక్కడ కనిపిస్తాయి.'
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Timestamp', 'సమయం')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Channel', 'మాధ్యమం')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Bill #', 'బిల్ #')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Recipient', 'స్వీకర్త')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Status', 'స్థితి')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Details / Message', 'వివరాలు / సందేశం')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {messageLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {formatAppDate(formatTimestamp(log.createdAt), language, true)}
                  </td>
                  <td className="py-3 px-4 uppercase font-semibold">{translateStatus(log.channel, language)}</td>
                  <td className="py-3 px-4 font-mono text-[#1D4ED8]">{log.billNumber}</td>
                  <td className="py-3 px-4 font-mono">{log.recipientMobile}</td>
                  <td className="py-3 px-4 font-semibold uppercase text-[11px]">
                    <span
                      className={
                        log.status === 'sent'
                          ? 'text-emerald-600'
                          : log.status === 'failed'
                            ? 'text-rose-600'
                            : 'text-amber-600'
                      }
                    >
                      {language === 'te' ? translateStatus(log.status, 'te') : log.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-md truncate">
                    {log.errorMessage
                      ? translateSystemText(log.errorMessage, language)
                      : log.messageBody
                        ? translateSystemText(log.messageBody, language)
                        : log.providerMessageId || '—'}
                  </td>
                </tr>
              ))}
              {messageLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    {tr(language, 'No WhatsApp or SMS dispatch logs recorded yet.', 'ఇంకా వాట్సాప్ లేదా ఎస్‌ఎంఎస్ లాగ్స్ ఏవీ నమోదు కాలేదు.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
