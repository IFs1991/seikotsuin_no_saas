import {
  enqueueReservationCreated,
  enqueueReservationChange,
} from '@/lib/notifications/email/reservation-enqueue';
import type { ReservationSnapshot } from '@/lib/notifications/email/types';

// Supabase mock helpers
function createInsertMock(resolvedData: any = { id: 'outbox-1' }) {
  const single = jest
    .fn()
    .mockResolvedValue({ data: resolvedData, error: null });
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  return { insert, select, single };
}

function createSelectMock(data: any) {
  const single = jest.fn().mockResolvedValue({ data, error: null });
  const maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  const selectEq2 = jest.fn().mockReturnValue({ single, maybeSingle });
  const selectEq1 = jest
    .fn()
    .mockReturnValue({ eq: selectEq2, single, maybeSingle });
  const selectFn = jest
    .fn()
    .mockReturnValue({ eq: selectEq1, single, maybeSingle });
  return {
    select: selectFn,
    eq1: selectEq1,
    eq2: selectEq2,
    single,
    maybeSingle,
  };
}

describe('reservation email enqueue helpers', () => {
  // -------------------------------------------------------
  // enqueueReservationCreated
  // -------------------------------------------------------
  describe('enqueueReservationCreated', () => {
    it('enqueues reservation_created with customer email', async () => {
      const outboxInsert = createInsertMock();
      const customerSelect = createSelectMock({
        id: 'cust-001',
        email: 'patient@example.com',
        name: '田中太郎',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'staff') return { select: staffSelect.select };
        return {};
      });

      const supabase = { from } as any;

      const reservation = {
        id: 'res-001',
        clinic_id: 'clinic-001',
        customer_id: 'cust-001',
        status: 'unconfirmed',
        start_time: '2026-04-15T10:00:00Z',
        end_time: '2026-04-15T11:00:00Z',
        staff_id: 'staff-001',
        updated_at: '2026-04-14T09:00:00.000Z',
      };

      await enqueueReservationCreated(supabase, reservation);

      expect(outboxInsert.insert).toHaveBeenCalledTimes(1);
      const insertArg = outboxInsert.insert.mock.calls[0][0];
      expect(insertArg.clinic_id).toBe('clinic-001');
      expect(insertArg.template_type).toBe('reservation_created');
      expect(insertArg.to_email).toBe('patient@example.com');
      expect(insertArg.status).toBe('pending');
    });

    it('skips enqueue when customer has no email', async () => {
      const outboxInsert = createInsertMock();
      const customerSelect = createSelectMock({
        id: 'cust-002',
        email: null,
        name: '鈴木花子',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'staff') return { select: staffSelect.select };
        return {};
      });

      const supabase = { from } as any;

      const reservation = {
        id: 'res-002',
        clinic_id: 'clinic-001',
        customer_id: 'cust-002',
        status: 'unconfirmed',
        start_time: '2026-04-15T10:00:00Z',
        end_time: '2026-04-15T11:00:00Z',
        staff_id: 'staff-001',
        updated_at: '2026-04-14T09:00:00.000Z',
      };

      await enqueueReservationCreated(supabase, reservation);

      // Should NOT insert to outbox
      expect(outboxInsert.insert).not.toHaveBeenCalled();
    });

    it('writes a durable email_log when customer lookup fails', async () => {
      const outboxInsert = createInsertMock();
      const logInsert = jest.fn().mockResolvedValue({ error: null });
      const customerSelect = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'customers query failed' },
              }),
            }),
          }),
        }),
      };

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'email_logs') return { insert: logInsert };
        if (table === 'customers') return customerSelect;
        if (table === 'clinics' || table === 'staff' || table === 'menus') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest
                    .fn()
                    .mockResolvedValue({ data: null, error: null }),
                }),
                maybeSingle: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const supabase = { from } as any;

      await enqueueReservationCreated(supabase, {
        id: 'res-003',
        clinic_id: 'clinic-001',
        customer_id: 'cust-003',
        menu_id: 'menu-001',
        status: 'unconfirmed',
        start_time: '2026-04-15T10:00:00Z',
        end_time: '2026-04-15T11:00:00Z',
        staff_id: 'staff-001',
        updated_at: '2026-04-14T09:00:00.000Z',
      });

      expect(outboxInsert.insert).not.toHaveBeenCalled();
      expect(logInsert).toHaveBeenCalledTimes(1);
      expect(logInsert.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          clinic_id: 'clinic-001',
          event_type: 'enqueue_lookup_failed',
          provider: 'resend',
          detail: expect.objectContaining({
            stage: 'customer',
            template_type: 'reservation_created',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------
  // enqueueReservationChange
  // -------------------------------------------------------
  describe('enqueueReservationChange', () => {
    const before: ReservationSnapshot = {
      id: 'res-001',
      clinic_id: 'clinic-001',
      customer_id: 'cust-001',
      status: 'confirmed',
      start_time: '2026-04-15T10:00:00Z',
      end_time: '2026-04-15T11:00:00Z',
      staff_id: 'staff-001',
    };

    it('enqueues reservation_cancelled when status changes to cancelled', async () => {
      const outboxInsert = createInsertMock();
      const customerSelect = createSelectMock({
        id: 'cust-001',
        email: 'patient@example.com',
        name: '田中太郎',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'staff') return { select: staffSelect.select };
        return {};
      });

      const supabase = { from } as any;
      const after: ReservationSnapshot = { ...before, status: 'cancelled' };

      await enqueueReservationChange(
        supabase,
        before,
        after,
        '2026-04-14T10:00:00.000Z'
      );

      expect(outboxInsert.insert).toHaveBeenCalledTimes(1);
      const insertArg = outboxInsert.insert.mock.calls[0][0];
      expect(insertArg.template_type).toBe('reservation_cancelled');
    });

    it('enqueues reservation_updated when start_time changes', async () => {
      const outboxInsert = createInsertMock();
      const customerSelect = createSelectMock({
        id: 'cust-001',
        email: 'patient@example.com',
        name: '田中太郎',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'staff') return { select: staffSelect.select };
        return {};
      });

      const supabase = { from } as any;
      const after: ReservationSnapshot = {
        ...before,
        start_time: '2026-04-16T14:00:00Z',
      };

      await enqueueReservationChange(
        supabase,
        before,
        after,
        '2026-04-14T10:00:00.000Z'
      );

      expect(outboxInsert.insert).toHaveBeenCalledTimes(1);
      const insertArg = outboxInsert.insert.mock.calls[0][0];
      expect(insertArg.template_type).toBe('reservation_updated');
    });

    it('does not enqueue when only notes change', async () => {
      const outboxInsert = createInsertMock();

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        return {};
      });

      const supabase = { from } as any;
      const after: ReservationSnapshot = { ...before, notes: 'updated' };

      await enqueueReservationChange(
        supabase,
        before,
        after,
        '2026-04-14T10:00:00.000Z'
      );

      expect(outboxInsert.insert).not.toHaveBeenCalled();
    });

    it('writes a durable email_log when reservation context lookup fails', async () => {
      const outboxInsert = createInsertMock();
      const logInsert = jest.fn().mockResolvedValue({ error: null });
      const customerSelect = createSelectMock({
        id: 'cust-001',
        email: 'patient@example.com',
        name: '田中太郎',
      });
      const clinicSelect = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'clinics query failed' },
            }),
          }),
        }),
      };

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'email_logs') return { insert: logInsert };
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return clinicSelect;
        if (table === 'staff' || table === 'menus') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest
                    .fn()
                    .mockResolvedValue({ data: null, error: null }),
                }),
                maybeSingle: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const supabase = { from } as any;
      const after: ReservationSnapshot = {
        ...before,
        menu_id: 'menu-001',
        status: 'cancelled',
      };

      await enqueueReservationChange(
        supabase,
        before,
        after,
        '2026-04-14T10:00:00.000Z'
      );

      expect(outboxInsert.insert).not.toHaveBeenCalled();
      expect(logInsert).toHaveBeenCalledTimes(1);
      expect(logInsert.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          clinic_id: 'clinic-001',
          event_type: 'enqueue_lookup_failed',
          detail: expect.objectContaining({
            stage: 'context',
            template_type: 'reservation_cancelled',
          }),
        })
      );
    });
  });
});
