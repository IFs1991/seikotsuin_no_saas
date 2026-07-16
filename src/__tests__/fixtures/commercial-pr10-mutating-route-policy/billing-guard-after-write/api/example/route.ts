import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';
import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const { permissions } = await ensureClinicAccess(
    request,
    '/api/example',
    'clinic-id'
  );
  store.insert();
  await ensureScopedBusinessWriteAccess({
    permissions,
    targetClinicId: 'clinic-id',
  });
  return new Response(null, { status: 204 });
}
