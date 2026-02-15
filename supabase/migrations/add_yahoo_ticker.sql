-- Add yahoo_ticker column to zonnebloem_stocks
-- This stores the Yahoo Finance-compatible ticker (e.g., "0A91.F" instead of "0A91")
-- which Defog's data providers can actually resolve.
ALTER TABLE zonnebloem_stocks ADD COLUMN IF NOT EXISTS yahoo_ticker VARCHAR(30);

-- Backfill yahoo_ticker for existing stocks based on exchange
-- This maps TradingView exchange names to Yahoo Finance ticker suffixes
UPDATE zonnebloem_stocks
SET yahoo_ticker = CASE
  -- US markets: no suffix needed
  WHEN exchange IN ('NYSE', 'NASDAQ', 'AMEX', 'ARCA') THEN ticker
  -- European markets
  WHEN exchange IN ('LSE', 'LSIN') THEN ticker || '.L'
  WHEN exchange IN ('XETR') THEN ticker || '.DE'
  WHEN exchange IN ('FWB') THEN ticker || '.F'
  WHEN exchange IN ('EPA', 'EURONEXT') THEN ticker || '.PA'
  WHEN exchange IN ('BME') THEN ticker || '.MC'
  WHEN exchange IN ('MIL') THEN ticker || '.MI'
  WHEN exchange IN ('STO', 'NGM') THEN ticker || '.ST'
  WHEN exchange IN ('OSL', 'OSE') THEN ticker || '.OL'
  WHEN exchange IN ('CSE', 'OMXCOP') THEN ticker || '.CO'
  WHEN exchange IN ('HEL', 'OMXHEX') THEN ticker || '.HE'
  WHEN exchange IN ('SIX', 'SWX') THEN ticker || '.SW'
  WHEN exchange IN ('AMS', 'ENXTAM') THEN ticker || '.AS'
  WHEN exchange IN ('BRU', 'ENXTBR') THEN ticker || '.BR'
  WHEN exchange IN ('WSE', 'GPW') THEN ticker || '.WA'
  WHEN exchange IN ('VIE', 'WBAG') THEN ticker || '.VI'
  WHEN exchange IN ('ENXTLS', 'ELI') THEN ticker || '.LS'
  WHEN exchange IN ('ATHEX', 'ASE') THEN ticker || '.AT'
  WHEN exchange IN ('BIST') THEN ticker || '.IS'
  WHEN exchange IN ('TASE') THEN ticker || '.TA'
  -- Asia-Pacific
  WHEN exchange IN ('HKEX', 'HKSE') THEN ticker || '.HK'
  WHEN exchange IN ('TSE', 'JPX') THEN ticker || '.T'
  WHEN exchange IN ('NSE') THEN ticker || '.NS'
  WHEN exchange IN ('BSE') THEN ticker || '.BO'
  WHEN exchange IN ('KRX', 'KOSE') THEN ticker || '.KS'
  WHEN exchange IN ('KOSDAQ') THEN ticker || '.KQ'
  WHEN exchange IN ('TWSE') THEN ticker || '.TW'
  WHEN exchange IN ('TPEX') THEN ticker || '.TWO'
  WHEN exchange IN ('SGX') THEN ticker || '.SI'
  WHEN exchange IN ('ASX') THEN ticker || '.AX'
  WHEN exchange IN ('NZX', 'NZE') THEN ticker || '.NZ'
  WHEN exchange IN ('IDX') THEN ticker || '.JK'
  WHEN exchange IN ('MYX', 'KLSE') THEN ticker || '.KL'
  WHEN exchange IN ('SET') THEN ticker || '.BK'
  WHEN exchange IN ('SSE', 'SHH') THEN ticker || '.SS'
  WHEN exchange IN ('SZSE', 'SHZ') THEN ticker || '.SZ'
  -- Americas
  WHEN exchange IN ('TSX') THEN ticker || '.TO'
  WHEN exchange IN ('TSXV') THEN ticker || '.V'
  WHEN exchange IN ('BMFBOVESPA', 'BVMF') THEN ticker || '.SA'
  WHEN exchange IN ('BMV') THEN ticker || '.MX'
  -- Africa & Middle East
  WHEN exchange IN ('JSE') THEN ticker || '.JO'
  WHEN exchange IN ('TADAWUL', 'SAU') THEN ticker || '.SR'
  -- Default: keep as-is
  ELSE ticker
END
WHERE yahoo_ticker IS NULL;
