import type { SkyFiConfig } from "../types/config.js";

const API_KEY_MIN_LENGTH = 8;
const API_KEY_MAX_LENGTH = 256;
// Reject control characters and whitespace beyond basic ASCII printable
const VALID_KEY_PATTERN = /^[\x21-\x7e]+$/;

export interface HeaderAuthResult {
  valid: boolean;
  config?: SkyFiConfig;
  error?: string;
}

export function extractAndValidateApiKey(
  headerValue: string | string[] | undefined,
  defaults: {
    api_base_url?: string;
    api_version?: string;
    simulate?: boolean;
  } = {},
): HeaderAuthResult {
  if (!headerValue || (Array.isArray(headerValue) && headerValue.length === 0)) {
    return {
      valid: false,
      error: "Missing X-SkyFi-API-Key header. Provide a valid SkyFi API key.",
    };
  }

  const key = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (key.length < API_KEY_MIN_LENGTH) {
    return {
      valid: false,
      error: "Malformed API key: too short.",
    };
  }

  if (key.length > API_KEY_MAX_LENGTH) {
    return {
      valid: false,
      error: "Malformed API key: exceeds maximum length.",
    };
  }

  if (!VALID_KEY_PATTERN.test(key)) {
    return {
      valid: false,
      error: "Malformed API key: contains invalid characters.",
    };
  }

  return {
    valid: true,
    config: {
      api_key: key,
      api_base_url: defaults.api_base_url ?? "https://app.skyfi.com/platform-api",
      api_version: defaults.api_version ?? "2026-03",
      simulate: defaults.simulate ?? false,
    },
  };
}
