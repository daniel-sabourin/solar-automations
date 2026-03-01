import fs from "node:fs";
import pdfParse from "pdf-parse";
import type { BillData } from "./types.js";

/**
 * Extract raw text from a PDF file. Useful for inspecting bill format
 * before writing regex patterns.
 */
export async function extractText(pdfPath: string): Promise<string> {
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);
  return data.text;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Convert "Dec 22 2025" → "2025-12-22" */
function parseDate(raw: string): string {
  const parts = raw.split(" ");
  const month = MONTHS[parts[0]];
  if (!month) throw new Error(`Unknown month: ${parts[0]}`);
  const day = parts[1].padStart(2, "0");
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

/** Parse a dollar string like "-$15.66" or "$134.96" → number */
function parseDollars(raw: string): number {
  const cleaned = raw.replace(/[$,]/g, "");
  const value = parseFloat(cleaned);
  if (isNaN(value)) throw new Error(`Failed to parse dollar amount: "${raw}"`);
  return value;
}

/**
 * Parse a SPOTpower electricity bill PDF and extract billing data.
 *
 * Patterns derived from sample bills:
 *   "Dec 22 2025 - Jan 22 2026 Usage: 732 kWh"
 *   "Micro Generation readings ... Total:196"
 *   "Microgen-$15.66"
 *   "Total Current Charges$134.96"
 */
export async function parseBill(pdfPath: string): Promise<BillData> {
  const text = await extractText(pdfPath);

  // Period dates + imported kWh from the usage summary line
  const usageMatch = text.match(
    /(\w{3} \d{1,2} \d{4}) - (\w{3} \d{1,2} \d{4}) Usage: ([\d,]+) kWh/,
  );
  if (!usageMatch) {
    throw new Error("Failed to extract billing period / usage from bill");
  }
  const periodStart = parseDate(usageMatch[1]);
  const periodEnd = parseDate(usageMatch[2]);
  const importedKwh = parseFloat(usageMatch[3].replace(/,/g, ""));

  // Exported kWh from Micro Generation readings total
  const exportedMatch = text.match(
    /Micro Generation readings[\s\S]*? Total:(\d+)/,
  );
  if (!exportedMatch) {
    throw new Error("Failed to extract exported kWh from bill");
  }
  const exportedKwh = parseFloat(exportedMatch[1]);

  // Microgen credit from Charge Summary (not the detailed line items)
  const microgenMatch = text.match(/\nMicrogen(-?\$[\d,]+\.\d{2})\n/);
  if (!microgenMatch) {
    throw new Error("Failed to extract microgen credit from bill");
  }
  const microgenCreditDollars = parseDollars(microgenMatch[1]);

  // Total Current Charges (not Total Due — this is the single-month figure)
  const totalMatch = text.match(/Total Current Charges(-?\$[\d,]+\.\d{2})/);
  if (!totalMatch) {
    throw new Error("Failed to extract Total Current Charges from bill");
  }
  const billTotalDollars = parseDollars(totalMatch[1]);

  return {
    periodStart,
    periodEnd,
    importedKwh,
    exportedKwh,
    microgenCreditDollars,
    billTotalDollars,
  };
}
