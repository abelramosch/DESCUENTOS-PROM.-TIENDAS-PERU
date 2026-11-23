import { formatPen, renderHistoryChart, renderSparkline } from './chart.js';

const LOCAL_WATCHLIST_KEY = 'chapaaltoque_pe_watchlist_v1';
const LEGACY_WATCHLIST_KEYS = ['nadamenos_pe_watchlist_v1', 'precioreal_pe_watchlist_v1'];
const THEME_KEY = 'chapaaltoque_pe_theme';
const GH_TOKEN_KEY = 'chapaaltoque_pe_gh_token';
const LEGACY_GH_TOKEN_KEY = 'nadamenos_pe_gh_token';
const WORKFLOW_FILE = 'daily-scrape.yml';
const DEFAULT_GH_REPO = { owner: 'abelramosch', repo: 'DESCUENTOS-PROM.-TIENDAS-PERU' };

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

const state = {
  mode: 'static', // 'server' or 'static'
  meta: null,
  catalog: [],
  historyCache: {},
  stores: [],
  storeMap: {},
  categories: [],
  watchlist: { urls: [], customQueries: [], starredIds: [], targetPrices: {} },
  isUpdating: false,
  ghPollTimer: null,

  // UI state
  activeTab: 'deals', // deals | drops | watchlist | live-search | stores
  viewMode: 'table',  // table | grid
  pageSize: 60,
  filters: {
    search: '',
    category: 'all',
    store: 'all',
    verdict: 'all',
    sort: 'score',
    maxPrice: ''
  },
  selectedProduct: null,
  selectedHistory: [],
  chartRange: 'all'
};

// ============================================================================
// Bootstrap & Data Loading
// ============================================================================
async function init() {
  initTheme();
  bindEvents();
  await loadInitialData();
  renderAll();
}

async function loadInitialData() {
  const cacheBust = `t=${Date.now()}`;
  try {
    const healthRes = await fetch(`/api/health?${cacheBust}`, { cache: 'no-store' });
    if (healthRes.ok) {
      state.mode = 'server';
      const dataRes = await fetch(`/api/catalog?${cacheBust}`, { cache: 'no-store' });
      const payload = await dataRes.json();
      state.meta = payload.meta;
      state.catalog = payload.catalog || [];
      state.watchlist = payload.watchlist || state.watchlist;
      state.stores = payload.stores || [];
      state.categories = payload.categories || [];
    } else {
      throw new Error('Static fallback');
    }
  } catch {
    state.mode = 'static';
    const [catalog, meta, history, watchlistFile] = await Promise.all([
      fetchJsonSafe(`./data/catalog.json?${cacheBust}`, []),
      fetchJsonSafe(`./data/meta.json?${cacheBust}`, {}),
      fetchJsonSafe(`./data/history.json?${cacheBust}`, {}),
      fetchJsonSafe(`./data/watchlist.json?${cacheBust}`, { urls: [], customQueries: [], starredIds: [], targetPrices: {} })
    ]);
    state.catalog = catalog;
    state.meta = meta;
    state.historyCache = history;
    state.watchlist = mergeLocalWatchlist(watchlistFile);
    state.stores = Object.values(meta?.storesStatus || {}).map((s) => ({
      id: s.id,
      name: s.name,
      engine: s.engine,
      currency: s.currency,
      enabled: true
    }));
    state.categories = [
      { id: 'tecnologia', label: 'Laptops & PC' },
      { id: 'televisores', label: 'Televisores' },
      { id: 'celulares', label: 'Celulares' },
      { id: 'audio', label: 'Audio' },
      { id: 'gaming', label: 'Gaming' },
      { id: 'electro', label: 'Electrodomésticos' },
      { id: 'hogar', label: 'Hogar & Herramientas' },
      { id: 'deporte', label: 'Calzado & Deporte' },
      { id: 'belleza', label: 'Perfumes & Belleza' },
      { id: 'personal', label: 'Mi Seguimiento' }
    ];
  }

  state.storeMap = Object.fromEntries(state.stores.map((s) => [s.id, s]));
  populateFilterOptions();

  const footerMode = document.getElementById('footer-mode-info');
  if (footerMode) {
    footerMode.textContent =
      state.mode === 'server'
        ? `Modo servidor local activo · T.C. USD/PEN: S/ ${state.meta?.usdToPen || '3.75'}`
        : `Modo estático (GitHub Pages) · Actualización automática diaria`;
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

function mergeLocalWatchlist(base) {
  try {
    const raw =
      localStorage.getItem(LOCAL_WATCHLIST_KEY) ||
      LEGACY_WATCHLIST_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ||
      'null';
    const saved = JSON.parse(raw);
    if (!saved) return base;
    return {
      urls: base.urls || [],
      customQueries: [...new Set([...(base.customQueries || []), ...(saved.customQueries || [])])],
      starredIds: [...new Set([...(base.starredIds || []), ...(saved.starredIds || [])])],
      targetPrices: { ...(base.targetPrices || {}), ...(saved.targetPrices || {}) }
    };
  } catch {
    return base;
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
  // Category chips
  const chipsEl = document.getElementById('category-chips');
  const allCats = [{ id: 'all', label: 'Todas las categorías' }, ...state.categories];
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
}

function getFilteredProducts() {
  const { search, category, store, verdict, sort, maxPrice } = state.filters;
  const q = search.trim().toLowerCase();
  const maxP = Number(maxPrice) > 0 ? Number(maxPrice) : Infinity;

  let list = state.catalog.filter((p) => {
    if (state.activeTab === 'drops') {
      const isDropOrAtl =
        p.stats.delta24h < 0 || p.stats.isAllTimeLow || p.stats.verdict === 'great_deal';
      if (!isDropOrAtl) return false;
    }

    if (category !== 'all' && p.category !== category) return false;
    if (store !== 'all' && p.storeId !== store) return false;
    if (p.effectivePrice > maxP) return false;

    if (verdict === 'buy') {
      if (!['all_time_low', 'great_deal', 'good_deal'].includes(p.stats.verdict)) return false;
    } else if (verdict !== 'all' && p.stats.verdict !== verdict) {
      return false;
    }

    if (q) {
      const hay = `${p.title} ${p.brand} ${p.storeName} ${p.sku}`.toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      for (const t of terms) {
        if (!hay.includes(t)) return false;
      }
    }
    return true;
  });

  // Sort
  list.sort((a, b) => {
    switch (sort) {
      case 'real_discount':
        return (b.stats.realDiscountPct || b.stats.storeDiscountPct) - (a.stats.realDiscountPct || a.stats.storeDiscountPct);
      case 'store_discount':
        return b.stats.storeDiscountPct - a.stats.storeDiscountPct;
      case 'drop_today':
        return a.stats.delta24hPct - b.stats.delta24hPct || b.stats.dealScore - a.stats.dealScore;
      case 'price_asc':
        return a.effectivePrice - b.effectivePrice;
      case 'price_desc':
        return b.effectivePrice - a.effectivePrice;
      case 'score':
      default:
        return b.stats.dealScore - a.stats.dealScore || b.stats.storeDiscountPct - a.stats.storeDiscountPct;
    }
  });

  return list;
}

// ============================================================================
// Rendering
// ============================================================================
function renderAll() {
  renderKpis();
  renderActivePanel();
}

function renderKpis() {
  const total = state.catalog.length;
  const activeStores = new Set(state.catalog.map((p) => p.storeId)).size;
  const worthBuying = state.catalog.filter((p) =>
    ['all_time_low', 'great_deal'].includes(p.stats.verdict)
  ).length;
  const droppedToday = state.catalog.filter((p) => p.stats.delta24h < 0 || p.stats.isAllTimeLow).length;
  const inflated = state.catalog.filter((p) => p.stats.isFakeDiscount).length;

  setText('kpi-total', total.toLocaleString('es-PE'));
  setText('kpi-stores', activeStores);
  setText('kpi-deals', worthBuying.toLocaleString('es-PE'));
  setText('kpi-drops', droppedToday.toLocaleString('es-PE'));
  setText('kpi-inflated', inflated.toLocaleString('es-PE'));

  setText('badge-drops', droppedToday);
  setText('badge-watchlist', getWatchlistProducts().length);

  const summary = document.getElementById('last-updated-summary');
  if (state.meta?.lastUpdatedAt) {
    const dt = new Date(state.meta.lastUpdatedAt);
    const formatted = dt.toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    summary.textContent = `Última actualización: ${formatted} · ${activeStores} tiendas activas en Perú · Tipo de cambio ref. S/ ${state.meta.usdToPen || '3.75'}`;
  } else {
    summary.textContent = 'Haz clic en "Actualizar hoy" para descargar los precios del día en Perú.';
  }
}

function renderActivePanel() {
  const isCatalog = state.activeTab === 'deals' || state.activeTab === 'drops';
  document.getElementById('panel-catalog').hidden = !isCatalog;
  document.getElementById('catalog-view-controls').hidden = !isCatalog;
  document.getElementById('panel-watchlist').hidden = state.activeTab !== 'watchlist';
  document.getElementById('panel-live-search').hidden = state.activeTab !== 'live-search';
  document.getElementById('panel-stores').hidden = state.activeTab !== 'stores';

  if (isCatalog) renderCatalog();
  if (state.activeTab === 'watchlist') renderWatchlist();
  if (state.activeTab === 'stores') renderStoresPanel();
}

function renderCatalog() {
  const filtered = getFilteredProducts();
  const visible = filtered.slice(0, state.pageSize);

  setText('results-count', `${filtered.length.toLocaleString('es-PE')} productos`);
  const hasFilters =
    state.filters.search ||
    state.filters.category !== 'all' ||
    state.filters.store !== 'all' ||
    state.filters.verdict !== 'all' ||
    state.filters.maxPrice;
  document.getElementById('clear-filters-btn').hidden = !hasFilters;

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
      const targetPrice = targets[p.id];
      const targetHit = targetPrice && p.effectivePrice <= targetPrice;
      const storeStyle = getStorePillStyle(p.storeId);
      const scoreColor = getScoreColor(s.dealScore);

      const discountHtml =
        s.isFakeDiscount
          ? `<span class="discount-tag warn mono" title="Descuento inflado respecto a su historial">⚠ -${s.storeDiscountPct}%?</span>`
          : s.daysTracked >= 2 && s.realDiscountPct >= 3
            ? `<span class="discount-tag mono" title="Descuento real frente a su mediana histórica">-${s.realDiscountPct}% real</span>`
            : s.storeDiscountPct > 0
              ? `<span class="discount-tag mono" title="Descuento publicado frente al precio lista">-${s.storeDiscountPct}%</span>`
              : `<span class="discount-tag neutral mono">0%</span>`;

      const deltaHtml =
        s.delta24h < 0
          ? `<span class="delta-line mono positive">▼ ${formatPen(Math.abs(s.delta24h))} hoy</span>`
          : s.delta24h > 0
            ? `<span class="delta-line mono negative">▲ +${formatPen(s.delta24h)} hoy</span>`
            : '';

      return `
        <tr data-product-id="${escapeHtml(p.id)}">
          <td>
            <button type="button" class="star-btn ${isStarred ? 'starred' : ''}" data-star-id="${escapeHtml(p.id)}" title="${isStarred ? 'Quitar de Mi Lista' : 'Guardar en Mi Lista'}">
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
                  ${targetHit ? `<span class="target-hit-badge">¡Meta ≤ ${formatPen(targetPrice)}!</span>` : ''}
                </span>
              </div>
            </div>
          </td>
          <td>
            <span class="store-pill" style="${storeStyle}">${escapeHtml(p.storeName)}</span>
          </td>
          <td class="num">
            <div class="price-stack">
              <span class="price-now mono">${formatPen(p.price)}</span>
              ${p.cardPrice ? `<span class="price-card-mini mono">${escapeHtml(p.cardName || 'Tarjeta')}: ${formatPen(p.cardPrice)}</span>` : ''}
              ${p.listPrice > p.price ? `<span class="price-old mono">${formatPen(p.listPrice)}</span>` : ''}
            </div>
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
      const targetPrice = targets[p.id];
      const targetHit = targetPrice && (p.effectivePrice || p.price) <= targetPrice;

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
              ${s.storeDiscountPct > 0 ? `<span class="discount-tag mono">-${s.storeDiscountPct}%</span>` : ''}
            </div>
            <h3 class="card-title">${escapeHtml(p.title)}</h3>
            ${targetHit ? `<span class="target-hit-badge">¡Llegó a tu meta ≤ ${formatPen(targetPrice)}!</span>` : ''}
            <div class="card-price-block">
              <div>
                <div class="price-now mono">${formatPen(p.price)}</div>
                ${p.cardPrice ? `<div class="price-card-mini mono">${escapeHtml(p.cardName || 'Tarjeta')}: ${formatPen(p.cardPrice)}</div>` : ''}
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
                  <span class="mono small" style="font-weight:700;">Score ${s.dealScore}</span>
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
// Watchlist View
// ============================================================================
function getWatchlistProducts() {
  const starred = new Set(state.watchlist.starredIds || []);
  const trackedUrls = new Set((state.watchlist.urls || []).map((u) => (typeof u === 'string' ? u : u.url)));
  return state.catalog.filter((p) => starred.has(p.id) || p.isCustomWatch || trackedUrls.has(p.url));
}

function renderWatchlist() {
  const queriesEl = document.getElementById('custom-queries-list');
  const queries = state.watchlist.customQueries || [];
  if (!queries.length) {
    queriesEl.innerHTML = '<span class="muted small">Aún no agregas búsquedas automáticas personalizadas. Agrega un término arriba para que se rastree cada día en todas las tiendas.</span>';
  } else {
    queriesEl.innerHTML = queries
      .map(
        (q) => `
        <span class="query-tag">
          <span>${escapeHtml(q)}</span>
          <button type="button" data-remove-query="${escapeHtml(q)}" title="Quitar búsqueda">×</button>
        </span>
      `
      )
      .join('');
    queriesEl.querySelectorAll('[data-remove-query]').forEach((btn) => {
      btn.addEventListener('click', () => removeCustomQuery(btn.dataset.removeQuery));
    });
  }

  const wrap = document.getElementById('watchlist-items-wrap');
  const list = getWatchlistProducts();
  if (!list.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <h3>Tu lista de seguimiento está vacía</h3>
        <p>Haz clic en la estrella (☆) de cualquier producto del catálogo o pega una URL de cualquier tienda peruana para seguir su precio histórico.</p>
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

// ============================================================================
// Stores Panel
// ============================================================================
function renderStoresPanel() {
  const grid = document.getElementById('stores-grid');
  const statusMap = state.meta?.storesStatus || {};
  const storeStats = {};

  for (const p of state.catalog) {
    if (!storeStats[p.storeId]) {
      storeStats[p.storeId] = { count: 0, discountSum: 0, deals: 0 };
    }
    storeStats[p.storeId].count += 1;
    storeStats[p.storeId].discountSum += p.stats.storeDiscountPct || 0;
    if (['all_time_low', 'great_deal'].includes(p.stats.verdict)) {
      storeStats[p.storeId].deals += 1;
    }
  }

  const list = state.stores
    .filter((s) => s.enabled !== false)
    .sort((a, b) => (storeStats[b.id]?.count || 0) - (storeStats[a.id]?.count || 0));

  grid.innerHTML = list
    .map((store) => {
      const st = storeStats[store.id] || { count: 0, discountSum: 0, deals: 0 };
      const avgDisc = st.count ? Math.round(st.discountSum / st.count) : 0;
      const pillStyle = getStorePillStyle(store.id);
      const isActive = st.count > 0;
      const engineLabel =
        store.engine === 'vtex'
          ? 'API VTEX'
          : store.engine === 'falabella'
            ? 'SSR Falabella'
            : store.engine === 'prestashop'
              ? 'API PrestaShop'
              : 'Catálogo Web';

      return `
        <div class="store-card" data-jump-store="${escapeHtml(store.id)}">
          <div class="store-card-top">
            <span class="store-pill" style="${pillStyle}">${escapeHtml(store.name)}</span>
            <span class="small muted">
              <span class="status-dot ${isActive ? 'ok' : 'off'}"></span>
              ${isActive ? 'Activa' : 'Sin datos'}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div>
              <div class="mono" style="font-size:1.3rem;font-weight:800;">${st.count}</div>
              <div class="small muted">productos hoy</div>
            </div>
            <div style="text-align:right;">
              <div class="mono positive" style="font-weight:700;">${st.deals} ofertas</div>
              <div class="small muted">prom. -${avgDisc}%</div>
            </div>
          </div>
          <div class="small muted mono" style="border-top:1px solid var(--border-hairline);padding-top:8px;display:flex;justify-content:space-between;">
            <span>${engineLabel}</span>
            <span>${store.currency === 'USD' ? 'USD → S/' : 'PEN (S/)'}</span>
          </div>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('[data-jump-store]').forEach((card) => {
    card.addEventListener('click', () => {
      state.filters.store = card.dataset.jumpStore;
      document.getElementById('filter-store').value = state.filters.store;
      switchTab('deals');
    });
  });
}

// ============================================================================
// Product Detail Drawer
// ============================================================================
async function openProductDrawer(productId) {
  const product = state.catalog.find((p) => p.id === productId);
  if (!product) return;

  state.selectedProduct = product;
  state.chartRange = 'all';

  let history = state.historyCache[productId] || [];
  let related = [];

  if (state.mode === 'server') {
    try {
      const res = await fetch(`/api/product/${encodeURIComponent(productId)}`);
      if (res.ok) {
        const data = await res.json();
        state.selectedProduct = data.product || product;
        history = data.history || [];
        related = data.related || [];
        state.historyCache[productId] = history;
      }
    } catch {
      // use local fallback
    }
  } else {
    related = findRelatedClient(product, state.catalog);
  }

  state.selectedHistory = history;
  renderDrawer(state.selectedProduct, history, related);

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
}

function renderDrawer(p, history, related) {
  const s = p.stats;
  const pill = document.getElementById('drawer-store-pill');
  pill.textContent = p.storeName;
  pill.setAttribute('style', getStorePillStyle(p.storeId));

  setText('drawer-sku', p.sku ? `SKU ${p.sku}` : '');
  setText('drawer-brand', p.brand || p.storeName);
  setText('drawer-title', p.title);
  setText('drawer-price-now', formatPen(p.price));

  const img = document.getElementById('drawer-img');
  img.src = p.image || '';
  img.alt = p.title;

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
    cardEl.textContent = `Con ${p.cardName || 'tarjeta de tienda'}: ${formatPen(p.cardPrice)}`;
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
  vPill.textContent = s.verdictLabel;
  setText('drawer-score-label', `Deal Score: ${s.dealScore}/100`);
  setText('drawer-verdict-reason', s.verdictReason);

  // Links & buttons
  document.getElementById('drawer-store-link').href = p.url;
  const isStarred = (state.watchlist.starredIds || []).includes(p.id);
  const starBtn = document.getElementById('drawer-star-btn');
  starBtn.textContent = isStarred ? '★ En Mi Lista' : '☆ Seguir';

  const refreshBtn = document.getElementById('drawer-refresh-btn');
  refreshBtn.hidden = state.mode !== 'server';

  // Target price
  const currentTarget = state.watchlist.targetPrices?.[p.id] || '';
  document.getElementById('drawer-target-input').value = currentTarget;
  const targetFeedback = document.getElementById('drawer-target-feedback');
  if (currentTarget) {
    if (p.effectivePrice <= Number(currentTarget)) {
      targetFeedback.innerHTML = `<strong class="positive">¡Objetivo alcanzado!</strong> Hoy cuesta ${formatPen(p.effectivePrice)} (tu meta era ≤ ${formatPen(currentTarget)}).`;
    } else {
      const diff = p.effectivePrice - Number(currentTarget);
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
  setText('stat-min', formatPen(s.minPrice));
  setText('stat-min-date', s.minDate ? `Registrado: ${s.minDate}` : 'Hoy');
  setText('stat-median', formatPen(s.medianPrice));
  setText(
    'stat-real-diff',
    s.daysTracked >= 2
      ? s.realDiscountPct >= 0
        ? `Hoy ${s.realDiscountPct}% más barato`
        : `Hoy ${Math.abs(s.realDiscountPct)}% más caro`
      : 'Se afina con historial'
  );
  setText('stat-avg30', formatPen(s.avgPrice30d));
  setText('stat-days', `${s.daysTracked} días monitoreados`);
  setText('stat-max', formatPen(s.maxPrice));
  setText('stat-max-date', s.maxDate ? `Registrado: ${s.maxDate}` : 'Hoy');

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

function findRelatedClient(target, catalog) {
  if (!target?.matchTokens?.length) return [];
  const targetSet = new Set(target.matchTokens);
  const scored = [];
  for (const item of catalog) {
    if (item.id === target.id || item.storeId === target.storeId) continue;
    let overlap = 0;
    for (const t of item.matchTokens || []) {
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
            setProgressBar(true, est, 'Escaneando 21 tiendas de Perú y publicando cambios...');
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
  setProgressBar(true, 4, `Conectando con las 21 tiendas de Perú (${quick ? 'modo rápido' : 'modo completo'})...`);

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
    if (idx >= 0) state.watchlist.starredIds.splice(idx, 1);
    else state.watchlist.starredIds.push(productId);
    saveLocalWatchlist();
  }
  renderAll();
  if (state.selectedProduct?.id === productId) {
    const isStarred = state.watchlist.starredIds.includes(productId);
    document.getElementById('drawer-star-btn').textContent = isStarred ? '★ En Mi Lista' : '☆ Seguir';
  }
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
  renderDrawer(state.selectedProduct, state.selectedHistory, []);
  showToast(val ? `Alerta guardada: te avisaremos cuando baje de ${formatPen(val)}.` : 'Alerta eliminada.');
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
  showToast(`"${clean}" se buscará automáticamente en cada actualización diaria.`);
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
function switchTab(tab) {
  state.activeTab = tab;
  state.pageSize = 60;
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

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // View toggle (Table vs Grid)
  document.querySelectorAll('#catalog-view-controls .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      document.querySelectorAll('#catalog-view-controls .seg-btn').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      renderCatalog();
    });
  });

  // Global search (typing filters catalog; submit launches live multi-store search)
  const searchInput = document.getElementById('global-search-input');
  searchInput.addEventListener('input', () => {
    state.filters.search = searchInput.value;
    state.pageSize = 60;
    if (state.activeTab === 'deals' || state.activeTab === 'drops') {
      renderCatalog();
    }
  });

  document.getElementById('global-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) runLiveSearch(q);
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
    renderCatalog();
  });

  // Filter dropdowns & price
  document.getElementById('filter-store').addEventListener('change', (e) => {
    state.filters.store = e.target.value;
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
  document.getElementById('filter-max-price').addEventListener('input', (e) => {
    state.filters.maxPrice = e.target.value;
    state.pageSize = 60;
    renderCatalog();
  });

  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    state.filters = { search: '', category: 'all', store: 'all', verdict: 'all', sort: 'score', maxPrice: '' };
    searchInput.value = '';
    document.getElementById('filter-store').value = 'all';
    document.getElementById('filter-verdict').value = 'all';
    document.getElementById('filter-sort').value = 'score';
    document.getElementById('filter-max-price').value = '';
    populateFilterOptions();
    renderCatalog();
  });

  document.getElementById('empty-live-search-btn').addEventListener('click', () => {
    runLiveSearch(state.filters.search || 'laptop');
  });

  document.getElementById('load-more-btn').addEventListener('click', () => {
    state.pageSize += 60;
    renderCatalog();
  });

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

  // Track URL modal
  document.getElementById('open-track-modal-btn').addEventListener('click', openTrackModal);
  document.getElementById('watchlist-add-url-btn').addEventListener('click', openTrackModal);
  document.getElementById('close-track-modal-btn').addEventListener('click', closeTrackModal);
  document.getElementById('cancel-track-modal-btn').addEventListener('click', closeTrackModal);
  document.getElementById('track-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'track-modal-backdrop') closeTrackModal();
  });
  document.getElementById('track-url-form').addEventListener('submit', submitTrackUrl);

  // Watchlist add query form
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProductDrawer();
      closeTrackModal();
      closeUpdateModal();
    }
  });
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
