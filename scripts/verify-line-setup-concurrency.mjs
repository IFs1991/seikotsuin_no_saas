import { createClient } from '@supabase/supabase-js';

const requiredEnvironment = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LINE_SETUP_CONCURRENCY_CLINIC_ID',
  'LINE_SETUP_CONCURRENCY_SESSION_ID',
];

const missing = requiredEnvironment.filter(name => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
}

const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

const args = {
  p_clinic_id: process.env.LINE_SETUP_CONCURRENCY_CLINIC_ID,
  p_setup_session_id: process.env.LINE_SETUP_CONCURRENCY_SESSION_ID,
};

async function claim(client, actor) {
  const { data, error } = await client
    .rpc('claim_line_setup_verification', args)
    .single();
  if (error) throw new Error(`${actor}:${error.message}`);
  if (!data?.claim_token) throw new Error(`${actor}:missing claim result`);
  return data;
}

const results = await Promise.allSettled([
  claim(createServiceClient(), 'connection-a'),
  claim(createServiceClient(), 'connection-b'),
]);
const winners = results.filter(result => result.status === 'fulfilled');
const losers = results.filter(result => result.status === 'rejected');
if (winners.length !== 1 || losers.length !== 1) {
  throw new Error(
    `Expected one successful verification claim and one rejection; got ${winners.length} success(es) and ${losers.length} rejection(s)`
  );
}

const winner = winners[0].value;
const releaseClient = createServiceClient();
const { error: releaseError } = await releaseClient.rpc(
  'release_line_setup_verification_claim',
  {
    p_claim_token: winner.claim_token,
    p_clinic_id: args.p_clinic_id,
    p_setup_session_id: args.p_setup_session_id,
  }
);
if (releaseError) throw new Error(releaseError.message);

console.log(
  JSON.stringify({
    ok: true,
    rejectedClaims: losers.length,
    retryKey: winner.push_test_retry_key,
    successfulClaims: winners.length,
  })
);
