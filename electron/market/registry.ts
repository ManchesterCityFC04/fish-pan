// Unified in-process MarketData engine covering 7 DataKinds:
//   market-data-engine: quote | kline | market | funds
//   market-news-events: news | announcement | flash
// Responsibilities:
//  - register/lookup vendors by (kind, priority)
//  - TTL cache + in-flight coalescing keyed by `${kind}:${code}[:klt|:category]`
//  - failure isolation (one vendor throwing does not poison siblings)
//  - structured error when all vendors fail
//  - per-vendor health snapshot

import fs from 'node:fs';
import path from 'node:path';
import type {
  AnyDataKind,
  MarketDataKind,
  MarketError,
  MarketRequest,
  MarketResult,
  MarketVendor,
  NewsDataKind,
  NewsFetchResult,
  NewsItem,
  NewsRequest,
  NewsVendor,
  VendorHealth,
} from './types';
import { dedupeNews } from './dedupe';

type DatasourcesConfig = {
  kinds: Record<AnyDataKind, { ttlMs: number; inFlightMs: number; concurrency: number }>;
  vendors: Record<string, { kind: AnyDataKind; priority: number; enabled?: boolean }>;
};

const DEFAULT_CONFIG: DatasourcesConfig = {
  kinds: {
    quote:        { ttlMs: 1500,   inFlightMs: 1500, concurrency: 4 },
    kline:        { ttlMs: 60000,  inFlightMs: 2000, concurrency: 2 },
    market:       { ttlMs: 8000,   inFlightMs: 1000, concurrency: 1 },
    funds:        { ttlMs: 15000,  inFlightMs: 1000, concurrency: 2 },
    news:         { ttlMs: 600000, inFlightMs: 1000, concurrency: 2 },
    announcement: { ttlMs: 1800000, inFlightMs: 2000, concurrency: 1 },
    flash:        { ttlMs: 120000, inFlightMs: 1000, concurrency: 1 },
  },
  vendors: {
    'sina-quote':               { kind: 'quote',        priority: 1, enabled: true },
    'tencent-quote':            { kind: 'quote',        priority: 2, enabled: false },
    'eastmoney-kline':          { kind: 'kline',        priority: 1, enabled: true },
    'tencent-kline':            { kind: 'kline',        priority: 2, enabled: false },
    'eastmoney-market':         { kind: 'market',       priority: 1, enabled: true },
    'eastmoney-funds':          { kind: 'funds',        priority: 1, enabled: true },
    'eastmoney-search':         { kind: 'news',         priority: 1, enabled: true },
    'xueqiu-news':              { kind: 'news',         priority: 2, enabled: true },
    'eastmoney-announcement':   { kind: 'announcement', priority: 1, enabled: true },
    'eastmoney-flash':          { kind: 'flash',        priority: 1, enabled: true },
    'cls-flash':                { kind: 'flash',        priority: 2, enabled: true },
  },
};

function loadConfig(): DatasourcesConfig {
  const candidates = [
    path.join(__dirname, 'datasources.json'),
    path.join(__dirname, '..', 'market', 'datasources.json'),
    path.join(process.cwd(), 'electron', 'market', 'datasources.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as DatasourcesConfig;
      return { ...DEFAULT_CONFIG, ...parsed, kinds: { ...DEFAULT_CONFIG.kinds, ...(parsed.kinds || {}) } };
    } catch {
      // ignore and try next
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn('[fish-pan] datasources.json not found, using defaults');
  }
  return DEFAULT_CONFIG;
}

interface CacheEntry {
  result: MarketResult<unknown> | NewsFetchResult;
  cachedAt: number;
}

class KeyedPromiseCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<MarketResult<unknown> | NewsFetchResult>>();

  async getOrFetch(
    key: string,
    ttlMs: number,
    fetch: () => Promise<MarketResult<unknown> | NewsFetchResult>,
  ): Promise<MarketResult<unknown> | NewsFetchResult> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.cachedAt < ttlMs) {
      return cached.result;
    }
    const inFlight = this.inflight.get(key);
    if (inFlight) return inFlight;

    const p = (async () => {
      try {
        const result = await fetch();
        this.cache.set(key, { result, cachedAt: Date.now() });
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  reset(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }
}

class HealthTracker {
  private readonly state = new Map<string, VendorHealth>();
  get(id: string, kind: AnyDataKind): VendorHealth {
    let h = this.state.get(id);
    if (!h) {
      h = { id, kind, ok: 0, fail: 0 };
      this.state.set(id, h);
    }
    return h;
  }
  recordOk(id: string, kind: AnyDataKind): void {
    const h = this.get(id, kind);
    h.ok += 1;
    delete h.lastError;
  }
  recordFail(id: string, kind: AnyDataKind, message: string): void {
    const h = this.get(id, kind);
    h.fail += 1;
    h.lastError = message;
  }
  snapshot(): VendorHealth[] {
    return Array.from(this.state.values());
  }
}

function makeError(kind: MarketError['kind'], vendor?: string, message?: string): MarketError {
  return { kind, vendor, message };
}

/** Unified engine covering all 7 DataKinds. */
export class MarketData {
  private readonly marketVendors = new Map<MarketDataKind, MarketVendor<unknown>[]>();
  private readonly newsVendors = new Map<NewsDataKind, NewsVendor[]>();
  private readonly cache: KeyedPromiseCache;
  private readonly health = new HealthTracker();
  private readonly config: DatasourcesConfig;

  constructor(config: DatasourcesConfig = loadConfig()) {
    this.config = config;
    this.cache = new KeyedPromiseCache(config);
  }

  registerMarketVendor(vendor: MarketVendor<unknown>): void {
    const list = this.marketVendors.get(vendor.kind) ?? [];
    if (list.some((v) => v.id === vendor.id)) return;
    list.push(vendor);
    list.sort((a, b) => this.priorityOf(a.id) - this.priorityOf(b.id));
    this.marketVendors.set(vendor.kind, list);
    this.health.get(vendor.id, vendor.kind);
  }

  registerNewsVendor(vendor: NewsVendor): void {
    const list = this.newsVendors.get(vendor.kind) ?? [];
    if (list.some((v) => v.id === vendor.id)) return;
    list.push(vendor);
    list.sort((a, b) => this.priorityOf(a.id) - this.priorityOf(b.id));
    this.newsVendors.set(vendor.kind, list);
    this.health.get(vendor.id, vendor.kind);
  }

  private priorityOf(vendorId: string): number {
    return this.config.vendors[vendorId]?.priority ?? 100;
  }

  private ttlFor(kind: AnyDataKind): number {
    return this.config.kinds[kind]?.ttlMs ?? 60000;
  }

  private marketCandidates(kind: MarketDataKind, req: MarketRequest): MarketVendor<unknown>[] {
    const list = this.marketVendors.get(kind) ?? [];
    return list.filter((v) => {
      if (!this.config.vendors[v.id]?.enabled) return false;
      return v.supports(req);
    });
  }

  private newsCandidates(kind: NewsDataKind, code: string): NewsVendor[] {
    const list = this.newsVendors.get(kind) ?? [];
    return list.filter((v) => {
      if (!this.config.vendors[v.id]?.enabled) return false;
      return v.supports(code);
    });
  }

  async fetch(req: MarketRequest, signal?: AbortSignal): Promise<MarketResult<unknown>> {
    const key = `${req.kind}:${req.code}:${req.klt ?? ''}:${req.category ?? ''}`;
    return (await this.cache.getOrFetch(key, this.ttlFor(req.kind), () =>
      this.runMarketOnce(req, signal ?? new AbortController().signal),
    )) as MarketResult<unknown>;
  }

  async fetchNews(req: NewsRequest, signal?: AbortSignal): Promise<NewsFetchResult> {
    const key = `${req.kind}:${req.code}`;
    return (await this.cache.getOrFetch(key, this.ttlFor(req.kind), () =>
      this.runNewsOnce(req, signal ?? new AbortController().signal),
    )) as NewsFetchResult;
  }

  async fetchFlash(signal?: AbortSignal): Promise<NewsFetchResult> {
    const key = `flash:market`;
    return (await this.cache.getOrFetch(key, this.ttlFor('flash'), () =>
      this.runNewsOnce({ kind: 'flash', code: '' }, signal ?? new AbortController().signal),
    )) as NewsFetchResult;
  }

  status(): { vendors: VendorHealth[] } {
    return { vendors: this.health.snapshot() };
  }

  resetCache(): void {
    this.cache.reset();
  }

  private async runMarketOnce(req: MarketRequest, signal: AbortSignal): Promise<MarketResult<unknown>> {
    const list = this.marketCandidates(req.kind, req);
    if (list.length === 0) {
      return { data: null, error: makeError('not-applicable', undefined, `no market vendor for ${req.kind}`) };
    }
    let lastError: MarketError | null = null;
    for (const vendor of list) {
      try {
        const data = await vendor.fetch(req, signal);
        this.health.recordOk(vendor.id, vendor.kind);
        return { data, staleAfter: Date.now() + this.ttlFor(vendor.kind) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.health.recordFail(vendor.id, vendor.kind, message);
        lastError = makeError('all-failed', vendor.id, message);
      }
    }
    return { data: null, error: lastError ?? makeError('all-failed') };
  }

  private async runNewsOnce(req: NewsRequest, signal: AbortSignal): Promise<NewsFetchResult> {
    const list = this.newsCandidates(req.kind, req.code);
    if (list.length === 0) {
      return { data: null, error: { kind: 'not-applicable', message: 'no news vendor' } };
    }
    const collected: NewsItem[] = [];
    let allFailed = true;
    let lastError: { vendor: string; message: string } | null = null;
    for (const vendor of list) {
      try {
        const items = await vendor.fetch(req, signal);
        this.health.recordOk(vendor.id, vendor.kind);
        if (items && items.length) {
          collected.push(...items);
          allFailed = false;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.health.recordFail(vendor.id, vendor.kind, message);
        lastError = { vendor: vendor.id, message };
      }
    }
    if (allFailed) {
      return {
        data: null,
        error: {
          kind: 'all-failed',
          vendor: lastError?.vendor,
          message: lastError?.message,
        },
      };
    }
    const dedup = dedupeNews(collected);
    return { data: dedup.items };
  }
}

let singleton: MarketData | null = null;

/** Lazy singleton accessor. */
export function getMarketData(): MarketData {
  if (!singleton) singleton = new MarketData();
  return singleton;
}

/** Test seam. */
export function __resetMarketDataForTests(): void {
  singleton = null;
}

/** Back-compat alias for market-news-events. */
export function getNewsEngine(): MarketData {
  return getMarketData();
}