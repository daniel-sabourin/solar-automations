import { google } from "googleapis";
import type { SheetsConfig, SheetRow } from "./types.js";

const SHEET_NAME = "Solar";

// Column order: A=Start, B=End, C=Imported, D=Exported, E=MicrogenCredit, F=MiscCredit(skip), G=BillTotal, H=Produced
function rowToValues(row: SheetRow): (string | number | null)[] {
  return [
    row.periodStart,
    row.periodEnd,
    row.importedKwh,
    row.exportedKwh,
    Math.abs(row.microgenCreditDollars),
    null, // F: Misc Credit — manual entry only
    row.billTotalDollars,
    row.generationKwh,
  ];
}

async function getSheetsClient(serviceAccountKeyPath: string) {
  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountKeyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * Normalize a date string to YYYY-MM-DD for comparison.
 * Handles both "2025-12-22" and "12/22/2025" (Google Sheets formatted).
 */
function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // MM/DD/YYYY (Google Sheets format)
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  return trimmed;
}

/**
 * Read column A and return duplicate status + first empty row number.
 */
async function inspectColumnA(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  periodStart: string,
): Promise<{ duplicate: boolean; firstEmptyRow: number }> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:A`,
  });

  const values = response.data.values;
  if (!values) return { duplicate: false, firstEmptyRow: 1 };

  const duplicate = values.some(
    (row) => row[0] && normalizeDate(row[0]) === periodStart,
  );

  // Find the first empty cell in column A (1-indexed row number)
  let firstEmptyRow = values.length + 1;
  for (let i = 0; i < values.length; i++) {
    if (!values[i][0] || values[i][0].toString().trim() === "") {
      firstEmptyRow = i + 1;
      break;
    }
  }

  return { duplicate, firstEmptyRow };
}

/**
 * Inspect the sheet for duplicate and target row number.
 * Returns { duplicate, targetRow } so the caller can check before writing.
 */
export async function preflight(
  config: SheetsConfig,
  periodStart: string,
): Promise<{ duplicate: boolean; targetRow: number }> {
  const sheets = await getSheetsClient(config.serviceAccountKeyPath);
  const { duplicate, firstEmptyRow } = await inspectColumnA(
    sheets,
    config.spreadsheetId,
    periodStart,
  );
  return { duplicate, targetRow: firstEmptyRow };
}

/**
 * Write a row to a specific row number in the Solar sheet.
 */
export async function writeRow(
  config: SheetsConfig,
  row: SheetRow,
  targetRow: number,
): Promise<string> {
  const sheets = await getSheetsClient(config.serviceAccountKeyPath);

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET_NAME}!A${targetRow}:H${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowToValues(row)],
    },
  });

  return `Wrote row ${targetRow} for ${row.periodStart} → ${row.periodEnd}.`;
}
