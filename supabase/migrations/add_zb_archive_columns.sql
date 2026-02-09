-- Add archive and scan_session_id columns to zonnebloem_stocks
-- Run this on existing databases to add new columns

ALTER TABLE zonnebloem_stocks ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE zonnebloem_stocks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE zonnebloem_stocks ADD COLUMN IF NOT EXISTS scan_session_id UUID REFERENCES zonnebloem_scan_logs(id);

CREATE INDEX IF NOT EXISTS idx_zb_stocks_is_archived ON zonnebloem_stocks(is_archived);
CREATE INDEX IF NOT EXISTS idx_zb_stocks_scan_session ON zonnebloem_stocks(scan_session_id);
