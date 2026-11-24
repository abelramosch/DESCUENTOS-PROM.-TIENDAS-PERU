import * as cheerio from 'cheerio';
import { fetchWithTimeout, makeProductId, parsePriceNumber } from '../http.js';

const PRIMARY_SEASONAL_REGEX = /black-friday|cyber|navidad|oferta|promo|liquidaci|remate/i;
const SECONDARY_SEASONAL_REGEX = /combo/i;

/**
 * Adapter para tiendas Magento 2 en Perú (Hiraoka, Tai Loy).
 * Soporta búsqueda directa (/catalogsearch/result/) y escaneo de páginas
 * oficiales de categorías / campañas de temporada (ej. Hiraoka /black-friday).
 */
export async function searchMagentoStore(store, query, limit = 10, category = 'tecnologia') {
  if (store.useCategoryPages && Array.isArray(store.categoryPages)) {
    const matched = await searchMagentoViaCategories(store, query, limit, category);
    return matched;
  }

  const url = `${store.baseUrl}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
  return fetchMagentoProductList(store, url, category, limit);
}

export async function fetchMagentoCategoryPage(store, pagePath, category = 'tecnologia', limit = 16) {
  const url = pagePath.startsWith('http')
    ? pagePath
    : `${store.baseUrl}${pagePath.startsWith('/') ? '' : '/'}${pagePath}`;
  return fetchMagentoProductList(store, url, category, limit);
}

/**
 * Descubre automáticamente páginas de campañas de temporada (Black Friday, Cyber, Navidad, etc.)
 * desde el menú principal de la tienda Magento.
 */
export async function discoverMagentoSeasonalPaths(store) {
  try {
    const res = await fetchWithTimeout(store.baseUrl, {
      timeoutMs: 10000,
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const primary = new Set();
    const secondary = new Set();

    $('nav a, .navigation a, .menu a, header a').each((_, el) => {
      const href = String($(el).attr('href') || '').trim();
      if (!href) return;
      try {
        const u = new URL(href, store.baseUrl);
        if (u.hostname !== new URL(store.baseUrl).hostname) return;
        const depth = u.pathname.split('/').filter(Boolean).length;
        if (depth === 0 || depth > 2) return;
        if (PRIMARY_SEASONAL_REGEX.test(u.pathname)) {
          primary.add(u.pathname);
        } else if (depth === 1 && SECONDARY_SEASONAL_REGEX.test(u.pathname)) {
          secondary.add(u.pathname);
        }
      } catch {
        // ignore invalid href
      }
    });

    return [...primary, ...secondary].slice(0, 3);
  } catch {
    return [];
  }
}

async function searchMagentoViaCategories(store, query, limit, fallbackCategory) {
  const tokens = String(query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  const pages = store.categoryPages.slice(0, 4);
  const all = [];
  for (const cfg of pages) {
    try {
      const items = await fetchMagentoCategoryPage(store, cfg.path, cfg.category || fallbackCategory, 16);
      all.push(...items);
    } catch {
      // ignore unreachable page
    }
  }
  if (!tokens.length) return all.slice(0, limit);
  return all
    .filter((item) => {
      const hay = `${item.title} ${item.brand}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return tokens.some((t) => hay.includes(t));
    })
    .slice(0, limit);
}

async function fetchMagentoProductList(store, url, category, limit) {
  const res = await fetchWithTimeout(url, {
    timeoutMs: 12000,
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const products = [];

  $('.product-item, li.item.product').each((_, el) => {
    if (products.length >= limit) return false;
    const $el = $(el);

    // Hiraoka coloca la marca en el primer a.product-item-link y el título real
    // dentro de .product-item-name a.product-item-link (o el segundo enlace).
    const $nameLink = $el.find('.product-item-name a.product-item-link, strong.product.name a').first();
    const $allLinks = $el.find('a.product-item-link');
    const $titleLink = $nameLink.length
      ? $nameLink
      : $allLinks.length > 1
        ? $allLinks.last()
        : $allLinks.first();

    const title = $titleLink.text().replace(/\s+/g, ' ').trim();
    const href = $titleLink.attr('href');
    if (!title || !href) return;

    let brand = $el.find('.product-brand, .brand-name').first().text().replace(/\s+/g, ' ').trim();
    if (!brand && $allLinks.length > 1) {
      const firstLinkText = $allLinks.first().text().replace(/\s+/g, ' ').trim();
      if (firstLinkText && firstLinkText !== title && firstLinkText.length <= 28) {
        brand = firstLinkText;
      }
    }

    // Special price vs regular/old price
    const specialRaw =
      $el.find('[data-price-type="finalPrice"]').attr('data-price-amount') ||
      $el.find('.special-price .price').first().text() ||
      $el.find('.price-wrapper[data-price-type="finalPrice"] .price').first().text() ||
      $el.find('.price').first().text();

    const oldRaw =
      $el.find('[data-price-type="oldPrice"]').attr('data-price-amount') ||
      $el.find('.old-price .price').first().text();

    const price = parsePriceNumber(specialRaw);
    if (!price) return;
    const listPrice = Math.max(price, parsePriceNumber(oldRaw) || price);

    const sku =
      $el.find('[data-product-sku]').attr('data-product-sku') ||
      $el.find('.price-box').attr('data-product-id') ||
      href;

    const $img = $el.find('img.product-image-photo, img').first();
    const image = $img.attr('data-src') || $img.attr('src') || '';
    const resolvedCategory = category === 'seasonal' ? inferMagentoCategory(title) : category;

    products.push({
      id: makeProductId(store.id, sku),
      storeId: store.id,
      storeName: store.name,
      sku: String(sku),
      title,
      brand,
      category: resolvedCategory,
      url: href.startsWith('http') ? href : `${store.baseUrl}${href}`,
      image,
      price,
      listPrice,
      cardPrice: null,
      cardName: null,
      originalCurrency: 'PEN',
      originalPrice: null,
      inStock: !$el.find('.stock.unavailable').length
    });
  });

  return products;
}

function inferMagentoCategory(title) {
  const t = String(title || '').toLowerCase();
  if (/televisor|smart tv|\btv\b|oled|qled|nanocell/.test(t)) return 'televisores';
  if (/celular|smartphone|iphone|galaxy s|galaxy a|redmi|poco|moto |smartwatch|reloj/.test(t)) return 'celulares';
  if (/laptop|notebook|tablet|ipad|impresora|monitor|proyector|router|ssd|disco|mouse|teclado|camara|cámara|drone/.test(t)) {
    return 'tecnologia';
  }
  if (/playstation|ps5|nintendo|switch|xbox|silla gamer|control|mando/.test(t)) return 'gaming';
  if (/audifon|audífon|parlante|soundbar|barra de sonido|microfono|micrófono|minicomponente|torre de sonido/.test(t)) {
    return 'audio';
  }
  if (/colchon|colchón|almohada|aspiradora|taladro|hidrolavadora|olla|sarten|sartén|parrilla/.test(t)) {
    return 'hogar';
  }
  if (/secadora de cabello|plancha de cabello|afeitadora|depiladora/.test(t)) return 'belleza';
  return 'electro';
}
