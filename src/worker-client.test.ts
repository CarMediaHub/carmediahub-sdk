import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { encodeFrame, FrameDecoder } from "./wire.js";
import { connectWorkerClient } from "./worker-client.js";
import type { RpcRequest } from "./types.js";

function endpoint(): string {
  return process.platform === "win32" ? `\\\\.\\pipe\\cmh-sdk-test-${crypto.randomUUID()}` : path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cmh-sdk-")), "broker.sock");
}

test("worker client completes local handshake and returns a logical gateway response", async () => {
  const address = endpoint();
  let resolveGateway!: (value: unknown) => void;
  const gatewayResponse = new Promise<unknown>((resolve) => { resolveGateway = resolve; });
  const server = net.createServer((socket) => {
    const decoder = new FrameDecoder();
    socket.on("data", (chunk: Buffer) => {
      for (const message of decoder.push(chunk)) {
        const request = message as RpcRequest;
        if (request.method === "broker.hello") socket.write(encodeFrame({ jsonrpc: "2.0", id: request.id, result: { type: "broker.challenge" }, meta: { schemaVersion: "0.1", requestId: request.meta.requestId, traceId: request.meta.traceId } }));
        else if (request.method === "worker.prove") {
          socket.write(encodeFrame({ jsonrpc: "2.0", id: request.id, result: { type: "broker.welcome" }, meta: { schemaVersion: "0.1", requestId: request.meta.requestId, traceId: request.meta.traceId } }));
          setTimeout(() => socket.write(encodeFrame({ jsonrpc: "2.0", id: "gateway_1", method: "gateway.request", params: { method: "GET", path: "/library" }, meta: { schemaVersion: "0.1", requestId: "gateway_1", traceId: "gateway_1", deadlineUnixMs: Date.now() + 5_000, installationId: "plugin" } })), 10);
        } else if (request.id === "gateway_1") resolveGateway((request as unknown as { result?: unknown }).result);
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(address, resolve); });
  try {
    const client = await connectWorkerClient({ endpoint: address, installationId: "plugin", runtimeCredential: "credential" });
    client.onGatewayRequest((input) => ({ status: 200, body: input.path }));
    assert.deepEqual(await gatewayResponse, { status: 200, body: "/library" });
    client.close();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (process.platform !== "win32") fs.rmSync(path.dirname(address), { recursive: true, force: true });
  }
});

test("worker client emits ordered response stream frames", async () => {
  const address = endpoint();
  const frames: unknown[] = [];
  let end!: () => void;
  const ended = new Promise<void>((resolve) => { end = resolve; });
  const server = net.createServer((socket) => {
    const decoder = new FrameDecoder();
    socket.on("data", (chunk: Buffer) => {
      for (const message of decoder.push(chunk)) {
        const request = message as RpcRequest;
        if (request.method === "broker.hello") socket.write(encodeFrame({ jsonrpc: "2.0", id: request.id, result: { type: "broker.challenge" }, meta: { schemaVersion: "0.1", requestId: request.meta.requestId, traceId: request.meta.traceId } }));
        else if (request.method === "worker.prove") {
          socket.write(encodeFrame({ jsonrpc: "2.0", id: request.id, result: { type: "broker.welcome" }, meta: { schemaVersion: "0.1", requestId: request.meta.requestId, traceId: request.meta.traceId } }));
          setTimeout(() => socket.write(encodeFrame({ jsonrpc: "2.0", id: "stream_1", method: "gateway.request", params: { method: "GET", path: "/video", stream: true }, meta: { schemaVersion: "0.1", requestId: "stream_1", traceId: "stream_1", deadlineUnixMs: Date.now() + 5_000, installationId: "plugin" } })), 5);
        } else if ((request as unknown as { method?: string }).method?.startsWith("gateway.response")) {
          frames.push(request);
          if ((request as unknown as { method?: string }).method === "gateway.responseEnd") end();
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(address, resolve); });
  try {
    const client = await connectWorkerClient({ endpoint: address, installationId: "plugin", runtimeCredential: "credential" });
    client.onGatewayRequest(async () => ({ status: 206, headers: { "content-range": "bytes 0-1/2" }, body: (async function* () { yield Buffer.from("a"); yield Buffer.from("b"); })() }));
    await ended;
    assert.deepEqual(frames.map((frame) => (frame as { method: string }).method), ["gateway.responseStart", "gateway.responseChunk", "gateway.responseChunk", "gateway.responseEnd"]);
    assert.equal((frames[1] as { params: { data: string } }).params.data, Buffer.from("a").toString("base64"));
    client.close();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (process.platform !== "win32") fs.rmSync(path.dirname(address), { recursive: true, force: true });
  }
});
