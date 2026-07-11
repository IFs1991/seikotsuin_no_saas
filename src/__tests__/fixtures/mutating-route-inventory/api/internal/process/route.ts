export async function GET() {
  const client = createAdminClient();
  return processEmailOutbox(client);
}

declare function createAdminClient(): unknown;
declare function processEmailOutbox(client: unknown): Promise<unknown>;
