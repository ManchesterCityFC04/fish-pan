// K 线主图绘制：网格、蜡烛/分时、均线、布林带、MACD/RSI/KDJ 副区、趋势线、十字光标。
// 零 React 依赖；唯一副作用是修改传入 canvas 的 2D 上下文。

import type { KLineBar } from '../types';
import {
  ma as calcMA,
  macd as calcMACD,
  rsi as calcRSI,
  kdj as calcKDJ,
  boll as calcBOLL,
} from '../indicators';
import type { IndicatorState, TrendLine } from './types';
import { DEFAULT_INDICATORS } from './types';
import { computeGeom } from './geom';

export interface DrawChartOptions {
  bars: KLineBar[];
  lineMode: boolean;
  preClose: number;
  hoverIdx: number | null;
  lines: TrendLine[];
  pending: { i: number; p: number } | null;
  ind?: IndicatorState;
}

const MA_COLORS: Array<{ win: number; color: string }> = [
  { win: 5, color: '#e0a96d' },
  { win: 10, color: '#8b7bd8' },
  { win: 20, color: '#22d3ee' },
  { win: 60, color: '#f472b6' },
];

// 在价格区画一条线序列。skipNull 控制遇到 null 时是否断开。
function drawSeries(
  ctx: CanvasRenderingContext2D,
  bars: KLineBar[],
  values: (number | null)[],
  xAt: (i: number) => number,
  yAt: (p: number) => number,
  color: string,
  lineWidth = 1,
  dash: number[] = []
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < bars.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const x = xAt(i);
    const y = yAt(v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// 在副区里画一条线（自定义 y 投影）。
function drawSeriesInPanel(
  ctx: CanvasRenderingContext2D,
  bars: KLineBar[],
  values: (number | null)[],
  xAt: (i: number) => number,
  toY: (v: number) => number,
  color: string
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < bars.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const x = xAt(i);
    const y = toY(v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function drawTrendLine(
  ctx: CanvasRenderingContext2D,
  xAt: (i: number) => number,
  yAt: (p: number) => number,
  a: { i: number; p: number },
  b: { i: number; p: number } | undefined,
  n: number,
  min: number,
  max: number,
  width: number,
  dash: number[]
): void {
  if (a.i < 0 || a.i >= n) return;
  if (a.p < min || a.p > max) return;
  ctx.strokeStyle = '#f2c94c';
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(xAt(a.i), yAt(a.p));
  if (b !== undefined) {
    if (b.i < 0 || b.i >= n) return;
    if (b.p < min || b.p > max) return;
    ctx.lineTo(xAt(b.i), yAt(b.p));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMacdPanel(
  ctx: CanvasRenderingContext2D,
  bars: KLineBar[],
  top: number,
  padL: number,
  plotW: number,
  panelH: number,
  slot: number,
  xAt: (i: number) => number
): void {
  const m = calcMACD(bars.map((b) => b.close));
  let maxAbs = 0;
  for (const v of m.hist) if (v != null && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  const half = maxAbs || 1;
  const midY = top + panelH / 2;
  ctx.fillStyle = 'rgba(154, 163, 173, 0.06)';
  ctx.fillRect(padL, top, plotW, panelH);
  ctx.strokeStyle = '#eef0f3';
  ctx.beginPath();
  ctx.moveTo(padL, midY);
  ctx.lineTo(padL + plotW, midY);
  ctx.stroke();
  const bw = Math.max(1, slot * 0.5);
  for (let i = 0; i < bars.length; i++) {
    if (m.hist[i] == null) continue;
    const v = m.hist[i] as number;
    const h = (Math.abs(v) / half) * (panelH / 2 - 1);
    ctx.fillStyle = v >= 0 ? '#e53e3e' : '#38a169';
    const y = v >= 0 ? midY - h : midY;
    ctx.fillRect(xAt(i) - bw / 2, y, bw, h);
  }
  const toY = (v: number) => top + panelH / 2 - ((v / half) * (panelH / 2 - 1));
  drawSeriesInPanel(ctx, bars, m.dif, xAt, toY, '#e0a96d');
  drawSeriesInPanel(ctx, bars, m.dea, xAt, toY, '#8b7bd8');
  ctx.fillStyle = '#9aa3ad';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('MACD(12,26,9)', padL + 2, top + 7);
}

function drawRsiPanel(
  ctx: CanvasRenderingContext2D,
  bars: KLineBar[],
  top: number,
  padL: number,
  plotW: number,
  panelH: number,
  xAt: (i: number) => number
): void {
  const r = calcRSI(bars.map((b) => b.close), 14);
  const yMin = 0;
  const yMax = 100;
  const toY = (v: number) => top + ((yMax - v) / (yMax - yMin)) * panelH;
  ctx.fillStyle = 'rgba(154, 163, 173, 0.06)';
  ctx.fillRect(padL, top, plotW, panelH);
  ctx.strokeStyle = '#eef0f3';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, toY(30));
  ctx.lineTo(padL + plotW, toY(30));
  ctx.moveTo(padL, toY(70));
  ctx.lineTo(padL + plotW, toY(70));
  ctx.stroke();
  ctx.setLineDash([]);
  drawSeriesInPanel(ctx, bars, r, xAt, toY, '#a78bfa');
  ctx.fillStyle = '#9aa3ad';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('RSI(14)', padL + 2, top + 7);
}

function drawKdjPanel(
  ctx: CanvasRenderingContext2D,
  bars: KLineBar[],
  top: number,
  padL: number,
  plotW: number,
  panelH: number,
  xAt: (i: number) => number
): void {
  const kj = calcKDJ(
    bars.map((b) => b.high),
    bars.map((b) => b.low),
    bars.map((b) => b.close),
    9,
    3,
    3
  );
  const yMin = 0;
  const yMax = 100;
  const toY = (v: number) => top + ((yMax - v) / (yMax - yMin)) * panelH;
  ctx.fillStyle = 'rgba(154, 163, 173, 0.06)';
  ctx.fillRect(padL, top, plotW, panelH);
  drawSeriesInPanel(ctx, bars, kj.k, xAt, toY, '#e0a96d');
  drawSeriesInPanel(ctx, bars, kj.d, xAt, toY, '#8b7bd8');
  drawSeriesInPanel(ctx, bars, kj.j, xAt, toY, '#22d3ee');
  ctx.fillStyle = '#9aa3ad';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('KDJ(9,3,3)', padL + 2, top + 7);
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  bar: KLineBar,
  x: number,
  padT: number,
  padL: number,
  plotW: number,
  chartH: number,
  gap: number,
  volH: number
): void {
  ctx.strokeStyle = '#aeb6c2';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, padT);
  ctx.lineTo(x, padT + chartH + gap + volH);
  ctx.stroke();
  ctx.setLineDash([]);
  const chg = bar.open ? (bar.close / bar.open - 1) * 100 : 0;
  const txt =
    `${bar.date}  开${bar.open.toFixed(2)} 高${bar.high.toFixed(2)} 低${bar.low.toFixed(2)} ` +
    `收${bar.close.toFixed(2)} ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
  ctx.font = '10px monospace';
  const tw = ctx.measureText(txt).width + 12;
  const bx = Math.min(padL, padL + plotW - tw);
  ctx.fillStyle = 'rgba(23,34,49,0.92)';
  ctx.fillRect(bx, padT, tw, 18);
  ctx.fillStyle = '#dce6f3';
  ctx.textAlign = 'left';
  ctx.fillText(txt, bx + 6, padT + 10);
}

export function drawChart(canvas: HTMLCanvasElement | null, opts: DrawChartOptions): void {
  const { bars, lineMode, preClose, hoverIdx, lines, pending } = opts;
  const ind = opts.ind ?? DEFAULT_INDICATORS;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 360;
  const cssH = canvas.clientHeight || 320;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const subPanelCount =
    !lineMode && bars.length > 0
      ? (ind.macd ? 1 : 0) + (ind.rsi ? 1 : 0) + (ind.kdj ? 1 : 0)
      : 0;
  const g = computeGeom(bars, cssW, cssH, subPanelCount);
  if (!g) return;
  const { padL, padR, padT, chartH, plotW, max, min, slot, n, volH, gap, panelT, panelH } = g;
  const span = max - min;
  const maxVol = Math.max(...bars.map((b) => b.volume)) || 1;
  const xAt = (i: number) => padL + slot * i + slot / 2;
  const yAt = (p: number) => padT + ((max - p) / span) * chartH;

  // 网格 + 价格轴
  ctx.font = '10px monospace';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH * i) / 4;
    const price = max - (span * i) / 4;
    ctx.strokeStyle = '#eef0f3';
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillStyle = '#9aa3ad';
    ctx.textAlign = 'left';
    ctx.fillText(price.toFixed(2), padL + plotW + 4, y);
  }

  if (lineMode) {
    // 分时：价格线 + 均价线
    const pricePts: number[] = [];
    const avgPts: number[] = [];
    bars.forEach((b, i) => {
      pricePts.push(xAt(i), yAt(b.close));
      if (b.average) avgPts.push(xAt(i), yAt(b.average));
    });
    if (pricePts.length >= 4) {
      ctx.strokeStyle = '#e53e3e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(pricePts[0], pricePts[1]);
      for (let k = 2; k < pricePts.length; k += 2) ctx.lineTo(pricePts[k], pricePts[k + 1]);
      ctx.stroke();
    }
    if (avgPts.length >= 4) {
      ctx.strokeStyle = '#e0a96d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(avgPts[0], avgPts[1]);
      for (let k = 2; k < avgPts.length; k += 2) ctx.lineTo(avgPts[k], avgPts[k + 1]);
      ctx.stroke();
    }
  } else {
    // 蜡烛
    const bodyW = Math.max(2, Math.min(slot * 0.64, 14));
    bars.forEach((b, i) => {
      const x = xAt(i);
      const up = b.close >= b.open;
      const color = up ? '#e53e3e' : '#38a169';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yAt(b.high));
      ctx.lineTo(x, yAt(b.low));
      ctx.stroke();
      const top = Math.min(yAt(b.open), yAt(b.close));
      const h = Math.max(1, Math.abs(yAt(b.close) - yAt(b.open)));
      ctx.fillRect(x - bodyW / 2, top, bodyW, h);
    });
    if (ind.ma) {
      for (const { win, color } of MA_COLORS) {
        drawSeries(ctx, bars, calcMA(bars.map((b) => b.close), win), xAt, yAt, color);
      }
    }
    if (ind.boll) {
      const { upper, mid, lower } = calcBOLL(bars.map((b) => b.close), 20, 2);
      drawSeries(ctx, bars, upper, xAt, yAt, 'rgba(148, 163, 184, 0.55)');
      drawSeries(ctx, bars, mid, xAt, yAt, 'rgba(148, 163, 184, 0.85)');
      drawSeries(ctx, bars, lower, xAt, yAt, 'rgba(148, 163, 184, 0.55)');
    }
  }

  // ── 副区：MACD / RSI / KDJ ──
  if (!lineMode && bars.length) {
    let panelIdx = 0;
    const subPanelTop = (idx: number) => panelT + idx * (panelH + 6);
    if (ind.macd) {
      drawMacdPanel(ctx, bars, subPanelTop(panelIdx), padL, plotW, panelH, slot, xAt);
      panelIdx += 1;
    }
    if (ind.rsi) {
      drawRsiPanel(ctx, bars, subPanelTop(panelIdx), padL, plotW, panelH, xAt);
      panelIdx += 1;
    }
    if (ind.kdj) {
      drawKdjPanel(ctx, bars, subPanelTop(panelIdx), padL, plotW, panelH, xAt);
      panelIdx += 1;
    }
    ctx.textBaseline = 'middle';
  }

  // 昨收参考线
  if (preClose > 0 && preClose >= min && preClose <= max) {
    const y = yAt(preClose);
    ctx.strokeStyle = '#c4ccd6';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 成交量
  bars.forEach((b, i) => {
    const x = xAt(i);
    const up = b.close >= b.open;
    const color = up ? '#e53e3e' : '#38a169';
    const vTop = padT + chartH + gap + volH - (b.volume / maxVol) * volH;
    const vBottom = padT + chartH + gap + volH;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color;
    ctx.fillRect(x - Math.max(1, slot * 0.3), vTop, Math.max(2, slot * 0.6), vBottom - vTop);
    ctx.globalAlpha = 1;
  });

  // 趋势线
  lines.forEach((l) => {
    if (l.i2 === undefined || l.p2 === undefined) {
      drawTrendLine(ctx, xAt, yAt, { i: l.i1, p: l.p1 }, undefined, n, min, max, 1.6, []);
    } else {
      drawTrendLine(
        ctx,
        xAt,
        yAt,
        { i: l.i1, p: l.p1 },
        { i: l.i2, p: l.p2 },
        n,
        min,
        max,
        1.6,
        []
      );
    }
  });
  if (pending) drawTrendLine(ctx, xAt, yAt, pending, undefined, n, min, max, 1.6, [5, 3]);

  // 十字光标 + OHLC 读数
  if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < n) {
    drawCrosshair(ctx, bars[hoverIdx], xAt(hoverIdx), padT, padL, plotW, chartH, gap, volH);
  }

  // 图例
  ctx.textAlign = 'left';
  ctx.font = '10px monospace';
  ctx.textBaseline = 'middle';
  if (lineMode) {
    ctx.fillStyle = '#e0a96d';
    ctx.fillText('均价', padL + 2, 9);
  } else if (ind.ma) {
    let lx = padL + 2;
    for (const { color, win } of MA_COLORS) {
      ctx.fillStyle = color;
      const text = `MA${win}`;
      ctx.fillText(text, lx, 9);
      lx += ctx.measureText(text).width + 6;
    }
  }
  if (ind.boll) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.fillText('BOLL', padL + 2 + (ind.ma ? 4 * 28 : 0), 9);
  }
}