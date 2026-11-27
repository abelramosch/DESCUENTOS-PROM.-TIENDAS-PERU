import { formatPen, renderHistoryChart, renderSparkline } from './chart.js?v=20261127';

const LOCAL_WATCHLIST_KEY = 'chapaaltoque_pe_watchlist_v1';
const LEGACY_WATCHLIST_KEYS = ['nadamenos_pe_watchlist_v1', 'precioreal_pe_watchlist_v1'];
const THEME_KEY = 'chapaaltoque_pe_theme';
const GH_TOKEN_KEY = 'chapaaltoque_pe_gh_token';
const LEGACY_GH_TOKEN_KEY = 'nadamenos_pe_gh_token';
const ADMIN_MODE_KEY = 'chapaaltoque_pe_admin_v1';
const WORKFLOW_FILE = 'daily-scrape.yml';
const DEFAULT_GH_REPO = { owner: 'abelramosch', repo: 'chapaaltoque' };

function detectGitHubRepo() {
  try {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.github.io')) {
      const owner = host.slice(0, -'.github.io'.length);
      const seg = window.location.pathname.split('/').filter(Boolean)[0];
      if (owner && seg) return { owner, repo: seg };
    }
  } catch {
    // fallback below
  }
  return DEFAULT_GH_REPO;
}

const GH_REPO = detectGitHubRepo();
const GENERIC_BRAND_KEY = '__generic__';

/**
 * Marcas más conocidas en el mercado peruano (normalizadas).
 * Cualquier marca fuera de esta lista (o sin marca / "Genérico" / "Varios")
 * se agrupa automáticamente en "Marcas genéricas".
 */
const KNOWN_BRAND_ALIASES = {
  // Tech, Laptops, PC & Componentes
  samsung: 'Samsung',
  apple: 'Apple',
  lenovo: 'Lenovo',
  hp: 'HP',
  'hewlett packard': 'HP',
  asus: 'Asus',
  acer: 'Acer',
  dell: 'Dell',
  msi: 'MSI',
  gigabyte: 'Gigabyte',
  asrock: 'ASRock',
  amd: 'AMD',
  intel: 'Intel',
  nvidia: 'Nvidia',
  kingston: 'Kingston',
  'western digital': 'Western Digital',
  wd: 'Western Digital',
  sandisk: 'SanDisk',
  seagate: 'Seagate',
  crucial: 'Crucial',
  corsair: 'Corsair',
  logitech: 'Logitech',
  razer: 'Razer',
  hyperx: 'HyperX',
  redragon: 'Redragon',
  deepcool: 'DeepCool',
  teros: 'Teros',
  halion: 'Halion',
  'tp-link': 'TP-Link',
  'tp link': 'TP-Link',
  tplink: 'TP-Link',
  ugreen: 'Ugreen',
  anker: 'Anker',
  epson: 'Epson',
  canon: 'Canon',
  amazon: 'Amazon',
  google: 'Google',
  gopro: 'GoPro',
  lego: 'LEGO',

  // TV, Audio & Gaming
  lg: 'LG',
  sony: 'Sony',
  tcl: 'TCL',
  hisense: 'Hisense',
  philips: 'Philips',
  panasonic: 'Panasonic',
  jvc: 'JVC',
  hyundai: 'Hyundai',
  jbl: 'JBL',
  bose: 'Bose',
  sennheiser: 'Sennheiser',
  skullcandy: 'Skullcandy',
  marshall: 'Marshall',
  beats: 'Beats',
  harman: 'Harman Kardon',
  'harman kardon': 'Harman Kardon',
  nintendo: 'Nintendo',
  playstation: 'PlayStation',
  ps5: 'PlayStation',
  xbox: 'Xbox',

  // Celulares
  xiaomi: 'Xiaomi',
  redmi: 'Xiaomi',
  poco: 'Xiaomi',
  motorola: 'Motorola',
  honor: 'Honor',
  huawei: 'Huawei',
  oppo: 'Oppo',
  realme: 'Realme',
  vivo: 'Vivo',
  nokia: 'Nokia',

  // Electrodomésticos & Hogar Perú
  oster: 'Oster',
  electrolux: 'Electrolux',
  mabe: 'Mabe',
  indurama: 'Indurama',
  imaco: 'Imaco',
  thomas: 'Thomas',
  taurus: 'Taurus',
  miray: 'Miray',
  delonghi: 'DeLonghi',
  "de'longhi": 'DeLonghi',
  ninja: 'Ninja',
  irobot: 'iRobot',
  dreame: 'Dreame',
  bosch: 'Bosch',
  whirlpool: 'Whirlpool',
  frigidaire: 'Frigidaire',
  coldex: 'Coldex',
  daewoo: 'Daewoo',
  kitchenaid: 'KitchenAid',
  karcher: 'Kärcher',
  dewalt: 'DeWalt',
  makita: 'Makita',
  stanley: 'Stanley',
  'black+decker': 'Black+Decker',
  'black & decker': 'Black+Decker',
  'black and decker': 'Black+Decker',
  paraiso: 'Paraíso',
  rosen: 'Rosen',
  drimer: 'Drimer',
  casaideas: 'Casaideas',

  // Deporte & Calzado
  adidas: 'Adidas',
  nike: 'Nike',
  puma: 'Puma',
  reebok: 'Reebok',
  'new balance': 'New Balance',
  asics: 'Asics',
  skechers: 'Skechers',
  'under armour': 'Under Armour',
  converse: 'Converse',
  vans: 'Vans',
  hoka: 'Hoka',
  umbro: 'Umbro',
  fila: 'Fila',
  salomon: 'Salomon',
  caterpillar: 'Caterpillar',
  cat: 'Caterpillar',

  // Perfumes & Belleza
  'carolina herrera': 'Carolina Herrera',
  'paco rabanne': 'Paco Rabanne',
  rabanne: 'Paco Rabanne',
  'calvin klein': 'Calvin Klein',
  dior: 'Dior',
  versace: 'Versace',
  'hugo boss': 'Hugo Boss',
  boss: 'Hugo Boss',
  'giorgio armani': 'Giorgio Armani',
  armani: 'Giorgio Armani',
  lancome: 'Lancôme',
  'yves saint laurent': 'Yves Saint Laurent',
  'jean paul gaultier': 'Jean Paul Gaultier',
  lattafa: 'Lattafa',
  'ariana grande': 'Ariana Grande',
  'ralph lauren': 'Ralph Lauren',
  lacoste: 'Lacoste',
  givenchy: 'Givenchy',
  burberry: 'Burberry',
  bulgari: 'Bvlgari',
  bvlgari: 'Bvlgari',
  moschino: 'Moschino',
  nautica: 'Nautica',
  antonio: 'Antonio Banderas',
  'antonio banderas': 'Antonio Banderas',
  remington: 'Remington',
  babyliss: 'BaByliss',
  wahl: 'Wahl',
  gama: 'GA.MA',
  'ga.ma': 'GA.MA',
  dyson: 'Dyson',

  // Hogar, Cocina, Moda, Viaje & Supermercado Perú
  rotoplas: 'Rotoplas',
  sole: 'Sole',
  record: 'Record',
  tramontina: 'Tramontina',
  imusa: 'Imusa',
  brother: 'Brother',
  topitop: 'Topitop',
  'renzo costa': 'Renzo Costa',
  miniso: 'Miniso',
  samsonite: 'Samsonite',
  totto: 'Totto',
  porta: 'Porta',
  segway: 'Segway',
  ninebot: 'Segway',
  monark: 'Monark',
  oxford: 'Oxford',
  'johnnie walker': 'Johnnie Walker',
  chivas: 'Chivas Regal',
  'chivas regal': 'Chivas Regal',
  baileys: 'Baileys',
  altomayo: 'Altomayo',
  nescafe: 'Nescafé',
  ricocan: 'Ricocan',
  canbo: 'Canbo',
  pedigree: 'Pedigree',
  purina: 'Purina'
};

function normalizeBrandText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_BRAND_PATTERNS = Object.entries(KNOWN_BRAND_ALIASES)
  .filter(([alias]) => alias.length >= 3 && alias !== 'cat' && alias !== 'antonio')
  .sort((a, b) => b[0].length - a[0].length)
  .map(([alias, canonical]) => ({
    regex: new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i'),
    canonical
  }));

function resolveProductBrand(product) {
  const normRaw = normalizeBrandText(product.brand);
  if (normRaw && KNOWN_BRAND_ALIASES[normRaw]) {
    const label = KNOWN_BRAND_ALIASES[normRaw];
    return { key: normalizeBrandText(label), label, isKnown: true };
  }

  // Try matching partial known alias inside raw brand (e.g. "LG ELECTRONICS", "SONY PERU")
  if (normRaw && normRaw !== 'generico' && normRaw !== 'varios' && normRaw !== 'sin marca') {
    for (const { regex, canonical } of TITLE_BRAND_PATTERNS) {
      if (regex.test(normRaw)) {
        return { key: normalizeBrandText(canonical), label: canonical, isKnown: true };
      }
    }
  }

  // Fallback: infer well-known brand from product title if raw brand was blank
  if (!normRaw || normRaw === 'sin marca') {
    const normTitle = normalizeBrandText(product.title);
    for (const { regex, canonical } of TITLE_BRAND_PATTERNS) {
      if (regex.test(normTitle)) {
        return { key: normalizeBrandText(canonical), label: canonical, isKnown: true };
      }
    }
  }

  return { key: GENERIC_BRAND_KEY, label: 'Marcas genéricas', isKnown: false };
}

function enrichCatalogBrands(catalog) {
  for (const p of catalog) {
    const resolved = resolveProductBrand(p);
    p.brandKey = resolved.key;
    p.brandLabel = resolved.label;
    p.isKnownBrand = resolved.isKnown;
  }
}

const WALLET_CARDS_KEY = 'chapaaltoque_pe_cards_v1';

function loadUserCards() {
  try {
    const raw = JSON.parse(localStorage.getItem(WALLET_CARDS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveUserCards() {
  try {
    localStorage.setItem(WALLET_CARDS_KEY, JSON.stringify(state.userCards));
  } catch {
    // ignore
  }
}

function getUserPrice(p) {
  if (p.cardPrice && p.cardName && state.userCards.includes(p.cardName)) {
    return { price: Number(p.cardPrice), usingCard: true, cardName: p.cardName };
  }
  return { price: Number(p.price), usingCard: false, cardName: null };
}

const state = {
  mode: 'static', // 'server' or 'static'
  meta: null,
  catalog: [],
  groups: [],
  groupMap: {},
  groupsLoaded: false,
  groupsPromise: null,
  historyCache: {},
  historyLoaded: false,
  historyPromise: null,
  dataCacheBust: '',
  stores: [],
  storeMap: {},
  categories: [],
  watchlist: { urls: [], customQueries: [], starredIds: [], targetPrices: {} },
  userCards: loadUserCards(),
  storesCampaignFilter: 'all',
  isUpdating: false,
  ghPollTimer: null,

  // UI state
  activeTab: 'deals', // deals | bugazos | anticyber | groups | watchlist | live-search | stores
  viewMode: typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table',
  pageSize: 60,
  groupsQuery: '',
  filters: {
    search: '',
    category: 'all',
    store: 'all',
    brand: 'all',
    verdict: 'all',
    cyber: 'all',
    sort: 'featured',
    minPrice: '',
    maxPrice: '',
    inStockOnly: true
  },
  selectedProduct: null,
  selectedHistory: [],
  selectedGroup: null,
  chartRange: 'all'
};

function syncViewModeButtons() {
  document.querySelectorAll('#catalog-view-controls .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.viewMode);
  });
}

function applyModeUi() {
  const isServer = state.mode === 'server';

  const trackTopBtn = document.getElementById('open-track-modal-btn');
  if (trackTopBtn) trackTopBtn.hidden = !isServer;

  const trackWatchBtn = document.getElementById('watchlist-add-url-btn');
  if (trackWatchBtn) trackWatchBtn.hidden = !isServer;

  const liveTab = document.getElementById('tab-live-search');
  if (liveTab) liveTab.hidden = !isServer;
  if (!isServer && state.activeTab === 'live-search') {
    state.activeTab = 'deals';
  }

  const searchInput = document.getElementById('global-search-input');
  const searchBtn = document.getElementById('global-search-btn');
  if (searchInput) {
    searchInput.placeholder = isServer
      ? 'Buscar producto, marca o modelo (Enter para buscar en vivo en Perú)...'
      : 'Buscar producto, marca, modelo o tienda...';
  }
  if (searchBtn) {
    searchBtn.textContent = isServer ? 'En vivo' : 'Buscar';
    searchBtn.title = isServer ? 'Buscar en vivo en todas las tiendas' : 'Buscar en el catálogo';
  }

  const queriesTitle = document.getElementById('custom-queries-title');
  const queriesBtn = document.getElementById('add-query-submit-btn');
  if (queriesTitle) {
    queriesTitle.textContent = isServer ? 'Búsquedas automáticas diarias' : 'Búsquedas rápidas guardadas';
  }
  if (queriesBtn) {
    queriesBtn.textContent = isServer ? 'Vigilar cada día' : 'Guardar filtro';
  }

  const emptyDesc = document.getElementById('catalog-empty-desc');
  const emptyBtn = document.getElementById('empty-live-search-btn');
  if (emptyDesc) {
    emptyDesc.textContent = isServer
      ? 'Prueba quitando un filtro o busca el producto en vivo en las tiendas de Perú.'
      : 'Prueba quitando algún filtro o cambiando el término de búsqueda.';
  }
  if (emptyBtn) {
    emptyBtn.textContent = isServer ? 'Buscar en vivo' : 'Limpiar filtros';
  }
}

function restoreStateFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const validTabs = new Set(['deals', 'bugazos', 'anticyber', 'groups', 'watchlist', 'live-search', 'stores']);
    const tab = params.get('tab');
    if (tab && validTabs.has(tab)) {
      state.activeTab = tab;
    }
    const q = params.get('q');
    if (q) state.filters.search = q;
    const cat = params.get('cat');
    if (cat) state.filters.category = cat;
    const store = params.get('store');
    if (store) state.filters.store = store;
    const brand = params.get('brand');
    if (brand) state.filters.brand = brand;
    const verdict = params.get('verdict');
    if (verdict) state.filters.verdict = verdict;
    const cyber = params.get('cyber');
    if (cyber && ['all', 'real_drop', 'cyber_trap'].includes(cyber)) state.filters.cyber = cyber;
    const sort = params.get('sort');
    const validSorts = new Set(['featured', 'score', 'real_discount', 'store_discount', 'drop_today', 'price_asc', 'price_desc']);
    if (sort && validSorts.has(sort)) state.filters.sort = sort;
    const min = params.get('min');
    if (min && Number(min) > 0) state.filters.minPrice = min;
    const max = params.get('max');
    if (max && Number(max) > 0) state.filters.maxPrice = max;
    if (params.get('stock') === 'all') state.filters.inStockOnly = false;
  } catch {
    // ignore invalid URL params
  }
}

function syncUrlWithState() {
  try {
    const url = new URL(window.location.href);
    const setOrDel = (k, val, defVal) => {
      if (val && val !== defVal) url.searchParams.set(k, String(val));
      else url.searchParams.delete(k);
    };
    setOrDel('tab', state.activeTab, 'deals');
    setOrDel('q', state.filters.search.trim(), '');
    setOrDel('cat', state.filters.category, 'all');
    setOrDel('store', state.filters.store, 'all');
    setOrDel('brand', state.filters.brand, 'all');
    setOrDel('verdict', state.filters.verdict, 'all');
    setOrDel('cyber', state.filters.cyber, 'all');
    setOrDel('sort', state.filters.sort, 'featured');
    setOrDel('min', state.filters.minPrice, '');
    setOrDel('max', state.filters.maxPrice, '');
    if (state.filters.inStockOnly) url.searchParams.delete('stock');
    else url.searchParams.set('stock', 'all');
    window.history.replaceState({}, '', url.toString());
  } catch {
    // ignore history errors
  }
}

function syncFilterInputsFromState() {
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) searchInput.value = state.filters.search;
  const clearSearchBtn = document.getElementById('global-search-clear-btn');
  if (clearSearchBtn) clearSearchBtn.hidden = !state.filters.search;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal('filter-store', state.filters.store);
  setVal('filter-brand', state.filters.brand);
  setVal('filter-verdict', state.filters.verdict);
  setVal('filter-sort', state.filters.sort);
  setVal('filter-min-price', state.filters.minPrice);
  setVal('filter-max-price', state.filters.maxPrice);

  const stockEl = document.getElementById('filter-in-stock');
  if (stockEl) stockEl.checked = state.filters.inStockOnly;

  document.querySelectorAll('#anticyber-subfilters .chip-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.cyber === state.filters.cyber);
  });
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const active = b.dataset.tab === state.activeTab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
}

// ============================================================================
// Bootstrap & Data Loading
// ============================================================================
async function init() {
  initTheme();
  syncViewModeButtons();
  restoreStateFromUrl();
  renderWalletCardsUi();
  bindEvents();
  await loadInitialData();
  applyModeUi();
  populateFilterOptions();
  syncFilterInputsFromState();
  renderAll();
  scheduleBackgroundPrefetch();

  // Auto-open shared product link (?p=<productId>)
  const sharedId = new URLSearchParams(window.location.search).get('p');
  if (sharedId && state.catalog.some((p) => p.id === sharedId)) {
    openProductDrawer(sharedId);
  } else {
    maybeStartFirstVisitTour();
  }
}

function renderWalletCardsUi() {
  document.querySelectorAll('#wallet-cards-chips .card-chip').forEach((btn) => {
    btn.classList.toggle('active', state.userCards.includes(btn.dataset.card));
  });
  const hint = document.getElementById('wallet-cards-hint');
  if (hint) {
    hint.textContent = state.userCards.length
      ? `Aplicando precios con: ${state.userCards.join(', ')}`
      : 'Mostrando precio internet (marca tus tarjetas para ver tu precio real)';
  }
}

async function ensureGroupsLoaded() {
  if (state.mode === 'server' || state.groupsLoaded) return state.groups;
  if (!state.groupsPromise) {
    const bust = state.dataCacheBust || `t=${Date.now()}`;
    state.groupsPromise = fetchJsonSafe(`./data/groups.json?${bust}`, []).then((groups) => {
      state.groups = Array.isArray(groups) ? groups : [];
      state.groupMap = Object.fromEntries(state.groups.map((g) => [g.groupId, g]));
      state.groupsLoaded = true;
      setText('badge-groups', state.groups.length);
      return state.groups;
    });
  }
  return state.groupsPromise;
}

async function ensureHistoryLoaded() {
  if (state.mode === 'server' || state.historyLoaded) return state.historyCache;
  if (!state.historyPromise) {
    const bust = state.dataCacheBust || `t=${Date.now()}`;
    state.historyPromise = fetchJsonSafe(`./data/history.json?${bust}`, {}).then((history) => {
      state.historyCache = history && typeof history === 'object' ? history : {};
      state.historyLoaded = true;
      return state.historyCache;
    });
  }
  return state.historyPromise;
}

function scheduleBackgroundPrefetch() {
  if (state.mode === 'server') return;
  const run = () => {
    ensureGroupsLoaded();
    ensureHistoryLoaded();
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1800);
  }
}

async function loadInitialData() {
  const cacheBust = `t=${Date.now()}`;
  state.dataCacheBust = cacheBust;
  try {
    const healthRes = await fetch(`/api/health?${cacheBust}`, { cache: 'no-store' });
    if (healthRes.ok) {
      state.mode = 'server';
      const dataRes = await fetch(`/api/catalog?${cacheBust}`, { cache: 'no-store' });
      const payload = await dataRes.json();
      state.meta = payload.meta;
      state.catalog = payload.catalog || [];
      state.groups = payload.groups || [];
      state.groupsLoaded = true;
      state.groupsPromise = null;
      state.historyLoaded = true;
      state.historyPromise = null;
      state.watchlist = payload.watchlist || state.watchlist;
      state.stores = payload.stores || [];
      state.categories = payload.categories || [];
    } else {
      throw new Error('Static fallback');
    }
  } catch {
    state.mode = 'static';
    state.groups = [];
    state.groupMap = {};
    state.groupsLoaded = false;
    state.groupsPromise = null;
    state.historyCache = {};
    state.historyLoaded = false;
    state.historyPromise = null;

    // Fetch only catalog + meta initially for fast First Contentful Paint;
    // groups.json and history.json load lazily on demand (and idle prefetch).
    const [catalog, meta] = await Promise.all([
      fetchJsonSafe(`./data/catalog.json?${cacheBust}`, []),
      fetchJsonSafe(`./data/meta.json?${cacheBust}`, {})
    ]);
    state.catalog = catalog;
    state.meta = meta;
    // En modo web pública (GitHub Pages), Mi Lista es 100% personal por navegador
    state.watchlist = loadLocalWatchlist();
    state.stores = Object.values(meta?.storesStatus || {}).map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain || '',
      baseUrl: s.baseUrl || '',
      engine: s.engine,
      currency: s.currency,
      badgeBg: s.badgeBg || '',
      badgeText: s.badgeText || '',
      enabled: s.enabled !== false
    }));
    state.categories = [
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
  }

  enrichCatalogBrands(state.catalog);
  state.storeMap = Object.fromEntries(state.stores.map((s) => [s.id, s]));
  state.groupMap = Object.fromEntries(state.groups.map((g) => [g.groupId, g]));
  populateFilterOptions();

  const footerMode = document.getElementById('footer-mode-info');
  if (footerMode) {
    footerMode.textContent =
      state.mode === 'server'
        ? `Servidor local activo · T.C. USD/PEN: S/ ${state.meta?.usdToPen || '3.75'}`
        : `Actualización automática cada ~2h (7:00 AM a 10:00 PM Lima) · Alertas en @chapaaltoque_pe`;
  }
}

async function fetchJsonSafe(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
}

function loadLocalWatchlist() {
  const empty = { urls: [], customQueries: [], starredIds: [], targetPrices: {} };
  try {
    const raw =
      localStorage.getItem(LOCAL_WATCHLIST_KEY) ||
      LEGACY_WATCHLIST_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ||
      'null';
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return empty;
    return {
      urls: Array.isArray(saved.urls) ? saved.urls : [],
      customQueries: Array.isArray(saved.customQueries) ? [...new Set(saved.customQueries)] : [],
      starredIds: Array.isArray(saved.starredIds) ? [...new Set(saved.starredIds)] : [],
      targetPrices: saved.targetPrices && typeof saved.targetPrices === 'object' ? { ...saved.targetPrices } : {}
    };
  } catch {
    return empty;
  }
}

function saveLocalWatchlist() {
  try {
    localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(state.watchlist));
  } catch {
    // ignore quota errors
  }
}

// ============================================================================
// Theme Toggle
// ============================================================================
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    sun.hidden = theme === 'dark';
    moon.hidden = theme === 'light';
  }
}

// ============================================================================
// Filter Population & Filtering Logic
// ============================================================================
function populateFilterOptions() {
  // Category chips (hide "Mi Seguimiento" when empty so visitors don't see a dead 0-item tab)
  const chipsEl = document.getElementById('category-chips');
  const catCounts = {};
  for (const p of state.catalog) {
    catCounts[p.category] = (catCounts[p.category] || 0) + 1;
  }
  const visibleCats = state.categories.filter(
    (c) => c.id !== 'personal' || (catCounts.personal || 0) > 0 || state.filters.category === 'personal'
  );
  const allCats = [{ id: 'all', label: 'Todas las categorías' }, ...visibleCats];
  chipsEl.innerHTML = allCats
    .map(
      (c) => `
      <button type="button" class="chip-btn ${state.filters.category === c.id ? 'active' : ''}" data-category="${c.id}">
        ${escapeHtml(c.label)}
      </button>
    `
    )
    .join('');

  // Store select
  const storeSelect = document.getElementById('filter-store');
  const storeCounts = {};
  for (const p of state.catalog) {
    storeCounts[p.storeId] = (storeCounts[p.storeId] || 0) + 1;
  }
  const activeStores = Object.entries(storeCounts).sort((a, b) => b[1] - a[1]);
  storeSelect.innerHTML =
    '<option value="all">Todas las tiendas (' + activeStores.length + ')</option>' +
    activeStores
      .map(([id, count]) => {
        const name = state.storeMap[id]?.name || id;
        return `<option value="${escapeHtml(id)}">${escapeHtml(name)} (${count})</option>`;
      })
      .join('');
  storeSelect.value = state.filters.store;

  populateBrandOptions();
}

function populateBrandOptions() {
  const brandSelect = document.getElementById('filter-brand');
  if (!brandSelect) return;

  // Scope brand counts to the currently selected store & category for crisp UX
  const scoped = state.catalog.filter((p) => {
    if (state.filters.store !== 'all' && p.storeId !== state.filters.store) return false;
    if (state.filters.category !== 'all' && p.category !== state.filters.category) return false;
    return true;
  });

  const knownCounts = new Map();
  let genericCount = 0;

  for (const p of scoped) {
    if (p.isKnownBrand) {
      const entry = knownCounts.get(p.brandKey) || { key: p.brandKey, label: p.brandLabel, count: 0 };
      entry.count += 1;
      knownCounts.set(p.brandKey, entry);
    } else {
      genericCount += 1;
    }
  }

  const sortedKnown = [...knownCounts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );

  let html = `<option value="all">Todas las marcas (${sortedKnown.length + (genericCount ? 1 : 0)})</option>`;
  if (sortedKnown.length) {
    html += '<optgroup label="Marcas reconocidas">';
    html += sortedKnown
      .map((b) => `<option value="${escapeHtml(b.key)}">${escapeHtml(b.label)} (${b.count})</option>`)
      .join('');
    html += '</optgroup>';
  }
  if (genericCount > 0) {
    html += `<optgroup label="Otras"><option value="${GENERIC_BRAND_KEY}">Marcas genéricas (${genericCount})</option></optgroup>`;
  }

  brandSelect.innerHTML = html;

  // Keep selected brand if still present in options; otherwise reset to all
  const validValues = new Set(['all', ...sortedKnown.map((b) => b.key)]);
  if (genericCount > 0) validValues.add(GENERIC_BRAND_KEY);
  if (!validValues.has(state.filters.brand)) {
    state.filters.brand = 'all';
  }
  brandSelect.value = state.filters.brand;
}

function getFamilySignature(p) {
  const base = String(p.title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^(de|del|la|las|el|los|en|con|para|por|y|hombre|hombres|mujer|mujeres|unisex|negro|negra|blanco|blanca|azul|rojo|gris|beige|hueso)$/.test(w))
    .slice(0, 3)
    .join(' ');
  return `${p.storeId}::${base || p.id}`;
}

function interleaveFeaturedProducts(scoreSortedList) {
  if (scoreSortedList.length <= 6) return scoreSortedList;

  const targetHead = Math.min(36, scoreSortedList.length);
  const head = [];
  const headIds = new Set();
  const seenFamily = new Set();
  const seenGroup = new Set();
  const storeCounts = new Map();
  const catCounts = new Map();

  // Only examine high-quality candidates first, then fall back to full list
  const candidatePool = scoreSortedList.slice(0, Math.min(600, scoreSortedList.length));

  const tryPick = (maxStore, maxCat, checkFamily) => {
    for (const p of candidatePool) {
      if (head.length >= targetHead) break;
      if (headIds.has(p.id)) continue;
      if (p.groupId && seenGroup.has(p.groupId)) continue;
      const fam = getFamilySignature(p);
      if (checkFamily && seenFamily.has(fam)) continue;
      if ((storeCounts.get(p.storeId) || 0) >= maxStore) continue;
      if ((catCounts.get(p.category) || 0) >= maxCat) continue;

      head.push(p);
      headIds.add(p.id);
      seenFamily.add(fam);
      if (p.groupId) seenGroup.add(p.groupId);
      storeCounts.set(p.storeId, (storeCounts.get(p.storeId) || 0) + 1);
      catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1);
    }
  };

  // Progressive diversity rounds: 1 per store & 1 per category first, then 2, then 3
  tryPick(1, 1, true);
  tryPick(1, 2, true);
  tryPick(2, 3, true);
  tryPick(2, 4, true);
  tryPick(3, 5, true);

  const rest = scoreSortedList.filter((p) => !headIds.has(p.id));
  return [...head, ...rest];
}

function getFilteredProducts() {
  const { search, category, store, brand, verdict, cyber, sort, minPrice, maxPrice, inStockOnly } = state.filters;
  const q = search.trim().toLowerCase();
  const minP = Number(minPrice) > 0 ? Number(minPrice) : 0;
  const maxP = Number(maxPrice) > 0 ? Number(maxPrice) : Infinity;

  let list = state.catalog.filter((p) => {
    if (inStockOnly && p.inStock === false) return false;

    if (state.activeTab === 'bugazos') {
      if (!p.stats.isBugazo) return false;
    } else if (state.activeTab === 'anticyber') {
      const isReal = p.stats.cyberStatus === 'real_drop' || p.stats.verdict === 'all_time_low';
      const isTrap = p.stats.cyberStatus === 'cyber_trap' || p.stats.isFakeDiscount || p.stats.listPriceInflated;
      if (cyber === 'real_drop' && !isReal) return false;
      if (cyber === 'cyber_trap' && !isTrap) return false;
      if (cyber === 'all' && !isReal && !isTrap) return false;
    }

    if (category !== 'all' && p.category !== category) return false;
    if (store !== 'all' && p.storeId !== store) return false;
    if (brand !== 'all' && p.brandKey !== brand) return false;

    const uPrice = getUserPrice(p).price;
    if (uPrice < minP || uPrice > maxP) return false;

    if (verdict === 'buy') {
      if (!['all_time_low', 'great_deal', 'good_deal'].includes(p.stats.verdict)) return false;
    } else if (verdict === 'bugazo') {
      if (!p.stats.isBugazo) return false;
    } else if (verdict === 'inflated') {
      if (p.stats.verdict !== 'inflated' && !p.stats.isFakeDiscount && !p.stats.listPriceInflated) return false;
    } else if (verdict !== 'all' && p.stats.verdict !== verdict) {
      return false;
    }

    if (q) {
      const hay = `${p.title} ${p.brand} ${p.brandLabel || ''} ${p.storeName} ${p.sku}`.toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      for (const t of terms) {
        if (!hay.includes(t)) return false;
      }
    }
    return true;
  });

  // Sort
  list.sort((a, b) => {
    if (state.activeTab === 'bugazos' && (sort === 'score' || sort === 'featured')) {
      const rank = (t) => (t === 'historical_crash' ? 3 : t === 'cross_store' ? 2 : 1);
      const diff = rank(b.stats.bugazoType) - rank(a.stats.bugazoType);
      if (diff !== 0) return diff;
    }
    switch (sort) {
      case 'real_discount':
        return (b.stats.fairDiscountPct ?? b.stats.realDiscountPct ?? 0) - (a.stats.fairDiscountPct ?? a.stats.realDiscountPct ?? 0);
      case 'store_discount':
        return (b.stats.storeDiscountPct || 0) - (a.stats.storeDiscountPct || 0);
      case 'drop_today':
        return (a.stats.delta24hPct || 0) - (b.stats.delta24hPct || 0) || (b.stats.dealScore || 0) - (a.stats.dealScore || 0);
      case 'price_asc':
        return getUserPrice(a).price - getUserPrice(b).price;
      case 'price_desc':
        return getUserPrice(b).price - getUserPrice(a).price;
      case 'featured':
      case 'score':
      default:
        return (
          (b.stats.dealScore || 0) - (a.stats.dealScore || 0) ||
          (b.stats.fairDiscountPct ?? 0) - (a.stats.fairDiscountPct ?? 0) ||
          (b.stats.realDiscountPct ?? 0) - (a.stats.realDiscountPct ?? 0)
        );
    }
  });

  if (sort === 'featured' && !q && store === 'all' && brand === 'all') {
    return interleaveFeaturedProducts(list);
  }

  return list;
}

// ============================================================================
// Rendering
// ============================================================================
function renderAll() {
  renderKpis();
  renderCampaignsStrip();
  renderActivePanel();
}

function renderCampaignsStrip() {
  const strip = document.getElementById('campaigns-strip');
  const row = document.getElementById('campaigns-chips-row');
  if (!strip || !row) return;

  const campaigns = Array.isArray(state.meta?.campaigns) ? state.meta.campaigns : [];
  if (!campaigns.length) {
    strip.hidden = true;
    return;
  }

  strip.hidden = false;
  setText('campaigns-count-badge', `${campaigns.length} tiendas`);

  row.innerHTML = campaigns
    .map((c) => {
      const isBlack = /black/i.test(c.primaryId || c.label || '');
      const promoText = c.maxPromoPct
        ? `${c.label} · hasta ${c.maxPromoPct}%`
        : c.avgDiscountPct >= 10
          ? `${c.label} · -${c.avgDiscountPct}%`
          : c.label;
      const tip = `${c.storeName}: ${c.label} — ${c.authenticityLabel} (${c.realDealsCount} ofertas reales de ${c.totalProducts} productos)`;
      return `
        <button type="button" class="campaign-chip ${isBlack ? 'is-black' : ''}" data-campaign-store="${escapeHtml(c.storeId)}" title="${escapeHtml(tip)}">
          <span class="campaign-chip-auth ${escapeHtml(c.authenticity || 'mixed')}" aria-hidden="true"></span>
          <span>${c.emoji || '🔥'} ${escapeHtml(c.storeName)}</span>
          <span class="campaign-chip-tag mono">${escapeHtml(promoText)}</span>
        </button>
      `;
    })
    .join('');

  row.querySelectorAll('[data-campaign-store]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filters.store = btn.dataset.campaignStore;
      state.filters.brand = 'all';
      state.filters.verdict = 'all';
      const storeSel = document.getElementById('filter-store');
      const verdictSel = document.getElementById('filter-verdict');
      if (storeSel) storeSel.value = state.filters.store;
      if (verdictSel) verdictSel.value = 'all';
      populateBrandOptions();
      switchTab('deals');
    });
  });
}

function renderKpis() {
  const total = state.catalog.length;
  const activeStores = new Set(state.catalog.map((p) => p.storeId)).size;
  const worthBuying = state.catalog.filter((p) =>
    ['all_time_low', 'great_deal'].includes(p.stats.verdict)
  ).length;
  const droppedToday = state.catalog.filter(
    (p) => (p.stats.delta24hPct || 0) <= -3 || p.stats.verdict === 'all_time_low'
  ).length;
  const realDrops = state.catalog.filter(
    (p) => p.stats.cyberStatus === 'real_drop' || p.stats.verdict === 'all_time_low'
  ).length;
  const inflated = state.catalog.filter((p) => p.stats.cyberStatus === 'cyber_trap' || p.stats.isFakeDiscount || p.stats.listPriceInflated).length;
  const bugazos = state.catalog.filter((p) => p.stats.isBugazo).length;
  const antiCyberTotal = realDrops + inflated;

  setText('kpi-total', total.toLocaleString('es-PE'));
  setText('kpi-stores', activeStores);
  setText('kpi-deals', worthBuying.toLocaleString('es-PE'));
  setText('kpi-drops', droppedToday.toLocaleString('es-PE'));
  setText('kpi-inflated', inflated.toLocaleString('es-PE'));

  const groupsCount = state.groupsLoaded ? state.groups.length : (state.meta?.groupsCount || state.groups.length || 0);
  setText('badge-bugazos', bugazos);
  setText('badge-anticyber', antiCyberTotal);
  setText('badge-groups', groupsCount);
  setText('badge-watchlist', getWatchlistProducts().length);

  // Update Anti-Cyber subfilter chip counts
  const subCyber = document.getElementById('anticyber-subfilters');
  if (subCyber) {
    const btnAll = subCyber.querySelector('[data-cyber="all"]');
    const btnReal = subCyber.querySelector('[data-cyber="real_drop"]');
    const btnTrap = subCyber.querySelector('[data-cyber="cyber_trap"]');
    if (btnAll) btnAll.textContent = `Todos (${antiCyberTotal})`;
    if (btnReal) btnReal.textContent = `Ofertas reales (${realDrops})`;
    if (btnTrap) btnTrap.textContent = `Trampas / Inflados (${inflated})`;
  }

  const summary = document.getElementById('last-updated-summary');
  if (state.meta?.lastUpdatedAt) {
    const dt = new Date(state.meta.lastUpdatedAt);
    const formatted = dt.toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    summary.textContent = `Última actualización: ${formatted} · ${activeStores} tiendas activas · ${groupsCount} comparativas multi-tienda · T.C. S/ ${state.meta.usdToPen || '3.75'}`;
  } else {
    summary.textContent = 'Haz clic en "Actualizar hoy" para descargar los precios del día en Perú.';
  }
}

function renderActivePanel() {
  const isCatalog = ['deals', 'bugazos', 'anticyber'].includes(state.activeTab);
  document.getElementById('panel-catalog').hidden = !isCatalog;
  document.getElementById('catalog-view-controls').hidden = !isCatalog;
  document.getElementById('panel-groups').hidden = state.activeTab !== 'groups';
  document.getElementById('panel-watchlist').hidden = state.activeTab !== 'watchlist';
  document.getElementById('panel-live-search').hidden = state.activeTab !== 'live-search';
  document.getElementById('panel-stores').hidden = state.activeTab !== 'stores';

  if (isCatalog) renderCatalog();
  if (state.activeTab === 'groups') renderGroupsPanel();
  if (state.activeTab === 'watchlist') renderWatchlist();
  if (state.activeTab === 'stores') renderStoresPanel();
  syncUrlWithState();
}

function renderCatalog() {
  const banner = document.getElementById('catalog-mode-banner');
  const subCyber = document.getElementById('anticyber-subfilters');
  if (state.activeTab === 'bugazos') {
    banner.hidden = false;
    subCyber.hidden = true;
    setText('catalog-mode-title', '⚡ Detector de Bugazos Reales (Sin Precios Base Inflados)');
    setText(
      'catalog-mode-desc',
      'Solo incluye caídas verificadas ≥ 40% vs historial propio o precios ≥ 35% más baratos que la mediana real de otras tiendas peruanas con el mismo modelo.'
    );
  } else if (state.activeTab === 'anticyber') {
    banner.hidden = false;
    subCyber.hidden = false;
    setText('catalog-mode-title', '🕵️ Verificador Anti-Cyber y Precios Base Inflados');
    setText(
      'catalog-mode-desc',
      'Separa descuentos reales comprobados frente al mercado/historial de precios tachados inflados artificialmente antes o durante ofertas.'
    );
  } else {
    banner.hidden = true;
    subCyber.hidden = true;
  }

  const filtered = getFilteredProducts();
  const visible = filtered.slice(0, state.pageSize);
  const countLabel = `${filtered.length.toLocaleString('es-PE')} ${filtered.length === 1 ? 'producto' : 'productos'}`;

  setText('results-count', countLabel);
  setText('results-count-mobile', countLabel);

  const activeAdvancedCount =
    (state.filters.store !== 'all' ? 1 : 0) +
    (state.filters.brand !== 'all' ? 1 : 0) +
    (state.filters.verdict !== 'all' ? 1 : 0) +
    (state.filters.minPrice ? 1 : 0) +
    (state.filters.maxPrice ? 1 : 0) +
    (!state.filters.inStockOnly ? 1 : 0) +
    (state.userCards.length ? 1 : 0);

  const mobileBadge = document.getElementById('filters-active-badge');
  if (mobileBadge) {
    mobileBadge.hidden = activeAdvancedCount === 0;
    mobileBadge.textContent = String(activeAdvancedCount);
  }

  const hasFilters =
    Boolean(state.filters.search) ||
    state.filters.category !== 'all' ||
    state.filters.store !== 'all' ||
    state.filters.brand !== 'all' ||
    state.filters.verdict !== 'all' ||
    Boolean(state.filters.minPrice) ||
    Boolean(state.filters.maxPrice) ||
    !state.filters.inStockOnly;
  document.getElementById('clear-filters-btn').hidden = !hasFilters;

  syncUrlWithState();

  const emptyEl = document.getElementById('catalog-empty');
  const tableWrap = document.getElementById('products-table-wrap');
  const gridWrap = document.getElementById('products-grid-wrap');
  const loadMoreWrap = document.getElementById('load-more-wrap');

  if (!filtered.length) {
    emptyEl.hidden = false;
    tableWrap.hidden = true;
    gridWrap.hidden = true;
    loadMoreWrap.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  loadMoreWrap.hidden = visible.length >= filtered.length;
  if (!loadMoreWrap.hidden) {
    document.getElementById('load-more-btn').textContent = `Mostrar más (${visible.length} de ${filtered.length})`;
  }

  if (state.viewMode === 'table') {
    tableWrap.hidden = false;
    gridWrap.hidden = true;
    renderTableRows(visible);
  } else {
    tableWrap.hidden = true;
    gridWrap.hidden = false;
    renderCards(gridWrap, visible);
  }
}

function renderTableRows(items) {
  const tbody = document.getElementById('deals-table-body');
  const starredSet = new Set(state.watchlist.starredIds || []);
  const targets = state.watchlist.targetPrices || {};

  tbody.innerHTML = items
    .map((p) => {
      const s = p.stats;
      const isStarred = starredSet.has(p.id);
      const uPrice = getUserPrice(p);
      const targetPrice = targets[p.id];
      const targetHit = targetPrice && uPrice.price <= targetPrice;
      const storeStyle = getStorePillStyle(p.storeId);
      const scoreColor = getScoreColor(s.dealScore);

      const discountHtml =
        s.listPriceInflated
          ? `<span class="discount-tag warn mono" title="La tienda infló el precio base respecto al mercado real">⚠ Base inflada</span>`
          : s.isFakeDiscount
            ? `<span class="discount-tag warn mono" title="Descuento inflado respecto a su historial">⚠ -${s.storeDiscountPct}%?</span>`
            : s.referenceSource === 'market' && s.fairDiscountPct >= 3
              ? `<span class="discount-tag mono" title="Ahorro real frente al precio mediano en ${p.peerCount} tiendas de Perú">-${s.fairDiscountPct}% mercado</span>`
              : s.daysTracked >= 2 && s.realDiscountPct >= 3
                ? `<span class="discount-tag mono" title="Descuento real frente a su mediana histórica">-${s.realDiscountPct}% real</span>`
                : s.storeDiscountPct > 0
                  ? `<span class="discount-tag neutral mono" title="Descuento publicado por la tienda (sin verificar aún con historial o mercado)">-${s.storeDiscountPct}% lista</span>`
                  : `<span class="discount-tag neutral mono">0%</span>`;

      const deltaHtml =
        s.delta24h < 0
          ? `<span class="delta-line mono positive">▼ ${formatPen(Math.abs(s.delta24h))} hoy</span>`
          : s.delta24h > 0
            ? `<span class="delta-line mono negative">▲ +${formatPen(s.delta24h)} hoy</span>`
            : '';

      const priceCellHtml = uPrice.usingCard
        ? `
          <span class="price-now mono positive">${formatPen(uPrice.price)}</span>
          <span class="price-card-mini mono">Tu ${escapeHtml(uPrice.cardName)}</span>
          <span class="price-old mono">${formatPen(p.price)}</span>
        `
        : `
          <span class="price-now mono">${formatPen(p.price)}</span>
          ${p.cardPrice ? `<span class="price-card-mini mono">${escapeHtml(p.cardName || 'Tarjeta')}: ${formatPen(p.cardPrice)}</span>` : ''}
          ${p.listPrice > p.price ? `<span class="price-old mono">${formatPen(p.listPrice)}</span>` : ''}
        `;

      return `
        <tr data-product-id="${escapeHtml(p.id)}">
          <td>
            <button type="button" class="star-btn ${isStarred ? 'starred' : ''}" data-star-id="${escapeHtml(p.id)}" title="${isStarred ? 'Quitar de Mi Lista' : 'Añadir a Mi Lista'}">
              ${isStarred ? '★' : '☆'}
            </button>
          </td>
          <td>
            <div class="prod-cell">
              <img class="prod-thumb" src="${escapeHtml(p.image || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
              <div class="prod-info">
                <span class="prod-title">${escapeHtml(p.title)}</span>
                <span class="prod-sub">
                  ${p.brand ? `<span>${escapeHtml(p.brand)}</span>` : ''}
                  ${p.originalCurrency === 'USD' ? `<span class="mono">(US$ ${p.originalPrice})</span>` : ''}
                  ${s.isBugazo ? `<span class="bugazo-tag">⚡ Bugazo</span>` : ''}
                  ${p.peerCount >= 2 ? `<span class="peer-badge">En ${p.peerCount} tiendas</span>` : ''}
                  ${p.inStock === false ? `<span class="out-of-stock-badge">Agotado</span>` : ''}
                  ${targetHit ? `<span class="target-hit-badge">¡Meta ≤ ${formatPen(targetPrice)}!</span>` : ''}
                </span>
              </div>
            </div>
          </td>
          <td>
            <span class="store-pill" style="${storeStyle}">${escapeHtml(p.storeName)}</span>
          </td>
          <td class="num">
            <div class="price-stack">${priceCellHtml}</div>
          </td>
          <td class="num">
            ${discountHtml}
            ${deltaHtml}
          </td>
          <td class="num">
            <div class="price-stack">
              <span class="mono" style="font-weight:600;">${formatPen(s.minPrice)}</span>
              <span class="small muted mono">${s.daysTracked}d reg.</span>
            </div>
          </td>
          <td>
            ${renderSparkline(p.sparkline)}
          </td>
          <td>
            <span class="verdict-pill verdict-${escapeHtml(s.verdict)}">${escapeHtml(s.verdictLabel)}</span>
          </td>
          <td class="num">
            <div class="score-cell">
              <div class="score-bar"><div class="score-fill" style="width:${s.dealScore}%;background:${scoreColor};"></div></div>
              <span class="score-num mono" style="color:${scoreColor};">${s.dealScore}</span>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderCards(container, items, isLiveSearch = false) {
  const starredSet = new Set(state.watchlist.starredIds || []);
  const targets = state.watchlist.targetPrices || {};

  container.innerHTML = items
    .map((p) => {
      const s = p.stats || {
        storeDiscountPct: p.listPrice > p.price ? Math.round(((p.listPrice - p.price) / p.listPrice) * 100) : 0,
        verdict: 'tracking_new',
        verdictLabel: 'En vivo',
        dealScore: 60
      };
      const isStarred = starredSet.has(p.id);
      const storeStyle = getStorePillStyle(p.storeId);
      const uPrice = getUserPrice(p);
      const targetPrice = targets[p.id];
      const targetHit = targetPrice && uPrice.price <= targetPrice;

      const cardDiscHtml = s.listPriceInflated
        ? `<span class="discount-tag warn mono" title="Precio base inflado frente al mercado">⚠ Inflado</span>`
        : s.isFakeDiscount
          ? `<span class="discount-tag warn mono" title="Descuento inflado frente al historial">⚠ -${s.storeDiscountPct}%?</span>`
          : s.referenceSource === 'market' && s.fairDiscountPct >= 3
            ? `<span class="discount-tag mono">-${s.fairDiscountPct}% real</span>`
            : s.daysTracked >= 2 && s.realDiscountPct >= 3
              ? `<span class="discount-tag mono">-${s.realDiscountPct}% real</span>`
              : s.storeDiscountPct > 0
                ? `<span class="discount-tag neutral mono">-${s.storeDiscountPct}%</span>`
                : '';

      return `
        <article class="deal-card" ${isLiveSearch ? '' : `data-product-id="${escapeHtml(p.id)}"`}>
          <div class="card-media">
            <img src="${escapeHtml(p.image || '')}" alt="${escapeHtml(p.title)}" loading="lazy" onerror="this.style.visibility='hidden'" />
            <div class="card-top-badges">
              <span class="store-pill" style="${storeStyle}">${escapeHtml(p.storeName)}</span>
              ${
                !isLiveSearch
                  ? `<button type="button" class="star-btn ${isStarred ? 'starred' : ''}" data-star-id="${escapeHtml(p.id)}" aria-label="Seguir">${isStarred ? '★' : '☆'}</button>`
                  : ''
              }
            </div>
          </div>
          <div class="card-body">
            <div class="card-brand-row">
              <span class="small muted">${escapeHtml(p.brand || p.storeName)}</span>
              <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                ${s.isBugazo ? `<span class="bugazo-tag">⚡</span>` : ''}
                ${p.peerCount >= 2 ? `<span class="peer-badge">${p.peerCount} tiendas</span>` : ''}
                ${p.inStock === false ? `<span class="out-of-stock-badge">Agotado</span>` : ''}
                ${cardDiscHtml}
              </div>
            </div>
            <h3 class="card-title">${escapeHtml(p.title)}</h3>
            ${targetHit ? `<span class="target-hit-badge">¡Llegó a tu meta ≤ ${formatPen(targetPrice)}!</span>` : ''}
            <div class="card-price-block">
              <div>
                <div class="price-now mono ${uPrice.usingCard ? 'positive' : ''}">${formatPen(uPrice.price)}</div>
                ${
                  uPrice.usingCard
                    ? `<div class="price-card-mini mono">Tu ${escapeHtml(uPrice.cardName)} (int. ${formatPen(p.price)})</div>`
                    : p.cardPrice
                      ? `<div class="price-card-mini mono">${escapeHtml(p.cardName || 'Tarjeta')}: ${formatPen(p.cardPrice)}</div>`
                      : ''
                }
                ${p.listPrice > p.price ? `<div class="price-old mono">${formatPen(p.listPrice)}</div>` : ''}
              </div>
              ${!isLiveSearch ? renderSparkline(p.sparkline, 74, 24) : ''}
            </div>
          </div>
          <div class="card-footer">
            ${
              isLiveSearch
                ? `
                  <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="link-btn">Ver en tienda ↗</a>
                  <button type="button" class="btn btn-secondary btn-track-live" data-live-idx="${items.indexOf(p)}" style="height:30px;padding:0 10px;font-size:0.76rem;">
                    + Seguir historial
                  </button>
                `
                : `
                  <span class="verdict-pill verdict-${escapeHtml(s.verdict)}">${escapeHtml(s.verdictLabel)}</span>
                  <button type="button" class="btn ${isStarred ? 'btn-danger-soft' : 'btn-secondary'} btn-list-toggle" data-star-id="${escapeHtml(p.id)}">
                    ${isStarred ? '✕ Quitar' : '+ Añadir'}
                  </button>
                `
            }
          </div>
        </article>
      `;
    })
    .join('');

  if (isLiveSearch) {
    container.querySelectorAll('.btn-track-live').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.liveIdx);
        const prod = items[idx];
        if (!prod) return;
        await trackLiveProduct(prod, btn);
      });
    });
  }
}

// ============================================================================
// Unified Multi-Tienda Comparison Panel (SoloTodo / Compy Style)
// ============================================================================
function renderGroupsPanel() {
  const grid = document.getElementById('groups-grid');
  if (!grid) return;

  if (state.mode !== 'server' && !state.groupsLoaded) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p><span class="spinner" aria-hidden="true"></span> Cargando comparativas multi-tienda...</p>
      </div>
    `;
    ensureGroupsLoaded().then(() => {
      if (state.activeTab === 'groups') renderGroupsPanel();
    });
    return;
  }

  const q = state.groupsQuery.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  const filtered = state.groups.filter((g) => {
    if (!terms.length) return true;
    const hay = `${g.title} ${g.brand} ${g.offers.map((o) => o.storeName).join(' ')}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>No hay comparativas multi-tienda con ese filtro</h3>
        <p>Prueba otra palabra clave (ej. Samsung, LG, PlayStation, Oster).</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .slice(0, 80)
    .map((g) => {
      // Re-sort offers respecting user's wallet cards
      const offers = [...g.offers]
        .map((o) => ({ ...o, userPrice: getUserPrice(o) }))
        .sort((a, b) => a.userPrice.price - b.userPrice.price);

      const minP = offers[0].userPrice.price;
      const maxP = offers[offers.length - 1].userPrice.price;
      const diffPen = Math.max(0, maxP - minP);

      return `
        <article class="group-card">
          <div class="group-card-head">
            <img class="group-card-thumb" src="${escapeHtml(g.image || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
            <div style="min-width:0;flex:1;">
              <span class="small muted">${escapeHtml(g.brand || 'Multi-Tienda')}</span>
              <h3 class="group-card-title">${escapeHtml(g.title)}</h3>
              <div class="group-summary-line">
                <strong class="mono positive">Desde ${formatPen(minP)}</strong>
                <span class="peer-badge">${offers.length} tiendas</span>
                ${diffPen >= 10 ? `<span class="small muted mono">Ahorras hasta ${formatPen(diffPen)}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="group-offers-list">
            ${offers
              .map((o, idx) => {
                const delta = o.userPrice.price - minP;
                return `
                  <div class="group-offer-row ${idx === 0 ? 'best-offer' : ''}" data-product-id="${escapeHtml(o.id)}">
                    <div class="group-offer-left">
                      <span class="store-pill" style="${getStorePillStyle(o.storeId)}">${escapeHtml(o.storeName)}</span>
                      ${o.userPrice.usingCard ? `<span class="price-card-mini mono">${escapeHtml(o.userPrice.cardName)}</span>` : ''}
                    </div>
                    <div class="group-offer-right">
                      <span class="small mono ${idx === 0 ? 'positive' : 'muted'}">
                        ${idx === 0 ? 'Más barato' : `+${formatPen(delta)}`}
                      </span>
                      <strong class="mono">${formatPen(o.userPrice.price)}</strong>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');
}

// ============================================================================
// Watchlist View (100% Personal & Removable)
// ============================================================================
function getWatchlistProducts() {
  const starred = new Set(state.watchlist.starredIds || []);
  const trackedUrls =
    state.mode === 'server'
      ? new Set((state.watchlist.urls || []).map((u) => (typeof u === 'string' ? u : u.url)))
      : new Set();
  return state.catalog.filter((p) => starred.has(p.id) || (trackedUrls.size > 0 && trackedUrls.has(p.url)));
}

function renderWatchlist() {
  const queriesEl = document.getElementById('custom-queries-list');
  const queries = state.watchlist.customQueries || [];
  if (!queries.length) {
    queriesEl.innerHTML =
      state.mode === 'server'
        ? '<span class="muted small">Aún no agregas búsquedas automáticas personalizadas. Agrega un término arriba para que se rastree cada día en todas las tiendas.</span>'
        : '<span class="muted small">Guarda términos que te interesan (ej. "RTX 4060", "OLED 55") para filtrar el catálogo en 1 clic y ver cuántas ofertas coinciden hoy.</span>';
  } else {
    queriesEl.innerHTML = queries
      .map((q) => {
        const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const matchesCount = terms.length
          ? state.catalog.filter((p) => {
              const hay = `${p.title} ${p.brand} ${p.brandLabel || ''} ${p.storeName}`.toLowerCase();
              return terms.every((t) => hay.includes(t));
            }).length
          : 0;
        return `
        <span class="query-tag">
          <button type="button" class="query-tag-btn" data-apply-query="${escapeHtml(q)}" title="Filtrar catálogo por «${escapeHtml(q)}»">
            <span>${escapeHtml(q)}</span>
            <span class="query-tag-count mono">${matchesCount}</span>
          </button>
          <button type="button" data-remove-query="${escapeHtml(q)}" title="Quitar búsqueda">×</button>
        </span>
      `;
      })
      .join('');
    queriesEl.querySelectorAll('[data-apply-query]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.applyQuery;
        state.filters.search = q;
        const input = document.getElementById('global-search-input');
        if (input) input.value = q;
        const clearBtn = document.getElementById('global-search-clear-btn');
        if (clearBtn) clearBtn.hidden = false;
        switchTab('deals');
      });
    });
    queriesEl.querySelectorAll('[data-remove-query]').forEach((btn) => {
      btn.addEventListener('click', () => removeCustomQuery(btn.dataset.removeQuery));
    });
  }

  renderWatchlistPicker();

  const wrap = document.getElementById('watchlist-items-wrap');
  const clearBtn = document.getElementById('watchlist-clear-all-btn');
  const list = getWatchlistProducts();
  if (clearBtn) clearBtn.hidden = list.length === 0;

  if (!list.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <h3>Tu lista está vacía</h3>
        <p>Usa el buscador de arriba para añadir productos del catálogo, o haz clic en <strong>☆ / + Añadir</strong> en cualquier oferta.</p>
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'cards-grid';
  wrap.innerHTML = '';
  wrap.appendChild(grid);
  renderCards(grid, list, false);
}

function renderWatchlistPicker() {
  const input = document.getElementById('watchlist-picker-input');
  const resultsEl = document.getElementById('watchlist-picker-results');
  if (!input || !resultsEl) return;

  const q = input.value.trim().toLowerCase();
  if (q.length < 2) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }

  const terms = q.split(/\s+/).filter(Boolean);
  const matches = state.catalog
    .filter((p) => {
      const hay = `${p.title} ${p.brand} ${p.storeName} ${p.sku}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .slice(0, 10);

  resultsEl.hidden = false;
  if (!matches.length) {
    resultsEl.innerHTML = '<span class="small muted">No se encontraron productos con ese nombre en el catálogo de hoy.</span>';
    return;
  }

  const starredSet = new Set(state.watchlist.starredIds || []);
  resultsEl.innerHTML = matches
    .map((p) => {
      const inList = starredSet.has(p.id);
      return `
        <div class="picker-row" data-product-id="${escapeHtml(p.id)}">
          <div class="picker-row-info">
            <span class="store-pill" style="${getStorePillStyle(p.storeId)}">${escapeHtml(p.storeName)}</span>
            <span class="picker-row-title">${escapeHtml(p.title)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <strong class="mono small">${formatPen(p.price)}</strong>
            <button type="button" class="btn ${inList ? 'btn-danger-soft' : 'btn-primary'} btn-list-toggle" data-star-id="${escapeHtml(p.id)}">
              ${inList ? '✕ Quitar' : '+ Añadir'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// Stores Panel
// ============================================================================
function renderStoresPanel() {
  const grid = document.getElementById('stores-grid');
  const statusMap = state.meta?.storesStatus || {};
  const campaignByStore = Object.fromEntries(
    (state.meta?.campaigns || []).map((c) => [c.storeId, c])
  );
  const storeStats = {};

  for (const p of state.catalog) {
    if (!storeStats[p.storeId]) {
      storeStats[p.storeId] = { count: 0, discountSum: 0, deals: 0 };
    }
    storeStats[p.storeId].count += 1;
    const disc = p.stats.storeDiscountPct || 0;
    storeStats[p.storeId].discountSum += disc;
    const isRealDeal =
      ['all_time_low', 'great_deal'].includes(p.stats.verdict) ||
      (!p.stats.listPriceInflated && !p.stats.isFakeDiscount && disc >= 15);
    if (isRealDeal) {
      storeStats[p.storeId].deals += 1;
    }
  }

  const enabledList = state.stores.filter((s) => s.enabled !== false);
  const withCampaignCount = enabledList.filter(
    (s) => Boolean(campaignByStore[s.id] || statusMap[s.id]?.campaign)
  ).length;
  const realCampaignCount = enabledList.filter((s) => {
    const camp = campaignByStore[s.id] || statusMap[s.id]?.campaign;
    return camp?.authenticity === 'real';
  }).length;

  // Update Tiendas Perú filter chip counts & active state
  const filterWrap = document.getElementById('stores-campaign-filters');
  if (filterWrap) {
    const bAll = filterWrap.querySelector('[data-store-filter="all"]');
    const bCamp = filterWrap.querySelector('[data-store-filter="campaign"]');
    const bReal = filterWrap.querySelector('[data-store-filter="real"]');
    if (bAll) bAll.textContent = `Todas (${enabledList.length})`;
    if (bCamp) bCamp.textContent = `🔥 En campaña hoy (${withCampaignCount})`;
    if (bReal) bReal.textContent = `✓ Rebajas reales (${realCampaignCount})`;
    filterWrap.querySelectorAll('[data-store-filter]').forEach((b) => {
      b.classList.toggle('active', b.dataset.storeFilter === state.storesCampaignFilter);
    });
  }

  const list = enabledList
    .filter((s) => {
      const camp = campaignByStore[s.id] || statusMap[s.id]?.campaign || null;
      if (state.storesCampaignFilter === 'campaign') return Boolean(camp);
      if (state.storesCampaignFilter === 'real') return camp?.authenticity === 'real';
      return true;
    })
    .sort((a, b) => {
      const ca = campaignByStore[a.id] || statusMap[a.id]?.campaign || null;
      const cb = campaignByStore[b.id] || statusMap[b.id]?.campaign || null;
      if (state.storesCampaignFilter !== 'all') {
        const pa = ca?.priority || 0;
        const pb = cb?.priority || 0;
        if (pb !== pa) return pb - pa;
      }
      return (storeStats[b.id]?.count || 0) - (storeStats[a.id]?.count || 0);
    });

  grid.innerHTML = list
    .map((store) => {
      const st = storeStats[store.id] || { count: 0, discountSum: 0, deals: 0 };
      const camp = campaignByStore[store.id] || statusMap[store.id]?.campaign || null;
      const avgDisc = st.count ? Math.round(st.discountSum / st.count) : 0;
      const pillStyle = getStorePillStyle(store.id);
      const isActive = st.count > 0;
      const displayHost = store.baseUrl
        ? store.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
        : store.domain || '';
      const isBlack = camp && /black/i.test(camp.primaryId || camp.label || '');
      const campHtml = camp
        ? `
          <div class="store-campaign-banner ${isBlack ? 'is-black' : ''}">
            <span class="store-campaign-name">${camp.emoji || '🔥'} ${escapeHtml(camp.label)}${camp.maxPromoPct ? ` · hasta ${camp.maxPromoPct}%` : ''}</span>
            <span class="auth-pill ${escapeHtml(camp.authenticity || 'mixed')}">${escapeHtml(camp.authenticityLabel || 'En campaña')}</span>
          </div>
        `
        : '';

      return `
        <div class="store-card" data-jump-store="${escapeHtml(store.id)}">
          <div class="store-card-top">
            <span class="store-pill" style="${pillStyle}">${escapeHtml(store.name)}</span>
            <span class="small muted">
              <span class="status-dot ${isActive ? 'ok' : 'off'}"></span>
              ${isActive ? 'Activa' : 'Sin datos'}
            </span>
          </div>
          ${displayHost ? `<div class="small muted mono" style="font-size:0.72rem;margin-top:-2px;">${escapeHtml(displayHost)}</div>` : ''}
          ${campHtml}
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div>
              <div class="mono" style="font-size:1.3rem;font-weight:800;">${st.count}</div>
              <div class="small muted">${st.count === 1 ? 'producto hoy' : 'productos hoy'}</div>
            </div>
            <div style="text-align:right;">
              <div class="mono positive" style="font-weight:700;">${st.deals} ${st.deals === 1 ? 'oferta' : 'ofertas'}</div>
              <div class="small muted">prom. -${avgDisc}%</div>
            </div>
          </div>
          <div class="small muted" style="border-top:1px solid var(--border-hairline);padding-top:8px;display:flex;justify-content:space-between;align-items:center;">
            <span>${store.currency === 'USD' ? 'Precios USD → S/' : 'Precios en soles (S/)'}</span>
            <span style="color:var(--accent);font-weight:600;">Ver ofertas →</span>
          </div>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('[data-jump-store]').forEach((card) => {
    card.addEventListener('click', () => {
      state.filters.store = card.dataset.jumpStore;
      state.filters.brand = 'all';
      document.getElementById('filter-store').value = state.filters.store;
      populateBrandOptions();
      switchTab('deals');
    });
  });

  // Render Brands Explorer (Known Brands + Marcas genéricas)
  const brandsGrid = document.getElementById('brands-grid');
  if (!brandsGrid) return;

  const brandMap = new Map();
  const genericStats = { key: GENERIC_BRAND_KEY, label: 'Marcas genéricas', count: 0, deals: 0, isKnown: false };

  for (const p of state.catalog) {
    const isDeal = ['all_time_low', 'great_deal'].includes(p.stats.verdict);
    if (p.isKnownBrand) {
      const entry = brandMap.get(p.brandKey) || { key: p.brandKey, label: p.brandLabel, count: 0, deals: 0, isKnown: true };
      entry.count += 1;
      if (isDeal) entry.deals += 1;
      brandMap.set(p.brandKey, entry);
    } else {
      genericStats.count += 1;
      if (isDeal) genericStats.deals += 1;
    }
  }

  const brandCards = [...brandMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (genericStats.count > 0) brandCards.push(genericStats);

  brandsGrid.innerHTML = brandCards
    .map(
      (b) => `
      <div class="brand-card ${b.isKnown ? '' : 'brand-card-generic'}" data-jump-brand="${escapeHtml(b.key)}">
        <span class="brand-card-name">${escapeHtml(b.label)}</span>
        <div class="brand-card-meta mono">
          <span>${b.count} prod.</span>
          <span class="${b.deals > 0 ? 'positive' : ''}">${b.deals} ${b.deals === 1 ? 'oferta' : 'ofertas'}</span>
        </div>
      </div>
    `
    )
    .join('');

  brandsGrid.querySelectorAll('[data-jump-brand]').forEach((card) => {
    card.addEventListener('click', () => {
      state.filters.store = 'all';
      state.filters.category = 'all';
      state.filters.brand = card.dataset.jumpBrand;
      document.getElementById('filter-store').value = 'all';
      populateFilterOptions();
      document.getElementById('filter-brand').value = state.filters.brand;
      switchTab('deals');
    });
  });
}

// ============================================================================
// Product Detail Drawer (Deep-linkable ?p= + WhatsApp Share + Multi-Tienda)
// ============================================================================
function getShareableProductUrl(productId) {
  const url = new URL(window.location.href);
  url.searchParams.set('p', productId);
  url.searchParams.delete('v');
  return url.toString();
}

function shareSelectedProductWhatsApp() {
  const p = state.selectedProduct;
  if (!p) return;
  const uPrice = getUserPrice(p);
  const link = getShareableProductUrl(p.id);
  const tag = p.stats?.isBugazo
    ? '⚡ Posible Bugazo'
    : p.stats?.verdict === 'all_time_low'
      ? '🔥 Mínimo histórico'
      : '🏷️ Oferta en Perú';
  const cardNote = p.cardPrice ? ` (${p.cardName || 'Tarjeta'}: ${formatPen(p.cardPrice)})` : '';
  const disc =
    p.stats?.realDiscountPct >= 5
      ? `-${p.stats.realDiscountPct}% real`
      : p.stats?.storeDiscountPct > 0
        ? `-${p.stats.storeDiscountPct}%`
        : '';
  const text = `${tag} en ${p.storeName}:\n${p.title}\n💰 ${formatPen(uPrice.price)}${cardNote}${disc ? ` (${disc})` : ''}\n📊 Ver historial en ChapaAlToque PE: ${link}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

async function copySelectedProductLink() {
  const p = state.selectedProduct;
  if (!p) return;
  const link = getShareableProductUrl(p.id);
  try {
    await navigator.clipboard.writeText(link);
    showToast('Enlace directo copiado al portapapeles.');
  } catch {
    showToast(`Copia este enlace: ${link}`);
  }
}

async function openProductDrawer(productId) {
  const product = state.catalog.find((p) => p.id === productId);
  if (!product) return;

  state.selectedProduct = product;
  state.chartRange = 'all';

  // Sync deep-link ?p= cleanly without reloading
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('p', productId);
    window.history.replaceState({}, '', url.toString());
  } catch {
    // ignore history errors
  }

  let history = state.historyCache[productId] || [];
  let related = [];
  let group = product.groupId ? state.groupMap[product.groupId] || null : null;

  if (state.mode === 'server') {
    try {
      const res = await fetch(`/api/product/${encodeURIComponent(productId)}`);
      if (res.ok) {
        const data = await res.json();
        state.selectedProduct = data.product || product;
        history = data.history || [];
        related = data.related || [];
        group = data.group || group;
        state.historyCache[productId] = history;
      }
    } catch {
      // use local fallback
    }
  } else {
    const loaders = [];
    if (!state.historyLoaded) loaders.push(ensureHistoryLoaded());
    if (product.groupId && !state.groupsLoaded) loaders.push(ensureGroupsLoaded());
    if (loaders.length) {
      await Promise.all(loaders);
    }
    history = state.historyCache[productId] || [];
    group = product.groupId ? state.groupMap[product.groupId] || null : null;
    related = findRelatedClient(product, state.catalog);
  }

  state.selectedHistory = history;
  state.selectedGroup = group;
  renderDrawer(state.selectedProduct, history, related, group);

  document.getElementById('drawer-backdrop').hidden = false;
  const drawer = document.getElementById('product-drawer');
  drawer.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => drawer.classList.add('open'));
}

function closeProductDrawer() {
  const drawer = document.getElementById('product-drawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.getElementById('drawer-backdrop').hidden = true;

  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('p')) {
      url.searchParams.delete('p');
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    // ignore
  }
}

function renderDrawer(p, history, related, group = state.selectedGroup) {
  const s = p.stats;
  const uPrice = getUserPrice(p);
  const pill = document.getElementById('drawer-store-pill');
  pill.textContent = p.storeName;
  pill.setAttribute('style', getStorePillStyle(p.storeId));

  setText('drawer-sku', p.sku ? `SKU ${p.sku}` : '');
  const stockPill = document.getElementById('drawer-stock-pill');
  if (stockPill) stockPill.hidden = p.inStock !== false;
  setText('drawer-brand', p.brand || p.storeName);
  setText('drawer-title', p.title);
  setText('drawer-price-now', formatPen(uPrice.price));

  const img = document.getElementById('drawer-img');
  if (p.image) {
    img.hidden = false;
    img.onerror = () => {
      img.hidden = true;
    };
    img.src = p.image;
    img.alt = p.title;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    img.alt = '';
  }

  const listEl = document.getElementById('drawer-price-list');
  const discEl = document.getElementById('drawer-discount-tag');
  if (p.listPrice > p.price) {
    listEl.hidden = false;
    listEl.textContent = formatPen(p.listPrice);
    discEl.hidden = false;
    discEl.textContent = `-${s.storeDiscountPct}% tienda`;
    discEl.className = `discount-tag mono ${s.isFakeDiscount ? 'warn' : ''}`;
  } else {
    listEl.hidden = true;
    discEl.hidden = true;
  }

  const cardEl = document.getElementById('drawer-card-price');
  if (p.cardPrice) {
    cardEl.hidden = false;
    cardEl.textContent = uPrice.usingCard
      ? `Aplicando tu ${p.cardName || 'tarjeta'} (Internet: ${formatPen(p.price)})`
      : `Con ${p.cardName || 'tarjeta de tienda'}: ${formatPen(p.cardPrice)}`;
  } else {
    cardEl.hidden = true;
  }

  const usdEl = document.getElementById('drawer-usd-note');
  if (p.originalCurrency === 'USD' && p.originalPrice) {
    usdEl.hidden = false;
    usdEl.textContent = `Precio original en tienda: US$ ${p.originalPrice} (convertido a soles con T.C. S/ ${state.meta?.usdToPen || '3.75'})`;
  } else {
    usdEl.hidden = true;
  }

  // Verdict
  const vPill = document.getElementById('drawer-verdict-pill');
  vPill.className = `verdict-pill verdict-${s.verdict}`;
  vPill.textContent = s.isBugazo ? `⚡ ${s.verdictLabel}` : s.verdictLabel;
  setText('drawer-score-label', `Deal Score: ${s.dealScore}/100`);
  setText('drawer-verdict-reason', s.bugazoReason || s.verdictReason);

  // Links & buttons
  document.getElementById('drawer-store-link').href = p.url;
  const isStarred = (state.watchlist.starredIds || []).includes(p.id);
  const starBtn = document.getElementById('drawer-star-btn');
  starBtn.textContent = isStarred ? '✕ Quitar de Mi Lista' : '+ Añadir a Mi Lista';
  starBtn.className = `btn ${isStarred ? 'btn-danger-soft' : 'btn-secondary'}`;

  const refreshBtn = document.getElementById('drawer-refresh-btn');
  refreshBtn.hidden = state.mode !== 'server';

  // Anti-Cyber 15d / 30d Strip
  const cyberEl = document.getElementById('drawer-cyber-status');
  if (cyberEl) {
    cyberEl.textContent = s.cyberLabel || (s.daysTracked < 2 ? 'Día 1' : 'Precio estable');
    cyberEl.className = s.cyberStatus === 'real_drop' ? 'positive' : s.cyberStatus === 'cyber_trap' ? 'negative' : '';
  }
  const d15 = document.getElementById('drawer-delta-15d');
  if (d15) {
    if (s.delta15dPct !== null && s.delta15dPct !== undefined) {
      d15.textContent = `${s.delta15dPct > 0 ? '+' : ''}${s.delta15dPct}% (${formatPen(s.price15dAgo)})`;
      d15.className = `mono ${s.delta15dPct < 0 ? 'positive' : s.delta15dPct > 0 ? 'negative' : ''}`;
    } else {
      d15.textContent = 'En recopilación';
      d15.className = 'mono muted';
    }
  }
  const d30 = document.getElementById('drawer-delta-30d');
  if (d30) {
    if (s.delta30dPct !== null && s.delta30dPct !== undefined) {
      d30.textContent = `${s.delta30dPct > 0 ? '+' : ''}${s.delta30dPct}% (${formatPen(s.price30dAgo)})`;
      d30.className = `mono ${s.delta30dPct < 0 ? 'positive' : s.delta30dPct > 0 ? 'negative' : ''}`;
    } else {
      d30.textContent = 'En recopilación';
      d30.className = 'mono muted';
    }
  }

  // Exact Multi-Store Group Table
  const groupSec = document.getElementById('drawer-group-section');
  const groupList = document.getElementById('drawer-group-list');
  if (groupSec && groupList) {
    if (group && Array.isArray(group.offers) && group.offers.length >= 2) {
      groupSec.hidden = false;
      const sortedOffers = [...group.offers]
        .map((o) => ({ ...o, userPrice: getUserPrice(o) }))
        .sort((a, b) => a.userPrice.price - b.userPrice.price);
      const cheapest = sortedOffers[0].userPrice.price;

      groupList.innerHTML = sortedOffers
        .map((o, idx) => {
          const isCurrent = o.id === p.id;
          const diff = o.userPrice.price - cheapest;
          return `
            <div class="group-offer-row ${idx === 0 ? 'best-offer' : ''}" data-open-group-id="${escapeHtml(o.id)}">
              <div class="group-offer-left">
                <span class="store-pill" style="${getStorePillStyle(o.storeId)}">${escapeHtml(o.storeName)}</span>
                ${isCurrent ? '<span class="small muted">(viendo)</span>' : ''}
                ${o.userPrice.usingCard ? `<span class="price-card-mini mono">${escapeHtml(o.userPrice.cardName)}</span>` : ''}
              </div>
              <div class="group-offer-right">
                <span class="small mono ${idx === 0 ? 'positive' : 'muted'}">
                  ${idx === 0 ? 'Más barato' : `+${formatPen(diff)}`}
                </span>
                <strong class="mono">${formatPen(o.userPrice.price)}</strong>
              </div>
            </div>
          `;
        })
        .join('');
      groupList.querySelectorAll('[data-open-group-id]').forEach((el) => {
        el.addEventListener('click', () => {
          if (el.dataset.openGroupId !== p.id) openProductDrawer(el.dataset.openGroupId);
        });
      });
    } else {
      groupSec.hidden = true;
    }
  }

  // Target price
  const currentTarget = state.watchlist.targetPrices?.[p.id] || '';
  document.getElementById('drawer-target-input').value = currentTarget;
  const targetFeedback = document.getElementById('drawer-target-feedback');
  if (currentTarget) {
    if (uPrice.price <= Number(currentTarget)) {
      targetFeedback.innerHTML = `<strong class="positive">¡Objetivo alcanzado!</strong> Hoy cuesta ${formatPen(uPrice.price)} (tu meta era ≤ ${formatPen(currentTarget)}).`;
    } else {
      const diff = uPrice.price - Number(currentTarget);
      targetFeedback.textContent = `Falta que baje ${formatPen(diff)} para alcanzar tu meta de ${formatPen(currentTarget)}.`;
    }
  } else {
    targetFeedback.textContent = 'Establece un precio objetivo para resaltarlo cuando baje.';
  }

  // History Chart
  setText('drawer-history-meta', `${s.daysTracked} ${s.daysTracked === 1 ? 'día registrado' : 'días registrados'}`);
  document.querySelectorAll('#chart-range-controls .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.range === state.chartRange);
  });
  renderHistoryChart(
    document.getElementById('drawer-chart-container'),
    history,
    s,
    state.chartRange
  );

  // Stats Grid
  const noVariation = s.daysTracked < 2 || Math.abs((s.maxPrice || 0) - (s.minPrice || 0)) < 0.01;
  setText('stat-min', formatPen(s.minPrice));
  setText(
    'stat-min-date',
    s.daysTracked < 2
      ? 'Día 1 (sin historial previo)'
      : noVariation
        ? `Sin cambios en ${s.daysTracked} días`
        : s.verdict === 'all_time_low' && s.maxPrice > s.minPrice
          ? `Bajó ${formatPen(s.maxPrice - s.minPrice)} desde ${formatPen(s.maxPrice)}`
          : s.minDate
            ? `Registrado: ${s.minDate}`
            : 'Hoy'
  );
  setText('stat-median', formatPen(s.medianPrice));
  setText(
    'stat-real-diff',
    s.daysTracked >= 2
      ? noVariation
        ? 'Sin variación registrada'
        : s.realDiscountPct >= 0
          ? `Hoy ${s.realDiscountPct}% más barato`
          : `Hoy ${Math.abs(s.realDiscountPct)}% más caro`
      : 'Se afina con historial'
  );
  setText('stat-avg30', formatPen(s.avgPrice30d));
  setText('stat-days', `${s.daysTracked} ${s.daysTracked === 1 ? 'día monitoreado' : 'días monitoreados'}`);
  setText('stat-max', formatPen(s.maxPrice));
  setText(
    'stat-max-date',
    s.daysTracked < 2
      ? 'Día 1 (sin historial previo)'
      : noVariation
        ? `Sin cambios en ${s.daysTracked} días`
        : s.maxDate
          ? `Registrado: ${s.maxDate}`
          : 'Hoy'
  );

  // Related in other stores
  const relSection = document.getElementById('drawer-related-section');
  const relList = document.getElementById('drawer-related-list');
  if (related && related.length) {
    relSection.hidden = false;
    relList.innerHTML = related
      .map(
        (r) => `
        <div class="related-item" data-open-related="${escapeHtml(r.id)}">
          <div class="related-item-left">
            <span class="store-pill" style="${getStorePillStyle(r.storeId)};width:fit-content;">${escapeHtml(r.storeName)}</span>
            <span class="related-item-title">${escapeHtml(r.title)}</span>
          </div>
          <div class="price-stack">
            <strong class="mono">${formatPen(r.price)}</strong>
            <span class="small ${r.price < p.price ? 'positive' : 'muted'} mono">
              ${r.price < p.price ? `${formatPen(p.price - r.price)} menos` : `+${formatPen(r.price - p.price)}`}
            </span>
          </div>
        </div>
      `
      )
      .join('');
    relList.querySelectorAll('[data-open-related]').forEach((el) => {
      el.addEventListener('click', () => openProductDrawer(el.dataset.openRelated));
    });
  } else {
    relSection.hidden = true;
  }
}

const CLIENT_TOKEN_STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'por', 'sin', 'del', 'al', 'y', 'o',
  'un', 'una', 'negro', 'blanco', 'gris', 'azul', 'rojo', 'plata', 'silver', 'black', 'white',
  'peru', 'nuevo', 'nueva', 'original', 'oferta', 'promocion', 'combo', 'garantia', 'color'
]);

function getClientMatchTokens(item) {
  if (!item) return [];
  if (Array.isArray(item.matchTokens) && item.matchTokens.length) return item.matchTokens;
  if (!item._matchTokens) {
    const text = `${item.brand || ''} ${item.title || ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ');
    item._matchTokens = [
      ...new Set(text.split(/\s+/).filter((t) => t.length >= 2 && !CLIENT_TOKEN_STOPWORDS.has(t)))
    ].slice(0, 14);
  }
  return item._matchTokens;
}

function findRelatedClient(target, catalog) {
  const targetTokens = getClientMatchTokens(target);
  if (!targetTokens.length) return [];
  const targetSet = new Set(targetTokens);
  const scored = [];
  for (const item of catalog) {
    if (item.id === target.id || item.storeId === target.storeId) continue;
    let overlap = 0;
    for (const t of getClientMatchTokens(item)) {
      if (targetSet.has(t)) overlap += 1;
    }
    if (overlap >= 3) scored.push({ item, overlap });
  }
  return scored
    .sort((a, b) => b.overlap - a.overlap || a.item.price - b.item.price)
    .slice(0, 5)
    .map((s) => s.item);
}

// ============================================================================
// Live Actions: Upgraded "Actualizar hoy" (Server SSE + GitHub Actions 1-Click)
// ============================================================================
function getSavedGhToken() {
  try {
    return localStorage.getItem(GH_TOKEN_KEY) || localStorage.getItem(LEGACY_GH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function isAdminMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1') {
      localStorage.setItem(ADMIN_MODE_KEY, '1');
      return true;
    }
    if (params.get('admin') === '0') {
      localStorage.setItem(ADMIN_MODE_KEY, 'hidden');
      return false;
    }
    const stored = localStorage.getItem(ADMIN_MODE_KEY);
    if (stored === 'hidden') return false;
    if (stored === '1') return true;
    return Boolean(getSavedGhToken());
  } catch {
    return false;
  }
}
function setProgressBar(visible, pct = 0, text = '') {
  const btn = document.getElementById('refresh-daily-btn');
  const label = document.getElementById('refresh-daily-label');
  const bar = document.getElementById('scrape-progress-bar');
  const fill = document.getElementById('scrape-progress-fill');
  const pctEl = document.getElementById('scrape-progress-pct');
  const textEl = document.getElementById('scrape-progress-text');

  state.isUpdating = visible;
  btn.disabled = visible;
  btn.classList.toggle('is-spinning', visible);
  label.textContent = visible ? 'Actualizando...' : 'Actualizar hoy';
  bar.hidden = !visible;
  if (visible) {
    fill.style.width = `${Math.max(3, Math.min(100, pct))}%`;
    pctEl.textContent = `${Math.round(pct)}%`;
    textEl.textContent = text;
  }
}
async function openUpdateModal() {
  const backdrop = document.getElementById('update-modal-backdrop');
  const feedback = document.getElementById('update-modal-feedback');
  feedback.hidden = true;
  backdrop.hidden = false;

  const isServer = state.mode === 'server';
  document.getElementById('update-server-section').hidden = !isServer;
  document.getElementById('update-github-section').hidden = isServer;

  // Update dynamic GitHub Actions link for detected repo
  const ghActionsUrl = `https://github.com/${GH_REPO.owner}/${GH_REPO.repo}/actions/workflows/${WORKFLOW_FILE}`;
  document.getElementById('open-gh-actions-link').href = ghActionsUrl;

  if (isServer) {
    const dt = state.meta?.lastUpdatedAt ? formatRelativeTime(state.meta.lastUpdatedAt) : 'sin datos aún';
    setSyncStatus('ok', `Servidor local activo · ${state.catalog.length} productos`, `Última actualización: ${dt}`);
    return;
  }

  const admin = isAdminMode();
  const adminBox = document.getElementById('gh-admin-controls');
  if (adminBox) adminBox.hidden = !admin;

  if (!admin) {
    const rel = state.meta?.lastUpdatedAt ? formatRelativeTime(state.meta.lastUpdatedAt) : 'reciente';
    const storesCount = state.meta?.activeStores || 30;
    setSyncStatus(
      'ok',
      `Catálogo actualizado (${rel})`,
      `${state.catalog.length.toLocaleString('es-PE')} productos en ${storesCount} tiendas del Perú`
    );
    return;
  }

  refreshGhTokenUi();
  await checkGitHubWorkflowStatus();
}

function closeUpdateModal() {
  document.getElementById('update-modal-backdrop').hidden = true;
}

function setSyncStatus(dotClass, title, sub) {
  const dot = document.getElementById('update-status-dot');
  dot.className = `sync-dot ${dotClass}`;
  setText('update-status-title', title);
  setText('update-status-sub', sub);
}

function refreshGhTokenUi() {
  const token = getSavedGhToken();
  const hasToken = Boolean(token);
    const adminBox = document.getElementById('gh-admin-controls');
  if (adminBox) adminBox.hidden = !isAdminMode();
  document.getElementById('gh-dispatch-buttons').hidden = !hasToken;
  document.getElementById('clear-gh-token-btn').hidden = !hasToken;
  document.getElementById('gh-token-input').value = hasToken ? '••••••••••••••••••••' : '';
  document.getElementById('gh-token-summary').textContent = hasToken
    ? 'Botón en 1 clic activado (configurar / cambiar token)'
    : 'Configurar botón en 1 clic desde esta web (opcional, solo 1 vez)';
  document.getElementById('gh-token-feedback').textContent = hasToken
    ? 'Token guardado solo en este navegador. Ya puedes actualizar directamente desde aquí.'
    : '';
}

async function fetchLatestGhRun() {
  const token = getSavedGhToken();
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${GH_REPO.owner}/${GH_REPO.repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1&t=${Date.now()}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
  const data = await res.json();
  return data?.workflow_runs?.[0] || null;
}

async function checkGitHubWorkflowStatus() {
  setSyncStatus('running', 'Consultando estado en GitHub Actions...', `${GH_REPO.owner}/${GH_REPO.repo}`);
  try {
    const run = await fetchLatestGhRun();
    if (!run) {
      setSyncStatus('warn', 'Aún no hay ejecuciones registradas', 'Ejecuta el flujo para actualizar los precios de hoy.');
      return;
    }
    const when = formatRelativeTime(run.updated_at || run.created_at);
    if (run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting') {
      setSyncStatus('running', 'Actualización en progreso en GitHub Actions...', `Iniciada ${when}`);
    } else if (run.conclusion === 'success') {
      setSyncStatus('ok', `Última actualización exitosa (${when})`, `${state.catalog.length} productos · ${state.meta?.activeStores || 21} tiendas en Perú`);
    } else {
      setSyncStatus('warn', `Último estado: ${run.conclusion || run.status}`, `Actualizado ${when}`);
    }
  } catch {
    const dt = state.meta?.lastUpdatedAt ? formatRelativeTime(state.meta.lastUpdatedAt) : 'hoy';
    setSyncStatus('ok', `Catálogo listo (${dt})`, `${state.catalog.length} productos de ${state.meta?.activeStores || 21} tiendas`);
  }
}

async function forceReloadLatestData() {
  const btn = document.getElementById('force-reload-data-btn');
  const prevTimestamp = state.meta?.lastUpdatedAt;
  btn.disabled = true;
  btn.textContent = 'Recargando...';
  try {
    await loadInitialData();
    renderAll();
    const isNewer = state.meta?.lastUpdatedAt && state.meta.lastUpdatedAt !== prevTimestamp;
    showToast(
      isNewer
        ? `¡Nuevos precios cargados! (${state.catalog.length} productos)`
        : `Datos actualizados al último registro (${state.catalog.length} productos).`
    );
    if (!document.getElementById('update-modal-backdrop').hidden) {
      await checkGitHubWorkflowStatus();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Recargar datos';
  }
}

async function dispatchGitHubUpdate(quick = false) {
  const token = getSavedGhToken();
  const feedback = document.getElementById('update-modal-feedback');
  if (!token) {
    feedback.hidden = false;
    feedback.className = 'modal-feedback error';
    feedback.textContent = 'Primero guarda tu token personal de GitHub abajo o usa "Ejecutar en GitHub Actions ↗".';
    document.getElementById('gh-token-details').open = true;
    return;
  }

  feedback.hidden = false;
  feedback.className = 'modal-feedback';
  feedback.textContent = 'Enviando orden de actualización a GitHub Actions...';

  const prevUpdatedAt = state.meta?.lastUpdatedAt || '';
  const dispatchTime = Date.now();

  try {
    const url = `https://api.github.com/repos/${GH_REPO.owner}/${GH_REPO.repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { quick: quick ? 'true' : 'false' }
      })
    });

    if (res.status === 204 || res.ok) {
      closeUpdateModal();
      showToast('Actualización iniciada en GitHub Actions. Te avisaremos en cuanto termine.');
      watchGitHubRunUntilDeployed(prevUpdatedAt, dispatchTime);
      return;
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error('Token rechazado (HTTP ' + res.status + '). Verifica que tenga permiso "Actions: Read and write" en este repositorio.');
    }
    throw new Error(`No se pudo iniciar la actualización (HTTP ${res.status}).`);
  } catch (err) {
    feedback.className = 'modal-feedback error';
    feedback.textContent = err.message;
  }
}

function watchGitHubRunUntilDeployed(prevUpdatedAt, startedMs = Date.now()) {
  if (state.ghPollTimer) {
    clearInterval(state.ghPollTimer);
    state.ghPollTimer = null;
  }

  setProgressBar(true, 10, 'Orden enviada · esperando inicio en GitHub Actions...');
  let ticks = 0;

  const poll = async () => {
    ticks += 1;
    try {
      // Check if GitHub Pages already published newer meta.json
      const freshMeta = await fetchJsonSafe(`./data/meta.json?t=${Date.now()}`, null);
      if (freshMeta?.lastUpdatedAt && freshMeta.lastUpdatedAt !== prevUpdatedAt) {
        clearInterval(state.ghPollTimer);
        state.ghPollTimer = null;
        setProgressBar(true, 100, `¡Listo! ${freshMeta.totalProducts} productos actualizados.`);
        await loadInitialData();
        renderAll();
        showToast(`¡Precios actualizados! ${state.catalog.length} productos de ${state.meta?.activeStores || 21} tiendas.`);
        setTimeout(() => setProgressBar(false), 2400);
        return;
      }

      // Check GitHub Actions live run status
      const run = await fetchLatestGhRun();
      if (run) {
        const runCreated = new Date(run.created_at).getTime();
        const isCurrentRun = runCreated >= startedMs - 90000;
        if (isCurrentRun) {
          if (run.status === 'queued' || run.status === 'waiting') {
            setProgressBar(true, 18, 'En cola en GitHub Actions...');
          } else if (run.status === 'in_progress') {
            const est = Math.min(78, 28 + ticks * 4);
            const storeCount = state.meta?.activeStores || 30;
            setProgressBar(true, est, `Escaneando ${storeCount} tiendas de Perú y publicando cambios...`);
          } else if (run.status === 'completed') {
            if (run.conclusion === 'success') {
              setProgressBar(true, 92, 'Escaneo listo · esperando propagación de GitHub Pages...');
            } else {
              clearInterval(state.ghPollTimer);
              state.ghPollTimer = null;
              setProgressBar(false);
              showToast(`El workflow terminó con estado: ${run.conclusion}. Revisa la pestaña Actions en GitHub.`);
              return;
            }
          }
        }
      }

      // Timeout after ~4 minutes so we never poll forever
      if (ticks >= 60) {
        clearInterval(state.ghPollTimer);
        state.ghPollTimer = null;
        setProgressBar(false);
        await loadInitialData();
        renderAll();
        showToast('Catálogo recargado.');
      }
    } catch {
      // ignore transient network glitches while polling
    }
  };

  poll();
  state.ghPollTimer = setInterval(poll, 4000);
}

function startLocalDailyScrape(quick = false) {
  closeUpdateModal();
  const storeCount = state.meta?.activeStores || 30;
  setProgressBar(true, 4, `Conectando con las ${storeCount} tiendas de Perú (${quick ? 'modo rápido' : 'modo completo'})...`);

  const es = new EventSource(`/api/scrape/stream${quick ? '?quick=1' : ''}`);

  es.addEventListener('progress', (ev) => {
    const data = JSON.parse(ev.data);
    const pct = data.total ? Math.round((data.completed / data.total) * 100) : 5;
    setProgressBar(true, Math.max(4, pct), data.message || 'Actualizando...');
  });

  es.addEventListener('done', async (ev) => {
    es.close();
    const data = JSON.parse(ev.data);
    setProgressBar(true, 100, `¡Actualizado! ${data.totalProducts} productos guardados en el historial de hoy.`);
    await loadInitialData();
    renderAll();
    showToast(`Lista de hoy actualizada (${data.totalProducts} productos).`);

    setTimeout(() => setProgressBar(false), 2200);
  });

  es.addEventListener('error', (ev) => {
    es.close();
    let msg = 'Error durante la actualización.';
    try {
      const d = JSON.parse(ev.data);
      if (d?.message) msg = d.message;
    } catch {
      // keep default
    }
    showToast(msg);
    setProgressBar(false);
  });
}

function formatRelativeTime(isoStr) {
  try {
    const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoStr).getTime()) / 1000));
    if (diffSec < 60) return 'hace unos segundos';
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `hace ${diffHr} h`;
    return new Date(isoStr).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

async function runLiveSearch(query) {
  const q = query.trim();
  if (!q) return;

  switchTab('live-search');
  document.getElementById('live-search-input').value = q;

  const statusEl = document.getElementById('live-search-status');
  const resultsEl = document.getElementById('live-search-results');

  if (state.mode !== 'server') {
    statusEl.hidden = false;
    statusEl.innerHTML = '<span>La búsqueda multi-tienda en vivo requiere ejecutar el servidor local (<code>npm start</code>). Mientras tanto, filtrando el catálogo diario...</span>';
    state.filters.search = q;
    document.getElementById('global-search-input').value = q;
    switchTab('deals');
    return;
  }

  statusEl.hidden = false;
  statusEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span class="spinner"></span> Buscando "<strong>${escapeHtml(q)}</strong>" en tiempo real en todas las tiendas de Perú...</span>`;
  resultsEl.innerHTML = '';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error buscando');

    const okStores = (data.stores || []).filter((s) => s.count > 0).length;
    statusEl.innerHTML = `
      <span>
        <strong>${data.totalResults} resultados en vivo</strong> en ${okStores} tiendas peruanas (${(data.elapsedMs / 1000).toFixed(1)}s) · Ordenados de menor a mayor precio
      </span>
      <button type="button" class="btn btn-secondary" id="live-watch-query-btn" style="height:32px;font-size:0.78rem;">
        + Vigilar "${escapeHtml(q)}" cada día
      </button>
    `;

    document.getElementById('live-watch-query-btn')?.addEventListener('click', () => addCustomQuery(q));

    if (!data.items.length) {
      resultsEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Sin resultados en las tiendas</h3><p>Intenta con un término más general (por ejemplo, "OLED 55" o "RTX 4060").</p></div>';
      return;
    }

    renderCards(resultsEl, data.items, true);
  } catch (err) {
    statusEl.innerHTML = `<span class="negative">Error: ${escapeHtml(err.message)}</span>`;
  }
}

async function trackLiveProduct(product, btn) {
  if (state.mode !== 'server') {
    showToast('Ejecuta el servidor local (npm start) para agregar nuevos productos al historial.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const res = await fetch('/api/track-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
    await loadInitialData();
    renderKpis();
    btn.textContent = '✓ Siguiendo';
    showToast(`"${product.title.slice(0, 42)}..." agregado a tu seguimiento diario.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '+ Seguir historial';
    showToast(err.message);
  }
}

async function submitTrackUrl(e) {
  e.preventDefault();
  const feedback = document.getElementById('track-url-feedback');
  const submitBtn = document.getElementById('submit-track-url-btn');
  const url = document.getElementById('track-url-input').value.trim();
  const category = document.getElementById('track-category-select').value;
  const targetPrice = document.getElementById('track-target-price').value;

  if (state.mode !== 'server') {
    feedback.hidden = false;
    feedback.className = 'modal-feedback error';
    feedback.textContent = 'Para extraer URLs en vivo, inicia el servidor con "npm start" o agrega la URL a data/watchlist.json en tu repositorio.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Extrayendo...';
  feedback.hidden = false;
  feedback.className = 'modal-feedback';
  feedback.textContent = 'Consultando la tienda y extrayendo el precio actual...';

  try {
    const res = await fetch('/api/track-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, category, targetPrice: targetPrice ? Number(targetPrice) : null })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo extraer esta URL');

    await loadInitialData();
    renderAll();
    closeTrackModal();
    showToast(`¡Agregado! ${data.product.title.slice(0, 40)} (${formatPen(data.product.price)})`);
    openProductDrawer(data.product.id);
  } catch (err) {
    feedback.className = 'modal-feedback error';
    feedback.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Extraer y seguir';
  }
}

async function toggleStar(productId) {
  const wasStarred = (state.watchlist.starredIds || []).includes(productId);
  if (state.mode === 'server') {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggleStar', id: productId })
    });
    if (res.ok) {
      const data = await res.json();
      state.watchlist = data.watchlist;
    }
  } else {
    const idx = state.watchlist.starredIds.indexOf(productId);
    if (idx >= 0) {
      state.watchlist.starredIds.splice(idx, 1);
      delete state.watchlist.targetPrices[productId];
    } else {
      state.watchlist.starredIds.push(productId);
    }
    saveLocalWatchlist();
  }

  renderAll();
  if (state.selectedProduct?.id === productId) {
    const isStarred = (state.watchlist.starredIds || []).includes(productId);
    const starBtn = document.getElementById('drawer-star-btn');
    starBtn.textContent = isStarred ? '✕ Quitar de Mi Lista' : '+ Añadir a Mi Lista';
    starBtn.className = `btn ${isStarred ? 'btn-danger-soft' : 'btn-secondary'}`;
  }
  showToast(wasStarred ? 'Producto quitado de Mi Lista.' : 'Producto añadido a Mi Lista.');
}

async function clearAllWatchlist() {
  if (state.mode === 'server') {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearAll' })
    });
    if (res.ok) state.watchlist = (await res.json()).watchlist;
  } else {
    state.watchlist.starredIds = [];
    state.watchlist.urls = [];
    state.watchlist.targetPrices = {};
    saveLocalWatchlist();
  }
  renderAll();
  showToast('Se vació Mi Lista.');
}

async function saveTargetPrice() {
  if (!state.selectedProduct) return;
  const id = state.selectedProduct.id;
  const raw = document.getElementById('drawer-target-input').value;
  const val = Number(raw) > 0 ? Number(raw) : null;

  if (state.mode === 'server') {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setTargetPrice', id, targetPrice: val })
    });
    if (res.ok) {
      const data = await res.json();
      state.watchlist = data.watchlist;
    }
  } else {
    if (val) state.watchlist.targetPrices[id] = val;
    else delete state.watchlist.targetPrices[id];
    saveLocalWatchlist();
  }

  renderAll();
  const related = findRelatedClient(state.selectedProduct, state.catalog);
  renderDrawer(state.selectedProduct, state.selectedHistory, related, state.selectedGroup);
  if (val) {
    showToast(
      state.mode === 'server'
        ? `Alerta guardada: te avisaremos cuando baje de ${formatPen(val)}.`
        : `Meta guardada (${formatPen(val)}): lo resaltaremos en Mi Lista cuando baje. Para alertas automáticas únete a @chapaaltoque_pe.`
    );
  } else {
    showToast('Meta de precio eliminada.');
  }
}

async function addCustomQuery(q) {
  const clean = q.trim();
  if (!clean) return;
  if (state.mode === 'server') {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addQuery', query: clean })
    });
    if (res.ok) {
      state.watchlist = (await res.json()).watchlist;
    }
  } else {
    if (!state.watchlist.customQueries.includes(clean)) {
      state.watchlist.customQueries.push(clean);
      saveLocalWatchlist();
    }
  }
  showToast(
    state.mode === 'server'
      ? `"${clean}" se buscará automáticamente en cada actualización diaria.`
      : `Filtro rápido "${clean}" guardado. Haz clic en él para filtrar el catálogo en 1 toque.`
  );
  if (state.activeTab === 'watchlist') renderWatchlist();
}

async function removeCustomQuery(q) {
  if (state.mode === 'server') {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeQuery', query: q })
    });
    if (res.ok) state.watchlist = (await res.json()).watchlist;
  } else {
    state.watchlist.customQueries = state.watchlist.customQueries.filter((x) => x !== q);
    saveLocalWatchlist();
  }
  renderWatchlist();
}

async function refreshSingleProduct() {
  if (!state.selectedProduct || state.mode !== 'server') return;
  const btn = document.getElementById('drawer-refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Actualizando...';
  try {
    const res = await fetch('/api/refresh-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.selectedProduct.id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar');
    await loadInitialData();
    state.selectedProduct = data.product;
    state.selectedHistory = data.history;
    renderAll();
    renderDrawer(data.product, data.history, findRelatedClient(data.product, state.catalog));
    showToast(`Precio actualizado: ${formatPen(data.product.price)}`);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Actualizar precio';
  }
}

// ============================================================================
// Event Bindings & Helpers
// ============================================================================
function resetCatalogFilters() {
  state.filters = {
    search: '',
    category: 'all',
    store: 'all',
    brand: 'all',
    verdict: 'all',
    cyber: 'all',
    sort: 'featured',
    minPrice: '',
    maxPrice: '',
    inStockOnly: true
  };
  populateFilterOptions();
  syncFilterInputsFromState();
  renderCatalog();
}

function setMobileFiltersOpen(open) {
  const panel = document.getElementById('filters-panel');
  const toggle = document.getElementById('filters-mobile-toggle');
  if (!panel || !toggle) return;
  panel.classList.toggle('mobile-filters-open', open);
  toggle.setAttribute('aria-expanded', String(open));
}

function switchTab(tab) {
  if (tab === 'live-search' && state.mode !== 'server') {
    tab = 'deals';
  }
  state.activeTab = tab;
  state.pageSize = 60;
  if (tab === 'bugazos' || tab === 'anticyber') {
    state.filters.verdict = 'all';
    const vSel = document.getElementById('filter-verdict');
    if (vSel) vSel.value = 'all';
  }
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  renderActivePanel();
}

function openTrackModal() {
  document.getElementById('track-url-form').reset();
  document.getElementById('track-url-feedback').hidden = true;
  document.getElementById('track-modal-backdrop').hidden = false;
  document.getElementById('track-url-input').focus();
}

function closeTrackModal() {
  document.getElementById('track-modal-backdrop').hidden = true;
}

function bindEvents() {
  // Theme toggle
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // Brand logo resets to default deals view
  document.getElementById('brand-logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    resetCatalogFilters();
    switchTab('deals');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Interactive KPI strip shortcuts
  document.getElementById('kpi-strip')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kpi-action]');
    if (!btn) return;
    const action = btn.dataset.kpiAction;
    if (action === 'stores') {
      state.storesCampaignFilter = 'all';
      switchTab('stores');
      return;
    }
    if (action === 'inflated') {
      state.filters.cyber = 'cyber_trap';
      syncFilterInputsFromState();
      switchTab('anticyber');
      return;
    }
    if (action === 'deals') {
      state.filters.verdict = 'buy';
      state.filters.sort = 'featured';
      syncFilterInputsFromState();
      switchTab('deals');
      return;
    }
    if (action === 'drops') {
      state.filters.verdict = 'all';
      state.filters.sort = 'drop_today';
      syncFilterInputsFromState();
      switchTab('deals');
      return;
    }
    resetCatalogFilters();
    switchTab('deals');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // View toggle (Table vs Grid)
  document.querySelectorAll('#catalog-view-controls .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      syncViewModeButtons();
      renderCatalog();
    });
  });

  // Mobile collapsible filters toggle
  document.getElementById('filters-mobile-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('filters-panel');
    if (!panel) return;
    setMobileFiltersOpen(!panel.classList.contains('mobile-filters-open'));
  });

  // Global search (typing filters catalog; clear button resets; submit runs live search only in server mode)
  const searchInput = document.getElementById('global-search-input');
  const clearSearchBtn = document.getElementById('global-search-clear-btn');
  searchInput.addEventListener('input', () => {
    state.filters.search = searchInput.value;
    state.pageSize = 60;
    if (clearSearchBtn) clearSearchBtn.hidden = !searchInput.value;
    if (['deals', 'bugazos', 'anticyber'].includes(state.activeTab)) {
      renderCatalog();
    }
  });

  clearSearchBtn?.addEventListener('click', () => {
    searchInput.value = '';
    state.filters.search = '';
    clearSearchBtn.hidden = true;
    state.pageSize = 60;
    if (['deals', 'bugazos', 'anticyber'].includes(state.activeTab)) {
      renderCatalog();
    }
    searchInput.focus();
  });

  document.getElementById('global-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    if (state.mode === 'server') {
      runLiveSearch(q);
    } else {
      state.filters.search = q;
      if (clearSearchBtn) clearSearchBtn.hidden = false;
      if (!['deals', 'bugazos', 'anticyber'].includes(state.activeTab)) {
        switchTab('deals');
      } else {
        renderCatalog();
      }
      document.getElementById('panel-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Wallet cards toggle ("¿Qué tarjetas tienes?")
  document.getElementById('wallet-cards-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card]');
    if (!btn) return;
    const card = btn.dataset.card;
    const idx = state.userCards.indexOf(card);
    if (idx >= 0) state.userCards.splice(idx, 1);
    else state.userCards.push(card);
    saveUserCards();
    renderWalletCardsUi();
    renderAll();
  });

  // Anti-Cyber subfilter chips
  document.getElementById('anticyber-subfilters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cyber]');
    if (!btn) return;
    state.filters.cyber = btn.dataset.cyber;
    state.pageSize = 60;
    document.querySelectorAll('#anticyber-subfilters .chip-btn').forEach((b) =>
      b.classList.toggle('active', b === btn)
    );
    renderCatalog();
  });

  // Multi-Tienda search input
  document.getElementById('groups-search-input')?.addEventListener('input', (e) => {
    state.groupsQuery = e.target.value;
    renderGroupsPanel();
  });

  // Active campaigns strip "Ver en Tiendas Perú" button
  document.getElementById('campaigns-view-all-btn')?.addEventListener('click', () => {
    state.storesCampaignFilter = 'campaign';
    switchTab('stores');
  });

  // Tiendas Perú campaign filter chips
  document.getElementById('stores-campaign-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-store-filter]');
    if (!btn) return;
    state.storesCampaignFilter = btn.dataset.storeFilter;
    renderStoresPanel();
  });

  // Category chips delegation
  document.getElementById('category-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    state.filters.category = btn.dataset.category;
    state.pageSize = 60;
    document.querySelectorAll('#category-chips .chip-btn').forEach((b) =>
      b.classList.toggle('active', b === btn)
    );
    populateBrandOptions();
    renderCatalog();
  });

  // Filter dropdowns, price range & stock toggle
  document.getElementById('filter-store').addEventListener('change', (e) => {
    state.filters.store = e.target.value;
    state.pageSize = 60;
    populateBrandOptions();
    renderCatalog();
  });
  document.getElementById('filter-brand').addEventListener('change', (e) => {
    state.filters.brand = e.target.value;
    state.pageSize = 60;
    renderCatalog();
  });
  document.getElementById('filter-verdict').addEventListener('change', (e) => {
    state.filters.verdict = e.target.value;
    state.pageSize = 60;
    renderCatalog();
  });
  document.getElementById('filter-sort').addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    renderCatalog();
  });
  document.getElementById('filter-min-price')?.addEventListener('input', (e) => {
    state.filters.minPrice = e.target.value;
    state.pageSize = 60;
    renderCatalog();
  });
  document.getElementById('filter-max-price').addEventListener('input', (e) => {
    state.filters.maxPrice = e.target.value;
    state.pageSize = 60;
    renderCatalog();
  });
  document.getElementById('filter-in-stock')?.addEventListener('change', (e) => {
    state.filters.inStockOnly = e.target.checked;
    state.pageSize = 60;
    renderCatalog();
  });

  document.getElementById('clear-filters-btn').addEventListener('click', resetCatalogFilters);

  document.getElementById('empty-live-search-btn').addEventListener('click', () => {
    if (state.mode === 'server') {
      runLiveSearch(state.filters.search || 'laptop');
    } else {
      resetCatalogFilters();
    }
  });

  document.getElementById('load-more-btn').addEventListener('click', () => {
    state.pageSize += 60;
    renderCatalog();
  });

  // Floating Back-to-Top button
  const backToTopBtn = document.getElementById('back-to-top-btn');
  if (backToTopBtn) {
    window.addEventListener(
      'scroll',
      () => {
        backToTopBtn.hidden = window.scrollY < 520;
      },
      { passive: true }
    );
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Click delegation on catalog table, cards & watchlist
  document.addEventListener('click', (e) => {
    const starBtn = e.target.closest('[data-star-id]');
    if (starBtn) {
      e.stopPropagation();
      toggleStar(starBtn.dataset.starId);
      return;
    }
    const rowOrCard = e.target.closest('[data-product-id]');
    if (rowOrCard) {
      openProductDrawer(rowOrCard.dataset.productId);
    }
  });

  // Daily update modal & actions
  document.getElementById('refresh-daily-btn').addEventListener('click', openUpdateModal);
  document.getElementById('close-update-modal-btn').addEventListener('click', closeUpdateModal);
  document.getElementById('update-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'update-modal-backdrop') closeUpdateModal();
  });
  document.getElementById('force-reload-data-btn').addEventListener('click', forceReloadLatestData);
  document.getElementById('run-local-full-btn').addEventListener('click', () => startLocalDailyScrape(false));
  document.getElementById('run-local-quick-btn').addEventListener('click', () => startLocalDailyScrape(true));
  document.getElementById('run-gh-full-btn').addEventListener('click', () => dispatchGitHubUpdate(false));
  document.getElementById('run-gh-quick-btn').addEventListener('click', () => dispatchGitHubUpdate(true));
  document.getElementById('watch-gh-run-btn').addEventListener('click', () => {
    closeUpdateModal();
    watchGitHubRunUntilDeployed(state.meta?.lastUpdatedAt || '', Date.now());
  });
  document.getElementById('save-gh-token-btn').addEventListener('click', () => {
    const input = document.getElementById('gh-token-input');
    const raw = input.value.trim();
    if (!raw || raw.startsWith('••')) {
      document.getElementById('gh-token-feedback').textContent = 'Pega un token válido (empieza con github_pat_ o ghp_).';
      return;
    }
    localStorage.setItem(GH_TOKEN_KEY, raw);
    refreshGhTokenUi();
    document.getElementById('gh-token-details').open = false;
    showToast('Token guardado solo en tu navegador. ¡Botón en 1 clic activado!');
    });
   document.getElementById('clear-gh-token-btn').addEventListener('click', () => {
    localStorage.removeItem(GH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_GH_TOKEN_KEY);
    refreshGhTokenUi();
    showToast('Token eliminado de este navegador.');
  });
  document.getElementById('exit-admin-mode-btn')?.addEventListener('click', () => {
    try {
      localStorage.setItem(ADMIN_MODE_KEY, 'hidden');
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
    const adminBox = document.getElementById('gh-admin-controls');
    if (adminBox) adminBox.hidden = true;
    showToast('Controles de administrador ocultos. Entra con ?admin=1 para volver a verlos.');
  });
  // Persist ?admin=1 / ?admin=0 if present in URL on initial load
  isAdminMode();
  
  // Track URL modal
  document.getElementById('open-track-modal-btn').addEventListener('click', openTrackModal);
  document.getElementById('watchlist-add-url-btn').addEventListener('click', openTrackModal);
  document.getElementById('close-track-modal-btn').addEventListener('click', closeTrackModal);
  document.getElementById('cancel-track-modal-btn').addEventListener('click', closeTrackModal);
  document.getElementById('track-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'track-modal-backdrop') closeTrackModal();
  });
  document.getElementById('track-url-form').addEventListener('submit', submitTrackUrl);

  // Watchlist picker, clear button & add query form
  document.getElementById('watchlist-picker-input')?.addEventListener('input', renderWatchlistPicker);
  document.getElementById('watchlist-clear-all-btn')?.addEventListener('click', clearAllWatchlist);
  document.getElementById('add-query-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('new-query-input');
    addCustomQuery(input.value);
    input.value = '';
  });

  // Live search form & quick chips
  document.getElementById('live-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runLiveSearch(document.getElementById('live-search-input').value);
  });
  document.querySelectorAll('.quick-q').forEach((btn) => {
    btn.addEventListener('click', () => runLiveSearch(btn.dataset.q));
  });

  // Drawer controls
  document.getElementById('drawer-close-btn').addEventListener('click', closeProductDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeProductDrawer);
  document.getElementById('drawer-star-btn').addEventListener('click', () => {
    if (state.selectedProduct) toggleStar(state.selectedProduct.id);
  });
  document.getElementById('drawer-whatsapp-btn')?.addEventListener('click', shareSelectedProductWhatsApp);
  document.getElementById('drawer-copy-link-btn')?.addEventListener('click', copySelectedProductLink);
  document.getElementById('drawer-save-target-btn').addEventListener('click', saveTargetPrice);
  document.getElementById('drawer-refresh-btn').addEventListener('click', refreshSingleProduct);

  document.querySelectorAll('#chart-range-controls .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.chartRange = btn.dataset.range;
      document.querySelectorAll('#chart-range-controls .seg-btn').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      if (state.selectedProduct) {
        renderHistoryChart(
          document.getElementById('drawer-chart-container'),
          state.selectedHistory,
          state.selectedProduct.stats,
          state.chartRange
        );
      }
    });
  });

  // Onboarding Guided Tour controls
  document.getElementById('open-tour-btn')?.addEventListener('click', () => startTour(0));
  document.getElementById('tour-next-btn')?.addEventListener('click', () => {
    if (tourIndex < TOUR_STEPS.length - 1) {
      tourIndex += 1;
      renderTourStep();
    } else {
      closeTour(true);
    }
  });
  document.getElementById('tour-prev-btn')?.addEventListener('click', () => {
    if (tourIndex > 0) {
      tourIndex -= 1;
      renderTourStep();
    }
  });
  document.getElementById('tour-skip-btn')?.addEventListener('click', () => closeTour(true));
  document.getElementById('tour-skip-inline-btn')?.addEventListener('click', () => closeTour(true));
  const scheduleTourReposition = () => {
    if (!tourActive) return;
    requestAnimationFrame(() => {
      if (tourActive) positionTourElements();
    });
  };
  window.addEventListener('resize', scheduleTourReposition);
  window.addEventListener('scroll', scheduleTourReposition, { passive: true });
  document.querySelector('.tabs-list')?.addEventListener('scroll', scheduleTourReposition, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProductDrawer();
      closeTrackModal();
      closeUpdateModal();
      if (tourActive) closeTour(true);
    }
  });
}

// ============================================================================
// Interactive Onboarding Guided Tour (First Visit + Replay via "?")
// ============================================================================
const TOUR_DONE_KEY = 'chapaaltoque_pe_tour_done_v1';
let tourActive = false;
let tourIndex = 0;
let tourExpandedMobileFilters = false;

const TOUR_STEPS = [
  {
    selector: null,
    title: '¡Bienvenido a ChapaAlToque PE!',
    body: `
      <p>Monitoreamos <strong>precios históricos reales</strong> en <strong>30 tiendas del Perú</strong> para que sepas qué descuentos son verdaderos y cuáles están inflados.</p>
      <p>Te mostramos en 30 segundos cómo aprovechar cada sección. Si ya conoces la página, puedes saltarla ahora mismo.</p>
    `,
    nextLabel: 'Empezar guía →',
    showInlineSkip: true
  },
  {
    selector: '.tabs-list',
    tab: 'deals',
    title: 'Secciones principales',
    body: `
      <ul>
        <li><strong>Mejores Ofertas:</strong> selección variada y ranking según <em>Deal Score</em> real.</li>
        <li><strong>⚡ Bugazos:</strong> liquidaciones extremas o posibles errores de precio.</li>
        <li><strong>Anti-Cyber:</strong> separa rebajas reales de precios inflados antes de oferta.</li>
        <li><strong>Multi-Tienda:</strong> compara el mismo modelo entre distintas tiendas peruanas.</li>
      </ul>
    `
  },
  {
    selector: '.cards-wallet-row',
    tab: 'deals',
    requiresFiltersOpen: true,
    title: '¿Qué tarjetas bancarias tienes?',
    body: `
      <p>Marca si tienes <strong>BCP</strong>, <strong>CMR</strong>, <strong>Tarjeta Oh!</strong>, <strong>Interbank</strong>, <strong>BBVA</strong> o <strong>Cencosud</strong>.</p>
      <p>Toda la web recalculará precios, ordenamientos y comparativas con el <strong>precio real que tú pagarías</strong>.</p>
    `
  },
  {
    selector: '.filter-row-controls',
    tab: 'deals',
    requiresFiltersOpen: true,
    title: 'Filtra por Tienda, Marca y Presupuesto',
    body: `
      <p>Filtra por tienda peruana, elige entre <strong>Marcas reconocidas</strong> o <strong>Marcas genéricas</strong>, fija tu rango de precio en soles (S/) y ordena por destacados variados, mejor score o menor precio.</p>
    `
  },
  {
    selector: () =>
      state.viewMode === 'table'
        ? document.querySelector('#deals-table tbody tr') || document.querySelector('#products-table-wrap')
        : document.querySelector('#products-grid-wrap .deal-card') || document.querySelector('#products-grid-wrap'),
    tab: 'deals',
    title: 'Historial, gráficos y compartir por WhatsApp',
    body: `
      <p>Haz clic en <strong>cualquier producto</strong> para abrir su ficha completa: gráfico de historial de precios, mínimo histórico, comparativa exacta en otras tiendas y botón para <strong>compartir por WhatsApp</strong>.</p>
    `
  },
  {
    selector: '#tab-watchlist',
    tab: 'deals',
    title: 'Mi Lista privada y búsquedas rápidas',
    body: `
      <p>Usa la estrella (<strong>☆</strong>) o el buscador dentro de <strong>Mi Lista</strong> para guardar tus productos favoritos, fijar un <strong>precio objetivo</strong> y crear filtros rápidos.</p>
      <p>Tu lista es <strong>100% privada en tu navegador</strong> (nadie más la ve al compartir el link).</p>
    `
  },
  {
    selector: '#topbar-telegram-btn',
    tab: 'deals',
    title: 'Alertas gratis en Telegram y actualización automática',
    body: `
      <p>Los precios y el stock se actualizan solos <strong>cada ~2 horas</strong> (de 7:00 AM a 10:00 PM hora Lima).</p>
      <p>Únete gratis al canal <strong>Telegram (@chapaaltoque_pe)</strong> desde este botón para recibir bugazos y mínimos históricos al instante. Siempre puedes repetir esta guía desde el ícono <strong>?</strong>.</p>
    `,
    nextLabel: '¡Listo, empezar!'
  }
];

function getTourTargetElement(step) {
  if (!step || !step.selector) return null;
  if (typeof step.selector === 'function') return step.selector();
  return document.querySelector(step.selector);
}

function maybeStartFirstVisitTour() {
  try {
    if (localStorage.getItem(TOUR_DONE_KEY) === '1') return;
  } catch {
    return;
  }
  setTimeout(() => startTour(0), 450);
}

function startTour(stepIdx = 0) {
  tourActive = true;
  tourIndex = Math.max(0, Math.min(stepIdx, TOUR_STEPS.length - 1));
  document.getElementById('tour-overlay').hidden = false;
  renderTourStep();
}

function closeTour(markDone = true) {
  tourActive = false;
  if (tourExpandedMobileFilters) {
    setMobileFiltersOpen(false);
    tourExpandedMobileFilters = false;
  }
  const overlay = document.getElementById('tour-overlay');
  const spotlight = document.getElementById('tour-spotlight');
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.remove('has-spotlight');
  }
  if (spotlight) spotlight.hidden = true;
  if (markDone) {
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1');
    } catch {
      // ignore
    }
  }
}

function renderTourStep() {
  const step = TOUR_STEPS[tourIndex];
  if (!step) return closeTour(true);

  if (step.tab && state.activeTab !== step.tab) {
    switchTab(step.tab);
  }

  // On mobile, temporarily expand the collapsible filters when spotlighting wallet/filter controls
  const filtersPanel = document.getElementById('filters-panel');
  if (step.requiresFiltersOpen && filtersPanel && !filtersPanel.classList.contains('mobile-filters-open')) {
    setMobileFiltersOpen(true);
    tourExpandedMobileFilters = true;
  } else if (!step.requiresFiltersOpen && tourExpandedMobileFilters) {
    setMobileFiltersOpen(false);
    tourExpandedMobileFilters = false;
  }

  setText('tour-step-counter', `Paso ${tourIndex + 1} de ${TOUR_STEPS.length}`);
  setText('tour-title', step.title);
  document.getElementById('tour-body').innerHTML = step.body;

  const prevBtn = document.getElementById('tour-prev-btn');
  const nextBtn = document.getElementById('tour-next-btn');
  const inlineSkip = document.getElementById('tour-skip-inline-btn');

  prevBtn.hidden = tourIndex === 0;
  inlineSkip.hidden = !step.showInlineSkip;
  nextBtn.textContent =
    step.nextLabel || (tourIndex === TOUR_STEPS.length - 1 ? '¡Listo, empezar!' : 'Siguiente →');

  const dotsEl = document.getElementById('tour-dots');
  dotsEl.innerHTML = TOUR_STEPS.map(
    (_, i) => `<span class="tour-dot ${i === tourIndex ? 'active' : ''}"></span>`
  ).join('');

  const target = getTourTargetElement(step);
  if (target && target.offsetParent !== null) {
    // Scroll target cleanly into view accounting for sticky topbar (64px)
    const rect = target.getBoundingClientRect();
    const isFixedTopbarChild = Boolean(target.closest('.topbar'));
    if (!isFixedTopbarChild) {
      const targetTopDoc = rect.top + window.scrollY;
      const desiredScrollY = Math.max(0, targetTopDoc - 140);
      window.scrollTo({ top: desiredScrollY, behavior: 'auto' });
    }
    target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    positionTourElements();
    requestAnimationFrame(() => {
      if (tourActive) positionTourElements();
    });
    return;
  }

  positionTourElements();
}

function positionTourElements() {
  const step = TOUR_STEPS[tourIndex];
  const overlay = document.getElementById('tour-overlay');
  const spotlight = document.getElementById('tour-spotlight');
  const card = document.getElementById('tour-card');
  if (!step || !overlay || !spotlight || !card) return;

  const target = getTourTargetElement(step);
  if (!target || target.offsetParent === null) {
    overlay.classList.remove('has-spotlight');
    spotlight.hidden = true;
    card.classList.add('centered');
    card.style.top = '';
    card.style.left = '';
    return;
  }

  const rect = target.getBoundingClientRect();
  const pad = 6;
  const spotTop = Math.max(4, rect.top - pad);
  const spotLeft = Math.max(4, rect.left - pad);
  const spotW = Math.min(window.innerWidth - spotLeft - 4, rect.width + pad * 2);
  const spotH = Math.min(window.innerHeight - spotTop - 4, rect.height + pad * 2);

  overlay.classList.add('has-spotlight');
  spotlight.hidden = false;
  spotlight.style.top = `${spotTop}px`;
  spotlight.style.left = `${spotLeft}px`;
  spotlight.style.width = `${spotW}px`;
  spotlight.style.height = `${spotH}px`;

  card.classList.remove('centered');

  if (window.innerWidth <= 640) {
    card.style.top = '';
    card.style.left = '';
    return;
  }

  const cardRect = card.getBoundingClientRect();
  const cardW = cardRect.width || 400;
  const cardH = cardRect.height || 230;
  const gap = 14;

  let top = spotTop + spotH + gap;
  if (top + cardH > window.innerHeight - 12) {
    top = spotTop - cardH - gap;
  }
  if (top < 12) {
    top = Math.max(12, Math.min(window.innerHeight - cardH - 12, spotTop + 12));
  }

  let left = spotLeft;
  if (left + cardW > window.innerWidth - 14) {
    left = window.innerWidth - cardW - 14;
  }
  left = Math.max(14, left);

  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
}

function getStorePillStyle(storeId) {
  const s = state.storeMap[storeId];
  if (s?.badgeBg && s?.badgeText) {
    return `background:${s.badgeBg};color:${s.badgeText};`;
  }
  return 'background:var(--bg-subtle);color:var(--ink-primary);';
}

function getScoreColor(score) {
  if (score >= 80) return 'var(--emerald)';
  if (score >= 62) return 'var(--sky)';
  if (score >= 45) return 'var(--ink-muted)';
  return 'var(--crimson)';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 3600);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

init();
