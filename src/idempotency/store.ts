import type { ToolResponse } from "../types/response.js";

interface IdempotencyRecord {
  key: string;
  apiKeyHash: string;
  response: ToolResponse;
  createdAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  private compositeKey(idempotencyKey: string, apiKeyHash: string): string {
    return `${apiKeyHash}:${idempotencyKey}`;
  }

  check(idempotencyKey: string, apiKeyHash: string): ToolResponse | null {
    const ck = this.compositeKey(idempotencyKey, apiKeyHash);
    const record = this.records.get(ck);

    if (!record) return null;

    if (Date.now() > record.expiresAt) {
      this.records.delete(ck);
      return null;
    }

    return record.response;
  }

  store(idempotencyKey: string, apiKeyHash: string, response: ToolResponse): void {
    const ck = this.compositeKey(idempotencyKey, apiKeyHash);
    const now = Date.now();
    this.records.set(ck, {
      key: idempotencyKey,
      apiKeyHash,
      response,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    });
    this.cleanup();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ck, record] of this.records) {
      if (now > record.expiresAt) this.records.delete(ck);
    }
  }
}
