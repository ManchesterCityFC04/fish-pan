// 财联社电报 市场快讯 Vendor.
// 字段校准状态: 未实接 — 当前为 mock 路径。
// GBK 解码风险：财联社 endpoint 历史返回 GBK；live 路径必须正确解码。

import type { NewsItem, NewsVendor } from '../../types';
import { isSafeUrl, makeNewsId, stripHtml, truncateSummary } from '../../normalize';

const VENDOR_ID = 'cls-flash';
const SOURCE = '财联社';

async function mockClsFlash(): Promise<NewsItem[]> {
  const now = Date.now();
  return [
    {
      id: makeNewsId('flash', VENDOR_ID, `flash:cls:${now - 1000 * 60 * 2}`),
      kind: 'flash',
      title: '财联社快讯：某新能源车企发布最新交付数据',
      url: 'https://example.com/cls-flash/0',
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 2,
      summary: truncateSummary('新能源车企公布最新月度交付数据，同比增长超过市场预期。'),
      codes: [],
      lang: 'zh-CN',
    },
    {
      id: makeNewsId('flash', VENDOR_ID, `flash:cls:${now - 1000 * 60 * 5}`),
      kind: 'flash',
      title: '财联社快讯：某券商发布行业深度报告',
      url: 'https://example.com/cls-flash/1',
      source: SOURCE,
      publishedAt: now - 1000 * 60 * 5,
      codes: [],
      lang: 'zh-CN',
    },
  ];
}

export const clsFlash: NewsVendor = {
  id: VENDOR_ID,
  kind: 'flash',
  supports(): boolean {
    return true;
  },
  async fetch(req, signal: AbortSignal): Promise<NewsItem[]> {
    void req;
    void signal;
    const items = await mockClsFlash();
    return items.filter((it) => {
      const okTitle = stripHtml(it.title).length > 0;
      const okUrl = isSafeUrl(it.url);
      const okTime = Number.isFinite(it.publishedAt);
      return okTitle && okUrl && okTime;
    });
  },
};