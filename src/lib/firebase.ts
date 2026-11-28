import { initializeApp, getApps } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider, inMemoryPersistence, initializeAuth } from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  waitForPendingWrites,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          localCache: memoryLocalCache(),
          experimentalForceLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const firebaseProjectId = firebaseConfig.projectId;
export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function getStaffProvisionerAuth(): Auth {
  const name = 'StaffProvisioner';
  const existing = getApps().find((a) => a.name === name);
  if (existing) {
    return getAuth(existing);
  }
  const secondaryApp = initializeApp(firebaseConfig, name);
  try {
    return initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
  } catch {
    return getAuth(secondaryApp);
  }
}

export { waitForPendingWrites };

/**
 * Resolves immediately after Firestore queues a write into IndexedDB when offline
 * or when network acknowledgment exceeds a short timeout, while still syncing
 * automatically in the background when connectivity returns.
 */
export async function commitWithOfflineSupport(writePromise: Promise<unknown>): Promise<{ syncedToCloud: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    writePromise.catch((err) => {
      console.warn('Queued offline Firestore write encountered async error on flush:', err);
    });
    await new Promise((resolve) => setTimeout(resolve, 140));
    return { syncedToCloud: false };
  }

  let timedOut = false;
  const timeoutPromise = new Promise<{ syncedToCloud: boolean }>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve({ syncedToCloud: false });
    }, 3500);
  });

  writePromise.catch((err) => {
    if (timedOut) {
      console.warn('Deferred cloud write flush error:', err);
    }
  });

  return Promise.race([
    writePromise.then(() => ({ syncedToCloud: true })),
    timeoutPromise,
  ]);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isTransientFirestoreNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  const errObj = error as { code?: string; message?: string } | null;
  const code = (errObj?.code || '').toLowerCase();
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();

  if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
    return false;
  }

  if (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'cancelled' ||
    code === 'resource-exhausted'
  ) {
    return true;
  }

  return (
    msg.includes('the client is offline') ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes("backend didn't respond") ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('connection failed')
  );
}

export async function testConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isTransientFirestoreNetworkError(error)) {
      console.warn('Firestore running in offline mode using local cache.');
      return false;
    }
    // Permission error or missing doc still confirms network reachability to Firestore
    return true;
  }
}

export function generateSafeId(prefix = 'id'): string {
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now()}_${hex}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function generateSecureToken(): string {
  const randomBytes = new Uint8Array(18);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function emailToInviteId(email: string): string {
  return `inv_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 120);
}

export function formatTimestamp(ts: unknown): Date {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    return new Date(ts);
  }
  return new Date();
}
