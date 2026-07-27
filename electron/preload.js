const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  setAlwaysOnTop: (flag) => ipcRenderer.send('window-toggle-top', flag),
  // 价格提醒：调用系统原生通知
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  // 老板键：主进程 F9 触发，渲染进程切换隐身
  onToggleDisguise: (cb) => ipcRenderer.on('toggle-disguise', () => cb()),
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
  },
});
