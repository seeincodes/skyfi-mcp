export interface AbuseControlConfig {
  dailyOrderCap: number;
  dailySpendCapUsd: number;
  quoteAlertThreshold: number; // quotes per hour without execute
  geoAnomalyCountryThreshold: number; // distinct countries per hour
}

export const DEFAULT_ABUSE_CONFIG: AbuseControlConfig = {
  dailyOrderCap: 10,
  dailySpendCapUsd: 10_000,
  quoteAlertThreshold: 20,
  geoAnomalyCountryThreshold: 10,
};

interface DailyCounter {
  count: number;
  spendUsd: number;
  dayKey: string;
}

interface HourlyQuoteTracker {
  quoteCount: number;
  executeCount: number;
  hourKey: string;
}

interface HourlyGeoTracker {
  countries: Set<string>;
  hourKey: string;
}

export interface AbuseCheckResult {
  allowed: boolean;
  quotaType?: string;
  message?: string;
  alert?: string;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function hourKey(): string {
  return new Date().toISOString().slice(0, 13);
}

export class AbuseController {
  private dailyCounters = new Map<string, DailyCounter>();
  private quoteTrackers = new Map<string, HourlyQuoteTracker>();
  private geoTrackers = new Map<string, HourlyGeoTracker>();
  private readonly config: AbuseControlConfig;

  constructor(config: AbuseControlConfig = DEFAULT_ABUSE_CONFIG) {
    this.config = config;
  }

  private getDailyCounter(apiKeyHash: string): DailyCounter {
    const dk = dayKey();
    const existing = this.dailyCounters.get(apiKeyHash);
    if (existing && existing.dayKey === dk) return existing;
    const fresh: DailyCounter = { count: 0, spendUsd: 0, dayKey: dk };
    this.dailyCounters.set(apiKeyHash, fresh);
    return fresh;
  }

  private getQuoteTracker(apiKeyHash: string): HourlyQuoteTracker {
    const hk = hourKey();
    const existing = this.quoteTrackers.get(apiKeyHash);
    if (existing && existing.hourKey === hk) return existing;
    const fresh: HourlyQuoteTracker = { quoteCount: 0, executeCount: 0, hourKey: hk };
    this.quoteTrackers.set(apiKeyHash, fresh);
    return fresh;
  }

  private getGeoTracker(apiKeyHash: string): HourlyGeoTracker {
    const hk = hourKey();
    const existing = this.geoTrackers.get(apiKeyHash);
    if (existing && existing.hourKey === hk) return existing;
    const fresh: HourlyGeoTracker = { countries: new Set(), hourKey: hk };
    this.geoTrackers.set(apiKeyHash, fresh);
    return fresh;
  }

  checkOrder(apiKeyHash: string, priceUsd: number): AbuseCheckResult {
    const counter = this.getDailyCounter(apiKeyHash);

    if (counter.count >= this.config.dailyOrderCap) {
      return {
        allowed: false,
        quotaType: "daily_order_cap",
        message: `Daily order cap reached (${this.config.dailyOrderCap} orders/day). Try again tomorrow.`,
      };
    }

    if (counter.spendUsd + priceUsd > this.config.dailySpendCapUsd) {
      const remaining = this.config.dailySpendCapUsd - counter.spendUsd;
      return {
        allowed: false,
        quotaType: "daily_spend_cap",
        message:
          `Daily spend cap would be exceeded ($${this.config.dailySpendCapUsd.toLocaleString()}/day). ` +
          `Remaining: $${remaining.toFixed(2)}.`,
      };
    }

    return { allowed: true };
  }

  recordOrder(apiKeyHash: string, priceUsd: number): void {
    const counter = this.getDailyCounter(apiKeyHash);
    counter.count++;
    counter.spendUsd += priceUsd;
  }

  recordQuote(apiKeyHash: string): AbuseCheckResult {
    const tracker = this.getQuoteTracker(apiKeyHash);
    tracker.quoteCount++;

    if (
      tracker.quoteCount > this.config.quoteAlertThreshold &&
      tracker.executeCount === 0
    ) {
      return {
        allowed: true,
        alert: `Anomaly: ${tracker.quoteCount} quotes generated in the current hour without any execute. Possible pricing enumeration.`,
      };
    }

    return { allowed: true };
  }

  recordExecute(apiKeyHash: string): void {
    const tracker = this.getQuoteTracker(apiKeyHash);
    tracker.executeCount++;
  }

  recordCountry(apiKeyHash: string, countryCode: string): AbuseCheckResult {
    const tracker = this.getGeoTracker(apiKeyHash);
    tracker.countries.add(countryCode);

    if (tracker.countries.size > this.config.geoAnomalyCountryThreshold) {
      return {
        allowed: true,
        alert: `Geographic anomaly: ${tracker.countries.size} distinct countries in the current hour from a single key.`,
      };
    }

    return { allowed: true };
  }

  getDailyStatus(apiKeyHash: string): { ordersToday: number; spendToday: number } {
    const counter = this.getDailyCounter(apiKeyHash);
    return { ordersToday: counter.count, spendToday: counter.spendUsd };
  }
}
