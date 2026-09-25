export type Locale = "en" | "zh-CN" | "ko";

export type RuntimeGroup = "shared-adapter-host" | "isolated-worker" | "wasm-module";

export type CapabilityName =
  | "config"
  | "secrets"
  | "db"
  | "storage"
  | "media"
  | "media-source"
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
  /** Read-only effective grants for this installation. Older brokers may omit it. */
  grantedCapabilities?: readonly CapabilityName[];
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

export interface PluginDataMigration {
  version: number;
  name: string;
  appliedAt: string;
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
  /** Lists records in key order; prefix is matched literally, not as a SQL pattern. */
  list<T>(collection: string, options?: { prefix?: string; limit?: number }): Promise<readonly DataRecord<T>[]>;
  migrate(input: { version: number; name: string }): Promise<PluginDataMigration>;
  migrations(): Promise<readonly PluginDataMigration[]>;
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
  offset?: number;
}

export interface HistoryPage { entries: readonly HistoryEntry[]; total: number; }

export interface HistoryService {
  record(input: Omit<HistoryEntry, "id" | "visitedAt" | "pluginId" | "sourceDevice"> & { sourceDevice?: DisplayContext["deviceClass"] }): Promise<HistoryEntry>;
  query(options?: HistoryQuery): Promise<readonly HistoryEntry[]>;
  queryPage(options?: HistoryQuery): Promise<HistoryPage>;
  clear(options?: Pick<HistoryQuery, "pluginId" | "category">): Promise<number>;
}

export interface CatalogEntry {
  id: string;
  pluginId: string;
  subjectType: string;
  subjectId: string;
  title: string;
  description?: string;
  category: string;
  route: string;
  updatedAt: string;
  metadataDigest?: string;
}

export interface CatalogQuery {
  keyword?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface CatalogService {
  register(input: Omit<CatalogEntry, "id" | "pluginId" | "updatedAt"> & { id?: string }): Promise<CatalogEntry>;
  query(options?: CatalogQuery): Promise<readonly CatalogEntry[]>;
  remove(id: string): Promise<boolean>;
}

export type DisplayMode = "normal" | "fullscreen";

export interface DisplayModeResult {
  mode: DisplayMode;
  accepted: boolean;
  reason?: "unsupported" | "user-action-required";
}

export interface DisplayService {
  capabilities(): DisplayContext;
  requestMode(mode: DisplayMode): Promise<DisplayModeResult>;
}

export interface PlaybackSession {
  sessionId: string;
  mediaId: string;
  expiresAt: string;
}

export type MediaPlaybackMode = "direct-range" | "remux" | "transcode";

export interface MediaProbe {
  mediaId: string;
  contentType: string;
  size: number;
  updatedAt: string;
  container?: string;
  durationMs?: number;
  seekable: boolean;
  availableModes: readonly MediaPlaybackMode[];
  recommendedMode: MediaPlaybackMode;
}

export interface MediaTransformRequest {
  mode: "remux" | "transcode";
  container?: "mp4" | "fmp4" | "ts";
  videoCodec?: "copy" | "h264" | "h265";
  audioCodec?: "copy" | "aac" | "opus";
}
export interface MediaTransformOutputRead { data: string; completed: boolean; contentType: string; size: number; }
export interface MediaHlsRequest { segmentDurationSeconds?: 2 | 4 | 6; }
export interface MediaHlsAssetRead { data: string; completed: boolean; contentType: string; size: number; }

export interface MediaService {
  createPlayback(mediaId: string): Promise<PlaybackSession>;
  probe(mediaId: string): Promise<MediaProbe>;
  requestTransform(mediaId: string, request: MediaTransformRequest): Promise<PluginJob>;
  readOutput(outputId: string, start: number, end: number): Promise<MediaTransformOutputRead>;
  requestHls(mediaId: string, request?: MediaHlsRequest): Promise<PluginJob>;
  readHlsAsset(sessionId: string, asset: string, start: number, end: number): Promise<MediaHlsAssetRead>;
}

/** Opaque, Core-owned reference to a configured read-only media source. */
export interface MediaSourceHandle {
  sourceHandle: string;
}

export type MediaSourceItemKind = "directory" | "file";

export interface MediaSourceItem {
  itemHandle: string;
  name: string;
  kind: MediaSourceItemKind;
  size?: number;
  contentType?: string;
  updatedAt?: string;
}

export interface MediaSourceListRequest {
  sourceHandle: string;
  parentHandle?: string;
  limit?: number;
  cursor?: string;
}

export interface MediaSourceListResult {
  items: readonly MediaSourceItem[];
  nextCursor?: string;
}

export interface MediaSourceStat {
  sourceHandle: string;
  itemHandle: string;
  item: MediaSourceItem;
}

export interface MediaSourceProbe {
  sourceHandle: string;
  itemHandle: string;
  contentType: string;
  size: number;
  seekable: boolean;
  availableModes: readonly MediaPlaybackMode[];
  recommendedMode: MediaPlaybackMode;
}

export interface MediaSourcePlaybackSession {
  sessionId: string;
  sourceHandle: string;
  itemHandle: string;
  expiresAt: string;
}

export interface MediaSourceReadRequest {
  sessionId: string;
  start: number;
  end: number;
}

export interface MediaSourceReadResult {
  data: string;
  contentType: string;
  size: number;
  completed: boolean;
}

/** Read-only media-source API. Implementations resolve credentials inside Core. */
export interface MediaSourceService {
  list(input: MediaSourceListRequest): Promise<MediaSourceListResult>;
  stat(sourceHandle: string, itemHandle: string): Promise<MediaSourceStat>;
  probe(sourceHandle: string, itemHandle: string): Promise<MediaSourceProbe>;
  createPlayback(sourceHandle: string, itemHandle: string): Promise<MediaSourcePlaybackSession>;
  read(input: MediaSourceReadRequest): Promise<MediaSourceReadResult>;
}

export interface NetworkRequest {
  binding: string;
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "PROPFIND";
  path: string;
  headers?: Record<string, string>;
  body?: string;
  /** Opaque Core-owned credential reference. The secret value never crosses the plugin boundary. */
  credentialRef?: string;
}

export interface NetworkResponse {
  status: number;
  headers: Record<string, string>;
  bodyBase64?: string;
}

export interface NetworkService { request(input: NetworkRequest): Promise<NetworkResponse>; }

export type BrowserSessionStatus = "active" | "expired" | "revoked";

export interface BrowserSession {
  id: string;
  name: string;
  purpose: string;
  status: BrowserSessionStatus;
  expiresAt: string;
}

export interface BrowserSessionRequest {
  name: string;
  purpose: string;
  expiresInSeconds?: number;
}

export type BrowserTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type BrowserTaskKind = "navigate-and-capture" | "extract-media-reference" | "export-authorized-state";

/** Core-owned, bounded task output. It never contains cookies, profiles, host paths or raw upstream URLs. */
export interface BrowserTaskResult {
  kind: BrowserTaskKind;
  reference?: string;
  fields?: Readonly<Record<string, string | number | boolean>>;
  expiresAt: string;
}

export interface BrowserTask {
  id: string;
  sessionId: string;
  kind: BrowserTaskKind;
  status: BrowserTaskStatus;
  input: { target?: string; label?: string };
  result?: BrowserTaskResult;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserTaskRequest {
  sessionId: string;
  kind: BrowserTaskKind;
  input?: { target?: string; label?: string };
}

/** Opaque, scoped browser authorization; never exposes Profile, Cookie, CDP, or host process data. */
export interface BrowserService {
  request(input: BrowserSessionRequest): Promise<BrowserSession>;
  list(): Promise<readonly BrowserSession[]>;
  revoke(id: string): Promise<boolean>;
  enqueue(input: BrowserTaskRequest): Promise<BrowserTask>;
  tasks(): Promise<readonly BrowserTask[]>;
  cancelTask(id: string): Promise<BrowserTask | undefined>;
}

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  pluginId: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  createdAt: string;
  readAt?: string;
}

export interface NotificationService {
  publish(input: { severity: NotificationSeverity; title: string; body?: string }): Promise<Notification>;
  list(options?: { limit?: number; unreadOnly?: boolean }): Promise<readonly Notification[]>;
  markRead(id: string): Promise<boolean>;
  markAllRead(): Promise<number>;
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
  catalog(): CatalogService;
  display(): DisplayService;
  media(): MediaService;
  mediaSources(): MediaSourceService;
  network(): NetworkService;
  browser(): BrowserService;
  notifications(): NotificationService;
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
  methods: readonly ("GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "PROPFIND")[];
}

export type CoreComponentRole = "storage-service" | "webdav" | "media-processing" | "archive" | "network-egress" | "browser-engine";

export interface PluginComponentDependency {
  id: string;
  roles?: readonly CoreComponentRole[];
  optional?: boolean;
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
  /** Optional names of Core-global service bindings this plugin is allowed to use. */
  serviceBindings?: readonly string[];
  /** Declarative requirements resolved by Core; this never exposes component executables to plugins. */
  components?: readonly PluginComponentDependency[];
  routes: readonly PluginRoute[];
  /** Relative package entry for an isolated Worker. Core resolves this only from a verified package. */
  worker?: { entry: string; protocol: "0.1" };
  /** Package-relative adapter/module entry selected by the declared runtime. */
  runtimeEntry?: { entry: string; protocol: "0.1" };
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
