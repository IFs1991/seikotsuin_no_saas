import type { SendEmailInput } from '@/lib/notifications/email/types';

const mockSend = jest.fn();

jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: mockSend,
      },
    })),
  };
});

import { ResendEmailProvider } from '@/lib/notifications/email/resend-provider';

describe('ResendEmailProvider', () => {
  let provider: ResendEmailProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new ResendEmailProvider('test-api-key');
  });

  const input: SendEmailInput = {
    to: 'patient@example.com',
    subject: 'テスト件名',
    html: '<p>テスト</p>',
    text: 'テスト',
  };

  it('sends email and returns messageId', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });

    const result = await provider.send(input);

    expect(result).toEqual({
      provider: 'resend',
      messageId: 'msg-123',
    });
  });

  it('passes idempotencyKey in headers when provided', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-456' }, error: null });

    await provider.send({
      ...input,
      idempotencyKey: 'idmp_abc123',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.headers).toEqual(
      expect.objectContaining({
        'Idempotency-Key': 'idmp_abc123',
      })
    );
  });

  it('uses default from when not specified', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-789' }, error: null });

    await provider.send(input);

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.from).toBeDefined();
    expect(typeof callArg.from).toBe('string');
  });

  it('uses custom from when specified', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-000' }, error: null });

    await provider.send({
      ...input,
      from: 'custom@example.com',
    });

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.from).toBe('custom@example.com');
  });

  it('throws on Resend API error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });

    await expect(provider.send(input)).rejects.toThrow('Invalid API key');
  });

  it('passes tags when provided', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-tags' }, error: null });

    await provider.send({
      ...input,
      tags: [{ name: 'template', value: 'reservation_created' }],
    });

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.tags).toEqual([
      { name: 'template', value: 'reservation_created' },
    ]);
  });
});
