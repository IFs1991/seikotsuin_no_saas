import {
  enqueueReservationCreated,
  enqueueReservationChange,
} from '@/lib/notifications/email/reservation-enqueue';
import type { ReservationSnapshot } from '@/lib/notifications/email/types';

// Supabase mock helpers
function createInsertMock(resolvedData: unknown = { id: 'outbox-1' }) {
  const single = jest
    .fn()
    .mockResolvedValue({ data: resolvedData, error: null });
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  return { insert, select, single };
}

function createSelectMock(data: unknown) {
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

function createNotificationMock() {
  const maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: { id: 'notification-1' }, error: null });
  const select = jest.fn().mockReturnValue({ maybeSingle });
  const upsert = jest.fn().mockReturnValue({ select });
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq });
  const confirmation = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: { status: 'enqueued' }, error: null }),
  };
  const read = jest.fn().mockReturnValue(confirmation);
  return { upsert, select, maybeSingle, update, eq, read };
}

describe('reservation email enqueue helpers', () => {
  // -------------------------------------------------------
  // enqueueReservationCreated
  // -------------------------------------------------------
  describe('enqueueReservationCreated', () => {
    it('enqueues reservation_created with customer email', async () => {
      const outboxInsert = createInsertMock();
      const notification = createNotificationMock();
      const customerSelect = createSelectMock({
        id: 'cust-001',
        email: 'patient@example.com',
        line_user_id: null,
        name: '田中太郎',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'reservation_notifications') {
          return {
            upsert: notification.upsert,
            select: notification.read,
            update: notification.update,
          };
        }
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'resources') return { select: staffSelect.select };
        return {};
      });

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };

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

      expect(outboxInsert.insert).not.toHaveBeenCalled();
      const insertArg = notification.upsert.mock.calls[0][0].detail.enqueue;
      expect(notification.upsert.mock.calls[0][0].clinic_id).toBe('clinic-001');
      expect(staffSelect.eq2).toHaveBeenCalledWith('clinic_id', 'clinic-001');
      expect(insertArg.template_type).toBe('reservation_created');
      expect(insertArg.to_email).toBe('patient@example.com');
      expect(notification.upsert.mock.calls[0][0].status).toBe('claimed');
    });

    it('skips enqueue when customer has no email', async () => {
      const outboxInsert = createInsertMock();
      const notification = createNotificationMock();
      const customerSelect = createSelectMock({
        id: 'cust-002',
        email: null,
        line_user_id: null,
        name: '鈴木花子',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'reservation_notifications') {
          return {
            upsert: notification.upsert,
            select: notification.read,
            update: notification.update,
          };
        }
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'resources') return { select: staffSelect.select };
        return {};
      });

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };

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

    it('enqueues reservation_created to LINE when customer and clinic gates allow push', async () => {
      const outboxInsert = createInsertMock();
      const lineInsert = createInsertMock({ id: 'line-outbox-1' });
      const notification = createNotificationMock();
      const customerQuery = {
        eq: jest.fn(() => customerQuery),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: 'cust-005',
            email: null,
            line_user_id: 'U1234567890',
            line_credential_generation_id:
              '11111111-1111-4111-8111-111111111111',
            name: '佐藤一郎',
          },
          error: null,
        }),
      };
      const customerSelect = {
        select: jest.fn(() => customerQuery),
      };
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });
      const communicationSelect = createSelectMock({
        settings: { channels: { lineEnabled: true } },
      });
      const featureFlagSelect = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { line_notification_enabled: true },
              error: null,
            }),
          }),
        }),
      };
      const credentialQuery = {
        eq: jest.fn(() => credentialQuery),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            is_active: true,
            credential_generation_id: '11111111-1111-4111-8111-111111111111',
            provider_identity_verified_at: '2026-08-14T00:00:00.000Z',
          },
          error: null,
        }),
      };
      const credentialSelect = {
        select: jest.fn(() => credentialQuery),
      };
      const originalKillSwitch = process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING;
      const originalLineKey = process.env.LINE_CREDENTIALS_ENCRYPTION_KEY;
      process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING = 'true';
      process.env.LINE_CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'line_message_outbox') {
          return { insert: lineInsert.insert };
        }
        if (table === 'reservation_notifications') {
          return {
            upsert: notification.upsert,
            select: notification.read,
            update: notification.update,
          };
        }
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'resources') return { select: staffSelect.select };
        if (table === 'clinic_settings') {
          return { select: communicationSelect.select };
        }
        if (table === 'clinic_feature_flags') {
          return { select: featureFlagSelect.select };
        }
        if (table === 'clinic_line_credentials') {
          return { select: credentialSelect.select };
        }
        return {};
      });

      const supabase: Parameters<typeof enqueueReservationCreated>[0] = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };

      try {
        await enqueueReservationCreated(supabase, {
          id: 'res-005',
          clinic_id: 'clinic-001',
          customer_id: 'cust-005',
          status: 'unconfirmed',
          start_time: '2026-04-15T10:00:00Z',
          end_time: '2026-04-15T11:00:00Z',
          staff_id: 'staff-001',
          updated_at: '2026-04-14T09:00:00.000Z',
        });
      } finally {
        process.env.NEXT_PUBLIC_ENABLE_LIFF_BOOKING = originalKillSwitch;
        process.env.LINE_CREDENTIALS_ENCRYPTION_KEY = originalLineKey;
      }

      expect(notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          clinic_id: 'clinic-001',
          channel: 'line',
          notification_type: 'received',
          detail: expect.objectContaining({
            enqueue: expect.objectContaining({ line_user_id: 'U1234567890' }),
          }),
        }),
        expect.anything()
      );
      expect(lineInsert.insert).not.toHaveBeenCalled();
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
        if (table === 'clinics' || table === 'resources' || table === 'menus') {
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

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };

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

    it('writes a durable email_log when customer row is missing', async () => {
      const outboxInsert = createInsertMock();
      const logInsert = jest.fn().mockResolvedValue({ error: null });
      const customerSelect = createSelectMock(null);
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'email_logs') return { insert: logInsert };
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'resources') return { select: staffSelect.select };
        return {};
      });

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };

      await enqueueReservationCreated(supabase, {
        id: 'res-004',
        clinic_id: 'clinic-001',
        customer_id: 'cust-missing',
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
          event_type: 'enqueue_lookup_failed',
          detail: expect.objectContaining({
            stage: 'customer',
            error: expect.stringContaining(
              'customers lookup returned no row for customer_id=cust-missing'
            ),
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
      const notification = createNotificationMock();
      const customerSelect = createSelectMock({
        id: 'cust-001',
        email: 'patient@example.com',
        name: '田中太郎',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'reservation_notifications') {
          return {
            upsert: notification.upsert,
            select: notification.read,
            update: notification.update,
          };
        }
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'resources') return { select: staffSelect.select };
        return {};
      });

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };
      const after: ReservationSnapshot = { ...before, status: 'cancelled' };

      await enqueueReservationChange(
        supabase,
        before,
        after,
        '2026-04-14T10:00:00.000Z'
      );

      expect(outboxInsert.insert).not.toHaveBeenCalled();
      const insertArg = notification.upsert.mock.calls[0][0].detail.enqueue;
      expect(insertArg.template_type).toBe('reservation_cancelled');
      expect(notification.upsert).toHaveBeenCalledTimes(1);
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
        if (table === 'resources') return { select: staffSelect.select };
        return {};
      });

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };
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
      const secondAfter = { ...after, start_time: '2026-04-16T15:00:00Z' };
      await enqueueReservationChange(
        supabase,
        after,
        secondAfter,
        '2026-04-14T11:00:00.000Z'
      );
      expect(outboxInsert.insert).toHaveBeenCalledTimes(2);
      const secondInsert = outboxInsert.insert.mock.calls[1][0];
      expect(secondInsert.dedupe_key).not.toBe(insertArg.dedupe_key);
      expect(secondInsert.resend_idempotency_key).not.toBe(
        insertArg.resend_idempotency_key
      );
      expect(secondInsert.payload.startTime).toBe(secondAfter.start_time);
    });

    it('does not enqueue when only notes change', async () => {
      const outboxInsert = createInsertMock();

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        return {};
      });

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };
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
        if (table === 'resources' || table === 'menus') {
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

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };
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

    it('writes a durable email_log when menu row is missing for the reservation context', async () => {
      const outboxInsert = createInsertMock();
      const logInsert = jest.fn().mockResolvedValue({ error: null });
      const customerSelect = createSelectMock({
        id: 'cust-001',
        email: 'patient@example.com',
        name: '田中太郎',
      });
      const clinicSelect = createSelectMock({ name: 'テスト整骨院' });
      const staffSelect = createSelectMock({ name: '山田先生' });
      const menuSelect = createSelectMock(null);

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { insert: outboxInsert.insert };
        if (table === 'email_logs') return { insert: logInsert };
        if (table === 'customers') return { select: customerSelect.select };
        if (table === 'clinics') return { select: clinicSelect.select };
        if (table === 'resources') return { select: staffSelect.select };
        if (table === 'menus') return { select: menuSelect.select };
        return {};
      });

      const supabase = {
        from: from as Parameters<typeof enqueueReservationCreated>[0]['from'],
      };
      const after: ReservationSnapshot = {
        ...before,
        menu_id: 'menu-missing',
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
          event_type: 'enqueue_lookup_failed',
          detail: expect.objectContaining({
            stage: 'context',
            error: expect.stringContaining(
              'menus lookup returned no row for menu_id=menu-missing'
            ),
          }),
        })
      );
    });
  });
});
