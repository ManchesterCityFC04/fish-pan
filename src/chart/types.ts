// K 线图表相关的纯类型；不依赖 React/Canvas API。

export interface IndicatorState {
  ma: boolean;
  boll: boolean;
  macd: boolean;
  rsi: boolean;
  kdj: boolean;
}

export const DEFAULT_INDICATORS: IndicatorState = {
  ma: true,
  boll: false,
  macd: false,
  rsi: false,
  kdj: false,
};

export const INDICATORS_KEY = 'fish-pan:indicators';

export interface TrendLine {
  i1: number;
  p1: number;
  // 完成态才有 i2/p2；进行中（用户只点了第一点）时省略。
  i2?: number;
  p2?: number;
}

export interface Geom {
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  volH: number;
  gap: number;
  chartH: number;
  plotW: number;
  max: number;
  min: number;
  slot: number;
  n: number;
  panelT: number; // 副区起始 y（含成交量下方）
  panelH: number; // 单个副区高度
}