import { loadCatalog, loadMeta, loadWatchlist } from './storage.js';

const SITE_URL = process.env.SITE_URL || 'https://abelramosch.github.io/chapaaltoque/';
const TELEGRAM_BOT_USERNAME = 'Chapaaltoque_pe_bot';
const TELEGRAM_MAX_VISIBLE_CHARS = 3800;

const CATEGORY_META = {
  tecnologia: { emoji: '💻', label: 'Tecnología' },
  televisores: { emoji: '📺', label: 'Televisores' },
  celulares: { emoji: '📱', label: 'Celulares' },
  audio: { emoji: '🎧', label: 'Audio' },
  gaming: { emoji: '🎮', label: 'Gaming' },
  electro: { emoji: '🏠', label: 'Electro' },
  hogar: { emoji: '🛋️', label: 'Hogar' },
  deporte: { emoji: '👟', label: 'Deporte' },
  moda: { emoji: '👕', label: 'Moda' },
  belleza: { emoji: '✨', label: 'Belleza' },
  supermercado: { emoji: '🛒', label: 'Supermercado' },
  personal: { emoji: '⭐', label: 'Seguimiento' }
};

const STOP_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'en', 'con', 'para', 'por', 'y', 'a', 'o', 'un', 'una', 'al', 'su', 'sin',
  'hombre', 'hombres', 'mujer', 'mujeres', 'nino', 'ninos', 'nina', 'ninas', 'unisex', 'adulto', 'infantil',
  'negro', 'negra', 'blanco', 'blanca', 'azul', 'rojo', 'roja', 'verde', 'gris', 'plomo', 'rosa', 'rosado',
  'beige', 'hueso', 'marron', 'cafe', 'celeste', 'morado', 'amarillo', 'naranja', 'plateado', 'dorado', 'inox',
  'talla', 'color', 'und', 'unidades', 'pack', 'set', 'caja', 'modelo', 'serie', 'edicion', 'nuevo', 'nueva',
  'smart', 'pro', 'plus', 'max', 'mini', 'lite', 'ultra', 'hd', 'uhd', '4k', 'led', 'oled', 'qled'
]);

function formatPen(n) {
  return (
    'S/ ' +
    Number(n).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function visibleTextLength(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .length;
}

function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function productTokens(product) {
  return normalizeText(product?.title)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 2 &&
        !STOP_WORDS.has(w) &&
        !/^\d+$/.test(w) &&
        !(/^[a-z0-9-]*\d[a-z0-9-]*$/i.test(w) && w.length >= 5)
    );
}

function primaryNoun(product) {
  const brand = normalizeText(product?.brand || '').trim();
  const toks = productTokens(product);
  const firstNonBrand = toks.find((w) => w !== brand && w.length >= 3);
  return firstNonBrand || toks[0] || '';
}

function brandKey(product) {
  const b = normalizeText(product?.brand || '').trim();
  return b && b !== 'generico' && b !== 'sin marca' && b !== 'otros' ? b : '';
}

function storeKey(product) {
  return product?.storeId || normalizeText(product?.storeName || 'unknown');
}

/**
 * Detecta variantes del mismo producto (ej. distintas tallas/colores/SKUs de una
 * misma zapatilla en Shopstar) o el mismo artículo publicado en tiendas hermanas
 * (ej. Metro y Wong) para evitar repeticiones en el resumen de Telegram.
 */
export function isSimilarProduct(a, b) {
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  if (a.groupId && b.groupId && a.groupId === b.groupId) return true;

  const ta = productTokens(a);
  const tb = productTokens(b);
  if (!ta.length || !tb.length) return false;

  const prefA = ta.slice(0, 3).join(' ');
  const prefB = tb.slice(0, 3).join(' ');
  if (prefA.length >= 8 && prefA === prefB) return true;

  const brandA = brandKey(a);
  const brandB = brandKey(b);
  const nounA = primaryNoun(a);
  const nounB = primaryNoun(b);
  if (storeKey(a) === storeKey(b) && brandA && brandA === brandB && nounA && nounA === nounB) {
    return true;
  }

  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const w of setA) {
    if (setB.has(w)) inter++;
  }
  const union = setA.size + setB.size - inter;
  if (union > 0 && inter >= 3 && inter / union >= 0.65) return true;

  return false;
}

function recordPicked(state, product, sectionStores = null) {
  const sk = storeKey(product);
  const cat = product.category || 'general';
  const brand = brandKey(product);
  const noun = primaryNoun(product);

  state.picked.push(product);
  state.storeCounts.set(sk, (state.storeCounts.get(sk) || 0) + 1);
  state.catCounts.set(cat, (state.catCounts.get(cat) || 0) + 1);
  if (brand) state.brandCounts.set(brand, (state.brandCounts.get(brand) || 0) + 1);
  if (noun) state.nounCounts.set(noun, (state.nounCounts.get(noun) || 0) + 1);
  if (sectionStores) {
    sectionStores.set(sk, (sectionStores.get(sk) || 0) + 1);
  }
}

function selectDiverse(pool, count, state, opts = {}) {
  if (count <= 0 || !pool.length) return [];

  const {
    maxPerStoreGlobal = 2,
    maxPerStoreSection = 1,
    maxPerCategoryGlobal = 2,
    maxPerBrandGlobal = 2,
    preferUnseenCategory = false
  } = opts;

  const chosen = [];
  const sectionStores = new Map();

  const okStore = (p, unseenOnly) => {
    const sk = storeKey(p);
    if ((sectionStores.get(sk) || 0) >= maxPerStoreSection) return false;
    const total = state.storeCounts.get(sk) || 0;
    return unseenOnly ? total === 0 : total < maxPerStoreGlobal;
  };

  const okCat = (p, limit) => {
    const cat = p.category || 'general';
    return (state.catCounts.get(cat) || 0) < limit;
  };

  const okBrand = (p, unseenOnly) => {
    const b = brandKey(p);
    if (!b) return true;
    const total = state.brandCounts.get(b) || 0;
    return unseenOnly ? total === 0 : total < maxPerBrandGlobal;
  };

  const okNoun = (p, unseenOnly) => {
    const n = primaryNoun(p);
    if (!n) return true;
    const total = state.nounCounts.get(n) || 0;
    return unseenOnly ? total === 0 : total < 2;
  };

  const passes = preferUnseenCategory
    ? [
        (p) => okStore(p, true) && okCat(p, 1) && okBrand(p, true) && okNoun(p, true),
        (p) => okStore(p, true) && okCat(p, 1) && okBrand(p, false),
        (p) => okStore(p, false) && okCat(p, 1) && okBrand(p, false) && okNoun(p, true),
        (p) => okStore(p, true) && okCat(p, maxPerCategoryGlobal) && okBrand(p, true) && okNoun(p, true),
        (p) => okStore(p, true) && okCat(p, maxPerCategoryGlobal) && okBrand(p, false),
        (p) => okStore(p, false) && okCat(p, maxPerCategoryGlobal) && okBrand(p, false) && okNoun(p, true),
        (p) => okStore(p, false) && okCat(p, maxPerCategoryGlobal + 1)
      ]
    : [
        (p) => okStore(p, true) && okCat(p, 1) && okBrand(p, true) && okNoun(p, true),
        (p) => okStore(p, true) && okCat(p, maxPerCategoryGlobal) && okBrand(p, true) && okNoun(p, true),
        (p) => okStore(p, true) && okCat(p, maxPerCategoryGlobal) && okBrand(p, false),
        (p) => okStore(p, false) && okCat(p, 1) && okBrand(p, true) && okNoun(p, true),
        (p) => okStore(p, false) && okCat(p, maxPerCategoryGlobal) && okBrand(p, false) && okNoun(p, true),
        (p) => okStore(p, false) && okCat(p, maxPerCategoryGlobal + 1)
      ];

  for (const predicate of passes) {
    if (chosen.length >= count) break;
    for (const product of pool) {
      if (chosen.length >= count) break;
      if (state.picked.some((existing) => isSimilarProduct(existing, product))) continue;
      if (!predicate(product)) continue;
      chosen.push(product);
      recordPicked(state, product, sectionStores);
    }
  }

  return chosen;
}

export function pickTopAlerts(catalog, watchlist, options = {}) {
  const {
    maxTotal = 16,
    maxTargets = 3,
    maxBugazos = 5,
    maxDrops = 5,
    maxPerStoreGlobal = 2,
    maxPerCategoryGlobal = 2
  } = options;

  const targets = watchlist?.targetPrices || {};
  const state = {
    picked: [],
    storeCounts: new Map(),
    catCounts: new Map(),
    brandCounts: new Map(),
    nounCounts: new Map()
  };

  // 1. Target price hits from watchlist (always prioritized)
  const targetHits = [];
  const rawTargets = catalog
    .filter((p) => p.inStock !== false && targets[p.id] && p.effectivePrice <= Number(targets[p.id]))
    .sort((a, b) => (b.stats?.dealScore || 0) - (a.stats?.dealScore || 0));

  for (const item of rawTargets) {
    if (targetHits.length >= maxTargets || state.picked.length >= maxTotal) break;
    if (state.picked.some((existing) => existing.id === item.id)) continue;
    targetHits.push(item);
    recordPicked(state, item);
  }

  const eligible = catalog.filter(
    (p) => p.inStock !== false && !p.stats?.isFakeDiscount && p.stats?.verdict !== 'inflated'
  );

  // 2. Bugazos (diverse across stores, categories, and product lines)
  const bugazoPool = eligible
    .filter((p) => p.stats?.isBugazo)
    .sort((a, b) => {
      const rank = (t) => (t === 'historical_crash' ? 3 : t === 'cross_store' ? 2 : 1);
      return (
        rank(b.stats.bugazoType) - rank(a.stats.bugazoType) ||
        (b.stats.dealScore || 0) - (a.stats.dealScore || 0) ||
        (b.stats.realDiscountPct || 0) - (a.stats.realDiscountPct || 0) ||
        (b.stats.peerDiscountPct || 0) - (a.stats.peerDiscountPct || 0) ||
        (b.stats.storeDiscountPct || 0) - (a.stats.storeDiscountPct || 0)
      );
    });

  const bugazoLimit = Math.min(maxBugazos, Math.max(0, maxTotal - state.picked.length));
  const bugazos = selectDiverse(bugazoPool, bugazoLimit, state, {
    maxPerStoreGlobal,
    maxPerStoreSection: 1,
    maxPerCategoryGlobal
  });

  // 3. Meaningful All-Time Lows or strong 24h drops from varied stores/categories
  const dropPool = eligible
    .filter((p) => {
      const s = p.stats || {};
      const meaningfulAtl =
        s.isAllTimeLow &&
        ((s.dealScore || 0) >= 60 ||
          (s.realDiscountPct || 0) >= 5 ||
          (s.delta24hPct || 0) <= -5 ||
          (s.storeDiscountPct || 0) >= 20);
      const meaningfulDrop = (s.delta24hPct || 0) <= -8 && (s.dealScore || 0) >= 55;
      return meaningfulAtl || meaningfulDrop;
    })
    .sort((a, b) => {
      const atlDiff = Number(Boolean(b.stats?.isAllTimeLow)) - Number(Boolean(a.stats?.isAllTimeLow));
      return (
        atlDiff ||
        (b.stats?.dealScore || 0) - (a.stats?.dealScore || 0) ||
        (a.stats?.delta24hPct || 0) - (b.stats?.delta24hPct || 0)
      );
    });

  const dropLimit = Math.min(maxDrops, Math.max(0, maxTotal - state.picked.length));
  const drops = selectDiverse(dropPool, dropLimit, state, {
    maxPerStoreGlobal,
    maxPerStoreSection: 1,
    maxPerCategoryGlobal
  });

  // 4. Broad category & store highlights to fill up to maxTotal with maximum variety
  const featuredPool = eligible
    .filter(
      (p) =>
        ['all_time_low', 'great_deal'].includes(p.stats?.verdict) ||
        (p.stats?.verdict === 'good_deal' && (p.stats?.dealScore || 0) >= 65)
    )
    .sort(
      (a, b) =>
        (b.stats?.dealScore || 0) - (a.stats?.dealScore || 0) ||
        (b.stats?.realDiscountPct || 0) - (a.stats?.realDiscountPct || 0) ||
        (b.stats?.peerDiscountPct || 0) - (a.stats?.peerDiscountPct || 0) ||
        (b.stats?.storeDiscountPct || 0) - (a.stats?.storeDiscountPct || 0)
    );

  const remainingSlots = Math.max(0, maxTotal - state.picked.length);
  const featured = selectDiverse(featuredPool, remainingSlots, state, {
    maxPerStoreGlobal,
    maxPerStoreSection: 1,
    maxPerCategoryGlobal,
    preferUnseenCategory: true
  });

  return {
    targetHits,
    bugazos,
    drops,
    featured,
    picks: state.picked,
    stats: {
      uniqueStores: state.storeCounts.size,
      uniqueCategories: state.catCounts.size
    }
  };
}

function formatDiscountLabel(product) {
  const s = product.stats || {};
  if ((s.realDiscountPct || 0) >= 5) return `-${s.realDiscountPct}% real`;
  if ((s.peerDiscountPct || 0) >= 5) return `-${s.peerDiscountPct}% vs tiendas`;
  if ((s.delta24hPct || 0) <= -5) return `${s.delta24hPct}% hoy`;
  if ((s.storeDiscountPct || 0) >= 5) return `-${s.storeDiscountPct}%`;
  return '';
}

function formatProductBlock(product, { targetPrice = null } = {}) {
  const cat = CATEGORY_META[product.category] || {
    emoji: '🏷️',
    label: product.category || 'Oferta'
  };
  const disc = formatDiscountLabel(product);
  const discPart = disc ? ` · ${disc}` : '';
  const link = `${SITE_URL}?p=${encodeURIComponent(product.id)}`;
  const cardNote = product.cardPrice
    ? ` (${escapeHtml(product.cardName || 'Tarjeta')}: ${formatPen(product.cardPrice)})`
    : '';
  const targetNote = targetPrice ? ` · 🎯 Meta ${formatPen(targetPrice)}` : '';
  const score = product.stats?.dealScore ?? '—';

  return [
    `${cat.emoji} <b>${escapeHtml(product.storeName)}</b> · <i>${escapeHtml(cat.label)}</i>`,
    `<a href="${link}">${escapeHtml(String(product.title || '').slice(0, 88))}</a>`,
    `💰 <b>${formatPen(product.price)}</b>${cardNote}${discPart}${targetNote} · Score ${score}/100`
  ].join('\n');
}

function normalizeAlertBundle(input) {
  if (Array.isArray(input)) {
    const stores = new Set(input.map((p) => storeKey(p)));
    const cats = new Set(input.map((p) => p.category || 'general'));
    return {
      targetHits: [],
      bugazos: input.filter((p) => p.stats?.isBugazo),
      drops: input.filter((p) => !p.stats?.isBugazo && (p.stats?.isAllTimeLow || (p.stats?.delta24hPct || 0) <= -8)),
      featured: input.filter(
        (p) => !p.stats?.isBugazo && !p.stats?.isAllTimeLow && !((p.stats?.delta24hPct || 0) <= -8)
      ),
      picks: input,
      stats: { uniqueStores: stores.size, uniqueCategories: cats.size }
    };
  }
  return input;
}

export function buildTelegramMessages(alertBundleOrPicks, meta = {}, options = {}) {
  const { maxVisibleChars = TELEGRAM_MAX_VISIBLE_CHARS, watchlist = null } = options;
  const bundle = normalizeAlertBundle(alertBundleOrPicks);
  const targets = watchlist?.targetPrices || {};

  const headerLines = [
    `🇵🇪 <b>ChapaAlToque PE — Resumen de Ofertas (${escapeHtml(meta.lastUpdatedDate || 'Hoy')})</b>`,
    `📊 ${meta.totalProducts || 0} productos en ${meta.activeStores || 0} tiendas · ⚡ ${meta.bugazosCount || 0} posibles bugazos`
  ];

  if (bundle.picks.length) {
    headerLines.push(
      `🎯 Selección variada: <b>${bundle.picks.length} ofertas</b> en <b>${bundle.stats.uniqueStores} tiendas</b> y <b>${bundle.stats.uniqueCategories} categorías</b>`
    );
  }

  // Include active seasonal campaigns summary (especially newly launched campaigns)
  const campaigns = Array.isArray(meta.campaigns) ? meta.campaigns : [];
  const newCampaigns = campaigns.filter((c) => c.isNewToday);
  if (newCampaigns.length) {
    const newText = newCampaigns
      .slice(0, 5)
      .map((c) => `${c.emoji || '🔥'} <b>${escapeHtml(c.storeName)}</b> (${escapeHtml(c.label)})`)
      .join(', ');
    headerLines.push('', `🆕 <b>Nuevas temporadas activadas hoy:</b> ${newText}`);
  } else if (campaigns.length) {
    const topCamps = campaigns
      .slice(0, 5)
      .map((c) => `${escapeHtml(c.storeName)} (${escapeHtml(c.label)})`)
      .join(' · ');
    headerLines.push('', `🔥 <b>${campaigns.length} tiendas en campaña hoy:</b> ${topCamps}`);
  }

  const sections = [
    {
      title: '🎯 <b>PRECIO OBJETIVO ALCANZADO</b>',
      items: bundle.targetHits || [],
      isTarget: true
    },
    {
      title: '⚡ <b>BUGAZOS DESTACADOS</b>',
      items: bundle.bugazos || []
    },
    {
      title: '🔥 <b>MÍNIMOS HISTÓRICOS Y BAJADAS DE HOY</b>',
      items: bundle.drops || []
    },
    {
      title: '🏆 <b>MÁS OFERTAS POR CATEGORÍA Y TIENDA</b>',
      items: bundle.featured || []
    }
  ].filter((s) => s.items.length > 0);

  const footer = `🔎 Ver todas las ofertas: <a href="${SITE_URL}">ChapaAlToque PE</a>`;

  // Assemble clean blocks and split across messages only if visible text exceeds maxVisibleChars
  const messages = [];
  let currentParts = [headerLines.join('\n')];

  const currentLength = (extra = '') => {
    const joined = extra ? [...currentParts, extra].join('\n\n') : currentParts.join('\n\n');
    return visibleTextLength(joined);
  };

  for (const section of sections) {
    const blocks = section.items.map((item) =>
      formatProductBlock(item, { targetPrice: section.isTarget ? targets[item.id] : null })
    );

    const firstWithHeader = `${section.title}\n${blocks[0]}`;
    if (currentParts.length > 0 && currentLength(firstWithHeader) + visibleTextLength(footer) + 4 > maxVisibleChars) {
      messages.push(currentParts.join('\n\n'));
      currentParts = [`🇵🇪 <b>ChapaAlToque PE — Más ofertas (${escapeHtml(meta.lastUpdatedDate || 'Hoy')})</b>`];
    }
    currentParts.push(firstWithHeader);

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      if (currentLength(block) + visibleTextLength(footer) + 4 > maxVisibleChars) {
        messages.push(currentParts.join('\n\n'));
        currentParts = [
          `🇵🇪 <b>ChapaAlToque PE — Más ofertas (${escapeHtml(meta.lastUpdatedDate || 'Hoy')})</b>`,
          `${section.title} (cont.)\n${block}`
        ];
      } else {
        currentParts.push(block);
      }
    }
  }

  currentParts.push(footer);
  messages.push(currentParts.join('\n\n'));

  return messages;
}

export function buildTelegramHtml(alertBundleOrPicks, meta = {}, options = {}) {
  return buildTelegramMessages(alertBundleOrPicks, meta, options)[0];
}

export async function sendDealNotifications({ dryRun = false } = {}) {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;

  const catalog = loadCatalog();
  const meta = loadMeta();
  const watchlist = loadWatchlist();
  const bundle = pickTopAlerts(catalog, watchlist);
  const hasNewCampaigns = (meta.campaigns || []).some((c) => c.isNewToday);

  if (!bundle.picks.length && !hasNewCampaigns) {
    console.log('ℹ️ Sin alertas destacadas que enviar en esta corrida.');
    return { sentTelegram: false, messages: [] };
  }

  const messages = buildTelegramMessages(bundle, meta, { watchlist });

  if (dryRun) {
    console.log(
      `🧪 [DRY-RUN] ${bundle.picks.length} ofertas en ${bundle.stats.uniqueStores} tiendas y ${bundle.stats.uniqueCategories} categorías (${messages.length} mensaje(s)):\n`
    );
    messages.forEach((msg, idx) => {
      console.log(`--- Mensaje ${idx + 1}/${messages.length} (${visibleTextLength(msg)} chars visibles) ---`);
      console.log(msg);
      console.log('');
    });
    return { sentTelegram: false, dryRun: true, messages, bundle };
  }

  if (!tgToken || !tgChat) {
    console.log(
      `ℹ️ Alertas de Telegram (@${TELEGRAM_BOT_USERNAME}) omitidas (agrega TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en GitHub Secrets para activarlas).`
    );
    return { sentTelegram: false, messages };
  }

  let sentTelegram = false;
  try {
    for (const text of messages) {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChat,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Telegram HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
    }
    sentTelegram = true;
    console.log(
      `✅ Alerta enviada por Telegram vía @${TELEGRAM_BOT_USERNAME} (${bundle.picks.length} ofertas en ${bundle.stats.uniqueStores} tiendas y ${bundle.stats.uniqueCategories} categorías, ${messages.length} mensaje(s)).`
    );
  } catch (err) {
    console.error('⚠️ Error enviando alerta Telegram:', err.message);
  }

  return { sentTelegram, messages, bundle };
}

// Direct CLI execution: `node scraper/notify.js [--dry-run]`
if (process.argv[1] && process.argv[1].endsWith('notify.js')) {
  const dryRun = process.argv.includes('--dry-run');
  sendDealNotifications({ dryRun }).catch((err) => {
    console.error('❌ Error en notify.js:', err);
    process.exit(1);
  });
}
