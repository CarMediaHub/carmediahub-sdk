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
  routes: [{ path: "/", methods: ["GET"] }]
};

test("validates a complete public manifest", () => {
  assert.doesNotThrow(() => validateManifest(manifest));
});

test("rejects missing translations and unknown capabilities", () => {
  const invalid = { ...manifest, name: { en: "Media" }, capabilities: ["shell"] };
  assert.throws(() => validateManifest(invalid), ManifestValidationError);
});
