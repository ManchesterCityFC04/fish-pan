import { useCallback, useEffect, useRef, useState } from 'react';
import type { FundFlowItem } from '../types';
import { fetchFunds } from '../api';
import { fmtMoney, fitWindow } from './utils';

const PANEL_W = 360;
const TABS: { key: 'industry' | 'concept' | 'stock'; label: string }[] = [
  { key: 'industry', label: '行业' },
  { key: 'concept', label: '概念' },
  { key: 'stock', label: '个股' },
];

export function FundsView({ onBack }: { onBack: () => void }) {
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
    fitWindow(rootRef, PANEL_W);
  }, [cat]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="panel" ref={rootRef}>
      <header className="panel-head">
        <button className="panel-back" onClick={onBack}>←</button>
        <span className="panel-title">资金流</span>
        <span className="panel-status">{updated ? `更新 ${updated}` : err || '加载中…'}</span>
      </header>
      <div className="fund-tabs">
        {TABS.map((t) => (
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