import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { parseBill, extractText } from "../src/parseBill.js";

const BILLS_DIR = path.join(import.meta.dirname, "..", "bills");
const winterBill = path.join(BILLS_DIR, "spotpower-sample.pdf");
const springBill = path.join(BILLS_DIR, "spotpower-sample2.pdf");

const hasBills =
  fs.existsSync(winterBill) && fs.existsSync(springBill);

describe.skipIf(!hasBills)("parseBill", () => {
  it("parses the winter bill (net consumer)", async () => {
    const data = await parseBill(winterBill);
    expect(data.periodStart).toBe("2025-12-22");
    expect(data.periodEnd).toBe("2026-01-22");
    expect(data.importedKwh).toBe(732);
    expect(data.exportedKwh).toBe(196);
    expect(data.microgenCreditDollars).toBe(-15.66);
    expect(data.billTotalDollars).toBe(134.96);
  });

  it("parses the spring bill (net producer, credit)", async () => {
    const data = await parseBill(springBill);
    expect(data.periodStart).toBe("2025-04-24");
    expect(data.periodEnd).toBe("2025-05-25");
    expect(data.importedKwh).toBe(487);
    expect(data.exportedKwh).toBe(940);
    expect(data.microgenCreditDollars).toBe(-282);
    expect(data.billTotalDollars).toBe(-71.46);
  });
});

describe.skipIf(!hasBills)("extractText", () => {
  it("extracts non-empty text from a PDF", async () => {
    const text = await extractText(winterBill);
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("SPOTpower");
  });
});
