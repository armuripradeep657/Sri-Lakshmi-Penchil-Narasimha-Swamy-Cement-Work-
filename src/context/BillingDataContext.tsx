import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  increment,
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
  commitWithOfflineSupport,
  db,
  emailToInviteId,
  formatTimestamp,
  generateSafeId,
  generateSecureToken,
  handleFirestoreError,
  OperationType,
  waitForPendingWrites,
} from '../lib/firebase';
import { BOOT_ADMIN_EMAIL, DEFAULT_BUSINESS_ID } from '../lib/seedData';
import { generateUniqueMixedBarcode } from '../lib/barcodeAndBillImage';
import { useAuth } from './AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
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
  customers: Customer[];
  bills: Bill[];
  billItems: BillItem[];
  payments: PaymentRecord[];
  invoices: InvoiceRecord[];
  inventoryTransactions: InventoryTransaction[];
  notifications: NotificationItem[];
  messageLogs: MessageLog[];
  auditLogs: AuditLog[];
  labourWorks: LabourWork[];
  shopEntries: ShopEntry[];
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
  updateUserAccess: (uid: string, updates: Partial<UserAccount>) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  setDeviceStatus: (deviceId: string, status: 'authorized' | 'revoked') => Promise<void>;
}

const BillingDataContext = createContext<BillingDataContextValue | null>(null);

function calculateBillTotalsLocal(params: {
  items: CartItemInput[];
  overallDiscount: number;
  taxEnabled: boolean;
  gstType: GstType;
  amountPaid: number;
}) {
  let subtotal = 0;
  let totalItemDiscount = 0;
  let totalTax = 0;

  const calculatedItems = params.items.map((item) => {
    const qty = Number(item.quantity);
    const price = Number(item.unitPrice);
    const itemDisc = Math.max(0, Number(item.discount || 0));
    const rate = params.taxEnabled ? Math.max(0, Math.min(100, Number(item.taxRate || 0))) : 0;

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid quantity or price for ${item.productName || 'item'}`);
    }

    const gross = Math.round(qty * price * 100) / 100;
    const clampedDisc = Math.min(gross, Math.round(itemDisc * 100) / 100);
    const netBeforeTax = Math.round((gross - clampedDisc) * 100) / 100;
    const itemTax =
      params.taxEnabled && params.gstType !== 'NONE'
        ? Math.round(((netBeforeTax * rate) / 100) * 100) / 100
        : 0;
    const lineTotal = Math.round((netBeforeTax + itemTax) * 100) / 100;

    subtotal += gross;
    totalItemDiscount += clampedDisc;
    totalTax += itemTax;

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
  totalTax = Math.round(totalTax * 100) / 100;

  const netBeforeOverallDisc = Math.max(0, subtotal - totalItemDiscount);
  const clampedOverallDisc = Math.min(
    netBeforeOverallDisc,
    Math.max(0, Math.round(Number(params.overallDiscount || 0) * 100) / 100)
  );
  const totalDiscount = Math.round((totalItemDiscount + clampedOverallDisc) * 100) / 100;
  const taxableAmount = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);
  const grandTotal = Math.round((taxableAmount + totalTax) * 100) / 100;

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  if (params.taxEnabled && params.gstType === 'CGST_SGST') {
    cgstAmount = Math.round((totalTax / 2) * 100) / 100;
    sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;
  } else if (params.taxEnabled && params.gstType === 'IGST') {
    igstAmount = totalTax;
  }

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
    gstType: params.taxEnabled ? params.gstType : ('NONE' as GstType),
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    grandTotal,
    amountPaid: paid,
    pendingBalance,
    paymentStatus,
  };
}

export const BillingDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, userAccount, deviceRevoked, accessDeniedReason, authReady, isAdmin } = useAuth();
  const isOnline = useOnlineStatus();

  const [business, setBusiness] = useState<Business | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [upiSetting, setUpiSetting] = useState<UpiSetting | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransaction[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [labourWorks, setLabourWorks] = useState<LabourWork[]>([]);
  const [shopEntries, setShopEntries] = useState<ShopEntry[]>([]);

  const [syncState, setSyncState] = useState<SyncState>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synchronizing'
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [cloudNotice, setCloudNotice] = useState<{
    id: number;
    status: 'offline' | 'syncing' | 'synced';
    message: string;
  } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const submittedKeysRef = useRef<Set<string>>(new Set());
  const pendingColsRef = useRef<Set<string>>(new Set());
  const wasOfflineRef = useRef<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const noticeTimerRef = useRef<number | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);

  const businessId = userAccount?.businessId || DEFAULT_BUSINESS_ID;
  const userUid = firebaseUser?.uid || '';
  const userEmail = (firebaseUser?.email || '').toLowerCase();
  const accountStatus = userAccount?.status || '';

  const showNotice = useCallback(
    (status: 'offline' | 'syncing' | 'synced', message: string, autoHideMs?: number) => {
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
      showNotice('offline', 'Offline Mode — Changes save locally & sync to database when online.');
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setSyncState('synchronizing');
      showNotice('syncing', 'Connected to Internet · Syncing offline data to database...');
      waitForPendingWrites(db)
        .then(() => {
          pendingColsRef.current.clear();
          setPendingSyncCount(0);
          setSyncState('saved');
          setLastSyncedAt(new Date());
          showNotice('synced', 'Connected to Database · All offline changes synced', 3800);
        })
        .catch(() => {
          setSyncState('connected');
          showNotice('synced', 'Connected to Database · Background sync active', 3200);
        });
    } else {
      setSyncState((prev) => (prev === 'offline' ? 'connected' : prev));
    }
  }, [isOnline, showNotice]);

  useEffect(() => {
    if (!authReady || !userUid || !userEmail || accountStatus !== 'active' || accessDeniedReason || deviceRevoked) {
      setLoadingData(false);
      return;
    }

    if (!hasLoadedOnceRef.current) {
      setLoadingData(true);
    }
    setSyncState(navigator.onLine ? 'synchronizing' : 'offline');

    const isBoot = userEmail === BOOT_ADMIN_EMAIL;

    const buildScopedQuery = (colName: string) => {
      if (isBoot) {
        return query(collection(db, colName), where('businessId', '==', businessId));
      }
      return query(collection(db, colName), where('authorizedEmails', 'array-contains', userEmail));
    };

    const unsubs: Array<() => void> = [];

    const markSynced = (sourceKey: string, fromCache: boolean, hasPending: boolean) => {
      if (hasPending) {
        pendingColsRef.current.add(sourceKey);
      } else {
        pendingColsRef.current.delete(sourceKey);
      }
      setPendingSyncCount(pendingColsRef.current.size);

      if (!navigator.onLine) {
        setSyncState('offline');
      } else if (pendingColsRef.current.size > 0) {
        setSyncState('synchronizing');
      } else if (!fromCache) {
        setSyncState('connected');
        setLastSyncedAt(new Date());
      } else {
        setSyncState('connected');
      }
    };

    unsubs.push(
      onSnapshot(
        doc(db, 'businesses', businessId),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) setBusiness(snap.data() as Business);
          markSynced('businesses', snap.metadata.fromCache, snap.metadata.hasPendingWrites);
          hasLoadedOnceRef.current = true;
          setLoadingData(false);
        },
        (err) => {
          if (!navigator.onLine) return;
          setSyncState('error');
          handleFirestoreError(err, OperationType.GET, `businesses/${businessId}`);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'businessSettings', businessId),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) setBusinessSettings(snap.data() as BusinessSettings);
          markSynced('businessSettings', snap.metadata.fromCache, snap.metadata.hasPendingWrites);
        },
        (err) => {
          if (!navigator.onLine) return;
          handleFirestoreError(err, OperationType.GET, `businessSettings/${businessId}`);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'upiSettings', businessId),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) setUpiSetting(snap.data() as UpiSetting);
          markSynced('upiSettings', snap.metadata.fromCache, snap.metadata.hasPendingWrites);
        },
        (err) => {
          if (!navigator.onLine) return;
          handleFirestoreError(err, OperationType.GET, `upiSettings/${businessId}`);
        }
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
          (err) => {
            if (!navigator.onLine) return;
            handleFirestoreError(err, OperationType.LIST, 'users');
          }
        )
      );

      const invQ = isBoot
        ? query(collection(db, 'invites'), where('businessId', '==', businessId))
        : query(collection(db, 'invites'), where('authorizedUids', 'array-contains', userUid));
      unsubs.push(
        onSnapshot(
          invQ,
          (snap) => setInvites(snap.docs.map((d) => d.data() as InviteRecord)),
          (err) => {
            if (!navigator.onLine) return;
            handleFirestoreError(err, OperationType.LIST, 'invites');
          }
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
          { includeMetadataChanges: true },
          (snap) => {
            const list = snap.docs.map((d) => d.data() as T & { createdAt?: unknown });
            if (sortDescByCreatedAt) {
              list.sort((a, b) => formatTimestamp(b.createdAt).getTime() - formatTimestamp(a.createdAt).getTime());
            }
            setter(list as T[]);
            markSynced(colName, snap.metadata.fromCache, snap.metadata.hasPendingWrites);
          },
          (err) => {
            if (!navigator.onLine) return;
            setSyncState('error');
            handleFirestoreError(err, OperationType.LIST, colName);
          }
        )
      );
    };

    subscribeCol<DeviceSession>('devices', setDevices);
    subscribeCol<Category>('categories', setCategories, false);
    subscribeCol<Product>('products', setProducts, false);
    subscribeCol<Customer>('customers', setCustomers);
    subscribeCol<Bill>('bills', setBills);
    subscribeCol<BillItem>('billItems', setBillItems);
    subscribeCol<PaymentRecord>('payments', setPayments);
    subscribeCol<InvoiceRecord>('invoices', setInvoices);
    subscribeCol<InventoryTransaction>('inventoryTransactions', setInventoryTransactions);
    subscribeCol<NotificationItem>('notifications', setNotifications);
    subscribeCol<MessageLog>('messageLogs', setMessageLogs);
    subscribeCol<AuditLog>('auditLogs', setAuditLogs);
    subscribeCol<LabourWork>('labourWorks', setLabourWorks);
    subscribeCol<ShopEntry>('shopEntries', setShopEntries);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, userUid, userEmail, accountStatus, accessDeniedReason, deviceRevoked, businessId, isAdmin]);

  const accessContext = useMemo(() => {
    const ownerUid = business?.ownerUid || userAccount?.ownerUid || firebaseUser?.uid || '';
    const authorizedUids = business?.authorizedUids?.length
      ? business.authorizedUids
      : userAccount?.authorizedUids || [ownerUid];
    const authorizedEmails = business?.authorizedEmails?.length
      ? business.authorizedEmails
      : [firebaseUser?.email?.toLowerCase() || BOOT_ADMIN_EMAIL];
    return { ownerUid, authorizedUids, authorizedEmails };
  }, [business, userAccount, firebaseUser]);

  const createBillAtomic = useCallback(
    async (payload: CreateBillPayload): Promise<Bill> => {
      if (!firebaseUser || !userAccount || !business) {
        throw new Error('Authentication and business profile required.');
      }
      if (submittedKeysRef.current.has(payload.idempotencyKey)) {
        throw new Error('Duplicate bill submission blocked.');
      }
      submittedKeysRef.current.add(payload.idempotencyKey);

      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');

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
                taxEnabled: Boolean(business.taxEnabled),
                gstType: business.taxEnabled ? payload.gstType : 'NONE',
                amountPaid: payload.amountPaid,
              }),
            });
            const json = await calcRes.json();
            if (!calcRes.ok) {
              submittedKeysRef.current.delete(payload.idempotencyKey);
              throw new Error(json.error || 'Server financial validation failed.');
            }
            calcData = json;
          } catch (fetchErr) {
            if (navigator.onLine && fetchErr instanceof Error && fetchErr.message.includes('validation')) {
              throw fetchErr;
            }
            calcData = calculateBillTotalsLocal({
              items: payload.items,
              overallDiscount: payload.overallDiscount,
              taxEnabled: Boolean(business.taxEnabled),
              gstType: business.taxEnabled ? payload.gstType : 'NONE',
              amountPaid: payload.amountPaid,
            });
          }
        } else {
          calcData = calculateBillTotalsLocal({
            items: payload.items,
            overallDiscount: payload.overallDiscount,
            taxEnabled: Boolean(business.taxEnabled),
            gstType: business.taxEnabled ? payload.gstType : 'NONE',
            amountPaid: payload.amountPaid,
          });
        }

        const billId = generateSafeId('bill');
        const publicToken = generateSecureToken();
        const verificationBarcode = generateUniqueMixedBarcode();
        const invoiceId = generateSafeId('inv');
        const creatorName = userAccount.displayName || firebaseUser.email || 'Staff';

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
            grandTotal: calcData.grandTotal,
            amountPaid: calcData.amountPaid,
            pendingBalance: calcData.pendingBalance,
            paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
            paymentStatus: calcData.paymentStatus,
            billStatus: 'active',
            publicToken,
            publicLinkRevoked: false,
            createdByUid: firebaseUser.uid,
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
                createdByUid: firebaseUser.uid,
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
              recordedByUid: firebaseUser.uid,
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
            actorUid: firebaseUser.uid,
            actorEmail: firebaseUser.email || '',
            actorName: creatorName,
            createdAt: serverTimestamp(),
          });

          await commitWithOfflineSupport(batch.commit());
        };

        if (!navigator.onLine) {
          await runOfflineBatchBill();
          setSyncState('offline');
          showNotice('offline', `Bill ${createdBillNumber} saved offline · Will sync to cloud`);
        } else {
          try {
            await runTransaction(db, async (tx) => {
          const bizRef = doc(db, 'businesses', businessId);
          const bizSnap = await tx.get(bizRef);
          if (!bizSnap.exists()) throw new Error('Central business document not found.');
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
            grandTotal: calcData.grandTotal,
            amountPaid: calcData.amountPaid,
            pendingBalance: calcData.pendingBalance,
            paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
            paymentStatus: calcData.paymentStatus,
            billStatus: 'active',
            publicToken,
            publicLinkRevoked: false,
            createdByUid: firebaseUser.uid,
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
                createdByUid: firebaseUser.uid,
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
              recordedByUid: firebaseUser.uid,
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
            actorUid: firebaseUser.uid,
            actorEmail: firebaseUser.email || '',
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
              showNotice('offline', `Bill ${createdBillNumber} saved offline · Will sync to database`);
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
          grandTotal: calcData.grandTotal,
          amountPaid: calcData.amountPaid,
          pendingBalance: calcData.pendingBalance,
          paymentMethod: calcData.amountPaid > 0 ? payload.paymentMethod : 'Unpaid',
          paymentStatus: calcData.paymentStatus,
          billStatus: 'active',
          publicToken,
          publicLinkRevoked: false,
          createdByUid: firebaseUser.uid,
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
    [firebaseUser, userAccount, business, businessId, accessContext, upiSetting, products, showNotice]
  );

  const recordPaymentAtomic = useCallback(
    async (params: {
      billId: string;
      amount: number;
      method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
      referenceId?: string;
      notes?: string;
    }) => {
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
      if (params.amount <= 0) throw new Error('Payment amount must be greater than zero.');

      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');
      const creatorName = userAccount.displayName || firebaseUser.email || 'Staff';

      const runOfflinePayment = async () => {
        const cachedBill = bills.find((b) => b.id === params.billId);
        if (!cachedBill) throw new Error('Bill not found in offline cache.');
        if (cachedBill.billStatus !== 'active') throw new Error('Cannot record payment on a cancelled or refunded bill.');
        const payAmount = Math.min(cachedBill.pendingBalance, Math.round(params.amount * 100) / 100);
        if (payAmount <= 0) throw new Error('Bill has no pending balance.');

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
          recordedByUid: firebaseUser.uid,
          recordedByName: creatorName,
          notes: (params.notes || '').trim(),
          createdAt: serverTimestamp(),
        });
        await commitWithOfflineSupport(batch.commit());
        setSyncState('offline');
        showNotice('offline', `Payment ₹${payAmount.toFixed(0)} saved offline · Will sync to database`);
      };

      if (!navigator.onLine) {
        await runOfflinePayment();
        return;
      }

      try {
        await runTransaction(db, async (tx) => {
        const billRef = doc(db, 'bills', params.billId);
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) throw new Error('Bill not found.');
        const billData = billSnap.data() as Bill;
        if (billData.billStatus !== 'active') throw new Error('Cannot record payment on a cancelled or refunded bill.');

        const payAmount = Math.min(billData.pendingBalance, Math.round(params.amount * 100) / 100);
        if (payAmount <= 0) throw new Error('Bill has no pending balance.');

        const nextPaid = Math.round((billData.amountPaid + payAmount) * 100) / 100;
        const nextPending = Math.max(0, Math.round((billData.grandTotal - nextPaid) * 100) / 100);
        const nextStatus = nextPending === 0 ? 'paid' : 'partial';

        let custSnap = billData.customerId ? await tx.get(doc(db, 'customers', billData.customerId)) : null;

        tx.update(billRef, {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentMethod: params.method,
          paymentStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });

        const matchingInvoice = invoices.find((inv) => inv.billId === billData.id);
        if (matchingInvoice) {
          tx.update(doc(db, 'invoices', matchingInvoice.id), {
            paymentStatus: nextStatus,
            updatedAt: serverTimestamp(),
          });
        }

        tx.update(doc(db, 'publicInvoices', billData.publicToken), {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentMethod: params.method,
          paymentStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });

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
          recordedByUid: firebaseUser.uid,
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
          actorUid: firebaseUser.uid,
          actorEmail: firebaseUser.email || '',
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
    [firebaseUser, userAccount, businessId, accessContext, invoices, bills, showNotice]
  );

  const cancelBillAtomic = useCallback(
    async (billId: string, reason: string) => {
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
      setSyncState('synchronizing');
      const creatorName = userAccount.displayName || firebaseUser.email || 'Admin';

      await runTransaction(db, async (tx) => {
        const billRef = doc(db, 'bills', billId);
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) throw new Error('Bill not found.');
        const billData = billSnap.data() as Bill;
        if (billData.billStatus === 'cancelled') throw new Error('Bill is already cancelled.');

        const itemsForBill = billItems.filter((bi) => bi.billId === billId);
        const prodSnaps = await Promise.all(itemsForBill.map((bi) => tx.get(doc(db, 'products', bi.productId))));
        const custSnap = billData.customerId ? await tx.get(doc(db, 'customers', billData.customerId)) : null;

        tx.update(billRef, {
          billStatus: 'cancelled',
          paymentStatus: 'cancelled',
          publicLinkRevoked: true,
          notes: `${billData.notes ? billData.notes + ' | ' : ''}Cancelled: ${reason}`,
          updatedAt: serverTimestamp(),
        });

        const inv = invoices.find((i) => i.billId === billId);
        if (inv) {
          tx.update(doc(db, 'invoices', inv.id), {
            paymentStatus: 'cancelled',
            revoked: true,
            updatedAt: serverTimestamp(),
          });
        }

        tx.update(doc(db, 'publicInvoices', billData.publicToken), {
          paymentStatus: 'cancelled',
          revoked: true,
          updatedAt: serverTimestamp(),
        });

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
              note: `Restocked from cancelled bill ${billData.billNumber}`,
              createdByUid: firebaseUser.uid,
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
          title: `Bill Cancelled · ${billData.billNumber}`,
          message: `${creatorName} cancelled ${billData.billNumber}. Reason: ${reason}`,
          type: 'cancellation',
          relatedRecordType: 'bill',
          relatedRecordId: billId,
          billNumber: billData.billNumber,
          amount: billData.grandTotal,
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
          action: 'CANCEL_BILL',
          entityType: 'bill',
          entityId: billId,
          summary: `Cancelled ${billData.billNumber} (₹${billData.grandTotal.toFixed(2)}). Reason: ${reason}`,
          actorUid: firebaseUser.uid,
          actorEmail: firebaseUser.email || '',
          actorName: creatorName,
          createdAt: serverTimestamp(),
        });
      });

      setSyncState('saved');
      setLastSyncedAt(new Date());
    },
    [firebaseUser, userAccount, billItems, invoices, businessId, accessContext]
  );

  const recordRefundAtomic = useCallback(
    async (params: {
      billId: string;
      amount: number;
      method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
      reason: string;
    }) => {
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
      setSyncState('synchronizing');
      const creatorName = userAccount.displayName || firebaseUser.email || 'Admin';

      await runTransaction(db, async (tx) => {
        const billRef = doc(db, 'bills', params.billId);
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) throw new Error('Bill not found.');
        const billData = billSnap.data() as Bill;
        const refundAmt = Math.min(billData.amountPaid, Math.round(params.amount * 100) / 100);
        if (refundAmt <= 0) throw new Error('No paid amount available to refund.');

        const nextPaid = Math.max(0, Math.round((billData.amountPaid - refundAmt) * 100) / 100);
        const nextPending = Math.round((billData.grandTotal - nextPaid) * 100) / 100;

        tx.update(billRef, {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentStatus: 'refunded',
          billStatus: 'refunded',
          notes: `${billData.notes ? billData.notes + ' | ' : ''}Refunded ₹${refundAmt.toFixed(2)}: ${params.reason}`,
          updatedAt: serverTimestamp(),
        });

        const inv = invoices.find((i) => i.billId === params.billId);
        if (inv) {
          tx.update(doc(db, 'invoices', inv.id), {
            paymentStatus: 'refunded',
            updatedAt: serverTimestamp(),
          });
        }

        tx.update(doc(db, 'publicInvoices', billData.publicToken), {
          amountPaid: nextPaid,
          pendingBalance: nextPending,
          paymentStatus: 'refunded',
          updatedAt: serverTimestamp(),
        });

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
          recordedByUid: firebaseUser.uid,
          recordedByName: creatorName,
          notes: params.reason,
          createdAt: serverTimestamp(),
        });

        const notifId = generateSafeId('notif');
        tx.set(doc(db, 'notifications', notifId), {
          id: notifId,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          title: `Refund Recorded · ${billData.billNumber}`,
          message: `₹${refundAmt.toFixed(2)} refunded via ${params.method}. Reason: ${params.reason}`,
          type: 'refund',
          relatedRecordType: 'bill',
          relatedRecordId: billData.id,
          billNumber: billData.billNumber,
          amount: refundAmt,
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
          action: 'RECORD_REFUND',
          entityType: 'bill',
          entityId: billData.id,
          summary: `Refunded ₹${refundAmt.toFixed(2)} on ${billData.billNumber}. Reason: ${params.reason}`,
          actorUid: firebaseUser.uid,
          actorEmail: firebaseUser.email || '',
          actorName: creatorName,
          createdAt: serverTimestamp(),
        });
      });

      setSyncState('saved');
      setLastSyncedAt(new Date());
    },
    [firebaseUser, userAccount, invoices, businessId, accessContext]
  );

  const editBillAtomic = useCallback(
    async (payload: EditBillPayload) => {
      if (!firebaseUser || !userAccount || !business) {
        throw new Error('Authentication and business profile required.');
      }
      if (!isAdmin) {
        throw new Error('Only business administrators can edit saved bills.');
      }
      if (!payload.items.length) {
        throw new Error('Bill must contain at least one item.');
      }
      if (!payload.customerName.trim()) {
        throw new Error('Customer name is required.');
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
              taxEnabled: Boolean(business.taxEnabled),
              gstType: business.taxEnabled ? payload.gstType : 'NONE',
              amountPaid: payload.amountPaid,
            }),
          });
          const json = await calcRes.json();
          if (!calcRes.ok) {
            throw new Error(json.error || 'Server financial validation failed.');
          }
          calcData = json;
        } catch (fetchErr) {
          if (navigator.onLine && fetchErr instanceof Error && fetchErr.message.includes('validation')) {
            throw fetchErr;
          }
          calcData = calculateBillTotalsLocal({
            items: payload.items,
            overallDiscount: payload.overallDiscount,
            taxEnabled: Boolean(business.taxEnabled),
            gstType: business.taxEnabled ? payload.gstType : 'NONE',
            amountPaid: payload.amountPaid,
          });
        }
      } else {
        calcData = calculateBillTotalsLocal({
          items: payload.items,
          overallDiscount: payload.overallDiscount,
          taxEnabled: Boolean(business.taxEnabled),
          gstType: business.taxEnabled ? payload.gstType : 'NONE',
          amountPaid: payload.amountPaid,
        });
      }

      const editorName = userAccount.displayName || firebaseUser.email || 'Admin';
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
        customerData: Customer | null
      ) => {
        applyUpdate(doc(db, 'bills', payload.billId), {
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
          grandTotal: calcData.grandTotal,
          amountPaid: calcData.amountPaid,
          pendingBalance: calcData.pendingBalance,
          paymentMethod: resolvedPaymentMethod,
          paymentStatus: calcData.paymentStatus,
          notes: (payload.notes || '').trim().slice(0, 400),
          editedByUid: firebaseUser.uid,
          editedByName: editorName.slice(0, 120),
          editedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

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
            createdByUid: firebaseUser.uid,
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
        if (inv) {
          applyUpdate(doc(db, 'invoices', inv.id), {
            customerName: payload.customerName.trim(),
            grandTotal: calcData.grandTotal,
            paymentStatus: calcData.paymentStatus,
            updatedAt: serverTimestamp(),
          });
        }

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
          grandTotal: calcData.grandTotal,
          amountPaid: calcData.amountPaid,
          pendingBalance: calcData.pendingBalance,
          paymentMethod: resolvedPaymentMethod,
          paymentStatus: calcData.paymentStatus,
          updatedAt: serverTimestamp(),
        });

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
          summary: `Admin ${editorName} edited ${billData.billNumber}: ₹${Number(billData.grandTotal || 0).toFixed(2)} -> ₹${calcData.grandTotal.toFixed(2)}`,
          actorUid: firebaseUser.uid,
          actorEmail: firebaseUser.email || '',
          actorName: editorName,
          createdAt: serverTimestamp(),
        });
      };

      const runOfflineEdit = async () => {
        const cachedBill = bills.find((b) => b.id === payload.billId);
        if (!cachedBill) throw new Error('Bill not found.');
        if (cachedBill.billStatus !== 'active') {
          throw new Error('Only active bills can be edited.');
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
          cachedCust
        );
        await commitWithOfflineSupport(batch.commit());
        setSyncState('offline');
        showNotice('offline', `Edited ${cachedBill.billNumber} offline · Will sync to database`);
      };

      if (!navigator.onLine) {
        await runOfflineEdit();
        return;
      }

      try {
        await runTransaction(db, async (tx) => {
          const billRef = doc(db, 'bills', payload.billId);
          const billSnap = await tx.get(billRef);
          if (!billSnap.exists()) throw new Error('Bill not found.');
          const billData = billSnap.data() as Bill;
          if (billData.billStatus !== 'active') {
            throw new Error('Only active bills can be edited.');
          }

          const prodSnaps = await Promise.all(
            affectedProdIds.map((pid) => tx.get(doc(db, 'products', pid)))
          );
          const productLookup = new Map<string, Product>();
          prodSnaps.forEach((snap, idx) => {
            if (snap.exists()) {
              productLookup.set(affectedProdIds[idx], snap.data() as Product);
            }
          });

          const custSnap = billData.customerId
            ? await tx.get(doc(db, 'customers', billData.customerId))
            : null;
          const customerData = custSnap && custSnap.exists() ? (custSnap.data() as Customer) : null;

          applySharedUpdates(
            (ref, data) => tx.update(ref, data),
            (ref, data) => tx.set(ref, data),
            (ref) => tx.delete(ref),
            billData,
            productLookup,
            customerData
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
    [firebaseUser, userAccount, business, isAdmin, billItems, bills, products, customers, invoices, businessId, accessContext, showNotice]
  );

  const updateBillNotes = useCallback(
    async (billId: string, notes: string) => {
      if (!firebaseUser || !userAccount) return;
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
          actorUid: firebaseUser.uid,
          actorEmail: firebaseUser.email || '',
          actorName: userAccount.displayName,
          createdAt: serverTimestamp(),
        })
      );
    },
    [firebaseUser, userAccount, businessId, accessContext]
  );

  const togglePublicInvoiceRevoke = useCallback(
    async (billId: string, publicToken: string, revoked: boolean) => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bills', billId), {
        publicLinkRevoked: revoked,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'publicInvoices', publicToken), {
        revoked,
        updatedAt: serverTimestamp(),
      });
      const inv = invoices.find((i) => i.billId === billId);
      if (inv) {
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
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
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
        variantsSummary: (product.variantsSummary || '').trim(),
        imageUrl: (product.imageUrl || '').trim(),
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
          actorUid: firebaseUser.uid,
          actorEmail: firebaseUser.email || '',
          actorName: userAccount.displayName,
          createdAt: serverTimestamp(),
        })
      );

      setSyncState(navigator.onLine ? 'saved' : 'offline');
      if (navigator.onLine) setLastSyncedAt(new Date());
      return id;
    },
    [firebaseUser, userAccount, businessId, accessContext, products.length]
  );

  const deleteProduct = useCallback(async (productId: string) => {
    await commitWithOfflineSupport(deleteDoc(doc(db, 'products', productId)));
  }, []);

  const adjustStockAtomic = useCallback(
    async (productId: string, quantityChange: number, type: 'restock' | 'adjustment' | 'return', note: string) => {
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
      setSyncState(navigator.onLine ? 'synchronizing' : 'offline');

      const runOfflineStockAdjust = async () => {
        const cached = products.find((p) => p.id === productId);
        if (!cached) throw new Error('Product not found.');
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
          createdByUid: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });
        await commitWithOfflineSupport(batch.commit());
        setSyncState('offline');
        showNotice('offline', 'Stock adjustment saved offline · Will sync to database');
      };

      if (!navigator.onLine) {
        await runOfflineStockAdjust();
        return;
      }

      try {
        await runTransaction(db, async (tx) => {
          const prodRef = doc(db, 'products', productId);
          const snap = await tx.get(prodRef);
          if (!snap.exists()) throw new Error('Product not found.');
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
            createdByUid: firebaseUser.uid,
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
    [firebaseUser, userAccount, businessId, accessContext, products, showNotice]
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
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
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
    [firebaseUser, userAccount, businessId, accessContext]
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
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
      const cleanName = entry.workerName.trim().slice(0, 160);
      const cleanWork = entry.workDone.trim().slice(0, 300);
      const cleanDate = entry.workDate.trim().slice(0, 10);
      if (!cleanName || !cleanWork || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        throw new Error('Worker name, work done, and valid date (YYYY-MM-DD) are required.');
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
              recordedByUid: firebaseUser.uid,
              recordedByName: (userAccount.displayName || firebaseUser.email || 'Staff').slice(0, 120),
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
    [firebaseUser, userAccount, businessId, accessContext]
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
      if (!firebaseUser || !userAccount) throw new Error('Authentication required.');
      const cleanTitle = entry.title.trim().slice(0, 160);
      const cleanDate = entry.entryDate.trim().slice(0, 10);
      const amount = Math.round(Number(entry.amount || 0) * 100) / 100;
      if (!cleanTitle || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || amount <= 0) {
        throw new Error('Title, valid date (YYYY-MM-DD), and amount greater than 0 are required.');
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
              recordedByUid: firebaseUser.uid,
              recordedByName: (userAccount.displayName || firebaseUser.email || 'Staff').slice(0, 120),
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
    [firebaseUser, userAccount, businessId, accessContext]
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
      if (!firebaseUser || !userAccount) return;
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
    [firebaseUser, userAccount, businessId, accessContext]
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
      if (!firebaseUser) return;
      const id = generateSafeId('msg');
      await commitWithOfflineSupport(
        setDoc(doc(db, 'messageLogs', id), {
          ...entry,
          id,
          businessId,
          ownerUid: accessContext.ownerUid,
          authorizedUids: accessContext.authorizedUids,
          authorizedEmails: accessContext.authorizedEmails,
          sentByUid: firebaseUser.uid,
          createdAt: serverTimestamp(),
        })
      );
    },
    [firebaseUser, businessId, accessContext]
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
      if (updates.status && updates.status !== 'active' && business) {
        const target = users.find((u) => u.uid === uid);
        if (target) {
          const nextEmails = (business.authorizedEmails || []).filter((e) => e !== target.email.toLowerCase());
          await updateDoc(doc(db, 'businesses', businessId), {
            authorizedEmails: nextEmails,
            updatedAt: serverTimestamp(),
          });
        }
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
        customers,
        bills,
        billItems,
        payments,
        invoices,
        inventoryTransactions,
        notifications,
        messageLogs,
        auditLogs,
        labourWorks,
        shopEntries,
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
        recordRefundAtomic,
        updateBillNotes,
        togglePublicInvoiceRevoke,
        saveProduct,
        deleteProduct,
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
        updateUserAccess,
        revokeInvite,
        setDeviceStatus,
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
