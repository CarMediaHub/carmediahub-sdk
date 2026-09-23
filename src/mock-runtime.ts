import crypto from "node:crypto";
import { CmhError, denied } from "./error.js";
import type { BrowserService, BrowserSession, BrowserTask, BrowserTaskKind, BrowserTaskRequest, CapabilityName, CatalogEntry, CatalogQuery, CatalogService, DataRecord, DisplayMode, DisplayService, DomainEvent, HistoryEntry, HistoryQuery, HistoryService, MediaService, MediaSourceService, NetworkService, Notification, NotificationService, PlatformContext, PlatformRuntime, PluginDataMigration, PluginDataStore, PluginJob, PluginJobService } from "./types.js";

export class MemoryRuntime implements PlatformRuntime {
  private readonly migrationData = new Map<number, PluginDataMigration>();
  readonly events: DomainEvent[] = [];
  private readonly jobData = new Map<string, PluginJob>();
  private readonly catalogData = new Map<string, CatalogEntry>();
  private readonly notificationData = new Map<string, Notification>();
  private readonly browserSessions = new Map<string, BrowserSession>();
  private readonly browserTasks = new Map<string, BrowserTask>();

  constructor(readonly context: PlatformContext, private readonly data = new Map<string, DataRecord>()) {}

  require(capability: CapabilityName): void {
    if (!this.context.grantedCapabilities.includes(capability)) {
      throw denied(capability, `diag_${this.context.scope.installationId}_denied`);
    }
  }

  database(): PluginDataStore {
    this.require("db");
    const prefix = `${this.context.scope.organizationId}:${this.context.scope.userId}:${this.context.scope.installationId}:`;
    const validate = (value: string, field: string) => {
      if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(value)) throw new Error(`${field} must be a lowercase identifier`);
    };
    const address = (collection: string, key: string) => {
      validate(collection, "collection");
      validate(key, "key");
      return `${prefix}${collection}:${key}`;
    };
    return {
      get: async <T>(collection: string, key: string) => this.data.get(address(collection, key)) as DataRecord<T> | undefined,
      put: async <T>(collection: string, key: string, value: T) => {
        validate(key, "key");
        if (JSON.stringify(value) === undefined) throw new Error("Plugin data value must be JSON serializable");
        const record: DataRecord<T> = { key, value, updatedAt: new Date().toISOString() };
        this.data.set(address(collection, key), record);
        return record;
      },
      delete: async (collection: string, key: string) => this.data.delete(address(collection, key)),
      list: async <T>(collection: string, options: { prefix?: string; limit?: number } = {}) => {
        validate(collection, "collection");
        const maximum = Math.min(Math.max(options.limit ?? 100, 1), 1000);
        const recordPrefix = options.prefix ?? "";
        if (recordPrefix.length > 0) validate(recordPrefix, "prefix");
        const match = `${prefix}${collection}:${recordPrefix}`;
        return [...this.data.entries()].filter(([address]) => address.startsWith(match)).sort((left, right) => left[1].key.localeCompare(right[1].key)).slice(0, maximum).map(([, record]) => record as DataRecord<T>);
      },
      migrate: async (input) => {
        if (!Number.isSafeInteger(input.version) || input.version < 1 || !/^[a-z][a-z0-9_.-]{0,127}$/u.test(input.name)) throw new Error("Invalid plugin data migration");
        const existing = this.migrationData.get(input.version);
        if (existing !== undefined) {
          if (existing.name !== input.name) throw new Error("Plugin data migration version conflict");
          return existing;
        }
        const migration = { version: input.version, name: input.name, appliedAt: new Date().toISOString() };
        this.migrationData.set(input.version, migration);
        return migration;
      },
      migrations: async () => [...this.migrationData.values()].sort((left, right) => left.version - right.version)
    };
  }

  jobs(): PluginJobService {
    this.require("jobs");
    const prefix = `${this.context.scope.organizationId}:${this.context.scope.userId}:${this.context.scope.installationId}:`;
    return {
      enqueue: async (type, payload) => {
        if (!/^[a-z][a-z0-9_.-]{0,95}$/u.test(type)) throw new Error("job type must be a lowercase identifier");
        const payloadJson = JSON.stringify(payload);
        if (payloadJson === undefined) throw new Error("job payload must be JSON serializable");
        if (Buffer.byteLength(payloadJson, "utf8") > 64 * 1024) throw new CmhError({ code: "CMH.JOBS.PAYLOAD_TOO_LARGE", messageKey: "errors.jobs.payloadTooLarge", retryable: false, diagnosticId: "diag_jobs_payload_size" });
        if ([...this.jobData.entries()].filter(([key, job]) => key.startsWith(prefix) && ["queued", "running"].includes(job.status)).length >= 10) throw new CmhError({ code: "CMH.JOBS.QUEUE_FULL", messageKey: "errors.jobs.queueFull", retryable: true, diagnosticId: "diag_jobs_queue_full", details: { limit: 10 } });
        const createdAt = new Date().toISOString();
        const job: PluginJob = { id: `job_${crypto.randomUUID()}`, type, status: "queued", progress: 0, payload, createdAt, updatedAt: createdAt };
        this.jobData.set(`${prefix}${job.id}`, job);
        return job;
      },
      list: async (options = {}) => [...this.jobData.entries()].filter(([key]) => key.startsWith(prefix)).slice(0, Math.min(Math.max(options.limit ?? 100, 1), 500)).map(([, job]) => job),
      cancel: async (id) => {
        const key = `${prefix}${id}`;
        const job = this.jobData.get(key);
        if (job === undefined || !["queued", "running"].includes(job.status)) return undefined;
        const updated: PluginJob = { ...job, status: "cancelled", updatedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
        this.jobData.set(key, updated);
        return updated;
      }
    };
  }

  history(): HistoryService {
    this.require("history");
    const store = this.database();
    const pluginId = this.context.scope.installationId;
    const sourceDevice = this.context.display.deviceClass;
    return {
      record: async (input) => {
        if (!/^[a-z][a-z0-9_.-]{0,63}$/u.test(input.subjectType) || !/^[A-Za-z0-9._:-]{1,160}$/u.test(input.subjectId) || input.title.trim().length === 0 || !input.route.startsWith("/")) throw new Error("Invalid history entry");
        const entry: HistoryEntry = { ...input, id: `history_${crypto.randomUUID()}`, pluginId, sourceDevice: input.sourceDevice ?? sourceDevice, title: input.title.trim(), visitedAt: new Date().toISOString() };
        await store.put("history", entry.id, entry);
        return entry;
      },
      query: async (options: HistoryQuery = {}) => {
        const records = await store.list<HistoryEntry>("history", { limit: 500 });
        const keyword = options.keyword?.trim().toLocaleLowerCase();
        const offset = Math.max(options.offset ?? 0, 0);
        const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
        return records.map((record) => record.value).filter((entry) => (options.pluginId === undefined || entry.pluginId === options.pluginId) && (options.category === undefined || entry.category === options.category) && (keyword === undefined || `${entry.title} ${entry.route}`.toLocaleLowerCase().includes(keyword))).sort((left, right) => right.visitedAt.localeCompare(left.visitedAt)).slice(offset, offset + limit);
      },
      clear: async (options = {}) => {
        const entries = await store.list<HistoryEntry>("history", { limit: 500 });
        let cleared = 0;
        for (const record of entries) if ((options.pluginId === undefined || record.value.pluginId === options.pluginId) && (options.category === undefined || record.value.category === options.category) && await store.delete("history", record.key)) cleared += 1;
        return cleared;
      }
    };
  }

  catalog(): CatalogService {
    this.require("catalog");
    const prefix = `${this.context.scope.organizationId}:${this.context.scope.userId}:${this.context.scope.installationId}:`;
    return {
      register: async (input) => {
        if (!/^[a-z][a-z0-9_.-]{0,63}$/u.test(input.subjectType) || !/^[A-Za-z0-9._:-]{1,160}$/u.test(input.subjectId) || input.title.trim().length === 0 || !/^[a-z][a-z0-9_.-]{0,63}$/u.test(input.category) || !input.route.startsWith("/")) throw new Error("Invalid catalog entry");
        const entry: CatalogEntry = { ...input, id: input.id ?? `catalog_${crypto.randomUUID()}`, pluginId: this.context.scope.installationId, title: input.title.trim(), updatedAt: new Date().toISOString() };
        this.catalogData.set(prefix + entry.id, entry);
        return entry;
      },
      query: async (options: CatalogQuery = {}) => {
        const keyword = options.keyword?.trim().toLocaleLowerCase();
        const offset = Math.max(options.offset ?? 0, 0);
        const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
        return [...this.catalogData.entries()].filter(([key]) => key.startsWith(prefix)).map(([, entry]) => entry).filter((entry) => (options.category === undefined || entry.category === options.category) && (keyword === undefined || `${entry.title} ${entry.description ?? ""}`.toLocaleLowerCase().includes(keyword))).slice(offset, offset + limit);
      },
      remove: async (id) => this.catalogData.delete(prefix + id)
    };
  }

  display(): DisplayService {
    this.require("display");
    return {
      capabilities: () => ({ ...this.context.display, input: [...this.context.display.input], viewport: { ...this.context.display.viewport } }),
      requestMode: async (mode: DisplayMode) => {
        if (mode === "fullscreen" && !this.context.display.fullscreenAvailable) return { mode, accepted: false, reason: "unsupported" as const };
        return { mode, accepted: true };
      }
    };
  }

  media(): MediaService {
    this.require("media");
    return {
      createPlayback: async (mediaId) => ({ sessionId: `playback_${mediaId}`, mediaId, expiresAt: new Date(Date.now() + 600_000).toISOString() }),
      probe: async (mediaId) => ({ mediaId, contentType: "video/mp4", size: 0, updatedAt: new Date(0).toISOString(), seekable: true, availableModes: ["direct-range" as const], recommendedMode: "direct-range" as const }),
      requestTransform: async (mediaId, request) => this.jobs().enqueue(`media.${request.mode}`, { mediaId, ...request })
      , readOutput: async () => ({ data: "", completed: true, contentType: "video/mp4", size: 0 })
      , requestHls: async (mediaId, request = {}) => this.jobs().enqueue("media.hls", { mediaId, ...request })
      , readHlsAsset: async () => ({ data: "", completed: true, contentType: "application/vnd.apple.mpegurl", size: 0 })
    };
  }

  mediaSources(): MediaSourceService {
    this.require("media-source");
    const sourceHandle = "source_demo";
    const itemHandle = "item_demo_video";
    const item = { itemHandle, name: "demo.mp4", kind: "file" as const, size: 0, contentType: "video/mp4", updatedAt: new Date(0).toISOString() };
    const validHandle = (value: string, prefix: string) => value.startsWith(`${prefix}_`) && value.length <= 160;
    return {
      list: async (input) => {
        if (input.sourceHandle !== sourceHandle || (input.parentHandle !== undefined && input.parentHandle !== "root")) throw new Error("Unknown media source handle");
        return { items: [item].slice(0, Math.min(Math.max(input.limit ?? 100, 1), 500)) };
      },
      stat: async (source, itemId) => {
        if (source !== sourceHandle || itemId !== itemHandle) throw new Error("Unknown media source item handle");
        return { sourceHandle: source, itemHandle: itemId, item };
      },
      probe: async (source, itemId) => {
        if (source !== sourceHandle || itemId !== itemHandle) throw new Error("Unknown media source item handle");
        return { sourceHandle: source, itemHandle: itemId, contentType: "video/mp4", size: 0, seekable: true, availableModes: ["direct-range" as const], recommendedMode: "direct-range" as const };
      },
      createPlayback: async (source, itemId) => {
        if (source !== sourceHandle || itemId !== itemHandle) throw new Error("Unknown media source item handle");
        return { sessionId: `source_playback_${crypto.randomUUID()}`, sourceHandle: source, itemHandle: itemId, expiresAt: new Date(Date.now() + 600_000).toISOString() };
      },
      read: async (input) => {
        if (!validHandle(input.sessionId, "source_playback") || !Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.end) || input.start < 0 || input.end < input.start) throw new Error("Invalid media source read request");
        return { data: "", contentType: "video/mp4", size: 0, completed: true };
      }
    };
  }

  network(): NetworkService {
    return { request: async () => { throw new CmhError({ code: "CMH.CAPABILITY.DENIED", messageKey: "errors.capability.denied", retryable: false, diagnosticId: "diag_network_mock_denied" }); } };
  }

  browser(): BrowserService {
    this.require("browser");
    const prefix = `${this.context.scope.organizationId}:${this.context.scope.userId}:${this.context.scope.installationId}:`;
    const scoped = (id: string) => `${prefix}${id}`;
    const active = (session: BrowserSession): BrowserSession => session.status === "active" && Date.parse(session.expiresAt) <= Date.now() ? { ...session, status: "expired" } : session;
    const taskKey = (id: string) => `${prefix}task:${id}`;
    const activeSession = (id: string): BrowserSession | undefined => {
      const session = this.browserSessions.get(scoped(id));
      if (session === undefined) return undefined;
      const current = active(session);
      if (current.status !== session.status) this.browserSessions.set(scoped(id), current);
      return current;
    };
    const validInput = (input: BrowserTaskRequest["input"]): { target?: string; label?: string } => {
      if (input === undefined) return {};
      const keys = Object.keys(input);
      if (keys.some((key) => key !== "target" && key !== "label") || (input.target !== undefined && (!/^[a-z][a-z0-9._-]{0,127}$/u.test(input.target))) || (input.label !== undefined && (input.label.trim().length === 0 || input.label.length > 160))) throw new Error("Invalid browser task input");
      return { ...(input.target === undefined ? {} : { target: input.target }), ...(input.label === undefined ? {} : { label: input.label.trim() }) };
    };
    return {
      request: async (input) => {
        if (!/^[a-z][a-z0-9_-]{1,63}$/u.test(input.name) || input.purpose.trim().length === 0 || input.purpose.length > 160) throw new Error("Invalid browser session request");
        const expiresInSeconds = input.expiresInSeconds ?? 300;
        if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 30 || expiresInSeconds > 3600) throw new Error("Invalid browser session expiry");
        const session: BrowserSession = { id: `browser_${crypto.randomUUID()}`, name: input.name, purpose: input.purpose.trim(), status: "active", expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() };
        this.browserSessions.set(scoped(session.id), session);
        return session;
      },
      list: async () => [...this.browserSessions.entries()].filter(([key]) => key.startsWith(prefix)).map(([, session]) => active(session)),
      revoke: async (id) => {
        const key = scoped(id);
        const session = this.browserSessions.get(key);
        if (session === undefined) return false;
        this.browserSessions.set(key, { ...active(session), status: "revoked" });
        for (const [key, task] of this.browserTasks.entries()) if (key.startsWith(prefix) && task.sessionId === id && (task.status === "queued" || task.status === "running")) this.browserTasks.set(key, { ...task, status: "cancelled", updatedAt: new Date().toISOString() });
        return true;
      },
      enqueue: async (input) => {
        this.require("browser");
        const session = activeSession(input.sessionId);
        const kinds: readonly BrowserTaskKind[] = ["navigate-and-capture", "extract-media-reference", "export-authorized-state"];
        if (session?.status !== "active" || !kinds.includes(input.kind)) throw new Error("Invalid browser task request");
        const timestamp = new Date().toISOString();
        const task: BrowserTask = { id: `browser_task_${crypto.randomUUID()}`, sessionId: input.sessionId, kind: input.kind, status: "queued", input: validInput(input.input), createdAt: timestamp, updatedAt: timestamp };
        this.browserTasks.set(taskKey(task.id), task);
        return task;
      },
      tasks: async () => { this.require("browser"); return [...this.browserTasks.entries()].filter(([key]) => key.startsWith(prefix)).map(([, task]) => task); },
      cancelTask: async (id) => {
        this.require("browser");
        const key = taskKey(id);
        const task = this.browserTasks.get(key);
        if (task === undefined || (task.status !== "queued" && task.status !== "running")) return task;
        const cancelled = { ...task, status: "cancelled" as const, updatedAt: new Date().toISOString() };
        this.browserTasks.set(key, cancelled);
        return cancelled;
      }
    };
  }

  notifications(): NotificationService {
    this.require("events");
    const prefix = `${this.context.scope.organizationId}:${this.context.scope.userId}:${this.context.scope.installationId}:`;
    return {
      publish: async (input) => {
        if (!["info", "success", "warning", "error"].includes(input.severity) || input.title.trim().length === 0 || input.title.length > 160 || (input.body !== undefined && input.body.length > 4000)) throw new Error("Invalid notification");
        const notification: Notification = { id: `notification_${crypto.randomUUID()}`, pluginId: this.context.scope.installationId, severity: input.severity, title: input.title.trim(), ...(input.body === undefined ? {} : { body: input.body }), createdAt: new Date().toISOString() };
        this.notificationData.set(prefix + notification.id, notification);
        return notification;
      },
      list: async (options = {}) => [...this.notificationData.entries()].filter(([key, value]) => key.startsWith(prefix) && (!options.unreadOnly || value.readAt === undefined)).map(([, value]) => value).slice(0, Math.min(Math.max(options.limit ?? 100, 1), 500)),
      markRead: async (id) => { const key = prefix + id; const notification = this.notificationData.get(key); if (notification === undefined) return false; this.notificationData.set(key, { ...notification, readAt: new Date().toISOString() }); return true; },
      markAllRead: async () => { let marked = 0; for (const [key, notification] of this.notificationData.entries()) { if (key.startsWith(prefix) && notification.readAt === undefined) { this.notificationData.set(key, { ...notification, readAt: new Date().toISOString() }); marked += 1; } } return marked; }
    };
  }

  publish<T extends Record<string, unknown>>(type: string, payload: T): DomainEvent<T> {
    this.require("events");
    const event: DomainEvent<T> = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      scope: {
        deploymentId: this.context.scope.deploymentId,
        organizationId: this.context.scope.organizationId,
        userId: this.context.scope.userId,
        installationId: this.context.scope.installationId
      },
      producer: this.context.scope.installationId,
      schemaVersion: 1,
      type,
      payload
    };
    this.events.push(event);
    return event;
  }
}
