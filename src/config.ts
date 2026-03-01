import "dotenv/config";
import type { Config } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    apsystems: {
      appId: requireEnv("APSYSTEMS_APP_ID"),
      appSecret: requireEnv("APSYSTEMS_APP_SECRET"),
      sid: requireEnv("APSYSTEMS_SID"),
    },
    sheets: {
      spreadsheetId: requireEnv("GOOGLE_SHEETS_ID"),
      serviceAccountKeyPath:
        process.env["GOOGLE_SERVICE_ACCOUNT_KEY_PATH"] ??
        "./credentials/service-account.json",
    },
  };
}
