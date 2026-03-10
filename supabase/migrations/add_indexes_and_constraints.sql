-- Migration: Add missing indexes, CHECK constraints, and unique constraints
-- Improves query performance and data integrity

-- ═══════════════════════════════════════════════════
-- STOCKS table improvements
-- ═══════════════════════════════════════════════════

-- Unique constraint on ticker to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_stocks_ticker_unique ON stocks(ticker);

-- Index for common query patterns (filtering deleted/archived)
CREATE INDEX IF NOT EXISTS idx_stocks_deleted ON stocks(is_deleted);
CREATE INDEX IF NOT EXISTS idx_stocks_archived ON stocks(is_archived);
CREATE INDEX IF NOT EXISTS idx_stocks_favorite ON stocks(is_favorite) WHERE is_favorite = true;

-- Index for sorting by score (most common sort)
CREATE INDEX IF NOT EXISTS idx_stocks_score ON stocks(score DESC);

-- Index for detection_date (used in archiving queries)
CREATE INDEX IF NOT EXISTS idx_stocks_detection_date ON stocks(detection_date);

-- CHECK constraints for data integrity
ALTER TABLE stocks ADD CONSTRAINT chk_stocks_price_positive
  CHECK (current_price IS NULL OR current_price >= 0) NOT VALID;
ALTER TABLE stocks ADD CONSTRAINT chk_stocks_ath_positive
  CHECK (all_time_high IS NULL OR all_time_high >= 0) NOT VALID;

-- ═══════════════════════════════════════════════════
-- ZONNEBLOEM_STOCKS table improvements
-- ═══════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_zonnebloem_stocks_ticker_unique ON zonnebloem_stocks(ticker);

CREATE INDEX IF NOT EXISTS idx_zonnebloem_stocks_deleted ON zonnebloem_stocks(is_deleted);
CREATE INDEX IF NOT EXISTS idx_zonnebloem_stocks_archived ON zonnebloem_stocks(is_archived);
CREATE INDEX IF NOT EXISTS idx_zonnebloem_stocks_favorite ON zonnebloem_stocks(is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_zonnebloem_stocks_spike_score ON zonnebloem_stocks(spike_score DESC);

ALTER TABLE zonnebloem_stocks ADD CONSTRAINT chk_zb_price_positive
  CHECK (current_price IS NULL OR current_price >= 0) NOT VALID;

-- ═══════════════════════════════════════════════════
-- SECTOR_STOCKS table improvements
-- ═══════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_sector_stocks_ticker_type ON sector_stocks(ticker, scanner_type);

CREATE INDEX IF NOT EXISTS idx_sector_stocks_deleted ON sector_stocks(is_deleted);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_type ON sector_stocks(scanner_type);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_score ON sector_stocks(score DESC);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_spike_score ON sector_stocks(spike_score DESC);

ALTER TABLE sector_stocks ADD CONSTRAINT chk_sector_price_positive
  CHECK (current_price IS NULL OR current_price >= 0) NOT VALID;
ALTER TABLE sector_stocks ADD CONSTRAINT chk_sector_scanner_type
  CHECK (scanner_type IN ('biopharma', 'mining', 'hydrogen', 'shipping')) NOT VALID;

-- ═══════════════════════════════════════════════════
-- MORIA_STOCKS table improvements
-- ═══════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_moria_stocks_ticker_unique ON moria_stocks(ticker);

ALTER TABLE moria_stocks ADD CONSTRAINT chk_moria_price_positive
  CHECK (current_price IS NULL OR current_price >= 0) NOT VALID;

-- ═══════════════════════════════════════════════════
-- SCAN_LOGS improvements
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_scan_logs_started_at ON scan_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_status ON scan_logs(status);

ALTER TABLE scan_logs ADD CONSTRAINT chk_scan_logs_status
  CHECK (status IN ('running', 'completed', 'failed', 'partial')) NOT VALID;

-- ═══════════════════════════════════════════════════
-- PRICE_HISTORY improvements
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_price_history_ticker_date ON price_history(ticker, trade_date DESC);

-- ═══════════════════════════════════════════════════
-- BACKUPS improvements
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

-- ═══════════════════════════════════════════════════
-- KZ_REPORTS improvements
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_kz_reports_date ON kz_reports(report_date DESC);

-- ═══════════════════════════════════════════════════
-- MORIA_SCAN_LOGS improvements
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_moria_scan_logs_started_at ON moria_scan_logs(started_at DESC);

ALTER TABLE moria_scan_logs ADD CONSTRAINT chk_moria_scan_status
  CHECK (status IN ('running', 'completed', 'failed', 'partial')) NOT VALID;
