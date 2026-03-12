# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock screener application built with Next.js 14 (App Router), TypeScript, React 18, TailwindCSS, and Supabase (PostgreSQL). Two main systems: the **Scanner** backend (finds interesting stocks) and the **Defog** frontend (widget dashboard for tracking/trading them). Deploys to Vercel with scheduled cron jobs.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run Next.js linter
npm run start        # Start production server
npm run db:push      # Push Supabase database schema
npm run db:reset     # Reset Supabase database
npm run setup        # Run initial setup wizard (scripts/setup.sh)
npm run verify       # Verify deployment (scripts/verify-deployment.ts)
```

No test framework is configured. There are no unit tests.

## Architecture

### Screening Algorithms

Each scanner has a POST `/scan` route (triggers scan) and a GET `/stocks` route (returns results):

- **Kuifje** (`/api/scan`, `/api/stocks`) — Stocks that declined significantly from ATH with historical 200%+ growth events. Tables: `stocks`, `price_history`, `growth_events`.
- **Professor Zonnebloem** (`/api/zonnebloem/scan`, `/api/zonnebloem/stocks`) — Detects price spike patterns. Tables: `zonnebloem_stocks`, `zonnebloem_spike_events`.
- **Sector Scanner** (`/api/sector/scan`, `/api/sector/stocks?type=<type>`) — Combined Kuifje + Zonnebloem analysis for sectors: BioPharma, Mining, Hydrogen, Shipping. Table: `sector_stocks`.
- **Moria** (`/api/moria/scan`, `/api/moria/stocks`) — Ultra-cheap mining stocks with deep ATH declines (>=90%). Tables: `moria_stocks`, `moria_scan_logs`.
- **Blue Pill** (`/api/bluepill/scan`, `/api/bluepill/stocks`) — Ultra-cheap biopharma stocks (>=90% below ATH) with growth and spike event detection. Tables: `bluepill_stocks`, `bluepill_scan_logs`. Core logic: `src/lib/bluepill/index.ts`.

### Defog Widget Dashboard

Defog is a separate frontend system (`src/app/defog/`, `src/lib/defog/`) that consumes scanner results and provides a tab-based portfolio/watchlist dashboard. It uses its own Supabase project (can be same or separate).

**Scanner Sync** (`src/lib/defog/scannerSync.ts`) — The core orchestrator:
- Auto-creates 8 tabs (Kuifje, Prof. Zonnebloem, BioPharma, Mining, Hydrogen, Shipping, Moria, Blue Pill) with preset colors
- Fetches top 250 stocks per scanner, deduplicates by company name and ticker
- `syncScannerToDefog()` — Incremental sync: adds new stocks, updates existing
- `refreshDefogTop250()` — Weekly full refresh: replaces top 250, preserves existing stock metadata
- Buy limit cascade: 5-year low → 3-year low → 1-year low

**Key Defog services** (all in `src/lib/defog/services/`):
- `maikelCloudSync.ts` — Persists Defog state to `/api/defog/state` with debounced saves and hash-based change detection
- `smartRefresh.ts` — Priority-weighted queue for stock price updates, respects market hours
- `postSyncRangeFetch.ts` — Fetches 5Y/3Y/1Y range data for newly synced stocks, recalculates buy limits
- `persistentCache.ts` — IndexedDB caching for quotes with TTL-based expiration
- `notifications.ts` — Browser push notifications for buy signals, threshold alerts, daily drops

**Defog widget pages** at `/defog/widget/`: alerts, movers, portfolio, scan, underwater, tablet.

### Data Flow

1. **Cron jobs** (Vercel, `vercel.json`) trigger API routes on schedules (Kuifje 9PM UTC weekdays, Zonnebloem 4PM UTC weekdays, Sector Sundays). Moria and Blue Pill are manual-only.
2. **API routes** fetch data from Yahoo Finance / Alpha Vantage, run algorithms, write to Supabase
3. **Custom hooks** (`src/hooks/useStocks.ts`, `useZonnebloemStocks.ts`, `useSectorStocks.ts`, `useBluePillStocks.ts`) fetch from API routes and manage client-side state via Zustand
4. **Scanner Sync** pulls results into Defog tabs on page load
5. **Defog services** handle caching, cloud sync, smart refresh, and notifications

### Adding a New Scanner

1. Create scan logic in `src/lib/newscanner/index.ts`
2. Create API routes: `src/app/api/newscanner/scan/route.ts` (POST) and `stocks/route.ts` (GET)
3. Add TypeScript types to `src/lib/types.ts`
4. Create hook in `src/hooks/`
5. Add tab to `scannerSync.ts`: update `SCANNER_TAB_NAMES`, `SCANNER_TAB_COLORS`, add fetch/dedup/process in `syncScannerToDefog()` and `refreshDefogTop250()`
6. Update toast in `src/app/defog/page.tsx` to show new scanner count
7. (Optional) Add cron job to `vercel.json`

### Key Directories

- `src/app/api/` — All backend logic in Next.js API route handlers
- `src/app/defog/` — Defog widget dashboard pages
- `src/components/defog/` — Widget-specific components
- `src/lib/defog/` — Defog services, types, scanner sync, buy limit calculation
- `src/lib/bluepill/` — Blue Pill scanner logic
- `src/hooks/` — Data hooks per algorithm, using Zustand stores
- `src/lib/types.ts` — All TypeScript interfaces
- `src/lib/supabase.ts` — Supabase client initialization
- `src/lib/auth.ts` — Shared auth utilities (`requireAuth`, `verifyCronSecret`, `parseLimit`)
- `supabase/migrations/` — SQL migration files

### Auth & Middleware

- `src/middleware.ts` — Protects `/api/cron/*` with `CRON_SECRET` Bearer token (timing-safe comparison). Checks Supabase configuration for page routes.
- API routes use `requireAuth(request)` for POST routes, rate limiting (max 3 scans per 5 min per IP), `export const maxDuration = 300` for long-running scans.

### Environment Variables

Required (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client (scanner app)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin access for API routes
- `NEXT_PUBLIC_DEFOG_SUPABASE_URL`, `NEXT_PUBLIC_DEFOG_SUPABASE_ANON_KEY` — Supabase client (Defog dashboard, can be separate project)
- `ALPHA_VANTAGE_API_KEY` — External stock data (25 free calls/day)
- `CRON_SECRET` — Protects `/api/cron/*` endpoints

### Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json`).
