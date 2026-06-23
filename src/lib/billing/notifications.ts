import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import type {
  BillingEmailPayload,
  BillingEmailTemplateType,
} from '@/lib/notifications/email/types';
import type { Database } from '@/types/supabase';

type EmailOutboxInsert = Database['public']['Tables']['email_outbox']['Insert'];

type BillingAdminRecipient = {
  id: string;
  email: string;
};

async function fetchBillingAdminRecipients(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
}): Promise<BillingAdminRecipient[]> {
  const { data, error } = await input.client
    .from('profiles')
    .select('id, email')
    .eq('clinic_id', input.orgRootClinicId)
    .eq('role', 'admin')
    .eq('is_active', true);

  if (error) {
    throw error;
  }

  return (data ?? []).filter(
    profile => typeof profile.email === 'string' && profile.email.length > 0
  );
}

export async function enqueueBillingLifecycleEmail(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
  templateType: BillingEmailTemplateType;
  dedupeScope: string;
  payload: BillingEmailPayload;
}) {
  const recipients = await fetchBillingAdminRecipients({
    client: input.client,
    orgRootClinicId: input.orgRootClinicId,
  });
  let enqueued = 0;

  for (const recipient of recipients) {
    const dedupeKey = [
      'billing',
      input.templateType,
      input.orgRootClinicId,
      recipient.id,
      input.dedupeScope,
    ].join(':');
    const insert: EmailOutboxInsert = {
      clinic_id: input.orgRootClinicId,
      reservation_id: null,
      customer_id: null,
      template_type: input.templateType,
      dedupe_key: dedupeKey,
      resend_idempotency_key: dedupeKey,
      to_email: recipient.email,
      payload: input.payload,
      status: 'pending',
    };

    const { error } = await input.client.from('email_outbox').insert(insert);
    if (error) {
      if (error.code === '23505') {
        continue;
      }
      throw error;
    }

    enqueued++;
  }

  return { enqueued };
}
