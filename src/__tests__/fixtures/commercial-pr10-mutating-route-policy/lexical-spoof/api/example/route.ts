function ensureClinicAccess(): void {}
function ensureScopedBusinessWriteAccess(): void {}

export function POST(): Response {
  ensureClinicAccess();
  ensureScopedBusinessWriteAccess();
  return new Response(null, { status: 204 });
}
