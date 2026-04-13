import {
  generateDedupeKey,
  generateIdempotencyKey,
} from '@/lib/notifications/email/dedupe';
import type { EmailTemplateType } from '@/lib/notifications/email/types';

describe('email dedupe key generation', () => {
  const reservationId = 'res-001';
  const updatedAt = '2026-04-14T10:00:00.000Z';

  describe('generateDedupeKey', () => {
    it('generates key for reservation_created', () => {
      const key = generateDedupeKey(
        'reservation_created',
        reservationId,
        updatedAt
      );
      expect(key).toBe('reservation_created:res-001:2026-04-14T10:00:00.000Z');
    });

    it('generates key for reservation_updated', () => {
      const key = generateDedupeKey(
        'reservation_updated',
        reservationId,
        updatedAt
      );
      expect(key).toBe('reservation_updated:res-001:2026-04-14T10:00:00.000Z');
    });

    it('generates key for reservation_cancelled', () => {
      const key = generateDedupeKey(
        'reservation_cancelled',
        reservationId,
        updatedAt
      );
      expect(key).toBe(
        'reservation_cancelled:res-001:2026-04-14T10:00:00.000Z'
      );
    });

    it('produces stable output for same input', () => {
      const a = generateDedupeKey(
        'reservation_created',
        reservationId,
        updatedAt
      );
      const b = generateDedupeKey(
        'reservation_created',
        reservationId,
        updatedAt
      );
      expect(a).toBe(b);
    });

    it('produces different keys for different updatedAt', () => {
      const a = generateDedupeKey(
        'reservation_created',
        reservationId,
        '2026-04-14T10:00:00.000Z'
      );
      const b = generateDedupeKey(
        'reservation_created',
        reservationId,
        '2026-04-14T11:00:00.000Z'
      );
      expect(a).not.toBe(b);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('generates a UUID-prefixed key based on dedupe key', () => {
      const dedupeKey = 'reservation_created:res-001:2026-04-14T10:00:00.000Z';
      const key = generateIdempotencyKey(dedupeKey);
      expect(key).toMatch(/^idmp_/);
      expect(key.length).toBeGreaterThan(10);
    });

    it('produces stable output for same dedupe key', () => {
      const dedupeKey = 'reservation_created:res-001:2026-04-14T10:00:00.000Z';
      const a = generateIdempotencyKey(dedupeKey);
      const b = generateIdempotencyKey(dedupeKey);
      expect(a).toBe(b);
    });

    it('produces different keys for different dedupe keys', () => {
      const a = generateIdempotencyKey('reservation_created:res-001:t1');
      const b = generateIdempotencyKey('reservation_created:res-001:t2');
      expect(a).not.toBe(b);
    });
  });
});
