// Tencent K线 fallback (默认 disabled).
// 字段校准状态: mock-only；fallback 路径。
// 安全: 仅 https。

import type { MarketRequest, MarketVendor } from '../../types';

const VENDOR_ID = 'tencent-kline';

export const tencentKline: MarketVendor<unknown> = {
  id: VENDOR_ID,
  kind: 'kline',
  supports(req: MarketRequest): boolean {
    return !!(req.code && req.klt);
  },
  async fetch(_req: MarketRequest, _signal: AbortSignal): Promise<unknown> {
    throw new Error('tencent-kline vendor disabled');
  },
};