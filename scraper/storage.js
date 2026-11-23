import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data');

const FILES = {
  catalog: path.join(DATA_DIR, 'catalog.json'),
  history: path.join(DATA_DIR, 'history.json'),
  meta: path.join(DATA_DIR, 'meta.json'),
  watchlist: path.join(DATA_DIR, 'watchlist.json')
};

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data, compact = false) {
  ensureDirs();
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, compact ? JSON.stringify(data) : JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function loadHistory() {
  return readJsonSafe(FILES.history, {});
}

export function loadCatalog() {
  return readJsonSafe(FILES.catalog, []);
}

export function loadMeta() {
  return readJsonSafe(FILES.meta, {
    lastUpdatedAt: null,
    lastUpdatedDate: null,
    usdToPen: 3.75,
    totalProducts: 0,
    storesStatus: {}
  });
}

export function loadWatchlist() {
  return readJsonSafe(FILES.watchlist, {
    urls: [],
    customQueries: [],
    starredIds: [],
    targetPrices: {}
  });
}

export function saveWatchlist(watchlist) {
  writeJsonAtomic(FILES.watchlist, watchlist);
  writeJsonAtomic(path.join(PUBLIC_DATA_DIR, 'watchlist.json'), watchlist, true);
}

export function saveAllData({ catalog, history, meta }) {
  writeJsonAtomic(FILES.history, history);
  writeJsonAtomic(FILES.catalog, catalog);
  writeJsonAtomic(FILES.meta, meta);

  // Sync compact copies into public/data for fast GitHub Pages static loading
  writeJsonAtomic(path.join(PUBLIC_DATA_DIR, 'catalog.json'), catalog, true);
  writeJsonAtomic(path.join(PUBLIC_DATA_DIR, 'history.json'), history, true);
  writeJsonAtomic(path.join(PUBLIC_DATA_DIR, 'meta.json'), meta, true);
}

/**
 * Registra o actualiza la observación de precio del día (idempotente por fecha YYYY-MM-DD).
 * Si se actualiza varias veces el mismo día, conserva el precio más reciente y registra
 * el mínimo visto ese día si bajó.
 */
export function recordPricePoint(historyMap, product, dateStr) {
  if (!historyMap[product.id]) {
    historyMap[product.id] = [];
  }
  const entries = historyMap[product.id];
  const point = {
    date: dateStr,
    price: Number(product.price),
    listPrice: Number(product.listPrice) || Number(product.price),
    cardPrice: product.cardPrice ? Number(product.cardPrice) : null,
    inStock: Boolean(product.inStock)
  };

  const existingIdx = entries.findIndex((e) => e.date === dateStr);
  if (existingIdx >= 0) {
    entries[existingIdx] = point;
  } else {
    entries.push(point);
    entries.sort((a, b) => a.date.localeCompare(b.date));
    // Keep up to 365 days per product to keep JSON compact
    if (entries.length > 365) {
      historyMap[product.id] = entries.slice(-365);
    }
  }
  return historyMap[product.id];
}
