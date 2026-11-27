import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, STORES } from '../config/stores.js';
import {
  analyzeProduct,
  deduplicateStoreListings,
  extractMatchTokens,
  normalizeProductCategory
} from '../scraper/analyzer.js';
import { buildMultiStoreGroups } from '../scraper/grouper.js';
import {
  interleaveJobsByStore,
  parsePriceNumber,
  runJobsWithStoreLimit
} from '../scraper/http.js';
import { compactCatalogForPublic, recordPricePoint } from '../scraper/storage.js';
import { isVtexOfferInStock, normalizeVtexProduct } from '../scraper/adapters/vtex.js';

test('parsePriceNumber parses Peruvian PEN, USD, and EU formatted prices', () => {
  assert.equal(parsePriceNumber('S/ 1,299.90'), 1299.9);
  assert.equal(parsePriceNumber('S/.  119'), 119);
  assert.equal(parsePriceNumber('$ 2.042,30'), 2042.3);
  assert.equal(parsePriceNumber('$ 15,00'), 15);
  assert.equal(parsePriceNumber('1.299'), 1299);
  assert.equal(parsePriceNumber('2,499'), 2499);
  assert.equal(parsePriceNumber('invalid'), null);
});

test('analyzeProduct detects true All-Time Low (mínimo histórico) with 24h drop', () => {
  const product = {
    id: 'plazavea:123',
    storeId: 'plazavea',
    storeName: 'PlazaVea',
    title: 'Televisor LG OLED 55 C4 4K',
    brand: 'LG',
    price: 3199,
    listPrice: 4999,
    cardPrice: 2999,
    cardName: 'Tarjeta Oh!',
    inStock: true
  };

  const history = [
    { date: '2026-10-25', price: 3999, listPrice: 4999, inStock: true },
    { date: '2026-11-01', price: 3899, listPrice: 4999, inStock: true },
    { date: '2026-11-10', price: 3999, listPrice: 4999, inStock: true },
    { date: '2026-11-22', price: 3799, listPrice: 4999, inStock: true },
    { date: '2026-11-23', price: 3199, listPrice: 4999, cardPrice: 2999, inStock: true }
  ];

  const analyzed = analyzeProduct(product, history);
  assert.equal(analyzed.stats.isAllTimeLow, true);
  assert.equal(analyzed.stats.isFakeDiscount, false);
  assert.equal(analyzed.stats.verdict, 'all_time_low');
  assert.equal(analyzed.stats.cyberStatus, 'real_drop');
  assert.equal(analyzed.stats.minPrice, 3199);
  assert.equal(analyzed.stats.minDate, '2026-11-23');
  assert.equal(analyzed.stats.delta24h, -600);
  assert.ok(analyzed.stats.dealScore >= 90, `Expected dealScore >= 90, got ${analyzed.stats.dealScore}`);
  assert.equal(analyzed.effectivePrice, 2999);
});

test('analyzeProduct flags fake / inflated Cyber discounts when price never actually dropped', () => {
  const product = {
    id: 'falabella:999',
    storeId: 'falabella',
    storeName: 'Falabella',
    title: 'Freidora de Aire 5L',
    brand: 'Oster',
    price: 299,
    listPrice: 599,
    inStock: true
  };

  const history = [
    { date: '2026-11-19', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-20', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-21', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-22', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-23', price: 299, listPrice: 599, inStock: true }
  ];

  const analyzed = analyzeProduct(product, history);
  assert.equal(analyzed.stats.isFakeDiscount, true);
  assert.equal(analyzed.stats.cyberStatus, 'cyber_trap');
  assert.equal(analyzed.stats.verdict, 'inflated');
  assert.ok(analyzed.stats.dealScore <= 42);
});

test('analyzeProduct detects Anti-Cyber pre-sale price hike trap', () => {
  const product = {
    id: 'oechsle:777',
    storeId: 'oechsle',
    storeName: 'Oechsle',
    title: 'Cafetera Espresso Oster',
    brand: 'Oster',
    price: 519,
    listPrice: 799,
    inStock: true
  };

  // Normal price ~500, jumped to 680 a week before Cyber, then "discounted" back to 519
  const history = [
    { date: '2026-10-20', price: 499, listPrice: 799, inStock: true },
    { date: '2026-11-01', price: 509, listPrice: 799, inStock: true },
    { date: '2026-11-15', price: 689, listPrice: 799, inStock: true },
    { date: '2026-11-18', price: 689, listPrice: 799, inStock: true },
    { date: '2026-11-23', price: 519, listPrice: 799, inStock: true }
  ];

  const analyzed = analyzeProduct(product, history);
  assert.equal(analyzed.stats.preSaleHikeDetected, true);
  assert.equal(analyzed.stats.cyberStatus, 'cyber_trap');
  assert.equal(analyzed.stats.verdict, 'inflated');
});

test('analyzeProduct detects Bugazo on cross-store price anomaly and historical crash', () => {
  const prod = {
    id: 'plazavea:bug1',
    storeId: 'plazavea',
    storeName: 'PlazaVea',
    title: 'Consola PlayStation 5 Slim',
    brand: 'Sony',
    price: 1199,
    listPrice: 2499,
    inStock: true
  };

  const crossStoreAnalyzed = analyzeProduct(
    prod,
    [{ date: '2026-11-23', price: 1199, listPrice: 2499, inStock: true }],
    { groupId: 'grp:gaming:1', peerCount: 3, peerMinPrice: 1199, peerMedianPrice: 2399 }
  );
  assert.equal(crossStoreAnalyzed.stats.isBugazo, true);
  assert.equal(crossStoreAnalyzed.stats.bugazoType, 'cross_store');

  const crashAnalyzed = analyzeProduct(prod, [
    { date: '2026-11-20', price: 2399, listPrice: 2499, inStock: true },
    { date: '2026-11-22', price: 2399, listPrice: 2499, inStock: true },
    { date: '2026-11-23', price: 1199, listPrice: 2499, inStock: true }
  ]);
  assert.equal(crashAnalyzed.stats.isBugazo, true);
  assert.equal(crashAnalyzed.stats.bugazoType, 'historical_crash');
});

test('analyzeProduct penalizes inflated store base/listPrice compared to real Peruvian market median', () => {
  // Store invents S/ 799.90 listPrice (-53%) while real 3-store market median is S/ 359!
  const inflatedStoreOffer = {
    id: 'tottus:airfryer',
    storeId: 'tottus',
    storeName: 'Tottus',
    title: 'Freidora de Aire 11L Double Air Fryer',
    brand: 'Oster',
    price: 379,
    listPrice: 799.9,
    inStock: true
  };
  const analyzedFake = analyzeProduct(
    inflatedStoreOffer,
    [{ date: '2026-11-23', price: 379, listPrice: 799.9, inStock: true }],
    { groupId: 'grp:electro:1', peerCount: 3, peerMinPrice: 359, peerMedianPrice: 359 }
  );
  assert.equal(analyzedFake.stats.listPriceInflated, true);
  assert.equal(analyzedFake.stats.verdict, 'inflated');
  assert.equal(analyzedFake.stats.isBugazo, false);
  assert.ok(analyzedFake.stats.dealScore <= 42, `Expected score <= 42, got ${analyzedFake.stats.dealScore}`);

  // Meanwhile a genuinely cheaper TV vs 5-store Peruvian market ranks high!
  const genuineDeal = {
    id: 'tottus:tv55',
    storeId: 'tottus',
    storeName: 'Tottus',
    title: 'Televisor 55" 4K UHD',
    brand: 'LG',
    price: 1299,
    listPrice: 1999,
    inStock: true
  };
  const analyzedReal = analyzeProduct(
    genuineDeal,
    [{ date: '2026-11-23', price: 1299, listPrice: 1999, inStock: true }],
    { groupId: 'grp:tv:1', peerCount: 5, peerMinPrice: 1299, peerMedianPrice: 1779 }
  );
  assert.equal(analyzedReal.stats.listPriceInflated, false);
  assert.equal(analyzedReal.stats.referenceSource, 'market');
  assert.ok(analyzedReal.stats.fairDiscountPct >= 25);
  assert.ok(analyzedReal.stats.dealScore >= 80, `Expected score >= 80, got ${analyzedReal.stats.dealScore}`);
});

test('buildMultiStoreGroups unifies identical models across Peruvian stores and excludes accessories', () => {
  const sampleCatalog = [
    {
      id: 'falabella:1',
      storeId: 'falabella',
      storeName: 'Falabella',
      title: 'Televisor LG OLED 55" 4K Smart TV OLED55C4PSA',
      brand: 'LG',
      category: 'televisores',
      price: 3899,
      listPrice: 4999,
      url: 'https://falabella.com.pe/1'
    },
    {
      id: 'plazavea:2',
      storeId: 'plazavea',
      storeName: 'PlazaVea',
      title: 'Televisor LG 55 pulgadas OLED55C4PSA 4K UHD',
      brand: 'LG',
      category: 'televisores',
      price: 3499,
      listPrice: 4999,
      url: 'https://plazavea.com.pe/2'
    },
    {
      id: 'coolbox:3',
      storeId: 'coolbox',
      storeName: 'Coolbox',
      title: 'Control remoto para Televisor LG OLED55C4PSA',
      brand: 'LG',
      category: 'televisores',
      price: 79,
      listPrice: 99,
      url: 'https://coolbox.pe/3'
    }
  ];

  const { groups, productGroupMeta } = buildMultiStoreGroups(sampleCatalog);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].storeCount, 2);
  assert.equal(groups[0].minPrice, 3499);
  assert.equal(groups[0].savingsPen, 400);
  assert.ok(productGroupMeta.has('falabella:1'));
  assert.ok(productGroupMeta.has('plazavea:2'));
  assert.ok(!productGroupMeta.has('coolbox:3'));
});

test('recordPricePoint deduplicates same-day scrapes and appends new dates in order', () => {
  const historyMap = {};
  const prod = { id: 'coolbox:1', price: 150, listPrice: 200, inStock: true };

  recordPricePoint(historyMap, prod, '2026-11-22');
  recordPricePoint(historyMap, { ...prod, price: 140 }, '2026-11-22');
  recordPricePoint(historyMap, { ...prod, price: 129 }, '2026-11-23');

  assert.equal(historyMap['coolbox:1'].length, 2);
  assert.equal(historyMap['coolbox:1'][0].price, 140);
  assert.equal(historyMap['coolbox:1'][1].price, 129);
});

test('extractMatchTokens extracts normalized model keywords', () => {
  const tokens = extractMatchTokens('Televisor LG OLED 55" 4K Smart TV OLED55C4', 'LG');
  assert.ok(tokens.includes('lg'));
  assert.ok(tokens.includes('oled'));
  assert.ok(tokens.includes('oled55c4'));
});

test('normalizeProductCategory reclassifies baby toys out of tech and electro categories', () => {
  assert.equal(
    normalizeProductCategory({ title: 'Primer Laptop Aprendizaje Fisher-Price', brand: 'Fisher-Price', category: 'tecnologia' }),
    'hogar'
  );
  assert.equal(
    normalizeProductCategory({ title: 'Microondas de Juguete Happy Line', brand: 'Happy Line', category: 'electro' }),
    'hogar'
  );
  assert.equal(
    normalizeProductCategory({ title: 'Laptop Lenovo IdeaPad Slim 5 16GB', brand: 'Lenovo', category: 'tecnologia' }),
    'tecnologia'
  );
});

test('deduplicateStoreListings collapses identical same-store listings keeping best in-stock offer', () => {
  const items = [
    { id: 'falabella:1', storeId: 'falabella', title: 'Televisor 65" 4K UHD 65P6K', price: 1518, inStock: true },
    { id: 'falabella:2', storeId: 'falabella', title: 'Televisor 65" 4K UHD 65P6K', price: 1399, inStock: true },
    { id: 'falabella:3', storeId: 'falabella', title: 'Televisor 65" 4K UHD 65P6K', price: 1299, inStock: false },
    { id: 'coolbox:1', storeId: 'coolbox', title: 'Televisor 65" 4K UHD 65P6K', price: 1449, inStock: true }
  ];
  const deduped = deduplicateStoreListings(items);
  assert.equal(deduped.length, 2);
  assert.equal(deduped.find((p) => p.storeId === 'falabella').id, 'falabella:2');
  assert.equal(deduped.find((p) => p.storeId === 'coolbox').id, 'coolbox:1');
});

test('compactCatalogForPublic removes matchTokens and null defaults while preserving false inStock', () => {
  const compact = compactCatalogForPublic([
    {
      id: 'falabella:1',
      title: 'TV Test',
      price: 999,
      cardPrice: null,
      inStock: false,
      isCustomWatch: false,
      originalCurrency: 'PEN',
      matchTokens: ['tv', 'test'],
      stats: { dealScore: 80, bugazoReason: null, isBugazo: false, isAllTimeLow: true }
    }
  ]);
  assert.equal(compact[0].matchTokens, undefined);
  assert.equal('cardPrice' in compact[0], false);
  assert.equal(compact[0].inStock, false);
  assert.equal('bugazoReason' in compact[0].stats, false);
  assert.equal(compact[0].stats.isAllTimeLow, true);
});

test('normalizeVtexProduct detects out-of-stock items with Price=0 or IsAvailable=false', () => {
  const store = { id: 'plazavea', name: 'PlazaVea', baseUrl: 'https://www.plazavea.com.pe' };
  const rawOosZero = {
    productId: '102067258',
    productName: 'Xiaomi Poco X8 Pro 512gb 12gb Black',
    brand: 'XIAOMI',
    items: [
      {
        itemId: '12397348',
        sellers: [{ commertialOffer: { Price: 0, ListPrice: 0, AvailableQuantity: 0, IsAvailable: false } }]
      }
    ]
  };
  assert.equal(normalizeVtexProduct(store, rawOosZero, 'celulares'), null);
  const marker = normalizeVtexProduct(store, rawOosZero, 'celulares', { allowOutOfStockMarker: true });
  assert.equal(marker.id, 'plazavea:102067258');
  assert.equal(marker.inStock, false);
  assert.equal(marker._outOfStockMarker, true);

  assert.equal(isVtexOfferInStock({ Price: 1699, AvailableQuantity: 5, IsAvailable: false }), false);
  assert.equal(isVtexOfferInStock({ Price: 1699, AvailableQuantity: 5, IsAvailable: true }), true);
});

test('buildMultiStoreGroups excludes out-of-stock offers from unified store comparisons', () => {
  const sample = [
    { id: 'plazavea:1', storeId: 'plazavea', storeName: 'PlazaVea', title: 'Xiaomi Poco X8 Pro 512GB 12GB Negro', brand: 'Xiaomi', category: 'celulares', price: 1699, inStock: false },
    { id: 'coolbox:1', storeId: 'coolbox', storeName: 'Coolbox', title: 'Xiaomi Poco X8 Pro 512GB 12GB Negro', brand: 'Xiaomi', category: 'celulares', price: 1839, inStock: true },
    { id: 'shopstar:1', storeId: 'shopstar', storeName: 'Shopstar', title: 'Xiaomi Poco X8 Pro 512GB 12GB Negro', brand: 'Xiaomi', category: 'celulares', price: 1832, inStock: true }
  ];
  const { groups, productGroupMeta } = buildMultiStoreGroups(sample);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].storeCount, 2);
  assert.equal(groups[0].minPrice, 1832);
  assert.equal(productGroupMeta.has('plazavea:1'), false);
});

test('watch-queries.json references valid categories, enabled search stores, and valid price bounds', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../config/watch-queries.json', import.meta.url), 'utf8'));
  const validCategories = new Set(CATEGORIES.map((c) => c.id));
  const validSearchStores = new Set(
    STORES.filter((s) => s.enabled && s.engine !== 'mi_official' && !s.useCategoryPages).map((s) => s.id)
  );
  const allQueries = [];

  for (const catCfg of cfg.categories) {
    assert.ok(validCategories.has(catCfg.category), `Unknown category: ${catCfg.category}`);
    assert.ok(Array.isArray(catCfg.queries) && catCfg.queries.length > 0);
    for (const entry of catCfg.queries) {
      const q = typeof entry === 'string' ? { query: entry } : entry;
      assert.ok(typeof q.query === 'string' && q.query.trim().length > 0);
      allQueries.push(q.query);
      if (q.minPrice !== undefined) assert.ok(Number(q.minPrice) > 0);
      if (q.maxPrice !== undefined) assert.ok(Number(q.maxPrice) > Number(q.minPrice || 0));
      if (q.stores !== undefined) {
        assert.ok(Array.isArray(q.stores) && q.stores.length > 0);
        for (const sid of q.stores) {
          assert.ok(validSearchStores.has(sid), `Invalid or non-search store "${sid}" in query "${q.query}"`);
        }
      }
    }
  }

  for (const expected of ['iphone', 'samsung galaxy', 'ipad', 'deshumedecedor', 'pañales', 'proteina whey', 'protector solar']) {
    assert.ok(allQueries.includes(expected), `Expected high-demand query "${expected}" in watch-queries.json`);
  }
});

test('interleaveJobsByStore prioritizes long jobs and round-robins search stores', () => {
  const jobs = [
    { type: 'search', store: { id: 'falabella' }, query: 'q1' },
    { type: 'search', store: { id: 'falabella' }, query: 'q2' },
    { type: 'search', store: { id: 'falabella' }, query: 'q3' },
    { type: 'search', store: { id: 'plazavea' }, query: 'p1' },
    { type: 'search', store: { id: 'plazavea' }, query: 'p2' },
    { type: 'search', store: { id: 'coolbox' }, query: 'c1' },
    { type: 'magento_categories', store: { id: 'hiraoka' } },
    { type: 'mi_official', store: { id: 'mi_oficial' } }
  ];
  const ordered = interleaveJobsByStore(jobs);
  assert.equal(ordered[0].type, 'magento_categories');
  assert.equal(ordered[1].type, 'mi_official');
  assert.deepEqual(
    ordered.slice(2, 5).map((j) => j.store.id),
    ['falabella', 'plazavea', 'coolbox']
  );
  assert.deepEqual(
    ordered.slice(5).map((j) => j.store.id),
    ['falabella', 'plazavea', 'falabella']
  );
});

test('runJobsWithStoreLimit caps per-store concurrency and trips circuit breaker on failing store', async () => {
  const jobs = [
    ...Array.from({ length: 6 }, (_, i) => ({ type: 'search', store: { id: 'healthy' }, query: `h${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ type: 'search', store: { id: 'down' }, query: `d${i}` }))
  ];
  const inFlight = { healthy: 0, down: 0 };
  const maxSeen = { healthy: 0, down: 0 };
  let downAttempts = 0;
  let skippedCount = 0;

  const { results, trippedStores } = await runJobsWithStoreLimit(
    interleaveJobsByStore(jobs),
    {
      concurrency: 10,
      maxPerStore: 2,
      circuitBreakerThreshold: 3,
      onSkip: () => {
        skippedCount += 1;
      }
    },
    async (job) => {
      const sid = job.store.id;
      inFlight[sid] += 1;
      maxSeen[sid] = Math.max(maxSeen[sid], inFlight[sid]);
      await new Promise((r) => setTimeout(r, 10));
      inFlight[sid] -= 1;
      if (sid === 'down') {
        downAttempts += 1;
        throw new Error('HTTP 503');
      }
      return { ok: true, q: job.query };
    }
  );

  assert.ok(maxSeen.healthy <= 2, `Expected healthy max concurrency <= 2, got ${maxSeen.healthy}`);
  assert.ok(trippedStores.includes('down'), 'Expected down store to trip circuit breaker');
  assert.ok(!trippedStores.includes('healthy'), 'Healthy store must not trip circuit breaker');
  assert.ok(downAttempts < 6, `Expected circuit breaker to skip remaining down jobs, attempted ${downAttempts}/6`);
  assert.ok(skippedCount >= 1, 'Expected onSkip to be called for skipped jobs');
  assert.equal(results.filter((r) => r?.ok).length, 6);
});

test('analyzeProduct never flags flat, penny-drop, or inflated items as isAllTimeLow', () => {
  // 1. Penny drop (S/ 4799 -> S/ 4798.99 = 0.0002%)
  const pennyProd = {
    id: 'sony:ps5pro',
    storeId: 'sony',
    storeName: 'Sony Store PE',
    title: 'Consola PlayStation 5 Pro 2TB',
    price: 4798.99,
    listPrice: 4799,
    inStock: true
  };
  const pennyHist = [
    { date: '2026-11-23', price: 4799, listPrice: 4799, inStock: true },
    { date: '2026-11-24', price: 4798.99, listPrice: 4799, inStock: true },
    { date: '2026-11-25', price: 4798.99, listPrice: 4799, inStock: true }
  ];
  const pennyAnalyzed = analyzeProduct(pennyProd, pennyHist);
  assert.equal(pennyAnalyzed.stats.isAllTimeLow, false);
  assert.notEqual(pennyAnalyzed.stats.verdict, 'all_time_low');

  // 2. Flat history (zero price variation)
  const flatAnalyzed = analyzeProduct(
    { id: 'falabella:flat1', storeId: 'falabella', title: 'TV Test', price: 1499, listPrice: 1999, inStock: true },
    [
      { date: '2026-11-23', price: 1499, listPrice: 1999, inStock: true },
      { date: '2026-11-24', price: 1499, listPrice: 1999, inStock: true },
      { date: '2026-11-25', price: 1499, listPrice: 1999, inStock: true }
    ]
  );
  assert.equal(flatAnalyzed.stats.isAllTimeLow, false);
  assert.notEqual(flatAnalyzed.stats.verdict, 'all_time_low');

  // 3. Inflated base/fake discount even if price moved slightly
  const inflatedAnalyzed = analyzeProduct(
    { id: 'oechsle:inf1', storeId: 'oechsle', title: 'Set Belleza', price: 79, listPrice: 250, inStock: true },
    [
      { date: '2026-11-23', price: 199, listPrice: 250, inStock: true },
      { date: '2026-11-24', price: 79, listPrice: 250, inStock: true },
      { date: '2026-11-25', price: 79, listPrice: 250, inStock: true }
    ]
  );
  assert.equal(inflatedAnalyzed.stats.isFakeDiscount, true);
  assert.equal(inflatedAnalyzed.stats.isAllTimeLow, false);
});


