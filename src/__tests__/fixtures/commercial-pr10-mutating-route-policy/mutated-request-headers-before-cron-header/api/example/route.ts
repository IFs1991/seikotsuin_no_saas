const store = { insert: () => undefined };

export function POST(request: Request): Response {
  request.headers.set('authorization', `Bearer ${process.env.CRON_SECRET}`);
  const authorization = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new Response(null, { status: 401 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
