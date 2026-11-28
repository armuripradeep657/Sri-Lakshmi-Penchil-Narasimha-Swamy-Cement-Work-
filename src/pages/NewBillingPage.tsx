import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  Minus,
  Plus,
  Search,
  Trash2,
  UserPlus,
  AlertCircle,
  Loader2,
  ReceiptText,
  HardHat,
  Truck,
  MessageCircle,
  Camera,
} from 'lucide-react';
import { useBillingData, CartItemInput } from '../context/BillingDataContext';
import { useAuth } from '../context/AuthContext';
import { parseVariants } from '../lib/seedData';
import { formatCurrency } from '../lib/upiAndExport';
import { generateSafeId } from '../lib/firebase';
import {
  buildWhatsAppDirectUrl,
  buildWhatsAppReceiptText,
  formatReadableWhatsAppPhone,
  formatWhatsAppPhone,
  openExternalLinkSafely,
} from '../lib/whatsapp';
import { getDefaultProductImage, resolveProductImage } from '../lib/productImages';
import {
  tr,
  translateCartProductName,
  translateCategory,
  translateProductName,
  translateUnit,
  translateVariantLabel,
} from '../lib/i18n';
import { Bill, BillItem, PaymentMethod, Product } from '../types/billing';
import { PostBillActionsModal } from '../components/InvoiceViews';
import { PaperListCameraModal } from '../components/PaperListCameraModal';
import { ModalPortal } from '../components/ModalPortal';
import { AnimatedNumber } from '../components/MotionPrimitives';

export interface QuickAddBillPayload {
  product: Product;
  variantLabel?: string;
  variantPrice?: number;
  nonce: number;
  openCart?: boolean;
}

interface NewBillingPageProps {
  quickAdd?: QuickAddBillPayload | null;
  onQuickAddConsumed?: () => void;
  cart?: CartItemInput[];
  setCart?: React.Dispatch<React.SetStateAction<CartItemInput[]>>;
  onAddToCart?: (product: Product, variantLabel?: string, variantPrice?: number) => void;
  viewCartNonce?: number;
}

export const NewBillingPage: React.FC<NewBillingPageProps> = ({
  quickAdd,
  onQuickAddConsumed,
  cart: externalCart,
  setCart: externalSetCart,
  onAddToCart,
  viewCartNonce,
}) => {
  const { business, categories, products, customers, createBillAtomic, saveCustomer, billItems, logMessageDispatch, loadingData } =
    useBillingData();
  const { language, userAccount, activeUid, isAdmin } = useAuth();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [mobilePane, setMobilePane] = useState<'products' | 'cart'>('products');

  const [localCart, setLocalCart] = useState<CartItemInput[]>([]);
  const cart = externalCart ?? localCart;
  const setCart = externalSetCart ?? setLocalCart;
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState(() =>
    language === 'te' ? 'సాధారణ కస్టమర్' : 'Walk-in Customer'
  );
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  useEffect(() => {
    setCustomerName((prev) => {
      if (language === 'te' && prev === 'Walk-in Customer') return 'సాధారణ కస్టమర్';
      if (language === 'en' && prev === 'సాధారణ కస్టమర్') return 'Walk-in Customer';
      return prev;
    });
  }, [language]);

  const [overallDiscount, setOverallDiscount] = useState(0);
  const [labourApplicable, setLabourApplicable] = useState(false);
  const [labourMode, setLabourMode] = useState<'per_piece' | 'fixed'>('per_piece');
  const [labourRatePerPiece, setLabourRatePerPiece] = useState<string>('');
  const [labourFixedAmount, setLabourFixedAmount] = useState<string>('');
  const [autoApplicable, setAutoApplicable] = useState(false);
  const [autoChargeInput, setAutoChargeInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');

  const [idempotencyKey, setIdempotencyKey] = useState(() => generateSafeId('idem'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [quickCustModal, setQuickCustModal] = useState(false);
  const [paperCamOpen, setPaperCamOpen] = useState(false);
  const [paperNotice, setPaperNotice] = useState<string | null>(null);

  const [pressedChip, setPressedChip] = useState<{ key: string; productId: string; nonce: number } | null>(null);
  const cartPanelRef = useRef<HTMLDivElement | null>(null);
  const chipTimerRef = useRef<number | null>(null);
  const paperNoticeTimerRef = useRef<number | null>(null);

  const categoriesList = useMemo(() => {
    const set = new Set<string>(['All']);
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.nameTe && p.nameTe.toLowerCase().includes(q)) ||
        p.productCode.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });
  }, [products, search, selectedCategory]);

  const addToCart = (product: Product, variantLabel?: string, variantPrice?: number) => {
    const price = variantPrice ?? product.sellingPrice;
    const taxRate = 0;
    const chipKey = `${product.id}::${variantLabel || 'BASE'}`;
    const nonce = Date.now() + Math.random();

    if (chipTimerRef.current) window.clearTimeout(chipTimerRef.current);
    setPressedChip({ key: chipKey, productId: product.id, nonce });
    chipTimerRef.current = window.setTimeout(() => setPressedChip(null), 700);

    if (onAddToCart) {
      onAddToCart(product, variantLabel, price);
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.productId === product.id && (item.variantLabel || '') === (variantLabel || '')
      );
      if (idx >= 0) {
        const nextCart = [...prev];
        nextCart[idx] = { ...nextCart[idx], quantity: nextCart[idx].quantity + 1 };
        return nextCart;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productCode: product.productCode,
          productName: translateProductName(product, language),
          variantLabel,
          barcode: product.barcode,
          imageUrl: product.imageUrl || '',
          quantity: 1,
          unitPrice: price,
          discount: 0,
          taxRate,
        },
      ];
    });
  };

  const handleBulkAddFromPaper = (incomingItems: CartItemInput[]) => {
    if (incomingItems.length === 0) return;

    setCart((prev) => {
      const nextCart = [...prev];
      incomingItems.forEach((incoming) => {
        const idx = nextCart.findIndex(
          (c) =>
            c.productId === incoming.productId &&
            (c.variantLabel || '') === (incoming.variantLabel || '')
        );
        if (idx >= 0) {
          nextCart[idx] = {
            ...nextCart[idx],
            quantity: Math.round((nextCart[idx].quantity + incoming.quantity) * 100) / 100,
            unitPrice: incoming.unitPrice > 0 ? incoming.unitPrice : nextCart[idx].unitPrice,
          };
        } else {
          nextCart.push(incoming);
        }
      });
      return nextCart;
    });

    setMobilePane('cart');
    window.setTimeout(() => {
      cartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);

    if (paperNoticeTimerRef.current) window.clearTimeout(paperNoticeTimerRef.current);
    setPaperNotice(
      tr(
        language,
        `${incomingItems.length} item(s) from paper photo saved to cart.`,
        `కాగితం ఫోటో నుండి ${incomingItems.length} వస్తువులు కార్ట్‌లో సేవ్ చేయబడ్డాయి.`
      )
    );
    paperNoticeTimerRef.current = window.setTimeout(() => setPaperNotice(null), 4500);
  };

  useEffect(() => {
    if (!viewCartNonce) return;
    setMobilePane('cart');
    window.setTimeout(() => {
      cartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }, [viewCartNonce]);

  useEffect(() => {
    if (!quickAdd) return;
    addToCart(quickAdd.product, quickAdd.variantLabel, quickAdd.variantPrice);
    if (quickAdd.openCart) {
      setMobilePane('cart');
    }
    onQuickAddConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAdd?.nonce]);

  const updateCartItem = (index: number, patch: Partial<CartItemInput>) => {
    setCart((prev) => prev.map((it, idx) => (idx === index ? { ...it, ...patch } : it)));
  };

  const removeCartItem = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const totalUnitsInCart = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let itemDiscounts = 0;

    cart.forEach((it) => {
      const gross = it.quantity * it.unitPrice;
      const disc = Math.min(gross, Math.max(0, it.discount || 0));
      subtotal += gross;
      itemDiscounts += disc;
    });

    const extraDisc = Math.min(Math.max(0, overallDiscount), Math.max(0, subtotal - itemDiscounts));
    const totalDiscount = itemDiscounts + extraDisc;
    const taxableAmount = Math.max(0, subtotal - totalDiscount);
    const totalTax = 0;

    const ratePerPieceNum =
      labourApplicable && labourMode === 'per_piece'
        ? Math.max(0, Math.round((Number(labourRatePerPiece) || 0) * 100) / 100)
        : 0;
    const labourCharge = !labourApplicable
      ? 0
      : labourMode === 'per_piece'
      ? Math.round(totalUnitsInCart * ratePerPieceNum * 100) / 100
      : Math.max(0, Math.round((Number(labourFixedAmount) || 0) * 100) / 100);
    const autoCharge = autoApplicable
      ? Math.max(0, Math.round((Number(autoChargeInput) || 0) * 100) / 100)
      : 0;

    const grandTotal = Math.round((taxableAmount + labourCharge + autoCharge) * 100) / 100;

    const paidNum =
      amountPaidInput === ''
        ? paymentMethod === 'Unpaid'
          ? 0
          : grandTotal
        : Math.min(grandTotal, Math.max(0, Number(amountPaidInput) || 0));

    const pendingBalance = Math.max(0, Math.round((grandTotal - paidNum) * 100) / 100);

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      totalTax,
      labourRatePerPiece: ratePerPieceNum,
      labourCharge,
      autoCharge,
      grandTotal,
      paidNum,
      pendingBalance,
    };
  }, [
    cart,
    totalUnitsInCart,
    overallDiscount,
    labourApplicable,
    labourMode,
    labourRatePerPiece,
    labourFixedAmount,
    autoApplicable,
    autoChargeInput,
    amountPaidInput,
    paymentMethod,
  ]);

  const handleSelectCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    if (!custId) {
      setCustomerName(language === 'te' ? 'సాధారణ కస్టమర్' : 'Walk-in Customer');
      setCustomerMobile('');
      setCustomerAddress('');
      return;
    }
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setCustomerName(found.name);
      setCustomerMobile(found.mobile || '');
      setCustomerAddress(found.address || '');
    }
  };

  const handleSaveBill = async () => {
    setError(null);
    if (cart.length === 0) {
      setError(tr(language, 'Add at least one product to the bill.', 'బిల్‌లో కనీసం ఒక ఉత్పత్తిని జోడించండి.'));
      return;
    }
    if (!customerName.trim()) {
      setError(tr(language, 'Customer name is required.', 'కస్టమర్ పేరు తప్పనిసరి.'));
      return;
    }

    setSaving(true);
    try {
      const normalizedCustName =
        customerName.trim() === 'సాధారణ కస్టమర్' ? 'Walk-in Customer' : customerName.trim();
      const created = await createBillAtomic({
        idempotencyKey,
        customerId: selectedCustomerId || undefined,
        customerName: normalizedCustName,
        customerMobile: customerMobile.trim(),
        customerAddress: customerAddress.trim(),
        items: cart,
        overallDiscount,
        gstType: 'NONE',
        labourCharge: totals.labourCharge,
        labourRatePerPiece: totals.labourRatePerPiece,
        autoCharge: totals.autoCharge,
        amountPaid: totals.paidNum,
        paymentMethod: totals.paidNum === 0 ? 'Unpaid' : paymentMethod,
        paymentReference,
        notes,
      });
      setSavedJustNow(true);
      setSavedBill(created);
      setCart([]);
      setOverallDiscount(0);
      setLabourApplicable(false);
      setLabourRatePerPiece('');
      setLabourFixedAmount('');
      setAutoApplicable(false);
      setAutoChargeInput('');
      setAmountPaidInput('');
      setPaymentReference('');
      setNotes('');
      setIdempotencyKey(generateSafeId('idem'));
      setMobilePane('products');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr(language, 'Failed to save bill to cloud.', 'క్లౌడ్‌లో బిల్ సేవ్ చేయడం విఫలమైంది.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleShareCartWhatsApp = () => {
    setError(null);
    if (cart.length === 0) {
      setError(tr(language, 'Add at least one product to share on WhatsApp.', 'వాట్సాప్‌లో షేర్ చేయడానికి కనీసం ఒక ఉత్పత్తిని జోడించండి.'));
      return;
    }

    const prefix = business?.billPrefix || 'SLP';
    const nextNum = String(business?.nextBillNumber || 1).padStart(4, '0');
    const draftBillNumber = `${prefix}-${nextNum}`;
    const normalizedCustName =
      customerName.trim() === 'సాధారణ కస్టమర్' || !customerName.trim()
        ? 'Walk-in Customer'
        : customerName.trim();
    const resolvedMethod: PaymentMethod = totals.paidNum === 0 ? 'Unpaid' : paymentMethod;
    const resolvedStatus =
      totals.pendingBalance === 0 ? 'paid' : totals.paidNum > 0 ? 'partial' : 'pending';
    const uid = activeUid || business?.ownerUid || 'draft';

    const draftItems: BillItem[] = cart.map((it, idx) => {
      const gross = it.quantity * it.unitPrice;
      const disc = Math.min(gross, Math.max(0, it.discount || 0));
      const lineTotal = Math.round((gross - disc) * 100) / 100;
      return {
        id: `draft_item_${idx}`,
        billId: 'draft_bill',
        businessId: business?.id || 'default',
        ownerUid: business?.ownerUid || uid,
        authorizedUids: business?.authorizedUids || [uid],
        productId: it.productId,
        productCode: it.productCode,
        productName: it.productName,
        variantLabel: it.variantLabel,
        barcode: it.barcode,
        imageUrl: it.imageUrl,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discount: disc,
        taxRate: 0,
        taxAmount: 0,
        lineTotal,
      };
    });

    const draftBill: Bill = {
      id: 'draft_bill',
      businessId: business?.id || 'default',
      ownerUid: business?.ownerUid || uid,
      authorizedUids: business?.authorizedUids || [uid],
      billNumber: draftBillNumber,
      customerId: selectedCustomerId || undefined,
      customerName: normalizedCustName,
      customerMobile: customerMobile.trim(),
      customerAddress: customerAddress.trim(),
      itemCount: cart.length,
      subtotal: totals.subtotal,
      discountAmount: totals.totalDiscount,
      taxableAmount: totals.taxableAmount,
      gstType: 'NONE',
      totalTax: 0,
      labourCharge: totals.labourCharge,
      labourRatePerPiece: totals.labourRatePerPiece,
      autoCharge: totals.autoCharge,
      grandTotal: totals.grandTotal,
      amountPaid: totals.paidNum,
      pendingBalance: totals.pendingBalance,
      paymentMethod: resolvedMethod,
      paymentStatus: resolvedStatus,
      billStatus: 'active',
      publicToken: '',
      publicLinkRevoked: false,
      createdByUid: uid,
      createdByName: userAccount?.displayName || 'Cashier',
      notes: notes.trim(),
      createdAt: new Date(),
    };

    const receiptText = buildWhatsAppReceiptText({
      bill: draftBill,
      items: draftItems,
      business,
      products,
      publicUrl: window.location.origin,
      language,
    });

    const waUrl = buildWhatsAppDirectUrl(customerMobile, receiptText);
    openExternalLinkSafely(waUrl);

    if (customerMobile.trim()) {
      logMessageDispatch({
        channel: 'whatsapp',
        recipientMobile: customerMobile.trim(),
        billId: 'draft_cart',
        billNumber: draftBillNumber,
        messageBody: receiptText,
        status: 'opened_share_screen',
      }).catch(() => {});
    }
  };

  const activeModalBill = savedBill;
  const activeModalItems: BillItem[] = useMemo(() => {
    if (!activeModalBill) return [];
    return billItems.filter((bi) => bi.billId === activeModalBill.id);
  }, [activeModalBill, billItems]);

  return (
    <div className="space-y-4 animate-slp-in pb-24 lg:pb-0">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Product Catalog Selector */}
        <div
          className={`lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3.5 shadow-sm shadow-[#0A2240]/5 ${
            mobilePane === 'cart' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-[#9A4307] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  isAdmin
                    ? tr(
                        language,
                        'Search products in English, తెలుగు, code, or barcode...',
                        'ఉత్పత్తి పేరు, కోడ్ లేదా బార్‌కోడ్‌తో వెతకండి...'
                      )
                    : tr(
                        language,
                        'Search products in English or తెలుగు...',
                        'ఉత్పత్తి పేరుతో వెతకండి...'
                      )
                }
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-[#DFD7CC] dark:border-slate-700 bg-[#F6F1EA] dark:bg-slate-950 text-[#0A2240] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
              />
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setPaperCamOpen(true)}
              title={tr(
                language,
                'Photo paper item list to add all to cart',
                'కాగితంపై వ్రాసిన వస్తువుల జాబితాను ఫోటో తీసి కార్ట్‌లో సేవ్ చేయండి'
              )}
              className="px-3 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-sm shadow-[#0A2240]/20"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">
                {tr(language, 'Paper Photo', 'కాగితం ఫోటో')}
              </span>
              <span className="sm:hidden">{tr(language, 'Photo', 'ఫోటో')}</span>
            </motion.button>
          </div>

          {paperNotice && (
            <div className="px-3 py-2 rounded-xl bg-[#E7F6EC] dark:bg-emerald-950/50 border border-[#C5E8D1] dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
              <span>{paperNotice}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {categoriesList.map((cat) => {
              const active = selectedCategory === cat;
              const catLabel = translateCategory(cat, categories, language);
              return (
                <motion.button
                  key={cat}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setSelectedCategory(cat)}
                  className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'text-white'
                      : 'bg-[#F6F1EA] dark:bg-slate-800 text-[#0A2240] dark:text-slate-300 hover:bg-[#EFE8DF] dark:hover:bg-slate-700'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="billing-cat-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                      className="absolute inset-0 rounded-xl bg-[#0A2240] shadow-sm shadow-[#0A2240]/20"
                    />
                  )}
                  <span className="relative z-10">{catLabel}</span>
                </motion.button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:max-h-[560px] lg:overflow-y-auto pr-0.5">
            {loadingData && products.length === 0 ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={`prod-skel-${idx}`}
                  className="p-3 rounded-2xl border border-[#E5DDD3] dark:border-slate-800 bg-[#FAF8F5] dark:bg-slate-950/60 animate-pulse space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl bg-[#E5DDD3]/70 dark:bg-slate-800 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-3/4 rounded bg-[#E5DDD3]/80 dark:bg-slate-800" />
                      <div className="h-3 w-1/2 rounded bg-[#E5DDD3]/60 dark:bg-slate-800" />
                    </div>
                  </div>
                  <div className="h-9 w-full rounded-xl bg-[#E5DDD3]/70 dark:bg-slate-800" />
                </div>
              ))
            ) : filteredProducts.length === 0 ? (
              <div className="sm:col-span-2 py-10 px-4 text-center rounded-2xl border border-dashed border-[#DFD7CC] dark:border-slate-800 bg-[#FAF8F5]/60 dark:bg-slate-950/40 space-y-2.5">
                <p className="text-xs font-semibold text-[#0A2240] dark:text-slate-200">
                  {products.length === 0
                    ? tr(
                        language,
                        'No billing items available yet. Ask the owner to add products or refresh your connection.',
                        'బిల్లింగ్ వస్తువులు ఇంకా లేవు. యజమానిని ఉత్పత్తులు జోడించమని అడగండి లేదా కనెక్షన్ రిఫ్రెష్ చేయండి.'
                      )
                    : tr(
                        language,
                        'No items match your current search or category filter.',
                        'మీ శోధన లేదా వర్గానికి సరిపోలే వస్తువులు లేవు.'
                      )}
                </p>
                {(search.trim() !== '' || selectedCategory !== 'All') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSelectedCategory('All');
                    }}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B] transition"
                  >
                    {tr(language, 'Show All Items', 'అన్ని వస్తువులు చూపించు')}
                  </button>
                )}
              </div>
            ) : (
              filteredProducts.map((product) => {
              const variants = parseVariants(product.variantsSummary);
              const thumbSrc = resolveProductImage(product);
              const isCardPressed = pressedChip?.productId === product.id;
              const displayName = translateProductName(product, language);
              const displayUnit = translateUnit(product.unit, language);

              return (
                <motion.div
                  key={product.id}
                  animate={isCardPressed ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className={`p-3 rounded-2xl border transition-colors flex flex-col justify-between gap-3 ${
                    isCardPressed
                      ? 'border-[#0A2240] bg-[#F6F1EA] dark:bg-blue-950/30 ring-2 ring-[#0A2240]/20'
                      : 'border-[#E5DDD3] dark:border-slate-800 bg-white dark:bg-slate-950/60 hover:border-[#DFD7CC]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={thumbSrc}
                      alt={displayName}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const fallback = getDefaultProductImage(product.name, product.category);
                        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                      }}
                      className="w-14 h-14 rounded-xl object-cover border border-[#E5DDD3] dark:border-slate-700 bg-white shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#0A2240] dark:text-white leading-snug truncate">
                            {displayName}
                          </h3>
                          {language === 'en' && product.nameTe && (
                            <div className="text-xs text-[#9A4307] dark:text-sky-400 font-medium mt-0.5 truncate">
                              {product.nameTe}
                            </div>
                          )}
                        </div>
                        <span className="font-mono text-xs font-bold text-[#9A4307] dark:text-sky-300 shrink-0">
                          ₹{product.sellingPrice}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#6D665E] mt-1 flex items-center gap-1.5">
                        {isAdmin && (
                          <>
                            <span className="font-mono">{product.productCode}</span>
                            <span>·</span>
                          </>
                        )}
                        <span
                          className={
                            product.stock <= (product.lowStockThreshold ?? 10) ? 'text-[#C23B2B] font-semibold' : ''
                          }
                        >
                          {tr(language, 'Stock:', 'స్టాక్:')} {product.stock} {displayUnit}
                        </span>
                      </div>
                    </div>
                  </div>

                  {variants.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {variants.map((v) => {
                        const chipKey = `${product.id}::${v.label}`;
                        const isPressed = pressedChip?.key === chipKey;
                        const inCartQty =
                          cart.find((c) => c.productId === product.id && (c.variantLabel || '') === v.label)
                            ?.quantity || 0;
                        const variantText = translateVariantLabel(v.label, language);

                        return (
                          <motion.button
                            key={v.label}
                            type="button"
                            whileTap={{ scale: 0.86 }}
                            whileHover={{ scale: 1.03 }}
                            animate={isPressed ? { scale: [0.9, 1.08, 1] } : { scale: 1 }}
                            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => addToCart(product, v.label, v.price)}
                            className={`relative overflow-visible min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                              isPressed
                                ? 'bg-[#0A2240] border-[#0A2240] text-white shadow-md shadow-[#0A2240]/30'
                                : inCartQty > 0
                                ? 'bg-[#F6F1EA] dark:bg-blue-950/60 border-[#0A2240] text-[#0A2240] dark:text-sky-300'
                                : 'bg-[#F6F1EA] dark:bg-slate-900 border-[#DFD7CC] dark:border-slate-700 text-[#0A2240] dark:text-slate-100 hover:border-[#0A2240] hover:bg-[#F6F1EA]'
                            }`}
                          >
                            {isPressed && (
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 rounded-xl border-2 border-[#0A2240] animate-slp-ring"
                              />
                            )}
                            <AnimatePresence>
                              {isPressed && (
                                <motion.span
                                  key={pressedChip?.nonce}
                                  initial={{ opacity: 0, y: 4, scale: 0.7 }}
                                  animate={{ opacity: 1, y: -22, scale: 1 }}
                                  exit={{ opacity: 0, y: -32, scale: 0.85 }}
                                  transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                                  className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[#0A2240] text-white text-[10px] font-bold whitespace-nowrap shadow-md z-10"
                                >
                                  {tr(language, '+1 Added', '+1 జోడించబడింది')}
                                </motion.span>
                              )}
                            </AnimatePresence>
                            <span>{variantText}:</span>
                            <span className="font-mono font-bold">₹{v.price}</span>
                            {inCartQty > 0 && (
                              <motion.span
                                key={inCartQty}
                                initial={{ scale: 0.6 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                                className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
                                  isPressed ? 'bg-white text-[#9A4307]' : 'bg-[#0A2240] text-white'
                                }`}
                              >
                                ×{inCartQty}
                              </motion.span>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : (
                    (() => {
                      const chipKey = `${product.id}::BASE`;
                      const isPressed = pressedChip?.key === chipKey;
                      const inCartQty =
                        cart.find((c) => c.productId === product.id && !c.variantLabel)?.quantity || 0;
                      return (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          animate={isPressed ? { scale: [0.95, 1.03, 1] } : { scale: 1 }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          onClick={() => addToCart(product)}
                          className={`relative w-full min-h-[40px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                            isPressed
                              ? 'bg-[#0A2240] text-white shadow-md shadow-[#0A2240]/30'
                              : 'bg-[#0A2240] hover:bg-[#0A2240] text-white'
                          }`}
                        >
                          <span>{tr(language, '+ Add to Bill', '+ బిల్‌లో చేర్చండి')}</span>
                          {inCartQty > 0 && (
                            <motion.span
                              key={inCartQty}
                              initial={{ scale: 0.6 }}
                              animate={{ scale: 1 }}
                              className="px-1.5 py-0.5 rounded-md bg-white text-[#0A2240] font-mono text-[10px] font-bold"
                            >
                              ×{inCartQty}
                            </motion.span>
                          )}
                        </motion.button>
                      );
                    })()
                  )}
                </motion.div>
              );
              })
            )}
          </div>

          <div className="hidden lg:flex items-center justify-between pt-3 border-t border-[#E5DDD3]">
            <div className="text-xs text-[#0A2240] font-medium">
              <span className="font-bold">{totalUnitsInCart}</span>{' '}
              {tr(language, 'items selected', 'వస్తువులు ఎంచుకోబడ్డాయి')} ·{' '}
              <span className="font-mono font-bold text-[#9A4307]">{formatCurrency(totals.grandTotal)}</span>
            </div>
            <button
              type="button"
              onClick={() => cartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-bold shadow-sm hover:opacity-95 transition"
            >
              <ReceiptText className="w-3.5 h-3.5" />
              <span>{tr(language, 'View Bill →', 'బిల్ చూడండి →')}</span>
            </button>
          </div>
        </div>

        {/* Right: Customer, Cart & Payment */}
        <div
          ref={cartPanelRef}
          className={`lg:col-span-5 bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm shadow-[#0A2240]/5 ${
            mobilePane === 'products' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Back to Product Selection (Mobile) */}
          <div className="lg:hidden flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
            <button
              type="button"
              onClick={() => setMobilePane('products')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F6F1EA] text-[#0A2240] text-xs font-bold hover:bg-[#EFE8DF] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#9A4307]" />
              {tr(language, 'Select Products', 'ఉత్పత్తులు ఎంచుకోండి')}
            </button>
            <span className="text-xs font-mono font-bold text-[#9A4307]">
              {totalUnitsInCart} {tr(language, 'items', 'వస్తువులు')} · {formatCurrency(totals.grandTotal)}
            </span>
          </div>

          {/* Customer Selection */}
          <div className="space-y-2.5 pb-4 border-b border-[#E5DDD3] dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#2D3138] dark:text-slate-200">
                {tr(language, 'Customer', 'కస్టమర్')}
              </label>
              <button
                type="button"
                onClick={() => setQuickCustModal(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#9A4307] dark:text-sky-400 hover:underline"
              >
                <UserPlus className="w-3.5 h-3.5" /> {tr(language, 'Save New Customer', 'కొత్త కస్టమర్‌ను సేవ్ చేయండి')}
              </button>
            </div>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleSelectCustomer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-[#FAF8F5] dark:bg-slate-950 text-[#0A2240] dark:text-slate-100"
            >
              <option value="">{tr(language, 'Walk-in / Custom Customer', 'సాధారణ / కొత్త కస్టమర్')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.mobile ? `(${c.mobile})` : ''}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={tr(language, 'Customer Name *', 'కస్టమర్ పేరు *')}
                className="px-3 py-2 text-xs rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950 text-[#0A2240] dark:text-slate-100"
              />
              <input
                type="tel"
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                placeholder={tr(language, 'WhatsApp / Mobile', 'వాట్సాప్ / మొబైల్')}
                className="px-3 py-2 text-xs rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950 text-[#0A2240] dark:text-slate-100"
              />
            </div>
            {customerMobile.trim().length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <MessageCircle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    formatWhatsAppPhone(customerMobile) ? 'text-[#16A34A]' : 'text-amber-600'
                  }`}
                />
                {formatWhatsAppPhone(customerMobile) ? (
                  <span className="text-[#15803D] dark:text-emerald-400">
                    {tr(
                      language,
                      `1-Click WhatsApp ready for ${formatReadableWhatsAppPhone(customerMobile)} (works even if unsaved)`,
                      `${formatReadableWhatsAppPhone(customerMobile)} కు 1-క్లిక్ వాట్సాప్ సిద్ధం (కాంటాక్ట్ సేవ్ లేకపోయినా వెళ్తుంది)`
                    )}
                  </span>
                ) : (
                  <span className="text-[#9A4307] dark:text-amber-400">
                    {tr(
                      language,
                      'Enter 10-digit mobile number for 1-click WhatsApp receipt send',
                      '1-క్లిక్ వాట్సాప్ రసీదు పంపడానికి 10 అంకెల మొబైల్ నంబర్ నమోదు చేయండి'
                    )}
                  </span>
                )}
              </div>
            )}
            <input
              type="text"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder={tr(language, 'Delivery Address / Site (Optional)', 'డెలివరీ చిరునామా / సైట్ (ఐచ్ఛికం)')}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950 text-[#0A2240] dark:text-slate-100"
            />
          </div>

          {/* Cart Items with Images */}
          <div className="space-y-2.5 max-h-72 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8A8279] border border-dashed border-[#E5DDD3] dark:border-slate-800 rounded-xl">
                {tr(
                  language,
                  'Select products or size variants to build a bill.',
                  'బిల్ తయారు చేయడానికి ఉత్పత్తులు లేదా సైజులను ఎంచుకోండి.'
                )}
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {cart.map((item, idx) => {
                  const matchedProd = products.find((p) => p.id === item.productId);
                  const imgSrc = item.imageUrl || resolveProductImage(matchedProd, item.productName);
                  const cartItemTitle = translateCartProductName(
                    item.productName,
                    item.productId,
                    products,
                    language
                  );
                  const cartVariantText = translateVariantLabel(item.variantLabel, language);
                  return (
                    <motion.div
                      key={`${item.productId}-${item.variantLabel || 'BASE'}`}
                      layout="position"
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 16, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="p-3 rounded-xl border border-[#E5DDD3] dark:border-slate-800 bg-[#FAF8F5] dark:bg-slate-950 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={imgSrc}
                            alt={cartItemTitle}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const fallback = getDefaultProductImage(item.productName);
                              if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                            }}
                            className="w-11 h-11 rounded-lg object-cover border border-[#E5DDD3] dark:border-slate-700 bg-white shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#0A2240] dark:text-white truncate">
                              {cartItemTitle} {cartVariantText ? `(${cartVariantText})` : ''}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-[#6D665E]">
                              <span>{tr(language, 'Rate ₹', 'ధర ₹')}</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                aria-label={tr(language, `Price for ${cartItemTitle}`, `${cartItemTitle} ధర`)}
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateCartItem(idx, {
                                    unitPrice: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className="w-20 px-1.5 py-0.5 font-mono text-xs font-semibold rounded-md border border-[#DFD7CC] bg-white text-[#0A2240] focus:outline-none focus:ring-1 focus:ring-[#0A2240]"
                              />
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeCartItem(idx)}
                          className="text-[#8A8279] hover:text-[#C23B2B] p-1"
                          aria-label={tr(language, 'Remove item', 'తొలగించండి')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateCartItem(idx, { quantity: Math.max(1, item.quantity - 1) })}
                            className="p-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              updateCartItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="w-12 text-center font-mono text-xs py-1 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                          <button
                            onClick={() => updateCartItem(idx, { quantity: item.quantity + 1 })}
                            className="p-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[#6D665E]">{tr(language, 'Disc ₹', 'డిస్కౌంట్ ₹')}</span>
                          <input
                            type="number"
                            min={0}
                            value={item.discount}
                            onChange={(e) =>
                              updateCartItem(idx, { discount: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className="w-16 text-right font-mono py-1 px-1.5 rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                          <span className="font-mono font-bold tabular-nums text-[#0A2240] dark:text-white w-20 text-right">
                            ₹{Math.max(0, item.quantity * item.unitPrice - item.discount).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Discount, Charges & Payment Controls */}
          <div className="space-y-3 pt-3 border-t border-[#E5DDD3] dark:border-slate-800 text-xs">
            <div>
              <label className="block text-[#6D665E] mb-1">
                {tr(language, 'Extra Discount (₹)', 'అదనపు డిస్కౌంట్ (₹)')}
              </label>
              <input
                type="number"
                min={0}
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 font-mono rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            {/* Optional Labour Charges (per-piece or total) & Auto Charges */}
            <div className="p-3 rounded-xl border border-[#E5DDD3] dark:border-slate-800 bg-[#F6F1EA] dark:bg-slate-950/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#0A2240] dark:text-slate-200">
                  {tr(language, 'Additional Charges (If Applicable)', 'అదనపు ఛార్జీలు (వర్తిస్తే)')}
                </span>
                {cart.length > 0 && (
                  <span className="text-[11px] font-mono font-semibold text-[#9A4307] dark:text-sky-400">
                    {tr(language, `Cart: ${totalUnitsInCart} pcs`, `కార్ట్: ${totalUnitsInCart} పీసులు`)}
                  </span>
                )}
              </div>

              {/* Labour Charge Toggle + Per-Piece / Fixed Controls */}
              <div className="space-y-2">
                <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                  <span className="inline-flex items-center gap-2 font-semibold text-[#2D3138] dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={labourApplicable}
                      onChange={(e) => setLabourApplicable(e.target.checked)}
                      className="w-4 h-4 rounded border-[#DFD7CC] text-[#9A4307] focus:ring-[#0A2240]"
                    />
                    <HardHat className="w-3.5 h-3.5 text-[#9A4307]" />
                    <span>{tr(language, 'Labour Charges', 'లేబర్ ఛార్జీలు')}</span>
                  </span>
                  {labourApplicable && (
                    <span className="font-mono font-bold text-[#0A2240] dark:text-white">
                      +{formatCurrency(totals.labourCharge)}
                    </span>
                  )}
                </label>

                {labourApplicable && (
                  <div className="pl-6 space-y-2">
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setLabourMode('per_piece')}
                        className={`py-1 px-2 rounded-md text-[11px] font-semibold transition ${
                          labourMode === 'per_piece'
                            ? 'bg-[#0A2240] text-white shadow-sm'
                            : 'text-[#6D665E] dark:text-slate-300'
                        }`}
                      >
                        {tr(language, `Per Piece (×${totalUnitsInCart})`, `పీస్‌కు (×${totalUnitsInCart})`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLabourMode('fixed')}
                        className={`py-1 px-2 rounded-md text-[11px] font-semibold transition ${
                          labourMode === 'fixed'
                            ? 'bg-[#0A2240] text-white shadow-sm'
                            : 'text-[#6D665E] dark:text-slate-300'
                        }`}
                      >
                        {tr(language, 'Total Amount', 'మొత్తం విలువ')}
                      </button>
                    </div>

                    {labourMode === 'per_piece' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={labourRatePerPiece}
                          onChange={(e) => setLabourRatePerPiece(e.target.value)}
                          placeholder={tr(language, 'Rate per piece (₹)', 'ఒక్కో పీస్ ధర (₹)')}
                          className="w-32 px-2.5 py-1.5 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <span className="text-[11px] font-mono text-[#6D665E] dark:text-slate-400">
                          {totalUnitsInCart} {tr(language, 'pcs', 'పీసులు')} × ₹
                          {(Number(labourRatePerPiece) || 0).toFixed(2)} ={' '}
                          <strong className="text-[#0A2240] dark:text-white">
                            {formatCurrency(totals.labourCharge)}
                          </strong>
                        </span>
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={labourFixedAmount}
                        onChange={(e) => setLabourFixedAmount(e.target.value)}
                        placeholder={tr(language, 'Total labour charges (₹)', 'మొత్తం లేబర్ ఛార్జీ (₹)')}
                        className="w-full px-2.5 py-1.5 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Auto / Transport Charges Toggle + Amount */}
              <div className="space-y-2 pt-1.5 border-t border-[#E5DDD3] dark:border-slate-800">
                <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                  <span className="inline-flex items-center gap-2 font-semibold text-[#2D3138] dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={autoApplicable}
                      onChange={(e) => setAutoApplicable(e.target.checked)}
                      className="w-4 h-4 rounded border-[#DFD7CC] text-[#9A4307] focus:ring-[#0A2240]"
                    />
                    <Truck className="w-3.5 h-3.5 text-[#9A4307]" />
                    <span>{tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}</span>
                  </span>
                  {autoApplicable && (
                    <span className="font-mono font-bold text-[#0A2240] dark:text-white">
                      +{formatCurrency(totals.autoCharge)}
                    </span>
                  )}
                </label>

                {autoApplicable && (
                  <div className="pl-6">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={autoChargeInput}
                      onChange={(e) => setAutoChargeInput(e.target.value)}
                      placeholder={tr(language, 'Auto / transport charge (₹)', 'ఆటో / రవాణా ఛార్జీ (₹)')}
                      className="w-full px-2.5 py-1.5 font-mono rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#6D665E] mb-1">
                  {tr(language, 'Payment Method', 'చెల్లింపు విధానం')}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="Cash">{tr(language, 'Cash', 'నగదు')}</option>
                  <option value="UPI">{tr(language, 'UPI (PhonePe / GPay)', 'యూపీఐ (ఫోన్‌పే / జీపే)')}</option>
                  <option value="Bank Transfer">{tr(language, 'Bank Transfer', 'బ్యాంక్ బదిలీ')}</option>
                  <option value="Other">{tr(language, 'Other', 'ఇతర')}</option>
                  <option value="Unpaid">{tr(language, 'Credit / Due Later', 'అప్పు / తర్వాత చెల్లింపు')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[#6D665E] mb-1">
                  {tr(language, 'Amount Paid (₹)', 'చెల్లించిన మొత్తం (₹)')}
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder={totals.grandTotal.toFixed(2)}
                  value={paymentMethod === 'Unpaid' ? '0' : amountPaidInput}
                  disabled={paymentMethod === 'Unpaid'}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            {paymentMethod !== 'Cash' && paymentMethod !== 'Unpaid' && (
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder={tr(
                  language,
                  'UPI / PhonePe / Bank Transaction Reference',
                  'యూపీఐ / ఫోన్‌పే / బ్యాంక్ లావాదేవీ నంబర్'
                )}
                className="w-full px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            )}

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr(
                language,
                'Bill remarks or delivery note (Optional)',
                'బిల్ గమనికలు లేదా డెలివరీ నోట్ (ఐచ్ఛికం)'
              )}
              className="w-full px-3 py-2 rounded-xl border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          {/* Totals Box */}
          <div className="p-4 rounded-xl bg-[#FAF8F5] dark:bg-slate-950 border border-[#E5DDD3] dark:border-slate-800 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-[#6D665E] dark:text-slate-400">
              <span className="font-sans">{tr(language, 'Subtotal', 'ఉప మొత్తం')}</span>
              <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between text-[#15803D] dark:text-emerald-400">
                <span className="font-sans">{tr(language, 'Discount', 'డిస్కౌంట్')}</span>
                <span className="tabular-nums">-{formatCurrency(totals.totalDiscount)}</span>
              </div>
            )}
            {totals.labourCharge > 0 && (
              <div className="flex justify-between text-[#2D3138] dark:text-slate-300">
                <span className="font-sans">
                  {totals.labourRatePerPiece > 0
                    ? tr(
                        language,
                        `Labour (${totalUnitsInCart} pcs × ₹${totals.labourRatePerPiece.toFixed(2)})`,
                        `లేబర్ ఛార్జీలు (${totalUnitsInCart} పీసులు × ₹${totals.labourRatePerPiece.toFixed(2)})`
                      )
                    : tr(language, 'Labour Charges', 'లేబర్ ఛార్జీలు')}
                </span>
                <span className="tabular-nums">+{formatCurrency(totals.labourCharge)}</span>
              </div>
            )}
            {totals.autoCharge > 0 && (
              <div className="flex justify-between text-[#2D3138] dark:text-slate-300">
                <span className="font-sans">{tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}</span>
                <span className="tabular-nums">+{formatCurrency(totals.autoCharge)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-[#0A2240] dark:text-white pt-2 border-t border-[#E5DDD3] dark:border-slate-800">
              <span className="font-sans">{tr(language, 'Grand Total', 'మొత్తం బిల్')}</span>
              <AnimatedNumber value={totals.grandTotal} format={(n) => formatCurrency(n)} />
            </div>
            <div className="flex justify-between text-[#15803D] dark:text-emerald-400">
              <span className="font-sans">{tr(language, 'Paying Now', 'ఇప్పుడు చెల్లిస్తున్నది')}</span>
              <AnimatedNumber value={totals.paidNum} format={(n) => formatCurrency(n)} />
            </div>
            <div
              className={`flex justify-between font-semibold ${
                totals.pendingBalance > 0
                  ? 'text-[#9A4307] dark:text-amber-400'
                  : 'text-[#15803D] dark:text-emerald-400'
              }`}
            >
              <span className="font-sans">
                {totals.pendingBalance > 0
                  ? tr(language, 'Due Balance (Shows QR)', 'బాకీ మొత్తం (QR చూపిస్తుంది)')
                  : tr(language, 'Status', 'స్థితి')}
              </span>
              <span className="tabular-nums">
                {totals.pendingBalance > 0
                  ? formatCurrency(totals.pendingBalance)
                  : tr(language, 'AMOUNT PAID', 'చెల్లింపు పూర్తయింది')}
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-[#FCE8E6] dark:bg-rose-950/50 border border-[#F5C6C0] dark:border-rose-800 text-xs text-[#C23B2B] dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleSaveBill}
              disabled={saving || cart.length === 0}
              className="w-full py-3.5 px-4 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-sm font-semibold flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {saving
                ? tr(language, 'Confirming with Cloud Server...', 'క్లౌడ్ సర్వర్‌లో సేవ్ అవుతోంది...')
                : tr(language, 'Save & Generate Bill', 'సేవ్ చేసి బిల్ తయారు చేయండి')}
            </button>

            <button
              type="button"
              onClick={handleShareCartWhatsApp}
              disabled={saving || cart.length === 0}
              className="w-full py-3.5 px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99] disabled:opacity-50"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>{tr(language, 'Share via WhatsApp', 'వాట్సాప్‌లో షేర్ చేయండి')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Always-Visible Bottom View Bill Bar when selecting products */}
      {mobilePane === 'products' && (
        <motion.div
          key={`cart-bar-${totalUnitsInCart}`}
          initial={{ y: 10, opacity: 0.94 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="lg:hidden fixed bottom-[72px] inset-x-3 z-20"
        >
          <button
            type="button"
            onClick={() => {
              setMobilePane('cart');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[#0A2240] text-white shadow-xl shadow-[#0A2240]/25 border border-white/20 active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-2.5 text-left">
              <motion.span
                key={totalUnitsInCart}
                initial={{ scale: 0.75 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2 }}
                className="px-2.5 py-0.5 rounded-lg bg-white text-[#0A2240] font-mono font-bold text-xs flex items-center gap-1"
              >
                <ReceiptText className="w-3.5 h-3.5 text-[#9A4307]" />
                {totalUnitsInCart}
              </motion.span>
              <div>
                <div className="text-xs font-bold">
                  {cart.length > 0
                    ? tr(language, `${cart.length} Products Selected`, `${cart.length} ఉత్పత్తులు ఎంచుకోబడ్డాయి`)
                    : tr(language, 'Select Items for Bill', 'బిల్ కోసం వస్తువులను ఎంచుకోండి')}
                </div>
                <div className="text-[10px] text-[#E5DDD3]">{formatCurrency(totals.grandTotal)}</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-[#0A2240] text-xs font-bold shadow-sm">
              <span>{tr(language, 'View Bill', 'బిల్ చూడండి')}</span>
              <span>→</span>
            </div>
          </button>
        </motion.div>
      )}

      {quickCustModal && (
        <QuickCustomerModal
          language={language}
          initialName={
            customerName === 'Walk-in Customer' || customerName === 'సాధారణ కస్టమర్' ? '' : customerName
          }
          initialMobile={customerMobile}
          initialAddress={customerAddress}
          onClose={() => setQuickCustModal(false)}
          onSave={async (data) => {
            const newId = await saveCustomer(data);
            setSelectedCustomerId(newId);
            setCustomerName(data.name);
            setCustomerMobile(data.mobile || '');
            setCustomerAddress(data.address || '');
            setQuickCustModal(false);
          }}
        />
      )}

      <PostBillActionsModal
        bill={activeModalBill}
        items={activeModalItems}
        justSaved={savedJustNow}
        onClose={() => {
          setSavedBill(null);
          setSavedJustNow(false);
        }}
      />

      <PaperListCameraModal
        open={paperCamOpen}
        onClose={() => setPaperCamOpen(false)}
        products={products}
        taxEnabled={false}
        language={language}
        onSaveAllToCart={handleBulkAddFromPaper}
      />
    </div>
  );
};

const QuickCustomerModal: React.FC<{
  language: 'en' | 'te';
  initialName: string;
  initialMobile: string;
  initialAddress: string;
  onClose: () => void;
  onSave: (data: { name: string; mobile?: string; address?: string }) => Promise<void>;
}> = ({ language, initialName, initialMobile, initialAddress, onClose, onSave }) => {
  const [name, setName] = useState(initialName);
  const [mobile, setMobile] = useState(initialMobile);
  const [address, setAddress] = useState(initialAddress);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), mobile: mobile.trim(), address: address.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-2 sm:p-4 overflow-y-auto">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 p-6 space-y-4 max-h-[92dvh] overflow-y-auto"
      >
        <h3 className="text-base font-semibold text-[#0A2240] dark:text-white">
          {tr(language, 'Register Customer', 'కొత్త కస్టమర్ నమోదు')}
        </h3>
        <input
          required
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr(language, 'Customer Full Name *', 'కస్టమర్ పూర్తి పేరు *')}
          className="w-full px-3 py-2 text-sm rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
        />
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder={tr(language, 'Mobile Number (Optional)', 'మొబైల్ నంబర్ (ఐచ్ఛికం)')}
          className="w-full px-3 py-2 text-sm rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
        />
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={tr(language, 'Address (Optional)', 'చిరునామా (ఐచ్ఛికం)')}
          className="w-full px-3 py-2 text-sm rounded-lg border border-[#E5DDD3] dark:border-slate-700 bg-white dark:bg-slate-950"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[#E5DDD3] dark:border-slate-700"
          >
            {tr(language, 'Cancel', 'రద్దు')}
          </button>
          <button type="submit" disabled={busy} className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0A2240] text-white">
            {busy ? tr(language, 'Saving...', 'సేవ్ అవుతోంది...') : tr(language, 'Save Customer', 'కస్టమర్‌ను సేవ్ చేయండి')}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
};
