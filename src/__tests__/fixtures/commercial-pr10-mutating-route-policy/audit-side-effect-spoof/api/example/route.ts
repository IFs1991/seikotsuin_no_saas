const AuditLogger = {
  logDataAccess: async () => undefined,
};

export async function GET(): Promise<Response> {
  await AuditLogger.logDataAccess();
  return new Response(null, { status: 204 });
}
