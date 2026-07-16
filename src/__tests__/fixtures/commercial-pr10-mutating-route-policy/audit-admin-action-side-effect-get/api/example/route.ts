import { AuditLogger } from '@/lib/audit-logger';

export async function GET(): Promise<Response> {
  await AuditLogger.logAdminAction(
    'user-id',
    'user@example.com',
    'fixture-action'
  );
  return new Response(null, { status: 204 });
}
