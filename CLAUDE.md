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

### Three Screening Algorithms

- **Kuifje** (`/api/scan`, `/api/stocks`) — Finds stocks that declined significantly from all-time highs and have historical 200%+ growth events. Core tables: `stocks`, `price_history`, `growth_events`.
- **Professor Zonnebloem** (`/api/zonnebloem/scan`, `/api/zonnebloem/stocks`) — Detects price spike patterns in stocks. Core tables: `zonnebloem_stocks`, `zonnebloem_spike_events`.
- **Sector Scanner** (`/api/sector/scan`) — Applies combined Kuifje + Zonnebloem analysis to specific sectors (BioPharma, Mining). Core table: `sector_stocks`.

### Data Flow

1. **Cron jobs** (Vercel, defined in `vercel.json`) trigger API routes on weekday schedules
2. **API routes** fetch data from Yahoo Finance / Alpha Vantage, run algorithms, write to Supabase
3. **Custom hooks** (`src/hooks/useStocks.ts`, `useZonnebloemStocks.ts`, `useSectorStocks.ts`) fetch from API routes and manage client-side state via Zustand
4. **Pages** render data using shared components (`StockTable`, `FilterBar`, etc.)

### Key Directories

- `src/app/api/` — All backend logic lives in Next.js API route handlers
- `src/app/defog/` — Widget-based dashboard pages (alerts, movers, portfolio, scan, underwater)
- `src/components/` — Shared UI components; `src/components/defog/` for widget-specific components
- `src/hooks/` — Three data hooks, one per algorithm, using Zustand stores
- `src/lib/types.ts` — All TypeScript interfaces for stocks, events, scans, configs
- `src/lib/supabase.ts` — Supabase client initialization
- `src/lib/exchanges.ts` — Exchange data and market configuration
- `supabase/migrations/` — SQL migration files for schema changes

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
