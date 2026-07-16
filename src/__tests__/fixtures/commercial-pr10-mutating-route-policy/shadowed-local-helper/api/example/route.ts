import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';
import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: () => undefined };

async function mutate(permissions: object): Promise<void> {
  await ensureScopedBusinessWriteAccess({
    permissions,
    targetClinicId: 'clinic-id',
  });
}

export async function POST(request: Request): Promise<Response> {
  await ensureClinicAccess(request, '/api/example', 'clinic-id');
  const mutate = (): void => store.insert();
  mutate();
  return new Response(null, { status: 204 });
}
