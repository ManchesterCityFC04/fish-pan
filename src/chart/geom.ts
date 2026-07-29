import type { KLineBar } from '../types';
import type { Geom } from './types';

// 计算图表布局尺寸（价格区 + 成交量 + 副区）；数据不足返回 null。
export function computeGeom(
  bars: KLineBar[],
  cssW: number,
  cssH: number,
  subPanelCount: number = 0
): Geom | null {
  const padL = 4;
  const padR = 50;
  const padT = 14;
  const padB = 6;
  const volH = 46;
  const gap = 8;
  const subPanel = subPanelCount > 0 ? 40 * subPanelCount + 6 * subPanelCount : 0;
  const chartH = cssH - padT - padB - volH - gap - subPanel;
  const plotW = cssW - padL - padR;
  if (chartH <= 10 || plotW <= 10 || bars.length === 0) return null;
  let max = -Infinity;
  let min = Infinity;
  for (const b of bars) {
    if (b.high > max) max = b.high;
    if (b.low < min) min = b.low;
  }
  const range = max - min || 1;
  max += range * 0.06;
  min -= range * 0.06;
  const panelT = padT + chartH + gap + volH + gap;
  return {
    padL,
    padR,
    padT,
    padB,
    volH,
    gap,
    chartH,
    plotW,
    max,
    min,
    slot: plotW / bars.length,
    n: bars.length,
    panelT,
    panelH: 40,
  };
}