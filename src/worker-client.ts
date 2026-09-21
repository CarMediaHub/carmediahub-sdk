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
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: unknown;
  stream?: boolean;
}

export interface GatewayWorkerResponse {
  status: number;
  headers?: Record<string, string>;
  /** A synchronous body is encoded as the normal JSON-RPC result; an async body is streamed. */
  body?: unknown | AsyncIterable<Uint8Array | Buffer>;
}

export interface WorkerClient {
  close(): void;
  onGatewayRequest(handler: (request: GatewayWorkerRequest, signal: AbortSignal) => Promise<GatewayWorkerResponse | unknown> | GatewayWorkerResponse | unknown): void;
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
  const activeGateway = new Map<string, AbortController>();
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
        if (rpc.method === "$/cancelRequest") {
          const id = (rpc.params as { id?: unknown } | undefined)?.id;
          if (typeof id === "string") activeGateway.get(id)?.abort();
          continue;
        }
        if (rpc.method === "gateway.request" && typeof rpc.id === "string") {
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
  if ((hello.result as { type?: string } | undefined)?.type !== "broker.challenge") throw new Error("Broker handshake was denied");
  const welcome = await call("worker.prove", { runtimeCredential: options.runtimeCredential });
  if ((welcome.result as { type?: string } | undefined)?.type !== "broker.welcome") throw new Error("Broker handshake was denied");
  return { close: () => socket.end(), onGatewayRequest: (handler) => { gatewayHandler = handler; } };
}
