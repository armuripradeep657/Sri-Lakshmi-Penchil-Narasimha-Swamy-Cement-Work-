import { Product } from '../types/billing';

function makeSvgDataUrl(bg: string, accent: string, shapeSvg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="#E2E8F0"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="16" fill="url(#g)"/>
    <circle cx="96" cy="24" r="20" fill="${accent}" opacity="0.12"/>
    ${shapeSvg}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const THUMBNAILS = {
  darwaja: makeSvgDataUrl(
    '#EFF6FF',
    '#1D4ED8',
    `<rect x="30" y="16" width="60" height="88" rx="4" fill="#94A3B8" stroke="#334155" stroke-width="3"/>
     <rect x="40" y="26" width="40" height="78" fill="#F8FAFC" stroke="#475569" stroke-width="2"/>
     <line x1="30" y1="104" x2="90" y2="104" stroke="#1E293B" stroke-width="4"/>`
  ),
  kodadaDarwaja: makeSvgDataUrl(
    '#EEF2FF',
    '#0B1F44',
    `<rect x="26" y="14" width="68" height="92" rx="5" fill="#64748B" stroke="#1E293B" stroke-width="3"/>
     <rect x="36" y="24" width="48" height="82" fill="#E2E8F0" stroke="#334155" stroke-width="2"/>
     <path d="M36 38 Q60 22 84 38" fill="none" stroke="#0B1F44" stroke-width="3"/>
     <rect x="44" y="42" width="14" height="56" rx="2" fill="#CBD5E1" stroke="#475569" stroke-width="1.5"/>
     <rect x="62" y="42" width="14" height="56" rx="2" fill="#CBD5E1" stroke="#475569" stroke-width="1.5"/>`
  ),
  ketikilu: makeSvgDataUrl(
    '#F0F9FF',
    '#0284C7',
    `<rect x="22" y="22" width="76" height="76" rx="4" fill="#94A3B8" stroke="#334155" stroke-width="3"/>
     <rect x="30" y="30" width="60" height="60" fill="#F8FAFC" stroke="#475569" stroke-width="2"/>
     <line x1="50" y1="30" x2="50" y2="90" stroke="#475569" stroke-width="3"/>
     <line x1="70" y1="30" x2="70" y2="90" stroke="#475569" stroke-width="3"/>
     <line x1="30" y1="50" x2="90" y2="50" stroke="#475569" stroke-width="3"/>
     <line x1="30" y1="70" x2="90" y2="70" stroke="#475569" stroke-width="3"/>`
  ),
  ventilator: makeSvgDataUrl(
    '#F1F5F9',
    '#0B1F44',
    `<rect x="22" y="26" width="76" height="68" rx="5" fill="#94A3B8" stroke="#334155" stroke-width="3"/>
     <rect x="30" y="34" width="60" height="52" fill="#E2E8F0"/>
     <line x1="32" y1="44" x2="88" y2="44" stroke="#334155" stroke-width="4"/>
     <line x1="32" y1="56" x2="88" y2="56" stroke="#334155" stroke-width="4"/>
     <line x1="32" y1="68" x2="88" y2="68" stroke="#334155" stroke-width="4"/>
     <line x1="32" y1="80" x2="88" y2="80" stroke="#334155" stroke-width="4"/>`
  ),
  adjustFan: makeSvgDataUrl(
    '#ECFEFF',
    '#06B6D4',
    `<circle cx="60" cy="60" r="40" fill="#94A3B8" stroke="#334155" stroke-width="4"/>
     <circle cx="60" cy="60" r="30" fill="#E2E8F0" stroke="#475569" stroke-width="2"/>
     <line x1="34" y1="48" x2="86" y2="48" stroke="#334155" stroke-width="4"/>
     <line x1="30" y1="60" x2="90" y2="60" stroke="#334155" stroke-width="4"/>
     <line x1="34" y1="72" x2="86" y2="72" stroke="#334155" stroke-width="4"/>`
  ),
  tulasikota: makeSvgDataUrl(
    '#ECFDF5',
    '#10B981',
    `<rect x="32" y="84" width="56" height="16" rx="3" fill="#94A3B8" stroke="#334155" stroke-width="2.5"/>
     <rect x="40" y="48" width="40" height="36" rx="2" fill="#CBD5E1" stroke="#334155" stroke-width="2.5"/>
     <path d="M36 48 Q60 28 84 48 Z" fill="#94A3B8" stroke="#334155" stroke-width="2.5"/>
     <circle cx="60" cy="34" r="7" fill="#16A34A"/>
     <circle cx="53" cy="39" r="5" fill="#22C55E"/>
     <circle cx="67" cy="39" r="5" fill="#22C55E"/>`
  ),
  wellLid: makeSvgDataUrl(
    '#F8FAFC',
    '#475569',
    `<circle cx="60" cy="60" r="40" fill="#64748B" stroke="#1E293B" stroke-width="3.5"/>
     <circle cx="60" cy="60" r="30" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="6 4"/>
     <rect x="48" y="54" width="24" height="12" rx="3" fill="#334155"/>`
  ),
  wellRing: makeSvgDataUrl(
    '#F1F5F9',
    '#1D4ED8',
    `<ellipse cx="60" cy="36" rx="36" ry="12" fill="#CBD5E1" stroke="#334155" stroke-width="3"/>
     <path d="M24 36 L24 84 A36 12 0 0 0 96 84 L96 36" fill="#94A3B8" stroke="#334155" stroke-width="3"/>
     <ellipse cx="60" cy="36" rx="24" ry="7" fill="#475569"/>`
  ),
  slab: makeSvgDataUrl(
    '#EFF6FF',
    '#1D4ED8',
    `<polygon points="20,66 56,42 100,56 64,84" fill="#CBD5E1" stroke="#334155" stroke-width="3"/>
     <polygon points="20,66 64,84 64,94 20,76" fill="#94A3B8" stroke="#334155" stroke-width="2.5"/>
     <polygon points="64,84 100,56 100,66 64,94" fill="#64748B" stroke="#334155" stroke-width="2.5"/>`
  ),
  pole: makeSvgDataUrl(
    '#F8FAFC',
    '#0B1F44',
    `<rect x="46" y="14" width="12" height="92" rx="2" fill="#94A3B8" stroke="#334155" stroke-width="2.5"/>
     <rect x="66" y="24" width="12" height="82" rx="2" fill="#CBD5E1" stroke="#334155" stroke-width="2.5"/>
     <line x1="26" y1="104" x2="96" y2="104" stroke="#1E293B" stroke-width="4"/>
     <line x1="30" y1="50" x2="90" y2="50" stroke="#64748B" stroke-width="2" stroke-dasharray="4 3"/>`
  ),
};

export function getDefaultProductImage(nameOrCode?: string, category?: string): string {
  const key = `${nameOrCode || ''} ${category || ''}`.toLowerCase();
  if (key.includes('kodada') && key.includes('darwaja')) return THUMBNAILS.kodadaDarwaja;
  if (key.includes('darwaja')) return THUMBNAILS.darwaja;
  if (key.includes('ketikilu') || key.includes('ketikelu') || key.includes('window')) return THUMBNAILS.ketikilu;
  if (key.includes('adjust fan') || key.includes('exhaust')) return THUMBNAILS.adjustFan;
  if (key.includes('ventilator')) return THUMBNAILS.ventilator;
  if (key.includes('tulasikota')) return THUMBNAILS.tulasikota;
  if (key.includes('galulu') || key.includes('lid')) return THUMBNAILS.wellLid;
  if (key.includes('gagulu') || key.includes('ring')) return THUMBNAILS.wellRing;
  if (key.includes('selupu') || key.includes('slab')) return THUMBNAILS.slab;
  if (key.includes('gunjalu') || key.includes('fencing') || key.includes('pole')) return THUMBNAILS.pole;
  return THUMBNAILS.slab;
}

export function resolveProductImage(
  product?: Partial<Product> | null,
  fallbackName?: string,
  fallbackCategory?: string
): string {
  if (product?.imageUrl && product.imageUrl.trim()) {
    return product.imageUrl.trim();
  }
  return getDefaultProductImage(product?.name || fallbackName, product?.category || fallbackCategory);
}
