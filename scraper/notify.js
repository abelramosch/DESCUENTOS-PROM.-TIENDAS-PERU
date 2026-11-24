import { loadCatalog, loadMeta, loadWatchlist } from './storage.js';

const SITE_URL = process.env.SITE_URL || 'https://abelramosch.github.io/chapaaltoque/';
const TELEGRAM_BOT_USERNAME = 'Chapaaltoque_pe_bot';

function formatPen(n) {
  return (
    'S/ ' +
    Number(n).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

function pickTopAlerts(catalog, watchlist) {
  const targets = watchlist?.targetPrices || {};

  // 1. Target price hits from watchlist
  const targetHits = catalog.filter(
    (p) => targets[p.id] && p.effectivePrice <= Number(targets[p.id])
  );

  // 2. Bugazos (prioritizing historical crash & cross-store anomalies)
  const bugazos = catalog
    .filter((p) => p.stats?.isBugazo)
    .sort((a, b) => {
      const rank = (t) => (t === 'historical_crash' ? 3 : t === 'cross_store' ? 2 : 1);
      return rank(b.stats.bugazoType) - rank(a.stats.bugazoType) || b.stats.dealScore - a.stats.dealScore;
    })
    .slice(0, 5);

  // 3. All-Time Lows or biggest 24h drops
  const drops = catalog
    .filter((p) => p.stats?.isAllTimeLow || p.stats?.delta24hPct <= -10)
    .sort((a, b) => a.stats.delta24hPct - b.stats.delta24hPct || b.stats.dealScore - a.stats.dealScore)
    .slice(0, 5);

  // Deduplicate keeping top 8 highlights
  const seen = new Set();
  const picks = [];
  for (const item of [...targetHits, ...bugazos, ...drops]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    picks.push(item);
    if (picks.length >= 8) break;
  }

  return { targetHits, bugazos, drops, picks };
}

function buildTelegramHtml(picks, meta) {
  const lines = [
    `🇵🇪 <b>ChapaAlToque PE — Resumen de Ofertas (${meta.lastUpdatedDate || 'Hoy'})</b>`,
    `📊 ${meta.totalProducts || 0} productos en ${meta.activeStores || 0} tiendas · ⚡ ${meta.bugazosCount || 0} posibles bugazos`,
    ''
  ];

  // Include active seasonal campaigns summary (especially newly launched campaigns)
  const campaigns = Array.isArray(meta.campaigns) ? meta.campaigns : [];
  const newCampaigns = campaigns.filter((c) => c.isNewToday);
  if (newCampaigns.length) {
    const newText = newCampaigns
      .slice(0, 5)
      .map((c) => `${c.emoji || '🔥'} <b>${escapeHtml(c.storeName)}</b> (${escapeHtml(c.label)})`)
      .join(', ');
    lines.push(`🆕 <b>Nuevas temporadas activadas hoy:</b> ${newText}`, '');
  } else if (campaigns.length) {
    const topCamps = campaigns
      .slice(0, 5)
      .map((c) => `${escapeHtml(c.storeName)} (${escapeHtml(c.label)})`)
      .join(' · ');
    lines.push(`🔥 <b>${campaigns.length} tiendas en campaña hoy:</b> ${topCamps}`, '');
  }

  for (const p of picks) {
    const tag = p.stats.isBugazo
      ? '⚡ BUGAZO'
      : p.stats.isAllTimeLow
        ? '🔥 MÍNIMO HISTÓRICO'
        : '📉 BAJÓ HOY';
    const disc = p.stats.realDiscountPct >= 5 ? `-${p.stats.realDiscountPct}% real` : `-${p.stats.storeDiscountPct}%`;
    const link = `${SITE_URL}?p=${encodeURIComponent(p.id)}`;
    const cardNote = p.cardPrice ? ` (${p.cardName || 'Tarjeta'}: ${formatPen(p.cardPrice)})` : '';
    lines.push(
      `${tag} · <b>${escapeHtml(p.storeName)}</b>`,
      `<a href="${link}">${escapeHtml(p.title.slice(0, 90))}</a>`,
      `💰 <b>${formatPen(p.price)}</b>${cardNote} · ${disc} · Score ${p.stats.dealScore}/100`,
      ''
    );
  }

  lines.push(`🔎 Ver todas las ofertas: <a href="${SITE_URL}">ChapaAlToque PE</a>`);
  return lines.join('\n');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendDealNotifications() {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;

  if (!tgToken || !tgChat) {
    console.log(
      `ℹ️ Alertas de Telegram (@${TELEGRAM_BOT_USERNAME}) omitidas (agrega TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en GitHub Secrets para activarlas).`
    );
    return { sentTelegram: false };
  }

  const catalog = loadCatalog();
  const meta = loadMeta();
  const watchlist = loadWatchlist();
  const { picks } = pickTopAlerts(catalog, watchlist);
  const hasNewCampaigns = (meta.campaigns || []).some((c) => c.isNewToday);

  if (!picks.length && !hasNewCampaigns) {
    console.log('ℹ️ Sin alertas destacadas que enviar en esta corrida.');
    return { sentTelegram: false };
  }

  let sentTelegram = false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgChat,
        text: buildTelegramHtml(picks, meta),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
    sentTelegram = true;
    console.log(`✅ Alerta enviada por Telegram vía @${TELEGRAM_BOT_USERNAME} (${picks.length} ofertas).`);
  } catch (err) {
    console.error('⚠️ Error enviando alerta Telegram:', err.message);
  }

  return { sentTelegram };
}

// Direct CLI execution: `node scraper/notify.js`
if (process.argv[1] && process.argv[1].endsWith('notify.js')) {
  sendDealNotifications().catch((err) => {
    console.error('❌ Error en notify.js:', err);
    process.exit(1);
  });
}
