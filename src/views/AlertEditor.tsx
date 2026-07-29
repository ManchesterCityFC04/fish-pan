import { useState } from 'react';
import type { Alert, AlertType } from '../types';
import { DEFAULT_COOLDOWN_MS } from '../alertEngine';
import { alertTypeText } from './utils';

interface Props {
  code: string;
  stockName: string;
  existing: Alert | null;
  onClose: () => void;
  onSave: (type: AlertType, value: number, cooldownMs: number) => void;
  onRemove: () => void;
  onReset: () => void;
  onToggleEnabled: () => void;
  onSetCooldown: (ms: number) => void;
}

export function AlertEditor({
  stockName,
  existing,
  onClose,
  onSave,
  onRemove,
  onReset,
  onToggleEnabled,
  onSetCooldown,
}: Props) {
  const [type, setType] = useState<AlertType>(existing?.type || 'price_above');
  const [value, setValue] = useState(existing ? String(existing.value) : '');
  const [cooldownMin, setCooldownMin] = useState<string>(
    existing
      ? String(Math.round((existing.cooldownMs || DEFAULT_COOLDOWN_MS) / 60000))
      : '10'
  );
  const isPct = type.startsWith('pct');

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">🔔 {stockName} · 价格提醒</div>

        <div className="modal-field">
          <label>条件</label>
          <select value={type} onChange={(e) => setType(e.target.value as AlertType)}>
            <option value="price_above">涨过价格</option>
            <option value="price_below">跌破价格</option>
            <option value="pct_above">涨幅超过 (%)</option>
            <option value="pct_below">跌幅超过 (%)</option>
          </select>
        </div>

        <div className="modal-field">
          <label>数值</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isPct ? '如 3' : '如 1800'}
            autoFocus
          />
        </div>

        <div className="modal-field">
          <label>冷却（分钟）</label>
          <input
            type="number"
            min={0}
            value={cooldownMin}
            onChange={(e) => setCooldownMin(e.target.value)}
            onBlur={() => {
              const mins = Number(cooldownMin);
              if (!isNaN(mins) && mins >= 0) onSetCooldown(mins * 60_000);
            }}
          />
        </div>

        {existing && (
          <div className={`modal-status ${existing.triggered ? 'fired' : ''}`}>
            {existing.triggered
              ? '✅ 已触发'
              : existing.enabled
              ? '🟢 监控中'
              : '⏸ 已停用'}
            {' · '}
            {alertTypeText(existing.type)} {existing.value}
            {existing.cooldownMs ? ` · 冷却 ${Math.round(existing.cooldownMs / 60000)} 分钟` : ''}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onRemove}>删除</button>
          {existing && (
            <button className="btn-ghost" onClick={onToggleEnabled}>
              {existing.enabled ? '停用' : '启用'}
            </button>
          )}
          {existing?.triggered && (
            <button className="btn-ghost" onClick={onReset}>重新武装</button>
          )}
          <button
            className="btn-primary"
            onClick={() => {
              const v = Number(value);
              const ms = Number(cooldownMin);
              if (!value || isNaN(v)) return;
              const safeMs = !isNaN(ms) && ms >= 0 ? ms * 60_000 : DEFAULT_COOLDOWN_MS;
              onSave(type, v, safeMs);
            }}
          >
            保存
          </button>
        </div>
        <div className="modal-hint">
          使用阈值穿越判断；冷却期内不会重复弹窗；应用未运行时不会监控
        </div>
      </div>
    </div>
  );
}