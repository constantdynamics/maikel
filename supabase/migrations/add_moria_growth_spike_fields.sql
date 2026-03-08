-- Add growth event and spike event fields to moria_stocks
-- These mirror the fields from Kuifje (growth events) and Zonnebloem (spike events)

ALTER TABLE moria_stocks ADD COLUMN IF NOT EXISTS growth_event_count INTEGER DEFAULT 0;
ALTER TABLE moria_stocks ADD COLUMN IF NOT EXISTS highest_growth_pct NUMERIC;
ALTER TABLE moria_stocks ADD COLUMN IF NOT EXISTS highest_growth_date TEXT;
ALTER TABLE moria_stocks ADD COLUMN IF NOT EXISTS spike_count INTEGER DEFAULT 0;
ALTER TABLE moria_stocks ADD COLUMN IF NOT EXISTS highest_spike_pct NUMERIC;
ALTER TABLE moria_stocks ADD COLUMN IF NOT EXISTS highest_spike_date TEXT;
ALTER TABLE moria_stocks ADD COLUMN IF NOT EXISTS spike_score NUMERIC DEFAULT 0;
