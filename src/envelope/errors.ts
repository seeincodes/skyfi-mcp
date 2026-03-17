import type { ErrorDetail } from "../types/response.js";

interface ErrorDefinition {
  message: string;
  recoverable: boolean;
  retry_tool?: string;
}

const ERROR_REGISTRY: Record<string, ErrorDefinition> = {
  // Validation errors
  AOI_TOO_LARGE: {
    message: "The AOI exceeds the maximum allowed area. Reduce the polygon size or split into smaller regions.",
    recoverable: true,
  },
  AOI_TOO_SMALL: {
    message: "The AOI is below the minimum required area for the selected sensor.",
    recoverable: true,
  },
  INVALID_GEOMETRY: {
    message: "The provided geometry is malformed. Provide a valid GeoJSON polygon.",
    recoverable: true,
  },
  STRING_TOO_LONG: {
    message: "Input string exceeds the maximum allowed length of 500 characters.",
    recoverable: true,
  },
  INVALID_INPUT: {
    message: "One or more input parameters are invalid.",
    recoverable: true,
  },

  // Auth errors
  AUTH_MISSING: {
    message: "API key is missing. Provide a valid SkyFi API key.",
    recoverable: false,
  },
  AUTH_INVALID: {
    message: "The provided API key is invalid or has been revoked.",
    recoverable: false,
  },

  // Quote / order errors
  QUOTE_EXPIRED: {
    message: "The quote has expired. Please generate a new quote.",
    recoverable: true,
    retry_tool: "quote_archive_order",
  },
  QUOTE_NOT_FOUND: {
    message: "The specified quote_id was not found.",
    recoverable: true,
    retry_tool: "quote_archive_order",
  },
  CONFIRMATION_REQUIRED: {
    message: "Order execution requires a valid quote_id and user_confirmed: true.",
    recoverable: true,
  },
  IDEMPOTENCY_KEY_MISSING: {
    message: "An idempotency_key is required for order execution.",
    recoverable: true,
  },

  // Pricing guardrails
  PRICE_THRESHOLD_EXCEEDED: {
    message: "This order exceeds the configured price warning threshold. Confirm the cost with the user.",
    recoverable: true,
  },
  PRICE_HARD_LIMIT_EXCEEDED: {
    message: "This order exceeds the configured hard price limit and cannot proceed.",
    recoverable: false,
  },

  // Rate limiting / abuse
  RATE_LIMIT_EXCEEDED: {
    message: "Rate limit exceeded. Try again after the retry_after period.",
    recoverable: true,
  },
  BURST_LIMIT_EXCEEDED: {
    message: "Burst rate limit exceeded. Slow down request frequency.",
    recoverable: true,
  },
  DAILY_ORDER_CAP_EXCEEDED: {
    message: "Daily order cap reached. Try again tomorrow.",
    recoverable: false,
  },
  DAILY_SPEND_CAP_EXCEEDED: {
    message: "Daily spend cap reached. Try again tomorrow.",
    recoverable: false,
  },

  // Pre-auth errors
  PREAUTH_BUDGET_EXCEEDED: {
    message: "Order exceeds the pre-authorized per-order budget ceiling.",
    recoverable: false,
  },
  PREAUTH_MONTHLY_LIMIT_EXCEEDED: {
    message: "Monthly pre-authorized spend limit has been reached.",
    recoverable: false,
  },
  PREAUTH_AOI_OUT_OF_BOUNDS: {
    message: "The AOI falls outside the pre-authorized geographic boundary.",
    recoverable: false,
  },

  // Token auth errors
  TOKEN_EXPIRED: {
    message: "Token has expired. Re-authenticate by calling initialize with your API key.",
    recoverable: true,
    retry_tool: "initialize",
  },
  TOKEN_INVALID: {
    message: "The provided token is malformed or not recognized.",
    recoverable: false,
  },
  SCOPE_DENIED: {
    message: "This service token does not have permission to call the requested tool.",
    recoverable: false,
  },
  SERVICE_BUDGET_EXCEEDED: {
    message: "This service token has exceeded its configured spend limit.",
    recoverable: false,
  },

  // SkyFi API errors
  SKYFI_API_ERROR: {
    message: "The SkyFi API returned an error. Check the error details and try again.",
    recoverable: true,
  },
  SKYFI_API_RATE_LIMIT: {
    message: "SkyFi API rate limit hit. Retry after the indicated period.",
    recoverable: true,
  },
  SKYFI_API_UNAVAILABLE: {
    message: "SkyFi API is temporarily unavailable. Try again shortly.",
    recoverable: true,
  },

  // Geocoding errors
  GEOCODING_FAILED: {
    message: "Geocoding failed. Try providing coordinates directly instead of a place name.",
    recoverable: true,
  },
  GEOCODING_AMBIGUOUS: {
    message: "Multiple locations matched the query. Provide a more specific place name or coordinates.",
    recoverable: true,
  },

  // Webhook errors
  WEBHOOK_DELIVERY_FAILED: {
    message: "Webhook notification could not be delivered. The event has been queued.",
    recoverable: true,
  },

  // Simulation
  SIMULATION_ONLY: {
    message: "This operation is only available in simulation mode.",
    recoverable: false,
  },
};

export function makeError(code: string, overrideMessage?: string): ErrorDetail {
  const definition = ERROR_REGISTRY[code];
  if (!definition) {
    return {
      code: "UNKNOWN_ERROR",
      message: overrideMessage ?? "An unexpected error occurred.",
      recoverable: false,
    };
  }
  return {
    code,
    message: overrideMessage ?? definition.message,
    recoverable: definition.recoverable,
    ...(definition.retry_tool && { retry_tool: definition.retry_tool }),
  };
}

export function makeErrorWithRetry(
  code: string,
  retryTool: string,
  overrideMessage?: string,
): ErrorDetail {
  const base = makeError(code, overrideMessage);
  return { ...base, retry_tool: retryTool };
}

export { ERROR_REGISTRY };
