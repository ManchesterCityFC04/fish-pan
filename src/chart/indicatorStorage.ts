// localStorage 读写的工具函数；为 SSR / 测试环境提供 fail-safe 行为。
import type { IndicatorState } from './types';
import { DEFAULT_INDICATORS, INDICATORS_KEY } from './types';

export function loadIndicatorState(): IndicatorState {
  if (typeof localStorage === 'undefined') return DEFAULT_INDICATORS;
  try {
    const raw = localStorage.getItem(INDICATORS_KEY);
    if (!raw) return DEFAULT_INDICATORS;
    const obj = JSON.parse(raw);
    return { ...DEFAULT_INDICATORS, ...obj };
  } catch {
    return DEFAULT_INDICATORS;
  }
}

export function saveIndicatorState(s: IndicatorState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(INDICATORS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}