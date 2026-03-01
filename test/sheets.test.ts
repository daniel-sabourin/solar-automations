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

import { appendRow } from "../src/sheets.js";
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

describe("appendRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes to the first empty row when no duplicate exists", async () => {
    // Row 1 has data, row 2 is the first empty row
    mockGet.mockResolvedValue({ data: { values: [["2024-12-15"]] } });
    mockUpdate.mockResolvedValue({});

    const result = await appendRow(config, sampleRow);

    expect(result.appended).toBe(true);
    expect(result.message).toContain("row 2");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "test-sheet-id",
        range: "Solar!A2:H2",
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

  it("skips when a duplicate row exists", async () => {
    mockGet.mockResolvedValue({
      data: { values: [["2025-01-15"], ["2024-12-15"]] },
    });

    const result = await appendRow(config, sampleRow);

    expect(result.appended).toBe(false);
    expect(result.message).toContain("already exists");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("writes to row 1 when sheet is empty", async () => {
    mockGet.mockResolvedValue({ data: { values: undefined } });
    mockUpdate.mockResolvedValue({});

    const result = await appendRow(config, sampleRow);

    expect(result.appended).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: "Solar!A1:H1",
      }),
    );
  });

  it("finds a gap in column A when rows have empty cells", async () => {
    // Header in row 1, data in row 2, empty row 3
    mockGet.mockResolvedValue({
      data: { values: [["Start Date"], ["2024-12-15"], [""]] },
    });
    mockUpdate.mockResolvedValue({});

    const result = await appendRow(config, sampleRow);

    expect(result.appended).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: "Solar!A3:H3",
      }),
    );
  });
});
