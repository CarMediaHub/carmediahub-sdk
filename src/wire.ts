import { CmhError } from "./error.js";
import type { RpcRequest } from "./types.js";

export const MAX_RPC_FRAME_BYTES = 1024 * 1024;
const allowedPrefixes = ["broker.", "worker.", "lifecycle.", "context.", "capability.", "jobs.", "history.", "catalog.", "display.", "notifications.", "gateway.", "event.", "health.", "diagnostics.", "media.", "network.", "browser.", "$/cancelRequest"];
const allowedJobMethods = new Set(["jobs.enqueue", "jobs.list", "jobs.cancel"]);
const allowedHistoryMethods = new Set(["history.record", "history.query", "history.clear"]);
const allowedCatalogMethods = new Set(["catalog.register", "catalog.query", "catalog.remove"]);
const allowedDisplayMethods = new Set(["display.capabilities", "display.requestMode"]);
const allowedNotificationMethods = new Set(["notifications.publish", "notifications.list", "notifications.markRead", "notifications.markAllRead"]);
const allowedNetworkMethods = new Set(["network.request"]);
const allowedBrowserMethods = new Set(["browser.session.request", "browser.session.list", "browser.session.revoke"]);
const allowedMediaMethods = new Set(["media.createPlayback", "media.probe", "media.transform", "media.hls", "media.read", "media.readOutput", "media.readHlsAsset", "media.list"]);
const forbiddenPrefixes = ["policy.", "secret.", "runtime."];

function protocolError(code: string, diagnosticId: string, retryable = false): CmhError {
  return new CmhError({ code, messageKey: code === "CMH.CAPABILITY.DENIED" ? "errors.capability.denied" : code === "CMH.PROTOCOL.DEADLINE_EXCEEDED" ? "errors.protocol.deadlineExceeded" : "errors.protocol.invalidFrame", retryable, diagnosticId });
}

export function encodeFrame(payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  if (json.length === 0 || json.length > MAX_RPC_FRAME_BYTES) throw protocolError("CMH.PROTOCOL.INVALID_FRAME", "diag_frame_encode");
  const frame = Buffer.allocUnsafe(4 + json.length);
  frame.writeUInt32BE(json.length, 0);
  json.copy(frame, 4);
  return frame;
}

export class FrameDecoder {
  private buffered = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    const messages: unknown[] = [];
    while (this.buffered.length >= 4) {
      const length = this.buffered.readUInt32BE(0);
      if (length === 0 || length > MAX_RPC_FRAME_BYTES) throw protocolError("CMH.PROTOCOL.INVALID_FRAME", "diag_frame_length");
      if (this.buffered.length < 4 + length) break;
      const body = this.buffered.subarray(4, 4 + length);
      this.buffered = this.buffered.subarray(4 + length);
      try {
        messages.push(JSON.parse(body.toString("utf8")));
      } catch {
        throw protocolError("CMH.PROTOCOL.INVALID_FRAME", "diag_frame_json");
      }
    }
    return messages;
  }
}

export function validateWorkerRequest(value: unknown, nowUnixMs = Date.now()): asserts value is RpcRequest {
  if (typeof value !== "object" || value === null) throw protocolError("CMH.PROTOCOL.INVALID_FRAME", "diag_rpc_object");
  const request = value as Partial<RpcRequest>;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string" || typeof request.meta !== "object" || request.meta === null) throw protocolError("CMH.PROTOCOL.INVALID_FRAME", "diag_rpc_shape");
  if (forbiddenPrefixes.some((prefix) => request.method!.startsWith(prefix)) || !allowedPrefixes.some((prefix) => request.method === prefix || request.method!.startsWith(prefix)) || (request.method!.startsWith("jobs.") && !allowedJobMethods.has(request.method!)) || (request.method!.startsWith("history.") && !allowedHistoryMethods.has(request.method!)) || (request.method!.startsWith("catalog.") && !allowedCatalogMethods.has(request.method!)) || (request.method!.startsWith("display.") && !allowedDisplayMethods.has(request.method!)) || (request.method!.startsWith("notifications.") && !allowedNotificationMethods.has(request.method!)) || (request.method!.startsWith("media.") && !allowedMediaMethods.has(request.method!)) || (request.method!.startsWith("network.") && !allowedNetworkMethods.has(request.method!)) || (request.method!.startsWith("browser.") && !allowedBrowserMethods.has(request.method!))) throw protocolError("CMH.CAPABILITY.DENIED", "diag_rpc_method");
  if (request.meta.schemaVersion !== "0.1" || !request.meta.requestId || !request.meta.traceId || !request.meta.installationId || !Number.isFinite(request.meta.deadlineUnixMs)) throw protocolError("CMH.PROTOCOL.INVALID_FRAME", "diag_rpc_meta");
  if (request.meta.deadlineUnixMs !== 0 && request.meta.deadlineUnixMs < nowUnixMs) throw protocolError("CMH.PROTOCOL.DEADLINE_EXCEEDED", "diag_rpc_deadline", true);
}
