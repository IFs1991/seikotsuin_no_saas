import {
  determineNotificationType,
  shouldNotify,
} from '@/lib/notifications/email/policy';
import type {
  ReservationSnapshot,
  ReservationChange,
  EmailTemplateType,
} from '@/lib/notifications/email/types';

const base: ReservationSnapshot = {
  id: 'res-001',
  clinic_id: 'clinic-001',
  customer_id: 'cust-001',
  status: 'confirmed',
  start_time: '2026-04-14T10:00:00Z',
  end_time: '2026-04-14T11:00:00Z',
  staff_id: 'staff-001',
  notes: null,
};

describe('email notification policy', () => {
  // -------------------------------------------------------
  // determineNotificationType
  // -------------------------------------------------------
  describe('determineNotificationType', () => {
    it('returns reservation_cancelled when status changes to cancelled', () => {
      const change: ReservationChange = {
        before: { ...base },
        after: { ...base, status: 'cancelled' },
      };
      expect(determineNotificationType(change)).toBe('reservation_cancelled');
    });

    it('returns reservation_updated when start_time changes', () => {
      const change: ReservationChange = {
        before: { ...base },
        after: { ...base, start_time: '2026-04-14T14:00:00Z' },
      };
      expect(determineNotificationType(change)).toBe('reservation_updated');
    });

    it('returns reservation_updated when end_time changes', () => {
      const change: ReservationChange = {
        before: { ...base },
        after: { ...base, end_time: '2026-04-14T12:00:00Z' },
      };
      expect(determineNotificationType(change)).toBe('reservation_updated');
    });

    it('returns reservation_updated when staff_id changes', () => {
      const change: ReservationChange = {
        before: { ...base },
        after: { ...base, staff_id: 'staff-002' },
      };
      expect(determineNotificationType(change)).toBe('reservation_updated');
    });

    it('returns reservation_updated when status changes to non-cancelled value', () => {
      const change: ReservationChange = {
        before: { ...base, status: 'tentative' },
        after: { ...base, status: 'confirmed' },
      };
      expect(determineNotificationType(change)).toBe('reservation_updated');
    });

    it('returns null when only notes change', () => {
      const change: ReservationChange = {
        before: { ...base },
        after: { ...base, notes: 'updated notes' },
      };
      expect(determineNotificationType(change)).toBeNull();
    });

    it('returns null when nothing changes', () => {
      const change: ReservationChange = {
        before: { ...base },
        after: { ...base },
      };
      expect(determineNotificationType(change)).toBeNull();
    });

    it('prioritises cancelled over other field changes', () => {
      const change: ReservationChange = {
        before: { ...base },
        after: {
          ...base,
          status: 'cancelled',
          start_time: '2026-04-14T14:00:00Z',
        },
      };
      expect(determineNotificationType(change)).toBe('reservation_cancelled');
    });
  });

  // -------------------------------------------------------
  // shouldNotify
  // -------------------------------------------------------
  describe('shouldNotify', () => {
    it('returns true for reservation_created', () => {
      expect(shouldNotify('reservation_created')).toBe(true);
    });

    it('returns true for reservation_updated', () => {
      expect(shouldNotify('reservation_updated')).toBe(true);
    });

    it('returns true for reservation_cancelled', () => {
      expect(shouldNotify('reservation_cancelled')).toBe(true);
    });

    it('returns true for reminder_day_before', () => {
      expect(shouldNotify('reminder_day_before')).toBe(true);
    });

    it('returns false for unknown type', () => {
      expect(shouldNotify('unknown_type' as EmailTemplateType)).toBe(false);
    });
  });
});
