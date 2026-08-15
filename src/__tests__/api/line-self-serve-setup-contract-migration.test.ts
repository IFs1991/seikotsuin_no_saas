import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814003500_line_self_serve_setup_contract.sql'
  ),
  'utf8'
);
const rollback = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/rollbacks/20260814003500_line_self_serve_setup_contract_rollback.sql'
  ),
  'utf8'
);

describe('LINE self-serve setup migration contract', () => {
  it('stores the verified setup draft only in encrypted short-term storage', () => {
    expect(migration).toContain('encrypted_verification_payload text');
    expect(migration).toContain('wipe_line_setup_session_secrets_trigger');
    expect(migration).toContain('new.encrypted_verification_payload := null');
    expect(migration).toContain('verification_claim_token := null');
    expect(migration).toContain('provider_identity_verified boolean');
  });

  it('completes first-time and replacement setup in one RPC contract', () => {
    expect(migration).toContain(
      'create or replace function public.complete_line_self_serve_setup'
    );
    expect(migration).toContain('public.rotate_line_credential_generation(');
    expect(migration).toContain('line_chat_enabled = false');
  });

  it('keeps every mutation RPC service-role only', () => {
    expect(migration).toMatch(
      /revoke all on function public\.complete_line_self_serve_setup[\s\S]*from public, anon, authenticated, service_role/i
    );
    expect(migration).toMatch(
      /grant execute on function public\.complete_line_self_serve_setup[\s\S]*to service_role/i
    );
    expect(migration).toMatch(
      /revoke all on function public\.update_line_chat_settings[\s\S]*from public, anon, authenticated, service_role/i
    );
    expect(migration).toContain(
      'create or replace function public.claim_line_setup_verification'
    );
    expect(migration).toContain(
      'create or replace function public.finalize_line_setup_verification'
    );
    expect(migration).toContain(
      'create or replace function public.update_line_feature_settings'
    );
    expect(migration).toContain(
      'create or replace function public.get_line_public_booking_context'
    );
    expect(migration).toContain("array['service_role']::text[]");
  });

  it('serializes verification and requires provider identity for booking', () => {
    expect(migration).toContain('LINE_SETUP_VERIFICATION_IN_PROGRESS');
    expect(migration).toContain('push_test_retry_key');
    expect(migration).toContain('verification_request_digest');
    expect(migration).toContain(
      'create or replace function public.bind_line_setup_push_request'
    );
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain('LINE_SETUP_PUSH_REQUEST_CHANGED');
    expect(migration).toContain('LINE_BOOKING_IDENTITY_NOT_VERIFIED');
    expect(migration).toContain(
      "hashtextextended('line-delivery:' || p_clinic_id::text, 0)"
    );
  });

  it('uses a non-destructive forward-fix rollback guard', () => {
    expect(rollback).toContain('Forward-fix rollback guard');
    expect(rollback).not.toMatch(/drop\s+(column|function|table)/i);
    expect(rollback).toContain('search_path=pg_catalog, public');
  });
});
