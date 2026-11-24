/**
 * Motor de inteligencia de precios estilo SteamDB / Compy / Knasta.
 * Usa un Precio de Referencia Real (historial propio o mediana real del mercado
 * peruano entre tiendas) en vez de confiar ciegamente en el precio tachado (listPrice),
 * neutralizando precios base inflados artificialmente.
 */

export function analyzeProduct(product, historyEntries = [], groupMeta = null) {
  const sorted = [...historyEntries]
    .filter((h) => h && Number(h.price) > 0 && h.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentPrice = round2(Number(product.price));
  const listPrice = round2(Math.max(currentPrice, Number(product.listPrice) || currentPrice));
  const cardPrice =
    product.cardPrice && Number(product.cardPrice) > 0 && Number(product.cardPrice) < currentPrice
      ? round2(Number(product.cardPrice))
      : null;

  const effectiveNow = cardPrice ?? currentPrice;
  const prices = sorted.map((h) => Number(h.price));
  const daysTracked = sorted.length || 1;
  const latestDate = sorted[sorted.length - 1]?.date || null;

  // All-time min & max
  let minPrice = currentPrice;
  let minDate = latestDate;
  let maxPrice = currentPrice;
  let maxDate = latestDate;

  for (const h of sorted) {
    const p = Number(h.price);
    if (p <= minPrice) {
      minPrice = p;
      minDate = h.date;
    }
    if (p >= maxPrice) {
      maxPrice = p;
      maxDate = h.date;
    }
  }

  // Last 30 observations average & overall median
  const last30 = sorted.slice(-30).map((h) => Number(h.price));
  const avgPrice30d = round2(mean(last30.length ? last30 : [currentPrice]));
  const medianPrice = round2(median(prices.length ? prices : [currentPrice]));

  // 24h / previous-snapshot delta
  let prevPrice = null;
  let delta24h = 0;
  let delta24hPct = 0;
  if (sorted.length >= 2) {
    prevPrice = Number(sorted[sorted.length - 2].price);
    delta24h = round2(currentPrice - prevPrice);
    delta24hPct = prevPrice > 0 ? round1(((currentPrice - prevPrice) / prevPrice) * 100) : 0;
  }

  // Anti-Cyber comparison: 15d ago & 30d ago
  const price15dAgo = findPriceDaysAgo(sorted, 15);
  const price30dAgo = findPriceDaysAgo(sorted, 30);
  const delta15dPct =
    price15dAgo && price15dAgo > 0 ? round1(((currentPrice - price15dAgo) / price15dAgo) * 100) : null;
  const delta30dPct =
    price30dAgo && price30dAgo > 0 ? round1(((currentPrice - price30dAgo) / price30dAgo) * 100) : null;

  // Apparent store discount vs store's own listPrice (often inflated!)
  const storeDiscountPct =
    listPrice > currentPrice ? round1(((listPrice - currentPrice) / listPrice) * 100) : 0;

  // Real discount vs historical median
  const realDiscountPct =
    medianPrice > 0 ? round1(((medianPrice - currentPrice) / medianPrice) * 100) : 0;

  // Cross-store Peruvian market benchmark (immune to inflated list prices!)
  const peerMedianPrice = groupMeta?.peerMedianPrice ? round2(Number(groupMeta.peerMedianPrice)) : null;
  const peerCount = groupMeta?.peerCount || 1;
  const peerDiscountPct =
    peerMedianPrice && peerMedianPrice > 0
      ? round1(((peerMedianPrice - effectiveNow) / peerMedianPrice) * 100)
      : 0;

  // Distance above all-time low
  const pctAboveMin =
    minPrice > 0 ? round1(((currentPrice - minPrice) / minPrice) * 100) : 0;

  // Fair Market Reference Price hierarchy:
  // 1) Own history (>= 3 days)  2) Peruvian cross-store market median (>= 2 stores)  3) Unverified store listPrice
  let referencePrice = listPrice;
  let referenceSource = 'list_unverified'; // 'history' | 'market' | 'list_unverified'
  let fairDiscountPct = 0;

  if (daysTracked >= 3) {
    referenceSource = 'history';
    referencePrice =
      peerCount >= 2 && peerMedianPrice > 0
        ? round2(Math.min(medianPrice, peerMedianPrice))
        : medianPrice;
    fairDiscountPct =
      referencePrice > 0 ? round1(((referencePrice - effectiveNow) / referencePrice) * 100) : 0;
  } else if (peerCount >= 2 && peerMedianPrice > 0) {
    referenceSource = 'market';
    referencePrice = peerMedianPrice;
    fairDiscountPct = peerDiscountPct;
  } else {
    referenceSource = 'list_unverified';
    referencePrice = listPrice;
    fairDiscountPct = 0;
  }

  // Detect pre-sale price hike (Cyber inflation trap)
  let preSaleHikeDetected = false;
  if (sorted.length >= 4) {
    const recentWindow = sorted.slice(-14);
    const earlierBase = sorted.slice(0, Math.max(1, sorted.length - 7));
    const earlierMed = median(earlierBase.map((h) => Number(h.price)));
    const recentPeak = Math.max(...recentWindow.map((h) => Number(h.price)));
    if (
      earlierMed > 0 &&
      recentPeak >= earlierMed * 1.12 &&
      currentPrice >= earlierMed * 0.96 &&
      currentPrice < recentPeak * 0.95
    ) {
      preSaleHikeDetected = true;
    }
  }

  // Detect inflated base / listPrice (comparing store's listPrice against REAL market or history!)
  let listPriceInflated = false;
  if (peerCount >= 2 && peerMedianPrice > 0) {
    // Store claims >= 25% off an inflated listPrice (> 1.35x real market median) while selling near/above market!
    if (listPrice > peerMedianPrice * 1.35 && storeDiscountPct >= 25 && peerDiscountPct < 10) {
      listPriceInflated = true;
    }
  }
  if (daysTracked >= 3 && listPrice > medianPrice * 1.35 && currentPrice >= medianPrice * 0.98 && storeDiscountPct >= 25) {
    listPriceInflated = true;
  }

  // Detect fake/inflated discount overall
  let isFakeDiscount = false;
  if (preSaleHikeDetected || listPriceInflated) {
    isFakeDiscount = true;
  } else if (daysTracked >= 3) {
    const distinctPrices = new Set(prices.map((p) => Math.round(p))).size;
    if (storeDiscountPct >= 20 && currentPrice >= medianPrice * 0.99 && distinctPrices <= 2) {
      isFakeDiscount = true;
    }
    if (storeDiscountPct >= 15 && currentPrice > medianPrice * 1.03) {
      isFakeDiscount = true;
    }
  }

  // Anti-Cyber status classification
  let cyberStatus = 'new';
  let cyberLabel = 'Iniciando historial';
  if (isFakeDiscount || preSaleHikeDetected) {
    cyberStatus = 'cyber_trap';
    cyberLabel = preSaleHikeDetected
      ? 'Inflado antes de oferta'
      : listPriceInflated
        ? 'Precio base inflado'
        : 'Descuento inflado';
  } else if (daysTracked >= 2) {
    const refDelta = delta30dPct ?? delta15dPct ?? -realDiscountPct;
    if (refDelta <= -8 || realDiscountPct >= 8) {
      cyberStatus = 'real_drop';
      cyberLabel = 'Bajada real comprobada';
    } else if (refDelta >= 5) {
      cyberStatus = 'cyber_trap';
      cyberLabel = 'Subió de precio';
    } else {
      cyberStatus = 'stable';
      cyberLabel = 'Precio estable';
    }
  } else if (peerCount >= 2 && peerDiscountPct >= 15) {
    cyberStatus = 'real_drop';
    cyberLabel = `-${peerDiscountPct}% vs mercado PE`;
  } else if (peerCount >= 2 && peerDiscountPct <= -10) {
    cyberStatus = 'cyber_trap';
    cyberLabel = 'Más caro que el mercado';
  }

  // Bugazo detector: ONLY verified historical crash OR verified cross-store anomaly (immune to inflated listPrice!)
  let isBugazo = false;
  let bugazoType = null;
  let bugazoReason = null;

  if (!isFakeDiscount && product.inStock !== false) {
    if (daysTracked >= 2 && (realDiscountPct >= 40 || delta24hPct <= -38)) {
      isBugazo = true;
      bugazoType = 'historical_crash';
      bugazoReason = `Caída extrema de ${Math.max(realDiscountPct, Math.abs(delta24hPct))}% respecto a su precio histórico real (mediana S/ ${formatNum(medianPrice)}).`;
    } else if (peerCount >= 2 && peerDiscountPct >= 35) {
      isBugazo = true;
      bugazoType = 'cross_store';
      bugazoReason = `Cuesta ${peerDiscountPct}% menos que el precio real de mercado en ${peerCount} tiendas peruanas (mediana S/ ${formatNum(peerMedianPrice)}).`;
    }
  }

  const isAllTimeLow =
    daysTracked >= 2 && currentPrice <= minPrice && (currentPrice < maxPrice || realDiscountPct >= 3);

  // Compute Deal Score (0-100) and human verdict
  let verdict = 'normal';
  let verdictLabel = 'Precio normal';
  let verdictShort = 'Esperar';
  let verdictReason = '';
  let dealScore = 50;

  if (isFakeDiscount) {
    verdict = 'inflated';
    verdictLabel = preSaleHikeDetected
      ? 'Trampa Cyber'
      : listPriceInflated
        ? 'Base inflada'
        : 'Descuento inflado';
    verdictShort = 'No conviene';
    const penalty = peerCount >= 2 && peerDiscountPct < 0 ? Math.abs(peerDiscountPct) : Math.max(0, -realDiscountPct);
    dealScore = clamp(Math.round(36 - penalty * 0.6), 12, 42);
    if (preSaleHikeDetected) {
      verdictReason = `¡Alerta Anti-Cyber! Este producto subió de precio recientemente para luego fingir una rebaja. Su precio habitual real era S/ ${formatNum(medianPrice)}.`;
    } else if (listPriceInflated && peerCount >= 2 && peerMedianPrice) {
      verdictReason = `¡Ojo con el precio base! Esta tienda tacha S/ ${formatNum(listPrice)} (-${storeDiscountPct}%), pero el precio real de mercado en ${peerCount} tiendas de Perú es ~S/ ${formatNum(peerMedianPrice)}. Hoy ${peerDiscountPct < 0 ? `incluso está ${Math.abs(peerDiscountPct)}% más caro que el mercado` : 'está en su precio normal de mercado'}.`;
    } else {
      verdictReason = `¡Ojo! La tienda muestra -${storeDiscountPct}% frente a S/ ${formatNum(listPrice)}, pero su precio real habitual en ${daysTracked} días es S/ ${formatNum(medianPrice)}. No es una oferta verdadera.`;
    }
  } else if (daysTracked === 1) {
    if (peerCount >= 2 && peerMedianPrice > 0) {
      // Day 1 WITH Peruvian market benchmark: score by REAL discount vs competing stores, NOT fake listPrice!
      if (isBugazo) {
        verdict = 'great_deal';
        verdictLabel = 'Posible Bugazo';
        verdictShort = '¡Chapa ya!';
        dealScore = clamp(Math.round(88 + Math.min(peerDiscountPct - 35, 30) * 0.4), 90, 99);
        verdictReason = bugazoReason;
      } else if (peerDiscountPct >= 15) {
        verdict = 'great_deal';
        verdictLabel = 'Más barato del mercado';
        verdictShort = 'Conviene';
        dealScore = clamp(Math.round(74 + Math.min(peerDiscountPct, 35) * 0.45 + (cardPrice ? 3 : 0)), 76, 89);
        verdictReason = `Conviene comprar: está ${peerDiscountPct}% debajo del precio real de mercado en Perú (S/ ${formatNum(peerMedianPrice)} en ${peerCount} tiendas), ahorrando S/ ${formatNum(peerMedianPrice - effectiveNow)}.`;
      } else if (peerDiscountPct >= 5) {
        verdict = 'good_deal';
        verdictLabel = 'Buen precio mercado';
        verdictShort = 'Buen precio';
        dealScore = clamp(Math.round(62 + peerDiscountPct * 0.9 + (cardPrice ? 2 : 0)), 63, 75);
        verdictReason = `Está ${peerDiscountPct}% por debajo del precio mediano en ${peerCount} tiendas peruanas (S/ ${formatNum(peerMedianPrice)}).`;
      } else if (peerDiscountPct <= -12) {
        verdict = 'inflated';
        verdictLabel = 'Más caro del mercado';
        verdictShort = 'No conviene';
        dealScore = clamp(Math.round(42 + peerDiscountPct * 0.6), 18, 42);
        verdictReason = `Hoy está ${Math.abs(peerDiscountPct)}% más caro que el precio mediano en otras tiendas peruanas (S/ ${formatNum(peerMedianPrice)} en ${peerCount} tiendas). Revisa la tabla Multi-Tienda abajo.`;
      } else {
        verdict = 'normal';
        verdictLabel = 'Precio de mercado';
        verdictShort = 'Normal';
        dealScore = clamp(Math.round(52 + peerDiscountPct), 46, 61);
        verdictReason = `Precio alineado con el mercado peruano (mediana S/ ${formatNum(peerMedianPrice)} en ${peerCount} tiendas).`;
      }
    } else {
      // Single-store Day 1 (unverified listPrice): strict anti-hype cap at 70 so inflated listPrices NEVER beat verified deals!
      const effectiveListDisc =
        listPrice > effectiveNow ? ((listPrice - effectiveNow) / listPrice) * 100 : 0;
      dealScore = clamp(Math.round(44 + Math.min(effectiveListDisc, 50) * 0.48 + (cardPrice ? 3 : 0)), 40, 70);

      if (effectiveListDisc >= 45) {
        verdict = 'good_deal';
        verdictLabel = 'Desc. sin verificar';
        verdictShort = 'Verificar';
        verdictReason = `Publica -${round1(effectiveListDisc)}% frente a un precio lista de S/ ${formatNum(listPrice)}, pero aún no tiene historial ni otras tiendas para confirmar si ese precio base es real. Se verificará en los próximos días.`;
      } else if (effectiveListDisc >= 18) {
        verdict = 'good_deal';
        verdictLabel = 'Descuento publicado';
        verdictShort = 'Revisar';
        verdictReason = `Ahorro aparente de S/ ${formatNum(listPrice - effectiveNow)} frente a lista (S/ ${formatNum(listPrice)}). Primer día de seguimiento en 1 tienda.`;
      } else {
        verdict = 'tracking_new';
        verdictLabel = 'Precio base (Día 1)';
        verdictShort = 'Monitoreando';
        verdictReason = `Historial iniciado hoy en S/ ${formatNum(currentPrice)}. Cada actualización guardará su evolución real para detectar verdaderos mínimos históricos.`;
      }
    }
  } else if (isAllTimeLow && (realDiscountPct >= 5 || delta24hPct <= -5)) {
    verdict = 'all_time_low';
    verdictLabel = isBugazo ? 'Bugazo · Mínimo histórico' : 'Mínimo histórico';
    verdictShort = '¡Cómpralo!';
    dealScore = clamp(Math.round(88 + Math.min(realDiscountPct, 30) * 0.4), 90, 100);
    verdictReason = `¡Precio más bajo registrado! Está en su mínimo histórico de S/ ${formatNum(minPrice)} (${realDiscountPct > 0 ? `${realDiscountPct}% debajo de su precio habitual S/ ${formatNum(medianPrice)}` : 'mejor marca registrada'}).`;
  } else if (realDiscountPct >= 15 || (pctAboveMin <= 3 && realDiscountPct >= 7)) {
    verdict = 'great_deal';
    verdictLabel = 'Excelente oferta';
    verdictShort = 'Conviene';
    dealScore = clamp(Math.round(76 + Math.min(realDiscountPct, 30) * 0.5), 76, 89);
    verdictReason = `Conviene comprar: está ${realDiscountPct}% por debajo de su precio habitual (S/ ${formatNum(medianPrice)}) y muy cerca de su mínimo histórico (S/ ${formatNum(minPrice)}).`;
  } else if (realDiscountPct >= 5 || (peerCount >= 2 && peerDiscountPct >= 10)) {
    verdict = 'good_deal';
    verdictLabel = 'Buen precio';
    verdictShort = 'Buen precio';
    dealScore = clamp(Math.round(62 + Math.max(realDiscountPct, peerDiscountPct) * 0.9), 62, 75);
    verdictReason = `Está ${realDiscountPct > 0 ? `${realDiscountPct}% más barato que su promedio habitual` : `${peerDiscountPct}% debajo del mercado peruano`} (mínimo: S/ ${formatNum(minPrice)}).`;
  } else if (currentPrice > medianPrice * 1.05) {
    verdict = 'inflated';
    verdictLabel = 'Precio alto';
    verdictShort = 'Esperar';
    dealScore = clamp(Math.round(42 - ((currentPrice - medianPrice) / medianPrice) * 100), 15, 44);
    verdictReason = `Hoy está ${round1(((currentPrice - medianPrice) / medianPrice) * 100)}% más caro que su precio habitual (S/ ${formatNum(medianPrice)}). Mejor esperar a que baje hacia S/ ${formatNum(minPrice)}.`;
  } else {
    verdict = 'normal';
    verdictLabel = 'Precio habitual';
    verdictShort = 'Esperar';
    dealScore = clamp(Math.round(50 + realDiscountPct), 45, 61);
    verdictReason = `Precio dentro de su rango normal (habitual: S/ ${formatNum(medianPrice)}, mínimo registrado: S/ ${formatNum(minPrice)}).`;
  }

  const sparkline = sorted.slice(-30).map((h) => Number(h.price));
  if (!sparkline.length) sparkline.push(currentPrice);

  return {
    ...product,
    price: currentPrice,
    listPrice,
    cardPrice,
    effectivePrice: effectiveNow,
    groupId: groupMeta?.groupId || null,
    peerCount,
    peerMinPrice: groupMeta?.peerMinPrice || null,
    peerMedianPrice,
    stats: {
      minPrice: round2(minPrice),
      minDate,
      maxPrice: round2(maxPrice),
      maxDate,
      avgPrice30d,
      medianPrice,
      referencePrice,
      referenceSource,
      fairDiscountPct,
      listPriceInflated,
      prevPrice,
      delta24h,
      delta24hPct,
      price15dAgo,
      price30dAgo,
      delta15dPct,
      delta30dPct,
      preSaleHikeDetected,
      cyberStatus,
      cyberLabel,
      isBugazo,
      bugazoType,
      bugazoReason,
      peerDiscountPct,
      storeDiscountPct,
      realDiscountPct,
      pctAboveMin,
      daysTracked,
      isAllTimeLow,
      isFakeDiscount,
      verdict,
      verdictLabel,
      verdictShort,
      verdictReason,
      dealScore
    },
    sparkline,
    matchTokens: extractMatchTokens(product.title, product.brand)
  };
}

function findPriceDaysAgo(sortedEntries, daysAgo) {
  if (sortedEntries.length < 2) return null;
  const last = sortedEntries[sortedEntries.length - 1];
  const lastMs = Date.parse(`${last.date}T00:00:00Z`);
  if (!Number.isFinite(lastMs)) return null;
  const targetMs = lastMs - daysAgo * 86400000;

  let best = null;
  let bestDiff = Infinity;
  for (let i = 0; i < sortedEntries.length - 1; i++) {
    const entry = sortedEntries[i];
    const ms = Date.parse(`${entry.date}T00:00:00Z`);
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }
  if (!best) return null;
  const actualSpanDays = (lastMs - Date.parse(`${best.date}T00:00:00Z`)) / 86400000;
  if (actualSpanDays < Math.min(daysAgo * 0.4, 5)) return null;
  return round2(Number(best.price));
}

export function extractMatchTokens(title = '', brand = '') {
  const stopWords = new Set([
    'de', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'por', 'sin', 'del', 'al', 'y', 'o',
    'un', 'una', 'negro', 'blanco', 'gris', 'azul', 'rojo', 'plata', 'silver', 'black', 'white',
    'peru', 'nuevo', 'nueva', 'original', 'oferta', 'promocion', 'combo', 'garantia', 'color'
  ]);
  const text = `${brand} ${title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ');

  const tokens = text
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));

  return [...new Set(tokens)].slice(0, 14);
}

const TOY_MISCLASS_RE =
  /\bfisher[\s-]?price\b|\bvtech\b|\bde juguete\b|\bjuguetes?\b|\bpeluche interactivo\b|\bmuñec[ao]s?\b|\bbarbie\b|\baprendizaje para niñ|\bprimer laptop\b|\bcrece conmigo\b|\bcookeez makery\b/i;

const TECH_SENSITIVE_CATEGORIES = new Set(['tecnologia', 'electro', 'gaming', 'celulares', 'televisores', 'audio']);

export function normalizeProductCategory(product) {
  if (!product || product.isCustomWatch) return product?.category || 'hogar';
  const cat = product.category || 'hogar';
  if (TECH_SENSITIVE_CATEGORIES.has(cat)) {
    const text = `${product.title || ''} ${product.brand || ''}`;
    if (TOY_MISCLASS_RE.test(text)) {
      return 'hogar';
    }
  }
  return cat;
}

export function deduplicateStoreListings(products, historyMap = {}) {
  const bestByKey = new Map();
  for (const p of products) {
    const normTitle = String(p.title || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!normTitle || p.isCustomWatch) {
      bestByKey.set(`unique::${p.id}`, p);
      continue;
    }
    const key = `${p.storeId}::${normTitle}`;
    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, p);
      continue;
    }
    const scoreItem = (item) => {
      const inStock = item.inStock !== false ? 1 : 0;
      const eff = Math.min(Number(item.price) || Infinity, Number(item.cardPrice) || Infinity);
      const histLen = (historyMap[item.id] || []).length;
      return { inStock, eff, histLen };
    };
    const a = scoreItem(p);
    const b = scoreItem(prev);
    const pBetter =
      a.inStock !== b.inStock
        ? a.inStock > b.inStock
        : a.eff !== b.eff
          ? a.eff < b.eff
          : a.histLen > b.histLen;
    if (pBetter) {
      bestByKey.set(key, p);
    }
  }
  return [...bestByKey.values()];
}

function mean(arr) {
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function formatNum(n) {
  return Number(n).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
