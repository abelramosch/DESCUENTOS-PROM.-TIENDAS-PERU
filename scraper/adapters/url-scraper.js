import * as cheerio from 'cheerio';
import { detectStoreFromUrl } from '../../config/stores.js';
import { fetchWithTimeout, getUsdToPenRate, makeProductId, parsePriceNumber } from '../http.js';
import { fetchVtexProductByUrl } from './vtex.js';
import { fetchFalabellaProductByUrl } from './falabella.js';

/**
 * Extractor universal de productos a partir de CUALQUIER URL de tienda en Perú.
 * Intenta en orden:
 *  1. API nativa VTEX (si es tienda VTEX)
 *  2. Datos SSR Falabella/Tottus (__NEXT_DATA__)
 *  3. Schema.org JSON-LD (@type: Product)
 *  4. OpenGraph / Meta tags de e-commerce + selectores HTML estándar
 */
export async function scrapeProductUrl(rawUrl, category = 'personal') {
  const url = rawUrl.trim();
  const parsedUrl = new URL(url);
  const knownStore = detectStoreFromUrl(url);

  // 1. Native VTEX fast path
  if (knownStore?.engine === 'vtex') {
    try {
      const vtexProd = await fetchVtexProductByUrl(knownStore, url);
      if (vtexProd) return { ...vtexProd, category };
    } catch {
      // Fallback to HTML parsing
    }
  }

  // 2. Native Falabella SSR fast path
  if (knownStore?.engine === 'falabella') {
    try {
      const falProd = await fetchFalabellaProductByUrl(knownStore, url);
      if (falProd) return { ...falProd, category };
    } catch {
      // Fallback to HTML parsing
    }
  }

  // 3. Universal HTML + JSON-LD + OpenGraph fallback (works on Hiraoka, Infotec, Sercoplus, CyC, Shopify, WooCommerce, etc.)
  const res = await fetchWithTimeout(url, {
    timeoutMs: 12000,
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
  if (!res.ok) {
    throw new Error(`No se pudo acceder a la URL (HTTP ${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const jsonLdProduct = extractJsonLdProduct($);
  const storeId = knownStore?.id || parsedUrl.hostname.replace(/^www\./, '').split('.')[0].toLowerCase();
  const storeName = knownStore?.name || formatDomainName(parsedUrl.hostname);

  const title = cleanText(
    jsonLdProduct?.name ||
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text() ||
      $('title').text()
  );

  let rawPrice = null;
  let rawListPrice = null;
  let currency = knownStore?.currency || 'PEN';

  if (jsonLdProduct) {
    const offers = Array.isArray(jsonLdProduct.offers)
      ? jsonLdProduct.offers[0]
      : jsonLdProduct.offers;
    if (offers) {
      rawPrice = parsePriceNumber(String(offers.price ?? offers.lowPrice ?? ''));
      rawListPrice = parsePriceNumber(String(offers.highPrice ?? ''));
      if (offers.priceCurrency) {
        currency = String(offers.priceCurrency).toUpperCase();
      }
    }
  }

  if (!rawPrice) {
    const metaPrice =
      $('meta[property="product:price:amount"]').attr('content') ||
      $('meta[property="og:price:amount"]').attr('content') ||
      $('[itemprop="price"]').attr('content') ||
      $('[data-price-type="finalPrice"]').attr('data-price-amount') ||
      $('.current-price [itemprop="price"]').attr('content') ||
      $('.special-price .price, .product-price, .price .woocommerce-Price-amount').first().text();
    rawPrice = parsePriceNumber(metaPrice);

    const metaCurrency =
      $('meta[property="product:price:currency"]').attr('content') ||
      $('meta[property="og:price:currency"]').attr('content') ||
      $('[itemprop="priceCurrency"]').attr('content');
    if (metaCurrency) currency = metaCurrency.toUpperCase();
  }

  if (!rawListPrice) {
    const oldText =
      $('[data-price-type="oldPrice"]').attr('data-price-amount') ||
      $('.old-price .price, .regular-price, del .woocommerce-Price-amount').first().text();
    rawListPrice = parsePriceNumber(oldText);
  }

  if (!title || !rawPrice) {
    throw new Error('No se encontró un precio válido en esta página. Verifica que sea una página directa de producto.');
  }

  const isUsd = currency === 'USD';
  const rate = isUsd ? await getUsdToPenRate() : 1;
  const price = Math.round(rawPrice * rate * 100) / 100;
  const listPrice = Math.round(Math.max(rawPrice, rawListPrice || rawPrice) * rate * 100) / 100;

  let image = '';
  if (jsonLdProduct?.image) {
    image = Array.isArray(jsonLdProduct.image) ? jsonLdProduct.image[0] : jsonLdProduct.image;
    if (typeof image === 'object' && image.url) image = image.url;
  }
  if (!image) {
    image =
      $('meta[property="og:image"]').attr('content') ||
      $('img.product-image-photo, .product-cover img, main img').first().attr('src') ||
      '';
  }
  if (image && image.startsWith('/')) {
    image = `${parsedUrl.origin}${image}`;
  }

  const brand =
    (typeof jsonLdProduct?.brand === 'string'
      ? jsonLdProduct.brand
      : jsonLdProduct?.brand?.name) ||
    $('meta[property="product:brand"]').attr('content') ||
    '';

  const sku = String(jsonLdProduct?.sku || jsonLdProduct?.mpn || parsedUrl.pathname);

  return {
    id: makeProductId(storeId, sku),
    storeId,
    storeName,
    sku,
    title,
    brand: cleanText(brand),
    category,
    url,
    image,
    price,
    listPrice,
    cardPrice: null,
    cardName: null,
    originalCurrency: isUsd ? 'USD' : 'PEN',
    originalPrice: isUsd ? rawPrice : null,
    inStock: true
  };
}

function extractJsonLdProduct($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return false;
    try {
      const parsed = JSON.parse($(el).text());
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed['@graph']
          ? parsed['@graph']
          : [parsed];
      for (const node of candidates) {
        const type = node?.['@type'];
        if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
          found = node;
          return false;
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });
  return found;
}

function formatDomainName(hostname) {
  const clean = hostname.replace(/^www\./i, '').split('.')[0];
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function cleanText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}
