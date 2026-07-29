// 离线验证 addPosition 模块。复制 src/addPosition.ts 中的核心公式，避免引入 React 类型。
// 一旦公式改动需同步更新这里。

const DEFAULT_NAV = 'https://www.fish-pan.local';

function resolveCode(raw) {
  raw = String(raw || '').trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(raw)) return raw;
  if (/^hk\d{5}$/.test(raw)) return raw;
  if (/^us[a-z]+$/i.test(raw)) return raw;
  if (/^\d{6}$/.test(raw)) {
    if (raw.startsWith('6')) return 'sh' + raw;
    if (raw.startsWith('0') || raw.startsWith('3')) return 'sz' + raw;
    if (raw.startsWith('8') || raw.startsWith('4')) return 'bj' + raw;
  }
  if (/^\d{5}$/.test(raw)) return 'hk' + raw;
  return '';
}

function calcAddPosition(input) {
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
  return { isAdd, newQty, newCost, totalInvested, diluteAbs, dilutePct };
}

function calcSharesForTargetCost(input) {
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
  if (!(addPrice < target && target < curCost)) return null;
  const q = (curQty * (curCost - target)) / (target - addPrice);
  return Number.isFinite(q) && q > 0 ? q : null;
}

function isLikelyCNMarket(code) {
  if (!code) return false;
  const resolved = resolveCode(code);
  if (!resolved) return false;
  return /^(sh|sz|bj)\d{6}$/.test(resolved);
}

function isLotWarningCN(shareCount, isCNMarket) {
  if (!isCNMarket) return false;
  if (!Number.isFinite(shareCount) || shareCount <= 0) return false;
  return Math.round(shareCount) % 100 !== 0;
}

function sharesFromAmount(amount, price) {
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) return null;
  return amount / price;
}

// ── 断言 ──
let pass = 0, fail = 0;
function eq(name, got, want, tol = 1e-9) {
  const ok = (got === want) || (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) <= tol);
  if (ok) {
    pass++;
    console.log('  ✓', name);
  } else {
    fail++;
    console.log('  ✗', name, '\n    got: ', JSON.stringify(got), '\n    want:', JSON.stringify(want));
  }
}
function isNull(name, got) {
  if (got === null) {
    pass++;
    console.log('  ✓', name);
  } else {
    fail++;
    console.log('  ✗', name, '\n    got: ', JSON.stringify(got), '\n    want: null');
  }
}

// 1. 基本加仓：1000 @ 10 + 500 @ 8 → 均价 9.333...
const r1 = calcAddPosition({ curQty: 1000, curCost: 10, addQty: 500, addPrice: 8 });
eq('add-position blended cost', r1.newCost, 9.333333333333334);
eq('add-position total invested', r1.totalInvested, 14000, 1e-6);
eq('add-position isAdd', r1.isAdd, true);
eq('add-position dilute abs', r1.diluteAbs, 10 - r1.newCost, 1e-9);
eq('add-position dilute pct > 0', r1.dilutePct > 0, true);

// 2. 建仓（curQty=0）不摊薄
const r2 = calcAddPosition({ curQty: 0, curCost: 0, addQty: 100, addPrice: 12.5 });
eq('build-up newQty', r2.newQty, 100);
eq('build-up newCost', r2.newCost, 12.5);
eq('build-up isAdd', r2.isAdd, false);
eq('build-up dilute abs', r2.diluteAbs, 0);
eq('build-up dilute pct', r2.dilutePct, 0);

// 3. 非法输入
isNull('negative addQty', calcAddPosition({ curQty: 100, curCost: 10, addQty: -1, addPrice: 8 }));
isNull('zero addPrice', calcAddPosition({ curQty: 100, curCost: 10, addQty: 100, addPrice: 0 }));
isNull('negative curCost', calcAddPosition({ curQty: 100, curCost: -1, addQty: 100, addPrice: 8 }));
isNull('NaN addQty', calcAddPosition({ curQty: 100, curCost: 10, addQty: NaN, addPrice: 8 }));

// 4. 反推：1000 @ 20, 加仓价 10, 目标 15 → q = 1000*(20-15)/(15-10) = 1000
eq('reverse target cost', calcSharesForTargetCost({ curQty: 1000, curCost: 20, addPrice: 10, target: 15 }), 1000);
// 不可行：目标高于现成本
isNull('reverse infeasible (target > curCost)', calcSharesForTargetCost({ curQty: 1000, curCost: 10, addPrice: 8, target: 12 }));
// 不可行：目标低于加仓价
isNull('reverse infeasible (target < addPrice)', calcSharesForTargetCost({ curQty: 1000, curCost: 20, addPrice: 18, target: 15 }));
// 空仓
isNull('reverse empty', calcSharesForTargetCost({ curQty: 0, curCost: 0, addPrice: 10, target: 5 }));

// 5. 金额转股数
eq('amount 10000 / price 5 = 2000', sharesFromAmount(10000, 5), 2000);
isNull('amount zero', sharesFromAmount(0, 5));
isNull('price zero', sharesFromAmount(1000, 0));

// 6. 市场识别
eq('CN market SH', isLikelyCNMarket('sh600000'), true);
eq('CN market digits', isLikelyCNMarket('600000'), true);
eq('HK not CN', isLikelyCNMarket('hk00700'), false);
eq('US not CN', isLikelyCNMarket('usAAPL'), false);
eq('empty not CN', isLikelyCNMarket(''), false);

// 7. A 股手数提示
eq('lot warn CN 150', isLotWarningCN(150, true), true);
eq('lot warn CN 100', isLotWarningCN(100, true), false);
eq('lot warn CN 250', isLotWarningCN(250, true), true);
eq('lot warn HK 150', isLotWarningCN(150, false), false);
eq('lot warn CN 0', isLotWarningCN(0, true), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
