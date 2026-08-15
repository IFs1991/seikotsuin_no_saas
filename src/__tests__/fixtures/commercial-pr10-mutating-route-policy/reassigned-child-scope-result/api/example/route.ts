import { processApiRequest } from '@/lib/api-helpers';
import {
  createScopedAdminContext,
  resolveChildClinicInScope,
} from '@/lib/supabase/scoped-admin';

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request, {
    allowedRoles: ['admin'],
    requireClinicMatch: false,
  });
  if (!result.success) return result.error;

  const parentClinicId = 'parent-clinic';
  const adminCtx = createScopedAdminContext(result.permissions);

  let resolvedChildClinicId: string;
  try {
    resolvedChildClinicId = await resolveChildClinicInScope(
      adminCtx,
      'created-child-clinic',
      parentClinicId
    );
  } catch {
    return new Response(null, { status: 500 });
  }

  resolvedChildClinicId &&= 'clinic-outside-scope';
  const childClinicId = resolvedChildClinicId;
  await adminCtx.client.from('example').insert({ clinic_id: childClinicId });
  return new Response(null, { status: 204 });
}
