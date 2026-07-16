import { AuditLogger } from '@/lib/audit-logger';

export async function GET(): Promise<Response> {
  await AuditLogger.logDataAccess(
    'user-id',
    'user@example.com',
    'fixture',
    'clinic-id'
  );
  return new Response(null, { status: 204 });
}
