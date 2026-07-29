// Eastmoney 大盘指数 Vendor.
// 字段校准状态: mock-only。
// 安全: 仅 https。

import type { MarketIndex, MarketRequest, MarketVendor } from '../../types';

const VENDOR_ID = 'eastmoney-market';

async function mockEastmoneyMarket(): Promise<{ rows: MarketIndex[] }> {
  const base = ['上证指数', '深证成指', '创业板指', '沪深300', '科创50'];
  return {
    rows: base.map((name, i) => ({
      code: ['sh000001', 'sz399001', 'sz399006', 'sh000300', 'sh000688'][i],
      name,
      price: 3300 + i * 50,
      changePct: 0.5 + i * 0.1,
      change: 12 + i,
      amount: 1e9 + i * 1e8,
    })),
  };
}

export const eastmoneyMarket: MarketVendor<{ rows: MarketIndex[] }> = {
  id: VENDOR_ID,
  kind: 'market',
  supports(): boolean {
    return true;
  },
  async fetch(_req: MarketRequest, signal: AbortSignal): Promise<{ rows: MarketIndex[] }> {
    void signal;
    return mockEastmoneyMarket();
  },
};