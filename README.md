# solar-automations

CLI tool that parses SPOTpower electricity bill PDFs, fetches solar generation data from the APSystems API, and appends a row to a Google Sheet for ROI tracking.

## Setup

### Dependencies

```bash
npm install
```

### Google Sheets

1. Create a Google Cloud project and enable the **Google Sheets API**
2. Create a **service account** (APIs & Services > Credentials > Service Account)
3. Generate a JSON key (Keys tab > Add Key > JSON) and save it to `credentials/service-account.json`
4. Share your Google Sheet with the service account's `client_email` as an **Editor**

### Environment Variables

Set the following environment variables (via `.env`, 1Password, or your preferred method):

```
APSYSTEMS_APP_ID=<your APSystems app ID>
APSYSTEMS_APP_SECRET=<your APSystems app secret>
APSYSTEMS_SID=<your APSystems system ID>
GOOGLE_SHEETS_ID=<spreadsheet ID from the URL>
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
```

The Google Sheets ID is the value between `/d/` and `/edit` in the spreadsheet URL.

### Google Sheet Layout

The tool writes to a sheet named **Solar** with these columns:

| Column | Field |
|--------|-------|
| A | Start Date |
| B | End Date |
| C | Electricity Imported (kWh) |
| D | Electricity Exported (kWh) |
| E | Microgeneration Credit ($) |
| F | *(skipped — manual entry)* |
| G | Bill Total ($) |
| H | Electricity Produced (kWh) |

## Usage

```
npm start -- [--dump-text] [--dry-run] <bill.pdf>
npm start -- --watch
```

### Process a bill

```bash
npm start -- bills/spotpower-2026-02.pdf
```

This will:
1. Parse the PDF for billing period, usage, and charges
2. Check for duplicate rows in the Google Sheet
3. Fetch daily generation data from APSystems for the billing period
4. Show a preview of the row data and target row number
5. Prompt for confirmation before writing

Duplicate rows are detected by the Start Date in column A — running the same bill twice is safe.

### Dry run

Preview extracted data without writing to the sheet:

```bash
npm start -- --dry-run bills/spotpower-2026-02.pdf
```

### Watch mode

Automatically process new PDFs dropped into the `bills/` directory:

```bash
npm start -- --watch
```

This will watch for new `.pdf` files in `bills/` and process each one automatically (no confirmation prompt). Duplicate detection still applies — dropping the same bill twice is safe.

### Inspect raw PDF text

Dump the raw text extracted from a PDF (useful for debugging parsing):

```bash
npm start -- --dump-text bills/spotpower-2026-02.pdf
```

## Testing

```bash
npm test
```
