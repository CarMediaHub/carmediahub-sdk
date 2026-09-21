# SDK v0 Draft Contracts

This directory contains review-stage public contracts for the CarMediaHub SDK.

- `manifest.schema.json` defines the v0 plugin package manifest shape.
- `errors.json` defines the stable error catalog proposed for v0.
- The `jobs` capability is scoped to the current user and plugin installation. The initial limit is 10 active jobs per scope, with 64 KiB limits for JSON payloads and results. Size and queue failures use the stable entries `CMH.JOBS.QUEUE_FULL`, `CMH.JOBS.PAYLOAD_TOO_LARGE`, and `CMH.JOBS.RESULT_TOO_LARGE`.
- The `history` capability provides scoped `record`, `query`, and `clear` operations. Plugins submit a subject and display metadata; Core owns user isolation, retention, filtering, and deletion.
- `locales.json` defines locale propagation, aliases, fallback, and message-key rules for v0.

The contracts are draft material. They define public boundaries without exposing Core internals, host paths, credentials, network topology, or private integrations.
