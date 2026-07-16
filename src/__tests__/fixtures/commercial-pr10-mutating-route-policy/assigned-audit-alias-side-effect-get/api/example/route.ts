import { AuditLogger } from '@/lib/audit-logger';

let assignedAuditMethod: typeof AuditLogger.logDataAccess;
assignedAuditMethod = AuditLogger.logDataAccess;

export async function GET(): Promise<Response> {
  await assignedAuditMethod(
    'user-id',
    'user@example.com',
    'fixture',
    'clinic-id'
  );
  return new Response(null, { status: 204 });
}
