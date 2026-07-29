// 股票行情数据结构
export interface StockQuote {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  prevClose: number | null;
  error: string | null;
}

// 用户自选股
export interface StockItem {
  code: string;
  name: string;
}

// 账户与持仓（portfolio-positions）
export interface Account {
  id: number;
  name: string;
  baseCurrency: 'CNY' | 'USD' | 'HKD';
  createdAt: number;
}

export interface Position {
  id: number;
  accountId: number;
  code: string;
  shares: number;
  costPrice: number;
  openedAt: number;
  notes: string | null;
}

// 价格提醒
export type AlertType = 'price_above' | 'price_below' | 'pct_above' | 'pct_below';
export interface Alert {
  id?: number;
  code: string;
  type: AlertType;
  value: number;
  enabled: boolean;
  triggered: boolean;
  // 阈值穿越所需的上一观察值；首次观察时为 null
  prevValue: number | null;
  // 冷却时间（毫秒）。0 表示无冷却
  cooldownMs: number;
  // 最近一次触发时间（毫秒）。0 表示尚未触发
  lastTriggeredAt: number | null;
}

// 触发历史（独立于规则管理）
export interface AlertEvent {
  id: number;
  alertId: number | null;
  code: string;
  type: AlertType;
  threshold: number;
  observed: number;
  direction: 'into-matching' | 'out-of-matching';
  cooldownMs: number;
  triggeredAt: number;
  notificationStatus: 'sent' | 'failed' | 'no-notification';
}

// AI 分析历史（独立 ai-analysis-history 能力）
export type AIAnalysisKind = 'news' | 'kline' | 'diagnosis';
export interface AIAnalysisSummary {
  id: number;
  kind: AIAnalysisKind;
  code: string;
  model: string;
  createdAt: number;
  promptId: string;
  inputSummary: string;
}
export interface AIAnalysis extends AIAnalysisSummary {
  responseJson: string;
  rating: number | null;
}

// 隐身皮肤
export type DisguiseSkin = 'clock' | 'monitor';

// K线
export type KLinePeriod = 'day' | 'week' | 'month' | 'm1' | 'm5' | 'm15' | 'm30' | 'm60';
export interface KLineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount?: number;
  average?: number;
}

// 大盘指数
export interface MarketIndex {
  code: string;
  name: string;
  price: number;
  changePct: number;
  change: number;
  amount: number;
}

// 资金流条目
export interface FundFlowItem {
  code: string;
  name: string;
  price: number;
  changePct: number;
  mainNet: number;
  mainRatio: number;
  superNet: number;
  largeNet: number;
  mediumNet: number;
  smallNet: number;
  leaderName: string;
  leaderCode: string;
  market: number;
}

// 数据库相关
export interface DbStock {
  code: string;
  name: string;
}
export interface DbAlert {
  id: number;
  code: string;
  type: AlertType;
  value: number;
  enabled: boolean;
  triggered: boolean;
  cooldownMs: number;
  prevValue: number | null;
  lastTriggeredAt: number | null;
  lastNotifiedValue: number | null;
}
export interface SaveAlertInput {
  id?: number;
  code: string;
  type: AlertType;
  value: number;
  // 保持向后兼容；不传时取默认 10 分钟
  cooldownMs?: number;
}

// Electron API 类型声明
export interface AlertActivationContext {
  alertId?: number | null;
  code?: string | null;
}
export interface ElectronAPI {
  minimize: () => void;
  close: () => void;
  dataSource?: {
    status: () => Promise<MarketStatusResult>;
    test: () => Promise<MarketStatusResult>;
  };
  news?: {
    list: (kind: NewsDataKind, code: string) => Promise<NewsFetchResult>;
    flash: () => Promise<NewsFetchResult>;
    status: () => Promise<NewsStatusResult>;
  };
  setAlwaysOnTop: (flag: boolean) => void;
  notify: (title: string, body: string, ctx?: AlertActivationContext) => void;
  onToggleDisguise: (cb: () => void) => void;
  onAlertActivation: (cb: (ctx: AlertActivationContext) => void) => void;
  resize: (w: number, h: number) => void;
  fetchKline: (
    code: string,
    kind: 'trend' | 'kline',
    klt: number,
    len: number
  ) => Promise<{ bars: KLineBar[]; preClose: number; name: string; error?: string }>;
  fetchMarket: () => Promise<{ rows: MarketIndex[]; error?: string }>;
  fetchFunds: (
    category: 'industry' | 'concept' | 'stock',
    limit?: number
  ) => Promise<{ rows: FundFlowItem[]; error?: string }>;
  fetchQuotes: (codes: string[]) => Promise<string>;
  db?: {
    getStocks: () => Promise<DbStock[]>;
    addStock: (code: string, name: string) => Promise<void>;
    removeStock: (code: string) => Promise<void>;
    getAlerts: () => Promise<DbAlert[]>;
    saveAlert: (a: SaveAlertInput) => Promise<number | null>;
    deleteAlert: (id: number) => Promise<void>;
    setAlertTriggered: (id: number, triggered: boolean) => Promise<void>;
    setAlertEnabled: (id: number, enabled: boolean) => Promise<void>;
    setAlertCooldown: (id: number, cooldownMs: number) => Promise<void>;
    rearmAlert: (id: number) => Promise<void>;
    setAlertPrevValue: (id: number, value: number | null) => Promise<void>;
    insertAlertEvent: (evt: {
      alertId: number;
      code: string;
      type: AlertType;
      threshold: number;
      observed: number;
      direction: AlertEvent['direction'];
      cooldownMs: number;
      triggeredAt: number;
      notificationStatus: AlertEvent['notificationStatus'];
    }) => Promise<void>;
    listAlertEvents: (limit?: number) => Promise<AlertEvent[]>;
    clearAlertEvents: () => Promise<void>;
    // AI 分析历史
    insertAIAnalysis: (a: {
      kind: AIAnalysisKind;
      code: string;
      model: string;
      createdAt?: number;
      promptId: string;
      inputSummary: string;
      responseJson: string | object;
      rating?: number | null;
    }) => Promise<number | null>;
    listAIAnalyses: (filter?: { limit?: number; kind?: AIAnalysisKind; code?: string }) => Promise<AIAnalysisSummary[]>;
    getAIAnalysis: (id: number) => Promise<AIAnalysis | null>;
    deleteAIAnalysis: (id: number) => Promise<void>;
    clearAIAnalyses: () => Promise<void>;
    // 设置导入导出
    exportBundle: (opts?: { includeSecrets?: boolean; targetPath?: string }) => Promise<{
      ok?: boolean; canceled?: boolean; error?: string; path?: string;
      counts?: { watchlist: number; alerts: number; alertEvents: number; aiAnalyses: number };
    }>;
    importBundle: (opts?: { sourcePath?: string; targetPath?: string; replaceHistory?: boolean }) => Promise<{
      ok?: boolean; canceled?: boolean; error?: string;
      counts?: { watchlist: number; alerts: number; alertEvents: number; aiAnalyses: number };
    }>;
    // 账户与持仓（portfolio-positions）
    account: {
      list: () => Promise<Account[]>;
      add: (name: string, baseCurrency?: Account['baseCurrency']) => Promise<{ id: number }>;
      remove: (id: number) => Promise<void>;
    };
    position: {
      list: (accountId?: number) => Promise<Position[]>;
      add: (params: { accountId: number; code: string; shares: number; costPrice: number; openedAt?: number; notes?: string | null }) => Promise<{ id: number }>;
      remove: (id: number) => Promise<void>;
    };
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// ── 新闻 / 公告 / 快讯（market-news-events）──
export type NewsDataKind = 'news' | 'announcement' | 'flash';

export interface NewsItem {
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

export interface NewsMarketError {
  kind: 'all-failed' | 'not-applicable' | 'no-main' | 'invalid-input' | string;
  vendor?: string;
  message?: string;
}

export interface NewsFetchResult {
  data: NewsItem[] | null;
  error?: NewsMarketError;
}

export interface VendorHealthSummary {
  id: string;
  kind: NewsDataKind;
  ok: number;
  fail: number;
  lastError?: string;
}

export interface NewsStatusResult {
  vendors: VendorHealthSummary[];
  error?: NewsMarketError;
}

// ── 数据源健康度（market-data-engine）──
export interface MarketVendorHealth {
  id: string;
  kind: string;
  ok: number;
  fail: number;
  lastError?: string;
}

export interface MarketStatusResult {
  vendors: MarketVendorHealth[];
  error?: { kind: string; message?: string };
}
