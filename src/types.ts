export interface BillData {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  importedKwh: number;
  exportedKwh: number;
  microgenCreditDollars: number;
  billTotalDollars: number;
}

export interface APSystemsConfig {
  appId: string;
  appSecret: string;
  sid: string;
}

export interface SheetsConfig {
  spreadsheetId: string;
  serviceAccountKeyPath: string;
}

export interface Config {
  apsystems: APSystemsConfig;
  sheets: SheetsConfig;
}

export interface SheetRow {
  periodStart: string;
  periodEnd: string;
  importedKwh: number;
  exportedKwh: number;
  microgenCreditDollars: number;
  billTotalDollars: number;
  generationKwh: number;
}
