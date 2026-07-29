import type { Alert, AlertType, StockQuote, AlertEvent } from './types';

// ── DSL 扩展（advanced-alert-rules）──
export type AlertAtomKind = 'price' | 'change_pct' | 'turnover' | 'volume' | 'volume_ratio';
export type AlertOp = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between';
export type CombineMode = 'AND' | 'OR';
export type RepeatMode = 'single' | 'repeat';

export interface AlertCondition {
  kind: AlertAtomKind;
  op: AlertOp;
  threshold: number | [number, number];
}

export interface AlertSessionWindow {
  start: string; // 'HH:mm'
  end: string;
}

export interface AlertLifecycle {
  enabled: boolean;
  expiresAt: number | null;
  sessionWindow: AlertSessionWindow | null;
  dailyCap: number | null;
  repeatMode: RepeatMode;
  cooldownMs: number;
}

export interface AlertRuleV2 {
  id?: number;
  code: string;
  conditions: AlertCondition[];
  combine: CombineMode;
  lifecycle: AlertLifecycle;
  prevValue: number | null;
}

function readAtom(kind: AlertAtomKind, quote: StockQuote | null | undefined): number | null {
  if (!quote) return null;
  switch (kind) {
    case 'price':
      return Number.isFinite(quote.price) ? quote.price : null;
    case 'change_pct':
      return Number.isFinite(quote.changePct) ? quote.changePct : null;
    case 'turnover':
      return Number.isFinite(quote.volume) ? quote.volume : null;
    case 'volume':
      return Number.isFinite(quote.volume) ? quote.volume : null;
    case 'volume_ratio':
      return null; // 行情源未提供；返回 null 让评估器走 unknown 分支
    default:
      return null;
  }
}

function compareAtom(op: AlertOp, observed: number, threshold: number | [number, number]): boolean {
  if (op === 'between' && Array.isArray(threshold) && threshold.length === 2) {
    const [lo, hi] = threshold;
    return observed >= lo && observed <= hi;
  }
  const t = Number(threshold);
  if (!Number.isFinite(t)) return false;
  switch (op) {
    case '>': return observed > t;
    case '>=': return observed >= t;
    case '<': return observed < t;
    case '<=': return observed <= t;
    case '==': return observed === t;
    case '!=': return observed !== t;
    default: return false;
  }
}

export interface AlertEvaluateResult {
  status: 'hit' | 'prime' | 'unknown' | 'skip';
  missingFields: string[];
  signature: string;
}

export function evaluateRuleV2(
  rule: AlertRuleV2,
  quote: StockQuote | null | undefined,
  now: number,
): AlertEvaluateResult {
  // expiresAt 校验
  if (rule.lifecycle.expiresAt != null && now > rule.lifecycle.expiresAt) {
    return { status: 'skip', missingFields: [], signature: '' };
  }
  // sessionWindow 校验（按北京时间窗口）
  if (rule.lifecycle.sessionWindow) {
    const d = new Date(now);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const nowStr = `${hh}:${mm}`;
    const { start, end } = rule.lifecycle.sessionWindow;
    if (nowStr < start || nowStr > end) {
      return { status: 'skip', missingFields: [], signature: '' };
    }
  }
  const missingFields: string[] = [];
  const condResults: boolean[] = [];
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
  const hit = rule.combine === 'AND'
    ? condResults.every(Boolean)
    : condResults.some(Boolean);
  // signature 稳定：combine + 条件签名 + 命中侧
  const condSig = rule.conditions.map((c) => `${c.kind}${c.op}${Array.isArray(c.threshold) ? c.threshold.join('-') : c.threshold}`).join('|');
  const signature = `${rule.combine}:${condSig}:${hit ? 'hit' : 'no'}`;
  if (missingFields.length > 0) {
    return { status: 'unknown', missingFields, signature };
  }
  if (!hit) {
    return { status: 'prime', missingFields, signature };
  }
  return { status: 'hit', missingFields, signature };
}

/** 把旧 4 类单条件规则映射为 DSL 单条件。 */
export function migrateLegacyAlert(a: Alert): AlertRuleV2 {
  let kind: AlertAtomKind = 'price';
  let op: AlertOp = '>';
  if (a.type === 'price_above') { kind = 'price'; op = '>'; }
  else if (a.type === 'price_below') { kind = 'price'; op = '<'; }
  else if (a.type === 'pct_above') { kind = 'change_pct'; op = '>'; }
  else if (a.type === 'pct_below') { kind = 'change_pct'; op = '<'; }
  return {
    id: a.id,
    code: a.code,
    conditions: [{ kind, op, threshold: a.value }],
    combine: 'AND',
    lifecycle: {
      enabled: a.enabled !== false,
      expiresAt: null,
      sessionWindow: null,
      dailyCap: null,
      repeatMode: 'repeat',
      cooldownMs: a.cooldownMs || DEFAULT_COOLDOWN_MS,
    },
    prevValue: a.prevValue,
  };
}

export const DEFAULT_COOLDOWN_MS: number = 10 * 60 * 1000; // 10 分钟

const PRICE_ABOVE: AlertType = 'price_above';
const PRICE_BELOW: AlertType = 'price_below';
const PCT_ABOVE: AlertType = 'pct_above';
const PCT_BELOW: AlertType = 'pct_below';

export const ALERT_TYPES: AlertType[] = [PRICE_ABOVE, PRICE_BELOW, PCT_ABOVE, PCT_BELOW];

type Direction = AlertEvent['direction'];

// 决定 "matching side" 与 "non-matching side"，与 type 反向。
// price_above  : 匹配侧 = value > threshold（严格大于，边界穿越）。
// price_below  : 匹配侧 = value < threshold（严格小于）。
// pct_above    : matching = changePct > value。
// pct_below    : matching = changePct < value。
//
// prev 与 cur 都为 null/NaN 视为未初始化；只在两条都有效时才判断穿越。
function matchingSide(type: AlertType, observed: number, threshold: number): 'above' | 'below' | 'at' | null {
  if (!Number.isFinite(observed) || !Number.isFinite(threshold)) return null;
  switch (type) {
    case PRICE_ABOVE:
      return observed > threshold ? 'above' : observed < threshold ? 'below' : 'at';
    case PRICE_BELOW:
      return observed < threshold ? 'above' : observed > threshold ? 'below' : 'at';
    case PCT_ABOVE:
      return observed > threshold ? 'above' : observed < threshold ? 'below' : 'at';
    case PCT_BELOW:
      return observed < threshold ? 'above' : observed > threshold ? 'below' : 'at';
    default:
      return null;
  }
}

// 从报价中抽取本次观察值。价格类用 price；百分比类用 changePct。
// 取不到有效值返回 null。
export function readObservation(type: AlertType, quote: StockQuote | null | undefined): number | null {
  if (!quote) return null;
  if (type === PRICE_ABOVE || type === PRICE_BELOW) {
    const v = Number(quote.price);
    return Number.isFinite(v) ? v : null;
  }
  if (type === PCT_ABOVE || type === PCT_BELOW) {
    const v = Number(quote.changePct);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

export interface AlertTrigger {
  observed: number;
  direction: Direction;
  threshold: number;
  cooldownMs: number;
  triggeredAt: number;
}

export type AlertAction =
  | 'skip-disabled'
  | 'skip-no-op'
  | 'prime'
  | 'cooldown'
  | 'rearm-after-cooldown'
  | 'trigger'
  | 'skip-invalid';

export interface AlertEvaluation {
  action: AlertAction;
  prevValue: number | null;
  trigger?: AlertTrigger;
}

// 输入：
//   rule : { id, type, value, cooldownMs, prevValue, lastTriggeredAt, enabled }
//   quote: { price, changePct }
//   now  : 毫秒时间戳，可选
// 输出：见 AlertEvaluation
export function evaluateAlert(rule: Alert | null | undefined, quote: StockQuote | null | undefined, now?: number): AlertEvaluation {
  const ts: number = Number.isFinite(now as number) ? (now as number) : Date.now();
  if (!rule || rule.enabled === false) {
    return { action: 'skip-disabled', prevValue: rule?.prevValue ?? null };
  }
  const type: AlertType = rule.type;
  const threshold: number = Number(rule.value);
  if (!ALERT_TYPES.includes(type) || !Number.isFinite(threshold)) {
    return { action: 'skip-invalid', prevValue: rule.prevValue ?? null };
  }
  const observed: number | null = readObservation(type, quote);
  if (observed == null) {
    // 行情无效时保留 prev，以便下一轮再次判断。
    return { action: 'skip-invalid', prevValue: rule.prevValue ?? null };
  }

  const prevObserved: number | null = rule.prevValue == null ? null : Number(rule.prevValue);
  if (prevObserved == null) {
    // 首次观察：写入 prev，但不触发。
    return { action: 'prime', prevValue: observed };
  }

  const prevSide = matchingSide(type, prevObserved, threshold);
  const curSide = matchingSide(type, observed, threshold);
  if (prevSide === 'at' || curSide === 'at') {
    // 边界值既不算穿越也保持中性。
    return { action: 'skip-no-op', prevValue: observed };
  }
  if (prevSide === curSide) {
    // 仍在同侧，无穿越。
    return { action: 'skip-no-op', prevValue: observed };
  }
  // 进入匹配侧的相对方向：
  //   curSide === 'above' 表示观察值当前在 "matching" 一侧。
  const direction: Direction = curSide === 'above' ? 'into-matching' : 'out-of-matching';
  // 真正的触发条件：curSide 是 matching，prevSide 是 non-matching。
  if (direction !== 'into-matching') {
    return { action: 'skip-no-op', prevValue: observed };
  }

  const cooldownMs: number = Number.isFinite(rule.cooldownMs) ? Math.max(0, rule.cooldownMs) : DEFAULT_COOLDOWN_MS;
  const lastTriggeredAt: number = Number.isFinite(rule.lastTriggeredAt as number) ? (rule.lastTriggeredAt as number) : 0;
  if (lastTriggeredAt > 0 && cooldownMs > 0 && ts - lastTriggeredAt < cooldownMs) {
    // 冷却中：仍更新 prev，避免下一次误判。
    return { action: 'cooldown', prevValue: observed };
  }

  return {
    action: lastTriggeredAt > 0 ? 'rearm-after-cooldown' : 'trigger',
    prevValue: observed,
    trigger: {
      observed,
      direction,
      threshold,
      cooldownMs,
      triggeredAt: ts,
    },
  };
}

// 批量评估多只股票的所有规则；不依赖 React/Electron。
export function evaluateAlerts(
  rules: Alert[] | null | undefined,
  quoteByCode: Record<string, StockQuote> | null,
  now?: number
): { nextState: { id: number | undefined; prevValue: number | null }[]; events: (AlertEvaluation & { rule: Alert })[] } {
  const events: (AlertEvaluation & { rule: Alert })[] = [];
  const nextState: { id: number | undefined; prevValue: number | null }[] = [];
  for (const rule of rules || []) {
    const q = quoteByCode ? quoteByCode[rule.code] : null;
    const result = evaluateAlert(rule, q, now);
    nextState.push({ id: rule.id, prevValue: result.prevValue });
    if (result.trigger) {
      events.push({ rule, ...result });
    }
  }
  return { nextState, events };
}
