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
import { tr } from '../lib/i18n';

export const ProfilePage: React.FC = () => {
  const {
    userAccount,
    isAdmin,
    language,
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
      setProfileNotice({
        type: 'ok',
        text: tr(
          language,
          'Photo ready. Tap "Save Profile Details" to sync to cloud.',
          'ఫోటో సిద్ధంగా ఉంది. క్లౌడ్‌లో సింక్ చేయడానికి "ప్రొఫైల్ వివరాలు సేవ్ చేయండి" నొక్కండి.'
        ),
      });
    } catch (err) {
      setProfileNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Unable to process photo.', 'ఫోటోను ప్రాసెస్ చేయడం సాధ్యం కాలేదు.'),
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
      setProfileNotice({
        type: 'ok',
        text: tr(language, 'Profile & photo saved to database.', 'ప్రొఫైల్ & ఫోటో డేటాబేస్‌లో సేవ్ చేయబడింది.'),
      });
    } catch (err) {
      setProfileNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to save profile.', 'ప్రొఫైల్ సేవ్ చేయడం విఫలమైంది.'),
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
        text: tr(
          language,
          'Username must be 3-40 characters using lowercase letters, numbers, dot (.), underscore (_), or hyphen (-).',
          'యూజర్ పేరు 3-40 అక్షరాలు (చిన్న అక్షరాలు, సంఖ్యలు, ., _, -) లోపల ఉండాలి.'
        ),
      });
      return;
    }
    if (!isValidSecretPassword(newPassword)) {
      setCredsNotice({
        type: 'err',
        text: tr(language, 'Password must be at least 4 characters.', 'పాస్‌వర్డ్ కనీసం 4 అక్షరాలు ఉండాలి.'),
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredsNotice({
        type: 'err',
        text: tr(language, 'Password and Confirm Password do not match.', 'పాస్‌వర్డ్ మరియు నిర్ధారణ పాస్‌వర్డ్ సరిపోలలేదు.'),
      });
      return;
    }
    setSavingCreds(true);
    try {
      await setupMyUsernamePassword(cleanU, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setCredsNotice({
        type: 'ok',
        text: tr(
          language,
          `Username "@${cleanU}" and password saved! You can now sign in from any device (and offline once synced) without losing any data.`,
          `యూజర్ పేరు "@${cleanU}" మరియు పాస్‌వర్డ్ సేవ్ అయ్యాయి! ఇప్పుడు ఏ పరికరం నుండైనా డేటా కోల్పోకుండా లాగిన్ కావచ్చు.`
        ),
      });
    } catch (err) {
      setCredsNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to save username & password.', 'యూజర్ పేరు & పాస్‌వర్డ్ సేవ్ చేయడం విఫలమైంది.'),
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
        text: tr(
          language,
          'Email updated & authorized. You can now sign in with this new Google email too.',
          'ఇమెయిల్ నవీకరించబడింది & అనుమతించబడింది. మీరు ఇప్పుడు ఈ కొత్త గూగుల్ ఇమెయిల్‌తో కూడా లాగిన్ కావచ్చు.'
        ),
      });
    } catch (err) {
      setEmailNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to update email.', 'ఇమెయిల్ నవీకరించడం విఫలమైంది.'),
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSetupMpin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMpinNotice(null);
    if (!isValidFourDigitMpin(mpin)) {
      setMpinNotice({
        type: 'err',
        text: tr(language, 'Enter exactly 4 numeric digits (0-9).', 'సరిగ్గా 4 అంకెలు (0-9) నమోదు చేయండి.'),
      });
      return;
    }
    if (mpin !== confirmMpin) {
      setMpinNotice({
        type: 'err',
        text: tr(language, 'MPIN and Confirm MPIN do not match.', 'ఎంపిన్ మరియు నిర్ధారణ ఎంపిన్ సరిపోలలేదు.'),
      });
      return;
    }
    setSavingMpin(true);
    try {
      await setupMyMpin(mpin);
      setMpin('');
      setConfirmMpin('');
      setMpinNotice({
        type: 'ok',
        text: tr(
          language,
          '4-digit fast MPIN saved! You can now unlock offline or online using your 4-digit MPIN.',
          '4-అంకెల ఫాస్ట్ ఎంపిన్ సేవ్ అయింది! ఇప్పుడు ఆఫ్‌లైన్ లేదా ఆన్‌లైన్‌లో ఎంపిన్‌తో త్వరగా అన్‌లాక్ చేయవచ్చు.'
        ),
      });
    } catch (err) {
      setMpinNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to create 4-digit MPIN.', '4-అంకెల ఎంపిన్ సృష్టించడం విఫలమైంది.'),
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
      setMpinNotice({
        type: 'ok',
        text: tr(language, '4-digit MPIN disabled for your account.', 'మీ ఖాతాకు 4-అంకెల ఎంపిన్ నిలిపివేయబడింది.'),
      });
    } catch (err) {
      setMpinNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to disable MPIN.', 'ఎంపిన్ నిలిపివేయడం విఫలమైంది.'),
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
                {isAdmin ? tr(language, 'Owner / Admin', 'యజమాని / అడ్మిన్') : tr(language, 'Staff', 'సిబ్బంది')}
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
              <span>{userAccount.phoneNumber || tr(language, 'Phone not added yet', 'ఫోన్ ఇంకా జోడించలేదు')}</span>
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
              {tr(language, 'Lock App', 'యాప్ లాక్ చేయి')}
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
              <AtSign className="w-4 h-4 text-[#1D4ED8]" />{' '}
              {tr(language, 'Username & Password Login (Any Device & Offline)', 'యూజర్ పేరు & పాస్‌వర్డ్ లాగిన్ (ఏ పరికరమైనా & ఆఫ్‌లైన్)')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {tr(
                language,
                'Set a unique username and password to sign into this same account from any phone or computer without losing any bills, products, or data.',
                'బిల్లులు, ఉత్పత్తులు లేదా డేటా కోల్పోకుండా ఏ ఫోన్ లేదా కంప్యూటర్ నుండైనా ఇదే ఖాతాలో లాగిన్ కావడానికి యూజర్ పేరు మరియు పాస్‌వర్డ్ సెట్ చేయండి.'
              )}
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
            {userAccount.username ? `@${userAccount.username}` : tr(language, 'Not Set', 'సెట్ కాలేదు')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {tr(language, 'Username *', 'యూజర్ పేరు *')}
            </label>
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
              {userAccount.passwordEnabled
                ? tr(language, 'New Password *', 'కొత్త పాస్‌వర్డ్ *')
                : tr(language, 'Create Password *', 'పాస్‌వర్డ్ సృష్టించండి *')}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={tr(language, 'Min 4 characters', 'కనీసం 4 అక్షరాలు')}
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
            <label className="block font-semibold text-slate-700 mb-1">
              {tr(language, 'Confirm Password *', 'పాస్‌వర్డ్ నిర్ధారించండి *')}
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={4}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={tr(language, 'Re-enter password', 'పాస్‌వర్డ్ మళ్లీ నమోదు చేయండి')}
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
                {tr(language, 'Enable Email/Password in Firebase Console', 'ఫైర్‌బేస్ కన్సోల్‌లో ఇమెయిల్/పాస్‌వర్డ్ ప్రారంభించండి')}{' '}
                <ExternalLink className="w-3 h-3" />
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
              ? tr(language, 'Securing Credentials...', 'వివరాలు భద్రపరుస్తోంది...')
              : userAccount.passwordEnabled
              ? tr(language, 'Update Username & Password', 'యూజర్ పేరు & పాస్‌వర్డ్ నవీకరించండి')
              : tr(language, 'Save Username & Password', 'యూజర్ పేరు & పాస్‌వర్డ్ సేవ్ చేయండి')}
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
              <Camera className="w-4 h-4 text-[#1D4ED8]" />{' '}
              {tr(language, 'Profile Photo, Name & Phone Number', 'ప్రొఫైల్ ఫోటో, పేరు & ఫోన్ నంబర్')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {tr(
                language,
                'Visible on your portal, billing records, and quick login screen.',
                'మీ పోర్టల్, బిల్లింగ్ రికార్డులు మరియు త్వరిత లాగిన్ స్క్రీన్‌లో కనిపిస్తుంది.'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt={tr(language, 'Profile Preview', 'ప్రొఫైల్ ప్రివ్యూ')}
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
                {photoDataUrl ? tr(language, 'Change Photo', 'ఫోటో మార్చు') : tr(language, 'Upload Photo', 'ఫోటో అప్‌లోడ్ చేయి')}
              </button>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl('')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {tr(language, 'Remove', 'తొలగించు')}
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {tr(language, 'Automatically compressed & synced across devices.', 'ఆటోమేటిక్‌గా కంప్రెస్ అయి అన్ని పరికరాలకు సింక్ అవుతుంది.')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {tr(language, 'Full Name *', 'పూర్తి పేరు *')}
            </label>
            <input
              required
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tr(language, 'Enter full name', 'పూర్తి పేరు నమోదు చేయండి')}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {tr(language, 'Phone Number', 'ఫోన్ నంబర్')}
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={tr(language, 'e.g. 9876543210', 'ఉదా. 9876543210')}
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
            {savingProfile
              ? tr(language, 'Saving Profile...', 'ప్రొఫైల్ సేవ్ అవుతోంది...')
              : tr(language, 'Save Profile Details', 'ప్రొఫైల్ వివరాలు సేవ్ చేయండి')}
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
            <Mail className="w-4 h-4 text-[#1D4ED8]" />{' '}
            {tr(language, 'Change Google / Recovery Email Address', 'గూగుల్ / రికవరీ ఇమెయిల్ చిరునామా మార్చండి')}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {tr(
              language,
              'Updates your profile email and authorizes the new Google email to carry over your photo, phone, username, and MPIN.',
              'మీ ప్రొఫైల్ ఇమెయిల్‌ను నవీకరిస్తుంది మరియు మీ ఫోటో, ఫోన్, యూజర్ పేరు, ఎంపిన్‌లను కొత్త గూగుల్ ఇమెయిల్‌కు వర్తింపజేస్తుంది.'
            )}
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
            {savingEmail ? tr(language, 'Updating Email...', 'ఇమెయిల్ నవీకరించబడుతోంది...') : tr(language, 'Update Email', 'ఇమెయిల్ నవీకరించు')}
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
              <KeyRound className="w-4 h-4 text-[#1D4ED8]" />{' '}
              {tr(language, '4-Digit Fast Login MPIN', '4-అంకెల ఫాస్ట్ లాగిన్ ఎంపిన్')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {tr(
                language,
                'Create a 4-digit numeric MPIN so you can unlock and sign in fast (even offline) using your MPIN.',
                'ఆఫ్‌లైన్ లేదా ఆన్‌లైన్‌లో త్వరగా అన్‌లాక్ చేయడానికి 4-అంకెల ఎంపిన్ సృష్టించండి.'
              )}
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
            {userAccount.mpinEnabled
              ? tr(language, 'MPIN Active', 'ఎంపిన్ సక్రియం')
              : tr(language, 'Not Created', 'సెట్ కాలేదు')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {userAccount.mpinEnabled
                ? tr(language, 'New 4-Digit MPIN *', 'కొత్త 4-అంకెల ఎంపిన్ *')
                : tr(language, 'Create 4-Digit MPIN *', '4-అంకెల ఎంపిన్ సృష్టించండి *')}
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
            <label className="block font-semibold text-slate-700 mb-1">
              {tr(language, 'Confirm 4-Digit MPIN *', '4-అంకెల ఎంపిన్ నిర్ధారించండి *')}
            </label>
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
              {tr(language, 'Disable MPIN', 'ఎంపిన్ నిలిపివేయి')}
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
              ? tr(language, 'Encrypting MPIN...', 'ఎంపిన్ ఎన్‌క్రిప్ట్ అవుతోంది...')
              : userAccount.mpinEnabled
              ? tr(language, 'Update 4-Digit MPIN', '4-అంకెల ఎంపిన్ నవీకరించు')
              : tr(language, 'Create 4-Digit MPIN', '4-అంకెల ఎంపిన్ సృష్టించు')}
          </button>
        </div>
      </form>
    </div>
  );
};
