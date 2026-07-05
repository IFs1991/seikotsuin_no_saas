import type { EmailTemplateType } from '@/lib/notifications/email/types';
import type { ReservationNotificationType } from '@/lib/notifications/reservation-notifications';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';

export type LineMessageType = ReservationNotificationType | 'outreach';

export type LineEmailFallbackPayload = {
  clinicId: string;
  reservationId: string;
  customerId: string;
  toEmail: string;
  notificationType: ReservationNotificationType;
  templateType: EmailTemplateType;
  payload: Json;
  dedupeTimestamp: string;
};

export type LineMessagePayload = {
  text: string;
  confirmationUrl?: string;
  fallbackEmail?: LineEmailFallbackPayload;
};

export type EnqueueLineMessageInput = {
  clinicId: string;
  lineUserId: string;
  messageType: LineMessageType;
  payload: LineMessagePayload;
};

type LineOutboxClient = Pick<SupabaseServerClient, 'from'>;
type LineMessageOutboxInsert =
  Database['public']['Tables']['line_message_outbox']['Insert'];

export async function enqueueLineMessage(
  supabase: LineOutboxClient,
  input: EnqueueLineMessageInput
): Promise<{ id: string }> {
  const insert: LineMessageOutboxInsert = {
    clinic_id: input.clinicId,
    line_user_id: input.lineUserId,
    message_type: input.messageType,
    payload: input.payload,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('line_message_outbox')
    .insert(insert)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to enqueue LINE message');
  }

  return { id: data.id };
}
