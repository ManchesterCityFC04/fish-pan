// 纯函数：加仓测算。零 React 依赖，可在 Node 中通过 tools/verify-add-position.mjs 验证。
// 公式与 PanWatch frontend/packages/biz-ui/src/components/add-position-calculator.tsx 保持一致。

import { resolveCode } from './api';

export interface AddPositionInput {
  curQty: number;
  curCost: number;
  addQty: number;
  addPrice: number;
}

export interface AddPositionResult {
  isAdd: boolean;
  newQty: number;
  newCost: number;
  totalInvested: number;
  // 摊薄 = 旧成本 - 新成本
  diluteAbs: number;
  // 摊薄百分比（%）
  dilutePct: number;
}

/**
 * 计算加仓后的总股数、加权均价、合计投入、摊薄。
 * - 当 curQty <= 0 或 curCost <= 0 时视为"建仓"，diluteAbs/dilutePct 返回 0。
 * - addQty/addPrice 必须为正数；curQty/curCost 必须为非负数。
 * - 任一参数为 NaN/Infinity 视为非法输入，返回 null。
 */
export function calcAddPosition(input: AddPositionInput): AddPositionResult | null {
  const { curQty, curCost, addQty, addPrice } = input;
  if (
    !Number.isFinite(curQty) ||
    !Number.isFinite(curCost) ||
    !Number.isFinite(addQty) ||
    !Number.isFinite(addPrice) ||
    curQty < 0 ||
    curCost < 0 ||
    addQty <= 0 ||
    addPrice <= 0
  ) {
    return null;
  }
  const isAdd = curQty > 0 && curCost > 0;
  const newQty = curQty + addQty;
  const newCost = newQty > 0 ? (curQty * curCost + addQty * addPrice) / newQty : 0;
  const totalInvested = newQty * newCost;
  const diluteAbs = isAdd ? curCost - newCost : 0;
  const dilutePct = isAdd && curCost > 0 ? (diluteAbs / curCost) * 100 : 0;
  return {
    isAdd,
    newQty,
    newCost,
    totalInvested,
    diluteAbs,
    dilutePct,
  };
}

export interface TargetCostInput {
  curQty: number;
  curCost: number;
  addPrice: number;
  target: number;
}

/**
 * 反推：给定目标加权均价，计算需要的加仓股数。
 * - 仅当 0 < addPrice < target < curCost 时返回正数；其余返回 null。
 * - 公式：q = curQty * (curCost - target) / (target - addPrice)
 */
export function calcSharesForTargetCost(input: TargetCostInput): number | null {
  const { curQty, curCost, addPrice, target } = input;
  if (
    !Number.isFinite(curQty) ||
    !Number.isFinite(curCost) ||
    !Number.isFinite(addPrice) ||
    !Number.isFinite(target) ||
    curQty <= 0 ||
    curCost <= 0 ||
    addPrice <= 0 ||
    target <= 0
  ) {
    return null;
  }
  if (!(addPrice < target && target < curCost)) {
    return null;
  }
  const q = (curQty * (curCost - target)) / (target - addPrice);
  return Number.isFinite(q) && q > 0 ? q : null;
}

/**
 * 用 resolveCode 判定是否为 A 股。
 * - 返回 false 时不显示"100 股/手"提示。
 */
export function isLikelyCNMarket(code: string | null | undefined): boolean {
  if (!code) return false;
  const resolved = resolveCode(code);
  if (!resolved) return false;
  return /^(sh|sz|bj)\d{6}$/.test(resolved);
}

/**
 * A 股 100 股/手提示。
 * - shareCount 必须为正数；isCNMarket=false 时永远不提示。
 */
export function isLotWarningCN(shareCount: number, isCNMarket: boolean): boolean {
  if (!isCNMarket) return false;
  if (!Number.isFinite(shareCount) || shareCount <= 0) return false;
  return Math.round(shareCount) % 100 !== 0;
}

/**
 * 金额换算为股数（按整百对齐？直接除，不做取整，便于让 isLotWarningCN 给出提示）。
 */
export function sharesFromAmount(amount: number, price: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) {
    return null;
  }
  return amount / price;
}
