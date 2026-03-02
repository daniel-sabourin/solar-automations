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
 * Check if a row with the given periodStart already exists in the sheet.
 */
export async function checkDuplicate(
  config: SheetsConfig,
  periodStart: string,
): Promise<boolean> {
  const sheets = await getSheetsClient(config.serviceAccountKeyPath);
  const { duplicate } = await inspectColumnA(sheets, config.spreadsheetId, periodStart);
  return duplicate;
}

/**
 * Write a row to the Solar sheet at the first empty row in column A.
 */
export async function writeRow(
  config: SheetsConfig,
  row: SheetRow,
): Promise<string> {
  const sheets = await getSheetsClient(config.serviceAccountKeyPath);

  const { firstEmptyRow } = await inspectColumnA(
    sheets,
    config.spreadsheetId,
    row.periodStart,
  );

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET_NAME}!A${firstEmptyRow}:H${firstEmptyRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowToValues(row)],
    },
  });

  return `Wrote row ${firstEmptyRow} for ${row.periodStart} → ${row.periodEnd}.`;
}
