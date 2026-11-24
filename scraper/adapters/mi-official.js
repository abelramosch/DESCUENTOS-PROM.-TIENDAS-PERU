import { fetchWithTimeout, makeProductId } from '../http.js';

const MI_STORE_URL = 'https://www.mi.com/pe/store/';
const MI_EVENT_API = 'https://go.buy.mi.com/pe/v2/cms/event/get';
const MI_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*'
};

const IGNORED_EVENT_SLUGS =
  /installment|adobe|warranty|support|terms|privacy|points|service|faq|trade-in|mi-points|about/i;

// Cache full catalog for 5 minutes so Live Search doesn't re-fetch every keystroke
let cachedCatalog = null;
let cachedAt = 0;

/**
 * Adapter oficial para la tienda directa de Xiaomi Perú (https://www.mi.com/pe/).
 * Descubre automáticamente las campañas activas en los banners de la tienda
 * (Black Friday, Cyber, Navidad, Tablet Week, etc.) y consulta la API pública
 * de eventos de Xiaomi Perú para obtener precios y descuentos en vivo.
 */
export async function fetchMiOfficialCatalog(store) {
  const storeHtml = await fetchText(MI_STORE_URL);
  const storePageId = extractPageId(storeHtml);
  const eventUrls = discoverActiveEventUrls(storeHtml);

  const pageIds = new Set();
  if (storePageId) pageIds.add(storePageId);

  // Discover live pageIds for every active promotional event linked from mi.com/pe/store/
  await Promise.all(
    eventUrls.map(async (evUrl) => {
      try {
        const html = await fetchText(evUrl);
        const pid = extractPageId(html);
        if (pid) pageIds.add(pid);
      } catch {
        // Ignore single unreachable event banner
      }
    })
  );

  const bySpu = new Map();

  await Promise.all(
    [...pageIds].map(async (pageId) => {
      try {
        const res = await fetchWithTimeout(`${MI_EVENT_API}?pageId=${encodeURIComponent(pageId)}`, {
          timeoutMs: 10000,
          headers: { ...MI_HEADERS, Accept: 'application/json' }
        });
        if (!res.ok) return;
        const json = await res.json();
        const goods = [];
        collectGoods(json?.data, goods);

        for (const g of goods) {
          const normalized = normalizeMiOfficialProduct(store, g);
          if (!normalized) continue;
          const prev = bySpu.get(normalized.id);
          if (!prev || isBetterRecord(normalized, prev)) {
            bySpu.set(normalized.id, normalized);
          }
        }
      } catch {
        // Ignore individual page API failure
      }
    })
  );

  const items = [...bySpu.values()];
  cachedCatalog = items;
  cachedAt = Date.now();
  return items;
}

/**
 * Búsqueda en vivo sobre el catálogo oficial de Xiaomi Perú (con caché de 5 min).
 */
export async function searchMiOfficialStore(store, query, limit = 10) {
  const catalog =
    cachedCatalog && Date.now() - cachedAt < 5 * 60 * 1000
      ? cachedCatalog
      : await fetchMiOfficialCatalog(store);

  const tokens = String(query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  if (!tokens.length) return catalog.slice(0, limit);

  const scored = [];
  for (const item of catalog) {
    const hay = `${item.title} ${item.brand} ${item.category}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    let hits = 0;
    for (const t of tokens) {
      if (hay.includes(t)) hits += 1;
    }
    if (hits > 0) {
      scored.push({ item, hits });
    }
  }

  scored.sort((a, b) => b.hits - a.hits || a.item.price - b.item.price);
  return scored.slice(0, limit).map((s) => s.item);
}

async function fetchText(url) {
  const res = await fetchWithTimeout(url, {
    timeoutMs: 12000,
    headers: MI_HEADERS
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

function extractPageId(html) {
  const m = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (!m) return null;
  try {
    const state = JSON.parse(m[1]);
    return state?.pagedata?.pageInfo?.pageId || null;
  } catch {
    return null;
  }
}

function discoverActiveEventUrls(html) {
  const found = new Set();
  const matches = html.matchAll(/(?:https?:)?\/\/www\.mi\.com\/pe\/event\/([a-z0-9-]+)\/?/gi);
  for (const m of matches) {
    const slug = m[1];
    if (!slug || IGNORED_EVENT_SLUGS.test(slug)) continue;
    found.add(`https://www.mi.com/pe/event/${slug}/`);
  }
  // Keep up to 6 active campaign pages to stay fast
  return [...found].slice(0, 6);
}

function collectGoods(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectGoods(item, out);
    return;
  }
  if (node.name && (Number(node.salePrice) > 0 || Number(node.originPrice) > 0) && (node.spuId || node.productId || node.itemID)) {
    out.push(node);
  }
  for (const val of Object.values(node)) {
    collectGoods(val, out);
  }
}

function normalizeMiOfficialProduct(store, g) {
  const rawName = String(g.name || '').replace(/\s+/g, ' ').trim();
  if (!rawName || /^EventProduct$/i.test(rawName)) return null;

  // Pick lowest valid sale price from main object or variants
  let price = Number(g.salePrice) || 0;
  let listPrice = Number(g.originPrice) || price;
  let chosenVariant = null;

  if (Array.isArray(g.items) && g.items.length > 0) {
    const validVariants = g.items
      .map((it) => ({
        name: it.name || '',
        capacity: it.capacity || '',
        sale: Number(it.sale_price ?? it.salePrice) || 0,
        orig: Number(it.origin_price ?? it.originPrice) || 0
      }))
      .filter((v) => v.sale > 0)
      .sort((a, b) => a.sale - b.sale);

    if (validVariants.length > 0) {
      chosenVariant = validVariants[0];
      if (!price || chosenVariant.sale < price) {
        price = chosenVariant.sale;
      }
      if (chosenVariant.orig > listPrice) {
        listPrice = chosenVariant.orig;
      }
    }
  }

  if (!price || price <= 0) return null;
  price = round2(price);
  listPrice = round2(Math.max(price, listPrice || price));

  // Append storage/RAM capacity if available and not already in title (helps multi-store matching)
  let title = rawName;
  if (chosenVariant?.capacity && !title.toLowerCase().includes(chosenVariant.capacity.toLowerCase().replace(/\s+/g, ''))) {
    const cleanCap = chosenVariant.capacity.replace(/\s+/g, '');
    if (!title.toLowerCase().replace(/\s+/g, '').includes(cleanCap.toLowerCase())) {
      title = `${rawName} ${chosenVariant.capacity}`;
    }
  }

  const sku = String(g.spuId || g.productId || g.itemID || rawName);
  const rawUrl = g.gotoUrl || g.buttons?.find((b) => b?.gotoUrl)?.gotoUrl || '';
  const url = normalizeMiUrl(rawUrl, rawName);
  const rawImg = g.imgUrl || g.images?.[0]?.imgUrl || '';
  const image = rawImg ? (rawImg.startsWith('http') ? rawImg : `https:${rawImg}`) : '';
  const brand = /\bpoco\b/i.test(title) ? 'POCO' : /\bredmi\b/i.test(title) ? 'Redmi' : 'Xiaomi';
  const category = inferMiCategory(title, g.categories || []);

  return {
    id: makeProductId(store.id, sku),
    storeId: store.id,
    storeName: store.name,
    sku,
    title,
    brand,
    category,
    url,
    image,
    price,
    listPrice,
    cardPrice: null,
    cardName: null,
    originalCurrency: 'PEN',
    originalPrice: null,
    inStock: !g.isOutOfStock
  };
}

function isBetterRecord(candidate, current) {
  // Prefer in-stock, then real discount (listPrice > price), then direct product URL + image
  if (candidate.inStock !== current.inStock) return candidate.inStock;
  const candDisc = candidate.listPrice > candidate.price;
  const currDisc = current.listPrice > current.price;
  if (candDisc !== currDisc) return candDisc;
  const candHasDirectUrl = candidate.url.includes('/product/');
  const currHasDirectUrl = current.url.includes('/product/');
  if (candHasDirectUrl !== currHasDirectUrl) return candHasDirectUrl;
  if (!current.image && candidate.image) return true;
  return candidate.price < current.price;
}

function normalizeMiUrl(rawUrl, fallbackName) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return `https://www.mi.com/pe/search/${encodeURIComponent(fallbackName)}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https://www.mi.com${trimmed}`;
  return `https://www.mi.com/pe/${trimmed}`;
}

function inferMiCategory(title, categories) {
  const catText = categories
    .map((c) => `${c.title || ''} ${c.category_tag || ''}`)
    .join(' ')
    .toLowerCase();
  const text = `${title} ${catText}`.toLowerCase();

  if (/\btv\b|televisor|smart tv|google tv|qled|mini led/.test(text)) return 'televisores';
  if (/scooter|patinete|bicicleta|movilidad|outdoor/.test(text)) return 'deporte';
  if (/buds|audifon|audífon|headphone|parlante|speaker|soundbar|barra de sonido/.test(text)) return 'audio';
  if (/pad\b|tablet|monitor|router|mesh|proyector|projector|power\s*bank|cargador|laptop|mouse|teclado|gaming/.test(text)) {
    return 'tecnologia';
  }
  if (/air fryer|freidora|washer|lavadora|refrigerad|microonda|hervidor|kettle|licuadora|cafetera|cocina|horno/.test(text)) {
    return 'electro';
  }
  if (/vacuum|aspiradora|purifier|purificador|camara|cámara|lamp|lámpara|smart home|humidificador|ventilador|tag\b/.test(text)) {
    return 'hogar';
  }
  if (/afeitadora|shaver|cepillo|hair dryer|secadora|balanza|scale|grooming/.test(text)) {
    return 'belleza';
  }
  if (/celular|phone|poco|redmi note|redmi \d|redmi a\d|xiaomi \d|watch|band|reloj/.test(text)) {
    return 'celulares';
  }
  return 'tecnologia';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
