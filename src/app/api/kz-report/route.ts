import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Exchange prefix → Yahoo Finance suffix mapping
const EXCHANGE_SUFFIX: Record<string, string> = {
  NYSE: '', NASDAQ: '', AMEX: '', ARCA: '', OTC: '',
  TSX: '.TO', TSXV: '.V', NEO: '.NEO',
  BMFBOVESPA: '.SA', BVMF: '.SA', BMV: '.MX', BCBA: '.BA',
  LSE: '.L', LSIN: '.L',
  XETR: '.DE', FWB: '.F',
  EURONEXT: '.PA', EPA: '.PA',
  BME: '.MC', MIL: '.MI',
  STO: '.ST', NGM: '.ST',
  OSL: '.OL', OSE: '.OL',
  CSE: '.CO', OMXCOP: '.CO',
  HEL: '.HE', OMXHEX: '.HE',
  SIX: '.SW', SWX: '.SW',
  AMS: '.AS', ENXTAM: '.AS',
  BRU: '.BR', ENXTBR: '.BR',
  WSE: '.WA', GPW: '.WA',
  VIE: '.VI', WBAG: '.VI',
  ENXTLS: '.LS', ELI: '.LS',
  ATHEX: '.AT', ASE: '.AT',
  BIST: '.IS', TASE: '.TA',
  HKEX: '.HK', HKSE: '.HK',
  TSE: '.T', JPX: '.T',
  NSE: '.NS', BSE: '.BO',
  KRX: '.KS', KOSDAQ: '.KQ', KOSE: '.KS',
  TWSE: '.TW', TPEX: '.TWO',
  SGX: '.SI', ASX: '.AX',
  NZX: '.NZ', NZE: '.NZ',
  IDX: '.JK', MYX: '.KL', KLSE: '.KL',
  SET: '.BK', PSE: '.PS',
  HOSE: '.VN', HNX: '.VN',
  JSE: '.JO', EGX: '.CA',
  TADAWUL: '.SR', SAU: '.SR',
  DFM: '.AE', ADX: '.AE',
};

function toYahooTicker(ticker: string, exchange: string | null): string {
  if (!exchange) return ticker;
  const suffix = EXCHANGE_SUFFIX[exchange];
  if (suffix !== undefined) return ticker + suffix;
  return ticker;
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  // Auth: require valid Supabase token
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '') ||
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get(`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`)?.value;

  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Fetch Kuifje stocks (not deleted, not archived)
  const { data: kuifjeStocks } = await supabase
    .from('stocks')
    .select('ticker, company_name, purchase_limit, exchange, current_price')
    .eq('is_deleted', false)
    .eq('is_archived', false);

  // Fetch Zonnebloem stocks (not deleted, not archived)
  const { data: zbStocks } = await supabase
    .from('zonnebloem_stocks')
    .select('ticker, company_name, base_price_median, exchange, current_price')
    .eq('is_deleted', false)
    .eq('is_archived', false);

  // Build report: merge both, deduplicate by ticker, use Yahoo suffix
  const seen = new Set<string>();
  const stocks: { ticker: string; buyLimit: number | null; name: string; source: string }[] = [];

  // Kuifje stocks first
  for (const s of kuifjeStocks || []) {
    const yahooTicker = toYahooTicker(s.ticker, s.exchange);
    if (seen.has(yahooTicker)) continue;
    seen.add(yahooTicker);
    stocks.push({
      ticker: yahooTicker,
      buyLimit: s.purchase_limit,
      name: s.company_name || '',
      source: 'kuifje',
    });
  }

  // Zonnebloem stocks (use base_price_median as buy limit proxy)
  for (const s of zbStocks || []) {
    const yahooTicker = toYahooTicker(s.ticker, s.exchange);
    if (seen.has(yahooTicker)) continue;
    seen.add(yahooTicker);
    stocks.push({
      ticker: yahooTicker,
      buyLimit: s.base_price_median,
      name: s.company_name || '',
      source: 'zonnebloem',
    });
  }

  // Sort alphabetically
  stocks.sort((a, b) => a.ticker.localeCompare(b.ticker));

  // Build report text (TICKER-LIMIET format)
  const reportText = stocks
    .map(s => `${s.ticker}-${s.buyLimit !== null ? s.buyLimit.toFixed(3) : '0.000'}`)
    .join('\n');

  const report = {
    generated_at: new Date().toISOString(),
    stock_count: stocks.length,
    stocks,
    report_text: reportText,
  };

  // Archive: save daily report to kz_reports table (upsert by date)
  const today = new Date().toISOString().split('T')[0];
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const adminClient = createClient(supabaseUrl, serviceKey);
    await adminClient
      .from('kz_reports')
      .upsert(
        {
          report_date: today,
          generated_at: report.generated_at,
          stock_count: report.stock_count,
          stocks: report.stocks,
          report_text: report.report_text,
        },
        { onConflict: 'report_date' },
      )
      .then(() => {});
  }

  return NextResponse.json(report);
}
