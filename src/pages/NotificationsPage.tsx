import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  MessageSquare,
  Pencil,
  Settings,
  ShieldCheck,
  UserCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/firebase';
import { formatCurrency } from '../lib/upiAndExport';
import { ApprovalRequest, NavPageId } from '../types/billing';
import { formatAppDate, tr, translateStatus, translateSystemText } from '../lib/i18n';

interface NotificationsPageProps {
  onNavigate: (page: NavPageId) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNavigate }) => {
  const {
    notifications,
    messageLogs,
    approvalRequests,
    markNotificationRead,
    markAllNotificationsRead,
    reviewApprovalRequest,
  } = useBillingData();
  const { language, isAdmin } = useAuth();
  const [tab, setTab] = useState<'alerts' | 'messages'>('alerts');
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const pendingApprovals = approvalRequests.filter((r) => r.status === 'pending');

  const handleReviewApproval = async (req: ApprovalRequest, decision: 'approved' | 'rejected') => {
    setReviewBusyId(req.id);
    setReviewFeedback(null);
    try {
      await reviewApprovalRequest({ requestId: req.id, decision });
      setReviewFeedback({
        type: 'ok',
        text:
          decision === 'approved'
            ? tr(language, `Approved request from ${req.requesterName}.`, `${req.requesterName} అభ్యర్థన ఆమోదించబడింది.`)
            : tr(language, `Declined request from ${req.requesterName}.`, `${req.requesterName} అభ్యర్థన తిరస్కరించబడింది.`),
      });
    } catch (err) {
      setReviewFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to process approval.', 'ఆమోదం ప్రాసెస్ చేయడం విఫలమైంది.'),
      });
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleNotificationClick = async (id: string, type: string) => {
    await markNotificationRead(id);
    if (type === 'bill' || type === 'cancellation' || type === 'approval_decision') onNavigate('bill-history');
    else if (type === 'payment' || type === 'refund') onNavigate('payments');
    else if (type === 'low_stock') onNavigate('inventory');
    else if (type === 'customer') onNavigate('customers');
    else if (type === 'settings') onNavigate('settings');
    else if (type === 'device') onNavigate('devices');
    else if (type === 'approval_request') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderIcon = (type: string) => {
    if (type === 'low_stock') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    if (type === 'payment' || type === 'refund') return <CreditCard className="w-4 h-4 text-[#15803D]" />;
    if (type === 'customer') return <UserPlus className="w-4 h-4 text-[#9A4307]" />;
    if (type === 'settings') return <Settings className="w-4 h-4 text-[#6D665E]" />;
    if (type === 'approval_request') return <Clock className="w-4 h-4 text-[#9A4307]" />;
    if (type === 'approval_decision') return <ShieldCheck className="w-4 h-4 text-[#15803D]" />;
    return <FileText className="w-4 h-4 text-[#9A4307]" />;
  };

  const renderProfileDiffLines = (req: ApprovalRequest) => {
    const lines: string[] = [];
    if (req.proposedDisplayName !== undefined) {
      lines.push(`${tr(language, 'Name', 'పేరు')}: ${req.currentDisplayName || '—'} → ${req.proposedDisplayName}`);
    }
    if (req.proposedPhoneNumber !== undefined) {
      lines.push(`${tr(language, 'Phone', 'ఫోన్')}: ${req.currentPhoneNumber || '—'} → ${req.proposedPhoneNumber || '—'}`);
    }
    if (req.proposedUsername !== undefined) {
      lines.push(
        `${tr(language, 'Username', 'యూజర్ పేరు')}: ${req.currentUsername ? '@' + req.currentUsername : '—'} → @${req.proposedUsername}`
      );
    }
    if (req.proposedEmail !== undefined) {
      lines.push(`${tr(language, 'Email', 'ఇమెయిల్')}: ${req.currentEmail || '—'} → ${req.proposedEmail}`);
    }
    if (req.proposedPhotoDataUrl !== undefined) {
      lines.push(tr(language, 'Updated Profile Photo', 'కొత్త ప్రొఫైల్ ఫోటో'));
    }
    return lines;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('alerts')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold ${
              tab === 'alerts'
                ? 'bg-[#0A2240] text-white'
                : 'bg-[#F3EDE5] dark:bg-slate-800 text-[#6D665E] dark:text-slate-300'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />{' '}
            {language === 'te' ? `వ్యాపార హెచ్చరికలు (${unreadCount} చదవనివి)` : `Business Alerts (${unreadCount} unread)`}
          </button>
          <button
            onClick={() => setTab('messages')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold ${
              tab === 'messages'
                ? 'bg-[#0A2240] text-white'
                : 'bg-[#F3EDE5] dark:bg-slate-800 text-[#6D665E] dark:text-slate-300'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />{' '}
            {language === 'te' ? `వాట్సాప్ & ఎస్‌ఎంఎస్ లాగ్స్ (${messageLogs.length})` : `WhatsApp & SMS Logs (${messageLogs.length})`}
          </button>
        </div>

        {tab === 'alerts' && unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E5DDD3] dark:border-slate-700 text-xs font-semibold hover:bg-[#FAF8F5] dark:hover:bg-slate-800"
          >
            <CheckCheck className="w-3.5 h-3.5 text-[#15803D]" /> {tr(language, 'Mark All Read', 'అన్నీ చదివినట్లు గుర్తుపెట్టు')}
          </button>
        )}
      </div>

      {tab === 'alerts' ? (
        <div className="space-y-4">
          {isAdmin && (pendingApprovals.length > 0 || reviewFeedback) && (
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#F0D9B5] dark:border-amber-900/60 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-[#FDF3DF] dark:bg-amber-950/40 border-b border-[#F0D9B5] dark:border-amber-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#9A4307] dark:text-amber-300">
                  <Clock className="w-4 h-4" />
                  <span>
                    {tr(language, 'Pending Staff Approval Requests', 'పెండింగ్‌లో ఉన్న సిబ్బంది ఆమోద అభ్యర్థనలు')} ({pendingApprovals.length})
                  </span>
                </div>
              </div>

              {reviewFeedback && (
                <div
                  className={`px-4 py-2.5 text-xs font-medium border-b ${
                    reviewFeedback.type === 'ok'
                      ? 'bg-[#E7F6EC] border-[#C5E8D1] text-[#15803D]'
                      : 'bg-[#FCE8E6] border-[#F5C6C0] text-[#C23B2B]'
                  }`}
                >
                  {reviewFeedback.text}
                </div>
              )}

              <div className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
                {pendingApprovals.map((req) => {
                  const isBusy = reviewBusyId === req.id;
                  return (
                    <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-[#FAF8F5] dark:bg-slate-800 border border-[#E5DDD3] dark:border-slate-700 shrink-0 mt-0.5">
                          {req.requestType === 'profile_update' ? (
                            <UserCheck className="w-4 h-4 text-[#0A2240] dark:text-sky-300" />
                          ) : (
                            <Pencil className="w-4 h-4 text-[#9A4307]" />
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-[#0A2240] dark:text-white">
                              {req.requesterName}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-[#F3EDE5] dark:bg-slate-800 text-[#9A4307] dark:text-amber-300 text-[10px] font-bold uppercase">
                              {req.requestType === 'profile_update'
                                ? tr(language, 'Profile Update', 'ప్రొఫైల్ మార్పు')
                                : tr(language, 'Bill Edit Request', 'బిల్ సవరణ అభ్యర్థన')}
                            </span>
                            <span className="text-[11px] text-[#8A8279]">
                              {formatAppDate(formatTimestamp(req.createdAt), language, true)}
                            </span>
                          </div>

                          {req.requestType === 'profile_update' ? (
                            <div className="flex items-start gap-2.5">
                              {req.proposedPhotoDataUrl && (
                                <img
                                  src={req.proposedPhotoDataUrl}
                                  alt={req.requesterName}
                                  className="w-10 h-10 rounded-lg object-cover border border-[#E5DDD3] shrink-0"
                                />
                              )}
                              <ul className="text-xs text-[#2D3138] dark:text-slate-300 space-y-0.5">
                                {renderProfileDiffLines(req).map((line) => (
                                  <li key={line}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="text-xs text-[#2D3138] dark:text-slate-300 space-y-0.5">
                              <div>
                                <strong>{req.billNumber}</strong> · {req.customerName} ·{' '}
                                <span className="font-mono font-bold text-[#0A2240] dark:text-white">
                                  {formatCurrency(req.grandTotal || 0)}
                                </span>
                              </div>
                              {req.reason && (
                                <div className="text-[11px] text-[#6D665E] dark:text-slate-400">
                                  {tr(language, 'Reason:', 'కారణం:')} {req.reason}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReviewApproval(req, 'approved')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-bold disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isBusy ? '...' : tr(language, 'Approve', 'ఆమోదించు')}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReviewApproval(req, 'rejected')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#C23B2B] hover:bg-[#A32E20] text-white text-xs font-bold disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {tr(language, 'Reject', 'తిరస్కరించు')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 divide-y divide-[#EFEAE2] dark:divide-slate-800">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n.id, n.type)}
                className={`w-full text-left p-4 flex items-start justify-between gap-4 transition hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40 ${
                  !n.isRead ? 'bg-[#0A2240]/5' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#F3EDE5] dark:bg-slate-800 mt-0.5">{renderIcon(n.type)}</div>
                  <div>
                    <div className="text-xs font-semibold text-[#0A2240] dark:text-white flex items-center gap-2">
                      {translateSystemText(n.title, language)}
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#0A2240]" />}
                    </div>
                    <p className="text-xs text-[#6D665E] dark:text-slate-300 mt-0.5">
                      {translateSystemText(n.message, language)}
                    </p>
                    <div className="text-[11px] text-[#8A8279] mt-1">
                      {formatAppDate(formatTimestamp(n.createdAt), language, true)}
                      {n.creatorName ? ` · ${n.creatorName}` : ''}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-[#9A4307] font-medium shrink-0">
                  {tr(language, 'Open →', 'తెరువు →')}
                </span>
              </button>
            ))}
            {notifications.length === 0 && (
              <div className="py-12 text-center text-xs text-[#8A8279]">
                {tr(
                  language,
                  'No business notifications yet. Bills, payments, and low-stock events appear here in real time.',
                  'ఇంకా వ్యాపార హెచ్చరికలు ఏవీ లేవు. బిల్లులు, చెల్లింపులు మరియు తక్కువ స్టాక్ వివరాలు ఇక్కడ కనిపిస్తాయి.'
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#FAF8F5] dark:bg-slate-950 text-[#6D665E] border-b border-[#E5DDD3] dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Timestamp', 'సమయం')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Channel', 'మాధ్యమం')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Bill #', 'బిల్ #')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Recipient', 'స్వీకర్త')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Status', 'స్థితి')}</th>
                <th className="py-3 px-4 font-semibold">{tr(language, 'Details / Message', 'వివరాలు / సందేశం')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE2] dark:divide-slate-800">
              {messageLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#FAF8F5] dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-[#6D665E] whitespace-nowrap">
                    {formatAppDate(formatTimestamp(log.createdAt), language, true)}
                  </td>
                  <td className="py-3 px-4 uppercase font-semibold">{translateStatus(log.channel, language)}</td>
                  <td className="py-3 px-4 font-mono text-[#9A4307]">{log.billNumber}</td>
                  <td className="py-3 px-4 font-mono">{log.recipientMobile}</td>
                  <td className="py-3 px-4 font-semibold uppercase text-[11px]">
                    <span
                      className={
                        log.status === 'sent'
                          ? 'text-[#15803D]'
                          : log.status === 'failed'
                            ? 'text-[#C23B2B]'
                            : 'text-amber-600'
                      }
                    >
                      {language === 'te' ? translateStatus(log.status, 'te') : log.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#6D665E] max-w-md truncate">
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
                  <td colSpan={6} className="py-10 text-center text-[#8A8279]">
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
