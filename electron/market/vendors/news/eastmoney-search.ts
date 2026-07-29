// Eastmoney 个股新闻 Vendor.
// 字段校准状态: 未实接 — 当前为 mock 路径，等待 Task 18 在线烟雾阶段替换 liveEastmoneySearch()。
// ToS 提示: 东方财富搜索 API 为公开页面，限流需遵守；不得高频请求。
// 安全: 不绕过 TLS（无 rejectUnauthorized=false / verify=false）。

import type { NewsItem, NewsRequest, NewsVendor } from '../../types';
import { isSafeUrl, makeNewsId, normalizeCode, stripHtml, truncateSummary } from '../../normalize';

const VENDOR_ID = 'eastmoney-search';
const SOURCE = '东方财富';

function isCN(code: string): boolean {
  return /^(sh|sz|bj)\d{6}$/.test(code);
}

function baseItem(req: NewsRequest, idx: number): Omit<NewsItem, 'url' | 'publishedAt'> {
  const code = normalizeCode(req.code) || req.code;
  return {
    id: makeNewsId(req.kind, VENDOR_ID, `${code}:${idx}`),
    kind: req.kind,
    title: '',
    source: SOURCE,
    codes: [code],
    lang: 'zh-CN',
  };
}

async function mockEastmoneySearch(req: NewsRequest): Promise<NewsItem[]> {
  const code = normalizeCode(req.code) || req.code;
  const now = Date.now();
  return [
    {
      ...baseItem(req, 0),
      title: `${code} 盘后公告摘要：第三季度营收同比增长`,
      url: 'https://example.com/em-news/0',
      publishedAt: now - 1000 * 60 * 30,
      summary: truncateSummary('公司发布最新业绩公告，第三季度营收同比增长，毛利率维持在稳定区间。'),
    },
    {
      ...baseItem(req, 1),
      title: `${code} 机构调研纪要：聚焦新业务线`,
      url: 'https://example.com/em-news/1',
      publishedAt: now - 1000 * 60 * 60 * 4,
      summary: truncateSummary('多家机构对公司新业务线展开调研，关注产能与订单情况。'),
    },
    {
      ...baseItem(req, 2),
      title: `${code} 行业新闻：板块异动`,
      url: 'https://example.com/em-news/2',
      publishedAt: now - 1000 * 60 * 60 * 18,
    },
  ];
}

async function liveEastmoneySearch(req: NewsRequest, signal: AbortSignal): Promise<NewsItem[]> {
  // Placeholder. Real implementation will hit the 东方财富 search endpoint
  // and map raw payload to NewsItem via normalize.ts. Must NOT bypass TLS.
  void signal;
  void req;
  return [];
}

export const eastmoneySearch: NewsVendor = {
  id: VENDOR_ID,
  kind: 'news',
  supports(code: string): boolean {
    return isCN(code);
  },
  async fetch(req: NewsRequest, signal: AbortSignal): Promise<NewsItem[]> {
    const items = process.env.NODE_ENV === 'test' || !process.env.FISH_PAN_LIVE_NEWS
      ? await mockEastmoneySearch(req)
      : await liveEastmoneySearch(req, signal);
    // Reject malformed records before returning.
    return items.filter((it) => {
      const okTitle = stripHtml(it.title).length > 0;
      const okUrl = isSafeUrl(it.url);
      const okTime = Number.isFinite(it.publishedAt);
      return okTitle && okUrl && okTime;
    });
  },
};