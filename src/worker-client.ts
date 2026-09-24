import net from "node:net";
import crypto from "node:crypto";
import { encodeFrame, FrameDecoder } from "./wire.js";
import { CmhError } from "./error.js";
import type { BrowserService, BrowserSession, BrowserSessionRequest, BrowserTask, BrowserTaskRequest, CapabilityName, CatalogEntry, CatalogQuery, CatalogService, DataRecord, DisplayMode, DisplayService, HistoryEntry, HistoryQuery, HistoryService, MediaHlsRequest, MediaProbe, MediaService, MediaSourceListRequest, MediaSourceListResult, MediaSourceProbe, MediaSourceReadRequest, MediaSourceReadResult, MediaSourceService, MediaSourceStat, MediaSourcePlaybackSession, MediaTransformRequest, NetworkRequest, NetworkResponse, NetworkService, Notification, NotificationService, PlaybackSession, PlatformContext, PluginDataMigration, PluginDataStore, PluginJob, RpcRequest, RpcResponse, WorkerContext } from "./types.js";

export interface WorkerClientOptions {
  endpoint: string;
  installationId: string;
  runtimeCredential: string;
  timeoutMs?: number;
}

export interface GatewayWorkerRequest {
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: unknown;
  stream?: boolean;
  /** Core-injected platform values. Plugins must treat them as read-only. */
  context?: Pick<PlatformContext, "locale" | "timeZone" | "theme" | "density" | "entry" | "display" | "policyVersion">;
}

export interface GatewayWorkerResponse {
  status: number;
  headers?: Record<string, string>;
  /** A synchronous body is encoded as the normal JSON-RPC result; an async body is streamed. */
  body?: unknown | AsyncIterable<Uint8Array | Buffer>;
}

export interface WorkerClient {
  readonly context: WorkerContext;
  close(): void;
  call<T>(method: string, params?: unknown): Promise<T>;
  jobs(): { enqueue(type: string, payload: unknown): Promise<PluginJob>; list(options?: { limit?: number }): Promise<readonly PluginJob[]>; cancel(id: string): Promise<PluginJob | undefined> };
  /** Present on Core v0.1+ clients; optional to keep older Worker test doubles source-compatible. */
  database?: () => PluginDataStore;
  history(): HistoryService;
  catalog(): CatalogService;
  display(): DisplayService;
  media(): MediaService;
  /** Present on Core v0.1+ clients that grant `media-source`; optional for older test doubles. */
  mediaSources?: () => MediaSourceService;
  network(): NetworkService;
  browser(): BrowserService;
  notifications(): NotificationService;
  onGatewayRequest(handler: (request: GatewayWorkerRequest, signal: AbortSignal) => Promise<GatewayWorkerResponse | unknown> | GatewayWorkerResponse | unknown): void;
  /** Subscribe to Core context updates; return the disposer when the subscriber is no longer needed. */
  onContextChanged(handler: (context: WorkerContext) => void): () => void;
}

function request(id: string, installationId: string, method: string, params?: unknown): RpcRequest {
  return { jsonrpc: "2.0", id, method, params, meta: { schemaVersion: "0.1", requestId: id, traceId: id, deadlineUnixMs: Date.now() + 30_000, installationId } };
}

/** A worker-side transport helper. It owns no listener and exposes no host capability. */
export async function connectWorkerClient(options: WorkerClientOptions): Promise<WorkerClient> {
  const socket = net.createConnection(options.endpoint);
  const decoder = new FrameDecoder();
  const timeoutMs = options.timeoutMs ?? 30_000;
  let gatewayHandler: ((request: GatewayWorkerRequest, signal: AbortSignal) => Promise<GatewayWorkerResponse | unknown> | GatewayWorkerResponse | unknown) | undefined;
  let currentContext: WorkerContext;
  const contextChangedHandlers = new Set<(context: WorkerContext) => void>();
  const activeGateway = new Map<string, AbortController>();
  const pending = new Map<string, { resolve(value: RpcResponse): void; reject(error: Error): void }>();
  const abortActiveGateway = () => { for (const controller of activeGateway.values()) controller.abort(); activeGateway.clear(); };
  const fail = (error: Error) => { for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  socket.on("error", fail);
  socket.on("close", () => { abortActiveGateway(); contextChangedHandlers.clear(); fail(new Error("Broker connection closed")); });
  socket.on("data", (chunk: Buffer) => {
    try {
      for (const message of decoder.push(chunk)) {
        if (typeof message !== "object" || message === null) continue;
        const rpc = message as RpcRequest & RpcResponse;
        if (typeof rpc.id === "string" && ("result" in rpc || "error" in rpc)) {
          const entry = pending.get(rpc.id);
          if (entry !== undefined) { pending.delete(rpc.id); entry.resolve(rpc); }
          continue;
        }
        if (rpc.method === "$/cancelRequest") {
          if (rpc.meta?.installationId !== options.installationId) continue;
          const id = (rpc.params as { id?: unknown } | undefined)?.id;
          if (typeof id === "string") activeGateway.get(id)?.abort();
          continue;
        }
        if (rpc.method === "context.changed") {
          if (rpc.meta?.installationId !== options.installationId) continue;
          const changed = (rpc.params as { context?: unknown } | undefined)?.context;
          if (isWorkerContext(changed) && currentContext !== undefined && sameScope(changed, currentContext)) {
            currentContext = changed;
            for (const handler of contextChangedHandlers) {
              try { handler(changed); } catch { /* subscriber failures must not corrupt the Broker transport */ }
            }
          }
          continue;
        }
        if (rpc.method === "gateway.request" && typeof rpc.id === "string") {
          if (rpc.meta?.installationId !== options.installationId) continue;
          const controller = new AbortController();
          activeGateway.set(rpc.id, controller);
          void Promise.resolve(gatewayHandler?.(rpc.params as GatewayWorkerRequest, controller.signal) ?? { status: 503, body: { code: "CMH.WORKER.NOT_READY" } })
            .then(async (result) => {
              const response = result as GatewayWorkerResponse;
              const body = response && typeof response === "object" ? response.body : undefined;
              if ((rpc.params as GatewayWorkerRequest).stream && body !== null && typeof body === "object" && Symbol.asyncIterator in body) {
                socket.write(encodeFrame({ jsonrpc: "2.0", method: "gateway.responseStart", params: { id: rpc.id, status: response.status, headers: response.headers }, meta: { schemaVersion: "0.1", requestId: rpc.meta.requestId, traceId: rpc.meta.traceId } }));
                let sequence = 0;
                for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
                  const bytes = Buffer.from(chunk);
                  socket.write(encodeFrame({ jsonrpc: "2.0", method: "gateway.responseChunk", params: { id: rpc.id, sequence, data: bytes.toString("base64") }, meta: { schemaVersion: "0.1", requestId: rpc.meta.requestId, traceId: rpc.meta.traceId } }));
                  sequence += 1;
                }
                if (!controller.signal.aborted) socket.write(encodeFrame({ jsonrpc: "2.0", method: "gateway.responseEnd", params: { id: rpc.id }, meta: { schemaVersion: "0.1", requestId: rpc.meta.requestId, traceId: rpc.meta.traceId } }));
                return;
              }
              if (!controller.signal.aborted) socket.write(encodeFrame({ jsonrpc: "2.0", id: rpc.id, result, meta: { schemaVersion: "0.1", requestId: rpc.meta.requestId, traceId: rpc.meta.traceId } }));
            })
            .catch(() => { if (!controller.signal.aborted && !socket.destroyed) socket.write(encodeFrame({ jsonrpc: "2.0", id: rpc.id, error: { code: "CMH.WORKER.REQUEST_FAILED", messageKey: "errors.worker.requestFailed", retryable: false, diagnosticId: "diag_worker_request" }, meta: { schemaVersion: "0.1", requestId: rpc.meta.requestId, traceId: rpc.meta.traceId } })); })
            .finally(() => activeGateway.delete(rpc.id!));
        }
      }
    } catch (error) { fail(error instanceof Error ? error : new Error("Invalid broker frame")); socket.destroy(); }
  });
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  const call = (method: string, params?: unknown) => {
    const id = `worker_${crypto.randomUUID()}`;
    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Broker handshake timed out")); }, timeoutMs);
      pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      socket.write(encodeFrame(request(id, options.installationId, method, params)));
    });
  };
  const hello = await call("broker.hello", { workerVersion: "0.1" });
  if ((hello.result as { type?: string } | undefined)?.type !== "broker.challenge") { socket.destroy(); throw new Error("Broker handshake was denied"); }
  const welcome = await call("worker.prove", { runtimeCredential: options.runtimeCredential });
  const welcomeResult = welcome.result as { type?: string; context?: unknown } | undefined;
  if (welcomeResult?.type !== "broker.welcome" || !isWorkerContext(welcomeResult.context)) { socket.destroy(); throw new Error("Broker handshake was denied"); }
  currentContext = welcomeResult.context;
  return {
    get context() { return currentContext; },
    close: () => { abortActiveGateway(); contextChangedHandlers.clear(); socket.end(); },
    call: async <T>(method: string, params?: unknown) => {
      const response = await call(method, params);
      if (response.error !== undefined) throw new CmhError(response.error);
      return response.result as T;
    },
    jobs: () => ({
      enqueue: async (type, payload) => call("jobs.enqueue", { type, payload }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as PluginJob; }),
      list: async (options = {}) => call("jobs.list", options).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { jobs: readonly PluginJob[] }).jobs; }),
      cancel: async (id) => call("jobs.cancel", { id }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { job?: PluginJob }).job; })
    }),
    database: () => ({
      get: async <T>(collection: string, key: string) => call("data.get", { collection, key }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { record?: DataRecord<T> }).record; }),
      put: async <T>(collection: string, key: string, value: T) => call("data.put", { collection, key, value }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { record: DataRecord<T> }).record; }),
      delete: async (collection: string, key: string) => call("data.delete", { collection, key }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { deleted: boolean }).deleted; }),
      list: async <T>(collection: string, options: { prefix?: string; limit?: number } = {}) => call("data.list", { collection, ...options }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { records: readonly DataRecord<T>[] }).records; }),
      migrate: async (input: { version: number; name: string }) => call("data.migrate", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { migration: PluginDataMigration }).migration; }),
      migrations: async () => call("data.migrations").then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { migrations: readonly PluginDataMigration[] }).migrations; })
    }),
    history: () => ({
      record: async (input) => call("history.record", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as HistoryEntry; }),
      query: async (options = {}) => call("history.query", options).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { entries: readonly HistoryEntry[] }).entries; }),
      clear: async (options = {}) => call("history.clear", options).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { cleared: number }).cleared; })
    }),
    catalog: () => ({
      register: async (input) => call("catalog.register", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as CatalogEntry; }),
      query: async (options = {}) => call("catalog.query", options).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { entries: readonly CatalogEntry[] }).entries; }),
      remove: async (id) => call("catalog.remove", { id }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { removed: boolean }).removed; })
    }),
    display: () => ({
      capabilities: () => ({ ...currentContext.display, input: [...currentContext.display.input], viewport: { ...currentContext.display.viewport } }),
      requestMode: async (mode: DisplayMode) => call("display.requestMode", { mode }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as { mode: DisplayMode; accepted: boolean; reason?: "unsupported" | "user-action-required" }; })
    }),
    media: () => ({
      createPlayback: async (mediaId: string) => call("media.createPlayback", { mediaId }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as PlaybackSession; }),
      probe: async (mediaId: string) => call("media.probe", { mediaId }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as MediaProbe; }),
      requestTransform: async (mediaId: string, request: MediaTransformRequest) => call("media.transform", { mediaId, ...request }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as PluginJob; }),
      readOutput: async (outputId: string, start: number, end: number) => call("media.readOutput", { outputId, start, end }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as import("./types.js").MediaTransformOutputRead; }),
      requestHls: async (mediaId: string, request: MediaHlsRequest = {}) => call("media.hls", { mediaId, ...request }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as PluginJob; }),
      readHlsAsset: async (sessionId: string, asset: string, start: number, end: number) => call("media.readHlsAsset", { sessionId, asset, start, end }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as import("./types.js").MediaHlsAssetRead; })
    }),
    mediaSources: () => ({
      list: async (input: MediaSourceListRequest) => call("mediaSource.list", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as MediaSourceListResult; }),
      stat: async (sourceHandle: string, itemHandle: string) => call("mediaSource.stat", { sourceHandle, itemHandle }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as MediaSourceStat; }),
      probe: async (sourceHandle: string, itemHandle: string) => call("mediaSource.probe", { sourceHandle, itemHandle }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as MediaSourceProbe; }),
      createPlayback: async (sourceHandle: string, itemHandle: string) => call("mediaSource.createPlayback", { sourceHandle, itemHandle }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as MediaSourcePlaybackSession; }),
      read: async (input: MediaSourceReadRequest) => call("mediaSource.read", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as MediaSourceReadResult; })
    }),
    network: () => ({ request: async (input: NetworkRequest) => call("network.request", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as NetworkResponse; }) }),
    browser: () => ({
      request: async (input: BrowserSessionRequest) => call("browser.session.request", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as BrowserSession; }),
      list: async () => call("browser.session.list").then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { sessions: readonly BrowserSession[] }).sessions; }),
      revoke: async (id: string) => call("browser.session.revoke", { id }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { revoked: boolean }).revoked; }),
      enqueue: async (input: BrowserTaskRequest) => call("browser.task.enqueue", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as BrowserTask; }),
      tasks: async () => call("browser.task.list").then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { tasks: readonly BrowserTask[] }).tasks; }),
      cancelTask: async (id: string) => call("browser.task.cancel", { id }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { task?: BrowserTask }).task; })
    }),
    notifications: () => ({
      publish: async (input) => call("notifications.publish", input).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return response.result as Notification; }),
      list: async (options = {}) => call("notifications.list", options).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { notifications: readonly Notification[] }).notifications; }),
      markRead: async (id) => call("notifications.markRead", { id }).then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { marked: boolean }).marked; }),
      markAllRead: async () => call("notifications.markAllRead").then((response) => { if (response.error !== undefined) throw new CmhError(response.error); return (response.result as { marked: number }).marked; })
    }),
    onGatewayRequest: (handler) => { gatewayHandler = handler; },
    onContextChanged: (handler) => { contextChangedHandlers.add(handler); return () => contextChangedHandlers.delete(handler); }
  };
}

function isWorkerContext(value: unknown): value is WorkerContext {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<WorkerContext> & { scope?: Partial<WorkerContext["scope"]> };
  const scope = candidate.scope;
  return (candidate.locale === "en" || candidate.locale === "zh-CN" || candidate.locale === "ko")
    && typeof candidate.timeZone === "string" && candidate.timeZone.length > 0 && candidate.timeZone.length <= 80
    && (candidate.theme === "light" || candidate.theme === "dark" || candidate.theme === "system")
    && (candidate.density === "comfortable" || candidate.density === "compact")
    && (candidate.entry === "navigation" || candidate.entry === "key")
    && isDisplayContext(candidate.display)
    && (candidate.grantedCapabilities === undefined || (Array.isArray(candidate.grantedCapabilities) && candidate.grantedCapabilities.every((capability) => typeof capability === "string" && capabilityNames.has(capability as CapabilityName))))
    && typeof candidate.policyVersion === "number" && Number.isSafeInteger(candidate.policyVersion) && candidate.policyVersion >= 1
    && scope !== undefined
    && typeof scope.deploymentId === "string" && typeof scope.organizationId === "string"
    && typeof scope.userId === "string" && typeof scope.deviceId === "string"
    && typeof scope.sessionId === "string" && typeof scope.installationId === "string";
}

function sameScope(left: WorkerContext, right: WorkerContext): boolean {
  return left.scope.deploymentId === right.scope.deploymentId
    && left.scope.organizationId === right.scope.organizationId
    && left.scope.userId === right.scope.userId
    && left.scope.deviceId === right.scope.deviceId
    && left.scope.sessionId === right.scope.sessionId
    && left.scope.installationId === right.scope.installationId;
}

const capabilityNames = new Set<CapabilityName>(["config", "secrets", "db", "storage", "media", "media-source", "history", "catalog", "display", "jobs", "events", "diagnostics", "gateway", "network", "browser", "transfer"]);

function isDisplayContext(value: unknown): value is WorkerContext["display"] {
  if (value === null || typeof value !== "object") return false;
  const display = value as WorkerContext["display"];
  return ["desktop", "mobile", "vehicle", "unknown"].includes(display.deviceClass)
    && Array.isArray(display.input) && display.input.every((item) => ["touch", "keyboard", "pointer", "remote"].includes(item))
    && typeof display.fullscreenAvailable === "boolean"
    && Number.isSafeInteger(display.viewport?.width) && display.viewport.width >= 0
    && Number.isSafeInteger(display.viewport?.height) && display.viewport.height >= 0;
}
