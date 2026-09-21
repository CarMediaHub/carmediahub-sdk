# SDK v0 草案契约

本目录存放 CarMediaHub SDK 的评审阶段公开契约。

- `manifest.schema.json` 定义 v0 插件包清单结构。
- `errors.json` 定义建议用于 v0 的稳定错误码目录。
- `jobs` 能力限制在当前用户和插件安装实例作用域内。初始限制为每个作用域 10 个活跃任务，JSON payload 和结果各限制 64 KiB。队列或大小超限使用稳定目录项 `CMH.JOBS.QUEUE_FULL`、`CMH.JOBS.PAYLOAD_TOO_LARGE` 和 `CMH.JOBS.RESULT_TOO_LARGE`。
- `locales.json` 定义 v0 的语言传播、别名、回退和消息键规则。

这些内容是草案材料，用于定义公开边界，不包含 Core 内部实现、宿主路径、凭据、网络拓扑或私有集成信息。
