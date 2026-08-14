/** @jest-environment node */

import { createHmac } from 'node:crypto';

import {
  LineWebhookRequestError,
  parseSignedLineWebhook,
  verifyLineWebhookSignature,
} from '@/lib/line/webhook-service';

const SECRET = 'test-channel-secret';
const BOT_USER_ID = 'U-bot-runtime';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('base64');
}

describe('LINE webhook raw-body verification', () => {
  it('normalizes only the fields required by the durable transaction', () => {
    const body = JSON.stringify({
      destination: BOT_USER_ID,
      events: [
        {
          type: 'message',
          webhookEventId: 'evt-1',
          timestamp: 1_786_665_600_000,
          replyToken: 'must-not-be-retained',
          source: { type: 'user', userId: 'U-user-1' },
          message: { id: 'm-1', type: 'text', text: '予約の相談です' },
          deliveryContext: { isRedelivery: false },
        },
      ],
    });

    const events = parseSignedLineWebhook({
      body,
      botUserId: BOT_USER_ID,
      channelSecret: SECRET,
      signature: sign(body),
    });

    expect(events).toEqual([
      expect.objectContaining({
        eventType: 'message',
        lineMessageId: 'm-1',
        lineUserId: 'U-user-1',
        sourceType: 'user',
        textContent: '予約の相談です',
        webhookEventId: 'evt-1',
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('replyToken');
  });

  it('preserves the source type so group and room events fail closed in the durable transaction', () => {
    const body = JSON.stringify({
      destination: BOT_USER_ID,
      events: [
        {
          type: 'message',
          webhookEventId: 'evt-group',
          timestamp: 1_786_665_600_000,
          source: {
            type: 'group',
            groupId: 'C-group',
            userId: 'U-member',
          },
          message: { id: 'm-group', type: 'text', text: 'group body' },
        },
      ],
    });

    const events = parseSignedLineWebhook({
      body,
      botUserId: BOT_USER_ID,
      channelSecret: SECRET,
      signature: sign(body),
    });

    expect(events).toEqual([
      expect.objectContaining({
        lineUserId: 'U-member',
        sourceType: 'group',
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('C-group');
  });

  it('rejects a bad signature before attempting to parse malformed JSON', () => {
    expect(() =>
      parseSignedLineWebhook({
        body: '{not-json',
        botUserId: BOT_USER_ID,
        channelSecret: SECRET,
        signature: 'invalid',
      })
    ).toThrow(
      expect.objectContaining<Partial<LineWebhookRequestError>>({ status: 401 })
    );
  });

  it('rejects malformed JSON after a valid signature and another bot destination', () => {
    const invalidJson = '{not-json';
    expect(() =>
      parseSignedLineWebhook({
        body: invalidJson,
        botUserId: BOT_USER_ID,
        channelSecret: SECRET,
        signature: sign(invalidJson),
      })
    ).toThrow(
      expect.objectContaining<Partial<LineWebhookRequestError>>({ status: 400 })
    );

    const otherDestination = JSON.stringify({
      destination: 'U-other-bot',
      events: [],
    });
    expect(() =>
      parseSignedLineWebhook({
        body: otherDestination,
        botUserId: BOT_USER_ID,
        channelSecret: SECRET,
        signature: sign(otherDestination),
      })
    ).toThrow(
      expect.objectContaining<Partial<LineWebhookRequestError>>({ status: 403 })
    );
  });

  it('uses constant-length digest comparison and rejects missing signatures', () => {
    expect(verifyLineWebhookSignature('body', null, SECRET)).toBe(false);
    expect(verifyLineWebhookSignature('body', sign('body'), SECRET)).toBe(true);
    expect(verifyLineWebhookSignature('changed', sign('body'), SECRET)).toBe(
      false
    );
  });
});
