import assert from "node:assert/strict";
import test from "node:test";
import { ManifestValidationError, validateManifest } from "./manifest.js";
import type { PluginManifest } from "./types.js";

const manifest: PluginManifest = {
  id: "wdr-media",
  version: "0.1.0",
  sdk: "^0.1.0",
  name: { en: "Media", "zh-CN": "媒体", ko: "미디어" },
  description: { en: "Media plugin", "zh-CN": "媒体插件", ko: "미디어 플러그인" },
  category: "official",
  runtime: "isolated-worker",
  capabilities: ["storage", "media", "events"],
  routes: [{ path: "/", methods: ["GET"] }],
  worker: { entry: "./worker.js", protocol: "0.1" }
};

test("validates a complete public manifest", () => {
  assert.doesNotThrow(() => validateManifest(manifest));
});

test("rejects missing translations and unknown capabilities", () => {
  const invalid = { ...manifest, name: { en: "Media" }, capabilities: ["shell"] };
  assert.throws(() => validateManifest(invalid), ManifestValidationError);
});

test("requires a safe explicit entry for isolated workers", () => {
  assert.throws(() => validateManifest({ ...manifest, worker: { entry: "../worker.js", protocol: "0.1" } }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, worker: undefined }), ManifestValidationError);
});

test("requires a safe runtime entry for shared adapters", () => {
  const shared: PluginManifest = { ...manifest, runtime: "shared-adapter-host", worker: undefined, runtimeEntry: { entry: "./src/worker.ts", protocol: "0.1" } };
  assert.doesNotThrow(() => validateManifest(shared));
  assert.throws(() => validateManifest({ ...shared, runtimeEntry: undefined }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...shared, runtimeEntry: { entry: "../worker.ts", protocol: "0.1" } }), ManifestValidationError);
});
