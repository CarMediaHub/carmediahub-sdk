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

test("records idempotent logical data migrations", async () => {
  const runtime = new MemoryRuntime({ ...context, grantedCapabilities: ["db"] });
  const first = await runtime.database().migrate({ version: 1, name: "initial-settings" });
  const again = await runtime.database().migrate({ version: 1, name: "initial-settings" });
  assert.equal(again.appliedAt, first.appliedAt);
  assert.deepEqual(await runtime.database().migrations(), [first]);
  await assert.rejects(() => runtime.database().migrate({ version: 1, name: "different" }));
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

test("media transform requests become scoped jobs", async () => {
  const runtime = new MemoryRuntime({ ...context, grantedCapabilities: ["media", "jobs"] });
  const job = await runtime.media().requestTransform("media-1", { mode: "transcode", container: "mp4", videoCodec: "h264", audioCodec: "aac" });
  assert.equal(job.type, "media.transcode");
  assert.deepEqual(job.payload, { mediaId: "media-1", mode: "transcode", container: "mp4", videoCodec: "h264", audioCodec: "aac" });
});

test("media source API uses opaque handles and read-only operations", async () => {
  const runtime = new MemoryRuntime({ ...context, grantedCapabilities: ["media-source"] });
  const source = runtime.mediaSources();
  const listing = await source.list({ sourceHandle: "source_demo" });
  assert.equal(listing.items[0]?.name, "demo.mp4");
  assert.equal("path" in (listing.items[0] ?? {}), false);
  const playback = await source.createPlayback("source_demo", listing.items[0]!.itemHandle);
  assert.match(playback.sessionId, /^source_playback_/u);
  await assert.rejects(() => source.list({ sourceHandle: "https://internal.example/webdav" }));
  await assert.rejects(() => source.stat("source_demo", "../secret"));
  await assert.rejects(() => source.read({ sessionId: playback.sessionId, start: 4, end: 2 }));
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

test("catalog entries are scoped, searchable, and removable", async () => {
  const runtime = new MemoryRuntime({ ...context, grantedCapabilities: ["catalog"] });
  await runtime.catalog().register({ subjectType: "media", subjectId: "one", title: "Road trip", category: "video", route: "/stream" });
  assert.equal((await runtime.catalog().query({ keyword: "road" })).length, 1);
  assert.equal(await runtime.catalog().remove((await runtime.catalog().query())[0]!.id), true);
  assert.equal((await runtime.catalog().query()).length, 0);
});

test("display capability returns a copy and refuses unsupported fullscreen", async () => {
  const runtime = new MemoryRuntime({ ...context, grantedCapabilities: ["display"], display: { ...context.display, fullscreenAvailable: false } });
  assert.deepEqual(runtime.display().capabilities(), { ...context.display, fullscreenAvailable: false });
  assert.deepEqual(await runtime.display().requestMode("fullscreen"), { mode: "fullscreen", accepted: false, reason: "unsupported" });
  assert.deepEqual(await runtime.display().requestMode("normal"), { mode: "normal", accepted: true });
});

test("browser sessions are opaque, scoped, bounded, and revocable", async () => {
  const runtime = new MemoryRuntime({ ...context, grantedCapabilities: ["browser"] });
  const session = await runtime.browser().request({ name: "youtube", purpose: "authorized media extraction", expiresInSeconds: 60 });
  assert.match(session.id, /^browser_/u);
  assert.equal(session.status, "active");
  assert.equal("profilePath" in session, false);
  assert.equal((await runtime.browser().list()).length, 1);
  assert.equal(await runtime.browser().revoke(session.id), true);
  assert.equal((await runtime.browser().list())[0]?.status, "revoked");
  const second = await runtime.browser().request({ name: "fixture", purpose: "task contract" });
  const task = await runtime.browser().enqueue({ sessionId: second.id, kind: "navigate-and-capture", input: { target: "fixture", label: "Fixture" } });
  assert.equal(task.status, "queued");
  assert.equal((await runtime.browser().tasks()).length, 1);
  assert.equal((await runtime.browser().cancelTask(task.id))?.status, "cancelled");
  await assert.rejects(() => runtime.browser().enqueue({ sessionId: second.id, kind: "navigate-and-capture", input: { target: "https://example.com" } }));
  await assert.rejects(() => runtime.browser().request({ name: "bad name", purpose: "x" }));
  await assert.rejects(() => runtime.browser().request({ name: "valid", purpose: "x", expiresInSeconds: 5 }));
});

test("notifications are scoped and can be marked read", async () => {
  const data = new Map();
  const first = new MemoryRuntime(context, data);
  const other = new MemoryRuntime({ ...context, scope: { ...context.scope, userId: "user-b" } }, data);
  const notification = await first.notifications().publish({ severity: "warning", title: "Needs attention", body: "Check the media source" });
  assert.equal((await first.notifications().list()).length, 1);
  assert.deepEqual(await other.notifications().list(), []);
  assert.equal(await first.notifications().markRead(notification.id), true);
  assert.equal((await first.notifications().list({ unreadOnly: true })).length, 0);
  await first.notifications().publish({ severity: "info", title: "Second" });
  assert.equal(await first.notifications().markAllRead(), 1);
  assert.equal((await first.notifications().list({ unreadOnly: true })).length, 0);
});

test("history and catalog memory queries apply offset after filtering", async () => {
  const runtime = new MemoryRuntime({ ...context, grantedCapabilities: ["db", "history", "catalog"] }, new Map());
  await runtime.history().record({ subjectType: "media", subjectId: "one", title: "Road one", route: "/one", category: "video" });
  await runtime.history().record({ subjectType: "media", subjectId: "two", title: "Other", route: "/two", category: "video" });
  await runtime.history().record({ subjectType: "media", subjectId: "three", title: "Road three", route: "/three", category: "video" });
  assert.equal((await runtime.history().query({ keyword: "road", limit: 1, offset: 1 })).length, 1);
  await runtime.catalog().register({ subjectType: "media", subjectId: "one", title: "Road one", category: "video", route: "/one" });
  await runtime.catalog().register({ subjectType: "media", subjectId: "two", title: "Other", category: "video", route: "/two" });
  await runtime.catalog().register({ subjectType: "media", subjectId: "three", title: "Road three", category: "video", route: "/three" });
  assert.equal((await runtime.catalog().query({ keyword: "road", limit: 1, offset: 1 })).length, 1);
});
