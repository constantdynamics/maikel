-- Performance indexes for hot filter paths across all four scanners.
-- All statements are idempotent (IF NOT EXISTS) and additive — safe to run on
-- existing databases multiple times.

-- ── zonnebloem_scan_history ───────────────────────────────────────────────
-- Hot path: getScannedTickers() full table scan, plus per-ticker upsert lookup
-- in recordScanHistory (src/lib/zonnebloem/index.ts).
CREATE INDEX IF NOT EXISTS idx_zb_scan_history_ticker
  ON zonnebloem_scan_history(ticker);

-- ── zonnebloem_stocks ─────────────────────────────────────────────────────
-- Hot path: useZonnebloemStocks fetches where is_deleted=false AND is_archived=false
-- ordered by spike_score DESC.
CREATE INDEX IF NOT EXISTS idx_zb_stocks_active_score
  ON zonnebloem_stocks(spike_score DESC)
  WHERE is_deleted = false AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_zb_stocks_market
  ON zonnebloem_stocks(market);

-- ── sector_stocks ─────────────────────────────────────────────────────────
-- useSectorStocks filters by sector_type; also filters by is_deleted/is_archived.
CREATE INDEX IF NOT EXISTS idx_sector_stocks_sector_type
  ON sector_stocks(sector_type);

CREATE INDEX IF NOT EXISTS idx_sector_stocks_active
  ON sector_stocks(sector_type, score DESC)
  WHERE is_deleted = false AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_sector_stocks_market
  ON sector_stocks(market);

-- ── moria_stocks ──────────────────────────────────────────────────────────
-- Hot path: dedup cleanup reads all rows; frontend filters by market.
-- Composite index helps the (ticker, market) dedup lookup and sort-by-last_updated.
CREATE INDEX IF NOT EXISTS idx_moria_stocks_ticker_market
  ON moria_stocks(ticker, market);

CREATE INDEX IF NOT EXISTS idx_moria_stocks_active_decline
  ON moria_stocks(ath_decline_pct DESC)
  WHERE is_deleted = false AND is_archived = false;

-- ── scan_logs / zonnebloem_scan_logs / moria_scan_logs ────────────────────
-- Scan log pruning queries sort by started_at DESC per scanner; already indexed
-- on `scan_logs` but the other two log tables are not. Add matching indexes.
CREATE INDEX IF NOT EXISTS idx_zb_scan_logs_started
  ON zonnebloem_scan_logs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_moria_scan_logs_started
  ON moria_scan_logs(started_at DESC);
