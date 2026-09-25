import type { CapabilityName, CoreComponentRole, Locale, PluginComponentDependency, PluginManifest, PluginRoute, RuntimeGroup } from "./types.js";

const manifestId = /^[a-z][a-z0-9-]{2,63}$/;
const routePath = /^\/[a-zA-Z0-9/_-]*$/;
const workerEntry = /^\.\/[a-zA-Z0-9_./-]+$/;
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const knownCapabilities = new Set<CapabilityName>([
  "config", "secrets", "db", "storage", "media", "media-source", "history", "catalog", "display", "jobs", "events",
  "diagnostics", "gateway", "network", "browser", "transfer"
]);
const knownRuntimes = new Set<RuntimeGroup>(["shared-adapter-host", "isolated-worker", "wasm-module"]);
const knownCategories = new Set<PluginManifest["category"]>(["core-companion", "official", "adapter", "browser-bridge", "community"]);
const sharedAdapterCapabilities = new Set<CapabilityName>(["config", "display", "diagnostics", "events", "gateway"]);
const bindingName = /^[a-z][a-z0-9-]{1,63}$/;
const componentId = /^[a-z][a-z0-9-]{1,63}$/;
const componentRoles = new Set<CoreComponentRole>(["storage-service", "webdav", "media-processing", "archive", "network-egress", "browser-engine"]);
const locales: readonly Locale[] = ["en", "zh-CN", "ko"];
const methods = new Set<PluginRoute["methods"][number]>(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "PROPFIND"]);

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

function validRoute(route: unknown): route is PluginRoute {
  if (typeof route !== "object" || route === null) return false;
  const candidate = route as Partial<PluginRoute>;
  return typeof candidate.path === "string" && routePath.test(candidate.path) && Array.isArray(candidate.methods) && candidate.methods.length > 0 && new Set(candidate.methods).size === candidate.methods.length && candidate.methods.every((method) => methods.has(method));
}

function validEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as { entry?: unknown; protocol?: unknown };
  return typeof entry.entry === "string" && workerEntry.test(entry.entry) && !entry.entry.includes("..") && entry.protocol === "0.1";
}

function validUi(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const ui = value as { entry?: unknown; vehicleSupported?: unknown };
  return typeof ui.entry === "string" && workerEntry.test(ui.entry) && !ui.entry.includes("..") && typeof ui.vehicleSupported === "boolean";
}

function validComponentDependency(value: unknown): value is PluginComponentDependency {
  if (typeof value !== "object" || value === null) return false;
  const dependency = value as Partial<PluginComponentDependency>;
  return typeof dependency.id === "string" && componentId.test(dependency.id)
    && (dependency.optional === undefined || typeof dependency.optional === "boolean")
    && (dependency.roles === undefined || (Array.isArray(dependency.roles) && dependency.roles.length > 0 && new Set(dependency.roles).size === dependency.roles.length && dependency.roles.every((role) => componentRoles.has(role))));
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
  if (!knownCategories.has(manifest.category as PluginManifest["category"])) issues.push("category is not supported");
  if (!knownRuntimes.has(manifest.runtime as RuntimeGroup)) issues.push("runtime is not supported");
  if (!Array.isArray(manifest.capabilities) || new Set(manifest.capabilities).size !== manifest.capabilities.length || manifest.capabilities.some((capability) => !knownCapabilities.has(capability))) issues.push("capabilities contains an unknown or duplicate value");
  if (manifest.serviceBindings !== undefined && (!Array.isArray(manifest.serviceBindings) || new Set(manifest.serviceBindings).size !== manifest.serviceBindings.length || manifest.serviceBindings.some((name) => typeof name !== "string" || !bindingName.test(name)))) issues.push("serviceBindings contains an invalid name");
  if (manifest.components !== undefined && (!Array.isArray(manifest.components) || new Set(manifest.components.map((dependency) => typeof dependency === "object" && dependency !== null ? (dependency as { id?: unknown }).id : undefined)).size !== manifest.components.length || manifest.components.some((dependency) => !validComponentDependency(dependency)))) issues.push("components contains an invalid or duplicate dependency");
  if (Array.isArray(manifest.serviceBindings) && manifest.serviceBindings.length > 0 && (!Array.isArray(manifest.capabilities) || !manifest.capabilities.includes("network"))) issues.push("serviceBindings requires the network capability");
  if (!Array.isArray(manifest.routes) || manifest.routes.some((route) => !validRoute(route))) issues.push("routes contains an invalid route");
  if (manifest.worker !== undefined && !validEntry(manifest.worker)) issues.push("worker entry or protocol is invalid");
  if (manifest.runtimeEntry !== undefined && !validEntry(manifest.runtimeEntry)) issues.push("runtime entry or protocol is invalid");
  if (manifest.ui !== undefined && !validUi(manifest.ui)) issues.push("ui entry or vehicle support flag is invalid");
  if (manifest.runtime === "isolated-worker" && manifest.worker === undefined) issues.push("isolated-worker requires a worker entry");
  if (manifest.runtime === "shared-adapter-host" && manifest.runtimeEntry === undefined) issues.push("shared-adapter-host requires a runtime entry");
  if (manifest.runtime === "shared-adapter-host" && manifest.category !== "core-companion") issues.push("shared-adapter-host is restricted to core-companion category");
  if (manifest.runtime === "shared-adapter-host" && Array.isArray(manifest.capabilities) && manifest.capabilities.some((capability) => !sharedAdapterCapabilities.has(capability))) issues.push("shared-adapter-host requests a high-risk capability");
  if (manifest.runtime === "wasm-module" && manifest.runtimeEntry === undefined) issues.push("wasm-module requires a runtime entry");
  if (issues.length > 0) throw new ManifestValidationError(issues);
}
