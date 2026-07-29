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
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'CNY',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      shares REAL NOT NULL,
      cost_price REAL NOT NULL,
      opened_at INTEGER NOT NULL,
      notes TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_account_code ON positions(account_id, code);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_positions_code ON positions(code);`);
  migrateAlerts();
}

function migrateAlerts() {
  // 兼容老库：如果 alerts 表没有扩展列则补上。
  const cols = db.exec("PRAGMA table_info(alerts)");
  const existing = cols.length ? new Set(cols[0].values.map((r) => String(r[1]))) : new Set();
  const additions = [
    ['cooldown_ms', 'INTEGER NOT NULL DEFAULT 600000'],
    ['prev_value', 'REAL'],
    ['last_triggered_at', 'INTEGER'],
    ['last_notified_value', 'REAL'],
  ];
  for (const [name, decl] of additions) {
    if (!existing.has(name)) {
      db.run(`ALTER TABLE alerts ADD COLUMN ${name} ${decl};`);
    }
  }
  // 新增触发历史表，独立的 alert-history 能力。
  db.run(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      threshold REAL NOT NULL,
      observed REAL NOT NULL,
      direction TEXT NOT NULL,
      cooldown_ms INTEGER NOT NULL,
      triggered_at INTEGER NOT NULL,
      notification_status TEXT NOT NULL DEFAULT 'sent'
    );
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_alert_events_time ON alert_events(triggered_at DESC);');
  // 新增 AI 分析历史表，独立的 ai-analysis-history 能力。
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      prompt_id TEXT NOT NULL,
      input_summary TEXT NOT NULL,
      response_json TEXT NOT NULL,
      rating INTEGER
    );
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_ai_analyses_time ON ai_analyses(created_at DESC);');
  db.run('CREATE INDEX IF NOT EXISTS idx_ai_analyses_code ON ai_analyses(code, created_at DESC);');
  db.run('CREATE INDEX IF NOT EXISTS idx_ai_analyses_kind ON ai_analyses(kind, created_at DESC);');
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
    const rows = db.exec(
      'SELECT id, code, type, value, enabled, triggered, cooldown_ms, prev_value, last_triggered_at, last_notified_value FROM alerts'
    );
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({
      id: Number(r[0]),
      code: String(r[1]),
      type: String(r[2]),
      value: Number(r[3]),
      enabled: Number(r[4]) === 1,
      triggered: Number(r[5]) === 1,
      cooldownMs: Number(r[6]) || 600000,
      prevValue: r[7] == null ? null : Number(r[7]),
      lastTriggeredAt: r[8] == null ? null : Number(r[8]),
      lastNotifiedValue: r[9] == null ? null : Number(r[9]),
    }));
  });

  ipcMain.handle('db-save-alert', (_, a) => {
    const cooldown = Number.isFinite(a.cooldownMs) ? Math.max(0, Math.floor(a.cooldownMs)) : 600000;
    if (a.id != null) {
      db.run(
        'UPDATE alerts SET type=?, value=?, enabled=1, triggered=0, cooldown_ms=?, prev_value=NULL, last_triggered_at=NULL, last_notified_value=NULL WHERE id=?',
        [a.type, a.value, cooldown, a.id]
      );
      persist();
      return a.id;
    }
    db.run(
      'INSERT INTO alerts (code, type, value, enabled, triggered, cooldown_ms) VALUES (?, ?, ?, 1, 0, ?)',
      [a.code, a.type, a.value, cooldown]
    );
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

  // 启用/停用持久化（不影响已存 cooldown 等元数据）。
  ipcMain.handle('db-set-alert-enabled', (_, { id, enabled }) => {
    db.run('UPDATE alerts SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
    persist();
  });

  // 调整冷却时间。
  ipcMain.handle('db-set-alert-cooldown', (_, { id, cooldownMs }) => {
    const ms = Number.isFinite(cooldownMs) ? Math.max(0, Math.floor(cooldownMs)) : 600000;
    db.run('UPDATE alerts SET cooldown_ms = ? WHERE id = ?', [ms, id]);
    persist();
  });

  // 重新武装：清空 triggered、prev_value、最后触发时间。
  ipcMain.handle('db-rearm-alert', (_, id) => {
    db.run(
      'UPDATE alerts SET triggered = 0, prev_value = NULL, last_triggered_at = NULL, last_notified_value = NULL WHERE id = ?',
      [id]
    );
    persist();
  });

  // 记录评估器观察到的最新值（阈值穿越判断依赖此值）。
  ipcMain.handle('db-set-alert-prev-value', (_, { id, value }) => {
    if (value == null || !Number.isFinite(value)) {
      db.run('UPDATE alerts SET prev_value = NULL WHERE id = ?', [id]);
    } else {
      db.run('UPDATE alerts SET prev_value = ? WHERE id = ?', [value, id]);
    }
    persist();
  });

  // 写一条触发历史。
  ipcMain.handle('db-insert-alert-event', (_, evt) => {
    const triggeredAt = Number.isFinite(evt.triggeredAt) ? Math.floor(evt.triggeredAt) : Date.now();
    const cooldown = Number.isFinite(evt.cooldownMs) ? Math.max(0, Math.floor(evt.cooldownMs)) : 600000;
    const threshold = Number(evt.threshold) || 0;
    const observed = Number(evt.observed) || 0;
    const direction = String(evt.direction || 'unknown');
    const status = String(evt.notificationStatus || 'sent');
    db.run(
      `INSERT INTO alert_events
        (alert_id, code, type, threshold, observed, direction, cooldown_ms, triggered_at, notification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [evt.alertId ?? null, evt.code, evt.type, threshold, observed, direction, cooldown, triggeredAt, status]
    );
    db.run(
      'UPDATE alerts SET triggered = 1, last_triggered_at = ?, last_notified_value = ? WHERE id = ?',
      [triggeredAt, observed, evt.alertId]
    );
    // 保留策略：最多 500 条；超出按时间删旧。
    db.run(
      `DELETE FROM alert_events
       WHERE id NOT IN (
         SELECT id FROM alert_events ORDER BY triggered_at DESC, id DESC LIMIT 500
       )`
    );
    persist();
  });

  // 拉取触发历史。
  ipcMain.handle('db-list-alert-events', (_, { limit } = {}) => {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200;
    const rows = db.exec(
      'SELECT id, alert_id, code, type, threshold, observed, direction, cooldown_ms, triggered_at, notification_status FROM alert_events ORDER BY triggered_at DESC, id DESC LIMIT ' + n
    );
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({
      id: Number(r[0]),
      alertId: r[1] == null ? null : Number(r[1]),
      code: String(r[2]),
      type: String(r[3]),
      threshold: Number(r[4]),
      observed: Number(r[5]),
      direction: String(r[6]),
      cooldownMs: Number(r[7]),
      triggeredAt: Number(r[8]),
      notificationStatus: String(r[9]),
    }));
  });

  ipcMain.handle('db-clear-alert-events', () => {
    db.run('DELETE FROM alert_events');
    persist();
  });

  // ── 账户与持仓（portfolio-positions） ──
  function readAccounts() {
    const rows = db.exec('SELECT id, name, base_currency, created_at FROM accounts ORDER BY id ASC');
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({
      id: Number(r[0]),
      name: String(r[1]),
      baseCurrency: String(r[2]),
      createdAt: Number(r[3]),
    }));
  }
  function readPositions(accountId) {
    const where = accountId ? `WHERE account_id = ${Number(accountId)}` : '';
    const rows = db.exec(`SELECT id, account_id, code, shares, cost_price, opened_at, notes FROM positions ${where} ORDER BY id ASC`);
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({
      id: Number(r[0]),
      accountId: Number(r[1]),
      code: String(r[2]),
      shares: Number(r[3]),
      costPrice: Number(r[4]),
      openedAt: Number(r[5]),
      notes: r[6] == null ? null : String(r[6]),
    }));
  }
  ipcMain.handle('account:list', () => readAccounts());
  ipcMain.handle('account:add', (_, { name, baseCurrency }) => {
    if (!name || typeof name !== 'string') throw new Error('invalid account name');
    db.run('INSERT INTO accounts (name, base_currency, created_at) VALUES (?, ?, ?)', [
      String(name).trim(), String(baseCurrency || 'CNY'), Date.now(),
    ]);
    const id = Number(db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0]);
    persist();
    return { id };
  });
  ipcMain.handle('account:remove', (_, id) => {
    if (!id) throw new Error('missing id');
    db.run('DELETE FROM accounts WHERE id = ?', [Number(id)]);
    persist();
  });
  ipcMain.handle('position:list', (_, { accountId } = {}) => readPositions(accountId));
  ipcMain.handle('position:add', (_, { accountId, code, shares, costPrice, openedAt, notes }) => {
    if (!accountId || !code) throw new Error('accountId 与 code 必填');
    const existed = db.exec(`SELECT id FROM positions WHERE account_id = ${Number(accountId)} AND code = '${String(code).replace(/'/g, "''")}'`);
    if (existed.length && existed[0].values.length) {
      db.run('UPDATE positions SET shares = ?, cost_price = ?, opened_at = ?, notes = ? WHERE id = ?', [
        Number(shares), Number(costPrice), Number(openedAt || Date.now()), notes || null, Number(existed[0].values[0][0]),
      ]);
      persist();
      return { id: Number(existed[0].values[0][0]) };
    }
    db.run('INSERT INTO positions (account_id, code, shares, cost_price, opened_at, notes) VALUES (?, ?, ?, ?, ?, ?)', [
      Number(accountId), String(code), Number(shares), Number(costPrice), Number(openedAt || Date.now()), notes || null,
    ]);
    const id = Number(db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0]);
    persist();
    return { id };
  });
  ipcMain.handle('position:remove', (_, id) => {
    if (!id) throw new Error('missing id');
    db.run('DELETE FROM positions WHERE id = ?', [Number(id)]);
    persist();
  });

  // ── AI 分析历史（独立 ai-analysis-history 能力） ──
  ipcMain.handle('db-insert-ai-analysis', (_, a) => {
    if (!a || typeof a !== 'object') throw new Error('invalid analysis');
    const kind = String(a.kind || 'unknown');
    const code = String(a.code || '');
    const model = String(a.model || 'unknown');
    const createdAt = Number.isFinite(a.createdAt) ? Math.floor(a.createdAt) : Date.now();
    const promptId = String(a.promptId || 'default');
    const inputSummary = String(a.inputSummary || '');
    const responseJson = typeof a.responseJson === 'string' ? a.responseJson : JSON.stringify(a.responseJson || {});
    const rating = Number.isFinite(a.rating) ? Math.floor(a.rating) : null;
    if (!code) throw new Error('missing code');
    db.run(
      `INSERT INTO ai_analyses
        (kind, code, model, created_at, prompt_id, input_summary, response_json, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [kind, code, model, createdAt, promptId, inputSummary, responseJson, rating]
    );
    const res = db.exec('SELECT last_insert_rowid()');
    const id = res.length ? Number(res[0].values[0][0]) : null;
    // 保留策略：最多 500 条；超出按时间删旧。
    db.run(
      `DELETE FROM ai_analyses
       WHERE id NOT IN (
         SELECT id FROM ai_analyses ORDER BY created_at DESC, id DESC LIMIT 500
       )`
    );
    persist();
    return id;
  });

  ipcMain.handle('db-list-ai-analyses', (_, { limit, kind, code } = {}) => {
    let n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200;
    const where = [];
    const params = [];
    if (kind) {
      where.push('kind = ?');
      params.push(String(kind));
    }
    if (code) {
      where.push('code = ?');
      params.push(String(code));
    }
    const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const rows = db.exec(
      'SELECT id, kind, code, model, created_at, prompt_id, input_summary FROM ai_analyses' +
        whereSql +
        ' ORDER BY created_at DESC, id DESC LIMIT ' + n,
      params
    );
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({
      id: Number(r[0]),
      kind: String(r[1]),
      code: String(r[2]),
      model: String(r[3]),
      createdAt: Number(r[4]),
      promptId: String(r[5]),
      inputSummary: String(r[6]),
    }));
  });

  ipcMain.handle('db-get-ai-analysis', (_, id) => {
    const nid = Number(id);
    if (!Number.isFinite(nid)) return null;
    const rows = db.exec(
      'SELECT id, kind, code, model, created_at, prompt_id, input_summary, response_json, rating FROM ai_analyses WHERE id = ?',
      [nid]
    );
    if (!rows.length) return null;
    const r = rows[0].values[0];
    return {
      id: Number(r[0]),
      kind: String(r[1]),
      code: String(r[2]),
      model: String(r[3]),
      createdAt: Number(r[4]),
      promptId: String(r[5]),
      inputSummary: String(r[6]),
      responseJson: String(r[7]),
      rating: r[8] == null ? null : Number(r[8]),
    };
  });

  ipcMain.handle('db-delete-ai-analysis', (_, id) => {
    const nid = Number(id);
    if (!Number.isFinite(nid)) return;
    db.run('DELETE FROM ai_analyses WHERE id = ?', [nid]);
    persist();
  });

  ipcMain.handle('db-clear-ai-analyses', () => {
    db.run('DELETE FROM ai_analyses');
    persist();
  });

  // ── 设置导入导出（独立 settings-backup 能力） ──
  const { dialog } = require('electron');
  ipcMain.handle('db-export-bundle', async (_, { includeSecrets, targetPath } = {}) => {
    const rows = (sql, params = []) => {
      const r = db.exec(sql, params);
      return r.length ? r[0].values : [];
    };
    const mapVal = (r, i) => (r[i] == null ? null : r[i]);
    const watchlist = rows('SELECT code, name, sort_order FROM watchlist ORDER BY sort_order ASC, id ASC').map(
      (r) => ({ code: String(r[0]), name: String(r[1]), sortOrder: Number(r[2]) || 0 })
    );
    const alerts = rows(
      'SELECT id, code, type, value, enabled, triggered, cooldown_ms, prev_value, last_triggered_at FROM alerts'
    ).map((r) => ({
      id: Number(r[0]),
      code: String(r[1]),
      type: String(r[2]),
      value: Number(r[3]),
      enabled: Number(r[4]) === 1,
      triggered: Number(r[5]) === 1,
      cooldownMs: Number(r[6]) || 600000,
      prevValue: mapVal(r[7]) != null ? Number(r[7]) : null,
      lastTriggeredAt: mapVal(r[8]) != null ? Number(r[8]) : null,
    }));
    const alertEvents = rows(
      'SELECT id, alert_id, code, type, threshold, observed, direction, cooldown_ms, triggered_at, notification_status FROM alert_events'
    ).map((r) => ({
      id: Number(r[0]),
      alertId: mapVal(r[1]) != null ? Number(r[1]) : null,
      code: String(r[2]),
      type: String(r[3]),
      threshold: Number(r[4]),
      observed: Number(r[5]),
      direction: String(r[6]),
      cooldownMs: Number(r[7]),
      triggeredAt: Number(r[8]),
      notificationStatus: String(r[9]),
    }));
    const aiAnalyses = rows(
      'SELECT id, kind, code, model, created_at, prompt_id, input_summary, response_json, rating FROM ai_analyses ORDER BY created_at DESC, id DESC LIMIT 500'
    ).map((r) => ({
      id: Number(r[0]),
      kind: String(r[1]),
      code: String(r[2]),
      model: String(r[3]),
      createdAt: Number(r[4]),
      promptId: String(r[5]),
      inputSummary: String(r[6]),
      responseJson: String(r[7]),
      rating: mapVal(r[8]) != null ? Number(r[8]) : null,
    }));
    // 读 LLM 设置文件（不带 secret 字段）
    let llmConfig = { baseUrl: null, model: null, proxyUrl: null };
    try {
      const p = path.join(app.getPath('userData'), 'llm-config.json');
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (typeof cfg.baseUrl === 'string') llmConfig.baseUrl = cfg.baseUrl;
        if (typeof cfg.model === 'string') llmConfig.model = cfg.model;
        if (typeof cfg.proxyUrl === 'string') llmConfig.proxyUrl = cfg.proxyUrl;
      }
    } catch (e) {
      console.warn('[fish-pan] 读取 llm-config 失败', e);
    }

    let bundle = {
      kind: 'fish-pan:settings-bundle',
      version: 1,
      exportedAt: Date.now(),
      watchlist,
      alerts,
      alertEvents,
      aiAnalyses,
      llmConfig,
    };
    if (!includeSecrets && bundle.llmConfig.proxyUrl) {
      bundle.llmConfig.proxyUrl = '<redacted>';
    }

    // 写入文件
    let outPath = targetPath;
    if (!outPath) {
      const ret = await dialog.showSaveDialog(mainWindow, {
        title: '导出设置',
        defaultPath: `fish-pan-settings-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (ret.canceled || !ret.filePath) return { canceled: true };
      outPath = ret.filePath;
    }
    try {
      const tmp = outPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2), 'utf-8');
      fs.renameSync(tmp, outPath);
    } catch (e) {
      return { error: `写入失败: ${e.message}` };
    }
    return { ok: true, path: outPath, counts: {
      watchlist: watchlist.length,
      alerts: alerts.length,
      alertEvents: alertEvents.length,
      aiAnalyses: aiAnalyses.length,
    } };
  });

  ipcMain.handle('db-import-bundle', async (_, { sourcePath, targetPath, replaceHistory } = {}) => {
    let inPath = sourcePath;
    if (!inPath) {
      const ret = await dialog.showOpenDialog(mainWindow, {
        title: '导入设置',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (ret.canceled || !ret.filePaths[0]) return { canceled: true };
      inPath = ret.filePaths[0];
    }
    let raw;
    try {
      raw = fs.readFileSync(inPath, 'utf-8');
    } catch (e) {
      return { error: `读取失败: ${e.message}` };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { error: `JSON 解析失败: ${e.message}` };
    }
    if (!parsed || parsed.kind !== 'fish-pan:settings-bundle') {
      return { error: '文件不是合法的 fish-pan 设置包' };
    }
    if (!Number.isFinite(parsed.version) || parsed.version > 1) {
      return { error: `版本 ${parsed.version} 不受支持` };
    }
    // 原子写入：写临时库文件 → 校验 → 替换
    try {
      const origFile = dbPath();
      const tmpFile = origFile + '.import-tmp';
      const imported = new SQL.Database();
      imported.run(`
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
          triggered INTEGER NOT NULL DEFAULT 0,
          cooldown_ms INTEGER NOT NULL DEFAULT 600000,
          prev_value REAL,
          last_triggered_at INTEGER,
          last_notified_value REAL
        );
        CREATE TABLE IF NOT EXISTS alert_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id INTEGER, code TEXT NOT NULL, type TEXT NOT NULL,
          threshold REAL NOT NULL, observed REAL NOT NULL, direction TEXT NOT NULL,
          cooldown_ms INTEGER NOT NULL, triggered_at INTEGER NOT NULL,
          notification_status TEXT NOT NULL DEFAULT 'sent'
        );
        CREATE TABLE IF NOT EXISTS ai_analyses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL, code TEXT NOT NULL, model TEXT NOT NULL,
          created_at INTEGER NOT NULL, prompt_id TEXT NOT NULL,
          input_summary TEXT NOT NULL, response_json TEXT NOT NULL,
          rating INTEGER
        );
      `);
      // 自选
      const insW = imported.prepare(
        'INSERT INTO watchlist (code, name, sort_order) VALUES (?, ?, ?)'
      );
      for (const w of parsed.watchlist || []) {
        insW.run([w.code, w.name, w.sortOrder || 0]);
      }
      insW.free();
      // alerts
      const insA = imported.prepare(
        'INSERT INTO alerts (code, type, value, enabled, triggered, cooldown_ms, prev_value, last_triggered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const a of parsed.alerts || []) {
        insA.run([
          a.code, a.type, a.value,
          a.enabled ? 1 : 0, a.triggered ? 1 : 0,
          a.cooldownMs || 600000,
          a.prevValue == null ? null : a.prevValue,
          a.lastTriggeredAt == null ? null : a.lastTriggeredAt,
        ]);
      }
      insA.free();
      // alert_events
      if (replaceHistory) {
        const insE = imported.prepare(
          'INSERT INTO alert_events (alert_id, code, type, threshold, observed, direction, cooldown_ms, triggered_at, notification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const e of parsed.alertEvents || []) {
          insE.run([e.alertId, e.code, e.type, e.threshold, e.observed, e.direction, e.cooldownMs, e.triggeredAt, e.notificationStatus]);
        }
        insE.free();
      }
      // ai_analyses
      const insAi = imported.prepare(
        'INSERT INTO ai_analyses (kind, code, model, created_at, prompt_id, input_summary, response_json, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const a of parsed.aiAnalyses || []) {
        insAi.run([a.kind, a.code, a.model, a.createdAt, a.promptId, a.inputSummary, a.responseJson, a.rating == null ? null : a.rating]);
      }
      insAi.free();
      const buf = Buffer.from(imported.export());
      fs.writeFileSync(tmpFile, buf);
      imported.close();
      // 替换
      fs.renameSync(tmpFile, origFile);
      // 重新打开主 db
      db.close();
      const fresh = fs.readFileSync(origFile);
      db = new SQL.Database(fresh);
      // 写 LLM config（不带 secret 字段）
      try {
        if (parsed.llmConfig && typeof parsed.llmConfig === 'object') {
          const p = path.join(app.getPath('userData'), 'llm-config.json');
          const safe = {
            baseUrl: parsed.llmConfig.baseUrl || null,
            model: parsed.llmConfig.model || null,
            // 永远不通过 import 恢复 proxyUrl；让用户重新输入
            proxyUrl: null,
          };
          fs.writeFileSync(p, JSON.stringify(safe, null, 2), 'utf-8');
        }
      } catch (e) {
        console.warn('[fish-pan] 写入 llm-config 失败', e);
      }
    } catch (e) {
      return { error: `导入失败: ${e.message}` };
    }
    return { ok: true, counts: {
      watchlist: (parsed.watchlist || []).length,
      alerts: (parsed.alerts || []).length,
      alertEvents: replaceHistory ? (parsed.alertEvents || []).length : 0,
      aiAnalyses: (parsed.aiAnalyses || []).length,
    }};
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
  const title = String(payload?.title || '摸鱼盯盘');
  const body = String(payload?.body || '');
  const alertId = payload && payload.alertId != null ? Number(payload.alertId) : null;
  const code = payload && payload.code ? String(payload.code) : null;
  const n = new Notification({
    title,
    body,
    silent: false,
  });
  // 点击通知：聚焦窗口并把 alert/code 上下文发回渲染进程。
  n.on('click', () => {
    try {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('alert-activation', { alertId, code });
      }
    } catch (e) {
      console.error('[fish-pan] 处理通知点击失败', e);
    }
  });
  try {
    n.show();
  } catch (e) {
    console.error('[fish-pan] 显示原生通知失败', e);
  }
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
    // 把底层 TypeError 翻译成可读信息；渲染层会继续回退腾讯
    const msg = String((e && (e.message || e)) || e);
    let hint = '网络请求失败';
    if (msg.includes('fetch failed')) hint = '东方财富接口不可达（将自动回退腾讯）';
    else if (msg.includes('ENOTFOUND')) hint = 'DNS 解析失败（将自动回退腾讯）';
    else if (msg.includes('ECONNREFUSED')) hint = '连接被拒（将自动回退腾讯）';
    else if (msg.includes('ETIMEDOUT')) hint = '网络超时（将自动回退腾讯）';
    return { bars: [], preClose: 0, name: code, error: hint };
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

// ── market-data-engine + market-news-events 共享 IPC ──
// 默认关闭 feature flags。即使 IPC handler 已注册，渲染端
// 不开 flag 时不会调用，行为等同原 IPC handler 直接返回的现状。
function setupMarketIpc() {
  let marketModule = null;
  try {
    marketModule = require('./market');
  } catch (e) {
    console.warn('[fish-pan] market 模块加载失败，将继续使用 legacy 实现:', e && e.message);
    return;
  }

  // ── market-data-engine（feature flag: marketDataEngine） ──
  ipcMain.handle('fetch-quotes', async (_, { codes }) => {
    if (!marketModule.getMarketData) {
      // 兼容：旧 handler 直接走 fetch-quotes 仍生效（这里是为了兜底）。
      return null;
    }
    try {
      const result = await marketModule.getMarketData().fetch({
        kind: 'quote',
        code: (codes && codes[0]) || '',
        codes: codes || [],
      });
      // 兼容旧 IPC：返回 raw 字符串或结构化对象；当前 mock 返回数组。
      if (result.data) return result.data;
      return [];
    } catch (e) {
      console.warn('[fish-pan] market fetch-quotes 失败:', e && e.message);
      return [];
    }
  });

  ipcMain.handle('fetch-kline', async (_, payload) => {
    try {
      const result = await marketModule.getMarketData().fetch({
        kind: 'kline',
        code: payload?.code || '',
        klt: payload?.klt || 'day',
        len: payload?.len || 30,
      });
      return result.data || { bars: [], preClose: 0, name: payload?.code || '', error: result.error?.message || 'market-engine error' };
    } catch (e) {
      return { bars: [], preClose: 0, name: payload?.code || '', error: String(e && e.message) };
    }
  });

  ipcMain.handle('fetch-market', async () => {
    try {
      const result = await marketModule.getMarketData().fetch({ kind: 'market', code: 'all' });
      return result.data || { rows: [], error: result.error?.message || 'market-engine error' };
    } catch (e) {
      return { rows: [], error: String(e && e.message) };
    }
  });

  ipcMain.handle('fetch-funds', async (_, { category, limit }) => {
    try {
      const result = await marketModule.getMarketData().fetch({
        kind: 'funds',
        code: category || 'industry',
        category: category || 'industry',
        limit: limit || 50,
      });
      return result.data || { rows: [], error: result.error?.message || 'market-engine error' };
    } catch (e) {
      return { rows: [], error: String(e && e.message) };
    }
  });

  ipcMain.handle('data-source:status', async () => {
    try {
      return marketModule.getMarketData().status();
    } catch (e) {
      return { vendors: [], error: { kind: 'no-main', message: e && e.message } };
    }
  });

  ipcMain.handle('data-source:test', async () => {
    // 占位：返回所有 vendor 的最近一次健康度快照。
    try {
      return marketModule.getMarketData().status();
    } catch (e) {
      return { vendors: [], error: { kind: 'no-main', message: e && e.message } };
    }
  });

  // ── market-news-events ──
  ipcMain.handle('news:list', async (_, { kind, code }) => {
    if (!kind || !code) {
      return { data: null, error: { kind: 'invalid-input', message: 'kind 与 code 必填' } };
    }
    try {
      return await marketModule.getMarketData().fetchNews({ kind, code });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { data: null, error: { kind: 'all-failed', message } };
    }
  });

  ipcMain.handle('news:flash', async () => {
    try {
      return await marketModule.getMarketData().fetchFlash();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { data: null, error: { kind: 'all-failed', message } };
    }
  });

  ipcMain.handle('news:status', async () => {
    try {
      return marketModule.getMarketData().status();
    } catch (e) {
      return { vendors: [], error: { kind: 'no-main', message: e && e.message } };
    }
  });
}

app.whenReady().then(async () => {
  // 初始化 SQLite
  try {
    const sqlMain = require.resolve('sql.js');
    const sqlWasm = path.join(path.dirname(sqlMain), 'sql-wasm.wasm');
    SQL = await initSqlJs({ locateFile: (file) => (file === 'sql-wasm.wasm' ? sqlWasm : file) });
    openDb();
    setupDbIpc();
    setupMarketIpc();
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
