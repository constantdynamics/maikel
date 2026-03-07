# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock screener and personal portfolio watchlist application built with Next.js 14 (App Router), TypeScript, React 18, TailwindCSS, and Supabase (PostgreSQL). Deploys to Vercel with scheduled cron jobs for automated stock scanning. UI is in **Dutch**.

The application is two systems in one:
1. **Backend Scanners** — Automated cron-based stock screening algorithms that write results to Supabase
2. **Defog** — Client-side personal watchlist with encrypted persistence, smart refresh, and cloud sync. Scanner results get synced into Defog where users manage them with custom limits, purchase tracking, and undo history.

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

### Backend: Three Screening Algorithms

- **Kuifje** (`/api/scan`, `/api/stocks`) — Finds stocks that declined significantly from all-time highs and have historical 200%+ growth events. Core tables: `stocks`, `price_history`, `growth_events`.
- **Professor Zonnebloem** (`/api/zonnebloem/scan`, `/api/zonnebloem/stocks`) — Detects price spike patterns in stocks. Core tables: `zonnebloem_stocks`, `zonnebloem_spike_events`.
- **Sector Scanner** (`/api/sector/scan`) — Applies combined Kuifje + Zonnebloem analysis to specific sectors. Types: `biopharma`, `mining`, `hydrogen`, `shipping`. Defined as `SectorScannerType` in `src/lib/types.ts` with per-sector configs (markets, keywords, colors). Core table: `sector_stocks`. Time-budgeted to 240s (Vercel 300s limit).

### Cron Schedule (vercel.json)

- **Kuifje**: Weekdays 21:00 UTC (post US market close)
- **Zonnebloem**: Weekdays 16:00 UTC (EU market close)
- **Sector Scanner**: Sundays 12:00 UTC (weekend analysis, runs BioPharma + Mining)

### Backend Data Flow

1. **Cron jobs** trigger API routes → fetch from Yahoo Finance / Alpha Vantage / TradingView → run algorithms → write to Supabase
2. **Custom hooks** (`src/hooks/useStocks.ts`, `useZonnebloemStocks.ts`, `useSectorStocks.ts`) fetch from API routes via Zustand stores
3. **Dashboard** (`src/app/dashboard/page.tsx`) renders results with tabs per scanner type

### Defog: Client-Side Watchlist System

Defog (`src/lib/defog/`, `src/components/defog/`, `src/app/defog/`) is a full personal portfolio tracker:

**State management**: Zustand store (`src/lib/defog/store.ts`) manages tabs, stocks, archive, purchased stocks, notifications, action log with undo.

**Three-layer persistence**:
1. **Memory** — Zustand store (reactive)
2. **IndexedDB** — Password-encrypted local storage via `idb` library (`src/lib/defog/utils/storage.ts`)
3. **Supabase cloud** — Debounced auto-sync (3s) to `settings` table (`src/lib/defog/services/autoSync.ts`)

**Scanner → Defog sync** (`src/lib/defog/scannerSync.ts`): Syncs scanner results into six auto-created tabs (Kuifje, Prof. Zonnebloem, BioPharma, Mining, Hydrogen, Shipping). Deduplicates by ticker/company name, calculates buy limits from historical lows, caps at 250 stocks per tab, has safety guards (won't remove >20% of stocks, skips if APIs return 0).

**Multi-provider stock API** (`src/lib/defog/services/stockApi.ts`): Fallback chain Yahoo → TwelveData → AlphaVantage → FMP. Each provider has different rate limits, exchange support, and data quality.

**Smart refresh engine** (`src/lib/defog/services/smartRefresh.ts`): Self-learning provider selection — tracks success/failure per provider per stock, blacklists after 3 failures, exponential backoff on errors (5min → 1h max), persists learning in localStorage.

**Rate limiter** (`src/lib/defog/services/rateLimiter.ts`): Per-provider limits (Yahoo: 60/min, TwelveData: 8/min, AlphaVantage: 5/min, FMP: 5/min) with priority queue and calendar-day reset.

**Auto-scan service** (`src/lib/defog/services/autoScanService.ts`): Smart prioritization scoring — factors in staleness, distance to buy limit, volatility, market hours (EU 9:00-18:30 CET, US 15:30-22:00 CET). Configurable weights per factor.

### Two Separate Type Systems

- **Backend types** (`src/lib/types.ts`): Scanner data models — Stock, GrowthEvent, SpikeEvent, SectorStock, SectorScannerConfig
- **Defog types** (`src/lib/defog/types.ts`): Client-side models — Stock, Tab, PurchasedStock, ArchivedStock, UserSettings (100+ config options), ActionLogEntry

`scannerSync.ts` translates between them with field mapping.

### Zone/Country Filter System

- `src/lib/defog/countryZones.ts` — Maps countries to zones (Americas, Europe, Asia & Pacific, Other) with Dutch display names
- `src/components/defog/CountryFlag.tsx` — Inline SVG flags for ~36 countries
- `src/components/defog/ZoneTabBar.tsx` — Combinable zone/country filter overlay (works on any tab)
- Stock → country derived from exchange code + ticker suffix (`.TO`/`.V` = Canada, `.HK` = Hong Kong, `.DE` = Germany, etc.) via `src/lib/exchanges.ts`

### Key Directories

- `src/app/api/` — Backend API route handlers
- `src/app/defog/` — Defog dashboard pages
- `src/app/dashboard/` — Scanner results dashboard
- `src/components/defog/` — Defog UI components (Dashboard.tsx is the main orchestrator)
- `src/lib/defog/` — Defog core: store, types, services/, utils/
- `src/lib/defog/services/` — stockApi, rateLimiter, smartRefresh, autoScanService, autoSync, notifications, persistentCache
- `src/lib/sector-scanner/` — Sector scanner algorithm (combined Kuifje + Zonnebloem)
- `src/hooks/` — Three data hooks for scanner pages, using Zustand
- `supabase/` — Migration files and schema definitions

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

### Adding a New Sector Scanner

The sector scanner is extensible by type. To add a new scanner:
1. Add the type to `SectorScannerType` union in `src/lib/types.ts`
2. Create a config (markets, sectorFilters, sectorKeywords, color) following the existing patterns (e.g. `BIOPHARMA_CONFIG`)
3. Add to `VALID_TYPES` in `src/app/api/sector/scan/route.ts`
4. Add tab name to `SCANNER_TAB_NAMES` in `src/lib/defog/scannerSync.ts` for Defog sync
5. Wire into the dashboard tab list in `src/app/dashboard/page.tsx`
