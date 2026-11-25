import * as cheerio from 'cheerio';
import { fetchWithTimeout, runWithConcurrency } from './http.js';

const CAMPAIGN_DEFS = [
  { id: 'black_friday', label: 'Black Friday', emoji: '🔥', priority: 100, re: /black[\s\-_]*friday/i },
  { id: 'black_week', label: 'Black Week', emoji: '🔥', priority: 95, re: /black[\s\-_]*week/i },
  { id: 'black_days', label: 'Black Days', emoji: '🔥', priority: 90, re: /black[\s\-_]*(?:days?|sale|deals?|november|noviembre|fest|semana)/i },
  { id: 'cyber_wow', label: 'Cyber Wow', emoji: '⚡', priority: 88, re: /cyber[\s\-_]*wow/i },
  { id: 'cyber_days', label: 'Cyber Days', emoji: '⚡', priority: 86, re: /cyber[\s\-_]*days?/i },
  { id: 'cyber_monday', label: 'Cyber Monday', emoji: '⚡', priority: 84, re: /cyber[\s\-_]*monday/i },
  { id: 'cierra_puertas', label: 'Cierra Puertas', emoji: '🏷️', priority: 75, re: /cierra[\s\-_]*puertas/i },
  { id: 'navidad', label: 'Navidad', emoji: '🎄', priority: 70, re: /navidad|regalos?\s+navide/i },
  { id: 'dia_madre', label: 'Día de la Madre', emoji: '💐', priority: 68, re: /d[ií]a\s+de\s+la\s+madre/i },
  { id: 'dia_padre', label: 'Día del Padre', emoji: '🎁', priority: 66, re: /d[ií]a\s+del\s+padre/i },
  { id: 'fiestas_patrias', label: 'Fiestas Patrias', emoji: '🇵🇪', priority: 64, re: /fiestas?\s+patrias?/i },
  { id: 'liquidacion', label: 'Liquidación', emoji: '🏷️', priority: 55, re: /liquidaci[oó]n|remate\s+final|sale\s+de\s+temporada/i }
];

const BANNER_JSON_RE =
  /"(?:alt|title|description|headline|label|image|src|href|gotoUrl)"\s*:\s*"([^"]{4,150}(?:black[\s\-_]*(?:friday|week|days?|sale|nov|fest)|cyber[\s\-_]*(?:wow|days?|monday)|cierra[\s\-_]*puertas|navidad|d[ií]a\s+de\s+la\s+madre|d[ií]a\s+del\s+padre|fiestas?\s+patrias?|liquidaci[oó]n)[^"]{0,80})"/gi;

function computeStoreAuthenticity(st) {
  const avgDiscountPct = st.total ? Math.round(st.discSum / st.total) : 0;
  const realDealsRatio = st.total ? st.realDeals / st.total : 0;
  const inflatedRatio = st.total ? st.inflated / st.total : 0;

  let authenticity = 'mixed';
  let authenticityLabel = 'Ofertas selectivas';
  if (inflatedRatio >= 0.32 || (st.total >= 10 && realDealsRatio < 0.14 && st.droppedToday < 3)) {
    authenticity = 'hype';
    authenticityLabel = 'Ojo: varias bases infladas';
  } else if (realDealsRatio >= 0.42 || st.droppedToday >= 5) {
    authenticity = 'real';
    authenticityLabel = 'Rebajas reales';
  }
  return { avgDiscountPct, authenticity, authenticityLabel };
}

function sortCampaigns(list) {
  return [...list].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const authRank = (v) => (v === 'real' ? 2 : v === 'mixed' ? 1 : 0);
    if (authRank(b.authenticity) !== authRank(a.authenticity)) {
      return authRank(b.authenticity) - authRank(a.authenticity);
    }
    return b.avgDiscountPct - a.avgDiscountPct;
  });
}

/**
 * Escanea en paralelo las portadas y banners de las tiendas peruanas habilitadas
 * (ignorando el pie de página para evitar enlaces SEO permanentes) y cruza los resultados
 * con los datos reales de precios del catálogo para clasificar si la campaña tiene
 * rebajas reales o mucho descuento inflado.
 * Reutiliza el escaneo HTML si tiene menos de 6 horas (actualizando las métricas reales del catálogo).
 */
export async function detectActiveCampaigns(
  stores,
  analyzedCatalog,
  prevMeta = null,
  preDiscoveredPaths = {},
  options = {}
) {
  const { forceRefresh = false, maxCacheAgeMs = 6 * 3600 * 1000 } = options;
  const prevByStore = new Map();
  for (const c of prevMeta?.campaigns || []) {
    if (c?.storeId) prevByStore.set(c.storeId, c);
  }

  // Compute real pricing metrics per store from analyzed catalog
  const storeMetrics = {};
  for (const p of analyzedCatalog) {
    const m = (storeMetrics[p.storeId] ||= {
      total: 0,
      discSum: 0,
      realDeals: 0,
      inflated: 0,
      droppedToday: 0
    });
    m.total += 1;
    const disc = p.stats?.storeDiscountPct || 0;
    m.discSum += disc;
    if (p.stats?.listPriceInflated) {
      m.inflated += 1;
    } else if (
      ['all_time_low', 'great_deal'].includes(p.stats?.verdict) ||
      disc >= 15
    ) {
      m.realDeals += 1;
    }
    if ((p.stats?.delta24h || 0) < 0) {
      m.droppedToday += 1;
    }
  }

  // Fast path: reuse recent campaign HTML scan (< 6h) while recomputing live price metrics from fresh catalog
  const prevScannedMs = prevMeta?.campaignsScannedAt ? Date.parse(prevMeta.campaignsScannedAt) : NaN;
  if (
    !forceRefresh &&
    Number.isFinite(prevScannedMs) &&
    Date.now() - prevScannedMs < maxCacheAgeMs &&
    Array.isArray(prevMeta?.campaigns)
  ) {
    const enabledIds = new Set(stores.filter((s) => s.enabled).map((s) => s.id));
    const refreshed = prevMeta.campaigns
      .filter((c) => c?.storeId && enabledIds.has(c.storeId))
      .map((c) => {
        const st = storeMetrics[c.storeId] || {
          total: 0,
          discSum: 0,
          realDeals: 0,
          inflated: 0,
          droppedToday: 0
        };
        const { avgDiscountPct, authenticity, authenticityLabel } = computeStoreAuthenticity(st);
        if (avgDiscountPct < 3 && st.realDeals === 0) return null;
        return {
          ...c,
          avgDiscountPct,
          realDealsCount: st.realDeals,
          inflatedCount: st.inflated,
          totalProducts: st.total,
          droppedToday: st.droppedToday,
          authenticity,
          authenticityLabel,
          isNewToday: false
        };
      })
      .filter(Boolean);

    const campaigns = sortCampaigns(refreshed);
    const byStore = Object.fromEntries(campaigns.map((c) => [c.storeId, c]));
    return {
      campaigns,
      byStore,
      newCampaigns: [],
      fromCache: true,
      campaignsScannedAt: prevMeta.campaignsScannedAt
    };
  }

  const enabledStores = stores.filter((s) => s.enabled);

  const scanned = await runWithConcurrency(enabledStores, 16, async (store) => {
    try {
      let corpus = '';
      const prePaths = Array.isArray(preDiscoveredPaths[store.id]) ? preDiscoveredPaths[store.id] : [];

      if (prePaths.length) {
        corpus = prePaths.join(' | ');
      } else {
        const scanUrl = store.id === 'mi_oficial' ? 'https://www.mi.com/pe/store/' : store.baseUrl;
        const res = await fetchWithTimeout(scanUrl, {
          timeoutMs: 6500,
          retries: 0,
          headers: { Accept: 'text/html,application/xhtml+xml' }
        });
        if (!res.ok) return null;

        const html = await res.text();
        const $ = cheerio.load(html);

        const title = $('title').first().text().replace(/\s+/g, ' ').trim();
        const desc = $('meta[name="description"]').attr('content') || '';

        // Strip footers to eliminate year-round permanent SEO links (e.g. old Cyber Wow pages)
        $('footer, [class*="footer"], [id*="footer"]').remove();

        const navTexts = [];
        $('header a, nav a').each((_, el) => {
          const t = $(el).text().replace(/\s+/g, ' ').trim();
          const h = $(el).attr('href') || '';
          if (t || h) navTexts.push(`${t} ${h}`);
        });

        const imgAlts = [];
        $('img').each((_, el) => {
          const a = $(el).attr('alt') || $(el).attr('title') || '';
          if (a.length >= 4) imgAlts.push(a);
        });

        const headings = [];
        $('h1, h2').each((_, el) => {
          const t = $(el).text().replace(/\s+/g, ' ').trim();
          if (t.length >= 4 && t.length <= 120) headings.push(t);
        });

        const bannerJsonHits = [...html.matchAll(BANNER_JSON_RE)].map((m) => m[1]);

        corpus = [
          title,
          desc,
          ...headings.slice(0, 15),
          ...navTexts.slice(0, 60),
          ...imgAlts.slice(0, 35),
          ...bannerJsonHits.slice(0, 30)
        ].join(' | ');
      }

      const matched = CAMPAIGN_DEFS.filter((def) => def.re.test(corpus));
      if (!matched.length) return null;

      // Primary campaign = highest priority match
      matched.sort((a, b) => b.priority - a.priority);
      const primary = matched[0];
      const allLabels = matched.slice(0, 2).map((m) => m.label);

      // Extract announced max discount % (e.g. "hasta 70%")
      const pctMatches = [...corpus.matchAll(/(?:hasta|up to)\s*(\d{2})\s*%/gi)]
        .map((m) => Number(m[1]))
        .filter((n) => n >= 20 && n <= 85);
      const maxPromoPct = pctMatches.length ? Math.max(...pctMatches) : null;

      // Cross-verify against real catalog prices (excluding inflated bases)
      const st = storeMetrics[store.id] || {
        total: 0,
        discSum: 0,
        realDeals: 0,
        inflated: 0,
        droppedToday: 0
      };
      const { avgDiscountPct, authenticity, authenticityLabel } = computeStoreAuthenticity(st);

      // Skip stores with 0% average discount and 0 real deals (static menu link false positive)
      if (avgDiscountPct < 3 && st.realDeals === 0) return null;

      const prev = prevByStore.get(store.id);
      const isNewToday = !prev || prev.primaryId !== primary.id;

      return {
        storeId: store.id,
        storeName: store.name,
        primaryId: primary.id,
        label: primary.label,
        emoji: primary.emoji,
        priority: primary.priority,
        tags: allLabels,
        maxPromoPct,
        avgDiscountPct,
        realDealsCount: st.realDeals,
        inflatedCount: st.inflated,
        totalProducts: st.total,
        droppedToday: st.droppedToday,
        authenticity,
        authenticityLabel,
        isNewToday
      };
    } catch {
      return null;
    }
  });

  const campaigns = sortCampaigns(scanned.filter(Boolean));
  const byStore = Object.fromEntries(campaigns.map((c) => [c.storeId, c]));
  const newCampaigns = campaigns.filter((c) => c.isNewToday);

  return {
    campaigns,
    byStore,
    newCampaigns,
    fromCache: false,
    campaignsScannedAt: new Date().toISOString()
  };
}
