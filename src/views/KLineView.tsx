import { useCallback, useEffect, useRef, useState } from 'react';
import type { KLineBar, KLinePeriod, StockQuote } from '../types';
import { fetchEmKline, fmtPrice } from '../api';
import {
  computeGeom,
  drawChart,
  loadIndicatorState,
  saveIndicatorState,
  type IndicatorState,
  type TrendLine,
} from '../chart';
import {
  ma as calcMA,
  macd as calcMACD,
  rsi as calcRSI,
  kdj as calcKDJ,
  boll as calcBOLL,
} from '../indicators';

// ── K线周期表（东方财富：分时/分钟K/日周月） ──
const KLINE_TABS: Array<{
  label: string;
  kind: 'trend' | 'kline';
  klt: number;
  len: number;
}> = [
  { label: '分时', kind: 'trend' as const, klt: 0, len: 1 },
  { label: '1分', kind: 'kline' as const, klt: 1, len: 240 },
  { label: '5分', kind: 'kline' as const, klt: 5, len: 240 },
  { label: '15分', kind: 'kline' as const, klt: 15, len: 240 },
  { label: '30分', kind: 'kline' as const, klt: 30, len: 240 },
  { label: '60分', kind: 'kline' as const, klt: 60, len: 200 },
  { label: '日K', kind: 'kline' as const, klt: 101, len: 130 },
  { label: '周K', kind: 'kline' as const, klt: 102, len: 130 },
  { label: '月K', kind: 'kline' as const, klt: 103, len: 100 },
];

interface Props {
  code: string;
  name: string;
  quote?: StockQuote;
  onBack: () => void;
}

export function KLineView({ code, name, quote, onBack }: Props) {
  const [tabIdx, setTabIdx] = useState(6); // 默认日K
  const [bars, setBars] = useState<KLineBar[]>([]);
  const [preClose, setPreClose] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lines, setLines] = useState<TrendLine[]>([]);
  const [pending, setPending] = useState<{ i: number; p: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [ind, setInd] = useState<IndicatorState>(() => loadIndicatorState());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const toggleInd = (k: keyof IndicatorState) => {
    setInd((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      saveIndicatorState(next);
      return next;
    });
  };

  const tab = KLINE_TABS[tabIdx];
  const lineMode = tab.kind === 'trend';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await fetchEmKline(code, tab.kind, tab.klt, tab.len);
    setLoading(false);
    if (res.error && !res.bars.length) {
      setError(res.error);
      setBars([]);
    } else {
      setBars(res.bars);
      setPreClose(res.preClose);
    }
  }, [code, tab.kind, tab.klt, tab.len]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    drawChart(canvasRef.current, { bars, lineMode, preClose, hoverIdx, lines, pending, ind });
  }, [bars, lineMode, preClose, hoverIdx, lines, pending, ind]);

  const subPanelCount =
    !lineMode && bars.length
      ? (ind.macd ? 1 : 0) + (ind.rsi ? 1 : 0) + (ind.kdj ? 1 : 0)
      : 0;

  const pct = quote?.changePct ?? null;
  const isUp = pct != null && pct > 0;
  const isDown = pct != null && pct < 0;
  const colorClass = isUp ? 'up' : isDown ? 'down' : 'flat';

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const g = computeGeom(bars, canvas.clientWidth, canvas.clientHeight, subPanelCount);
    if (!g) return;
    if (x < g.padL || x > g.padL + g.plotW) {
      setHoverIdx(null);
      return;
    }
    const i = Math.round((x - g.padL) / g.slot - 0.5);
    setHoverIdx(Math.max(0, Math.min(bars.length - 1, i)));
    if (drawMode) {
      const p = g.max - ((y - g.padT) / g.chartH) * (g.max - g.min);
      setPending({ i: Math.max(0, Math.min(bars.length - 1, i)), p });
    }
  };
  const onLeave = () => {
    setHoverIdx(null);
    if (drawMode) setPending(null);
  };
  const onClick = () => {
    if (!drawMode || !pending) return;
    setLines((prev) => {
      const last = prev[prev.length - 1];
      // 上一条还差第二点 → 用当前点补完。
      if (last && last.i2 === undefined) {
        const next = prev.slice(0, -1);
        next.push({ i1: last.i1, p1: last.p1, i2: pending.i, p2: pending.p });
        return next;
      }
      // 否则开一条新线（只记第一个点，等下次点击补完）。
      return [...prev, { i1: pending.i, p1: pending.p }];
    });
    setPending(null);
  };
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    if (lines.length) {
      setLines((prev) => prev.slice(0, -1));
    }
  };

  return (
    <div className="kline">
      <header className="kline-head">
        <button className="kline-back" onClick={onBack} title="返回">
          ←
        </button>
        <div className="kline-title">
          <div className="kline-name">{name}</div>
          <div className="kline-code">{code}</div>
        </div>
        <div className={`kline-price ${colorClass}`}>
          <div className="kp">{fmtPrice(quote?.price ?? null)}</div>
          <div className="kpc">
            {pct != null && `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`}
            {quote?.change != null && (
              <span className="kpc-amt"> {quote.change > 0 ? '+' : ''}{quote.change.toFixed(2)}</span>
            )}
          </div>
        </div>
      </header>

      <div className="kline-tabs">
        {KLINE_TABS.map((t, i) => (
          <button
            key={t.label}
            className={`kline-tab ${i === tabIdx ? 'on' : ''}`}
            onClick={() => {
              setTabIdx(i);
              setLines([]);
              setPending(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="kline-chart">
        <canvas
          ref={canvasRef}
          className="kline-canvas"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClick}
          onContextMenu={onContext}
        />
        {loading && <div className="kline-mask">加载中…</div>}
        {error && <div className="kline-mask kline-err">{error}</div>}
      </div>

      <div className="kline-foot">
        <button
          className={`kline-draw ${drawMode ? 'on' : ''}`}
          onClick={() => {
            setDrawMode((d) => !d);
            setPending(null);
          }}
        >
          {drawMode ? '画线中' : '画线'}
        </button>
        {!lineMode && (
          <div className="kline-ind-toggles">
            <button
              className={`ind-toggle ${ind.ma ? 'on' : ''}`}
              onClick={() => toggleInd('ma')}
              title="MA 均线"
            >MA</button>
            <button
              className={`ind-toggle ${ind.boll ? 'on' : ''}`}
              onClick={() => toggleInd('boll')}
              title="布林带"
            >BOLL</button>
            <button
              className={`ind-toggle ${ind.macd ? 'on' : ''}`}
              onClick={() => toggleInd('macd')}
              title="MACD"
            >MACD</button>
            <button
              className={`ind-toggle ${ind.rsi ? 'on' : ''}`}
              onClick={() => toggleInd('rsi')}
              title="RSI"
            >RSI</button>
            <button
              className={`ind-toggle ${ind.kdj ? 'on' : ''}`}
              onClick={() => toggleInd('kdj')}
              title="KDJ"
            >KDJ</button>
          </div>
        )}
        {hoverIdx != null && bars[hoverIdx] && (
          <div className="kline-hover-info">{hoverInfoText(bars, hoverIdx, ind)}</div>
        )}
        <span className="kline-foot-hint">左键两点连线 · 右键撤销 · 数据来自东方财富</span>
      </div>
    </div>
  );
}

// 在 hover 处显示 OHLC + 可见指标值的紧凑字符串。
function hoverInfoText(bars: KLineBar[], i: number, ind: IndicatorState): string {
  if (!bars[i]) return '';
  const b = bars[i];
  const parts: string[] = [
    `O ${fmtPrice(b.open)}`,
    `H ${fmtPrice(b.high)}`,
    `L ${fmtPrice(b.low)}`,
    `C ${fmtPrice(b.close)}`,
  ];
  if (ind.ma) {
    const ma5 = calcMA(bars.map((bb) => bb.close), 5);
    const ma10 = calcMA(bars.map((bb) => bb.close), 10);
    const ma20 = calcMA(bars.map((bb) => bb.close), 20);
    const ma60 = calcMA(bars.map((bb) => bb.close), 60);
    if (ma5[i] != null) parts.push(`MA5 ${fmtPrice(ma5[i] as number)}`);
    if (ma10[i] != null) parts.push(`MA10 ${fmtPrice(ma10[i] as number)}`);
    if (ma20[i] != null) parts.push(`MA20 ${fmtPrice(ma20[i] as number)}`);
    if (ma60[i] != null) parts.push(`MA60 ${fmtPrice(ma60[i] as number)}`);
  }
  if (ind.boll) {
    const { upper, mid, lower } = calcBOLL(bars.map((bb) => bb.close), 20, 2);
    if (upper[i] != null) parts.push(`UB ${fmtPrice(upper[i] as number)}`);
    if (mid[i] != null) parts.push(`MB ${fmtPrice(mid[i] as number)}`);
    if (lower[i] != null) parts.push(`LB ${fmtPrice(lower[i] as number)}`);
  }
  if (ind.macd) {
    const m = calcMACD(bars.map((bb) => bb.close));
    if (m.dif[i] != null) parts.push(`DIF ${(m.dif[i] as number).toFixed(3)}`);
    if (m.dea[i] != null) parts.push(`DEA ${(m.dea[i] as number).toFixed(3)}`);
    if (m.hist[i] != null) parts.push(`HIST ${(m.hist[i] as number).toFixed(3)}`);
  }
  if (ind.rsi) {
    const r = calcRSI(bars.map((bb) => bb.close), 14);
    if (r[i] != null) parts.push(`RSI ${(r[i] as number).toFixed(2)}`);
  }
  if (ind.kdj) {
    const kj = calcKDJ(
      bars.map((bb) => bb.high),
      bars.map((bb) => bb.low),
      bars.map((bb) => bb.close)
    );
    if (kj.k[i] != null) parts.push(`K ${(kj.k[i] as number).toFixed(2)}`);
    if (kj.d[i] != null) parts.push(`D ${(kj.d[i] as number).toFixed(2)}`);
    if (kj.j[i] != null) parts.push(`J ${(kj.j[i] as number).toFixed(2)}`);
  }
  return parts.join(' · ');
}

// 抑制未用导入告警；KLinePeriod 仅在 KLINE_TABS 推导时使用
export type { KLinePeriod };