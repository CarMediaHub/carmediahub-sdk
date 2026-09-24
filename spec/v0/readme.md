# SDK v0 Draft Contracts

This directory contains review-stage public contracts for the CarMediaHub SDK.

- `manifest.schema.json` is the machine-readable form of the current TypeScript `PluginManifest` validator; package tooling should validate against both this schema and the SDK runtime validator.
- `errors.json` defines the stable error catalog proposed for v0.
- The `jobs` capability is scoped to the current user and plugin installation. The initial limit is 10 active jobs per scope, with 64 KiB limits for JSON payloads and results. Size and queue failures use the stable entries `CMH.JOBS.QUEUE_FULL`, `CMH.JOBS.PAYLOAD_TOO_LARGE`, and `CMH.JOBS.RESULT_TOO_LARGE`; interrupted work and handler failures use `CMH.JOBS.INTERRUPTED` and `CMH.JOBS.EXECUTION_FAILED`.
- The `history` capability provides scoped `record`, `query`, and `clear` operations. Plugins submit a subject and display metadata; Core owns user isolation, retention, filtering, and deletion.
- The `catalog` capability provides scoped `register`, `query`, and `remove` operations for searchable plugin entries. Core owns the index and authorization boundary; plugins submit metadata but cannot issue SQL or query another scope.
- The `display` capability provides read-only display capabilities and a `requestMode` intent. Core reports whether fullscreen is supported and may reject it; the plugin never receives window or browser control.
- The `secrets` capability only permits a plugin to submit an opaque `credentialRef` issued by Core. Core stores Cookie or Authorization plaintext and injects it only at the final hop of a controlled service binding; the reference is scoped to the organization, user, and installation, expires immediately on revocation, and never lets the plugin read or override plaintext.
- `locales.json` defines locale propagation, aliases, fallback, and message-key rules for v0.

The contracts are draft material. They define public boundaries without exposing Core internals, host paths, credentials, network topology, or private integrations.
