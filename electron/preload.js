const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  setAlwaysOnTop: (flag) => ipcRenderer.send('window-toggle-top', flag),
  // 价格提醒：调用系统原生通知
  notify: (title, body, ctx) => ipcRenderer.send('notify', { title, body, ...(ctx || {}) }),
  // 老板键：主进程 F9 触发，渲染进程切换隐身
  onToggleDisguise: (cb) => ipcRenderer.on('toggle-disguise', () => cb()),
  // 通知点击：主进程把 alert/code 上下文发回渲染进程
  onAlertActivation: (cb) =>
    ipcRenderer.on('alert-activation', (_, payload) => cb(payload || {})),
  // K线窗口尺寸调整
  resize: (w, h) => ipcRenderer.send('resize', { w, h }),
  // K线数据：主进程直连东方财富（分时/分钟K/日周月）
  fetchKline: (code, kind, klt, len) =>
    ipcRenderer.invoke('fetch-kline', { code, kind, klt, len }),
  // 大盘指数
  fetchMarket: () => ipcRenderer.invoke('fetch-market'),
  // 资金流（category: industry / concept / stock）
  fetchFunds: (category, limit) =>
    ipcRenderer.invoke('fetch-funds', { category, limit }),
  // 行情数据：主进程直连新浪接口（带 Referer + GBK 解码）
  fetchQuotes: (codes) => ipcRenderer.invoke('fetch-quotes', { codes }),
  // 数据源健康度（market-data-engine）
  dataSource: {
    status: () => ipcRenderer.invoke('data-source:status'),
    test: () => ipcRenderer.invoke('data-source:test'),
  },
  // 新闻 / 公告 / 快讯（market-news-events，feature flag 默认关闭）
  news: {
    list: (kind, code) => ipcRenderer.invoke('news:list', { kind, code }),
    flash: () => ipcRenderer.invoke('news:flash'),
    status: () => ipcRenderer.invoke('news:status'),
  },
  // 数据库（SQLite 永久保存自选 + 提醒）
  db: {
    getStocks: () => ipcRenderer.invoke('db-get-stocks'),
    addStock: (code, name) => ipcRenderer.invoke('db-add-stock', { code, name }),
    removeStock: (code) => ipcRenderer.invoke('db-remove-stock', code),
    getAlerts: () => ipcRenderer.invoke('db-get-alerts'),
    saveAlert: (a) => ipcRenderer.invoke('db-save-alert', a),
    deleteAlert: (id) => ipcRenderer.invoke('db-delete-alert', id),
    setAlertTriggered: (id, triggered) =>
      ipcRenderer.invoke('db-set-alert-triggered', { id, triggered }),
    setAlertEnabled: (id, enabled) =>
      ipcRenderer.invoke('db-set-alert-enabled', { id, enabled }),
    setAlertCooldown: (id, cooldownMs) =>
      ipcRenderer.invoke('db-set-alert-cooldown', { id, cooldownMs }),
    rearmAlert: (id) => ipcRenderer.invoke('db-rearm-alert', id),
    setAlertPrevValue: (id, value) =>
      ipcRenderer.invoke('db-set-alert-prev-value', { id, value }),
    insertAlertEvent: (evt) => ipcRenderer.invoke('db-insert-alert-event', evt),
    listAlertEvents: (limit) => ipcRenderer.invoke('db-list-alert-events', { limit }),
    clearAlertEvents: () => ipcRenderer.invoke('db-clear-alert-events'),
    // AI 分析历史（独立 ai-analysis-history 能力）
    insertAIAnalysis: (a) => ipcRenderer.invoke('db-insert-ai-analysis', a),
    listAIAnalyses: (filter) => ipcRenderer.invoke('db-list-ai-analyses', filter || {}),
    getAIAnalysis: (id) => ipcRenderer.invoke('db-get-ai-analysis', id),
    deleteAIAnalysis: (id) => ipcRenderer.invoke('db-delete-ai-analysis', id),
    clearAIAnalyses: () => ipcRenderer.invoke('db-clear-ai-analyses'),
    // 设置导入导出（独立 settings-backup 能力）
    exportBundle: (opts) => ipcRenderer.invoke('db-export-bundle', opts || {}),
    importBundle: (opts) => ipcRenderer.invoke('db-import-bundle', opts || {}),
    // 账户与持仓（portfolio-positions）
    account: {
      list: () => ipcRenderer.invoke('account:list'),
      add: (name, baseCurrency) => ipcRenderer.invoke('account:add', { name, baseCurrency }),
      remove: (id) => ipcRenderer.invoke('account:remove', id),
    },
    position: {
      list: (accountId) => ipcRenderer.invoke('position:list', { accountId }),
      add: (params) => ipcRenderer.invoke('position:add', params),
      remove: (id) => ipcRenderer.invoke('position:remove', id),
    },
  },
});
