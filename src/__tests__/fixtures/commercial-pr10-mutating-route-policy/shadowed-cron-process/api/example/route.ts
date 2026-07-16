const store = { insert: () => undefined };
const process = { env: { CRON_SECRET: 'public' } };

export function GET(request: Request): Response {
  const authorization = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new Response(null, { status: 401 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
