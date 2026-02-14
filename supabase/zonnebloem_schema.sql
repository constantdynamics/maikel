-- Professor Zonnebloem Scanner - Database Schema
-- Stable base + explosive spike stock detection

-- Zonnebloem stocks table
CREATE TABLE IF NOT EXISTS zonnebloem_stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL,
  yahoo_ticker VARCHAR(30),
  company_name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  exchange VARCHAR(50),
  market VARCHAR(50),
  country VARCHAR(100),
  current_price DECIMAL(12, 4),
  three_year_low DECIMAL(12, 4),
  base_price_median DECIMAL(12, 4),
  price_12m_ago DECIMAL(12, 4),
  price_change_12m_pct DECIMAL(8, 4),
  spike_count INTEGER DEFAULT 0,
  highest_spike_pct DECIMAL(12, 4),
  highest_spike_date DATE,
  spike_score DECIMAL(12, 4) DEFAULT 0,
  avg_volume_30d BIGINT,
  market_cap DECIMAL(20, 2),
  detection_date TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  is_favorite BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  scan_session_id UUID REFERENCES zonnebloem_scan_logs(id),
  needs_review BOOLEAN DEFAULT FALSE,
  review_reason VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker)
);

-- Zonnebloem spike events
CREATE TABLE IF NOT EXISTS zonnebloem_spike_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- Zonnebloem scan logs
CREATE TABLE IF NOT EXISTS zonnebloem_scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- Zonnebloem scan rotation tracker: remembers which tickers have been scanned
-- so each cycle prioritizes new, never-scanned tickers
CREATE TABLE IF NOT EXISTS zonnebloem_scan_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL,
  market VARCHAR(50) NOT NULL,
  last_scanned_at TIMESTAMPTZ DEFAULT NOW(),
  scan_count INTEGER DEFAULT 1,
  last_result VARCHAR(20) DEFAULT 'pending',
  UNIQUE(ticker)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_zb_stocks_ticker ON zonnebloem_stocks(ticker);
CREATE INDEX IF NOT EXISTS idx_zb_stocks_spike_score ON zonnebloem_stocks(spike_score DESC);
CREATE INDEX IF NOT EXISTS idx_zb_stocks_is_deleted ON zonnebloem_stocks(is_deleted);
CREATE INDEX IF NOT EXISTS idx_zb_stocks_is_archived ON zonnebloem_stocks(is_archived);
CREATE INDEX IF NOT EXISTS idx_zb_stocks_is_favorite ON zonnebloem_stocks(is_favorite);
CREATE INDEX IF NOT EXISTS idx_zb_stocks_scan_session ON zonnebloem_stocks(scan_session_id);
CREATE INDEX IF NOT EXISTS idx_zb_stocks_detection_date ON zonnebloem_stocks(detection_date DESC);
CREATE INDEX IF NOT EXISTS idx_zb_spike_events_ticker ON zonnebloem_spike_events(ticker);
CREATE INDEX IF NOT EXISTS idx_zb_scan_logs_started ON zonnebloem_scan_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_zb_scan_history_ticker ON zonnebloem_scan_history(ticker);
CREATE INDEX IF NOT EXISTS idx_zb_scan_history_last_scanned ON zonnebloem_scan_history(last_scanned_at ASC);

-- RLS policies
ALTER TABLE zonnebloem_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonnebloem_spike_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonnebloem_scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonnebloem_scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON zonnebloem_stocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON zonnebloem_spike_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON zonnebloem_scan_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON zonnebloem_scan_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role" ON zonnebloem_stocks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON zonnebloem_spike_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON zonnebloem_scan_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON zonnebloem_scan_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default Zonnebloem settings
INSERT INTO settings (key, value) VALUES
  ('zb_min_spike_pct', '100'),
  ('zb_min_spike_duration_days', '4'),
  ('zb_min_spike_count', '1'),
  ('zb_lookback_months', '24'),
  ('zb_max_price_decline_12m_pct', '20'),
  ('zb_max_base_decline_pct', '30'),
  ('zb_min_avg_volume', '50000'),
  ('zb_min_price', '0.10'),
  ('zb_markets', '["america","europe","uk","canada","australia","germany","hongkong","japan"]'),
  ('zb_excluded_sectors', '[]'),
  ('zb_excluded_countries', '["Russia","North Korea","Iran","Syria","Belarus","Myanmar","Venezuela","Cuba"]'),
  ('zb_scan_times', '["11:00","16:00"]')
ON CONFLICT (key) DO NOTHING;
