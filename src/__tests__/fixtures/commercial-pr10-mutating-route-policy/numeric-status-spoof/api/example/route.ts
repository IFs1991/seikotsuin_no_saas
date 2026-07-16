export function POST(): Response {
  const deprecatedStatus = 410;
  return new Response(String(deprecatedStatus), { status: 204 });
}
