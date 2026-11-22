import React, { useState } from 'react';
import { KeyRound, Phone, Shield, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useBillingData } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types/billing';

export const UserManagementPage: React.FC = () => {
  const { users, invites, inviteStaffMember, updateUserAccess, revokeInvite } = useBillingData();
  const { isAdmin, firebaseUser } = useAuth();

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

  if (!isAdmin) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">
        Administrator privileges are required to manage staff roles and permissions.
      </div>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !displayName.trim()) return;
    setSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
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
        `Invited ${email.trim().toLowerCase()} as ${role}. They can now sign in with their Google account to claim access.`
      );
      setEmail('');
      setDisplayName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite staff user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Invite Staff Form */}
      <form
        onSubmit={handleInvite}
        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#1D4ED8]" /> Authorize New Staff / Cashier Account
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Staff sign in via verified Google Sign-In. Firestore security rules enforce these roles server-side.
            </p>
          </div>
          <Shield className="w-5 h-5 text-[#1D4ED8]" />
        </div>

        {feedback && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            {feedback}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Google Email *</label>
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
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Full Name *</label>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Counter Staff Name"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="cashier">Cashier (POS & Billing)</option>
              <option value="admin">Co-Admin (Full Access)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs pt-1">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={canEditBills} onChange={(e) => setCanEditBills(e.target.checked)} />
            Can Edit Bill Notes
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={canCancelBills} onChange={(e) => setCanCancelBills(e.target.checked)} />
            Can Cancel Bills
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={canViewReports} onChange={(e) => setCanViewReports(e.target.checked)} />
            Can View Sales Reports
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={canManageProducts}
              onChange={(e) => setCanManageProducts(e.target.checked)}
            />
            Can Manage Products & Stock
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-[#0B1F44] text-white text-xs font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {submitting ? 'Authorizing...' : 'Create Staff Invite'}
          </button>
        </div>
      </form>

      {/* Active Users Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-600" /> Authorized Staff Accounts ({users.length})
        </div>
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4 font-semibold">User</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Permissions</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => {
              const isSelf = u.uid === firebaseUser?.uid;
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
                          {u.displayName} {isSelf ? '(You)' : ''}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 truncate">{u.email}</div>
                        {u.phoneNumber && (
                          <div className="font-mono text-[11px] text-[#1D4ED8] flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" /> {u.phoneNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 uppercase font-semibold">{u.role}</td>
                  <td className="py-3 px-4 text-[11px] text-slate-500">
                    <div className="space-y-1">
                      <div>
                        {[
                          u.canEditBills ? 'Edit Bills' : '',
                          u.canCancelBills ? 'Cancel Bills' : '',
                          u.canViewReports ? 'Reports' : '',
                          u.canManageProducts ? 'Inventory' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'POS, My Bills, Scanner & Profile'}
                      </div>
                      {u.mpinEnabled && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          <KeyRound className="w-2.5 h-2.5" /> 6-Digit MPIN Active
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-semibold uppercase text-[11px] ${
                        u.status === 'active' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {u.status}
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
                            Disable
                          </button>
                        ) : (
                          <button
                            onClick={() => updateUserAccess(u.uid, { status: 'active' })}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold"
                          >
                            Enable
                          </button>
                        )}
                        {u.status !== 'revoked' && (
                          <button
                            onClick={() => updateUserAccess(u.uid, { status: 'revoked' })}
                            className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold"
                          >
                            Revoke
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
            <UserX className="w-4 h-4 text-slate-500" /> Staff Invitations ({invites.length})
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Email</th>
                <th className="py-2.5 px-4 font-semibold">Name</th>
                <th className="py-2.5 px-4 font-semibold">Role</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2.5 px-4 font-mono">{inv.email}</td>
                  <td className="py-2.5 px-4">{inv.displayName}</td>
                  <td className="py-2.5 px-4 uppercase">{inv.role}</td>
                  <td className="py-2.5 px-4 uppercase font-semibold text-[11px]">{inv.status}</td>
                  <td className="py-2.5 px-4 text-right">
                    {inv.status === 'pending' && (
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        className="text-rose-600 hover:underline font-medium"
                      >
                        Revoke Invite
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
