// 纯函数：设置导入导出 bundle 的序列化、反序列化、版本迁移、密钥脱敏。
// 零 React/Electron 依赖，便于 Node 自检。

import type { Alert, AlertEvent, AIAnalysis } from './types';

export const BUNDLE_VERSION = 2;
export const BUNDLE_KIND = 'fish-pan:settings-bundle';

export interface BundleAlert {
  id: number;
  code: string;
  type: string;
  value: number;
  enabled: boolean;
  triggered: boolean;
  cooldownMs: number;
  prevValue: number | null;
  lastTriggeredAt: number | null;
}

export interface BundleAlertEvent {
  id: number;
  alertId: number | null;
  code: string;
  type: string;
  threshold: number;
  observed: number;
  direction: string;
  cooldownMs: number;
  triggeredAt: number;
  notificationStatus: string;
}

export interface BundleAIAnalysis {
  id: number;
  kind: string;
  code: string;
  model: string;
  createdAt: number;
  promptId: string;
  inputSummary: string;
  responseJson: string;
  rating: number | null;
}

export interface BundleLLMConfig {
  // 全部为非秘密字段；API key 等敏感字段不进入 bundle。
  baseUrl: string | null;
  model: string | null;
  proxyUrl: string | null;
}

// indicators 字段保留在 schema 中以保证向后兼容，但不写入/读取 —— 真实可见性存在
// localStorage（按设计文档）。
export interface BundleIndicator {
  ma: boolean;
  boll: boolean;
  macd: boolean;
  rsi: boolean;
  kdj: boolean;
}

export interface BundleAccount {
  id: number;
  name: string;
  baseCurrency: string;
  createdAt: number;
}

export interface BundlePosition {
  id: number;
  accountId: number;
  code: string;
  shares: number;
  costPrice: number;
  openedAt: number;
  notes: string | null;
}

export interface Bundle {
  kind: string;
  version: number;
  exportedAt: number;
  watchlist: { code: string; name: string; sortOrder: number }[];
  alerts: BundleAlert[];
  alertEvents: BundleAlertEvent[];
  aiAnalyses: BundleAIAnalysis[];
  llmConfig: BundleLLMConfig;
  // v2: 账户与持仓
  accounts?: BundleAccount[];
  positions?: BundlePosition[];
  // 占位：旧版 bundle 可能带这一字段；新版永不写入。
  indicators?: BundleIndicator;
}

const emptyBundle = (): Omit<Bundle, 'kind' | 'version' | 'exportedAt' | 'indicators'> => ({
  watchlist: [],
  alerts: [],
  alertEvents: [],
  aiAnalyses: [],
  llmConfig: { baseUrl: null, model: null, proxyUrl: null },
  accounts: [],
  positions: [],
});

// ── 校验 ──
export interface ValidateOk { ok: true; value: Bundle }
export interface ValidateErr { ok: false; error: string }
export type ValidateResult = ValidateOk | ValidateErr;

function isFiniteNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

export function validateBundle(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '顶层不是对象' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== BUNDLE_KIND) {
    return { ok: false, error: `kind 字段不正确（应为 ${BUNDLE_KIND}）` };
  }
  if (!Number.isFinite(obj.version)) {
    return { ok: false, error: 'version 必须为数字' };
  }
  if ((obj.version as number) > BUNDLE_VERSION) {
    return { ok: false, error: `version ${obj.version} 高于当前支持的 ${BUNDLE_VERSION}` };
  }
  if (!Array.isArray(obj.watchlist)) return { ok: false, error: 'watchlist 必须为数组' };
  if (!Array.isArray(obj.alerts)) return { ok: false, error: 'alerts 必须为数组' };
  if (!Array.isArray(obj.alertEvents)) return { ok: false, error: 'alertEvents 必须为数组' };
  if (!Array.isArray(obj.aiAnalyses)) return { ok: false, error: 'aiAnalyses 必须为数组' };

  for (const [i, w] of (obj.watchlist as unknown[]).entries()) {
    if (!w || typeof w !== 'object') return { ok: false, error: `watchlist[${i}] 不是对象` };
    const ww = w as Record<string, unknown>;
    if (typeof ww.code !== 'string' || !ww.code) return { ok: false, error: `watchlist[${i}].code 缺失` };
    if (typeof ww.name !== 'string') return { ok: false, error: `watchlist[${i}].name 不是字符串` };
  }

  for (const [i, a] of (obj.alerts as unknown[]).entries()) {
    if (!a || typeof a !== 'object') return { ok: false, error: `alerts[${i}] 不是对象` };
    const aa = a as Record<string, unknown>;
    if (typeof aa.code !== 'string' || !aa.code) return { ok: false, error: `alerts[${i}].code 缺失` };
    if (typeof aa.type !== 'string' || !aa.type) return { ok: false, error: `alerts[${i}].type 缺失` };
    if (!Number.isFinite(aa.value)) return { ok: false, error: `alerts[${i}].value 不是数字` };
    if (typeof aa.enabled !== 'boolean') return { ok: false, error: `alerts[${i}].enabled 不是布尔` };
    if (typeof aa.triggered !== 'boolean') return { ok: false, error: `alerts[${i}].triggered 不是布尔` };
  }

  if (obj.llmConfig && typeof obj.llmConfig !== 'object') {
    return { ok: false, error: 'llmConfig 不是对象' };
  }

  if (obj.indicators !== undefined && (typeof obj.indicators !== 'object' || obj.indicators === null)) {
    return { ok: false, error: 'indicators 不是对象' };
  }

  // 补全默认值（向前兼容）
  const merged: Bundle = {
    kind: BUNDLE_KIND,
    version: obj.version as number,
    exportedAt: Number.isFinite(obj.exportedAt as number) ? (obj.exportedAt as number) : Date.now(),
    watchlist: (obj.watchlist as Bundle['watchlist']).map((w) => ({
      code: String(w.code),
      name: String(w.name),
      sortOrder: Number.isFinite(w.sortOrder as number) ? Number(w.sortOrder) : 0,
    })),
    alerts: (obj.alerts as BundleAlert[]).map((a) => ({
      id: Number(a.id) || 0,
      code: String(a.code),
      type: String(a.type),
      value: Number(a.value),
      enabled: a.enabled !== false,
      triggered: a.triggered === true,
      cooldownMs: Number.isFinite(a.cooldownMs as number) ? Number(a.cooldownMs) : 600000,
      prevValue: isFiniteNumberOrNull(a.prevValue) ? a.prevValue : null,
      lastTriggeredAt: isFiniteNumberOrNull(a.lastTriggeredAt) ? a.lastTriggeredAt : null,
    })),
    alertEvents: (obj.alertEvents as BundleAlertEvent[]).map((e) => ({
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
    aiAnalyses: (obj.aiAnalyses as BundleAIAnalysis[]).map((a) => ({
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
    llmConfig: {
      baseUrl: (obj.llmConfig && typeof (obj.llmConfig as { baseUrl?: unknown }).baseUrl === 'string')
        ? String((obj.llmConfig as { baseUrl: string }).baseUrl)
        : null,
      model: (obj.llmConfig && typeof (obj.llmConfig as { model?: unknown }).model === 'string')
        ? String((obj.llmConfig as { model: string }).model)
        : null,
      proxyUrl: (obj.llmConfig && typeof (obj.llmConfig as { proxyUrl?: unknown }).proxyUrl === 'string')
        ? String((obj.llmConfig as { proxyUrl: string }).proxyUrl)
        : null,
    },
  };

  return { ok: true, value: merged };
}

// 注：秘密脱敏（proxyUrl → '<redacted>'）由 Electron 主进程在 db-export-bundle 内
// 按 includeSecrets 参数完成；这里不重复实现，避免两个真值源。

// ── 构建器（从当前状态打包） ──
export interface BuildInput {
  watchlist: { code: string; name: string; sortOrder?: number }[];
  alerts: Alert[];
  alertEvents: AlertEvent[];
  aiAnalyses: AIAnalysis[];
  llmConfig: BundleLLMConfig;
}

export function buildBundle(input: BuildInput): Bundle {
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: Date.now(),
    watchlist: input.watchlist.map((w) => ({
      code: w.code,
      name: w.name,
      sortOrder: w.sortOrder ?? 0,
    })),
    alerts: input.alerts.map((a) => ({
      id: a.id ?? 0,
      code: a.code,
      type: a.type,
      value: a.value,
      enabled: a.enabled !== false,
      triggered: a.triggered === true,
      cooldownMs: Number.isFinite(a.cooldownMs) ? a.cooldownMs : 600000,
      prevValue: a.prevValue == null ? null : a.prevValue,
      lastTriggeredAt: a.lastTriggeredAt == null ? null : a.lastTriggeredAt,
    })),
    alertEvents: input.alertEvents.map((e) => ({
      id: e.id,
      alertId: e.alertId,
      code: e.code,
      type: e.type,
      threshold: e.threshold,
      observed: e.observed,
      direction: e.direction,
      cooldownMs: e.cooldownMs,
      triggeredAt: e.triggeredAt,
      notificationStatus: e.notificationStatus,
    })),
    aiAnalyses: input.aiAnalyses.map((a) => ({
      id: a.id,
      kind: a.kind,
      code: a.code,
      model: a.model,
      createdAt: a.createdAt,
      promptId: a.promptId,
      inputSummary: a.inputSummary,
      responseJson: a.responseJson,
      rating: a.rating,
    })),
    llmConfig: { ...input.llmConfig },
  };
}

// ── 差异（导入预览） ──
export interface DiffStats {
  watchlist: { incoming: number };
  alerts: { incoming: number };
  alertEvents: { incoming: number };
  aiAnalyses: { incoming: number };
}

export function diffBundle(current: Bundle, incoming: Bundle): DiffStats {
  return {
    watchlist: { incoming: incoming.watchlist.length },
    alerts: { incoming: incoming.alerts.length },
    alertEvents: { incoming: incoming.alertEvents.length },
    aiAnalyses: { incoming: incoming.aiAnalyses.length },
  };
}
