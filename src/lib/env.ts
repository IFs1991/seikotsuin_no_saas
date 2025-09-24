const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const missing = REQUIRED_ENV_VARS.filter(name => {
  const value = process.env[name];
  return value === undefined || value.length === 0;
});

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
} as const;

export function assertEnv(name: keyof typeof env) {
  const value = env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}
