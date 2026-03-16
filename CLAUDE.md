# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stock screener application ("Professor Zonnebloem") built with Next.js 14 (App Router), TypeScript, React 18, TailwindCSS, and Supabase (PostgreSQL). Deploys to Vercel with scheduled cron jobs for automated stock scanning.

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

### Four Screening Algorithms

- **Kuifje** (`/api/scan`, `/api/stocks`) — Finds stocks that declined significantly from all-time highs and have historical 200%+ growth events. Scores using triangular numbers: n events = n*(n+1)/2 points. Core tables: `stocks`, `price_history`, `growth_events`.
- **Professor Zonnebloem** (`/api/zonnebloem/scan`, `/api/zonnebloem/stocks`) — Detects price spike patterns (75%+ upward spikes lasting 4+ days) across 25+ global markets. Maintains `zonnebloem_scan_history` to prioritize never-scanned stocks. Core tables: `zonnebloem_stocks`, `zonnebloem_spike_events`.
- **Sector Scanner** (`/api/sector/scan`, `/api/sector/stocks`) — Hybrid algorithm combining Kuifje + Zonnebloem criteria. Supports four configurable sectors: BioPharma, Mining, Hydrogen, Shipping. A stock qualifies if it meets either algorithm's criteria. Core table: `sector_stocks`.
- **Moria** (`/api/moria/scan`, `/api/moria/stocks`) — Finds ultra-cheap mining stocks ≥90% below all-time high. Markets: NYSE/NASDAQ/AMEX, TSX/TSXV, ASX. Manual-only (no cron schedule). Core table: `moria_stocks`.

### Cron Schedule (Vercel)

| Algorithm | Route | Schedule |
|---|---|---|
| Kuifje | `/api/cron/scan` | Weekdays 21:00 UTC |
| Zonnebloem | `/api/cron/zonnebloem` | Weekdays 16:00 UTC |
| Sector Scanner | `/api/cron/sector-scan` | Sundays 12:00 UTC |
| Moria | — | Manual only |

Additional cron routes exist (`/api/cron/archive`, `/api/cron/health`) but are not scheduled in `vercel.json`.

### Data Flow

1. **Candidate discovery** — TradingView screener API used by all algorithms to get a broad candidate pool quickly
2. **Deep scan** — Yahoo Finance historical data for detailed per-stock analysis (time-budgeted to 240s)
3. **Cron jobs** write results to Supabase; manual scans use progress polling (`GET /api/*/scan/progress`) since there are no websockets
4. **Custom hooks** (`useStocks`, `useZonnebloemStocks`, `useSectorStocks`, `useMoriaStocks`) fetch from API routes and manage client-side state via Zustand
5. **Pages** render data using shared components (`StockTable`, `FilterBar`, etc.)

### Time Budget Pattern

All long-running scans enforce a **240-second hard limit** (leaving a 60s buffer for Vercel's 300s max). Scans check elapsed time before each batch and exit early, saving partial results. Partial scans are marked `"partial"` (not `"failed"`) and are still stored and displayed.

### Key Directories

- `src/app/api/` — All backend logic in Next.js route handlers
- `src/app/defog/widget/` — Widget-based dashboard pages: alerts, movers, portfolio, scan, underwater, tablet layout
- `src/components/` — Shared UI components; `src/components/defog/` for widget-specific components
- `src/hooks/` — Four data hooks, one per algorithm, using Zustand stores
- `src/lib/scanner/` — Kuifje algorithm: orchestrator, scorer, Yahoo/Alpha Vantage/TradingView clients, validator
- `src/lib/zonnebloem/` — Zonnebloem algorithm: orchestrator, spike scorer, TradingView client
- `src/lib/sector-scanner/` — Sector Scanner algorithm
- `src/lib/moria/` — Moria algorithm
- `src/lib/defog/services/` — Client-side services: rate limiter, persistent cache (IndexedDB), auto-scan, backup, notifications, smart refresh
- `src/lib/types.ts` — All TypeScript interfaces (stocks, events, scans, configs for all four algorithms)
- `src/lib/supabase.ts` — Dual Supabase clients: lazy anon (client-side) + service role (server-side)
- `src/lib/exchanges.ts` — Exchange and market configuration
- `supabase/migrations/` — SQL migration files

### Auth & Middleware

`src/middleware.ts` protects `/api/cron/*` endpoints with `CRON_SECRET` Bearer token auth. If `CRON_SECRET` is not set, the check is NOT skipped — requests are rejected. Page routes are checked for valid Supabase configuration and redirected to `/setup-required` if missing.

### Key Patterns

- **Data resurrection** — Deleted stocks are revived (`is_deleted: false`) when re-found by a scan, allowing users to control visibility via deletion without losing coverage.
- **Never-scanned prioritization** — Zonnebloem and Sector Scanner use history tables to scan previously-unseen stocks first.
- **Rate limiting** — `src/lib/defog/services/rateLimiter.ts` enforces per-provider limits tracked in localStorage: Alpha Vantage 5/min (25/day), Twelve Data 8/min, Yahoo Finance 60/min.
- **Numeric sanitization** — All values written to Supabase are checked with `isFinite()`, clamped, and rounded to fit `numeric(9,2)` column limits.
- **Scan log pruning** — Old scan log details are pruned (keeps last 5 per algorithm) to prevent database bloat.

### Environment Variables

Required (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin access for API routes
- `ALPHA_VANTAGE_API_KEY` — External stock data (25 free calls/day)
- `CRON_SECRET` — Protects `/api/cron/*` endpoints

### Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json`).
