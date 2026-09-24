# CarMediaHub SDK

CarMediaHub SDK 定义插件清单、生命周期契约、平台上下文、能力 API 和隔离数据访问规范。

语言：[English](readme.md) · 简体中文 · [한국어](readme_ko.md)

插件通过公开契约使用平台能力，不导入 Core 内部模块。

## SDK 提供的能力

- `PlatformContext`：用户、组织、插件实例、设备、语言、时区、主题、密度、入口来源和显示能力。
- `onContextChanged`：Core 更新统一偏好时，插件可以热更新界面，不需要重复实现语言或显示设置。
- `normalizeLocale`、`localeFallbacks` 和 `localize`：统一语言别名及“请求语言 -> 语言族 -> 英文”的插件文案回退。
- Capability API：数据、媒体、只读媒体源、历史、目录、显示、任务、通知、网络和事件能力均按安装实例授权。
- `mediaSources()`：通过 Core 管理的不透明 source/item handle 提供受限的目录、元数据、探测、播放会话和 Range 读取；插件不会获得 WebDAV URL、端点、宿主路径、凭据，也没有写入/删除能力。
- `WorkerClient.database()`（Core v0.1+ 提供）：通过 Broker 提供逻辑 `get`/`put`/`delete`/`list` 操作；Core 为每次调用绑定组织、用户和插件安装实例作用域。
- 同一数据 API 提供按版本和逻辑名称记录的幂等迁移台账（`migrate`/`migrations`）；不接受 SQL 或迁移代码。
- `WorkerClient` 与 Wire Protocol：插件通过 Broker 使用逻辑路由和受控请求，不监听公网端口，不接触数据库连接、宿主路径或会话 Cookie。
- Memory Runtime：用于插件契约测试，不代表生产环境的存储或媒体执行器。

## 运行边界

Manifest 是权限申请，不是任意系统调用入口。插件不能提交 Shell 命令、宿主路径、任意环境变量、数据库 DSN 或未声明的能力。Core 负责认证、作用域、授权、资源限制和错误脱敏；插件只使用 SDK 定义的逻辑 API。

## 版本和语言

v0 契约固定支持 `en`、`zh-CN` 和 `ko`。插件应继承 Core 提供的 locale、时区和显示上下文；业务文案可以由插件提供翻译，但不得另建一套平台级偏好。协议和错误目录位于 [`spec/v0`](spec/v0/readme_zh.md)。

## 草案契约

评审阶段的 v0 契约位于 [`spec/v0`](spec/v0/readme_zh.md)，用于定义清单校验和稳定错误标识，不要求已有运行中的 Core。

## 本地开发

```powershell
pnpm install
pnpm verify
```

`pnpm verify` 会依次执行类型检查、契约测试和 SDK 构建。
