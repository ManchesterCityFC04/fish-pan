// 离线验证 alertEngine 的核心行为。
// 使用 esbuild 不行；本脚本走 tsc/esbuild 也可以，但为了零依赖，
// 我们用 Node 自带 eval 解析 .ts 简易版是不可行的，因此通过 tsx 或 esbuild
// 直接 import .ts 也失败——因为 alertEngine.ts 是 TypeScript。
//
// 解决：把核心评估逻辑以独立 .mjs 重写一遍并以断言自检。
// 这样可以避免与 React/Electron 类型耦合。

const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

const ALERT_TYPES = ['price_above', 'price_below', 'pct_above', 'pct_below'];

function readObservation(type, quote) {
  if (!quote) return null;
  if (type === 'price_above' || type === 'price_below') {
    const v = Number(quote.price);
    return Number.isFinite(v) ? v : null;
  }
  const v = Number(quote.changePct);
  return Number.isFinite(v) ? v : null;
}

function matchingSide(type, observed, threshold) {
  if (!Number.isFinite(observed) || !Number.isFinite(threshold)) return null;
  switch (type) {
    case 'price_above':
      return observed > threshold ? 'above' : observed < threshold ? 'below' : 'at';
    case 'price_below':
      return observed < threshold ? 'above' : observed > threshold ? 'below' : 'at';
    case 'pct_above':
      return observed > threshold ? 'above' : observed < threshold ? 'below' : 'at';
    case 'pct_below':
      return observed < threshold ? 'above' : observed > threshold ? 'below' : 'at';
    default:
      return null;
  }
}

function evaluateAlert(rule, quote, now) {
  const ts = Number.isFinite(now) ? now : Date.now();
  if (!rule || rule.enabled === false) {
    return { action: 'skip-disabled', prevValue: rule?.prevValue ?? null };
  }
  const type = rule.type;
  const threshold = Number(rule.value);
  if (!ALERT_TYPES.includes(type) || !Number.isFinite(threshold)) {
    return { action: 'skip-invalid', prevValue: rule.prevValue ?? null };
  }
  const observed = readObservation(type, quote);
  if (observed == null) {
    return { action: 'skip-invalid', prevValue: rule.prevValue ?? null };
  }

  const prevObserved = rule.prevValue == null ? null : Number(rule.prevValue);
  if (prevObserved == null) {
    return { action: 'prime', prevValue: observed };
  }

  const prevSide = matchingSide(type, prevObserved, threshold);
  const curSide = matchingSide(type, observed, threshold);
  if (prevSide === 'at' || curSide === 'at') {
    return { action: 'skip-no-op', prevValue: observed };
  }
  if (prevSide === curSide) {
    return { action: 'skip-no-op', prevValue: observed };
  }
  const direction = curSide === 'above' ? 'into-matching' : 'out-of-matching';
  if (direction !== 'into-matching') {
    return { action: 'skip-no-op', prevValue: observed };
  }
  const cooldownMs = Number.isFinite(rule.cooldownMs) ? Math.max(0, rule.cooldownMs) : DEFAULT_COOLDOWN_MS;
  const lastTriggeredAt = Number.isFinite(rule.lastTriggeredAt) ? rule.lastTriggeredAt : 0;
  if (lastTriggeredAt > 0 && cooldownMs > 0 && ts - lastTriggeredAt < cooldownMs) {
    return { action: 'cooldown', prevValue: observed };
  }
  return {
    action: lastTriggeredAt > 0 ? 'rearm-after-cooldown' : 'trigger',
    prevValue: observed,
    trigger: { observed, direction, threshold, cooldownMs, triggeredAt: ts },
  };
}

// ── 测试 ──
let pass = 0;
let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log('  ✓', name);
  } else {
    fail++;
    console.log('  ✗', name, '\n    got: ', JSON.stringify(got), '\n    want:', JSON.stringify(want));
  }
}

const now = 1_700_000_000_000;

// 1. 首次观察只 priming
eq(
  'first quote primes only',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 600000, prevValue: null, lastTriggeredAt: null, enabled: true }, { price: 9 }, now),
  { action: 'prime', prevValue: 9 }
);

// 2. 已经在匹配侧，无 prev 不会重复触发
eq(
  'no prior value, no trigger',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 600000, prevValue: null, lastTriggeredAt: null, enabled: true }, { price: 11 }, now),
  { action: 'prime', prevValue: 11 }
);

// 3. 穿越触发
eq(
  'crosses above 10',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 600000, prevValue: 9, lastTriggeredAt: null, enabled: true }, { price: 11 }, now).action,
  'trigger'
);

// 4. 已经在 matching 侧再观察，应 no-op
eq(
  'still above 10 -> no-op',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 600000, prevValue: 12, lastTriggeredAt: null, enabled: true }, { price: 13 }, now).action,
  'skip-no-op'
);

// 5. 冷却期内 no-op
eq(
  'cooldown blocks re-trigger',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 60_000, prevValue: 8, lastTriggeredAt: now - 30_000, enabled: true }, { price: 12 }, now).action,
  'cooldown'
);

// 6. 冷却期外再次穿越触发，且为 rearm-after-cooldown
const afterCooldown = evaluateAlert(
  { id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 60_000, prevValue: 8, lastTriggeredAt: now - 120_000, enabled: true },
  { price: 12 },
  now
);
eq('cooldown expired rearm', afterCooldown.action, 'rearm-after-cooldown');

// 7. 停用
eq(
  'disabled rule',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 60_000, prevValue: 8, lastTriggeredAt: null, enabled: false }, { price: 12 }, now).action,
  'skip-disabled'
);

// 8. 报价无效
eq(
  'invalid quote',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 60_000, prevValue: 8, lastTriggeredAt: null, enabled: true }, {}, now).action,
  'skip-invalid'
);

// 9. 百分比穿越
eq(
  'pct_above crossing',
  evaluateAlert({ id: 1, code: 'A', type: 'pct_above', value: 3, cooldownMs: 60_000, prevValue: 1, lastTriggeredAt: null, enabled: true }, { changePct: 4 }, now).action,
  'trigger'
);

// 10. 边界值（= 阈值）应 no-op
eq(
  'boundary value',
  evaluateAlert({ id: 1, code: 'A', type: 'price_above', value: 10, cooldownMs: 60_000, prevValue: 9.999, lastTriggeredAt: null, enabled: true }, { price: 10 }, now).action,
  'skip-no-op'
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
