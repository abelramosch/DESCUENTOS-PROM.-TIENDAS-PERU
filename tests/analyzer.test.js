import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProduct, extractMatchTokens } from '../scraper/analyzer.js';
import { parsePriceNumber } from '../scraper/http.js';
import { recordPricePoint } from '../scraper/storage.js';

test('parsePriceNumber parses Peruvian PEN, USD, and EU formatted prices', () => {
  assert.equal(parsePriceNumber('S/ 1,299.90'), 1299.9);
  assert.equal(parsePriceNumber('S/.  119'), 119);
  assert.equal(parsePriceNumber('$ 2.042,30'), 2042.3);
  assert.equal(parsePriceNumber('$ 15,00'), 15);
  assert.equal(parsePriceNumber('1.299'), 1299);
  assert.equal(parsePriceNumber('2,499'), 2499);
  assert.equal(parsePriceNumber('invalid'), null);
});

test('analyzeProduct detects true All-Time Low (mínimo histórico) with 24h drop', () => {
  const product = {
    id: 'plazavea:123',
    storeId: 'plazavea',
    storeName: 'PlazaVea',
    title: 'Televisor LG OLED 55 C4 4K',
    brand: 'LG',
    price: 3199,
    listPrice: 4999,
    cardPrice: 2999,
    cardName: 'Tarjeta Oh!',
    inStock: true
  };

  const history = [
    { date: '2026-10-25', price: 3999, listPrice: 4999, inStock: true },
    { date: '2026-11-01', price: 3899, listPrice: 4999, inStock: true },
    { date: '2026-11-10', price: 3999, listPrice: 4999, inStock: true },
    { date: '2026-11-22', price: 3799, listPrice: 4999, inStock: true },
    { date: '2026-11-23', price: 3199, listPrice: 4999, cardPrice: 2999, inStock: true }
  ];

  const analyzed = analyzeProduct(product, history);
  assert.equal(analyzed.stats.isAllTimeLow, true);
  assert.equal(analyzed.stats.isFakeDiscount, false);
  assert.equal(analyzed.stats.verdict, 'all_time_low');
  assert.equal(analyzed.stats.minPrice, 3199);
  assert.equal(analyzed.stats.minDate, '2026-11-23');
  assert.equal(analyzed.stats.delta24h, -600);
  assert.ok(analyzed.stats.dealScore >= 90, `Expected dealScore >= 90, got ${analyzed.stats.dealScore}`);
  assert.equal(analyzed.effectivePrice, 2999);
});

test('analyzeProduct flags fake / inflated Cyber discounts when price never actually dropped', () => {
  const product = {
    id: 'falabella:999',
    storeId: 'falabella',
    storeName: 'Falabella',
    title: 'Freidora de Aire 5L',
    brand: 'Oster',
    price: 299,
    listPrice: 599, // Claims 50% off!
    inStock: true
  };

  // Same S/ 299 every single day -> permanent fake crossed-out listPrice
  const history = [
    { date: '2026-11-19', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-20', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-21', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-22', price: 299, listPrice: 599, inStock: true },
    { date: '2026-11-23', price: 299, listPrice: 599, inStock: true }
  ];

  const analyzed = analyzeProduct(product, history);
  assert.equal(analyzed.stats.isFakeDiscount, true);
  assert.equal(analyzed.stats.verdict, 'inflated');
  assert.ok(analyzed.stats.dealScore <= 42);
});

test('recordPricePoint deduplicates same-day scrapes and appends new dates in order', () => {
  const historyMap = {};
  const prod = { id: 'coolbox:1', price: 150, listPrice: 200, inStock: true };

  recordPricePoint(historyMap, prod, '2026-11-22');
  recordPricePoint(historyMap, { ...prod, price: 140 }, '2026-11-22');
  recordPricePoint(historyMap, { ...prod, price: 129 }, '2026-11-23');

  assert.equal(historyMap['coolbox:1'].length, 2);
  assert.equal(historyMap['coolbox:1'][0].price, 140);
  assert.equal(historyMap['coolbox:1'][1].price, 129);
});

test('extractMatchTokens extracts normalized model keywords', () => {
  const tokens = extractMatchTokens('Televisor LG OLED 55" 4K Smart TV OLED55C4', 'LG');
  assert.ok(tokens.includes('lg'));
  assert.ok(tokens.includes('oled'));
  assert.ok(tokens.includes('oled55c4'));
});
