// Shared types for the market-data-engine + market-news-events.
// market-data-engine: quote | kline | market | funds
// market-news-events: news | announcement | flash
// Mirrors the contract in docs/superpowers/specs/2026-07-28-market-data-engine-design.md §3 and
// docs/superpowers/specs/2026-07-28-market-news-events-design.md §3.

export type MarketDataKind = 'quote' | 'kline' | 'market' | 'funds';
export type NewsDataKind = 'news' | 'announcement' | 'flash';
export type AnyDataKind = MarketDataKind | NewsDataKind;

export interface MarketRequest {
  kind: MarketDataKind;
  code: string;
  // kline 专用
  klt?: 'm1' | 'm5' | 'm15' | 'm30' | 'm60' | 'day' | 'week' | 'month' | 'trend';
  len?: number;
  // funds 专用
  category?: 'industry' | 'concept' | 'stock';
  limit?: number;
  // quote 专用：批量
  codes?: string[];
}

export interface MarketResult<T> {
  data: T | null;
  error?: MarketError;
  staleAfter?: number;
}

export interface MarketError {
  kind: 'all-failed' | 'not-applicable' | 'no-main' | 'invalid-input' | string;
  vendor?: string;
  message?: string;
}

export interface MarketVendor<T> {
  id: string;
  kind: MarketDataKind;
  supports(req: MarketRequest): boolean;
  fetch(req: MarketRequest, signal: AbortSignal): Promise<T>;
}

export interface NewsItem {
  /** Stable id: `${kind}:${vendorId}:${rawId | urlHash}` */
  id: string;
  kind: NewsDataKind;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  summary?: string;
  codes: string[];
  lang: 'zh-CN';
}

export interface NewsRequest {
  kind: NewsDataKind;
  code: string;
}

export interface MarketError {
  kind: 'all-failed' | 'not-applicable' | 'no-main' | string;
  vendor?: string;
  message?: string;
}

export interface NewsFetchOk {
  data: NewsItem[];
  error?: undefined;
}

export interface NewsFetchErr {
  data: null;
  error: MarketError;
}

export type NewsFetchResult = NewsFetchOk | NewsFetchErr;

export interface NewsVendor {
  id: string;
  kind: NewsDataKind;
  /** Market gating: returns false when the vendor has no data for the market. */
  supports(code: string): boolean;
  fetch(req: NewsRequest, signal: AbortSignal): Promise<NewsItem[]>;
}

export interface VendorHealth {
  id: string;
  kind: AnyDataKind;
  ok: number;
  fail: number;
  lastError?: string;
}