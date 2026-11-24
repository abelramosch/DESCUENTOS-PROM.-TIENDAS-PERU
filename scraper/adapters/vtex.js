import { fetchWithTimeout, makeProductId } from '../http.js';

/**
 * Adapter para tiendas peruanas con API pública de catálogo VTEX
 * (PlazaVea, Oechsle, Promart, Wong, Metro, Coolbox, Carsa, Shopstar,
 * Estilos, Triathlon, Footloose, Sony, Xiaomi, Casaideas, Aruma).
 */
export async function searchVtexStore(store, query, limit = 10, category = 'tecnologia', options = {}) {
  const { orderBy = null, minPrice = null, inStockOnly = false } = options;
  const encoded = encodeURIComponent(query);
  const to = Math.max(0, limit - 1);
  let url = `${store.baseUrl}/api/catalog_system/pub/products/search?ft=${encoded}&_from=0&_to=${to}`;
  if (minPrice && Number(minPrice) > 0) {
    url += `&fq=${encodeURIComponent(`P:[${Number(minPrice)} TO 99999]`)}`;
  }
  if (orderBy) {
    url += `&O=${encodeURIComponent(orderBy)}`;
  }

  const res = await fetchWithTimeout(url, {
    timeoutMs: 10000,
    headers: { Accept: 'application/json' }
  });

  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw)) return [];

  const products = [];
  for (const item of raw) {
    const normalized = normalizeVtexProduct(store, item, category);
    if (!normalized) continue;
    if (inStockOnly && !normalized.inStock) continue;
    if (minPrice && normalized.price < Number(minPrice)) continue;
    products.push(normalized);
  }
  return products;
}

export async function fetchVtexProductByUrl(store, productUrl) {
  // VTEX product URLs end in /<slug>/p
  const u = new URL(productUrl);
  const slugMatch = u.pathname.match(/\/([^/]+)\/p\/?$/i);
  if (!slugMatch) return null;

  const slug = encodeURIComponent(slugMatch[1]);
  const apiUrl = `${store.baseUrl}/api/catalog_system/pub/products/search/${slug}/p`;
  const res = await fetchWithTimeout(apiUrl, {
    timeoutMs: 10000,
    headers: { Accept: 'application/json' }
  });
  if (!res.ok && res.status !== 206) return null;
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  return normalizeVtexProduct(store, data[0], 'personal');
}

export function normalizeVtexProduct(store, p, category) {
  if (!p || !Array.isArray(p.items) || p.items.length === 0) return null;

  // Pick first in-stock SKU with a valid price, or fall back to first SKU
  let chosenItem = null;
  let chosenOffer = null;

  for (const skuItem of p.items) {
    const sellers = skuItem?.sellers || [];
    for (const seller of sellers) {
      const offer = seller?.commertialOffer;
      if (offer && Number(offer.Price) > 0 && Number(offer.AvailableQuantity) > 0) {
        chosenItem = skuItem;
        chosenOffer = offer;
        break;
      }
    }
    if (chosenOffer) break;
  }

  if (!chosenOffer) {
    const fallbackItem = p.items[0];
    const fallbackOffer = fallbackItem?.sellers?.[0]?.commertialOffer;
    if (!fallbackOffer || Number(fallbackOffer.Price) <= 0) return null;
    chosenItem = fallbackItem;
    chosenOffer = fallbackOffer;
  }

  const price = round2(Number(chosenOffer.Price));
  const rawList = Number(chosenOffer.ListPrice) || price;
  const listPrice = round2(Math.max(price, rawList));

  // Detect spotPrice or bank/store-card teaser discount if available
  let cardPrice = null;
  let cardName = null;
  const spotPrice = Number(chosenOffer.spotPrice);
  if (spotPrice > 0 && spotPrice < price) {
    cardPrice = round2(spotPrice);
    cardName = store.cardName || 'Tarjeta';
  }

  const teasers = [...(chosenOffer.Teasers || []), ...(chosenOffer.PromotionTeasers || [])];
  if (teasers.length) {
    for (const t of teasers) {
      const tName = String(t?.name || t?.Name || '').toLowerCase();
      const detectedCard = detectBankCardName(tName);
      if (!detectedCard) continue;
      // Extract percentage or nominal discount from VTEX teaser effects if available
      const effects = t?.effects?.parameters || t?.Effects?.Parameters || [];
      const pctParam = effects.find((p) => /percent/i.test(p?.name || p?.Name || ''));
      const pctVal = Number(pctParam?.value || pctParam?.Value);
      if (pctVal > 0 && pctVal < 60) {
        const promoPrice = round2(price * (1 - pctVal / 100));
        if (!cardPrice || promoPrice < cardPrice) {
          cardPrice = promoPrice;
          cardName = detectedCard;
        }
      } else if (cardPrice && !cardName) {
        cardName = detectedCard;
      }
    }
  }

  const image = chosenItem?.images?.[0]?.imageUrl || '';
  const productUrl = p.link || (p.linkText ? `${store.baseUrl}/${p.linkText}/p` : store.baseUrl);
  const sku = String(p.productId || chosenItem.itemId || p.linkText);
  const title = cleanText(p.productName || chosenItem.nameComplete || '');
  if (!title || price <= 0) return null;

  return {
    id: makeProductId(store.id, sku),
    storeId: store.id,
    storeName: store.name,
    sku,
    title,
    brand: cleanText(p.brand || ''),
    category,
    url: productUrl.startsWith('http') ? productUrl : `${store.baseUrl}${productUrl}`,
    image,
    price,
    listPrice,
    cardPrice,
    cardName: cardPrice ? cardName || store.cardName || 'Tarjeta' : null,
    originalCurrency: 'PEN',
    originalPrice: null,
    inStock: Number(chosenOffer.AvailableQuantity) > 0
  };
}

function detectBankCardName(text) {
  if (/\bbcp\b|yape|banca\s+bcp/i.test(text)) return 'BCP';
  if (/\bcmr\b|falabella/i.test(text)) return 'CMR';
  if (/tarjeta\s*oh|financiera\s*oh|\boh!\b/i.test(text)) return 'Tarjeta Oh!';
  if (/cencosud/i.test(text)) return 'Cencosud';
  if (/interbank|\bibk\b/i.test(text)) return 'Interbank';
  if (/\bbbva\b/i.test(text)) return 'BBVA';
  return null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function cleanText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}
