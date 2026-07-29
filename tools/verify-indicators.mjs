// 离线验证 indicators 模块。复制 src/indicators.ts 的核心公式，避免引入 React 类型。

function ma(closes, n) {
  if (!Number.isFinite(n) || n <= 0 || !Array.isArray(closes)) {
    return new Array(closes?.length || 0).fill(null);
  }
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    const c = Number(closes[i]);
    if (!Number.isFinite(c)) {
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

function ema(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const alpha = 2 / (n + 1);
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
    out[i] = out[i - 1] * (1 - alpha) + v * alpha;
  }
  return out;
}

function macd(closes) {
  const n = closes.length;
  if (!Array.isArray(closes)) {
    return {
      dif: new Array(n).fill(null),
      dea: new Array(n).fill(null),
      hist: new Array(n).fill(null),
    };
  }
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const dif = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (e12[i] != null && e26[i] != null) dif[i] = e12[i] - e26[i];
  }
  const dea = ema(dif.map((v) => (v == null ? 0 : v)), 9);
  const hist = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (dif[i] != null && dea[i] != null) hist[i] = (dif[i] - dea[i]) * 2;
  }
  return { dif, dea, hist };
}

function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < n + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= n; i++) {
    const diff = Number(closes[i]) - Number(closes[i - 1]);
    if (!Number.isFinite(diff)) return out;
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }
  let avgG = gainSum / n;
  let avgL = lossSum / n;
  out[n] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = n + 1; i < closes.length; i++) {
    const diff = Number(closes[i]) - Number(closes[i - 1]);
    if (!Number.isFinite(diff)) {
      out[i] = out[i - 1];
      continue;
    }
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgG = (avgG * (n - 1) + g) / n;
    avgL = (avgL * (n - 1) + l) / n;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function kdj(highs, lows, closes, n = 9, kS = 3, dS = 3) {
  const len = closes.length;
  const k = new Array(len).fill(null);
  const d = new Array(len).fill(null);
  const j = new Array(len).fill(null);
  if (highs.length < len || lows.length < len) return { k, d, j };
  const rsv = new Array(len).fill(null);
  for (let i = n - 1; i < len; i++) {
    let hh = -Infinity, ll = Infinity, ok = true;
    for (let t = i - n + 1; t <= i; t++) {
      const h = Number(highs[t]), l = Number(lows[t]), c = Number(closes[t]);
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
  let prevK = 50, prevD = 50;
  for (let i = 0; i < len; i++) {
    if (rsv[i] == null) continue;
    const curK = (prevK * (kS - 1) + rsv[i]) / kS;
    const curD = (prevD * (dS - 1) + curK) / dS;
    k[i] = curK;
    d[i] = curD;
    j[i] = 3 * curK - 2 * curD;
    prevK = curK;
    prevD = curD;
  }
  return { k, d, j };
}

function boll(closes, n = 20, k = 2) {
  const len = closes.length;
  const upper = new Array(len).fill(null);
  const mid = new Array(len).fill(null);
  const lower = new Array(len).fill(null);
  if (closes.length < n) return { upper, mid, lower };
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    sum += Number(closes[i]);
    sumSq += Number(closes[i]) ** 2;
  }
  for (let i = n - 1; i < len; i++) {
    if (i > n - 1) {
      sum += Number(closes[i]) - Number(closes[i - n]);
      sumSq += Number(closes[i]) ** 2 - Number(closes[i - n]) ** 2;
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

// ── 断言 ──
let pass = 0, fail = 0;
function eq(name, got, want, tol = 1e-9) {
  const ok =
    got === want ||
    (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) <= tol) ||
    (Array.isArray(got) &&
      Array.isArray(want) &&
      got.length === want.length &&
      got.every((g, i) => {
        const w = want[i];
        if (g === w) return true;
        if (g == null && w == null) return true;
        if (typeof g === 'number' && typeof w === 'number') return Math.abs(g - w) <= tol;
        return false;
      }));
  if (ok) {
    pass++;
    console.log('  ✓', name);
  } else {
    fail++;
    console.log('  ✗', name, '\n    got: ', JSON.stringify(got), '\n    want:', JSON.stringify(want));
  }
}

// 1. MA: 简单平均
const closes1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ma3 = ma(closes1, 3);
// 第一个非空 = index 2 = (1+2+3)/3 = 2
eq('MA3 first value', ma3[2], 2);
eq('MA3 index 5', ma3[5], (4 + 5 + 6) / 3, 1e-9);
eq('MA3 last', ma3[9], (8 + 9 + 10) / 3, 1e-9);
eq('MA3 nulls before warm-up', ma3[0], null);

// 2. MACD 长度
const enough2 = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5);
const m = macd(enough2);
eq('MACD length', m.dif.length, enough2.length);
eq('MACD dif warm-up', m.dif[0], null);
// MACD 起点 25 → dif[25] 应有值；dea 由 dif 喂入，hist 在 dif/dea 都有值时才有值
eq('MACD dif at 25', m.dif[25] != null, true);
eq('MACD hist warm-up', m.hist[24], null);
eq('MACD hist at 26', m.hist[26] != null, true);

// 3. RSI 边界
const r = rsi(closes1, 14);
eq('RSI14 too short', r, new Array(10).fill(null));
// 全涨行情 → RSI 接近 100
const up = Array.from({ length: 30 }, (_, i) => 100 + i);
const rup = rsi(up, 14);
eq('RSI all up', rup[29], 100, 1e-9);
// 全跌 → 0
const dn = Array.from({ length: 30 }, (_, i) => 200 - i);
const rdn = rsi(dn, 14);
eq('RSI all down', rdn[29], 0, 1e-9);

// 4. KDJ 长度 + 起点
const highs = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const lows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const closes2 = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const kj = kdj(highs, lows, closes2, 9);
eq('KDJ k warm-up', kj.k[7], null);
eq('KDJ k at 8', kj.k[8] != null, true);
eq('KDJ j formula', kj.j[8] === 3 * kj.k[8] - 2 * kj.d[8], true);

// 5. BOLL 边界
const b = boll(closes1, 20, 2);
eq('BOLL too short', b.upper, new Array(10).fill(null));
const enough = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 5);
const b2 = boll(enough, 20, 2);
eq('BOLL mid non-null', b2.mid[19] != null, true);
eq('BOLL upper > mid', b2.upper[29] > b2.mid[29], true);
eq('BOLL lower < mid', b2.lower[29] < b2.mid[29], true);

// 6. 异常输入
eq('MA invalid n', ma([1, 2, 3], 0), new Array(3).fill(null));
eq('MA invalid data', ma(null, 5).length, 0);
eq('RSI short input', rsi([1, 2, 3], 14), new Array(3).fill(null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
