/** @jest-environment node */

import { sendLineChatPush } from '@/lib/line/chat-outbox-processor';

const JOB = {
  claim_token: 'a8140000-0000-4000-8000-000000000001',
  line_user_id: 'U-chat-test',
  outbox_id: 'a8140000-0000-4000-8000-000000000002',
  text_content: '返信テスト',
};

describe('LINE chat push delivery', () => {
  it('uses the durable outbox ID as the retry key and requires the sent message ID', async () => {
    let capturedInit: RequestInit | null = null;
    const result = await sendLineChatPush({
      accessToken: 'redacted-token',
      fetcher: async (_input, init) => {
        capturedInit = init;
        return new Response(
          JSON.stringify({ sentMessages: [{ id: 'line-message-id' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
      job: JOB,
    });

    expect(result).toEqual({ ok: true, lineMessageId: 'line-message-id' });
    expect(new Headers(capturedInit?.headers).get('x-line-retry-key')).toBe(
      JOB.outbox_id
    );
  });

  it('recovers only LINE-confirmed accepted retries', async () => {
    const accepted = await sendLineChatPush({
      accessToken: 'redacted-token',
      fetcher: async () =>
        new Response(null, {
          status: 409,
          headers: { 'x-line-accepted-request-id': 'accepted-request' },
        }),
      job: JOB,
    });
    const unconfirmed = await sendLineChatPush({
      accessToken: 'redacted-token',
      fetcher: async () => new Response(null, { status: 409 }),
      job: JOB,
    });

    expect(accepted).toEqual({
      ok: true,
      lineMessageId: 'accepted:accepted-request',
    });
    expect(unconfirmed).toEqual({
      ok: false,
      errorCode: 'http_409_without_accepted_request',
    });
  });

  it('fails closed when a success response omits the LINE message ID', async () => {
    const result = await sendLineChatPush({
      accessToken: 'redacted-token',
      fetcher: async () =>
        new Response(JSON.stringify({ sentMessages: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      job: JOB,
    });

    expect(result).toEqual({
      ok: false,
      errorCode: 'response_message_id_missing',
    });
  });
});
