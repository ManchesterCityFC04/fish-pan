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
The system MUST NOT 在任何新闻 Adapter 中绕过 TLS 验证或请求需要鉴权的私有接口；Adapter 必须使用 https/http 协议。

#### Scenario: TLS 验证不被绕过
- **WHEN** 实现新闻 Adapter
- **THEN** 代码中不出现 `rejectUnauthorized: false` 或等价绕过

### Requirement: 自选列表显示最新新闻时间戳
The system SHALL 在自选列表行显示该股最近一条新闻的发布时间，无新闻时显示“暂无”。

#### Scenario: 自选列表显示时间戳
- **WHEN** 用户打开自选列表
- **THEN** 每行右侧显示最近一条新闻的发布时间
