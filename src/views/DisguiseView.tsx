import { useEffect, useState } from 'react';
import type { DisguiseSkin } from '../types';

interface Props {
  skin: DisguiseSkin;
  onCycle: () => void;
  onExit: () => void;
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export function DisguiseView({ skin, onCycle, onExit }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [cpu, setCpu] = useState(12);
  const [mem, setMem] = useState(38);
  useEffect(() => {
    if (skin !== 'monitor') return;
    const t = setInterval(() => {
      setCpu(8 + Math.round(Math.random() * 30));
      setMem(30 + Math.round(Math.random() * 25));
    }, 1500);
    return () => clearInterval(t);
  }, [skin]);

  if (skin === 'clock') {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
    const week = WEEK_LABELS[now.getDay()];
    return (
      <div className="disguise" onClick={onExit}>
        <div className="dg-label">系统时钟</div>
        <div className="dg-clock">
          {hh}:{mm}
          <span className="dg-sec">{ss}</span>
        </div>
        <div className="dg-date">{dateStr} 星期{week}</div>
        <div className="dg-bar">
          <button onClick={(e) => { e.stopPropagation(); onCycle(); }}>🔄 换皮肤</button>
          <button onClick={(e) => { e.stopPropagation(); onExit(); }}>👁 恢复</button>
        </div>
        <div className="dg-hint">按 F9 或点击空白处恢复盯盘</div>
      </div>
    );
  }

  return (
    <div className="disguise" onClick={onExit}>
      <div className="dg-label">任务管理器</div>
      <div className="dg-mon">
        <div className="dg-row">
          <span>CPU</span>
          <div className="dg-track">
            <div className="dg-fill" style={{ width: cpu + '%' }} />
          </div>
          <b>{cpu}%</b>
        </div>
        <div className="dg-row">
          <span>MEM</span>
          <div className="dg-track">
            <div className="dg-fill mem" style={{ width: mem + '%' }} />
          </div>
          <b>{mem}%</b>
        </div>
        <div className="dg-sub">进程数 287 · 系统运行正常</div>
      </div>
      <div className="dg-bar">
        <button onClick={(e) => { e.stopPropagation(); onCycle(); }}>🔄 换皮肤</button>
        <button onClick={(e) => { e.stopPropagation(); onExit(); }}>👁 恢复</button>
      </div>
      <div className="dg-hint">按 F9 或点击空白处恢复盯盘</div>
    </div>
  );
}