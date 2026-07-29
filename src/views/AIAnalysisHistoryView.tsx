import { useState } from 'react';
import type { AIAnalysis, AIAnalysisKind, AIAnalysisSummary } from '../types';

interface Props {
  analyses: AIAnalysisSummary[];
  filter: { kind: AIAnalysisKind | 'all'; code: string };
  onChangeKind: (kind: AIAnalysisKind | 'all') => void;
  onChangeCode: (code: string) => void;
  onBack: () => void;
  onRefresh: () => void;
  onDelete: (id: number) => void;
  onClear: () => void;
}

function formatAnalysisResponse(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw;
  }
}

function kindLabel(k: AIAnalysis['kind']): string {
  return k === 'news' ? '📰 新闻解读' : k === 'kline' ? '📈 K线总结' : '🧪 个股诊断';
}

export function AIAnalysisHistoryView({
  analyses,
  filter,
  onChangeKind,
  onChangeCode,
  onBack,
  onRefresh,
  onDelete,
  onClear,
}: Props) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AIAnalysis | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const openDetail = async (id: number) => {
    setDetailId(id);
    const rec = (await window.electronAPI?.db?.getAIAnalysis(id)) || null;
    setDetail(rec);
  };
  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <button className="btn-ghost" onClick={onBack}>← 返回</button>
        <h3>AI 分析历史</h3>
        <div className="page-actions">
          <button className="btn-ghost" onClick={onRefresh}>刷新</button>
          {analyses.length > 0 && !confirmClear && (
            <button className="btn-ghost" onClick={() => setConfirmClear(true)}>清空</button>
          )}
          {confirmClear && (
            <>
              <button className="btn-ghost" onClick={onClear}>确认清空</button>
              <button className="btn-ghost" onClick={() => setConfirmClear(false)}>取消</button>
            </>
          )}
        </div>
      </div>

      <div className="ai-filter">
        <select
          value={filter.kind}
          onChange={(e) => onChangeKind(e.target.value as AIAnalysisKind | 'all')}
        >
          <option value="all">全部类型</option>
          <option value="news">新闻解读</option>
          <option value="kline">K线总结</option>
          <option value="diagnosis">个股诊断</option>
        </select>
        <input
          type="text"
          placeholder="按股票代码过滤"
          value={filter.code}
          onChange={(e) => onChangeCode(e.target.value.trim())}
        />
      </div>

      {analyses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧠</div>
          <div>暂无 AI 分析记录</div>
          <div className="empty-sub">新闻解读、K线总结、一键诊断的结果都会自动保存到这里</div>
        </div>
      ) : (
        <ul className="history-list">
          {analyses.map((a) => (
            <li key={a.id} className="history-item">
              <div className="history-row1">
                <span className="history-code">{a.code}</span>
                <span className="history-time">
                  {new Date(a.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </span>
              </div>
              <div className="history-row2">
                <span>{kindLabel(a.kind)}</span>
                <span>{a.model}</span>
                <span className="ai-input-summary">
                  {a.inputSummary.length > 32 ? a.inputSummary.slice(0, 32) + '…' : a.inputSummary}
                </span>
                <span className="history-status">
                  <button className="btn-link" onClick={() => openDetail(a.id)}>查看</button>
                  <button className="btn-link danger" onClick={() => onDelete(a.id)}>删除</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {detailId != null && (
        <div className="modal-mask" onClick={closeDetail}>
          <div className="modal ai-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {detail ? `${detail.code} · ${kindLabel(detail.kind)}` : '加载中…'}
            </div>
            {detail ? (
              <div className="ai-detail-body">
                <div className="ai-detail-meta">
                  <span>{new Date(detail.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                  <span>{detail.model}</span>
                  <span>{detail.promptId}</span>
                </div>
                <div className="ai-detail-section">
                  <div className="ai-detail-label">输入</div>
                  <pre className="ai-detail-pre">{detail.inputSummary || '（无）'}</pre>
                </div>
                <div className="ai-detail-section">
                  <div className="ai-detail-label">输出</div>
                  <pre className="ai-detail-pre">{formatAnalysisResponse(detail.responseJson)}</pre>
                </div>
              </div>
            ) : (
              <div className="ai-detail-loading">加载中…</div>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={closeDetail}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}