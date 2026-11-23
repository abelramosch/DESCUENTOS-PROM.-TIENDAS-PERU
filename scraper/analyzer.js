/**
 * Motor de inteligencia de precios estilo SteamDB / Compy / Knasta.
 * Evalúa si un descuento en tiendas peruanas es REAL, INFLADO (trampa Cyber)
 * o un POSIBLE BUGAZO / LIQUIDACIÓN EXTREMA, y genera un Deal Score (0-100).
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

  // Apparent store discount vs listPrice
  const storeDiscountPct =
    listPrice > currentPrice ? round1(((listPrice - currentPrice) / listPrice) * 100) : 0;

  // Real discount vs historical median
  const realDiscountPct =
    medianPrice > 0 ? round1(((medianPrice - currentPrice) / medianPrice) * 100) : 0;

  // Distance above all-time low
  const pctAboveMin =
    minPrice > 0 ? round1(((currentPrice - minPrice) / minPrice) * 100) : 0;

  // Detect pre-sale price hike (Cyber inflation trap: price jumped >= 12% recently then "dropped" back)
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

  // Detect fake/inflated discount
  let isFakeDiscount = false;
  if (preSaleHikeDetected) {
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
    cyberLabel = preSaleHikeDetected ? 'Inflado antes de oferta' : 'Descuento inflado';
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
  }

  // Bugazo / Extreme Liquidation detector (historical crash, cross-store anomaly, or extreme clearance)
  const peerMedianPrice = groupMeta?.peerMedianPrice || null;
  const peerCount = groupMeta?.peerCount || 1;
  const peerDiscountPct =
    peerMedianPrice && peerMedianPrice > 0
      ? round1(((peerMedianPrice - effectiveNow) / peerMedianPrice) * 100)
      : 0;

  let isBugazo = false;
  let bugazoType = null;
  let bugazoReason = null;

  if (!isFakeDiscount && product.inStock !== false) {
    if (daysTracked >= 2 && (realDiscountPct >= 45 || delta24hPct <= -40)) {
      isBugazo = true;
      bugazoType = 'historical_crash';
      bugazoReason = `Caída extrema de ${Math.max(realDiscountPct, Math.abs(delta24hPct))}% respecto a su precio histórico (mediana S/ ${formatNum(medianPrice)}).`;
    } else if (peerCount >= 2 && peerDiscountPct >= 40) {
      isBugazo = true;
      bugazoType = 'cross_store';
      bugazoReason = `Cuesta ${peerDiscountPct}% menos que el precio mediano en otras tiendas peruanas (S/ ${formatNum(peerMedianPrice)} en ${peerCount} tiendas).`;
    } else if (storeDiscountPct >= 55 && currentPrice >= 49) {
      isBugazo = true;
      bugazoType = 'extreme_clearance';
      bugazoReason = `Liquidación extrema de -${storeDiscountPct}% frente a su precio lista (ahorro de S/ ${formatNum(listPrice - effectiveNow)}).`;
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

  if (daysTracked === 1) {
    const effectiveListDisc =
      listPrice > effectiveNow ? ((listPrice - effectiveNow) / listPrice) * 100 : 0;
    const crossStoreBonus = peerDiscountPct >= 15 ? Math.min(14, peerDiscountPct * 0.4) : 0;
    dealScore = clamp(
      Math.round(48 + Math.min(effectiveListDisc, 55) * 0.72 + (cardPrice ? 4 : 0) + crossStoreBonus),
      35,
      95
    );

    if (isBugazo) {
      verdict = 'great_deal';
      verdictLabel = bugazoType === 'cross_store' ? 'Posible Bugazo' : 'Liquidación extrema';
      verdictShort = '¡Chapa ya!';
      verdictReason = bugazoReason;
    } else if (effectiveListDisc >= 30) {
      verdict = 'great_deal';
      verdictLabel = 'Fuerte descuento hoy';
      verdictShort = 'Conviene';
      verdictReason = `Tiene ${round1(effectiveListDisc)}% menos que su precio lista (S/ ${formatNum(listPrice)}). Primer día de seguimiento: verifica el historial los próximos días para confirmar tendencia.`;
    } else if (effectiveListDisc >= 15) {
      verdict = 'good_deal';
      verdictLabel = 'Buen descuento hoy';
      verdictShort = 'Buen precio';
      verdictReason = `Ahorras S/ ${formatNum(listPrice - effectiveNow)} frente al precio regular publicado (S/ ${formatNum(listPrice)}). Historial iniciado hoy.`;
    } else {
      verdict = 'tracking_new';
      verdictLabel = 'Precio base (Día 1)';
      verdictShort = 'Monitoreando';
      verdictReason = `Historial iniciado hoy en S/ ${formatNum(currentPrice)}. Cada actualización guardará su evolución real para detectar verdaderos mínimos históricos.`;
    }
  } else if (isFakeDiscount) {
    verdict = 'inflated';
    verdictLabel = preSaleHikeDetected ? 'Trampa Cyber' : 'Descuento inflado';
    verdictShort = 'No conviene';
    dealScore = clamp(Math.round(30 - Math.max(0, -realDiscountPct)), 10, 42);
    verdictReason = preSaleHikeDetected
      ? `¡Alerta Anti-Cyber! Este producto subió de precio recientemente para luego fingir una rebaja. Su precio habitual real era S/ ${formatNum(medianPrice)}.`
      : `¡Ojo! La tienda muestra -${storeDiscountPct}% frente a S/ ${formatNum(listPrice)}, pero su precio real habitual en ${daysTracked} días es S/ ${formatNum(medianPrice)}. No es una oferta verdadera.`;
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
    dealScore = clamp(Math.round(76 + Math.min(realDiscountPct, 30) * 0.5), 75, 89);
    verdictReason = `Conviene comprar: está ${realDiscountPct}% por debajo de su precio habitual (S/ ${formatNum(medianPrice)}) y muy cerca de su mínimo histórico (S/ ${formatNum(minPrice)}).`;
  } else if (realDiscountPct >= 5 || (pctAboveMin <= 5 && storeDiscountPct >= 15)) {
    verdict = 'good_deal';
    verdictLabel = 'Buen precio';
    verdictShort = 'Buen precio';
    dealScore = clamp(Math.round(62 + realDiscountPct * 0.9), 62, 74);
    verdictReason = `Está ${realDiscountPct > 0 ? `${realDiscountPct}% más barato que su promedio habitual` : 'cerca de su mínimo histórico'} (mínimo: S/ ${formatNum(minPrice)}).`;
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
  // Exclude the very last point (today)
  for (let i = 0; i < sortedEntries.length - 1; i++) {
    const entry = sortedEntries[i];
    const ms = Date.parse(`${entry.date}T00:00:00Z`);
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    // Accept observation if reasonably close or oldest available when tracking >= 7 days
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
