import { useState } from 'react';
import {
  calcAddPosition,
  calcSharesForTargetCost,
  isLikelyCNMarket,
  isLotWarningCN,
  sharesFromAmount,
} from '../addPosition';
import { fmtPrice } from '../api';

interface Props {
  code: string | null;
  stockName?: string;
  currentPrice: number | null;
  onBack: () => void;
}

export function AddPositionCalculator({ code, stockName, currentPrice, onBack }: Props) {
  const [curQty, setCurQty] = useState('');
  const [curCost, setCurCost] = useState('');
  const [addMode, setAddMode] = useState<'qty' | 'amount'>('qty');
  const [addQty, setAddQty] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addPrice, setAddPrice] = useState(
    currentPrice != null && Number.isFinite(currentPrice) ? String(currentPrice) : ''
  );
  const [target, setTarget] = useState('');

  const cn = code ? isLikelyCNMarket(code) : false;
  const title = code ? `加仓测算 · ${stockName || code}` : '加仓测算';

  const curQtyN = Number(curQty);
  const curCostN = Number(curCost);
  const addPriceN = Number(addPrice);
  const qty = Number(addQty);
  const amount = Number(addAmount);

  const impliedAddQty =
    addMode === 'amount' ? sharesFromAmount(amount, addPriceN) : qty;

  const result =
    Number.isFinite(curQtyN) &&
    Number.isFinite(curCostN) &&
    Number.isFinite(impliedAddQty as number) &&
    Number.isFinite(addPriceN) &&
    (impliedAddQty as number) > 0
      ? calcAddPosition({
          curQty: curQtyN,
          curCost: curCostN,
          addQty: impliedAddQty as number,
          addPrice: addPriceN,
        })
      : null;

  const targetN = Number(target);
  const reverseShares =
    Number.isFinite(curQtyN) &&
    Number.isFinite(curCostN) &&
    Number.isFinite(addPriceN) &&
    Number.isFinite(targetN) &&
    curQtyN > 0 &&
    curCostN > 0
      ? calcSharesForTargetCost({
          curQty: curQtyN,
          curCost: curCostN,
          addPrice: addPriceN,
          target: targetN,
        })
      : null;

  const isBuildUp = curQtyN === 0 && curCostN === 0;

  const lotWarn =
    addMode === 'qty' && isLotWarningCN(qty, cn)
      ? true
      : addMode === 'amount' && Number.isFinite(impliedAddQty as number)
      ? isLotWarningCN(impliedAddQty as number, cn)
      : false;
  const lotWarnReverse = isLotWarningCN(reverseShares as number, cn);

  return (
    <div className="page">
      <div className="page-head">
        <button className="btn-ghost" onClick={onBack}>← 返回</button>
        <h3>{title}{isBuildUp ? ' · 建仓测算' : ''}</h3>
      </div>

      <div className="addpos-body">
        <div className="addpos-row">
          <label>当前持仓</label>
          <input
            type="number"
            min={0}
            placeholder="股数"
            value={curQty}
            onChange={(e) => setCurQty(e.target.value)}
          />
          <span className="addpos-x">×</span>
          <input
            type="number"
            min={0}
            placeholder="成本价"
            value={curCost}
            onChange={(e) => setCurCost(e.target.value)}
          />
        </div>

        <div className="addpos-tabs">
          <button
            className={`addpos-tab ${addMode === 'qty' ? 'on' : ''}`}
            onClick={() => setAddMode('qty')}
          >按股数</button>
          <button
            className={`addpos-tab ${addMode === 'amount' ? 'on' : ''}`}
            onClick={() => setAddMode('amount')}
          >按金额</button>
        </div>

        <div className="addpos-row">
          <label>{addMode === 'qty' ? '加仓股数' : '加仓金额'}</label>
          {addMode === 'qty' ? (
            <input
              type="number"
              min={0}
              placeholder="如 500"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
            />
          ) : (
            <input
              type="number"
              min={0}
              placeholder="如 5000"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
            />
          )}
        </div>

        <div className="addpos-row">
          <label>加仓价</label>
          <input
            type="number"
            min={0}
            placeholder={currentPrice != null ? `当前 ${currentPrice}` : '如 9.85'}
            value={addPrice}
            onChange={(e) => setAddPrice(e.target.value)}
          />
        </div>

        {lotWarn && (
          <div className="addpos-warn">提示：A股通常 100 股/手，建议取整到 100 的倍数</div>
        )}

        <div className="addpos-result">
          {result ? (
            <>
              <div className="addpos-line">
                <span>合计股数</span>
                <b>{result.newQty.toFixed(0)} 股</b>
              </div>
              <div className="addpos-line">
                <span>加权均价</span>
                <b>{fmtPrice(result.newCost)}</b>
              </div>
              <div className="addpos-line">
                <span>合计投入</span>
                <b>{fmtPrice(result.totalInvested)}</b>
              </div>
              {!isBuildUp && result.isAdd && (
                <>
                  <div className="addpos-line">
                    <span>成本降低</span>
                    <b>{fmtPrice(result.diluteAbs)}</b>
                  </div>
                  <div className="addpos-line">
                    <span>摊薄幅度</span>
                    <b>{result.dilutePct.toFixed(2)}%</b>
                  </div>
                </>
              )}
              {addMode === 'amount' && Number.isFinite(impliedAddQty as number) && (
                <div className="addpos-line">
                  <span>折算股数</span>
                  <b>{(impliedAddQty as number).toFixed(2)} 股</b>
                </div>
              )}
            </>
          ) : (
            <div className="addpos-placeholder">填齐以上四项即可试算</div>
          )}
        </div>

        {curQtyN > 0 && curCostN > 0 && (
          <div className="addpos-reverse">
            <div className="addpos-reverse-title">反推：目标加权均价</div>
            <div className="addpos-row">
              <label>目标成本</label>
              <input
                type="number"
                min={0}
                placeholder="如 9"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            {Number.isFinite(targetN) && targetN > 0 && (
              reverseShares == null ? (
                <div className="addpos-warn">
                  需 加仓价 &lt; 目标 &lt; 现成本 才能降到该成本
                </div>
              ) : (
                <div className="addpos-line">
                  <span>需要加仓</span>
                  <b>{reverseShares.toFixed(0)} 股</b>
                </div>
              )
            )}
            {lotWarnReverse && (
              <div className="addpos-warn">提示：A股通常 100 股/手，建议取整到 100 的倍数</div>
            )}
          </div>
        )}

        <div className="addpos-hint">
          不会保存任何输入；HK/US 市场不显示手数提示；金额 = 金额 ÷ 加仓价 × 已含手续费估算（仅展示，不实际扣减）
        </div>
      </div>
    </div>
  );
}