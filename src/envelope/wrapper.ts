import { randomUUID } from "node:crypto";
import { VERSION } from "../index.js";
import type { ErrorDetail, SuccessResponse, ErrorResponse, Warning } from "../types/response.js";

export interface EnvelopeSuccessOptions {
  tool: string;
  data: Record<string, unknown>;
  simulated?: boolean;
  warnings?: Warning[];
  startTime: number;
  skyfiApiVersion?: string;
}

export interface EnvelopeErrorOptions {
  tool: string;
  error: ErrorDetail;
  startTime: number;
}

export function success(options: EnvelopeSuccessOptions): SuccessResponse {
  return {
    status: "success",
    tool: options.tool,
    version: VERSION,
    simulated: options.simulated ?? false,
    data: options.data,
    meta: {
      request_id: `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      duration_ms: Date.now() - options.startTime,
      ...(options.skyfiApiVersion && { skyfi_api_version: options.skyfiApiVersion }),
    },
    warnings: options.warnings ?? [],
  };
}

export function error(options: EnvelopeErrorOptions): ErrorResponse {
  return {
    status: "error",
    tool: options.tool,
    version: VERSION,
    error: options.error,
    meta: {
      request_id: `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      duration_ms: Date.now() - options.startTime,
    },
  };
}
