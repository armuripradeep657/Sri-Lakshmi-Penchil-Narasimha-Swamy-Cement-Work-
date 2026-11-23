import React, { useEffect, useRef, useState } from 'react';
import {
  AtSign,
  Camera,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { firebaseProjectId } from '../lib/firebase';
import {
  compressProfilePhoto,
  isValidFourDigitMpin,
  isValidSecretPassword,
  isValidUsername,
  normalizeUsername,
} from '../lib/mpinCrypto';

export const ProfilePage: React.FC = () => {
  const {
    userAccount,
    isAdmin,
    emailPasswordDisabled,
    updateMyProfile,
    changeMyEmail,
    setupMyUsernamePassword,
    setupMyMpin,
    disableMyMpin,
    lockWithMpin,
  } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [displayName, setDisplayName] = useState(userAccount?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(userAccount?.phoneNumber || '');
  const [photoDataUrl, setPhotoDataUrl] = useState(userAccount?.photoDataUrl || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [username, setUsername] = useState(
    userAccount?.username || (isAdmin ? 'pradeep' : '')
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsNotice, setCredsNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState(userAccount?.email || '');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [mpin, setMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');
  const [savingMpin, setSavingMpin] = useState(false);
  const [mpinNotice, setMpinNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!userAccount) return;
    setDisplayName(userAccount.displayName || '');
    setPhoneNumber(userAccount.phoneNumber || '');
    setPhotoDataUrl(userAccount.photoDataUrl || '');
    setNewEmail(userAccount.email || '');
    if (userAccount.username) {
      setUsername(userAccount.username);
    } else if (isAdmin) {
      setUsername((prev) => prev || 'pradeep');
    }
  }, [userAccount, isAdmin]);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileNotice(null);
    try {
      const compressed = await compressProfilePhoto(file);
      setPhotoDataUrl(compressed);
      setProfileNotice({ type: 'ok', text: 'Photo ready. Tap "Save Profile Details" to sync to cloud.' });
    } catch (err) {
      setProfileNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to process photo.',
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      await updateMyProfile({
        displayName,
        phoneNumber,
        photoDataUrl,
      });
      setProfileNotice({ type: 'ok', text: 'Profile & photo saved to database.' });
    } catch (err) {
      setProfileNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveUsernamePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredsNotice(null);
    const cleanU = normalizeUsername(username);
    if (!isValidUsername(cleanU)) {
      setCredsNotice({
        type: 'err',
        text: 'Username must be 3-40 characters using lowercase letters, numbers, dot (.), underscore (_), or hyphen (-).',
      });
      return;
    }
    if (!isValidSecretPassword(newPassword)) {
      setCredsNotice({ type: 'err', text: 'Password must be at least 4 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredsNotice({ type: 'err', text: 'Password and Confirm Password do not match.' });
      return;
    }
    setSavingCreds(true);
    try {
      await setupMyUsernamePassword(cleanU, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setCredsNotice({
        type: 'ok',
        text: `Username "@${cleanU}" and password saved! You can now sign in from any device (and offline once synced) without losing any data.`,
      });
    } catch (err) {
      setCredsNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save username & password.',
      });
    } finally {
      setSavingCreds(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    setEmailNotice(null);
    try {
      await changeMyEmail(newEmail);
      setEmailNotice({
        type: 'ok',
        text: 'Email updated & authorized. You can now sign in with this new Google email too.',
      });
    } catch (err) {
      setEmailNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update email.',
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSetupMpin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMpinNotice(null);
    if (!isValidFourDigitMpin(mpin)) {
      setMpinNotice({ type: 'err', text: 'Enter exactly 4 numeric digits (0-9).' });
      return;
    }
    if (mpin !== confirmMpin) {
      setMpinNotice({ type: 'err', text: 'MPIN and Confirm MPIN do not match.' });
      return;
    }
    setSavingMpin(true);
    try {
      await setupMyMpin(mpin);
      setMpin('');
      setConfirmMpin('');
      setMpinNotice({
        type: 'ok',
        text: '4-digit fast MPIN saved! You can now unlock offline or online using your 4-digit MPIN.',
      });
    } catch (err) {
      setMpinNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to create 4-digit MPIN.',
      });
    } finally {
      setSavingMpin(false);
    }
  };

  const handleDisableMpin = async () => {
    setSavingMpin(true);
    setMpinNotice(null);
    try {
      await disableMyMpin();
      setMpinNotice({ type: 'ok', text: '4-digit MPIN disabled for your account.' });
    } catch (err) {
      setMpinNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to disable MPIN.',
      });
    } finally {
      setSavingMpin(false);
    }
  };

  if (!userAccount) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-slp-in">
      {/* Identity Overview Banner */}
      <div className="bg-gradient-to-r from-[#0B1F44] to-[#1D4ED8] text-white rounded-2xl p-5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {photoDataUrl ? (
            <img
              src={photoDataUrl}
              alt={userAccount.displayName}
              className="w-16 h-16 rounded-full object-cover border-2 border-cyan-300 shadow shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center shrink-0">
              <User className="w-7 h-7 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold truncate">{userAccount.displayName}</h2>
              <span className="px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-bold uppercase tracking-wide">
                {isAdmin ? 'Owner / Admin' : 'Staff'}
              </span>
              {userAccount.username && (
                <span className="px-2 py-0.5 rounded-md bg-cyan-400/20 border border-cyan-300/40 text-cyan-100 text-[10px] font-mono font-bold">
                  @{userAccount.username}
                </span>
              )}
            </div>
            <div className="text-xs text-blue-100 mt-1 flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{userAccount.email}</span>
            </div>
            <div className="text-xs text-cyan-200 mt-0.5 flex items-center gap-1.5 font-mono">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{userAccount.phoneNumber || 'Phone not added yet'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {userAccount.mpinEnabled && (
            <button
              type="button"
              onClick={lockWithMpin}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#0B1F44] text-xs font-bold shadow hover:bg-blue-50 transition"
            >
              <Lock className="w-3.5 h-3.5 text-[#1D4ED8]" />
              Lock App
            </button>
          )}
        </div>
      </div>

      {/* Username & Password Login Anywhere */}
      <form
        onSubmit={handleSaveUsernamePassword}
        className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F44] flex items-center gap-2">
              <AtSign className="w-4 h-4 text-[#1D4ED8]" /> Username &amp; Password Login (Any Device &amp; Offline)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Set a unique username and password to sign into this same account from any phone or computer without losing any bills, products, or data.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 ${
              userAccount.passwordEnabled && userAccount.username
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {userAccount.username ? `@${userAccount.username}` : 'Not Set'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Username *</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              placeholder={isAdmin ? 'pradeep' : 'staff.ravi'}
              className="w-full px-3 py-2.5 font-mono rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {userAccount.passwordEnabled ? 'New Password *' : 'Create Password *'}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 4 characters"
                className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Confirm Password *</label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={4}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
        </div>

        {credsNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium space-y-2 ${
              credsNotice.type === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            <div>{credsNotice.text}</div>
            {emailPasswordDisabled && credsNotice.type === 'err' && (
              <a
                href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1F44] text-white text-[11px] font-semibold"
              >
                Enable Email/Password in Firebase Console <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingCreds}
            className="px-4 py-2.5 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-bold transition disabled:opacity-50"
          >
            {savingCreds
              ? 'Securing Credentials...'
              : userAccount.passwordEnabled
              ? 'Update Username & Password'
              : 'Save Username & Password'}
          </button>
        </div>
      </form>

      {/* Photo, Name & Phone Number */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F44] flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#1D4ED8]" /> Profile Photo, Name &amp; Phone Number
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visible on your portal, billing records, and quick login screen.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt="Profile Preview"
                className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-200 shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-blue-50 border-2 border-dashed border-blue-200 flex items-center justify-center text-blue-400">
                <User className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoPick}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition"
              >
                <Camera className="w-3.5 h-3.5" />
                {photoDataUrl ? 'Change Photo' : 'Upload Photo'}
              </button>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl('')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Automatically compressed &amp; synced across devices.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              required
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter full name"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full px-3 py-2.5 font-mono rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
        </div>

        {profileNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              profileNotice.type === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{profileNotice.text}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2.5 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-bold transition disabled:opacity-50"
          >
            {savingProfile ? 'Saving Profile...' : 'Save Profile Details'}
          </button>
        </div>
      </form>

      {/* Change Email */}
      <form
        onSubmit={handleChangeEmail}
        className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div>
          <h3 className="text-sm font-bold text-[#0B1F44] flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#1D4ED8]" /> Change Google / Recovery Email Address
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Updates your profile email and authorizes the new Google email to carry over your photo, phone, username, and MPIN.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 text-xs">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="newstaff@gmail.com"
            className="flex-1 px-3 py-2.5 font-mono rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
          <button
            type="submit"
            disabled={savingEmail}
            className="px-4 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold whitespace-nowrap transition disabled:opacity-50"
          >
            {savingEmail ? 'Updating Email...' : 'Update Email'}
          </button>
        </div>

        {emailNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              emailNotice.type === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            {emailNotice.text}
          </div>
        )}
      </form>

      {/* 4-Digit MPIN Fast Login Setup */}
      <form
        onSubmit={handleSetupMpin}
        className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F44] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#1D4ED8]" /> 4-Digit Fast Login MPIN
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Create a 4-digit numeric MPIN so you can unlock and sign in fast (even offline) using your MPIN.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 ${
              userAccount.mpinEnabled
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {userAccount.mpinEnabled ? 'MPIN Active' : 'Not Created'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {userAccount.mpinEnabled ? 'New 4-Digit MPIN *' : 'Create 4-Digit MPIN *'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={mpin}
              onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full px-3 py-2.5 font-mono tracking-[0.5em] text-center text-base rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Confirm 4-Digit MPIN *</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmMpin}
              onChange={(e) => setConfirmMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full px-3 py-2.5 font-mono tracking-[0.5em] text-center text-base rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
        </div>

        {mpinNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              mpinNotice.type === 'ok'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            {mpinNotice.text}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {userAccount.mpinEnabled ? (
            <button
              type="button"
              onClick={handleDisableMpin}
              disabled={savingMpin}
              className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 transition"
            >
              Disable MPIN
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={savingMpin || mpin.length !== 4 || confirmMpin.length !== 4}
            className="px-4 py-2.5 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-bold transition disabled:opacity-50"
          >
            {savingMpin
              ? 'Encrypting MPIN...'
              : userAccount.mpinEnabled
              ? 'Update 4-Digit MPIN'
              : 'Create 4-Digit MPIN'}
          </button>
        </div>
      </form>
    </div>
  );
};
