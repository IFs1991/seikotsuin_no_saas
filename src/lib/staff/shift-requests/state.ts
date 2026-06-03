import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { isShiftRequestManagerRole, normalizeShiftRequestRole } from './access';
import type { ShiftRequestStatus } from './types';

interface ShiftRequestPatchTransitionInput {
  currentStatus: ShiftRequestStatus | string;
  nextStatus?: ShiftRequestStatus;
  actorRole: string;
  isSelfActor: boolean;
}

function isSubmittedTransition(nextStatus: ShiftRequestStatus | undefined) {
  return nextStatus === undefined || nextStatus === 'submitted';
}

export function assertShiftRequestPatchStatusTransition({
  currentStatus,
  nextStatus,
  actorRole,
  isSelfActor,
}: ShiftRequestPatchTransitionInput) {
  if (!nextStatus || nextStatus === currentStatus) {
    return;
  }

  if (currentStatus === 'converted') {
    throw new AppError(
      ERROR_CODES.RESOURCE_CONFLICT,
      '変換済みの希望シフトは編集できません',
      409
    );
  }

  if (isSelfActor) {
    if (
      (currentStatus === 'draft' && nextStatus === 'submitted') ||
      (currentStatus === 'submitted' && nextStatus === 'withdrawn') ||
      (currentStatus === 'rejected' && nextStatus === 'submitted')
    ) {
      return;
    }

    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '本人が指定できない状態です',
      403
    );
  }

  const normalizedRole = normalizeShiftRequestRole(actorRole);

  if (
    currentStatus === 'draft' &&
    isSubmittedTransition(nextStatus) &&
    isShiftRequestManagerRole(normalizedRole)
  ) {
    return;
  }

  if (
    currentStatus === 'submitted' &&
    (nextStatus === 'approved' || nextStatus === 'rejected')
  ) {
    return;
  }

  if (
    currentStatus === 'rejected' &&
    nextStatus === 'submitted' &&
    normalizedRole === 'clinic_admin'
  ) {
    return;
  }

  throw new AppError(
    ERROR_CODES.FORBIDDEN,
    '希望シフトの状態遷移が許可されていません',
    403
  );
}
