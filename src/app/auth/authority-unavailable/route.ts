export function GET(): Response {
  return new Response(null, {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
