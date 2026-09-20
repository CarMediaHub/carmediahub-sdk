import type { CmhErrorShape } from "./types.js";

export class CmhError extends Error {
  readonly code: string;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly diagnosticId: string;
  readonly details: Record<string, string | number | boolean> | undefined;

  constructor(shape: CmhErrorShape) {
    super(shape.messageKey);
    this.name = "CmhError";
    this.code = shape.code;
    this.messageKey = shape.messageKey;
    this.retryable = shape.retryable;
    this.diagnosticId = shape.diagnosticId;
    this.details = shape.details;
  }

  toJSON(): CmhErrorShape {
    return {
      code: this.code,
      messageKey: this.messageKey,
      retryable: this.retryable,
      diagnosticId: this.diagnosticId,
      ...(this.details === undefined ? {} : { details: this.details })
    };
  }
}

export function denied(capability: string, diagnosticId: string): CmhError {
  return new CmhError({
    code: "CMH.CAPABILITY.DENIED",
    messageKey: "errors.capability.denied",
    retryable: false,
    diagnosticId,
    details: { capability }
  });
}
