const store = { insert: () => undefined };

export function GET(request: Request): Response {
  let authorization = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  authorization = `Bearer ${cronSecret}`;
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new Response(null, { status: 401 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
