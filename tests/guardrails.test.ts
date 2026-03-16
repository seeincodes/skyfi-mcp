import { describe, it, expect } from "vitest";
import { validateAoi, sanitizeString, checkPricing } from "../src/guardrails/index.js";

// A small polygon ~1 km² near Rotterdam
const SMALL_POLYGON: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [4.47, 51.92],
      [4.48, 51.92],
      [4.48, 51.93],
      [4.47, 51.93],
      [4.47, 51.92],
    ],
  ],
};

// A huge polygon ~100,000+ km² covering much of Western Europe
const HUGE_POLYGON: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-5, 42],
      [10, 42],
      [10, 55],
      [-5, 55],
      [-5, 42],
    ],
  ],
};

describe("AOI validation", () => {
  it("accepts a small polygon for archive search", () => {
    const result = validateAoi(SMALL_POLYGON, "archive");
    expect(result.valid).toBe(true);
    expect(result.areaKm2).toBeGreaterThan(0);
    expect(result.areaKm2).toBeLessThan(10);
  });

  it("rejects a huge polygon for archive search", () => {
    const result = validateAoi(HUGE_POLYGON, "archive");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds");
    expect(result.error).toContain("50,000");
  });

  it("rejects a huge polygon for tasking (lower limit)", () => {
    // A polygon ~15,000 km² — exceeds 10,000 tasking limit but under 50,000 archive limit
    const mediumPolygon: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [4.0, 51.5],
          [6.0, 51.5],
          [6.0, 52.5],
          [4.0, 52.5],
          [4.0, 51.5],
        ],
      ],
    };
    const archiveResult = validateAoi(mediumPolygon, "archive");
    expect(archiveResult.valid).toBe(true);

    const taskingResult = validateAoi(mediumPolygon, "tasking");
    expect(taskingResult.valid).toBe(false);
    expect(taskingResult.error).toContain("10,000");
  });

  it("supports custom limits", () => {
    const result = validateAoi(SMALL_POLYGON, "archive", {
      maxArchiveKm2: 0.001,
      maxTaskingKm2: 0.001,
    });
    expect(result.valid).toBe(false);
  });
});

describe("String sanitization", () => {
  it("accepts a normal string", () => {
    const result = sanitizeString("Port of Rotterdam");
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe("Port of Rotterdam");
  });

  it("rejects strings over 500 characters", () => {
    const long = "a".repeat(501);
    const result = sanitizeString(long);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("500");
  });

  it("accepts exactly 500 characters", () => {
    const exact = "a".repeat(500);
    const result = sanitizeString(exact);
    expect(result.valid).toBe(true);
  });

  it("strips control characters", () => {
    const result = sanitizeString("hello\x00world\x1F!");
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe("helloworld!");
  });

  it("trims whitespace", () => {
    const result = sanitizeString("  hello  ");
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe("hello");
  });

  it("supports custom max length", () => {
    const result = sanitizeString("hello", 3);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("3");
  });
});

describe("Pricing guardrails", () => {
  it("allows a price under the warn threshold", () => {
    const result = checkPricing(100);
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("allows a price over warn threshold with a warning", () => {
    const result = checkPricing(840);
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("PRICE_THRESHOLD_EXCEEDED");
    expect(result.warnings[0].message).toContain("$840.00");
  });

  it("rejects a price over hard limit", () => {
    const result = checkPricing(1500, { warnThresholdUsd: 500, hardLimitUsd: 1000 });
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("$1000.00");
  });

  it("allows exactly at warn threshold without warning", () => {
    const result = checkPricing(500);
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("allows any price when limits are null", () => {
    const result = checkPricing(999999, { warnThresholdUsd: null, hardLimitUsd: null });
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
