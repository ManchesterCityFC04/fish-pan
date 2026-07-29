// Pure LLM Provider logic (OpenAI compatible). No React / no fetch at import time.

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  temperature: number;
  timeoutMs: number;
  systemPrompt?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  ok: boolean;
  text: string;
  error?: string;
}

const REDACTED = '<redacted>';

export function redactConfig(c: LlmConfig): Omit<LlmConfig, 'apiKey'> & { apiKey: string | null } {
  return { ...c, apiKey: c.apiKey ? REDACTED : null };
}

export function validateConfig(c: Partial<LlmConfig>): { ok: true } | { ok: false; reason: string } {
  if (!c.baseUrl) return { ok: false, reason: 'baseUrl 必填' };
  if (!/^https?:\/\//i.test(c.baseUrl)) return { ok: false, reason: 'baseUrl 必须 https/http' };
  if (!c.model) return { ok: false, reason: 'model 必填' };
  if (typeof c.temperature !== 'number' || c.temperature < 0 || c.temperature > 2) {
    return { ok: false, reason: 'temperature 必须在 0..2 之间' };
  }
  if (typeof c.timeoutMs !== 'number' || c.timeoutMs < 1000) {
    return { ok: false, reason: 'timeoutMs 必须 ≥ 1000' };
  }
  return { ok: true };
}

export async function callOpenAIChat(
  config: LlmConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResult> {
  const v = validateConfig(config);
  if (!v.ok) return { ok: false, text: '', error: v.reason };

  const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
  const combined = AbortSignal.any([signal, timeoutSignal]);

  const body = JSON.stringify({
    model: config.model,
    messages: config.systemPrompt
      ? [{ role: 'system', content: config.systemPrompt }, ...messages]
      : messages,
    temperature: config.temperature,
    stream: false,
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  try {
    const resp = await fetchImpl(url, { method: 'POST', headers, body, signal: combined });
    if (!resp.ok) {
      return { ok: false, text: '', error: `HTTP ${resp.status}` };
    }
    const json: any = await resp.json();
    const text = String(json?.choices?.[0]?.message?.content ?? '');
    return { ok: true, text };
  } catch (e) {
    if ((e as Error).name === 'AbortError' || combined.aborted) {
      return { ok: false, text: '', error: combined.reason === 'timeout' ? 'timeout' : 'aborted' };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, text: '', error: message };
  }
}