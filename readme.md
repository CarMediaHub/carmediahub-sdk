# CarMediaHub SDK

The CarMediaHub SDK defines plugin manifests, lifecycle contracts, platform context, capability APIs and isolated data access.

Language: English · [简体中文](readme_zh.md) · [한국어](readme_ko.md)

Plugins use these public contracts without importing Core internals.

## Included capabilities

- `PlatformContext`: user, organization, plugin installation, device, locale, time zone, theme, density, entry source, and display context.
- `onContextChanged`: plugins can update their UI when Core preferences change without implementing a second language or display settings system.
- `normalizeLocale`, `localeFallbacks` and `localize`: shared locale aliases and requested-locale/language/English fallback for plugin text.
- Capability APIs for scoped data, media, read-only media sources, history, catalog, display, jobs, notifications, network, and events.
- `mediaSources()`: bounded `list`/`stat`/`probe`/`createPlayback`/`read` operations using Core-owned opaque source and item handles. Plugins never receive WebDAV URLs, endpoints, host paths, credentials, or write/delete operations.
- `WorkerClient.database()` (provided by Core v0.1+): logical `get`/`put`/`delete`/`list` operations through the Broker; Core binds every call to the organization, user, and plugin installation scope.
- The same data API exposes an idempotent migration ledger (`migrate`/`migrations`) by version and logical name; it never accepts SQL or migration code.
- `WorkerClient` and the Wire Protocol: plugins use logical routes through the Broker without public listeners or access to database connections, host paths, or session cookies.
- `Memory Runtime` for contract tests. It is not a production storage or media executor.

## Runtime boundary

A Manifest requests capabilities; it is not a general system-call interface. Plugins cannot submit shell commands, host paths, arbitrary environment variables, database DSNs, or undeclared capabilities. Core owns authentication, scope, authorization, resource limits, and error redaction; plugins use only SDK-defined logical APIs.

## Version and locales

The v0 contract supports `en`, `zh-CN`, and `ko`. Plugins inherit the locale, time zone, and display context supplied by Core. A plugin may provide business translations, but must not create a second platform-wide preference system. Protocol and error specifications are in [`spec/v0`](spec/v0/readme.md).

## Development

```powershell
pnpm install
pnpm verify
```

`pnpm verify` runs the type check, contract tests, and package build.

The package currently provides strict TypeScript types for manifests, scope/context, capabilities, errors and events, plus a memory runtime for contract tests.

## Draft contracts

Review-stage v0 contracts are available in [`spec/v0`](spec/v0/readme.md). They define manifest validation and stable error identifiers without requiring a running Core.
