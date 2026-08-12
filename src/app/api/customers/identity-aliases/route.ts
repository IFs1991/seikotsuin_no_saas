import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createCrmAdminClient } from '@/lib/crm-line/db';
import {
  createPatientIdentityAlias,
  deletePatientIdentityAlias,
  listPatientIdentityAliases,
} from '@/lib/services/patient-identity-service';

const PATH = '/api/customers/identity-aliases';
const querySchema = z.object({
  clinic_id: z.string().uuid(),
  customer_id: z.string().uuid(),
});
const aliasSchema = querySchema.extend({
  alias: z.string().trim().min(1).max(255),
  alias_type: z.enum(['name', 'phonetic_name', 'other']).default('name'),
  source: z.enum(['manual', 'line_profile', 'import']).default('manual'),
});
const deleteSchema = z.object({
  clinic_id: z.string().uuid(),
  alias_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      customer_id: request.nextUrl.searchParams.get('customer_id'),
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
        'マネージャーは患者名寄せエイリアスAPIへアクセスできません。',
    });
    if (!auth.success) return auth.error;
    const aliases = await listPatientIdentityAliases(createCrmAdminClient(), {
      clinicId: parsed.data.clinic_id,
      customerId: parsed.data.customer_id,
    });
    return createSuccessResponse({ aliases });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, aliasSchema, {
      path: PATH,
      deniedRoles: ['manager'],
      deniedRoleMessage:
        'マネージャーは患者名寄せエイリアスAPIへアクセスできません。',
    });
    if (!result.success) return result.error;
    const alias = await createPatientIdentityAlias(createCrmAdminClient(), {
      clinicId: result.dto.clinic_id,
      customerId: result.dto.customer_id,
      alias: result.dto.alias,
      aliasType: result.dto.alias_type,
      source: result.dto.source,
    });
    return createSuccessResponse({ alias }, 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, deleteSchema, {
      path: PATH,
      deniedRoles: ['manager'],
      deniedRoleMessage:
        'マネージャーは患者名寄せエイリアスAPIへアクセスできません。',
    });
    if (!result.success) return result.error;
    await deletePatientIdentityAlias(createCrmAdminClient(), {
      clinicId: result.dto.clinic_id,
      aliasId: result.dto.alias_id,
    });
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
