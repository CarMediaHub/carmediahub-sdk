import assert from "node:assert/strict";
import test from "node:test";
import { CmhError } from "./error.js";
import { MemoryRuntime } from "./mock-runtime.js";
import type { PlatformContext } from "./types.js";

const context: PlatformContext = {
  scope: { deploymentId: "d", organizationId: "o", userId: "u", deviceId: "device", sessionId: "session", installationId: "plugin" },
  locale: "zh-CN",
  timeZone: "Asia/Shanghai",
  theme: "dark",
  density: "comfortable",
  entry: "navigation",
  display: { deviceClass: "vehicle", input: ["touch"], fullscreenAvailable: true, viewport: { width: 1920, height: 1200 } },
  grantedCapabilities: ["events"],
  policyVersion: 1
};

test("publishes scoped events", () => {
  const runtime = new MemoryRuntime(context);
  const event = runtime.publish("media.ready", { source: "demo" });
  assert.equal(event.scope.userId, "u");
  assert.equal(event.payload.source, "demo");
});

test("isolates logical plugin data by user and installation", async () => {
  const sharedData = new Map();
  const first = new MemoryRuntime({ ...context, grantedCapabilities: ["db"], scope: { ...context.scope, userId: "user-a", installationId: "plugin-one" } }, sharedData);
  const otherUser = new MemoryRuntime({ ...context, grantedCapabilities: ["db"], scope: { ...context.scope, userId: "user-b", installationId: "plugin-one" } }, sharedData);
  const otherInstallation = new MemoryRuntime({ ...context, grantedCapabilities: ["db"], scope: { ...context.scope, userId: "user-a", installationId: "plugin-two" } }, sharedData);
  await first.database().put("history", "item-one", { title: "Private media" });
  assert.deepEqual(await first.database().get("history", "item-one"), { key: "item-one", value: { title: "Private media" }, updatedAt: (await first.database().get("history", "item-one"))?.updatedAt });
  assert.equal(await otherUser.database().get("history", "item-one"), undefined);
  assert.equal(await otherInstallation.database().get("history", "item-one"), undefined);
});

test("rejects ungranted capability", () => {
  const runtime = new MemoryRuntime(context);
  assert.throws(() => runtime.require("network"), (error: unknown) => error instanceof CmhError && error.code === "CMH.CAPABILITY.DENIED");
});

test("keeps job requests inside the current plugin scope", async () => {
  const first = new MemoryRuntime({ ...context, grantedCapabilities: ["jobs"], scope: { ...context.scope, userId: "user-a", installationId: "plugin-one" } });
  const second = new MemoryRuntime({ ...context, grantedCapabilities: ["jobs"], scope: { ...context.scope, userId: "user-b", installationId: "plugin-one" } });
  const job = await first.jobs().enqueue("media.transcode", { source: "media-1" });
  assert.equal((await first.jobs().list())[0]?.id, job.id);
  assert.deepEqual(await second.jobs().list(), []);
  assert.equal((await first.jobs().cancel(job.id))?.status, "cancelled");
});

test("history is scoped, searchable, and clearable through the platform API", async () => {
  const sharedData = new Map<string, DataRecord>();
  const first = new MemoryRuntime({ ...context, grantedCapabilities: ["db", "history"], scope: { ...context.scope, userId: "user-a", installationId: "plugin-one" } }, sharedData);
  const other = new MemoryRuntime({ ...context, grantedCapabilities: ["db", "history"], scope: { ...context.scope, userId: "user-b", installationId: "plugin-one" } }, sharedData);
  await first.history().record({ subjectType: "media", subjectId: "movie-1", route: "/watch", title: "Road movie", category: "movies" });
  assert.equal((await first.history().query({ keyword: "road" })).length, 1);
  assert.equal((await other.history().query()).length, 0);
  assert.equal(await first.history().clear({ category: "movies" }), 1);
  assert.equal((await first.history().query()).length, 0);
});
