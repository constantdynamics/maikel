-- Migration: Add scan tracking and NovaBay-type (stable with spikes) analysis
-- Run this on existing databases to add new columns

-- Add scan tracking columns
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS scan_number INTEGER DEFAULT 1;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS scan_date DATE;

-- Add NovaBay-type analysis columns
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS twelve_month_low DECIMAL(12, 4);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS twelve_month_max_decline_pct DECIMAL(8, 4);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS twelve_month_max_spike_pct DECIMAL(12, 4);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS is_stable_with_spikes BOOLEAN DEFAULT FALSE;

-- Create index for filtering stable+spike stocks
CREATE INDEX IF NOT EXISTS idx_stocks_stable_spikes ON stocks(is_stable_with_spikes) WHERE is_stable_with_spikes = true;

-- Create index for scan date (for variety filtering)
CREATE INDEX IF NOT EXISTS idx_stocks_scan_date ON stocks(scan_date);

-- Add new settings for the NovaBay filter and scanner variety
INSERT INTO settings (key, value) VALUES
  ('enable_stable_spike_filter', 'false'),
  ('stable_max_decline_pct', '10'),
  ('stable_min_spike_pct', '100'),
  ('stable_lookback_months', '12'),
  ('skip_recently_scanned_hours', '0')
ON CONFLICT (key) DO NOTHING;
