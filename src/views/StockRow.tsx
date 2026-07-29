import type { StockItem, StockQuote } from '../types';
import { fmtPrice } from '../api';

interface Props {
  stock: StockItem;
  quote?: StockQuote;
  index: number;
  hasAlert: boolean;
  onRemove: () => void;
  onAlert: () => void;
  onOpen: () => void;
  /** market-news-events: 最近一条新闻的发布时间（epoch ms）。无新闻时为 null/undefined。 */
  latestNewsAt?: number | null;
}

function formatLatestNewsTime(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return '暂无';
  const now = Date.now();
  const diffMs = now - ts;
  if (Math.abs(diffMs) > 365 * 24 * 3600 * 1000) return '暂无';
  const d = new Date(ts);
  const nowD = new Date(now);
  const sameDay = d.toDateString() === nowD.toDateString();
  if (sameDay) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const yest = new Date(now - 24 * 3600 * 1000);
  if (d.toDateString() === yest.toDateString()) return '昨天';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export function StockRow({
  stock,
  quote,
  index,
  hasAlert,
  onRemove,
  onAlert,
  onOpen,
  latestNewsAt,
}: Props) {
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
      <span className="news-time" title="最近一条新闻时间">
        {formatLatestNewsTime(latestNewsAt)}
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