// 东方财富 市场快讯 Vendor.
// 字段校准状态: 未实接 — 当前为 mock 路径。
// GBK 解码风险：东方财富快讯历史返回 GBK；live 路径必须正确解码。

import type { NewsItem, NewsVendor } from '../../types';
import { isSafeUrl, makeNewsId, stripHtml, truncateSummary } from '../../normalize';

const VENDOR_ID = 'eastmoney-flash';
const SOURCE = '东方财富';

async function mockEastmoneyFlash(): Promise<NewsItem[]> {
  const now = Date.now();
  return [
    {
      id: makeNewsId('flash', VENDOR_ID, `flash:em:${now - 1000 * 60}`),
      kind: 'flash',
      title: '午盘：三大指数小幅上涨，沪指收复 3300 点',
      url: 'https://example.com/em-flash/0',
      source: SOURCE,
      publishedAt: now - 1000 * 60,
      summary: truncateSummary('午盘快讯，沪指小幅上涨，板块轮动加速。'),
      codes: [],
      lang: 'zh-CN',
    },
    {
      id: makeNewsId('flash', VENDOR_ID, `flash:em:${now - 1000 * 60 * 30}`),
      kind: 'flash',
      title: '央行公开市场操作净投放 2000 亿元',
      url: 'https://example.com/em-flash/1',
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 30,
      codes: [],
      lang: 'zh-CN',
    },
  ];
}

export const eastmoneyFlash: NewsVendor = {
  id: VENDOR_ID,
  kind: 'flash',
  supports(): boolean {
    return true;
  },
  async fetch(req, signal: AbortSignal): Promise<NewsItem[]> {
    void req;
    void signal;
    const items = await mockEastmoneyFlash();
    return items.filter((it) => {
      const okTitle = stripHtml(it.title).length > 0;
      const okUrl = isSafeUrl(it.url);
      const okTime = Number.isFinite(it.publishedAt);
      return okTitle && okUrl && okTime;
    });
  },
};