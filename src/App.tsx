import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  StockItem,
  StockQuote,
  Alert,
  AlertType,
  DisguiseSkin,
  KLineBar,
  MarketIndex,
  FundFlowItem,
} from './types';
import {
  fetchQuotes,
  fetchEmKline,
  fetchMarket,
  fetchFunds,
  resolveCode,
  fmtPrice,
} from './api';
import './App.css';

const REFRESH_MS = 5000;

// 窗口尺寸：看 K 线时固定放大（盯盘/隐身按内容自动收缩）
const SIZE_KLINE = { w: 384, h: 560 };
const SIZE_PANEL = { w: 360, h: 560 }; // 大盘/资金视图宽度固定，高度按内容

function alertTypeText(t: AlertType): string {
  return { price_above: '涨过', price_below: '跌破', pct_above: '涨幅超', pct_below: '跌幅超' }[t];
}
function alertMsg(a: Alert, q: StockQuote): string {
  const name = q.name || a.code;
  const p = fmtPrice(q.price);
  if (a.type === 'price_above') return `${name} 已涨过 ${a.value}，现价 ${p}`;
  if (a.type === 'price_below') return `${name} 已跌破 ${a.value}，现价 ${p}`;
  if (a.type === 'pct_above') return `${name} 涨幅已达 +${a.value}%，现价 ${p} (${q.changePct?.toFixed(2)}%)`;
  return `${name} 跌幅已达 ${a.value}%，现价 ${p} (${q.changePct?.toFixed(2)}%)`;
}

// 资金额格式化（元 → 亿/万）
function fmtMoney(v: number | null): string {
  if (v == null) return '--';
  const a = Math.abs(v);
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(2)}亿`;
  if (a >= 1e4) return `${sign}${(a / 1e4).toFixed(0)}万`;
  return `${sign}${a.toFixed(0)}`;
}

// ── K线周期表（东方财富：分时/分钟K/日周月）──
const KLINE_TABS = [
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

// ── K线绘图辅助 ──
function calcMA(bars: KLineBar[], win: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < win - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - win + 1; j <= i; j++) sum += bars[j].close;
    out.push(sum / win);
  }
  return out;
}

interface Geom {
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
}
function computeGeom(bars: KLineBar[], cssW: number, cssH: number): Geom | null {
  const padL = 4,
    padR = 50,
    padT = 14,
    padB = 6;
  const volH = 46,
    gap = 8;
  const chartH = cssH - padT - padB - volH - gap;
  const plotW = cssW - padL - padR;
  if (chartH <= 10 || plotW <= 10 || bars.length === 0) return null;
  let max = -Infinity,
    min = Infinity;
  for (const b of bars) {
    if (b.high > max) max = b.high;
    if (b.low < min) min = b.low;
  }
  const range = max - min || 1;
  max += range * 0.06;
  min -= range * 0.06;
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
  };
}

interface TrendLine {
  i1: number;
  p1: number;
  i2: number;
  p2: number;
}

function drawChart(
  canvas: HTMLCanvasElement | null,
  bars: KLineBar[],
  lineMode: boolean,
  preClose: number,
  hoverIdx: number | null,
  lines: TrendLine[],
  pending: { i: number; p: number } | null
) {
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

  const g = computeGeom(bars, cssW, cssH);
  if (!g) return;
  const { padL, padR, padT, chartH, plotW, max, min, slot, n, volH, gap } = g;
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
    // 均线
    const drawMA = (arr: (number | null)[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      bars.forEach((_, i) => {
        const v = arr[i];
        if (v == null) return;
        const x = xAt(i);
        const y = yAt(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    drawMA(calcMA(bars, 5), '#e0a96d');
    drawMA(calcMA(bars, 10), '#8b7bd8');
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

  // 趋势线（画线）
  const drawOne = (a: { i: number; p: number }, b: { i: number; p: number }, width: number, dash: number[]) => {
    if (a.i < 0 || a.i >= n || b.i < 0 || b.i >= n) return;
    if (a.p < min || a.p > max || b.p < min || b.p > max) return;
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(xAt(a.i), yAt(a.p));
    ctx.lineTo(xAt(b.i), yAt(b.p));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  lines.forEach((l) => drawOne({ i: l.i1, p: l.p1 }, { i: l.i2, p: l.p2 }, 1.6, []));
  if (pending) drawOne(pending, pending, 1.6, [5, 3]);

  // 十字光标 + OHLC 读数
  if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < n) {
    const b = bars[hoverIdx];
    const x = xAt(hoverIdx);
    ctx.strokeStyle = '#aeb6c2';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + chartH + gap + volH);
    ctx.stroke();
    ctx.setLineDash([]);
    const chg = b.open ? ((b.close / b.open - 1) * 100) : 0;
    const txt =
      `${b.date}  开${b.open.toFixed(2)} 高${b.high.toFixed(2)} 低${b.low.toFixed(2)} ` +
      `收${b.close.toFixed(2)} ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
    ctx.font = '10px monospace';
    const tw = ctx.measureText(txt).width + 12;
    const bx = Math.min(padL, padL + plotW - tw);
    ctx.fillStyle = 'rgba(23,34,49,0.92)';
    ctx.fillRect(bx, padT, tw, 18);
    ctx.fillStyle = '#dce6f3';
    ctx.textAlign = 'left';
    ctx.fillText(txt, bx + 6, padT + 10);
  }

  // 图例
  ctx.textAlign = 'left';
  ctx.font = '10px monospace';
  ctx.fillStyle = '#e0a96d';
  ctx.fillText(lineMode ? '均价' : 'MA5', padL + 2, 9);
  if (!lineMode) {
    ctx.fillStyle = '#8b7bd8';
    ctx.fillText('MA10', padL + 36, 9);
  }
}

// 窗口按内容贴合（大盘/资金视图用）
function fitWindow(ref: React.RefObject<HTMLDivElement>, w: number, maxH = 560) {
  const el = ref.current;
  if (!el) return;
  let h = 0;
  Array.from(el.children).forEach((c) => {
    const e = c as HTMLElement;
    const pos = getComputedStyle(e).position;
    if (pos === 'absolute' || pos === 'fixed') return;
    h += e.offsetHeight;
  });
  window.electronAPI?.resize(w, Math.min(Math.max(Math.ceil(h), 90), maxH));
}

// ═══════════════════════════════════════════════════
//  APP
// ═══════════════════════════════════════════════════
export default function App() {
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [input, setInput] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  const [disguised, setDisguised] = useState(false);
  const [skin, setSkin] = useState<DisguiseSkin>('clock');

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertEditorFor, setAlertEditorFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null);
  const [view, setView] = useState<'watch' | 'market' | 'funds'>('watch');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertsRef = useRef(alerts);
  const appRef = useRef<HTMLDivElement>(null);

  // 启动时从 SQLite 读取自选 + 提醒（永久保存）
  useEffect(() => {
    const db = window.electronAPI?.db;
    if (!db) return;
    (async () => {
      const list = await db.getStocks();
      setStocks(list.map((s) => ({ code: s.code, name: s.name })));
      const al = await db.getAlerts();
      setAlerts(
        al.map((a) => ({
          id: a.id,
          code: a.code,
          type: a.type,
          value: a.value,
          enabled: a.enabled,
          triggered: a.triggered,
        }))
      );
    })();
  }, []);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // 窗口尺寸：看 K 线时固定放大；盯盘/隐身时按内容自动收缩
  useLayoutEffect(() => {
    if (selected || view !== 'watch') {
      if (selected) window.electronAPI?.resize(SIZE_KLINE.w, SIZE_KLINE.h);
      return;
    }
    const app = appRef.current;
    if (!app) return;
    const measure = () => {
      let h = 0;
      const list = app.querySelector('.stock-list') as HTMLElement | null;
      Array.from(app.children).forEach((c) => {
        const el = c as HTMLElement;
        const pos = getComputedStyle(el).position;
        if (pos === 'absolute' || pos === 'fixed') return;
        if (el === list) return;
        h += el.offsetHeight;
      });
      if (list) {
        const cs = getComputedStyle(list);
        const gap = parseFloat(cs.rowGap || cs.gap || '0') || 0;
        const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        const rows = Array.from(list.children) as HTMLElement[];
        let listH = padV;
        rows.forEach((r, i) => {
          listH += r.offsetHeight + (i > 0 ? gap : 0);
        });
        h += listH;
      }
      window.electronAPI?.resize(340, Math.min(Math.max(Math.ceil(h), 72), 680));
    };
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [selected, disguised, view, stocks]);

  // 老板键监听（F9）
  useEffect(() => {
    window.electronAPI?.onToggleDisguise(() => setDisguised((d) => !d));
  }, []);

  // 自动刷新（仅自选列表）
  useEffect(() => {
    if (autoRefresh && stocks.length > 0) {
      doFetch();
      timerRef.current = setInterval(doFetch, REFRESH_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, stocks]);

  const doFetch = useCallback(async () => {
    if (stocks.length === 0) return;
    setLoading(true);
    const codes = stocks.map((s) => s.code);
    const data = await fetchQuotes(codes);
    const map: Record<string, StockQuote> = {};
    data.forEach((d) => {
      map[d.code] = d;
      if (d.name && d.name !== '--') {
        setStocks((prev) =>
          prev.map((s) => (s.code === d.code && s.name !== d.name ? { ...s, name: d.name } : s))
        );
      }
    });
    setQuotes(map);
    setLoading(false);

    // 价格提醒检查
    const list = alertsRef.current;
    if (list.length) {
      let changed = false;
      const next = list.map((a) => {
        if (!a.enabled || a.triggered) return a;
        const q = map[a.code];
        if (!q || q.price == null) return a;
        let hit = false;
        if (a.type === 'price_above' && q.price >= a.value) hit = true;
        if (a.type === 'price_below' && q.price <= a.value) hit = true;
        if (a.type === 'pct_above' && q.changePct != null && q.changePct >= a.value) hit = true;
        if (a.type === 'pct_below' && q.changePct != null && q.changePct <= a.value) hit = true;
        if (hit) {
          changed = true;
          if (a.id != null) window.electronAPI?.db?.setAlertTriggered(a.id, true);
          window.electronAPI?.notify(`${q.name || a.code} · 提醒触发`, alertMsg(a, q));
          showToast(`🔔 ${q.name || a.code} ${alertTypeText(a.type)} ${a.value}`);
          return { ...a, triggered: true };
        }
        return a;
      });
      if (changed) setAlerts(next);
    }
  }, [stocks]);

  // 添加自选
  const addStock = async () => {
    const code = resolveCode(input);
    if (!code) {
      showToast('代码格式不对，试试 sh600519 或 600519');
      return;
    }
    if (stocks.find((s) => s.code === code)) {
      showToast('已经在列表里了');
      setInput('');
      return;
    }
    const [d] = await fetchQuotes([code]);
    if (d.error) {
      showToast('找不到这只股票，检查代码');
      return;
    }
    setStocks((prev) => [...prev, { code, name: d.name || code }]);
    setQuotes((prev) => ({ ...prev, [code]: d }));
    setInput('');
    window.electronAPI?.db?.addStock(code, d.name || code);
  };

  const removeStock = (code: string) => {
    setStocks((prev) => prev.filter((s) => s.code !== code));
    setQuotes((prev) => {
      const n = { ...prev };
      delete n[code];
      return n;
    });
    setAlerts((prev) => prev.filter((a) => a.code !== code));
    window.electronAPI?.db?.removeStock(code);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  // 提醒编辑（写入 SQLite）
  const saveAlert = async (code: string, type: AlertType, value: number) => {
    const existing = alerts.find((a) => a.code === code);
    const savedId = await window.electronAPI?.db?.saveAlert({
      id: existing?.id,
      code,
      type,
      value,
      enabled: true,
      triggered: false,
    });
    setAlerts((prev) => {
      const idx = prev.findIndex((a) => a.code === code);
      const rec: Alert = {
        id: savedId ?? existing?.id,
        code,
        type,
        value,
        enabled: true,
        triggered: false,
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = rec;
        return next;
      }
      return [...prev, rec];
    });
    setAlertEditorFor(null);
  };
  const removeAlert = (code: string) => {
    const a = alerts.find((x) => x.code === code);
    if (a?.id != null) window.electronAPI?.db?.deleteAlert(a.id);
    setAlerts((prev) => prev.filter((a) => a.code !== code));
    setAlertEditorFor(null);
  };
  const resetAlert = (code: string) => {
    setAlerts((prev) => prev.map((a) => (a.code === code ? { ...a, triggered: false } : a)));
    const a = alerts.find((x) => x.code === code);
    if (a?.id != null) window.electronAPI?.db?.setAlertTriggered(a.id, false);
    setAlertEditorFor(null);
  };

  const alertCodes = new Set(alerts.filter((a) => a.enabled).map((a) => a.code));

  // ══ 隐身模式：整体替换界面 ══
  if (disguised) {
    return (
      <div className="app" ref={appRef}>
        <DisguiseView
          skin={skin}
          onCycle={() => setSkin((s) => (s === 'clock' ? 'monitor' : 'clock'))}
          onExit={() => setDisguised(false)}
        />
      </div>
    );
  }

  // ══ K线详情视图 ══
  if (selected) {
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <KLineView
          code={selected.code}
          name={selected.name}
          quote={quotes[selected.code]}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  // ══ 大盘视图 ══
  if (view === 'market') {
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <MarketView onBack={() => setView('watch')} />
      </div>
    );
  }

  // ══ 资金视图 ══
  if (view === 'funds') {
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <FundsView onBack={() => setView('watch')} />
      </div>
    );
  }

  return (
    <div className="app" ref={appRef}>
      {toast && <div className="toast">{toast}</div>}
      <div className={`loading-bar ${loading ? 'show' : ''}`} />

      {/* 标题栏 */}
      <header className="title-bar">
        <span className="title-dot">●</span>
        <span className="title-text">摸鱼盯盘</span>
        <div className="title-right">
          <button
            className="nav-btn"
            onClick={() => setView('funds')}
            title="资金流"
          >
            💰
          </button>
          <button
            className="nav-btn"
            onClick={() => setView('market')}
            title="大盘"
          >
            📊
          </button>
          <button className="disguise-btn" onClick={() => setDisguised(true)} title="隐身 (F9)">
            🐟
          </button>
          <button
            className={`auto-btn ${autoRefresh ? 'on' : 'off'}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '自动' : '手动'}
          </button>
          <button className="close-btn" onClick={() => window.electronAPI?.close()}>
            ✕
          </button>
        </div>
      </header>

      {/* 输入栏 */}
      <div className="add-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStock()}
          placeholder="代码，如 sh600519 / 600519"
          spellCheck={false}
        />
        <button onClick={addStock}>+ 添加</button>
      </div>

      {/* 股票列表（每只一行） */}
      <div className="stock-list">
        {stocks.map((s, i) => (
          <StockRow
            key={s.code}
            index={i}
            stock={s}
            quote={quotes[s.code]}
            hasAlert={alertCodes.has(s.code)}
            onRemove={() => removeStock(s.code)}
            onAlert={() => setAlertEditorFor(s.code)}
            onOpen={() => setSelected({ code: s.code, name: s.name })}
          />
        ))}
      </div>

      {/* 提醒编辑弹窗 */}
      {alertEditorFor && (
        <AlertEditor
          code={alertEditorFor}
          stockName={stocks.find((s) => s.code === alertEditorFor)?.name || alertEditorFor}
          existing={alerts.find((a) => a.code === alertEditorFor) || null}
          onClose={() => setAlertEditorFor(null)}
          onSave={(type, value) => saveAlert(alertEditorFor, type, value)}
          onRemove={() => removeAlert(alertEditorFor)}
          onReset={() => resetAlert(alertEditorFor)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  StockRow — 单行紧凑行
// ═══════════════════════════════════════════════════
function StockRow({
  stock,
  quote,
  index,
  hasAlert,
  onRemove,
  onAlert,
  onOpen,
}: {
  stock: StockItem;
  quote?: StockQuote;
  index: number;
  hasAlert: boolean;
  onRemove: () => void;
  onAlert: () => void;
  onOpen: () => void;
}) {
  const price = quote?.price ?? null;
  const pct = quote?.changePct ?? null;
  const isUp = pct != null && pct > 0;
  const isDown = pct != null && pct < 0;
  const colorClass = isUp ? 'up' : isDown ? 'down' : 'flat';

  return (
    <div className="stock-row" onClick={onOpen} title="点击看 K 线">
      <span className="rank">{index + 1}</span>
      <span className="nm">{stock.name}</span>
      <span className="cd">{stock.code}</span>
      <button
        className={`alert-btn ${hasAlert ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onAlert();
        }}
        title="价格提醒"
      >
        🔔
      </button>
      {price == null && quote?.error ? (
        <span className="px err">{quote.error}</span>
      ) : (
        <span className={`px ${colorClass}`}>{fmtPrice(price)}</span>
      )}
      <span className={`pc ${colorClass}`}>
        {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : ''}
      </span>
      <button
        className="rm"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="移除"
      >
        ×
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  MarketView — 大盘指数
// ═══════════════════════════════════════════════════
function MarketView({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<MarketIndex[]>([]);
  const [updated, setUpdated] = useState('');
  const [err, setErr] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetchMarket();
    if (res.error) {
      setErr(res.error);
    } else {
      setRows(res.rows);
      setUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }
    fitWindow(rootRef, SIZE_PANEL.w);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="panel" ref={rootRef}>
      <header className="panel-head">
        <button className="panel-back" onClick={onBack}>←</button>
        <span className="panel-title">大盘指数</span>
        <span className="panel-status">{updated ? `更新 ${updated}` : err || '加载中…'}</span>
      </header>
      <div className="mkt-list">
        {rows.map((r) => {
          const up = r.changePct > 0;
          const down = r.changePct < 0;
          const cls = up ? 'up' : down ? 'down' : 'flat';
          return (
            <div className="mkt-row" key={r.code}>
              <span className="mkt-name">{r.name}</span>
              <span className={`mkt-price ${cls}`}>{r.price.toFixed(2)}</span>
              <span className={`mkt-pct ${cls}`}>
                {r.changePct >= 0 ? '+' : ''}
                {r.changePct.toFixed(2)}%
              </span>
              <span className="mkt-amt">成交额 {(r.amount / 1e8).toFixed(0)}亿</span>
            </div>
          );
        })}
        {!rows.length && !err && <div className="panel-empty">加载大盘数据中…</div>}
        {err && <div className="panel-empty">{err}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  FundsView — 资金流
// ═══════════════════════════════════════════════════
function FundsView({ onBack }: { onBack: () => void }) {
  const [cat, setCat] = useState<'industry' | 'concept' | 'stock'>('industry');
  const [rows, setRows] = useState<FundFlowItem[]>([]);
  const [updated, setUpdated] = useState('');
  const [err, setErr] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetchFunds(cat, 50);
    if (res.error) {
      setErr(res.error);
    } else {
      setRows(res.rows);
      setUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }
    fitWindow(rootRef, SIZE_PANEL.w);
  }, [cat]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const tabs: { key: 'industry' | 'concept' | 'stock'; label: string }[] = [
    { key: 'industry', label: '行业' },
    { key: 'concept', label: '概念' },
    { key: 'stock', label: '个股' },
  ];

  return (
    <div className="panel" ref={rootRef}>
      <header className="panel-head">
        <button className="panel-back" onClick={onBack}>←</button>
        <span className="panel-title">资金流</span>
        <span className="panel-status">{updated ? `更新 ${updated}` : err || '加载中…'}</span>
      </header>
      <div className="fund-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`fund-tab ${cat === t.key ? 'on' : ''}`}
            onClick={() => setCat(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="fund-list">
        {rows.map((r, i) => {
          const up = r.changePct > 0;
          const cls = r.mainNet > 0 ? 'up' : r.mainNet < 0 ? 'down' : 'flat';
          return (
            <div className="fund-row" key={r.code + i}>
              <span className="fund-rank">{i + 1}</span>
              <div className="fund-main">
                <div className="fund-name">{r.name}</div>
                <div className="fund-sub">
                  {up ? '↑' : '↓'}
                  {Math.abs(r.changePct).toFixed(2)}%
                  {r.leaderName ? ` · 领涨 ${r.leaderName}` : ''}
                </div>
                <div className="fund-detail">
                  超大{fmtMoney(r.superNet)} 大{fmtMoney(r.largeNet)} 中{fmtMoney(r.mediumNet)} 小
                  {fmtMoney(r.smallNet)}
                </div>
              </div>
              <span className={`fund-net ${cls}`}>{fmtMoney(r.mainNet)}</span>
            </div>
          );
        })}
        {!rows.length && !err && <div className="panel-empty">加载资金流…</div>}
        {err && <div className="panel-empty">{err}</div>}
      </div>
      <div className="panel-foot">主力净流入（亿元）· 红=流入 绿=流出</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  KLineView — K 线详情（东方财富源 + 多周期 + 十字光标 + 画线）
// ═══════════════════════════════════════════════════
function KLineView({
  code,
  name,
  quote,
  onBack,
}: {
  code: string;
  name: string;
  quote?: StockQuote;
  onBack: () => void;
}) {
  const [tabIdx, setTabIdx] = useState(6); // 默认日K
  const [bars, setBars] = useState<KLineBar[]>([]);
  const [preClose, setPreClose] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lines, setLines] = useState<TrendLine[]>([]);
  const [pending, setPending] = useState<{ i: number; p: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    drawChart(canvasRef.current, bars, lineMode, preClose, hoverIdx, lines, pending);
  }, [bars, lineMode, preClose, hoverIdx, lines, pending]);

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
    const g = computeGeom(bars, canvas.clientWidth, canvas.clientHeight);
    if (!g) return;
    if (x < g.padL || x > g.padL + g.plotW) {
      setHoverIdx(null);
      return;
    }
    const i = Math.round((x - g.padL) / g.slot - 0.5);
    setHoverIdx(Math.max(0, Math.min(bars.length - 1, i)));
    if (drawMode) {
      const p = g.max - (y - g.padT) / g.chartH * (g.max - g.min);
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
      if (prev.length && prev[prev.length - 1].i2 === undefined) return prev;
      return [...prev, { i1: pending.i, p1: pending.p, i2: pending.i, p2: pending.p }];
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
        <span>左键两点连线 · 右键撤销 · 数据来自东方财富</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  AlertEditor 弹窗
// ═══════════════════════���═══════════════════════════
function AlertEditor({
  stockName,
  existing,
  onClose,
  onSave,
  onRemove,
  onReset,
}: {
  code: string;
  stockName: string;
  existing: Alert | null;
  onClose: () => void;
  onSave: (type: AlertType, value: number) => void;
  onRemove: () => void;
  onReset: () => void;
}) {
  const [type, setType] = useState<AlertType>(existing?.type || 'price_above');
  const [value, setValue] = useState(existing ? String(existing.value) : '');

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">🔔 {stockName} · 价格提醒</div>

        <div className="modal-field">
          <label>条件</label>
          <select value={type} onChange={(e) => setType(e.target.value as AlertType)}>
            <option value="price_above">涨过价格</option>
            <option value="price_below">跌破价格</option>
            <option value="pct_above">涨幅超过 (%)</option>
            <option value="pct_below">跌幅超过 (%)</option>
          </select>
        </div>

        <div className="modal-field">
          <label>数值</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type.startsWith('pct') ? '如 3' : '如 1800'}
            autoFocus
          />
        </div>

        {existing && (
          <div className={`modal-status ${existing.triggered ? 'fired' : ''}`}>
            {existing.triggered ? '✅ 已触发' : '🟢 监控中'} · {alertTypeText(existing.type)} {existing.value}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onRemove}>
            删除
          </button>
          {existing?.triggered && (
            <button className="btn-ghost" onClick={onReset}>
              重新武装
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => {
              const v = Number(value);
              if (!value || isNaN(v)) return;
              onSave(type, v);
            }}
          >
            保存
          </button>
        </div>
        <div className="modal-hint">触发后弹系统通知；想再次提醒点「重新武装」</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  DisguiseView 隐身视图
// ═══════════════════���═══════════════════════════════
function DisguiseView({
  skin,
  onCycle,
  onExit,
}: {
  skin: DisguiseSkin;
  onCycle: () => void;
  onExit: () => void;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [cpu, setCpu] = useState(12);
  const [mem, setMem] = useState(38);
  useEffect(() => {
    if (skin !== 'monitor') return;
    const t = setInterval(() => {
      setCpu(8 + Math.round(Math.random() * 30));
      setMem(30 + Math.round(Math.random() * 25));
    }, 1500);
    return () => clearInterval(t);
  }, [skin]);

  if (skin === 'clock') {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    return (
      <div className="disguise" onClick={onExit}>
        <div className="dg-label">系统时钟</div>
        <div className="dg-clock">
          {hh}:{mm}
          <span className="dg-sec">{ss}</span>
        </div>
        <div className="dg-date">{dateStr} 星期{week}</div>
        <div className="dg-bar">
          <button onClick={(e) => { e.stopPropagation(); onCycle(); }}>🔄 换皮肤</button>
          <button onClick={(e) => { e.stopPropagation(); onExit(); }}>👁 恢复</button>
        </div>
        <div className="dg-hint">按 F9 或点击空白处恢复盯盘</div>
      </div>
    );
  }

  return (
    <div className="disguise" onClick={onExit}>
      <div className="dg-label">任务管理器</div>
      <div className="dg-mon">
        <div className="dg-row">
          <span>CPU</span>
          <div className="dg-track">
            <div className="dg-fill" style={{ width: cpu + '%' }} />
          </div>
          <b>{cpu}%</b>
        </div>
        <div className="dg-row">
          <span>MEM</span>
          <div className="dg-track">
            <div className="dg-fill mem" style={{ width: mem + '%' }} />
          </div>
          <b>{mem}%</b>
        </div>
        <div className="dg-sub">进程数 287 · 系统运行正常</div>
      </div>
      <div className="dg-bar">
        <button onClick={(e) => { e.stopPropagation(); onCycle(); }}>🔄 换皮肤</button>
        <button onClick={(e) => { e.stopPropagation(); onExit(); }}>👁 恢复</button>
      </div>
      <div className="dg-hint">按 F9 或点击空白处恢复盯盘</div>
    </div>
  );
}
