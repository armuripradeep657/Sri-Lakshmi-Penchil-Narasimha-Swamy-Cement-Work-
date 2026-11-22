import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  collection,
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
  generateMpinSalt,
  getMpinLockUid,
  hashMpin,
  isValidSixDigitMpin,
  loadSavedMpinProfiles,
  recordMpinAttempt,
  removeSavedMpinProfileByUid,
  SavedMpinProfile,
  setMpinLockUid,
  upsertSavedMpinProfile,
  verifyMpinHash,
} from '../lib/mpinCrypto';
import { BOOT_ADMIN_EMAIL, DEFAULT_BUSINESS_ID, ensureBusinessSeeded } from '../lib/seedData';
import { DeviceSession, Language, ThemeMode, UserAccount, UserRole } from '../types/billing';

interface AuthContextValue {
  firebaseUser: User | null;
  userAccount: UserAccount | null;
  currentDevice: DeviceSession | null;
  deviceRevoked: boolean;
  authReady: boolean;
  authError: string | null;
  accessDeniedReason: string | null;
  role: UserRole | null;
  isAdmin: boolean;
  theme: ThemeMode;
  toggleTheme: () => void;
  language: Language;
  toggleLanguage: () => void;
  mpinLocked: boolean;
  savedMpinProfiles: SavedMpinProfile[];
  signInWithGoogle: (rememberMe?: boolean, loginHint?: string) => Promise<void>;
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
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [currentDevice, setCurrentDevice] = useState<DeviceSession | null>(null);
  const [deviceRevoked, setDeviceRevoked] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);
  const [mpinLocked, setMpinLocked] = useState<boolean>(() => Boolean(getMpinLockUid()));
  const [savedMpinProfiles, setSavedMpinProfiles] = useState<SavedMpinProfile[]>(() =>
    loadSavedMpinProfiles()
  );

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

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    if (navigator.onLine) {
      testConnection();
    }
  }, []);

  const syncSavedMpinFromAccount = useCallback((account: UserAccount | null, resetAttempts = false) => {
    if (!account) return;
    if (account.mpinEnabled && account.mpinHash && account.mpinSalt && account.status === 'active') {
      const next = upsertSavedMpinProfile({
        uid: account.uid,
        email: account.email,
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
  }, []);

  useEffect(() => {
    let deviceUnsub: (() => void) | null = null;
    let userUnsub: (() => void) | null = null;
    let onlineHandler: (() => void) | null = null;

    const getCachedUserAccount = (uid: string): UserAccount | null => {
      try {
        const raw = localStorage.getItem(`slp_cached_user_${uid}`);
        return raw ? (JSON.parse(raw) as UserAccount) : null;
      } catch {
        return null;
      }
    };

    const setCachedUserAccount = (uid: string, account: UserAccount) => {
      try {
        localStorage.setItem(`slp_cached_user_${uid}`, JSON.stringify(account));
      } catch {
        // Ignore quota errors
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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

      setFirebaseUser(user);
      setAuthError(null);
      setAccessDeniedReason(null);
      setDeviceRevoked(false);

      if (!user) {
        setUserAccount(null);
        setCurrentDevice(null);
        setMpinLocked(false);
        setAuthReady(true);
        return;
      }

      if (!user.email || !user.emailVerified) {
        setAccessDeniedReason('Please sign in with a verified Google account.');
        setUserAccount(null);
        setAuthReady(true);
        return;
      }

      const emailLower = user.email.toLowerCase();
      const isBoot = emailLower === BOOT_ADMIN_EMAIL;
      const userRef = doc(db, 'users', user.uid);

      const syncDeviceInBackground = async (accountData: UserAccount) => {
        if (!navigator.onLine) return;
        try {
          if (isBoot) {
            await ensureBusinessSeeded(user.uid, emailLower, user.displayName || 'A. Prasad');
          }
          const { deviceId, deviceName, browser, deviceType } = detectDeviceMeta();
          const deviceRef = doc(db, 'devices', deviceId);
          const existingDev = await getDoc(deviceRef);
          if (existingDev.exists()) {
            const devData = existingDev.data() as DeviceSession;
            if (devData.status === 'revoked') {
              setDeviceRevoked(true);
              setCurrentDevice(devData);
              return;
            }
            await updateDoc(deviceRef, {
              deviceName,
              browser,
              lastActiveAt: serverTimestamp(),
            });
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
          }
        } catch (bgErr) {
          console.warn('Background device sync skipped while offline:', bgErr);
        }
      };

      try {
        // Fast-path: restore cached account immediately if offline or already verified before
        let accountData: UserAccount | null = getCachedUserAccount(user.uid);
        if (accountData && accountData.status === 'active') {
          setUserAccount(accountData);
          syncSavedMpinFromAccount(accountData);
          setMpinLocked(getMpinLockUid() === user.uid && Boolean(accountData.mpinEnabled));
          setAuthReady(true);
        }

        if (navigator.onLine || !accountData) {
          if (isBoot && navigator.onLine) {
            await ensureBusinessSeeded(user.uid, emailLower, user.displayName || 'A. Prasad');
          }

          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch {
            userSnap = await getDocFromCache(userRef).catch(() => null);
          }

          if ((!userSnap || !userSnap.exists()) && !isBoot && navigator.onLine) {
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
            // Boot admin offline safety fallback
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
            `Account "${emailLower}" is not yet authorized for Sri Lakshmi Penchil Narasimha Swamy Cement Work. Ask the business administrator (${BOOT_ADMIN_EMAIL}) to invite your email under User Management.`
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
        syncSavedMpinFromAccount(accountData);
        setMpinLocked(getMpinLockUid() === user.uid && Boolean(accountData.mpinEnabled));
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
            syncSavedMpinFromAccount(next);
            setUserAccount((prev) => {
              if (
                prev &&
                prev.uid === next.uid &&
                prev.email === next.email &&
                prev.role === next.role &&
                prev.status === next.status &&
                prev.businessId === next.businessId &&
                prev.displayName === next.displayName &&
                prev.phoneNumber === next.phoneNumber &&
                prev.photoDataUrl === next.photoDataUrl &&
                prev.mpinEnabled === next.mpinEnabled &&
                prev.mpinHash === next.mpinHash &&
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

        // Sync device session silently in background (never blocks offline app open)
        void syncDeviceInBackground(accountData);

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
            void syncDeviceInBackground(accountData);
          }
        };
        window.addEventListener('online', onlineHandler);
      } catch (err) {
        const cached = getCachedUserAccount(user.uid);
        if (cached && cached.status === 'active') {
          setUserAccount(cached);
          syncSavedMpinFromAccount(cached);
          setMpinLocked(getMpinLockUid() === user.uid && Boolean(cached.mpinEnabled));
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
  }, [syncSavedMpinFromAccount]);

  const signInWithGoogle = useCallback(async (rememberMe = true, loginHint?: string) => {
    setAuthError(null);
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
      if (cred.user?.uid) {
        const next = recordMpinAttempt(cred.user.uid, true);
        setSavedMpinProfiles(next.profiles);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
      throw err;
    }
  }, []);

  const signInWithMpin = useCallback(
    async (uid: string, pin: string) => {
      setAuthError(null);
      if (!isValidSixDigitMpin(pin)) {
        throw new Error('Please enter all 6 numeric digits.');
      }

      const profiles = loadSavedMpinProfiles();
      const target = profiles.find((p) => p.uid === uid);

      // Prefer live Firestore userAccount hash if same uid is active in session
      const expectedHash =
        firebaseUser?.uid === uid && userAccount?.mpinHash ? userAccount.mpinHash : target?.mpinHash;
      const expectedSalt =
        firebaseUser?.uid === uid && userAccount?.mpinSalt ? userAccount.mpinSalt : target?.mpinSalt;

      if (!target && !(firebaseUser?.uid === uid && userAccount?.mpinEnabled)) {
        throw new Error('MPIN is not configured for this device yet. Sign in with Google first.');
      }

      if (target?.lockedUntilGoogle) {
        throw new Error('MPIN temporarily locked after 5 failed attempts. Sign in with Google to unlock.');
      }

      if (!expectedHash || !expectedSalt) {
        throw new Error('MPIN credentials missing. Please sign in with Google.');
      }

      const ok = await verifyMpinHash(pin, expectedSalt, expectedHash);
      if (!ok) {
        const attemptResult = recordMpinAttempt(uid, false);
        setSavedMpinProfiles(attemptResult.profiles);
        if (attemptResult.locked) {
          throw new Error('Too many wrong attempts. Please sign in with Google to unlock MPIN.');
        }
        throw new Error(`Incorrect 6-digit MPIN. ${attemptResult.remainingAttempts} attempt(s) left.`);
      }

      const attemptResult = recordMpinAttempt(uid, true);
      setSavedMpinProfiles(attemptResult.profiles);

      // Fast local/offline unlock when the Firebase session matches this staff/admin user
      if (firebaseUser?.uid === uid && userAccount?.status === 'active') {
        setMpinLockUid(null);
        setMpinLocked(false);
        return;
      }

      // If no active Firebase session or switching to a different staff user on this shared device:
      // verify Google identity cleanly with login_hint
      if (!navigator.onLine) {
        throw new Error(
          'Please connect to the internet once to complete Google verification for this account.'
        );
      }
      await signInWithGoogle(true, target?.email);
    },
    [firebaseUser?.uid, userAccount, signInWithGoogle]
  );

  const lockWithMpin = useCallback(() => {
    if (!firebaseUser?.uid || !userAccount?.mpinEnabled) return;
    setMpinLockUid(firebaseUser.uid);
    setMpinLocked(true);
  }, [firebaseUser?.uid, userAccount?.mpinEnabled]);

  const fullSignOut = useCallback(async () => {
    if (firebaseUser?.uid) {
      try {
        localStorage.removeItem(`slp_cached_user_${firebaseUser.uid}`);
      } catch {
        // ignore
      }
    }
    setMpinLockUid(null);
    setMpinLocked(false);
    await signOut(auth);
  }, [firebaseUser?.uid]);

  const logout = useCallback(async () => {
    if (firebaseUser?.uid && userAccount?.mpinEnabled) {
      setMpinLockUid(firebaseUser.uid);
      setMpinLocked(true);
      return;
    }
    await fullSignOut();
  }, [firebaseUser?.uid, userAccount?.mpinEnabled, fullSignOut]);

  const updateMyProfile = useCallback(
    async (updates: { displayName: string; phoneNumber?: string; photoDataUrl?: string }) => {
      if (!firebaseUser || !userAccount) {
        throw new Error('Sign in required to update profile.');
      }
      const cleanName = updates.displayName.trim().slice(0, 120);
      if (!cleanName) throw new Error('Full name cannot be empty.');
      const cleanPhone = (updates.phoneNumber || '').trim().slice(0, 30);
      const cleanPhoto = (updates.photoDataUrl || '').slice(0, 120000);

      await commitWithOfflineSupport(
        updateDoc(doc(db, 'users', firebaseUser.uid), {
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
      try {
        localStorage.setItem(`slp_cached_user_${firebaseUser.uid}`, JSON.stringify(nextAccount));
      } catch {
        // ignore
      }
      syncSavedMpinFromAccount(nextAccount);
    },
    [firebaseUser, userAccount, syncSavedMpinFromAccount]
  );

  const changeMyEmail = useCallback(
    async (newEmailRaw: string) => {
      if (!firebaseUser || !userAccount) {
        throw new Error('Sign in required to change email.');
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
        previousUid: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        email: cleanEmail,
        updatedAt: serverTimestamp(),
      });

      const nextAccount: UserAccount = {
        ...userAccount,
        email: cleanEmail,
      };
      setUserAccount(nextAccount);
      try {
        localStorage.setItem(`slp_cached_user_${firebaseUser.uid}`, JSON.stringify(nextAccount));
      } catch {
        // ignore
      }
      syncSavedMpinFromAccount(nextAccount);
    },
    [firebaseUser, userAccount, syncSavedMpinFromAccount]
  );

  const setupMyMpin = useCallback(
    async (pin: string) => {
      if (!firebaseUser || !userAccount) {
        throw new Error('Sign in required to create MPIN.');
      }
      if (!isValidSixDigitMpin(pin)) {
        throw new Error('MPIN must be exactly 6 numeric digits.');
      }
      const salt = generateMpinSalt();
      const hash = await hashMpin(pin, salt);

      await commitWithOfflineSupport(
        updateDoc(doc(db, 'users', firebaseUser.uid), {
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
      try {
        localStorage.setItem(`slp_cached_user_${firebaseUser.uid}`, JSON.stringify(nextAccount));
      } catch {
        // ignore
      }
      syncSavedMpinFromAccount(nextAccount, true);
    },
    [firebaseUser, userAccount, syncSavedMpinFromAccount]
  );

  const disableMyMpin = useCallback(async () => {
    if (!firebaseUser || !userAccount) return;
    await commitWithOfflineSupport(
      updateDoc(doc(db, 'users', firebaseUser.uid), {
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
    try {
      localStorage.setItem(`slp_cached_user_${firebaseUser.uid}`, JSON.stringify(nextAccount));
    } catch {
      // ignore
    }
    syncSavedMpinFromAccount(nextAccount);
  }, [firebaseUser, userAccount, syncSavedMpinFromAccount]);

  const removeSavedMpinProfile = useCallback((uid: string) => {
    const next = removeSavedMpinProfileByUid(uid);
    setSavedMpinProfiles(next);
  }, []);

  const role = userAccount?.role || null;
  const isAdmin = role === 'admin' || firebaseUser?.email?.toLowerCase() === BOOT_ADMIN_EMAIL;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userAccount,
        currentDevice,
        deviceRevoked,
        authReady,
        authError,
        accessDeniedReason,
        role,
        isAdmin,
        theme,
        toggleTheme,
        language,
        toggleLanguage,
        mpinLocked,
        savedMpinProfiles,
        signInWithGoogle,
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
