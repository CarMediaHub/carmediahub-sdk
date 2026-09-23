import type { CapabilityName, Locale, PluginManifest, PluginRoute, RuntimeGroup } from "./types.js";

const manifestId = /^[a-z][a-z0-9-]{2,63}$/;
const routePath = /^\/[a-zA-Z0-9/_-]*$/;
const workerEntry = /^\.\/[a-zA-Z0-9_./-]+$/;
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const knownCapabilities = new Set<CapabilityName>([
  "config", "db", "storage", "media", "history", "catalog", "display", "jobs", "events",
  "diagnostics", "gateway", "network", "browser", "transfer"
]);
const knownRuntimes = new Set<RuntimeGroup>(["shared-adapter-host", "isolated-worker", "wasm-module"]);
const sharedAdapterCapabilities = new Set<CapabilityName>(["config", "display", "diagnostics", "events", "gateway"]);
const bindingName = /^[a-z][a-z0-9-]{1,63}$/;
const locales: readonly Locale[] = ["en", "zh-CN", "ko"];

export class ManifestValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid plugin manifest: ${issues.join("; ")}`);
    this.name = "ManifestValidationError";
  }
}

function validLocalized(value: unknown): value is Record<Locale, string> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return locales.every((locale) => typeof candidate[locale] === "string" && candidate[locale].trim().length > 0);
}

function validRoute(route: PluginRoute): boolean {
  return routePath.test(route.path) && route.methods.length > 0 && new Set(route.methods).size === route.methods.length;
}

export function validateManifest(value: unknown): asserts value is PluginManifest {
  const issues: string[] = [];
  if (typeof value !== "object" || value === null) throw new ManifestValidationError(["manifest must be an object"]);
  const manifest = value as Partial<PluginManifest>;
  if (typeof manifest.id !== "string" || !manifestId.test(manifest.id)) issues.push("id must be a lowercase package identifier");
  if (typeof manifest.version !== "string" || !semver.test(manifest.version)) issues.push("version must be semver");
  if (typeof manifest.sdk !== "string" || manifest.sdk.length === 0) issues.push("sdk is required");
  if (!validLocalized(manifest.name)) issues.push("name must include en, zh-CN, and ko");
  if (!validLocalized(manifest.description)) issues.push("description must include en, zh-CN, and ko");
  if (!knownRuntimes.has(manifest.runtime as RuntimeGroup)) issues.push("runtime is not supported");
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.some((capability) => !knownCapabilities.has(capability))) issues.push("capabilities contains an unknown value");
  if (manifest.serviceBindings !== undefined && (!Array.isArray(manifest.serviceBindings) || new Set(manifest.serviceBindings).size !== manifest.serviceBindings.length || manifest.serviceBindings.some((name) => typeof name !== "string" || !bindingName.test(name)))) issues.push("serviceBindings contains an invalid name");
  if (!Array.isArray(manifest.routes) || manifest.routes.some((route) => !validRoute(route))) issues.push("routes contains an invalid route");
  if (manifest.worker !== undefined && (!workerEntry.test(manifest.worker.entry) || manifest.worker.entry.includes("..") || manifest.worker.protocol !== "0.1")) issues.push("worker entry or protocol is invalid");
  if (manifest.runtimeEntry !== undefined && (!workerEntry.test(manifest.runtimeEntry.entry) || manifest.runtimeEntry.entry.includes("..") || manifest.runtimeEntry.protocol !== "0.1")) issues.push("runtime entry or protocol is invalid");
  if (manifest.runtime === "isolated-worker" && manifest.worker === undefined) issues.push("isolated-worker requires a worker entry");
  if (manifest.runtime === "shared-adapter-host" && manifest.runtimeEntry === undefined) issues.push("shared-adapter-host requires a runtime entry");
  if (manifest.runtime === "shared-adapter-host" && manifest.category !== "core-companion") issues.push("shared-adapter-host is restricted to core-companion category");
  if (manifest.runtime === "shared-adapter-host" && Array.isArray(manifest.capabilities) && manifest.capabilities.some((capability) => !sharedAdapterCapabilities.has(capability))) issues.push("shared-adapter-host requests a high-risk capability");
  if (manifest.runtime === "wasm-module" && manifest.runtimeEntry === undefined) issues.push("wasm-module requires a runtime entry");
  if (issues.length > 0) throw new ManifestValidationError(issues);
}
