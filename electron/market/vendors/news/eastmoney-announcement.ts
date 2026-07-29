// 东方财富 公司公告 Vendor.
// 字段校准状态: 未实接 — 当前为 mock 路径。
// 摘要 > 200 字会被 truncateSummary 自动截断并加省略号。

import type { NewsItem, NewsRequest, NewsVendor } from '../../types';
import { isSafeUrl, makeNewsId, normalizeCode, stripHtml, truncateSummary } from '../../normalize';

const VENDOR_ID = 'eastmoney-announcement';
const SOURCE = '东方财富';

function isCN(code: string): boolean {
  return /^(sh|sz|bj)\d{6}$/.test(code);
}

async function mockEastmoneyAnnouncement(req: NewsRequest): Promise<NewsItem[]> {
  const code = normalizeCode(req.code) || req.code;
  const now = Date.now();
  const longSummary = `公司今日发布关于 ${code} 的公告，内容涉及：1. 业务进展；2. 财务数据；3. 风险提示；4. 后续计划；5. 投资者关系活动。本公告为正常信息披露范畴，已按交易所规则及时披露，详细信息以正式公告全文为准，请投资者注意投资风险并理性看待市场波动，文中所述观点不代表公司立场，公告内容如需进一步解读请联系投资者关系部门处理。`;
  return [
    {
      id: makeNewsId(req.kind, VENDOR_ID, `${code}:a0`),
      kind: req.kind,
      title: `${code} 第三季度报告`,
      url: 'https://example.com/em-announce/0',
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 60,
      summary: truncateSummary(longSummary),
      codes: [code],
      lang: 'zh-CN',
    },
    {
      id: makeNewsId(req.kind, VENDOR_ID, `${code}:a1`),
      kind: req.kind,
      title: `${code} 利润分配预案公告`,
      url: 'https://example.com/em-announce/1',
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 60 * 24,
      codes: [code],
      lang: 'zh-CN',
    },
    // 故意制造一条缺 url 的记录以验证 validateResult 行为。
    {
      id: makeNewsId(req.kind, VENDOR_ID, `${code}:a2`),
      kind: req.kind,
      title: `${code} 临时公告（URL 缺失）`,
      url: '',
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 60 * 48,
      codes: [code],
      lang: 'zh-CN',
    } as NewsItem,
  ];
}

export const eastmoneyAnnouncement: NewsVendor = {
  id: VENDOR_ID,
  kind: 'announcement',
  supports(code: string): boolean {
    return isCN(code);
  },
  async fetch(req: NewsRequest, signal: AbortSignal): Promise<NewsItem[]> {
    void signal;
    const items = await mockEastmoneyAnnouncement(req);
    return items.filter((it) => {
      const okTitle = stripHtml(it.title).length > 0;
      const okUrl = isSafeUrl(it.url);
      const okTime = Number.isFinite(it.publishedAt);
      return okTitle && okUrl && okTime;
    });
  },
};