export type NavPageId =
  | 'new-billing'
  | 'bill-history'
  | 'invoices'
  | 'thermal-receipts'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'labour-cashbook'
  | 'shop-income'
  | 'shop-expenses'
  | 'shop-cashbook'
  | 'payments'
  | 'upi-qr'
  | 'reports'
  | 'notifications'
  | 'devices'
  | 'users'
  | 'settings'
  | 'scanner'
  | 'profile';

export type UserRole = 'admin' | 'cashier';
export type UserStatus = 'active' | 'disabled' | 'revoked';
export type SyncState = 'connected' | 'synchronizing' | 'saved' | 'offline' | 'error';
export type GstType = 'NONE' | 'CGST_SGST' | 'IGST';
export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Other' | 'Unpaid';
export type PaymentStatus = 'paid' | 'partial' | 'pending' | 'cancelled' | 'refunded';
export type BillStatus = 'active' | 'cancelled' | 'refunded';
export type Language = 'en' | 'te';
export type ThemeMode = 'light' | 'dark';

export interface Business {
  id: string;
  name: string;
  proprietor?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  currency?: string;
  taxEnabled?: boolean;
  defaultTaxRate?: number;
  billPrefix?: string;
  nextBillNumber?: number;
  logoUrl?: string;
  ownerUid: string;
  ownerEmail?: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserAccount {
  uid: string;
  email: string;
  authEmail?: string;
  username?: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  inviteId?: string;
  canEditBills?: boolean;
  canCancelBills?: boolean;
  canViewReports?: boolean;
  canManageProducts?: boolean;
  phoneNumber?: string;
  photoDataUrl?: string;
  mpinHash?: string;
  mpinSalt?: string;
  mpinEnabled?: boolean;
  mpinUpdatedAt?: unknown;
  passwordHash?: string;
  passwordSalt?: string;
  passwordEnabled?: boolean;
  passwordUpdatedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InviteRecord {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  email: string;
  username?: string;
  displayName: string;
  role: UserRole;
  status: 'pending' | 'accepted' | 'revoked';
  canEditBills?: boolean;
  canCancelBills?: boolean;
  canViewReports?: boolean;
  canManageProducts?: boolean;
  phoneNumber?: string;
  photoDataUrl?: string;
  mpinHash?: string;
  mpinSalt?: string;
  mpinEnabled?: boolean;
  previousUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeviceSession {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  userId: string;
  userEmail?: string;
  userName?: string;
  deviceName: string;
  browser: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  status: 'authorized' | 'revoked';
  lastActiveAt?: unknown;
  createdAt?: unknown;
}

export interface Category {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  name: string;
  nameTe?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductVariant {
  label: string;
  price: number;
}

export interface Product {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  productCode: string;
  name: string;
  nameTe?: string;
  category: string;
  barcode?: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
  lowStockThreshold?: number;
  taxRate: number;
  unit?: string;
  variantsSummary?: string; // JSON-encoded or pipe-separated "6FT:620|6½FT:620"
  imageUrl?: string;
  description?: string;
  isDeleted?: boolean;
  deletedAt?: unknown;
  deletedAtMs?: number;
  deleteExpiresAtMs?: number;
  deletedByUid?: string;
  deletedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Customer {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  name: string;
  mobile?: string;
  email?: string;
  address?: string;
  totalPurchases: number;
  outstandingBalance: number;
  billCount?: number;
  lastPurchaseAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Bill {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  billNumber: string;
  customerId?: string;
  customerName: string;
  customerMobile?: string;
  customerAddress?: string;
  itemsSummary?: string;
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  gstType: GstType;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax: number;
  grandTotal: number;
  amountPaid: number;
  pendingBalance: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  billStatus: BillStatus;
  publicToken: string;
  publicLinkRevoked: boolean;
  verificationBarcode?: string;
  createdByUid: string;
  createdByName: string;
  editedByUid?: string;
  editedByName?: string;
  editedAt?: unknown;
  notes?: string;
  isDeleted?: boolean;
  deletedAt?: unknown;
  deletedAtMs?: number;
  deleteExpiresAtMs?: number;
  deletedByUid?: string;
  deletedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BillItem {
  id: string;
  billId: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  productId: string;
  productCode?: string;
  productName: string;
  variantLabel?: string;
  barcode?: string;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  createdAt?: unknown;
}

export interface PaymentRecord {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  billId: string;
  billNumber: string;
  customerId?: string;
  customerName: string;
  amount: number;
  method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
  referenceId?: string;
  status: 'completed' | 'pending' | 'refunded';
  type: 'payment' | 'refund';
  recordedByUid: string;
  recordedByName?: string;
  notes?: string;
  createdAt?: unknown;
}

export interface InvoiceRecord {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  billId: string;
  invoiceNumber: string;
  publicToken: string;
  revoked: boolean;
  customerName: string;
  grandTotal: number;
  paymentStatus: PaymentStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicInvoice {
  token: string;
  businessId: string;
  ownerUid: string;
  revoked: boolean;
  invoiceNumber: string;
  issuedAtIso?: string;
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  businessGstin?: string;
  businessLogoUrl?: string;
  customerName: string;
  customerPhoneMasked?: string;
  customerAddress?: string;
  itemsSummary?: string;
  itemsJson?: string;
  subtotal?: number;
  discountAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalTax?: number;
  grandTotal: number;
  amountPaid?: number;
  pendingBalance?: number;
  paymentMethod?: string;
  paymentStatus: PaymentStatus;
  upiId?: string;
  upiName?: string;
  verificationBarcode?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryTransaction {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  productId: string;
  productName: string;
  type: 'sale' | 'restock' | 'adjustment' | 'return';
  quantityChange: number;
  previousStock: number;
  newStock: number;
  billId?: string;
  billNumber?: string;
  note?: string;
  createdByUid: string;
  createdAt?: unknown;
}

export interface UpiSetting {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  upiId: string;
  accountHolderName: string;
  businessName: string;
  paymentDescription?: string;
  uploadedQrDataUrl?: string;
  activeMode: 'generated' | 'uploaded';
  updatedAt?: unknown;
}

export interface NotificationItem {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  title: string;
  message: string;
  type: 'bill' | 'payment' | 'low_stock' | 'customer' | 'settings' | 'device' | 'cancellation' | 'refund';
  relatedRecordType?: string;
  relatedRecordId?: string;
  billNumber?: string;
  amount?: number;
  customerName?: string;
  creatorName?: string;
  isRead: boolean;
  createdAt?: unknown;
}

export interface MessageLog {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  channel: 'whatsapp' | 'sms';
  recipientMobile: string;
  billId?: string;
  billNumber: string;
  messageBody?: string;
  status: 'sent' | 'opened_share_screen' | 'queued' | 'failed';
  providerMessageId?: string;
  errorMessage?: string;
  sentByUid: string;
  createdAt?: unknown;
}

export interface BusinessSettings {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  paperWidth: '58mm' | '80mm';
  fontSize: 'sm' | 'md' | 'lg';
  showLogo: boolean;
  showThermalLogo?: boolean;
  showQrCode: boolean;
  footerMessage?: string;
  invoiceNotes?: string;
  whatsappEnabled?: boolean;
  smsEnabled?: boolean;
  smsSenderId?: string;
  smsDltTemplateId?: string;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  actorUid: string;
  actorEmail?: string;
  actorName?: string;
  createdAt?: unknown;
}

export interface LabourWork {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  workerName: string;
  workDone: string;
  workDate: string; // YYYY-MM-DD
  wageAmount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Unpaid';
  note?: string;
  recordedByUid: string;
  recordedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ShopEntry {
  id: string;
  businessId: string;
  ownerUid: string;
  authorizedUids: string[];
  authorizedEmails?: string[];
  entryDate: string; // YYYY-MM-DD
  type: 'income' | 'expense';
  title: string;
  category?: string;
  amount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
  note?: string;
  recordedByUid: string;
  recordedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
