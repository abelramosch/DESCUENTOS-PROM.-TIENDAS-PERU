/**
 * Motor de inteligencia de precios estilo SteamDB / Compy.pe.
 * Evalúa si un descuento en tiendas peruanas es REAL o INFLADO y genera
 * un veredicto claro ("¿Conviene comprar hoy?") junto a un Deal Score (0-100).
 */

export function analyzeProduct(product, historyEntries = []) {
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

  // All-time min & max
  let minPrice = currentPrice;
  let minDate = sorted[sorted.length - 1]?.date || null;
  let maxPrice = currentPrice;
  let maxDate = minDate;

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

  // Apparent store discount vs listPrice
  const storeDiscountPct =
    listPrice > currentPrice ? round1(((listPrice - currentPrice) / listPrice) * 100) : 0;

  // Real discount vs historical median
  const realDiscountPct =
    medianPrice > 0 ? round1(((medianPrice - currentPrice) / medianPrice) * 100) : 0;

  // Distance above all-time low
  const pctAboveMin =
    minPrice > 0 ? round1(((currentPrice - minPrice) / minPrice) * 100) : 0;

  // Detect fake/inflated discount (typical pre-Cyber or permanent crossed-out MSRP)
  let isFakeDiscount = false;
  if (daysTracked >= 3) {
    const distinctPrices = new Set(prices.map((p) => Math.round(p))).size;
    // Store advertises >= 20% off listPrice, yet price hasn't dropped below its usual median
    if (storeDiscountPct >= 20 && currentPrice >= medianPrice * 0.99 && distinctPrices <= 2) {
      isFakeDiscount = true;
    }
    // Price actually rose vs median while still advertising a big "discount"
    if (storeDiscountPct >= 15 && currentPrice > medianPrice * 1.03) {
      isFakeDiscount = true;
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
    // Day 1: Transparently score based on current offer vs listPrice & card bonus,
    // without falsely claiming multi-day historical ATL.
    const effectiveListDisc =
      listPrice > effectiveNow ? ((listPrice - effectiveNow) / listPrice) * 100 : 0;
    dealScore = clamp(Math.round(48 + Math.min(effectiveListDisc, 55) * 0.72 + (cardPrice ? 4 : 0)), 35, 88);

    if (effectiveListDisc >= 30) {
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
      verdictReason = `Historial iniciado hoy en S/ ${formatNum(currentPrice)}. Cada actualización diaria guardará su evolución real para detectar verdaderos mínimos históricos.`;
    }
  } else if (isFakeDiscount) {
    verdict = 'inflated';
    verdictLabel = 'Descuento inflado';
    verdictShort = 'No conviene';
    dealScore = clamp(Math.round(30 - Math.max(0, -realDiscountPct)), 10, 42);
    verdictReason = `¡Ojo! La tienda muestra -${storeDiscountPct}% frente a S/ ${formatNum(listPrice)}, pero su precio real habitual en ${daysTracked} días es S/ ${formatNum(medianPrice)}. No es una oferta verdadera.`;
  } else if (isAllTimeLow && (realDiscountPct >= 5 || delta24hPct <= -5)) {
    verdict = 'all_time_low';
    verdictLabel = 'Mínimo histórico';
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
    dealScore = clamp(Math.round(42 - (currentPrice - medianPrice) / medianPrice * 100), 15, 44);
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

/**
 * Extrae tokens clave (marca, códigos de modelo, tamaño/capacidad) para encontrar
 * productos equivalentes en otras tiendas peruanas.
 */
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
