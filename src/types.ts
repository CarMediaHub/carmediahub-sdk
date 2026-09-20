export type Locale = "en" | "zh-CN" | "ko";

export type RuntimeGroup = "shared-adapter-host" | "isolated-worker" | "wasm-module";

export type CapabilityName =
  | "config"
  | "db"
  | "storage"
  | "media"
  | "history"
  | "catalog"
  | "display"
  | "jobs"
  | "events"
  | "diagnostics"
  | "gateway"
  | "network"
  | "browser"
  | "transfer";

export interface ScopeContext {
  deploymentId: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  sessionId: string;
  installationId: string;
}

export interface DisplayContext {
  deviceClass: "desktop" | "mobile" | "vehicle" | "unknown";
  input: Array<"touch" | "keyboard" | "pointer" | "remote">;
  fullscreenAvailable: boolean;
  viewport: { width: number; height: number };
}

export interface PlatformContext {
  scope: ScopeContext;
  locale: Locale;
  timeZone: string;
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  entry: "navigation" | "key";
  display: DisplayContext;
  grantedCapabilities: readonly CapabilityName[];
  policyVersion: number;
}

export interface PluginRoute {
  path: string;
  methods: readonly ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
}

export interface PluginManifest {
  id: string;
  version: string;
  sdk: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  category: "core-companion" | "official" | "adapter" | "browser-bridge" | "community";
  runtime: RuntimeGroup;
  capabilities: readonly CapabilityName[];
  routes: readonly PluginRoute[];
  ui?: { entry: string; vehicleSupported: boolean };
}

export interface CmhErrorShape {
  code: string;
  messageKey: string;
  retryable: boolean;
  diagnosticId: string;
  details?: Record<string, string | number | boolean>;
}

export interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  occurredAt: string;
  scope: Pick<ScopeContext, "deploymentId" | "organizationId" | "userId" | "installationId">;
  producer: string;
  schemaVersion: 1;
  type: string;
  payload: T;
}
