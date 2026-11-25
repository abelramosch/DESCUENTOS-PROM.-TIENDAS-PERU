import { fetchWithTimeout, makeProductId, parsePriceNumber } from '../http.js';

/**
 * Adapter para Grupo Falabella Perú (Falabella.com.pe y Tottus.falabella.com.pe)
 * usando los datos estructurados embebidos en __NEXT_DATA__.
 */
export async function searchFalabellaStore(store, query, limit = 10, category = 'tecnologia', options = {}) {
  const { minPrice = null, maxPrice = null } = options || {};
  const url = `${store.baseUrl}${store.searchPath}${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 9000,
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  const nextData = extractNextData(html);
  const results = nextData?.props?.pageProps?.results || [];
  if (!Array.isArray(results)) return [];

  const products = [];
  for (const item of results) {
    if (products.length >= limit) break;
    const normalized = normalizeFalabellaResult(store, item, category);
    if (!normalized) continue;
    if (minPrice && normalized.price < Number(minPrice)) continue;
    if (maxPrice && normalized.price > Number(maxPrice)) continue;
    products.push(normalized);
  }
  return products;
}

export async function fetchFalabellaProductByUrl(store, productUrl) {
  const res = await fetchWithTimeout(productUrl, {
    timeoutMs: 12000,
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
  if (!res.ok) return null;
  const html = await res.text();
  const nextData = extractNextData(html);
  const prod = nextData?.props?.pageProps?.productData;
  if (!prod) return null;

  const variant = prod.variants?.[0] || {};
  const prices = variant.prices || prod.prices || [];
  const { price, listPrice, cardPrice } = parseFalabellaPrices(prices);
  if (!price) return null;

  const image =
    variant.medias?.[0]?.url ||
    prod.medias?.[0]?.url ||
    '';

  return {
    id: makeProductId(store.id, prod.id || variant.id || productUrl),
    storeId: store.id,
    storeName: store.name,
    sku: String(prod.id || variant.id || ''),
    title: String(prod.name || '').replace(/\s+/g, ' ').trim(),
    brand: String(prod.brandName || '').trim(),
    category: 'personal',
    url: productUrl,
    image,
    price,
    listPrice: Math.max(price, listPrice || price),
    cardPrice,
    cardName: cardPrice ? store.cardName || 'CMR' : null,
    originalCurrency: 'PEN',
    originalPrice: null,
    inStock: true
  };
}

function normalizeFalabellaResult(store, item, category) {
  if (!item || !item.displayName) return null;
  const { price, listPrice, cardPrice } = parseFalabellaPrices(item.prices || []);
  if (!price) return null;

  const sku = String(item.productId || item.skuId || '');
  const rawUrl = item.url || '';
  const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${store.baseUrl}${rawUrl}`;
  const image = Array.isArray(item.mediaUrls) ? item.mediaUrls[0] || '' : '';

  return {
    id: makeProductId(store.id, sku || fullUrl),
    storeId: store.id,
    storeName: store.name,
    sku,
    title: String(item.displayName).replace(/\s+/g, ' ').trim(),
    brand: String(item.brand || '').trim(),
    category,
    url: fullUrl,
    image,
    price,
    listPrice: Math.max(price, listPrice || price),
    cardPrice,
    cardName: cardPrice ? store.cardName || 'CMR' : null,
    originalCurrency: 'PEN',
    originalPrice: null,
    inStock: true
  };
}

function parseFalabellaPrices(prices = []) {
  let cmrPrice = null;
  let internetPrice = null;
  let normalPrice = null;

  for (const p of prices) {
    const rawVal = Array.isArray(p.price) ? p.price[0] : p.price;
    const val = parsePriceNumber(String(rawVal || ''));
    if (!val) continue;

    if (p.type === 'cmrPrice') {
      cmrPrice = val;
    } else if (p.type === 'eventPrice' || p.type === 'internetPrice') {
      if (!internetPrice || val < internetPrice) internetPrice = val;
    } else if (p.type === 'normalPrice' || p.crossed) {
      if (!normalPrice || val > normalPrice) normalPrice = val;
    } else if (!internetPrice) {
      internetPrice = val;
    }
  }

  const price = internetPrice || cmrPrice || normalPrice;
  const listPrice = normalPrice || internetPrice || price;
  const cardPrice = cmrPrice && price && cmrPrice < price ? cmrPrice : null;

  return { price, listPrice, cardPrice };
}

function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
