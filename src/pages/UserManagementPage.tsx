import React, { useState } from 'react';
import {
  AtSign,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Phone,
  Shield,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { firebaseProjectId } from '../lib/firebase';
import { normalizeUsername } from '../lib/mpinCrypto';
import { UserRole } from '../types/billing';
import { tr, translateStatus } from '../lib/i18n';

export const UserManagementPage: React.FC = () => {
  const {
    users,
    invites,
    inviteStaffMember,
    createStaffAccountWithPassword,
    adminUpdateUserCredentials,
    updateUserAccess,
    revokeInvite,
  } = useBillingData();
  const { isAdmin, activeUid, language } = useAuth();

  const [createMode, setCreateMode] = useState<'password' | 'google'>('password');

  // Direct Username + Password state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [optionalEmail, setOptionalEmail] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{
    displayName: string;
    username: string;
    password: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Shared & Google invite state
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [canEditBills, setCanEditBills] = useState(false);
  const [canCancelBills, setCanCancelBills] = useState(false);
  const [canViewReports, setCanViewReports] = useState(true);
  const [canManageProducts, setCanManageProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline username assignment for existing users
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState('');
  const [savingEditUid, setSavingEditUid] = useState(false);

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">
        {tr(
          language,
          'Administrator privileges are required to manage staff roles and permissions.',
          'సిబ్బంది పాత్రలు మరియు అనుమతులను నిర్వహించడానికి అడ్మిన్ హక్కులు అవసరం.'
        )}
      </div>
    );
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    setCreatedCredentials(null);

    try {
      if (createMode === 'password') {
        const res = await createStaffAccountWithPassword({
          username,
          password,
          displayName,
          phoneNumber,
          email: optionalEmail,
          role,
          canEditBills,
          canCancelBills,
          canViewReports,
          canManageProducts,
        });
        setCreatedCredentials({
          displayName: displayName.trim(),
          username: res.username,
          password,
        });
        setFeedback(
          tr(
            language,
            `Staff login "@${res.username}" is active immediately! They can sign in from any device right now.`,
            `సిబ్బంది లాగిన్ "@${res.username}" వెంటనే యాక్టివేట్ అయింది! వారు ఇప్పుడు ఏ పరికరం నుండైనా లాగిన్ కావచ్చు.`
          )
        );
        setUsername('');
        setPassword('');
        setPhoneNumber('');
        setOptionalEmail('');
        setDisplayName('');
      } else {
        if (!email.trim() || !displayName.trim()) return;
        await inviteStaffMember({
          email,
          displayName,
          role,
          canEditBills,
          canCancelBills,
          canViewReports,
          canManageProducts,
        });
        setFeedback(
          tr(
            language,
            `Invited ${email.trim().toLowerCase()} as ${role}. They can now sign in with their Google account to claim access.`,
            `${email.trim().toLowerCase()} ను ${translateStatus(role, 'te')} గా ఆహ్వానించాము. వారు గూగుల్ ఖాతాతో లాగిన్ కావచ్చు.`
          )
        );
        setEmail('');
        setDisplayName('');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr(language, 'Failed to create staff access.', 'సిబ్బంది ఖాతా సృష్టించడం విఫలమైంది.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCreatedCredentials = async () => {
    if (!createdCredentials || !navigator.clipboard) return;
    const text =
      language === 'te'
        ? `ఎస్‌ఎల్‌పి బిల్లింగ్ సిబ్బంది లాగిన్\nపేరు: ${createdCredentials.displayName}\nయూజర్ పేరు: ${createdCredentials.username}\nపాస్‌వర్డ్: ${createdCredentials.password}`
        : `SLP Billing Staff Login\nName: ${createdCredentials.displayName}\nUsername: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSaveRowUsername = async (uid: string) => {
    if (!editingUsername.trim()) return;
    setSavingEditUid(true);
    setError(null);
    try {
      await adminUpdateUserCredentials(uid, { username: editingUsername });
      setEditingUid(null);
      setEditingUsername('');
      setFeedback(tr(language, 'Updated staff username successfully.', 'సిబ్బంది యూజర్ పేరు నవీకరించబడింది.'));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr(language, 'Failed to update username.', 'యూజర్ పేరు నవీకరించడం విఫలమైంది.')
      );
    } finally {
      setSavingEditUid(false);
    }
  };

  const showEmailPwdProviderHint =
    error && (error.includes('Email/Password') || error.includes('operation-not-allowed'));

  return (
    <div className="space-y-6">
      {/* Create Staff Form */}
      <form
        onSubmit={handleCreateSubmit}
        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#1D4ED8]" />{' '}
              {tr(language, 'Create Staff / Co-Admin Login', 'సిబ్బంది / సహ-అడ్మిన్ లాగిన్ సృష్టించండి')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {tr(
                language,
                'Create a ready-to-use Username & Password for any device, or send a Google email invite.',
                'ఏ పరికరంలోనైనా ఉపయోగించడానికి యూజర్ పేరు & పాస్‌వర్డ్ సృష్టించండి లేదా గూగుల్ ఇమెయిల్ ఆహ్వానం పంపండి.'
              )}
            </p>
          </div>
          <Shield className="w-5 h-5 text-[#1D4ED8]" />
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-blue-50 dark:bg-slate-950 border border-blue-100 dark:border-slate-800 max-w-md">
          <button
            type="button"
            onClick={() => {
              setCreateMode('password');
              setError(null);
              setFeedback(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              createMode === 'password'
                ? 'bg-[#0B1F44] text-white shadow-sm'
                : 'text-[#0B1F44] dark:text-slate-300 hover:bg-white'
            }`}
          >
            <AtSign className="w-3.5 h-3.5" /> {tr(language, 'Username & Password', 'యూజర్ పేరు & పాస్‌వర్డ్')}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateMode('google');
              setError(null);
              setFeedback(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              createMode === 'google'
                ? 'bg-[#1D4ED8] text-white shadow-sm'
                : 'text-[#0B1F44] dark:text-slate-300 hover:bg-white'
            }`}
          >
            <Mail className="w-3.5 h-3.5" /> {tr(language, 'Google Email Invite', 'గూగుల్ ఇమెయిల్ ఆహ్వానం')}
          </button>
        </div>

        {feedback && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 space-y-2">
            <div>{feedback}</div>
            {createdCredentials && (
              <div className="rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 p-3 flex flex-wrap items-center justify-between gap-3 text-slate-700 dark:text-slate-200">
                <div className="font-mono text-[11px] space-y-0.5">
                  <div>
                    <span className="text-slate-500">{tr(language, 'Name:', 'పేరు:')}</span>{' '}
                    <strong>{createdCredentials.displayName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{tr(language, 'Username:', 'యూజర్ పేరు:')}</span>{' '}
                    <strong className="text-[#1D4ED8]">{createdCredentials.username}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{tr(language, 'Password:', 'పాస్‌వర్డ్:')}</span>{' '}
                    <strong>{createdCredentials.password}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCreatedCredentials}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1F44] text-white text-[11px] font-semibold hover:bg-[#1D4ED8]"
                >
                  {copiedCreds ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCreds
                    ? tr(language, 'Copied Login Info', 'లాగిన్ వివరాలు కాపీ అయ్యాయి')
                    : tr(language, 'Copy Login Info', 'లాగిన్ వివరాలు కాపీ చేయి')}
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300 space-y-2">
            <div>{error}</div>
            {showEmailPwdProviderHint && (
              <a
                href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1F44] text-white text-[11px] font-semibold"
              >
                {tr(language, 'Enable Email/Password in Firebase Console', 'ఫైర్‌బేస్ కన్సోల్‌లో ఇమెయిల్/పాస్‌వర్డ్ ప్రారంభించండి')}{' '}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {createMode === 'password' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Full Name *', 'పూర్తి పేరు *')}
              </label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={tr(language, 'Counter Staff Name', 'కౌంటర్ సిబ్బంది పేరు')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Username *', 'యూజర్ పేరు *')}
              </label>
              <input
                required
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                placeholder={tr(language, 'e.g. staff.ravi', 'ఉదా. staff.ravi')}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Password *', 'పాస్‌వర్డ్ *')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tr(language, 'Min 4 characters', 'కనీసం 4 అక్షరాలు')}
                  className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Phone Number', 'ఫోన్ నంబర్')}
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="9876543210"
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Recovery Email (Optional)', 'రికవరీ ఇమెయిల్ (ఐచ్ఛికం)')}
              </label>
              <input
                type="email"
                value={optionalEmail}
                onChange={(e) => setOptionalEmail(e.target.value)}
                placeholder={tr(language, 'staff@gmail.com (optional)', 'staff@gmail.com (ఐచ్ఛికం)')}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Role', 'పాత్ర')}
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="cashier">
                  {tr(language, 'Staff / Cashier (POS & Billing)', 'సిబ్బంది / క్యాషియర్ (బిల్లింగ్)')}
                </option>
                <option value="admin">
                  {tr(language, 'Co-Admin (Full Access)', 'సహ-అడ్మిన్ (పూర్తి అనుమతి)')}
                </option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Google Email *', 'గూగుల్ ఇమెయిల్ *')}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cashier@gmail.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Full Name *', 'పూర్తి పేరు *')}
              </label>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={tr(language, 'Counter Staff Name', 'కౌంటర్ సిబ్బంది పేరు')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tr(language, 'Role', 'పాత్ర')}
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="cashier">
                  {tr(language, 'Staff / Cashier (POS & Billing)', 'సిబ్బంది / క్యాషియర్ (బిల్లింగ్)')}
                </option>
                <option value="admin">
                  {tr(language, 'Co-Admin (Full Access)', 'సహ-అడ్మిన్ (పూర్తి అనుమతి)')}
                </option>
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-xs pt-1">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={canEditBills} onChange={(e) => setCanEditBills(e.target.checked)} />
            {tr(language, 'Can Edit Bill Notes', 'బిల్ గమనికలు సవరించగలరు')}
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={canCancelBills} onChange={(e) => setCanCancelBills(e.target.checked)} />
            {tr(language, 'Can Cancel Bills', 'బిల్లులు రద్దు చేయగలరు')}
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={canViewReports} onChange={(e) => setCanViewReports(e.target.checked)} />
            {tr(language, 'Can View Sales Reports', 'అమ్మకాల నివేదికలు చూడగలరు')}
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={canManageProducts}
              onChange={(e) => setCanManageProducts(e.target.checked)}
            />
            {tr(language, 'Can Manage Products & Stock', 'ఉత్పత్తులు & స్టాక్ నిర్వహించగలరు')}
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {submitting
              ? tr(language, 'Creating Access...', 'ఖాతా సృష్టించబడుతోంది...')
              : createMode === 'password'
              ? tr(language, 'Create Staff Username & Password', 'సిబ్బంది యూజర్ పేరు & పాస్‌వర్డ్ సృష్టించండి')
              : tr(language, 'Create Google Staff Invite', 'గూగుల్ సిబ్బంది ఆహ్వానం పంపండి')}
          </button>
        </div>
      </form>

      {/* Active Users Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-600" />{' '}
          {tr(language, 'Authorized Accounts', 'అనుమతించబడిన ఖాతాలు')} ({users.length})
        </div>
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4 font-semibold">{tr(language, 'User', 'వినియోగదారు')}</th>
              <th className="py-3 px-4 font-semibold">{tr(language, 'Role', 'పాత్ర')}</th>
              <th className="py-3 px-4 font-semibold">
                {tr(language, 'Login Methods & Permissions', 'లాగిన్ పద్ధతులు & అనుమతులు')}
              </th>
              <th className="py-3 px-4 font-semibold">{tr(language, 'Status', 'స్థితి')}</th>
              <th className="py-3 px-4 font-semibold text-right">{tr(language, 'Controls', 'నియంత్రణలు')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => {
              const isSelf = u.uid === activeUid;
              const isEditingThis = editingUid === u.uid;
              return (
                <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      {u.photoDataUrl ? (
                        <img
                          src={u.photoDataUrl}
                          alt={u.displayName}
                          className="w-9 h-9 rounded-full object-cover border border-blue-200 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#0B1F44] text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {(u.displayName || 'U').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {u.displayName} {isSelf ? tr(language, '(You)', '(మీరు)') : ''}
                        </div>
                        {u.username && (
                          <div className="font-mono text-[11px] font-bold text-[#1D4ED8] truncate">
                            @{u.username}
                          </div>
                        )}
                        <div className="font-mono text-[11px] text-slate-500 truncate">{u.email}</div>
                        {u.phoneNumber && (
                          <div className="font-mono text-[11px] text-[#1D4ED8] flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" /> {u.phoneNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 uppercase font-semibold">
                    {language === 'te' ? translateStatus(u.role, 'te') : u.role}
                  </td>
                  <td className="py-3 px-4 text-[11px] text-slate-500">
                    <div className="space-y-1">
                      <div>
                        {[
                          u.canEditBills ? tr(language, 'Edit Bills', 'బిల్ సవరణ') : '',
                          u.canCancelBills ? tr(language, 'Cancel Bills', 'బిల్ రద్దు') : '',
                          u.canViewReports ? tr(language, 'Reports', 'నివేదికలు') : '',
                          u.canManageProducts ? tr(language, 'Inventory', 'ఇన్వెంటరీ') : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') ||
                          tr(language, 'POS, My Bills, Scanner & Profile', 'బిల్లింగ్, నా బిల్లులు, స్కానర్ & ప్రొఫైల్')}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {u.passwordEnabled && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-[#1D4ED8] border border-blue-200 text-[10px] font-bold">
                            <AtSign className="w-2.5 h-2.5" />{' '}
                            {tr(language, 'Username/Password', 'యూజర్ పేరు/పాస్‌వర్డ్')}
                          </span>
                        )}
                        {u.mpinEnabled && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            <KeyRound className="w-2.5 h-2.5" /> {tr(language, '4-Digit MPIN', '4-అంకెల ఎంపిన్')}
                          </span>
                        )}
                      </div>
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            type="text"
                            value={editingUsername}
                            onChange={(e) => setEditingUsername(normalizeUsername(e.target.value))}
                            placeholder={tr(language, 'username', 'యూజర్ పేరు')}
                            className="px-2 py-1 rounded border border-blue-300 font-mono text-[11px] w-32 bg-white text-slate-900"
                          />
                          <button
                            type="button"
                            disabled={savingEditUid}
                            onClick={() => handleSaveRowUsername(u.uid)}
                            className="px-2 py-1 rounded bg-[#0B1F44] text-white text-[10px] font-semibold"
                          >
                            {savingEditUid ? '...' : tr(language, 'Save', 'సేవ్')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUid(null);
                              setEditingUsername('');
                            }}
                            className="px-2 py-1 rounded border border-slate-200 text-[10px]"
                          >
                            {tr(language, 'Cancel', 'రద్దు')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUid(u.uid);
                            setEditingUsername(u.username || '');
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1D4ED8] hover:underline pt-0.5"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          {u.username
                            ? tr(language, 'Change Username', 'యూజర్ పేరు మార్చు')
                            : tr(language, 'Assign Username', 'యూజర్ పేరు కేటాయించు')}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-semibold uppercase text-[11px] ${
                        u.status === 'active' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {translateStatus(u.status, language)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {!isSelf && (
                      <>
                        {u.status === 'active' ? (
                          <button
                            onClick={() => updateUserAccess(u.uid, { status: 'disabled' })}
                            className="px-2.5 py-1 rounded border border-amber-300 text-amber-700 text-[11px] font-semibold hover:bg-amber-50"
                          >
                            {tr(language, 'Disable', 'నిలిపివేయి')}
                          </button>
                        ) : (
                          <button
                            onClick={() => updateUserAccess(u.uid, { status: 'active' })}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold"
                          >
                            {tr(language, 'Enable', 'ప్రారంభించు')}
                          </button>
                        )}
                        {u.status !== 'revoked' && (
                          <button
                            onClick={() => updateUserAccess(u.uid, { status: 'revoked' })}
                            className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold"
                          >
                            {tr(language, 'Revoke', 'రద్దు చేయి')}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pending / History Invites */}
      {invites.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserX className="w-4 h-4 text-slate-500" />{' '}
            {tr(language, 'Google Staff Invitations', 'గూగుల్ సిబ్బంది ఆహ్వానాలు')} ({invites.length})
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-semibold">{tr(language, 'Email', 'ఇమెయిల్')}</th>
                <th className="py-2.5 px-4 font-semibold">{tr(language, 'Name', 'పేరు')}</th>
                <th className="py-2.5 px-4 font-semibold">{tr(language, 'Role', 'పాత్ర')}</th>
                <th className="py-2.5 px-4 font-semibold">{tr(language, 'Status', 'స్థితి')}</th>
                <th className="py-2.5 px-4 font-semibold text-right">{tr(language, 'Action', 'చర్య')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2.5 px-4 font-mono">{inv.email}</td>
                  <td className="py-2.5 px-4">{inv.displayName}</td>
                  <td className="py-2.5 px-4 uppercase">
                    {language === 'te' ? translateStatus(inv.role, 'te') : inv.role}
                  </td>
                  <td className="py-2.5 px-4 uppercase font-semibold text-[11px]">
                    {translateStatus(inv.status, language)}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {inv.status === 'pending' && (
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        className="text-rose-600 hover:underline font-medium"
                      >
                        {tr(language, 'Revoke Invite', 'ఆహ్వానం రద్దు చేయి')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
