/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260813012718_line_integration_security_foundation.sql'
);
const rollbackPath = path.resolve(
  process.cwd(),
  'supabase/rollbacks/20260813012718_line_integration_security_foundation_rollback.sql'
);
const specPath = path.resolve(
  process.cwd(),
  'docs/stabilization/spec-line-self-serve-integration-v0.4.md'
);

describe('LINE integration security foundation migration', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const rollback = readFileSync(rollbackPath, 'utf8');
  const spec = readFileSync(specPath, 'utf8');

  it('scopes LINE patient identity to the clinic/provider boundary', () => {
    expect(migration).toContain(
      'create unique index if not exists customers_clinic_line_user_id_unique'
    );
    expect(migration).toContain(
      'on public.customers (clinic_id, line_user_id)'
    );
    expect(migration).toContain('where line_user_id is not null');
    expect(migration).toContain(
      'drop constraint if exists customers_line_user_id_key'
    );
  });

  it('creates the setup, chat, webhook, outbox and heartbeat foundation', () => {
    for (const tableName of [
      'clinic_line_setup_sessions',
      'clinic_line_credential_generations',
      'clinic_line_chat_settings',
      'line_contacts',
      'line_conversations',
      'line_webhook_events',
      'line_messages',
      'line_chat_outbox',
      'line_job_heartbeats',
    ]) {
      expect(migration).toContain(
        `create table if not exists public.${tableName}`
      );
    }

    expect(migration).toContain('retention_days between 1 and 365');
    expect(migration).toContain(
      "expires_at <= created_at + interval '24 hours'"
    );
    expect(migration).toContain('unique (clinic_id, webhook_event_id)');
    expect(migration).toContain("status = 'unsent'");
    expect(migration).toContain('encrypted_private_jwk = null');
    expect(migration).toContain('days => coalesce(');
    expect(migration).not.toContain('line_chat_outbox_line_user_id_not_blank');
    expect(migration).toContain(
      'create or replace function public.enqueue_line_chat_message('
    );
    expect(migration).toContain('LINE_CHAT_SENDER_NOT_IN_CLINIC');
    expect(migration).toContain(
      'create or replace function public.rotate_line_credential_generation('
    );
    expect(migration).toContain("'line-delivery:' || p_clinic_id::text");
    expect(migration).toContain(
      'assertion_private_key_encrypted = v_encrypted_private_jwk'
    );
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain('LINE_PREVIOUS_CONTACT_CUSTOMER_MISMATCH');
    expect(migration).toContain(
      'clinic_line_setup_sessions_verification_lifecycle'
    );
    expect(migration).toContain('access_token_encrypted = null');
    expect(migration).toContain('token_expires_at = null');
    expect(migration).toContain('LINE_CHAT_DISABLED');
    expect(migration).toContain("last_error_code = 'message_not_sendable'");
    expect(migration).toContain('claim_line_notification_outbox');
    expect(migration).toContain('finalize_line_notification_outbox');
    expect(migration).toContain('renew_line_notification_claim');
    expect(migration).toContain(
      'LINE_NOTIFICATION_PATIENT_GENERATION_MISMATCH'
    );
    expect(migration).toContain('line_message_outbox_customer_clinic_fkey');
    expect(migration).toContain('sync_failed_line_notification_tracking');
    expect(migration).toContain(
      'quarantine_unverified_line_notification_history'
    );
    expect(migration).toContain('legacy_provider_identity_unverified');
    expect(
      migration.indexOf(
        'select public.quarantine_unverified_line_notification_history();'
      )
    ).toBeLessThan(
      migration.indexOf(
        'create trigger initialize_line_message_outbox_generation_trigger'
      )
    );
    expect(migration).toContain('LINE_CUSTOMER_RELINK_REQUIRED');
    expect(migration).toContain('LINE_CUSTOMER_RELINK_GENERATION_REQUIRED');
    expect(migration).toContain('LINE_CUSTOMER_RELINK_RPC_REQUIRED');
    expect(migration).toContain('LINE_CUSTOMER_GENERATION_NOT_CURRENT');
    expect(migration).toMatch(
      /create or replace function public\.relink_line_contact_generation[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog, public/
    );
    expect(migration).toContain('claim_lease_expired_max_attempts');
    expect(migration).toContain(
      "notification.detail->>'line_outbox_id' = new.id::text"
    );
    expect(migration).toContain('protect_customer_line_identity');
    expect(migration).toContain('credential_generation_replaced');
    expect(migration).toContain(
      'create or replace function public.enqueue_outreach_campaign('
    );
    expect(migration).toContain('LINE_OUTREACH_RECIPIENT_SET_CHANGED');
    expect(migration).toContain('LINE_OUTREACH_FREQUENCY_LIMIT');
    expect(migration).toContain(
      "outbox.payload#>>'{outreach,recipientId}' = recipient.id::text"
    );
    expect(migration).toContain(
      "delivery.payload#>>'{outreach,recipientId}' = delivery.recipient_id::text"
    );
    expect(migration).toContain(
      "hashtextextended('line-delivery:' || new.clinic_id::text, 0)"
    );
  });

  it('keeps every new relation and maintenance function service-role only', () => {
    expect(migration).toContain(
      "execute format('alter table public.%I enable row level security', table_name)"
    );
    expect(migration).toContain(
      "execute format('revoke all on table public.%I from authenticated', table_name)"
    );
    expect(migration).toContain(
      'revoke all on function public.purge_expired_line_chat_data(uuid)'
    );
    expect(migration).toContain(
      'grant execute on function public.purge_expired_line_chat_data(uuid)'
    );
    expect(migration).toContain(
      'revoke all on function public.enqueue_outreach_campaign(uuid, uuid, text, jsonb)'
    );
    expect(migration).toContain('LINE_FOUNDATION_CLIENT_TABLE_GRANT');
    expect(migration).toContain('LINE_FOUNDATION_CLIENT_FUNCTION_GRANT');
  });

  it('ships a non-destructive forward-fix rollback and implementation spec', () => {
    expect(rollback).toContain('Forward-fix rollback guard');
    expect(rollback).not.toMatch(
      /\bdrop\s+table\b|\btruncate\s+(?:table\s+)?public\.|\bdelete\s+from\b/iu
    );
    expect(rollback).toContain(
      'Refusing rollback: unsafe global LINE identity constraint returned'
    );
    expect(spec).toContain('## 7. UI/UX Design Rationale');
    expect(spec).toContain('- [x] EXTEND');
    expect(spec).toContain('リモートSupabaseへのmigration適用');
  });
});
