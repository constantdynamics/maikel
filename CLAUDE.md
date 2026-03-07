# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock screener application built with Next.js 14 (App Router), TypeScript, React 18, TailwindCSS, and Supabase (PostgreSQL). Deploys to Vercel with scheduled cron jobs for automated stock scanning.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (use to verify before pushing)
npm run lint         # Run Next.js linter
npm run db:push      # Push Supabase database schema
npm run db:reset     # Reset Supabase database
```

No test framework is configured. Always run `npm run build` to verify changes compile.

## Architecture

### Screening Algorithms

There are two architecture patterns for scanners:

**Yahoo Finance scanners** — fetch price history from Yahoo Finance, analyze with custom algorithms:
- **Kuifje** (`src/lib/scanner/`) — Finds stocks declined from ATH with historical 200%+ growth events. API: `/api/scan`, `/api/stocks`. Tables: `stocks`, `price_history`, `growth_events`.
- **Professor Zonnebloem** (`src/lib/zonnebloem/`) — Detects explosive price spike patterns above median base price. API: `/api/zonnebloem/scan`, `/api/zonnebloem/stocks`. Tables: `zonnebloem_stocks`, `zonnebloem_spike_events`.
- **Sector Scanner** (`src/lib/sector-scanner/`) — Applies combined Kuifje + Zonnebloem analysis to specific sectors (BioPharma, Mining, Hydrogen, Shipping). API: `/api/sector/scan`, `/api/sector/stocks`. Table: `sector_stocks`.

**TradingView + Yahoo Finance two-phase scanners** — Phase 1: bulk screen via TradingView API for cheap stocks in a sector. Phase 2: deep scan each candidate via Yahoo Finance for growth events (Kuifje) and spike events (Zonnebloem):
- **Moria** (`src/lib/moria/`) — Ultra-cheap mining stocks (>=90% below ATH). Markets: US, Canada, Australia. API: `/api/moria/scan`, `/api/moria/stocks`. Tables: `moria_stocks`, `moria_scan_logs`.
- **BluePill** (`src/lib/bluepill/`) — Ultra-cheap biopharma stocks (>=90% below ATH). Markets: US, Canada. API: `/api/bluepill/scan`, `/api/bluepill/stocks`. Tables: `bluepill_stocks`, `bluepill_scan_logs`.

### Shared Analysis Functions

Growth event detection and spike event detection are shared across scanners:
- `src/lib/scanner/scorer.ts` — `analyzeGrowthEvents()`: finds trough-to-peak growth of 200%+
- `src/lib/zonnebloem/scorer.ts` — `analyzeSpikeEvents()`: finds explosive spikes 75%+ above median base price
- `src/lib/scanner/yahoo.ts` — `getHistoricalData()`: fetches price history from Yahoo Finance
- `src/lib/scanner/validator.ts` — `validatePriceHistory()`, `detectStockSplit()`

### Colored Dot Indicators (Growth/Spike Visualization)

Multiple table components render colored dots to visualize events. The pattern is consistent:
- **Growth dots**: Green = 500%+, Yellow = 300-500%, White = <300%
- **Spike dots**: Green = 200%+, Yellow = 100-200%, White = <100%
- Max 10 dots in two rows (5 per row), 2x2px with `border border-gray-600`
- Sorting uses "medaillespiegel" (medal ranking): green × 1,000,000 + yellow × 10,000 + white × 100

### Data Flow

1. **Cron jobs** (Vercel, defined in `vercel.json`) trigger API routes on weekday schedules
2. **API routes** fetch data from Yahoo Finance / TradingView, run algorithms, write to Supabase
3. **Custom hooks** (`src/hooks/use*.ts`) fetch from API routes and manage client-side state
4. **Pages** render data using table components with sorting, filtering, pagination

### Key Directories

- `src/app/api/` — All backend logic in Next.js API route handlers
- `src/app/dashboard/page.tsx` — Main dashboard with all scanner tabs (very large file ~1500 lines)
- `src/app/defog/` — Widget-based dashboard (Defog) with its own store (`src/lib/defog/store.ts`)
- `src/components/` — Table components per scanner type (`StockTable`, `ZonnebloemTable`, `SectorStockTable`, `MoriaStockTable`, `BluePillStockTable`)
- `src/hooks/` — One data hook per scanner, each with filtering, sorting, CRUD operations
- `src/lib/types.ts` — All TypeScript interfaces (`Stock`, `ZonnebloemStock`, `SectorStock`, `MoriaStock`, `BluePillStock`, etc.)
- `supabase/migrations/` — SQL migration files for schema changes

### Adding a New Scanner (Two-Phase Pattern)

When adding a scanner like Moria/BluePill:
1. Create `src/lib/<name>/index.ts` with TradingView fetch + Yahoo Finance deep scan
2. Create API routes: `src/app/api/<name>/scan/route.ts` and `stocks/route.ts` (include `ensureTables()` auto-creation)
3. Add type interface to `src/lib/types.ts`
4. Create hook `src/hooks/use<Name>Stocks.ts` (copy pattern from `useMoriaStocks.ts`)
5. Create table component `src/components/<Name>StockTable.tsx` with dot display
6. Add tab to `src/app/dashboard/page.tsx`: imports, state, scan handler, auto-scan, bulk actions, tab button, tab content
7. Update `ExportTab` type in `src/lib/utils.ts` and export functions in `Settings.tsx`
8. Add SQL migration in `supabase/migrations/`

### Auth & Middleware

`src/middleware.ts` protects cron endpoints with `CRON_SECRET` Bearer token auth and checks Supabase configuration for page routes.

### Environment Variables

Required (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin access for API routes
- `ALPHA_VANTAGE_API_KEY` — External stock data (25 free calls/day)
- `CRON_SECRET` — Protects `/api/cron/*` endpoints

### Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json`).
