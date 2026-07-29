import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  StockItem,
  StockQuote,
  Alert,
  AlertType,
  AlertEvent,
  AIAnalysis,
  AIAnalysisKind,
  AIAnalysisSummary,
  DisguiseSkin,
} from './types';
import { fetchQuotes, resolveCode, fetchNewsList } from './api';
import { evaluateAlert } from './alertEngine';
import { FEATURE_MARKET_NEWS_EVENTS } from './featureFlags';
import type { NewsItem } from './types';
import { buildBundle, type Bundle } from './bundle';
import {
  StockRow,
  MarketView,
  FundsView,
  KLineView,
  AIAnalysisHistoryView,
  SettingsBackupView,
  OneClickDiagnosis,
  AlertEditor,
  AlertHistoryView,
  AddPositionCalculator,
  DisguiseView,
  alertMsg,
  alertTypeText,
} from './views';
import './App.css';

const REFRESH_MS = 5000;

// 窗口尺寸：看 K 线时固定放大（盯盘/隐身按内容自动收缩）
const SIZE_KLINE = { w: 384, h: 560 };

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
  const [view, setView] = useState<'watch' | 'market' | 'funds' | 'history' | 'addpos' | 'ai-history' | 'diag' | 'backup'>('watch');
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
  const [addPosFor, setAddPosFor] = useState<string | null>(null);
  const [aiAnalyses, setAiAnalyses] = useState<AIAnalysisSummary[]>([]);
  const [aiFilter, setAiFilter] = useState<{ kind: AIAnalysisKind | 'all'; code: string }>({
    kind: 'all',
    code: '',
  });
  const [diagFor, setDiagFor] = useState<string | null>(null);
  const [diagNews, setDiagNews] = useState<NewsItem[] | null>(null);
  const [latestNewsAt, setLatestNewsAt] = useState<Record<string, number>>({});

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
          // 重启后强制走阈值穿越：清掉 triggered，避免错过首次穿越。
          triggered: false,
          // 老行可能没有 prevValue/colddownMs/lastTriggeredAt，使用安全默认值。
          prevValue: a.prevValue,
          cooldownMs: a.cooldownMs,
          lastTriggeredAt: a.lastTriggeredAt,
        }))
      );
    })();
  }, []);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // market-news-events: 拉取每个自选股的最新新闻时间（仅开启时）。
  useEffect(() => {
    if (!FEATURE_MARKET_NEWS_EVENTS) return;
    let cancelled = false;
    const run = async () => {
      for (const s of stocks) {
        try {
          const r = await fetchNewsList('news', s.code);
          if (cancelled) return;
          const items = r.data || [];
          if (items.length > 0) {
            const top = items[0];
            setLatestNewsAt((prev) =>
              prev[s.code] === top.publishedAt ? prev : { ...prev, [s.code]: top.publishedAt },
            );
          }
        } catch {
          // 单股失败不影响其他；保持旧值。
        }
      }
    };
    void run();
    const id = setInterval(run, 10 * 60 * 1000); // 10 分钟
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [stocks]);

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

  // 通知点击：聚焦窗口后把对应股票/规则回填到 UI。
  useEffect(() => {
    window.electronAPI?.onAlertActivation((ctx) => {
      if (!ctx) return;
      if (ctx.code) {
        // 从 K 线/其它子视图回到盯盘列表；选中态本身保持 null。
        setSelected(null);
        setView('watch');
      }
      if (ctx.alertId != null) {
        const target = alertsRef.current.find((a) => a.id === ctx.alertId);
        if (target) setAlertEditorFor(target.code);
      }
    });
  }, []);

  // 自动刷新（仅自选列表）—— 让 setInterval 自管首拍，避免与 dep 变化时的额外调用重复。
  useEffect(() => {
    if (!autoRefresh || stocks.length === 0) return;
    timerRef.current = setInterval(doFetch, REFRESH_MS);
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

    // 价格提醒检查（阈值穿越 + 冷却）
    const list = alertsRef.current;
    if (list.length) {
      let changed = false;
      const next = list.map((a) => {
        if (!a.enabled) return a;
        const q = map[a.code];
        const result = evaluateAlert(a, q, Date.now());
        // 持久化 prevValue（包括仅 priming / no-op 的情况）。
        if (result.prevValue !== a.prevValue && a.id != null) {
          window.electronAPI?.db?.setAlertPrevValue(a.id, result.prevValue);
        }
        if (result.trigger) {
          changed = true;
          // 先尝试发送通知，再依据结果写入**一条**历史事件 —— 避免重复记录。
          let notificationStatus: 'sent' | 'failed' | 'no-notification' = 'no-notification';
          try {
            window.electronAPI?.notify(
              `${q?.name || a.code} · 提醒触发`,
              alertMsg(a, q),
              { alertId: a.id ?? null, code: a.code }
            );
            notificationStatus = 'sent';
          } catch (e) {
            console.error('[fish-pan] 通知失败', e);
            notificationStatus = 'failed';
          }
          if (a.id != null) {
            window.electronAPI?.db?.insertAlertEvent({
              alertId: a.id,
              code: a.code,
              type: a.type,
              threshold: result.trigger.threshold,
              observed: result.trigger.observed,
              direction: result.trigger.direction,
              cooldownMs: result.trigger.cooldownMs,
              triggeredAt: result.trigger.triggeredAt,
              notificationStatus,
            });
          }
          showToast(`🔔 ${q?.name || a.code} ${alertTypeText(a.type)} ${a.value}`);
          return {
            ...a,
            triggered: true,
            prevValue: result.prevValue,
            lastTriggeredAt: result.trigger.triggeredAt,
          };
        }
        // 评估无触发但 prevValue 可能变化（首观察/no-op）。
        if (result.prevValue !== a.prevValue) {
          changed = true;
          return { ...a, prevValue: result.prevValue };
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
  const saveAlert = async (code: string, type: AlertType, value: number, cooldownMs: number) => {
    const existing = alerts.find((a) => a.code === code);
    const savedId = await window.electronAPI?.db?.saveAlert({
      id: existing?.id,
      code,
      type,
      value,
      cooldownMs: Number.isFinite(cooldownMs) && cooldownMs >= 0 ? cooldownMs : 600000,
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
        // 重新保存相当于重置：清空 prev，让首笔行情重新 priming。
        prevValue: null,
        cooldownMs: Number.isFinite(cooldownMs) && cooldownMs >= 0 ? cooldownMs : 600000,
        lastTriggeredAt: null,
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
    setAlerts((prev) =>
      prev.map((a) =>
        a.code === code
          ? { ...a, triggered: false, prevValue: null, lastTriggeredAt: null }
          : a
      )
    );
    const a = alerts.find((x) => x.code === code);
    if (a?.id != null) window.electronAPI?.db?.rearmAlert(a.id);
    setAlertEditorFor(null);
  };
  const toggleAlertEnabled = (code: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.code === code ? { ...a, enabled: !a.enabled } : a))
    );
    const a = alerts.find((x) => x.code === code);
    if (a?.id != null) window.electronAPI?.db?.setAlertEnabled(a.id, !a.enabled);
  };
  const setAlertCooldown = (code: string, ms: number) => {
    setAlerts((prev) =>
      prev.map((a) => (a.code === code ? { ...a, cooldownMs: ms } : a))
    );
    const a = alerts.find((x) => x.code === code);
    if (a?.id != null) window.electronAPI?.db?.setAlertCooldown(a.id, ms);
  };

  // 一键诊断：渲染端组装 bundle
  const openDiagnosis = (code: string) => {
    setDiagFor(code);
    setView('diag');
  };

  // 设置备份：导出 / 导入
  const refreshFromDB = useCallback(async () => {
    const db = window.electronAPI?.db;
    if (!db) return;
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
        triggered: false,
        prevValue: a.prevValue,
        cooldownMs: a.cooldownMs,
        lastTriggeredAt: a.lastTriggeredAt,
      }))
    );
  }, []);
  const exportSettings = async (includeSecrets: boolean) => {
    const db = window.electronAPI?.db;
    if (!db) return;
    const aiRows = await db.listAIAnalyses({ limit: 500 });
    const aiDetails = await Promise.all(
      aiRows.map((a) => db.getAIAnalysis(a.id))
    );
    const bundle = buildBundle({
      watchlist: stocks.map((s, i) => ({ code: s.code, name: s.name, sortOrder: i })),
      alerts,
      alertEvents,
      aiAnalyses: aiDetails.filter((a): a is AIAnalysis => a != null),
      llmConfig: { baseUrl: null, model: null, proxyUrl: null },
    });
    // 真实脱敏由主进程按 includeSecrets 完成；这里只传标志。
    const ret = await db.exportBundle({ includeSecrets });
    if (ret.error) {
      showToast(`❌ 导出失败：${ret.error}`);
    } else if (ret.canceled) {
      // 用户取消，不提示
    } else {
      showToast(`✅ 已导出 ${ret.counts?.watchlist ?? 0} 只股票 / ${ret.counts?.alerts ?? 0} 条提醒 / ${ret.counts?.alertEvents ?? 0} 条历史`);
    }
  };
  const importSettings = async (replaceHistory: boolean) => {
    const db = window.electronAPI?.db;
    if (!db) return;
    const ret = await db.importBundle({ replaceHistory });
    if (ret.error) {
      showToast(`❌ 导入失败：${ret.error}`);
      return;
    }
    if (ret.canceled) return;
    await refreshFromDB();
    // 重新拉取 AI 历史
    const rows = await db.listAIAnalyses({ limit: 200 });
    setAiAnalyses(rows || []);
    showToast(`✅ 已导入 ${ret.counts?.watchlist ?? 0} 只股票 / ${ret.counts?.alerts ?? 0} 条提醒 / ${ret.counts?.aiAnalyses ?? 0} 条 AI 分析`);
  };
  const openHistoryView = () => {
    setView('history');
    window.electronAPI?.db?.listAlertEvents(200).then((rows) => setAlertEvents(rows));
  };
  const clearHistory = () => {
    window.electronAPI?.db?.clearAlertEvents();
    setAlertEvents([]);
  };

  // AI 分析历史（独立 ai-analysis-history 能力）
  const openAIHistoryView = useCallback(async () => {
    setView('ai-history');
    const rows = await window.electronAPI?.db?.listAIAnalyses({ limit: 200 });
    setAiAnalyses(rows || []);
  }, []);
  const refreshAIHistory = useCallback(async () => {
    const filter: { kind?: AIAnalysisKind; code?: string } = {};
    if (aiFilter.kind !== 'all') filter.kind = aiFilter.kind;
    if (aiFilter.code) filter.code = aiFilter.code;
    const rows = await window.electronAPI?.db?.listAIAnalyses({ limit: 200, ...filter });
    setAiAnalyses(rows || []);
  }, [aiFilter]);
  const clearAIHistory = async () => {
    await window.electronAPI?.db?.clearAIAnalyses();
    setAiAnalyses([]);
  };
  const deleteAIHistory = async (id: number) => {
    await window.electronAPI?.db?.deleteAIAnalysis(id);
    setAiAnalyses((prev) => prev.filter((a) => a.id !== id));
  };
  // 供后续 LLM 调用使用的统一记录入口；持久化失败不抛错。
  const recordAnalysis = (params: {
    kind: AIAnalysisKind;
    code: string;
    model: string;
    promptId: string;
    inputSummary: string;
    response: object;
  }) => {
    window.electronAPI?.db?.insertAIAnalysis({
      kind: params.kind,
      code: params.code,
      model: params.model,
      promptId: params.promptId,
      inputSummary: params.inputSummary,
      responseJson: params.response,
      createdAt: Date.now(),
    }).catch((e) => console.warn('[fish-pan] 持久化 AI 分析失败', e));
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

  // ══ 触发历史视图（独立 alert-history 能力） ══
  if (view === 'history') {
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <AlertHistoryView
          events={alertEvents}
          onBack={() => setView('watch')}
          onRefresh={openHistoryView}
          onClear={clearHistory}
        />
      </div>
    );
  }

  // ══ 加仓测算视图（独立 add-position-calculator 能力） ══
  if (view === 'addpos') {
    const prefillQuote = addPosFor ? quotes[addPosFor] : null;
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <AddPositionCalculator
          code={addPosFor}
          stockName={addPosFor ? stocks.find((s) => s.code === addPosFor)?.name : undefined}
          currentPrice={prefillQuote?.price ?? null}
          onBack={() => {
            setView('watch');
            setAddPosFor(null);
          }}
        />
      </div>
    );
  }

  // ══ AI 分析历史视图（独立 ai-analysis-history 能力） ══
  if (view === 'ai-history') {
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <AIAnalysisHistoryView
          analyses={aiAnalyses}
          filter={aiFilter}
          onChangeKind={(kind) => setAiFilter((f) => ({ ...f, kind }))}
          onChangeCode={(code) => setAiFilter((f) => ({ ...f, code }))}
          onBack={() => setView('watch')}
          onRefresh={refreshAIHistory}
          onDelete={deleteAIHistory}
          onClear={clearAIHistory}
        />
      </div>
    );
  }

  // ══ 一键诊断视图（独立 one-click-diagnosis 能力） ══
  if (view === 'diag' && diagFor) {
    // market-news-events: feature flag 默认关闭；开启时异步取真实新闻，失败回退为 []。
    if (FEATURE_MARKET_NEWS_EVENTS && diagNews === null) {
      void fetchNewsList('news', diagFor).then((r) => {
        setDiagNews((r.data || []).slice(0, 5));
      }).catch(() => setDiagNews([]));
    }
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <OneClickDiagnosis
          code={diagFor}
          stockName={stocks.find((s) => s.code === diagFor)?.name}
          quote={quotes[diagFor] || null}
          bars={null}
          news={FEATURE_MARKET_NEWS_EVENTS ? diagNews : null}
          alerts={alerts.filter((a) => a.code === diagFor)}
          recordAnalysis={recordAnalysis}
          onBack={() => {
            setView('watch');
            setDiagFor(null);
            setDiagNews(null);
          }}
        />
      </div>
    );
  }

  // ══ 设置备份视图（独立 settings-backup 能力） ══
  if (view === 'backup') {
    return (
      <div className="app" ref={appRef}>
        {toast && <div className="toast">{toast}</div>}
        <SettingsBackupView
          onBack={() => setView('watch')}
          onExport={(includeSecrets) => exportSettings(includeSecrets)}
          onImport={(replaceHistory) => importSettings(replaceHistory)}
        />
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
            onClick={openHistoryView}
            title="提醒历史"
          >
            📜
          </button>
          <button
            className="nav-btn"
            onClick={openAIHistoryView}
            title="AI 分析历史"
          >
            🧠
          </button>
          <button
            className="nav-btn"
            onClick={() => setView('backup')}
            title="设置备份"
          >
            💾
          </button>
          <button
            className="nav-btn"
            onClick={() => setView('addpos')}
            title="加仓测算"
          >
            🧮
          </button>
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
            latestNewsAt={FEATURE_MARKET_NEWS_EVENTS ? latestNewsAt[s.code] : null}
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
          onSave={(type, value, cooldownMs) =>
            saveAlert(alertEditorFor, type, value, cooldownMs)
          }
          onRemove={() => removeAlert(alertEditorFor)}
          onReset={() => resetAlert(alertEditorFor)}
          onToggleEnabled={() => toggleAlertEnabled(alertEditorFor)}
          onSetCooldown={(ms) => setAlertCooldown(alertEditorFor, ms)}
        />
      )}
    </div>
  );
}
