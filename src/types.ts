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

// 价格提醒
export type AlertType = 'price_above' | 'price_below' | 'pct_above' | 'pct_below';
export interface Alert {
  id?: number;
  code: string;
  type: AlertType;
  value: number;
  enabled: boolean;
  triggered: boolean;
}

// 隐身皮肤
export type DisguiseSkin = 'clock' | 'monitor';

// K线
export type KLinePeriod = 'day' | 'week' | 'month';
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
}
export interface SaveAlertInput {
  id?: number;
  code: string;
  type: AlertType;
  value: number;
  enabled: boolean;
  triggered: boolean;
}

// Electron API 类型声明
export interface ElectronAPI {
  minimize: () => void;
  close: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
  notify: (title: string, body: string) => void;
  onToggleDisguise: (cb: () => void) => void;
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
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
