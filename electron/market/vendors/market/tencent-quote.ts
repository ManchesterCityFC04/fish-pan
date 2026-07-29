// Tencent 个股报价 Vendor (fallback, 默认 disabled via datasources.json).
// 字段校准状态: mock-only；UA 限制较严；live 路径需评估页面限流。
// 安全: 仅 https；不绕过 TLS。

import type { MarketRequest, MarketVendor } from '../../types';

const VENDOR_ID = 'tencent-quote';

export const tencentQuote: MarketVendor<unknown> = {
  id: VENDOR_ID,
  kind: 'quote',
  supports(req: MarketRequest): boolean {
    return !!(req.codes?.length || req.code);
  },
  async fetch(_req: MarketRequest, _signal: AbortSignal): Promise<unknown> {
    // 默认禁用；启用时由 datasources.json 切换。
    throw new Error('tencent-quote vendor disabled');
  },
};