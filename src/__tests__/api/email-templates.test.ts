import { renderReservationCreatedEmail } from '@/lib/notifications/email/templates/reservation-created';
import { renderReservationUpdatedEmail } from '@/lib/notifications/email/templates/reservation-updated';
import { renderReservationCancelledEmail } from '@/lib/notifications/email/templates/reservation-cancelled';
import { renderReminderDayBeforeEmail } from '@/lib/notifications/email/templates/reminder-day-before';
import type { ReservationEmailPayload } from '@/lib/notifications/email/types';

const basePayload: ReservationEmailPayload = {
  customerName: '田中太郎',
  clinicName: 'テスト整骨院',
  startTime: '2026-04-15T10:00:00Z',
  endTime: '2026-04-15T11:00:00Z',
  staffName: '山田花子',
  menuName: '骨盤矯正',
};

describe('email templates', () => {
  // -------------------------------------------------------
  // reservation_created
  // -------------------------------------------------------
  describe('renderReservationCreatedEmail', () => {
    it('returns subject, html, and text', () => {
      const result = renderReservationCreatedEmail(basePayload);
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    it('subject contains clinic name', () => {
      const result = renderReservationCreatedEmail(basePayload);
      expect(result.subject).toContain('テスト整骨院');
    });

    it('html contains customer name', () => {
      const result = renderReservationCreatedEmail(basePayload);
      expect(result.html).toContain('田中太郎');
    });

    it('html contains appointment time', () => {
      const result = renderReservationCreatedEmail(basePayload);
      expect(result.html).toContain('2026');
    });

    it('html contains staff name', () => {
      const result = renderReservationCreatedEmail(basePayload);
      expect(result.html).toContain('山田花子');
    });

    it('html contains menu name', () => {
      const result = renderReservationCreatedEmail(basePayload);
      expect(result.html).toContain('骨盤矯正');
    });

    it('text contains customer name', () => {
      const result = renderReservationCreatedEmail(basePayload);
      expect(result.text).toContain('田中太郎');
    });
  });

  // -------------------------------------------------------
  // reservation_updated
  // -------------------------------------------------------
  describe('renderReservationUpdatedEmail', () => {
    const updatedPayload: ReservationEmailPayload = {
      ...basePayload,
      changes: [
        {
          field: '日時',
          before: '2026-04-15 10:00',
          after: '2026-04-16 14:00',
        },
      ],
    };

    it('returns subject, html, and text', () => {
      const result = renderReservationUpdatedEmail(updatedPayload);
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    it('subject indicates update', () => {
      const result = renderReservationUpdatedEmail(updatedPayload);
      expect(result.subject).toContain('変更');
    });

    it('html contains change details', () => {
      const result = renderReservationUpdatedEmail(updatedPayload);
      expect(result.html).toContain('2026-04-15 10:00');
      expect(result.html).toContain('2026-04-16 14:00');
    });
  });

  // -------------------------------------------------------
  // reservation_cancelled
  // -------------------------------------------------------
  describe('renderReservationCancelledEmail', () => {
    it('returns subject, html, and text', () => {
      const result = renderReservationCancelledEmail(basePayload);
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    it('subject indicates cancellation', () => {
      const result = renderReservationCancelledEmail(basePayload);
      expect(result.subject).toContain('キャンセル');
    });

    it('html contains customer name', () => {
      const result = renderReservationCancelledEmail(basePayload);
      expect(result.html).toContain('田中太郎');
    });
  });

  // -------------------------------------------------------
  // reminder_day_before
  // -------------------------------------------------------
  describe('renderReminderDayBeforeEmail', () => {
    it('returns subject, html, and text', () => {
      const result = renderReminderDayBeforeEmail(basePayload);
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    it('subject indicates reminder', () => {
      const result = renderReminderDayBeforeEmail(basePayload);
      expect(result.subject).toContain('リマインド');
    });

    it('html contains appointment details', () => {
      const result = renderReminderDayBeforeEmail(basePayload);
      expect(result.html).toContain('テスト整骨院');
      expect(result.html).toContain('山田花子');
    });
  });
});
