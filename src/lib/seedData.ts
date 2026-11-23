import { doc, getDoc, getDocFromCache, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { ProductVariant } from '../types/billing';

export const DEFAULT_BUSINESS_ID = 'slp_main';
export const DEFAULT_BUSINESS_LOGO = '/assets/aistudio/Screenshot_2026-11-19-20-18-11-98_0982bb9e9580655b32fc37322556fc15_366049ad.jpg';
export const BOOT_ADMIN_EMAIL = 'armuripradeepkumar@gmail.com';

export const SEED_CATEGORIES = [
  { id: 'cat_darwaja', name: 'Darwaja', nameTe: 'దర్వాజా' },
  { id: 'cat_ketikelu', name: 'Ketikelu Frames', nameTe: 'కెటికిలు ఫ్రేమ్స్' },
  { id: 'cat_ventilators', name: 'Ventilators & Fans', nameTe: 'వెంటిలేటర్లు & ఫ్యాన్లు' },
  { id: 'cat_tulasikota', name: 'Tulasikota', nameTe: 'తులసికోట' },
  { id: 'cat_well_rings', name: 'Well Rings & Lids', nameTe: 'గగులు & గలులు బిల్లాలు' },
  { id: 'cat_slabs', name: 'Selupu Ralu Slabs', nameTe: 'సెలుపు రాళ్లు స్లాబ్స్' },
  { id: 'cat_poles', name: 'Poles & Fencing', nameTe: 'గుంజలు & కంచె స్తంభాలు' },
];

export const SEED_PRODUCTS = [
  {
    id: 'prod_darwaja',
    productCode: 'SLP-DRW-01',
    name: 'Darwaja',
    nameTe: 'దర్వాజా',
    category: 'Darwaja',
    barcode: '8901001000011',
    purchasePrice: 460,
    sellingPrice: 620,
    stock: 48,
    lowStockThreshold: 10,
    taxRate: 18,
    unit: 'Piece',
    variantsSummary: '6FT:620|6½FT:620|6⅛FT:620',
    description: 'Precast RCC cement door frame (6FT, 6½FT, 6⅛FT)',
  },
  {
    id: 'prod_kodada_darwaja',
    productCode: 'SLP-DRW-02',
    name: 'Kodada Darwaja',
    nameTe: 'కొడద దర్వాజా',
    category: 'Darwaja',
    barcode: '8901001000028',
    purchasePrice: 880,
    sellingPrice: 1150,
    stock: 32,
    lowStockThreshold: 8,
    taxRate: 18,
    unit: 'Piece',
    variantsSummary: '6FT:1150|6½FT:1150|6⅛FT:1150',
    description: 'Heavy-duty designer Kodada cement door frame',
  },
  {
    id: 'prod_kodada_ketikilu',
    productCode: 'SLP-KTK-01',
    name: 'Kodada Ketikilu',
    nameTe: 'కొడద కెటికిలు',
    category: 'Ketikelu Frames',
    barcode: '8901001000035',
    purchasePrice: 450,
    sellingPrice: 600,
    stock: 45,
    lowStockThreshold: 10,
    taxRate: 18,
    unit: 'Frame',
    variantsSummary: '2x2 FT:600|2.5x3 FT:850|3x3 FT:1000|3x4 FT:1100|4x3 FT:1450|4x4 FT:1600',
    description: 'Precast cement window frame with Kodada finish',
  },
  {
    id: 'prod_ketikelu',
    productCode: 'SLP-KTK-02',
    name: 'Ketikelu',
    nameTe: 'కెటికిలు',
    category: 'Ketikelu Frames',
    barcode: '8901001000042',
    purchasePrice: 480,
    sellingPrice: 620,
    stock: 54,
    lowStockThreshold: 12,
    taxRate: 18,
    unit: 'Frame',
    variantsSummary: '2.5×2FT:480|2.5×3FT:620|3×3FT:720|3×4FT:1080|4×3FT:1200|4×4FT:1620',
    description: 'Standard precast RCC window grill frame',
  },
  {
    id: 'prod_machine_ventilator',
    productCode: 'SLP-VNT-01',
    name: 'Machine Ventilator',
    nameTe: 'మెషిన్ వెంటిలేటర్',
    category: 'Ventilators & Fans',
    barcode: '8901001000059',
    purchasePrice: 230,
    sellingPrice: 320,
    stock: 60,
    lowStockThreshold: 12,
    taxRate: 18,
    unit: 'Piece',
    variantsSummary: '1 Door:320|2 Doors:520|3 Doors:700',
    description: 'Louvered precast machine cement ventilator',
  },
  {
    id: 'prod_adjust_fan',
    productCode: 'SLP-VNT-02',
    name: 'Adjust Fan',
    nameTe: 'అజస్ట్ ఫ్యాన్',
    category: 'Ventilators & Fans',
    barcode: '8901001000066',
    purchasePrice: 180,
    sellingPrice: 260,
    stock: 40,
    lowStockThreshold: 10,
    taxRate: 18,
    unit: 'Piece',
    variantsSummary: 'Standard Round:260|Heavy Duty:340',
    description: 'Round adjustable exhaust cement ventilator ring',
  },
  {
    id: 'prod_tulasikota',
    productCode: 'SLP-TLS-01',
    name: 'Tulasikota',
    nameTe: 'తులసికోట',
    category: 'Tulasikota',
    barcode: '8901001000073',
    purchasePrice: 150,
    sellingPrice: 220,
    stock: 28,
    lowStockThreshold: 6,
    taxRate: 12,
    unit: 'Piece',
    variantsSummary: 'Small:220|Medium:320|Large:420',
    description: 'Traditional carved cement Tulasikota planter',
  },
  {
    id: 'prod_galulu_billalu',
    productCode: 'SLP-WRL-01',
    name: 'Galulu Billalu (Well Lid)',
    nameTe: 'గలులు బిల్లాలు',
    category: 'Well Rings & Lids',
    barcode: '8901001000080',
    purchasePrice: 240,
    sellingPrice: 320,
    stock: 30,
    lowStockThreshold: 8,
    taxRate: 18,
    unit: 'Piece',
    variantsSummary: '2FT:320|3FT:370|4FT:800',
    description: 'Reinforced cement well cover / septic lid',
  },
  {
    id: 'prod_gagulu',
    productCode: 'SLP-WRL-02',
    name: 'Gagulu (Well Ring)',
    nameTe: 'గగులు',
    category: 'Well Rings & Lids',
    barcode: '8901001000097',
    purchasePrice: 310,
    sellingPrice: 420,
    stock: 36,
    lowStockThreshold: 8,
    taxRate: 18,
    unit: 'Ring',
    variantsSummary: '2FT Ring:420|3FT Ring:580|4FT Ring:850',
    description: 'Precast cement well / soak-pit ring',
  },
  {
    id: 'prod_selupu_kitchen',
    productCode: 'SLP-SLB-01',
    name: 'Selupu Ralu - Kitchen Slab',
    nameTe: 'సెలుపు రాళ్లు కిచెన్',
    category: 'Selupu Ralu Slabs',
    barcode: '8901001000103',
    purchasePrice: 240,
    sellingPrice: 320,
    stock: 55,
    lowStockThreshold: 12,
    taxRate: 18,
    unit: 'Slab',
    variantsSummary: '3x2 FT:320|3.5x2 FT:370|4x2 FT:420|5x2 FT:520|6x2 FT:620|7x2 FT:720',
    description: 'Heavy-duty precast kitchen counter slab',
  },
  {
    id: 'prod_selupu_1ft',
    productCode: 'SLP-SLB-02',
    name: 'Selupu Ralu - 1 FT Slab',
    nameTe: 'సెలుపు రాళ్లు 1 FT',
    category: 'Selupu Ralu Slabs',
    barcode: '8901001000110',
    purchasePrice: 160,
    sellingPrice: 220,
    stock: 64,
    lowStockThreshold: 15,
    taxRate: 18,
    unit: 'Slab',
    variantsSummary: '4x1 FT:220|5x1 FT:270',
    description: '1 FT wide precast shelf slab',
  },
  {
    id: 'prod_selupu_14in',
    productCode: 'SLP-SLB-03',
    name: 'Selupu Ralu - 14 Inch Slab',
    nameTe: 'సెలుపు రాళ్లు 14 ఇంచ్',
    category: 'Selupu Ralu Slabs',
    barcode: '8901001000127',
    purchasePrice: 165,
    sellingPrice: 220,
    stock: 52,
    lowStockThreshold: 12,
    taxRate: 18,
    unit: 'Slab',
    variantsSummary: '3x14 in:220|3.5x14 in:250|4x14 in:250|4.5x14 in:280|5x14 in:550|6x14 in:450',
    description: '14-inch precast shelf slab in multiple lengths',
  },
  {
    id: 'prod_selupu_18in',
    productCode: 'SLP-SLB-04',
    name: 'Selupu Ralu - 18 Inch Slab',
    nameTe: 'సెలుపు రాళ్లు 18 ఇంచ్',
    category: 'Selupu Ralu Slabs',
    barcode: '8901001000134',
    purchasePrice: 270,
    sellingPrice: 420,
    stock: 44,
    lowStockThreshold: 10,
    taxRate: 18,
    unit: 'Slab',
    variantsSummary: '3x18 in:420|4x18 in:520|5x18 in:350',
    description: '18-inch wide precast storage slab',
  },
  {
    id: 'prod_selupu_9in',
    productCode: 'SLP-SLB-05',
    name: 'Selupu Ralu - 9 Inch Slab',
    nameTe: 'సెలుపు రాళ్లు 9 ఇంచ్',
    category: 'Selupu Ralu Slabs',
    barcode: '8901001000141',
    purchasePrice: 220,
    sellingPrice: 300,
    stock: 58,
    lowStockThreshold: 12,
    taxRate: 18,
    unit: 'Slab',
    variantsSummary: '3x9 in:300|4x9 in:380|5x9 in:450',
    description: '9-inch narrow precast rack slab',
  },
  {
    id: 'prod_gunjalu',
    productCode: 'SLP-POL-01',
    name: 'Gunjalu',
    nameTe: 'గుంజ',
    category: 'Poles & Fencing',
    barcode: '8901001000158',
    purchasePrice: 210,
    sellingPrice: 280,
    stock: 90,
    lowStockThreshold: 20,
    taxRate: 18,
    unit: 'Pole',
    variantsSummary: '6FT:280|8FT:380|9FT:410|10FT:470|11FT:520|12FT:620',
    description: 'Reinforced concrete compound & shed pillar pole',
  },
  {
    id: 'prod_fencing_pole',
    productCode: 'SLP-POL-02',
    name: 'Fencing Pole',
    nameTe: 'కంచె స్తంభం',
    category: 'Poles & Fencing',
    barcode: '8901001000165',
    purchasePrice: 130,
    sellingPrice: 180,
    stock: 110,
    lowStockThreshold: 25,
    taxRate: 18,
    unit: 'Pole',
    variantsSummary: '6FT:180|7FT:220',
    description: 'Precast cement boundary fencing post',
  },
];

export function parseVariants(variantsSummary?: string): ProductVariant[] {
  if (!variantsSummary) return [];
  return variantsSummary
    .split('|')
    .map((part) => {
      const [label, priceStr] = part.split(':');
      const price = Number(priceStr);
      if (!label || !Number.isFinite(price)) return null;
      return { label: label.trim(), price };
    })
    .filter((v): v is ProductVariant => v !== null);
}

export async function ensureBusinessSeeded(adminUid: string, adminEmail: string, adminName: string): Promise<void> {
  try {
    if (localStorage.getItem('slp_seeded_biz_ok') === '1') {
      return;
    }
  } catch {
    // ignore storage errors
  }
  const bizRef = doc(db, 'businesses', DEFAULT_BUSINESS_ID);
  try {
    const cachedSnap = await getDocFromCache(bizRef).catch(() => null);
    if (cachedSnap && cachedSnap.exists()) {
      try {
        localStorage.setItem('slp_seeded_biz_ok', '1');
      } catch {
        // ignore
      }
      return;
    }
    const snap = await getDoc(bizRef);
    if (snap.exists()) {
      try {
        localStorage.setItem('slp_seeded_biz_ok', '1');
      } catch {
        // ignore
      }
      return;
    }

    const batch = writeBatch(db);
    const authorizedUids = [adminUid];
    const authorizedEmails = [adminEmail.toLowerCase()];

    batch.set(bizRef, {
      id: DEFAULT_BUSINESS_ID,
      name: 'Sri Lakshmi Penchil Narasimha Swamy Cement Work',
      proprietor: 'A. Prasad',
      address: 'Cement Works Yard, Main Road, Andhra Pradesh',
      phone: '9912179771',
      gstin: '',
      currency: 'INR',
      taxEnabled: false,
      defaultTaxRate: 18,
      billPrefix: 'SLP',
      nextBillNumber: 1001,
      logoUrl: DEFAULT_BUSINESS_LOGO,
      ownerUid: adminUid,
      ownerEmail: adminEmail.toLowerCase(),
      authorizedUids,
      authorizedEmails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'admins', adminUid), {
      uid: adminUid,
      email: adminEmail.toLowerCase(),
      businessId: DEFAULT_BUSINESS_ID,
      createdAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', adminUid), {
      uid: adminUid,
      email: adminEmail.toLowerCase(),
      displayName: adminName || 'A. Prasad (Admin)',
      role: 'admin',
      status: 'active',
      businessId: DEFAULT_BUSINESS_ID,
      ownerUid: adminUid,
      authorizedUids,
      canEditBills: true,
      canCancelBills: true,
      canViewReports: true,
      canManageProducts: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'businessSettings', DEFAULT_BUSINESS_ID), {
      id: DEFAULT_BUSINESS_ID,
      businessId: DEFAULT_BUSINESS_ID,
      ownerUid: adminUid,
      authorizedUids,
      authorizedEmails,
      paperWidth: '80mm',
      fontSize: 'md',
      showLogo: true,
      showThermalLogo: true,
      showQrCode: true,
      footerMessage: 'Thank you for choosing Sri Lakshmi Penchil Narasimha Swamy Cement Work!',
      invoiceNotes: 'All precast cement products are quality checked before dispatch.',
      whatsappEnabled: true,
      smsEnabled: true,
      smsSenderId: 'SLPBIL',
      smsDltTemplateId: '',
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'upiSettings', DEFAULT_BUSINESS_ID), {
      id: DEFAULT_BUSINESS_ID,
      businessId: DEFAULT_BUSINESS_ID,
      ownerUid: adminUid,
      authorizedUids,
      authorizedEmails,
      upiId: '9912179771@ybl',
      accountHolderName: 'A Prasad',
      businessName: 'Sri Lakshmi Penchil Narasimha Swamy Cement Work',
      paymentDescription: 'SLP Cement Work Payment',
      uploadedQrDataUrl: '',
      activeMode: 'generated',
      updatedAt: serverTimestamp(),
    });

    for (const cat of SEED_CATEGORIES) {
      batch.set(doc(db, 'categories', cat.id), {
        ...cat,
        businessId: DEFAULT_BUSINESS_ID,
        ownerUid: adminUid,
        authorizedUids,
        authorizedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const prod of SEED_PRODUCTS) {
      batch.set(doc(db, 'products', prod.id), {
        ...prod,
        businessId: DEFAULT_BUSINESS_ID,
        ownerUid: adminUid,
        authorizedUids,
        authorizedEmails,
        imageUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `businesses/${DEFAULT_BUSINESS_ID}`);
  }
}
