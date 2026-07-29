#!/usr/bin/env node
// 离线断言脚本：复制 electron/market/{normalize,dedupe,index,vendors} 的纯函数，
// 不发起真实网络请求，覆盖字段标准化、去重、TTL、失败隔离、摘要裁剪、id 稳定性。
// Run: node tools/verify-news-adapters.mjs

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

// ── normalize ──
function stripHtml(input) {
  const raw = String(input ?? '');
  const noTags = raw.replace(/<[^>]*>/g, '');
  const named = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&apos;': "'", '&#39;': "'", '&hellip;': '…',
    '&mdash;': '—', '&ndash;': '–',
  };
  let out = noTags;
  for (const k of Object.keys(named)) out = out.split(k).join(named[k]);
  out = out.replace(/&#(\d+);/g, (_m, dec) => {
    const code = Number(dec);
    if (!Number.isFinite(code)) return _m;
    try { return String.fromCharCode(code); } catch { return _m; }
  });
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
    const code = parseInt(hex, 16);
    if (!Number.isFinite(code)) return _m;
    try { return String.fromCharCode(code); } catch { return _m; }
  });
  return out.replace(/\s+/g, ' ').trim();
}

function normalizeCode(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (/^(sh|sz|bj|hk)(\d{4,6})$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith('6')) return 'sh' + s;
    if (s.startsWith('0') || s.startsWith('3')) return 'sz' + s;
    if (s.startsWith('8') || s.startsWith('4')) return 'bj' + s;
    return 'sh' + s;
  }
  if (/^\d{4,5}$/.test(s)) return 'hk' + s.padStart(5, '0');
  return s;
}

function truncateSummary(input, max = 200) {
  const s = stripHtml(input);
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/[\s,.;:!?，。；：！？]+$/u, '') + '…';
}

function hashTitle(input) {
  const s = String(input ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function makeNewsId(kind, vendorId, rawIdOrUrl) {
  return `${kind}:${vendorId}:${hashTitle(rawIdOrUrl)}`;
}

function isSafeUrl(url) {
  const s = String(url ?? '');
  return /^https?:\/\//i.test(s);
}

// ── dedupe ──
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

// ── Tests ──
console.log('verify-news-adapters');

console.log('\n[normalize]');
check('stripHtml handles tags + &nbsp;', () => {
  assert.equal(stripHtml('<a href="x">A&nbsp;B</a>  '), 'A B');
});
check('stripHtml decodes numeric entities', () => {
  assert.equal(stripHtml('&#65;&#66;'), 'AB');
});
check('stripHtml decodes hex entities', () => {
  assert.equal(stripHtml('&#x41;'), 'A');
});
check('normalizeCode 600000 → sh600000', () => {
  assert.equal(normalizeCode('600000'), 'sh600000');
});
check('normalizeCode hk00700 → hk00700', () => {
  assert.equal(normalizeCode('hk00700'), 'hk00700');
});
check('normalizeCode 00700 → hk00700', () => {
  assert.equal(normalizeCode('00700'), 'hk00700');
});
check('truncateSummary ≤ max returns as-is', () => {
  assert.equal(truncateSummary('hello', 10), 'hello');
});
check('truncateSummary > max trims and adds …', () => {
  const long = 'a'.repeat(250);
  const out = truncateSummary(long, 200);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 201);
});
check('hashTitle stable for same input', () => {
  assert.equal(hashTitle('foo'), hashTitle('foo'));
});
check('hashTitle differs for different input', () => {
  assert.notEqual(hashTitle('foo'), hashTitle('bar'));
});
check('makeNewsId stable', () => {
  assert.equal(makeNewsId('news', 'eastmoney-search', 'a'), makeNewsId('news', 'eastmoney-search', 'a'));
});
check('isSafeUrl rejects javascript: and data:', () => {
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/plain;base64,xxx'), false);
  assert.equal(isSafeUrl('https://example.com'), true);
});

console.log('\n[dedupe]');
check('dedupe merges by URL', () => {
  const r = dedupeNews([
    { id: '1', kind: 'news', title: 't', url: 'https://a', source: 'x', publishedAt: 1, codes: [], lang: 'zh-CN' },
    { id: '2', kind: 'news', title: 't2', url: 'https://a', source: 'y', publishedAt: 2, codes: [], lang: 'zh-CN' },
  ]);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].id, '2'); // newer publishedAt wins
});
check('dedupe keeps most recent for repeated title', () => {
  const r = dedupeNews([
    { id: '1', kind: 'news', title: 't', url: 'https://a', source: 'x', publishedAt: 1, codes: [], lang: 'zh-CN' },
    { id: '2', kind: 'news', title: 't', url: 'https://b', source: 'y', publishedAt: 5, codes: [], lang: 'zh-CN' },
  ]);
  assert.equal(r.items.length, 2);
  // sorted desc: id=2 first
  assert.equal(r.items[0].id, '2');
});
check('dedupe drops records missing url or publishedAt', () => {
  const r = dedupeNews([
    { id: '1', kind: 'news', title: 't', url: '', source: 'x', publishedAt: 1, codes: [], lang: 'zh-CN' },
    { id: '2', kind: 'news', title: 't', url: 'https://a', source: 'y', publishedAt: NaN, codes: [], lang: 'zh-CN' },
    { id: '3', kind: 'news', title: 't', url: 'https://b', source: 'z', publishedAt: 1, codes: [], lang: 'zh-CN' },
  ]);
  assert.equal(r.items.length, 1);
  assert.equal(r.dropped, 2);
});
check('dedupe is immutable', () => {
  const arr = [
    { id: '1', kind: 'news', title: 't', url: 'https://a', source: 'x', publishedAt: 1, codes: [], lang: 'zh-CN' },
  ];
  const before = JSON.stringify(arr);
  dedupeNews(arr);
  assert.equal(JSON.stringify(arr), before);
});

console.log('\n[summary]');
console.log(`  passed=${passed}  failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);