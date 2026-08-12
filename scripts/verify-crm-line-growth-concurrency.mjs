import { createClient } from '@supabase/supabase-js';

const requiredEnvironment = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRM_CONCURRENCY_CLINIC_ID',
  'CRM_CONCURRENCY_EVENT_ID',
  'CRM_CONCURRENCY_CUSTOMER_ID',
  'CRM_CONCURRENCY_LINE_USER_ID',
  'CRM_CONCURRENCY_MENU_ID',
  'CRM_CONCURRENCY_STAFF_ID',
  'CRM_CONCURRENCY_START_TIME',
  'CRM_CONCURRENCY_END_TIME',
];

const missing = requiredEnvironment.filter(name => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const createServiceClient = () =>
  createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const args = {
  p_clinic_id: process.env.CRM_CONCURRENCY_CLINIC_ID,
  p_event_id: process.env.CRM_CONCURRENCY_EVENT_ID,
  p_customer_id: process.env.CRM_CONCURRENCY_CUSTOMER_ID,
  p_line_user_id: process.env.CRM_CONCURRENCY_LINE_USER_ID,
  p_menu_id: process.env.CRM_CONCURRENCY_MENU_ID,
  p_staff_id: process.env.CRM_CONCURRENCY_STAFF_ID,
  p_start_time: process.env.CRM_CONCURRENCY_START_TIME,
  p_end_time: process.env.CRM_CONCURRENCY_END_TIME,
  p_notes: null,
  p_channel: 'line',
  p_is_staff_requested: true,
  p_intake_responses: [],
  p_campaign_id: null,
};

async function claim(client, actor) {
  const { data, error } = await client.rpc(
    'create_staff_availability_reservation',
    args
  );
  if (error) throw new Error(`${actor}:${error.message}`);
  const reservation = data?.[0];
  if (!reservation?.id) throw new Error(`${actor}:missing reservation result`);
  return reservation;
}

const firstClient = createServiceClient();
const secondClient = createServiceClient();
const results = await Promise.allSettled([
  claim(firstClient, 'connection-a'),
  claim(secondClient, 'connection-b'),
]);
const winners = results.filter(result => result.status === 'fulfilled');
const losers = results.filter(result => result.status === 'rejected');
if (winners.length !== 1 || losers.length !== 1) {
  throw new Error(
    `Expected one successful claim and one rejected claim; got ${winners.length} success(es) and ${losers.length} rejection(s)`
  );
}

const winner = winners[0].value;
const auditClient = createServiceClient();
const [reservationResult, rewardResult, eventResult, notificationResult] =
  await Promise.all([
    auditClient
      .from('reservations')
      .select('id', { count: 'exact' })
      .eq('id', winner.id)
      .eq('clinic_id', args.p_clinic_id),
    auditClient
      .from('reservation_rewards')
      .select('id', { count: 'exact' })
      .eq('clinic_id', args.p_clinic_id)
      .contains('metadata', { availability_event_id: args.p_event_id }),
    auditClient
      .from('staff_availability_events')
      .select('status')
      .eq('id', args.p_event_id)
      .eq('clinic_id', args.p_clinic_id)
      .single(),
    auditClient
      .from('staff_availability_notifications')
      .select('status, booked_reservation_id')
      .eq('availability_event_id', args.p_event_id)
      .eq('clinic_id', args.p_clinic_id)
      .eq('customer_id', args.p_customer_id)
      .single(),
  ]);

for (const result of [
  reservationResult,
  rewardResult,
  eventResult,
  notificationResult,
]) {
  if (result.error) throw new Error(result.error.message);
}

if (reservationResult.count !== 1 || rewardResult.count !== 1) {
  throw new Error(
    `Atomicity audit failed: reservations=${reservationResult.count}, rewards=${rewardResult.count}`
  );
}
if (
  eventResult.data.status !== 'booked' ||
  notificationResult.data.status !== 'booked' ||
  notificationResult.data.booked_reservation_id !== winner.id
) {
  throw new Error('Booked event/notification state does not match the winner');
}

console.log(
  JSON.stringify({
    ok: true,
    reservationId: winner.id,
    successfulClaims: winners.length,
    rejectedClaims: losers.length,
    rewards: rewardResult.count,
  })
);
