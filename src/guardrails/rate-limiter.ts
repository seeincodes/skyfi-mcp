export interface RateLimitConfig {
  maxPerMinute: number;
  burstMax: number;
  burstWindowMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxPerMinute: 100,
  burstMax: 20,
  burstWindowMs: 10_000,
};

interface WindowCounter {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  quotaType?: "rate_limit" | "burst_limit";
  retryAfterMs?: number;
  message?: string;
}

export class RateLimiter {
  private minuteCounters = new Map<string, WindowCounter>();
  private burstCounters = new Map<string, WindowCounter>();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = config;
  }

  check(apiKeyHash: string): RateLimitResult {
    const now = Date.now();

    // Check burst limit (20 calls / 10s)
    const burstResult = this.checkWindow(
      this.burstCounters,
      apiKeyHash,
      now,
      this.config.burstWindowMs,
      this.config.burstMax,
    );
    if (!burstResult.allowed) {
      return {
        allowed: false,
        quotaType: "burst_limit",
        retryAfterMs: burstResult.retryAfterMs,
        message: `Burst rate limit exceeded (${this.config.burstMax} calls per ${this.config.burstWindowMs / 1000}s). Slow down request frequency.`,
      };
    }

    // Check minute limit (100 calls / 60s)
    const minuteResult = this.checkWindow(
      this.minuteCounters,
      apiKeyHash,
      now,
      60_000,
      this.config.maxPerMinute,
    );
    if (!minuteResult.allowed) {
      return {
        allowed: false,
        quotaType: "rate_limit",
        retryAfterMs: minuteResult.retryAfterMs,
        message: `Rate limit exceeded (${this.config.maxPerMinute} calls per minute). Try again after the retry period.`,
      };
    }

    return { allowed: true };
  }

  record(apiKeyHash: string): void {
    const now = Date.now();
    this.incrementWindow(this.burstCounters, apiKeyHash, now, this.config.burstWindowMs);
    this.incrementWindow(this.minuteCounters, apiKeyHash, now, 60_000);
  }

  private checkWindow(
    counters: Map<string, WindowCounter>,
    key: string,
    now: number,
    windowMs: number,
    max: number,
  ): { allowed: boolean; retryAfterMs?: number } {
    const counter = counters.get(key);
    if (!counter || now - counter.windowStart >= windowMs) {
      return { allowed: true };
    }
    if (counter.count >= max) {
      const retryAfterMs = windowMs - (now - counter.windowStart);
      return { allowed: false, retryAfterMs };
    }
    return { allowed: true };
  }

  private incrementWindow(
    counters: Map<string, WindowCounter>,
    key: string,
    now: number,
    windowMs: number,
  ): void {
    const counter = counters.get(key);
    if (!counter || now - counter.windowStart >= windowMs) {
      counters.set(key, { count: 1, windowStart: now });
    } else {
      counter.count++;
    }
  }
}
