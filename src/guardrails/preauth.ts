import { area as turfArea } from "@turf/turf";
import { booleanContains } from "@turf/turf";

export interface PreAuthPolicy {
  enabled: boolean;
  maxOrderPriceUsd: number;
  monthlySpendLimitUsd: number;
  allowedAoiPolygon: GeoJSON.Polygon | null;
}

export interface PreAuthState {
  monthlySpendUsd: number;
  monthKey: string; // "YYYY-MM"
}

export interface PreAuthCheckResult {
  approved: boolean;
  preAuthorized: boolean;
  error?: string;
  remainingBudget?: {
    perOrder: number;
    monthly: number;
  };
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class PreAuthEngine {
  private policy: PreAuthPolicy;
  private state: PreAuthState;

  constructor(policy: PreAuthPolicy) {
    this.policy = policy;
    this.state = {
      monthlySpendUsd: 0,
      monthKey: currentMonthKey(),
    };
  }

  private resetIfNewMonth(): void {
    const key = currentMonthKey();
    if (this.state.monthKey !== key) {
      this.state.monthlySpendUsd = 0;
      this.state.monthKey = key;
    }
  }

  check(orderPriceUsd: number, orderAoi: GeoJSON.Polygon): PreAuthCheckResult {
    if (!this.policy.enabled) {
      return { approved: false, preAuthorized: false, error: "Pre-authorized mode is not enabled." };
    }

    this.resetIfNewMonth();

    // Check per-order price ceiling
    if (orderPriceUsd > this.policy.maxOrderPriceUsd) {
      return {
        approved: false,
        preAuthorized: false,
        error:
          `Order price ($${orderPriceUsd.toFixed(2)}) exceeds the pre-authorized per-order ceiling ` +
          `of $${this.policy.maxOrderPriceUsd.toFixed(2)}.`,
      };
    }

    // Check monthly spend limit
    if (this.state.monthlySpendUsd + orderPriceUsd > this.policy.monthlySpendLimitUsd) {
      const remaining = this.policy.monthlySpendLimitUsd - this.state.monthlySpendUsd;
      return {
        approved: false,
        preAuthorized: false,
        error:
          `Order would exceed the monthly pre-authorized spend limit of ` +
          `$${this.policy.monthlySpendLimitUsd.toFixed(2)}. ` +
          `Remaining budget: $${remaining.toFixed(2)}.`,
      };
    }

    // Check AOI boundary
    if (this.policy.allowedAoiPolygon) {
      const contained = booleanContains(this.policy.allowedAoiPolygon, orderAoi);
      if (!contained) {
        return {
          approved: false,
          preAuthorized: false,
          error: "The order AOI falls outside the pre-authorized geographic boundary.",
        };
      }
    }

    return {
      approved: true,
      preAuthorized: true,
      remainingBudget: {
        perOrder: this.policy.maxOrderPriceUsd,
        monthly: this.policy.monthlySpendLimitUsd - this.state.monthlySpendUsd - orderPriceUsd,
      },
    };
  }

  recordSpend(amountUsd: number): void {
    this.resetIfNewMonth();
    this.state.monthlySpendUsd += amountUsd;
  }

  getStatus(): {
    enabled: boolean;
    monthlySpendUsd: number;
    monthlyLimitUsd: number;
    remainingMonthlyUsd: number;
    maxOrderPriceUsd: number;
    hasAoiBoundary: boolean;
  } {
    this.resetIfNewMonth();
    return {
      enabled: this.policy.enabled,
      monthlySpendUsd: this.state.monthlySpendUsd,
      monthlyLimitUsd: this.policy.monthlySpendLimitUsd,
      remainingMonthlyUsd: this.policy.monthlySpendLimitUsd - this.state.monthlySpendUsd,
      maxOrderPriceUsd: this.policy.maxOrderPriceUsd,
      hasAoiBoundary: this.policy.allowedAoiPolygon !== null,
    };
  }
}
