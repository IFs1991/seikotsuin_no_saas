import { createHash } from 'crypto';
import type { EmailTemplateType } from './types';

/**
 * Outbox dedupe key を生成する。
 * DB unique index で二重 enqueue を防止する。
 * 形式: {templateType}:{reservationId}:{updatedAtISO}
 */
export function generateDedupeKey(
  templateType: EmailTemplateType,
  reservationId: string,
  updatedAt: string
): string {
  return `${templateType}:${reservationId}:${updatedAt}`;
}

/**
 * Resend idempotency key を生成する。
 * dedupe key の SHA-256 ハッシュにプレフィックスを付与。
 * 同一 dedupe key からは常に同じ idempotency key が生成される。
 */
export function generateIdempotencyKey(dedupeKey: string): string {
  const hash = createHash('sha256').update(dedupeKey).digest('hex');
  return `idmp_${hash}`;
}
