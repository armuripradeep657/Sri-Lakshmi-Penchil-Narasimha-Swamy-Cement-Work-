import { UserAccount, UserRole } from '../types/billing';

export interface SavedMpinProfile {
  uid: string;
  email: string;
  username?: string;
  displayName: string;
  phoneNumber?: string;
  photoDataUrl?: string;
  role: UserRole;
  mpinHash: string;
  mpinSalt: string;
  failedAttempts: number;
  lockedUntilGoogle: boolean;
  updatedAt: number;
}

export interface SavedPasswordProfile {
  uid: string;
  username: string;
  email: string;
  authEmail: string;
  displayName: string;
  phoneNumber?: string;
  photoDataUrl?: string;
  role: UserRole;
  passwordHash: string;
  passwordSalt: string;
  updatedAt: number;
}

const MPIN_PROFILES_KEY = 'slp_mpin_profiles_v1';
const MPIN_LOCK_UID_KEY = 'slp_mpin_locked_uid';
const PASSWORD_PROFILES_KEY = 'slp_password_profiles_v1';
const OFFLINE_UNLOCKED_UID_KEY = 'slp_offline_unlocked_uid';
const MAX_MPIN_ATTEMPTS = 5;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

async function derivePbkdf2Hex(secret: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBytes = hexToBytes(saltHex);
  const saltBuffer = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength
  ) as ArrayBuffer;
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isValidFourDigitMpin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

export function isValidSecretPassword(password: string): boolean {
  return password.length >= 4 && password.length <= 128;
}

/**
 * Firebase Auth requires >= 6 characters. For short 4-5 char PIN-style passwords
 * entered by shop owners/staff, wrap deterministically for Firebase Auth while
 * salted PBKDF2-SHA256 still hashes & verifies the exact user-entered password.
 */
export function toFirebaseAuthPassword(password: string): string {
  if (password.length >= 6) return password;
  return `SlpAuth#v1#${password}#key`;
}

export function usernameToSyntheticEmail(username: string): string {
  return `${normalizeUsername(username)}@slpstaff.local`;
}

export function generateMpinSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashMpin(pin: string, saltHex: string): Promise<string> {
  if (!isValidFourDigitMpin(pin)) {
    throw new Error('MPIN must be exactly 4 numeric digits.');
  }
  return derivePbkdf2Hex(pin, saltHex);
}

export async function verifyMpinHash(
  pin: string,
  saltHex: string,
  expectedHash: string
): Promise<boolean> {
  if (!isValidFourDigitMpin(pin) || !saltHex || !expectedHash) return false;
  const computed = await hashMpin(pin, saltHex);
  return constantTimeEqual(computed, expectedHash);
}

export async function hashSecretPassword(password: string, saltHex: string): Promise<string> {
  if (!isValidSecretPassword(password)) {
    throw new Error('Password must be at least 4 characters long.');
  }
  return derivePbkdf2Hex(password, saltHex);
}

export async function verifySecretPassword(
  password: string,
  saltHex: string,
  expectedHash: string
): Promise<boolean> {
  if (!isValidSecretPassword(password) || !saltHex || !expectedHash) return false;
  const computed = await derivePbkdf2Hex(password, saltHex);
  return constantTimeEqual(computed, expectedHash);
}

export function loadSavedMpinProfiles(): SavedMpinProfile[] {
  try {
    const raw = localStorage.getItem(MPIN_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SavedMpinProfile =>
        Boolean(p && typeof p.uid === 'string' && typeof p.mpinHash === 'string' && typeof p.mpinSalt === 'string')
    );
  } catch {
    return [];
  }
}

function saveMpinProfiles(profiles: SavedMpinProfile[]) {
  try {
    localStorage.setItem(MPIN_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore storage quota errors
  }
}

export function upsertSavedMpinProfile(
  profile: Omit<SavedMpinProfile, 'failedAttempts' | 'lockedUntilGoogle' | 'updatedAt'> & {
    resetAttempts?: boolean;
  }
): SavedMpinProfile[] {
  const existing = loadSavedMpinProfiles();
  const prev = existing.find((p) => p.uid === profile.uid);
  const nextItem: SavedMpinProfile = {
    uid: profile.uid,
    email: profile.email,
    username: profile.username || prev?.username || '',
    displayName: profile.displayName,
    phoneNumber: profile.phoneNumber || '',
    photoDataUrl: profile.photoDataUrl || '',
    role: profile.role,
    mpinHash: profile.mpinHash,
    mpinSalt: profile.mpinSalt,
    failedAttempts: profile.resetAttempts ? 0 : prev?.failedAttempts ?? 0,
    lockedUntilGoogle: profile.resetAttempts ? false : prev?.lockedUntilGoogle ?? false,
    updatedAt: Date.now(),
  };
  const next = [nextItem, ...existing.filter((p) => p.uid !== profile.uid)].slice(0, 12);
  saveMpinProfiles(next);
  return next;
}

export function recordMpinAttempt(
  uid: string,
  success: boolean
): { profiles: SavedMpinProfile[]; remainingAttempts: number; locked: boolean } {
  const existing = loadSavedMpinProfiles();
  let remainingAttempts = MAX_MPIN_ATTEMPTS;
  let locked = false;

  const next = existing.map((p) => {
    if (p.uid !== uid) return p;
    if (success) {
      remainingAttempts = MAX_MPIN_ATTEMPTS;
      locked = false;
      return { ...p, failedAttempts: 0, lockedUntilGoogle: false, updatedAt: Date.now() };
    }
    const attempts = (p.failedAttempts || 0) + 1;
    locked = attempts >= MAX_MPIN_ATTEMPTS;
    remainingAttempts = Math.max(0, MAX_MPIN_ATTEMPTS - attempts);
    return {
      ...p,
      failedAttempts: attempts,
      lockedUntilGoogle: locked,
      updatedAt: Date.now(),
    };
  });

  saveMpinProfiles(next);
  return { profiles: next, remainingAttempts, locked };
}

export function removeSavedMpinProfileByUid(uid: string): SavedMpinProfile[] {
  const next = loadSavedMpinProfiles().filter((p) => p.uid !== uid);
  saveMpinProfiles(next);
  if (getMpinLockUid() === uid) {
    setMpinLockUid(null);
  }
  return next;
}

export function loadSavedPasswordProfiles(): SavedPasswordProfile[] {
  try {
    const raw = localStorage.getItem(PASSWORD_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SavedPasswordProfile =>
        Boolean(
          p &&
            typeof p.uid === 'string' &&
            typeof p.username === 'string' &&
            typeof p.passwordHash === 'string' &&
            typeof p.passwordSalt === 'string'
        )
    );
  } catch {
    return [];
  }
}

function savePasswordProfiles(profiles: SavedPasswordProfile[]) {
  try {
    localStorage.setItem(PASSWORD_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore storage quota errors
  }
}

export function upsertSavedPasswordProfile(
  profile: Omit<SavedPasswordProfile, 'updatedAt'>
): SavedPasswordProfile[] {
  const existing = loadSavedPasswordProfiles();
  const nextItem: SavedPasswordProfile = {
    uid: profile.uid,
    username: normalizeUsername(profile.username),
    email: profile.email.toLowerCase(),
    authEmail: profile.authEmail.toLowerCase(),
    displayName: profile.displayName,
    phoneNumber: profile.phoneNumber || '',
    photoDataUrl: profile.photoDataUrl || '',
    role: profile.role,
    passwordHash: profile.passwordHash,
    passwordSalt: profile.passwordSalt,
    updatedAt: Date.now(),
  };
  const next = [nextItem, ...existing.filter((p) => p.uid !== profile.uid)].slice(0, 12);
  savePasswordProfiles(next);
  return next;
}

export function findSavedPasswordProfileByIdentifier(identifier: string): SavedPasswordProfile | null {
  const clean = normalizeUsername(identifier);
  if (!clean) return null;
  const profiles = loadSavedPasswordProfiles();
  return (
    profiles.find(
      (p) => p.username === clean || p.email === clean || p.authEmail === clean
    ) || null
  );
}

export function removeSavedPasswordProfileByUid(uid: string): SavedPasswordProfile[] {
  const next = loadSavedPasswordProfiles().filter((p) => p.uid !== uid);
  savePasswordProfiles(next);
  return next;
}

export function getMpinLockUid(): string | null {
  try {
    return localStorage.getItem(MPIN_LOCK_UID_KEY);
  } catch {
    return null;
  }
}

export function setMpinLockUid(uid: string | null) {
  try {
    if (uid) {
      localStorage.setItem(MPIN_LOCK_UID_KEY, uid);
    } else {
      localStorage.removeItem(MPIN_LOCK_UID_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getOfflineUnlockedUid(): string | null {
  try {
    return localStorage.getItem(OFFLINE_UNLOCKED_UID_KEY);
  } catch {
    return null;
  }
}

export function setOfflineUnlockedUid(uid: string | null) {
  try {
    if (uid) {
      localStorage.setItem(OFFLINE_UNLOCKED_UID_KEY, uid);
    } else {
      localStorage.removeItem(OFFLINE_UNLOCKED_UID_KEY);
    }
  } catch {
    // ignore
  }
}

export function getCachedUserAccount(uid: string): UserAccount | null {
  try {
    const raw = localStorage.getItem(`slp_cached_user_${uid}`);
    return raw ? (JSON.parse(raw) as UserAccount) : null;
  } catch {
    return null;
  }
}

export function setCachedUserAccount(uid: string, account: UserAccount) {
  try {
    localStorage.setItem(`slp_cached_user_${uid}`, JSON.stringify(account));
  } catch {
    // Ignore quota errors
  }
}

export function removeCachedUserAccount(uid: string) {
  try {
    localStorage.removeItem(`slp_cached_user_${uid}`);
  } catch {
    // ignore
  }
}

export async function compressProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected photo.'));
      el.src = objectUrl;
    });

    const targetSize = 240;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas image processing unavailable.');

    const srcMin = Math.min(img.width, img.height);
    const sx = Math.max(0, (img.width - srcMin) / 2);
    const sy = Math.max(0, (img.height - srcMin) / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, srcMin, srcMin, 0, 0, targetSize, targetSize);

    let dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    if (dataUrl.length > 90000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.62);
    }
    if (dataUrl.length > 110000) {
      canvas.width = 180;
      canvas.height = 180;
      const ctx2 = canvas.getContext('2d');
      ctx2?.drawImage(img, sx, sy, srcMin, srcMin, 0, 0, 180, 180);
      dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
