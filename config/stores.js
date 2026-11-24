/**
 * Catálogo oficial de tiendas en Perú soportadas por ChapaAlToque PE.
 * Cada tienda especifica su motor de extracción público (VTEX, Falabella SSR,
 * PrestaShop JSON o Magento HTML), moneda nativa y tarjeta promocional.
 */
export const STORES = [
  // === Grupo Falabella (Next.js SSR __NEXT_DATA__) ===
  {
    id: 'falabella',
    name: 'Falabella',
    domain: 'www.falabella.com.pe',
    baseUrl: 'https://www.falabella.com.pe',
    searchPath: '/falabella-pe/search?Ntt=',
    engine: 'falabella',
    currency: 'PEN',
    cardName: 'CMR',
    accent: '#AAD500',
    badgeBg: '#ECFCCB',
    badgeText: '#3F6212',
    specialties: ['tecnologia', 'televisores', 'celulares', 'electro', 'gaming', 'deporte', 'hogar', 'belleza', 'moda'],
    enabled: true
  },
  {
    id: 'tottus',
    name: 'Tottus',
    domain: 'tottus.falabella.com.pe',
    baseUrl: 'https://tottus.falabella.com.pe',
    searchPath: '/tottus-pe/search?Ntt=',
    engine: 'falabella',
    currency: 'PEN',
    cardName: 'CMR',
    accent: '#76B82A',
    badgeBg: '#ECFDF5',
    badgeText: '#166534',
    specialties: ['televisores', 'electro', 'hogar', 'tecnologia', 'supermercado'],
    enabled: true
  },

  // === Retail & Supermercados VTEX Perú ===
  {
    id: 'plazavea',
    name: 'PlazaVea',
    domain: 'www.plazavea.com.pe',
    baseUrl: 'https://www.plazavea.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Tarjeta Oh!',
    accent: '#E30613',
    badgeBg: '#FEE2E2',
    badgeText: '#991B1B',
    specialties: ['tecnologia', 'televisores', 'celulares', 'electro', 'gaming', 'hogar', 'supermercado', 'moda'],
    enabled: true
  },
  {
    id: 'oechsle',
    name: 'Oechsle',
    domain: 'www.oechsle.pe',
    baseUrl: 'https://www.oechsle.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Tarjeta Oh!',
    accent: '#D91A2A',
    badgeBg: '#FFE4E6',
    badgeText: '#9F1239',
    specialties: ['tecnologia', 'televisores', 'celulares', 'electro', 'deporte', 'belleza', 'moda'],
    enabled: true
  },
  {
    id: 'promart',
    name: 'Promart',
    domain: 'www.promart.pe',
    baseUrl: 'https://www.promart.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Tarjeta Oh!',
    accent: '#F97316',
    badgeBg: '#FFEDD5',
    badgeText: '#9A3412',
    specialties: ['hogar', 'electro', 'tecnologia', 'deporte'],
    enabled: true
  },
  {
    id: 'wong',
    name: 'Wong',
    domain: 'www.wong.pe',
    baseUrl: 'https://www.wong.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Cencosud',
    accent: '#DC2626',
    badgeBg: '#FEF2F2',
    badgeText: '#B91C1C',
    specialties: ['televisores', 'electro', 'tecnologia', 'hogar', 'supermercado'],
    enabled: true
  },
  {
    id: 'metro',
    name: 'Metro',
    domain: 'www.metro.pe',
    baseUrl: 'https://www.metro.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Cencosud',
    accent: '#CA8A04',
    badgeBg: '#FEF9C3',
    badgeText: '#854D0E',
    specialties: ['televisores', 'electro', 'tecnologia', 'hogar', 'supermercado'],
    enabled: true
  },
  {
    id: 'coolbox',
    name: 'Coolbox',
    domain: 'www.coolbox.pe',
    baseUrl: 'https://www.coolbox.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#E11D48',
    badgeBg: '#FFF1F2',
    badgeText: '#BE123C',
    specialties: ['tecnologia', 'audio', 'celulares', 'gaming', 'televisores', 'deporte'],
    enabled: true
  },
  {
    id: 'carsa',
    name: 'Carsa',
    domain: 'www.carsa.pe',
    baseUrl: 'https://www.carsa.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#EA580C',
    badgeBg: '#FFEDD5',
    badgeText: '#C2410C',
    specialties: ['televisores', 'electro', 'audio', 'celulares', 'tecnologia'],
    enabled: true
  },
  {
    id: 'shopstar',
    name: 'Shopstar',
    domain: 'www.shopstar.pe',
    baseUrl: 'https://www.shopstar.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Interbank',
    accent: '#0284C7',
    badgeBg: '#E0F2FE',
    badgeText: '#075985',
    specialties: ['tecnologia', 'audio', 'celulares', 'electro', 'gaming', 'deporte', 'moda'],
    enabled: true
  },
  {
    id: 'estilos',
    name: 'Estilos',
    domain: 'www.estilos.com.pe',
    baseUrl: 'https://www.estilos.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Tarjeta Estilos',
    accent: '#B91C1C',
    badgeBg: '#FEE2E2',
    badgeText: '#991B1B',
    specialties: ['televisores', 'electro', 'celulares', 'hogar', 'moda'],
    enabled: true
  },

  // === Tiendas Oficiales de Marca & Especializadas VTEX Perú ===
  {
    id: 'sony',
    name: 'Sony Store PE',
    domain: 'store.sony.com.pe',
    baseUrl: 'https://store.sony.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#0F172A',
    badgeBg: '#E2E8F0',
    badgeText: '#0F172A',
    specialties: ['audio', 'televisores', 'gaming'],
    enabled: true
  },
  {
    id: 'mi_oficial',
    name: 'Xiaomi Oficial',
    domain: 'www.mi.com',
    baseUrl: 'https://www.mi.com/pe',
    engine: 'mi_official',
    currency: 'PEN',
    cardName: null,
    accent: '#FF6900',
    badgeBg: '#FFEDD5',
    badgeText: '#9A3412',
    specialties: ['celulares', 'televisores', 'audio', 'tecnologia', 'electro', 'hogar', 'deporte', 'belleza'],
    enabled: true
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi QTC (Mi Store)',
    domain: 'xiaomi.qtc.pe',
    baseUrl: 'https://xiaomi.qtc.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#EA580C',
    badgeBg: '#FFF7ED',
    badgeText: '#9A3412',
    specialties: ['celulares', 'audio', 'electro', 'tecnologia', 'deporte'],
    enabled: true
  },
  {
    id: 'triathlon',
    name: 'Triathlon Sport',
    domain: 'www.triathlon.com.pe',
    baseUrl: 'https://www.triathlon.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#0369A1',
    badgeBg: '#E0F2FE',
    badgeText: '#0C4A6E',
    specialties: ['deporte'],
    enabled: true
  },
  {
    id: 'footloose',
    name: 'Footloose',
    domain: 'www.footloose.pe',
    baseUrl: 'https://www.footloose.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#334155',
    badgeBg: '#F1F5F9',
    badgeText: '#1E293B',
    specialties: ['deporte'],
    enabled: true
  },
  {
    id: 'casaideas',
    name: 'Casaideas',
    domain: 'www.casaideas.com.pe',
    baseUrl: 'https://www.casaideas.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#0D9488',
    badgeBg: '#CCFBF1',
    badgeText: '#115E59',
    specialties: ['hogar'],
    enabled: true
  },
  {
    id: 'aruma',
    name: 'Aruma',
    domain: 'www.aruma.pe',
    baseUrl: 'https://www.aruma.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#BE185D',
    badgeBg: '#FCE7F3',
    badgeText: '#831843',
    specialties: ['belleza'],
    enabled: true
  },
  {
    id: 'oster',
    name: 'Oster Perú',
    domain: 'www.oster.com.pe',
    baseUrl: 'https://www.oster.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#C8102E',
    badgeBg: '#FEE2E2',
    badgeText: '#991B1B',
    specialties: ['electro', 'hogar'],
    enabled: true
  },
  {
    id: 'electrolux',
    name: 'Electrolux Perú',
    domain: 'www.electrolux.com.pe',
    baseUrl: 'https://www.electrolux.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#041E50',
    badgeBg: '#DBEAFE',
    badgeText: '#1E3A8A',
    specialties: ['electro', 'hogar'],
    enabled: true
  },
  {
    id: 'paraiso',
    name: 'Paraíso Perú',
    domain: 'www.paraiso-peru.com',
    baseUrl: 'https://www.paraiso-peru.com',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#1D4ED8',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    specialties: ['hogar'],
    enabled: true
  },
  {
    id: 'makro',
    name: 'Makro Perú',
    domain: 'www.makro.plazavea.com.pe',
    baseUrl: 'https://www.makro.plazavea.com.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: 'Tarjeta Oh!',
    accent: '#DC2626',
    badgeBg: '#FEE2E2',
    badgeText: '#991B1B',
    specialties: ['supermercado', 'electro', 'hogar'],
    enabled: true
  },
  {
    id: 'cassinelli',
    name: 'Cassinelli',
    domain: 'www.cassinelli.com',
    baseUrl: 'https://www.cassinelli.com',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#B45309',
    badgeBg: '#FEF3C7',
    badgeText: '#92400E',
    specialties: ['hogar', 'electro'],
    enabled: true
  },
  {
    id: 'topitop',
    name: 'Topitop',
    domain: 'www.topitop.pe',
    baseUrl: 'https://www.topitop.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#111827',
    badgeBg: '#F3F4F6',
    badgeText: '#111827',
    specialties: ['moda'],
    enabled: true
  },
  {
    id: 'renzocosta',
    name: 'Renzo Costa',
    domain: 'www.renzocosta.com',
    baseUrl: 'https://www.renzocosta.com',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#78350F',
    badgeBg: '#FEF3C7',
    badgeText: '#78350F',
    specialties: ['moda'],
    enabled: true
  },
  {
    id: 'miniso',
    name: 'Miniso Perú',
    domain: 'www.miniso.pe',
    baseUrl: 'https://www.miniso.pe',
    engine: 'vtex',
    currency: 'PEN',
    cardName: null,
    accent: '#E11D48',
    badgeBg: '#FFE4E6',
    badgeText: '#9F1239',
    specialties: ['hogar', 'moda', 'audio', 'belleza'],
    enabled: true
  },

  // === Electro & Retail Magento Perú ===
  {
    id: 'hiraoka',
    name: 'Hiraoka',
    domain: 'hiraoka.com.pe',
    baseUrl: 'https://hiraoka.com.pe',
    engine: 'magento',
    useCategoryPages: true,
    categoryPages: [
      { path: '/televisores', category: 'televisores' },
      { path: '/computo-y-tablets', category: 'tecnologia' },
      { path: '/celulares-y-telefonia', category: 'celulares' },
      { path: '/electrodomesticos', category: 'electro' },
      { path: '/electrohogar', category: 'electro' },
      { path: '/gaming', category: 'gaming' },
      { path: '/audio-y-musica', category: 'audio' },
      { path: '/camaras-y-drones', category: 'tecnologia' },
      { path: '/climatizacion', category: 'electro' },
      { path: '/dormitorio', category: 'hogar' }
    ],
    currency: 'PEN',
    cardName: null,
    accent: '#1D4ED8',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    specialties: ['televisores', 'electro', 'tecnologia', 'audio', 'celulares', 'gaming', 'hogar'],
    enabled: true
  },
  {
    id: 'tailoy',
    name: 'Tai Loy',
    domain: 'www.tailoy.com.pe',
    baseUrl: 'https://www.tailoy.com.pe',
    engine: 'magento',
    currency: 'PEN',
    cardName: null,
    accent: '#15803D',
    badgeBg: '#DCFCE7',
    badgeText: '#166534',
    specialties: ['tecnologia', 'gaming', 'hogar', 'moda'],
    enabled: true
  },

  // === Tiendas Especializadas de PC / Tecnología Perú (PrestaShop JSON) ===
  {
    id: 'infotec',
    name: 'Infotec Perú',
    domain: 'infotec.com.pe',
    baseUrl: 'https://infotec.com.pe',
    engine: 'prestashop',
    currency: 'PEN',
    cardName: null,
    accent: '#0284C7',
    badgeBg: '#E0F2FE',
    badgeText: '#0369A1',
    specialties: ['tecnologia', 'gaming', 'audio'],
    enabled: true
  },
  {
    id: 'sercoplus',
    name: 'Sercoplus',
    domain: 'www.sercoplus.com',
    baseUrl: 'https://www.sercoplus.com',
    engine: 'prestashop',
    currency: 'USD',
    cardName: null,
    accent: '#0F766E',
    badgeBg: '#CCFBF1',
    badgeText: '#115E59',
    specialties: ['tecnologia', 'gaming'],
    enabled: false
  },
  {
    id: 'cyccomputer',
    name: 'CyC Computer',
    domain: 'cyccomputer.pe',
    baseUrl: 'https://cyccomputer.pe',
    engine: 'prestashop',
    currency: 'USD',
    cardName: null,
    accent: '#2563EB',
    badgeBg: '#DBEAFE',
    badgeText: '#1E3A8A',
    specialties: ['tecnologia', 'gaming'],
    enabled: true
  }
];

export const STORE_MAP = Object.fromEntries(STORES.map((s) => [s.id, s]));

export function detectStoreFromUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return (
      STORES.find(
        (s) => hostname === s.domain || hostname.endsWith('.' + s.domain.replace(/^www\./, '')) || hostname === s.domain.replace(/^www\./, '')
      ) || null
    );
  } catch {
    return null;
  }
}

export const CATEGORIES = [
  { id: 'tecnologia', label: 'Laptops & PC' },
  { id: 'televisores', label: 'Televisores' },
  { id: 'celulares', label: 'Celulares' },
  { id: 'audio', label: 'Audio' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'electro', label: 'Electrodomésticos' },
  { id: 'hogar', label: 'Hogar & Ferretería' },
  { id: 'deporte', label: 'Deporte & Movilidad' },
  { id: 'moda', label: 'Moda & Viajes' },
  { id: 'belleza', label: 'Belleza & Cuidado' },
  { id: 'supermercado', label: 'Supermercado & Licores' },
  { id: 'personal', label: 'Mi Seguimiento' }
];
