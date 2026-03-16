import type { Warning } from "../types/response.js";

export interface PricingLimits {
  warnThresholdUsd: number | null;
  hardLimitUsd: number | null;
}

export const DEFAULT_PRICING_LIMITS: PricingLimits = {
  warnThresholdUsd: 500,
  hardLimitUsd: null,
};

export interface PricingCheckResult {
  allowed: boolean;
  warnings: Warning[];
  error?: string;
}

export function checkPricing(
  priceUsd: number,
  limits: PricingLimits = DEFAULT_PRICING_LIMITS,
): PricingCheckResult {
  if (limits.hardLimitUsd !== null && priceUsd > limits.hardLimitUsd) {
    return {
      allowed: false,
      warnings: [],
      error:
        `Order price ($${priceUsd.toFixed(2)}) exceeds the hard limit ` +
        `of $${limits.hardLimitUsd.toFixed(2)} and cannot proceed.`,
    };
  }

  const warnings: Warning[] = [];
  if (limits.warnThresholdUsd !== null && priceUsd > limits.warnThresholdUsd) {
    warnings.push({
      code: "PRICE_THRESHOLD_EXCEEDED",
      message:
        `This order ($${priceUsd.toFixed(2)}) exceeds the $${limits.warnThresholdUsd.toFixed(2)} ` +
        `warning threshold. Please confirm the cost with the user before proceeding.`,
    });
  }

  return { allowed: true, warnings };
}
