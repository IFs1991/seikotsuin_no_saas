const store = { insert: () => undefined };

export function GET(_request: Request, context: Request): Response {
  const authorization = context.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new Response(null, { status: 401 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
