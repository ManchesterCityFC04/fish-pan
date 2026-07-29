import { useState } from 'react';

interface Props {
  onBack: () => void;
  onExport: (includeSecrets: boolean) => void;
  onImport: (replaceHistory: boolean) => void;
}

export function SettingsBackupView({ onBack, onExport, onImport }: Props) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [replaceHistory, setReplaceHistory] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <button className="btn-ghost" onClick={onBack}>← 返回</button>
        <h3>设置备份</h3>
      </div>

      <div className="backup-body">
        <div className="diag-section">
          <div className="diag-label">导出设置</div>
          <p className="diag-hint">
            把当前自选、提醒、提醒历史、AI 分析历史、LLM 配置（不含密钥）打包为一个 JSON 文件。
          </p>
          <label className="backup-check">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={(e) => setIncludeSecrets(e.target.checked)}
            />
            包含密钥（proxy URL with credentials）
          </label>
          {includeSecrets && (
            <div className="diag-warn">
              ⚠ 警告：导出的文件将包含可代理凭据，保存时需注意文件安全。
            </div>
          )}
          <div className="diag-actions">
            <button className="btn-primary" onClick={() => onExport(includeSecrets)}>
              导出 JSON
            </button>
          </div>
        </div>

        <div className="diag-section">
          <div className="diag-label">导入设置</div>
          <p className="diag-hint">
            选择之前导出的 JSON 文件。导入会原子替换自选和提醒；历史默认保留在本地。
          </p>
          <label className="backup-check">
            <input
              type="checkbox"
              checked={replaceHistory}
              onChange={(e) => setReplaceHistory(e.target.checked)}
            />
            同时替换提醒历史和 AI 分析历史
          </label>
          <div className="diag-hint">
            导入后 LLM 密钥会保留为空，需要重新输入；其他设置（baseUrl、model）会恢复。
          </div>
          <div className="diag-actions">
            {!confirmImport ? (
              <button className="btn-primary" onClick={() => setConfirmImport(true)}>
                选择文件…
              </button>
            ) : (
              <>
                <button className="btn-ghost" onClick={() => setConfirmImport(false)}>取消</button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    onImport(replaceHistory);
                    setConfirmImport(false);
                  }}
                >
                  确认导入
                </button>
              </>
            )}
          </div>
        </div>

        <div className="diag-section">
          <div className="diag-label">说明</div>
          <ul className="diag-list">
            <li>Bundle 顶层 kind = <code>fish-pan:settings-bundle</code>，version = 1</li>
            <li>未知字段会被忽略；缺失可选字段使用默认值</li>
            <li>更高版本的 bundle 需要升级 Fish Pan 后再导入</li>
            <li>导入时自选/提醒是原子替换；导入失败不会污染现有数据</li>
          </ul>
        </div>
      </div>
    </div>
  );
}