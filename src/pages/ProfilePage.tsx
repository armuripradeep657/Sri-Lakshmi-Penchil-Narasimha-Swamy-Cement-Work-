import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { compressProfilePhoto, isValidSixDigitMpin } from '../lib/mpinCrypto';

export const ProfilePage: React.FC = () => {
  const {
    userAccount,
    isAdmin,
    updateMyProfile,
    changeMyEmail,
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
  }, [userAccount]);

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
      setProfileNotice({ type: 'ok', text: 'Staff profile & photo saved to database.' });
    } catch (err) {
      setProfileNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save profile.',
      });
    } finally {
      setSavingProfile(false);
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
    if (!isValidSixDigitMpin(mpin)) {
      setMpinNotice({ type: 'err', text: 'Enter exactly 6 numeric digits (0-9).' });
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
        text: '6-digit fast MPIN saved! You can now log in with your 6-digit MPIN or Google.',
      });
    } catch (err) {
      setMpinNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to create 6-digit MPIN.',
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
      setMpinNotice({ type: 'ok', text: '6-digit MPIN disabled for your account.' });
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
                {isAdmin ? 'Admin' : 'Staff'}
              </span>
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
              Lock &amp; Use MPIN
            </button>
          )}
        </div>
      </div>

      {/* Staff Photo, Name & Phone Number */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F44] flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#1D4ED8]" /> Staff Photo, Name &amp; Phone Number
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visible on your staff portal, billing records, and MPIN quick login screen.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt="Staff Preview"
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
                {photoDataUrl ? 'Change Staff Photo' : 'Upload Staff Photo'}
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
            <label className="block font-semibold text-slate-700 mb-1">Staff Full Name *</label>
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
            <Mail className="w-4 h-4 text-[#1D4ED8]" /> Change Email Address
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Updates your profile email and authorizes the new Google email to carry over your photo, phone, and MPIN.
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

      {/* 6-Digit MPIN Fast Login Setup */}
      <form
        onSubmit={handleSetupMpin}
        className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F44] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#1D4ED8]" /> 6-Digit Fast Login MPIN
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Create a 6-digit numeric MPIN so you can unlock and sign in fast using your MPIN or Google anytime.
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
              {userAccount.mpinEnabled ? 'New 6-Digit MPIN *' : 'Create 6-Digit MPIN *'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={mpin}
              onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full px-3 py-2.5 font-mono tracking-[0.4em] text-center text-base rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Confirm 6-Digit MPIN *</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmMpin}
              onChange={(e) => setConfirmMpin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full px-3 py-2.5 font-mono tracking-[0.4em] text-center text-base rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
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
            disabled={savingMpin || mpin.length !== 6 || confirmMpin.length !== 6}
            className="px-4 py-2.5 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-bold transition disabled:opacity-50"
          >
            {savingMpin
              ? 'Encrypting MPIN...'
              : userAccount.mpinEnabled
              ? 'Update 6-Digit MPIN'
              : 'Create 6-Digit MPIN'}
          </button>
        </div>
      </form>
    </div>
  );
};
