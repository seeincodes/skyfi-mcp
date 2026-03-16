export interface WebhookEvent {
  id: string;
  monitorId: string;
  type: "new_imagery" | "status_change";
  payload: Record<string, unknown>;
  createdAt: number;
  deliveredAt: number | null;
  attempts: number;
  lastAttemptAt: number | null;
  status: "pending" | "delivered" | "failed";
}

export class WebhookQueue {
  private events = new Map<string, WebhookEvent>();
  private counter = 0;

  enqueue(monitorId: string, type: WebhookEvent["type"], payload: Record<string, unknown>): string {
    const id = `evt_${++this.counter}_${Date.now()}`;
    this.events.set(id, {
      id,
      monitorId,
      type,
      payload,
      createdAt: Date.now(),
      deliveredAt: null,
      attempts: 0,
      lastAttemptAt: null,
      status: "pending",
    });
    return id;
  }

  getPending(monitorId?: string): WebhookEvent[] {
    const results: WebhookEvent[] = [];
    for (const event of this.events.values()) {
      if (event.status === "pending") {
        if (!monitorId || event.monitorId === monitorId) {
          results.push(event);
        }
      }
    }
    return results;
  }

  markDelivered(eventId: string): void {
    const event = this.events.get(eventId);
    if (event) {
      event.status = "delivered";
      event.deliveredAt = Date.now();
    }
  }

  markFailed(eventId: string): void {
    const event = this.events.get(eventId);
    if (event) {
      event.attempts++;
      event.lastAttemptAt = Date.now();
      if (event.attempts >= 3) {
        event.status = "failed";
      }
    }
  }

  getByMonitor(monitorId: string): WebhookEvent[] {
    const results: WebhookEvent[] = [];
    for (const event of this.events.values()) {
      if (event.monitorId === monitorId) results.push(event);
    }
    return results;
  }

  getById(eventId: string): WebhookEvent | undefined {
    return this.events.get(eventId);
  }
}
