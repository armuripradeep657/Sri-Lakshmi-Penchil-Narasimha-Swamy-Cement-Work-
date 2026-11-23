import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FilePlus2,
  FileText,
  Globe,
  HardHat,
  History,
  Laptop,
  Lock,
  LogOut,
  Menu,
  Package,
  Printer,
  QrCode,
  ReceiptText,
  ScanBarcode,
  Settings,
  ShieldCheck,
  User,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PostBillActionsModal } from './components/InvoiceViews';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BillingDataProvider, CartItemInput, useBillingData } from './context/BillingDataContext';
import { DEFAULT_BUSINESS_LOGO } from './lib/seedData';
import { getDefaultProductImage, resolveProductImage } from './lib/productImages';
import { formatCurrency } from './lib/upiAndExport';
import { Bill, NavPageId, Product } from './types/billing';

import { LoginPage } from './pages/LoginPage';
import { PublicInvoicePortal } from './pages/PublicInvoicePortal';
import { NewBillingPage } from './pages/NewBillingPage';
import { BillHistoryPage } from './pages/BillHistoryPage';
import { VerifyScannerPage } from './pages/VerifyScannerPage';
import { ProfilePage } from './pages/ProfilePage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ThermalReceiptsPage } from './pages/ThermalReceiptsPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { CustomersPage } from './pages/CustomersPage';
import { LabourAndCashbookPage } from './pages/LabourAndCashbookPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { UpiQrPage } from './pages/UpiQrPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { DeviceManagementPage } from './pages/DeviceManagementPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { BusinessSettingsPage } from './pages/BusinessSettingsPage';

interface NavItemConfig {
  id: NavPageId;
  label: string;
  labelTe: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  requiresReportsPerm?: boolean;
}

const STAFF_ALLOWED_PAGES: NavPageId[] = ['new-billing', 'bill-history', 'scanner', 'profile'];

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'new-billing', label: 'New Billing', labelTe: 'కొత్త బిల్లింగ్', icon: FilePlus2 },
  { id: 'bill-history', label: 'Bill History', labelTe: 'బిల్లుల చరిత్ర', icon: History },
  { id: 'scanner', label: 'Verify Scanner', labelTe: 'బిల్ స్కానర్', icon: ScanBarcode },
  { id: 'profile', label: 'My Profile & Login', labelTe: 'ప్రొఫైల్ & లాగిన్', icon: User },
  { id: 'invoices', label: 'Invoices', labelTe: 'ఇన్‌వాయిస్‌లు', icon: FileText },
  { id: 'thermal-receipts', label: 'Thermal Receipts', labelTe: 'థర్మల్ రసీదులు', icon: Printer },
  { id: 'products', label: 'Products', labelTe: 'ఉత్పత్తులు', icon: Package },
  { id: 'inventory', label: 'Inventory', labelTe: 'స్టాక్ నిల్వలు', icon: Boxes },
  { id: 'customers', label: 'Customers', labelTe: 'కస్టమర్లు', icon: Users },
  { id: 'labour-cashbook', label: 'Labour Work', labelTe: 'లేబర్ పని', icon: HardHat },
  { id: 'shop-cashbook', label: 'Income & Expenses', labelTe: 'ఆదాయం & ఖర్చులు', icon: Wallet },
  { id: 'payments', label: 'Payments', labelTe: 'చెల్లింపులు', icon: CreditCard },
  { id: 'upi-qr', label: 'UPI QR Management', labelTe: 'UPI QR సెట్టింగ్స్', icon: QrCode, adminOnly: true },
  { id: 'reports', label: 'Reports', labelTe: 'నివేదికలు', icon: BarChart3, requiresReportsPerm: true },
  { id: 'notifications', label: 'Notifications', labelTe: 'నోటిఫికేషన్లు', icon: Bell },
  { id: 'devices', label: 'Device Management', labelTe: 'పరికరాలు', icon: Laptop, adminOnly: true },
  { id: 'users', label: 'User Management', labelTe: 'యూజర్ నిర్వహణ', icon: UserCog, adminOnly: true },
  { id: 'settings', label: 'Business Settings', labelTe: 'బిజినెస్ సెట్టింగ్స్', icon: Settings, adminOnly: true },
];

function extractPublicInvoiceToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('invoice');
  if (queryToken) return queryToken;
  const match = window.location.pathname.match(/^\/invoice\/([a-zA-Z0-9_-]{16,128})$/);
  return match ? match[1] : null;
}

function extractInitialPage(): NavPageId {
  const pageParam = new URLSearchParams(window.location.search).get('page');
  if (pageParam && NAV_ITEMS.some((item) => item.id === pageParam)) {
    return pageParam as NavPageId;
  }
  return 'new-billing';
}

const AuthenticatedShell: React.FC = () => {
  const { activeUid, userAccount, isAdmin, role, language, toggleLanguage, logout, lockWithMpin } =
    useAuth();
  const { business, bills, billItems, products, notifications, loadingData } = useBillingData();

  const [activePage, setActivePage] = useState<NavPageId>(() => extractInitialPage());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [verifiedBill, setVerifiedBill] = useState<Bill | null>(null);
  const [cart, setCart] = useState<CartItemInput[]>([]);
  const [viewCartNonce, setViewCartNonce] = useState(0);
  const [cartPopToast, setCartPopToast] = useState<{
    id: number;
    title: string;
    subtitle: string;
    thumb: string;
    fallbackThumb: string;
    totalUnits: number;
    grandTotal: number;
  } | null>(null);
  const [liveBillToast, setLiveBillToast] = useState<Bill | null>(null);

  const knownBillIdsRef = useRef<Set<string> | null>(null);
  const billToastTimerRef = useRef<number | null>(null);
  const cartToastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (loadingData) return;
    if (knownBillIdsRef.current === null) {
      knownBillIdsRef.current = new Set(bills.map((b) => b.id));
      return;
    }
    const myUid = activeUid || '';
    const newBills = bills.filter(
      (b) => !knownBillIdsRef.current!.has(b.id) && (isAdmin || b.createdByUid === myUid)
    );
    bills.forEach((b) => knownBillIdsRef.current!.add(b.id));
    if (newBills.length > 0) {
      const latest = newBills[0];
      if (billToastTimerRef.current) window.clearTimeout(billToastTimerRef.current);
      setLiveBillToast(latest);
      billToastTimerRef.current = window.setTimeout(() => setLiveBillToast(null), 8000);
    }
  }, [bills, loadingData, isAdmin, activeUid]);

  const handleAddToCart = (product: Product, variantLabel?: string, variantPrice?: number) => {
    const price = variantPrice ?? product.sellingPrice;
    const taxRate = business?.taxEnabled ? product.taxRate : 0;

    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.productId === product.id && (item.variantLabel || '') === (variantLabel || '')
      );
      let nextCart: CartItemInput[];
      if (idx >= 0) {
        nextCart = [...prev];
        nextCart[idx] = { ...nextCart[idx], quantity: nextCart[idx].quantity + 1 };
      } else {
        nextCart = [
          ...prev,
          {
            productId: product.id,
            productCode: product.productCode,
            productName: language === 'te' && product.nameTe ? `${product.name} (${product.nameTe})` : product.name,
            variantLabel,
            barcode: product.barcode,
            imageUrl: product.imageUrl || '',
            quantity: 1,
            unitPrice: price,
            discount: 0,
            taxRate,
          },
        ];
      }

      const nextUnits = nextCart.reduce((s, i) => s + i.quantity, 0);
      const nextGrandTotal = nextCart.reduce(
        (s, i) => s + Math.max(0, i.quantity * i.unitPrice - (i.discount || 0)),
        0
      );

      if (cartToastTimerRef.current) window.clearTimeout(cartToastTimerRef.current);
      setCartPopToast({
        id: Date.now() + Math.random(),
        title: variantLabel ? `${product.name} · ${variantLabel}` : product.name,
        subtitle: `Added ₹${price}`,
        thumb: resolveProductImage(product),
        fallbackThumb: getDefaultProductImage(product.name, product.category),
        totalUnits: nextUnits,
        grandTotal: nextGrandTotal,
      });
      cartToastTimerRef.current = window.setTimeout(() => setCartPopToast(null), 4500);

      return nextCart;
    });
  };

  const handleQuickAddFromProducts = (
    product: Product,
    variantLabel?: string,
    variantPrice?: number,
    openCart = false
  ) => {
    handleAddToCart(product, variantLabel, variantPrice);
    if (openCart) {
      setActivePage('new-billing');
      setViewCartNonce(Date.now());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const visibleNavItems = useMemo(() => {
    if (!isAdmin) {
      return NAV_ITEMS.filter((item) => STAFF_ALLOWED_PAGES.includes(item.id));
    }
    return NAV_ITEMS.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.requiresReportsPerm && !isAdmin && !userAccount?.canViewReports) return false;
      return true;
    });
  }, [isAdmin, userAccount]);

  useEffect(() => {
    if (!isAdmin && !STAFF_ALLOWED_PAGES.includes(activePage)) {
      setActivePage('new-billing');
    }
  }, [isAdmin, activePage]);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const handleNavigate = (page: NavPageId) => {
    const allowed = visibleNavItems.some((item) => item.id === page);
    setActivePage(allowed ? page : 'new-billing');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderPage = () => {
    const billingPageEl = (
      <NewBillingPage
        cart={cart}
        setCart={setCart}
        onAddToCart={handleAddToCart}
        viewCartNonce={viewCartNonce}
      />
    );

    if (!isAdmin && !STAFF_ALLOWED_PAGES.includes(activePage)) {
      return billingPageEl;
    }

    switch (activePage) {
      case 'new-billing':
        return billingPageEl;
      case 'bill-history':
        return <BillHistoryPage />;
      case 'scanner':
        return (
          <VerifyScannerPage
            onQuickAddProduct={(productId) => {
              const p = products.find((item) => item.id === productId);
              if (p) {
                handleQuickAddFromProducts(p, undefined, undefined, true);
              }
            }}
          />
        );
      case 'profile':
        return <ProfilePage />;
      case 'invoices':
        return <InvoicesPage />;
      case 'thermal-receipts':
        return <ThermalReceiptsPage />;
      case 'products':
        return <ProductsPage onQuickAddToBill={handleQuickAddFromProducts} />;
      case 'inventory':
        return <InventoryPage />;
      case 'customers':
        return <CustomersPage />;
      case 'labour-cashbook':
        return <LabourAndCashbookPage sectionMode="labour" />;
      case 'shop-cashbook':
      case 'shop-income':
      case 'shop-expenses':
        return <LabourAndCashbookPage sectionMode="cashbook" />;
      case 'payments':
        return <PaymentsPage />;
      case 'upi-qr':
        return isAdmin ? <UpiQrPage /> : billingPageEl;
      case 'reports':
        return isAdmin || userAccount?.canViewReports ? <ReportsPage /> : billingPageEl;
      case 'notifications':
        return <NotificationsPage onNavigate={handleNavigate} />;
      case 'devices':
        return isAdmin ? <DeviceManagementPage /> : billingPageEl;
      case 'users':
        return isAdmin ? <UserManagementPage /> : billingPageEl;
      case 'settings':
        return isAdmin ? <BusinessSettingsPage /> : billingPageEl;
      default:
        return billingPageEl;
    }
  };

  const logoSrc = business?.logoUrl || DEFAULT_BUSINESS_LOGO;

  return (
    <div className="min-h-screen bg-[#F4F8FF] text-slate-900 flex overflow-x-hidden">
      {/* Desktop Sidebar (Blue & White Theme) */}
      <aside
        className={`hidden lg:flex flex-col border-r border-blue-900/20 bg-gradient-to-b from-[#0B1F44] via-[#102B66] to-[#1D4ED8] text-white transition-all duration-200 shrink-0 sticky top-0 h-screen shadow-lg ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[252px]'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <img
              src={logoSrc}
              alt="Sri Lakshmi Penchil Narasimha Swamy Cement Work"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-white/25 shrink-0"
            />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-display font-bold text-xs leading-snug tracking-tight text-white line-clamp-2">
                  Sri Lakshmi Penchil Narasimha Swamy Cement Work
                </div>
                <div className="text-[10px] text-cyan-300 truncate">
                  {business?.proprietor ? `Prop: ${business.proprietor}` : 'Cloud POS'}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-300"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleNavigate(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`relative w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isActive
                    ? 'text-[#0B1F44]'
                    : 'text-blue-100 hover:bg-white/15 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="slp-sidebar-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-white shadow-sm"
                  />
                )}
                <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate">{language === 'te' ? item.labelTe : item.label}</span>
                  )}
                </span>
                {!sidebarCollapsed && item.id === 'notifications' && unreadNotifications > 0 && (
                  <span className="relative z-10 px-1.5 py-0.5 rounded-full bg-[#2563EB] text-white text-[10px] font-bold">
                    {unreadNotifications}
                  </span>
                )}
              </motion.button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/15 text-xs space-y-2">
          <div className={`grid gap-1.5 ${sidebarCollapsed ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={() => handleNavigate('scanner')}
              title="Open Verify Scanner"
              className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold transition ${
                activePage === 'scanner'
                  ? 'bg-white text-[#0B1F44]'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <ScanBarcode className={`w-3.5 h-3.5 shrink-0 ${activePage === 'scanner' ? 'text-[#1D4ED8]' : 'text-cyan-300'}`} />
              {!sidebarCollapsed && <span className="truncate">Verify Bill</span>}
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              title="Toggle English / Telugu"
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              {!sidebarCollapsed && <span>{language === 'te' ? 'EN' : 'తెలుగు'}</span>}
            </button>
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => handleNavigate('profile')}
              className="w-full pt-1 px-1 flex items-center gap-2 text-left rounded-xl hover:bg-white/10 py-1 transition"
            >
              {userAccount?.photoDataUrl ? (
                <img
                  src={userAccount.photoDataUrl}
                  alt={userAccount.displayName}
                  className="w-8 h-8 rounded-full object-cover border border-white/40 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/15 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {(userAccount?.displayName || 'U').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">{userAccount?.displayName}</div>
                <div className="text-[11px] text-blue-200 flex items-center gap-1 capitalize">
                  <ShieldCheck className="w-3 h-3 text-white shrink-0" />
                  <span>{role === 'admin' ? 'Admin' : 'Staff'}</span>
                  {userAccount?.phoneNumber && (
                    <span className="font-mono text-cyan-200 truncate">· {userAccount.phoneNumber}</span>
                  )}
                </div>
              </div>
            </button>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/15 hover:bg-rose-600 text-white text-xs font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!sidebarCollapsed && <span>{userAccount?.mpinEnabled ? 'Lock / Sign Out' : 'Sign Out'}</span>}
          </button>
        </div>
      </aside>

      {/* Centered Middle App Logo Watermark Across Admin & Staff Portals */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-[1] flex items-center justify-center ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[252px]'
        }`}
      >
        <img
          src={logoSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="w-56 h-56 sm:w-72 sm:h-72 rounded-full object-cover opacity-[0.055] mix-blend-multiply select-none animate-slp-breathe"
        />
      </div>

      {/* Main Content Column */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 pt-16 lg:pt-0 pb-[82px] lg:pb-0">
        {/* Top Bar (Centered App Logo & Clean App Name) */}
        <header className="min-h-16 pt-safe fixed lg:sticky top-0 inset-x-0 z-30 bg-gradient-to-r from-[#0B1F44] to-[#1D4ED8] lg:from-white lg:to-white text-white lg:text-[#0B1F44] backdrop-blur border-b border-white/15 lg:border-blue-100 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 shadow-sm">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <img
              src={logoSrc}
              alt="Sri Lakshmi Penchil Narasimha Swamy Cement Work"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-white/30 lg:border-blue-200 shrink-0 shadow-sm"
            />
            <h1 className="font-display font-bold text-xs sm:text-base tracking-tight leading-tight line-clamp-1 text-center">
              Sri Lakshmi Penchil Narasimha Swamy Cement Work
            </h1>
          </div>
          <div className="w-8 shrink-0 lg:hidden" aria-hidden="true" />
        </header>

        {/* Page Container */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1440px] w-full mx-auto space-y-4">
          {/* Compact Staff Identity Bar */}
          {!isAdmin && userAccount && (
            <div className="bg-white/95 backdrop-blur border border-blue-100 rounded-2xl px-3.5 py-2.5 shadow-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {userAccount.photoDataUrl ? (
                  <img
                    src={userAccount.photoDataUrl}
                    alt={userAccount.displayName}
                    className="w-9 h-9 rounded-full object-cover border border-[#1D4ED8]/30 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0B1F44] to-[#1D4ED8] text-white font-bold text-xs flex items-center justify-center shrink-0">
                    {(userAccount.displayName || 'S').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[#0B1F44] truncate">
                    {userAccount.displayName}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    {userAccount.phoneNumber || userAccount.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => handleNavigate('profile')}
                  className="px-2.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#0B1F44] text-xs font-semibold transition"
                >
                  Profile
                </motion.button>
                {userAccount.mpinEnabled && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={lockWithMpin}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0B1F44] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition"
                  >
                    <Lock className="w-3 h-3" /> Lock
                  </motion.button>
                )}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation (Staff: 4 Tabs, Admin: 6 Tabs with combined Income/Exp) */}
      <nav
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-blue-100 grid ${
          isAdmin ? 'grid-cols-6' : 'grid-cols-4'
        } min-h-[64px] pb-safe px-0.5 shadow-[0_-4px_18px_rgba(29,78,216,0.08)]`}
      >
        {(
          (isAdmin
            ? [
                { id: 'new-billing', label: 'Bill', icon: FilePlus2 },
                { id: 'products', label: 'Products', icon: Package },
                { id: 'labour-cashbook', label: 'Labour', icon: HardHat },
                { id: 'shop-cashbook', label: 'Income/Exp', icon: Wallet },
                { id: 'bill-history', label: 'History', icon: History },
                { id: 'settings', label: 'Settings', icon: Settings },
              ]
            : [
                { id: 'new-billing', label: 'New Bill', icon: FilePlus2 },
                { id: 'bill-history', label: 'My Bills', icon: History },
                { id: 'scanner', label: 'Scanner', icon: ScanBarcode },
                { id: 'profile', label: 'Profile', icon: User },
              ]) as Array<{
            id: NavPageId;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }>
        ).map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.88 }}
              onClick={() => handleNavigate(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2 px-0 text-[10px] tracking-tight font-semibold transition-colors ${
                active ? 'text-[#1D4ED8]' : 'text-slate-500'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="slp-bottom-nav-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  className="absolute top-0 w-7 h-0.5 rounded-full bg-[#1D4ED8]"
                />
              )}
              <motion.span
                animate={active ? { scale: 1.14, y: -1 } : { scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                className="inline-flex"
              >
                <Icon className="w-4 h-4" />
              </motion.span>
              <span className="leading-none whitespace-nowrap">{item.label}</span>
            </motion.button>
          );
        })}
      </nav>

      {/* Mobile Full Drawer (All 15 Modules) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-50 bg-black/60 flex"
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="w-72 bg-gradient-to-b from-[#0B1F44] via-[#102B66] to-[#1D4ED8] text-white h-full flex flex-col p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/15">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={logoSrc}
                    alt="Sri Lakshmi Penchil Narasimha Swamy Cement Work"
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover border border-white/30 shrink-0"
                  />
                  <span className="font-display font-bold text-xs leading-snug line-clamp-2">
                    Sri Lakshmi Penchil Narasimha Swamy Cement Work
                  </span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-blue-100 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-3 space-y-1 flex-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                        active ? 'bg-white text-[#0B1F44] shadow-sm' : 'text-blue-100 hover:bg-white/15 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        {language === 'te' ? item.labelTe : item.label}
                      </span>
                      {item.id === 'notifications' && unreadNotifications > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#2563EB] text-white text-[10px] font-bold">
                          {unreadNotifications}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleNavigate('scanner')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
                  >
                    <ScanBarcode className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Verify Bill</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleLanguage}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
                  >
                    <Globe className="w-3.5 h-3.5 text-cyan-300" />
                    <span>{language === 'te' ? 'EN' : 'తెలుగు'}</span>
                  </button>
                </div>
                <PWAInstallButton variant="drawer" />
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold"
                >
                  <LogOut className="w-4 h-4" /> Sign Out ({userAccount?.displayName})
                </button>
              </div>
            </motion.div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Add-to-Cart Pop Notification */}
      <AnimatePresence>
        {cartPopToast && (
          <motion.div
            key={cartPopToast.id}
            initial={{ opacity: 0, y: -22, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 460, damping: 26 }}
            className="fixed top-[72px] inset-x-3 sm:inset-x-auto sm:right-6 sm:w-[375px] z-40 rounded-2xl bg-white dark:bg-slate-900 border-2 border-[#1D4ED8] shadow-xl shadow-blue-900/15 p-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={cartPopToast.thumb}
                  alt={cartPopToast.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    if (e.currentTarget.src !== cartPopToast.fallbackThumb) {
                      e.currentTarget.src = cartPopToast.fallbackThumb;
                    }
                  }}
                  className="w-11 h-11 rounded-xl object-cover border border-blue-100 dark:border-slate-700"
                />
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Added to Cart
                </div>
                <div className="text-xs font-bold text-[#0B1F44] dark:text-white truncate">
                  {cartPopToast.title}
                </div>
                <div className="text-[11px] text-[#1D4ED8] dark:text-sky-400 font-semibold truncate">
                  {cartPopToast.subtitle} · {cartPopToast.totalUnits} items ({formatCurrency(cartPopToast.grandTotal)})
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  setCartPopToast(null);
                  setActivePage('new-billing');
                  setViewCartNonce(Date.now());
                }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-bold shadow-sm whitespace-nowrap"
              >
                View Cart
                <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
              <button
                type="button"
                onClick={() => setCartPopToast(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Dismiss cart notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Real-Time Pop Notification when a New Bill is Created or Synced */}
      <AnimatePresence>
        {liveBillToast && !verifiedBill && (
          <motion.div
            key={`bill-toast-${liveBillToast.id}`}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 450, damping: 26 }}
            className="fixed bottom-[76px] lg:bottom-6 right-3 left-3 sm:left-auto sm:right-6 sm:w-[370px] z-40 rounded-2xl bg-gradient-to-r from-[#0B1F44] to-[#1D4ED8] text-white border border-white/25 shadow-2xl shadow-blue-900/30 p-3.5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <ReceiptText className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">
                  Bill {liveBillToast.billNumber} · {formatCurrency(liveBillToast.grandTotal)}
                </div>
                <div className="text-[11px] text-blue-100 truncate">
                  {liveBillToast.customerName} · {liveBillToast.pendingBalance <= 0 ? 'AMOUNT PAID' : `Due ₹${liveBillToast.pendingBalance.toFixed(0)}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  setVerifiedBill(liveBillToast);
                  setLiveBillToast(null);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white text-[#0B1F44] text-xs font-bold shadow-sm hover:bg-blue-50 whitespace-nowrap"
              >
                View Bill
                <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
              <button
                type="button"
                onClick={() => setLiveBillToast(null)}
                className="p-1.5 rounded-lg text-blue-100 hover:text-white"
                aria-label="Close bill notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verified / Pop-Notified Bill Inspection & Share Modal */}
      <PostBillActionsModal
        bill={verifiedBill}
        items={verifiedBill ? billItems.filter((bi) => bi.billId === verifiedBill.id) : []}
        onClose={() => setVerifiedBill(null)}
      />

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
};

const RootRouter: React.FC = () => {
  const { authReady, activeUid, userAccount, accessDeniedReason, deviceRevoked, mpinLocked } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0B1F44] via-[#102B66] to-[#1D4ED8] text-white flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center space-y-4"
        >
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.12, 0.45] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -inset-2 rounded-full bg-cyan-400/35 blur-sm"
            />
            <img
              src={DEFAULT_BUSINESS_LOGO}
              alt="Sri Lakshmi Penchil Narasimha Swamy Cement Work"
              referrerPolicy="no-referrer"
              className="relative w-20 h-20 rounded-full object-cover border-2 border-cyan-300/70 shadow-xl"
            />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.32 }}
          >
            <h1 className="font-display font-bold text-lg sm:text-xl tracking-tight text-balance max-w-md">
              Sri Lakshmi Penchil Narasimha Swamy Cement Work
            </h1>
            <p className="text-xs text-cyan-200 mt-1">Opening SLP Billing...</p>
          </motion.div>
          <div className="w-7 h-7 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
        </motion.div>
      </div>
    );
  }

  if (mpinLocked || !activeUid || !userAccount || accessDeniedReason || deviceRevoked) {
    return <LoginPage />;
  }

  return (
    <BillingDataProvider>
      <AuthenticatedShell />
    </BillingDataProvider>
  );
};

export default function App() {
  const publicToken = useMemo(() => extractPublicInvoiceToken(), []);

  if (publicToken) {
    return (
      <ErrorBoundary>
        <PublicInvoicePortal token={publicToken} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <RootRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
}
