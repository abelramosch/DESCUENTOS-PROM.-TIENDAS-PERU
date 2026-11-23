import { fetchWithTimeout, getUsdToPenRate, makeProductId } from '../http.js';

/**
 * Adapter para tiendas especializadas de tecnología / PC en Perú sobre PrestaShop JSON
 * (Infotec Perú, Sercoplus, CyC Computer).
 * Convierte automáticamente precios en USD a PEN usando tipo de cambio real,
 * preservando el precio original en dólares para transparencia.
 */
export async function searchPrestashopStore(store, query, limit = 10, category = 'tecnologia') {
  const url = `${store.baseUrl}/busqueda?controller=search&s=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 10000,
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const list = Array.isArray(data?.products) ? data.products : [];
  const rate = store.currency === 'USD' ? await getUsdToPenRate() : 1;

  const products = [];
  for (const item of list) {
    if (products.length >= limit) break;
    const rawAmount = Number(item.price_amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;

    const rawRegular = Number(item.regular_price_amount) || rawAmount;
    const priceStr = String(item.price || '');
    const isUsd = store.currency === 'USD' || (/\$/.test(priceStr) && !/S\//i.test(priceStr));
    const effectiveRate = isUsd ? (rate > 1 ? rate : await getUsdToPenRate()) : 1;

    const pricePen = round2(rawAmount * effectiveRate);
    const listPen = round2(Math.max(rawAmount, rawRegular) * effectiveRate);
    const sku = String(item.id_product || item.reference || item.id || '');
    const image =
      item?.cover?.medium?.url ||
      item?.cover?.bySize?.home_default?.url ||
      item?.cover?.large?.url ||
      '';
    const title = String(item.name || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    products.push({
      id: makeProductId(store.id, sku || item.url),
      storeId: store.id,
      storeName: store.name,
      sku,
      title,
      brand: String(item.manufacturer_name || '').trim(),
      category,
      url: item.url || store.baseUrl,
      image,
      price: pricePen,
      listPrice: listPen,
      cardPrice: null,
      cardName: null,
      originalCurrency: isUsd ? 'USD' : 'PEN',
      originalPrice: isUsd ? round2(rawAmount) : null,
      inStock: item.quantity === undefined ? true : Number(item.quantity) > 0
    });
  }

  return products;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
