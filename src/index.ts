import fs from "node:fs";
import { loadConfig } from "./config.js";
import { parseBill, extractText } from "./parseBill.js";
import { fetchGenerationKwh } from "./apsystems.js";
import { appendRow } from "./sheets.js";
import type { SheetRow } from "./types.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npm start -- [--dump-text] <bill.pdf>");
    process.exit(1);
  }

  const VALID_FLAGS = new Set(["--dump-text"]);
  const flags = args.filter((a) => a.startsWith("--"));
  const unknownFlags = flags.filter((f) => !VALID_FLAGS.has(f));
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag: ${unknownFlags.join(", ")}`);
    console.error("Usage: npm start -- [--dump-text] <bill.pdf>");
    process.exit(1);
  }

  const dumpText = flags.includes("--dump-text");
  const pdfPath = args.find((a) => !a.startsWith("--"));

  if (!pdfPath) {
    console.error("Error: No PDF path provided.");
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`Error: File not found: ${pdfPath}`);
    process.exit(1);
  }

  // Dump raw text mode — useful for authoring regex patterns
  if (dumpText) {
    const text = await extractText(pdfPath);
    console.log("=== Raw PDF Text ===\n");
    console.log(text);
    console.log("\n=== End ===");
    return;
  }

  const config = loadConfig();

  // 1. Parse the bill
  console.log(`Parsing bill: ${pdfPath}`);
  const bill = await parseBill(pdfPath);
  console.log(`  Period: ${bill.periodStart} → ${bill.periodEnd}`);
  console.log(`  Imported: ${bill.importedKwh} kWh`);
  console.log(`  Exported: ${bill.exportedKwh} kWh`);
  console.log(`  Microgen credit: $${bill.microgenCreditDollars}`);
  console.log(`  Bill total: $${bill.billTotalDollars}`);

  // 2. Fetch generation data from APSystems
  console.log(`\nFetching generation data from APSystems...`);
  const generationKwh = await fetchGenerationKwh(
    config.apsystems,
    bill.periodStart,
    bill.periodEnd,
  );
  console.log(`  Total generation: ${generationKwh} kWh`);

  // 3. Append to Google Sheets
  console.log(`\nAppending to Google Sheets...`);
  const row: SheetRow = {
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    importedKwh: bill.importedKwh,
    exportedKwh: bill.exportedKwh,
    generationKwh,
    microgenCreditDollars: bill.microgenCreditDollars,
    billTotalDollars: bill.billTotalDollars,
  };

  const result = await appendRow(config.sheets, row);
  console.log(`  ${result.message}`);

  if (result.appended) {
    console.log("\nDone! Row added to Google Sheets.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
