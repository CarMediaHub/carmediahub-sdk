# SDK v0 草案契约

本目录存放 CarMediaHub SDK 的评审阶段公开契约。

- `manifest.schema.json` 是当前 TypeScript `PluginManifest` 校验器的机器可读版本；包工具应同时使用该 Schema 和 SDK 运行时校验器。
- `errors.json` 定义建议用于 v0 的稳定错误码目录。
- `jobs` 能力限制在当前用户和插件安装实例作用域内。初始限制为每个作用域 10 个活跃任务，JSON payload 和结果各限制 64 KiB。队列或大小超限使用稳定目录项 `CMH.JOBS.QUEUE_FULL`、`CMH.JOBS.PAYLOAD_TOO_LARGE` 和 `CMH.JOBS.RESULT_TOO_LARGE`；异常中断和处理器失败分别使用 `CMH.JOBS.INTERRUPTED` 与 `CMH.JOBS.EXECUTION_FAILED`。
- `history` 能力提供受作用域限制的 `record`、`query` 和 `clear` 操作。插件提交主题对象及显示元数据；Core 负责用户隔离、保留期限、筛选和删除。
- `catalog` 能力提供受作用域限制的 `register`、`query` 和 `remove`，用于可搜索的插件目录项。Core 负责索引和授权边界；插件只能提交元数据，不能执行 SQL 或查询其他作用域。
- `display` 能力提供只读显示能力以及 `requestMode` 意图。Core 报告是否支持全屏并可以拒绝请求；插件不会获得窗口或浏览器控制权。
- `secrets` 能力记录在部署中的插件安装实例上，只允许插件提交 Core 发放的不透明 `credentialRef`。Cookie 或 Authorization 明文由 Core 保管并在受控服务绑定的最后一跳注入；每次使用时引用都会绑定到当前组织、用户和安装实例作用域，撤销后立即失效，插件不能读取或覆盖明文。
- `locales.json` 定义 v0 的语言传播、别名、回退和消息键规则。

这些内容是草案材料，用于定义公开边界，不包含 Core 内部实现、宿主路径、凭据、网络拓扑或私有集成信息。
