import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  EmailAuthProvider,
  User,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  commitWithOfflineSupport,
  db,
  emailToInviteId,
  generateSafeId,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import {
  findSavedPasswordProfileByIdentifier,
  generateMpinSalt,
  getCachedUserAccount,
  getMpinLockUid,
  getOfflineUnlockedUid,
  hashMpin,
  hashSecretPassword,
  isValidSecretPassword,
  isValidFourDigitMpin,
  isValidUsername,
  loadSavedMpinProfiles,
  loadSavedPasswordProfiles,
  normalizeUsername,
  recordMpinAttempt,
  removeCachedUserAccount,
  removeSavedMpinProfileByUid,
  SavedMpinProfile,
  SavedPasswordProfile,
  setCachedUserAccount,
  setMpinLockUid,
  setOfflineUnlockedUid,
  toFirebaseAuthPassword,
  upsertSavedMpinProfile,
  upsertSavedPasswordProfile,
  usernameToSyntheticEmail,
  verifyMpinHash,
  verifySecretPassword,
} from '../lib/mpinCrypto';
import { BOOT_ADMIN_EMAIL, DEFAULT_BUSINESS_ID, ensureBusinessSeeded } from '../lib/seedData';
import { DeviceSession, Language, ThemeMode, UserAccount, UserRole } from '../types/billing';

interface AuthContextValue {
  firebaseUser: User | null;
  userAccount: UserAccount | null;
  activeUid: string;
  currentDevice: DeviceSession | null;
  deviceRevoked: boolean;
  authReady: boolean;
  authError: string | null;
  unauthorizedDomainHost: string | null;
  emailPasswordDisabled: boolean;
  accessDeniedReason: string | null;
  role: UserRole | null;
  isAdmin: boolean;
  theme: ThemeMode;
  toggleTheme: () => void;
  language: Language;
  toggleLanguage: () => void;
  mpinLocked: boolean;
  savedMpinProfiles: SavedMpinProfile[];
  savedPasswordProfiles: SavedPasswordProfile[];
  signInWithGoogle: (rememberMe?: boolean, loginHint?: string) => Promise<void>;
  signInWithGoogleRedirect: (rememberMe?: boolean, loginHint?: string) => Promise<void>;
  signInWithUsernamePassword: (
    usernameOrEmail: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<void>;
  setupMyUsernamePassword: (username: string, password: string) => Promise<void>;
  resetPasswordByUsernameOrEmail: (usernameOrEmail: string) => Promise<string>;
  signInWithMpin: (uid: string, pin: string) => Promise<void>;
  lockWithMpin: () => void;
  logout: () => Promise<void>;
  fullSignOut: () => Promise<void>;
  updateMyProfile: (updates: {
    displayName: string;
    phoneNumber?: string;
    photoDataUrl?: string;
  }) => Promise<void>;
  changeMyEmail: (newEmail: string) => Promise<void>;
  setupMyMpin: (pin: string) => Promise<void>;
  disableMyMpin: () => Promise<void>;
  removeSavedMpinProfile: (uid: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEVICE_PING_TS_KEY = 'slp_dev_ping_ts';
const DEVICE_PING_INTERVAL_MS = 30 * 60 * 1000;

function detectDeviceMeta(): {
  deviceId: string;
  deviceName: string;
  browser: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
} {
  let deviceId = localStorage.getItem('slp_device_id');
  if (!deviceId || !/^[a-zA-Z0-9_-]{8,128}$/.test(deviceId)) {
    deviceId = generateSafeId('dev');
    localStorage.setItem('slp_device_id', deviceId);
  }
  const ua = navigator.userAgent;
  let browser = 'Modern Browser';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';

  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) deviceType = 'tablet';
  else if (/Mobi|Android|iPhone/i.test(ua)) deviceType = 'mobile';

  const platform = navigator.platform || 'Web Client';
  const deviceName = `${platform} · ${browser}`;

  return { deviceId, deviceName, browser, deviceType };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [offlineUnlockedUidState, setOfflineUnlockedUidState] = useState<string | null>(() =>
    getOfflineUnlockedUid()
  );
  const [userAccount, setUserAccount] = useState<UserAccount | null>(() => {
    const offlineUid = getOfflineUnlockedUid();
    if (offlineUid && !getMpinLockUid()) {
      return getCachedUserAccount(offlineUid);
    }
    return null;
  });
  const [currentDevice, setCurrentDevice] = useState<DeviceSession | null>(null);
  const [deviceRevoked, setDeviceRevoked] = useState(false);
  const [authReady, setAuthReady] = useState<boolean>(() => {
    const offlineUid = getOfflineUnlockedUid();
    return Boolean(offlineUid && !getMpinLockUid() && getCachedUserAccount(offlineUid));
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [unauthorizedDomainHost, setUnauthorizedDomainHost] = useState<string | null>(null);
  const [emailPasswordDisabled, setEmailPasswordDisabled] = useState(false);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);
  const [mpinLocked, setMpinLocked] = useState<boolean>(() => Boolean(getMpinLockUid()));
  const [savedMpinProfiles, setSavedMpinProfiles] = useState<SavedMpinProfile[]>(() =>
    loadSavedMpinProfiles()
  );
  const [savedPasswordProfiles, setSavedPasswordProfiles] = useState<SavedPasswordProfile[]>(() =>
    loadSavedPasswordProfiles()
  );

  const activeAuthUidRef = useRef<string | null>(null);
  const [theme] = useState<ThemeMode>('light');

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('slp_lang');
    return saved === 'te' ? 'te' : 'en';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    localStorage.setItem('slp_theme', 'light');
  }, []);

  useEffect(() => {
    localStorage.setItem('slp_lang', language);
  }, [language]);

  const toggleTheme = useCallback(() => {}, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'en' ? 'te' : 'en'));
  }, []);

  const formatGoogleAuthError = useCallback(
    (err: unknown): { code: string; message: string; unauthorizedHost: string | null } => {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      const host = typeof window !== 'undefined' ? window.location.hostname : '';

      switch (code) {
        case 'auth/unauthorized-domain':
          return {
            code,
            unauthorizedHost: host || null,
            message: host
              ? `Domain "${host}" is not authorized in Firebase Authentication yet. Add it to Firebase Console → Authentication → Settings → Authorized domains.`
              : 'This domain is not authorized in Firebase Authentication yet. Add it to Authorized domains in Firebase Console.',
          };
        case 'auth/popup-blocked':
          return {
            code,
            unauthorizedHost: null,
            message: 'Sign-in popup was blocked by your browser. Switching to Google Redirect Sign-In...',
          };
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
          return {
            code,
            unauthorizedHost: null,
            message: 'Google sign-in popup was closed before finishing login. Please try again or use Username & Password.',
          };
        case 'auth/operation-not-allowed':
          return {
            code,
            unauthorizedHost: null,
            message: 'Sign-In provider is not enabled in Firebase Authentication providers.',
          };
        case 'auth/network-request-failed':
          return {
            code,
            unauthorizedHost: null,
            message: 'Network error during Google Sign-In. Check your internet connection or unlock offline with Username & Password / MPIN.',
          };
        default:
          return {
            code,
            unauthorizedHost: null,
            message: err instanceof Error ? err.message : 'Sign-In failed.',
          };
      }
    },
    []
  );

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    if (navigator.onLine) {
      testConnection();
    }

    let active = true;
    getRedirectResult(auth)
      .then((cred) => {
        if (!active || !cred?.user) return;
        setAuthError(null);
        setUnauthorizedDomainHost(null);
        setMpinLockUid(null);
        setMpinLocked(false);
        setOfflineUnlockedUid(null);
        setOfflineUnlockedUidState(null);
        const next = recordMpinAttempt(cred.user.uid, true);
        setSavedMpinProfiles(next.profiles);
      })
      .catch((err) => {
        if (!active) return;
        const formatted = formatGoogleAuthError(err);
        setUnauthorizedDomainHost(formatted.unauthorizedHost);
        setAuthError(formatted.message);
      });

    return () => {
      active = false;
    };
  }, [formatGoogleAuthError]);

  const syncSavedCredentialsFromAccount = useCallback(
    (account: UserAccount | null, resetAttempts = false) => {
      if (!account) return;
      if (account.mpinEnabled && account.mpinHash && account.mpinSalt && account.status === 'active') {
        const next = upsertSavedMpinProfile({
          uid: account.uid,
          email: account.email,
          username: account.username,
          displayName: account.displayName,
          phoneNumber: account.phoneNumber,
          photoDataUrl: account.photoDataUrl,
          role: account.role,
          mpinHash: account.mpinHash,
          mpinSalt: account.mpinSalt,
          resetAttempts,
        });
        setSavedMpinProfiles(next);
      } else if (account.mpinEnabled === false) {
        const next = removeSavedMpinProfileByUid(account.uid);
        setSavedMpinProfiles(next);
        if (getMpinLockUid() === account.uid) {
          setMpinLockUid(null);
          setMpinLocked(false);
        }
      }

      if (
        account.passwordEnabled &&
        account.username &&
        account.passwordHash &&
        account.passwordSalt &&
        account.status === 'active'
      ) {
        const nextPw = upsertSavedPasswordProfile({
          uid: account.uid,
          username: account.username,
          email: account.email,
          authEmail: account.authEmail || account.email,
          displayName: account.displayName,
          phoneNumber: account.phoneNumber,
          photoDataUrl: account.photoDataUrl,
          role: account.role,
          passwordHash: account.passwordHash,
          passwordSalt: account.passwordSalt,
        });
        setSavedPasswordProfiles(nextPw);
      }
    },
    []
  );

  useEffect(() => {
    let deviceUnsub: (() => void) | null = null;
    let userUnsub: (() => void) | null = null;
    let onlineHandler: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Avoid tearing down live listeners when Firebase refreshes the ID token for the same UID
      if (user && activeAuthUidRef.current === user.uid && userUnsub) {
        setFirebaseUser(user);
        return;
      }

      if (deviceUnsub) {
        deviceUnsub();
        deviceUnsub = null;
      }
      if (userUnsub) {
        userUnsub();
        userUnsub = null;
      }
      if (onlineHandler) {
        window.removeEventListener('online', onlineHandler);
        onlineHandler = null;
      }

      activeAuthUidRef.current = user?.uid || null;
      setFirebaseUser(user);
      setAuthError(null);
      setAccessDeniedReason(null);
      setDeviceRevoked(false);

      if (!user) {
        const offlineUid = getOfflineUnlockedUid();
        const cachedOffline = offlineUid ? getCachedUserAccount(offlineUid) : null;
        if (cachedOffline && cachedOffline.status === 'active' && getMpinLockUid() !== offlineUid) {
          setUserAccount(cachedOffline);
          setOfflineUnlockedUidState(offlineUid);
          setMpinLocked(false);
          setAuthReady(true);
          return;
        }
        setUserAccount(null);
        setCurrentDevice(null);
        setMpinLocked(false);
        setAuthReady(true);
        return;
      }

      setOfflineUnlockedUid(null);
      setOfflineUnlockedUidState(null);

      const isPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
      if (!user.email || (!user.emailVerified && !isPasswordProvider)) {
        setAccessDeniedReason('Please sign in with a verified Google account or authorized Username & Password.');
        setUserAccount(null);
        setAuthReady(true);
        return;
      }

      const emailLower = user.email.toLowerCase();
      const isBoot = Boolean(user.emailVerified && emailLower === BOOT_ADMIN_EMAIL);
      const userRef = doc(db, 'users', user.uid);

      const syncDeviceInBackground = async (accountData: UserAccount, force = false) => {
        if (!navigator.onLine) return;
        try {
          const lastPing = Number(localStorage.getItem(DEVICE_PING_TS_KEY) || '0');
          const shouldThrottle = !force && Date.now() - lastPing < DEVICE_PING_INTERVAL_MS;

          if (isBoot && !shouldThrottle) {
            await ensureBusinessSeeded(user.uid, emailLower, user.displayName || 'A. Prasad');
          }

          const { deviceId, deviceName, browser, deviceType } = detectDeviceMeta();
          const deviceRef = doc(db, 'devices', deviceId);

          if (shouldThrottle) {
            const cachedDev = await getDocFromCache(deviceRef).catch(() => null);
            if (cachedDev && cachedDev.exists()) {
              const devData = cachedDev.data() as DeviceSession;
              if (devData.status === 'revoked') {
                setDeviceRevoked(true);
                setCurrentDevice(devData);
              }
              return;
            }
          }

          const existingDev = await getDoc(deviceRef);
          if (existingDev.exists()) {
            const devData = existingDev.data() as DeviceSession;
            if (devData.status === 'revoked') {
              setDeviceRevoked(true);
              setCurrentDevice(devData);
              return;
            }
            if (!shouldThrottle) {
              await updateDoc(deviceRef, {
                deviceName,
                browser,
                lastActiveAt: serverTimestamp(),
              });
              localStorage.setItem(DEVICE_PING_TS_KEY, String(Date.now()));
            }
          } else {
            const bizSnap = await getDoc(doc(db, 'businesses', accountData.businessId || DEFAULT_BUSINESS_ID));
            const bizData = bizSnap.exists() ? bizSnap.data() : null;
            await setDoc(deviceRef, {
              id: deviceId,
              businessId: accountData.businessId || DEFAULT_BUSINESS_ID,
              ownerUid: accountData.ownerUid,
              authorizedUids: bizData?.authorizedUids || accountData.authorizedUids,
              authorizedEmails: bizData?.authorizedEmails || [emailLower],
              userId: user.uid,
              userEmail: emailLower,
              userName: accountData.displayName,
              deviceName,
              browser,
              deviceType,
              status: 'authorized',
              lastActiveAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            });
            localStorage.setItem(DEVICE_PING_TS_KEY, String(Date.now()));
          }
        } catch (bgErr) {
          console.warn('Background device sync skipped:', bgErr);
        }
      };

      try {
        // Fast-path: restore cached account immediately so offline & repeat opens have zero spinner lag
        let accountData: UserAccount | null = getCachedUserAccount(user.uid);
        if (accountData && accountData.status === 'active') {
          setUserAccount(accountData);
          syncSavedCredentialsFromAccount(accountData);
          const lockedNow = getMpinLockUid() === user.uid;
          setMpinLocked(lockedNow);
          setAuthReady(true);
        }

        if (navigator.onLine || !accountData) {
          if (isBoot && navigator.onLine) {
            await ensureBusinessSeeded(user.uid, emailLower, user.displayName || 'A. Prasad');
          }

          let userSnap;
          try {
            userSnap = await getDocFromCache(userRef);
            if (!userSnap.exists() && navigator.onLine) {
              userSnap = await getDoc(userRef);
            }
          } catch {
            userSnap = navigator.onLine ? await getDoc(userRef).catch(() => null) : null;
          }

          if ((!userSnap || !userSnap.exists()) && navigator.onLine && !accountData) {
            userSnap = await getDoc(userRef).catch(() => null);
          }

          if ((!userSnap || !userSnap.exists()) && !isBoot && user.emailVerified && navigator.onLine) {
            const invQ = query(
              collection(db, 'invites'),
              where('email', '==', emailLower),
              where('status', '==', 'pending')
            );
            const invSnap = await getDocs(invQ);
            if (!invSnap.empty) {
              const inviteDoc = invSnap.docs[0];
              const inviteData = inviteDoc.data();
              await setDoc(userRef, {
                uid: user.uid,
                email: emailLower,
                displayName: inviteData.displayName || user.displayName || emailLower,
                role: inviteData.role || 'cashier',
                status: 'active',
                businessId: inviteData.businessId,
                ownerUid: inviteData.ownerUid,
                authorizedUids: [...new Set([...(inviteData.authorizedUids || []), user.uid])],
                inviteId: inviteDoc.id,
                canEditBills: Boolean(inviteData.canEditBills),
                canCancelBills: Boolean(inviteData.canCancelBills),
                canViewReports: Boolean(inviteData.canViewReports),
                canManageProducts: Boolean(inviteData.canManageProducts),
                ...(inviteData.phoneNumber ? { phoneNumber: String(inviteData.phoneNumber) } : {}),
                ...(inviteData.photoDataUrl ? { photoDataUrl: String(inviteData.photoDataUrl) } : {}),
                ...(inviteData.mpinHash ? { mpinHash: String(inviteData.mpinHash) } : {}),
                ...(inviteData.mpinSalt ? { mpinSalt: String(inviteData.mpinSalt) } : {}),
                ...(inviteData.mpinEnabled !== undefined ? { mpinEnabled: Boolean(inviteData.mpinEnabled) } : {}),
                ...(inviteData.mpinEnabled ? { mpinUpdatedAt: serverTimestamp() } : {}),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              await updateDoc(doc(db, 'invites', inviteDoc.id), {
                status: 'accepted',
                updatedAt: serverTimestamp(),
              });
              userSnap = await getDoc(userRef);
            }
          }

          if (userSnap && userSnap.exists()) {
            accountData = userSnap.data() as UserAccount;
            setCachedUserAccount(user.uid, accountData);
          } else if (!accountData && isBoot) {
            accountData = {
              uid: user.uid,
              email: emailLower,
              displayName: user.displayName || 'A. Prasad',
              role: 'admin',
              status: 'active',
              businessId: DEFAULT_BUSINESS_ID,
              ownerUid: user.uid,
              authorizedUids: [user.uid],
              canEditBills: true,
              canCancelBills: true,
              canViewReports: true,
              canManageProducts: true,
            };
          }
        }

        if (!accountData) {
          setAccessDeniedReason(
            `Account "${emailLower}" is not yet authorized for Sri Lakshmi Penchil Narasimha Swamy Cement Work. Ask the business administrator (${BOOT_ADMIN_EMAIL}) to create your Username & Password or invite your email under User Management.`
          );
          setUserAccount(null);
          setAuthReady(true);
          return;
        }

        if (accountData.status !== 'active') {
          setAccessDeniedReason(
            `Your account status is "${accountData.status}". Contact the business administrator to restore access.`
          );
          setUserAccount(accountData);
          setAuthReady(true);
          return;
        }

        setUserAccount(accountData);
        syncSavedCredentialsFromAccount(accountData);
        setMpinLocked(getMpinLockUid() === user.uid);
        setAuthReady(true);

        // Live listener on user account so disabling/revoking or profile updates take effect in real time
        userUnsub = onSnapshot(
          userRef,
          (snap) => {
            if (!snap.exists()) {
              setAccessDeniedReason('Your user profile was removed by an administrator.');
              setUserAccount(null);
              return;
            }
            const next = snap.data() as UserAccount;
            setCachedUserAccount(user.uid, next);
            syncSavedCredentialsFromAccount(next);
            setUserAccount((prev) => {
              if (
                prev &&
                prev.uid === next.uid &&
                prev.email === next.email &&
                prev.authEmail === next.authEmail &&
                prev.username === next.username &&
                prev.role === next.role &&
                prev.status === next.status &&
                prev.businessId === next.businessId &&
                prev.displayName === next.displayName &&
                prev.phoneNumber === next.phoneNumber &&
                prev.photoDataUrl === next.photoDataUrl &&
                prev.mpinEnabled === next.mpinEnabled &&
                prev.mpinHash === next.mpinHash &&
                prev.passwordEnabled === next.passwordEnabled &&
                prev.passwordHash === next.passwordHash &&
                prev.canEditBills === next.canEditBills &&
                prev.canCancelBills === next.canCancelBills &&
                prev.canViewReports === next.canViewReports &&
                prev.canManageProducts === next.canManageProducts
              ) {
                return prev;
              }
              return next;
            });
            if (next.status !== 'active') {
              setAccessDeniedReason(`Your account has been ${next.status} by the administrator.`);
            } else {
              setAccessDeniedReason(null);
            }
          },
          (err) => {
            if (!navigator.onLine) return;
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          }
        );

        // Sync device session silently in background (throttled every 30 mins)
        void syncDeviceInBackground(accountData, false);

        const { deviceId } = detectDeviceMeta();
        deviceUnsub = onSnapshot(
          doc(db, 'devices', deviceId),
          (snap) => {
            if (snap.exists()) {
              const d = snap.data() as DeviceSession;
              setCurrentDevice(d);
              setDeviceRevoked(d.status === 'revoked');
            }
          },
          (err) => {
            if (!navigator.onLine) return;
            handleFirestoreError(err, OperationType.GET, `devices/${deviceId}`);
          }
        );

        onlineHandler = () => {
          if (accountData) {
            void syncDeviceInBackground(accountData, false);
          }
        };
        window.addEventListener('online', onlineHandler);
      } catch (err) {
        const cached = getCachedUserAccount(user.uid);
        if (cached && cached.status === 'active') {
          setUserAccount(cached);
          syncSavedCredentialsFromAccount(cached);
          setMpinLocked(getMpinLockUid() === user.uid);
          setAuthReady(true);
        } else {
          setAuthError(err instanceof Error ? err.message : 'Failed to initialize user session.');
          setAuthReady(true);
        }
      }
    });

    return () => {
      unsubscribe();
      if (deviceUnsub) deviceUnsub();
      if (userUnsub) userUnsub();
      if (onlineHandler) window.removeEventListener('online', onlineHandler);
    };
  }, [syncSavedCredentialsFromAccount]);

  const signInWithGoogleRedirect = useCallback(
    async (rememberMe = true, loginHint?: string) => {
      setAuthError(null);
      setUnauthorizedDomainHost(null);
      setEmailPasswordDisabled(false);
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
        if (loginHint) {
          googleProvider.setCustomParameters({ prompt: 'select_account', login_hint: loginHint });
        } else {
          googleProvider.setCustomParameters({ prompt: 'select_account' });
        }
        await signInWithRedirect(auth, googleProvider);
      } catch (err) {
        const formatted = formatGoogleAuthError(err);
        setUnauthorizedDomainHost(formatted.unauthorizedHost);
        setAuthError(formatted.message);
        throw err;
      }
    },
    [formatGoogleAuthError]
  );

  const signInWithGoogle = useCallback(
    async (rememberMe = true, loginHint?: string) => {
      setAuthError(null);
      setUnauthorizedDomainHost(null);
      setEmailPasswordDisabled(false);
      if (!navigator.onLine) {
        const offlineMsg =
          'No internet connection for Google Sign-In. Use Username & Password or 4-Digit MPIN to unlock offline.';
        setAuthError(offlineMsg);
        throw new Error(offlineMsg);
      }
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
        if (loginHint) {
          googleProvider.setCustomParameters({ prompt: 'select_account', login_hint: loginHint });
        } else {
          googleProvider.setCustomParameters({ prompt: 'select_account' });
        }
        const cred = await signInWithPopup(auth, googleProvider);
        setMpinLockUid(null);
        setMpinLocked(false);
        setOfflineUnlockedUid(null);
        setOfflineUnlockedUidState(null);
        if (cred.user?.uid) {
          const next = recordMpinAttempt(cred.user.uid, true);
          setSavedMpinProfiles(next.profiles);
        }
      } catch (err) {
        const formatted = formatGoogleAuthError(err);
        if (
          formatted.code === 'auth/popup-blocked' ||
          formatted.code === 'auth/operation-not-supported-in-this-environment'
        ) {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        setUnauthorizedDomainHost(formatted.unauthorizedHost);
        setAuthError(formatted.message);
        throw err;
      }
    },
    [formatGoogleAuthError]
  );

  const signInWithUsernamePassword = useCallback(
    async (usernameOrEmail: string, password: string, rememberMe = true) => {
      setAuthError(null);
      setUnauthorizedDomainHost(null);
      setEmailPasswordDisabled(false);

      const identifier = normalizeUsername(usernameOrEmail);
      if (!identifier) {
        throw new Error('Enter your username or email.');
      }
      if (!isValidSecretPassword(password)) {
        throw new Error('Password must be at least 4 characters.');
      }

      // Offline authentication path using locally verified PBKDF2-SHA256 credential profiles
      if (!navigator.onLine) {
        const savedProfile = findSavedPasswordProfileByIdentifier(identifier);
        if (!savedProfile) {
          throw new Error(
            'This username has not been synced to this device yet. Connect to the internet once to sign in, then offline login works automatically.'
          );
        }
        const ok = await verifySecretPassword(password, savedProfile.passwordSalt, savedProfile.passwordHash);
        if (!ok) {
          throw new Error('Incorrect username or password.');
        }
        const cachedAccount = getCachedUserAccount(savedProfile.uid);
        if (!cachedAccount || cachedAccount.status !== 'active') {
          throw new Error('Cached business account unavailable or inactive on this device.');
        }

        // If Firebase already holds this user's session in IndexedDB, just unlock immediately
        if (firebaseUser?.uid === savedProfile.uid) {
          setMpinLockUid(null);
          setMpinLocked(false);
          setOfflineUnlockedUid(null);
          setOfflineUnlockedUidState(null);
          return;
        }

        setMpinLockUid(null);
        setMpinLocked(false);
        setOfflineUnlockedUid(savedProfile.uid);
        setOfflineUnlockedUidState(savedProfile.uid);
        setUserAccount(cachedAccount);
        setAuthReady(true);
        return;
      }

      // Online Firebase Authentication path (works anywhere with zero data loss)
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

      let resolvedAuthEmail = '';
      const savedLocal = findSavedPasswordProfileByIdentifier(identifier);

      if (isValidUsername(identifier)) {
        const idxSnap = await getDoc(doc(db, 'usernameIndex', identifier)).catch(() => null);
        if (idxSnap && idxSnap.exists()) {
          const idxData = idxSnap.data() as { authEmail?: string; active?: boolean };
          if (idxData.active === false) {
            throw new Error('This username has been disabled by the administrator.');
          }
          resolvedAuthEmail = (idxData.authEmail || '').toLowerCase();
        }
      }

      if (!resolvedAuthEmail) {
        if (identifier.includes('@')) {
          resolvedAuthEmail = identifier;
        } else if (savedLocal?.authEmail) {
          resolvedAuthEmail = savedLocal.authEmail.toLowerCase();
        } else {
          throw new Error(
            `Username "${identifier}" not found. Check spelling or ask the business owner to set up your username.`
          );
        }
      }

      try {
        // Fast unlock if locked on the exact same Firebase user and password matches
        if (firebaseUser && userAccount && savedLocal?.uid === firebaseUser.uid) {
          const matchesLocal = await verifySecretPassword(
            password,
            savedLocal.passwordSalt,
            savedLocal.passwordHash
          );
          if (matchesLocal) {
            setMpinLockUid(null);
            setMpinLocked(false);
            setOfflineUnlockedUid(null);
            setOfflineUnlockedUidState(null);
            return;
          }
        }

        const firebasePwd = toFirebaseAuthPassword(password);
        const cred = await signInWithEmailAndPassword(auth, resolvedAuthEmail, firebasePwd);
        setMpinLockUid(null);
        setMpinLocked(false);
        setOfflineUnlockedUid(null);
        setOfflineUnlockedUidState(null);
        if (cred.user?.uid) {
          const next = recordMpinAttempt(cred.user.uid, true);
          setSavedMpinProfiles(next.profiles);
        }
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code || '')
            : '';
        if (code === 'auth/operation-not-allowed') {
          setEmailPasswordDisabled(true);
          const msg =
            'Email/Password sign-in needs to be enabled once in Firebase Console → Authentication → Sign-in method → Email/Password.';
          setAuthError(msg);
          throw new Error(msg);
        }
        if (
          code === 'auth/wrong-password' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-email'
        ) {
          const msg = 'Incorrect username or password.';
          setAuthError(msg);
          throw new Error(msg);
        }
        if (code === 'auth/too-many-requests') {
          const msg = 'Too many failed sign-in attempts. Please wait a minute and retry.';
          setAuthError(msg);
          throw new Error(msg);
        }
        const msg = err instanceof Error ? err.message : 'Sign-in failed.';
        setAuthError(msg);
        throw new Error(msg);
      }
    },
    [firebaseUser, userAccount]
  );

  const setupMyUsernamePassword = useCallback(
    async (usernameRaw: string, passwordInput: string) => {
      if (!firebaseUser || !userAccount) {
        throw new Error('Please connect to the internet and sign in to set Username & Password.');
      }
      if (!navigator.onLine) {
        throw new Error('Internet connection required to create or update Username & Password.');
      }
      const username = normalizeUsername(usernameRaw);
      if (!isValidUsername(username)) {
        throw new Error('Username must be 3-40 characters (letters, numbers, dot, underscore, or hyphen).');
      }
      if (!isValidSecretPassword(passwordInput)) {
        throw new Error('Password must be at least 4 characters long.');
      }

      const existingIdx = await getDoc(doc(db, 'usernameIndex', username));
      if (existingIdx.exists()) {
        const idxData = existingIdx.data() as { uid?: string; active?: boolean };
        if (idxData.uid !== firebaseUser.uid && idxData.active !== false) {
          throw new Error(`Username "@${username}" is already taken by another account.`);
        }
      }

      const authEmail = (
        userAccount.authEmail ||
        firebaseUser.email ||
        usernameToSyntheticEmail(username)
      ).toLowerCase();

      const firebasePwd = toFirebaseAuthPassword(passwordInput);
      const hasPasswordProvider = firebaseUser.providerData.some((p) => p.providerId === 'password');

      const applyFirebasePassword = async () => {
        if (hasPasswordProvider) {
          await updatePassword(firebaseUser, firebasePwd);
        } else {
          try {
            await linkWithCredential(firebaseUser, EmailAuthProvider.credential(authEmail, firebasePwd));
          } catch (linkErr) {
            const linkCode =
              typeof linkErr === 'object' && linkErr !== null && 'code' in linkErr
                ? String((linkErr as { code?: unknown }).code || '')
                : '';
            if (linkCode === 'auth/provider-already-linked') {
              await updatePassword(firebaseUser, firebasePwd);
            } else {
              throw linkErr;
            }
          }
        }
      };

      try {
        await applyFirebasePassword();
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code || '')
            : '';
        if (code === 'auth/requires-recent-login') {
          if (firebaseUser.providerData.some((p) => p.providerId === 'google.com')) {
            await reauthenticateWithPopup(firebaseUser, googleProvider);
            await applyFirebasePassword();
          } else {
            throw new Error('For security, please sign out and sign back in, then update your password.');
          }
        } else if (code === 'auth/operation-not-allowed') {
          setEmailPasswordDisabled(true);
          throw new Error(
            'Enable Email/Password in Firebase Console → Authentication → Sign-in method so you can log in with Username & Password from any device.'
          );
        } else {
          throw err;
        }
      }

      const salt = generateMpinSalt();
      const hash = await hashSecretPassword(passwordInput, salt);

      if (userAccount.username && userAccount.username !== username) {
        await deleteDoc(doc(db, 'usernameIndex', userAccount.username)).catch(() => {});
      }

      await setDoc(doc(db, 'usernameIndex', username), {
        username,
        authEmail,
        uid: firebaseUser.uid,
        businessId: userAccount.businessId || DEFAULT_BUSINESS_ID,
        active: true,
        createdAt: existingIdx.exists() ? existingIdx.data().createdAt || serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        username,
        authEmail,
        passwordHash: hash,
        passwordSalt: salt,
        passwordEnabled: true,
        passwordUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const nextAccount: UserAccount = {
        ...userAccount,
        username,
        authEmail,
        passwordHash: hash,
        passwordSalt: salt,
        passwordEnabled: true,
      };
      setUserAccount(nextAccount);
      setCachedUserAccount(firebaseUser.uid, nextAccount);
      syncSavedCredentialsFromAccount(nextAccount);
    },
    [firebaseUser, userAccount, syncSavedCredentialsFromAccount]
  );

  const resetPasswordByUsernameOrEmail = useCallback(async (usernameOrEmail: string): Promise<string> => {
    if (!navigator.onLine) {
      throw new Error('Connect to the internet to send a password reset email.');
    }
    const clean = normalizeUsername(usernameOrEmail);
    if (!clean) throw new Error('Enter your username or email address first.');

    let targetEmail = '';
    if (isValidUsername(clean)) {
      const idxSnap = await getDoc(doc(db, 'usernameIndex', clean)).catch(() => null);
      if (idxSnap && idxSnap.exists()) {
        targetEmail = String(idxSnap.data().authEmail || '').toLowerCase();
      }
    }
    if (!targetEmail && clean.includes('@')) {
      targetEmail = clean;
    }
    if (!targetEmail) {
      throw new Error('Username or email not found.');
    }
    if (targetEmail.endsWith('@slpstaff.local')) {
      throw new Error(
        'This staff login uses a store username without a personal email. Ask the business owner in User Management to set a new password.'
      );
    }
    await sendPasswordResetEmail(auth, targetEmail);
    return targetEmail;
  }, []);

  const signInWithMpin = useCallback(
    async (uid: string, pin: string) => {
      setAuthError(null);
      if (!isValidFourDigitMpin(pin)) {
        throw new Error('Please enter all 4 numeric digits.');
      }

      const profiles = loadSavedMpinProfiles();
      const target = profiles.find((p) => p.uid === uid);

      const expectedHash =
        (firebaseUser?.uid === uid || offlineUnlockedUidState === uid) && userAccount?.mpinHash
          ? userAccount.mpinHash
          : target?.mpinHash;
      const expectedSalt =
        (firebaseUser?.uid === uid || offlineUnlockedUidState === uid) && userAccount?.mpinSalt
          ? userAccount.mpinSalt
          : target?.mpinSalt;

      if (!target && !((firebaseUser?.uid === uid || offlineUnlockedUidState === uid) && userAccount?.mpinEnabled)) {
        throw new Error('MPIN is not configured for this device yet. Sign in first.');
      }

      if (target?.lockedUntilGoogle) {
        throw new Error('MPIN temporarily locked after 5 failed attempts. Sign in with Username & Password or Google to unlock.');
      }

      if (!expectedHash || !expectedSalt) {
        throw new Error('MPIN credentials missing. Sign in with Username & Password or Google.');
      }

      const ok = await verifyMpinHash(pin, expectedSalt, expectedHash);
      if (!ok) {
        const attemptResult = recordMpinAttempt(uid, false);
        setSavedMpinProfiles(attemptResult.profiles);
        if (attemptResult.locked) {
          throw new Error('Too many wrong attempts. Use Username & Password or Google to unlock.');
        }
        throw new Error(`Incorrect 4-digit MPIN. ${attemptResult.remainingAttempts} attempt(s) left.`);
      }

      const attemptResult = recordMpinAttempt(uid, true);
      setSavedMpinProfiles(attemptResult.profiles);

      // Fast local/offline unlock when Firebase session matches OR cached user exists offline
      if (firebaseUser?.uid === uid && userAccount?.status === 'active') {
        setMpinLockUid(null);
        setMpinLocked(false);
        return;
      }

      const cached = getCachedUserAccount(uid);
      if (cached && cached.status === 'active' && (!navigator.onLine || target?.email?.endsWith('@slpstaff.local'))) {
        setMpinLockUid(null);
        setMpinLocked(false);
        setOfflineUnlockedUid(uid);
        setOfflineUnlockedUidState(uid);
        setUserAccount(cached);
        setAuthReady(true);
        return;
      }

      if (!navigator.onLine) {
        throw new Error(
          'Please connect to the internet once to complete account verification on this device.'
        );
      }

      if (target?.email && !target.email.endsWith('@slpstaff.local')) {
        await signInWithGoogle(true, target.email);
        return;
      }

      throw new Error('Please sign in once with your Username & Password to activate MPIN on this device.');
    },
    [firebaseUser?.uid, offlineUnlockedUidState, userAccount, signInWithGoogle]
  );

  const lockWithMpin = useCallback(() => {
    const uid = firebaseUser?.uid || offlineUnlockedUidState;
    if (!uid) return;
    setMpinLockUid(uid);
    setMpinLocked(true);
  }, [firebaseUser?.uid, offlineUnlockedUidState]);

  const fullSignOut = useCallback(async () => {
    const uid = firebaseUser?.uid || offlineUnlockedUidState;
    if (uid) {
      removeCachedUserAccount(uid);
    }
    setMpinLockUid(null);
    setMpinLocked(false);
    setOfflineUnlockedUid(null);
    setOfflineUnlockedUidState(null);
    activeAuthUidRef.current = null;
    await signOut(auth);
  }, [firebaseUser?.uid, offlineUnlockedUidState]);

  const logout = useCallback(async () => {
    const uid = firebaseUser?.uid || offlineUnlockedUidState;
    if (uid && (userAccount?.mpinEnabled || userAccount?.passwordEnabled || !navigator.onLine)) {
      setMpinLockUid(uid);
      setMpinLocked(true);
      return;
    }
    await fullSignOut();
  }, [firebaseUser?.uid, offlineUnlockedUidState, userAccount?.mpinEnabled, userAccount?.passwordEnabled, fullSignOut]);

  const updateMyProfile = useCallback(
    async (updates: { displayName: string; phoneNumber?: string; photoDataUrl?: string }) => {
      const uid = firebaseUser?.uid || offlineUnlockedUidState;
      if (!uid || !userAccount) {
        throw new Error('Sign in required to update profile.');
      }
      const cleanName = updates.displayName.trim().slice(0, 120);
      if (!cleanName) throw new Error('Full name cannot be empty.');
      const cleanPhone = (updates.phoneNumber || '').trim().slice(0, 30);
      const cleanPhoto = (updates.photoDataUrl || '').slice(0, 120000);

      await commitWithOfflineSupport(
        updateDoc(doc(db, 'users', uid), {
          displayName: cleanName,
          phoneNumber: cleanPhone,
          photoDataUrl: cleanPhoto,
          updatedAt: serverTimestamp(),
        })
      );

      const nextAccount: UserAccount = {
        ...userAccount,
        displayName: cleanName,
        phoneNumber: cleanPhone,
        photoDataUrl: cleanPhoto,
      };
      setUserAccount(nextAccount);
      setCachedUserAccount(uid, nextAccount);
      syncSavedCredentialsFromAccount(nextAccount);
    },
    [firebaseUser?.uid, offlineUnlockedUidState, userAccount, syncSavedCredentialsFromAccount]
  );

  const changeMyEmail = useCallback(
    async (newEmailRaw: string) => {
      const uid = firebaseUser?.uid;
      if (!uid || !userAccount) {
        throw new Error('Online sign-in required to change authorized email.');
      }
      if (!navigator.onLine) {
        throw new Error('Please connect to the internet to update your authorized email.');
      }
      const cleanEmail = newEmailRaw.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 160) {
        throw new Error('Enter a valid email address.');
      }
      if (cleanEmail === userAccount.email.toLowerCase()) {
        throw new Error('This email is already active on your profile.');
      }

      const businessId = userAccount.businessId || DEFAULT_BUSINESS_ID;
      const bizRef = doc(db, 'businesses', businessId);
      const bizSnap = await getDoc(bizRef);
      const existingEmails: string[] = bizSnap.exists()
        ? (bizSnap.data().authorizedEmails as string[]) || []
        : [];
      const nextEmails = [...new Set([...existingEmails, cleanEmail])];

      await updateDoc(bizRef, {
        authorizedEmails: nextEmails,
        updatedAt: serverTimestamp(),
      });

      const inviteId = emailToInviteId(cleanEmail);
      const transferRole: UserRole = userAccount.role === 'admin' && isBootOrAdminEmail(userAccount) ? 'admin' : 'cashier';
      await setDoc(doc(db, 'invites', inviteId), {
        id: inviteId,
        businessId,
        ownerUid: userAccount.ownerUid,
        authorizedUids: userAccount.authorizedUids,
        email: cleanEmail,
        displayName: userAccount.displayName,
        role: transferRole,
        status: 'pending',
        canEditBills: transferRole === 'admin' ? Boolean(userAccount.canEditBills) : false,
        canCancelBills: transferRole === 'admin' ? Boolean(userAccount.canCancelBills) : false,
        canViewReports: transferRole === 'admin' ? Boolean(userAccount.canViewReports) : false,
        canManageProducts: transferRole === 'admin' ? Boolean(userAccount.canManageProducts) : false,
        ...(userAccount.phoneNumber ? { phoneNumber: userAccount.phoneNumber } : {}),
        ...(userAccount.photoDataUrl ? { photoDataUrl: userAccount.photoDataUrl } : {}),
        ...(userAccount.mpinHash ? { mpinHash: userAccount.mpinHash } : {}),
        ...(userAccount.mpinSalt ? { mpinSalt: userAccount.mpinSalt } : {}),
        ...(userAccount.mpinEnabled !== undefined ? { mpinEnabled: Boolean(userAccount.mpinEnabled) } : {}),
        previousUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', uid), {
        email: cleanEmail,
        updatedAt: serverTimestamp(),
      });

      const nextAccount: UserAccount = {
        ...userAccount,
        email: cleanEmail,
      };
      setUserAccount(nextAccount);
      setCachedUserAccount(uid, nextAccount);
      syncSavedCredentialsFromAccount(nextAccount);
    },
    [firebaseUser?.uid, userAccount, syncSavedCredentialsFromAccount]
  );

  const setupMyMpin = useCallback(
    async (pin: string) => {
      const uid = firebaseUser?.uid || offlineUnlockedUidState;
      if (!uid || !userAccount) {
        throw new Error('Sign in required to create MPIN.');
      }
      if (!isValidFourDigitMpin(pin)) {
        throw new Error('MPIN must be exactly 4 numeric digits.');
      }
      const salt = generateMpinSalt();
      const hash = await hashMpin(pin, salt);

      await commitWithOfflineSupport(
        updateDoc(doc(db, 'users', uid), {
          mpinHash: hash,
          mpinSalt: salt,
          mpinEnabled: true,
          mpinUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      const nextAccount: UserAccount = {
        ...userAccount,
        mpinHash: hash,
        mpinSalt: salt,
        mpinEnabled: true,
      };
      setUserAccount(nextAccount);
      setCachedUserAccount(uid, nextAccount);
      syncSavedCredentialsFromAccount(nextAccount, true);
    },
    [firebaseUser?.uid, offlineUnlockedUidState, userAccount, syncSavedCredentialsFromAccount]
  );

  const disableMyMpin = useCallback(async () => {
    const uid = firebaseUser?.uid || offlineUnlockedUidState;
    if (!uid || !userAccount) return;
    await commitWithOfflineSupport(
      updateDoc(doc(db, 'users', uid), {
        mpinHash: '',
        mpinSalt: '',
        mpinEnabled: false,
        updatedAt: serverTimestamp(),
      })
    );
    const nextAccount: UserAccount = {
      ...userAccount,
      mpinHash: '',
      mpinSalt: '',
      mpinEnabled: false,
    };
    setUserAccount(nextAccount);
    setCachedUserAccount(uid, nextAccount);
    syncSavedCredentialsFromAccount(nextAccount);
  }, [firebaseUser?.uid, offlineUnlockedUidState, userAccount, syncSavedCredentialsFromAccount]);

  const removeSavedMpinProfile = useCallback((uid: string) => {
    const next = removeSavedMpinProfileByUid(uid);
    setSavedMpinProfiles(next);
  }, []);

  const activeUid = firebaseUser?.uid || offlineUnlockedUidState || userAccount?.uid || '';
  const role = userAccount?.role || null;
  const isAdmin =
    role === 'admin' ||
    firebaseUser?.email?.toLowerCase() === BOOT_ADMIN_EMAIL ||
    userAccount?.email?.toLowerCase() === BOOT_ADMIN_EMAIL;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userAccount,
        activeUid,
        currentDevice,
        deviceRevoked,
        authReady,
        authError,
        unauthorizedDomainHost,
        emailPasswordDisabled,
        accessDeniedReason,
        role,
        isAdmin,
        theme,
        toggleTheme,
        language,
        toggleLanguage,
        mpinLocked,
        savedMpinProfiles,
        savedPasswordProfiles,
        signInWithGoogle,
        signInWithGoogleRedirect,
        signInWithUsernamePassword,
        setupMyUsernamePassword,
        resetPasswordByUsernameOrEmail,
        signInWithMpin,
        lockWithMpin,
        logout,
        fullSignOut,
        updateMyProfile,
        changeMyEmail,
        setupMyMpin,
        disableMyMpin,
        removeSavedMpinProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

function isBootOrAdminEmail(account: UserAccount): boolean {
  return account.role === 'admin' || account.email.toLowerCase() === BOOT_ADMIN_EMAIL;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
