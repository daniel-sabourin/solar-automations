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

  const duplicate = values.some((row) => row[0] === periodStart);

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
 * Write a row to the Solar sheet at the first empty row in column A.
 * Skips if a row with the same billing period start date already exists.
 */
export async function appendRow(
  config: SheetsConfig,
  row: SheetRow,
): Promise<{ appended: boolean; message: string }> {
  const sheets = await getSheetsClient(config.serviceAccountKeyPath);

  const { duplicate, firstEmptyRow } = await inspectColumnA(
    sheets,
    config.spreadsheetId,
    row.periodStart,
  );

  if (duplicate) {
    return {
      appended: false,
      message: `Row for period starting ${row.periodStart} already exists — skipped.`,
    };
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET_NAME}!A${firstEmptyRow}:H${firstEmptyRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowToValues(row)],
    },
  });

  return {
    appended: true,
    message: `Wrote row ${firstEmptyRow} for ${row.periodStart} → ${row.periodEnd}.`,
  };
}
