import { SEED_CATEGORIES, SEED_PRODUCTS } from './seedData';
import { Category, Language, Product } from '../types/billing';

export function tr(language: Language, en: string, te: string): string {
  return language === 'te' ? te : en;
}

export function getAppLocale(language: Language): string {
  return language === 'te' ? 'te-IN' : 'en-IN';
}

export function formatAppDate(date: Date, language: Language, withTime = false): string {
  const locale = getAppLocale(language);
  try {
    return withTime ? date.toLocaleString(locale) : date.toLocaleDateString(locale);
  } catch {
    return withTime ? date.toLocaleString('en-IN') : date.toLocaleDateString('en-IN');
  }
}

export const TELUGU_BUSINESS_NAME = 'శ్రీ లక్ష్మి పెంచిల్ నరసింహ స్వామి సిమెంట్ వర్క్స్';
export const TELUGU_SHORT_APP_NAME = 'ఎస్‌ఎల్‌పి బిల్లింగ్';
export const TELUGU_PROPRIETOR_DEFAULT = 'ఎ. ప్రసాద్';
export const TELUGU_ADDRESS_DEFAULT = 'సిమెంట్ వర్క్స్ యార్డ్, మెయిన్ రోడ్, ఆంధ్ర ప్రదేశ్';
export const TELUGU_FOOTER_DEFAULT = 'శ్రీ లక్ష్మి పెంచిల్ నరసింహ స్వామి సిమెంట్ వర్క్స్‌ను ఎంచుకున్నందుకు ధన్యవాదాలు!';
export const TELUGU_INVOICE_NOTES_DEFAULT = 'అన్ని ప్రీకాస్ట్ సిమెంట్ ఉత్పత్తులు పంపే ముందు నాణ్యత తనిఖీ చేయబడతాయి.';
export const TELUGU_WALKIN_CUSTOMER = 'సాధారణ కస్టమర్';

const CATEGORY_TE_MAP: Record<string, string> = {
  All: 'అన్నీ',
  Darwaja: 'దర్వాజా',
  'Ketikelu Frames': 'కెటికిలు ఫ్రేమ్స్',
  'Ventilators & Fans': 'వెంటిలేటర్లు & ఫ్యాన్లు',
  Tulasikota: 'తులసికోట',
  'Well Rings & Lids': 'గగులు & గలులు బిల్లాలు',
  'Selupu Ralu Slabs': 'సెలుపు రాళ్లు స్లాబ్స్',
  'Poles & Fencing': 'గుంజలు & కంచె స్తంభాలు',
  // Income & Expense categories
  Labour: 'లేబర్',
  'Cement & Sand': 'సిమెంట్ & ఇసుక',
  Transport: 'రవాణా',
  'Electricity & Rent': 'విద్యుత్ & అద్దె',
  'Tea & Food': 'టీ & భోజనం',
  'Tools & Repair': 'పనిముట్లు & మరమ్మత్తు',
  'Other Expense': 'ఇతర ఖర్చు',
  'Cash Sale': 'నగదు అమ్మకం',
  'Advance / Due Received': 'అడ్వాన్స్ / బాకీ వసూలు',
  'Scrap / Misc Income': 'తుక్కు / ఇతర ఆదాయం',
  'Other Income': 'ఇతర ఆదాయం',
  'Shop Income': 'షాప్ ఆదాయం',
  'Shop Expense': 'షాప్ ఖర్చు',
  'Labour Money Taken': 'లేబర్ తీసుకున్న డబ్బు',
  General: 'సాధారణ',
};

const PRODUCT_TE_BY_ID: Record<string, string> = Object.fromEntries(
  SEED_PRODUCTS.map((p) => [p.id, p.nameTe])
);

const PRODUCT_TE_BY_NAME: Record<string, string> = Object.fromEntries(
  SEED_PRODUCTS.map((p) => [p.name.toLowerCase(), p.nameTe])
);

const UNIT_TE_MAP: Record<string, string> = {
  piece: 'పీస్',
  pieces: 'పీసులు',
  frame: 'ఫ్రేమ్',
  frames: 'ఫ్రేమ్‌లు',
  ring: 'రింగ్',
  rings: 'రింగులు',
  slab: 'స్లాబ్',
  slabs: 'స్లాబ్స్',
  pole: 'స్తంభం',
  poles: 'స్తంభాలు',
  unit: 'యూనిట్',
  units: 'యూనిట్లు',
  bag: 'బస్తా',
  bags: 'బస్తాలు',
  kg: 'కేజీ',
  box: 'బాక్స్',
  set: 'సెట్',
  pair: 'జత',
  meter: 'మీటర్',
  foot: 'అడుగు',
  feet: 'అడుగులు',
};

const PAYMENT_METHOD_TE_MAP: Record<string, string> = {
  Cash: 'నగదు',
  UPI: 'యూపీఐ',
  'Bank Transfer': 'బ్యాంక్ బదిలీ',
  Other: 'ఇతర',
  Unpaid: 'చెల్లించనిది',
};

const STATUS_TE_MAP: Record<string, string> = {
  paid: 'చెల్లించినది',
  partial: 'పాక్షికం',
  pending: 'బాకీ',
  cancelled: 'రద్దు చేయబడింది',
  refunded: 'వాపసు',
  active: 'సక్రియం',
  disabled: 'నిలిపివేయబడింది',
  revoked: 'రద్దు చేయబడింది',
  authorized: 'అనుమతించబడింది',
  completed: 'పూర్తయింది',
  sent: 'పంపబడింది',
  queued: 'క్యూలో ఉంది',
  failed: 'విఫలమైంది',
  opened_share_screen: 'షేర్ స్క్రీన్ తెరవబడింది',
  accepted: 'ఆమోదించబడింది',
  admin: 'అడ్మిన్',
  cashier: 'సిబ్బంది',
  staff: 'సిబ్బంది',
  sale: 'అమ్మకం',
  restock: 'స్టాక్ చేర్పు',
  adjustment: 'సర్దుబాటు',
  return: 'వాపసు',
  income: 'ఆదాయం',
  expense: 'ఖర్చు',
  desktop: 'డెస్క్‌టాప్',
  mobile: 'మొబైల్',
  tablet: 'టాబ్లెట్',
  whatsapp: 'వాట్సాప్',
  sms: 'ఎస్‌ఎంఎస్',
  bill: 'బిల్',
  payment: 'చెల్లింపు',
  low_stock: 'తక్కువ స్టాక్',
  customer: 'కస్టమర్',
  cancellation: 'రద్దు',
  refund: 'వాపసు',
  settings: 'సెట్టింగ్స్',
  unpaid: 'చెల్లించనిది',
  device: 'పరికరం',
  generated: 'జనరేట్ చేసినది',
  uploaded: 'అప్‌లోడ్ చేసినది',
  pending_due: 'బాకీ',
};

export function cleanTeluguProductLabel(text: string): string {
  return text
    .replace(/\bFT\b/gi, 'అడుగు')
    .replace(/\binch\b/gi, 'ఇంచ్')
    .replace(/\bin\b/gi, 'అం.');
}

export function translateBusinessName(name: string | null | undefined, language: Language): string {
  const clean = (name || '').trim();
  if (language !== 'te') {
    return clean || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work';
  }
  if (!clean || clean.toLowerCase() === 'sri lakshmi penchil narasimha swamy cement work') {
    return TELUGU_BUSINESS_NAME;
  }
  return clean;
}

export function translateProprietor(name: string | null | undefined, language: Language): string {
  const clean = (name || '').trim();
  if (language !== 'te') return clean;
  if (!clean) return '';
  if (clean.toLowerCase() === 'a. prasad' || clean.toLowerCase() === 'a prasad') {
    return TELUGU_PROPRIETOR_DEFAULT;
  }
  return clean;
}

export function translateAddress(address: string | null | undefined, language: Language): string {
  const clean = (address || '').trim();
  if (language !== 'te') return clean;
  if (!clean) return '';
  if (clean.toLowerCase() === 'cement works yard, main road, andhra pradesh') {
    return TELUGU_ADDRESS_DEFAULT;
  }
  return clean;
}

export function translateFooterMessage(message: string | null | undefined, language: Language): string {
  const clean = (message || '').trim();
  if (language !== 'te') {
    return clean || 'Thank you for your business!';
  }
  if (
    !clean ||
    clean.toLowerCase().includes('thank you for choosing sri lakshmi') ||
    clean.toLowerCase().includes('thank you for your business') ||
    clean.toLowerCase().includes('thank you for shopping with us')
  ) {
    return TELUGU_FOOTER_DEFAULT;
  }
  return clean;
}

export function translateCustomerName(name: string | null | undefined, language: Language): string {
  const clean = (name || '').trim();
  if (language !== 'te') return clean || 'Walk-in Customer';
  if (!clean || clean.toLowerCase() === 'walk-in customer') {
    return TELUGU_WALKIN_CUSTOMER;
  }
  return clean;
}

export function translateCategory(
  categoryName: string,
  categories: Category[] = [],
  language: Language = 'en'
): string {
  if (language !== 'te') return categoryName;
  const trimmed = (categoryName || '').trim();
  if (!trimmed) return 'సాధారణ';
  if (CATEGORY_TE_MAP[trimmed]) return CATEGORY_TE_MAP[trimmed];
  const matched = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (matched?.nameTe) return matched.nameTe;
  const seed = SEED_CATEGORIES.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (seed?.nameTe) return seed.nameTe;
  return trimmed;
}

export function translateVariantLabel(label: string | undefined, language: Language): string {
  if (!label) return '';
  if (language !== 'te') return label;
  return label
    .replace(/Standard Round/gi, 'సాధారణ రౌండ్')
    .replace(/Heavy Duty/gi, 'హెవీ డ్యూటీ')
    .replace(/\bSmall\b/gi, 'చిన్నది')
    .replace(/\bMedium\b/gi, 'మధ్యస్థం')
    .replace(/\bLarge\b/gi, 'పెద్దది')
    .replace(/\bDoors\b/gi, 'డోర్లు')
    .replace(/\bDoor\b/gi, 'డోర్')
    .replace(/\bRing\b/gi, 'రింగ్')
    .replace(/\bFT\b/gi, 'అ.')
    .replace(/\bin\b/gi, 'అం.')
    .replace(/x/gi, '×');
}

export function translateProductName(
  product: Pick<Product, 'id' | 'name' | 'nameTe'> | null | undefined,
  language: Language,
  fallbackRawName?: string
): string {
  if (!product) {
    const raw = (fallbackRawName || '').trim();
    if (!raw) return '';
    if (language !== 'te') return raw;
    // Strip hybrid "English (Telugu)" format if previously saved that way
    const hybridMatch = raw.match(/\(([^)]+)\)\s*$/);
    if (hybridMatch && /[\u0C00-\u0C7F]/.test(hybridMatch[1])) {
      return cleanTeluguProductLabel(hybridMatch[1]);
    }
    const baseClean = raw.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    return cleanTeluguProductLabel(PRODUCT_TE_BY_NAME[baseClean] || raw);
  }
  if (language !== 'te') return product.name;
  const te = product.nameTe?.trim() || PRODUCT_TE_BY_ID[product.id] || PRODUCT_TE_BY_NAME[product.name.toLowerCase()];
  return cleanTeluguProductLabel(te || product.name);
}

export function translateCartProductName(
  rawProductName: string,
  productId: string | undefined,
  products: Product[],
  language: Language
): string {
  if (language !== 'te') {
    // If stored as "Name (తెలుగు)", strip trailing Telugu parenthetical in English mode
    const m = rawProductName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (m && /[\u0C00-\u0C7F]/.test(m[2])) {
      return m[1].trim();
    }
    return rawProductName;
  }
  const prod = productId ? products.find((p) => p.id === productId) : undefined;
  return translateProductName(prod, 'te', rawProductName);
}

export function translateItemsSummary(
  summary: string | undefined,
  products: Product[],
  language: Language
): string {
  if (!summary) return '';
  if (language !== 'te') return summary;
  return summary
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      const match = trimmed.match(/^(.*?)(?:\s*\(([^)]+)\))?\s*(x\s*\d+(?:\.\d+)?)$/i);
      if (!match) return translateVariantLabel(trimmed, 'te');
      const [, rawName, rawVariant, qtyPart] = match;
      const cleanRaw = rawName.trim();
      const prod = products.find(
        (p) =>
          p.name.toLowerCase() === cleanRaw.toLowerCase() ||
          (p.nameTe && p.nameTe.toLowerCase() === cleanRaw.toLowerCase()) ||
          cleanRaw.toLowerCase().startsWith(p.name.toLowerCase() + ' (')
      );
      const tName = translateProductName(prod, 'te', cleanRaw);
      const tVar = rawVariant ? ` (${translateVariantLabel(rawVariant, 'te')})` : '';
      return `${tName}${tVar} ${qtyPart.replace(/^x/i, '×')}`;
    })
    .join(', ');
}

export function translateUnit(unit: string | undefined, language: Language): string {
  const clean = (unit || 'Piece').trim();
  if (language !== 'te') return clean;
  return UNIT_TE_MAP[clean.toLowerCase()] || clean;
}

export function translatePaymentMethod(method: string | undefined, language: Language): string {
  const clean = (method || '').trim();
  if (language !== 'te') return clean;
  return PAYMENT_METHOD_TE_MAP[clean] || clean;
}

export function translateStatus(status: string | undefined, language: Language): string {
  const clean = (status || '').trim();
  if (language !== 'te') return clean;
  return STATUS_TE_MAP[clean.toLowerCase()] || clean;
}

export function translateGstType(gstType: string | undefined, language: Language): string {
  if (language !== 'te') return gstType || 'NONE';
  switch (gstType) {
    case 'CGST_SGST':
      return 'సీజీఎస్టీ + ఎస్‌జీఎస్టీ';
    case 'IGST':
      return 'ఐజీఎస్టీ';
    case 'NONE':
    default:
      return 'జీఎస్టీ లేదు';
  }
}

export function translateDeviceName(deviceName: string | undefined, language: Language): string {
  const clean = (deviceName || '').trim();
  if (language !== 'te') return clean;
  return clean
    .replace(/Modern Browser/g, 'ఆధునిక బ్రౌజర్')
    .replace(/Microsoft Edge/g, 'మైక్రోసాఫ్ట్ ఎడ్జ్')
    .replace(/Google Chrome/g, 'గూగుల్ క్రోమ్')
    .replace(/Apple Safari/g, 'ఆపిల్ సఫారీ')
    .replace(/Mozilla Firefox/g, 'మొజిల్లా ఫైర్‌ఫాక్స్')
    .replace(/Web Client/g, 'వెబ్ పరికరం');
}

export function translateSystemText(text: string | undefined, language: Language): string {
  const clean = (text || '').trim();
  if (language !== 'te' || !clean) return clean;
  if (clean.startsWith('New Bill ')) {
    return clean.replace('New Bill ', 'కొత్త బిల్ ');
  }
  if (clean.startsWith('Payment Received · ')) {
    return clean.replace('Payment Received · ', 'చెల్లింపు అందింది · ');
  }
  if (clean.startsWith('Bill Cancelled · ')) {
    return clean.replace('Bill Cancelled · ', 'బిల్ రద్దు చేయబడింది · ');
  }
  if (clean.startsWith('Refund Recorded · ')) {
    return clean.replace('Refund Recorded · ', 'వాపసు నమోదైంది · ');
  }
  if (clean.startsWith('Low Stock Alert: ')) {
    return clean.replace('Low Stock Alert: ', 'తక్కువ స్టాక్ హెచ్చరిక: ');
  }
  if (clean === 'Business Profile Updated') {
    return 'వ్యాపార ప్రొఫైల్ నవీకరించబడింది';
  }
  if (clean.startsWith('New Customer: ')) {
    return clean.replace('New Customer: ', 'కొత్త కస్టమర్: ');
  }
  if (clean.startsWith('Sold offline via ')) {
    return clean.replace('Sold offline via ', 'ఆఫ్‌లైన్ అమ్మకం · బిల్ ');
  }
  if (clean.startsWith('Sold via ')) {
    return clean.replace('Sold via ', 'అమ్మకం · బిల్ ');
  }
  if (clean.startsWith('Restocked from cancelled bill ')) {
    return clean.replace('Restocked from cancelled bill ', 'రద్దు చేసిన బిల్ నుండి స్టాక్ తిరిగి చేరింది · ');
  }
  if (clean.startsWith('Initial payment for ')) {
    return clean.replace('Initial payment for ', 'ప్రారంభ చెల్లింపు · ');
  }
  if (clean.startsWith('Offline payment for ')) {
    return clean.replace('Offline payment for ', 'ఆఫ్‌లైన్ చెల్లింపు · ');
  }
  if (clean.startsWith('Paid due for ')) {
    return clean.replace('Paid due for ', 'బాకీ చెల్లింపు · ');
  }
  if (clean.startsWith('Manual ')) {
    return clean
      .replace('Manual restock', 'మాన్యువల్ స్టాక్ చేర్పు')
      .replace('Manual adjustment', 'మాన్యువల్ సర్దుబాటు')
      .replace('Manual return', 'మాన్యువల్ వాపసు');
  }
  if (clean.startsWith('Offline ')) {
    return clean
      .replace('Offline restock', 'ఆఫ్‌లైన్ స్టాక్ చేర్పు')
      .replace('Offline adjustment', 'ఆఫ్‌లైన్ సర్దుబాటు')
      .replace('Offline return', 'ఆఫ్‌లైన్ వాపసు');
  }
  if (clean.startsWith('Edited bill ')) {
    return clean.replace('Edited bill ', 'బిల్ సవరించబడింది ').replace(' by ', ' ద్వారా: ');
  }

  const billedMatch = clean.match(/^(.+?)\s+billed\s+(.+?)\s+for\s+₹([0-9.,]+)\s*\(([^)]+)\)\.?$/i);
  if (billedMatch) {
    const [, actor, cust, amt, st] = billedMatch;
    return `${actor} · ${translateCustomerName(cust, 'te')} కు ₹${amt} బిల్ చేయబడింది (${translateStatus(st, 'te')}).`;
  }

  const payMatch = clean.match(/^₹([0-9.,]+)\s+received via\s+(.+?)\s+from\s+(.+?)\.?$/i);
  if (payMatch) {
    const [, amt, method, cust] = payMatch;
    return `${translateCustomerName(cust, 'te')} నుండి ${translatePaymentMethod(method, 'te')} ద్వారా ₹${amt} అందింది.`;
  }

  const cancelMatch = clean.match(/^(.+?)\s+cancelled\s+([^\s.]+)\.\s*Reason:\s*(.+)$/i);
  if (cancelMatch) {
    const [, actor, billNo, reason] = cancelMatch;
    return `${actor} బిల్ ${billNo} ను రద్దు చేశారు. కారణం: ${reason}`;
  }

  const refundMatch = clean.match(/^₹([0-9.,]+)\s+refunded via\s+(.+?)\.\s*Reason:\s*(.+)$/i);
  if (refundMatch) {
    const [, amt, method, reason] = refundMatch;
    return `${translatePaymentMethod(method, 'te')} ద్వారా ₹${amt} వాపసు చేయబడింది. కారణం: ${reason}`;
  }

  const lowStockMatch = clean.match(/^Remaining stock is\s+(-?\d+(?:\.\d+)?)\s+(.+?)\s+after\s+([^\s.]+)\.?$/i);
  if (lowStockMatch) {
    const [, qty, unit, billNo] = lowStockMatch;
    return `బిల్ ${billNo} తర్వాత మిగిలిన స్టాక్: ${qty} ${translateUnit(unit, 'te')}.`;
  }

  const custMatch = clean.match(/^(.+?)\s+registered customer\s+(.+?)\.?$/i);
  if (custMatch) {
    const [, actor, cust] = custMatch;
    return `${actor} కొత్త కస్టమర్ ${cust} ను నమోదు చేశారు.`;
  }

  const bizUpdMatch = clean.match(/^(.+?)\s+updated business configuration\.?$/i);
  if (bizUpdMatch) {
    return `${bizUpdMatch[1]} వ్యాపార సెట్టింగ్స్‌ను నవీకరించారు.`;
  }

  return clean
    .replace(/\bWalk-in Customer\b/gi, TELUGU_WALKIN_CUSTOMER)
    .replace(/\bCash Sale\b/gi, 'నగదు అమ్మకం')
    .replace(/\bUPI\b/g, 'యూపీఐ')
    .replace(/\bCash\b/gi, 'నగదు')
    .replace(/\bBank Transfer\b/gi, 'బ్యాంక్ బదిలీ');
}

export function getCopyrightNoticeLocalized(businessName?: string | null, language: Language = 'en'): string {
  const year = new Date().getFullYear();
  if (language === 'te') {
    const owner = translateBusinessName(businessName, 'te');
    return `© ${year} ${owner}. సర్వ హక్కులు ప్రత్యేకించబడినవి.`;
  }
  const owner = (businessName || '').trim() || 'Sri Lakshmi Penchil Narasimha Swamy Cement Work';
  return `© ${year} ${owner}. All Rights Reserved.`;
}
