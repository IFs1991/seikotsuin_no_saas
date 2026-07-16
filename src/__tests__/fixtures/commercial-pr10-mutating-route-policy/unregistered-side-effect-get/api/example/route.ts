const store = {
  insert(): void {},
};

export function GET(): Response {
  store.insert();
  return new Response(null, { status: 204 });
}
