import {
  verifyResendWebhook,
  handleResendWebhookEvent,
} from '@/lib/notifications/email/webhook-handler';

describe('Resend webhook handler', () => {
  // -------------------------------------------------------
  // verifyResendWebhook
  // -------------------------------------------------------
  describe('verifyResendWebhook', () => {
    it('returns false when svix headers are missing', () => {
      const headers = new Map<string, string>();
      const result = verifyResendWebhook('{}', headers, 'whsec_test');
      expect(result).toBe(false);
    });

    it('returns false when secret is empty', () => {
      const headers = new Map<string, string>([
        ['svix-id', 'msg_123'],
        ['svix-timestamp', '1234567890'],
        ['svix-signature', 'v1,signature'],
      ]);
      const result = verifyResendWebhook('{}', headers, '');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------
  // handleResendWebhookEvent
  // -------------------------------------------------------
  describe('handleResendWebhookEvent', () => {
    it('saves event to email_logs and resolves outbox context for email.delivered', async () => {
      const logInsert = jest.fn().mockResolvedValue({ error: null });

      // select chain for finding outbox by provider_message_id
      const maybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'outbox-1', clinic_id: 'clinic-1' },
        error: null,
      });
      const selectEq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq: selectEq });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_logs') return { insert: logInsert };
        if (table === 'email_outbox') return { select };
        return {};
      });

      const supabase = { from } as any;

      const event = {
        type: 'email.delivered',
        data: {
          email_id: 'msg-001',
          to: ['test@example.com'],
        },
      };

      await handleResendWebhookEvent(supabase, event);

      // email_logs に insert されている
      expect(logInsert).toHaveBeenCalledTimes(1);
      const logArg = logInsert.mock.calls[0][0];
      expect(logArg.event_type).toBe('email.delivered');
      expect(logArg.provider_message_id).toBe('msg-001');
      expect(logArg.outbox_id).toBe('outbox-1');
      expect(logArg.clinic_id).toBe('clinic-1');
    });

    it('skips unmatched events when the outbox record is not found', async () => {
      const logInsert = jest.fn().mockResolvedValue({ error: null });
      const maybeSingle = jest
        .fn()
        .mockResolvedValue({ data: null, error: null });
      const selectEq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq: selectEq });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_logs') return { insert: logInsert };
        if (table === 'email_outbox') return { select };
        return {};
      });

      const supabase = { from } as any;

      const event = {
        type: 'email.bounced',
        data: {
          email_id: 'msg-999',
          to: ['unknown@example.com'],
        },
      };

      await expect(
        handleResendWebhookEvent(supabase, event)
      ).resolves.toBeUndefined();
      expect(logInsert).not.toHaveBeenCalled();
    });

    it('throws when the outbox lookup returns a Supabase error', async () => {
      const maybeSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation "email_outbox" does not exist' },
      });
      const selectEq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq: selectEq });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_outbox') return { select };
        return {};
      });

      const supabase = { from } as any;

      const event = {
        type: 'email.bounced',
        data: {
          email_id: 'msg-999',
          to: ['unknown@example.com'],
        },
      };

      await expect(handleResendWebhookEvent(supabase, event)).rejects.toThrow(
        'Failed to resolve email outbox record'
      );
    });

    it('throws when email_logs insert fails', async () => {
      const logInsert = jest.fn().mockResolvedValue({
        data: null,
        error: {
          message: 'insert into email_logs violates not-null constraint',
        },
      });
      const maybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'outbox-1', clinic_id: 'clinic-1' },
        error: null,
      });
      const selectEq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq: selectEq });

      const from = jest.fn().mockImplementation((table: string) => {
        if (table === 'email_logs') return { insert: logInsert };
        if (table === 'email_outbox') return { select };
        return {};
      });

      const supabase = { from } as any;

      const event = {
        type: 'email.delivered',
        data: {
          email_id: 'msg-001',
          to: ['test@example.com'],
        },
      };

      await expect(handleResendWebhookEvent(supabase, event)).rejects.toThrow(
        'Failed to insert email log'
      );
    });
  });
});
