-- Stock Screener Database Schema

-- Stocks table: main table for screened stocks
CREATE TABLE stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  current_price DECIMAL(12, 4),
  all_time_high DECIMAL(12, 4),
  ath_decline_pct DECIMAL(8, 4),
  five_year_low DECIMAL(12, 4),
  three_year_low DECIMAL(12, 4),
  purchase_limit DECIMAL(12, 4),
  score INTEGER DEFAULT 0,
  growth_event_count INTEGER DEFAULT 0,
  highest_growth_pct DECIMAL(12, 4),
  highest_growth_date DATE,
  detection_date TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  is_favorite BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  is_delisted BOOLEAN DEFAULT FALSE,
  is_acquired BOOLEAN DEFAULT FALSE,
  confidence_score INTEGER DEFAULT 100,
  needs_review BOOLEAN DEFAULT FALSE,
  review_reason VARCHAR(255),
  exchange VARCHAR(20),
  ipo_date DATE,
  market_cap DECIMAL(20, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Scan tracking
  scan_number INTEGER DEFAULT 1,
  scan_date DATE,
  -- NovaBay-type analysis: stable with spikes
  twelve_month_low DECIMAL(12, 4),
  twelve_month_max_decline_pct DECIMAL(8, 4),
  twelve_month_max_spike_pct DECIMAL(12, 4),
  is_stable_with_spikes BOOLEAN DEFAULT FALSE,
  UNIQUE(ticker)
);

-- Price history table: 5-year daily OHLC data
CREATE TABLE price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  trade_date DATE NOT NULL,
  open_price DECIMAL(12, 4),
  high_price DECIMAL(12, 4),
  low_price DECIMAL(12, 4),
  close_price DECIMAL(12, 4),
  volume BIGINT,
  UNIQUE(ticker, trade_date)
);

-- Growth events: track each 200%+ growth event
CREATE TABLE growth_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_price DECIMAL(12, 4),
  peak_price DECIMAL(12, 4),
  growth_pct DECIMAL(12, 4),
  consecutive_days_above INTEGER DEFAULT 0,
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scan logs: track each scan run
CREATE TABLE scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running',
  stocks_scanned INTEGER DEFAULT 0,
  stocks_found INTEGER DEFAULT 0,
  errors TEXT[],
  duration_seconds INTEGER,
  api_calls_yahoo INTEGER DEFAULT 0,
  api_calls_alphavantage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Error logs
CREATE TABLE error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  severity VARCHAR(20) DEFAULT 'error',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health checks
CREATE TABLE health_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  yahoo_finance_status VARCHAR(20) DEFAULT 'unknown',
  alpha_vantage_status VARCHAR(20) DEFAULT 'unknown',
  database_status VARCHAR(20) DEFAULT 'unknown',
  last_scan_status VARCHAR(20),
  last_scan_time TIMESTAMPTZ,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Archives: monthly CSV archive metadata
CREATE TABLE archives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  month DATE NOT NULL,
  stock_count INTEGER DEFAULT 0,
  file_size_bytes INTEGER,
  csv_data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings: user-configurable settings
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backups: automatic data backups for protection
CREATE TABLE backups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_type VARCHAR(20) DEFAULT 'auto',
  stock_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,
  data JSONB NOT NULL,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keep only last 30 backups automatically
CREATE INDEX idx_backups_created ON backups(created_at DESC);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('ath_decline_min', '85'),
  ('ath_decline_max', '100'),
  ('growth_threshold_pct', '200'),
  ('min_growth_events', '2'),
  ('min_consecutive_days', '5'),
  ('growth_lookback_years', '3'),
  ('purchase_limit_multiplier', '1.20'),
  ('scan_times', '["10:30", "15:00"]'),
  ('excluded_sectors', '[]');

-- Indexes for performance
CREATE INDEX idx_stocks_ticker ON stocks(ticker);
CREATE INDEX idx_stocks_score ON stocks(score DESC);
CREATE INDEX idx_stocks_ath_decline ON stocks(ath_decline_pct);
CREATE INDEX idx_stocks_is_deleted ON stocks(is_deleted);
CREATE INDEX idx_stocks_is_favorite ON stocks(is_favorite);
CREATE INDEX idx_stocks_detection_date ON stocks(detection_date DESC);
CREATE INDEX idx_price_history_ticker_date ON price_history(ticker, trade_date);
CREATE INDEX idx_growth_events_ticker ON growth_events(ticker);
CREATE INDEX idx_scan_logs_started ON scan_logs(started_at DESC);
CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);

-- Row Level Security (RLS) - disabled for single user
-- Enable if multi-user support is needed later
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- Policies: allow all for authenticated users
CREATE POLICY "Allow all for authenticated" ON stocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON price_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON growth_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON scan_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON error_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON health_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON archives FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON backups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow service role (for cron jobs)
CREATE POLICY "Allow service role" ON stocks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON price_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON growth_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON scan_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON error_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON health_checks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON archives FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role" ON backups FOR ALL TO service_role USING (true) WITH CHECK (true);
