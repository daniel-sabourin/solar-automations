import { describe, it, expect, vi, beforeEach } from "vitest";

// Must use vi.hoisted() so mocks are available inside vi.mock factory
const { mockGet, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    sheets: vi.fn().mockReturnValue({
      spreadsheets: {
        values: {
          get: mockGet,
          update: mockUpdate,
        },
      },
    }),
  },
}));

import { preflight, writeRow } from "../src/sheets.js";
import type { SheetRow, SheetsConfig } from "../src/types.js";

const config: SheetsConfig = {
  spreadsheetId: "test-sheet-id",
  serviceAccountKeyPath: "./credentials/test.json",
};

const sampleRow: SheetRow = {
  periodStart: "2025-01-15",
  periodEnd: "2025-02-14",
  importedKwh: 450,
  exportedKwh: 120,
  microgenCreditDollars: -12.5,
  billTotalDollars: 85.3,
  generationKwh: 380,
};

describe("preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no duplicate and correct target row", async () => {
    mockGet.mockResolvedValue({ data: { values: [["2024-12-15"]] } });
    const result = await preflight(config, "2025-01-15");
    expect(result.duplicate).toBe(false);
    expect(result.targetRow).toBe(2);
  });

  it("returns duplicate when date exists (YYYY-MM-DD)", async () => {
    mockGet.mockResolvedValue({
      data: { values: [["2025-01-15"], ["2024-12-15"]] },
    });
    const result = await preflight(config, "2025-01-15");
    expect(result.duplicate).toBe(true);
  });

  it("detects duplicates when Sheets returns MM/DD/YYYY format", async () => {
    mockGet.mockResolvedValue({
      data: { values: [["1/15/2025"], ["12/15/2024"]] },
    });
    const result = await preflight(config, "2025-01-15");
    expect(result.duplicate).toBe(true);
  });

  it("returns row 1 when sheet is empty", async () => {
    mockGet.mockResolvedValue({ data: { values: undefined } });
    const result = await preflight(config, "2025-01-15");
    expect(result.duplicate).toBe(false);
    expect(result.targetRow).toBe(1);
  });

  it("finds a gap in column A", async () => {
    mockGet.mockResolvedValue({
      data: { values: [["Start Date"], ["2024-12-15"], [""]] },
    });
    const result = await preflight(config, "2025-01-15");
    expect(result.duplicate).toBe(false);
    expect(result.targetRow).toBe(3);
  });
});

describe("writeRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes to the specified row", async () => {
    mockUpdate.mockResolvedValue({});

    const message = await writeRow(config, sampleRow, 5);

    expect(message).toContain("row 5");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "test-sheet-id",
        range: "Solar!A5:H5",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[
            "2025-01-15",
            "2025-02-14",
            450,
            120,
            12.5,
            null,
            85.3,
            380,
          ]],
        },
      }),
    );
  });
});
