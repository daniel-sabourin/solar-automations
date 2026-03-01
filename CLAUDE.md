# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**solar-automations** — TypeScript CLI that parses SPOTpower electricity bill PDFs, fetches solar generation data from the APSystems API, and appends a row to a Google Sheet for ROI tracking.

## Repository

- GitHub: `daniel-sabourin/solar-automations`
- Branch: `main`

## Commands

- `npm start -- <bill.pdf>` — run the CLI
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode

## Architecture

- `src/index.ts` — CLI entry point, orchestrates parse → fetch → write
- `src/parseBill.ts` — PDF text extraction and regex parsing for SPOTpower bills
- `src/apsystems.ts` — APSystems OpenAPI v2 client (HMAC-SHA256 auth, base64-encoded signature)
- `src/sheets.ts` — Google Sheets writer (finds first empty row in column A, writes A-E + G-H, skips F)
- `src/config.ts` — loads environment variables
- `src/types.ts` — shared interfaces

## Key Details

- APSystems API returns a flat array of daily kWh strings (indexed by day-of-month), not named objects
- Signature: `base64(HMAC-SHA256(timestamp/nonce/appId/lastSegment/method/HmacSHA256))`
- Google Sheet column F (Misc Credit) is skipped — manual entry only
- Microgeneration credit is stored as a positive number in the sheet
- Duplicate detection by Start Date in column A
- `pdf-parse` has no @types — custom declaration in `src/pdf-parse.d.ts`
- Use `vi.hoisted()` for mock variables inside `vi.mock()` factories
