const store = { insert: () => undefined };

export function GET(request: Request): Response {
  const authorization = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const unrelatedSecret = 'unrelated';
  if (!cronSecret || authorization !== `Bearer ${unrelatedSecret}`) {
    return new Response(null, { status: 401 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
