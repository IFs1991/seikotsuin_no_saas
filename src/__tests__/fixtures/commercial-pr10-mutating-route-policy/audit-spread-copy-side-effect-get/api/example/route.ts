import { AuditLogger } from '@/lib/audit-logger';

const copiedLogger = {
  ...AuditLogger,
  logDataAccess: (
    _userId: string,
    _action: string,
    _details: Record<string, unknown>
  ) => Promise.resolve(),
};

export async function GET(): Promise<Response> {
  await copiedLogger.logDataAccess('fixture', 'read', {});
  return new Response(null, { status: 204 });
}
