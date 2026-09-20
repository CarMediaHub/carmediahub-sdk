import { denied } from "./error.js";
import type { CapabilityName, DataRecord, DomainEvent, PlatformContext, PlatformRuntime, PluginDataStore } from "./types.js";

export class MemoryRuntime implements PlatformRuntime {
  readonly events: DomainEvent[] = [];

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
