import { AppError } from '@/lib/error-handler';
import { assertShiftRequestPatchStatusTransition } from '@/lib/staff/shift-requests/state';

function captureAppError(action: () => void): AppError | null {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof AppError ? error : null;
  }
}

describe('shift request state transitions', () => {
  it('manager cannot reject an already approved request via PATCH', () => {
    const error = captureAppError(() =>
      assertShiftRequestPatchStatusTransition({
        currentStatus: 'approved',
        nextStatus: 'rejected',
        actorRole: 'manager',
        isSelfActor: false,
      })
    );

    expect(error?.statusCode).toBe(403);
  });

  it('clinic_admin can resubmit a rejected proxy request', () => {
    expect(() =>
      assertShiftRequestPatchStatusTransition({
        currentStatus: 'rejected',
        nextStatus: 'submitted',
        actorRole: 'clinic_admin',
        isSelfActor: false,
      })
    ).not.toThrow();
  });

  it('self actor can withdraw only a submitted request', () => {
    expect(() =>
      assertShiftRequestPatchStatusTransition({
        currentStatus: 'submitted',
        nextStatus: 'withdrawn',
        actorRole: 'staff',
        isSelfActor: true,
      })
    ).not.toThrow();

    const error = captureAppError(() =>
      assertShiftRequestPatchStatusTransition({
        currentStatus: 'approved',
        nextStatus: 'withdrawn',
        actorRole: 'staff',
        isSelfActor: true,
      })
    );

    expect(error?.statusCode).toBe(403);
  });
});
