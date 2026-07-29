import { useRef, useState } from 'react';
import type { AIAnalysisKind, Alert, KLineBar, StockQuote } from '../types';
import {
  buildDiagnosisBundle,
  renderDiagnosisPrompt,
  parseBrief,
  type Brief,
  type DiagnosisBundle,
} from '../diagnosis';

interface DiagnosisProps {
  code: string;
  stockName?: string;
  quote: StockQuote | null;
  bars: KLineBar[] | null;
  news: { title: string; source?: string }[] | null;
  alerts: Alert[];
  recordAnalysis: (params: {
    kind: AIAnalysisKind;
    code: string;
    model: string;
    promptId: string;
    inputSummary: string;
    response: object;
  }) => void;
  onBack: () => void;
}

type Step = 'idle' | 'collecting' | 'ready' | 'parsing' | 'done' | 'error';

export function OneClickDiagnosis({
  code,
  stockName,
  quote,
  bars,
  news,
  alerts,
  recordAnalysis,
  onBack,
}: DiagnosisProps) {
  const [step, setStep] = useState<Step>('idle');
  const [bundle, setBundle] = useState<DiagnosisBundle | null>(null);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  const [brief, setBrief] = useState<Brief | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const collect = async () => {
    if (step === 'collecting') return;
    setStep('collecting');
    setErr('');
    abortRef.current = new AbortController();
    try {
      await new Promise((r) => setTimeout(r, 50));
      if (abortRef.current.signal.aborted) {
        setStep('idle');
        return;
      }
      const b = buildDiagnosisBundle({
        code,
        stockName: stockName || '',
        quote,
        kline: bars,
        news: news || [],
        position: null,
        alerts,
      });
      setBundle(b);
      setStep('ready');
    } catch (e) {
      setErr((e as Error).message);
      setStep('error');
    }
  };

  const onParse = () => {
    if (!bundle) return;
    setStep('parsing');
    const result = parseBrief(paste);
    if (!result.ok) {
      setErr(result.error);
      setStep('error');
      return;
    }
    setBrief(result.brief);
    try {
      recordAnalysis({
        kind: 'diagnosis',
        code: bundle.code,
        model: 'manual',
        promptId: 'diagnosis-v1',
        inputSummary: `${bundle.stockName} · ${bundle.code} · ${bundle.quote?.price ?? '?'}`,
        response: result.brief,
      });
    } catch (e) {
      console.warn('[fish-pan] 诊断结果落库失败', e);
    }
    setStep('done');
  };

  const onCancel = () => {
    abortRef.current?.abort();
    setStep('idle');
  };

  const copyPrompt = async () => {
    if (!bundle) return;
    const text = renderDiagnosisPrompt(bundle);
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // 兜底：用户可手动选中 textarea 复制
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <button className="btn-ghost" onClick={onBack}>← 返回</button>
        <h3>一键诊断 · {stockName || code}</h3>
      </div>

      <div className="diag-body">
        {step === 'idle' && (
          <>
            <div className="diag-info">
              <p>诊断会聚合以下数据：</p>
              <ul>
                <li>当前报价与日内涨跌</li>
                <li>近期 K 线汇总（最多 30 根）</li>
                <li>近期新闻（最多 5 条）</li>
                <li>当前持仓（如果有）</li>
                <li>当前告警规则</li>
              </ul>
              <p className="diag-hint">
                当前未集成 LLM；点击开始后，会把数据组装成 prompt 模板，你可以复制到任意
                OpenAI 兼容的外部 LLM，把返回结果粘贴回来即可落库到 AI 分析历史。
              </p>
            </div>
            <div className="diag-actions">
              <button className="btn-primary" onClick={collect}>开始诊断</button>
            </div>
          </>
        )}

        {step === 'collecting' && (
          <div className="diag-step">
            <div className="diag-spinner" />
            <div>正在收集数据…</div>
            <button className="btn-ghost" onClick={onCancel}>取消</button>
          </div>
        )}

        {step === 'ready' && bundle && (
          <>
            <div className="diag-section">
              <div className="diag-label">输入数据预览（{bundle.code}）</div>
              <pre className="diag-pre">{JSON.stringify(bundle, null, 2)}</pre>
            </div>
            <div className="diag-section">
              <div className="diag-label">Prompt 模板（点右侧复制按钮）</div>
              <textarea
                readOnly
                className="diag-textarea"
                rows={10}
                value={renderDiagnosisPrompt(bundle)}
              />
              <div className="diag-row">
                <button className="btn-ghost" onClick={copyPrompt}>复制 prompt</button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    const t = document.querySelector('.diag-textarea') as HTMLTextAreaElement | null;
                    t?.select();
                  }}
                >选中</button>
              </div>
            </div>
            <div className="diag-section">
              <div className="diag-label">把 LLM 返回粘到这里</div>
              <textarea
                className="diag-textarea"
                rows={8}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder='{"summary":"...","sentiment":"bullish","drivers":[],"risks":[],"observations":[],"watchPoints":[]}'
              />
              <div className="diag-row">
                <button className="btn-primary" onClick={onParse}>解析并保存</button>
                <button className="btn-ghost" onClick={onCancel}>重置</button>
              </div>
            </div>
          </>
        )}

        {step === 'parsing' && (
          <div className="diag-step">
            <div className="diag-spinner" />
            <div>正在解析…</div>
          </div>
        )}

        {step === 'error' && (
          <>
            <div className="diag-warn">解析失败：{err}</div>
            <div className="diag-actions">
              <button className="btn-ghost" onClick={() => { setStep('ready'); setErr(''); }}>返回</button>
            </div>
          </>
        )}

        {step === 'done' && brief && <BriefView brief={brief} onBack={onBack} />}
      </div>
    </div>
  );
}

function BriefView({ brief, onBack }: { brief: Brief; onBack: () => void }) {
  const sentimentText =
    brief.sentiment === 'bullish'
      ? '🟢 偏多'
      : brief.sentiment === 'bearish'
      ? '🔴 偏空'
      : brief.sentiment === 'neutral'
      ? '⚪ 中性'
      : '⚪ 未知';
  return (
    <>
      <div className="diag-section">
        <div className="diag-label">一句话总结</div>
        <div className="diag-summary">{brief.summary || '（无）'}</div>
        <div className="diag-sentiment">{sentimentText}</div>
      </div>
      <div className="diag-section">
        <div className="diag-label">驱动因素</div>
        {brief.drivers.length ? (
          <ul className="diag-list">
            {brief.drivers.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : (
          <div className="diag-empty">（无）</div>
        )}
      </div>
      <div className="diag-section">
        <div className="diag-label">风险点</div>
        {brief.risks.length ? (
          <ul className="diag-list">
            {brief.risks.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : (
          <div className="diag-empty">（无）</div>
        )}
      </div>
      <div className="diag-section">
        <div className="diag-label">观察项</div>
        {brief.observations.length ? (
          <ul className="diag-list">
            {brief.observations.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : (
          <div className="diag-empty">（无）</div>
        )}
      </div>
      <div className="diag-section">
        <div className="diag-label">后续关注</div>
        {brief.watchPoints.length ? (
          <ul className="diag-list">
            {brief.watchPoints.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : (
          <div className="diag-empty">（无）</div>
        )}
      </div>
      <div className="diag-actions">
        <button className="btn-ghost" onClick={onBack}>返回</button>
      </div>
    </>
  );
}