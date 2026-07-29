// 视图层共享的小工具函数；放在独立文件便于多处复用并保持各视图组件纯净。

import type { Alert, AlertType, StockQuote } from '../types';
import { fmtPrice } from '../api';

export function alertTypeText(t: AlertType): string {
  return {
    price_above: '涨过',
    price_below: '跌破',
    pct_above: '涨幅超',
    pct_below: '跌幅超',
  }[t];
}

export function alertMsg(a: Alert, q: StockQuote | null | undefined): string {
  const name = q?.name || a.code;
  const p = fmtPrice(q?.price ?? null);
  if (a.type === 'price_above') return `${name} 已涨过 ${a.value}，现价 ${p}`;
  if (a.type === 'price_below') return `${name} 已跌破 ${a.value}，现价 ${p}`;
  if (a.type === 'pct_above') return `${name} 涨幅已达 +${a.value}%，现价 ${p} (${q?.changePct?.toFixed(2)}%)`;
  return `${name} 跌幅已达 ${a.value}%，现价 ${p} (${q?.changePct?.toFixed(2)}%)`;
}

// 资金额格式化（元 → 亿/万）
export function fmtMoney(v: number | null): string {
  if (v == null) return '--';
  const a = Math.abs(v);
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}亿`;
  if (a >= 1e4) return `${sign}${(a / 1e4).toFixed(0)}万`;
  return `${sign}${a.toFixed(0)}`;
}

// 窗口按内容贴合（大盘/资金视图用）。
export function fitWindow(
  ref: React.RefObject<HTMLDivElement>,
  w: number,
  maxH = 560
): void {
  const el = ref.current;
  if (!el) return;
  // 简化：上层用 useLayoutEffect 测量 DOM；这里只发送目标宽度，高度由内容决定。
  window.electronAPI?.resize(w, Math.min(el.scrollHeight + 20, maxH));
}