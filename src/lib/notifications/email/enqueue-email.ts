import { generateDedupeKey, generateIdempotencyKey } from './dedupe';
import type { EnqueueEmailInput } from './types';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

export type EnqueueOptions = {
  ignoreDuplicate?: boolean;
};

type EmailSupabaseClient = Pick<SupabaseServerClient, 'from'>;
type EmailOutboxInsert = Database['public']['Tables']['email_outbox']['Insert'];

/**
 * email_outbox にメール送信ジョブを追加する。
 * dedupe_key の unique constraint で二重 enqueue を防止。
 */
export async function enqueueEmail(
  supabase: EmailSupabaseClient,
  input: EnqueueEmailInput,
  updatedAt: string,
  options: EnqueueOptions = {}
): Promise<{ id: string } | null> {
  const dedupeKey = generateDedupeKey(
    input.templateType,
    input.reservationId ?? input.clinicId,
    updatedAt
  );
  const idempotencyKey = generateIdempotencyKey(dedupeKey);
  const outboxInsert: EmailOutboxInsert = {
    clinic_id: input.clinicId,
    reservation_id: input.reservationId ?? null,
    customer_id: input.customerId ?? null,
    template_type: input.templateType,
    dedupe_key: dedupeKey,
    resend_idempotency_key: idempotencyKey,
    to_email: input.toEmail,
    payload: input.payload,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('email_outbox')
    .insert(outboxInsert)
    .select('id')
    .single();

  if (error) {
    // 23505 = unique_violation (dedupe conflict)
    if (options.ignoreDuplicate && error.code === '23505') {
      return null;
    }
    throw new Error(error.message);
  }

  return { id: data.id };
}
