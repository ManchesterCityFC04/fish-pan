#!/usr/bin/env node
// advanced-alert-rules 离线断言：DSL 组合 + 生命周期。
// Run: node tools/verify-alert-dsl.mjs

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

function readAtom(kind, quote) {
  if (!quote) return null;
  if (kind === 'price') return Number.isFinite(quote.price) ? quote.price : null;
  if (kind === 'change_pct') return Number.isFinite(quote.changePct) ? quote.changePct : null;
  if (kind === 'volume') return Number.isFinite(quote.volume) ? quote.volume : null;
  if (kind === 'volume_ratio') return null;
  if (kind === 'turnover') return Number.isFinite(quote.volume) ? quote.volume : null;
  return null;
}

function compareAtom(op, obs, threshold) {
  if (op === 'between' && Array.isArray(threshold) && threshold.length === 2) {
    return obs >= threshold[0] && obs <= threshold[1];
  }
  const t = Number(threshold);
  switch (op) {
    case '>': return obs > t;
    case '>=': return obs >= t;
    case '<': return obs < t;
    case '<=': return obs <= t;
    case '==': return obs === t;
    case '!=': return obs !== t;
    default: return false;
  }
}

function evaluateRuleV2(rule, quote, now) {
  if (rule.lifecycle.expiresAt != null && now > rule.lifecycle.expiresAt) {
    return { status: 'skip', missingFields: [], signature: '' };
  }
  if (rule.lifecycle.sessionWindow) {
    const d = new Date(now);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const nowStr = `${hh}:${mm}`;
    if (nowStr < rule.lifecycle.sessionWindow.start || nowStr > rule.lifecycle.sessionWindow.end) {
      return { status: 'skip', missingFields: [], signature: '' };
    }
  }
  const missingFields = [];
  const condResults = [];
  for (const c of rule.conditions) {
    const obs = readAtom(c.kind, quote);
    if (obs == null) {
      missingFields.push(c.kind);
      condResults.push(false);
      continue;
    }
    condResults.push(compareAtom(c.op, obs, c.threshold));
  }
  if (missingFields.length === rule.conditions.length) {
    return { status: 'unknown', missingFields, signature: '' };
  }
  const hit = rule.combine === 'AND' ? condResults.every(Boolean) : condResults.some(Boolean);
  const condSig = rule.conditions.map((c) => `${c.kind}${c.op}${Array.isArray(c.threshold) ? c.threshold.join('-') : c.threshold}`).join('|');
  const signature = `${rule.combine}:${condSig}:${hit ? 'hit' : 'no'}`;
  if (missingFields.length > 0) return { status: 'unknown', missingFields, signature };
  return { status: hit ? 'hit' : 'prime', missingFields, signature };
}

const baseRule = {
  id: 1,
  code: 'sh600000',
  combine: 'AND',
  lifecycle: {
    enabled: true, expiresAt: null, sessionWindow: null,
    dailyCap: null, repeatMode: 'repeat', cooldownMs: 600000,
  },
  prevValue: null,
};

console.log('verify-alert-dsl');

console.log('\n[combine]');
check('AND hit only when all conditions hold', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    conditions: [
      { kind: 'price', op: '>', threshold: 10 },
      { kind: 'change_pct', op: '>', threshold: 1 },
    ],
  }, { price: 11, changePct: 2 }, 1);
  assert.equal(r.status, 'hit');
});
check('AND not hit when one condition fails', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    conditions: [
      { kind: 'price', op: '>', threshold: 10 },
      { kind: 'change_pct', op: '>', threshold: 5 },
    ],
  }, { price: 11, changePct: 2 }, 1);
  assert.equal(r.status, 'prime');
});
check('OR hit when any condition holds', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    combine: 'OR',
    conditions: [
      { kind: 'price', op: '>', threshold: 100 },
      { kind: 'change_pct', op: '>', threshold: 1 },
    ],
  }, { price: 1, changePct: 5 }, 1);
  assert.equal(r.status, 'hit');
});

console.log('\n[operators & bounds]');
check('between op respects both bounds', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    conditions: [{ kind: 'price', op: 'between', threshold: [10, 20] }],
  }, { price: 15 }, 1);
  assert.equal(r.status, 'hit');
});
check('between op rejects outside range', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    conditions: [{ kind: 'price', op: 'between', threshold: [10, 20] }],
  }, { price: 25 }, 1);
  assert.equal(r.status, 'prime');
});

console.log('\n[lifecycle]');
check('expiresAt in the past returns skip', () => {
  const r = evaluateRuleV2({ ...baseRule, lifecycle: { ...baseRule.lifecycle, expiresAt: 100 } }, { price: 11 }, 200);
  assert.equal(r.status, 'skip');
});
check('sessionWindow outside returns skip', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    lifecycle: { ...baseRule.lifecycle, sessionWindow: { start: '09:30', end: '11:30' } },
  }, { price: 11 }, new Date('2026-01-01T20:00:00').getTime());
  assert.equal(r.status, 'skip');
});
check('sessionWindow inside allows evaluation', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    conditions: [{ kind: 'price', op: '>', threshold: 10 }],
    lifecycle: { ...baseRule.lifecycle, sessionWindow: { start: '09:30', end: '11:30' } },
  }, { price: 11 }, new Date('2026-01-01T10:00:00').getTime());
  assert.equal(r.status, 'hit');
});

console.log('\n[missing fields]');
check('missing field returns unknown status', () => {
  const r = evaluateRuleV2({
    ...baseRule,
    conditions: [{ kind: 'volume_ratio', op: '>', threshold: 3 }],
  }, { price: 11 }, 1);
  assert.equal(r.status, 'unknown');
  assert.ok(r.missingFields.includes('volume_ratio'));
});

console.log('\n[signature stability]');
check('signature stable across calls', () => {
  const rule = {
    ...baseRule,
    conditions: [{ kind: 'price', op: '>', threshold: 10 }],
  };
  const r1 = evaluateRuleV2(rule, { price: 11 }, 1);
  const r2 = evaluateRuleV2(rule, { price: 12 }, 1);
  assert.equal(r1.signature, r2.signature);
});

console.log('\n[summary]');
console.log(`  passed=${passed}  failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);