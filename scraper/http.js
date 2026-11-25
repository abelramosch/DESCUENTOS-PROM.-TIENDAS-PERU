import crypto from 'node:crypto';
import https from 'node:https';
import zlib from 'node:zlib';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8'
};

let cachedUsdPen = null;
let cachedUsdPenAt = 0;

/**
 * Obtiene el tipo de cambio USD -> PEN aproximado (cacheado 6 horas).
 */
export async function getUsdToPenRate() {
  const now = Date.now();
  if (cachedUsdPen && now - cachedUsdPenAt < 6 * 3600 * 1000) {
    return cachedUsdPen;
  }
  try {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {
      timeoutMs: 5000,
      headers: { Accept: 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.rates?.PEN);
      if (rate && rate > 2.5 && rate < 6.0) {
        cachedUsdPen = Number(rate.toFixed(3));
        cachedUsdPenAt = now;
        return cachedUsdPen;
      }
    }
  } catch {
    // Fallback below
  }
  cachedUsdPen = 3.75;
  cachedUsdPenAt = now;
  return cachedUsdPen;
}

function httpsGetLargeHeaders(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { ...DEFAULT_HEADERS, 'Accept-Encoding': 'gzip, deflate', ...headers },
        maxHeaderSize: 131072,
        timeout: timeoutMs
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          return httpsGetLargeHeaders(nextUrl, headers, timeoutMs).then(resolve, reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          try {
            if (enc === 'gzip' || (buf[0] === 0x1f && buf[1] === 0x8b)) {
              buf = zlib.gunzipSync(buf);
            } else if (enc === 'deflate') {
              buf = zlib.inflateSync(buf);
            }
          } catch {
            // use raw buffer if decompression fails
          }
          const bodyText = buf.toString('utf-8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: async () => bodyText,
            json: async () => JSON.parse(bodyText)
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

export async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = 7500, headers = {}, retries = 1 } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...DEFAULT_HEADERS,
          ...headers
        }
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (String(err?.cause?.message || err?.message || '').includes('Headers Overflow')) {
        return httpsGetLargeHeaders(url, headers, timeoutMs);
      }
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export function parsePriceNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw
    .replace(/S\/\.?/gi, '')
    .replace(/US\$|\$/gi, '')
    .replace(/PEN|USD/gi, '')
    .replace(/[^\d.,]/g, '')
    .trim();
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // Decide which is decimal separator by last occurrence
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // European / Latam: 2.042,30
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US / Peru retail: 2,042.30
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Check if comma looks like decimal (e.g. "15,00" or "129,90") vs thousands ("1,299")
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = parts[0] + '.' + parts[1];
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasDot) {
    // Check if dot looks like thousands (e.g. "1.299")
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      cleaned = parts.join('');
    }
  }

  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
}

export function makeProductId(storeId, rawKey) {
  const cleanKey = String(rawKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (cleanKey && cleanKey.length <= 48) {
    return `${storeId}:${cleanKey}`;
  }
  const hash = crypto.createHash('sha1').update(String(rawKey)).digest('hex').slice(0, 12);
  return `${storeId}:${hash}`;
}

export function getLimaDateString(date = new Date()) {
  // Format YYYY-MM-DD in America/Lima (UTC-5)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

export async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function runner() {
    while (idx < items.length) {
      const current = idx++;
      try {
        results[current] = await worker(items[current], current);
      } catch (err) {
        results[current] = { error: err?.message || String(err) };
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(workers);
  return results;
}

/**
 * Ordena los trabajos poniendo primero los escaneos largos (tiendas por categorías/campañas)
 * e intercalando round-robin por tienda el resto para maximizar paralelismo sin saturar un dominio.
 */
export function interleaveJobsByStore(jobs = []) {
  const priorityLong = [];
  const buckets = new Map();
  const unkeyed = [];

  for (const job of jobs) {
    if (!job) continue;
    if (job.type === 'magento_categories' || job.type === 'mi_official') {
      priorityLong.push(job);
      continue;
    }
    const key = job.store?.id || null;
    if (!key) {
      unkeyed.push(job);
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(job);
  }

  // Round-robin starting with stores that have the most jobs so long tails finish early
  const queues = [...buckets.values()].sort((a, b) => b.length - a.length);
  const interleaved = [];
  let remaining = true;
  let round = 0;
  while (remaining) {
    remaining = false;
    for (const q of queues) {
      if (round < q.length) {
        interleaved.push(q[round]);
        remaining = true;
      }
    }
    round += 1;
  }

  return [...priorityLong, ...interleaved, ...unkeyed];
}

/**
 * Ejecuta trabajos en paralelo con límite global, límite por tienda (anti-bloqueo)
 * y circuit breaker por tienda para omitir rápidamente dominios caídos.
 */
export async function runJobsWithStoreLimit(jobs, options = {}, worker) {
  const {
    concurrency = 20,
    maxPerStore = 3,
    circuitBreakerThreshold = 4,
    onSkip = null
  } = options;

  const pending = jobs.map((job, index) => ({ job, index }));
  const results = new Array(jobs.length);
  const inFlightByStore = new Map();
  const consecutiveFailures = new Map();
  const trippedStores = new Set();
  let totalInFlight = 0;
  let waiters = [];

  const notifyAll = () => {
    const list = waiters;
    waiters = [];
    for (const resolve of list) resolve();
  };

  const waitForChange = () => new Promise((resolve) => waiters.push(resolve));

  async function runner() {
    while (true) {
      if (pending.length === 0) return;

      let pickIdx = -1;
      for (let i = 0; i < pending.length; i++) {
        const sid = pending[i].job?.store?.id || null;
        if (!sid || trippedStores.has(sid) || (inFlightByStore.get(sid) || 0) < maxPerStore) {
          pickIdx = i;
          break;
        }
      }

      if (pickIdx === -1) {
        if (totalInFlight === 0) return;
        await waitForChange();
        continue;
      }

      const [{ job, index }] = pending.splice(pickIdx, 1);
      const sid = job?.store?.id || null;

      if (sid && trippedStores.has(sid)) {
        results[index] = { skipped: true, reason: 'circuit_breaker' };
        if (onSkip) onSkip(job, index);
        continue;
      }

      totalInFlight += 1;
      if (sid) inFlightByStore.set(sid, (inFlightByStore.get(sid) || 0) + 1);

      try {
        results[index] = await worker(job, index);
        if (sid) consecutiveFailures.set(sid, 0);
      } catch (err) {
        results[index] = { error: err?.message || String(err) };
        if (sid && circuitBreakerThreshold > 0) {
          const fails = (consecutiveFailures.get(sid) || 0) + 1;
          consecutiveFailures.set(sid, fails);
          if (fails >= circuitBreakerThreshold) {
            trippedStores.add(sid);
          }
        }
      } finally {
        totalInFlight -= 1;
        if (sid) {
          const next = Math.max(0, (inFlightByStore.get(sid) || 1) - 1);
          if (next === 0) inFlightByStore.delete(sid);
          else inFlightByStore.set(sid, next);
        }
        notifyAll();
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, jobs.length));
  await Promise.all(Array.from({ length: workerCount }, () => runner()));
  return { results, trippedStores: [...trippedStores] };
}

