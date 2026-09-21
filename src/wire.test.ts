import assert from "node:assert/strict";
import test from "node:test";
import { CmhError } from "./error.js";
import { encodeFrame, FrameDecoder, MAX_RPC_FRAME_BYTES, validateWorkerRequest } from "./wire.js";

const request = { jsonrpc: "2.0" as const, id: "req-1", method: "health.heartbeat", params: {}, meta: { schemaVersion: "0.1" as const, requestId: "req-1", traceId: "trace-1", deadlineUnixMs: 0, installationId: "plugin-1" } };

test("decodes fragmented framed JSON messages", () => {
  const frame = encodeFrame(request);
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(frame.subarray(0, 3)), []);
  assert.deepEqual(decoder.push(frame.subarray(3)), [request]);
});

test("rejects invalid frame length and forbidden Core methods", () => {
  const invalid = Buffer.alloc(4);
  invalid.writeUInt32BE(MAX_RPC_FRAME_BYTES + 1, 0);
  assert.throws(() => new FrameDecoder().push(invalid), (error: unknown) => error instanceof CmhError && error.code === "CMH.PROTOCOL.INVALID_FRAME");
  assert.throws(() => validateWorkerRequest({ ...request, method: "runtime.shutdown" }), (error: unknown) => error instanceof CmhError && error.code === "CMH.CAPABILITY.DENIED");
});

test("rejects expired worker deadlines", () => {
  assert.throws(() => validateWorkerRequest({ ...request, meta: { ...request.meta, deadlineUnixMs: 100 } }, 101), (error: unknown) => error instanceof CmhError && error.code === "CMH.PROTOCOL.DEADLINE_EXCEEDED");
});

test("allows only the public jobs method namespace", () => {
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "jobs.enqueue" }));
  assert.throws(() => validateWorkerRequest({ ...request, method: "jobs.executeShell" }), (error: unknown) => error instanceof CmhError && error.code === "CMH.CAPABILITY.DENIED");
});

test("allows only the public history method namespace", () => {
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "history.record" }));
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "history.query" }));
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "history.clear" }));
  assert.throws(() => validateWorkerRequest({ ...request, method: "history.sql" }));
});

test("allows only the public catalog method namespace", () => {
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "catalog.register" }));
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "catalog.query" }));
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "catalog.remove" }));
  assert.throws(() => validateWorkerRequest({ ...request, method: "catalog.sql" }));
});

test("allows only the public display method namespace", () => {
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "display.requestMode" }));
  assert.throws(() => validateWorkerRequest({ ...request, method: "display.executeScript" }));
});

test("allows only the public notification method namespace", () => {
  assert.doesNotThrow(() => validateWorkerRequest({ ...request, method: "notifications.publish" }));
  assert.throws(() => validateWorkerRequest({ ...request, method: "notifications.deleteAll" }), (error: unknown) => error instanceof CmhError && error.code === "CMH.CAPABILITY.DENIED");
});
