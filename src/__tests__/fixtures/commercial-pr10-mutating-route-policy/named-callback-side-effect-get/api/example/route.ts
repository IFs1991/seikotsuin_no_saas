const store = { insert: (_value: number) => undefined };

function writeValue(value: number): void {
  store.insert(value);
}

export async function GET(): Promise<Response> {
  [1].map(writeValue);
  return new Response(null, { status: 204 });
}
