## ADDED Requirements

### Requirement: 统一数据源注册与启用
The system SHALL 在 Electron 主进程侧维护按数据类型（quote / kline / market / funds）分组的 Vendor 注册表，并按配置文件的优先级顺序选择候选 Vendor。Vendor 必须支持运行时启用与禁用。

#### Scenario: 单 Vendor 提供数据
- **WHEN** 数据类型下只启用了一个 Vendor 且请求成功
- **THEN** Engine 直接返回该 Vendor 的结果并在状态中标记其最近成功时间

#### Scenario: Vendor 被禁用
- **WHEN** 启动时或运行时将某 Vendor 标记为禁用
- **THEN** Engine 不再把它作为候选且健康度中显示“已禁用”

### Requirement: 主 Vendor 失败自动降级
The system MUST 在候选 Vendor 出现网络错误、超时或解析错误时，按优先级尝试下一个候选，并在所有候选失败时返回结构化错误而非抛出异常。

#### Scenario: 主 Vendor 网络超时
- **WHEN** 主 Vendor 在指定超时内未返回
- **THEN** Engine 在不退避的前提下立即尝试下一个 Vendor，并把该 Vendor 标记为“最近错误”

#### Scenario: 所有候选失败
- **WHEN** 所有候选 Vendor 都在允许的重试与退避范围内失败
- **THEN** Engine 返回包含 `errorKind: "all-failed"` 的结构化结果，不抛出未捕获异常

### Requirement: 并发请求合并与 TTL 缓存
The system MUST 在同一数据类型与同一请求 key 下合并并发请求，并使用可配置的 TTL 缓存短时复用结果，避免在刷新周期内重复访问第三方接口。

#### Scenario: TTL 内的并发请求
- **WHEN** 同一 key 在 TTL 窗口内被发起第二次请求
- **THEN** Engine 复用首次 in-flight Promise，不发起新的外部请求

#### Scenario: TTL 过期后的请求
- **WHEN** 上一次结果超过 cacheTTL 仍未更新
- **THEN** 新的请求触发实际数据获取并刷新缓存

### Requirement: 有限重试与指数退避
The system MUST 对网络层错误（超时、连接重置）执行有限次数的重试（默认最多 2 次）并按指数退避增加间隔；解析错误 MUST NOT 重试。

#### Scenario: 重试触发
- **WHEN** Vendor 抛错分类为网络层错误
- **THEN** Engine 在配置的预算内重试并在失败时尝试下一个 Vendor

#### Scenario: 解析错误不重试
- **WHEN** Vendor 返回非预期结构或空关键字段
- **THEN** Engine 立即记录错误并尝试下一个 Vendor，不再重试同一 Vendor

### Requirement: 字段异常隔离
The system MUST 在 Vendor 返回结果时通过统一的字段校验钩子识别异常（例如缺字段、价格为负等）并丢弃该结果，不影响其他 Vendor 或后续请求。

#### Scenario: 异常字段被识别
- **WHEN** 某 Vendor 返回的报价缺少必要字段
- **THEN** 该结果被丢弃，Engine 继续尝试下一个 Vendor 并把异常记入该 Vendor 的健康度

### Requirement: 数据源健康度状态
The system SHALL 为每个 Vendor 维护最近成功时间、最近错误时间、平均延迟、成功与失败计数，并提供 IPC 供 UI 查看与在线测试。

#### Scenario: 查看状态
- **WHEN** renderer 发起 `data-source:status`
- **THEN** Engine 返回所有 Vendor 的状态摘要，按数据类型分组

#### Scenario: 在线测试单 Vendor
- **WHEN** renderer 发起 `data-source:test` 并指定 Vendor
- **THEN** Engine 在 5 秒内返回成功、解析失败或网络超时三态结果

### Requirement: 错误返回结构化
The system MUST 为所有数据请求返回稳定的 JSON 结构 `MarketResult`，其中 `data` 为成功数据或 `null`，`error` 为 `{kind, message, vendorId, observedAt}` 形态的对象。

#### Scenario: 错误结果可见
- **WHEN** Engine 聚合所有 Vendor 失败
- **THEN** `MarketResult.data` 为 `null`，`error.kind` 等于 `"all-failed"`，且 `error.vendorId` 指明最后失败的 Vendor

### Requirement: 现有 IPC 兼容
The system MUST 保留现有 `fetchQuotes` / `fetchKline` / `fetchMarket` / `fetchFunds` IPC 的调用语义和返回结构；不得在没有兼容层的情况下删除或重命名。

#### Scenario: 旧调用方式仍可工作
- **WHEN** renderer 按现有参数与返回结构调用上述 IPC
- **THEN** 系统返回与未启用 Engine 之前语义一致的结果

#### Scenario: 新 IPC 不可用时的回退
- **WHEN** 用户通过 `feature flag: marketDataEngine` 关闭新 Engine
- **THEN** IPC 直接走旧的实现路径且不修改返回结构

### Requirement: 安全与合规边界
The system MUST NOT 绕过 TLS 验证（`rejectUnauthorized: false` / `verify: false`），不得把第三方内部接口视为具备长期商业授权，并必须在实现注释或文档中标注每个 Vendor 的字段校准与已知限制。

#### Scenario: TLS 验证不被绕过
- **WHEN** 实现新 Vendor Adapter
- **THEN** 代码中不出现 `rejectUnauthorized: false` 或等价绕过 TLS 的设置
