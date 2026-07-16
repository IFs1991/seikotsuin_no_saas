import { AuditLogger } from '@/lib/audit-logger';

const logger = AuditLogger;

export async function GET(): Promise<Response> {
  await logger.logDataAccess('fixture', 'read', {});
  return new Response(null, { status: 204 });
}
