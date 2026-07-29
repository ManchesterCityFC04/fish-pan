// Sina 个股报价 Vendor (主力).
// 字段校准状态: 未实接 — 当前 mock-only；等 1/6 在线烟雾阶段替换 liveSinaQuote()。
// ToS: 新浪 hq.sinajs.cn 公共页面，需要 Referer 头；不得高频抓取。
// 安全: 仅 https；不绕过 TLS（无 verify=false / rejectUnauthorized=false）。

import type { MarketRequest, MarketVendor } from '../../types';

const VENDOR_ID = 'sina-quote';

interface SinaQuoteRow {
  code: string;
  name: string;
  price: number | null;
  open: number | null;
  prevClose: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
}

async function mockSinaQuote(req: MarketRequest): Promise<SinaQuoteRow[]> {
  const codes = (req.codes && req.codes.length ? req.codes : [req.code]).filter(Boolean);
  return codes.map((code, idx) => {
    const base = 10 + idx * 2.5;
    return {
      code,
      name: `Mock ${code}`,
      price: base + 0.3,
      open: base - 0.2,
      prevClose: base - 0.1,
      high: base + 0.5,
      low: base - 0.4,
      change: 0.4,
      changePct: 0.4 / (base - 0.1) * 100,
      volume: 100000 + idx * 12345,
    };
  });
}

export const sinaQuote: MarketVendor<SinaQuoteRow[]> = {
  id: VENDOR_ID,
  kind: 'quote',
  supports(req: MarketRequest): boolean {
    return !!(req.codes?.length || req.code);
  },
  async fetch(req: MarketRequest, signal: AbortSignal): Promise<SinaQuoteRow[]> {
    void signal;
    return mockSinaQuote(req);
  },
};