import { StockQuote, KLineBar, KLinePeriod, MarketIndex, FundFlowItem, NewsItem, NewsFetchResult, NewsStatusResult, NewsDataKind } from './types';

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
const TENCENT_TREND = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?code={code}';
const TENCENT_FLASH_MIN = 'https://data.gtimg.cn/flashdata/hushen/minute/{code}.js';

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
      // 东方财富失败或无数据 → 全场景回退腾讯
      const fb = await tencentFallback(code, kind, klt, len);
      if (fb.bars.length) {
        return { ...fb, error: r.error ? `${r.error}（已用腾讯兜底）` : undefined };
      }
      return r;
    }
    return { bars: [], preClose: 0, name: code, error: '无主进程' };
  } catch (e) {
    return { bars: [], preClose: 0, name: code, error: `网络错误：${String((e as Error).message || e)}` };
  }
}

async function tencentFallback(
  code: string,
  kind: 'trend' | 'kline',
  klt: number,
  len: number
): Promise<{ bars: KLineBar[]; preClose: number; name: string }> {
  if (kind === 'trend') return tencentTrend(code);
  const period = kltToTencentPeriod(klt);
  if (!period) return { bars: [], preClose: 0, name: code };
  return tencentKline(code, period, len);
}

function kltToTencentPeriod(klt: number): KLinePeriod | null {
  switch (klt) {
    case 101: return 'day';
    case 102: return 'week';
    case 103: return 'month';
    case 1: return 'm1';
    case 5: return 'm5';
    case 15: return 'm15';
    case 30: return 'm30';
    case 60: return 'm60';
    default: return null;
  }
}

async function tencentKline(
  code: string,
  period: KLinePeriod,
  len: number
): Promise<{ bars: KLineBar[]; preClose: number; name: string }> {
  const empty = { bars: [], preClose: 0, name: code };
  // 分钟 K 线走 flash minute 聚合（fqkline 不支持 m1..m60）
  if (period === 'm1' || period === 'm5' || period === 'm15' || period === 'm30' || period === 'm60') {
    return tencentFlashMinuteKline(code, period, len);
  }
  try {
    const url = TENCENT_KLINE.replace('{code}', code)
      .replace('{period}', period)
      .replace('{len}', String(len));
    const resp = await fetch(url);
    if (!resp.ok) return empty;
    const json = await resp.json();
    return parseTencentKline(json, code, period);
  } catch {
    return empty;
  }
}

function parseTencentKline(
  json: any,
  code: string,
  period: KLinePeriod
): { bars: KLineBar[]; preClose: number; name: string } {
  const empty = { bars: [], preClose: 0, name: code };
  try {
    const node = json?.data?.[code];
    if (!node) return empty;
    const name = String(node.name || code);
    let raw: any[] | undefined;
    switch (period) {
      case 'day': raw = node.qfqday ?? node.day; break;
      case 'week': raw = node.qfqweek ?? node.week; break;
      case 'month': raw = node.qfqmonth ?? node.month; break;
      case 'm1': case 'm5': case 'm15': case 'm30': case 'm60':
        raw = node[period];
        break;
    }
    if (!raw || !Array.isArray(raw) || raw.length === 0) return { ...empty, name };
    const bars: KLineBar[] = raw
      .map((r: any[]) => ({
        date: String(r[0]),
        open: Number(r[1]),
        close: Number(r[2]),
        high: Number(r[3]),
        low: Number(r[4]),
        volume: Number(r[5]) || 0,
      }))
      .filter((b: KLineBar) => Number.isFinite(b.open) && Number.isFinite(b.close) && b.open > 0 && b.close > 0);
    return { bars, preClose: 0, name };
  } catch {
    return empty;
  }
}

async function tencentTrend(code: string): Promise<{ bars: KLineBar[]; preClose: number; name: string }> {
  const empty = { bars: [], preClose: 0, name: code };
  try {
    const url = TENCENT_TREND.replace('{code}', code);
    const resp = await fetch(url);
    if (!resp.ok) return empty;
    const json = await resp.json();
    const node = json?.data?.[code];
    if (!node) return empty;
    const data = node.data || {};
    const name = String(node.name || code);
    const preClose = Number(data.preClose) || 0;
    const points: any[] = Array.isArray(data.data) ? data.data : [];
    if (points.length === 0) return { ...empty, name, preClose };
    const bars: KLineBar[] = points.map((p) => {
      const price = Number(p[1]) || 0;
      return {
        date: String(p[0] || ''),
        open: price,
        close: price,
        high: price,
        low: price,
        volume: Number(p[2]) || 0,
        amount: Number(p[3]) || 0,
      };
    });
    return { bars, preClose, name };
  } catch {
    return empty;
  }
}

// 腾讯 flash 分时：text/javascript 格式
// var min_data="\ndate:211008\n0930 9.05 12081\n...";
// 行：time price volume
// 聚合为 m1/m5/m15/m30/m60 K 线
async function tencentFlashMinuteKline(
  code: string,
  period: 'm1' | 'm5' | 'm15' | 'm30' | 'm60',
  len: number
): Promise<{ bars: KLineBar[]; preClose: number; name: string }> {
  const empty = { bars: [], preClose: 0, name: code };
  try {
    const url = TENCENT_FLASH_MIN.replace('{code}', code);
    const resp = await fetch(url);
    if (!resp.ok) return empty;
    const text = await resp.text();
    const m = text.match(/min_data\s*=\s*"([\s\S]*?)"\s*;?/);
    if (!m) return empty;
    const body = m[1];
    const lines = body.split(/\n/).map((s) => s.trim()).filter(Boolean);
    const points: { time: string; price: number; volume: number }[] = [];
    for (const line of lines) {
      if (/^date:/i.test(line)) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;
      const t = parts[0];
      const p = Number(parts[1]);
      const v = Number(parts[2]);
      if (!/^\d{4}$/.test(t) || !Number.isFinite(p) || !Number.isFinite(v)) continue;
      points.push({ time: t, price: p, volume: v });
    }
    if (points.length === 0) return empty;
    const minutes = period === 'm1' ? 1 : period === 'm5' ? 5 : period === 'm15' ? 15 : period === 'm30' ? 30 : 60;
    const preClose = points[0]?.price || 0;
    const bars: KLineBar[] = [];
    let bucket: typeof points | null = null;
    let bucketStart = -1;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const mins = Number(p.time.slice(0, 2)) * 60 + Number(p.time.slice(2));
      const bucketIdx = Math.floor(mins / minutes);
      if (bucket == null || bucketStart !== bucketIdx) {
        if (bucket && bucket.length) bars.push(makeBar(bucket));
        bucket = [p];
        bucketStart = bucketIdx;
      } else {
        bucket.push(p);
      }
    }
    if (bucket && bucket.length) bars.push(makeBar(bucket));
    const trimmed = len > 0 && bars.length > len ? bars.slice(bars.length - len) : bars;
    return { bars: trimmed, preClose, name: code };
  } catch {
    return empty;
  }
}

function makeBar(bucket: { time: string; price: number; volume: number }[]): KLineBar {
  let high = -Infinity;
  let low = Infinity;
  let vol = 0;
  for (const p of bucket) {
    if (p.price > high) high = p.price;
    if (p.price < low) low = p.price;
    vol += p.volume;
  }
  return {
    date: bucket[0].time,
    open: bucket[0].price,
    close: bucket[bucket.length - 1].price,
    high,
    low,
    volume: vol,
  };
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

// ── 新闻 / 公告 / 快讯（market-news-events）──
// 浏览器无 electronAPI 时返回 data:null + error.kind:'no-main'，不抛异常。
export async function fetchNewsList(
  kind: NewsDataKind,
  code: string,
): Promise<NewsFetchResult> {
  if (!window.electronAPI?.news?.list) {
    return { data: null, error: { kind: 'no-main', message: 'electronAPI.news.list unavailable' } };
  }
  try {
    return await window.electronAPI.news.list(kind, code);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { data: null, error: { kind: 'all-failed', message } };
  }
}

export async function fetchNewsFlash(): Promise<NewsFetchResult> {
  if (!window.electronAPI?.news?.flash) {
    return { data: null, error: { kind: 'no-main', message: 'electronAPI.news.flash unavailable' } };
  }
  try {
    return await window.electronAPI.news.flash();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { data: null, error: { kind: 'all-failed', message } };
  }
}

export async function fetchNewsStatus(): Promise<NewsStatusResult> {
  if (!window.electronAPI?.news?.status) {
    return { vendors: [], error: { kind: 'no-main', message: 'electronAPI.news.status unavailable' } };
  }
  try {
    return await window.electronAPI.news.status();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { vendors: [], error: { kind: 'no-main', message } };
  }
}

// ── 账户与持仓（portfolio-positions）──
import type { Account, Position } from './types';

export async function fetchAccounts(): Promise<Account[]> {
  if (!window.electronAPI?.db?.account?.list) return [];
  try {
    return await window.electronAPI.db.account.list();
  } catch {
    return [];
  }
}

export async function addAccount(name: string, baseCurrency?: Account['baseCurrency']): Promise<{ id: number } | null> {
  if (!window.electronAPI?.db?.account?.add) return null;
  try {
    return await window.electronAPI.db.account.add(name, baseCurrency);
  } catch {
    return null;
  }
}

export async function removeAccount(id: number): Promise<void> {
  if (!window.electronAPI?.db?.account?.remove) return;
  try {
    await window.electronAPI.db.account.remove(id);
  } catch {
    // ignore
  }
}

export async function fetchPositions(accountId?: number): Promise<Position[]> {
  if (!window.electronAPI?.db?.position?.list) return [];
  try {
    return await window.electronAPI.db.position.list(accountId);
  } catch {
    return [];
  }
}

export async function addPosition(p: { accountId: number; code: string; shares: number; costPrice: number; openedAt?: number; notes?: string | null }): Promise<{ id: number } | null> {
  if (!window.electronAPI?.db?.position?.add) return null;
  try {
    return await window.electronAPI.db.position.add(p);
  } catch {
    return null;
  }
}

export async function removePosition(id: number): Promise<void> {
  if (!window.electronAPI?.db?.position?.remove) return;
  try {
    await window.electronAPI.db.position.remove(id);
  } catch {
    // ignore
  }
}
