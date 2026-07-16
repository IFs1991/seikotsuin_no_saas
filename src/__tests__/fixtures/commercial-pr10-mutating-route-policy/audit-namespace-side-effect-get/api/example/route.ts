import * as audit from '@/lib/audit-logger';

export async function GET(): Promise<Response> {
  await audit.AuditLogger.logDataAccess('fixture', 'read', {});
  return new Response(null, { status: 204 });
}
