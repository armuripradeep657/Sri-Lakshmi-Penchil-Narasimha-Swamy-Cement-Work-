import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Delete,
  KeyRound,
  Lock,
  LogOut,
  Phone,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_BUSINESS_LOGO } from '../lib/seedData';
import { PWAInstallButton } from '../components/PWAInstallButton';

export const LoginPage: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithMpin,
    authError,
    accessDeniedReason,
    deviceRevoked,
    firebaseUser,
    userAccount,
    mpinLocked,
    savedMpinProfiles,
    fullSignOut,
  } = useAuth();

  const [rememberMe, setRememberMe] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const hasSavedMpin = savedMpinProfiles.length > 0;
  const [loginMode, setLoginMode] = useState<'mpin' | 'google'>(() =>
    mpinLocked || savedMpinProfiles.length > 0 ? 'mpin' : 'google'
  );
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
    try {
      await signInWithGoogle(rememberMe);
    } catch {
      // handled by context
    } finally {
      setSigningIn(false);
    }
  };

  const submitPin = async (pinValue: string) => {
    if (!activeProfile || pinValue.length !== 6 || verifyingPin) return;
    setVerifyingPin(true);
    setMpinError(null);
    try {
      await signInWithMpin(activeProfile.uid, pinValue);
      setPin('');
    } catch (err) {
      setMpinError(err instanceof Error ? err.message : 'Invalid MPIN.');
      setPin('');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (verifyingPin || !activeProfile || activeProfile.lockedUntilGoogle) return;
    setMpinError(null);
    if (pin.length >= 6) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === 6) {
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

  // Keyboard support for 6-digit MPIN on desktop
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
    <div className="relative min-h-screen bg-gradient-to-b from-[#0B1F44] via-[#1D4ED8]/10 to-[#F4F8FF] flex flex-col justify-between p-4 sm:p-6 overflow-x-hidden">
      {/* Centered Middle App Logo Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] flex items-center justify-center"
      >
        <img
          src={DEFAULT_BUSINESS_LOGO}
          alt=""
          referrerPolicy="no-referrer"
          className="w-60 h-60 sm:w-72 sm:h-72 rounded-full object-cover opacity-[0.065] mix-blend-multiply select-none"
        />
      </div>

      <div className="relative z-10 flex items-center justify-between max-w-5xl w-full mx-auto bg-white/95 backdrop-blur px-4 py-3 rounded-2xl border border-blue-100 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={DEFAULT_BUSINESS_LOGO}
            alt="Sri Lakshmi Penchil Narasimha Swamy Cement Work"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full object-cover border-2 border-[#1D4ED8]/30 shrink-0"
          />
          <span className="font-display font-bold text-sm sm:text-base text-[#0B1F44] tracking-tight leading-tight line-clamp-2">
            Sri Lakshmi Penchil Narasimha Swamy Cement Work
          </span>
        </div>
        <PWAInstallButton variant="light-header" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative z-10 max-w-md w-full mx-auto my-4 sm:my-auto bg-white/95 backdrop-blur border border-blue-100 rounded-3xl p-5 sm:p-7 shadow-lg shadow-blue-900/10"
      >
        <div className="flex flex-col items-center text-center">
          <img
            src={DEFAULT_BUSINESS_LOGO}
            alt="Sri Lakshmi Penchil Narasimha Swamy Cement Work"
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-full object-cover border-2 border-[#1D4ED8]/30 shadow-sm"
          />
          <h1 className="mt-3 text-lg sm:text-xl font-bold text-[#0B1F44] text-balance">
            Sri Lakshmi Penchil Narasimha Swamy Cement Work
          </h1>
          <p className="mt-1 text-xs text-blue-700/80 font-medium">
            Proprietor: A. Prasad · Ph: 9912179771
          </p>
        </div>

        {(deviceRevoked || accessDeniedReason) && firebaseUser ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">
                  {deviceRevoked ? 'Device Access Revoked' : 'Authorization Required'}
                </div>
                <p className="mt-1 text-xs leading-relaxed">
                  {deviceRevoked
                    ? 'An administrator has revoked access for this browser/device session. Please contact the business administrator.'
                    : accessDeniedReason}
                </p>
                <p className="mt-2 font-mono text-[11px] opacity-80">
                  Signed in as: {firebaseUser.email}
                </p>
              </div>
            </div>
            <button
              onClick={fullSignOut}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-blue-200 text-sm font-semibold text-[#0B1F44] hover:bg-blue-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out &amp; Switch Account
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Login Method Tabs (shown when at least one 6-digit MPIN profile exists) */}
            {hasSavedMpin && (
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-blue-50 border border-blue-100">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('mpin');
                    setMpinError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    loginMode === 'mpin'
                      ? 'bg-[#0B1F44] text-white shadow-sm'
                      : 'text-[#0B1F44] hover:bg-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  6-Digit MPIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('google');
                    setMpinError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    loginMode === 'google'
                      ? 'bg-[#1D4ED8] text-white shadow-sm'
                      : 'text-[#0B1F44] hover:bg-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Google Sign-In
                </button>
              </div>
            )}

            {authError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {loginMode === 'mpin' && activeProfile ? (
              <div className="space-y-4">
                {/* Saved Profile Selector if multiple staff MPINs on device */}
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
                            ? 'bg-blue-50 border-[#1D4ED8] text-[#0B1F44]'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {prof.photoDataUrl ? (
                          <img
                            src={prof.photoDataUrl}
                            alt={prof.displayName}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-[#0B1F44] text-white text-[10px] flex items-center justify-center font-bold">
                            {prof.displayName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="max-w-[100px] truncate">{prof.displayName}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Active Staff Card */}
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#F4F8FF] border border-blue-100">
                  {activeProfile.photoDataUrl ? (
                    <img
                      src={activeProfile.photoDataUrl}
                      alt={activeProfile.displayName}
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#1D4ED8]/30 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#0B1F44] text-white flex items-center justify-center shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="text-sm font-bold text-[#0B1F44] truncate">
                      {activeProfile.displayName}
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">
                      {activeProfile.email}
                    </div>
                    {activeProfile.phoneNumber && (
                      <div className="text-[11px] font-mono text-[#1D4ED8] flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {activeProfile.phoneNumber}
                      </div>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[10px] font-bold uppercase text-[#1D4ED8]">
                    {activeProfile.role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                </div>

                {/* 6-Digit PIN Boxes */}
                <div className="space-y-2">
                  <div className="text-center text-xs font-semibold text-slate-600">
                    {activeProfile.lockedUntilGoogle
                      ? 'MPIN Locked · Use Google Sign-In Below'
                      : verifyingPin
                      ? 'Verifying 6-Digit MPIN...'
                      : 'Enter 6-Digit Fast Login MPIN'}
                  </div>
                  <div className="grid grid-cols-6 gap-2 max-w-[260px] mx-auto">
                    {Array.from({ length: 6 }).map((_, i) => {
                      const filled = i < pin.length;
                      const isCurrent = i === pin.length;
                      return (
                        <div
                          key={i}
                          className={`h-11 rounded-xl border-2 flex items-center justify-center font-mono text-lg font-bold transition ${
                            filled
                              ? 'border-[#1D4ED8] bg-blue-50 text-[#0B1F44]'
                              : isCurrent
                              ? 'border-[#1D4ED8]/60 bg-white'
                              : 'border-slate-200 bg-slate-50 text-slate-400'
                          }`}
                        >
                          {filled ? '●' : ''}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {mpinError && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{mpinError}</span>
                  </div>
                )}

                {/* Touch Numeric Keypad */}
                <div className="grid grid-cols-3 gap-2 max-w-[270px] mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={verifyingPin || activeProfile.lockedUntilGoogle}
                      onClick={() => handleDigit(d)}
                      className="h-12 rounded-xl bg-slate-50 hover:bg-blue-50 active:scale-95 border border-slate-200 text-lg font-bold font-mono text-[#0B1F44] transition disabled:opacity-40"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={verifyingPin}
                    onClick={handleClear}
                    className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200 text-xs font-bold text-slate-600 transition"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={verifyingPin || activeProfile.lockedUntilGoogle}
                    onClick={() => handleDigit('0')}
                    className="h-12 rounded-xl bg-slate-50 hover:bg-blue-50 active:scale-95 border border-slate-200 text-lg font-bold font-mono text-[#0B1F44] transition disabled:opacity-40"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    disabled={verifyingPin}
                    onClick={handleBackspace}
                    aria-label="Backspace"
                    className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200 flex items-center justify-center text-slate-700 transition"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>

                {/* Google Sign-In Alternative & Switch Account */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={signingIn}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#0B1F44] font-semibold text-xs transition"
                  >
                    <Lock className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    {signingIn ? 'Verifying Google Session...' : 'Or Sign in with Google'}
                  </button>

                  {mpinLocked && firebaseUser && (
                    <button
                      type="button"
                      onClick={fullSignOut}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-medium text-slate-500 hover:text-rose-600 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Full Sign Out ({userAccount?.email || firebaseUser.email})
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-blue-300 text-[#1D4ED8] focus:ring-[#1D4ED8]"
                  />
                  <span>Keep me signed in on this trusted device</span>
                </label>

                <button
                  onClick={handleGoogleLogin}
                  disabled={signingIn}
                  className="w-full inline-flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#0B1F44] to-[#1D4ED8] hover:from-[#13326b] hover:to-[#1E40AF] text-white font-semibold text-sm shadow-md shadow-blue-700/25 active:scale-[0.99] transition disabled:opacity-60"
                >
                  <Lock className="w-4 h-4" />
                  {signingIn ? 'Verifying Google Session...' : 'Sign in with Google'}
                </button>

                {mpinLocked && firebaseUser && (
                  <button
                    type="button"
                    onClick={fullSignOut}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-600 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Full Sign Out &amp; Switch Google Account
                  </button>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                <span>Cloud RBAC Protected</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                <span>Real-Time Multi-Device</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <div className="relative z-10 text-center text-xs text-slate-400">
        Sri Lakshmi Penchil Narasimha Swamy Cement Work · Offline-Ready Cloud Sync
      </div>
    </div>
  );
};
