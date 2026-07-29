// Public entry for the unified MarketData engine.
// Registers all built-in vendors against the lazy singleton.
// Covers both market-data-engine (quote | kline | market | funds)
// and market-news-events (news | announcement | flash).

import { getMarketData } from './registry';
import { sinaQuote } from './vendors/market/sina-quote';
import { tencentQuote } from './vendors/market/tencent-quote';
import { eastmoneyKline } from './vendors/market/eastmoney-kline';
import { tencentKline } from './vendors/market/tencent-kline';
import { eastmoneyMarket } from './vendors/market/eastmoney-market';
import { eastmoneyFunds } from './vendors/market/eastmoney-funds';
import { eastmoneySearch } from './vendors/news/eastmoney-search';
import { xueqiuNews } from './vendors/news/xueqiu-news';
import { eastmoneyAnnouncement } from './vendors/news/eastmoney-announcement';
import { eastmoneyFlash } from './vendors/news/eastmoney-flash';
import { clsFlash } from './vendors/news/cls-flash';

let registered = false;

export function ensureMarketDataVendorsRegistered(): void {
  if (registered) return;
  const m = getMarketData();
  m.registerMarketVendor(sinaQuote);
  m.registerMarketVendor(tencentQuote);
  m.registerMarketVendor(eastmoneyKline);
  m.registerMarketVendor(tencentKline);
  m.registerMarketVendor(eastmoneyMarket);
  m.registerMarketVendor(eastmoneyFunds);
  m.registerNewsVendor(eastmoneySearch);
  m.registerNewsVendor(xueqiuNews);
  m.registerNewsVendor(eastmoneyAnnouncement);
  m.registerNewsVendor(eastmoneyFlash);
  m.registerNewsVendor(clsFlash);
  registered = true;
}

ensureMarketDataVendorsRegistered();

export { getMarketData, getNewsEngine } from './registry';
export type {
  MarketDataKind,
  MarketRequest,
  MarketResult,
  MarketVendor,
  MarketError,
  NewsDataKind,
  NewsItem,
  NewsFetchResult,
  NewsRequest,
  VendorHealth,
} from './types';
export { stripHtml, truncateSummary, hashTitle, makeNewsId, normalizeCode, isSafeUrl } from './normalize';
export { dedupeNews } from './dedupe';