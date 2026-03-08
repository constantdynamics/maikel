-- Add unique constraint on moria_stocks(ticker, market) to prevent duplicate rows.
-- This ensures the scanner can safely detect existing stocks regardless of is_deleted status.

-- Step 1: Deduplicate existing rows, keeping the most recently updated one per (ticker, market)
DELETE FROM moria_stocks
WHERE id NOT IN (
  SELECT DISTINCT ON (ticker, market) id
  FROM moria_stocks
  ORDER BY ticker, market, last_updated DESC NULLS LAST
);

-- Step 2: Add unique constraint
ALTER TABLE moria_stocks
  ADD CONSTRAINT moria_stocks_ticker_market_key UNIQUE (ticker, market);
