import { enqueueEmail } from '@/lib/notifications/email/enqueue-email';
import type { EnqueueEmailInput } from '@/lib/notifications/email/types';

describe('enqueueEmail', () => {
  const input: EnqueueEmailInput = {
    clinicId: 'clinic-001',
    reservationId: 'res-001',
    customerId: 'cust-001',
    templateType: 'reservation_created',
    toEmail: 'patient@example.com',
    payload: {
      customerName: '田中太郎',
      clinicName: 'テスト整骨院',
      startTime: '2026-04-15T10:00:00Z',
      endTime: '2026-04-15T11:00:00Z',
      staffName: '山田花子',
      menuName: '骨盤矯正',
    },
  };

  const updatedAt = '2026-04-15T09:00:00.000Z';

  it('inserts a record into email_outbox via supabase', async () => {
    const insertedData = { id: 'outbox-001' };
    const single = jest
      .fn()
      .mockResolvedValue({ data: insertedData, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const supabase = { from };

    const result = await enqueueEmail(supabase as any, input, updatedAt);

    expect(result).toEqual({ id: 'outbox-001' });
    expect(from).toHaveBeenCalledWith('email_outbox');
    expect(insert).toHaveBeenCalledTimes(1);

    const insertArg = insert.mock.calls[0][0];
    expect(insertArg.clinic_id).toBe('clinic-001');
    expect(insertArg.reservation_id).toBe('res-001');
    expect(insertArg.customer_id).toBe('cust-001');
    expect(insertArg.template_type).toBe('reservation_created');
    expect(insertArg.to_email).toBe('patient@example.com');
    expect(insertArg.status).toBe('pending');
    expect(insertArg.dedupe_key).toBe(
      'reservation_created:res-001:2026-04-15T09:00:00.000Z'
    );
    expect(insertArg.resend_idempotency_key).toMatch(/^idmp_/);
  });

  it('includes payload as jsonb', async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: 'outbox-002' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const supabase = { from };

    await enqueueEmail(supabase as any, input, updatedAt);

    const insertArg = insert.mock.calls[0][0];
    expect(insertArg.payload).toEqual(input.payload);
  });

  it('throws when supabase insert fails', async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'duplicate key', code: '23505' },
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const supabase = { from };

    await expect(
      enqueueEmail(supabase as any, input, updatedAt)
    ).rejects.toThrow('duplicate key');
  });

  it('handles dedupe conflict gracefully for duplicate key error', async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });
    const supabase = { from };

    // Dedupe conflict should not throw - it means the email was already queued
    const result = await enqueueEmail(supabase as any, input, updatedAt, {
      ignoreDuplicate: true,
    });

    expect(result).toBeNull();
  });
});
