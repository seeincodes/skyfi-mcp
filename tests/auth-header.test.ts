import { describe, it, expect } from "vitest";
import { extractAndValidateApiKey } from "../src/auth/header.js";

describe("header auth extraction", () => {
  it("accepts a valid API key", () => {
    const result = extractAndValidateApiKey("sk_test_valid_key_12345");
    expect(result.valid).toBe(true);
    expect(result.config?.api_key).toBe("sk_test_valid_key_12345");
    expect(result.config?.api_base_url).toBe("https://app.skyfi.com/platform-api");
  });

  it("rejects undefined header", () => {
    const result = extractAndValidateApiKey(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing");
  });

  it("rejects empty string", () => {
    const result = extractAndValidateApiKey("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing");
  });

  it("rejects empty array", () => {
    const result = extractAndValidateApiKey([]);
    expect(result.valid).toBe(false);
  });

  it("rejects key shorter than minimum", () => {
    const result = extractAndValidateApiKey("short");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too short");
  });

  it("rejects key exceeding max length", () => {
    const result = extractAndValidateApiKey("a".repeat(257));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("maximum length");
  });

  it("rejects key with control characters", () => {
    const result = extractAndValidateApiKey("sk_test_\x00key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid characters");
  });

  it("rejects key with spaces", () => {
    const result = extractAndValidateApiKey("sk test key 123");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid characters");
  });

  it("uses custom defaults when provided", () => {
    const result = extractAndValidateApiKey("sk_custom_key_123", {
      api_base_url: "https://staging.skyfi.com/api",
      api_version: "2026-04",
      simulate: true,
    });
    expect(result.valid).toBe(true);
    expect(result.config?.api_base_url).toBe("https://staging.skyfi.com/api");
    expect(result.config?.api_version).toBe("2026-04");
    expect(result.config?.simulate).toBe(true);
  });

  it("extracts first value from string array", () => {
    const result = extractAndValidateApiKey(["sk_array_key_123", "ignored"]);
    expect(result.valid).toBe(true);
    expect(result.config?.api_key).toBe("sk_array_key_123");
  });
});

describe("per-request credential isolation", () => {
  it("different headers produce different configs", () => {
    const result1 = extractAndValidateApiKey("sk_tenant_a_key");
    const result2 = extractAndValidateApiKey("sk_tenant_b_key");

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result1.config?.api_key).toBe("sk_tenant_a_key");
    expect(result2.config?.api_key).toBe("sk_tenant_b_key");
    expect(result1.config?.api_key).not.toBe(result2.config?.api_key);
  });

  it("configs are independent objects (no shared reference)", () => {
    const result1 = extractAndValidateApiKey("sk_independent_a");
    const result2 = extractAndValidateApiKey("sk_independent_b");

    expect(result1.config).not.toBe(result2.config);
    // Mutating one should not affect the other
    if (result1.config && result2.config) {
      result1.config.api_key = "mutated";
      expect(result2.config.api_key).toBe("sk_independent_b");
    }
  });

  it("concurrent extraction produces isolated results", () => {
    const keys = Array.from({ length: 100 }, (_, i) => `sk_concurrent_${i.toString().padStart(3, "0")}`);
    const results = keys.map((k) => extractAndValidateApiKey(k));

    for (let i = 0; i < keys.length; i++) {
      expect(results[i].valid).toBe(true);
      expect(results[i].config?.api_key).toBe(keys[i]);
    }

    // Verify no two configs share the same reference
    const configSet = new Set(results.map((r) => r.config));
    expect(configSet.size).toBe(100);
  });
});
