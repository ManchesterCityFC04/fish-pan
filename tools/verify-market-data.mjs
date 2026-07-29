#!/usr/bin/env node
// 离线断言：market-data-engine 的 Engine 行为。
// Run: node tools/verify-market-data.mjs

import assert from 'node:assert/strict';

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

// ── Pure helpers copied from registry.ts / dedupe.ts / normalize.ts ──

function hashTitle(input) {
  const s = String(input ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function dedupeNews(items) {
  const byKey = new Map();
  let dropped = 0;
  for (const it of items) {
    if (!it || typeof it !== 'object') { dropped++; continue; }
    if (!it.url || !Number.isFinite(it.publishedAt)) { dropped++; continue; }
    const key = it.url ? `u:${it.url}` : `t:${hashTitle(it.title)}`;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, it); continue; }
    if (it.publishedAt > existing.publishedAt) byKey.set(key, it);
  }
  const result = Array.from(byKey.values()).sort((a, b) => b.publishedAt - a.publishedAt);
  return { items: result, dropped };
}

// ── Mock Engine mirroring registry.ts behaviour ──

class FakeKeyedPromiseCache {
  constructor() { this.cache = new Map(); this.inflight = new Map(); }
  async getOrFetch(key, ttlMs, fetch) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.cachedAt < ttlMs) return cached.result;
    const inflight = this.inflight.get(key);
    if (inflight) return inflight;
    const p = (async () => {
      try {
        const result = await fetch();
        this.cache.set(key, { result, cachedAt: Date.now() });
        return result;
      } finally { this.inflight.delete(key); }
    })();
    this.inflight.set(key, p);
    return p;
  }
}

class FakeHealthTracker {
  constructor() { this.state = new Map(); }
  get(id, kind) { let h = this.state.get(id); if (!h) { h = { id, kind, ok: 0, fail: 0 }; this.state.set(id, h); } return h; }
  recordOk(id, kind) { const h = this.get(id, kind); h.ok += 1; delete h.lastError; }
  recordFail(id, kind, msg) { const h = this.get(id, kind); h.fail += 1; h.lastError = msg; }
  snapshot() { return Array.from(this.state.values()); }
}

class FakeEngine {
  constructor(config) {
    this.config = config;
    this.cache = new FakeKeyedPromiseCache();
    this.health = new FakeHealthTracker();
    this.marketVendors = new Map();
    this.newsVendors = new Map();
  }
  registerMarketVendor(v) { const l = this.marketVendors.get(v.kind) ?? []; if (l.some((x) => x.id === v.id)) return; l.push(v); this.marketVendors.set(v.kind, l); this.health.get(v.id, v.kind); }
  registerNewsVendor(v) { const l = this.newsVendors.get(v.kind) ?? []; if (l.some((x) => x.id === v.id)) return; l.push(v); this.newsVendors.set(v.kind, l); this.health.get(v.id, v.kind); }
  priorityOf(id) { return this.config.vendors[id]?.priority ?? 100; }
  ttlFor(k) { return this.config.kinds[k]?.ttlMs ?? 60000; }
  marketCandidates(kind, req) {
    const list = this.marketVendors.get(kind) ?? [];
    return list.filter((v) => (this.config.vendors[v.id]?.enabled !== false) && v.supports(req))
      .sort((a, b) => this.priorityOf(a.id) - this.priorityOf(b.id));
  }
  async fetch(req) {
    const key = `${req.kind}:${req.code}:${req.klt ?? ''}:${req.category ?? ''}`;
    return await this.cache.getOrFetch(key, this.ttlFor(req.kind), async () => {
      const list = this.marketCandidates(req.kind, req);
      if (!list.length) return { data: null, error: { kind: 'not-applicable' } };
      let last = null;
      for (const v of list) {
        try {
          const data = await v.fetch(req, new AbortController().signal);
          this.health.recordOk(v.id, v.kind);
          return { data, staleAfter: Date.now() + this.ttlFor(v.kind) };
        } catch (e) {
          this.health.recordFail(v.id, v.kind, e.message);
          last = { kind: 'all-failed', vendor: v.id, message: e.message };
        }
      }
      return { data: null, error: last };
    });
  }
}

const cfg = {
  kinds: {
    quote:  { ttlMs: 1500, inFlightMs: 1500, concurrency: 4 },
    kline:  { ttlMs: 60000, inFlightMs: 2000, concurrency: 2 },
  },
  vendors: {
    'sina-quote':       { kind: 'quote', priority: 1, enabled: true },
    'tencent-quote':    { kind: 'quote', priority: 2, enabled: false },
    'eastmoney-kline':  { kind: 'kline', priority: 1, enabled: true },
    'failing-vendor':   { kind: 'kline', priority: 1, enabled: true },
  },
};

const okQuote = { id: 'sina-quote', kind: 'quote', supports: () => true, fetch: async () => [{ code: 'sh600000', price: 10 }] };
const disabledQuote = { id: 'tencent-quote', kind: 'quote', supports: () => true, fetch: async () => { throw new Error('should not be called'); } };
const okKline = { id: 'eastmoney-kline', kind: 'kline', supports: () => true, fetch: async () => ({ bars: [{ open: 1, close: 1, high: 1, low: 1, volume: 1, date: '2026-01-01' }], preClose: 1, name: 'mock' }) };
const failingKline = { id: 'failing-vendor', kind: 'kline', supports: () => true, fetch: async () => { throw new Error('upstream down'); } };

console.log('verify-market-data');

console.log('\n[Engine / Vendor selection]');
check('enabled vendors are selected', async () => {
  const e = new FakeEngine(cfg);
  e.registerMarketVendor(okQuote);
  e.registerMarketVendor(disabledQuote);
  const r = await e.fetch({ kind: 'quote', code: 'sh600000' });
  assert.equal(r.data[0].code, 'sh600000');
});
check('disabled vendors are skipped', async () => {
  const e = new FakeEngine(cfg);
  e.registerMarketVendor(okQuote);
  e.registerMarketVendor(disabledQuote);
  const r = await e.fetch({ kind: 'quote', code: 'sh600000' });
  assert.equal(r.error, undefined);
});
check('vendor throwing is isolated', async () => {
  const e = new FakeEngine(cfg);
  e.registerMarketVendor(failingKline);
  e.registerMarketVendor(okKline);
  const r = await e.fetch({ kind: 'kline', code: 'sh600000', klt: 'day' });
  assert.ok(Array.isArray(r.data.bars));
  const snap = e.health.snapshot();
  const failing = snap.find((h) => h.id === 'failing-vendor');
  const ok = snap.find((h) => h.id === 'eastmoney-kline');
  assert.equal(failing.fail, 1);
  assert.equal(ok.ok, 1);
});
check('all vendors failing returns all-failed error', async () => {
  const e = new FakeEngine({ ...cfg, vendors: { 'failing-vendor': { kind: 'kline', priority: 1, enabled: true } } });
  e.registerMarketVendor(failingKline);
  const r = await e.fetch({ kind: 'kline', code: 'sh600000', klt: 'day' });
  assert.equal(r.data, null);
  assert.equal(r.error.kind, 'all-failed');
});

console.log('\n[News dedupe sanity]');
check('dedupe keeps unique URL+titleHash', () => {
  const r = dedupeNews([
    { id: '1', kind: 'news', title: 't', url: 'https://a', source: 'x', publishedAt: 1, codes: [], lang: 'zh-CN' },
    { id: '2', kind: 'news', title: 't', url: 'https://a', source: 'y', publishedAt: 5, codes: [], lang: 'zh-CN' },
    { id: '3', kind: 'news', title: 't2', url: 'https://b', source: 'z', publishedAt: 3, codes: [], lang: 'zh-CN' },
  ]);
  assert.equal(r.items.length, 2);
});

console.log('\n[summary]');
console.log(`  passed=${passed}  failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);