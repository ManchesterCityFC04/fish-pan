// 离线验证 bundle 模块。复制 src/bundle.ts 的核心公式。

const BUNDLE_VERSION = 1;
const BUNDLE_KIND = 'fish-pan:settings-bundle';

const emptyBundle = () => ({
  watchlist: [],
  alerts: [],
  alertEvents: [],
  aiAnalyses: [],
  llmConfig: { baseUrl: null, model: null, proxyUrl: null },
});

const isFiniteNumberOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

function validateBundle(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '顶层不是对象' };
  const obj = raw;
  if (obj.kind !== BUNDLE_KIND) return { ok: false, error: `kind 字段不正确` };
  if (!Number.isFinite(obj.version)) return { ok: false, error: 'version 必须为数字' };
  if (obj.version > BUNDLE_VERSION) return { ok: false, error: `version ${obj.version} 过高` };
  if (!Array.isArray(obj.watchlist)) return { ok: false, error: 'watchlist 必须为数组' };
  if (!Array.isArray(obj.alerts)) return { ok: false, error: 'alerts 必须为数组' };
  if (!Array.isArray(obj.alertEvents)) return { ok: false, error: 'alertEvents 必须为数组' };
  if (!Array.isArray(obj.aiAnalyses)) return { ok: false, error: 'aiAnalyses 必须为数组' };
  for (const [i, w] of obj.watchlist.entries()) {
    if (!w || typeof w !== 'object') return { ok: false, error: `watchlist[${i}] 不是对象` };
    if (typeof w.code !== 'string' || !w.code) return { ok: false, error: `watchlist[${i}].code 缺失` };
    if (typeof w.name !== 'string') return { ok: false, error: `watchlist[${i}].name 不是字符串` };
  }
  for (const [i, a] of obj.alerts.entries()) {
    if (!a || typeof a !== 'object') return { ok: false, error: `alerts[${i}] 不是对象` };
    if (typeof a.code !== 'string' || !a.code) return { ok: false, error: `alerts[${i}].code 缺失` };
    if (typeof a.type !== 'string' || !a.type) return { ok: false, error: `alerts[${i}].type 缺失` };
    if (!Number.isFinite(a.value)) return { ok: false, error: `alerts[${i}].value 不是数字` };
    if (typeof a.enabled !== 'boolean') return { ok: false, error: `alerts[${i}].enabled 不是布尔` };
    if (typeof a.triggered !== 'boolean') return { ok: false, error: `alerts[${i}].triggered 不是布尔` };
  }
  const merged = {
    kind: BUNDLE_KIND,
    version: obj.version,
    exportedAt: Number.isFinite(obj.exportedAt) ? obj.exportedAt : Date.now(),
    watchlist: obj.watchlist.map((w) => ({
      code: String(w.code),
      name: String(w.name),
      sortOrder: Number.isFinite(w.sortOrder) ? Number(w.sortOrder) : 0,
    })),
    alerts: obj.alerts.map((a) => ({
      id: Number(a.id) || 0,
      code: String(a.code),
      type: String(a.type),
      value: Number(a.value),
      enabled: a.enabled !== false,
      triggered: a.triggered === true,
      cooldownMs: Number.isFinite(a.cooldownMs) ? Number(a.cooldownMs) : 600000,
      prevValue: isFiniteNumberOrNull(a.prevValue) ? a.prevValue : null,
      lastTriggeredAt: isFiniteNumberOrNull(a.lastTriggeredAt) ? a.lastTriggeredAt : null,
    })),
    alertEvents: obj.alertEvents.map((e) => ({
      id: Number(e.id) || 0,
      alertId: isFiniteNumberOrNull(e.alertId) ? e.alertId : null,
      code: String(e.code),
      type: String(e.type),
      threshold: Number(e.threshold) || 0,
      observed: Number(e.observed) || 0,
      direction: String(e.direction || 'unknown'),
      cooldownMs: Number(e.cooldownMs) || 0,
      triggeredAt: Number(e.triggeredAt) || 0,
      notificationStatus: String(e.notificationStatus || 'sent'),
    })),
    aiAnalyses: (obj.aiAnalyses || []).map((a) => ({
      id: Number(a.id) || 0,
      kind: String(a.kind),
      code: String(a.code),
      model: String(a.model),
      createdAt: Number(a.createdAt) || 0,
      promptId: String(a.promptId || ''),
      inputSummary: String(a.inputSummary || ''),
      responseJson: typeof a.responseJson === 'string' ? a.responseJson : JSON.stringify(a.responseJson || {}),
      rating: isFiniteNumberOrNull(a.rating) ? a.rating : null,
    })),
    llmConfig: obj.llmConfig
      ? {
          baseUrl: typeof obj.llmConfig.baseUrl === 'string' ? obj.llmConfig.baseUrl : null,
          model: typeof obj.llmConfig.model === 'string' ? obj.llmConfig.model : null,
          proxyUrl: typeof obj.llmConfig.proxyUrl === 'string' ? obj.llmConfig.proxyUrl : null,
        }
      : { baseUrl: null, model: null, proxyUrl: null },
  };
  return { ok: true, value: merged };
}

// redactSecrets 在 src/bundle.ts 中已移除（脱敏由主进程完成）；这里同样删掉。

function buildBundle(input) {
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: Date.now(),
    watchlist: input.watchlist.map((w) => ({ code: w.code, name: w.name, sortOrder: w.sortOrder ?? 0 })),
    alerts: input.alerts.map((a) => ({
      id: a.id ?? 0, code: a.code, type: a.type, value: a.value,
      enabled: a.enabled !== false, triggered: a.triggered === true,
      cooldownMs: Number.isFinite(a.cooldownMs) ? a.cooldownMs : 600000,
      prevValue: a.prevValue == null ? null : a.prevValue,
      lastTriggeredAt: a.lastTriggeredAt == null ? null : a.lastTriggeredAt,
    })),
    alertEvents: input.alertEvents.map((e) => ({
      id: e.id, alertId: e.alertId, code: e.code, type: e.type,
      threshold: e.threshold, observed: e.observed, direction: e.direction,
      cooldownMs: e.cooldownMs, triggeredAt: e.triggeredAt, notificationStatus: e.notificationStatus,
    })),
    aiAnalyses: input.aiAnalyses.map((a) => ({
      id: a.id, kind: a.kind, code: a.code, model: a.model,
      createdAt: a.createdAt, promptId: a.promptId, inputSummary: a.inputSummary,
      responseJson: a.responseJson, rating: a.rating,
    })),
    llmConfig: { ...input.llmConfig },
  };
}

function diffBundle(current, incoming) {
  return {
    watchlist: { incoming: incoming.watchlist.length },
    alerts: { incoming: incoming.alerts.length },
    alertEvents: { incoming: incoming.alertEvents.length },
    aiAnalyses: { incoming: incoming.aiAnalyses.length },
  };
}

// ── 断言 ──
let pass = 0, fail = 0;
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

// 1. 基本 bundle 构建
const built = buildBundle({
  watchlist: [{ code: '600000', name: '浦发', sortOrder: 0 }],
  alerts: [{
    id: 1, code: '600000', type: 'price_above', value: 11,
    enabled: true, triggered: false, prevValue: null,
    cooldownMs: 600000, lastTriggeredAt: null,
  }],
  alertEvents: [{
    id: 1, alertId: 1, code: '600000', type: 'price_above',
    threshold: 11, observed: 11.2, direction: 'into-matching',
    cooldownMs: 600000, triggeredAt: 1700000000000, notificationStatus: 'sent',
  }],
  aiAnalyses: [{
    id: 1, kind: 'news', code: '600000', model: 'gpt-4',
    createdAt: 1700000000000, promptId: 'news-v1',
    inputSummary: '业绩超预期', responseJson: '{"summary":"OK"}', rating: null,
  }],
  llmConfig: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4', proxyUrl: 'http://user:pass@proxy' },
});
eq('build: kind', built.kind, BUNDLE_KIND);
eq('build: version', built.version, 1);
eq('build: watchlist count', built.watchlist.length, 1);
eq('build: alerts count', built.alerts.length, 1);
eq('build: alertEvents count', built.alertEvents.length, 1);
eq('build: aiAnalyses count', built.aiAnalyses.length, 1);

// 2. 校验通过
const v1 = validateBundle(built);
eq('validate ok', v1.ok, true);
eq('validate watchlist', v1.ok && v1.value.watchlist[0].code, '600000');

// 3. 脱敏：现在由 Electron 主进程按 includeSecrets 完成；这里只验证 build 出来的
//    proxyUrl 字段保留了原文（主进程会再脱敏）。
eq('build keeps proxyUrl until main process redacts', built.llmConfig.proxyUrl, 'http://user:pass@proxy');

// 4. 非法 kind
const v2 = validateBundle({ ...built, kind: 'wrong' });
eq('validate wrong kind', v2.ok, false);

// 5. 未来版本
const v3 = validateBundle({ ...built, version: 99 });
eq('validate future version', v3.ok, false);

// 6. 缺字段补全
const v4 = validateBundle({
  kind: BUNDLE_KIND,
  version: 1,
  exportedAt: 1,
  watchlist: [{ code: 'A', name: 'a' }],
  alerts: [],
  alertEvents: [],
  aiAnalyses: [],
  llmConfig: { baseUrl: 'x', model: 'gpt-4' },
});
eq('validate fill defaults proxyUrl', v4.ok && v4.value.llmConfig.proxyUrl, null);

// 8. 非法 alerts
const v5 = validateBundle({
  ...built,
  alerts: [{ code: 'A' }], // 缺 type/value
});
eq('validate invalid alert', v5.ok, false);

// 8. 差异
const cur = buildBundle({ watchlist: [], alerts: [], alertEvents: [], aiAnalyses: [], llmConfig: { baseUrl: null, model: null, proxyUrl: null } });
const diff = diffBundle(cur, built);
eq('diff watchlist', diff.watchlist.incoming, 1);
eq('diff alerts', diff.alerts.incoming, 1);
eq('diff alertEvents', diff.alertEvents.incoming, 1);
eq('diff aiAnalyses', diff.aiAnalyses.incoming, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
