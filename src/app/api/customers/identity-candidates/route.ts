import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { handleRouteError } from '@/lib/route-helpers';
import { createCrmAdminClient } from '@/lib/crm-line/db';
import { findPatientIdentityCandidates } from '@/lib/services/patient-identity-service';
import { z } from 'zod';

const PATH = '/api/customers/identity-candidates';
const querySchema = z
  .object({
    clinic_id: z.string().uuid(),
    name: z.string().trim().max(255).optional(),
    phone: z.string().trim().max(20).optional(),
    line_user_id: z.string().trim().max(255).optional(),
    staff_id: z.string().uuid().optional(),
    menu_id: z.string().uuid().optional(),
  })
  .refine(value => Boolean(value.name || value.phone || value.line_user_id), {
    message: 'name, phone, line_user_id のいずれかが必要です',
    path: ['name'],
  });

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      name: request.nextUrl.searchParams.get('name') ?? undefined,
      phone: request.nextUrl.searchParams.get('phone') ?? undefined,
      line_user_id:
        request.nextUrl.searchParams.get('line_user_id') ?? undefined,
      staff_id: request.nextUrl.searchParams.get('staff_id') ?? undefined,
      menu_id: request.nextUrl.searchParams.get('menu_id') ?? undefined,
    });
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const auth = await processApiRequest(request, {
      clinicId: parsed.data.clinic_id,
      requireClinicMatch: true,
      deniedRoles: ['manager'],
      deniedRoleMessage:
        'マネージャーは患者名寄せ候補APIへアクセスできません。',
    });
    if (!auth.success) return auth.error;

    const scopedAdmin = createScopedAdminContext(auth.permissions);
    scopedAdmin.assertClinicInScope(parsed.data.clinic_id);
    const candidates = await findPatientIdentityCandidates(
      createCrmAdminClient(),
      {
        clinicId: parsed.data.clinic_id,
        name: parsed.data.name,
        phone: parsed.data.phone,
        lineUserId: parsed.data.line_user_id,
        staffId: parsed.data.staff_id,
        menuId: parsed.data.menu_id,
      }
    );
    return createSuccessResponse({ candidates });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
