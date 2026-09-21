import net from "node:net";
import crypto from "node:crypto";
import { encodeFrame, FrameDecoder } from "./wire.js";
import type { RpcRequest, RpcResponse } from "./types.js";

export interface WorkerClientOptions {
  endpoint: string;
  installationId: string;
  runtimeCredential: string;
  timeoutMs?: number;
}

export interface GatewayWorkerRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface WorkerClient {
  close(): void;
  onGatewayRequest(handler: (request: GatewayWorkerRequest) => Promise<unknown> | unknown): void;
}

function request(id: string, installationId: string, method: string, params?: unknown): RpcRequest {
  return { jsonrpc: "2.0", id, method, params, meta: { schemaVersion: "0.1", requestId: id, traceId: id, deadlineUnixMs: Date.now() + 30_000, installationId } };
}

/** A worker-side transport helper. It owns no listener and exposes no host capability. */
export async function connectWorkerClient(options: WorkerClientOptions): Promise<WorkerClient> {
  const socket = net.createConnection(options.endpoint);
  const decoder = new FrameDecoder();
  const timeoutMs = options.timeoutMs ?? 30_000;
  let gatewayHandler: ((request: GatewayWorkerRequest) => Promise<unknown> | unknown) | undefined;
  const pending = new Map<string, { resolve(value: RpcResponse): void; reject(error: Error): void }>();
  const fail = (error: Error) => { for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  socket.on("error", fail);
  socket.on("close", () => fail(new Error("Broker connection closed")));
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
        if (rpc.method === "gateway.request" && typeof rpc.id === "string") {
          void Promise.resolve(gatewayHandler?.(rpc.params as GatewayWorkerRequest) ?? { status: 503, body: { code: "CMH.WORKER.NOT_READY" } })
            .then((result) => socket.write(encodeFrame({ jsonrpc: "2.0", id: rpc.id, result, meta: { schemaVersion: "0.1", requestId: rpc.meta.requestId, traceId: rpc.meta.traceId } })))
            .catch((error: unknown) => socket.write(encodeFrame({ jsonrpc: "2.0", id: rpc.id, error: { code: "CMH.WORKER.REQUEST_FAILED", messageKey: "errors.worker.requestFailed", retryable: false, diagnosticId: "diag_worker_request" }, meta: { schemaVersion: "0.1", requestId: rpc.meta.requestId, traceId: rpc.meta.traceId } })));
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
  if ((hello.result as { type?: string } | undefined)?.type !== "broker.challenge") throw new Error("Broker handshake was denied");
  const welcome = await call("worker.prove", { runtimeCredential: options.runtimeCredential });
  if ((welcome.result as { type?: string } | undefined)?.type !== "broker.welcome") throw new Error("Broker handshake was denied");
  return { close: () => socket.end(), onGatewayRequest: (handler) => { gatewayHandler = handler; } };
}
