import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORES, STORE_MAP } from '../config/stores.js';
import { getLimaDateString, getUsdToPenRate, runWithConcurrency } from './http.js';
import { searchSingleStore } from './live-search.js';
import { scrapeProductUrl } from './adapters/url-scraper.js';
import { analyzeProduct } from './analyzer.js';
import {
  loadCatalog,
  loadHistory,
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

  // Map previous catalog by id so temporarily unreachable items retain metadata
  const productMap = new Map();
  for (const p of prevCatalog) {
    productMap.set(p.id, {
      id: p.id,
      storeId: p.storeId,
      storeName: p.storeName,
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

  // Build scraping jobs: (store, query, category, limit)
  const jobs = [];
  for (const catCfg of watchConfig.categories) {
    const queries = quick ? catCfg.queries.slice(0, 1) : catCfg.queries;
    const limit = quick ? Math.min(6, catCfg.limitPerStore) : catCfg.limitPerStore;
    const matchingStores = enabledStores.filter((s) =>
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

  // Add user custom search queries across top retail/tech stores
  for (const customQ of watchlist.customQueries || []) {
    const qText = typeof customQ === 'string' ? customQ : customQ.query;
    if (!qText) continue;
    const targetStores = enabledStores.slice(0, 12);
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
      engine: s.engine,
      currency: s.currency,
      okJobs: 0,
      failedJobs: 0,
      productsFetched: 0,
      lastError: null
    };
  }

  let completed = 0;
  let fetchedCount = 0;

  onProgress({
    phase: 'starting',
    completed: 0,
    total: jobs.length,
    fetchedCount: 0,
    message: `Iniciando actualización de ${enabledStores.length} tiendas en Perú (${jobs.length} consultas)...`
  });

  await runWithConcurrency(jobs, 8, async (job) => {
    try {
      if (job.type === 'search') {
        const items = await searchSingleStore(job.store, job.query, job.limit, job.category);
        const st = storesStatus[job.store.id];
        st.okJobs += 1;
        st.productsFetched += items.length;

        for (const item of items) {
          fetchedCount += 1;
          const existing = productMap.get(item.id);
          const merged = {
            ...item,
            isCustomWatch: Boolean(existing?.isCustomWatch || job.isCustomWatch),
            lastSeenDate: today
          };
          productMap.set(item.id, merged);
          recordPricePoint(history, merged, today);
        }
      } else if (job.type === 'url') {
        const item = await scrapeProductUrl(job.url, job.category);
        if (item) {
          fetchedCount += 1;
          const merged = {
            ...item,
            isCustomWatch: true,
            lastSeenDate: today
          };
          productMap.set(item.id, merged);
          recordPricePoint(history, merged, today);
          if (storesStatus[item.storeId]) {
            storesStatus[item.storeId].okJobs += 1;
            storesStatus[item.storeId].productsFetched += 1;
          }
        }
      }
    } catch (err) {
      if (job.type === 'search' && storesStatus[job.store.id]) {
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

  // Analyze every product with full historical analytics
  const analyzedCatalog = [];
  for (const prod of productMap.values()) {
    const prodHistory = history[prod.id] || [];
    const analyzed = analyzeProduct(prod, prodHistory);
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

  const allTimeLows = analyzedCatalog.filter((p) => p.stats.isAllTimeLow).length;
  const droppedToday = analyzedCatalog.filter((p) => p.stats.delta24h < 0).length;
  const fakeDiscounts = analyzedCatalog.filter((p) => p.stats.isFakeDiscount).length;
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
    storesStatus
  };

  saveAllData({ catalog: analyzedCatalog, history, meta });

  onProgress({
    phase: 'done',
    completed: jobs.length,
    total: jobs.length,
    fetchedCount,
    meta,
    message: `¡Listo! ${analyzedCatalog.length} productos actualizados de ${activeStores} tiendas peruanas en ${(meta.elapsedMs / 1000).toFixed(1)}s.`
  });

  return { catalog: analyzedCatalog, meta };
}

// Allow direct CLI execution: `node scraper/run-daily.js [--quick]`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const quick = process.argv.includes('--quick');
  console.log(`🇵🇪 NadaMenos PE — Actualización diaria (${quick ? 'modo rápido' : 'modo completo'})`);
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
