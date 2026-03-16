import { createHash } from "node:crypto";

interface FeasibilityRecord {
  checkedAt: number;
  aoiHash: string;
  sensorType: string;
}

const FEASIBILITY_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class FeasibilityStore {
  private records = new Map<string, FeasibilityRecord>();

  private hashAoi(aoi: unknown): string {
    return createHash("sha256").update(JSON.stringify(aoi)).digest("hex").slice(0, 16);
  }

  private key(aoiHash: string, sensorType: string): string {
    return `${aoiHash}:${sensorType}`;
  }

  record(aoi: unknown, sensorType: string): void {
    const aoiHash = this.hashAoi(aoi);
    const k = this.key(aoiHash, sensorType);
    this.records.set(k, {
      checkedAt: Date.now(),
      aoiHash,
      sensorType,
    });
    this.cleanup();
  }

  check(aoi: unknown, sensorType: string): { valid: boolean; error?: string } {
    const aoiHash = this.hashAoi(aoi);
    const k = this.key(aoiHash, sensorType);
    const record = this.records.get(k);

    if (!record) {
      return {
        valid: false,
        error:
          "Feasibility check required before tasking. Call check_capture_feasibility first " +
          "and present the results to the user.",
      };
    }

    if (Date.now() > record.checkedAt + FEASIBILITY_TTL_MS) {
      this.records.delete(k);
      return {
        valid: false,
        error:
          "Feasibility check has expired (>30 min old). Call check_capture_feasibility again " +
          "to get current satellite availability and cloud cover forecasts.",
      };
    }

    return { valid: true };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, record] of this.records) {
      if (now > record.checkedAt + FEASIBILITY_TTL_MS) this.records.delete(k);
    }
  }
}
