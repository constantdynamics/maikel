/**
 * Environment variable validation at startup.
 * Call this early in the app lifecycle to fail fast on misconfiguration.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, description: 'Supabase project URL' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, description: 'Supabase anon key' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, description: 'Supabase service role key for API routes' },
  { name: 'CRON_SECRET', required: true, description: 'Secret for cron endpoint authentication' },
  { name: 'ALPHA_VANTAGE_API_KEY', required: false, description: 'Alpha Vantage API key (25 calls/day free tier)' },
  { name: 'NEXT_PUBLIC_DEFOG_SUPABASE_URL', required: false, description: 'Defog Supabase URL' },
  { name: 'NEXT_PUBLIC_DEFOG_SUPABASE_ANON_KEY', required: false, description: 'Defog Supabase anon key' },
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value) {
      if (envVar.required) {
        errors.push(`Missing required env var: ${envVar.name} (${envVar.description})`);
      } else {
        warnings.push(`Optional env var not set: ${envVar.name} (${envVar.description})`);
      }
      continue;
    }

    // Basic format validation
    if (envVar.name.includes('SUPABASE_URL') && !value.startsWith('https://')) {
      errors.push(`${envVar.name} must start with https:// (got: ${value.substring(0, 20)}...)`);
    }

    if (envVar.name === 'SUPABASE_SERVICE_ROLE_KEY' && value.length < 30) {
      errors.push(`${envVar.name} looks too short (${value.length} chars) - check for truncation`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment on import (runs once at startup).
 * Logs warnings but doesn't throw - allows graceful degradation.
 */
let validated = false;
export function ensureEnvValidated(): void {
  if (validated) return;
  validated = true;

  const result = validateEnvironment();

  if (result.warnings.length > 0) {
    console.warn('[ENV] Warnings:', result.warnings.join('; '));
  }

  if (!result.valid) {
    console.error('[ENV] Configuration errors:', result.errors.join('; '));
  }
}
