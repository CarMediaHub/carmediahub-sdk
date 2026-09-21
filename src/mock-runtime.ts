import { CmhError, denied } from "./error.js";
import type { CapabilityName, CatalogEntry, CatalogQuery, CatalogService, DataRecord, DisplayMode, DisplayService, DomainEvent, HistoryEntry, HistoryQuery, HistoryService, PlatformContext, PlatformRuntime, PluginDataStore, PluginJob, PluginJobService } from "./types.js";

export class MemoryRuntime implements PlatformRuntime {
  readonly events: DomainEvent[] = [];
  private readonly jobData = new Map<string, PluginJob>();
  private readonly catalogData = new Map<string, CatalogEntry>();

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
        const record: DataRecord<T> = { key, value, updatedAt: new Date().toISOString() };
        this.data.set(address(collection, key), record);
        return record;
      },
      delete: async (collection: string, key: string) => this.data.delete(address(collection, key)),
      list: async <T>(collection: string, options: { prefix?: string; limit?: number } = {}) => {
        validate(collection, "collection");
        const maximum = Math.min(Math.max(options.limit ?? 100, 1), 1000);
        const match = `${prefix}${collection}:${options.prefix ?? ""}`;
        return [...this.data.entries()].filter(([address]) => address.startsWith(match)).slice(0, maximum).map(([, record]) => record as DataRecord<T>);
      }
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
        const records = await store.list<HistoryEntry>("history", { limit: Math.min(Math.max(options.limit ?? 100, 1), 500) });
        const keyword = options.keyword?.trim().toLocaleLowerCase();
        return records.map((record) => record.value).filter((entry) => (options.pluginId === undefined || entry.pluginId === options.pluginId) && (options.category === undefined || entry.category === options.category) && (keyword === undefined || `${entry.title} ${entry.route}`.toLocaleLowerCase().includes(keyword))).sort((left, right) => right.visitedAt.localeCompare(left.visitedAt));
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
        return [...this.catalogData.entries()].filter(([key]) => key.startsWith(prefix)).map(([, entry]) => entry).filter((entry) => (options.category === undefined || entry.category === options.category) && (keyword === undefined || `${entry.title} ${entry.description ?? ""}`.toLocaleLowerCase().includes(keyword))).slice(0, Math.min(Math.max(options.limit ?? 100, 1), 500));
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
