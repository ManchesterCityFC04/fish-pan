// Eastmoney 资金流 Vendor（行业 / 概念 / 个股）.
// 字段校准状态: mock-only。
// 安全: 仅 https。

import type { FundFlowItem, MarketRequest, MarketVendor } from '../../types';

const VENDOR_ID = 'eastmoney-funds';

interface FundsResult {
  rows: FundFlowItem[];
}

async function mockEastmoneyFunds(req: MarketRequest): Promise<FundsResult> {
  const category = req.category || 'industry';
  const limit = req.limit || 10;
  const rows: FundFlowItem[] = [];
  for (let i = 0; i < limit; i++) {
    rows.push({
      code: `${category}-${i}`,
      name: `${category} 行 ${i + 1}`,
      price: 100 + i * 1.7,
      changePct: 0.5 + i * 0.1,
      mainNet: 1e8 - i * 5e6,
      mainRatio: 1.2 + i * 0.05,
      superNet: 5e7 - i * 3e6,
      largeNet: 3e7 - i * 2e6,
      mediumNet: 1e7 - i * 1e6,
      smallNet: -5e6 + i * 5e5,
      leaderName: '',
      leaderCode: '',
      market: i % 2,
    });
  }
  return { rows };
}

export const eastmoneyFunds: MarketVendor<FundsResult> = {
  id: VENDOR_ID,
  kind: 'funds',
  supports(req: MarketRequest): boolean {
    return !!(req.category && ['industry', 'concept', 'stock'].includes(req.category));
  },
  async fetch(req: MarketRequest, signal: AbortSignal): Promise<FundsResult> {
    void signal;
    return mockEastmoneyFunds(req);
  },
};