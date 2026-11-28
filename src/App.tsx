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
  HelpCircle,
  History,
  Laptop,
  Lock,
  LogOut,
  Menu,
  Package,
  Printer,
  QrCode,
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
import { LegalFooterLinks } from './components/LegalModals';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BillingDataProvider, CartItemInput, useBillingData } from './context/BillingDataContext';
import { DEFAULT_BUSINESS_LOGO, getCopyrightNotice, resolveBusinessLogoUrl } from './lib/seedData';
import { getDefaultProductImage, resolveProductImage } from './lib/productImages';
import { formatCurrency } from './lib/upiAndExport';
import {
  tr,
  translateBusinessName,
  translateProductName,
  translateProprietor,
  translateVariantLabel,
} from './lib/i18n';
import { NavPageId, Product } from './types/billing';

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
import { HelpSupportPage } from './pages/HelpSupportPage';

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
  { id: 'help-support', label: 'Help & Support', labelTe: 'సహాయం & మద్దతు', icon: HelpCircle },
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
  const { business, products, notifications } = useBillingData();

  const [activePage, setActivePage] = useState<NavPageId>(() => extractInitialPage());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const cartToastTimerRef = useRef<number | null>(null);

  const handleAddToCart = (product: Product, variantLabel?: string, variantPrice?: number) => {
    const price = variantPrice ?? product.sellingPrice;
    const taxRate = 0;
    const displayProdName = translateProductName(product, language);
    const displayVariant = translateVariantLabel(variantLabel, language);

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
            productName: displayProdName,
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
        title: displayVariant ? `${displayProdName} · ${displayVariant}` : displayProdName,
        subtitle: tr(language, `Added ₹${price}`, `₹${price} జోడించబడింది`),
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
      case 'help-support':
        return <HelpSupportPage onNavigate={handleNavigate} />;
      default:
        return billingPageEl;
    }
  };

  const logoSrc = resolveBusinessLogoUrl(business?.logoUrl);
  const copyrightText = getCopyrightNotice(business?.name, language);
  const brandTitle = translateBusinessName(business?.name, language);
  const proprietorText = translateProprietor(business?.proprietor, language);

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-slate-950 text-[#0A2240] dark:text-slate-100 flex overflow-x-hidden">
      {/* Desktop Sidebar (Warm Sand & Deep Midnight Navy Theme) */}
      <aside
        className={`hidden lg:flex flex-col border-r border-[#E5DDD3] dark:border-slate-800 bg-[#F3EDE5] dark:bg-slate-900 text-[#0A2240] dark:text-slate-100 transition-all duration-200 shrink-0 sticky top-0 h-screen ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[252px]'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E5DDD3] dark:border-slate-800">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <img
              src={logoSrc}
              alt={brandTitle}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 border border-[#DFD7CC] dark:border-slate-700 shadow-xs shrink-0"
            />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-display font-bold text-xs leading-snug tracking-tight text-[#0A2240] dark:text-white line-clamp-2">
                  {brandTitle}
                </div>
                <div className="text-[10px] font-medium text-[#6D665E] dark:text-slate-400 truncate">
                  {proprietorText
                    ? tr(language, `Prop: ${proprietorText}`, `యజమాని: ${proprietorText}`)
                    : tr(language, 'Cloud POS', 'క్లౌడ్ బిల్లింగ్')}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-1 rounded-lg hover:bg-[#E7DFD4] dark:hover:bg-slate-800 text-[#6D665E] dark:text-slate-300"
            title={
              sidebarCollapsed
                ? tr(language, 'Expand sidebar', 'సైడ్‌బార్ విస్తరించండి')
                : tr(language, 'Collapse sidebar', 'సైడ్‌బార్ కుదించండి')
            }
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            const itemLabel = language === 'te' ? item.labelTe : item.label;
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleNavigate(item.id)}
                title={sidebarCollapsed ? itemLabel : undefined}
                className={`relative w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'text-[#2D3138] dark:text-slate-300 hover:bg-[#E9E1D6] dark:hover:bg-slate-800 hover:text-[#0A2240] dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="slp-sidebar-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-[#0A2240] dark:bg-[#1E3A5F] shadow-sm"
                  />
                )}
                <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{itemLabel}</span>}
                </span>
                {!sidebarCollapsed && item.id === 'notifications' && unreadNotifications > 0 && (
                  <span className="relative z-10 px-1.5 py-0.5 rounded-full bg-[#9A4307] text-white text-[10px] font-bold">
                    {unreadNotifications}
                  </span>
                )}
              </motion.button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E5DDD3] dark:border-slate-800 text-xs space-y-2">
          <div className={`grid gap-1.5 ${sidebarCollapsed || !isAdmin ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleNavigate('scanner')}
                title={tr(language, 'Open Verify Scanner', 'తనిఖీ స్కానర్ తెరవండి')}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition ${
                  activePage === 'scanner'
                    ? 'bg-[#0A2240] border-[#0A2240] text-white'
                    : 'bg-white/80 dark:bg-slate-800 border-[#DFD7CC] dark:border-slate-700 hover:bg-white text-[#0A2240] dark:text-slate-100'
                }`}
              >
                <ScanBarcode className={`w-3.5 h-3.5 shrink-0 ${activePage === 'scanner' ? 'text-white' : 'text-[#9A4307] dark:text-amber-400'}`} />
                {!sidebarCollapsed && <span className="truncate">{tr(language, 'Verify Bill', 'బిల్ తనిఖీ')}</span>}
              </button>
            )}
            <button
              type="button"
              onClick={toggleLanguage}
              title={tr(language, 'Switch to Telugu', 'ఇంగ్లీష్‌కు మార్చండి')}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/80 dark:bg-slate-800 border border-[#DFD7CC] dark:border-slate-700 hover:bg-white text-[#0A2240] dark:text-slate-100 text-[11px] font-semibold transition"
            >
              <Globe className="w-3.5 h-3.5 text-[#9A4307] dark:text-amber-400 shrink-0" />
              {!sidebarCollapsed && <span>{language === 'te' ? 'ఇంగ్లీష్' : 'తెలుగు'}</span>}
            </button>
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => handleNavigate('profile')}
              className="w-full pt-1 px-1 flex items-center gap-2 text-left rounded-xl hover:bg-[#E9E1D6] dark:hover:bg-slate-800 py-1 transition"
            >
              {userAccount?.photoDataUrl ? (
                <img
                  src={userAccount.photoDataUrl}
                  alt={userAccount.displayName}
                  className="w-8 h-8 rounded-full object-cover border border-[#DFD7CC] shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#0A2240] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {(userAccount?.displayName || 'U').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-semibold text-[#0A2240] dark:text-white truncate">{userAccount?.displayName}</div>
                <div className="text-[11px] text-[#6D665E] dark:text-slate-400 flex items-center gap-1 capitalize">
                  <ShieldCheck className="w-3 h-3 text-[#15803D] shrink-0" />
                  <span>{role === 'admin' ? tr(language, 'Admin', 'అడ్మిన్') : tr(language, 'Staff', 'సిబ్బంది')}</span>
                  {userAccount?.phoneNumber && (
                    <span className="font-mono text-[#0A2240] dark:text-slate-300 truncate">· {userAccount.phoneNumber}</span>
                  )}
                </div>
              </div>
            </button>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-800 border border-[#DFD7CC] dark:border-slate-700 hover:bg-[#FCE8E6] hover:border-[#F5C2BC] hover:text-[#C23B2B] text-[#0A2240] dark:text-slate-200 text-xs font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!sidebarCollapsed && (
              <span>
                {userAccount?.mpinEnabled
                  ? tr(language, 'Lock / Sign Out', 'లాక్ / సైన్ అవుట్')
                  : tr(language, 'Sign Out', 'సైన్ అవుట్')}
              </span>
            )}
          </button>
          {!sidebarCollapsed && (
            <div className="pt-1 text-center text-[10px] leading-tight text-[#6D665E] dark:text-slate-400 space-y-1">
              <div>{copyrightText}</div>
              <LegalFooterLinks language={language} businessName={business?.name} className="text-[10px]" />
            </div>
          )}
        </div>
      </aside>

      {/* Centered Middle App Logo Watermark Across Admin & Staff Portals */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-[25] flex items-center justify-center ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[252px]'
        }`}
      >
        <img
          src={logoSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="w-64 h-64 sm:w-80 sm:h-80 rounded-3xl object-contain opacity-[0.095] dark:opacity-[0.06] mix-blend-multiply dark:mix-blend-screen select-none animate-slp-breathe"
        />
      </div>

      {/* Main Content Column */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 pt-16 lg:pt-0 pb-[82px] lg:pb-0">
        {/* Top Bar (Centered App Logo & Clean App Name) */}
        <header className="min-h-16 pt-safe fixed lg:sticky top-0 inset-x-0 z-30 bg-[#F3EDE5]/95 lg:bg-white/95 dark:bg-slate-900/95 text-[#0A2240] dark:text-slate-100 backdrop-blur border-b border-[#E5DDD3] dark:border-slate-800 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 shadow-xs">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-white/80 dark:bg-slate-800 border border-[#DFD7CC] dark:border-slate-700 hover:bg-white text-[#0A2240] dark:text-slate-100 shrink-0"
            aria-label={tr(language, 'Open navigation menu', 'మెనూ తెరవండి')}
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-2.5 min-w-0">
            <img
              src={logoSrc}
              alt={brandTitle}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-xl object-contain bg-white p-0.5 border border-[#DFD7CC] dark:border-slate-700 shrink-0 shadow-xs"
            />
            <h1 className="font-display font-bold text-xs sm:text-base tracking-tight leading-tight line-clamp-1 text-center text-[#0A2240] dark:text-white">
              {brandTitle}
            </h1>
          </div>
          <div className="w-8 shrink-0 lg:hidden" aria-hidden="true" />
        </header>

        {/* Page Container */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1440px] w-full mx-auto space-y-4">
          {/* Compact Staff Identity Bar */}
          {!isAdmin && userAccount && (
            <div className="bg-white/95 dark:bg-slate-900 backdrop-blur border border-[#E5DDD3] dark:border-slate-800 rounded-2xl px-3.5 py-2.5 shadow-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {userAccount.photoDataUrl ? (
                  <img
                    src={userAccount.photoDataUrl}
                    alt={userAccount.displayName}
                    className="w-9 h-9 rounded-full object-cover border border-[#DFD7CC] shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#0A2240] text-white font-bold text-xs flex items-center justify-center shrink-0">
                    {(userAccount.displayName || 'S').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[#0A2240] dark:text-slate-100 truncate">
                    {userAccount.displayName}
                  </div>
                  <div className="text-[11px] text-[#6D665E] dark:text-slate-400 font-mono truncate">
                    {userAccount.phoneNumber || userAccount.email}
                  </div>
                </div>
              </div>
              {userAccount.mpinEnabled && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={lockWithMpin}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-semibold transition"
                  >
                    <Lock className="w-3 h-3" /> {tr(language, 'Lock', 'లాక్')}
                  </motion.button>
                </div>
              )}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>

          <footer className="pt-4 pb-2 text-center text-[11px] font-medium text-[#6D665E] dark:text-slate-400 border-t border-[#E5DDD3] dark:border-slate-800 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>{copyrightText}</span>
            <span aria-hidden="true" className="text-[#B8AEA2]">
              ·
            </span>
            <LegalFooterLinks language={language} businessName={business?.name} />
          </footer>
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation (Staff: 4 Tabs, Admin: 6 Tabs with combined Income/Exp) */}
      <nav
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-[#E5DDD3] dark:border-slate-800 grid ${
          isAdmin ? 'grid-cols-6' : 'grid-cols-4'
        } min-h-[64px] pb-safe px-0.5 shadow-[0_-4px_18px_rgba(10,34,64,0.06)]`}
      >
        {(
          (isAdmin
            ? [
                { id: 'new-billing', label: tr(language, 'Bill', 'బిల్'), icon: FilePlus2 },
                { id: 'products', label: tr(language, 'Products', 'ఉత్పత్తులు'), icon: Package },
                { id: 'labour-cashbook', label: tr(language, 'Labour', 'లేబర్'), icon: HardHat },
                { id: 'shop-cashbook', label: tr(language, 'Income/Exp', 'ఆదాయం/ఖర్చు'), icon: Wallet },
                { id: 'bill-history', label: tr(language, 'History', 'చరిత్ర'), icon: History },
                { id: 'settings', label: tr(language, 'Settings', 'సెట్టింగ్స్'), icon: Settings },
              ]
            : [
                { id: 'new-billing', label: tr(language, 'New Bill', 'కొత్త బిల్'), icon: FilePlus2 },
                { id: 'bill-history', label: tr(language, 'My Bills', 'నా బిల్లులు'), icon: History },
                { id: 'scanner', label: tr(language, 'Scanner', 'స్కానర్'), icon: ScanBarcode },
                { id: 'profile', label: tr(language, 'Profile', 'ప్రొఫైల్'), icon: User },
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
                active ? 'text-[#0A2240] dark:text-white' : 'text-[#6D665E] dark:text-slate-400'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="slp-bottom-nav-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  className="absolute top-0 w-7 h-0.5 rounded-full bg-[#0A2240] dark:bg-white"
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

      {/* Mobile Full Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-50 bg-black/50 flex"
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="w-72 bg-[#F3EDE5] dark:bg-slate-900 border-r border-[#E5DDD3] dark:border-slate-800 text-[#0A2240] dark:text-slate-100 h-full flex flex-col p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#E5DDD3] dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={logoSrc}
                    alt={brandTitle}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-xl object-contain bg-white p-0.5 border border-[#DFD7CC] shrink-0"
                  />
                  <span className="font-display font-bold text-xs leading-snug line-clamp-2 text-[#0A2240] dark:text-white">
                    {brandTitle}
                  </span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-[#6D665E] hover:text-[#0A2240] dark:text-slate-300">
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
                        active
                          ? 'bg-[#0A2240] text-white shadow-xs'
                          : 'text-[#2D3138] dark:text-slate-300 hover:bg-[#E9E1D6] dark:hover:bg-slate-800 hover:text-[#0A2240]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        {language === 'te' ? item.labelTe : item.label}
                      </span>
                      {item.id === 'notifications' && unreadNotifications > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#9A4307] text-white text-[10px] font-bold">
                          {unreadNotifications}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-[#E5DDD3] dark:border-slate-800 space-y-2">
                <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleNavigate('scanner')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#DFD7CC] hover:bg-[#FAF8F5] text-[#0A2240] text-xs font-semibold"
                    >
                      <ScanBarcode className="w-3.5 h-3.5 text-[#9A4307]" />
                      <span>{tr(language, 'Verify Bill', 'బిల్ తనిఖీ')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleLanguage}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#DFD7CC] hover:bg-[#FAF8F5] text-[#0A2240] text-xs font-semibold"
                  >
                    <Globe className="w-3.5 h-3.5 text-[#9A4307]" />
                    <span>{language === 'te' ? 'ఇంగ్లీష్' : 'తెలుగు'}</span>
                  </button>
                </div>
                <PWAInstallButton variant="drawer" />
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#C23B2B] hover:bg-[#A32E20] text-white text-xs font-semibold"
                >
                  <LogOut className="w-4 h-4" />{' '}
                  {tr(language, `Sign Out (${userAccount?.displayName})`, `సైన్ అవుట్ (${userAccount?.displayName})`)}
                </button>
                <div className="pt-1 text-center text-[10px] leading-tight text-[#6D665E] dark:text-slate-400 space-y-1">
                  <div>{copyrightText}</div>
                  <LegalFooterLinks language={language} businessName={business?.name} className="text-[10px]" />
                </div>
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
            className="fixed top-[72px] inset-x-3 sm:inset-x-auto sm:right-6 sm:w-[375px] z-40 rounded-2xl bg-white dark:bg-slate-900 border-2 border-[#0A2240] shadow-xl shadow-[#0A2240]/15 p-3 flex items-center justify-between gap-3"
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
                  className="w-11 h-11 rounded-xl object-cover border border-[#E5DDD3] dark:border-slate-700"
                />
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#15803D] text-white flex items-center justify-center shadow">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#15803D] dark:text-emerald-400">
                  {tr(language, 'Added to Cart', 'కార్ట్‌లో జోడించబడింది')}
                </div>
                <div className="text-xs font-bold text-[#0A2240] dark:text-white truncate">
                  {cartPopToast.title}
                </div>
                <div className="text-[11px] text-[#9A4307] dark:text-amber-400 font-semibold truncate">
                  {cartPopToast.subtitle} · {cartPopToast.totalUnits} {tr(language, 'items', 'వస్తువులు')} (
                  {formatCurrency(cartPopToast.grandTotal)})
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
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-bold shadow-sm whitespace-nowrap"
              >
                {tr(language, 'View Cart', 'కార్ట్ చూడండి')}
                <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
              <button
                type="button"
                onClick={() => setCartPopToast(null)}
                className="p-1.5 rounded-lg text-[#6D665E] hover:text-[#0A2240] dark:hover:text-slate-200"
                aria-label={tr(language, 'Dismiss cart notification', 'నోటిఫికేషన్‌ను మూసివేయండి')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
};

const RootRouter: React.FC = () => {
  const { authReady, activeUid, userAccount, accessDeniedReason, deviceRevoked, mpinLocked, language } = useAuth();
  const [launchSplashVisible, setLaunchSplashVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLaunchSplashVisible(false);
    }, 950);
    return () => window.clearTimeout(timer);
  }, []);

  if (!authReady || launchSplashVisible) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] text-[#0A2240] flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center space-y-5"
        >
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.16, 1], opacity: [0.45, 0.14, 0.45] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -inset-3 rounded-full bg-[#9A4307]/20 blur-md"
            />
            <img
              src={DEFAULT_BUSINESS_LOGO}
              alt={translateBusinessName(undefined, language)}
              referrerPolicy="no-referrer"
              className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-3xl object-contain bg-white p-2 border-2 border-[#E5DDD3] shadow-xl"
            />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.32 }}
          >
            <h1 className="font-display font-bold text-lg sm:text-xl tracking-tight text-balance max-w-md text-[#0A2240]">
              {translateBusinessName(undefined, language)}
            </h1>
            <p className="text-xs font-medium text-[#6D665E] mt-1">
              {tr(language, 'Opening SLP Billing...', 'ఎస్‌ఎల్‌పి బిల్లింగ్ తెరవబడుతోంది...')}
            </p>
          </motion.div>
          <div className="w-7 h-7 border-2 border-[#0A2240] border-t-transparent rounded-full animate-spin" />
          <p className="text-[11px] text-[#6D665E] pt-2">{getCopyrightNotice(undefined, language)}</p>
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
