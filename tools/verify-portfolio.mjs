#!/usr/bin/env node
// portfolio-positions 离线断言脚本：纯函数 + bundle v2 兼容。
// Run: node tools/verify-portfolio.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${e && e.message}`);
  }
}

// ── Pure helpers mirroring src/bundle.ts behavior ──

const BUNDLE_VERSION = 2;
const BUNDLE_KIND = 'fish-pan:settings-bundle';

function validateBundle(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '顶层不是对象' };
  const obj = raw;
  if (obj.kind !== BUNDLE_KIND) return { ok: false, error: 'kind 字段不正确' };
  if (!Number.isFinite(obj.version)) return { ok: false, error: 'version 必须为数字' };
  if (obj.version > BUNDLE_VERSION) return { ok: false, error: 'version 高于当前支持' };
  if (obj.version === 1 && Array.isArray(obj.watchlist)) return { ok: true, value: obj };
  if (!Array.isArray(obj.watchlist)) return { ok: false, error: 'watchlist 不是数组' };
  return { ok: true, value: obj };
}

// ── 持仓盈亏与折算（纯函数） ──
function todayPnl(currentPrice, prevClose, shares) {
  if (currentPrice == null || prevClose == null) return null;
  return (currentPrice - prevClose) * shares;
}
function totalPnl(currentPrice, costPrice, shares) {
  if (currentPrice == null) return null;
  return (currentPrice - costPrice) * shares;
}
function fxRateCnyPerUnit(foreignCurrency, rates) {
  if (!foreignCurrency || foreignCurrency === 'CNY') return 1;
  return rates[foreignCurrency] ?? null;
}

console.log('verify-portfolio');

console.log('\n[bundle validate]');
check('v2 bundle with accounts + positions is valid', () => {
  const r = validateBundle({
    kind: BUNDLE_KIND,
    version: 2,
    exportedAt: 1,
    watchlist: [],
    alerts: [],
    alertEvents: [],
    aiAnalyses: [],
    llmConfig: { baseUrl: null, model: null, proxyUrl: null },
    accounts: [{ id: 1, name: 'A', baseCurrency: 'CNY', createdAt: 1 }],
    positions: [{ id: 1, accountId: 1, code: 'sh600000', shares: 100, costPrice: 10, openedAt: 1, notes: null }],
  });
  assert.equal(r.ok, true);
});
check('v1 bundle is read-only and accepts legacy shape', () => {
  const r = validateBundle({
    kind: BUNDLE_KIND,
    version: 1,
    exportedAt: 1,
    watchlist: [{ code: 'sh600000', name: 'X', sortOrder: 0 }],
    alerts: [],
    alertEvents: [],
    aiAnalyses: [],
    llmConfig: { baseUrl: null, model: null, proxyUrl: null },
  });
  assert.equal(r.ok, true);
});
check('bundle with missing required field is rejected', () => {
  const r = validateBundle({
    kind: BUNDLE_KIND,
    version: 2,
    exportedAt: 1,
    alerts: [],
    alertEvents: [],
    aiAnalyses: [],
    llmConfig: { baseUrl: null, model: null, proxyUrl: null },
    accounts: [],
    positions: [],
  });
  assert.equal(r.ok, false);
});

console.log('\n[pnl & fx]');
check('todayPnl = (cur - prev) * shares', () => {
  assert.equal(todayPnl(11, 10, 100), 100);
});
check('todayPnl returns null when prevClose missing', () => {
  assert.equal(todayPnl(11, null, 100), null);
});
check('totalPnl = (cur - cost) * shares', () => {
  assert.equal(totalPnl(12, 10, 100), 200);
});
check('totalPnl returns null when currentPrice missing', () => {
  assert.equal(totalPnl(null, 10, 100), null);
});
check('fxRateCnyPerUnit returns 1 for CNY', () => {
  assert.equal(fxRateCnyPerUnit('CNY', { USD: 7 }), 1);
});
check('fxRateCnyPerUnit returns null for missing rate', () => {
  assert.equal(fxRateCnyPerUnit('USD', { HKD: 1 }), null);
});
check('fxRateCnyPerUnit returns numeric rate for known pair', () => {
  assert.equal(fxRateCnyPerUnit('USD', { USD: 7.2, HKD: 0.93 }), 7.2);
});

console.log('\n[summary]');
console.log(`  passed=${passed}  failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);