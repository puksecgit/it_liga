# IT Liga Niš

A professional football league website built with React, Next.js and Node.js, with a compatible Vinext build for Sites hosting.

## Run on Node.js

Requires Node.js 22.13+.

```sh
npm ci
npm run build:node
npm start
```

Open http://localhost:3000. For development, use `npm run dev`.

`npm run build` builds both the Node.js and Sites versions. `npm run dev:sites` previews Sites locally.

## League data

The source is the [2026/27 IT Liga workbook](https://docs.google.com/spreadsheets/d/1Vm22gtDxlSCC-1ssUDSN5yedsiCY9tC-v0aZeDWc_9E/edit). The server downloads the entire workbook as XLSX and reads **all five worksheets**, including cached formula values. No Google API key is needed while the workbook remains readable through its shared link.

- Standings and official ranking: **Ligaški deo**, including any bonus/penalty points.
- All 66 fixtures over 11 matchdays: the same worksheet.
- Top scorers and per-matchday goals: **Lista strelaca - Ligaški deo**.
- Venues, kit colours and captains: **Kontakt podaci ekipa i gde imaj**. Personal emails and phone numbers are excluded from every API response and bundled snapshot.
- Organizer tab is inspected and identified in source information; private contact fields are excluded.
- Points for wins, draws and losses: **Options**.

Club-name variants (`HTEC Niš`, `Boopro tech`, `DualSoft`) are matched to the official table. Blank scores stay unplayed; a zero is a real score. The site preserves workbook dates, including source typos and TBD dates. Scorer totals are imported separately, because the scorer tab may be updated after results. Club crests are generated monograms, not official logos.

## Ten-minute synchronization

On **Node.js**, `instrumentation.ts` starts a server-side check immediately and every **600,000 ms**, even when no visitor has the site open. A shared process cache prevents overlapping fetches and shares results between the background timer and API requests. Keep the Node process running with your usual process manager/container service.

The browser reads `/api/league` on load and at the displayed countdown deadline. It also checks when a sleeping tab becomes visible again. In **Sites/serverless hosting**, source checks occur on page/API requests, at most once every ten minutes per warm instance; no unattended cloud cron is configured. An open page automatically requests new data at that interval.

On failure, the last successful in-memory data remains available; cold starts fall back to the bundled sanitized snapshot. The UI shows a stale-data notice and the last successful import time. No database or credentials are required.

## Verification

```sh
npm test
npx tsc --noEmit
npm run build
```

Tests cover workbook parsing, absent vs zero scores, club aliases, official point adjustments, privacy, fixture consistency, concurrent refresh coalescing, ten-minute caching, and stale-data fallback. Desktop/mobile Chrome checks additionally verify navigation, filtering, search, dialogs and timer-triggered requests.

Hero photograph: [Unsplash football image](https://images.unsplash.com/photo-1574629810360-7efbbe195018). Barlow Condensed and DM Sans are self-hosted; their OFL licenses are in `public/fonts/`.
