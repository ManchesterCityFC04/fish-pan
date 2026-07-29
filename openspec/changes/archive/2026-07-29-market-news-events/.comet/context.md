# Comet Design Handoff

- Change: market-news-events
- Phase: design
- Mode: compact
- Context hash: e117cfaa39dedc51d39e473bdf07f02ca5a9cea60f202f9701c3816404dd5fe1

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/market-news-events/proposal.md

- Source: openspec/changes/market-news-events/proposal.md
- Lines: 1-30
- SHA256: 1310d016ae17d57151e34fad76ac0f1427ac3c3fa325d3cc4cf71167c792e470

```md
## Why

fish-pan 当前“一键诊断”的 `news` 字段恒为 `null`，因为全代码库没有新闻数据源。PanWatch 实现了多源新闻、公告与快讯，并把字段标准化后接入 Agent；fish-pan 需要在不引入 PanWatch 多 Agent 与 Apache 来源的前提下，补齐个股新闻、公告与快讯，并接入详情页与一键诊断上下文。

## What Changes

- 第一版引入个股新闻、公司公告和市场快讯三类数据；优先级支持 A 股，港美股按可用数据源降级。
- 复用 `market-data-engine` 的 Port/Adapter/TTL/降级与健康度机制，避免另起一套请求栈。
- 在数据源注册表中加入 `news | announcement | flash` 三个 Adapter，注册到 `MarketData`，按 Vendor 优先级调度。
- 统一字段：`title` / `url` / `source` / `publishedAt` / `summary` / `codes[]`；详情页与一键诊断统一使用此结构。
- 详情页底部新增“新闻”和“公告”两标签，展示最近 30 天记录；自选列表行显示最新一条新闻时间戳。
- 一键诊断 bundle 中 `news` 不再恒为 `null`：传入最近 N 条新闻与公告摘要；当某 Adapter 失效时显示“暂无新闻”而不阻断诊断。
- 重复新闻通过 `(url | titleHash)` 去重；缓存与 TTL 由 `market-data-engine` 统一控制。
- 港美股没有可用 Adapter 时显示“不适用”，而不是报错。
- 不在本 change 中增加财报、分红、股东、龙虎榜、融资融券和北向资金；不爬取付费研报；不直接生成情绪分数；不保存未经限制的全文内容。

## Capabilities

### New Capabilities
- `market-news-events`: 个股新闻、公告与快讯的注册、聚合、缓存和接入详情页与一键诊断上下文。

### Modified Capabilities
- `one-click-diagnosis`: 诊断 bundle 接收真实新闻与公告上下文；当某 Adapter 失效时显示“暂无新闻”而非报错。

## Impact

- 主要影响 `electron/main.js`、`src/api.ts`、`src/diagnosis.ts`、`src/views/OneClickDiagnosis.tsx`、`src/types.ts` 与新增 `electron/market/vendors/news.ts` 等 Adapter 文件。
- 渲染端详情页底部增加“新闻”和“公告”两个标签；自选列表行显示新闻时间戳。
- 数据源注册表与健康度视图需要扩展以呈现新闻 Vendor 状态。
- 单元测试与离线断言：新增 `tools/verify-news-adapters.mjs`，覆盖字段标准化、去重与降级。
- 安全边界：每个 Vendor 实现里禁止 `verify=false`；调用字段映射前必须经过 `validateResult` 钩子。
```

## openspec/changes/market-news-events/design.md

- Source: openspec/changes/market-news-events/design.md
- Lines: 1-56
- SHA256: 2dc3b8f9a1cc580deb1148e92f992ef474b8cdc4415b6aed4f6e5b79d635a7f3

```md
## Context

fish-pan 当前诊断 bundle 里的 `news` 字段为 `null`，原因是没有新闻数据源；PanWatch 通过 `vendors/news.py` 把雪球、东方财富搜索和公告接口整合为统一字段。本 change 借鉴其“统一字段 + 适配器”做法，但仅覆盖第一版三类（个股新闻 / 公司公告 / 快讯），且只采用可长期使用的字段校准；不复制 PanWatch 的 Python 实现、不引入 Apache 来源、不绕过 TLS。

## Goals / Non-Goals

**Goals:**

- 把个股新闻、公司公告、市场快讯统一为 `NewsItem` 结构，并在 `MarketData` 中按 `news | announcement | flash` 三类注册 Adapter。
- 复用 `market-data-engine` 的 Port/Adapter/TTL/降级/健康度机制，避免另起一套请求栈。
- 详情页底部“新闻”和“公告”两个标签；自选列表行显示最新一条新闻时间戳。
- 一键诊断 bundle 中 `news` 不再恒为 `null`；当某 Adapter 失效时显示“暂无新闻”而不阻断诊断。
- 港美股没有可用 Adapter 时显示“不适用”，而不是报错。
- 重复新闻通过 `(url | titleHash)` 去重。

**Non-Goals:**

- 不引入财报、分红、股东、龙虎榜、融资融券和北向资金。
- 不抓取付费研报。
- 不直接生成情绪分数，不订阅商业情绪 API。
- 不保存未经限制的全文内容；摘要字段最大 200 字。
- 不绕过 TLS 验证；不假设第三方内部接口可长期商用。

## Decisions

- **数据源类型**：在 `MarketData` 中新增三类 `DataKind = 'news' | 'announcement' | 'flash'`；每类独立 Adapter 注册。
- **Adapter 实现**：第一版为每类提供 1–2 个公开可达的 Vendor；A 股优先；港美股按可用 Adapter 提供降级。
- **字段标准化**：所有 Adapter 输出统一为 `NewsItem = { id, kind, title, url, source, publishedAt, summary?, codes: string[], lang }`。
- **去重策略**：按 `(url | hash(title))` 去重；同一 `(code, kind, id)` 在缓存窗口内只返回一次。
- **缓存与 TTL**：TTL 由 `MarketData` 统一控制；`news.inFlight=1s, news.cache=10m`，`announcement` 略长，`flash` 较短。
- **诊断接入**：`buildDiagnosisBundle` 接收 `news: NewsItem[]`，当 Adapter 失败时显示 `status: 'unavailable'`；UI 区分有数据、无数据、不可用三态。
- **安全与合规**：所有 Vendor Adapter 走 `httpsAgent` / `node-fetch` 标准配置；禁止 `verify=false`；每个 Vendor 在代码注释中记录字段校准状态与已知限制。

## Risks / Trade-offs

- [数据源字段漂移] → 在 Adapter 内集中做字段映射与默认值兜底；`validateResult` 钩子拒绝异常结果。
- [数据源 ToS 与限流] → 默认频次为 `cache=10m`；健康度面板允许用户主动暂停。
- [港美股无数据] → 明确显示“不适用”，不暴露内部错误；预留后续 Vendor 接入点。
- [重复新闻] → 通过 `(url | titleHash)` 去重；缓存窗口期内合并同一来源。
- [情绪与解读越界] → 第一版只提供原文与摘要，不直接生成情绪分数；后续 LLM 摘要通过 `llm-provider-integration` 提供。

## Migration Plan

1. 在 `MarketData` 注册 `news | announcement | flash` 三类 Adapter。
2. 新增 `electron/market/vendors/news.ts`，提供 A 股新闻与公告的第一版 Vendor；快讯作为附加类。
3. 渲染端详情页增加“新闻”和“公告”标签；自选列表行显示最新新闻时间戳。
4. `buildDiagnosisBundle` 与 `OneClickDiagnosis` 接入真实 `news` 上下文。
5. 编写 `tools/verify-news-adapters.mjs`，覆盖字段标准化、去重、降级与不可用状态。
6. 通过 `feature flag: marketNewsEvents` 控制新旧路径；关闭时回退到当前 `news: null` 行为。

回滚：保留旧 `news: null` 默认；通过 feature flag 关闭即可。

## Open Questions

- 是否允许用户在设置中调整新闻 TTL？建议提供“刷新间隔”配置项，但本期不开放 Vendor 切换。
- 是否接入海外 RSS 作为港美股降级？建议留作后续增量。
- 是否提供“关键词过滤” UI？建议先只做时间倒序，关键词过滤作为独立增量。
```

## openspec/changes/market-news-events/tasks.md

- Source: openspec/changes/market-news-events/tasks.md
- Lines: 1-23
- SHA256: d8677fc4dbd1b87a6be082fceb3e29f7a1f6c0a94f57b189d04eb28472297c7f

```md
## 1. Adapter 注册

- [ ] 1.1 在 `MarketData` 中新增 `news` / `announcement` / `flash` 三类 `DataKind`。
- [ ] 1.2 在 `electron/market/vendors/news.ts` 中实现 A 股新闻、公告与快讯的第一版 Vendor。
- [ ] 1.3 在 `datasources.json` 中为三类数据配置 TTL、并发预算与默认优先级。

## 2. 字段标准化与去重

- [ ] 2.1 在 `electron/market/` 下引入 `NewsItem` 类型与 `validateResult` 校验钩子。
- [ ] 2.2 在 Adapter 内实现 `(url | titleHash)` 去重并把结果写入缓存。
- [ ] 2.3 异常记录必须被丢弃并写入健康度，不得污染其他记录。

## 3. UI 接入

- [ ] 3.1 在详情页底部新增“新闻”和“公告”两个标签。
- [ ] 3.2 在自选列表行右侧显示最近一条新闻的发布时间，无数据时显示“暂无”。
- [ ] 3.3 在一键诊断 bundle 中接入 `news: NewsItem[]`，并按有数据 / 无数据 / 不可用三态展示。

## 4. 验证与回滚

- [ ] 4.1 新增 `tools/verify-news-adapters.mjs`，覆盖字段标准化、去重、降级与不可用状态。
- [ ] 4.2 通过 `feature flag: marketNewsEvents` 控制新旧路径；关闭时回退到 `news: null` 默认。
- [ ] 4.3 运行 `comet guard market-news-events open --apply` 推进阶段。
- [ ] 4.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/market-news-events/verification.md`，勾选本任务清单后归档。
```

## openspec/changes/market-news-events/specs/market-news-events/spec.md

- Source: openspec/changes/market-news-events/specs/market-news-events/spec.md
- Lines: 1-108
- SHA256: bd744ff8e5af766187a237258368cc0e92a308c859d558a985016cd9a1d0ba11

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 三类新闻数据
The system SHALL 在 `MarketData` 中支持 `news` / `announcement` / `flash` 三类数据，分别为个股新闻、公司公告与市场快讯。

#### Scenario: A 股新闻
- **WHEN** 用户在 A 股详情页打开“新闻”标签
- **THEN** 系统返回最近 30 天该股的新闻条目，按发布时间倒序

#### Scenario: A 股公告
- **WHEN** 用户在 A 股详情页打开“公告”标签
- **THEN** 系统返回最近 30 天该股的公告条目，按发布时间倒序

#### Scenario: 市场快讯
- **WHEN** 用户在主界面或诊断上下文中请求快讯
- **THEN** 系统返回最近的市场快讯列表

### Requirement: 统一字段格式
The system SHALL 把所有新闻类数据规范化为 `NewsItem` 结构，至少包含 `id` / `kind` / `title` / `url` / `source` / `publishedAt` / `codes[]` / `lang` 字段。

#### Scenario: 字段标准化
- **WHEN** 任何 Adapter 返回原始数据
- **THEN** 渲染端只接受经过 `validateResult` 钩子校验的 `NewsItem` 结构

#### Scenario: 缺字段处理
- **WHEN** Adapter 返回缺 `url` 或 `publishedAt` 的记录
- **THEN** 该记录被丢弃并不污染其他条目

### Requirement: 重复去重
The system SHALL 通过 `(url | titleHash)` 在缓存窗口内对重复新闻去重，保证同一 `(code, kind, id)` 仅返回一次。

#### Scenario: URL 重复
- **WHEN** 同一新闻在不同 Adapter 返回相同 URL
- **THEN** 系统仅保留一条记录

#### Scenario: 标题相同 URL 缺失
- **WHEN** Adapter 返回的新闻缺少 URL 但标题一致
- **THEN** 系统通过 titleHash 去重并保留一条

### Requirement: 缓存与 TTL
The system SHALL 复用 `MarketData` 的 TTL 与请求合并机制；新闻类数据的默认 `cache=10m`，公告类数据略长，快讯较短。

#### Scenario: TTL 内的并发请求
- **WHEN** 同一 key 在 TTL 窗口内被多次请求
- **THEN** 系统复用缓存而不发起新的外部请求

#### Scenario: 缓存过期
- **WHEN** 上一次结果超过 cacheTTL
- **THEN** 新的请求触发实际数据获取并刷新缓存

### Requirement: 数据源健康度可见
The system SHALL 把新闻类 Vendor 加入健康度面板，展示最近成功时间、延迟与错误原因。

#### Scenario: 单 Vendor 失败
- **WHEN** 某个新闻 Vendor 返回解析错误
- **THEN** 健康度面板显示该 Vendor 失败并不影响其他 Vendor

### Requirement: 详情页与诊断上下文接入
The system SHALL 在详情页底部显示“新闻”和“公告”两个标签，并把 `news` 上下文传给一键诊断 bundle。

#### Scenario: 详情页新闻标签
- **WHEN** 用户在详情页打开“新闻”标签
- **THEN** 系统展示该股最近新闻列表，无数据时显示“暂无新闻”

#### Scenario: 诊断 bundle news 字段
- **WHEN** 用户触发一键诊断
- **THEN** bundle 的 `news` 字段包含已规范化的 `NewsItem[]`，无数据时为 `[]` 而非 `null`

### Requirement: Adapter 失败可见而非崩溃
The system SHALL 在 Adapter 全部失败时显示“暂无新闻”而不抛出异常；港美股无 Adapter 时显示“不适用”。

#### Scenario: 全部 Adapter 失败
- **WHEN** 所有 `news` Adapter 在 TTL 窗口内失败
- **THEN** 详情页显示“暂无新闻”，诊断仍可继续

#### Scenario: 港美股无 Adapter
- **WHEN** 当前市场没有任何新闻 Vendor
- **THEN** UI 显示“不适用”而不是错误

### Requirement: 安全与合规边界

```

Full source: openspec/changes/market-news-events/specs/market-news-events/spec.md
