// 纯函数：一键个股诊断的输入 bundle 与 brief 解析。零 React 依赖。
// 真实 LLM 调用暂未集成，诊断 modal 在未配置 LLM 时会显示 prompt 模板 + 输入数据预览。

import type { Alert, KLineBar, StockQuote } from './types';

export type Sentiment = 'bullish' | 'neutral' | 'bearish' | 'unknown';

export interface DiagnosisNewsItem {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: number;
}

export interface DiagnosisBundleInput {
  code: string;
  stockName?: string;
  quote: StockQuote | null | undefined;
  kline: KLineBar[] | null | undefined;
  news: DiagnosisNewsItem[] | null | undefined;
  position: { shares: number; costPrice: number } | null | undefined;
  alerts: Alert[] | null | undefined;
}

export interface DiagnosisBundle {
  code: string;
  stockName: string;
  asOf: number;
  quote: {
    price: number | null;
    changePct: number | null;
    preClose: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
  } | null;
  klineSummary: {
    bars: number;
    firstClose: number | null;
    lastClose: number | null;
    changePct: number | null;
    high: number | null;
    low: number | null;
  } | null;
  news: Array<{ title: string; source: string }>;
  position: { shares: number; costPrice: number } | null;
  alerts: Array<{ type: string; value: number; enabled: boolean; triggered: boolean }>;
}

const safeNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function buildDiagnosisBundle(input: DiagnosisBundleInput): DiagnosisBundle {
  const kline = input.kline || [];
  const firstClose = kline.length ? safeNum(kline[0].close) : null;
  const lastClose = kline.length ? safeNum(kline[kline.length - 1].close) : null;
  const high = kline.length
    ? Math.max(...kline.map((b) => safeNum(b.high) ?? -Infinity).filter((n) => n !== -Infinity))
    : null;
  const low = kline.length
    ? Math.min(...kline.map((b) => safeNum(b.low) ?? Infinity).filter((n) => n !== Infinity))
    : null;
  const klineSummary = kline.length
    ? {
        bars: kline.length,
        firstClose,
        lastClose,
        changePct:
          firstClose != null && lastClose != null && firstClose !== 0
            ? ((lastClose - firstClose) / firstClose) * 100
            : null,
        high: Number.isFinite(high as number) ? (high as number) : null,
        low: Number.isFinite(low as number) ? (low as number) : null,
      }
    : null;

  return {
    code: String(input.code || ''),
    stockName: String(input.stockName || input.code || ''),
    asOf: Date.now(),
    quote: input.quote
      ? {
          price: safeNum(input.quote.price),
          changePct: safeNum(input.quote.changePct),
          preClose: safeNum(input.quote.prevClose),
          open: safeNum(input.quote.open),
          high: safeNum(input.quote.high),
          low: safeNum(input.quote.low),
          volume: safeNum(input.quote.volume),
        }
      : null,
    klineSummary,
    news: (input.news || []).slice(0, 5).map((n) => ({
      title: String(n.title || '').slice(0, 80),
      source: String(n.source || '').slice(0, 20),
    })),
    position: input.position
      ? {
          shares: safeNum(input.position.shares) || 0,
          costPrice: safeNum(input.position.costPrice) || 0,
        }
      : null,
    alerts: (input.alerts || []).map((a) => ({
      type: String(a.type),
      value: safeNum(a.value) || 0,
      enabled: a.enabled !== false,
      triggered: a.triggered === true,
    })),
  };
}

// Prompt 模板：单文件常量，便于未来替换。
export const DIAGNOSIS_PROMPT = `你是研究助手。请基于以下结构化输入，为 {{stockName}} ({{code}}) 输出一份"仅供参考"的诊断简报。

严格要求：
1. 不要编造输入中未给出的数字；引用数据时必须与下方输入完全一致。
2. 简报要简洁、明确、不含操作建议（如"买入/卖出"），只输出"观察项"。
3. 当输入不足时显式说"输入不足"，不要自行补全。

输入（JSON）：
\`\`\`json
{{bundle}}
\`\`\`

请按下面的结构输出 JSON（不要带 Markdown 围栏）：
{
  "summary": "一句话总结",
  "sentiment": "bullish|neutral|bearish|unknown",
  "drivers": ["驱动因素1", "驱动因素2"],
  "risks": ["风险点1", "风险点2"],
  "observations": ["观察1", "观察2"],
  "watchPoints": ["后续关注1", "后续关注2"]
}`;

// 解析 LLM 返回的 brief 文本；优先尝试提取 JSON，其次启发式降级。
export interface Brief {
  summary: string;
  sentiment: Sentiment;
  drivers: string[];
  risks: string[];
  observations: string[];
  watchPoints: string[];
}

export interface BriefParseError {
  ok: false;
  error: string;
  raw: string;
}

export interface BriefParseOk {
  ok: true;
  brief: Brief;
}

export type BriefParseResult = BriefParseOk | BriefParseError;

const emptyBrief = (): Brief => ({
  summary: '',
  sentiment: 'unknown',
  drivers: [],
  risks: [],
  observations: [],
  watchPoints: [],
});

const asStringArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[\n;,]/).map((s) => s.trim()).filter(Boolean);
  return [];
};

const asSentiment = (v: unknown): Sentiment => {
  const s = String(v || '').toLowerCase();
  if (s.includes('bull') || s.includes('多') || s.includes('看多')) return 'bullish';
  if (s.includes('bear') || s.includes('空') || s.includes('看空')) return 'bearish';
  if (s.includes('neutral') || s.includes('中') || s.includes('震荡')) return 'neutral';
  return 'unknown';
};

function extractJson(text: string): string | null {
  // 1. 优先尝试 ```json 围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fence) return fence[1].trim();
  // 2. 顶层花括号范围
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return null;
}

export function parseBrief(text: string): BriefParseResult {
  const raw = String(text || '');
  if (!raw.trim()) {
    return { ok: false, error: 'LLM 返回为空', raw };
  }
  const json = extractJson(raw);
  if (!json) {
    // 启发式降级：使用整段作为 summary
    const b = emptyBrief();
    b.summary = raw.slice(0, 200);
    return { ok: true, brief: b };
  }
  try {
    const obj = JSON.parse(json);
    const brief: Brief = {
      summary: String(obj.summary || '').slice(0, 500),
      sentiment: asSentiment(obj.sentiment),
      drivers: asStringArray(obj.drivers).slice(0, 10),
      risks: asStringArray(obj.risks).slice(0, 10),
      observations: asStringArray(obj.observations).slice(0, 10),
      watchPoints: asStringArray(obj.watchPoints).slice(0, 10),
    };
    // 至少要有 summary 或一个非空列表才算 OK
    if (
      !brief.summary &&
      !brief.drivers.length &&
      !brief.risks.length &&
      !brief.observations.length &&
      !brief.watchPoints.length
    ) {
      return { ok: false, error: '解析结果全为空', raw };
    }
    return { ok: true, brief };
  } catch (e) {
    return { ok: false, error: `JSON 解析失败: ${(e as Error).message}`, raw };
  }
}

// 渲染 prompt 文本，把 {{stockName}} {{code}} {{bundle}} 替换为实际值。
export function renderDiagnosisPrompt(bundle: DiagnosisBundle): string {
  const json = JSON.stringify(bundle, null, 2);
  return DIAGNOSIS_PROMPT.split('{{stockName}}').join(bundle.stockName)
    .split('{{code}}').join(bundle.code)
    .split('{{bundle}}').join(json);
}
