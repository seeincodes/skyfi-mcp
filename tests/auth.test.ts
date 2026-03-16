import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, loadConfigFromEnv, resolveConfig, ConfigError } from "../src/auth/index.js";

const TEST_DIR = join(tmpdir(), "skyfi-mcp-test-" + Date.now());
const CONFIG_PATH = join(TEST_DIR, "config.json");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  delete process.env.SKYFI_API_KEY;
  delete process.env.SKYFI_API_BASE_URL;
  delete process.env.SKYFI_API_VERSION;
  delete process.env.SKYFI_SIMULATE;
});

describe("loadConfig", () => {
  it("reads a valid config file", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ api_key: "sk_test_123" }));
    const config = loadConfig(CONFIG_PATH);
    expect(config.api_key).toBe("sk_test_123");
    expect(config.api_base_url).toBe("https://app.skyfi.com/platform-api");
    expect(config.api_version).toBe("2026-03");
    expect(config.simulate).toBe(false);
  });

  it("reads config with all fields", () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        api_key: "sk_full_456",
        api_base_url: "https://staging.skyfi.com/api",
        api_version: "2026-04",
        simulate: true,
      }),
    );
    const config = loadConfig(CONFIG_PATH);
    expect(config.api_key).toBe("sk_full_456");
    expect(config.api_base_url).toBe("https://staging.skyfi.com/api");
    expect(config.api_version).toBe("2026-04");
    expect(config.simulate).toBe(true);
  });

  it("throws ConfigError when file does not exist", () => {
    expect(() => loadConfig("/nonexistent/path/config.json")).toThrow(ConfigError);
    expect(() => loadConfig("/nonexistent/path/config.json")).toThrow("Config file not found");
  });

  it("throws ConfigError for invalid JSON", () => {
    writeFileSync(CONFIG_PATH, "not json {{{");
    expect(() => loadConfig(CONFIG_PATH)).toThrow(ConfigError);
    expect(() => loadConfig(CONFIG_PATH)).toThrow("invalid JSON");
  });

  it("throws ConfigError when api_key is missing", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({}));
    expect(() => loadConfig(CONFIG_PATH)).toThrow(ConfigError);
    expect(() => loadConfig(CONFIG_PATH)).toThrow("Invalid config");
  });

  it("throws ConfigError when api_key is empty", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ api_key: "" }));
    expect(() => loadConfig(CONFIG_PATH)).toThrow(ConfigError);
    expect(() => loadConfig(CONFIG_PATH)).toThrow("api_key");
  });
});

describe("loadConfigFromEnv", () => {
  it("returns config from env vars", () => {
    process.env.SKYFI_API_KEY = "sk_env_789";
    const config = loadConfigFromEnv();
    expect(config).not.toBeNull();
    expect(config!.api_key).toBe("sk_env_789");
  });

  it("returns null when SKYFI_API_KEY is not set", () => {
    const config = loadConfigFromEnv();
    expect(config).toBeNull();
  });

  it("respects SKYFI_SIMULATE=true", () => {
    process.env.SKYFI_API_KEY = "sk_sim_test";
    process.env.SKYFI_SIMULATE = "true";
    const config = loadConfigFromEnv();
    expect(config!.simulate).toBe(true);
  });
});

describe("resolveConfig", () => {
  it("prefers env vars over config file", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ api_key: "sk_file" }));
    process.env.SKYFI_API_KEY = "sk_env";
    const config = resolveConfig(CONFIG_PATH);
    expect(config.api_key).toBe("sk_env");
  });

  it("falls back to config file when env is empty", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ api_key: "sk_fallback" }));
    const config = resolveConfig(CONFIG_PATH);
    expect(config.api_key).toBe("sk_fallback");
  });
});
