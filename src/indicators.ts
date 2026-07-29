// 纯函数：技术指标。零 React 依赖，可在 Node 中通过 tools/verify-indicators.mjs 验证。
// 公式：MA=简单移动平均；MACD=EMA12/26/9；RSI=14 期 Wilder 平滑；KDJ=9/3/3 随机指标；
//       BOLL=20 期均线 ± 2σ。

export type NumberArray = (number | null)[];

/**
 * 简单移动平均。n 必须为正整数；bars 不足 n 时返回 null。
 */
export function ma(closes: number[], n: number): NumberArray {
  if (!Number.isFinite(n) || n <= 0 || !Array.isArray(closes)) {
    return new Array(closes?.length || 0).fill(null);
  }
  const out: NumberArray = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    const c = Number(closes[i]);
    if (!Number.isFinite(c)) {
      // 无效值重置窗口
      sum = 0;
      continue;
    }
    sum += c;
    if (i >= n) {
      const old = Number(closes[i - n]);
      if (Number.isFinite(old)) sum -= old;
    }
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/**
 * EMA。alpha = 2 / (n + 1)。从第 n-1 根开始有值。
 */
function ema(values: (number | null)[], n: number): NumberArray {
  const out: NumberArray = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const alpha = 2 / (n + 1);
  // 起点用前 n 项的 SMA 作为种子。
  let seed = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) return out;
    seed += v;
  }
  seed /= n;
  out[n - 1] = seed;
  for (let i = n; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) {
      out[i] = out[i - 1];
      continue;
    }
    out[i] = (out[i - 1] as number) * (1 - alpha) + v * alpha;
  }
  return out;
}

/**
 * MACD(12,26,9)。返回 {dif, dea, hist}，长度与 closes 相同，warm-up 区为 null。
 */
export function macd(
  closes: number[]
): { dif: NumberArray; dea: NumberArray; hist: NumberArray } {
  const n = closes.length;
  if (!Array.isArray(closes)) {
    return {
      dif: new Array(n).fill(null),
      dea: new Array(n).fill(null),
      hist: new Array(n).fill(null),
    };
  }
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif: NumberArray = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (ema12[i] != null && ema26[i] != null) {
      dif[i] = (ema12[i] as number) - (ema26[i] as number);
    }
  }
  const dea = ema(dif.map((v) => (v == null ? 0 : v)), 9);
  // dea 的 warm-up 起点是 dif 的 (12+26-2) → 26 根之后；与 macd 起点对齐。
  const hist: NumberArray = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (dif[i] != null && dea[i] != null) {
      hist[i] = ((dif[i] as number) - (dea[i] as number)) * 2;
    }
  }
  return { dif, dea, hist };
}

/**
 * RSI(14) Wilder 平滑。前 14 根为 null。
 */
export function rsi(closes: number[], n: number = 14): NumberArray {
  const out: NumberArray = new Array(closes.length).fill(null);
  if (!Array.isArray(closes) || closes.length < n + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= n; i++) {
    const diff = Number(closes[i]) - Number(closes[i - 1]);
    if (!Number.isFinite(diff)) return out;
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }
  let avgGain = gainSum / n;
  let avgLoss = lossSum / n;
  out[n] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = n + 1; i < closes.length; i++) {
    const diff = Number(closes[i]) - Number(closes[i - 1]);
    if (!Number.isFinite(diff)) {
      out[i] = out[i - 1];
      continue;
    }
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (n - 1) + g) / n;
    avgLoss = (avgLoss * (n - 1) + l) / n;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * KDJ(9,3,3) 随机指标。返回 {k, d, j}，前 9 根为 null。
 */
export function kdj(
  highs: number[],
  lows: number[],
  closes: number[],
  n: number = 9,
  kSmooth: number = 3,
  dSmooth: number = 3
): { k: NumberArray; d: NumberArray; j: NumberArray } {
  const len = closes.length;
  const k: NumberArray = new Array(len).fill(null);
  const d: NumberArray = new Array(len).fill(null);
  const j: NumberArray = new Array(len).fill(null);
  if (highs.length < len || lows.length < len) return { k, d, j };
  // RSV
  const rsv: NumberArray = new Array(len).fill(null);
  for (let i = n - 1; i < len; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let t = i - n + 1; t <= i; t++) {
      const h = Number(highs[t]);
      const l = Number(lows[t]);
      const c = Number(closes[t]);
      if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) {
        ok = false;
        break;
      }
      if (h > hh) hh = h;
      if (l < ll) ll = l;
    }
    if (!ok || hh === ll) rsv[i] = 50;
    else rsv[i] = ((Number(closes[i]) - ll) / (hh - ll)) * 100;
  }
  // K, D, J
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < len; i++) {
    if (rsv[i] == null) continue;
    const curK = (prevK * (kSmooth - 1) + (rsv[i] as number)) / kSmooth;
    const curD = (prevD * (dSmooth - 1) + curK) / dSmooth;
    k[i] = curK;
    d[i] = curD;
    j[i] = 3 * curK - 2 * curD;
    prevK = curK;
    prevD = curD;
  }
  return { k, d, j };
}

/**
 * BOLL(20, k=2)。返回 {upper, mid, lower}，前 19 根为 null。
 */
export function boll(
  closes: number[],
  n: number = 20,
  k: number = 2
): { upper: NumberArray; mid: NumberArray; lower: NumberArray } {
  const len = closes.length;
  const upper: NumberArray = new Array(len).fill(null);
  const mid: NumberArray = new Array(len).fill(null);
  const lower: NumberArray = new Array(len).fill(null);
  if (!Array.isArray(closes) || closes.length < n) return { upper, mid, lower };
  // 使用递增和与平方和以 O(n) 计算滚动标准差。
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const c = Number(closes[i]);
    if (!Number.isFinite(c)) return { upper, mid, lower };
    sum += c;
    sumSq += c * c;
  }
  for (let i = n - 1; i < len; i++) {
    if (i > n - 1) {
      const oldC = Number(closes[i - n]);
      const newC = Number(closes[i]);
      if (!Number.isFinite(oldC) || !Number.isFinite(newC)) {
        upper[i] = null;
        mid[i] = null;
        lower[i] = null;
        continue;
      }
      sum += newC - oldC;
      sumSq += newC * newC - oldC * oldC;
    }
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    const std = Math.sqrt(variance);
    mid[i] = mean;
    upper[i] = mean + k * std;
    lower[i] = mean - k * std;
  }
  return { upper, mid, lower };
}
