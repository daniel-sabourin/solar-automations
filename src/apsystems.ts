import crypto from "node:crypto";
import type { APSystemsConfig } from "./types.js";

const BASE_URL = "https://api.apsystemsema.com:9282";

function calculateSignature(
  appId: string,
  appSecret: string,
  path: string,
  timestamp: string,
  nonce: string,
): string {
  // Last segment of the path (e.g. the SID from /user/api/v2/systems/energy/{SID})
  const lastSegment = path.split("/").pop()!;
  const method = "GET";
  const message = `${timestamp}/${nonce}/${appId}/${lastSegment}/${method}/HmacSHA256`;
  return crypto
    .createHmac("sha256", appSecret)
    .update(message)
    .digest("base64");
}

interface EnergyResponse {
  data?: string[];
  message?: string;
  code?: number;
}

/**
 * Zip a flat array of daily kWh strings with dates for the given month.
 * E.g. for "2025-12", index 0 = "2025-12-01", index 1 = "2025-12-02", etc.
 */
function zipWithDates(
  yearMonth: string,
  values: string[],
): Map<string, number> {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = new Map<string, number>();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
    const value = parseFloat(values[day - 1] || "0");
    result.set(date, value);
  }

  return result;
}

async function fetchMonthlyEnergy(
  config: APSystemsConfig,
  yearMonth: string, // YYYY-MM
): Promise<Map<string, number>> {
  const path = `/user/api/v2/systems/energy/${config.sid}`;
  const url = `${BASE_URL}${path}?energy_level=daily&date_range=${yearMonth}`;

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signature = calculateSignature(
    config.appId,
    config.appSecret,
    path,
    timestamp,
    nonce,
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-CA-AppId": config.appId,
      "X-CA-Timestamp": timestamp,
      "X-CA-Nonce": nonce,
      "X-CA-Signature": signature,
      "X-CA-Signature-Method": "HmacSHA256",
    },
  });

  if (!response.ok) {
    throw new Error(
      `APSystems API error: ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as EnergyResponse;

  if (json.code !== 0 || !json.data) {
    throw new Error(
      `APSystems API error (code ${json.code}): ${json.message ?? "unknown error"}`,
    );
  }

  return zipWithDates(yearMonth, json.data);
}

/**
 * Returns an array of YYYY-MM strings covering the given date range.
 */
function getMonthsInRange(start: string, end: string): string[] {
  const months: string[] = [];
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");

  let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= last) {
    const y = current.getFullYear();
    const m = (current.getMonth() + 1).toString().padStart(2, "0");
    months.push(`${y}-${m}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Returns all dates (YYYY-MM-DD) from start to end inclusive.
 */
function getDaysInRange(start: string, end: string): Set<string> {
  const days = new Set<string>();
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");

  while (current <= endDate) {
    days.add(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Fetch total solar generation (kWh) for the given billing period.
 * Handles periods that span multiple calendar months.
 */
export async function fetchGenerationKwh(
  config: APSystemsConfig,
  periodStart: string, // YYYY-MM-DD
  periodEnd: string,   // YYYY-MM-DD
): Promise<number> {
  const months = getMonthsInRange(periodStart, periodEnd);
  const validDays = getDaysInRange(periodStart, periodEnd);

  let totalKwh = 0;

  for (const month of months) {
    const dailyEnergy = await fetchMonthlyEnergy(config, month);
    for (const day of validDays) {
      totalKwh += dailyEnergy.get(day) ?? 0;
    }
  }

  return Math.round(totalKwh * 100) / 100;
}

// Exported for testing
export { calculateSignature, getMonthsInRange, getDaysInRange };
