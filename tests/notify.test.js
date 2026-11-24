import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickTopAlerts,
  buildTelegramMessages,
  buildTelegramHtml,
  isSimilarProduct
} from '../scraper/notify.js';

function makeProduct(overrides = {}) {
  const id = overrides.id || 'store1:1';
  const [storeId] = id.split(':');
  return {
    id,
    storeId: overrides.storeId || storeId,
    storeName: overrides.storeName || storeId,
    title: overrides.title || 'Producto de prueba',
    brand: overrides.brand || 'MarcaX',
    category: overrides.category || 'tecnologia',
    price: overrides.price ?? 199,
    listPrice: overrides.listPrice ?? 299,
    effectivePrice: overrides.effectivePrice ?? overrides.price ?? 199,
    cardPrice: overrides.cardPrice ?? null,
    cardName: overrides.cardName ?? null,
    inStock: overrides.inStock ?? true,
    groupId: overrides.groupId ?? null,
    stats: {
      isBugazo: false,
      bugazoType: null,
      isAllTimeLow: false,
      isFakeDiscount: false,
      verdict: 'great_deal',
      dealScore: 85,
      realDiscountPct: 20,
      storeDiscountPct: 30,
      peerDiscountPct: 0,
      delta24hPct: 0,
      ...(overrides.stats || {})
    }
  };
}

test('isSimilarProduct detects SKU/gender/color variants and cross-store identical items', () => {
  const s1 = makeProduct({
    id: 'shopstar:1',
    storeId: 'shopstar',
    storeName: 'Shopstar',
    brand: '2Change',
    category: 'deporte',
    title: 'Zapatillas Urbanas 2Change Hombres 2Ch-Cd00003'
  });
  const s2 = makeProduct({
    id: 'shopstar:2',
    storeId: 'shopstar',
    storeName: 'Shopstar',
    brand: '2Change',
    category: 'deporte',
    title: 'Zapatillas Urbanas 2Change Mujeres 2Ch-Cd000001'
  });
  const metro = makeProduct({
    id: 'metro:10',
    storeId: 'metro',
    storeName: 'Metro',
    brand: 'Fisher-Price',
    category: 'tecnologia',
    title: 'Primer Laptop Aprendizaje Fisher-Price'
  });
  const wong = makeProduct({
    id: 'wong:20',
    storeId: 'wong',
    storeName: 'Wong',
    brand: 'Fisher-Price',
    category: 'tecnologia',
    title: 'Primer Laptop Aprendizaje Fisher-Price'
  });
  const tv = makeProduct({
    id: 'coolbox:50',
    storeId: 'coolbox',
    storeName: 'Coolbox',
    brand: 'Samsung',
    category: 'televisores',
    title: 'Smart TV Samsung 65 Crystal UHD 4K'
  });

  assert.equal(isSimilarProduct(s1, s2), true);
  assert.equal(isSimilarProduct(metro, wong), true);
  assert.equal(isSimilarProduct(s1, tv), false);
});

test('pickTopAlerts prevents a single store or sneaker line from monopolizing Telegram alerts', () => {
  const catalog = [
    // 8 variants of the same Shopstar sneaker with score 100 and -70% crash
    ...Array.from({ length: 8 }, (_, i) =>
      makeProduct({
        id: `shopstar:${i + 1}`,
        storeId: 'shopstar',
        storeName: 'Shopstar',
        brand: '2Change',
        category: 'deporte',
        title: `Zapatillas Urbanas 2Change ${i % 2 === 0 ? 'Hombres' : 'Mujeres'} 2Ch-Cd0000${i + 1}`,
        price: 55 + i,
        stats: {
          isBugazo: true,
          bugazoType: 'historical_crash',
          isAllTimeLow: true,
          verdict: 'all_time_low',
          dealScore: 100,
          realDiscountPct: 54 - i,
          storeDiscountPct: 70 - i,
          delta24hPct: -70 + i
        }
      })
    ),
    // Identical Fisher-Price item in Metro and Wong (should only appear once)
    makeProduct({
      id: 'metro:1',
      storeId: 'metro',
      storeName: 'Metro',
      brand: 'Fisher-Price',
      category: 'tecnologia',
      title: 'Primer Laptop Aprendizaje Fisher-Price',
      price: 80.9,
      stats: { isBugazo: true, bugazoType: 'historical_crash', isAllTimeLow: true, dealScore: 98, realDiscountPct: 25, delta24hPct: -40 }
    }),
    makeProduct({
      id: 'wong:1',
      storeId: 'wong',
      storeName: 'Wong',
      brand: 'Fisher-Price',
      category: 'tecnologia',
      title: 'Primer Laptop Aprendizaje Fisher-Price',
      price: 80.9,
      stats: { isBugazo: true, bugazoType: 'historical_crash', isAllTimeLow: true, dealScore: 98, realDiscountPct: 25, delta24hPct: -40 }
    }),
    // Diverse offers across many stores and categories
    makeProduct({
      id: 'oechsle:1',
      storeId: 'oechsle',
      storeName: 'Oechsle',
      brand: 'Siegen',
      category: 'belleza',
      title: 'Secadora Siegen Tourmalina Ion SG-3012',
      price: 49,
      stats: { isBugazo: true, bugazoType: 'historical_crash', isAllTimeLow: true, dealScore: 99, realDiscountPct: 33, delta24hPct: -50 }
    }),
    makeProduct({
      id: 'falabella:1',
      storeId: 'falabella',
      storeName: 'Falabella',
      brand: 'Oster',
      category: 'electro',
      title: 'Cafetera Eléctrica Oster 5 Tazas Roja',
      price: 59,
      stats: { isBugazo: true, bugazoType: 'cross_store', dealScore: 90, realDiscountPct: 0, peerDiscountPct: 37, storeDiscountPct: 40 }
    }),
    makeProduct({
      id: 'hiraoka:1',
      storeId: 'hiraoka',
      storeName: 'Hiraoka',
      brand: 'Sony',
      category: 'audio',
      title: 'Sony Parlante Bluetooth ULT Tower 5',
      price: 999,
      stats: { isBugazo: true, bugazoType: 'cross_store', dealScore: 90, realDiscountPct: 0, peerDiscountPct: 37.5, storeDiscountPct: 37.5 }
    }),
    makeProduct({
      id: 'plazavea:1',
      storeId: 'plazavea',
      storeName: 'PlazaVea',
      brand: 'Motorola',
      category: 'celulares',
      title: 'Smartphone Motorola Moto G15 256GB',
      price: 489,
      stats: { isAllTimeLow: true, verdict: 'all_time_low', dealScore: 91, realDiscountPct: 18, delta24hPct: -18 }
    }),
    makeProduct({
      id: 'promart:1',
      storeId: 'promart',
      storeName: 'Promart',
      brand: 'Magefesa',
      category: 'hogar',
      title: 'Juego de ollas inoxidable 10 piezas Magefesa',
      price: 349,
      stats: { isAllTimeLow: true, verdict: 'all_time_low', dealScore: 96, realDiscountPct: 19, delta24hPct: -32 }
    }),
    makeProduct({
      id: 'coolbox:1',
      storeId: 'coolbox',
      storeName: 'Coolbox',
      brand: 'Samsung',
      category: 'televisores',
      title: 'Televisor Samsung 65 Crystal UHD 4K',
      price: 1449,
      stats: { isAllTimeLow: true, verdict: 'all_time_low', dealScore: 88, realDiscountPct: 15, delta24hPct: -15 }
    }),
    makeProduct({
      id: 'tottus:1',
      storeId: 'tottus',
      storeName: 'Tottus',
      brand: 'Dolce Gusto',
      category: 'supermercado',
      title: 'Cápsulas de Café Dolce Gusto Caja 10 Und',
      price: 26.5,
      stats: { isAllTimeLow: true, verdict: 'all_time_low', dealScore: 86, realDiscountPct: 14, delta24hPct: -14 }
    }),
    makeProduct({
      id: 'sony:1',
      storeId: 'sony',
      storeName: 'Sony Store PE',
      brand: 'PlayStation',
      category: 'gaming',
      title: 'Consola PS5 Slim Digital 1TB',
      price: 1899,
      stats: { verdict: 'great_deal', dealScore: 84, realDiscountPct: 12 }
    }),
    makeProduct({
      id: 'tailoy:1',
      storeId: 'tailoy',
      storeName: 'Tai Loy',
      brand: 'Kipit',
      category: 'moda',
      title: 'Mochila Kipit Acolchada',
      price: 22.9,
      stats: { verdict: 'great_deal', dealScore: 80, realDiscountPct: 0, storeDiscountPct: 60 }
    }),
    makeProduct({
      id: 'carsa:1',
      storeId: 'carsa',
      storeName: 'Carsa',
      brand: 'Sole',
      category: 'electro',
      title: 'Aire Acondicionado Portátil Sole 9000 BTU',
      price: 1599,
      stats: { verdict: 'great_deal', dealScore: 88, realDiscountPct: 0, storeDiscountPct: 0, peerDiscountPct: 30.4 }
    }),
    // Fake / inflated and out-of-stock products (must be excluded)
    makeProduct({
      id: 'estilos:fake',
      storeId: 'estilos',
      storeName: 'Estilos',
      category: 'hogar',
      title: 'Producto Inflado Cyber',
      stats: { isBugazo: true, isFakeDiscount: true, verdict: 'inflated', dealScore: 99 }
    }),
    makeProduct({
      id: 'infotec:oos',
      storeId: 'infotec',
      storeName: 'Infotec Perú',
      category: 'tecnologia',
      title: 'Tarjeta RTX Sin Stock',
      inStock: false,
      stats: { isBugazo: true, dealScore: 99 }
    })
  ];

  const bundle = pickTopAlerts(catalog, { targetPrices: {} });

  // Only 1 Shopstar sneaker variant should be included
  const shopstarPicks = bundle.picks.filter((p) => p.storeId === 'shopstar');
  assert.equal(shopstarPicks.length, 1);

  // Metro & Wong duplicate Fisher-Price laptop should appear only once
  const fisherPicks = bundle.picks.filter((p) => p.title.includes('Fisher-Price'));
  assert.equal(fisherPicks.length, 1);

  // Inflated & out-of-stock items must not appear
  assert.equal(bundle.picks.some((p) => p.id === 'estilos:fake'), false);
  assert.equal(bundle.picks.some((p) => p.id === 'infotec:oos'), false);

  // Broad variety of stores and categories
  assert.ok(bundle.picks.length >= 12, `Expected >= 12 picks, got ${bundle.picks.length}`);
  assert.ok(bundle.stats.uniqueStores >= 12, `Expected >= 12 unique stores, got ${bundle.stats.uniqueStores}`);
  assert.ok(bundle.stats.uniqueCategories >= 10, `Expected >= 10 unique categories, got ${bundle.stats.uniqueCategories}`);

  // Formatted HTML should never show "-0%" and should show peer discount for Carsa
  const html = buildTelegramHtml(bundle, { lastUpdatedDate: '2026-11-24', totalProducts: 5050, activeStores: 30, bugazosCount: 14 });
  assert.equal(html.includes('-0%'), false, 'Formatted HTML should never contain -0%');
  assert.ok(html.includes('-30.4% vs tiendas'), 'Should display peer discount when real/store discounts are 0');
});

test('pickTopAlerts prioritizes watchlist targetHits and buildTelegramMessages chunks safely under limit', () => {
  const sampleTitles = [
    'Laptop Lenovo IdeaPad Slim 5 16GB',
    'Televisor LG OLED C4 55 pulgadas',
    'Smartphone Samsung Galaxy A55 256GB',
    'Parlante Bluetooth JBL Charge 5',
    'Consola Nintendo Switch OLED Blanca',
    'Refrigeradora Indurama No Frost 420L',
    'Juego de Ollas Tramontina 12 Piezas',
    'Bicicleta Montañera Aro 29 Aluminio',
    'Maleta Cabina Rígida Samsonite',
    'Plancha de Cabello Remington Keratina',
    'Café Grano Molido Juan Valdez 500g',
    'Monitor Gamer Asus TUF 27 IPS 165Hz',
    'Audífonos Sony WH-1000XM5 Inalámbricos',
    'Freidora de Aire Oster Digital 5 Litros'
  ];
  const catalog = sampleTitles.map((title, i) =>
    makeProduct({
      id: `store${i}:${i}`,
      storeId: `store${i}`,
      storeName: `Tienda ${i + 1}`,
      brand: `Marca${i}`,
      category: ['tecnologia', 'televisores', 'celulares', 'audio', 'gaming', 'electro', 'hogar', 'deporte', 'moda', 'belleza', 'supermercado'][i % 11],
      title,
      price: 100 + i * 25,
      effectivePrice: 100 + i * 25,
      stats: {
        isBugazo: i < 5,
        bugazoType: i < 5 ? 'cross_store' : null,
        isAllTimeLow: i >= 5 && i < 10,
        verdict: i < 10 ? 'all_time_low' : 'great_deal',
        dealScore: 95 - i,
        realDiscountPct: 25
      }
    })
  );

  const watchlist = { targetPrices: { 'store12:12': 500 } };
  const bundle = pickTopAlerts(catalog, watchlist);

  assert.equal(bundle.targetHits.length, 1);
  assert.equal(bundle.targetHits[0].id, 'store12:12');
  // Target hit should not be duplicated in other sections
  assert.equal(bundle.picks.filter((p) => p.id === 'store12:12').length, 1);

  const messages = buildTelegramMessages(
    bundle,
    { lastUpdatedDate: '2026-11-24', totalProducts: 500, activeStores: 14, bugazosCount: 5 },
    { maxVisibleChars: 800, watchlist }
  );

  assert.ok(messages.length >= 2, `Expected message to split into >= 2 parts under 800 chars, got ${messages.length}`);
  for (const msg of messages) {
    const visible = msg
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    assert.ok(visible.length <= 800, `Chunk exceeded 800 visible chars: ${visible.length}`);
    // Balanced HTML tags in every chunk
    assert.equal((msg.match(/<b>/g) || []).length, (msg.match(/<\/b>/g) || []).length);
    assert.equal((msg.match(/<i>/g) || []).length, (msg.match(/<\/i>/g) || []).length);
    assert.equal((msg.match(/<a /g) || []).length, (msg.match(/<\/a>/g) || []).length);
  }
  assert.ok(messages[0].includes('PRECIO OBJETIVO ALCANZADO'));
});
