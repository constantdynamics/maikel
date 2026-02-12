-- K&Z Report archive table
CREATE TABLE IF NOT EXISTS kz_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date date NOT NULL UNIQUE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  stock_count integer NOT NULL DEFAULT 0,
  stocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  report_text text NOT NULL DEFAULT ''
);

-- Index for quick lookups by date
CREATE INDEX IF NOT EXISTS idx_kz_reports_date ON kz_reports (report_date DESC);

-- RLS: allow authenticated users to read
ALTER TABLE kz_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read kz_reports"
  ON kz_reports FOR SELECT
  TO authenticated
  USING (true);

-- Service role can insert/update
CREATE POLICY "Service role can manage kz_reports"
  ON kz_reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
