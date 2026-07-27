import { StockQuote, KLineBar, KLinePeriod, MarketIndex, FundFlowItem } from './types';

const SINA_API = 'http://hq.sinajs.cn/list={codes}';

/** 规范化用户输入的代码 */
export function resolveCode(raw: string): string {
  raw = raw.trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(raw)) return raw;
  if (/^hk\d{5}$/.test(raw)) return raw;
  if (/^us[a-z]+$/i.test(raw)) return raw;
  if (/^\d{6}$/.test(raw)) {
    if (raw.startsWith('6')) return 'sh' + raw;
    if (raw.startsWith('0') || raw.startsWith('3')) return 'sz' + raw;
    if (raw.startsWith('8') || raw.startsWith('4')) return 'bj' + raw;
  }
  if (/^\d{5}$/.test(raw)) return 'hk' + raw;
  return '';
}

/** 格式化价格显示 */
export function fmtPrice(v: number | null): string {
  if (v == null) return '--';
  if (Math.abs(v) >= 1000) return v.toFixed(2);
  if (Math.abs(v) >= 100) return v.toFixed(2);
  if (Math.abs(v) >= 10) return v.toFixed(2);
  if (Math.abs(v) >= 0.1) return v.toFixed(3);
  return v.toFixed(4);
}

/** 格式化成交量 */
export function fmtVolume(v: number | null): string {
  if (v == null) return '';
  if (v >= 10000) return (v / 10000).toFixed(1) + '万手';
  return v.toFixed(0) + '手';
}

/** 获取行情：优先走 Electron 主进程（带 Referer + GBK 解码），浏览器环境退回直连 */
export async function fetchQuotes(codes: string[]): Promise<StockQuote[]> {
  if (codes.length === 0) return [];

  const sinaCodes = codes.map(resolveCode).filter(Boolean);
  const url = SINA_API.replace('{codes}', sinaCodes.join(','));

  try {
    let text: string;
    if (window.electronAPI?.fetchQuotes) {
      text = await window.electronAPI.fetchQuotes(sinaCodes);
    } else {
      const resp = await fetch(url, { headers: { Referer: 'https://finance.sina.com.cn' } });
      const buf = await resp.arrayBuffer();
      text = new TextDecoder('gbk').decode(new Uint8Array(buf));
    }
    return sinaCodes.map((code) => parseSinaLine(text, code));
  } catch {
    return codes.map((code) => ({
      code, name: '--', price: null, change: null, changePct: null,
      open: null, high: null, low: null, volume: null,
      prevClose: null, error: '网络错误',
    }));
  }
}

function parseSinaLine(text: string, code: string): StockQuote {
  const base: StockQuote = {
    code, name: '--', price: null, change: null, changePct: null,
    open: null, high: null, low: null, volume: null,
    prevClose: null, error: null,
  };

  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = `(?:var\\s+hq_str_)?${escaped}\\s*=\\s*"([^"]*)"`;
  const m = text.match(new RegExp(pattern));
  if (!m) {
    base.error = '未找到';
    return base;
  }

  const fields = m[1].split(',');

  if (code.startsWith('hk')) {
    if (fields.length >= 9) {
      base.name = fields[1] || fields[0];
      base.open = parseNum(fields[2]);
      base.prevClose = parseNum(fields[3]);
      base.high = parseNum(fields[4]);
      base.low = parseNum(fields[5]);
      base.price = parseNum(fields[6]);
      base.change = parseNum(fields[7]);
      base.changePct = parseNum(fields[8]);
    }
  } else if (code.startsWith('gb_')) {
    if (fields.length >= 4) {
      base.name = fields[0];
      base.price = parseNum(fields[1]);
      base.change = parseNum(fields[2]);
      base.changePct = parseNum(fields[3]);
    }
  } else {
    if (fields.length >= 32) {
      base.name = fields[0];
      base.open = parseNum(fields[1]);
      base.prevClose = parseNum(fields[2]);
      base.price = parseNum(fields[3]);
      base.high = parseNum(fields[4]);
      base.low = parseNum(fields[5]);
      base.volume = parseNum(fields[8]);
      if (base.price != null && base.prevClose != null && base.prevClose !== 0) {
        base.change = base.price - base.prevClose;
        base.changePct = Math.round((base.change / base.prevClose) * 10000) / 100;
      }
    }
  }

  return base;
}

function parseNum(s: string): number | null {
  if (!s || s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

// ── K线（东方财富，精准源；分时/分钟K/日周月）──
const TENCENT_KLINE = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},{period},,,{len},qfq';

/** 获取 K 线（东方财富源，日/周/月失败时回退腾讯） */
export async function fetchEmKline(
  code: string,
  kind: 'trend' | 'kline',
  klt: number,
  len: number
): Promise<{ bars: KLineBar[]; preClose: number; name: string; error?: string }> {
  try {
    if (window.electronAPI?.fetchKline) {
      const r = await window.electronAPI.fetchKline(code, kind, klt, len);
      if (!r.error || r.bars.length) return r;
      // 东方财富失败，日/周/月尝试腾讯兜底
      if (kind === 'kline' && (klt === 101 || klt === 102 || klt === 103)) {
        const period = klt === 101 ? 'day' : klt === 102 ? 'week' : 'month';
        const fb = await tencentKline(code, period, len);
        if (fb.bars.length) return { ...fb, preClose: 0, name: code };
      }
      return r;
    }
    return { bars: [], preClose: 0, name: code, error: '无主进程' };
  } catch {
    return { bars: [], preClose: 0, name: code, error: '网络错误' };
  }
}

async function tencentKline(
  code: string,
  period: KLinePeriod,
  len: number
): Promise<{ bars: KLineBar[]; error?: string }> {
  try {
    const url = TENCENT_KLINE.replace('{code}', code)
      .replace('{period}', period)
      .replace('{len}', String(len));
    const resp = await fetch(url);
    const json = await resp.json();
    return parseTencentKline(json, code, period);
  } catch {
    return { bars: [], error: '网络错误' };
  }
}

function parseTencentKline(
  json: any,
  code: string,
  period: KLinePeriod
): { bars: KLineBar[]; error?: string } {
  try {
    const node = json?.data?.[code];
    const key = period === 'day' ? 'qfqday' : period === 'week' ? 'qfqweek' : 'qfqmonth';
    const raw = node?.[key];
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      return { bars: [], error: '该周期暂无数据' };
    }
    const bars: KLineBar[] = raw
      .map((r: any[]) => ({
        date: String(r[0]),
        open: Number(r[1]),
        close: Number(r[2]),
        high: Number(r[3]),
        low: Number(r[4]),
        volume: Number(r[5]),
      }))
      .filter((b: KLineBar) => b.open && b.close);
    if (bars.length === 0) return { bars: [], error: '数据解析失败' };
    return { bars };
  } catch {
    return { bars: [], error: '解析失败' };
  }
}

// ── 大盘指数 ──
export async function fetchMarket(): Promise<{ rows: MarketIndex[]; error?: string }> {
  try {
    if (window.electronAPI?.fetchMarket) return await window.electronAPI.fetchMarket();
    return { rows: [], error: '无主进程' };
  } catch {
    return { rows: [], error: '网络错误' };
  }
}

// ── 资金流 ──
export async function fetchFunds(
  category: 'industry' | 'concept' | 'stock',
  limit = 50
): Promise<{ rows: FundFlowItem[]; error?: string }> {
  try {
    if (window.electronAPI?.fetchFunds) return await window.electronAPI.fetchFunds(category, limit);
    return { rows: [], error: '无主进程' };
  } catch {
    return { rows: [], error: '网络错误' };
  }
}
