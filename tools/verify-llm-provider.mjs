#!/usr/bin/env node
// llm-provider-integration 离线断言：validate / redact / cancel / timeout。
// Run: node tools/verify-llm-provider.mjs

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

function validateConfig(c) {
  if (!c.baseUrl) return { ok: false, reason: 'baseUrl 必填' };
  if (!/^https?:\/\//i.test(c.baseUrl)) return { ok: false, reason: 'baseUrl 必须 https/http' };
  if (!c.model) return { ok: false, reason: 'model 必填' };
  if (typeof c.temperature !== 'number' || c.temperature < 0 || c.temperature > 2) return { ok: false, reason: 'temperature 必须在 0..2 之间' };
  if (typeof c.timeoutMs !== 'number' || c.timeoutMs < 1000) return { ok: false, reason: 'timeoutMs 必须 ≥ 1000' };
  return { ok: true };
}

function redactConfig(c) {
  return { ...c, apiKey: c.apiKey ? '<redacted>' : null };
}

async function callOpenAIChat(config, messages, signal, fetchImpl) {
  const v = validateConfig(config);
  if (!v.ok) return { ok: false, text: '', error: v.reason };
  const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
  const combined = AbortSignal.any([signal, timeoutSignal]);
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  const body = JSON.stringify({ model: config.model, messages, temperature: config.temperature, stream: false });
  try {
    const resp = await fetchImpl(url, { method: 'POST', headers, body, signal: combined });
    if (!resp.ok) return { ok: false, text: '', error: `HTTP ${resp.status}` };
    const json = await resp.json();
    return { ok: true, text: String(json?.choices?.[0]?.message?.content ?? '') };
  } catch (e) {
    if (e?.name === 'AbortError' || combined.aborted) {
      return { ok: false, text: '', error: combined.reason === 'timeout' ? 'timeout' : 'aborted' };
    }
    return { ok: false, text: '', error: e?.message ?? String(e) };
  }
}

console.log('verify-llm-provider');

console.log('\n[validate]');
check('rejects javascript: scheme', () => {
  const r = validateConfig({ baseUrl: 'javascript:alert(1)', model: 'gpt', temperature: 0.5, timeoutMs: 5000 });
  assert.equal(r.ok, false);
});
check('rejects empty baseUrl', () => {
  const r = validateConfig({ baseUrl: '', model: 'gpt', temperature: 0.5, timeoutMs: 5000 });
  assert.equal(r.ok, false);
});
check('accepts valid config', () => {
  const r = validateConfig({ baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini', temperature: 0.5, timeoutMs: 20000 });
  assert.equal(r.ok, true);
});
check('rejects temperature out of range', () => {
  const r = validateConfig({ baseUrl: 'https://api.openai.com', model: 'gpt', temperature: 5, timeoutMs: 20000 });
  assert.equal(r.ok, false);
});

console.log('\n[redact]');
check('apiKey replaced with <redacted>', () => {
  const r = redactConfig({ baseUrl: 'x', model: 'm', apiKey: 'sk-secret', temperature: 0, timeoutMs: 1000 });
  assert.equal(r.apiKey, '<redacted>');
});
check('null apiKey stays null', () => {
  const r = redactConfig({ baseUrl: 'x', model: 'm', apiKey: null, temperature: 0, timeoutMs: 1000 });
  assert.equal(r.apiKey, null);
});

console.log('\n[cancel & timeout]');
check('abort signal returns aborted error', async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await callOpenAIChat(
    { baseUrl: 'https://x', model: 'm', apiKey: null, temperature: 0, timeoutMs: 5000 },
    [{ role: 'user', content: 'hi' }],
    controller.signal,
    async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); },
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'aborted');
});
check('timeout returns timeout error', async () => {
  const controller = new AbortController();
  const r = await callOpenAIChat(
    { baseUrl: 'https://x', model: 'm', apiKey: null, temperature: 0, timeoutMs: 5 },
    [{ role: 'user', content: 'hi' }],
    controller.signal,
    async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); },
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'timeout');
});
check('successful fetch returns text', async () => {
  const controller = new AbortController();
  const r = await callOpenAIChat(
    { baseUrl: 'https://x', model: 'm', apiKey: null, temperature: 0, timeoutMs: 5000 },
    [{ role: 'user', content: 'hi' }],
    controller.signal,
    async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.text, 'hello');
});

console.log('\n[summary]');
console.log(`  passed=${passed}  failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);