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

import { checkDuplicate, writeRow } from "../src/sheets.js";
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

describe("checkDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no duplicate exists", async () => {
    mockGet.mockResolvedValue({ data: { values: [["2024-12-15"]] } });
    expect(await checkDuplicate(config, "2025-01-15")).toBe(false);
  });

  it("returns true when duplicate exists (YYYY-MM-DD)", async () => {
    mockGet.mockResolvedValue({
      data: { values: [["2025-01-15"], ["2024-12-15"]] },
    });
    expect(await checkDuplicate(config, "2025-01-15")).toBe(true);
  });

  it("returns true when Sheets returns MM/DD/YYYY format", async () => {
    mockGet.mockResolvedValue({
      data: { values: [["1/15/2025"], ["12/15/2024"]] },
    });
    expect(await checkDuplicate(config, "2025-01-15")).toBe(true);
  });

  it("returns false when sheet is empty", async () => {
    mockGet.mockResolvedValue({ data: { values: undefined } });
    expect(await checkDuplicate(config, "2025-01-15")).toBe(false);
  });
});

describe("writeRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes to the first empty row", async () => {
    mockGet.mockResolvedValue({ data: { values: [["2024-12-15"]] } });
    mockUpdate.mockResolvedValue({});

    const message = await writeRow(config, sampleRow);

    expect(message).toContain("row 2");
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

  it("writes to row 1 when sheet is empty", async () => {
    mockGet.mockResolvedValue({ data: { values: undefined } });
    mockUpdate.mockResolvedValue({});

    await writeRow(config, sampleRow);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: "Solar!A1:H1",
      }),
    );
  });

  it("finds a gap in column A when rows have empty cells", async () => {
    mockGet.mockResolvedValue({
      data: { values: [["Start Date"], ["2024-12-15"], [""]] },
    });
    mockUpdate.mockResolvedValue({});

    await writeRow(config, sampleRow);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: "Solar!A3:H3",
      }),
    );
  });
});
