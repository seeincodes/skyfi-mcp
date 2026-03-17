export interface UsageEvent {
  apiKeyHash: string;
  tokenType: "session" | "service";
  tool: string;
  status: "success" | "error";
  durationMs: number;
  resultedInOrder: boolean;
  orderPriceUsd: number | null;
  simulated: boolean;
  timestamp: number;
}

interface DailyUsage {
  toolCalls: number;
  orders: number;
  spendUsd: number;
  tools: Record<string, number>;
}

export class UsageLogger {
  private events: UsageEvent[] = [];
  private dailyAggregates = new Map<string, DailyUsage>();
  private readonly maxEvents: number;

  constructor(maxEvents = 50_000) {
    this.maxEvents = maxEvents;
  }

  private dayKey(apiKeyHash: string, timestamp: number): string {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    return `${apiKeyHash}:${date}`;
  }

  log(event: UsageEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update daily aggregate
    const dk = this.dayKey(event.apiKeyHash, event.timestamp);
    let agg = this.dailyAggregates.get(dk);
    if (!agg) {
      agg = { toolCalls: 0, orders: 0, spendUsd: 0, tools: {} };
      this.dailyAggregates.set(dk, agg);
    }
    agg.toolCalls++;
    agg.tools[event.tool] = (agg.tools[event.tool] ?? 0) + 1;
    if (event.resultedInOrder) {
      agg.orders++;
      agg.spendUsd += event.orderPriceUsd ?? 0;
    }
  }

  getDaily(apiKeyHash: string, date: string): DailyUsage | null {
    return this.dailyAggregates.get(`${apiKeyHash}:${date}`) ?? null;
  }

  getConversionFunnel(apiKeyHash: string, date: string): {
    searches: number;
    estimates: number;
    quotes: number;
    executes: number;
  } {
    const agg = this.getDaily(apiKeyHash, date);
    if (!agg) return { searches: 0, estimates: 0, quotes: 0, executes: 0 };
    return {
      searches: (agg.tools["search_archive"] ?? 0) + (agg.tools["explore_open_data"] ?? 0),
      estimates: (agg.tools["estimate_archive_price"] ?? 0) + (agg.tools["estimate_tasking_cost"] ?? 0),
      quotes: (agg.tools["quote_archive_order"] ?? 0) + (agg.tools["quote_tasking_order"] ?? 0),
      executes: (agg.tools["execute_archive_order"] ?? 0) + (agg.tools["execute_tasking_order"] ?? 0),
    };
  }

  getRecentEvents(limit = 100): UsageEvent[] {
    return this.events.slice(-limit);
  }
}
