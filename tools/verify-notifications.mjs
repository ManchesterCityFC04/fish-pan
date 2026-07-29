#!/usr/bin/env node
// notification-router 离线断言：路由 + 退避 + 静默时段 + redact。
// Run: node tools/verify-notifications.mjs

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

function isInQuietHours(now, qh) {
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const nowStr = `${hh}:${mm}`;
  if (qh.start <= qh.end) return nowStr >= qh.start && nowStr <= qh.end;
  return nowStr >= qh.start || nowStr <= qh.end;
}

function redactChannelConfig(c) {
  const r = { id: c.id, kind: c.kind, enabled: c.enabled };
  if (c.bark) r.bark = { endpoint: '<redacted>', key: '<redacted>', group: c.bark.group };
  if (c.telegram) r.telegram = { botToken: '<redacted>', chatId: c.telegram.chatId };
  if (c.webhook) {
    r.webhook = { url: '<redacted>' };
    if (c.webhook.headers) {
      const redacted = {};
      for (const k of Object.keys(c.webhook.headers)) redacted[k] = '<redacted>';
      r.webhook.headers = redacted;
    }
  }
  return r;
}

function validateChannel(c) {
  if (!c.enabled) return { ok: true };
  if (c.kind === 'bark') {
    if (!c.bark?.endpoint || !c.bark?.key) return { ok: false, reason: 'bark.endpoint 与 bark.key 必填' };
    if (!/^https?:\/\//i.test(c.bark.endpoint)) return { ok: false, reason: 'bark.endpoint 必须 https/http' };
    return { ok: true };
  }
  if (c.kind === 'telegram') {
    if (!c.telegram?.botToken || !c.telegram?.chatId) return { ok: false, reason: 'telegram.botToken 与 chatId 必填' };
    return { ok: true };
  }
  if (c.kind === 'webhook') {
    if (!c.webhook?.url) return { ok: false, reason: 'webhook.url 必填' };
    if (!/^https?:\/\//i.test(c.webhook.url)) return { ok: false, reason: 'webhook.url 必须 https/http' };
    return { ok: true };
  }
  return { ok: true };
}

function nextBackoffMs(failureCount) {
  if (failureCount <= 0) return 0;
  const backoffs = [30000, 60000, 120000, 300000];
  if (failureCount >= 5) return 30 * 60 * 1000;
  return backoffs[Math.min(failureCount - 1, backoffs.length - 1)];
}

console.log('verify-notifications');

console.log('\n[quiet hours]');
check('inside quiet hours is detected', () => {
  const now = new Date('2026-01-01T10:00:00').getTime();
  assert.equal(isInQuietHours(now, { start: '09:30', end: '11:30', behavior: 'log-only' }), true);
});
check('outside quiet hours is detected', () => {
  const now = new Date('2026-01-01T20:00:00').getTime();
  assert.equal(isInQuietHours(now, { start: '09:30', end: '11:30', behavior: 'log-only' }), false);
});
check('cross-midnight quiet hours is detected', () => {
  const now = new Date('2026-01-01T23:30:00').getTime();
  assert.equal(isInQuietHours(now, { start: '22:00', end: '07:00', behavior: 'defer' }), true);
});

console.log('\n[redact]');
check('redact strips telegram botToken', () => {
  const r = redactChannelConfig({ id: 'tg', kind: 'telegram', enabled: true, telegram: { botToken: 'SECRET', chatId: '123' } });
  assert.equal(r.telegram.botToken, '<redacted>');
  assert.equal(r.telegram.chatId, '123');
});
check('redact strips webhook url and headers', () => {
  const r = redactChannelConfig({ id: 'wh', kind: 'webhook', enabled: true, webhook: { url: 'https://x', headers: { 'X-Token': 'SECRET' } } });
  assert.equal(r.webhook.url, '<redacted>');
  assert.equal(r.webhook.headers['X-Token'], '<redacted>');
});
check('redact preserves non-sensitive fields', () => {
  const r = redactChannelConfig({ id: 'b', kind: 'bark', enabled: true, bark: { endpoint: 'https://x', key: 'SECRET', group: 'fish' } });
  assert.equal(r.bark.group, 'fish');
});

console.log('\n[validate]');
check('bark rejects javascript: scheme', () => {
  const r = validateChannel({ id: 'b', kind: 'bark', enabled: true, bark: { endpoint: 'javascript:alert(1)', key: 'k' } });
  assert.equal(r.ok, false);
});
check('telegram requires botToken', () => {
  const r = validateChannel({ id: 't', kind: 'telegram', enabled: true, telegram: { botToken: '', chatId: 'x' } });
  assert.equal(r.ok, false);
});

console.log('\n[backoff]');
check('first failure uses 30s', () => {
  assert.equal(nextBackoffMs(1), 30000);
});
check('fifth failure pauses 30m', () => {
  assert.equal(nextBackoffMs(5), 30 * 60 * 1000);
});

console.log('\n[summary]');
console.log(`  passed=${passed}  failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);