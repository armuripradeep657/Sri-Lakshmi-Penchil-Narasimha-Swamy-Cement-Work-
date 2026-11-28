import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  AtSign,
  Check,
  CheckCircle2,
  CloudOff,
  Copy,
  Delete,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Phone,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { firebaseProjectId } from '../lib/firebase';
import { DEFAULT_BUSINESS_LOGO } from '../lib/seedData';
import { LegalFooterLinks } from '../components/LegalModals';
import { PWAInstallButton } from '../components/PWAInstallButton';
import {
  getCopyrightNoticeLocalized,
  tr,
  translateBusinessName,
  translateProprietor,
} from '../lib/i18n';

export const LoginPage: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithGoogleRedirect,
    signInWithUsernamePassword,
    resetPasswordByUsernameOrEmail,
    signInWithMpin,
    authError,
    unauthorizedDomainHost,
    emailPasswordDisabled,
    accessDeniedReason,
    deviceRevoked,
    firebaseUser,
    userAccount,
    mpinLocked,
    savedMpinProfiles,
    savedPasswordProfiles,
    fullSignOut,
    language,
    toggleLanguage,
  } = useAuth();

  const [rememberMe, setRememberMe] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const hasSavedMpin = savedMpinProfiles.length > 0;
  const [loginMode, setLoginMode] = useState<'mpin' | 'password' | 'google'>(() => {
    if (mpinLocked || savedMpinProfiles.length > 0) return 'mpin';
    if (!isOnline || savedPasswordProfiles.length > 0) return 'password';
    return 'google';
  });

  // Username & Password form state
  const [usernameOrEmail, setUsernameOrEmail] = useState(() => savedPasswordProfiles[0]?.username || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [resetResult, setResetResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  // MPIN state
  const [selectedUid, setSelectedUid] = useState<string>(() => {
    if (firebaseUser?.uid && savedMpinProfiles.some((p) => p.uid === firebaseUser.uid)) {
      return firebaseUser.uid;
    }
    return savedMpinProfiles[0]?.uid || '';
  });
  const [pin, setPin] = useState('');
  const [mpinError, setMpinError] = useState<string | null>(null);
  const [verifyingPin, setVerifyingPin] = useState(false);

  useEffect(() => {
    if (mpinLocked) {
      setLoginMode('mpin');
    }
    if (!selectedUid && savedMpinProfiles.length > 0) {
      setSelectedUid(savedMpinProfiles[0].uid);
    } else if (firebaseUser?.uid && savedMpinProfiles.some((p) => p.uid === firebaseUser.uid)) {
      setSelectedUid(firebaseUser.uid);
    }
  }, [mpinLocked, savedMpinProfiles, firebaseUser?.uid, selectedUid]);

  const activeProfile =
    savedMpinProfiles.find((p) => p.uid === selectedUid) || savedMpinProfiles[0] || null;

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setMpinError(null);
    setPasswordError(null);
    try {
      await signInWithGoogle(rememberMe);
    } catch {
      // handled by context
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleRedirectLogin = async () => {
    setSigningIn(true);
    setMpinError(null);
    setPasswordError(null);
    try {
      await signInWithGoogleRedirect(rememberMe);
    } catch {
      setSigningIn(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signingIn) return;
    setSigningIn(true);
    setPasswordError(null);
    setResetResult(null);
    try {
      await signInWithUsernamePassword(usernameOrEmail, password, rememberMe);
      setPassword('');
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : tr(language, 'Unable to sign in.', 'లాగిన్ కావడం సాధ్యం కాలేదు.')
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!usernameOrEmail.trim()) {
      setResetResult({
        type: 'err',
        text: tr(
          language,
          'Enter your username or registered email first.',
          'ముందుగా మీ యూజర్ పేరు లేదా నమోదైన ఇమెయిల్ నమోదు చేయండి.'
        ),
      });
      return;
    }
    setSendingReset(true);
    setResetResult(null);
    try {
      const msg = await resetPasswordByUsernameOrEmail(usernameOrEmail);
      setResetResult({ type: 'ok', text: msg });
    } catch (err) {
      setResetResult({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Password reset failed.', 'పాస్‌వర్డ్ రీసెట్ విఫలమైంది.'),
      });
    } finally {
      setSendingReset(false);
    }
  };

  const handleCopyDomain = async () => {
    if (!unauthorizedDomainHost || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(unauthorizedDomainHost);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const submitPin = async (pinValue: string) => {
    if (!activeProfile || pinValue.length !== 4 || verifyingPin) return;
    setVerifyingPin(true);
    setMpinError(null);
    try {
      await signInWithMpin(activeProfile.uid, pinValue);
      setPin('');
    } catch (err) {
      setMpinError(
        err instanceof Error ? err.message : tr(language, 'Invalid MPIN.', 'తప్పు ఎంపిన్.')
      );
      setPin('');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (verifyingPin || !activeProfile || activeProfile.lockedUntilGoogle) return;
    setMpinError(null);
    if (pin.length >= 4) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === 4) {
      void submitPin(next);
    }
  };

  const handleBackspace = () => {
    if (verifyingPin) return;
    setMpinError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (verifyingPin) return;
    setMpinError(null);
    setPin('');
  };

  // Keyboard support for 4-digit MPIN on desktop
  useEffect(() => {
    if (loginMode !== 'mpin' || !activeProfile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMode, activeProfile, pin, verifyingPin]);

  return (
    <div className="relative min-h-screen bg-[#FAF8F5] flex flex-col justify-between p-4 sm:p-6 overflow-x-hidden">
      {/* Centered Middle App Logo Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[25] flex items-center justify-center"
      >
        <img
          src={DEFAULT_BUSINESS_LOGO}
          alt=""
          referrerPolicy="no-referrer"
          className="w-64 h-64 sm:w-80 sm:h-80 rounded-3xl object-contain opacity-[0.095] mix-blend-multiply select-none animate-slp-breathe"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex items-center justify-between gap-2 max-w-5xl w-full mx-auto bg-white/95 backdrop-blur px-4 py-3 rounded-2xl border border-[#E5DDD3] shadow-sm"
      >
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={DEFAULT_BUSINESS_LOGO}
            alt={translateBusinessName(undefined, language)}
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-xl object-contain bg-white p-0.5 border border-[#0A2240]/25 shadow-xs shrink-0"
          />
          <span className="font-display font-bold text-sm sm:text-base text-[#0A2240] tracking-tight leading-tight line-clamp-2">
            {translateBusinessName(undefined, language)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DFD7CC] bg-[#F6F1EA] text-[#0A2240] text-xs font-bold hover:bg-[#EFE8DF] transition"
          >
            <Globe className="w-3.5 h-3.5 text-[#9A4307]" />
            <span>{language === 'te' ? 'ఇంగ్లీష్' : 'తెలుగు'}</span>
          </button>
          <PWAInstallButton variant="light-header" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-md w-full mx-auto my-4 sm:my-auto bg-white/95 backdrop-blur border border-[#E5DDD3] rounded-3xl p-5 sm:p-7 shadow-lg shadow-[#0A2240]/10"
      >
        <div className="flex flex-col items-center text-center">
          <motion.img
            initial={{ scale: 0.82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.08 }}
            src={DEFAULT_BUSINESS_LOGO}
            alt={translateBusinessName(undefined, language)}
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-2xl object-contain bg-white p-1 border-2 border-[#0A2240]/25 shadow-sm"
          />
          <h1 className="mt-3 text-lg sm:text-xl font-bold text-[#0A2240] text-balance">
            {translateBusinessName(undefined, language)}
          </h1>
          <p className="mt-1 text-xs text-[#6D665E] font-medium">
            {tr(language, 'Proprietor:', 'యజమాని:')} {translateProprietor('A. Prasad', language)} ·{' '}
            {tr(language, 'Ph:', 'ఫోన్:')} 9912179771
          </p>
        </div>

        {!isOnline && (
          <div className="mt-4 rounded-xl bg-[#FDF3DF] border border-[#F0D9B5] px-3 py-2 text-[11px] text-[#9A4307] flex items-center gap-2 font-medium">
            <CloudOff className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              {tr(
                language,
                'No Internet · Use your saved Username & Password or 4-Digit MPIN to open and bill offline.',
                'ఇంటర్నెట్ లేదు · ఆఫ్‌లైన్‌లో యాప్ తెరిచి బిల్లింగ్ చేయడానికి మీ యూజర్ పేరు & పాస్‌వర్డ్ లేదా 4-అంకెల ఎంపిన్ ఉపయోగించండి.'
              )}
            </span>
          </div>
        )}

        {(deviceRevoked || accessDeniedReason) && (firebaseUser || userAccount) ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-[#FCE8E6] border border-[#F5C6C0] p-4 text-sm text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">
                  {deviceRevoked
                    ? tr(language, 'Device Access Revoked', 'పరికర అనుమతి రద్దు చేయబడింది')
                    : tr(language, 'Authorization Required', 'అనుమతి అవసరం')}
                </div>
                <p className="mt-1 text-xs leading-relaxed">
                  {deviceRevoked
                    ? tr(
                        language,
                        'An administrator has revoked access for this browser/device session. Please contact the business administrator.',
                        'అడ్మిన్ ఈ పరికరం/బ్రౌజర్ అనుమతిని రద్దు చేశారు. దయచేసి వ్యాపార యజమానిని సంప్రదించండి.'
                      )
                    : accessDeniedReason}
                </p>
                <p className="mt-2 font-mono text-[11px] opacity-80">
                  {tr(language, 'Signed in as:', 'లాగిన్ అయిన ఖాతా:')}{' '}
                  {userAccount?.username ? `@${userAccount.username} · ` : ''}
                  {firebaseUser?.email || userAccount?.email}
                </p>
              </div>
            </div>
            <button
              onClick={fullSignOut}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#DFD7CC] text-sm font-semibold text-[#0A2240] hover:bg-[#F6F1EA] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {tr(language, 'Sign Out & Switch Account', 'సైన్ అవుట్ & ఖాతా మార్చు')}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Login Method Switcher */}
            {hasSavedMpin ? (
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#F6F1EA] border border-[#E5DDD3]">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('mpin');
                    setMpinError(null);
                    setPasswordError(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    loginMode === 'mpin'
                      ? 'bg-[#0A2240] text-white shadow-sm'
                      : 'text-[#0A2240] hover:bg-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tr(language, 'MPIN', 'ఎంపిన్')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('password');
                    setMpinError(null);
                    setPasswordError(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    loginMode === 'password'
                      ? 'bg-[#0A2240] text-white shadow-sm'
                      : 'text-[#0A2240] hover:bg-white'
                  }`}
                >
                  <AtSign className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tr(language, 'Password', 'పాస్‌వర్డ్')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('google');
                    setMpinError(null);
                    setPasswordError(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    loginMode === 'google'
                      ? 'bg-[#0A2240] text-white shadow-sm'
                      : 'text-[#0A2240] hover:bg-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tr(language, 'Google', 'గూగుల్')}</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#F6F1EA] border border-[#E5DDD3]">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('password');
                    setPasswordError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    loginMode === 'password'
                      ? 'bg-[#0A2240] text-white shadow-sm'
                      : 'text-[#0A2240] hover:bg-white'
                  }`}
                >
                  <AtSign className="w-3.5 h-3.5" />
                  {tr(language, 'Username & Password', 'యూజర్ పేరు & పాస్‌వర్డ్')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('google');
                    setPasswordError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    loginMode === 'google'
                      ? 'bg-[#0A2240] text-white shadow-sm'
                      : 'text-[#0A2240] hover:bg-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  {tr(language, 'Google Sign-In', 'గూగుల్ లాగిన్')}
                </button>
              </div>
            )}

            {(authError || passwordError) && (
              <div className="rounded-xl bg-[#FCE8E6] border border-[#F5C6C0] p-3 text-xs text-[#C23B2B] space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{passwordError || authError}</span>
                </div>

                {emailPasswordDisabled && (
                  <div className="rounded-lg bg-white border border-[#F5C6C0] p-2.5 space-y-2 text-[#2D3138]">
                    <div className="text-[11px] font-semibold text-[#0A2240]">
                      {tr(
                        language,
                        'Enable Email/Password Sign-In in Firebase Authentication (One-time setup):',
                        'ఫైర్‌బేస్‌లో ఇమెయిల్/పాస్‌వర్డ్ లాగిన్‌ను ప్రారంభించండి (ఒక్కసారి మాత్రమే):'
                      )}
                    </div>
                    <ol className="list-decimal list-inside text-[11px] space-y-0.5 text-[#6D665E]">
                      <li>{tr(language, 'Open Firebase Sign-in Providers below', 'కింద ఫైర్‌బేస్ సైన్-ఇన్ ప్రొవైడర్స్ తెరవండి')}</li>
                      <li>
                        {tr(
                          language,
                          'Click "Email/Password" → Toggle Enable → Save',
                          '"Email/Password" నొక్కి ఎనేబుల్ చేసి సేవ్ చేయండి'
                        )}
                      </li>
                      <li>{tr(language, 'Return here and sign in with Username & Password', 'ఇక్కడికి వచ్చి యూజర్ పేరు & పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి')}</li>
                    </ol>
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-[#0A2240] hover:bg-[#0A2240] text-white text-[11px] font-semibold transition"
                    >
                      {tr(language, 'Open Firebase Sign-in Providers', 'ఫైర్‌బేస్ సైన్-ఇన్ ప్రొవైడర్స్ తెరవండి')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {unauthorizedDomainHost && (
                  <div className="rounded-lg bg-white border border-[#F5C6C0] p-2.5 space-y-2 text-[#2D3138]">
                    <div className="text-[11px] font-semibold text-[#0A2240]">
                      {tr(
                        language,
                        'Add this domain in Firebase Authorized Domains:',
                        'ఫైర్‌బేస్ అనుమతించబడిన డొమైన్లలో ఈ డొమైన్‌ను జోడించండి:'
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-[#FAF8F5] border border-[#E5DDD3] rounded-md px-2.5 py-1.5">
                      <code className="text-[11px] font-mono text-[#0A2240] truncate">
                        {unauthorizedDomainHost}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyDomain}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[#E5DDD3] hover:bg-[#F6F1EA] text-[11px] font-semibold text-[#9A4307] shrink-0"
                      >
                        {copiedDomain ? (
                          <>
                            <Check className="w-3 h-3 text-[#15803D]" />
                            {tr(language, 'Copied', 'కాపీ అయింది')}
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            {tr(language, 'Copy', 'కాపీ')}
                          </>
                        )}
                      </button>
                    </div>
                    <ol className="list-decimal list-inside text-[11px] space-y-0.5 text-[#6D665E]">
                      <li>{tr(language, 'Open Firebase Authentication Settings below', 'కింద ఫైర్‌బేస్ సెట్టింగ్స్ తెరవండి')}</li>
                      <li>{tr(language, 'Scroll to Authorized domains & click Add domain', 'అనుమతించబడిన డొమైన్లలో కొత్త డొమైన్ జోడించండి')}</li>
                      <li>{tr(language, 'Paste the domain above and save, then retry login', 'పై డొమైన్‌ను పేస్ట్ చేసి సేవ్ చేసి, మళ్లీ లాగిన్ ప్రయత్నించండి')}</li>
                    </ol>
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-[#0A2240] hover:bg-[#0A2240] text-white text-[11px] font-semibold transition"
                    >
                      {tr(language, 'Open Firebase Authorized Domains', 'ఫైర్‌బేస్ డొమైన్ సెట్టింగ్స్ తెరవండి')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {loginMode === 'mpin' && activeProfile ? (
              <div className="space-y-4">
                {savedMpinProfiles.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {savedMpinProfiles.map((prof) => (
                      <button
                        key={prof.uid}
                        type="button"
                        onClick={() => {
                          setSelectedUid(prof.uid);
                          setPin('');
                          setMpinError(null);
                        }}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shrink-0 transition ${
                          prof.uid === activeProfile.uid
                            ? 'bg-[#F6F1EA] border-[#0A2240] text-[#0A2240]'
                            : 'bg-white border-[#E5DDD3] text-[#6D665E]'
                        }`}
                      >
                        {prof.photoDataUrl ? (
                          <img
                            src={prof.photoDataUrl}
                            alt={prof.displayName}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-[#0A2240] text-white text-[10px] flex items-center justify-center font-bold">
                            {prof.displayName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="max-w-[100px] truncate">{prof.displayName}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#F6F1EA] border border-[#E5DDD3]">
                  {activeProfile.photoDataUrl ? (
                    <img
                      src={activeProfile.photoDataUrl}
                      alt={activeProfile.displayName}
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#0A2240]/30 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#0A2240] text-white flex items-center justify-center shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="text-sm font-bold text-[#0A2240] truncate">
                      {activeProfile.displayName}
                    </div>
                    <div className="text-[11px] text-[#6D665E] truncate">
                      {activeProfile.username ? `@${activeProfile.username} · ` : ''}
                      {activeProfile.email}
                    </div>
                    {activeProfile.phoneNumber && (
                      <div className="text-[11px] font-mono text-[#9A4307] flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {activeProfile.phoneNumber}
                      </div>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-[#DFD7CC] text-[10px] font-bold uppercase text-[#9A4307]">
                    {activeProfile.role === 'admin'
                      ? tr(language, 'Admin', 'అడ్మిన్')
                      : tr(language, 'Staff', 'సిబ్బంది')}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="text-center text-xs font-semibold text-[#6D665E]">
                    {activeProfile.lockedUntilGoogle
                      ? tr(language, 'MPIN Locked · Use Password or Google Sign-In', 'ఎంపిన్ లాక్ అయింది · పాస్‌వర్డ్ లేదా గూగుల్ ద్వారా లాగిన్ అవ్వండి')
                      : verifyingPin
                      ? tr(language, 'Verifying 4-Digit MPIN...', '4-అంకెల ఎంపిన్ తనిఖీ అవుతోంది...')
                      : tr(language, 'Enter 4-Digit Fast Login MPIN', '4-అంకెల ఫాస్ట్ లాగిన్ ఎంపిన్ నమోదు చేయండి')}
                  </div>
                  <div className="grid grid-cols-4 gap-3 max-w-[220px] mx-auto">
                    {Array.from({ length: 4 }).map((_, i) => {
                      const filled = i < pin.length;
                      const isCurrent = i === pin.length;
                      return (
                        <div
                          key={i}
                          className={`h-12 rounded-xl border-2 flex items-center justify-center font-mono text-xl font-bold transition ${
                            filled
                              ? 'border-[#0A2240] bg-[#F6F1EA] text-[#0A2240]'
                              : isCurrent
                              ? 'border-[#0A2240]/60 bg-white'
                              : 'border-[#E5DDD3] bg-[#FAF8F5] text-[#8A8279]'
                          }`}
                        >
                          {filled ? '●' : ''}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {mpinError && (
                  <div className="rounded-xl bg-[#FCE8E6] border border-[#F5C6C0] p-2.5 text-xs text-[#C23B2B] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{mpinError}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 max-w-[270px] mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={verifyingPin || activeProfile.lockedUntilGoogle}
                      onClick={() => handleDigit(d)}
                      className="h-12 rounded-xl bg-[#FAF8F5] hover:bg-[#F6F1EA] active:scale-95 border border-[#E5DDD3] text-lg font-bold font-mono text-[#0A2240] transition disabled:opacity-40"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={verifyingPin}
                    onClick={handleClear}
                    className="h-12 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EDE5] active:scale-95 border border-[#E5DDD3] text-xs font-bold text-[#6D665E] transition"
                  >
                    {tr(language, 'Clear', 'క్లియర్')}
                  </button>
                  <button
                    type="button"
                    disabled={verifyingPin || activeProfile.lockedUntilGoogle}
                    onClick={() => handleDigit('0')}
                    className="h-12 rounded-xl bg-[#FAF8F5] hover:bg-[#F6F1EA] active:scale-95 border border-[#E5DDD3] text-lg font-bold font-mono text-[#0A2240] transition disabled:opacity-40"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    disabled={verifyingPin}
                    onClick={handleBackspace}
                    aria-label={tr(language, 'Backspace', 'తొలగించు')}
                    className="h-12 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EDE5] active:scale-95 border border-[#E5DDD3] flex items-center justify-center text-[#2D3138] transition"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setLoginMode('password')}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#DFD7CC] bg-[#F6F1EA] hover:bg-[#EFE8DF] text-[#0A2240] font-semibold text-xs transition"
                  >
                    <AtSign className="w-3.5 h-3.5 text-[#9A4307]" />
                    {tr(language, 'Or Sign in with Username & Password', 'లేదా యూజర్ పేరు & పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి')}
                  </button>

                  {isOnline && (
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={signingIn}
                      className="w-full text-center py-1 text-[11px] font-medium text-[#9A4307] hover:underline disabled:opacity-50"
                    >
                      {signingIn
                        ? tr(language, 'Verifying Google Session...', 'గూగుల్ సెషన్ తనిఖీ అవుతోంది...')
                        : tr(language, 'Or Sign in with Google', 'లేదా గూగుల్‌తో లాగిన్ అవ్వండి')}
                    </button>
                  )}

                  {mpinLocked && (firebaseUser || userAccount) && (
                    <button
                      type="button"
                      onClick={fullSignOut}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-medium text-[#6D665E] hover:text-[#C23B2B] transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {tr(language, 'Full Sign Out', 'పూర్తిగా సైన్ అవుట్')} ({userAccount?.email || firebaseUser?.email})
                    </button>
                  )}
                </div>
              </div>
            ) : loginMode === 'password' ? (
              <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                {savedPasswordProfiles.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#6D665E]">
                      {tr(language, 'Saved Accounts on This Device', 'ఈ పరికరంలో సేవ్ చేసిన ఖాతాలు')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {savedPasswordProfiles.map((prof) => (
                        <button
                          key={prof.uid}
                          type="button"
                          onClick={() => {
                            setUsernameOrEmail(prof.username);
                            setPasswordError(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold transition ${
                            usernameOrEmail.replace(/^@+/, '').toLowerCase() === prof.username
                              ? 'bg-[#F6F1EA] border-[#0A2240] text-[#0A2240]'
                              : 'bg-[#FAF8F5] border-[#E5DDD3] text-[#6D665E] hover:bg-white'
                          }`}
                        >
                          <span className="font-mono text-[#9A4307]">@{prof.username}</span>
                          <span className="text-[10px] uppercase text-[#8A8279]">
                            {prof.role === 'admin'
                              ? tr(language, 'Owner', 'యజమాని')
                              : tr(language, 'Staff', 'సిబ్బంది')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs space-y-3">
                  <div>
                    <label className="block font-semibold text-[#2D3138] mb-1">
                      {tr(language, 'Username or Registered Email *', 'యూజర్ పేరు లేదా నమోదైన ఇమెయిల్ *')}
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={usernameOrEmail}
                      onChange={(e) => {
                        setUsernameOrEmail(e.target.value);
                        setPasswordError(null);
                      }}
                      placeholder={tr(language, 'e.g. pradeep or staff1', 'ఉదా. pradeep లేదా staff1')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240] text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#2D3138] mb-1">
                      {tr(language, 'Password *', 'పాస్‌వర్డ్ *')}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={4}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordError(null);
                        }}
                        placeholder={tr(language, 'Enter password (min 4 characters)', 'పాస్‌వర్డ్ నమోదు చేయండి (కనీసం 4 అక్షరాలు)')}
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword
                            ? tr(language, 'Hide password', 'పాస్‌వర్డ్ దాచు')
                            : tr(language, 'Show password', 'పాస్‌వర్డ్ చూపు')
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#8A8279] hover:text-[#2D3138]"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <label className="flex items-center gap-2 text-[#6D665E] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-[#D5CBBE] text-[#9A4307] focus:ring-[#0A2240]"
                    />
                    <span>{tr(language, 'Remember login', 'లాగిన్ గుర్తుంచుకో')}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordResetOpen((o) => !o);
                      setResetResult(null);
                    }}
                    className="text-[#9A4307] font-semibold hover:underline"
                  >
                    {tr(language, 'Forgot password?', 'పాస్‌వర్డ్ మర్చిపోయారా?')}
                  </button>
                </div>

                {passwordResetOpen && (
                  <div className="rounded-xl bg-[#F6F1EA] border border-[#E5DDD3] p-3 space-y-2 text-xs">
                    <p className="text-[#6D665E]">
                      {tr(
                        language,
                        'Send a reset link to your registered Google email, or ask the Business Owner to update your password in User Management.',
                        'మీ నమోదైన గూగుల్ ఇమెయిల్‌కు రీసెట్ లింక్ పంపండి లేదా వ్యాపార యజమానిని వినియోగదారుల విభాగంలో పాస్‌వర్డ్ మార్చమని అడగండి.'
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={sendingReset}
                      className="w-full py-2 px-3 rounded-lg bg-[#0A2240] text-white font-semibold hover:bg-[#0A2240] disabled:opacity-50"
                    >
                      {sendingReset
                        ? tr(language, 'Sending Reset Link...', 'రీసెట్ లింక్ పంపుతోంది...')
                        : tr(language, 'Send Password Reset Email', 'పాస్‌వర్డ్ రీసెట్ ఇమెయిల్ పంపండి')}
                    </button>
                    {resetResult && (
                      <div
                        className={`p-2 rounded-lg text-[11px] flex items-start gap-1.5 ${
                          resetResult.type === 'ok'
                            ? 'bg-[#E7F6EC] text-[#15803D] border border-[#C5E8D1]'
                            : 'bg-[#FCE8E6] text-[#C23B2B] border border-[#F5C6C0]'
                        }`}
                      >
                        {resetResult.type === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                        <span>{resetResult.text}</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full inline-flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white font-semibold text-sm shadow-md shadow-[#0A2240]/25 active:scale-[0.99] transition disabled:opacity-60"
                >
                  <KeyRound className="w-4 h-4" />
                  {signingIn
                    ? tr(language, 'Signing In...', 'లాగిన్ అవుతోంది...')
                    : tr(language, 'Sign In with Username & Password', 'యూజర్ పేరు & పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి')}
                </button>

                {mpinLocked && (firebaseUser || userAccount) && (
                  <button
                    type="button"
                    onClick={fullSignOut}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium text-[#6D665E] hover:text-[#C23B2B] transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {tr(language, 'Full Sign Out & Switch Account', 'పూర్తిగా సైన్ అవుట్ & ఖాతా మార్చు')}
                  </button>
                )}
              </form>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-2.5 text-sm text-[#6D665E] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[#D5CBBE] text-[#9A4307] focus:ring-[#0A2240]"
                  />
                  <span>{tr(language, 'Keep me signed in on this trusted device', 'ఈ పరికరంలో నన్ను లాగిన్ చేసి ఉంచండి')}</span>
                </label>

                <button
                  onClick={handleGoogleLogin}
                  disabled={signingIn}
                  className="w-full inline-flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white font-semibold text-sm shadow-md shadow-[#0A2240]/25 active:scale-[0.99] transition disabled:opacity-60"
                >
                  <Lock className="w-4 h-4" />
                  {signingIn
                    ? tr(language, 'Verifying Google Session...', 'గూగుల్ సెషన్ తనిఖీ అవుతోంది...')
                    : tr(language, 'Sign in with Google', 'గూగుల్‌తో లాగిన్ అవ్వండి')}
                </button>

                <button
                  type="button"
                  onClick={handleGoogleRedirectLogin}
                  disabled={signingIn}
                  className="w-full text-center py-1 text-xs font-medium text-[#9A4307] hover:underline disabled:opacity-50"
                >
                  {tr(language, 'Popup blocked? Sign in via Redirect', 'పాప్అప్ బ్లాక్ అయితే రీడైరెక్ట్ ద్వారా లాగిన్ అవ్వండి')}
                </button>

                {mpinLocked && (firebaseUser || userAccount) && (
                  <button
                    type="button"
                    onClick={fullSignOut}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-[#6D665E] hover:text-[#C23B2B] transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {tr(language, 'Full Sign Out & Switch Google Account', 'పూర్తిగా సైన్ అవుట్ & గూగుల్ ఖాతా మార్చు')}
                  </button>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-[#EFEAE2] grid grid-cols-2 gap-3 text-xs text-[#6D665E]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#9A4307] shrink-0" />
                <span>{tr(language, 'Cloud RBAC Protected', 'క్లౌడ్ భద్రత రక్షితం')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#9A4307] shrink-0" />
                <span>{tr(language, 'Works Online & Offline', 'ఆన్‌లైన్ & ఆఫ్‌లైన్ పనిచేస్తుంది')}</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <footer className="relative z-10 text-center text-xs text-[#6D665E] pb-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>{getCopyrightNoticeLocalized(undefined, language)}</span>
        <span aria-hidden="true" className="text-[#B8AEA2]">
          ·
        </span>
        <LegalFooterLinks language={language} />
      </footer>
    </div>
  );
};
