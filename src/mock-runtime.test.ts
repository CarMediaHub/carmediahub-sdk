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

test("rejects ungranted capability", () => {
  const runtime = new MemoryRuntime(context);
  assert.throws(() => runtime.require("network"), (error: unknown) => error instanceof CmhError && error.code === "CMH.CAPABILITY.DENIED");
});
