// Pure notification router logic (no React / no Electron).
// 设计：单渠道失败不污染其他；指数退避；静默时段；redact。

export type ChannelKind = 'windows' | 'bark' | 'telegram' | 'webhook';

export interface ChannelConfig {
  id: string;
  kind: ChannelKind;
  enabled: boolean;
  bark?: { endpoint: string; key: string; group?: string };
  telegram?: { botToken: string; chatId: string };
  webhook?: { url: string; headers?: Record<string, string> };
}

export interface NotificationEvent {
  ruleId: number;
  code: string;
  title: string;
  body: string;
  observed: number;
  threshold: number;
  triggeredAt: number;
  signature: string;
  url?: string;
}

export interface ChannelResult {
  channelId: string;
  status: 'success' | 'failed' | 'skipped' | 'paused' | 'invalid-config';
  message?: string;
  sentAt?: number;
}

export interface ChannelHealth {
  channelId: string;
  kind: ChannelKind;
  enabled: boolean;
  ok: number;
  fail: number;
  paused: boolean;
  lastError?: string;
}

export interface QuietHours {
  start: string; // 'HH:mm'
  end: string;
  behavior: 'log-only' | 'defer';
}

const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000];
const MAX_FAILURES = 5;
const PAUSE_MS = 30 * 60 * 1000;

export function redactChannelConfig(c: ChannelConfig): ChannelConfig {
  const r: ChannelConfig = { ...c, enabled: c.enabled };
  if (c.bark) r.bark = { endpoint: '<redacted>', key: '<redacted>', group: c.bark.group };
  if (c.telegram) r.telegram = { botToken: '<redacted>', chatId: c.telegram.chatId };
  if (c.webhook) {
    r.webhook = { url: '<redacted>' };
    if (c.webhook.headers) {
      const redacted: Record<string, string> = {};
      for (const k of Object.keys(c.webhook.headers)) redacted[k] = '<redacted>';
      r.webhook.headers = redacted;
    }
  }
  return r;
}

export function isInQuietHours(now: number, qh: QuietHours): boolean {
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const nowStr = `${hh}:${mm}`;
  if (qh.start <= qh.end) return nowStr >= qh.start && nowStr <= qh.end;
  // 跨午夜：start..24:00 与 00:00..end
  return nowStr >= qh.start || nowStr <= qh.end;
}

export function nextBackoffMs(failureCount: number): number {
  if (failureCount <= 0) return 0;
  if (failureCount >= MAX_FAILURES) return PAUSE_MS;
  return BACKOFF_MS[Math.min(failureCount - 1, BACKOFF_MS.length - 1)];
}

export interface RouterState {
  channels: Map<string, ChannelConfig>;
  health: Map<string, ChannelHealth>;
  nextRetryAt: Map<string, number>;
  quietHours: QuietHours | null;
}

export function createRouterState(channels: ChannelConfig[] = [], quietHours: QuietHours | null = null): RouterState {
  const map = new Map<string, ChannelConfig>();
  const health = new Map<string, ChannelHealth>();
  for (const c of channels) {
    map.set(c.id, c);
    health.set(c.id, { channelId: c.id, kind: c.kind, enabled: c.enabled, ok: 0, fail: 0, paused: false });
  }
  return { channels: map, health, nextRetryAt: new Map(), quietHours };
}

export function validateChannel(c: ChannelConfig): { ok: true } | { ok: false; reason: string } {
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

export interface RouterOutput {
  results: ChannelResult[];
  history: { ruleId: number; signature: string; overall: 'sent' | 'failed' | 'log-only'; perChannel: ChannelResult[] };
  state: RouterState;
}

export function dispatchEvent(
  state: RouterState,
  event: NotificationEvent,
  sendFn: (channel: ChannelConfig, event: NotificationEvent) => Promise<void>,
  now: number,
): RouterOutput {
  const results: ChannelResult[] = [];
  const perChannel: ChannelResult[] = [];
  const inQuiet = state.quietHours ? isInQuietHours(now, state.quietHours) : false;

  for (const [id, c] of state.channels) {
    if (!c.enabled) {
      results.push({ channelId: id, status: 'skipped', message: 'disabled' });
      continue;
    }
    const v = validateChannel(c);
    if (!v.ok) {
      const r: ChannelResult = { channelId: id, status: 'invalid-config', message: v.reason };
      results.push(r); perChannel.push(r);
      bump(state, id, 'fail', v.reason);
      continue;
    }
    const paused = isPaused(state, id, now);
    if (paused) {
      const r: ChannelResult = { channelId: id, status: 'paused', message: 'paused due to repeated failures' };
      results.push(r); perChannel.push(r);
      continue;
    }
    if (inQuiet && state.quietHours?.behavior === 'log-only') {
      const r: ChannelResult = { channelId: id, status: 'skipped', message: 'in quiet hours' };
      results.push(r); perChannel.push(r);
      continue;
    }
    void (async () => {
      try {
        await sendFn(c, event);
        bump(state, id, 'ok');
        state.nextRetryAt.delete(id);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        bump(state, id, 'fail', message);
        state.nextRetryAt.set(id, now + nextBackoffMs(state.health.get(id)?.fail ?? 1));
      }
    })();
    results.push({ channelId: id, status: 'success', sentAt: now });
    perChannel.push({ channelId: id, status: 'success', sentAt: now });
  }

  const overall: 'sent' | 'failed' | 'log-only' =
    inQuiet && state.quietHours?.behavior === 'log-only' ? 'log-only'
    : results.some((r) => r.status === 'success') ? 'sent'
    : 'failed';

  return { results, history: { ruleId: event.ruleId, signature: event.signature, overall, perChannel }, state };
}

function bump(state: RouterState, id: string, kind: 'ok' | 'fail', message?: string): void {
  const h = state.health.get(id);
  if (!h) return;
  if (kind === 'ok') {
    h.ok += 1;
    h.paused = false;
    delete h.lastError;
  } else {
    h.fail += 1;
    h.lastError = message;
    if (h.fail >= MAX_FAILURES) h.paused = true;
  }
}

function isPaused(state: RouterState, id: string, now: number): boolean {
  const h = state.health.get(id);
  if (!h) return false;
  if (!h.paused) return false;
  const next = state.nextRetryAt.get(id) ?? 0;
  if (now >= next) {
    h.paused = false;
    return false;
  }
  return true;
}