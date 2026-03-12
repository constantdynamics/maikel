-- BluePill scanner tables: ultra-cheap biopharma stocks

CREATE TABLE IF NOT EXISTS bluepill_stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  yahoo_ticker TEXT,
  company_name TEXT NOT NULL DEFAULT '',
  sector TEXT,
  exchange TEXT,
  market TEXT,
  country TEXT,
  current_price NUMERIC,
  all_time_high NUMERIC,
  ath_decline_pct NUMERIC,
  high_3y NUMERIC,
  decline_from_3y_pct NUMERIC,
  high_1y NUMERIC,
  decline_from_1y_pct NUMERIC,
  high_6m NUMERIC,
  decline_from_6m_pct NUMERIC,
  avg_volume_30d NUMERIC,
  market_cap NUMERIC,
  growth_event_count INTEGER DEFAULT 0,
  highest_growth_pct NUMERIC,
  highest_growth_date TEXT,
  spike_count INTEGER DEFAULT 0,
  highest_spike_pct NUMERIC,
  highest_spike_date TEXT,
  spike_score NUMERIC DEFAULT 0,
  detection_date TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  scan_session_id UUID,
  is_favorite BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluepill_stocks_ticker ON bluepill_stocks(ticker);
CREATE INDEX IF NOT EXISTS idx_bluepill_stocks_market ON bluepill_stocks(market);
CREATE INDEX IF NOT EXISTS idx_bluepill_stocks_deleted ON bluepill_stocks(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bluepill_stocks_archived ON bluepill_stocks(is_archived);

CREATE TABLE IF NOT EXISTS bluepill_scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  markets_scanned TEXT[] DEFAULT '{}',
  candidates_found INTEGER DEFAULT 0,
  stocks_saved INTEGER DEFAULT 0,
  new_stocks_found INTEGER DEFAULT 0,
  errors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bluepill_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bluepill_scan_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on bluepill_stocks"
  ON bluepill_stocks FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on bluepill_scan_logs"
  ON bluepill_scan_logs FOR ALL
  USING (true) WITH CHECK (true);
