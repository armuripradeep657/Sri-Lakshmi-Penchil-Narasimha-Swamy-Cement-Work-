import { UserRole } from '../types/billing';

export interface SavedMpinProfile {
  uid: string;
  email: string;
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

const MPIN_PROFILES_KEY = 'slp_mpin_profiles_v1';
const MPIN_LOCK_UID_KEY = 'slp_mpin_locked_uid';
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

export function isValidSixDigitMpin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export function generateMpinSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashMpin(pin: string, saltHex: string): Promise<string> {
  if (!isValidSixDigitMpin(pin)) {
    throw new Error('MPIN must be exactly 6 numeric digits.');
  }
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
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

export async function verifyMpinHash(
  pin: string,
  saltHex: string,
  expectedHash: string
): Promise<boolean> {
  if (!isValidSixDigitMpin(pin) || !saltHex || !expectedHash) return false;
  const computed = await hashMpin(pin, saltHex);
  if (computed.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
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
  const next = [nextItem, ...existing.filter((p) => p.uid !== profile.uid)].slice(0, 10);
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
