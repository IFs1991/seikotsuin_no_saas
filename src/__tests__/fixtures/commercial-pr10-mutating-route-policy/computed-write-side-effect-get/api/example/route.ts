const store = { insert: (_value: number) => undefined };

export async function GET(): Promise<Response> {
  store['insert'](1);
  return new Response(null, { status: 204 });
}
