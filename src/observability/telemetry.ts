export interface ToolCallEvent {
  tool: string;
  durationMs: number;
  status: "success" | "error";
  errorCode?: string;
  apiKeyHash: string;
  timestamp: number;
}

export interface DxMetrics {
  firstToolCallAt: number | null;
  quoteCount: number;
  executeCount: number;
  simulationCount: number;
  liveCount: number;
}

export class TelemetryCollector {
  private events: ToolCallEvent[] = [];
  private dxMetrics = new Map<string, DxMetrics>();
  private readonly maxEvents: number;

  constructor(maxEvents = 10_000) {
    this.maxEvents = maxEvents;
  }

  record(event: ToolCallEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update DX metrics
    const dx = this.getDxMetrics(event.apiKeyHash);
    if (!dx.firstToolCallAt) dx.firstToolCallAt = event.timestamp;

    if (event.tool.startsWith("quote_")) dx.quoteCount++;
    if (event.tool.startsWith("execute_")) dx.executeCount++;
  }

  recordSimulation(apiKeyHash: string): void {
    this.getDxMetrics(apiKeyHash).simulationCount++;
  }

  recordLive(apiKeyHash: string): void {
    this.getDxMetrics(apiKeyHash).liveCount++;
  }

  private getDxMetrics(apiKeyHash: string): DxMetrics {
    let dx = this.dxMetrics.get(apiKeyHash);
    if (!dx) {
      dx = { firstToolCallAt: null, quoteCount: 0, executeCount: 0, simulationCount: 0, liveCount: 0 };
      this.dxMetrics.set(apiKeyHash, dx);
    }
    return dx;
  }

  getStats(windowMs = 5 * 60 * 1000): {
    totalCalls: number;
    errorRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    toolBreakdown: Record<string, number>;
  } {
    const cutoff = Date.now() - windowMs;
    const recent = this.events.filter((e) => e.timestamp > cutoff);

    if (recent.length === 0) {
      return { totalCalls: 0, errorRate: 0, p50LatencyMs: 0, p95LatencyMs: 0, toolBreakdown: {} };
    }

    const errors = recent.filter((e) => e.status === "error").length;
    const durations = recent.map((e) => e.durationMs).sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;

    const breakdown: Record<string, number> = {};
    for (const e of recent) {
      breakdown[e.tool] = (breakdown[e.tool] ?? 0) + 1;
    }

    return {
      totalCalls: recent.length,
      errorRate: errors / recent.length,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      toolBreakdown: breakdown,
    };
  }

  getQuoteToExecuteRate(): number {
    let quotes = 0;
    let executes = 0;
    for (const dx of this.dxMetrics.values()) {
      quotes += dx.quoteCount;
      executes += dx.executeCount;
    }
    return quotes > 0 ? executes / quotes : 0;
  }

  getSimToLiveRate(): number {
    let sims = 0;
    let live = 0;
    for (const dx of this.dxMetrics.values()) {
      sims += dx.simulationCount;
      live += dx.liveCount;
    }
    return sims > 0 ? live / sims : 0;
  }

  checkAlerts(): string[] {
    const alerts: string[] = [];
    const stats = this.getStats();

    if (stats.totalCalls > 0 && stats.errorRate > 0.05) {
      alerts.push(`Error rate ${(stats.errorRate * 100).toFixed(1)}% exceeds 5% threshold`);
    }
    if (stats.p95LatencyMs > 5000) {
      alerts.push(`p95 latency ${stats.p95LatencyMs}ms exceeds 5s threshold`);
    }

    return alerts;
  }
}
