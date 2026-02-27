-- Sector Scanner Schema - BioPharma & Mining
-- Combined Kuifje + Zonnebloem analysis for sector-focused scanning
-- Uses scanner_type discriminator: 'biopharma' | 'mining'

-- Sector stocks table: combined fields from both Stock and ZonnebloemStock
CREATE TABLE IF NOT EXISTS sector_stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scanner_type VARCHAR(20) NOT NULL, -- 'biopharma' or 'mining'
  ticker VARCHAR(20) NOT NULL,
  yahoo_ticker VARCHAR(30),
  company_name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  exchange VARCHAR(50),
  market VARCHAR(50),
  country VARCHAR(100),
  current_price DECIMAL(12, 4),
  -- Kuifje fields
  all_time_high DECIMAL(12, 4),
  ath_decline_pct DECIMAL(8, 4),
  five_year_low DECIMAL(12, 4),
  three_year_low DECIMAL(12, 4),
  purchase_limit DECIMAL(12, 4),
  score INTEGER DEFAULT 0,
  growth_event_count INTEGER DEFAULT 0,
  highest_growth_pct DECIMAL(12, 4),
  highest_growth_date DATE,
  confidence_score INTEGER DEFAULT 100,
  -- Zonnebloem fields
  base_price_median DECIMAL(12, 4),
  price_12m_ago DECIMAL(12, 4),
  price_change_12m_pct DECIMAL(8, 4),
  spike_count INTEGER DEFAULT 0,
  highest_spike_pct DECIMAL(12, 4),
  highest_spike_date DATE,
  spike_score DECIMAL(12, 4) DEFAULT 0,
  -- Shared fields
  avg_volume_30d BIGINT,
  market_cap DECIMAL(20, 2),
  detection_date TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  is_favorite BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  scan_session_id UUID,
  needs_review BOOLEAN DEFAULT FALSE,
  review_reason VARCHAR(255),
  -- Which criteria matched: 'kuifje', 'zonnebloem', or 'both'
  match_type VARCHAR(20) DEFAULT 'kuifje',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scanner_type, ticker)
);

-- Sector spike events (Zonnebloem-style)
CREATE TABLE IF NOT EXISTS sector_spike_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scanner_type VARCHAR(20) NOT NULL,
  ticker VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  peak_date DATE NOT NULL,
  end_date DATE NOT NULL,
  base_price DECIMAL(12, 4),
  peak_price DECIMAL(12, 4),
  spike_pct DECIMAL(12, 4),
  duration_days INTEGER DEFAULT 0,
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sector growth events (Kuifje-style)
CREATE TABLE IF NOT EXISTS sector_growth_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scanner_type VARCHAR(20) NOT NULL,
  ticker VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_price DECIMAL(12, 4),
  peak_price DECIMAL(12, 4),
  growth_pct DECIMAL(12, 4),
  consecutive_days_above INTEGER DEFAULT 0,
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sector scan logs
CREATE TABLE IF NOT EXISTS sector_scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scanner_type VARCHAR(20) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running',
  markets_scanned TEXT[],
  candidates_found INTEGER DEFAULT 0,
  stocks_deep_scanned INTEGER DEFAULT 0,
  stocks_matched INTEGER DEFAULT 0,
  new_stocks_found INTEGER DEFAULT 0,
  errors TEXT[],
  duration_seconds INTEGER,
  api_calls_yahoo INTEGER DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sector scan history (rotation tracker)
CREATE TABLE IF NOT EXISTS sector_scan_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scanner_type VARCHAR(20) NOT NULL,
  ticker VARCHAR(20) NOT NULL,
  market VARCHAR(50) NOT NULL,
  last_scanned_at TIMESTAMPTZ DEFAULT NOW(),
  scan_count INTEGER DEFAULT 1,
  last_result VARCHAR(20) DEFAULT 'pending',
  UNIQUE(scanner_type, ticker)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sector_stocks_type ON sector_stocks(scanner_type);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_ticker ON sector_stocks(scanner_type, ticker);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_score ON sector_stocks(scanner_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_spike_score ON sector_stocks(scanner_type, spike_score DESC);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_deleted ON sector_stocks(is_deleted);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_archived ON sector_stocks(is_archived);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_favorite ON sector_stocks(is_favorite);
CREATE INDEX IF NOT EXISTS idx_sector_stocks_detection ON sector_stocks(detection_date DESC);
CREATE INDEX IF NOT EXISTS idx_sector_spike_events_type ON sector_spike_events(scanner_type, ticker);
CREATE INDEX IF NOT EXISTS idx_sector_growth_events_type ON sector_growth_events(scanner_type, ticker);
CREATE INDEX IF NOT EXISTS idx_sector_scan_logs_type ON sector_scan_logs(scanner_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sector_scan_history_type ON sector_scan_history(scanner_type, ticker);
CREATE INDEX IF NOT EXISTS idx_sector_scan_history_scanned ON sector_scan_history(scanner_type, last_scanned_at ASC);

-- RLS policies
ALTER TABLE sector_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_spike_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_growth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON sector_stocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON sector_spike_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON sector_growth_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON sector_scan_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON sector_scan_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role" ON sector_stocks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON sector_spike_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON sector_growth_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON sector_scan_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON sector_scan_history FOR ALL TO service_role USING (true) WITH CHECK (true);
