import fs from "node:fs";
import readline from "node:readline";
import { loadConfig } from "./config.js";
import { parseBill, extractText } from "./parseBill.js";
import { fetchGenerationKwh } from "./apsystems.js";
import { checkDuplicate, writeRow } from "./sheets.js";
import type { SheetRow } from "./types.js";

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npm start -- [--dump-text] [--dry-run] <bill.pdf>");
    process.exit(1);
  }

  const VALID_FLAGS = new Set(["--dump-text", "--dry-run"]);
  const flags = args.filter((a) => a.startsWith("--"));
  const unknownFlags = flags.filter((f) => !VALID_FLAGS.has(f));
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag: ${unknownFlags.join(", ")}`);
    console.error("Usage: npm start -- [--dump-text] [--dry-run] <bill.pdf>");
    process.exit(1);
  }

  const dumpText = flags.includes("--dump-text");
  const dryRun = flags.includes("--dry-run");
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

  // 2. Check for duplicate before making API calls
  if (!dryRun) {
    const isDuplicate = await checkDuplicate(config.sheets, bill.periodStart);
    if (isDuplicate) {
      console.log(`\nRow for period starting ${bill.periodStart} already exists — skipped.`);
      return;
    }
  }

  // 3. Fetch generation data from APSystems
  console.log(`\nFetching generation data from APSystems...`);
  const generationKwh = await fetchGenerationKwh(
    config.apsystems,
    bill.periodStart,
    bill.periodEnd,
  );
  console.log(`  Total generation: ${generationKwh} kWh`);

  if (dryRun) {
    console.log("\nDry run — nothing written to Google Sheets.");
    return;
  }

  // 4. Confirm before writing
  const proceed = await confirm("\nWrite this row to Google Sheets? (y/n) ");
  if (!proceed) {
    console.log("Aborted.");
    return;
  }

  // 5. Write to Google Sheets
  const row: SheetRow = {
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    importedKwh: bill.importedKwh,
    exportedKwh: bill.exportedKwh,
    generationKwh,
    microgenCreditDollars: bill.microgenCreditDollars,
    billTotalDollars: bill.billTotalDollars,
  };

  const message = await writeRow(config.sheets, row);
  console.log(`  ${message}`);
  console.log("\nDone! Row added to Google Sheets.");
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
