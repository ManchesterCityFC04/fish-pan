// 雪球 个股新闻 Vendor (补全源)。
// 字段校准状态: 未实接 — 当前为 mock 路径。
// ToS 提示: 雪球 UA 限制较严；默认频次为 TTL=10 分钟；不绕过鉴权。
// 安全: 不绕过 TLS；仅 https。

import type { NewsItem, NewsRequest, NewsVendor } from '../../types';
import { isSafeUrl, makeNewsId, normalizeCode, stripHtml, truncateSummary } from '../../normalize';

const VENDOR_ID = 'xueqiu-news';
const SOURCE = '雪球';

function isCN(code: string): boolean {
  return /^(sh|sz|bj)\d{6}$/.test(code);
}

async function mockXueqiuNews(req: NewsRequest): Promise<NewsItem[]> {
  const code = normalizeCode(req.code) || req.code;
  const now = Date.now();
  // 故意制造一条与 eastmoney-search 同 url 的重复记录，用于跨 Vendor 去重验证。
  return [
    {
      id: makeNewsId(req.kind, VENDOR_ID, `${code}:xq0`),
      kind: req.kind,
      title: `${code} 用户热议：分红预期升温`,
      url: 'https://example.com/em-news/0', // duplicate of EM record 0
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 25, // more recent than EM's mock
      summary: truncateSummary('雪球用户讨论区近期关注分红预期，多位用户分享研报观点。'),
      codes: [code],
      lang: 'zh-CN',
    },
    {
      id: makeNewsId(req.kind, VENDOR_ID, `${code}:xq1`),
      kind: req.kind,
      title: `${code} 大 V 观点：估值修复在路上`,
      url: 'https://example.com/xq-news/1',
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 60 * 6,
      codes: [code],
      lang: 'zh-CN',
    },
  ];
}

export const xueqiuNews: NewsVendor = {
  id: VENDOR_ID,
  kind: 'news',
  supports(code: string): boolean {
    return isCN(code);
  },
  async fetch(req: NewsRequest, signal: AbortSignal): Promise<NewsItem[]> {
    void signal;
    const items = await mockXueqiuNews(req);
    return items.filter((it) => {
      const okTitle = stripHtml(it.title).length > 0;
      const okUrl = isSafeUrl(it.url);
      const okTime = Number.isFinite(it.publishedAt);
      return okTitle && okUrl && okTime;
    });
  },
};