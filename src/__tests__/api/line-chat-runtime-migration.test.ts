/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260814010908_line_chat_runtime_contract.sql'
  ),
  'utf8'
);
const rollback = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/rollbacks/20260814010908_line_chat_runtime_contract_rollback.sql'
  ),
  'utf8'
);
const spec = readFileSync(
  path.resolve(
    process.cwd(),
    'docs/stabilization/spec-line-self-serve-integration-v0.4.md'
  ),
  'utf8'
);
const processor = readFileSync(
  path.resolve(process.cwd(), 'src/lib/line/chat-outbox-processor.ts'),
  'utf8'
);

describe('LINE chat runtime migration contract', () => {
  it('ships the webhook, enqueue, delivery, and daily cleanup functions atomically', () => {
    expect(migration.trimStart().startsWith('begin;')).toBe(true);
    expect(migration.trimEnd().endsWith('commit;')).toBe(true);
    expect(migration).toContain(
      'create or replace function public.process_line_webhook_delivery('
    );
    expect(migration).toContain(
      'create or replace function public.enqueue_line_chat_message('
    );
    expect(migration).toContain(
      'create or replace function public.finalize_line_chat_outbox('
    );
    expect(migration).toContain(
      'create or replace function public.run_line_chat_cleanup_if_due()'
    );
    expect(migration).toContain(
      'create or replace function public.renew_line_chat_outbox_claim('
    );
    expect(migration).toContain(
      'create or replace function public.list_authorized_line_chat_messages('
    );
    expect(migration).toContain(
      'create table if not exists public.line_unsend_tombstones'
    );
  });

  it('deduplicates, clears unsent text, and applies the 24-hour auto-reply bound', () => {
    expect(migration).toContain(
      'on conflict (clinic_id, webhook_event_id) do nothing'
    );
    expect(migration).toContain("status = 'unsent'");
    expect(migration).toContain('text_content = null');
    expect(migration).toContain('unsend_message_id = v_unsend_message_id');
    expect(migration).toContain("error_code = 'source_not_supported'");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("'line-delivery:' || p_clinic_id::text");
    expect(migration).toContain("outbox.status in ('pending', 'processing')");
    expect(migration).toContain('from public.line_unsend_tombstones tombstone');
    expect(migration).toContain(
      'from public.manager_clinic_assignments assignment'
    );
    expect(
      migration.match(/hashtext\('manager_clinic_assignments'\)/gu)
    ).toHaveLength(3);
    expect(
      migration.match(/v_actor_role not in \('therapist', 'staff'\)/gu)
    ).toHaveLength(2);
  });

  it('renews one delivery immediately before push and pins the provider generation', () => {
    expect(processor).toContain('const CLAIM_SIZE = 1;');
    expect(processor.match(/await renewChatOutboxClaim\(/gu)).toHaveLength(2);
    expect(processor).toContain(
      'credentialGenerationId: firstRenewal.credential_generation_id'
    );
  });

  it('keeps all runtime functions service-role only with exact postflight checks', () => {
    expect(migration).toContain(
      'revoke all on function public.process_line_webhook_delivery(uuid, uuid, jsonb)'
    );
    expect(migration).toContain(
      'grant execute on function public.run_line_chat_cleanup_if_due()'
    );
    expect(migration).toContain(
      "actual_execute_roles is distinct from array['service_role']::text[]"
    );
    expect(migration).toContain('has_execute_grant_option');
  });

  it('uses a non-destructive forward-fix rollback and the EXTEND product contract', () => {
    expect(rollback).toContain('Forward-fix rollback guard');
    expect(rollback).not.toMatch(
      /\bdrop\s+table\b|\btruncate\s+(?:table\s+)?public\.|\bdelete\s+from\b/iu
    );
    expect(rollback).toContain(
      'Refusing rollback: LINE chat runtime contract drifted'
    );
    expect(spec).toContain('### PR3: Webhook・テキストチャット');
    expect(spec).toContain('- [x] EXTEND');
  });
});
