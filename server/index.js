import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, STORES } from '../config/stores.js';
import { getLimaDateString } from '../scraper/http.js';
import { analyzeProduct } from '../scraper/analyzer.js';
import { searchAllStoresLive } from '../scraper/live-search.js';
import { runDailyScrape } from '../scraper/run-daily.js';
import { scrapeProductUrl } from '../scraper/adapters/url-scraper.js';
import {
  loadCatalog,
  loadHistory,
  loadMeta,
  loadWatchlist,
  recordPricePoint,
  ROOT_DIR,
  saveAllData,
  saveWatchlist
} from '../scraper/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PORT = Number(process.env.PORT || 3000);

let isScraping = false;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function findRelatedProducts(target, catalog) {
  if (!target?.matchTokens?.length) return [];
  const targetSet = new Set(target.matchTokens);
  const scored = [];

  for (const item of catalog) {
    if (item.id === target.id || item.storeId === target.storeId) continue;
    const tokens = item.matchTokens || [];
    if (!tokens.length) continue;

    let overlap = 0;
    let brandMatch = false;
    for (const t of tokens) {
      if (targetSet.has(t)) overlap += 1;
    }
    if (target.brand && item.brand && target.brand.toLowerCase() === item.brand.toLowerCase()) {
      brandMatch = true;
    }
    const minLen = Math.min(targetSet.size, tokens.length);
    const ratio = minLen > 0 ? overlap / minLen : 0;

    if ((overlap >= 3 && ratio >= 0.35) || (brandMatch && overlap >= 2 && item.category === target.category)) {
      scored.push({ item, score: overlap * 2 + (brandMatch ? 2 : 0) + ratio });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
    .slice(0, 6)
    .map((s) => s.item);
}

function upsertSingleProduct(rawProduct, markCustom = true) {
  const today = getLimaDateString();
  const history = loadHistory();
  const catalog = loadCatalog();
  const meta = loadMeta();

  const product = {
    ...rawProduct,
    isCustomWatch: markCustom || Boolean(rawProduct.isCustomWatch),
    lastSeenDate: today
  };

  const entries = recordPricePoint(history, product, today);
  const analyzed = analyzeProduct(product, entries);

  const idx = catalog.findIndex((p) => p.id === analyzed.id);
  if (idx >= 0) {
    catalog[idx] = analyzed;
  } else {
    catalog.unshift(analyzed);
  }

  meta.totalProducts = catalog.length;
  meta.allTimeLows = catalog.filter((p) => p.stats.isAllTimeLow).length;
  meta.droppedToday = catalog.filter((p) => p.stats.delta24h < 0).length;
  meta.fakeDiscounts = catalog.filter((p) => p.stats.isFakeDiscount).length;

  saveAllData({ catalog, history, meta });
  return { product: analyzed, history: entries, meta };
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    // === API ROUTES ===
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        mode: 'server',
        scraping: isScraping,
        todayLima: getLimaDateString()
      });
    }

    if (pathname === '/api/stores' && req.method === 'GET') {
      return sendJson(res, 200, { stores: STORES, categories: CATEGORIES });
    }

    if (pathname === '/api/catalog' && req.method === 'GET') {
      return sendJson(res, 200, {
        meta: loadMeta(),
        catalog: loadCatalog(),
        watchlist: loadWatchlist(),
        stores: STORES,
        categories: CATEGORIES
      });
    }

    if (pathname.startsWith('/api/product/') && req.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/product/'.length));
      const catalog = loadCatalog();
      const history = loadHistory();
      const product = catalog.find((p) => p.id === id);
      if (!product) {
        return sendJson(res, 404, { error: 'Producto no encontrado' });
      }
      return sendJson(res, 200, {
        product,
        history: history[id] || [],
        related: findRelatedProducts(product, catalog)
      });
    }

    if (pathname === '/api/search' && req.method === 'GET') {
      const q = (urlObj.searchParams.get('q') || '').trim();
      if (!q || q.length < 2) {
        return sendJson(res, 400, { error: 'Ingresa al menos 2 caracteres para buscar' });
      }
      const storeFilter = urlObj.searchParams.get('stores');
      const storeIds = storeFilter ? storeFilter.split(',').filter(Boolean) : null;
      const result = await searchAllStoresLive(q, { limitPerStore: 6, storeIds });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/scrape/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      if (isScraping) {
        sendEvent('error', { message: 'Ya hay una actualización en progreso. Espera unos segundos.' });
        return res.end();
      }

      isScraping = true;
      const quick = urlObj.searchParams.get('quick') === '1';

      try {
        const result = await runDailyScrape({
          quick,
          onProgress: (ev) => sendEvent('progress', ev)
        });
        sendEvent('done', { meta: result.meta, totalProducts: result.catalog.length });
      } catch (err) {
        sendEvent('error', { message: err?.message || 'Error actualizando precios' });
      } finally {
        isScraping = false;
        res.end();
      }
      return;
    }

    if (pathname === '/api/track-url' && req.method === 'POST') {
      const body = await readBody(req);
      const rawUrl = String(body.url || '').trim();
      if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        return sendJson(res, 400, { error: 'Ingresa una URL válida que empiece con https://' });
      }

      const scraped = await scrapeProductUrl(rawUrl, body.category || 'personal');
      const { product, history, meta } = upsertSingleProduct(scraped, true);

      const watchlist = loadWatchlist();
      if (!watchlist.urls.some((u) => (typeof u === 'string' ? u : u.url) === rawUrl)) {
        watchlist.urls.push({
          url: rawUrl,
          id: product.id,
          title: product.title,
          addedAt: new Date().toISOString()
        });
      }
      if (!watchlist.starredIds.includes(product.id)) {
        watchlist.starredIds.push(product.id);
      }
      if (body.targetPrice && Number(body.targetPrice) > 0) {
        watchlist.targetPrices[product.id] = Number(body.targetPrice);
      }
      saveWatchlist(watchlist);

      return sendJson(res, 200, { ok: true, product, history, watchlist, meta });
    }

    if (pathname === '/api/track-product' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.product || !body.product.id || !body.product.price) {
        return sendJson(res, 400, { error: 'Datos de producto incompletos' });
      }
      const { product, history, meta } = upsertSingleProduct(body.product, true);
      const watchlist = loadWatchlist();
      if (product.url && !watchlist.urls.some((u) => (typeof u === 'string' ? u : u.url) === product.url)) {
        watchlist.urls.push({
          url: product.url,
          id: product.id,
          title: product.title,
          addedAt: new Date().toISOString()
        });
      }
      if (!watchlist.starredIds.includes(product.id)) {
        watchlist.starredIds.push(product.id);
      }
      saveWatchlist(watchlist);
      return sendJson(res, 200, { ok: true, product, history, watchlist, meta });
    }

    if (pathname === '/api/refresh-product' && req.method === 'POST') {
      const body = await readBody(req);
      const catalog = loadCatalog();
      const existing = catalog.find((p) => p.id === body.id);
      if (!existing || !existing.url) {
        return sendJson(res, 404, { error: 'Producto no encontrado' });
      }
      const fresh = await scrapeProductUrl(existing.url, existing.category);
      // Preserve stable product id if URL hash differed
      fresh.id = existing.id;
      const { product, history, meta } = upsertSingleProduct(fresh, existing.isCustomWatch);
      return sendJson(res, 200, { ok: true, product, history, meta });
    }

    if (pathname === '/api/watchlist' && req.method === 'POST') {
      const body = await readBody(req);
      const watchlist = loadWatchlist();

      if (body.action === 'toggleStar' && body.id) {
        const idx = watchlist.starredIds.indexOf(body.id);
        if (idx >= 0) watchlist.starredIds.splice(idx, 1);
        else watchlist.starredIds.push(body.id);
      } else if (body.action === 'setTargetPrice' && body.id) {
        if (body.targetPrice && Number(body.targetPrice) > 0) {
          watchlist.targetPrices[body.id] = Number(body.targetPrice);
        } else {
          delete watchlist.targetPrices[body.id];
        }
      } else if (body.action === 'addQuery' && body.query) {
        const q = String(body.query).trim();
        if (q && !watchlist.customQueries.includes(q)) {
          watchlist.customQueries.push(q);
        }
      } else if (body.action === 'removeQuery' && body.query) {
        watchlist.customQueries = watchlist.customQueries.filter((q) => q !== body.query);
      } else if (body.action === 'removeUrl' && body.url) {
        watchlist.urls = watchlist.urls.filter((u) => (typeof u === 'string' ? u : u.url) !== body.url);
      }

      saveWatchlist(watchlist);
      return sendJson(res, 200, { ok: true, watchlist });
    }

    // === STATIC FILE SERVING ===
    const safePath = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safePath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.json' ? 'no-store' : 'public, max-age=60'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error('[Server Error]', err);
    sendJson(res, 500, { error: err?.message || 'Error interno del servidor' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🇵🇪 ChapaAlToque PE corriendo en http://localhost:${PORT}`);
});
