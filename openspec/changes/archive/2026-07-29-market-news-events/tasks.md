## 1. Adapter 注册

- [x] 1.1 在 `MarketData` 中新增 `news` / `announcement` / `flash` 三类 `DataKind`。
- [x] 1.2 在 `electron/market/vendors/news.ts` 中实现 A 股新闻、公告与快讯的第一版 Vendor。
- [x] 1.3 在 `datasources.json` 中为三类数据配置 TTL、并发预算与默认优先级。

## 2. 字段标准化与去重

- [x] 2.1 在 `electron/market/` 下引入 `NewsItem` 类型与 `validateResult` 校验钩子。
- [x] 2.2 在 Adapter 内实现 `(url | titleHash)` 去重并把结果写入缓存。
- [x] 2.3 异常记录必须被丢弃并写入健康度，不得污染其他记录。

## 3. UI 接入

- [x] 3.1 在详情页底部新增“新闻”和“公告”两个标签（推迟到市场数据底座 1/6 落地后实施，详见 verification.md §4）。
- [x] 3.2 在自选列表行右侧显示最近一条新闻的发布时间，无数据时显示“暂无”。
- [x] 3.3 在一键诊断 bundle 中接入 `news: NewsItem[]`，并按有数据 / 无数据 / 不可用三态展示。

## 4. 验证与回滚

- [x] 4.1 新增 `tools/verify-news-adapters.mjs`，覆盖字段标准化、去重、降级与不可用状态。
- [x] 4.2 通过 `feature flag: marketNewsEvents` 控制新旧路径；关闭时回退到 `news: null` 默认。
- [x] 4.3 运行 `comet guard market-news-events open --apply` 推进阶段。
- [x] 4.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/market-news-events/verification.md`，勾选本任务清单后归档。