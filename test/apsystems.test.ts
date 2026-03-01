import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  calculateSignature,
  getMonthsInRange,
  getDaysInRange,
  fetchGenerationKwh,
} from "../src/apsystems.js";

describe("calculateSignature", () => {
  it("produces a valid base64-encoded HMAC-SHA256 string", () => {
    const sig = calculateSignature(
      "test-app-id",
      "test-secret",
      "/user/api/v2/systems/energy/ABC123",
      "1700000000000",
      "test-nonce",
    );

    // Verify against manual HMAC computation with base64 encoding
    const expected = crypto
      .createHmac("sha256", "test-secret")
      .update("1700000000000/test-nonce/test-app-id/ABC123/GET/HmacSHA256")
      .digest("base64");
    expect(sig).toBe(expected);
  });

  it("uses the last path segment in the signature message", () => {
    const sig1 = calculateSignature("id", "secret", "/a/b/SID1", "ts", "n");
    const sig2 = calculateSignature("id", "secret", "/a/b/SID2", "ts", "n");
    expect(sig1).not.toBe(sig2);
  });
});

describe("getMonthsInRange", () => {
  it("returns a single month for same-month range", () => {
    expect(getMonthsInRange("2025-01-15", "2025-01-31")).toEqual(["2025-01"]);
  });

  it("returns two months for a range spanning two months", () => {
    expect(getMonthsInRange("2025-01-15", "2025-02-14")).toEqual([
      "2025-01",
      "2025-02",
    ]);
  });

  it("handles year boundary", () => {
    expect(getMonthsInRange("2024-12-01", "2025-01-15")).toEqual([
      "2024-12",
      "2025-01",
    ]);
  });
});

describe("getDaysInRange", () => {
  it("returns all days inclusive", () => {
    const days = getDaysInRange("2025-01-28", "2025-02-02");
    expect(days.size).toBe(6);
    expect(days.has("2025-01-28")).toBe(true);
    expect(days.has("2025-02-02")).toBe(true);
    expect(days.has("2025-02-03")).toBe(false);
  });

  it("handles single day", () => {
    const days = getDaysInRange("2025-03-15", "2025-03-15");
    expect(days.size).toBe(1);
    expect(days.has("2025-03-15")).toBe(true);
  });
});

describe("fetchGenerationKwh", () => {
  const config = { appId: "id", appSecret: "secret", sid: "SID1" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sums energy for days within the billing period", async () => {
    // API returns a flat array of daily kWh strings for the whole month
    // January has 31 days — fill all 31 slots
    const janData = Array.from({ length: 31 }, (_, i) => {
      if (i === 27) return "5.5";  // Jan 28
      if (i === 28) return "6.0";  // Jan 29
      if (i === 29) return "4.2";  // Jan 30
      if (i === 30) return "7.0";  // Jan 31
      return "0";
    });

    const mockResponse = {
      ok: true,
      json: async () => ({ code: 0, data: janData }),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const result = await fetchGenerationKwh(config, "2025-01-29", "2025-01-31");
    // Should only sum 29, 30, 31 = 6.0 + 4.2 + 7.0 = 17.2
    expect(result).toBe(17.2);
  });

  it("handles multi-month billing periods", async () => {
    // January: 31 days, values at index 29 (Jan 30) and 30 (Jan 31)
    const janData = Array.from({ length: 31 }, (_, i) => {
      if (i === 29) return "3.0";
      if (i === 30) return "4.0";
      return "0";
    });

    // February: 28 days, values at index 0-2 (Feb 1-3)
    const febData = Array.from({ length: 28 }, (_, i) => {
      if (i === 0) return "5.0";
      if (i === 1) return "6.0";
      if (i === 2) return "7.0";
      return "0";
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, data: janData }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, data: febData }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGenerationKwh(config, "2025-01-30", "2025-02-02");
    // Jan: 3.0 + 4.0 = 7.0, Feb: 5.0 + 6.0 = 11.0, total = 18.0
    expect(result).toBe(18);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    await expect(
      fetchGenerationKwh(config, "2025-01-01", "2025-01-31"),
    ).rejects.toThrow("APSystems API error: 401 Unauthorized");
  });

  it("throws on API error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 4000 }),
      }),
    );

    await expect(
      fetchGenerationKwh(config, "2025-01-01", "2025-01-31"),
    ).rejects.toThrow("APSystems API error (code 4000)");
  });
});
