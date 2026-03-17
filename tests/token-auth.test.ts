import { describe, it, expect, vi } from "vitest";
import { encrypt, decrypt, hmacHash, generateToken } from "../src/auth/crypto.js";
import { TokenStore } from "../src/auth/token-store.js";
import { UsageLogger } from "../src/observability/usage-logger.js";

const TEST_SECRET = "test-server-secret-32-chars-ok!";

describe("crypto", () => {
  it("encrypts and decrypts round-trip", () => {
    const key = "sk_test_my_secret_api_key_12345";
    const encrypted = encrypt(key, TEST_SECRET);
    expect(encrypted).not.toBe(key);
    expect(encrypted).not.toContain("sk_test");
    const decrypted = decrypt(encrypted, TEST_SECRET);
    expect(decrypted).toBe(key);
  });

  it("different encryptions of same value produce different ciphertexts (random IV)", () => {
    const key = "sk_test_same_key";
    const enc1 = encrypt(key, TEST_SECRET);
    const enc2 = encrypt(key, TEST_SECRET);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1, TEST_SECRET)).toBe(key);
    expect(decrypt(enc2, TEST_SECRET)).toBe(key);
  });

  it("decrypt with wrong secret fails", () => {
    const encrypted = encrypt("sk_test", TEST_SECRET);
    expect(() => decrypt(encrypted, "wrong-secret-32-chars-padding!!")).toThrow();
  });

  it("HMAC-SHA-256 is consistent for same input+secret", () => {
    const hash1 = hmacHash("sk_test_key", TEST_SECRET);
    const hash2 = hmacHash("sk_test_key", TEST_SECRET);
    expect(hash1).toBe(hash2);
  });

  it("HMAC-SHA-256 differs for different inputs", () => {
    const hash1 = hmacHash("sk_key_a", TEST_SECRET);
    const hash2 = hmacHash("sk_key_b", TEST_SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it("HMAC-SHA-256 differs for different secrets", () => {
    const hash1 = hmacHash("sk_test", TEST_SECRET);
    const hash2 = hmacHash("sk_test", "different-secret-32-chars-pad!!");
    expect(hash1).not.toBe(hash2);
  });

  it("generateToken produces correct prefix", () => {
    const sess = generateToken("mcp_sess_");
    const svc = generateToken("mcp_svc_");
    expect(sess).toMatch(/^mcp_sess_[0-9a-f]{32}$/);
    expect(svc).toMatch(/^mcp_svc_[0-9a-f]{32}$/);
  });

  it("generateToken produces unique values", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken("mcp_sess_")));
    expect(tokens.size).toBe(100);
  });
});

describe("TokenStore — session tokens", () => {
  it("issues and resolves a session token", () => {
    const store = new TokenStore(TEST_SECRET);
    const token = store.issueSessionToken("sk_test_123");
    expect(token).toMatch(/^mcp_sess_/);

    const result = store.resolve(token);
    expect(result.valid).toBe(true);
    expect(result.apiKey).toBe("sk_test_123");
    expect(result.tokenType).toBe("session");
    expect(result.apiKeyHash).toBeDefined();
  });

  it("rejects unknown token", () => {
    const store = new TokenStore(TEST_SECRET);
    const result = store.resolve("mcp_sess_nonexistent");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("expires after idle TTL", () => {
    const store = new TokenStore(TEST_SECRET);
    const token = store.issueSessionToken("sk_test_idle");

    vi.useFakeTimers();
    vi.advanceTimersByTime(5 * 60 * 60 * 1000); // 5 hours > 4hr idle TTL

    const result = store.resolve(token);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("inactivity");

    vi.useRealTimers();
  });

  it("extends idle TTL on each resolve", () => {
    const store = new TokenStore(TEST_SECRET);
    const token = store.issueSessionToken("sk_test_extend");

    vi.useFakeTimers();

    // Use at 3 hours (within 4hr idle)
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    expect(store.resolve(token).valid).toBe(true);

    // Use again at 6 hours (3hr since last use, within 4hr idle)
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    expect(store.resolve(token).valid).toBe(true);

    // Don't use for 5 hours — should expire
    vi.advanceTimersByTime(5 * 60 * 60 * 1000);
    expect(store.resolve(token).valid).toBe(false);

    vi.useRealTimers();
  });

  it("expires after absolute max lifetime (7 days)", () => {
    const store = new TokenStore(TEST_SECRET);
    const token = store.issueSessionToken("sk_test_max");

    vi.useFakeTimers();

    // Keep using it every hour for 7 days
    for (let i = 0; i < 7 * 24; i++) {
      vi.advanceTimersByTime(60 * 60 * 1000);
      store.resolve(token); // extend idle
    }

    // At 7 days + 1 hour, should be expired regardless of activity
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    const result = store.resolve(token);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");

    vi.useRealTimers();
  });
});

describe("TokenStore — service tokens", () => {
  it("issues and resolves a service token", () => {
    const store = new TokenStore(TEST_SECRET);
    const token = store.issueServiceToken("sk_test_svc", "nightly-monitor");
    expect(token).toMatch(/^mcp_svc_/);

    const result = store.resolve(token);
    expect(result.valid).toBe(true);
    expect(result.apiKey).toBe("sk_test_svc");
    expect(result.tokenType).toBe("service");
  });

  it("does not idle-expire", () => {
    const store = new TokenStore(TEST_SECRET);
    const token = store.issueServiceToken("sk_test_no_idle", "pipeline");

    vi.useFakeTimers();
    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000); // 30 days idle

    const result = store.resolve(token);
    expect(result.valid).toBe(true);

    vi.useRealTimers();
  });

  it("expires after 90-day absolute lifetime", () => {
    const store = new TokenStore(TEST_SECRET);
    const token = store.issueServiceToken("sk_test_90d", "batch");

    vi.useFakeTimers();
    vi.advanceTimersByTime(91 * 24 * 60 * 60 * 1000); // 91 days

    const result = store.resolve(token);
    expect(result.valid).toBe(false);

    vi.useRealTimers();
  });

  describe("scope enforcement", () => {
    it("allows tools within scope", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "scoped", ["search_archive", "geocode"]);
      expect(store.checkScope(token, "search_archive").allowed).toBe(true);
      expect(store.checkScope(token, "geocode").allowed).toBe(true);
    });

    it("denies tools outside scope", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "scoped", ["search_archive"]);
      const result = store.checkScope(token, "execute_archive_order");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("does not have scope");
    });

    it("null scopes allows all tools", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "unscoped", null);
      expect(store.checkScope(token, "execute_archive_order").allowed).toBe(true);
    });
  });

  describe("budget enforcement", () => {
    it("allows spend within budget", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "budgeted", null, 500);
      expect(store.checkBudget(token, 200).allowed).toBe(true);
    });

    it("rejects spend exceeding budget", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "budgeted", null, 500);
      store.recordSpend(token, 400);
      const result = store.checkBudget(token, 200);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("budget exceeded");
    });

    it("tracks cumulative spend", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "cumulative", null, 1000);
      store.recordSpend(token, 300);
      store.recordSpend(token, 300);
      expect(store.checkBudget(token, 300).allowed).toBe(true);
      expect(store.checkBudget(token, 500).allowed).toBe(false);
    });

    it("null budget allows unlimited spend", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "unlimited", null, null);
      expect(store.checkBudget(token, 999999).allowed).toBe(true);
    });
  });

  describe("management", () => {
    it("lists service tokens for a key", () => {
      const store = new TokenStore(TEST_SECRET);
      store.issueServiceToken("sk_key_a", "monitor-1");
      store.issueServiceToken("sk_key_a", "monitor-2");
      store.issueServiceToken("sk_key_b", "other");

      const hashA = hmacHash("sk_key_a", TEST_SECRET);
      const list = store.listServiceTokens(hashA);
      expect(list).toHaveLength(2);
      expect(list.map((t) => t.name).sort()).toEqual(["monitor-1", "monitor-2"]);
    });

    it("revokes by token string", () => {
      const store = new TokenStore(TEST_SECRET);
      const token = store.issueServiceToken("sk_test", "to-revoke");
      expect(store.resolve(token).valid).toBe(true);
      expect(store.revoke(token)).toBe(true);
      expect(store.resolve(token).valid).toBe(false);
    });

    it("revokes by name", () => {
      const store = new TokenStore(TEST_SECRET);
      store.issueServiceToken("sk_test", "named-token");
      const hash = hmacHash("sk_test", TEST_SECRET);
      expect(store.revokeByName(hash, "named-token")).toBe(true);
    });
  });
});

describe("TokenStore — tenant isolation", () => {
  it("different API keys produce different tokens", () => {
    const store = new TokenStore(TEST_SECRET);
    const t1 = store.issueSessionToken("sk_tenant_a");
    const t2 = store.issueSessionToken("sk_tenant_b");
    expect(t1).not.toBe(t2);

    const r1 = store.resolve(t1);
    const r2 = store.resolve(t2);
    expect(r1.apiKey).toBe("sk_tenant_a");
    expect(r2.apiKey).toBe("sk_tenant_b");
    expect(r1.apiKeyHash).not.toBe(r2.apiKeyHash);
  });

  it("tenant A token cannot access tenant B key", () => {
    const store = new TokenStore(TEST_SECRET);
    const tokenA = store.issueSessionToken("sk_tenant_a");
    const tokenB = store.issueSessionToken("sk_tenant_b");

    const resolvedA = store.resolve(tokenA);
    const resolvedB = store.resolve(tokenB);
    expect(resolvedA.apiKey).toBe("sk_tenant_a");
    expect(resolvedB.apiKey).toBe("sk_tenant_b");
  });

  it("service tokens are scoped to their creator's key", () => {
    const store = new TokenStore(TEST_SECRET);
    store.issueServiceToken("sk_tenant_a", "a-monitor");
    store.issueServiceToken("sk_tenant_b", "b-monitor");

    const hashA = hmacHash("sk_tenant_a", TEST_SECRET);
    const hashB = hmacHash("sk_tenant_b", TEST_SECRET);

    expect(store.listServiceTokens(hashA)).toHaveLength(1);
    expect(store.listServiceTokens(hashA)[0].name).toBe("a-monitor");
    expect(store.listServiceTokens(hashB)).toHaveLength(1);
    expect(store.listServiceTokens(hashB)[0].name).toBe("b-monitor");
  });
});

describe("UsageLogger", () => {
  it("logs and aggregates daily usage", () => {
    const logger = new UsageLogger();
    const hash = "test_hash";
    const today = new Date().toISOString().slice(0, 10);

    logger.log({
      apiKeyHash: hash, tokenType: "session", tool: "search_archive",
      status: "success", durationMs: 200, resultedInOrder: false,
      orderPriceUsd: null, simulated: false, timestamp: Date.now(),
    });
    logger.log({
      apiKeyHash: hash, tokenType: "session", tool: "quote_archive_order",
      status: "success", durationMs: 100, resultedInOrder: false,
      orderPriceUsd: null, simulated: false, timestamp: Date.now(),
    });
    logger.log({
      apiKeyHash: hash, tokenType: "session", tool: "execute_archive_order",
      status: "success", durationMs: 1500, resultedInOrder: true,
      orderPriceUsd: 45, simulated: false, timestamp: Date.now(),
    });

    const daily = logger.getDaily(hash, today);
    expect(daily).not.toBeNull();
    expect(daily!.toolCalls).toBe(3);
    expect(daily!.orders).toBe(1);
    expect(daily!.spendUsd).toBe(45);
  });

  it("tracks conversion funnel", () => {
    const logger = new UsageLogger();
    const hash = "funnel_hash";
    const today = new Date().toISOString().slice(0, 10);

    for (const tool of ["search_archive", "search_archive", "estimate_archive_price", "quote_archive_order", "execute_archive_order"]) {
      logger.log({
        apiKeyHash: hash, tokenType: "session", tool,
        status: "success", durationMs: 100, resultedInOrder: tool.startsWith("execute"),
        orderPriceUsd: tool.startsWith("execute") ? 45 : null,
        simulated: false, timestamp: Date.now(),
      });
    }

    const funnel = logger.getConversionFunnel(hash, today);
    expect(funnel.searches).toBe(2);
    expect(funnel.estimates).toBe(1);
    expect(funnel.quotes).toBe(1);
    expect(funnel.executes).toBe(1);
  });
});
