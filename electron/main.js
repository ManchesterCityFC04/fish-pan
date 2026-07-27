const { app, BrowserWindow, ipcMain, globalShortcut, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

let mainWindow = null;
let SQL = null;
let db = null;

// ── SQLite（sql.js，纯 WASM，文件落在应用数据目录）──
function dbPath() {
  return path.join(app.getPath('userData'), 'fishpan.db');
}

function openDb() {
  const file = dbPath();
  const buf = fs.existsSync(file) ? fs.readFileSync(file) : undefined;
  db = new SQL.Database(buf);
  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      triggered INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// 每次写操作后把内存库落盘，保证永久保存
function persist() {
  if (!db) return;
  try {
    fs.writeFileSync(dbPath(), Buffer.from(db.export()));
  } catch (e) {
    console.error('[fish-pan] 保存数据库失败', e);
  }
}

function setupDbIpc() {
  ipcMain.handle('db-get-stocks', () => {
    const rows = db.exec('SELECT code, name FROM watchlist ORDER BY sort_order, id');
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({ code: String(r[0]), name: String(r[1]) }));
  });

  ipcMain.handle('db-add-stock', (_, { code, name }) => {
    db.run(
      'INSERT OR IGNORE INTO watchlist (code, name, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM watchlist))',
      [code, name]
    );
    persist();
  });

  ipcMain.handle('db-remove-stock', (_, code) => {
    db.run('DELETE FROM watchlist WHERE code = ?', [code]);
    db.run('DELETE FROM alerts WHERE code = ?', [code]);
    persist();
  });

  ipcMain.handle('db-get-alerts', () => {
    const rows = db.exec('SELECT id, code, type, value, enabled, triggered FROM alerts');
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({
      id: Number(r[0]),
      code: String(r[1]),
      type: String(r[2]),
      value: Number(r[3]),
      enabled: Number(r[4]) === 1,
      triggered: Number(r[5]) === 1,
    }));
  });

  ipcMain.handle('db-save-alert', (_, a) => {
    if (a.id != null) {
      db.run('UPDATE alerts SET type=?, value=?, enabled=1, triggered=0 WHERE id=?', [
        a.type,
        a.value,
        a.id,
      ]);
      persist();
      return a.id;
    }
    db.run('INSERT INTO alerts (code, type, value, enabled, triggered) VALUES (?, ?, ?, 1, 0)', [
      a.code,
      a.type,
      a.value,
    ]);
    const res = db.exec('SELECT last_insert_rowid()');
    persist();
    return res.length ? Number(res[0].values[0][0]) : null;
  });

  ipcMain.handle('db-delete-alert', (_, id) => {
    db.run('DELETE FROM alerts WHERE id = ?', [id]);
    persist();
  });

  ipcMain.handle('db-set-alert-triggered', (_, { id, triggered }) => {
    db.run('UPDATE alerts SET triggered = ? WHERE id = ?', [triggered ? 1 : 0, id]);
    persist();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 130,
    minWidth: 300,
    minHeight: 40,
    useContentSize: true,
    title: '摸鱼盯盘',
    frame: false, // 无边框
    alwaysOnTop: true, // 始终置顶
    transparent: false,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式加载 Vite dev server，生产模式加载打包文件
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 关闭窗口时清理引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC: 窗口控制 ──
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

ipcMain.on('window-toggle-top', (_, flag) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(flag);
});

// ── 原生通知（价格提醒）──
ipcMain.on('notify', (_, payload) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: payload.title || '摸鱼盯盘',
    body: payload.body || '',
    silent: false,
  });
  n.show();
});

// ── 东方财富：代码转 secid ──
function emSecid(code) {
  const m = String(code || '').toLowerCase().match(/^(sh|sz|hk|bj)(\d+)$/);
  if (!m) return null;
  const prefix = m[1];
  const num = m[2];
  if (prefix === 'sh') return '1.' + num;       // 上证
  if (prefix === 'sz') return '0.' + num;       // 深证
  if (prefix === 'bj') return '0.' + num;       // 北交所
  if (prefix === 'hk') return '116.' + num;     // 港股
  return null;
}
const EM_HEADERS = {
  Referer: 'https://quote.eastmoney.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};

// ── K线数据（东方财富，精准源；支持分时/分钟K/日周月）──
ipcMain.handle('fetch-kline', async (_, { code, kind, klt, len }) => {
  const secid = emSecid(code);
  if (!secid) return { bars: [], preClose: 0, name: code, error: '不支持的代码' };
  try {
    let name = code;
    let preClose = 0;
    let bars = [];
    if (kind === 'trend') {
      // 分时
      const url =
        `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}` +
        `&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58` +
        `&iscr=0&ndays=1&_=${Date.now()}`;
      const json = await (await fetch(url, { headers: EM_HEADERS })).json();
      const d = json?.data;
      if (!d) return { bars: [], preClose: 0, name: code, error: '未获取到分时数据' };
      name = d.name || code;
      preClose = Number(d.preClose) || 0;
      bars = (d.trends || []).map((line) => {
        const f = String(line).split(',');
        const price = Number(f[1]) || 0;
        return {
          date: f[0],
          open: price, close: price, high: price, low: price,
          volume: Number(f[4]) || 0,
          amount: Number(f[5]) || 0,
          average: Number(f[2]) || 0,
        };
      });
    } else {
      // K线（日/周/月/分钟）
      const url =
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
        `&klt=${klt}&fqt=1&lmt=${len}&end=20500101` +
        `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
        `&_=${Date.now()}`;
      const json = await (await fetch(url, { headers: EM_HEADERS })).json();
      const d = json?.data;
      if (!d) return { bars: [], preClose: 0, name: code, error: '未获取到K线数据' };
      name = d.name || code;
      preClose = Number(d.preKPrice) || 0;
      bars = (d.klines || []).map((line) => {
        const f = String(line).split(',');
        return {
          date: f[0],
          open: Number(f[1]) || 0,
          close: Number(f[2]) || 0,
          high: Number(f[3]) || 0,
          low: Number(f[4]) || 0,
          volume: Number(f[5]) || 0,
          amount: Number(f[6]) || 0,
        };
      });
    }
    if (!bars.length) return { bars: [], preClose, name, error: '暂无数据' };
    return { bars, preClose, name };
  } catch (e) {
    return { bars: [], preClose: 0, name: code, error: String(e) };
  }
});

// ── 大盘指数（上证/深证/创业板/沪深300/科创50）──
const MARKET_INDEXES = [
  ['1', '000001', '上证指数'],
  ['0', '399001', '深证成指'],
  ['0', '399006', '创业板指'],
  ['1', '000300', '沪深300'],
  ['1', '000688', '科创50'],
];
ipcMain.handle('fetch-market', async () => {
  const secids = MARKET_INDEXES.map(([m, c]) => `${m}.${c}`).join(',');
  const url =
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${secids}` +
    `&fields=f2,f3,f4,f6,f12,f13,f14&_=${Date.now()}`;
  try {
    const json = await (await fetch(url, { headers: EM_HEADERS })).json();
    const diff = json?.data?.diff || [];
    const map = {};
    for (const it of diff) {
      const prefix = Number(it.f13) === 1 ? 'sh' : 'sz';
      map[prefix + String(it.f12).padStart(6, '0')] = it;
    }
    const rows = MARKET_INDEXES.map(([m, c, name]) => {
      const key = (m === '1' ? 'sh' : 'sz') + c;
      const it = map[key] || {};
      return {
        code: key,
        name,
        price: Number(it.f2) || 0,
        changePct: Number(it.f3) || 0,
        change: Number(it.f4) || 0,
        amount: Number(it.f6) || 0,
      };
    });
    return { rows };
  } catch (e) {
    return { rows: [], error: String(e) };
  }
});

// ── 资金流（行业/概念/个股 主力净流入排行）──
const FUNDS_FILTERS = {
  industry: 'm:90+t:2',
  concept: 'm:90+t:3',
  stock: 'm:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048',
};
ipcMain.handle('fetch-funds', async (_, { category, limit }) => {
  const fs = FUNDS_FILTERS[category];
  if (!fs) return { rows: [], error: '未知分类' };
  const url =
    `https://emdatah5.eastmoney.com/dc/ZJLX/getZDYLBData?fields=f2,f3,f12,f13,f14,` +
    `f62,f184,f66,f72,f78,f84,f128,f140,f141&pn=1&pz=${limit || 50}&fid=f62&po=1` +
    `&fs=${encodeURIComponent(fs)}&_=${Date.now()}`;
  try {
    const json = await (await fetch(url, {
      headers: {
        Referer: 'https://emdatah5.eastmoney.com/dc/zjlx/index',
        'User-Agent': EM_HEADERS['User-Agent'],
        Accept: 'application/json',
      },
    })).json();
    const diff = json?.data?.diff || [];
    const rows = diff
      .filter((it) => it.f14 && it.f62 != null && it.f62 !== '-')
      .map((it) => ({
        code: String(it.f12 || ''),
        name: String(it.f14 || ''),
        price: Number(it.f2) || 0,
        changePct: Number(it.f3) || 0,
        mainNet: Number(it.f62) || 0,
        mainRatio: Number(it.f184) || 0,
        superNet: Number(it.f66) || 0,
        largeNet: Number(it.f72) || 0,
        mediumNet: Number(it.f78) || 0,
        smallNet: Number(it.f84) || 0,
        leaderName: it.f128 && it.f128 !== '-' ? String(it.f128) : '',
        leaderCode: it.f140 && it.f140 !== '-' ? String(it.f140) : '',
        market: Number(it.f13) || 0,
      }));
    return { rows };
  } catch (e) {
    return { rows: [], error: String(e) };
  }
});


// ── 行情数据（主进程直连，带 Referer，GBK 解码）──
// 注意：Sina 接口要求 Referer 头，且返回 GBK 编码；
// 渲染进程用 fetch 无法设置 Referer（浏览器禁止头），故改走主进程。
ipcMain.handle('fetch-quotes', async (_, { codes }) => {
  const url = 'http://hq.sinajs.cn/list=' + (codes || []).join(',');
  try {
    const resp = await fetch(url, {
      headers: { Referer: 'https://finance.sina.com.cn' },
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    return new TextDecoder('gbk').decode(buf);
  } catch (e) {
    return 'FETCH_ERROR:' + String(e);
  }
});

// ── 窗体尺寸（看 K 线时放大，返回时缩小）──
ipcMain.on('resize', (_, { w, h }) => {
  if (mainWindow) mainWindow.setContentSize(w, h, true);
});

app.whenReady().then(async () => {
  // 初始化 SQLite
  try {
    const sqlMain = require.resolve('sql.js');
    const sqlWasm = path.join(path.dirname(sqlMain), 'sql-wasm.wasm');
    SQL = await initSqlJs({ locateFile: (file) => (file === 'sql-wasm.wasm' ? sqlWasm : file) });
    openDb();
    setupDbIpc();
    console.log('[fish-pan] SQLite 就绪:', dbPath());
  } catch (e) {
    console.error('[fish-pan] SQLite 初始化失败，自选将不会持久保存:', e);
  }

  createWindow();

  // 老板键：F9 一键隐身 / 恢复
  const ok = globalShortcut.register('F9', () => {
    if (mainWindow) mainWindow.webContents.send('toggle-disguise');
  });
  if (!ok) console.warn('[fish-pan] 老板键 F9 注册失败（可能被占用）');
});

// 退出时注销全局快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
