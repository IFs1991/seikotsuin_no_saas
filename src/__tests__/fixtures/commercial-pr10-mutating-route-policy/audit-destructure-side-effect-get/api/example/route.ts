import { AuditLogger } from '@/lib/audit-logger';

const { logDataAccess } = AuditLogger;

export async function GET(): Promise<Response> {
  await logDataAccess('user-id', 'user@example.com', 'fixture', 'clinic-id');
  return new Response(null, { status: 204 });
}
