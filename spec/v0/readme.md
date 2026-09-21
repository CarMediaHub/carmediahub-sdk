# SDK v0 Draft Contracts

This directory contains review-stage public contracts for the CarMediaHub SDK.

- `manifest.schema.json` defines the v0 plugin package manifest shape.
- `errors.json` defines the stable error catalog proposed for v0.
- The `jobs` capability is scoped to the current user and plugin installation. The initial limit is 10 active jobs per scope, with 64 KiB limits for JSON payloads and results. Size and queue failures use the stable entries `CMH.JOBS.QUEUE_FULL`, `CMH.JOBS.PAYLOAD_TOO_LARGE`, and `CMH.JOBS.RESULT_TOO_LARGE`.
- The `history` capability provides scoped `record`, `query`, and `clear` operations. Plugins submit a subject and display metadata; Core owns user isolation, retention, filtering, and deletion.
- The `catalog` capability provides scoped `register`, `query`, and `remove` operations for searchable plugin entries. Core owns the index and authorization boundary; plugins submit metadata but cannot issue SQL or query another scope.
- The `display` capability provides read-only display capabilities and a `requestMode` intent. Core reports whether fullscreen is supported and may reject it; the plugin never receives window or browser control.
- `locales.json` defines locale propagation, aliases, fallback, and message-key rules for v0.

The contracts are draft material. They define public boundaries without exposing Core internals, host paths, credentials, network topology, or private integrations.
