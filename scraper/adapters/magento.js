import * as cheerio from 'cheerio';
import { fetchWithTimeout, makeProductId, parsePriceNumber } from '../http.js';

/**
 * Adapter para tiendas Magento 2 en Perú (Hiraoka, Tai Loy).
 */
export async function searchMagentoStore(store, query, limit = 10, category = 'tecnologia') {
  const url = `${store.baseUrl}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
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

    const $link = $el.find('a.product-item-link').first();
    const title = $link.text().replace(/\s+/g, ' ').trim();
    const href = $link.attr('href');
    if (!title || !href) return;

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
    const brand = $el.find('.product-brand, .brand-name').first().text().trim();

    products.push({
      id: makeProductId(store.id, sku),
      storeId: store.id,
      storeName: store.name,
      sku: String(sku),
      title,
      brand,
      category,
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
