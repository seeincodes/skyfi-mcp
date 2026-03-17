import { encrypt, decrypt, hmacHash, generateToken } from "./crypto.js";

export interface SessionTokenData {
  type: "session";
  apiKeyEncrypted: string;
  apiKeyHash: string;
  createdAt: number;
  lastUsedAt: number;
  idleTtlMs: number;
  absoluteExpiresAt: number;
}

export interface ServiceTokenData {
  type: "service";
  apiKeyEncrypted: string;
  apiKeyHash: string;
  name: string;
  scopes: string[] | null;
  budgetLimitUsd: number | null;
  budgetSpentUsd: number;
  createdAt: number;
  absoluteExpiresAt: number;
}

type TokenData = SessionTokenData | ServiceTokenData;

export interface TokenResolution {
  valid: boolean;
  apiKey?: string;
  tokenType?: "session" | "service";
  apiKeyHash?: string;
  error?: string;
}

const SESSION_IDLE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SERVICE_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export class TokenStore {
  private tokens = new Map<string, TokenData>();
  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  issueSessionToken(apiKey: string): string {
    const token = generateToken("mcp_sess_");
    const now = Date.now();
    this.tokens.set(token, {
      type: "session",
      apiKeyEncrypted: encrypt(apiKey, this.secret),
      apiKeyHash: hmacHash(apiKey, this.secret),
      createdAt: now,
      lastUsedAt: now,
      idleTtlMs: SESSION_IDLE_TTL_MS,
      absoluteExpiresAt: now + SESSION_MAX_LIFETIME_MS,
    });
    return token;
  }

  issueServiceToken(
    apiKey: string,
    name: string,
    scopes: string[] | null = null,
    budgetLimitUsd: number | null = null,
  ): string {
    const token = generateToken("mcp_svc_");
    const now = Date.now();
    this.tokens.set(token, {
      type: "service",
      apiKeyEncrypted: encrypt(apiKey, this.secret),
      apiKeyHash: hmacHash(apiKey, this.secret),
      name,
      scopes,
      budgetLimitUsd,
      budgetSpentUsd: 0,
      createdAt: now,
      absoluteExpiresAt: now + SERVICE_MAX_LIFETIME_MS,
    });
    return token;
  }

  resolve(token: string): TokenResolution {
    const data = this.tokens.get(token);
    if (!data) {
      return { valid: false, error: "Token not found." };
    }

    const now = Date.now();

    // Check absolute expiry
    if (now > data.absoluteExpiresAt) {
      this.tokens.delete(token);
      return { valid: false, error: "Token has expired. Re-authenticate with your API key." };
    }

    // Session-specific: check idle expiry
    if (data.type === "session") {
      if (now > data.lastUsedAt + data.idleTtlMs) {
        this.tokens.delete(token);
        return { valid: false, error: "Session expired due to inactivity. Re-authenticate with your API key." };
      }
      // Extend idle window
      data.lastUsedAt = now;
    }

    const apiKey = decrypt(data.apiKeyEncrypted, this.secret);
    return {
      valid: true,
      apiKey,
      tokenType: data.type,
      apiKeyHash: data.apiKeyHash,
    };
  }

  checkScope(token: string, toolName: string): { allowed: boolean; error?: string } {
    const data = this.tokens.get(token);
    if (!data || data.type !== "service") return { allowed: true };
    if (!data.scopes) return { allowed: true }; // null = all scopes
    if (data.scopes.includes(toolName)) return { allowed: true };
    return {
      allowed: false,
      error: `Service token does not have scope for tool '${toolName}'. Allowed: ${data.scopes.join(", ")}.`,
    };
  }

  checkBudget(token: string, amountUsd: number): { allowed: boolean; error?: string } {
    const data = this.tokens.get(token);
    if (!data || data.type !== "service") return { allowed: true };
    if (data.budgetLimitUsd === null) return { allowed: true };
    if (data.budgetSpentUsd + amountUsd > data.budgetLimitUsd) {
      const remaining = data.budgetLimitUsd - data.budgetSpentUsd;
      return {
        allowed: false,
        error: `Service token budget exceeded. Limit: $${data.budgetLimitUsd.toFixed(2)}, remaining: $${remaining.toFixed(2)}.`,
      };
    }
    return { allowed: true };
  }

  recordSpend(token: string, amountUsd: number): void {
    const data = this.tokens.get(token);
    if (data?.type === "service") {
      data.budgetSpentUsd += amountUsd;
    }
  }

  listServiceTokens(apiKeyHash: string): Array<{
    token: string;
    name: string;
    scopes: string[] | null;
    budgetLimitUsd: number | null;
    budgetSpentUsd: number;
    createdAt: number;
    absoluteExpiresAt: number;
  }> {
    const results: Array<{
      token: string;
      name: string;
      scopes: string[] | null;
      budgetLimitUsd: number | null;
      budgetSpentUsd: number;
      createdAt: number;
      absoluteExpiresAt: number;
    }> = [];
    for (const [token, data] of this.tokens) {
      if (data.type === "service" && data.apiKeyHash === apiKeyHash) {
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
    return results;
  }

  revoke(token: string): boolean {
    return this.tokens.delete(token);
  }

  revokeByName(apiKeyHash: string, name: string): boolean {
    for (const [token, data] of this.tokens) {
      if (data.type === "service" && data.apiKeyHash === apiKeyHash && data.name === name) {
        this.tokens.delete(token);
        return true;
      }
    }
    return false;
  }
}
