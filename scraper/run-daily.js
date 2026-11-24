import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORES, STORE_MAP } from '../config/stores.js';
import { getLimaDateString, getUsdToPenRate, runWithConcurrency } from './http.js';
import { searchSingleStore } from './live-search.js';
import { verifyVtexStockBatch } from './adapters/vtex.js';
import { fetchMiOfficialCatalog } from './adapters/mi-official.js';
import { discoverMagentoSeasonalPaths, fetchMagentoCategoryPage } from './adapters/magento.js';
import { scrapeProductUrl } from './adapters/url-scraper.js';
import { analyzeProduct, deduplicateStoreListings, normalizeProductCategory } from './analyzer.js';
import { buildMultiStoreGroups } from './grouper.js';
import { detectActiveCampaigns } from './campaigns.js';
import {
  loadCatalog,
  loadHistory,
  loadMeta,
  loadWatchlist,
  recordPricePoint,
  ROOT_DIR,
  saveAllData
} from './storage.js';

const WATCH_QUERIES_PATH = path.join(ROOT_DIR, 'config', 'watch-queries.json');

export async function runDailyScrape(options = {}) {
  const { quick = false, onProgress = () => {}, storeIds = null } = options;
  const startedAt = Date.now();
  const today = getLimaDateString();
  const usdToPen = await getUsdToPenRate();

  const watchConfig = JSON.parse(fs.readFileSync(WATCH_QUERIES_PATH, 'utf-8'));
  const watchlist = loadWatchlist();
  const history = loadHistory();
  const prevCatalog = loadCatalog();
  const prevMeta = loadMeta();

  // Map previous catalog by id so temporarily unreachable items retain metadata
  const productMap = new Map();
  for (const p of prevCatalog) {
    // Discard broken legacy Hiraoka items that captured only a short brand label (e.g. "LG", "LOGITECH G")
    if (
      p.storeId === 'hiraoka' &&
      (!p.title ||
        p.title.trim().split(/\s+/).length < 2 ||
        (p.title.trim() === p.title.trim().toUpperCase() && p.title.trim().length <= 18))
    ) {
      continue;
    }
    const latestStore = STORE_MAP[p.storeId];
    productMap.set(p.id, {
      id: p.id,
      storeId: p.storeId,
      storeName: latestStore?.name || p.storeName,
      sku: p.sku,
      title: p.title,
      brand: p.brand,
      category: p.category,
      url: p.url,
      image: p.image,
      price: p.price,
      listPrice: p.listPrice,
      cardPrice: p.cardPrice ?? null,
      cardName: p.cardName ?? null,
      originalCurrency: p.originalCurrency || 'PEN',
      originalPrice: p.originalPrice ?? null,
      inStock: p.inStock ?? true,
      isCustomWatch: Boolean(p.isCustomWatch),
      lastSeenDate: p.lastSeenDate || today
    });
  }

  const enabledStores = STORES.filter(
    (s) => s.enabled && (!storeIds || storeIds.includes(s.id))
  );

  // Build scraping jobs: standard keyword search, mi_official events, Magento category/seasonal pages, and VTEX discount radar
  const jobs = [];
  const searchStores = enabledStores.filter(
    (s) => s.engine !== 'mi_official' && !s.useCategoryPages
  );

  for (const catCfg of watchConfig.categories) {
    const queries = quick ? catCfg.queries.slice(0, 1) : catCfg.queries;
    const limit = quick ? Math.min(6, catCfg.limitPerStore) : catCfg.limitPerStore;
    const matchingStores = searchStores.filter((s) =>
      s.specialties.includes(catCfg.category)
    );
    for (const store of matchingStores) {
      for (const query of queries) {
        jobs.push({
          type: 'search',
          store,
          query,
          category: catCfg.category,
          limit
        });
      }
    }
  }

  // Dedicated full-store + active seasonal campaign scan for Xiaomi Oficial (www.mi.com/pe)
  for (const store of enabledStores.filter((s) => s.engine === 'mi_official')) {
    jobs.push({
      type: 'mi_official',
      store,
      query: 'campañas activas y tienda oficial'
    });
  }

  // Official category + active seasonal campaign pages for Magento stores (sequential 1-by-1 polite rate)
  for (const store of enabledStores.filter((s) => s.engine === 'magento' && s.useCategoryPages)) {
    const pages = (quick ? (store.categoryPages || []).slice(0, 4) : store.categoryPages || []).map(
      (pg) => ({ path: pg.path, category: pg.category, limit: quick ? 10 : 18 })
    );
    jobs.push({
      type: 'magento_categories',
      store,
      pages,
      query: 'categorías y campañas oficiales'
    });
  }

  // Radar de Temporada / Mayor Descuento (VTEX OrderByBestDiscountDESC con piso de precio real)
  if (!quick && Array.isArray(watchConfig.seasonalDiscountRadar)) {
    const vtexStores = enabledStores.filter((s) => s.engine === 'vtex');
    for (const radar of watchConfig.seasonalDiscountRadar) {
      const matchingVtex = vtexStores.filter((s) => s.specialties.includes(radar.category));
      for (const store of matchingVtex) {
        jobs.push({
          type: 'search',
          store,
          query: radar.query,
          category: radar.category,
          limit: radar.limitPerStore || 5,
          searchOptions: {
            orderBy: 'OrderByBestDiscountDESC',
            minPrice: radar.minPrice || 100,
            inStockOnly: true
          }
        });
      }
    }
  }

  // Add user custom search queries across top retail/tech stores
  for (const customQ of watchlist.customQueries || []) {
    const qText = typeof customQ === 'string' ? customQ : customQ.query;
    if (!qText) continue;
    const targetStores = searchStores.slice(0, 12);
    for (const store of targetStores) {
      jobs.push({
        type: 'search',
        store,
        query: qText,
        category: 'personal',
        limit: 5,
        isCustomWatch: true
      });
    }
  }

  // Add user custom tracked product URLs
  for (const entry of watchlist.urls || []) {
    const url = typeof entry === 'string' ? entry : entry.url;
    if (!url) continue;
    jobs.push({
      type: 'url',
      url,
      category: entry.category || 'personal',
      isCustomWatch: true
    });
  }

  const storesStatus = {};
  for (const s of STORES) {
    storesStatus[s.id] = {
      id: s.id,
      name: s.name,
      domain: s.domain,
      baseUrl: s.baseUrl,
      engine: s.engine,
      currency: s.currency,
      badgeBg: s.badgeBg,
      badgeText: s.badgeText,
      enabled: s.enabled,
      okJobs: 0,
      failedJobs: 0,
      productsFetched: 0,
      lastError: null
    };
  }

  let completed = 0;
  let fetchedCount = 0;
  const preDiscoveredCampaignPaths = {};
  const seenTodayIds = new Set();

  const applyStockUpdate = (item, isCustomWatch = false) => {
    const existing = productMap.get(item.id);
    if (item._outOfStockMarker) {
      if (!existing) return;
      const updated = {
        ...existing,
        inStock: false,
        lastSeenDate: today
      };
      productMap.set(item.id, updated);
      seenTodayIds.add(item.id);
      recordPricePoint(history, updated, today);
      return;
    }

    const merged = {
      ...item,
      isCustomWatch: Boolean(existing?.isCustomWatch || isCustomWatch),
      lastSeenDate: today
    };
    delete merged._outOfStockMarker;
    productMap.set(item.id, merged);
    seenTodayIds.add(item.id);
    recordPricePoint(history, merged, today);
  };

  const mergeFetchedItems = (storeId, items, isCustomWatch = false) => {
    const st = storesStatus[storeId];
    const pricedItems = items.filter((it) => !it._outOfStockMarker);
    if (st) {
      st.okJobs += 1;
      st.productsFetched += pricedItems.length;
    }
    for (const item of items) {
      if (!item._outOfStockMarker) fetchedCount += 1;
      applyStockUpdate(item, isCustomWatch);
    }
  };

  onProgress({
    phase: 'starting',
    completed: 0,
    total: jobs.length,
    fetchedCount: 0,
    message: `Iniciando actualización de ${enabledStores.length} tiendas en Perú (${jobs.length} consultas)...`
  });

  await runWithConcurrency(jobs, 12, async (job) => {
    try {
      if (job.type === 'search') {
        const items = await searchSingleStore(
          job.store,
          job.query,
          job.limit,
          job.category,
          { includeOutOfStockMarkers: true, ...(job.searchOptions || {}) }
        );
        mergeFetchedItems(job.store.id, items, Boolean(job.isCustomWatch));
      } else if (job.type === 'mi_official') {
        const items = await fetchMiOfficialCatalog(job.store);
        mergeFetchedItems(job.store.id, items, false);
      } else if (job.type === 'magento_categories') {
        const seasonalPaths = await discoverMagentoSeasonalPaths(job.store);
        if (seasonalPaths.length) {
          preDiscoveredCampaignPaths[job.store.id] = seasonalPaths;
        }
        const allPages = [
          ...seasonalPaths.map((sPath) => ({ path: sPath, category: 'seasonal', limit: 20 })),
          ...job.pages
        ];
        for (const pg of allPages) {
          try {
            const items = await fetchMagentoCategoryPage(job.store, pg.path, pg.category, pg.limit);
            mergeFetchedItems(job.store.id, items, false);
          } catch (pgErr) {
            if (storesStatus[job.store.id]) {
              storesStatus[job.store.id].failedJobs += 1;
              storesStatus[job.store.id].lastError = pgErr?.message || 'Error';
            }
          }
          await new Promise((r) => setTimeout(r, 450));
        }
      } else if (job.type === 'url') {
        const item = await scrapeProductUrl(job.url, job.category);
        if (item) {
          if (!item._outOfStockMarker) fetchedCount += 1;
          applyStockUpdate(item, true);
          if (storesStatus[item.storeId]) {
            storesStatus[item.storeId].okJobs += 1;
            if (!item._outOfStockMarker) storesStatus[item.storeId].productsFetched += 1;
          }
        }
      }
    } catch (err) {
      if (job.store && storesStatus[job.store.id]) {
        storesStatus[job.store.id].failedJobs += 1;
        storesStatus[job.store.id].lastError = err?.message || 'Error';
      }
    } finally {
      completed += 1;
      onProgress({
        phase: 'scraping',
        completed,
        total: jobs.length,
        fetchedCount,
        storeName: job.store?.name || 'URL personalizada',
        query: job.query || job.url,
        message: `Actualizando ${job.store?.name || 'URL'} (${completed}/${jobs.length}) · ${productMap.size} productos`
      });
    }
  });

  // Verify live stock for previously-cached VTEX products not seen in today's search queries
  // (catches products that sold out and dropped out of search results, e.g. PlazaVea/Oechsle/etc.)
  const vtexUnseenByStore = new Map();
  for (const prod of productMap.values()) {
    if (seenTodayIds.has(prod.id)) continue;
    const store = STORE_MAP[prod.storeId];
    if (!store || !store.enabled || store.engine !== 'vtex') continue;
    if (storeIds && !storeIds.includes(store.id)) continue;
    // Check currently in-stock items (and also re-check recently out-of-stock items in full mode)
    if (quick && prod.inStock === false) continue;
    if (!vtexUnseenByStore.has(store.id)) vtexUnseenByStore.set(store.id, []);
    vtexUnseenByStore.get(store.id).push(prod);
  }

  if (vtexUnseenByStore.size > 0) {
    onProgress({
      phase: 'scraping',
      completed: jobs.length,
      total: jobs.length,
      fetchedCount,
      message: `Verificando stock en vivo en ${vtexUnseenByStore.size} tiendas VTEX...`
    });
    const stockTasks = [...vtexUnseenByStore.entries()].map(([storeId, list]) => ({
      store: STORE_MAP[storeId],
      list
    }));
    await runWithConcurrency(stockTasks, 6, async ({ store, list }) => {
      const updates = await verifyVtexStockBatch(store, list, 25);
      for (const upd of updates) {
        applyStockUpdate(upd, false);
      }
    });
  }

  // For healthy non-VTEX stores, mark items unseen for >= 2 days as out of stock
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (Number.isFinite(todayMs) && !quick) {
    for (const prod of productMap.values()) {
      if (seenTodayIds.has(prod.id) || prod.inStock === false) continue;
      const store = STORE_MAP[prod.storeId];
      const st = storesStatus[prod.storeId];
      if (!store || store.engine === 'vtex' || !st || st.okJobs === 0 || st.failedJobs > 0) continue;
      const lastMs = Date.parse(`${prod.lastSeenDate || today}T00:00:00Z`);
      if (Number.isFinite(lastMs) && (todayMs - lastMs) / 86400000 >= 2) {
        prod.inStock = false;
      }
    }
  }

  // Clean misclassified toy items and deduplicate identical same-store listings
  const normalizedProducts = [...productMap.values()].map((p) => ({
    ...p,
    category: normalizeProductCategory(p)
  }));
  const rawProducts = deduplicateStoreListings(normalizedProducts, history);

  // Build cross-store unified product groups (SoloTodo / Compy style)
  const { groups, productGroupMeta } = buildMultiStoreGroups(rawProducts);

  // Analyze every product with full historical + cross-store analytics
  const analyzedCatalog = [];
  for (const prod of rawProducts) {
    const prodHistory = history[prod.id] || [];
    const groupMeta = productGroupMeta.get(prod.id) || null;
    const analyzed = analyzeProduct(prod, prodHistory, groupMeta);
    analyzedCatalog.push(analyzed);
  }


  // Sort default catalog by Deal Score descending, then realDiscountPct descending
  analyzedCatalog.sort((a, b) => {
    if (b.stats.dealScore !== a.stats.dealScore) {
      return b.stats.dealScore - a.stats.dealScore;
    }
    return b.stats.storeDiscountPct - a.stats.storeDiscountPct;
  });

  // Compute store counts in final catalog
  const storeCounts = {};
  for (const p of analyzedCatalog) {
    storeCounts[p.storeId] = (storeCounts[p.storeId] || 0) + 1;
  }
  for (const id of Object.keys(storesStatus)) {
    storesStatus[id].catalogCount = storeCounts[id] || 0;
  }

  // Detect active seasonal campaigns (Black Friday, Cyber, Navidad, Cierra Puertas, etc.)
  onProgress({
    phase: 'scraping',
    completed: jobs.length,
    total: jobs.length,
    fetchedCount,
    message: `Detectando temporadas y campañas activas en ${enabledStores.length} tiendas...`
  });
  const campaignData = await detectActiveCampaigns(
    enabledStores,
    analyzedCatalog,
    prevMeta,
    preDiscoveredCampaignPaths
  );
  for (const id of Object.keys(storesStatus)) {
    storesStatus[id].campaign = campaignData.byStore[id] || null;
  }

  const allTimeLows = analyzedCatalog.filter((p) => p.stats.isAllTimeLow).length;
  const droppedToday = analyzedCatalog.filter((p) => p.stats.delta24h < 0).length;
  const fakeDiscounts = analyzedCatalog.filter((p) => p.stats.isFakeDiscount).length;
  const bugazosCount = analyzedCatalog.filter((p) => p.stats.isBugazo).length;
  const activeStores = Object.values(storesStatus).filter((s) => s.catalogCount > 0).length;

  const meta = {
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedDate: today,
    elapsedMs: Date.now() - startedAt,
    usdToPen,
    totalProducts: analyzedCatalog.length,
    activeStores,
    totalConfiguredStores: STORES.length,
    allTimeLows,
    droppedToday,
    fakeDiscounts,
    bugazosCount,
    groupsCount: groups.length,
    activeCampaignsCount: campaignData.campaigns.length,
    campaigns: campaignData.campaigns,
    storesStatus
  };

  saveAllData({ catalog: analyzedCatalog, history, meta, groups });

  onProgress({
    phase: 'done',
    completed: jobs.length,
    total: jobs.length,
    fetchedCount,
    meta,
    message: `¡Listo! ${analyzedCatalog.length} productos actualizados (${groups.length} comparativas multi-tienda, ${campaignData.campaigns.length} tiendas en campaña, ${bugazosCount} posibles bugazos) en ${(meta.elapsedMs / 1000).toFixed(1)}s.`
  });

  return { catalog: analyzedCatalog, groups, meta };
}

// Allow direct CLI execution: `node scraper/run-daily.js [--quick]`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const quick = process.argv.includes('--quick');
  console.log(`🇵🇪 ChapaAlToque PE — Actualización diaria (${quick ? 'modo rápido' : 'modo completo'})`);
  runDailyScrape({
    quick,
    onProgress: (ev) => {
      if (ev.phase === 'starting' || ev.phase === 'done' || ev.completed % 15 === 0) {
        console.log(`  [${ev.completed}/${ev.total}] ${ev.message}`);
      }
    }
  })
    .then(({ meta }) => {
      console.log('\n✅ Resumen:');
      console.log(`   Fecha Lima:       ${meta.lastUpdatedDate}`);
      console.log(`   Tiendas activas:  ${meta.activeStores}/${meta.totalConfiguredStores}`);
      console.log(`   Productos:        ${meta.totalProducts}`);
      console.log(`   Tipo de cambio:   S/ ${meta.usdToPen} por USD`);
      console.log(`   Duración:         ${(meta.elapsedMs / 1000).toFixed(1)}s`);
    })
    .catch((err) => {
      console.error('❌ Error ejecutando scraper diario:', err);
      process.exit(1);
    });
}
