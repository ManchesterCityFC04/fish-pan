import type { AlertEvent } from '../types';
import { alertTypeText } from './utils';

interface Props {
  events: AlertEvent[];
  onBack: () => void;
  onRefresh: () => void;
  onClear: () => void;
}

export function AlertHistoryView({ events, onBack, onRefresh, onClear }: Props) {
  return (
    <div className="page">
      <div className="page-head">
        <button className="btn-ghost" onClick={onBack}>← 返回</button>
        <h3>提醒历史</h3>
        <div className="page-actions">
          <button className="btn-ghost" onClick={onRefresh}>刷新</button>
          {events.length > 0 && (
            <button className="btn-ghost" onClick={onClear}>清空</button>
          )}
        </div>
      </div>
      {events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div>暂无触发记录</div>
          <div className="empty-sub">仅在 Fish Pan 运行期间监控；价格穿越阈值时记录</div>
        </div>
      ) : (
        <ul className="history-list">
          {events.map((e) => (
            <li key={e.id} className="history-item">
              <div className="history-row1">
                <span className="history-code">{e.code}</span>
                <span className="history-time">
                  {new Date(e.triggeredAt).toLocaleString('zh-CN', { hour12: false })}
                </span>
              </div>
              <div className="history-row2">
                <span>{alertTypeText(e.type)} {e.threshold}</span>
                <span>现价 {e.observed}</span>
                <span className="history-status">
                  {e.notificationStatus === 'sent'
                    ? '✅ 通知已发送'
                    : e.notificationStatus === 'failed'
                    ? '⚠️ 通知失败'
                    : '— 未通知'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}