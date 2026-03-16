import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { SkyFiConfigSchema, type SkyFiConfig } from "../types/config.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".skyfi", "config.json");

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(configPath?: string): SkyFiConfig {
  const path = configPath ?? DEFAULT_CONFIG_PATH;

  if (!existsSync(path)) {
    throw new ConfigError(
      `Config file not found at ${path}. ` +
        `Create ${DEFAULT_CONFIG_PATH} with: { "api_key": "your-skyfi-api-key" }`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new ConfigError(`Cannot read config file at ${path}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Config file at ${path} contains invalid JSON.`);
  }

  const result = SkyFiConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new ConfigError(`Invalid config at ${path}:\n${issues}`);
  }

  return result.data;
}

export function loadConfigFromEnv(): SkyFiConfig | null {
  const apiKey = process.env.SKYFI_API_KEY;
  if (!apiKey) return null;

  const result = SkyFiConfigSchema.safeParse({
    api_key: apiKey,
    api_base_url: process.env.SKYFI_API_BASE_URL,
    api_version: process.env.SKYFI_API_VERSION,
    simulate: process.env.SKYFI_SIMULATE === "true",
  });

  if (!result.success) return null;
  return result.data;
}

export function resolveConfig(configPath?: string): SkyFiConfig {
  const envConfig = loadConfigFromEnv();
  if (envConfig) return envConfig;
  return loadConfig(configPath);
}
