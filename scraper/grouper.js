/**
 * Agrupador Multi-Tienda (estilo SoloTodo / Compy).
 * Empareja el mismo modelo de producto vendido en 2 o más tiendas peruanas
 * usando marca + código de modelo + tokens clave + banda de precio coherente,
 * para construir fichas unificadas y detectar anomalías de precio ("bugazos").
 */

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'por', 'sin', 'del', 'al', 'y', 'o',
  'un', 'una', 'negro', 'blanco', 'gris', 'azul', 'rojo', 'plata', 'dorado', 'verde', 'rosa',
  'silver', 'black', 'white', 'gray', 'grey', 'blue', 'red', 'gold', 'pink', 'titanium',
  'peru', 'nuevo', 'nueva', 'original', 'oferta', 'promocion', 'combo', 'garantia', 'color',
  'marca', 'tienda', 'envio', 'gratis', 'exclusivo', 'edicion', 'modelo', 'serie', 'version',
  'smart', 'tv', 'uhd', '4k', 'full', 'hd', 'fhd', 'led', 'smartwatch', 'celular', 'smartphone',
  'laptop', 'notebook', 'televisor', 'audifonos', 'parlante', 'freidora', 'aire', 'lavadora',
  'refrigeradora', 'microondas', 'cafetera', 'zapatillas', 'running', 'urbanas', 'hombre',
  'mujer', 'unisex', 'perfume', 'edp', 'edt', 'eau', 'parfum', 'ml', 'pulgadas', 'litros',
  'bluetooth', 'inalambrico', 'inalambrica', 'gaming', 'gamer', 'silla', 'colchon', 'almohada',
  'tablet', 'monitor', 'taladro', 'aspiradora', 'robot', 'consola', 'videojuego'
]);

const ACCESSORY_WORDS = new Set([
  'funda', 'case', 'carcasa', 'protector', 'mica', 'vidrio', 'templado', 'cable', 'cargador',
  'adaptador', 'soporte', 'rack', 'control', 'remoto', 'estuche', 'mochila', 'bolso', 'maletin',
  'cooler', 'base', 'correa', 'pulsera', 'repuesto', 'filtro', 'almohadilla', 'tapa', 'molde'
]);

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["'“”]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae posibles códigos de modelo alfanuméricos (ej: oled55c4, wh-1000xm5, s24, a55, rtx4060, ag15-71p).
 */
export function extractModelCodes(title = '') {
  const norm = normalizeText(title);
  const words = norm.split(' ');
  const codes = [];
  for (const w of words) {
    if (w.length < 3 || w.length > 22) continue;
    const hasLetter = /[a-z]/.test(w);
    const hasDigit = /\d/.test(w);
    if (!hasLetter || !hasDigit) continue;
    // Exclude pure generic measurement units like 16gb, 512gb, 256gb, 1tb, 100ml, 55p, 60hz, 120w
    if (/^\d+(gb|tb|mb|ml|oz|kg|lt|l|w|hz|mah|mp|cm|mm|v|rpm|btu|p)$/.test(w)) continue;
    if (/^(10|11|12|13|14)(ma|va|th)$/.test(w)) continue;
    codes.push(w.replace(/-/g, ''));
  }
  return [...new Set(codes)];
}

export function extractSignificantTokens(title = '', brand = '') {
  const normBrand = normalizeText(brand);
  const normTitle = normalizeText(title);
  const tokens = normTitle
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  const isAccessory = normTitle.split(' ').some((t) => ACCESSORY_WORDS.has(t));
  return {
    brand: normBrand,
    tokens: [...new Set(tokens)],
    modelCodes: extractModelCodes(title),
    isAccessory
  };
}

function jaccardAndOverlap(aArr, bArr) {
  if (!aArr.length || !bArr.length) return { overlap: 0, jaccard: 0 };
  const setA = new Set(aArr);
  let overlap = 0;
  for (const t of bArr) {
    if (setA.has(t)) overlap += 1;
  }
  const union = setA.size + bArr.length - overlap;
  return { overlap, jaccard: union > 0 ? overlap / union : 0 };
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Construye grupos multi-tienda (2+ tiendas peruanas distintas) y retorna:
 *  - groups: lista de fichas unificadas ordenadas por # tiendas y mejor ahorro entre tiendas
 *  - productGroupMeta: Map<productId, { groupId, peerCount, peerMinPrice, peerMedianPrice, peerMaxPrice, peers }>
 */
export function buildMultiStoreGroups(catalog = []) {
  const prepared = catalog.map((p) => ({
    product: p,
    fp: extractSignificantTokens(p.title, p.brand)
  }));

  // Index by category to keep clustering fast and accurate
  const byCat = new Map();
  for (const item of prepared) {
    const cat = item.product.category || 'general';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(item);
  }

  const rawClusters = [];

  for (const [, items] of byCat.entries()) {
    const visited = new Set();

    for (let i = 0; i < items.length; i++) {
      if (visited.has(i)) continue;
      const seed = items[i];
      if (!seed.fp.brand && seed.fp.modelCodes.length === 0) continue;

      const cluster = [seed];
      const usedStores = new Set([seed.product.storeId]);

      for (let j = i + 1; j < items.length; j++) {
        if (visited.has(j)) continue;
        const cand = items[j];
        if (usedStores.has(cand.product.storeId)) continue;
        if (seed.fp.isAccessory !== cand.fp.isAccessory) continue;

        // Require compatible brand when both have brand
        if (seed.fp.brand && cand.fp.brand && seed.fp.brand !== cand.fp.brand) {
          continue;
        }

        // Price sanity band: allow up to 3.2x difference (catches real bugazos without matching cables to laptops)
        const hi = Math.max(seed.product.price, cand.product.price);
        const lo = Math.min(seed.product.price, cand.product.price);
        if (lo <= 0 || hi / lo > 3.2) continue;

        // Check exact model code match OR high token overlap
        const codeMatch = seed.fp.modelCodes.some((c) => c.length >= 4 && cand.fp.modelCodes.includes(c));
        const { overlap, jaccard } = jaccardAndOverlap(seed.fp.tokens, cand.fp.tokens);

        const isMatch =
          (codeMatch && overlap >= 2) ||
          (seed.fp.brand && seed.fp.brand === cand.fp.brand && overlap >= 3 && jaccard >= 0.42) ||
          (overlap >= 4 && jaccard >= 0.52);

        if (isMatch) {
          cluster.push(cand);
          usedStores.add(cand.product.storeId);
          visited.add(j);
        }
      }

      if (cluster.length >= 2) {
        visited.add(i);
        rawClusters.push(cluster);
      }
    }
  }

  const groups = [];
  const productGroupMeta = new Map();

  rawClusters.forEach((cluster, idx) => {
    const prods = cluster
      .map((c) => c.product)
      .sort((a, b) => (a.cardPrice || a.price) - (b.cardPrice || b.price));

    const prices = prods.map((p) => Number(p.price));
    const minPrice = round2(Math.min(...prices));
    const maxPrice = round2(Math.max(...prices));
    const medPrice = round2(median(prices));
    const spreadPct = maxPrice > minPrice ? Math.round(((maxPrice - minPrice) / maxPrice) * 1000) / 10 : 0;
    const savingsPen = round2(maxPrice - minPrice);

    const best = prods[0];
    const groupId = `grp:${best.category}:${idx + 1}`;

    const offers = prods.map((p) => ({
      id: p.id,
      storeId: p.storeId,
      storeName: p.storeName,
      title: p.title,
      price: p.price,
      listPrice: p.listPrice,
      cardPrice: p.cardPrice || null,
      cardName: p.cardName || null,
      url: p.url,
      image: p.image
    }));

    groups.push({
      groupId,
      title: best.title,
      brand: best.brand || '',
      category: best.category,
      image: best.image,
      storeCount: offers.length,
      minPrice,
      medianPrice: medPrice,
      maxPrice,
      savingsPen,
      spreadPct,
      bestStoreName: best.storeName,
      bestProductId: best.id,
      offers
    });

    for (const p of prods) {
      productGroupMeta.set(p.id, {
        groupId,
        peerCount: offers.length,
        peerMinPrice: minPrice,
        peerMedianPrice: medPrice,
        peerMaxPrice: maxPrice,
        peers: offers.filter((o) => o.id !== p.id)
      });
    }
  });

  // Sort groups: most stores first, then biggest real savings across stores
  groups.sort((a, b) => b.storeCount - a.storeCount || b.savingsPen - a.savingsPen);

  return { groups, productGroupMeta };
}
