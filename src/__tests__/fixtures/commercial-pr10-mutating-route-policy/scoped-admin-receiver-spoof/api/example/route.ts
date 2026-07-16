import { processApiRequest } from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase/scoped-admin';

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request, {
    allowedRoles: ['admin'],
    requireClinicMatch: false,
  });
  if (!result.success) return result.error;

  const adminCtx = createScopedAdminContext(result.permissions);
  {
    const adminCtx = {
      assertClinicInScope: (_clinicId: string) => undefined,
    };
    adminCtx.assertClinicInScope('clinic-outside-scope');
  }
  await adminCtx.client.from('example').insert({ value: true });
  return new Response(null, { status: 204 });
}
