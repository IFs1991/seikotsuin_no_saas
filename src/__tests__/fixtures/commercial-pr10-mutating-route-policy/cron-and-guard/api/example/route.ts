const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!cronSecret && authorization !== `Bearer ${cronSecret}`) {
    return new Response(null, { status: 401 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
