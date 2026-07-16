const localParser = {
  parse(value: unknown): unknown {
    return value;
  },
};

export async function POST(request: Request): Promise<Response> {
  const json = JSON.parse(await request.text());
  localParser.parse(json);
  return new Response(null, { status: 204 });
}
