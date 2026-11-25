import { STORES } from '../config/stores.js';
import { runWithConcurrency } from './http.js';
import { searchVtexStore } from './adapters/vtex.js';
import { searchFalabellaStore } from './adapters/falabella.js';
import { searchPrestashopStore } from './adapters/prestashop.js';
import { searchMagentoStore } from './adapters/magento.js';
import { searchMiOfficialStore } from './adapters/mi-official.js';

export async function searchSingleStore(store, query, limit = 8, category = 'tecnologia', options = {}) {
  switch (store.engine) {
    case 'vtex':
      return searchVtexStore(store, query, limit, category, options);
    case 'falabella':
      return searchFalabellaStore(store, query, limit, category, options);
    case 'prestashop':
      return searchPrestashopStore(store, query, limit, category, options);
    case 'magento':
      return searchMagentoStore(store, query, limit, category, options);
    case 'mi_official':
      return searchMiOfficialStore(store, query, limit, category);
    default:
      return [];
  }
}

/**
 * Busca un término en tiempo real en todas las tiendas peruanas habilitadas en paralelo.
 */
export async function searchAllStoresLive(query, options = {}) {
  const { limitPerStore = 6, storeIds = null } = options;
  const targetStores = STORES.filter(
    (s) => s.enabled && (!storeIds || storeIds.includes(s.id))
  );

  const startedAt = Date.now();
  const storeResults = await runWithConcurrency(targetStores, 8, async (store) => {
    const t0 = Date.now();
    try {
      const items = await searchSingleStore(store, query, limitPerStore, 'personal');
      return {
        storeId: store.id,
        storeName: store.name,
        ok: true,
        ms: Date.now() - t0,
        count: items.length,
        items
      };
    } catch (err) {
      return {
        storeId: store.id,
        storeName: store.name,
        ok: false,
        ms: Date.now() - t0,
        count: 0,
        error: err?.message || 'Error de conexión',
        items: []
      };
    }
  });

  const allItems = [];
  const summary = [];
  for (const r of storeResults) {
    if (!r) continue;
    summary.push({
      storeId: r.storeId,
      storeName: r.storeName,
      ok: r.ok,
      count: r.count,
      ms: r.ms,
      error: r.error || null
    });
    if (Array.isArray(r.items)) {
      allItems.push(...r.items.filter((it) => !it._outOfStockMarker));
    }
  }

  // Sort by effective price ascending so user immediately sees cheapest Peruvian store
  allItems.sort((a, b) => (a.cardPrice || a.price) - (b.cardPrice || b.price));

  return {
    query,
    elapsedMs: Date.now() - startedAt,
    totalResults: allItems.length,
    stores: summary,
    items: allItems
  };
}
