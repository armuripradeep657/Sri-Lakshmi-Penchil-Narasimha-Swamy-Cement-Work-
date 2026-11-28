import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createUserWithEmailAndPassword, signOut as authSignOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import {
  auth,
  commitWithOfflineSupport,
  db,
  emailToInviteId,
  formatTimestamp,
  generateSafeId,
  generateSecureToken,
  getStaffProvisionerAuth,
  handleFirestoreError,
  isTransientFirestoreNetworkError,
  OperationType,
  waitForPendingWrites,
} from '../lib/firebase';
import {
  generateMpinSalt,
  hashSecretPassword,
  isValidSecretPassword,
  isValidUsername,
  normalizeUsername,
  toFirebaseAuthPassword,
  usernameToSyntheticEmail,
} from '../lib/mpinCrypto';
import { BOOT_ADMIN_EMAIL, DEFAULT_BUSINESS_ID } from '../lib/seedData';
import { generateUniqueMixedBarcode } from '../lib/barcodeAndBillImage';
import { useAuth } from './AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  ApprovalRequest,
  AuditLog,
  Bill,
  BillItem,
  Business,
  BusinessSettings,
  Category,
  Customer,
  DeviceSession,
  GstType,
  InventoryTransaction,
  InviteRecord,
  InvoiceRecord,
  LabourWork,
  MessageLog,
  NotificationItem,
  PaymentMethod,
  PaymentRecord,
  Product,
  ShopEntry,
  SyncState,
  UpiSetting,
  UserAccount,
  UserRole,
} from '../types/billing';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

function readCachedJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCachedJson(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore storage quota errors
  }
}

export interface CartItemInput {
  productId: string;
  productCode: string;
  productName: string;
  variantLabel?: string;
  barcode?: string;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
}

export interface CreateBillPayload {
  idempotencyKey: string;
  customerId?: string;
  customerName: string;
  customerMobile?: string;
  customerAddress?: string;
  items: CartItemInput[];
  overallDiscount: number;
  gstType: GstType;
  labourCharge?: number;
  labourRatePerPiece?: number;
  autoCharge?: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
}

export interface EditBillPayload {
  billId: string;
  customerName: string;
  customerMobile?: string;
  customerAddress?: string;
  items: CartItemInput[];
  overallDiscount: number;
  gstType: GstType;
  labourCharge?: number;
  labourRatePerPiece?: number;
  autoCharge?: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

interface BillingDataContextValue {
  business: Business | null;
  businessSettings: BusinessSettings | null;
  upiSetting: UpiSetting | null;
  users: UserAccount[];
  invites: InviteRecord[];
  devices: DeviceSession[];
  categories: Category[];
  products: Product[];
  removedProducts: Product[];
  customers: Customer[];
  bills: Bill[];
  removedBills: Bill[];
  billItems: BillItem[];
  payments: PaymentRecord[];
  invoices: InvoiceRecord[];
  inventoryTransactions: InventoryTransaction[];
  notifications: NotificationItem[];
  messageLogs: MessageLog[];
  auditLogs: AuditLog[];
  labourWorks: LabourWork[];
  shopEntries: ShopEntry[];
  approvalRequests: ApprovalRequest[];
  syncState: SyncState;
  pendingSyncCount: number;
  cloudNotice: { id: number; status: 'offline' | 'syncing' | 'synced'; message: string } | null;
  dismissCloudNotice: () => void;
  lastSyncedAt: Date | null;
  loadingData: boolean;
  createBillAtomic: (payload: CreateBillPayload) => Promise<Bill>;
  editBillAtomic: (payload: EditBillPayload) => Promise<void>;
  recordPaymentAtomic: (params: {
    billId: string;
    amount: number;
    method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
    referenceId?: string;
    notes?: string;
  }) => Promise<void>;
  cancelBillAtomic: (billId: string, reason: string) => Promise<void>;
  softDeleteBillAtomic: (billId: string) => Promise<void>;
  softDeleteBillsBulkAtomic: (billIds: string[]) => Promise<number>;
  restoreDeletedBillAtomic: (billId: string) => Promise<void>;
  permanentlyDeleteBillAtomic: (billId: string) => Promise<void>;
  recordRefundAtomic: (params: {
    billId: string;
    amount: number;
    method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
    reason: string;
  }) => Promise<void>;
  updateBillNotes: (billId: string, notes: string) => Promise<void>;
  togglePublicInvoiceRevoke: (billId: string, publicToken: string, revoked: boolean) => Promise<void>;
  saveProduct: (product: Partial<Product> & { name: string; category: string; purchasePrice: number; sellingPrice: number; stock: number; taxRate: number }) => Promise<string>;
  deleteProduct: (productId: string) => Promise<void>;
  restoreDeletedProduct: (productId: string) => Promise<void>;
  permanentlyDeleteProduct: (productId: string) => Promise<void>;
  adjustStockAtomic: (productId: string, quantityChange: number, type: 'restock' | 'adjustment' | 'return', note: string) => Promise<void>;
  saveCategory: (name: string, nameTe?: string, id?: string) => Promise<void>;
  saveCustomer: (customer: Partial<Customer> & { name: string }) => Promise<string>;
  saveLabourWork: (entry: {
    id?: string;
    workerName: string;
    workDone: string;
    workDate: string;
    wageAmount: number;
    paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Unpaid';
    note?: string;
  }) => Promise<string>;
  deleteLabourWork: (workId: string) => Promise<void>;
  saveShopEntry: (entry: {
    id?: string;
    entryDate: string;
    type: 'income' | 'expense';
    title: string;
    category?: string;
    amount: number;
    paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
    note?: string;
  }) => Promise<string>;
  deleteShopEntry: (entryId: string) => Promise<void>;
  saveBusinessProfile: (updates: Partial<Business>) => Promise<void>;
  saveBusinessSettings: (updates: Partial<BusinessSettings>) => Promise<void>;
  saveUpiSettings: (updates: Partial<UpiSetting>) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  logMessageDispatch: (entry: Omit<MessageLog, 'id' | 'businessId' | 'ownerUid' | 'authorizedUids' | 'authorizedEmails' | 'sentByUid' | 'createdAt'>) => Promise<void>;
  inviteStaffMember: (params: {
    email: string;
    displayName: string;
    role: UserRole;
    canEditBills: boolean;
    canCancelBills: boolean;
    canViewReports: boolean;
    canManageProducts: boolean;
  }) => Promise<void>;
  createStaffAccountWithPassword: (params: {
    username: string;
    password: string;
    displayName: string;
    phoneNumber?: string;
    email?: string;
    role: UserRole;
    canEditBills: boolean;
    canCancelBills: boolean;
    canViewReports: boolean;
    canManageProducts: boolean;
  }) => Promise<{ uid: string; username: string; authEmail: string }>;
  adminUpdateUserCredentials: (
    uid: string,
    params: { username?: string }
  ) => Promise<void>;
  updateUserAccess: (uid: string, updates: Partial<UserAccount>) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  setDeviceStatus: (deviceId: string, status: 'authorized' | 'revoked') => Promise<void>;
  submitProfileUpdateRequest: (params: {
    displayName: string;
    phoneNumber?: string;
    photoDataUrl?: string;
    username?: string;
    email?: string;
  }) => Promise<string>;
  requestBillEditApproval: (params: { billId: string; reason?: string }) => Promise<string>;
  reviewApprovalRequest: (params: {
    requestId: string;
    decision: 'approved' | 'rejected';
    decisionNote?: string;
  }) => Promise<void>;
}

const BillingDataContext = createContext<BillingDataContextValue | null>(null);

function calculateBillTotalsLocal(params: {
  items: CartItemInput[];
  overallDiscount: number;
  taxEnabled: boolean;
  gstType: GstType;
  labourCharge?: number;
  autoCharge?: number;
  amountPaid: number;
}) {
  let subtotal = 0;
  let totalItemDiscount = 0;
  let totalTax = 0;

  const calculatedItems = params.items.map((item) => {
    const qty = Number(item.quantity);
    const price = Number(item.unitPrice);
    const itemDisc = Math.max(0, Number(item.discount || 0));
    const rate = 0;

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid quantity or price for ${item.productName || 'item'}`);
    }

    const gross = Math.round(qty * price * 100) / 100;
    const clampedDisc = Math.min(gross, Math.round(itemDisc * 100) / 100);
    const netBeforeTax = Math.round((gross - clampedDisc) * 100) / 100;
    const itemTax = 0;
    const lineTotal = netBeforeTax;

    subtotal += gross;
    totalItemDiscount += clampedDisc;

    return {
      productId: item.productId,
      productName: item.productName,
      quantity: qty,
      unitPrice: price,
      discount: clampedDisc,
      taxRate: rate,
      taxAmount: itemTax,
      lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  totalItemDiscount = Math.round(totalItemDiscount * 100) / 100;
  totalTax = 0;

  const netBeforeOverallDisc = Math.max(0, subtotal - totalItemDiscount);
  const clampedOverallDisc = Math.min(
    netBeforeOverallDisc,
    Math.max(0, Math.round(Number(params.overallDiscount || 0) * 100) / 100)
  );
  const totalDiscount = Math.round((totalItemDiscount + clampedOverallDisc) * 100) / 100;
  const taxableAmount = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);
  const labourCharge = Math.max(0, Math.round((Number(params.labourCharge) || 0) * 100) / 100);
  const autoCharge = Math.max(0, Math.round((Number(params.autoCharge) || 0) * 100) / 100);
  const grandTotal = Math.round((taxableAmount + labourCharge + autoCharge) * 100) / 100;

  const cgstAmount = 0;
  const sgstAmount = 0;
  const igstAmount = 0;

  const paid = Math.min(grandTotal, Math.max(0, Math.round(Number(params.amountPaid || 0) * 100) / 100));
  const pendingBalance = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);

  let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending';
  if (pendingBalance === 0 && grandTotal > 0) paymentStatus = 'paid';
  else if (paid > 0 && pendingBalance > 0) paymentStatus = 'partial';

  return {
    items: calculatedItems,
    subtotal,
    discountAmount: totalDiscount,
    taxableAmount,
    gstType: 'NONE' as GstType,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    labourCharge,
    autoCharge,
    grandTotal,
    amountPaid: paid,
    pendingBalance,
    paymentStatus,
  };
}

export const BillingDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, activeUid, userAccount, deviceRevoked, accessDeniedReason, authReady, isAdmin, language } = useAuth();
  const languageRef = useRef(language);
  languageRef.current = language;
  const pickMsg = useCallback((en: string, te: string) => (languageRef.current === 'te' ? te : en), []);
  const isOnline = useOnlineStatus();

  const businessId = userAccount?.businessId || DEFAULT_BUSINESS_ID;
  const firebaseUid = firebaseUser?.uid || '';
  const firebaseEmailVerified = Boolean(firebaseUser?.emailVerified);
  const userUid = activeUid || firebaseUid || userAccount?.uid || '';
  const userEmail = (firebaseUser?.email || userAccount?.email || '').toLowerCase();
  const accountStatus = userAccount?.status || '';

  const [business, setBusiness] = useState<Business | null>(() =>
    readCachedJson<Business>(`slp_cached_biz_${businessId}`)
  );
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(() =>
    readCachedJson<BusinessSettings>(`slp_cached_settings_${businessId}`)
  );
  const [upiSetting, setUpiSetting] = useState<UpiSetting | null>(() =>
    readCachedJson<UpiSetting>(`slp_cached_upi_${businessId}`)
  );
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rawBills, setRawBills] = useState<Bill[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransaction[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [labourWorks, setLabourWorks] = useState<LabourWork[]>([]);
  const [shopEntries, setShopEntries] = useState<ShopEntry[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);

  const [syncState, setSyncState] = useState<SyncState>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connected'
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [cloudNotice, setCloudNotice] = useState<{
    id: number;
    status: 'offline' | 'syncing' | 'synced';
    message: string;
  } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [loadingData, setLoadingData] = useState<boolean>(() => !readCachedJson(`slp_cached_biz_${businessId}`));

  const submittedKeysRef = useRef<Set<string>>(new Set());
  const pendingColsRef = useRef<Set<string>>(new Set());
  const wasOfflineRef = useRef<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const hadOfflineMutationsRef = useRef<boolean>(false);
  const noticeTimerRef = useRef<number | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(Boolean(readCachedJson(`slp_cached_biz_${businessId}`)));
  const activeSubKeyRef = useRef<string>('');
  const purgedExpiredRef = useRef<boolean>(false);

  const products = useMemo(() => rawProducts.filter((p) => !p.isDeleted), [rawProducts]);
  const removedProducts = useMemo(
    () =>
      rawProducts
        .filter((p) => Boolean(p.isDeleted))
        .sort((a, b) => Number(b.deletedAtMs || 0) - Number(a.deletedAtMs || 0)),
    [rawProducts]
  );

  const bills = useMemo(() => rawBills.filter((b) => !b.isDeleted), [rawBills]);
  const removedBills = useMemo(
    () =>
      rawBills
        .filter((b) => Boolean(b.isDeleted))
        .sort((a, b) => Number(b.deletedAtMs || 0) - Number(a.deletedAtMs || 0)),
    [rawBills]
  );

  // Unified actor identity supporting online Firebase Auth and offline-unlocked cached sessions
  const actorUser = useMemo(
    () => (userUid ? { uid: userUid, email: userEmail } : null),
    [userUid, userEmail]
  );

  const showNotice = useCallback(
    (status: 'offline' | 'syncing' | 'synced', message: string, autoHideMs?: number) => {
      if (status === 'offline') {
        hadOfflineMutationsRef.current = true;
      }
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
      setCloudNotice({ id: Date.now(), status, message });
      if (autoHideMs) {
        noticeTimerRef.current = window.setTimeout(() => {
          setCloudNotice(null);
        }, autoHideMs);
      }
    },
    []
  );

  const dismissCloudNotice = useCallback(() => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setCloudNotice(null);
  }, []);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setSyncState('offline');
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      if (hadOfflineMutationsRef.current || pendingColsRef.current.size > 0) {
        setSyncState('synchronizing');
        waitForPendingWrites(db)
          .then(() => {
            hadOfflineMutationsRef.current = false;
            pendingColsRef.current.clear();
            setPendingSyncCount(0);
            setSyncState('connected');
            setLastSyncedAt(new Date());
            showNotice(
              'synced',
              pickMsg('Offline changes synced to cloud', 'ఆఫ్‌లైన్ మార్పులు క్లౌడ్‌కు సింక్ అయ్యాయి'),
              3200
            );
          })
          .catch(() => {
            setSyncState('connected');
          });
      } else {
        setSyncState('connected');
      }
    } else {
      setSyncState((prev) => (prev === 'offline' ? 'connected' : prev));
    }
  }, [isOnline, showNotice, pickMsg]);

  useEffect(() => {
    if (!authReady || !userUid || accountStatus !== 'active' || accessDeniedReason || deviceRevoked) {
      activeSubKeyRef.current = '';
      setLoadingData(false);
      return;
    }

    const subKey = `${userUid}::${businessId}::${isAdmin}`;
    activeSubKeyRef.current = subKey;

    if (!hasLoadedOnceRef.current) {
      setLoadingData(true);
    }

    const isBoot = Boolean((firebaseUid ? firebaseEmailVerified : true) && userEmail === BOOT_ADMIN_EMAIL);

    const buildScopedQuery = (colName: string) => {
      if (isBoot) {
        return query(collection(db, colName), where('businessId', '==', businessId));
      }
      return query(collection(db, colName), where('authorizedUids', 'array-contains', userUid));
    };

    // Offline-unlocked session without an active Firebase Auth token:
    // Hydrate strictly from Firestore persistent IndexedDB cache without unauthenticated network calls.
    if (!firebaseUid) {
      let cancelled = false;
      setSyncState('offline');
      const loadCacheCol = async <T,>(
        colName: string,
        setter: React.Dispatch<React.SetStateAction<T[]>>,
        sortDescByCreatedAt = true
      ) => {
        try {
          const snap = await getDocsFromCache(buildScopedQuery(colName));
          if (cancelled) return;
          const list = snap.docs.map((d) => d.data() as T & { createdAt?: unknown });
          if (sortDescByCreatedAt) {
            list.sort((a, b) => formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime());
          }
          setter(list as T[]);
        } catch {
          // Cache may not exist yet for secondary collections
        }
      };

      void Promise.all([
        getDocFromCache(doc(db, 'businesses', businessId))
          .then((snap) => {
            if (!cancelled && snap.exists()) setBusiness(snap.data() as Business);
          })
          .catch(() => {}),
        getDocFromCache(doc(db, 'businessSettings', businessId))
          .then((snap) => {
            if (!cancelled && snap.exists()) setBusinessSettings(snap.data() as BusinessSettings);
          })
          .catch(() => {}),
        getDocFromCache(doc(db, 'upiSettings', businessId))
          .then((snap) => {
            if (!cancelled && snap.exists()) setUpiSetting(snap.data() as UpiSetting);
          })
          .catch(() => {}),
        loadCacheCol<DeviceSession>('devices', setDevices),
        loadCacheCol<Category>('categories', setCategories, false),
        loadCacheCol<Product>('products', setRawProducts, false),
        loadCacheCol<Customer>('customers', setCustomers),
        loadCacheCol<Bill>('bills', setRawBills),
        loadCacheCol<BillItem>('billItems', setBillItems),
        loadCacheCol<PaymentRecord>('payments', setPayments),
        loadCacheCol<InvoiceRecord>('invoices', setInvoices),
        loadCacheCol<InventoryTransaction>('inventoryTransactions', setInventoryTransactions),
        loadCacheCol<NotificationItem>('notifications', setNotifications),
        loadCacheCol<MessageLog>('messageLogs', setMessageLogs),
        loadCacheCol<AuditLog>('auditLogs', setAuditLogs),
        loadCacheCol<LabourWork>('labourWorks', setLabourWorks),
        loadCacheCol<ShopEntry>('shopEntries', setShopEntries),
        loadCacheCol<ApprovalRequest>('approvalRequests', setApprovalRequests),
      ]).finally(() => {
        if (!cancelled) {
          hasLoadedOnceRef.current = true;
          setLoadingData(false);
        }
      });

      return () => {
        cancelled = true;
      };
    }

    const unsubs: Array<() => void> = [];

    const markReady = (sourceKey: string) => {
      pendingColsRef.current.delete(sourceKey);
      setPendingSyncCount(pendingColsRef.current.size);
      if (navigator.onLine) {
        setSyncState('connected');
        setLastSyncedAt(new Date());
      } else {
        setSyncState('offline');
      }
    };

    const handleListenerError = (err: unknown, op: OperationType, path: string) => {
      if (isTransientFirestoreNetworkError(err)) {
        setSyncState('offline');
        setLoadingData(false);
        return;
      }
      setSyncState('error');
      handleFirestoreError(err, op, path);
    };

    unsubs.push(
      onSnapshot(
        doc(db, 'businesses', businessId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Business;
            setBusiness(data);
            writeCachedJson(`slp_cached_biz_${businessId}`, data);
          }
          markReady('businesses');
          hasLoadedOnceRef.current = true;
          setLoadingData(false);
        },
        (err) => handleListenerError(err, OperationType.GET, `businesses/${businessId}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'businessSettings', businessId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as BusinessSettings;
            setBusinessSettings(data);
            writeCachedJson(`slp_cached_settings_${businessId}`, data);
          }
          markReady('businessSettings');
        },
        (err) => handleListenerError(err, OperationType.GET, `businessSettings/${businessId}`)
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'upiSettings', businessId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UpiSetting;
            setUpiSetting(data);
            writeCachedJson(`slp_cached_upi_${businessId}`, data);
          }
          markReady('upiSettings');
        },
        (err) => handleListenerError(err, OperationType.GET, `upiSettings/${businessId}`)
      )
    );

    if (isAdmin) {
      const usersQ = isBoot
        ? query(collection(db, 'users'), where('businessId', '==', businessId))
        : query(collection(db, 'users'), where('authorizedUids', 'array-contains', userUid));
      unsubs.push(
        onSnapshot(
          usersQ,
          (snap) => setUsers(snap.docs.map((d) => d.data() as UserAccount)),
          (err) => handleListenerError(err, OperationType.LIST, 'users')
        )
      );

      const invQ = isBoot
        ? query(collection(db, 'invites'), where('businessId', '==', businessId))
        : query(collection(db, 'invites'), where('authorizedUids', 'array-contains', userUid));
      unsubs.push(
        onSnapshot(
          invQ,
          (snap) => setInvites(snap.docs.map((d) => d.data() as InviteRecord)),
          (err) => handleListenerError(err, OperationType.LIST, 'invites')
        )
      );
    }

    const subscribeCol = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortDescByCreatedAt = true
    ) => {
      unsubs.push(
        onSnapshot(
          buildScopedQuery(colName),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as T & { createdAt?: unknown });
            if (sortDescByCreatedAt) {
              list.sort((a, b) => formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime());
            }
            setter(list as T[]);
            markReady(colName);
          },
          (err) => handleListenerError(err, OperationType.LIST, colName)
        )
      );
    };

    subscribeCol<DeviceSession>('devices', setDevices);
    subscribeCol<Category>('categories', setCategories, false);
    subscribeCol<Product>('products', setRawProducts, false);
    subscribeCol<Customer>('customers', setCustomers);
    subscribeCol<Bill>('bills', setRawBills);
    subscribeCol<BillItem>('billItems', setBillItems);
    subscribeCol<PaymentRecord>('payments', setPayments);
    subscribeCol<InvoiceRecord>('invoices', setInvoices);
    subscribeCol<InventoryTransaction>('inventoryTransactions', setInventoryTransactions);
    subscribeCol<NotificationItem>('notifications', setNotifications);
    subscribeCol<MessageLog>('messageLogs', setMessageLogs);
    subscribeCol<AuditLog>('auditLogs', setAuditLogs);
    subscribeCol<LabourWork>('labourWorks', setLabourWorks);
    subscribeCol<ShopEntry>('shopEntries', setShopEntries);
    subscribeCol<ApprovalRequest>('approvalRequests', setApprovalRequests);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUid, firebaseEmailVerified, userUid, userEmail, accountStatus, accessDeniedReason, deviceRevoked, businessId, isAdmin]);

  const accessContext = useMemo(() => {
    const ownerUid = business?.ownerUid || userAccount?.ownerUid || userUid || '';
    const authorizedUids = business?.authorizedUids?.length
      ? business.authorizedUids
      : userAccount?.authorizedUids || (ownerUid ? [ownerUid] : []);
    const authorizedEmails = business?.authorizedEmails?.length
      ? business.authorizedEmails
      : [userEmail || BOOT_ADMIN_EMAIL];
    return { ownerUid, authorizedUids, authorizedEmails };
  }, [business, userAccount, userUid, userEmail]);

  const createBillAtomic = useCallback(
    async (payload: CreateBillPayload): Promise<Bill> => {
      if (!actorUser || !userAccount || !business) {
        throw new Error(pickMsg('Authentication and business profile required.', 'లాగిన్ మరియు వ్యాపార ప్రొఫైల్ అవసరం.'));
      }
      if (submittedKeysRef.current.has(payload.idempotencyKey)) {
        throw new Error(pickMsg('Duplicate bill submission blocked.', 'డూప్లికేట్ బిల్ సమర్పణ నిలిపివేయబడింది.'));
      }
      submittedKeysRef.current.add(payload.idempotencyKey);

      if (!navigator.onLine) setSyncState('offline');

      try {
        let calcData: ReturnType<typeof calculateBillTotalsLocal>;

        if (navigator.onLine) {
          try {
            const calcRes = await fetch('/api/bills/calculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: payload.items,
                overallDiscount: payload.overallDiscount,
                taxEnabled: false,
                gstType: 'NONE',
                labourCharge: payload.labourCharge || 0,
                autoCharge: payload.autoCharge || 0,
                amountPaid: payload.amountPaid,
              }),
            });
            const json = await calcRes.json();
            if (!calcRes.ok) {
              submittedKeysRef.current.delete(payload.idempotencyKey);
              throw new Error(json.error || pickMsg('Server financial validation failed.', 'సర్వర్ లెక్కల నిర్ధారణ విఫలమైంది.'));
            }
            calcData = json;
          } catch (fetchErr) {
            if (navigator.onLine && fetchErr instanceof Error && fetchErr.message.includes('validation')) {
              throw fetchErr;
            }
            calcData = calculateBillTotalsLocal({
              items: payload.items,
              overallDiscount: payload.overallDiscount,
              taxEnabled: false,
              gstType: 'NONE',
              labourCharge: payload.labourCharge || 0,
              autoCharge: payload.autoCharge || 0,
              amountPaid: payload.amountPaid,
            });
          }
        } else {
          calcData = calculateBillTotalsLocal({
            items: payload.items,
            overallDiscount: payload.overallDiscount,
            taxEnabled: false,
            gstType: 'NONE',
            labourCharge: payload.labourCharge || 0,
            autoCharge: payload.autoCharge || 0,
            amountPaid: payload.amountPaid,
          });
        }

        const billId = generateSafeId('bill');
        const publicToken = generateSecureToken();
        const verificationBarcode = generateUniqueMixedBarcode();
        const invoiceId = generateSafeId('inv');
        const creatorName = userAccount.displayName || actorUser.email || 'Staff';

        let createdBillNumber = '';

        const runOfflineBatchBill = async () => {
          const prefix = business.billPrefix || 'SLP';
          const seq = business.nextBillNumber || 1001;
          const uniqueSuffix = String(Date.now()).slice(-4);
          createdBillNumber = `${prefix}-OFF-${seq}-${uniqueSuffix}`;

          const batch = writeBatch(db);
          batch.update(doc(db, 'businesses', businessId), {
            nextBillNumber: increment(1),
            updatedAt: serverTimestamp(),
          });

          const itemsSummary = payload.items
            .map((it) => `${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''} x${it.quantity}`)
            .join(', ')
            .slice(0, 580);

          batch.set(doc(db, 'bills', billId), {
            id: billId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            billNumber: createdBillNumber,
            verificationBarcode,
            customerId: payload.customerId || '',
            customerName: payload.customerName.trim(),
            customerMobile: (payload.customerMobile || '').trim(),
            customerAddress: (payload.customerAddress || '').trim(),
            itemsSummary,
            itemCount: payload.items.length,
            subtotal: calcData.subtotal,
            discountAmount: calcData.discountAmount,
            taxableAmount: calcData.taxableAmount,
            gstType: calcData.gstType,
            cgstAmount: calcData.cgstAmount,
            sgstAmount: calcData.sgstAmount,
            igstAmount: calcData.igstAmount,
            totalTax: calcData.totalTax,
            labourCharge: calcData.labourCharge,
            labourRatePerPiece: Math.max(0, Math.round((Number(payload.labourRatePerPiece) || 0) * 100) / 100),
            autoCharge: calcData.autoCharge,
            grandTotal: calcData.grandTotal,
            amountPaid: calcData.amountPaid,
            pendingBalance: calcData.pendingBalance,
            paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
            paymentStatus: calcData.paymentStatus,
            billStatus: 'active',
            publicToken,
            publicLinkRevoked: false,
            createdByUid: actorUser.uid,
            createdByName: creatorName,
            notes: (payload.notes || '').trim(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          for (let i = 0; i < payload.items.length; i++) {
            const rawItem = payload.items[i];
            const calcItem = calcData.items[i];
            const itemId = generateSafeId('bi');
            batch.set(doc(db, 'billItems', itemId), {
              id: itemId,
              billId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              productId: rawItem.productId,
              productCode: rawItem.productCode || '',
              productName: rawItem.productName,
              variantLabel: rawItem.variantLabel || '',
              barcode: rawItem.barcode || '',
              imageUrl: rawItem.imageUrl && rawItem.imageUrl.length <= 2000 ? rawItem.imageUrl : '',
              quantity: calcItem.quantity,
              unitPrice: calcItem.unitPrice,
              discount: calcItem.discount,
              taxRate: calcItem.taxRate,
              taxAmount: calcItem.taxAmount,
              lineTotal: calcItem.lineTotal,
              createdAt: serverTimestamp(),
            });

            const cachedProd = products.find((p) => p.id === rawItem.productId);
            if (cachedProd) {
              const prevStock = Number(cachedProd.stock || 0);
              const nextStock = prevStock - calcItem.quantity;
              batch.update(doc(db, 'products', rawItem.productId), {
                stock: increment(-calcItem.quantity),
                updatedAt: serverTimestamp(),
              });
              const invTxId = generateSafeId('itx');
              batch.set(doc(db, 'inventoryTransactions', invTxId), {
                id: invTxId,
                businessId,
                ownerUid: accessContext.ownerUid,
                authorizedUids: accessContext.authorizedUids,
                authorizedEmails: accessContext.authorizedEmails,
                productId: rawItem.productId,
                productName: rawItem.productName,
                type: 'sale',
                quantityChange: -calcItem.quantity,
                previousStock: prevStock,
                newStock: nextStock,
                billId,
                billNumber: createdBillNumber,
                note: `Sold offline via ${createdBillNumber}`,
                createdByUid: actorUser.uid,
                createdAt: serverTimestamp(),
              });
            }
          }

          if (payload.customerId) {
            batch.update(doc(db, 'customers', payload.customerId), {
              totalPurchases: increment(calcData.grandTotal),
              outstandingBalance: increment(calcData.pendingBalance),
              billCount: increment(1),
              lastPurchaseAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (payload.customerName.trim().toLowerCase() !== 'walk-in customer') {
            const newCustId = generateSafeId('cust');
            batch.set(doc(db, 'customers', newCustId), {
              id: newCustId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              name: payload.customerName.trim(),
              mobile: (payload.customerMobile || '').trim(),
              email: '',
              address: (payload.customerAddress || '').trim(),
              totalPurchases: calcData.grandTotal,
              outstandingBalance: calcData.pendingBalance,
              billCount: 1,
              lastPurchaseAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          if (calcData.amountPaid > 0 && payload.paymentMethod !== 'Unpaid') {
            const payId = generateSafeId('pay');
            batch.set(doc(db, 'payments', payId), {
              id: payId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              billId,
              billNumber: createdBillNumber,
              customerId: payload.customerId || '',
              customerName: payload.customerName.trim(),
              amount: calcData.amountPaid,
              method: payload.paymentMethod,
              referenceId: (payload.paymentReference || '').trim(),
              status: 'completed',
              type: 'payment',
              recordedByUid: actorUser.uid,
              recordedByName: creatorName,
              notes: `Offline payment for ${createdBillNumber}`,
              createdAt: serverTimestamp(),
            });
          }

          batch.set(doc(db, 'invoices', invoiceId), {
            id: invoiceId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            billId,
            invoiceNumber: createdBillNumber,
            publicToken,
            revoked: false,
            customerName: payload.customerName.trim(),
            grandTotal: calcData.grandTotal,
            paymentStatus: calcData.paymentStatus,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const mobileRaw = (payload.customerMobile || '').trim();
          const maskedMobile =
            mobileRaw.length >= 4 ? `${'*'.repeat(Math.max(0, mobileRaw.length - 4))}${mobileRaw.slice(-4)}` : '';
          batch.set(doc(db, 'publicInvoices', publicToken), {
            token: publicToken,
            billId,
            businessId,
            ownerUid: accessContext.ownerUid,
            revoked: false,
            invoiceNumber: createdBillNumber,
            verificationBarcode,
            issuedAtIso: new Date().toISOString(),
            businessName: business.name,
            businessPhone: business.phone || '',
            businessAddress: business.address || '',
            businessGstin: business.gstin || '',
            businessLogoUrl: business.logoUrl || '',
            customerName: payload.customerName.trim(),
            customerPhoneMasked: maskedMobile,
            customerAddress: (payload.customerAddress || '').trim(),
            itemsSummary: payload.items
              .map(
                (it, idx) =>
                  `${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''} | ${it.quantity} x ₹${it.unitPrice.toFixed(2)} = ₹${calcData.items[idx].lineTotal.toFixed(2)}`
              )
              .join('\n')
              .slice(0, 1450),
            itemsJson: JSON.stringify(
              payload.items.map((it, idx) => ({
                n: it.productName.slice(0, 100),
                v: (it.variantLabel || '').slice(0, 40),
                q: it.quantity,
                p: it.unitPrice,
                t: calcData.items[idx].lineTotal,
                img: it.imageUrl && it.imageUrl.length <= 500 && !it.imageUrl.startsWith('data:') ? it.imageUrl : '',
              }))
            ).slice(0, 7900),
            subtotal: calcData.subtotal,
            discountAmount: calcData.discountAmount,
            cgstAmount: calcData.cgstAmount,
            sgstAmount: calcData.sgstAmount,
            igstAmount: calcData.igstAmount,
            totalTax: calcData.totalTax,
            labourCharge: calcData.labourCharge,
            labourRatePerPiece: Math.max(0, Math.round((Number(payload.labourRatePerPiece) || 0) * 100) / 100),
            autoCharge: calcData.autoCharge,
            grandTotal: calcData.grandTotal,
            amountPaid: calcData.amountPaid,
            pendingBalance: calcData.pendingBalance,
            paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
            paymentStatus: calcData.paymentStatus,
            upiId: upiSetting?.upiId || '',
            upiName: upiSetting?.accountHolderName || business.name,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const notifId = generateSafeId('notif');
          batch.set(doc(db, 'notifications', notifId), {
            id: notifId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            title: `New Bill ${createdBillNumber}`,
            message: `${creatorName} billed ${payload.customerName.trim()} for ₹${calcData.grandTotal.toFixed(2)} (${calcData.paymentStatus}).`,
            type: 'bill',
            relatedRecordType: 'bill',
            relatedRecordId: billId,
            billNumber: createdBillNumber,
            amount: calcData.grandTotal,
            customerName: payload.customerName.trim(),
            creatorName,
            isRead: false,
            createdAt: serverTimestamp(),
          });

          const auditId = generateSafeId('aud');
          batch.set(doc(db, 'auditLogs', auditId), {
            id: auditId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            action: 'CREATE_BILL',
            entityType: 'bill',
            entityId: billId,
            summary: `Created ${createdBillNumber} offline for ${payload.customerName.trim()} · Total ₹${calcData.grandTotal.toFixed(2)}`,
            actorUid: actorUser.uid,
            actorEmail: actorUser.email || '',
            actorName: creatorName,
            createdAt: serverTimestamp(),
          });

          await commitWithOfflineSupport(batch.commit());
        };

        if (!navigator.onLine) {
          await runOfflineBatchBill();
          setSyncState('offline');
          showNotice(
            'offline',
            pickMsg(
              `Bill ${createdBillNumber} saved offline · Will sync to cloud`,
              `బిల్ ${createdBillNumber} ఆఫ్‌లైన్‌లో సేవ్ అయింది · క్లౌడ్‌కు సింక్ అవుతుంది`
            )
          );
        } else {
          try {
            await runTransaction(db, async (tx) => {
          const bizRef = doc(db, 'businesses', businessId);
          const bizSnap = await tx.get(bizRef);
          if (!bizSnap.exists()) throw new Error(pickMsg('Central business document not found.', 'ప్రధాన వ్యాపార వివరాలు కనుగొనబడలేదు.'));
          const bizData = bizSnap.data() as Business;

          const seq = bizData.nextBillNumber || 1001;
          const prefix = bizData.billPrefix || 'SLP';
          createdBillNumber = `${prefix}-${seq}`;

          // Read all involved product docs before writes (Firestore transaction rule)
          const prodRefs = payload.items.map((item) => doc(db, 'products', item.productId));
          const prodSnaps = await Promise.all(prodRefs.map((ref) => tx.get(ref)));

          let customerRef = payload.customerId ? doc(db, 'customers', payload.customerId) : null;
          let customerSnap = customerRef ? await tx.get(customerRef) : null;

          // Increment bill counter
          tx.update(bizRef, {
            nextBillNumber: seq + 1,
            updatedAt: serverTimestamp(),
          });

          const itemsSummary = payload.items
            .map((it) => `${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''} x${it.quantity}`)
            .join(', ')
            .slice(0, 580);

          const billDoc: Record<string, unknown> = {
            id: billId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            billNumber: createdBillNumber,
            verificationBarcode,
            customerId: payload.customerId || '',
            customerName: payload.customerName.trim(),
            customerMobile: (payload.customerMobile || '').trim(),
            customerAddress: (payload.customerAddress || '').trim(),
            itemsSummary,
            itemCount: payload.items.length,
            subtotal: calcData.subtotal,
            discountAmount: calcData.discountAmount,
            taxableAmount: calcData.taxableAmount,
            gstType: calcData.gstType,
            cgstAmount: calcData.cgstAmount,
            sgstAmount: calcData.sgstAmount,
            igstAmount: calcData.igstAmount,
            totalTax: calcData.totalTax,
            labourCharge: calcData.labourCharge,
            labourRatePerPiece: Math.max(0, Math.round((Number(payload.labourRatePerPiece) || 0) * 100) / 100),
            autoCharge: calcData.autoCharge,
            grandTotal: calcData.grandTotal,
            amountPaid: calcData.amountPaid,
            pendingBalance: calcData.pendingBalance,
            paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
            paymentStatus: calcData.paymentStatus,
            billStatus: 'active',
            publicToken,
            publicLinkRevoked: false,
            createdByUid: actorUser.uid,
            createdByName: creatorName,
            notes: (payload.notes || '').trim(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          tx.set(doc(db, 'bills', billId), billDoc);

          // Line items + inventory deduction
          for (let i = 0; i < payload.items.length; i++) {
            const rawItem = payload.items[i];
            const calcItem = calcData.items[i];
            const itemId = generateSafeId('bi');
            tx.set(doc(db, 'billItems', itemId), {
              id: itemId,
              billId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              productId: rawItem.productId,
              productCode: rawItem.productCode || '',
              productName: rawItem.productName,
              variantLabel: rawItem.variantLabel || '',
              barcode: rawItem.barcode || '',
              imageUrl: (rawItem.imageUrl && rawItem.imageUrl.length <= 2000 ? rawItem.imageUrl : ''),
              quantity: calcItem.quantity,
              unitPrice: calcItem.unitPrice,
              discount: calcItem.discount,
              taxRate: calcItem.taxRate,
              taxAmount: calcItem.taxAmount,
              lineTotal: calcItem.lineTotal,
              createdAt: serverTimestamp(),
            });

            const prodSnap = prodSnaps[i];
            if (prodSnap.exists()) {
              const pData = prodSnap.data() as Product;
              const prevStock = Number(pData.stock || 0);
              const nextStock = prevStock - calcItem.quantity;
              tx.update(prodRefs[i], {
                stock: nextStock,
                updatedAt: serverTimestamp(),
              });

              const invTxId = generateSafeId('itx');
              tx.set(doc(db, 'inventoryTransactions', invTxId), {
                id: invTxId,
                businessId,
                ownerUid: accessContext.ownerUid,
                authorizedUids: accessContext.authorizedUids,
                authorizedEmails: accessContext.authorizedEmails,
                productId: rawItem.productId,
                productName: rawItem.productName,
                type: 'sale',
                quantityChange: -calcItem.quantity,
                previousStock: prevStock,
                newStock: nextStock,
                billId,
                billNumber: createdBillNumber,
                note: `Sold via ${createdBillNumber}`,
                createdByUid: actorUser.uid,
                createdAt: serverTimestamp(),
              });

              const threshold = Number(pData.lowStockThreshold ?? 10);
              if (nextStock <= threshold) {
                const lowNotifId = generateSafeId('notif');
                tx.set(doc(db, 'notifications', lowNotifId), {
                  id: lowNotifId,
                  businessId,
                  ownerUid: accessContext.ownerUid,
                  authorizedUids: accessContext.authorizedUids,
                  authorizedEmails: accessContext.authorizedEmails,
                  title: `Low Stock Alert: ${rawItem.productName}`,
                  message: `Remaining stock is ${nextStock} ${pData.unit || 'units'} after ${createdBillNumber}.`,
                  type: 'low_stock',
                  relatedRecordType: 'product',
                  relatedRecordId: rawItem.productId,
                  billNumber: createdBillNumber,
                  creatorName,
                  isRead: false,
                  createdAt: serverTimestamp(),
                });
              }
            }
          }

          // Customer ledger update or auto-create if name given
          if (customerRef && customerSnap?.exists()) {
            const cData = customerSnap.data() as Customer;
            tx.update(customerRef, {
              totalPurchases: Math.round(((cData.totalPurchases || 0) + calcData.grandTotal) * 100) / 100,
              outstandingBalance: Math.round(((cData.outstandingBalance || 0) + calcData.pendingBalance) * 100) / 100,
              billCount: (cData.billCount || 0) + 1,
              lastPurchaseAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (payload.customerName.trim().toLowerCase() !== 'walk-in customer') {
            const newCustId = generateSafeId('cust');
            tx.set(doc(db, 'customers', newCustId), {
              id: newCustId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              name: payload.customerName.trim(),
              mobile: (payload.customerMobile || '').trim(),
              email: '',
              address: (payload.customerAddress || '').trim(),
              totalPurchases: calcData.grandTotal,
              outstandingBalance: calcData.pendingBalance,
              billCount: 1,
              lastPurchaseAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          // Payment record (strictly required before marking paid/partial)
          if (calcData.amountPaid > 0 && payload.paymentMethod !== 'Unpaid') {
            const payId = generateSafeId('pay');
            tx.set(doc(db, 'payments', payId), {
              id: payId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              billId,
              billNumber: createdBillNumber,
              customerId: payload.customerId || '',
              customerName: payload.customerName.trim(),
              amount: calcData.amountPaid,
              method: payload.paymentMethod,
              referenceId: (payload.paymentReference || '').trim(),
              status: 'completed',
              type: 'payment',
              recordedByUid: actorUser.uid,
              recordedByName: creatorName,
              notes: `Initial payment for ${createdBillNumber}`,
              createdAt: serverTimestamp(),
            });
          }

          // Internal Invoice record
          tx.set(doc(db, 'invoices', invoiceId), {
            id: invoiceId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            billId,
            invoiceNumber: createdBillNumber,
            publicToken,
            revoked: false,
            customerName: payload.customerName.trim(),
            grandTotal: calcData.grandTotal,
            paymentStatus: calcData.paymentStatus,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Public Token-Gated Invoice View
          const mobileRaw = (payload.customerMobile || '').trim();
          const maskedMobile = mobileRaw.length >= 4 ? `${'*'.repeat(Math.max(0, mobileRaw.length - 4))}${mobileRaw.slice(-4)}` : '';
          tx.set(doc(db, 'publicInvoices', publicToken), {
            token: publicToken,
            billId,
            businessId,
            ownerUid: accessContext.ownerUid,
            revoked: false,
            invoiceNumber: createdBillNumber,
            verificationBarcode,
            issuedAtIso: new Date().toISOString(),
            businessName: bizData.name,
            businessPhone: bizData.phone || '',
            businessAddress: bizData.address || '',
            businessGstin: bizData.gstin || '',
            businessLogoUrl: bizData.logoUrl || '',
            customerName: payload.customerName.trim(),
            customerPhoneMasked: maskedMobile,
            customerAddress: (payload.customerAddress || '').trim(),
            itemsSummary: payload.items
              .map((it, idx) => `${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''} | ${it.quantity} x ₹${it.unitPrice.toFixed(2)} = ₹${calcData.items[idx].lineTotal.toFixed(2)}`)
              .join('\n')
              .slice(0, 1450),
            itemsJson: JSON.stringify(
              payload.items.map((it, idx) => ({
                n: it.productName.slice(0, 100),
                v: (it.variantLabel || '').slice(0, 40),
                q: it.quantity,
                p: it.unitPrice,
                t: calcData.items[idx].lineTotal,
                img: it.imageUrl && it.imageUrl.length <= 500 && !it.imageUrl.startsWith('data:') ? it.imageUrl : '',
              }))
            ).slice(0, 7900),
            subtotal: calcData.subtotal,
            discountAmount: calcData.discountAmount,
            cgstAmount: calcData.cgstAmount,
            sgstAmount: calcData.sgstAmount,
            igstAmount: calcData.igstAmount,
            totalTax: calcData.totalTax,
            labourCharge: calcData.labourCharge,
            labourRatePerPiece: Math.max(0, Math.round((Number(payload.labourRatePerPiece) || 0) * 100) / 100),
            autoCharge: calcData.autoCharge,
            grandTotal: calcData.grandTotal,
            amountPaid: calcData.amountPaid,
            pendingBalance: calcData.pendingBalance,
            paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
            paymentStatus: calcData.paymentStatus,
            upiId: upiSetting?.upiId || '',
            upiName: upiSetting?.accountHolderName || bizData.name,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Notification
          const notifId = generateSafeId('notif');
          tx.set(doc(db, 'notifications', notifId), {
            id: notifId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            title: `New Bill ${createdBillNumber}`,
            message: `${creatorName} billed ${payload.customerName.trim()} for ₹${calcData.grandTotal.toFixed(2)} (${calcData.paymentStatus}).`,
            type: 'bill',
            relatedRecordType: 'bill',
            relatedRecordId: billId,
            billNumber: createdBillNumber,
            amount: calcData.grandTotal,
            customerName: payload.customerName.trim(),
            creatorName,
            isRead: false,
            createdAt: serverTimestamp(),
          });

          // Audit Log
          const auditId = generateSafeId('aud');
          tx.set(doc(db, 'auditLogs', auditId), {
            id: auditId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            action: 'CREATE_BILL',
            entityType: 'bill',
            entityId: billId,
            summary: `Created ${createdBillNumber} for ${payload.customerName.trim()} · Total ₹${calcData.grandTotal.toFixed(2)} · Paid ₹${calcData.amountPaid.toFixed(2)}`,
            actorUid: actorUser.uid,
            actorEmail: actorUser.email || '',
            actorName: creatorName,
            createdAt: serverTimestamp(),
          });
        });

            setSyncState('saved');
            setLastSyncedAt(new Date());
          } catch (txErr) {
            const msg = txErr instanceof Error ? txErr.message.toLowerCase() : '';
            if (!navigator.onLine || msg.includes('offline') || msg.includes('unavailable') || msg.includes('network')) {
              await runOfflineBatchBill();
              setSyncState('offline');
              showNotice(
                'offline',
                pickMsg(
                  `Bill ${createdBillNumber} saved offline · Will sync to database`,
                  `బిల్ ${createdBillNumber} ఆఫ్‌లైన్‌లో సేవ్ అయింది · డేటాబేస్‌కు సింక్ అవుతుంది`
                )
              );
            } else {
              throw txErr;
            }
          }
        }

        return {
          id: billId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          billNumber: createdBillNumber,
          verificationBarcode,
          customerId: payload.customerId,
          customerName: payload.customerName.trim(),
          customerMobile: payload.customerMobile,
          customerAddress: payload.customerAddress,
          itemCount: payload.items.length,
          subtotal: calcData.subtotal,
          discountAmount: calcData.discountAmount,
          taxableAmount: calcData.taxableAmount,
          gstType: calcData.gstType,
          cgstAmount: calcData.cgstAmount,
          sgstAmount: calcData.sgstAmount,
          igstAmount: calcData.igstAmount,
          totalTax: calcData.totalTax,
          labourCharge: calcData.labourCharge,
          labourRatePerPiece: Math.max(0, Math.round((Number(payload.labourRatePerPiece) || 0) * 100) / 100),
          autoCharge: calcData.autoCharge,
          grandTotal: calcData.grandTotal,
          amountPaid: calcData.amountPaid,
          pendingBalance: calcData.pendingBalance,
          paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
          paymentStatus: calcData.paymentStatus,
          billStatus: 'active',
          publicToken,
          publicLinkRevoked: false,
          createdByUid: actorUser.uid,
          createdByName: creatorName,
          notes: payload.notes,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } catch (err) {
        submittedKeysRef.current.delete(payload.idempotencyKey);
        setSyncState('error');
        throw err;
      }
    },
    [actorUser, userAccount, business, businessId, accessContext, upiSetting, products, showNotice]
  );

  const recordPaymentAtomic = useCallback(
    async (params: {
      billId: string;
      amount: number;
      method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
      referenceId?: string;
      notes?: string;
    }) => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      if (params.amount <= 0) throw new Error(pickMsg('Payment amount must be greater than zero.', 'చెల్లింపు మొత్తం సున్నా కంటే ఎక్కువగా ఉండాలి.'));

      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
      const creatorName = userAccount.displayName || actorUser.email || 'Staff';

      const runOfflinePayment = async () => {
        const cachedBill = bills.find((b) => b.id === params.billId);
        if (!cachedBill) throw new Error(pickMsg('Bill not found in offline cache.', 'ఆఫ్‌లైన్ క్యాష్‌లో బిల్ కనుగొనబడలేదు.'));
        if (cachedBill.billStatus !== 'active') throw new Error(pickMsg('Cannot record payment on a cancelled or refunded bill.', 'రద్దు చేసిన లేదా వాపసు చేసిన బిల్‌పై చెల్లింపు నమోదు చేయలేరు.'));
        const payAmount = Math.min(cachedBill.pendingBalance, Math.round(params.amount * 100) / 100);
        if (payAmount <= 0) throw new Error(pickMsg('Bill has no pending balance.', 'బిల్‌లో బాకీ మొత్తం లేదు.'));

        const nextPaid = Math.round((cachedBill.amountPaid + payAmount) * 100) / 100;
        const nextPending = Math.max(0, Math.round((cachedBill.grandTotal - nextPaid) * 100) / 100);
        const nextStatus = nextPending === 0 ? 'paid' : 'partial';

        const batch = writeBatch(db);
        batch.update(doc(db, 'bills', params.billId), {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentMethod: params.method,
          paymentStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });
        const matchingInvoice = invoices.find((inv) => inv.billId === cachedBill.id);
        if (matchingInvoice) {
          batch.update(doc(db, 'invoices', matchingInvoice.id), {
            paymentStatus: nextStatus,
            updatedAt: serverTimestamp(),
          });
        }
        batch.update(doc(db, 'publicInvoices', cachedBill.publicToken), {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentMethod: params.method,
          paymentStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });
        if (cachedBill.customerId) {
          batch.update(doc(db, 'customers', cachedBill.customerId), {
            outstandingBalance: increment(-payAmount),
            updatedAt: serverTimestamp(),
          });
        }
        const payId = generateSafeId('pay');
        batch.set(doc(db, 'payments', payId), {
          id: payId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          billId: cachedBill.id,
          billNumber: cachedBill.billNumber,
          customerId: cachedBill.customerId || '',
          customerName: cachedBill.customerName,
          amount: payAmount,
          method: params.method,
          referenceId: (params.referenceId || '').trim(),
          status: 'completed',
          type: 'payment',
          recordedByUid: actorUser.uid,
          recordedByName: creatorName,
          notes: (params.notes || '').trim(),
          createdAt: serverTimestamp(),
        });
        await commitWithOfflineSupport(batch.commit());
        setSyncState('offline');
        showNotice(
          'offline',
          pickMsg(
            `Payment ₹${payAmount.toFixed(0)} saved offline · Will sync to database`,
            `చెల్లింపు ₹${payAmount.toFixed(0)} ఆఫ్‌లైన్‌లో సేవ్ అయింది · డేటాబేస్‌కు సింక్ అవుతుంది`
          )
        );
      };

      if (!navigator.onLine) {
        await runOfflinePayment();
        return;
      }

      try {
        await runTransaction(db, async (tx) => {
        const billRef = doc(db, 'bills', params.billId);
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) throw new Error(pickMsg('Bill not found.', 'బిల్ కనుగొనబడలేదు.'));
        const billData = billSnap.data() as Bill;
        if (billData.billStatus !== 'active') throw new Error(pickMsg('Cannot record payment on a cancelled or refunded bill.', 'రద్దు చేసిన లేదా వాపసు చేసిన బిల్‌పై చెల్లింపు నమోదు చేయలేరు.'));

        const payAmount = Math.min(billData.pendingBalance, Math.round(params.amount * 100) / 100);
        if (payAmount <= 0) throw new Error(pickMsg('Bill has no pending balance.', 'బిల్‌లో బాకీ మొత్తం లేదు.'));

        const nextPaid = Math.round((billData.amountPaid + payAmount) * 100) / 100;
        const nextPending = Math.max(0, Math.round((billData.grandTotal - nextPaid) * 100) / 100);
        const nextStatus = nextPending === 0 ? 'paid' : 'partial';

        const matchingInvoice = invoices.find((inv) => inv.billId === billData.id);
        const [custSnap, invSnap, pubSnap] = await Promise.all([
          billData.customerId ? tx.get(doc(db, 'customers', billData.customerId)) : Promise.resolve(null),
          matchingInvoice ? tx.get(doc(db, 'invoices', matchingInvoice.id)) : Promise.resolve(null),
          billData.publicToken ? tx.get(doc(db, 'publicInvoices', billData.publicToken)) : Promise.resolve(null),
        ]);

        tx.update(billRef, {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentMethod: params.method,
          paymentStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });

        if (matchingInvoice && invSnap && invSnap.exists()) {
          tx.update(doc(db, 'invoices', matchingInvoice.id), {
            paymentStatus: nextStatus,
            updatedAt: serverTimestamp(),
          });
        }

        if (billData.publicToken && pubSnap && pubSnap.exists()) {
          tx.update(doc(db, 'publicInvoices', billData.publicToken), {
            amountPaid: nextPaid,
            pendingBalance: nextPending,
            paymentMethod: params.method,
            paymentStatus: nextStatus,
            updatedAt: serverTimestamp(),
          });
        }

        if (custSnap && custSnap.exists() && billData.customerId) {
          const cData = custSnap.data() as Customer;
          tx.update(doc(db, 'customers', billData.customerId), {
            outstandingBalance: Math.max(0, Math.round(((cData.outstandingBalance || 0) - payAmount) * 100) / 100),
            updatedAt: serverTimestamp(),
          });
        }

        const payId = generateSafeId('pay');
        tx.set(doc(db, 'payments', payId), {
          id: payId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          billId: billData.id,
          billNumber: billData.billNumber,
          customerId: billData.customerId || '',
          customerName: billData.customerName,
          amount: payAmount,
          method: params.method,
          referenceId: (params.referenceId || '').trim(),
          status: 'completed',
          type: 'payment',
          recordedByUid: actorUser.uid,
          recordedByName: creatorName,
          notes: (params.notes || '').trim(),
          createdAt: serverTimestamp(),
        });

        const notifId = generateSafeId('notif');
        tx.set(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title: `Payment Received · ${billData.billNumber}`,
          message: `₹${payAmount.toFixed(2)} received via ${params.method} from ${billData.customerName}.`,
          type: 'payment',
          relatedRecordType: 'bill',
          relatedRecordId: billData.id,
          billNumber: billData.billNumber,
          amount: payAmount,
          customerName: billData.customerName,
          creatorName,
          isRead: false,
          createdAt: serverTimestamp(),
        });

        const audId = generateSafeId('aud');
        tx.set(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'RECORD_PAYMENT',
          entityType: 'bill',
          entityId: billData.id,
          summary: `Recorded ₹${payAmount.toFixed(2)} (${params.method}) on ${billData.billNumber}. New status: ${nextStatus}.`,
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: creatorName,
          createdAt: serverTimestamp(),
        });
      });
      setSyncState('saved');
      setLastSyncedAt(new Date());
      } catch (txErr) {
        const msg = txErr instanceof Error ? txErr.message.toLowerCase() : '';
        if (!navigator.onLine || msg.includes('offline') || msg.includes('unavailable') || msg.includes('network')) {
          await runOfflinePayment();
        } else {
          throw txErr;
        }
      }
    },
    [actorUser, userAccount, businessId, accessContext, invoices, bills, showNotice]
  );

  const cancelBillAtomic = useCallback(
    async (billId: string, reason: string) => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      setSyncState('synchronizing');
      const creatorName = userAccount.displayName || actorUser.email || 'Admin';

      await runTransaction(db, async (tx) => {
        const billRef = doc(db, 'bills', billId);
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) throw new Error(pickMsg('Bill not found.', 'బిల్ కనుగొనబడలేదు.'));
        const billData = billSnap.data() as Bill;
        if (billData.billStatus === 'cancelled') throw new Error(pickMsg('Bill is already cancelled.', 'ఈ బిల్ ఇప్పటికే రద్దు చేయబడింది.'));

        const itemsForBill = billItems.filter((bi) => bi.billId === billId);
        const inv = invoices.find((i) => i.billId === billId);
        const [prodSnaps, custSnap, invSnap, pubSnap] = await Promise.all([
          Promise.all(itemsForBill.map((bi) => tx.get(doc(db, 'products', bi.productId)))),
          billData.customerId ? tx.get(doc(db, 'customers', billData.customerId)) : Promise.resolve(null),
          inv ? tx.get(doc(db, 'invoices', inv.id)) : Promise.resolve(null),
          billData.publicToken ? tx.get(doc(db, 'publicInvoices', billData.publicToken)) : Promise.resolve(null),
        ]);

        tx.update(billRef, {
          billStatus: 'cancelled',
          paymentStatus: 'cancelled',
          publicLinkRevoked: true,
          notes: `${billData.notes ? billData.notes + ' | ' : ''}Cancelled: ${reason}`.slice(0, 400),
          updatedAt: serverTimestamp(),
        });

        if (inv && invSnap && invSnap.exists()) {
          tx.update(doc(db, 'invoices', inv.id), {
            paymentStatus: 'cancelled',
            revoked: true,
            updatedAt: serverTimestamp(),
          });
        }

        if (billData.publicToken && pubSnap && pubSnap.exists()) {
          tx.update(doc(db, 'publicInvoices', billData.publicToken), {
            paymentStatus: 'cancelled',
            revoked: true,
            updatedAt: serverTimestamp(),
          });
        }

        // Restock items
        for (let i = 0; i < itemsForBill.length; i++) {
          const item = itemsForBill[i];
          const snap = prodSnaps[i];
          if (snap.exists()) {
            const p = snap.data() as Product;
            const prevStock = Number(p.stock || 0);
            const nextStock = prevStock + item.quantity;
            tx.update(doc(db, 'products', item.productId), {
              stock: nextStock,
              updatedAt: serverTimestamp(),
            });
            const txId = generateSafeId('itx');
            tx.set(doc(db, 'inventoryTransactions', txId), {
              id: txId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              productId: item.productId,
              productName: item.productName,
              type: 'return',
              quantityChange: item.quantity,
              previousStock: prevStock,
              newStock: nextStock,
              billId,
              billNumber: billData.billNumber,
              note: `Restocked from cancelled bill ${billData.billNumber}`.slice(0, 300),
              createdByUid: actorUser.uid,
              createdAt: serverTimestamp(),
            });
          }
        }

        if (custSnap && custSnap.exists() && billData.customerId) {
          const cData = custSnap.data() as Customer;
          tx.update(doc(db, 'customers', billData.customerId), {
            totalPurchases: Math.max(0, Math.round(((cData.totalPurchases || 0) - billData.grandTotal) * 100) / 100),
            outstandingBalance: Math.max(0, Math.round(((cData.outstandingBalance || 0) - billData.pendingBalance) * 100) / 100),
            updatedAt: serverTimestamp(),
          });
        }

        const notifId = generateSafeId('notif');
        tx.set(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title: `Bill Cancelled · ${billData.billNumber}`.slice(0, 160),
          message: `${creatorName} cancelled ${billData.billNumber}. Reason: ${reason}`.slice(0, 400),
          type: 'cancellation',
          relatedRecordType: 'bill',
          relatedRecordId: billId,
          billNumber: billData.billNumber,
          amount: billData.grandTotal,
          customerName: billData.customerName,
          creatorName: creatorName.slice(0, 120),
          isRead: false,
          createdAt: serverTimestamp(),
        });

        const audId = generateSafeId('aud');
        tx.set(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'CANCEL_BILL',
          entityType: 'bill',
          entityId: billId,
          summary: `Cancelled ${billData.billNumber} (₹${billData.grandTotal.toFixed(2)}). Reason: ${reason}`.slice(0, 400),
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: creatorName.slice(0, 120),
          createdAt: serverTimestamp(),
        });
      });

      setSyncState('saved');
      setLastSyncedAt(new Date());
    },
    [actorUser, userAccount, billItems, invoices, businessId, accessContext]
  );

  const recordRefundAtomic = useCallback(
    async (params: {
      billId: string;
      amount: number;
      method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
      reason: string;
    }) => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      setSyncState('synchronizing');
      const creatorName = userAccount.displayName || actorUser.email || 'Admin';

      await runTransaction(db, async (tx) => {
        const billRef = doc(db, 'bills', params.billId);
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) throw new Error(pickMsg('Bill not found.', 'బిల్ కనుగొనబడలేదు.'));
        const billData = billSnap.data() as Bill;
        const refundAmt = Math.min(billData.amountPaid, Math.round(params.amount * 100) / 100);
        if (refundAmt <= 0) throw new Error(pickMsg('No paid amount available to refund.', 'వాపసు చేయడానికి చెల్లించిన మొత్తం లేదు.'));

        const inv = invoices.find((i) => i.billId === params.billId);
        const [invSnap, pubSnap] = await Promise.all([
          inv ? tx.get(doc(db, 'invoices', inv.id)) : Promise.resolve(null),
          billData.publicToken ? tx.get(doc(db, 'publicInvoices', billData.publicToken)) : Promise.resolve(null),
        ]);

        const nextPaid = Math.max(0, Math.round((billData.amountPaid - refundAmt) * 100) / 100);
        const nextPending = Math.round((billData.grandTotal - nextPaid) * 100) / 100;

        tx.update(billRef, {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentStatus: 'refunded',
          billStatus: 'refunded',
          notes: `${billData.notes ? billData.notes + ' | ' : ''}Refunded ₹${refundAmt.toFixed(2)}: ${params.reason}`.slice(0, 400),
          updatedAt: serverTimestamp(),
        });

        if (inv && invSnap && invSnap.exists()) {
          tx.update(doc(db, 'invoices', inv.id), {
            paymentStatus: 'refunded',
            updatedAt: serverTimestamp(),
          });
        }

        if (billData.publicToken && pubSnap && pubSnap.exists()) {
          tx.update(doc(db, 'publicInvoices', billData.publicToken), {
            amountPaid: nextPaid,
            pendingBalance: nextPending,
            paymentStatus: 'refunded',
            updatedAt: serverTimestamp(),
          });
        }

        const payId = generateSafeId('ref');
        tx.set(doc(db, 'payments', payId), {
          id: payId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          billId: billData.id,
          billNumber: billData.billNumber,
          customerId: billData.customerId || '',
          customerName: billData.customerName,
          amount: refundAmt,
          method: params.method,
          referenceId: '',
          status: 'refunded',
          type: 'refund',
          recordedByUid: actorUser.uid,
          recordedByName: creatorName.slice(0, 120),
          notes: params.reason.slice(0, 300),
          createdAt: serverTimestamp(),
        });

        const notifId = generateSafeId('notif');
        tx.set(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title: `Refund Recorded · ${billData.billNumber}`.slice(0, 160),
          message: `₹${refundAmt.toFixed(2)} refunded via ${params.method}. Reason: ${params.reason}`.slice(0, 400),
          type: 'refund',
          relatedRecordType: 'bill',
          relatedRecordId: billData.id,
          billNumber: billData.billNumber,
          amount: refundAmt,
          customerName: billData.customerName,
          creatorName: creatorName.slice(0, 120),
          isRead: false,
          createdAt: serverTimestamp(),
        });

        const audId = generateSafeId('aud');
        tx.set(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'RECORD_REFUND',
          entityType: 'bill',
          entityId: billData.id,
          summary: `Refunded ₹${refundAmt.toFixed(2)} on ${billData.billNumber}. Reason: ${params.reason}`.slice(0, 400),
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: creatorName.slice(0, 120),
          createdAt: serverTimestamp(),
        });
      });

      setSyncState('saved');
      setLastSyncedAt(new Date());
    },
    [actorUser, userAccount, invoices, businessId, accessContext]
  );

  const editBillAtomic = useCallback(
    async (payload: EditBillPayload) => {
      if (!actorUser || !userAccount || !business) {
        throw new Error(pickMsg('Authentication and business profile required.', 'లాగిన్ మరియు వ్యాపార ప్రొఫైల్ అవసరం.'));
      }
      if (!isAdmin) {
        const targetBill = bills.find((b) => b.id === payload.billId);
        if (
          !targetBill ||
          targetBill.createdByUid !== actorUser.uid ||
          targetBill.editApprovedForUid !== actorUser.uid ||
          !targetBill.editApprovalRequestId
        ) {
          throw new Error(
            pickMsg(
              'Owner approval is required before editing this bill.',
              'ఈ బిల్‌ను సవరించడానికి ముందుగా యజమాని ఆమోదం అవసరం.'
            )
          );
        }
      }
      if (!payload.items.length) {
        throw new Error(pickMsg('Bill must contain at least one item.', 'బిల్‌లో కనీసం ఒక వస్తువు ఉండాలి.'));
      }
      if (!payload.customerName.trim()) {
        throw new Error(pickMsg('Customer name is required.', 'కస్టమర్ పేరు తప్పనిసరి.'));
      }

      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');

      let calcData: ReturnType<typeof calculateBillTotalsLocal>;
      if (navigator.onLine) {
        try {
          const calcRes = await fetch('/api/bills/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: payload.items,
              overallDiscount: payload.overallDiscount,
              taxEnabled: false,
              gstType: 'NONE',
              labourCharge: payload.labourCharge || 0,
              autoCharge: payload.autoCharge || 0,
              amountPaid: payload.amountPaid,
            }),
          });
          const json = await calcRes.json();
          if (!calcRes.ok) {
            throw new Error(json.error || pickMsg('Server financial validation failed.', 'సర్వర్ లెక్కల నిర్ధారణ విఫలమైంది.'));
          }
          calcData = json;
        } catch (fetchErr) {
          if (navigator.onLine && fetchErr instanceof Error && fetchErr.message.includes('validation')) {
            throw fetchErr;
          }
          calcData = calculateBillTotalsLocal({
            items: payload.items,
            overallDiscount: payload.overallDiscount,
            taxEnabled: false,
            gstType: 'NONE',
            labourCharge: payload.labourCharge || 0,
            autoCharge: payload.autoCharge || 0,
            amountPaid: payload.amountPaid,
          });
        }
      } else {
        calcData = calculateBillTotalsLocal({
          items: payload.items,
          overallDiscount: payload.overallDiscount,
          taxEnabled: false,
          gstType: 'NONE',
          labourCharge: payload.labourCharge || 0,
          autoCharge: payload.autoCharge || 0,
          amountPaid: payload.amountPaid,
        });
      }

      const editorName = userAccount.displayName || actorUser.email || 'Admin';
      const oldItems = billItems.filter((bi) => bi.billId === payload.billId);
      const oldQtyByProd = new Map<string, number>();
      oldItems.forEach((oi) => {
        oldQtyByProd.set(oi.productId, (oldQtyByProd.get(oi.productId) || 0) + Number(oi.quantity || 0));
      });
      const newQtyByProd = new Map<string, { qty: number; name: string }>();
      payload.items.forEach((ni) => {
        const prev = newQtyByProd.get(ni.productId);
        newQtyByProd.set(ni.productId, {
          qty: (prev?.qty || 0) + Number(ni.quantity || 0),
          name: ni.productName,
        });
      });

      const affectedProdIds = Array.from(new Set([...oldQtyByProd.keys(), ...newQtyByProd.keys()]));
      const itemsSummary = payload.items
        .map((it) => `${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''} x${it.quantity}`)
        .join(', ')
        .slice(0, 580);
      const mobileRaw = (payload.customerMobile || '').trim();
      const maskedMobile =
        mobileRaw.length >= 4 ? `${'*'.repeat(Math.max(0, mobileRaw.length - 4))}${mobileRaw.slice(-4)}` : '';
      const resolvedPaymentMethod: PaymentMethod = calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid';

      const applySharedUpdates = (
        applyUpdate: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => void,
        applySet: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => void,
        applyDelete: (ref: ReturnType<typeof doc>) => void,
        billData: Bill,
        productLookup: Map<string, Product>,
        customerData: Customer | null,
        hasInvDoc = true,
        hasPubDoc = true,
        consumeReqId = ''
      ) => {
        const billUpdatePayload: Record<string, unknown> = {
          customerName: payload.customerName.trim(),
          customerMobile: mobileRaw,
          customerAddress: (payload.customerAddress || '').trim(),
          itemsSummary,
          itemCount: payload.items.length,
          subtotal: calcData.subtotal,
          discountAmount: calcData.discountAmount,
          taxableAmount: calcData.taxableAmount,
          gstType: calcData.gstType,
          cgstAmount: calcData.cgstAmount,
          sgstAmount: calcData.sgstAmount,
          igstAmount: calcData.igstAmount,
          totalTax: calcData.totalTax,
          labourCharge: calcData.labourCharge,
          labourRatePerPiece: Math.max(0, Math.round((Number(payload.labourRatePerPiece) || 0) * 100) / 100),
          autoCharge: calcData.autoCharge,
          grandTotal: calcData.grandTotal,
          amountPaid: calcData.amountPaid,
          pendingBalance: calcData.pendingBalance,
          paymentMethod: resolvedPaymentMethod,
          paymentStatus: calcData.paymentStatus,
          notes: (payload.notes || '').trim().slice(0, 400),
          editedByUid: actorUser.uid,
          editedByName: editorName.slice(0, 120),
          editedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (!isAdmin || billData.editApprovedForUid || billData.editApprovalRequestId) {
          billUpdatePayload.editApprovedForUid = '';
          billUpdatePayload.editApprovalRequestId = '';
        }

        applyUpdate(doc(db, 'bills', payload.billId), billUpdatePayload);

        if (consumeReqId) {
          applyUpdate(doc(db, 'approvalRequests', consumeReqId), {
            status: 'consumed',
            consumedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        oldItems.forEach((oi) => {
          applyDelete(doc(db, 'billItems', oi.id));
        });

        for (let i = 0; i < payload.items.length; i++) {
          const rawItem = payload.items[i];
          const calcItem = calcData.items[i];
          const itemId = generateSafeId('bi');
          applySet(doc(db, 'billItems', itemId), {
            id: itemId,
            billId: payload.billId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            productId: rawItem.productId,
            productCode: rawItem.productCode || '',
            productName: rawItem.productName,
            variantLabel: rawItem.variantLabel || '',
            barcode: rawItem.barcode || '',
            imageUrl: rawItem.imageUrl && rawItem.imageUrl.length <= 2000 ? rawItem.imageUrl : '',
            quantity: calcItem.quantity,
            unitPrice: calcItem.unitPrice,
            discount: calcItem.discount,
            taxRate: calcItem.taxRate,
            taxAmount: calcItem.taxAmount,
            lineTotal: calcItem.lineTotal,
            createdAt: serverTimestamp(),
          });
        }

        affectedProdIds.forEach((prodId) => {
          const oldQ = oldQtyByProd.get(prodId) || 0;
          const newEntry = newQtyByProd.get(prodId);
          const newQ = newEntry?.qty || 0;
          const stockDelta = oldQ - newQ;
          if (stockDelta === 0) return;
          const prod = productLookup.get(prodId);
          if (!prod) return;
          const prevStock = Number(prod.stock || 0);
          const nextStock = prevStock + stockDelta;
          applyUpdate(doc(db, 'products', prodId), {
            stock: nextStock,
            updatedAt: serverTimestamp(),
          });
          const invTxId = generateSafeId('itx');
          applySet(doc(db, 'inventoryTransactions', invTxId), {
            id: invTxId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            productId: prodId,
            productName: newEntry?.name || prod.name,
            type: 'adjustment',
            quantityChange: stockDelta,
            previousStock: prevStock,
            newStock: nextStock,
            billId: payload.billId,
            billNumber: billData.billNumber,
            note: `Edited bill ${billData.billNumber} by ${editorName}`,
            createdByUid: actorUser.uid,
            createdAt: serverTimestamp(),
          });
        });

        if (customerData && billData.customerId) {
          const totalDelta = calcData.grandTotal - Number(billData.grandTotal || 0);
          const pendingDelta = calcData.pendingBalance - Number(billData.pendingBalance || 0);
          applyUpdate(doc(db, 'customers', billData.customerId), {
            totalPurchases: Math.max(
              0,
              Math.round(((customerData.totalPurchases || 0) + totalDelta) * 100) / 100
            ),
            outstandingBalance: Math.max(
              0,
              Math.round(((customerData.outstandingBalance || 0) + pendingDelta) * 100) / 100
            ),
            updatedAt: serverTimestamp(),
          });
        }

        const inv = invoices.find((i) => i.billId === payload.billId);
        if (inv && hasInvDoc) {
          applyUpdate(doc(db, 'invoices', inv.id), {
            customerName: payload.customerName.trim(),
            grandTotal: calcData.grandTotal,
            paymentStatus: calcData.paymentStatus,
            updatedAt: serverTimestamp(),
          });
        }

        if (billData.publicToken && hasPubDoc) {
          applyUpdate(doc(db, 'publicInvoices', billData.publicToken), {
            customerName: payload.customerName.trim(),
            customerPhoneMasked: maskedMobile,
            customerAddress: (payload.customerAddress || '').trim(),
            itemsSummary: payload.items
              .map(
                (it, idx) =>
                  `${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''} | ${it.quantity} x ₹${it.unitPrice.toFixed(2)} = ₹${calcData.items[idx].lineTotal.toFixed(2)}`
              )
              .join('\n')
              .slice(0, 1450),
            itemsJson: JSON.stringify(
              payload.items.map((it, idx) => ({
                n: it.productName.slice(0, 100),
                v: (it.variantLabel || '').slice(0, 40),
                q: it.quantity,
                p: it.unitPrice,
                t: calcData.items[idx].lineTotal,
                img: it.imageUrl && it.imageUrl.length <= 500 && !it.imageUrl.startsWith('data:') ? it.imageUrl : '',
              }))
            ).slice(0, 7900),
            subtotal: calcData.subtotal,
            discountAmount: calcData.discountAmount,
            cgstAmount: calcData.cgstAmount,
            sgstAmount: calcData.sgstAmount,
            igstAmount: calcData.igstAmount,
            totalTax: calcData.totalTax,
            labourCharge: calcData.labourCharge,
            labourRatePerPiece: Math.max(0, Math.round((Number(payload.labourRatePerPiece) || 0) * 100) / 100),
            autoCharge: calcData.autoCharge,
            grandTotal: calcData.grandTotal,
            amountPaid: calcData.amountPaid,
            pendingBalance: calcData.pendingBalance,
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: calcData.paymentStatus,
            updatedAt: serverTimestamp(),
          });
        }

        if (!isAdmin) {
          const notifId = generateSafeId('notif');
          applySet(doc(db, 'notifications', notifId), {
            id: notifId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            title: `Staff Edited ${billData.billNumber}`,
            message: `${editorName} updated approved bill ${billData.billNumber} (₹${Number(billData.grandTotal || 0).toFixed(2)} -> ₹${calcData.grandTotal.toFixed(2)}).`.slice(0, 400),
            type: 'bill',
            relatedRecordType: 'bill',
            relatedRecordId: payload.billId,
            billNumber: billData.billNumber,
            amount: calcData.grandTotal,
            customerName: payload.customerName.trim(),
            creatorName: editorName.slice(0, 120),
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }

        const audId = generateSafeId('aud');
        applySet(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'EDIT_BILL',
          entityType: 'bill',
          entityId: payload.billId,
          summary: `${isAdmin ? 'Admin' : 'Staff'} ${editorName} edited ${billData.billNumber}: ₹${Number(billData.grandTotal || 0).toFixed(2)} -> ₹${calcData.grandTotal.toFixed(2)}`.slice(0, 400),
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: editorName.slice(0, 120),
          createdAt: serverTimestamp(),
        });
      };

      const runOfflineEdit = async () => {
        const cachedBill = bills.find((b) => b.id === payload.billId);
        if (!cachedBill) throw new Error(pickMsg('Bill not found.', 'బిల్ కనుగొనబడలేదు.'));
        if (cachedBill.billStatus !== 'active') {
          throw new Error(pickMsg('Only active bills can be edited.', 'సక్రియ బిల్లులను మాత్రమే సవరించగలరు.'));
        }
        if (!isAdmin) {
          if (
            cachedBill.createdByUid !== actorUser.uid ||
            cachedBill.editApprovedForUid !== actorUser.uid ||
            !cachedBill.editApprovalRequestId
          ) {
            throw new Error(
              pickMsg(
                'Owner approval is required before editing this bill.',
                'ఈ బిల్‌ను సవరించడానికి ముందుగా యజమాని ఆమోదం అవసరం.'
              )
            );
          }
        }
        const productLookup = new Map<string, Product>();
        products.forEach((p) => productLookup.set(p.id, p));
        const cachedCust = cachedBill.customerId
          ? customers.find((c) => c.id === cachedBill.customerId) || null
          : null;

        const batch = writeBatch(db);
        applySharedUpdates(
          (ref, data) => batch.update(ref, data),
          (ref, data) => batch.set(ref, data),
          (ref) => batch.delete(ref),
          cachedBill,
          productLookup,
          cachedCust,
          true,
          isAdmin,
          cachedBill.editApprovalRequestId || ''
        );
        await commitWithOfflineSupport(batch.commit());
        setSyncState('offline');
        showNotice(
          'offline',
          pickMsg(
            `Edited ${cachedBill.billNumber} offline · Will sync to database`,
            `${cachedBill.billNumber} ఆఫ్‌లైన్‌లో సవరించబడింది · డేటాబేస్‌కు సింక్ అవుతుంది`
          )
        );
      };

      if (!navigator.onLine) {
        await runOfflineEdit();
        return;
      }

      try {
        await runTransaction(db, async (tx) => {
          const billRef = doc(db, 'bills', payload.billId);
          const billSnap = await tx.get(billRef);
          if (!billSnap.exists()) throw new Error(pickMsg('Bill not found.', 'బిల్ కనుగొనబడలేదు.'));
          const billData = billSnap.data() as Bill;
          if (billData.billStatus !== 'active') {
            throw new Error(pickMsg('Only active bills can be edited.', 'సక్రియ బిల్లులను మాత్రమే సవరించగలరు.'));
          }
          if (!isAdmin) {
            if (
              billData.createdByUid !== actorUser.uid ||
              billData.editApprovedForUid !== actorUser.uid ||
              !billData.editApprovalRequestId
            ) {
              throw new Error(
                pickMsg(
                  'Owner approval is required before editing this bill.',
                  'ఈ బిల్‌ను సవరించడానికి ముందుగా యజమాని ఆమోదం అవసరం.'
                )
              );
            }
          }

          const inv = invoices.find((i) => i.billId === payload.billId);
          const [prodSnaps, custSnap, invSnap, pubSnap, reqSnap] = await Promise.all([
            Promise.all(affectedProdIds.map((pid) => tx.get(doc(db, 'products', pid)))),
            billData.customerId ? tx.get(doc(db, 'customers', billData.customerId)) : Promise.resolve(null),
            inv ? tx.get(doc(db, 'invoices', inv.id)) : Promise.resolve(null),
            billData.publicToken ? tx.get(doc(db, 'publicInvoices', billData.publicToken)) : Promise.resolve(null),
            billData.editApprovalRequestId
              ? tx.get(doc(db, 'approvalRequests', billData.editApprovalRequestId))
              : Promise.resolve(null),
          ]);
          const consumeReqId =
            reqSnap && reqSnap.exists() && (reqSnap.data() as ApprovalRequest).status === 'approved'
              ? reqSnap.id
              : '';
          if (!isAdmin && !consumeReqId) {
            throw new Error(
              pickMsg(
                'This edit approval is missing or already used. Please request approval again.',
                'ఈ సవరణ ఆమోదం లేదు లేదా ఇప్పటికే ఉపయోగించబడింది. మళ్లీ ఆమోదం కోసం అభ్యర్థించండి.'
              )
            );
          }

          const productLookup = new Map<string, Product>();
          prodSnaps.forEach((snap, idx) => {
            if (snap.exists()) {
              productLookup.set(affectedProdIds[idx], snap.data() as Product);
            }
          });
          const customerData = custSnap && custSnap.exists() ? (custSnap.data() as Customer) : null;
          const canStaffUpdatePublic =
            Boolean(pubSnap && pubSnap.exists()) &&
            (isAdmin || (pubSnap?.data() as { billId?: string } | undefined)?.billId === payload.billId);

          applySharedUpdates(
            (ref, data) => tx.update(ref, data),
            (ref, data) => tx.set(ref, data),
            (ref) => tx.delete(ref),
            billData,
            productLookup,
            customerData,
            Boolean(invSnap && invSnap.exists()),
            canStaffUpdatePublic,
            consumeReqId
          );
        });
        setSyncState('saved');
        setLastSyncedAt(new Date());
      } catch (txErr) {
        const msg = txErr instanceof Error ? txErr.message.toLowerCase() : '';
        if (!navigator.onLine || msg.includes('offline') || msg.includes('unavailable') || msg.includes('network')) {
          await runOfflineEdit();
        } else {
          throw txErr;
        }
      }
    },
    [actorUser, userAccount, business, isAdmin, billItems, bills, products, customers, invoices, businessId, accessContext, showNotice, pickMsg]
  );

  const updateBillNotes = useCallback(
    async (billId: string, notes: string) => {
      if (!actorUser || !userAccount) return;
      await commitWithOfflineSupport(
        updateDoc(doc(db, 'bills', billId), {
          notes: notes.slice(0, 400),
          updatedAt: serverTimestamp(),
        })
      );
      const audId = generateSafeId('aud');
      await commitWithOfflineSupport(
        setDoc(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'EDIT_BILL_NOTES',
          entityType: 'bill',
          entityId: billId,
          summary: `Updated bill notes: ${notes.slice(0, 100)}`,
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: userAccount.displayName,
          createdAt: serverTimestamp(),
        })
      );
    },
    [actorUser, userAccount, businessId, accessContext]
  );

  const togglePublicInvoiceRevoke = useCallback(
    async (billId: string, publicToken: string, revoked: boolean) => {
      const inv = invoices.find((i) => i.billId === billId);
      const [invExists, pubExists] = navigator.onLine
        ? await Promise.all([
            inv ? getDoc(doc(db, 'invoices', inv.id)).then((s) => s.exists()).catch(() => false) : Promise.resolve(false),
            publicToken ? getDoc(doc(db, 'publicInvoices', publicToken)).then((s) => s.exists()).catch(() => false) : Promise.resolve(false),
          ])
        : [Boolean(inv), Boolean(publicToken)];

      const batch = writeBatch(db);
      batch.update(doc(db, 'bills', billId), {
        publicLinkRevoked: revoked,
        updatedAt: serverTimestamp(),
      });
      if (pubExists && publicToken) {
        batch.update(doc(db, 'publicInvoices', publicToken), {
          revoked,
          updatedAt: serverTimestamp(),
        });
      }
      if (invExists && inv) {
        batch.update(doc(db, 'invoices', inv.id), {
          revoked,
          updatedAt: serverTimestamp(),
        });
      }
      await commitWithOfflineSupport(batch.commit());
    },
    [invoices]
  );

  const saveProduct = useCallback(
    async (
      product: Partial<Product> & {
        name: string;
        category: string;
        purchasePrice: number;
        sellingPrice: number;
        stock: number;
        taxRate: number;
      }
    ): Promise<string> => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      setSyncState('synchronizing');
      const isEdit = Boolean(product.id);
      const id = product.id || generateSafeId('prod');
      const payload: Record<string, unknown> = {
        id,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        productCode: product.productCode || `SLP-${String(products.length + 1).padStart(3, '0')}`,
        name: product.name.trim(),
        nameTe: (product.nameTe || '').trim(),
        category: product.category.trim(),
        barcode: (product.barcode || '').trim() || generateUniqueMixedBarcode(),
        purchasePrice: Number(product.purchasePrice || 0),
        sellingPrice: Number(product.sellingPrice || 0),
        stock: Number(product.stock || 0),
        lowStockThreshold: Number(product.lowStockThreshold ?? 10),
        taxRate: Number(product.taxRate || 0),
        unit: (product.unit || 'Piece').trim(),
        variantsSummary: (product.variantsSummary || '').trim().slice(0, 1000),
        imageUrl: (product.imageUrl || '').trim().slice(0, 350000),
        description: (product.description || '').trim(),
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        await commitWithOfflineSupport(updateDoc(doc(db, 'products', id), payload));
      } else {
        await commitWithOfflineSupport(
          setDoc(doc(db, 'products', id), {
            ...payload,
            createdAt: serverTimestamp(),
          })
        );
      }

      const audId = generateSafeId('aud');
      await commitWithOfflineSupport(
        setDoc(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: isEdit ? 'UPDATE_PRODUCT' : 'CREATE_PRODUCT',
          entityType: 'product',
          entityId: id,
          summary: `${isEdit ? 'Updated' : 'Created'} product "${product.name}" @ ₹${product.sellingPrice}`,
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: userAccount.displayName,
          createdAt: serverTimestamp(),
        })
      );

      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
      return id;
    },
    [actorUser, userAccount, businessId, accessContext, products.length]
  );

  const softDeleteBillAtomic = useCallback(
    async (billId: string) => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      if (navigator.onLine && !auth.currentUser) {
        throw new Error(
          pickMsg(
            'Please sign in again with your password or Google to sync changes online.',
            'మార్పులను ఆన్‌లైన్‌లో సేవ్ చేయడానికి దయచేసి మీ పాస్‌వర్డ్ లేదా గూగుల్‌తో మళ్లీ సైన్ ఇన్ చేయండి.'
          )
        );
      }
      const target = rawBills.find((b) => b.id === billId);
      if (!target) throw new Error(pickMsg('Bill not found.', 'బిల్ కనుగొనబడలేదు.'));
      if (!isAdmin && target.createdByUid !== actorUser.uid) {
        throw new Error(pickMsg('You can only delete bills created by your account.', 'మీరు సృష్టించిన బిల్లులను మాత్రమే తొలగించగలరు.'));
      }
      const nowMs = Date.now();
      const expiresAtMs = nowMs + TEN_DAYS_MS;
      const actorName = (userAccount.displayName || actorUser.email || 'Staff').slice(0, 120);
      const inv = invoices.find((i) => i.billId === billId);

      const [invExists, pubExists] = navigator.onLine
        ? await Promise.all([
            inv ? getDoc(doc(db, 'invoices', inv.id)).then((s) => s.exists()).catch(() => false) : Promise.resolve(false),
            target.publicToken
              ? getDoc(doc(db, 'publicInvoices', target.publicToken)).then((s) => s.exists()).catch(() => false)
              : Promise.resolve(false),
          ])
        : [Boolean(inv), Boolean(target.publicToken)];

      const buildCoreSoftDeleteBatch = (includeLinkedDocs: boolean) => {
        const batch = writeBatch(db);
        batch.update(doc(db, 'bills', billId), {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedAtMs: nowMs,
          deleteExpiresAtMs: expiresAtMs,
          deletedByUid: actorUser.uid,
          deletedByName: actorName,
          publicLinkRevoked: true,
          updatedAt: serverTimestamp(),
        });

        if (includeLinkedDocs) {
          if (inv && invExists) {
            batch.update(doc(db, 'invoices', inv.id), {
              revoked: true,
              updatedAt: serverTimestamp(),
            });
          }
          if (target.publicToken && pubExists) {
            batch.update(doc(db, 'publicInvoices', target.publicToken), {
              revoked: true,
              updatedAt: serverTimestamp(),
            });
          }
        }

        const audId = generateSafeId('aud');
        batch.set(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'SOFT_DELETE_BILL',
          entityType: 'bill',
          entityId: billId,
          summary: `Moved bill ${target.billNumber} (${target.customerName}) to 10-day Removed Bills & Products bin`.slice(0, 400),
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName,
          createdAt: serverTimestamp(),
        });
        return batch;
      };

      const hasLinkedUpdates = (inv && invExists) || (target.publicToken && pubExists);
      try {
        await commitWithOfflineSupport(buildCoreSoftDeleteBatch(true).commit());
      } catch (err) {
        const errMsg = err instanceof Error ? err.message.toLowerCase() : '';
        if (hasLinkedUpdates && errMsg.includes('permission')) {
          await commitWithOfflineSupport(buildCoreSoftDeleteBatch(false).commit());
          if (inv && invExists) {
            await updateDoc(doc(db, 'invoices', inv.id), { revoked: true, updatedAt: serverTimestamp() }).catch(() => {});
          }
          if (target.publicToken && pubExists) {
            await updateDoc(doc(db, 'publicInvoices', target.publicToken), { revoked: true, updatedAt: serverTimestamp() }).catch(() => {});
          }
        } else {
          throw err;
        }
      }

      if (!navigator.onLine) {
        setSyncState('offline');
        showNotice(
          'offline',
          pickMsg(
            `Bill ${target.billNumber} moved to Removed bin offline · Auto-syncs later`,
            `బిల్ ${target.billNumber} ఆఫ్‌లైన్‌లో తొలగించిన జాబితాకు తరలించబడింది · తర్వాత సింక్ అవుతుంది`
          )
        );
      }
    },
    [actorUser, userAccount, rawBills, isAdmin, invoices, businessId, accessContext, showNotice, pickMsg]
  );

  const softDeleteBillsBulkAtomic = useCallback(
    async (billIds: string[]): Promise<number> => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      if (navigator.onLine && !auth.currentUser) {
        throw new Error(
          pickMsg(
            'Please sign in again with your password or Google to sync changes online.',
            'మార్పులను ఆన్‌లైన్‌లో సేవ్ చేయడానికి దయచేసి మీ పాస్‌వర్డ్ లేదా గూగుల్‌తో మళ్లీ సైన్ ఇన్ చేయండి.'
          )
        );
      }
      const uniqueIds = Array.from(new Set(billIds.filter(Boolean)));
      if (uniqueIds.length === 0) return 0;

      const targets = uniqueIds
        .map((id) => rawBills.find((b) => b.id === id))
        .filter((b): b is Bill => Boolean(b && !b.isDeleted));

      if (targets.length === 0) {
        throw new Error(pickMsg('No eligible active bills found to delete.', 'తొలగించడానికి అర్హమైన సక్రియ బిల్లులు లేవు.'));
      }

      if (!isAdmin) {
        const unauthorized = targets.find((b) => b.createdByUid !== actorUser.uid);
        if (unauthorized) {
          throw new Error(pickMsg('You can only delete bills created by your account.', 'మీరు సృష్టించిన బిల్లులను మాత్రమే తొలగించగలరు.'));
        }
      }

      const nowMs = Date.now();
      const expiresAtMs = nowMs + TEN_DAYS_MS;
      const actorName = (userAccount.displayName || actorUser.email || 'Staff').slice(0, 120);

      // Each bill may enqueue up to 4 writes (bill, invoice, publicInvoice, auditLog).
      // Chunk by 100 bills (<= 400 writes) to stay safely under Firestore's 500-op batch limit.
      const CHUNK_SIZE = 100;
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const linkedFlags = navigator.onLine
          ? await Promise.all(
              chunk.map(async (target) => {
                const inv = invoices.find((entry) => entry.billId === target.id);
                const [invExists, pubExists] = await Promise.all([
                  inv ? getDoc(doc(db, 'invoices', inv.id)).then((s) => s.exists()).catch(() => false) : Promise.resolve(false),
                  target.publicToken
                    ? getDoc(doc(db, 'publicInvoices', target.publicToken)).then((s) => s.exists()).catch(() => false)
                    : Promise.resolve(false),
                ]);
                return { inv, invExists, pubExists };
              })
            )
          : chunk.map((target) => {
              const inv = invoices.find((entry) => entry.billId === target.id);
              return { inv, invExists: Boolean(inv), pubExists: Boolean(target.publicToken) };
            });

        const buildChunkBatch = (includeLinkedDocs: boolean) => {
          const batch = writeBatch(db);
          chunk.forEach((target, idx) => {
            const { inv, invExists, pubExists } = linkedFlags[idx];
            batch.update(doc(db, 'bills', target.id), {
              isDeleted: true,
              deletedAt: serverTimestamp(),
              deletedAtMs: nowMs,
              deleteExpiresAtMs: expiresAtMs,
              deletedByUid: actorUser.uid,
              deletedByName: actorName,
              publicLinkRevoked: true,
              updatedAt: serverTimestamp(),
            });

            if (includeLinkedDocs) {
              if (inv && invExists) {
                batch.update(doc(db, 'invoices', inv.id), {
                  revoked: true,
                  updatedAt: serverTimestamp(),
                });
              }

              if (target.publicToken && pubExists) {
                batch.update(doc(db, 'publicInvoices', target.publicToken), {
                  revoked: true,
                  updatedAt: serverTimestamp(),
                });
              }
            }

            const audId = generateSafeId('aud');
            batch.set(doc(db, 'auditLogs', audId), {
              id: audId,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              action: 'SOFT_DELETE_BILL',
              entityType: 'bill',
              entityId: target.id,
              summary: `Bulk moved bill ${target.billNumber} (${target.customerName}) to 10-day Removed Bills & Products bin`.slice(0, 400),
              actorUid: actorUser.uid,
              actorEmail: actorUser.email || '',
              actorName,
              createdAt: serverTimestamp(),
            });
          });
          return batch;
        };

        const hasAnyLinked = linkedFlags.some((f) => (f.inv && f.invExists) || f.pubExists);
        try {
          await commitWithOfflineSupport(buildChunkBatch(true).commit());
        } catch (err) {
          const errMsg = err instanceof Error ? err.message.toLowerCase() : '';
          if (hasAnyLinked && errMsg.includes('permission')) {
            await commitWithOfflineSupport(buildChunkBatch(false).commit());
            await Promise.all(
              chunk.map(async (target, idx) => {
                const { inv, invExists, pubExists } = linkedFlags[idx];
                if (inv && invExists) {
                  await updateDoc(doc(db, 'invoices', inv.id), { revoked: true, updatedAt: serverTimestamp() }).catch(() => {});
                }
                if (target.publicToken && pubExists) {
                  await updateDoc(doc(db, 'publicInvoices', target.publicToken), { revoked: true, updatedAt: serverTimestamp() }).catch(() => {});
                }
              })
            );
          } else {
            throw err;
          }
        }
      }

      if (!navigator.onLine) {
        setSyncState('offline');
        showNotice(
          'offline',
          pickMsg(
            `${targets.length} bills moved to Removed bin offline · Auto-syncs later`,
            `${targets.length} బిల్లులు ఆఫ్‌లైన్‌లో తొలగించిన జాబితాకు తరలించబడ్డాయి · తర్వాత సింక్ అవుతాయి`
          )
        );
      }

      return targets.length;
    },
    [actorUser, userAccount, rawBills, isAdmin, invoices, businessId, accessContext, showNotice, pickMsg]
  );

  const restoreDeletedBillAtomic = useCallback(
    async (billId: string) => {
      if (!actorUser || !userAccount || !isAdmin) {
        throw new Error(pickMsg('Only business administrators can restore deleted bills.', 'తొలగించిన బిల్లులను యజమాని మాత్రమే పునరుద్ధరించగలరు.'));
      }
      const target = rawBills.find((b) => b.id === billId);
      if (!target) throw new Error(pickMsg('Removed bill not found.', 'తొలగించిన బిల్ కనుగొనబడలేదు.'));
      const actorName = (userAccount.displayName || actorUser.email || 'Admin').slice(0, 120);

      const batch = writeBatch(db);
      batch.update(doc(db, 'bills', billId), {
        isDeleted: false,
        updatedAt: serverTimestamp(),
      });

      const audId = generateSafeId('aud');
      batch.set(doc(db, 'auditLogs', audId), {
        id: audId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        action: 'RESTORE_BILL',
        entityType: 'bill',
        entityId: billId,
        summary: `Restored bill ${target.billNumber} (${target.customerName}) from Removed Bills & Products`.slice(0, 400),
        actorUid: actorUser.uid,
        actorEmail: actorUser.email || '',
        actorName,
        createdAt: serverTimestamp(),
      });

      await commitWithOfflineSupport(batch.commit());
    },
    [actorUser, userAccount, isAdmin, rawBills, businessId, accessContext, pickMsg]
  );

  const permanentlyDeleteBillAtomic = useCallback(
    async (billId: string) => {
      if (!actorUser || !userAccount || !isAdmin) {
        throw new Error(pickMsg('Only business administrators can permanently delete bills.', 'బిల్లులను శాశ్వతంగా యజమాని మాత్రమే తొలగించగలరు.'));
      }
      if (navigator.onLine && !auth.currentUser) {
        throw new Error(
          pickMsg(
            'Please sign in again with your password or Google to sync changes online.',
            'మార్పులను ఆన్‌లైన్‌లో సేవ్ చేయడానికి దయచేసి మీ పాస్‌వర్డ్ లేదా గూగుల్‌తో మళ్లీ సైన్ ఇన్ చేయండి.'
          )
        );
      }
      const target = rawBills.find((b) => b.id === billId);
      if (!target) return;
      if (!target.isDeleted) {
        await updateDoc(doc(db, 'bills', billId), {
          isDeleted: true,
          updatedAt: serverTimestamp(),
        });
      }

      const targetItems = billItems.filter((bi) => bi.billId === billId);
      const targetInvoices = invoices.filter((inv) => inv.billId === billId);
      const [itemExistsFlags, invExistsFlags, pubExists] = navigator.onLine
        ? await Promise.all([
            Promise.all(targetItems.map((bi) => getDoc(doc(db, 'billItems', bi.id)).then((s) => s.exists()).catch(() => false))),
            Promise.all(targetInvoices.map((inv) => getDoc(doc(db, 'invoices', inv.id)).then((s) => s.exists()).catch(() => false))),
            target.publicToken
              ? getDoc(doc(db, 'publicInvoices', target.publicToken)).then((s) => s.exists()).catch(() => false)
              : Promise.resolve(false),
          ])
        : [targetItems.map(() => true), targetInvoices.map(() => true), Boolean(target.publicToken)];

      const actorName = (userAccount.displayName || actorUser.email || 'Admin').slice(0, 120);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'bills', billId));
      targetItems.forEach((bi, idx) => {
        if (itemExistsFlags[idx]) batch.delete(doc(db, 'billItems', bi.id));
      });
      targetInvoices.forEach((inv, idx) => {
        if (invExistsFlags[idx]) batch.delete(doc(db, 'invoices', inv.id));
      });
      if (target.publicToken && pubExists) {
        batch.delete(doc(db, 'publicInvoices', target.publicToken));
      }

      const audId = generateSafeId('aud');
      batch.set(doc(db, 'auditLogs', audId), {
        id: audId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        action: 'PERMANENT_DELETE_BILL',
        entityType: 'bill',
        entityId: billId,
        summary: `Permanently removed bill ${target.billNumber} (${target.customerName})`.slice(0, 400),
        actorUid: actorUser.uid,
        actorEmail: actorUser.email || '',
        actorName,
        createdAt: serverTimestamp(),
      });

      await commitWithOfflineSupport(batch.commit());
    },
    [actorUser, userAccount, isAdmin, rawBills, billItems, invoices, businessId, accessContext, pickMsg]
  );

  const deleteProduct = useCallback(
    async (productId: string) => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      const target = rawProducts.find((p) => p.id === productId);
      const nowMs = Date.now();
      const expiresAtMs = nowMs + TEN_DAYS_MS;
      const actorName = (userAccount.displayName || actorUser.email || 'Admin').slice(0, 120);

      const batch = writeBatch(db);
      batch.update(doc(db, 'products', productId), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedAtMs: nowMs,
        deleteExpiresAtMs: expiresAtMs,
        deletedByUid: actorUser.uid,
        deletedByName: actorName,
        updatedAt: serverTimestamp(),
      });

      const audId = generateSafeId('aud');
      batch.set(doc(db, 'auditLogs', audId), {
        id: audId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        action: 'SOFT_DELETE_PRODUCT',
        entityType: 'product',
        entityId: productId,
        summary: `Moved product "${target?.name || productId}" to 10-day Removed Bills & Products bin`,
        actorUid: actorUser.uid,
        actorEmail: actorUser.email || '',
        actorName,
        createdAt: serverTimestamp(),
      });

      await commitWithOfflineSupport(batch.commit());
    },
    [actorUser, userAccount, rawProducts, businessId, accessContext, pickMsg]
  );

  const restoreDeletedProduct = useCallback(
    async (productId: string) => {
      if (!actorUser || !userAccount || !isAdmin) {
        throw new Error(pickMsg('Only business administrators can restore deleted products.', 'తొలగించిన ఉత్పత్తులను యజమాని మాత్రమే పునరుద్ధరించగలరు.'));
      }
      const target = rawProducts.find((p) => p.id === productId);
      if (!target) throw new Error(pickMsg('Removed product not found.', 'తొలగించిన ఉత్పత్తి కనుగొనబడలేదు.'));
      const actorName = (userAccount.displayName || actorUser.email || 'Admin').slice(0, 120);

      const batch = writeBatch(db);
      batch.update(doc(db, 'products', productId), {
        isDeleted: false,
        updatedAt: serverTimestamp(),
      });

      const audId = generateSafeId('aud');
      batch.set(doc(db, 'auditLogs', audId), {
        id: audId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        action: 'RESTORE_PRODUCT',
        entityType: 'product',
        entityId: productId,
        summary: `Restored product "${target.name}" from Removed Bills & Products`,
        actorUid: actorUser.uid,
        actorEmail: actorUser.email || '',
        actorName,
        createdAt: serverTimestamp(),
      });

      await commitWithOfflineSupport(batch.commit());
    },
    [actorUser, userAccount, isAdmin, rawProducts, businessId, accessContext, pickMsg]
  );

  const permanentlyDeleteProduct = useCallback(
    async (productId: string) => {
      if (!actorUser || !userAccount || !isAdmin) {
        throw new Error(pickMsg('Only business administrators can permanently delete products.', 'ఉత్పత్తులను శాశ్వతంగా యజమాని మాత్రమే తొలగించగలరు.'));
      }
      const target = rawProducts.find((p) => p.id === productId);
      const actorName = (userAccount.displayName || actorUser.email || 'Admin').slice(0, 120);
      await commitWithOfflineSupport(deleteDoc(doc(db, 'products', productId)));

      const audId = generateSafeId('aud');
      await commitWithOfflineSupport(
        setDoc(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'PERMANENT_DELETE_PRODUCT',
          entityType: 'product',
          entityId: productId,
          summary: `Permanently removed product "${target?.name || productId}"`,
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName,
          createdAt: serverTimestamp(),
        })
      );
    },
    [actorUser, userAccount, isAdmin, rawProducts, businessId, accessContext]
  );

  // Automatic 10-day permanent purge when admin is online
  useEffect(() => {
    if (!isAdmin || !isOnline || loadingData || purgedExpiredRef.current) return;
    const now = Date.now();
    const expiredBills = removedBills.filter(
      (b) => typeof b.deleteExpiresAtMs === 'number' && b.deleteExpiresAtMs <= now
    );
    const expiredProducts = removedProducts.filter(
      (p) => typeof p.deleteExpiresAtMs === 'number' && p.deleteExpiresAtMs <= now
    );
    if (expiredBills.length === 0 && expiredProducts.length === 0) return;

    purgedExpiredRef.current = true;
    (async () => {
      for (const eb of expiredBills) {
        await permanentlyDeleteBillAtomic(eb.id).catch(() => {});
      }
      for (const ep of expiredProducts) {
        await permanentlyDeleteProduct(ep.id).catch(() => {});
      }
    })();
  }, [
    isAdmin,
    isOnline,
    loadingData,
    removedBills,
    removedProducts,
    permanentlyDeleteBillAtomic,
    permanentlyDeleteProduct,
  ]);

  const adjustStockAtomic = useCallback(
    async (productId: string, quantityChange: number, type: 'restock' | 'adjustment' | 'return', note: string) => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');

      const runOfflineStockAdjust = async () => {
        const cached = products.find((p) => p.id === productId);
        if (!cached) throw new Error(pickMsg('Product not found.', 'ఉత్పత్తి కనుగొనబడలేదు.'));
        const prevStock = Number(cached.stock || 0);
        const newStock = prevStock + quantityChange;
        const batch = writeBatch(db);
        batch.update(doc(db, 'products', productId), {
          stock: increment(quantityChange),
          updatedAt: serverTimestamp(),
        });
        const txId = generateSafeId('itx');
        batch.set(doc(db, 'inventoryTransactions', txId), {
          id: txId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          productId,
          productName: cached.name,
          type,
          quantityChange,
          previousStock: prevStock,
          newStock,
          note: note || `Offline ${type}`,
          createdByUid: actorUser.uid,
          createdAt: serverTimestamp(),
        });
        await commitWithOfflineSupport(batch.commit());
        setSyncState('offline');
        showNotice(
          'offline',
          pickMsg(
            'Stock adjustment saved offline · Will sync to database',
            'స్టాక్ మార్పు ఆఫ్‌లైన్‌లో సేవ్ అయింది · డేటాబేస్‌కు సింక్ అవుతుంది'
          )
        );
      };

      if (!navigator.onLine) {
        await runOfflineStockAdjust();
        return;
      }

      try {
        await runTransaction(db, async (tx) => {
          const prodRef = doc(db, 'products', productId);
          const snap = await tx.get(prodRef);
          if (!snap.exists()) throw new Error(pickMsg('Product not found.', 'ఉత్పత్తి కనుగొనబడలేదు.'));
          const p = snap.data() as Product;
          const prevStock = Number(p.stock || 0);
          const newStock = prevStock + quantityChange;

          tx.update(prodRef, {
            stock: newStock,
            updatedAt: serverTimestamp(),
          });

          const txId = generateSafeId('itx');
          tx.set(doc(db, 'inventoryTransactions', txId), {
            id: txId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            productId,
            productName: p.name,
            type,
            quantityChange,
            previousStock: prevStock,
            newStock,
            note: note || `Manual ${type}`,
            createdByUid: actorUser.uid,
            createdAt: serverTimestamp(),
          });
        });

        setSyncState('saved');
        setLastSyncedAt(new Date());
      } catch (txErr) {
        const msg = txErr instanceof Error ? txErr.message.toLowerCase() : '';
        if (!navigator.onLine || msg.includes('offline') || msg.includes('unavailable') || msg.includes('network')) {
          await runOfflineStockAdjust();
        } else {
          throw txErr;
        }
      }
    },
    [actorUser, userAccount, businessId, accessContext, products, showNotice]
  );

  const saveCategory = useCallback(
    async (name: string, nameTe?: string, existingId?: string) => {
      const id = existingId || generateSafeId('cat');
      const data: Record<string, unknown> = {
        id,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        name: name.trim(),
        nameTe: (nameTe || '').trim(),
        updatedAt: serverTimestamp(),
      };
      if (existingId) {
        await commitWithOfflineSupport(updateDoc(doc(db, 'categories', id), data));
      } else {
        await commitWithOfflineSupport(setDoc(doc(db, 'categories', id), { ...data, createdAt: serverTimestamp() }));
      }
    },
    [businessId, accessContext]
  );

  const saveCustomer = useCallback(
    async (customer: Partial<Customer> & { name: string }): Promise<string> => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
      const isEdit = Boolean(customer.id);
      const id = customer.id || generateSafeId('cust');

      const data: Record<string, unknown> = {
        id,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        name: customer.name.trim(),
        mobile: (customer.mobile || '').trim(),
        email: (customer.email || '').trim(),
        address: (customer.address || '').trim(),
        totalPurchases: Number(customer.totalPurchases || 0),
        outstandingBalance: Number(customer.outstandingBalance || 0),
        billCount: Number(customer.billCount || 0),
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        await commitWithOfflineSupport(updateDoc(doc(db, 'customers', id), data));
      } else {
        await commitWithOfflineSupport(setDoc(doc(db, 'customers', id), { ...data, createdAt: serverTimestamp() }));
        const notifId = generateSafeId('notif');
        await commitWithOfflineSupport(
          setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            businessId,
            ownerUid: accessContext.ownerUid,
            authorizedUids: accessContext.authorizedUids,
            authorizedEmails: accessContext.authorizedEmails,
            title: `New Customer: ${customer.name.trim()}`,
            message: `${userAccount.displayName} registered customer ${customer.name.trim()}.`,
            type: 'customer',
            relatedRecordType: 'customer',
            relatedRecordId: id,
            customerName: customer.name.trim(),
            creatorName: userAccount.displayName,
            isRead: false,
            createdAt: serverTimestamp(),
          })
        );
      }
      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
      return id;
    },
    [actorUser, userAccount, businessId, accessContext, pickMsg]
  );

  const saveLabourWork = useCallback(
    async (entry: {
      id?: string;
      workerName: string;
      workDone: string;
      workDate: string;
      wageAmount: number;
      paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Unpaid';
      note?: string;
    }): Promise<string> => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      const cleanName = entry.workerName.trim().slice(0, 160);
      const cleanWork = entry.workDone.trim().slice(0, 300);
      const cleanDate = entry.workDate.trim().slice(0, 10);
      if (!cleanName || !cleanWork || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        throw new Error(
          pickMsg(
            'Worker name, work done, and valid date (YYYY-MM-DD) are required.',
            'పనివారి పేరు, చేసిన పని మరియు సరైన తేదీ తప్పనిసరి.'
          )
        );
      }

      setSyncState('synchronizing');
      const isEdit = Boolean(entry.id);
      const id = entry.id || generateSafeId('lab');
      const wage = Math.max(0, Math.round(Number(entry.wageAmount || 0) * 100) / 100);
      const cleanNote = (entry.note || '').trim().slice(0, 500);

      try {
        if (isEdit) {
          await commitWithOfflineSupport(
            updateDoc(doc(db, 'labourWorks', id), {
              workerName: cleanName,
              workDone: cleanWork,
              workDate: cleanDate,
              wageAmount: wage,
              paymentMethod: entry.paymentMethod,
              note: cleanNote,
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          await commitWithOfflineSupport(
            setDoc(doc(db, 'labourWorks', id), {
              id,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              workerName: cleanName,
              workDone: cleanWork,
              workDate: cleanDate,
              wageAmount: wage,
              paymentMethod: entry.paymentMethod,
              note: cleanNote,
              recordedByUid: actorUser.uid,
              recordedByName: (userAccount.displayName || actorUser.email || 'Staff').slice(0, 120),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );
        }
        setSyncState(navigator.onLine ? 'saved' : 'offline');
        if (navigator.onLine) setLastSyncedAt(new Date());
        return id;
      } catch (err) {
        setSyncState('error');
        handleFirestoreError(err, isEdit ? OperationType.UPDATE : OperationType.CREATE, `labourWorks/${id}`);
        throw err;
      }
    },
    [actorUser, userAccount, businessId, accessContext]
  );

  const deleteLabourWork = useCallback(async (workId: string) => {
    setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
    try {
      await commitWithOfflineSupport(deleteDoc(doc(db, 'labourWorks', workId)));
      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
    } catch (err) {
      setSyncState('error');
      handleFirestoreError(err, OperationType.DELETE, `labourWorks/${workId}`);
      throw err;
    }
  }, []);

  const saveShopEntry = useCallback(
    async (entry: {
      id?: string;
      entryDate: string;
      type: 'income' | 'expense';
      title: string;
      category?: string;
      amount: number;
      paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
      note?: string;
    }): Promise<string> => {
      if (!actorUser || !userAccount) throw new Error(pickMsg('Authentication required.', 'లాగిన్ అవసరం.'));
      const cleanTitle = entry.title.trim().slice(0, 160);
      const cleanDate = entry.entryDate.trim().slice(0, 10);
      const amount = Math.round(Number(entry.amount || 0) * 100) / 100;
      if (!cleanTitle || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || amount <= 0) {
        throw new Error(
          pickMsg(
            'Title, valid date (YYYY-MM-DD), and amount greater than 0 are required.',
            'వివరం, సరైన తేదీ మరియు సున్నా కంటే ఎక్కువ మొత్తం తప్పనిసరి.'
          )
        );
      }

      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
      const isEdit = Boolean(entry.id);
      const id = entry.id || generateSafeId('cash');
      const cleanCategory = (entry.category || '').trim().slice(0, 80);
      const cleanNote = (entry.note || '').trim().slice(0, 500);

      try {
        if (isEdit) {
          await commitWithOfflineSupport(
            updateDoc(doc(db, 'shopEntries', id), {
              entryDate: cleanDate,
              type: entry.type,
              title: cleanTitle,
              category: cleanCategory,
              amount,
              paymentMethod: entry.paymentMethod,
              note: cleanNote,
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          await commitWithOfflineSupport(
            setDoc(doc(db, 'shopEntries', id), {
              id,
              businessId,
              ownerUid: accessContext.ownerUid,
              authorizedUids: accessContext.authorizedUids,
              authorizedEmails: accessContext.authorizedEmails,
              entryDate: cleanDate,
              type: entry.type,
              title: cleanTitle,
              category: cleanCategory,
              amount,
              paymentMethod: entry.paymentMethod,
              note: cleanNote,
              recordedByUid: actorUser.uid,
              recordedByName: (userAccount.displayName || actorUser.email || 'Staff').slice(0, 120),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );
        }
        setSyncState(navigator.onLine ? 'saved' : 'offline');
        if (navigator.onLine) setLastSyncedAt(new Date());
        return id;
      } catch (err) {
        setSyncState('error');
        handleFirestoreError(err, isEdit ? OperationType.UPDATE : OperationType.CREATE, `shopEntries/${id}`);
        throw err;
      }
    },
    [actorUser, userAccount, businessId, accessContext]
  );

  const deleteShopEntry = useCallback(async (entryId: string) => {
    setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
    try {
      await commitWithOfflineSupport(deleteDoc(doc(db, 'shopEntries', entryId)));
      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
    } catch (err) {
      setSyncState('error');
      handleFirestoreError(err, OperationType.DELETE, `shopEntries/${entryId}`);
      throw err;
    }
  }, []);

  const saveBusinessProfile = useCallback(
    async (updates: Partial<Business>) => {
      if (!actorUser || !userAccount) return;
      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
      await commitWithOfflineSupport(
        updateDoc(doc(db, 'businesses', businessId), {
          ...updates,
          updatedAt: serverTimestamp(),
        })
      );
      const notifId = generateSafeId('notif');
      await commitWithOfflineSupport(
        setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title: 'Business Profile Updated',
          message: `${userAccount.displayName} updated business configuration.`,
          type: 'settings',
          creatorName: userAccount.displayName,
          isRead: false,
          createdAt: serverTimestamp(),
        })
      );
      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
    },
    [actorUser, userAccount, businessId, accessContext]
  );

  const saveBusinessSettings = useCallback(
    async (updates: Partial<BusinessSettings>) => {
      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
      await commitWithOfflineSupport(
        updateDoc(doc(db, 'businessSettings', businessId), {
          ...updates,
          updatedAt: serverTimestamp(),
        })
      );
      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
    },
    [businessId]
  );

  const saveUpiSettings = useCallback(
    async (updates: Partial<UpiSetting>) => {
      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
      await commitWithOfflineSupport(
        updateDoc(doc(db, 'upiSettings', businessId), {
          ...updates,
          updatedAt: serverTimestamp(),
        })
      );
      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
    },
    [businessId]
  );

  const markNotificationRead = useCallback(async (notificationId: string) => {
    await commitWithOfflineSupport(updateDoc(doc(db, 'notifications', notificationId), { isRead: true }));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.slice(0, 400).forEach((n) => {
      batch.update(doc(db, 'notifications', n.id), { isRead: true });
    });
    await commitWithOfflineSupport(batch.commit());
  }, [notifications]);

  const logMessageDispatch = useCallback(
    async (
      entry: Omit<
        MessageLog,
        'id' | 'businessId' | 'ownerUid' | 'authorizedUids' | 'authorizedEmails' | 'sentByUid' | 'createdAt'
      >
    ) => {
      if (!actorUser) return;
      const id = generateSafeId('msg');
      await commitWithOfflineSupport(
        setDoc(doc(db, 'messageLogs', id), {
          ...entry,
          recipientMobile: (entry.recipientMobile || '').slice(0, 30),
          billNumber: (entry.billNumber || '').slice(0, 40),
          ...(entry.messageBody ? { messageBody: entry.messageBody.slice(0, 1000) } : {}),
          id,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          sentByUid: actorUser.uid,
          createdAt: serverTimestamp(),
        })
      ).catch(() => {});
    },
    [actorUser, businessId, accessContext]
  );

  const propagateStaffAccessToBusinessDocs = useCallback(
    async (staffUid: string, staffEmail?: string) => {
      const bizRef = doc(db, 'businesses', businessId);
      const bizSnap = await getDoc(bizRef);
      const bizData = bizSnap.exists() ? (bizSnap.data() as Business) : business;
      const nextUids = [...new Set([...(bizData?.authorizedUids || accessContext.authorizedUids), staffUid])].slice(0, 25);
      const cleanEmail = (staffEmail || '').trim().toLowerCase();
      const nextEmails = cleanEmail
        ? [...new Set([...(bizData?.authorizedEmails || accessContext.authorizedEmails), cleanEmail])].slice(0, 25)
        : bizData?.authorizedEmails || accessContext.authorizedEmails;

      await updateDoc(bizRef, {
        authorizedUids: nextUids,
        authorizedEmails: nextEmails,
        updatedAt: serverTimestamp(),
      });

      // Propagate new authorizedUids to business catalog, settings, customers, bills, and invoices
      const cols = [
        'businessSettings',
        'upiSettings',
        'categories',
        'products',
        'customers',
        'bills',
        'billItems',
        'invoices',
        'devices',
      ];

      let batch = writeBatch(db);
      let opCount = 0;

      const flushIfFull = async () => {
        if (opCount >= 380) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      for (const colName of cols) {
        try {
          const snap = await getDocs(
            query(collection(db, colName), where('businessId', '==', businessId), limit(500))
          );
          for (const d of snap.docs) {
            const data = d.data() as { authorizedUids?: string[]; authorizedEmails?: string[] };
            const curUids = Array.isArray(data.authorizedUids) ? data.authorizedUids : [];
            if (curUids.includes(staffUid)) continue;
            const mergedUids = [...new Set([...curUids, staffUid])].slice(0, 25);
            const curEmails = Array.isArray(data.authorizedEmails) ? data.authorizedEmails : [];
            const mergedEmails = cleanEmail
              ? [...new Set([...curEmails, cleanEmail])].slice(0, 25)
              : curEmails;
            const payload: Record<string, unknown> = {
              authorizedUids: mergedUids,
              authorizedEmails: mergedEmails,
            };
            if (colName !== 'billItems' && colName !== 'devices') {
              payload.updatedAt = serverTimestamp();
            } else if (colName === 'devices') {
              payload.lastActiveAt = serverTimestamp();
            }
            batch.update(doc(db, colName, d.id), payload);
            opCount += 1;
            await flushIfFull();
          }
        } catch {
          // ignore collections without matching permissions
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }
    },
    [businessId, business, accessContext]
  );

  const createStaffAccountWithPassword = useCallback(
    async (params: {
      username: string;
      password: string;
      displayName: string;
      phoneNumber?: string;
      email?: string;
      role: UserRole;
      canEditBills: boolean;
      canCancelBills: boolean;
      canViewReports: boolean;
      canManageProducts: boolean;
    }) => {
      if (!actorUser || !userAccount || !isAdmin) {
        throw new Error(pickMsg('Administrator sign-in required.', 'అడ్మినిస్ట్రేటర్ సైన్-ఇన్ అవసరం.'));
      }
      if (!navigator.onLine) {
        throw new Error(pickMsg('Internet connection required to create a new staff login.', 'కొత్త సిబ్బంది లాగిన్ సృష్టించడానికి ఇంటర్నెట్ కనెక్షన్ అవసరం.'));
      }

      const username = normalizeUsername(params.username);
      if (!isValidUsername(username)) {
        throw new Error(
          pickMsg(
            'Username must be 3-40 characters (letters, numbers, dot, underscore, hyphen).',
            'యూజర్‌నేమ్ 3-40 అక్షరాలు ఉండాలి (అక్షరాలు, సంఖ్యలు, డాట్, అండర్‌స్కోర్, హైఫన్).'
          )
        );
      }
      if (!isValidSecretPassword(params.password)) {
        throw new Error(pickMsg('Password must be at least 4 characters.', 'పాస్‌వర్డ్ కనీసం 4 అక్షరాలు ఉండాలి.'));
      }
      const cleanName = params.displayName.trim().slice(0, 120);
      if (!cleanName) throw new Error(pickMsg('Staff full name is required.', 'సిబ్బంది పూర్తి పేరు తప్పనిసరి.'));

      const existingIdx = await getDoc(doc(db, 'usernameIndex', username));
      if (existingIdx.exists()) {
        throw new Error(
          pickMsg(
            `Username "@${username}" already exists. Choose a different username.`,
            `యూజర్‌నేమ్ "@${username}" ఇప్పటికే ఉంది. వేరే యూజర్‌నేమ్ ఎంచుకోండి.`
          )
        );
      }

      const rawEmail = (params.email || '').trim().toLowerCase();
      const authEmail = rawEmail || usernameToSyntheticEmail(username);

      const salt = generateMpinSalt();
      const passwordHash = await hashSecretPassword(params.password, salt);

      // Provision Firebase Auth account on secondary auth instance so Owner remains signed in
      const provisionAuth = getStaffProvisionerAuth();
      let newStaffUid = '';
      try {
        const firebasePwd = toFirebaseAuthPassword(params.password);
        const cred = await createUserWithEmailAndPassword(provisionAuth, authEmail, firebasePwd);
        newStaffUid = cred.user.uid;
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code || '')
            : '';
        if (code === 'auth/operation-not-allowed') {
          throw new Error(
            pickMsg(
              'Email/Password sign-in is disabled in Firebase Console. Open Firebase Console → Authentication → Sign-in method → enable Email/Password first.',
              'ఫైర్‌బేస్ కన్సోల్‌లో ఇమెయిల్/పాస్‌వర్డ్ సైన్-ఇన్ నిలిపివేయబడింది. ముందుగా దాన్ని ప్రారంభించండి.'
            )
          );
        }
        if (code === 'auth/email-already-in-use') {
          throw new Error(
            pickMsg(
              `The email "${authEmail}" is already registered. Use a different username or email, or ask that staff member to set their password in My Profile.`,
              `ఇమెయిల్ "${authEmail}" ఇప్పటికే నమోదైంది. వేరే యూజర్‌నేమ్ లేదా ఇమెయిల్ వాడండి.`
            )
          );
        }
        throw err;
      } finally {
        await authSignOut(provisionAuth).catch(() => {});
      }

      const nextAuthorizedUids = [...new Set([...accessContext.authorizedUids, newStaffUid])].slice(0, 25);

      await setDoc(doc(db, 'users', newStaffUid), {
        uid: newStaffUid,
        email: authEmail,
        authEmail,
        username,
        displayName: cleanName,
        phoneNumber: (params.phoneNumber || '').trim().slice(0, 30),
        role: params.role,
        status: 'active',
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: nextAuthorizedUids,
        canEditBills: params.canEditBills,
        canCancelBills: params.canCancelBills,
        canViewReports: params.canViewReports,
        canManageProducts: params.canManageProducts,
        passwordHash,
        passwordSalt: salt,
        passwordEnabled: true,
        passwordUpdatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'usernameIndex', username), {
        username,
        authEmail,
        uid: newStaffUid,
        businessId,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (params.role === 'admin') {
        await setDoc(doc(db, 'admins', newStaffUid), {
          uid: newStaffUid,
          email: authEmail,
          businessId,
          createdAt: serverTimestamp(),
        });
      }

      await propagateStaffAccessToBusinessDocs(newStaffUid, authEmail);

      const audId = generateSafeId('aud');
      await setDoc(doc(db, 'auditLogs', audId), {
        id: audId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: nextAuthorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        action: 'CREATE_STAFF_USERNAME',
        entityType: 'user',
        entityId: newStaffUid,
        summary: `Created ${params.role} login @${username} (${cleanName})`,
        actorUid: actorUser.uid,
        actorEmail: actorUser.email || '',
        actorName: userAccount.displayName,
        createdAt: serverTimestamp(),
      });

      return { uid: newStaffUid, username, authEmail };
    },
    [actorUser, userAccount, isAdmin, accessContext, businessId, propagateStaffAccessToBusinessDocs]
  );

  const adminUpdateUserCredentials = useCallback(
    async (uid: string, params: { username?: string }) => {
      if (!actorUser || !userAccount || !isAdmin) {
        throw new Error(pickMsg('Administrator sign-in required.', 'అడ్మినిస్ట్రేటర్ సైన్-ఇన్ అవసరం.'));
      }
      const target = users.find((u) => u.uid === uid);
      if (!target) throw new Error(pickMsg('User not found.', 'వినియోగదారు కనుగొనబడలేదు.'));
      if (!params.username) return;

      const nextUname = normalizeUsername(params.username);
      if (!isValidUsername(nextUname)) {
        throw new Error(
          pickMsg(
            'Username must be 3-40 characters (letters, numbers, dot, underscore, hyphen).',
            'యూజర్‌నేమ్ 3-40 అక్షరాలు ఉండాలి (అక్షరాలు, సంఖ్యలు, డాట్, అండర్‌స్కోర్, హైఫన్).'
          )
        );
      }
      const idxSnap = await getDoc(doc(db, 'usernameIndex', nextUname));
      if (idxSnap.exists() && idxSnap.data().uid !== uid) {
        throw new Error(
          pickMsg(
            `Username "@${nextUname}" is already in use.`,
            `యూజర్‌నేమ్ "@${nextUname}" ఇప్పటికే వాడుకలో ఉంది.`
          )
        );
      }
      if (target.username && target.username !== nextUname) {
        await deleteDoc(doc(db, 'usernameIndex', target.username)).catch(() => {});
      }
      const authEmail = (target.authEmail || target.email).toLowerCase();
      await setDoc(doc(db, 'usernameIndex', nextUname), {
        username: nextUname,
        authEmail,
        uid,
        businessId,
        active: target.status === 'active',
        createdAt: idxSnap.exists() ? idxSnap.data().createdAt || serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', uid), {
        username: nextUname,
        authEmail,
        updatedAt: serverTimestamp(),
      });
    },
    [actorUser, userAccount, isAdmin, users, businessId]
  );

  const inviteStaffMember = useCallback(
    async (params: {
      email: string;
      displayName: string;
      role: UserRole;
      canEditBills: boolean;
      canCancelBills: boolean;
      canViewReports: boolean;
      canManageProducts: boolean;
    }) => {
      const cleanEmail = params.email.trim().toLowerCase();
      const inviteId = emailToInviteId(cleanEmail);
      const batch = writeBatch(db);

      batch.set(doc(db, 'invites', inviteId), {
        id: inviteId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        email: cleanEmail,
        displayName: params.displayName.trim(),
        role: params.role,
        status: 'pending',
        canEditBills: params.canEditBills,
        canCancelBills: params.canCancelBills,
        canViewReports: params.canViewReports,
        canManageProducts: params.canManageProducts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const nextEmails = [...new Set([...(business?.authorizedEmails || []), cleanEmail])];
      batch.update(doc(db, 'businesses', businessId), {
        authorizedEmails: nextEmails,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
    },
    [businessId, accessContext, business]
  );

  const updateUserAccess = useCallback(
    async (uid: string, updates: Partial<UserAccount>) => {
      await updateDoc(doc(db, 'users', uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      const target = users.find((u) => u.uid === uid);
      if (target?.username && updates.status) {
        await updateDoc(doc(db, 'usernameIndex', target.username), {
          active: updates.status === 'active',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      if (updates.status && updates.status !== 'active' && business && target) {
        const nextEmails = (business.authorizedEmails || []).filter((e) => e !== target.email.toLowerCase());
        await updateDoc(doc(db, 'businesses', businessId), {
          authorizedEmails: nextEmails,
          updatedAt: serverTimestamp(),
        });
      }
    },
    [business, businessId, users]
  );

  const revokeInvite = useCallback(async (inviteId: string) => {
    await updateDoc(doc(db, 'invites', inviteId), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  }, []);

  const setDeviceStatus = useCallback(async (deviceId: string, status: 'authorized' | 'revoked') => {
    await updateDoc(doc(db, 'devices', deviceId), {
      status,
      lastActiveAt: serverTimestamp(),
    });
  }, []);

  const submitProfileUpdateRequest = useCallback(
    async (params: {
      displayName: string;
      phoneNumber?: string;
      photoDataUrl?: string;
      username?: string;
      email?: string;
    }): Promise<string> => {
      if (!actorUser || !userAccount) {
        throw new Error(pickMsg('Sign in required to submit profile update.', 'ప్రొఫైల్ మార్పు అభ్యర్థనకు సైన్ ఇన్ అవసరం.'));
      }
      if (!navigator.onLine) {
        throw new Error(
          pickMsg(
            'Connect to the internet to submit profile update approval request.',
            'ప్రొఫైల్ నవీకరణ ఆమోద అభ్యర్థన పంపడానికి ఇంటర్నెట్‌కు కనెక్ట్ చేయండి.'
          )
        );
      }

      const existingPending = approvalRequests.find(
        (r) => r.requestType === 'profile_update' && r.requesterUid === actorUser.uid && r.status === 'pending'
      );
      if (existingPending) {
        throw new Error(
          pickMsg(
            'You already have a pending profile update waiting for owner approval.',
            'మీ ప్రొఫైల్ మార్పు అభ్యర్థన ఇప్పటికే యజమాని ఆమోదం కోసం పెండింగ్‌లో ఉంది.'
          )
        );
      }

      const cleanName = params.displayName.trim().slice(0, 120);
      if (!cleanName) {
        throw new Error(pickMsg('Full name cannot be empty.', 'పూర్తి పేరు ఖాళీగా ఉండకూడదు.'));
      }
      const cleanPhone = (params.phoneNumber ?? userAccount.phoneNumber ?? '').trim().slice(0, 30);
      const cleanPhoto = (params.photoDataUrl ?? userAccount.photoDataUrl ?? '').slice(0, 120000);
      const cleanUsernameRaw = params.username !== undefined ? normalizeUsername(params.username) : normalizeUsername(userAccount.username || '');
      const cleanEmailRaw = (params.email ?? userAccount.email).trim().toLowerCase();

      const curName = (userAccount.displayName || '').trim();
      const curPhone = (userAccount.phoneNumber || '').trim();
      const curPhoto = userAccount.photoDataUrl || '';
      const curUsername = normalizeUsername(userAccount.username || '');
      const curEmail = (userAccount.email || '').trim().toLowerCase();

      const changes: string[] = [];
      const reqPayload: Record<string, unknown> = {
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        requestType: 'profile_update',
        status: 'pending',
        requesterUid: actorUser.uid,
        requesterName: (userAccount.displayName || actorUser.email || 'Staff').slice(0, 120),
        requesterEmail: (userAccount.email || actorUser.email || '').slice(0, 160),
      };

      if (cleanName !== curName) {
        reqPayload.currentDisplayName = curName;
        reqPayload.proposedDisplayName = cleanName;
        changes.push(`Name: ${cleanName}`);
      }
      if (cleanPhone !== curPhone) {
        reqPayload.currentPhoneNumber = curPhone;
        reqPayload.proposedPhoneNumber = cleanPhone;
        changes.push(`Phone: ${cleanPhone || '(cleared)'}`);
      }
      if (cleanPhoto !== curPhoto) {
        reqPayload.currentPhotoDataUrl = curPhoto;
        reqPayload.proposedPhotoDataUrl = cleanPhoto;
        changes.push('Profile Photo');
      }
      if (params.username !== undefined && cleanUsernameRaw !== curUsername) {
        if (!isValidUsername(cleanUsernameRaw)) {
          throw new Error(
            pickMsg(
              'Username must be 3-40 characters (letters, numbers, dot, underscore, or hyphen).',
              'యూజర్‌నేమ్ 3-40 అక్షరాలు ఉండాలి (అక్షరాలు, సంఖ్యలు, డాట్, అండర్‌స్కోర్ లేదా హైఫన్).'
            )
          );
        }
        const idxSnap = await getDoc(doc(db, 'usernameIndex', cleanUsernameRaw));
        if (idxSnap.exists()) {
          const idxData = idxSnap.data() as { uid?: string; active?: boolean };
          if (idxData.uid !== actorUser.uid && idxData.active !== false) {
            throw new Error(
              pickMsg(
                `Username "@${cleanUsernameRaw}" is already taken.`,
                `యూజర్‌నేమ్ "@${cleanUsernameRaw}" ఇప్పటికే వాడుకలో ఉంది.`
              )
            );
          }
        }
        reqPayload.currentUsername = curUsername;
        reqPayload.proposedUsername = cleanUsernameRaw;
        changes.push(`Username: @${cleanUsernameRaw}`);
      }
      if (params.email !== undefined && cleanEmailRaw !== curEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmailRaw) || cleanEmailRaw.length > 160) {
          throw new Error(pickMsg('Enter a valid email address.', 'సరైన ఇమెయిల్ చిరునామా నమోదు చేయండి.'));
        }
        reqPayload.currentEmail = curEmail;
        reqPayload.proposedEmail = cleanEmailRaw;
        changes.push(`Email: ${cleanEmailRaw}`);
      }

      if (changes.length === 0) {
        throw new Error(
          pickMsg(
            'No changes detected compared to your current profile.',
            'ప్రస్తుత ప్రొఫైల్‌తో పోలిస్తే ఎలాంటి మార్పులు లేవు.'
          )
        );
      }

      const reqId = generateSafeId('apr');
      reqPayload.id = reqId;
      reqPayload.createdAt = serverTimestamp();
      reqPayload.updatedAt = serverTimestamp();

      const batch = writeBatch(db);
      batch.set(doc(db, 'approvalRequests', reqId), reqPayload);

      const notifId = generateSafeId('notif');
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        title: `Profile Update Request · ${userAccount.displayName}`.slice(0, 160),
        message: `${userAccount.displayName} requested profile changes (${changes.join(', ')}).`.slice(0, 400),
        type: 'approval_request',
        relatedRecordType: 'approval_request',
        relatedRecordId: reqId,
        creatorName: userAccount.displayName.slice(0, 120),
        isRead: false,
        createdAt: serverTimestamp(),
      });

      const audId = generateSafeId('aud');
      batch.set(doc(db, 'auditLogs', audId), {
        id: audId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        action: 'REQUEST_PROFILE_UPDATE',
        entityType: 'approval_request',
        entityId: reqId,
        summary: `${userAccount.displayName} requested profile update (${changes.join(', ')})`.slice(0, 400),
        actorUid: actorUser.uid,
        actorEmail: actorUser.email || '',
        actorName: userAccount.displayName.slice(0, 120),
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      return reqId;
    },
    [actorUser, userAccount, approvalRequests, businessId, accessContext, pickMsg]
  );

  const requestBillEditApproval = useCallback(
    async (params: { billId: string; reason?: string }): Promise<string> => {
      if (!actorUser || !userAccount) {
        throw new Error(pickMsg('Sign in required to request bill edit approval.', 'బిల్ సవరణ ఆమోదం అభ్యర్థించడానికి సైన్ ఇన్ అవసరం.'));
      }
      if (!navigator.onLine) {
        throw new Error(
          pickMsg(
            'Connect to the internet to request owner approval for editing a bill.',
            'బిల్ సవరణకు యజమాని ఆమోదం కోరడానికి ఇంటర్నెట్‌కు కనెక్ట్ చేయండి.'
          )
        );
      }

      const targetBill = bills.find((b) => b.id === params.billId);
      if (!targetBill) {
        throw new Error(pickMsg('Bill not found.', 'బిల్ కనుగొనబడలేదు.'));
      }
      if (targetBill.createdByUid !== actorUser.uid) {
        throw new Error(pickMsg('You can only request edit approval for bills you created.', 'మీరు సృష్టించిన బిల్లులకు మాత్రమే సవరణ ఆమోదం అభ్యర్థించగలరు.'));
      }
      if (targetBill.billStatus !== 'active') {
        throw new Error(pickMsg('Only active bills can be edited.', 'సక్రియ బిల్లులను మాత్రమే సవరించగలరు.'));
      }
      if (targetBill.editApprovedForUid === actorUser.uid && targetBill.editApprovalRequestId) {
        throw new Error(pickMsg('This bill is already approved for editing.', 'ఈ బిల్ సవరణకు ఇప్పటికే ఆమోదించబడింది.'));
      }

      const alreadyPending = approvalRequests.find(
        (r) => r.requestType === 'bill_edit' && r.billId === targetBill.id && r.status === 'pending'
      );
      if (alreadyPending) {
        throw new Error(
          pickMsg(
            'An edit approval request for this bill is already pending owner review.',
            'ఈ బిల్ సవరణ అభ్యర్థన ఇప్పటికే యజమాని ఆమోదం కోసం పెండింగ్‌లో ఉంది.'
          )
        );
      }

      const cleanReason = (params.reason || '').trim().slice(0, 400);
      const reqId = generateSafeId('apr');
      const batch = writeBatch(db);

      batch.set(doc(db, 'approvalRequests', reqId), {
        id: reqId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        requestType: 'bill_edit',
        status: 'pending',
        requesterUid: actorUser.uid,
        requesterName: (userAccount.displayName || actorUser.email || 'Staff').slice(0, 120),
        requesterEmail: (userAccount.email || actorUser.email || '').slice(0, 160),
        billId: targetBill.id,
        billNumber: targetBill.billNumber.slice(0, 40),
        customerName: targetBill.customerName.slice(0, 160),
        grandTotal: Number(targetBill.grandTotal || 0),
        ...(cleanReason ? { reason: cleanReason } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const notifId = generateSafeId('notif');
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        title: `Bill Edit Request · ${targetBill.billNumber}`.slice(0, 160),
        message: `${userAccount.displayName} requested permission to edit ${targetBill.billNumber} (${targetBill.customerName}).${cleanReason ? ` Reason: ${cleanReason}` : ''}`.slice(0, 400),
        type: 'approval_request',
        relatedRecordType: 'approval_request',
        relatedRecordId: reqId,
        billNumber: targetBill.billNumber,
        amount: Number(targetBill.grandTotal || 0),
        customerName: targetBill.customerName,
        creatorName: userAccount.displayName.slice(0, 120),
        isRead: false,
        createdAt: serverTimestamp(),
      });

      const audId = generateSafeId('aud');
      batch.set(doc(db, 'auditLogs', audId), {
        id: audId,
        businessId,
        ownerUid: accessContext.ownerUid,
        authorizedUids: accessContext.authorizedUids,
        authorizedEmails: accessContext.authorizedEmails,
        action: 'REQUEST_BILL_EDIT',
        entityType: 'bill',
        entityId: targetBill.id,
        summary: `${userAccount.displayName} requested edit approval for ${targetBill.billNumber}${cleanReason ? ` (${cleanReason})` : ''}`.slice(0, 400),
        actorUid: actorUser.uid,
        actorEmail: actorUser.email || '',
        actorName: userAccount.displayName.slice(0, 120),
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      return reqId;
    },
    [actorUser, userAccount, bills, approvalRequests, businessId, accessContext, pickMsg]
  );

  const reviewApprovalRequest = useCallback(
    async (params: {
      requestId: string;
      decision: 'approved' | 'rejected';
      decisionNote?: string;
    }) => {
      if (!actorUser || !userAccount || !isAdmin) {
        throw new Error(pickMsg('Owner/Administrator permission required.', 'యజమాని/అడ్మిన్ అనుమతి అవసరం.'));
      }
      if (!navigator.onLine) {
        throw new Error(
          pickMsg(
            'Connect to the internet to approve or reject requests.',
            'అభ్యర్థనలను ఆమోదించడానికి లేదా తిరస్కరించడానికి ఇంటర్నెట్‌కు కనెక్ట్ చేయండి.'
          )
        );
      }

      const reqRef = doc(db, 'approvalRequests', params.requestId);
      const reqSnap = await getDoc(reqRef);
      if (!reqSnap.exists()) {
        throw new Error(pickMsg('Approval request not found.', 'ఆమోద అభ్యర్థన కనుగొనబడలేదు.'));
      }
      const req = reqSnap.data() as ApprovalRequest;
      if (req.status !== 'pending') {
        throw new Error(pickMsg('This request has already been processed.', 'ఈ అభ్యర్థన ఇప్పటికే ప్రాసెస్ చేయబడింది.'));
      }

      const reviewerName = (userAccount.displayName || actorUser.email || 'Owner').slice(0, 120);
      const cleanNote = (params.decisionNote || '').trim().slice(0, 400);
      const batch = writeBatch(db);

      if (params.decision === 'rejected') {
        batch.update(reqRef, {
          status: 'rejected',
          reviewedByUid: actorUser.uid,
          reviewedByName: reviewerName,
          reviewedAt: serverTimestamp(),
          ...(cleanNote ? { decisionNote: cleanNote } : {}),
          updatedAt: serverTimestamp(),
        });

        const notifId = generateSafeId('notif');
        batch.set(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title:
            req.requestType === 'profile_update'
              ? 'Profile Update Rejected'
              : `Bill Edit Rejected · ${req.billNumber || ''}`.slice(0, 160),
          message:
            req.requestType === 'profile_update'
              ? `${reviewerName} declined profile update for ${req.requesterName}.${cleanNote ? ` Note: ${cleanNote}` : ''}`.slice(0, 400)
              : `${reviewerName} declined edit permission for ${req.billNumber || 'bill'} (${req.requesterName}).${cleanNote ? ` Note: ${cleanNote}` : ''}`.slice(0, 400),
          type: 'approval_decision',
          relatedRecordType: 'approval_request',
          relatedRecordId: req.id,
          ...(req.billNumber ? { billNumber: req.billNumber } : {}),
          creatorName: reviewerName,
          isRead: false,
          createdAt: serverTimestamp(),
        });

        const audId = generateSafeId('aud');
        batch.set(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'REJECT_APPROVAL_REQUEST',
          entityType: 'approval_request',
          entityId: req.id,
          summary: `Rejected ${req.requestType} for ${req.requesterName}${req.billNumber ? ` (${req.billNumber})` : ''}`.slice(0, 400),
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: reviewerName,
          createdAt: serverTimestamp(),
        });

        await batch.commit();
        return;
      }

      if (req.requestType === 'profile_update') {
        const userRef = doc(db, 'users', req.requesterUid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          throw new Error(pickMsg('Staff user account not found.', 'సిబ్బంది ఖాతా కనుగొనబడలేదు.'));
        }
        const targetUser = userSnap.data() as UserAccount;
        const userPatch: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };

        if (req.proposedDisplayName !== undefined) {
          userPatch.displayName = req.proposedDisplayName;
        }
        if (req.proposedPhoneNumber !== undefined) {
          userPatch.phoneNumber = req.proposedPhoneNumber;
        }
        if (req.proposedPhotoDataUrl !== undefined) {
          userPatch.photoDataUrl = req.proposedPhotoDataUrl;
        }

        if (req.proposedUsername && req.proposedUsername !== targetUser.username) {
          const nextUsername = normalizeUsername(req.proposedUsername);
          const idxSnap = await getDoc(doc(db, 'usernameIndex', nextUsername));
          if (idxSnap.exists() && idxSnap.data().uid !== targetUser.uid && idxSnap.data().active !== false) {
            throw new Error(
              pickMsg(
                `Username "@${nextUsername}" is already taken.`,
                `యూజర్‌నేమ్ "@${nextUsername}" ఇప్పటికే వాడుకలో ఉంది.`
              )
            );
          }
          if (targetUser.username && targetUser.username !== nextUsername) {
            batch.delete(doc(db, 'usernameIndex', targetUser.username));
          }
          const authEmail = (targetUser.authEmail || targetUser.email).toLowerCase();
          batch.set(doc(db, 'usernameIndex', nextUsername), {
            username: nextUsername,
            authEmail,
            uid: targetUser.uid,
            businessId,
            active: targetUser.status === 'active',
            createdAt: idxSnap.exists() ? idxSnap.data().createdAt || serverTimestamp() : serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          userPatch.username = nextUsername;
          userPatch.authEmail = authEmail;
        }

        if (req.proposedEmail && req.proposedEmail !== targetUser.email.toLowerCase()) {
          const nextEmail = req.proposedEmail.trim().toLowerCase();
          userPatch.email = nextEmail;

          const bizRef = doc(db, 'businesses', businessId);
          const bizSnap = await getDoc(bizRef);
          const existingEmails: string[] = bizSnap.exists()
            ? ((bizSnap.data().authorizedEmails as string[]) || [])
            : [];
          batch.update(bizRef, {
            authorizedEmails: [...new Set([...existingEmails, nextEmail])].slice(0, 25),
            updatedAt: serverTimestamp(),
          });

          const inviteId = emailToInviteId(nextEmail);
          batch.set(doc(db, 'invites', inviteId), {
            id: inviteId,
            businessId,
            ownerUid: targetUser.ownerUid,
            authorizedUids: targetUser.authorizedUids,
            email: nextEmail,
            displayName: (req.proposedDisplayName || targetUser.displayName).slice(0, 120),
            role: targetUser.role,
            status: 'pending',
            canEditBills: Boolean(targetUser.canEditBills),
            canCancelBills: Boolean(targetUser.canCancelBills),
            canViewReports: Boolean(targetUser.canViewReports),
            canManageProducts: Boolean(targetUser.canManageProducts),
            ...(req.proposedPhoneNumber !== undefined
              ? { phoneNumber: req.proposedPhoneNumber }
              : targetUser.phoneNumber
              ? { phoneNumber: targetUser.phoneNumber }
              : {}),
            ...(req.proposedPhotoDataUrl !== undefined
              ? { photoDataUrl: req.proposedPhotoDataUrl }
              : targetUser.photoDataUrl
              ? { photoDataUrl: targetUser.photoDataUrl }
              : {}),
            ...(targetUser.mpinHash ? { mpinHash: targetUser.mpinHash } : {}),
            ...(targetUser.mpinSalt ? { mpinSalt: targetUser.mpinSalt } : {}),
            ...(targetUser.mpinEnabled !== undefined ? { mpinEnabled: Boolean(targetUser.mpinEnabled) } : {}),
            previousUid: targetUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        batch.update(userRef, userPatch);
        batch.update(reqRef, {
          status: 'approved',
          reviewedByUid: actorUser.uid,
          reviewedByName: reviewerName,
          reviewedAt: serverTimestamp(),
          ...(cleanNote ? { decisionNote: cleanNote } : {}),
          updatedAt: serverTimestamp(),
        });

        const notifId = generateSafeId('notif');
        batch.set(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title: 'Profile Update Approved',
          message: `${reviewerName} approved profile changes for ${req.proposedDisplayName || req.requesterName}.`.slice(0, 400),
          type: 'approval_decision',
          relatedRecordType: 'approval_request',
          relatedRecordId: req.id,
          creatorName: reviewerName,
          isRead: false,
          createdAt: serverTimestamp(),
        });

        const audId = generateSafeId('aud');
        batch.set(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'APPROVE_PROFILE_UPDATE',
          entityType: 'user',
          entityId: req.requesterUid,
          summary: `Approved profile update for ${req.requesterName}`.slice(0, 400),
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: reviewerName,
          createdAt: serverTimestamp(),
        });

        await batch.commit();
        return;
      }

      if (req.requestType === 'bill_edit') {
        if (!req.billId) {
          throw new Error(pickMsg('Bill reference missing from request.', 'అభ్యర్థనలో బిల్ వివరాలు లేవు.'));
        }
        const billRef = doc(db, 'bills', req.billId);
        const billSnap = await getDoc(billRef);
        if (!billSnap.exists()) {
          throw new Error(pickMsg('Bill no longer exists.', 'బిల్ కనుగొనబడలేదు.'));
        }
        const billData = billSnap.data() as Bill;
        if (billData.billStatus !== 'active') {
          throw new Error(pickMsg('Only active bills can be approved for edit.', 'సక్రియ బిల్లులకు మాత్రమే సవరణ ఆమోదం ఇవ్వగలరు.'));
        }

        batch.update(billRef, {
          editApprovedForUid: req.requesterUid,
          editApprovalRequestId: req.id,
          editApprovedAt: serverTimestamp(),
          editApprovedByName: reviewerName,
          updatedAt: serverTimestamp(),
        });

        if (billData.publicToken) {
          const pubRef = doc(db, 'publicInvoices', billData.publicToken);
          const pubSnap = await getDoc(pubRef).catch(() => null);
          if (pubSnap && pubSnap.exists() && !(pubSnap.data() as { billId?: string }).billId) {
            batch.update(pubRef, {
              billId: billData.id,
              updatedAt: serverTimestamp(),
            });
          }
        }

        batch.update(reqRef, {
          status: 'approved',
          reviewedByUid: actorUser.uid,
          reviewedByName: reviewerName,
          reviewedAt: serverTimestamp(),
          ...(cleanNote ? { decisionNote: cleanNote } : {}),
          updatedAt: serverTimestamp(),
        });

        const notifId = generateSafeId('notif');
        batch.set(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title: `Bill Edit Approved · ${billData.billNumber}`.slice(0, 160),
          message: `${reviewerName} approved ${req.requesterName} to edit ${billData.billNumber}.`.slice(0, 400),
          type: 'approval_decision',
          relatedRecordType: 'bill',
          relatedRecordId: billData.id,
          billNumber: billData.billNumber,
          amount: Number(billData.grandTotal || 0),
          customerName: billData.customerName,
          creatorName: reviewerName,
          isRead: false,
          createdAt: serverTimestamp(),
        });

        const audId = generateSafeId('aud');
        batch.set(doc(db, 'auditLogs', audId), {
          id: audId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          action: 'APPROVE_BILL_EDIT',
          entityType: 'bill',
          entityId: billData.id,
          summary: `Approved ${req.requesterName} to edit ${billData.billNumber}`.slice(0, 400),
          actorUid: actorUser.uid,
          actorEmail: actorUser.email || '',
          actorName: reviewerName,
          createdAt: serverTimestamp(),
        });

        await batch.commit();
      }
    },
    [actorUser, userAccount, isAdmin, businessId, accessContext, pickMsg]
  );

  return (
    <BillingDataContext.Provider
      value={{
        business,
        businessSettings,
        upiSetting,
        users,
        invites,
        devices,
        categories,
        products,
        removedProducts,
        customers,
        bills,
        removedBills,
        billItems,
        payments,
        invoices,
        inventoryTransactions,
        notifications,
        messageLogs,
        auditLogs,
        labourWorks,
        shopEntries,
        approvalRequests,
        syncState,
        pendingSyncCount,
        cloudNotice,
        dismissCloudNotice,
        lastSyncedAt,
        loadingData,
        createBillAtomic,
        editBillAtomic,
        recordPaymentAtomic,
        cancelBillAtomic,
        softDeleteBillAtomic,
        softDeleteBillsBulkAtomic,
        restoreDeletedBillAtomic,
        permanentlyDeleteBillAtomic,
        recordRefundAtomic,
        updateBillNotes,
        togglePublicInvoiceRevoke,
        saveProduct,
        deleteProduct,
        restoreDeletedProduct,
        permanentlyDeleteProduct,
        adjustStockAtomic,
        saveCategory,
        saveCustomer,
        saveLabourWork,
        deleteLabourWork,
        saveShopEntry,
        deleteShopEntry,
        saveBusinessProfile,
        saveBusinessSettings,
        saveUpiSettings,
        markNotificationRead,
        markAllNotificationsRead,
        logMessageDispatch,
        inviteStaffMember,
        createStaffAccountWithPassword,
        adminUpdateUserCredentials,
        updateUserAccess,
        revokeInvite,
        setDeviceStatus,
        submitProfileUpdateRequest,
        requestBillEditApproval,
        reviewApprovalRequest,
      }}
    >
      {children}
    </BillingDataContext.Provider>
  );
};

export function useBillingData() {
  const ctx = useContext(BillingDataContext);
  if (!ctx) throw new Error('useBillingData must be used inside BillingDataProvider');
  return ctx;
}
