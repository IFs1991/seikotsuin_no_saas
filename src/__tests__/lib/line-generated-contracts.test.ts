/** @jest-environment node */

import {
  parseConversationStatus,
  parseMessageDirection,
  parseMessageStatus,
  parseMessageType,
} from '@/lib/line/chat-admin-service';
import {
  parseLineAppType,
  parseLineSetupStatus,
} from '@/lib/line/setup-admin-service';

describe('generated LINE database enum boundaries', () => {
  test.each([
    ['conversation status', () => parseConversationStatus('unexpected')],
    ['message direction', () => parseMessageDirection('unexpected')],
    ['message type', () => parseMessageType('unexpected')],
    ['message status', () => parseMessageStatus('unexpected')],
    ['app type', () => parseLineAppType('unexpected')],
    ['setup status', () => parseLineSetupStatus('unexpected')],
  ])('rejects an unknown %s', (_label, parse) => {
    expect(parse).toThrow('Unexpected LINE');
  });

  test('accepts every supported value', () => {
    expect(parseConversationStatus('open')).toBe('open');
    expect(parseConversationStatus('closed')).toBe('closed');
    expect(parseMessageDirection('inbound')).toBe('inbound');
    expect(parseMessageDirection('outbound')).toBe('outbound');
    expect(parseMessageDirection('system')).toBe('system');
    expect(parseMessageType('text')).toBe('text');
    expect(parseMessageType('unsupported')).toBe('unsupported');
    expect(parseMessageStatus('received')).toBe('received');
    expect(parseMessageStatus('queued')).toBe('queued');
    expect(parseMessageStatus('sent')).toBe('sent');
    expect(parseMessageStatus('failed')).toBe('failed');
    expect(parseMessageStatus('unsent')).toBe('unsent');
    expect(parseLineAppType('mini_app')).toBe('mini_app');
    expect(parseLineAppType('liff')).toBe('liff');
    expect(parseLineSetupStatus('prepared')).toBe('prepared');
    expect(parseLineSetupStatus('verified')).toBe('verified');
    expect(parseLineSetupStatus('consumed')).toBe('consumed');
    expect(parseLineSetupStatus('expired')).toBe('expired');
    expect(parseLineSetupStatus('revoked')).toBe('revoked');
  });
});
