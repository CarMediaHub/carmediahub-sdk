import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ManifestValidationError, SDK_CONTRACT_VERSION, isSdkRangeCompatible, validateManifest } from "./manifest.js";
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
  assert.doesNotThrow(() => validateManifest({ ...manifest, capabilities: ["network", "secrets"] }));
});

test("validates the supported SDK range syntax and compatibility", () => {
  assert.equal(SDK_CONTRACT_VERSION, "0.1.0");
  assert.equal(isSdkRangeCompatible("^0.1.0"), true);
  assert.equal(isSdkRangeCompatible("~0.1.0"), true);
  assert.equal(isSdkRangeCompatible("^0.2.0"), false);
  assert.equal(isSdkRangeCompatible("latest"), false);
  assert.throws(() => validateManifest({ ...manifest, sdk: "latest" }), ManifestValidationError);
});

test("published JSON Schema describes the current TypeScript manifest contract", () => {
  const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../spec/v0/manifest.schema.json"), "utf8")) as {
    required: string[];
    properties: Record<string, unknown>;
  };
  assert.deepEqual(schema.required, ["id", "version", "sdk", "name", "description", "category", "runtime", "capabilities", "routes"]);
  for (const field of ["name", "description", "category", "runtime", "capabilities", "serviceBindings", "components", "routes", "worker", "runtimeEntry", "ui"]) assert.ok(field in schema.properties, `schema is missing current field: ${field}`);
  for (const obsolete of ["publisher", "resources", "dataLifecycle"]) assert.equal(obsolete in schema.properties, false, `schema still exposes obsolete field: ${obsolete}`);
});

test("validates optional global service binding declarations", () => {
  assert.doesNotThrow(() => validateManifest({ ...manifest, capabilities: ["network"], serviceBindings: ["alist-web", "mihomo-web"] }));
  assert.throws(() => validateManifest({ ...manifest, serviceBindings: ["../secret"] }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, serviceBindings: ["alist-web", "alist-web"] }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, capabilities: ["gateway"], serviceBindings: ["alist-web"] }), ManifestValidationError);
});

test("validates declarative Core component dependencies without granting raw component access", () => {
  assert.doesNotThrow(() => validateManifest({ ...manifest, components: [{ id: "ffmpeg", roles: ["media-processing"] }, { id: "rclone", optional: true }] }));
  assert.throws(() => validateManifest({ ...manifest, components: [{ id: "ffmpeg", roles: ["unknown"] }] }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, components: [{ id: "ffmpeg" }, { id: "ffmpeg" }] }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, components: [{ id: "ffmpeg", optional: "yes" }] }), ManifestValidationError);
});

test("rejects missing translations and unknown capabilities", () => {
  const invalid = { ...manifest, name: { en: "Media" }, capabilities: ["shell"] };
  assert.throws(() => validateManifest(invalid), ManifestValidationError);
});

test("rejects malformed category, duplicate capabilities, routes, and UI metadata", () => {
  assert.throws(() => validateManifest({ ...manifest, category: "unknown" }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, capabilities: ["events", "events"] }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, routes: [{ path: "/", methods: ["TRACE"] }] }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, ui: { entry: "../index.html", vehicleSupported: true } }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, worker: { entry: "./worker.js", protocol: "0.2" } }), ManifestValidationError);
});

test("requires a safe explicit entry for isolated workers", () => {
  assert.throws(() => validateManifest({ ...manifest, worker: { entry: "../worker.js", protocol: "0.1" } }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...manifest, worker: undefined }), ManifestValidationError);
});

test("requires a safe runtime entry for shared adapters", () => {
  const shared: PluginManifest = { ...manifest, category: "core-companion", capabilities: ["gateway", "events"], runtime: "shared-adapter-host", worker: undefined, runtimeEntry: { entry: "./src/worker.ts", protocol: "0.1" } };
  assert.doesNotThrow(() => validateManifest(shared));
  assert.throws(() => validateManifest({ ...shared, runtimeEntry: undefined }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...shared, runtimeEntry: { entry: "../worker.ts", protocol: "0.1" } }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...shared, capabilities: ["gateway", "network"] }), ManifestValidationError);
  assert.throws(() => validateManifest({ ...shared, category: "adapter" }), ManifestValidationError);
});
