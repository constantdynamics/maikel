/**
 * Deployment Verification Script
 * Run with: npx tsx scripts/verify-deployment.ts
 *
 * Checks that all services are properly configured and working.
 */

import { createClient } from '@supabase/supabase-js';

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
];

const OPTIONAL_ENV = ['ALPHA_VANTAGE_API_KEY'];

const REQUIRED_TABLES = [
  'stocks',
  'price_history',
  'growth_events',
  'scan_logs',
  'error_logs',
  'health_checks',
  'archives',
  'settings',
];

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, status: 'pass' | 'fail' | 'warn', message: string) {
  results.push({ name, status, message });
  const icon = status === 'pass' ? '\x1b[32m✓\x1b[0m' : status === 'fail' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m!\x1b[0m';
  console.log(`  ${icon} ${name}: ${message}`);
}

async function main() {
  console.log('\n\x1b[34m=== Stock Screener Deployment Verification ===\x1b[0m\n');

  // 1. Check environment variables
  console.log('\x1b[34mEnvironment Variables:\x1b[0m');

  for (const envVar of REQUIRED_ENV) {
    if (process.env[envVar]) {
      check(envVar, 'pass', 'Set');
    } else {
      check(envVar, 'fail', 'Missing!');
    }
  }

  for (const envVar of OPTIONAL_ENV) {
    if (process.env[envVar] && process.env[envVar] !== 'demo') {
      check(envVar, 'pass', 'Set');
    } else {
      check(envVar, 'warn', 'Not set or using demo key');
    }
  }

  // 2. Check Supabase connection
  console.log('\n\x1b[34mDatabase Connection:\x1b[0m');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    check('Supabase Connection', 'fail', 'Missing credentials');
    printSummary();
    return;
  }

  const supabase = createClient(url, serviceKey);

  try {
    const { error } = await supabase.from('settings').select('key').limit(1);
    if (error) {
      check('Supabase Connection', 'fail', `Error: ${error.message}`);
    } else {
      check('Supabase Connection', 'pass', 'Connected successfully');
    }
  } catch (e) {
    check('Supabase Connection', 'fail', `Connection failed: ${e}`);
    printSummary();
    return;
  }

  // 3. Check tables exist
  console.log('\n\x1b[34mDatabase Tables:\x1b[0m');

  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await supabase.from(table).select('*').limit(0);
      if (error) {
        check(`Table: ${table}`, 'fail', error.message);
      } else {
        check(`Table: ${table}`, 'pass', 'Exists');
      }
    } catch (e) {
      check(`Table: ${table}`, 'fail', `Error: ${e}`);
    }
  }

  // 4. Check default settings
  console.log('\n\x1b[34mDefault Settings:\x1b[0m');

  const { data: settings } = await supabase.from('settings').select('key, value');
  if (settings && settings.length > 0) {
    check('Default Settings', 'pass', `${settings.length} settings found`);
    for (const s of settings) {
      console.log(`    ${s.key} = ${JSON.stringify(s.value)}`);
    }
  } else {
    check('Default Settings', 'fail', 'No settings found - run schema.sql');
  }

  // 5. Check RLS policies
  console.log('\n\x1b[34mRLS Policies:\x1b[0m');

  try {
    // Try to insert and delete a test record
    const { error: insertErr } = await supabase
      .from('error_logs')
      .insert({ source: 'verify-script', message: 'Test entry', severity: 'info' });

    if (insertErr) {
      check('RLS Write Access', 'fail', insertErr.message);
    } else {
      check('RLS Write Access', 'pass', 'Service role can write');

      // Clean up test record
      await supabase
        .from('error_logs')
        .delete()
        .eq('source', 'verify-script')
        .eq('message', 'Test entry');
    }
  } catch (e) {
    check('RLS Policies', 'fail', `Error: ${e}`);
  }

  // 6. Check Yahoo Finance API
  console.log('\n\x1b[34mExternal APIs:\x1b[0m');

  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
    );
    if (response.ok) {
      const data = await response.json() as { quoteResponse?: { result?: Array<{ regularMarketPrice?: number }> } };
      const price = data?.quoteResponse?.result?.[0]?.regularMarketPrice;
      check('Yahoo Finance API', 'pass', `Working (AAPL = $${price})`);
    } else {
      check('Yahoo Finance API', 'warn', `HTTP ${response.status} - may be rate limited`);
    }
  } catch (e) {
    check('Yahoo Finance API', 'fail', `Unreachable: ${e}`);
  }

  // Alpha Vantage
  const avKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${avKey}`,
    );
    if (response.ok) {
      const data = await response.json() as Record<string, unknown>;
      if (data['Global Quote']) {
        check('Alpha Vantage API', 'pass', 'Working');
      } else if (data['Note']) {
        check('Alpha Vantage API', 'warn', 'Rate limited');
      } else {
        check('Alpha Vantage API', 'warn', 'Unexpected response');
      }
    } else {
      check('Alpha Vantage API', 'fail', `HTTP ${response.status}`);
    }
  } catch (e) {
    check('Alpha Vantage API', 'fail', `Unreachable: ${e}`);
  }

  // 7. Check Auth
  console.log('\n\x1b[34mAuthentication:\x1b[0m');

  try {
    const anonClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
      check('Auth Users', 'warn', `Could not list users: ${error.message}`);
    } else if (users && users.length > 0) {
      check('Auth Users', 'pass', `${users.length} user(s) configured`);
    } else {
      check('Auth Users', 'fail', 'No users found - create one in Supabase Dashboard');
    }
  } catch (e) {
    check('Auth Users', 'warn', `Could not verify: ${e}`);
  }

  printSummary();
}

function printSummary() {
  console.log('\n\x1b[34m=== Summary ===\x1b[0m\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;

  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`);
  if (warned > 0) console.log(`  \x1b[33mWarnings: ${warned}\x1b[0m`);
  if (failed > 0) console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`);

  console.log('');

  if (failed === 0) {
    console.log('\x1b[32m✓ All critical checks passed! Ready to deploy.\x1b[0m\n');
  } else {
    console.log('\x1b[31m✗ Some checks failed. Fix the issues above before deploying.\x1b[0m\n');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
