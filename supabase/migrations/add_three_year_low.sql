-- Add three_year_low column to stocks table (Kuifje scanner)
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS three_year_low DECIMAL(12, 4);

-- Add three_year_low column to zonnebloem_stocks table (Prof. Zonnebloem scanner)
ALTER TABLE zonnebloem_stocks ADD COLUMN IF NOT EXISTS three_year_low DECIMAL(12, 4);

-- Backfill three_year_low for existing Kuifje stocks from price_history
UPDATE stocks s
SET three_year_low = sub.min_low
FROM (
  SELECT ticker, MIN(low_price) as min_low
  FROM price_history
  WHERE trade_date >= (CURRENT_DATE - INTERVAL '3 years')
    AND low_price > 0
  GROUP BY ticker
) sub
WHERE s.ticker = sub.ticker
  AND s.three_year_low IS NULL;
