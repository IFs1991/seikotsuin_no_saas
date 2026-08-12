import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createCrmAdminClient } from '@/lib/crm-line/db';
import {
  createAndNotifyStaffAvailabilityEvent,
  StaffAvailabilityStaffNotFoundError,
  StaffAvailabilityTimeRangeError,
} from '@/lib/services/staff-availability-service';

const PATH = '/api/staff/availability-events';
const availabilityEventSchema = z.object({
  clinic_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  available_datetime: z.string().datetime({ offset: true }),
  reward_type: z
    .enum(['priority_booking', 'points', 'self_care', 'option'])
    .default('priority_booking'),
});

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(
      request,
      availabilityEventSchema,
      {
        path: PATH,
        allowedRoles: ['admin', 'clinic_admin', 'manager'],
      }
    );
    if (!result.success) return result.error;

    const response = await createAndNotifyStaffAvailabilityEvent(
      createCrmAdminClient(),
      {
        clinicId: result.dto.clinic_id,
        staffId: result.dto.staff_id,
        availableDatetime: result.dto.available_datetime,
        rewardType: result.dto.reward_type,
        createdBy: result.auth.id,
      }
    );
    return createSuccessResponse(
      {
        event: response.event,
        recipient_count: response.recipientCount,
      },
      201
    );
  } catch (error) {
    if (error instanceof StaffAvailabilityStaffNotFoundError) {
      return createErrorResponse(error.message, 404);
    }
    if (error instanceof StaffAvailabilityTimeRangeError) {
      return createErrorResponse(error.message, 400);
    }
    return handleRouteError(error, PATH);
  }
}
