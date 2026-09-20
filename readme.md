# CarMediaHub SDK

The CarMediaHub SDK defines plugin manifests, lifecycle contracts, platform context, capability APIs and isolated data access.

Language: English · [简体中文](readme_zh.md) · [한국어](readme_ko.md)

Plugins use these public contracts without importing Core internals.

## Development

```powershell
pnpm install
pnpm test
pnpm build
```

The package currently provides strict TypeScript types for manifests, scope/context, capabilities, errors and events, plus a memory runtime for contract tests.

## Draft contracts

Review-stage v0 contracts are available in [`spec/v0`](spec/v0/readme.md). They define manifest validation and stable error identifiers without requiring a running Core.
