import { encrypt, decrypt, hmacHash, generateToken } from "./crypto.js";
import type { SessionTokenData, ServiceTokenData } from "./token-store.js";

type TokenData = SessionTokenData | ServiceTokenData;

const SESSION_IDLE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SERVICE_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface TokenResolution {
  valid: boolean;
  apiKey?: string;
  tokenType?: "session" | "service";
  apiKeyHash?: string;
  error?: string;
}

/**
 * Workers KV-backed token store for production use.
 * All methods are async. Falls back to in-memory TokenStore for local dev.
 *
 * KV key schema:
 *   token:<token>         → TokenData JSON, TTL = absolute expiry
 *   svc_index:<keyHash>   → JSON string[] of service token IDs for list/revoke
 */
export class KVTokenStore {
  private readonly secret: string;
  private readonly kv: KVNamespace;

  constructor(secret: string, kv: KVNamespace) {
    this.secret = secret;
    this.kv = kv;
  }

  async issueSessionToken(apiKey: string): Promise<string> {
    const token = generateToken("mcp_sess_");
    const now = Date.now();
    const data: SessionTokenData = {
      type: "session",
      apiKeyEncrypted: encrypt(apiKey, this.secret),
      apiKeyHash: hmacHash(apiKey, this.secret),
      createdAt: now,
      lastUsedAt: now,
      idleTtlMs: SESSION_IDLE_TTL_MS,
      absoluteExpiresAt: now + SESSION_MAX_LIFETIME_MS,
    };
    await this.kv.put(`token:${token}`, JSON.stringify(data), {
      expirationTtl: Math.ceil(SESSION_MAX_LIFETIME_MS / 1000),
    });
    return token;
  }

  async issueServiceToken(
    apiKey: string,
    name: string,
    scopes: string[] | null = null,
    budgetLimitUsd: number | null = null,
  ): Promise<{ token: string } | { error: string }> {
    const keyHash = hmacHash(apiKey, this.secret);

    // Enforce unique names per API key
    const index = await this.getServiceIndex(keyHash);
    for (const existingToken of index) {
      const raw = await this.kv.get(`token:${existingToken}`);
      if (raw) {
        const data = JSON.parse(raw) as ServiceTokenData;
        if (data.name === name) {
          return {
            error: `A service token named '${name}' already exists. Revoke it first or choose a different name.`,
          };
        }
      }
    }

    const token = generateToken("mcp_svc_");
    const now = Date.now();
    const data: ServiceTokenData = {
      type: "service",
      apiKeyEncrypted: encrypt(apiKey, this.secret),
      apiKeyHash: keyHash,
      name,
      scopes,
      budgetLimitUsd,
      budgetSpentUsd: 0,
      createdAt: now,
      absoluteExpiresAt: now + SERVICE_MAX_LIFETIME_MS,
    };
    await this.kv.put(`token:${token}`, JSON.stringify(data), {
      expirationTtl: Math.ceil(SERVICE_MAX_LIFETIME_MS / 1000),
    });

    index.push(token);
    await this.kv.put(`svc_index:${keyHash}`, JSON.stringify(index));

    return { token };
  }

  async resolve(token: string): Promise<TokenResolution> {
    const raw = await this.kv.get(`token:${token}`);
    if (!raw) {
      return { valid: false, error: "Token not found." };
    }

    const data = JSON.parse(raw) as TokenData;
    const now = Date.now();

    if (now > data.absoluteExpiresAt) {
      await this.kv.delete(`token:${token}`);
      return { valid: false, error: "Token has expired. Re-authenticate with your API key." };
    }

    // Session: check idle expiry and extend sliding window
    if (data.type === "session") {
      if (now > data.lastUsedAt + data.idleTtlMs) {
        await this.kv.delete(`token:${token}`);
        return { valid: false, error: "Session expired due to inactivity. Re-authenticate with your API key." };
      }
      data.lastUsedAt = now;
      const remainingTtl = Math.max(1, Math.ceil((data.absoluteExpiresAt - now) / 1000));
      await this.kv.put(`token:${token}`, JSON.stringify(data), { expirationTtl: remainingTtl });
    }

    const apiKey = decrypt(data.apiKeyEncrypted, this.secret);
    return { valid: true, apiKey, tokenType: data.type, apiKeyHash: data.apiKeyHash };
  }

  async isSessionToken(token: string): Promise<boolean> {
    const raw = await this.kv.get(`token:${token}`);
    if (!raw) return false;
    return (JSON.parse(raw) as TokenData).type === "session";
  }

  async checkScope(token: string, toolName: string): Promise<{ allowed: boolean; error?: string }> {
    const raw = await this.kv.get(`token:${token}`);
    if (!raw) return { allowed: true };
    const data = JSON.parse(raw) as TokenData;
    if (data.type !== "service" || !data.scopes) return { allowed: true };
    if (data.scopes.includes(toolName)) return { allowed: true };
    return {
      allowed: false,
      error: `Service token does not have scope for tool '${toolName}'. Allowed: ${data.scopes.join(", ")}.`,
    };
  }

  async checkBudget(token: string, amountUsd: number): Promise<{ allowed: boolean; error?: string }> {
    const raw = await this.kv.get(`token:${token}`);
    if (!raw) return { allowed: true };
    const data = JSON.parse(raw) as TokenData;
    if (data.type !== "service" || data.budgetLimitUsd === null) return { allowed: true };
    if (data.budgetSpentUsd + amountUsd > data.budgetLimitUsd) {
      const remaining = data.budgetLimitUsd - data.budgetSpentUsd;
      return {
        allowed: false,
        error: `Service token budget exceeded. Limit: $${data.budgetLimitUsd.toFixed(2)}, remaining: $${remaining.toFixed(2)}.`,
      };
    }
    return { allowed: true };
  }

  async recordSpend(token: string, amountUsd: number): Promise<void> {
    const raw = await this.kv.get(`token:${token}`);
    if (!raw) return;
    const data = JSON.parse(raw) as TokenData;
    if (data.type !== "service") return;
    data.budgetSpentUsd += amountUsd;
    const remainingTtl = Math.max(1, Math.ceil((data.absoluteExpiresAt - Date.now()) / 1000));
    await this.kv.put(`token:${token}`, JSON.stringify(data), { expirationTtl: remainingTtl });
  }

  async listServiceTokens(apiKeyHash: string): Promise<
    Array<{
      token: string;
      name: string;
      scopes: string[] | null;
      budgetLimitUsd: number | null;
      budgetSpentUsd: number;
      createdAt: number;
      absoluteExpiresAt: number;
    }>
  > {
    const index = await this.getServiceIndex(apiKeyHash);
    const results = [];
    for (const token of index) {
      const raw = await this.kv.get(`token:${token}`);
      if (raw) {
        const data = JSON.parse(raw) as ServiceTokenData;
        if (data.type === "service") {
          results.push({
            token,
            name: data.name,
            scopes: data.scopes,
            budgetLimitUsd: data.budgetLimitUsd,
            budgetSpentUsd: data.budgetSpentUsd,
            createdAt: data.createdAt,
            absoluteExpiresAt: data.absoluteExpiresAt,
          });
        }
      }
    }
    return results;
  }

  async revoke(token: string): Promise<boolean> {
    const raw = await this.kv.get(`token:${token}`);
    if (!raw) return false;
    const data = JSON.parse(raw) as TokenData;
    await this.kv.delete(`token:${token}`);
    if (data.type === "service") {
      await this.removeFromIndex(data.apiKeyHash, token);
    }
    return true;
  }

  async revokeByName(apiKeyHash: string, name: string): Promise<boolean> {
    const index = await this.getServiceIndex(apiKeyHash);
    for (const token of index) {
      const raw = await this.kv.get(`token:${token}`);
      if (raw) {
        const data = JSON.parse(raw) as ServiceTokenData;
        if (data.name === name) {
          await this.kv.delete(`token:${token}`);
          await this.removeFromIndex(apiKeyHash, token);
          return true;
        }
      }
    }
    return false;
  }

  private async getServiceIndex(apiKeyHash: string): Promise<string[]> {
    const raw = await this.kv.get(`svc_index:${apiKeyHash}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  private async removeFromIndex(apiKeyHash: string, token: string): Promise<void> {
    const index = await this.getServiceIndex(apiKeyHash);
    const updated = index.filter((t) => t !== token);
    if (updated.length === 0) {
      await this.kv.delete(`svc_index:${apiKeyHash}`);
    } else {
      await this.kv.put(`svc_index:${apiKeyHash}`, JSON.stringify(updated));
    }
  }
}
