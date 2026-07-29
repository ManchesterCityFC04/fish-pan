import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketIndex } from '../types';
import { fetchMarket } from '../api';
import { fitWindow } from './utils';

const PANEL_W = 360;

export function MarketView({ onBack }: { onBack: () => void }) {
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
    fitWindow(rootRef, PANEL_W);
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