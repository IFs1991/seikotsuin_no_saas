import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../supabase/migrations/20260906003219_post_core100_notification_durability.sql'
  ),
  'utf8'
);

describe('post-Core100 notification migration contract', () => {
  it('keeps lease revisions strictly monotone on the email-specific trigger only', () => {
    expect(sql).toContain('public.update_email_outbox_updated_at()');
    expect(sql).toContain("old.updated_at + interval '1 microsecond'");
    expect(sql).not.toContain('public.update_updated_at_column()');
  });
  it('atomically stores the outbox using a private invoker trigger without client grants', () => {
    expect(sql).toContain(
      'app_private.persist_reservation_notification_outbox()'
    );
    expect(sql).toContain('security invoker');
    expect(sql).toContain('after insert or update of status, detail');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).not.toMatch(
      /grant\s+(?:all|execute).*?to\s+(?:anon|authenticated)/is
    );
  });
});
