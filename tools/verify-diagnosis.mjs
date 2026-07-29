// 离线验证 diagnosis 模块。复制 src/diagnosis.ts 的核心公式。

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function buildDiagnosisBundle(input) {
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
        high: Number.isFinite(high) ? high : null,
        low: Number.isFinite(low) ? low : null,
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
      ? { shares: safeNum(input.position.shares) || 0, costPrice: safeNum(input.position.costPrice) || 0 }
      : null,
    alerts: (input.alerts || []).map((a) => ({
      type: String(a.type),
      value: safeNum(a.value) || 0,
      enabled: a.enabled !== false,
      triggered: a.triggered === true,
    })),
  };
}

const DIAGNOSIS_PROMPT = `你是研究助手。请基于以下结构化输入，为 {{stockName}} ({{code}}) 输出一份"仅供参考"的诊断简报。

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

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fence) return fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return null;
}

const asStringArray = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[\n;,]/).map((s) => s.trim()).filter(Boolean);
  return [];
};
const asSentiment = (v) => {
  const s = String(v || '').toLowerCase();
  if (s.includes('bull') || s.includes('多') || s.includes('看多')) return 'bullish';
  if (s.includes('bear') || s.includes('空') || s.includes('看空')) return 'bearish';
  if (s.includes('neutral') || s.includes('中') || s.includes('震荡')) return 'neutral';
  return 'unknown';
};

function parseBrief(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { ok: false, error: 'LLM 返回为空', raw };
  const json = extractJson(raw);
  if (!json) {
    return {
      ok: true,
      brief: {
        summary: raw.slice(0, 200),
        sentiment: 'unknown',
        drivers: [],
        risks: [],
        observations: [],
        watchPoints: [],
      },
    };
  }
  try {
    const obj = JSON.parse(json);
    const brief = {
      summary: String(obj.summary || '').slice(0, 500),
      sentiment: asSentiment(obj.sentiment),
      drivers: asStringArray(obj.drivers).slice(0, 10),
      risks: asStringArray(obj.risks).slice(0, 10),
      observations: asStringArray(obj.observations).slice(0, 10),
      watchPoints: asStringArray(obj.watchPoints).slice(0, 10),
    };
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
    return { ok: false, error: `JSON 解析失败: ${e.message}`, raw };
  }
}

function renderDiagnosisPrompt(bundle) {
  const json = JSON.stringify(bundle, null, 2);
  return DIAGNOSIS_PROMPT.split('{{stockName}}').join(bundle.stockName)
    .split('{{code}}').join(bundle.code)
    .split('{{bundle}}').join(json);
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

// 1. 基本 bundle
const b1 = buildDiagnosisBundle({
  code: '600000',
  stockName: '浦发银行',
  quote: { price: 10.5, changePct: 1.2, prevClose: 10.4, open: 10.4, high: 10.6, low: 10.3, volume: 1000000 },
  kline: [
    { time: '2024-01-01', open: 10, close: 10.2, high: 10.3, low: 9.9, volume: 1000, changePct: 0 },
    { time: '2024-01-02', open: 10.2, close: 10.5, high: 10.6, low: 10.1, volume: 1200, changePct: 0 },
  ],
  news: [{ title: '业绩超预期', source: '新浪财经' }, { title: '行业利好', source: '财联社' }],
  position: { shares: 1000, costPrice: 9.5 },
  alerts: [{ type: 'price_above', value: 11, enabled: true, triggered: false }],
});
eq('bundle code', b1.code, '600000');
eq('bundle stockName', b1.stockName, '浦发银行');
eq('bundle quote.price', b1.quote.price, 10.5);
eq('bundle klineSummary.bars', b1.klineSummary.bars, 2);
// firstClose = kline[0].close = 10.2, lastClose = kline[1].close = 10.5
// (10.5 - 10.2) / 10.2 * 100 = 2.941...
eq('bundle klineSummary.changePct', b1.klineSummary.changePct, (10.5 - 10.2) / 10.2 * 100, 1e-9);
eq('bundle klineSummary.high', b1.klineSummary.high, 10.6);
eq('bundle news count', b1.news.length, 2);
eq('bundle position shares', b1.position.shares, 1000);
eq('bundle alerts count', b1.alerts.length, 1);

// 2. 输入不足
const b2 = buildDiagnosisBundle({
  code: '00700',
  stockName: '腾讯',
  quote: null,
  kline: null,
  news: null,
  position: null,
  alerts: null,
});
eq('empty bundle quote', b2.quote, null);
eq('empty bundle klineSummary', b2.klineSummary, null);
eq('empty bundle news', b2.news, []);
eq('empty bundle position', b2.position, null);
eq('empty bundle alerts', b2.alerts, []);

// 3. 解析：JSON 围栏
const sample1 = `这是说明
\`\`\`json
{
  "summary": "今日上涨",
  "sentiment": "bullish",
  "drivers": ["A", "B"],
  "risks": ["C"],
  "observations": [],
  "watchPoints": ["D"]
}
\`\`\`
末尾`;
const r1 = parseBrief(sample1);
eq('parse fence ok', r1.ok, true);
eq('parse fence summary', r1.ok && r1.brief.summary, '今日上涨');
eq('parse fence sentiment', r1.ok && r1.brief.sentiment, 'bullish');
eq('parse fence drivers', r1.ok && r1.brief.drivers, ['A', 'B']);

// 4. 解析：直接 JSON；drivers 用 \\n 让 JSON 源里是 \n 转义
const r2 = parseBrief('{"summary":"X","sentiment":"中性","drivers":"a\\nb","risks":[],"observations":[],"watchPoints":[]}');
eq('parse raw json ok', r2.ok, true);
eq('parse raw json summary', r2.ok && r2.brief.summary, 'X');
eq('parse raw json sentiment', r2.ok && r2.brief.sentiment, 'neutral');
eq('parse raw json drivers', r2.ok && r2.brief.drivers, ['a', 'b']);

// 5. 解析：非 JSON → 降级为 summary
const r3 = parseBrief('今日股价波动较大');
eq('parse fallback ok', r3.ok, true);
eq('parse fallback summary', r3.ok && r3.brief.summary, '今日股价波动较大');

// 6. 解析：空
const r4 = parseBrief('');
eq('parse empty fail', r4.ok, false);

// 7. 解析：全空
const r5 = parseBrief('{"summary":"","drivers":[],"risks":[],"observations":[],"watchPoints":[]}');
eq('parse all-empty fail', r5.ok, false);

// 8. Prompt 渲染
const rendered = renderDiagnosisPrompt(b1);
const ok1 = rendered.includes('浦发银行');
const ok2 = rendered.includes('600000');
const ok3 = rendered.includes('"price": 10.5');
eq('prompt has stockName', ok1, true);
eq('prompt has code', ok2, true);
eq('prompt has bundle', ok3, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
