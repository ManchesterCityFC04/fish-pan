// Eastmoney K线 Vendor (主力).
// 字段校准状态: mock-only；live 路径需评估 push2his.eastmoney.com 字段。
// 安全: 仅 https；不绕过 TLS。

import type { KLineBar, MarketRequest, MarketVendor } from '../../types';

const VENDOR_ID = 'eastmoney-kline';

interface KLineResult {
  bars: KLineBar[];
  preClose: number;
  name: string;
}

async function mockEastmoneyKline(req: MarketRequest): Promise<KLineResult> {
  const code = req.code || 'sh000000';
  const klt = req.klt || 'day';
  const len = req.len || 30;
  const preClose = 10;
  const now = Date.now();
  const bars: KLineBar[] = [];
  for (let i = 0; i < len; i++) {
    const v = preClose + Math.sin(i / 3) * 0.5;
    bars.push({
      date: String(now - (len - i) * 86400000).slice(0, 10),
      open: Number((v - 0.1).toFixed(3)),
      close: Number(v.toFixed(3)),
      high: Number((v + 0.2).toFixed(3)),
      low: Number((v - 0.3).toFixed(3)),
      volume: 1000 + i * 7,
    });
  }
  return { bars, preClose, name: `Mock ${code} ${klt}` };
}

export const eastmoneyKline: MarketVendor<KLineResult> = {
  id: VENDOR_ID,
  kind: 'kline',
  supports(req: MarketRequest): boolean {
    return !!(req.code && req.klt);
  },
  async fetch(req: MarketRequest, signal: AbortSignal): Promise<KLineResult> {
    void signal;
    return mockEastmoneyKline(req);
  },
};