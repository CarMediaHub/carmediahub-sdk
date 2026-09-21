export type Locale = "en" | "zh-CN" | "ko";

export type RuntimeGroup = "shared-adapter-host" | "isolated-worker" | "wasm-module";

export type CapabilityName =
  | "config"
  | "secrets"
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

/** Read-only identity and policy context established by the Core Broker handshake. */
export interface WorkerContext {
  scope: ScopeContext;
  locale: Locale;
  timeZone: string;
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  entry: "navigation" | "key";
  display: DisplayContext;
  policyVersion: number;
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

export interface DataRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

/**
 * A constrained logical data namespace. Implementations must bind every call
 * to the calling organization, user, and plugin installation; plugins never
 * receive a database DSN, schema name, or administrative SQL channel.
 */
export interface PluginDataStore {
  get<T>(collection: string, key: string): Promise<DataRecord<T> | undefined>;
  put<T>(collection: string, key: string, value: T): Promise<DataRecord<T>>;
  delete(collection: string, key: string): Promise<boolean>;
  list<T>(collection: string, options?: { prefix?: string; limit?: number }): Promise<readonly DataRecord<T>[]>;
}

export interface HistoryEntry {
  id: string;
  subjectType: string;
  subjectId: string;
  pluginId: string;
  route: string;
  title: string;
  category?: string;
  visitedAt: string;
  sourceDevice: DisplayContext["deviceClass"];
  metadataDigest?: string;
}

export interface HistoryQuery {
  pluginId?: string;
  category?: string;
  keyword?: string;
  limit?: number;
}

export interface HistoryService {
  record(input: Omit<HistoryEntry, "id" | "visitedAt" | "pluginId" | "sourceDevice"> & { sourceDevice?: DisplayContext["deviceClass"] }): Promise<HistoryEntry>;
  query(options?: HistoryQuery): Promise<readonly HistoryEntry[]>;
  clear(options?: Pick<HistoryQuery, "pluginId" | "category">): Promise<number>;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** A Core-owned asynchronous operation. Plugins request work but never receive an executor or command channel. */
export interface PluginJob {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  payload: unknown;
  result?: unknown;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PluginJobService {
  enqueue(type: string, payload: unknown): Promise<PluginJob>;
  list(options?: { limit?: number }): Promise<readonly PluginJob[]>;
  cancel(id: string): Promise<PluginJob | undefined>;
}

export interface PlatformRuntime {
  readonly context: PlatformContext;
  require(capability: CapabilityName): void;
  database(): PluginDataStore;
  history(): HistoryService;
  jobs(): PluginJobService;
  publish<T extends Record<string, unknown>>(type: string, payload: T): DomainEvent<T>;
}

export interface RpcScopeMeta {
  deploymentId: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  sessionId: string;
}

export interface RpcMeta {
  schemaVersion: "0.1";
  requestId: string;
  traceId: string;
  deadlineUnixMs: number;
  installationId: string;
  scope?: RpcScopeMeta;
}

export interface RpcRequest<T = unknown> {
  jsonrpc: "2.0";
  id?: string;
  method: string;
  params?: T;
  meta: RpcMeta;
}

export interface RpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: string;
  result?: T;
  error?: CmhErrorShape;
  meta: Pick<RpcMeta, "schemaVersion" | "requestId" | "traceId">;
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
  /** Relative package entry for an isolated Worker. Core resolves this only from a verified package. */
  worker?: { entry: string; protocol: "0.1" };
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
