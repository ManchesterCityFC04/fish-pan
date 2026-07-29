// Feature flags for staged rollouts. All default to `false` to keep current behavior.
// To enable a flag at runtime, set localStorage `fishPan:flag:<name>` to '1'.

function readFlag(name: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(`fishPan:flag:${name}`) === '1';
  } catch {
    return false;
  }
}

/** market-news-events: 把一键诊断的 `news` 字段从 null 切到真实 NewsItem[]。 */
export const FEATURE_MARKET_NEWS_EVENTS = readFlag('marketNewsEvents');