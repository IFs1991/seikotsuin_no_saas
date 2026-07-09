import { z } from 'zod';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';
import { env } from '@/lib/env';
import {
  addJSTCalendarDays,
  differenceInJSTCalendarDays,
  toJSTDateString,
} from '@/lib/jst';
import type { LineMessagePayload } from '@/lib/notifications/line-outbox';

export const OUTREACH_ALLOWED_ROLES = [
  'admin',
  'clinic_admin',
  'manager',
] as const;
export const OUTREACH_SEND_ALLOWED_ROLES = ['admin', 'clinic_admin'] as const;

export const MAX_OUTREACH_RECIPIENTS = 300;
export const OUTREACH_FREQUENCY_LIMIT_DAYS = 30;

const OUTREACH_CAMPAIGN_LIST_LIMIT = 50;
const VISITED_RESERVATION_STATUSES = new Set(['arrived', 'completed']);

const unsupportedVariablePattern = /\{\{\s*([^}]+?)\s*\}\}/g;

export const dormantCandidatesQuerySchema = z
  .object({
    clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
    days_from: z.coerce
      .number()
      .int('days_from は整数で指定してください')
      .min(1, 'days_from は1以上で指定してください')
      .max(3650, 'days_from は3650以下で指定してください'),
    days_to: z.coerce
      .number()
      .int('days_to は整数で指定してください')
      .min(1, 'days_to は1以上で指定してください')
      .max(3650, 'days_to は3650以下で指定してください'),
  })
  .superRefine((value, ctx) => {
    if (value.days_to < value.days_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['days_to'],
        message: 'days_to は days_from 以上で指定してください',
      });
    }
  });

export const outreachDraftSchema = z
  .object({
    clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
    name: z.string().trim().min(1).max(120),
    days_from: z.number().int().min(1).max(3650),
    days_to: z.number().int().min(1).max(3650),
    message_body: z.string().trim().min(1).max(2000),
    customer_ids: z
      .array(z.string().uuid())
      .min(1, '対象患者を1名以上選択してください')
      .max(
        MAX_OUTREACH_RECIPIENTS,
        `対象患者は最大${MAX_OUTREACH_RECIPIENTS}名までです`
      ),
  })
  .superRefine((value, ctx) => {
    if (value.days_to < value.days_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['days_to'],
        message: 'days_to は days_from 以上で指定してください',
      });
    }

    const variables = [
      ...value.message_body.matchAll(unsupportedVariablePattern),
    ];
    for (const match of variables) {
      const variableName = match[1]?.trim();
      if (variableName !== 'name') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['message_body'],
          message: '{{name}} 以外の置換変数は使用できません',
        });
        break;
      }
    }
  });

export const outreachCampaignsQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
});

export const outreachCampaignSendSchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
});

export type DormantCandidatesQuery = z.infer<
  typeof dormantCandidatesQuerySchema
>;
export type OutreachDraftInput = z.infer<typeof outreachDraftSchema>;
export type OutreachCampaignsQuery = z.infer<
  typeof outreachCampaignsQuerySchema
>;
export type OutreachCampaignSendInput = z.infer<
  typeof outreachCampaignSendSchema
>;

export type DormantCandidate = {
  customer_id: string;
  name: string;
  last_visit_date: string;
  days_since_last_visit: number;
  total_visits: number | null;
  lifetime_value: number | null;
  line_display_name: string | null;
  line_delivery_warning: boolean;
};

export type DormantCandidatesResponse = {
  clinic_id: string;
  days_from: number;
  days_to: number;
  date_from: string;
  date_to: string;
  max_recipients: number;
  candidates: DormantCandidate[];
};

export type OutreachDraftResponse = {
  campaign_id: string;
  status: 'draft';
  selected_count: number;
  created_at: string;
};

export type OutreachCampaignSummary = {
  campaign_id: string;
  name: string;
  status: string;
  message_body: string;
  created_at: string;
  sent_at: string | null;
  selected_count: number;
  sent_count: number;
  delivered_count: number;
  booked_count: number;
  visited_count: number;
};

export type OutreachCampaignsResponse = {
  clinic_id: string;
  campaigns: OutreachCampaignSummary[];
};

export type OutreachSendResponse = {
  campaign_id: string;
  status: 'sent';
  enqueued_count: number;
  sent_at: string;
};

export type OutreachAttribution = {
  campaignId: string;
  recipientId: string;
};

type CustomerCandidateRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  | 'id'
  | 'name'
  | 'last_visit_date'
  | 'total_visits'
  | 'lifetime_value'
  | 'line_display_name'
  | 'line_user_id'
>;

type CustomerRecipientRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'last_visit_date' | 'line_user_id'
>;

type CustomerSendRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'line_user_id' | 'consent_marketing' | 'is_deleted'
>;

type OutreachCampaignRow = Pick<
  Database['public']['Tables']['patient_outreach_campaigns']['Row'],
  | 'id'
  | 'clinic_id'
  | 'name'
  | 'status'
  | 'message_body'
  | 'created_at'
  | 'sent_at'
>;

type OutreachRecipientRow = Pick<
  Database['public']['Tables']['patient_outreach_recipients']['Row'],
  | 'id'
  | 'campaign_id'
  | 'clinic_id'
  | 'customer_id'
  | 'line_user_id'
  | 'delivery_status'
  | 'booked_reservation_id'
  | 'sent_at'
>;

type OutreachFrequencyRow = Pick<
  Database['public']['Tables']['patient_outreach_recipients']['Row'],
  'campaign_id' | 'customer_id' | 'sent_at'
>;

type ReservationStatusRow = Pick<
  Database['public']['Tables']['reservations']['Row'],
  'id' | 'status'
>;

type FailedLineOutboxRow = Pick<
  Database['public']['Tables']['line_message_outbox']['Row'],
  'line_user_id'
>;

type OutreachCampaignInsert =
  Database['public']['Tables']['patient_outreach_campaigns']['Insert'];
type OutreachRecipientInsert =
  Database['public']['Tables']['patient_outreach_recipients']['Insert'];
type OutreachCampaignUpdate =
  Database['public']['Tables']['patient_outreach_campaigns']['Update'];
type OutreachRecipientUpdate =
  Database['public']['Tables']['patient_outreach_recipients']['Update'];
type LineMessageOutboxInsert =
  Database['public']['Tables']['line_message_outbox']['Insert'];

export class OutreachDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutreachDraftValidationError';
  }
}

export function resolveDormantCandidateDateRange(
  daysFrom: number,
  daysTo: number,
  now: Date = new Date()
): { today: string; dateFrom: string; dateTo: string } {
  if (daysTo < daysFrom) {
    throw new Error('daysTo must be greater than or equal to daysFrom');
  }

  const today = toJSTDateString(now);
  return {
    today,
    dateFrom: addJSTCalendarDays(today, -daysTo),
    dateTo: addJSTCalendarDays(today, -daysFrom),
  };
}

function mapCandidateRow(
  row: CustomerCandidateRow,
  today: string,
  failedLineUserIds: ReadonlySet<string>
): DormantCandidate | null {
  if (!row.last_visit_date || !row.line_user_id) {
    return null;
  }

  return {
    customer_id: row.id,
    name: row.name,
    last_visit_date: row.last_visit_date,
    days_since_last_visit: differenceInJSTCalendarDays(
      row.last_visit_date,
      today
    ),
    total_visits: row.total_visits,
    lifetime_value: row.lifetime_value,
    line_display_name: row.line_display_name,
    line_delivery_warning: failedLineUserIds.has(row.line_user_id),
  };
}

async function fetchFailedOutreachLineUserIds(
  supabase: Pick<SupabaseServerClient, 'from'>,
  clinicId: string,
  lineUserIds: readonly string[]
): Promise<Set<string>> {
  const uniqueLineUserIds = Array.from(new Set(lineUserIds));
  if (uniqueLineUserIds.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from('line_message_outbox')
    .select('line_user_id')
    .eq('clinic_id', clinicId)
    .eq('message_type', 'outreach')
    .eq('status', 'failed')
    .gte('attempts', 3)
    .in('line_user_id', uniqueLineUserIds)
    .returns<FailedLineOutboxRow[]>();

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map(row => row.line_user_id));
}

export async function fetchDormantCandidates(
  supabase: Pick<SupabaseServerClient, 'from'>,
  input: DormantCandidatesQuery,
  now: Date = new Date()
): Promise<DormantCandidatesResponse> {
  const { today, dateFrom, dateTo } = resolveDormantCandidateDateRange(
    input.days_from,
    input.days_to,
    now
  );

  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, name, last_visit_date, total_visits, lifetime_value, line_display_name, line_user_id'
    )
    .eq('clinic_id', input.clinic_id)
    .eq('is_deleted', false)
    .eq('consent_marketing', true)
    .not('line_user_id', 'is', null)
    .gte('last_visit_date', dateFrom)
    .lte('last_visit_date', dateTo)
    .order('last_visit_date', { ascending: true })
    .limit(MAX_OUTREACH_RECIPIENTS)
    .returns<CustomerCandidateRow[]>();

  if (error) {
    throw error;
  }

  const failedLineUserIds = await fetchFailedOutreachLineUserIds(
    supabase,
    input.clinic_id,
    (data ?? [])
      .map(row => row.line_user_id)
      .filter((lineUserId): lineUserId is string => Boolean(lineUserId))
  );

  const candidates = (data ?? [])
    .map(row => mapCandidateRow(row, today, failedLineUserIds))
    .filter((candidate): candidate is DormantCandidate => candidate !== null);

  return {
    clinic_id: input.clinic_id,
    days_from: input.days_from,
    days_to: input.days_to,
    date_from: dateFrom,
    date_to: dateTo,
    max_recipients: MAX_OUTREACH_RECIPIENTS,
    candidates,
  };
}

function buildSegmentSnapshot(params: {
  input: OutreachDraftInput;
  dateFrom: string;
  dateTo: string;
  selectedCount: number;
  createdAt: string;
}): Json {
  return {
    kind: 'dormant_last_visit',
    daysFrom: params.input.days_from,
    daysTo: params.input.days_to,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    selectedCount: params.selectedCount,
    createdAt: params.createdAt,
  };
}

function assertAllSelectedCustomersEligible(params: {
  requestedIds: readonly string[];
  rows: readonly CustomerRecipientRow[];
}): void {
  const eligibleIds = new Set(params.rows.map(row => row.id));
  const hasMissingOrIneligible = params.requestedIds.some(
    customerId => !eligibleIds.has(customerId)
  );

  if (hasMissingOrIneligible) {
    throw new OutreachDraftValidationError(
      '対象外の患者が含まれています。再抽出してから下書きを作成してください'
    );
  }
}

export async function createOutreachDraft(
  supabase: Pick<SupabaseServerClient, 'from'>,
  input: OutreachDraftInput,
  createdBy: string,
  now: Date = new Date()
): Promise<OutreachDraftResponse> {
  const uniqueCustomerIds = Array.from(new Set(input.customer_ids));
  if (uniqueCustomerIds.length !== input.customer_ids.length) {
    throw new OutreachDraftValidationError(
      '対象患者が重複しています。選択を確認してください'
    );
  }

  const { dateFrom, dateTo } = resolveDormantCandidateDateRange(
    input.days_from,
    input.days_to,
    now
  );
  const createdAt = now.toISOString();

  const { data: customers, error: customerError } = await supabase
    .from('customers')
    .select('id, name, last_visit_date, line_user_id')
    .eq('clinic_id', input.clinic_id)
    .eq('is_deleted', false)
    .eq('consent_marketing', true)
    .not('line_user_id', 'is', null)
    .gte('last_visit_date', dateFrom)
    .lte('last_visit_date', dateTo)
    .in('id', uniqueCustomerIds)
    .returns<CustomerRecipientRow[]>();

  if (customerError) {
    throw customerError;
  }

  const eligibleCustomers = customers ?? [];
  assertAllSelectedCustomersEligible({
    requestedIds: uniqueCustomerIds,
    rows: eligibleCustomers,
  });

  const campaignInsert: OutreachCampaignInsert = {
    clinic_id: input.clinic_id,
    name: input.name,
    status: 'draft',
    message_body: input.message_body,
    segment_snapshot: buildSegmentSnapshot({
      input,
      dateFrom,
      dateTo,
      selectedCount: eligibleCustomers.length,
      createdAt,
    }),
    created_by: createdBy,
  };

  const { data: campaign, error: campaignError } = await supabase
    .from('patient_outreach_campaigns')
    .insert(campaignInsert)
    .select('id, status, created_at')
    .single();

  if (campaignError || !campaign) {
    throw campaignError ?? new Error('Failed to create outreach campaign');
  }

  const recipients: OutreachRecipientInsert[] = eligibleCustomers.map(row => {
    if (!row.line_user_id) {
      throw new OutreachDraftValidationError(
        'LINE連携済みでない患者が含まれています'
      );
    }

    return {
      campaign_id: campaign.id,
      clinic_id: input.clinic_id,
      customer_id: row.id,
      line_user_id: row.line_user_id,
      delivery_status: 'pending',
    };
  });

  const { error: recipientError } = await supabase
    .from('patient_outreach_recipients')
    .insert(recipients);

  if (recipientError) {
    throw recipientError;
  }

  return {
    campaign_id: campaign.id,
    status: 'draft',
    selected_count: recipients.length,
    created_at: campaign.created_at,
  };
}

function normalizeAppUrl(appUrl: string): string {
  const trimmed = appUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function buildOutreachBookingUrl(params: {
  clinicId: string;
  campaignId: string;
  appUrl?: string;
}): string {
  const baseUrl = normalizeAppUrl(params.appUrl ?? env.NEXT_PUBLIC_APP_URL);
  return `${baseUrl}/booking/${params.clinicId}?c=${params.campaignId}`;
}

function replaceNameToken(message: string, name: string): string {
  return message.replace(/\{\{\s*name\s*\}\}/g, name);
}

function buildOutreachLinePayload(params: {
  messageBody: string;
  customerName: string;
  bookingUrl: string;
  campaignId: string;
  recipientId: string;
  customerId: string;
}): LineMessagePayload {
  return {
    text: `${replaceNameToken(
      params.messageBody,
      params.customerName
    )}\n\n予約はこちら:\n${params.bookingUrl}`,
    confirmationUrl: params.bookingUrl,
    outreach: {
      campaignId: params.campaignId,
      recipientId: params.recipientId,
      customerId: params.customerId,
    },
  };
}

async function fetchOutreachRecipientsForCampaign(
  supabase: Pick<SupabaseServerClient, 'from'>,
  params: { clinicId: string; campaignId: string }
): Promise<OutreachRecipientRow[]> {
  const { data, error } = await supabase
    .from('patient_outreach_recipients')
    .select(
      'id, campaign_id, clinic_id, customer_id, line_user_id, delivery_status, booked_reservation_id, sent_at'
    )
    .eq('clinic_id', params.clinicId)
    .eq('campaign_id', params.campaignId)
    .returns<OutreachRecipientRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchCustomerSendRows(
  supabase: Pick<SupabaseServerClient, 'from'>,
  params: { clinicId: string; customerIds: readonly string[] }
): Promise<Map<string, CustomerSendRow>> {
  const uniqueCustomerIds = Array.from(new Set(params.customerIds));
  if (uniqueCustomerIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, line_user_id, consent_marketing, is_deleted')
    .eq('clinic_id', params.clinicId)
    .in('id', uniqueCustomerIds)
    .returns<CustomerSendRow[]>();

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map(row => [row.id, row]));
}

function assertRecipientsStillEligible(params: {
  recipients: readonly OutreachRecipientRow[];
  customersById: ReadonlyMap<string, CustomerSendRow>;
}): void {
  for (const recipient of params.recipients) {
    const customer = params.customersById.get(recipient.customer_id);
    if (
      !customer ||
      customer.is_deleted ||
      customer.consent_marketing !== true ||
      !customer.line_user_id ||
      customer.line_user_id !== recipient.line_user_id
    ) {
      throw new OutreachDraftValidationError(
        '対象外の患者が含まれています。再抽出してから配信してください'
      );
    }
  }
}

async function fetchRecentOutreachRecipients(
  supabase: Pick<SupabaseServerClient, 'from'>,
  params: {
    clinicId: string;
    campaignId: string;
    customerIds: readonly string[];
    now: Date;
  }
): Promise<OutreachFrequencyRow[]> {
  const uniqueCustomerIds = Array.from(new Set(params.customerIds));
  if (uniqueCustomerIds.length === 0) {
    return [];
  }

  const threshold = new Date(
    params.now.getTime() - OUTREACH_FREQUENCY_LIMIT_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from('patient_outreach_recipients')
    .select('campaign_id, customer_id, sent_at')
    .eq('clinic_id', params.clinicId)
    .neq('campaign_id', params.campaignId)
    .not('sent_at', 'is', null)
    .gte('sent_at', threshold)
    .in('customer_id', uniqueCustomerIds)
    .returns<OutreachFrequencyRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function claimDraftCampaignForSend(
  supabase: Pick<SupabaseServerClient, 'from'>,
  params: {
    clinicId: string;
    campaignId: string;
    sentAt: string;
  }
): Promise<OutreachCampaignRow> {
  const update: OutreachCampaignUpdate = {
    status: 'sent',
    sent_at: params.sentAt,
  };

  const { data, error } = await supabase
    .from('patient_outreach_campaigns')
    .update(update)
    .eq('id', params.campaignId)
    .eq('clinic_id', params.clinicId)
    .eq('status', 'draft')
    .select('id, clinic_id, name, status, message_body, created_at, sent_at')
    .returns<OutreachCampaignRow>()
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new OutreachDraftValidationError(
      '配信できる下書きキャンペーンが見つかりません'
    );
  }

  return data;
}

async function resetCampaignSendClaim(
  supabase: Pick<SupabaseServerClient, 'from'>,
  params: { clinicId: string; campaignId: string }
): Promise<void> {
  const update: OutreachCampaignUpdate = {
    status: 'draft',
    sent_at: null,
  };

  await supabase
    .from('patient_outreach_campaigns')
    .update(update)
    .eq('id', params.campaignId)
    .eq('clinic_id', params.clinicId)
    .eq('status', 'sent');
}

export async function sendOutreachCampaign(
  supabase: Pick<SupabaseServerClient, 'from'>,
  input: {
    clinicId: string;
    campaignId: string;
    appUrl?: string;
  },
  now: Date = new Date()
): Promise<OutreachSendResponse> {
  const recipients = await fetchOutreachRecipientsForCampaign(supabase, {
    clinicId: input.clinicId,
    campaignId: input.campaignId,
  });

  if (recipients.length === 0) {
    throw new OutreachDraftValidationError('配信対象者がいません');
  }

  if (recipients.length > MAX_OUTREACH_RECIPIENTS) {
    throw new OutreachDraftValidationError(
      `1キャンペーンの配信対象は最大${MAX_OUTREACH_RECIPIENTS}名までです`
    );
  }

  const customersById = await fetchCustomerSendRows(supabase, {
    clinicId: input.clinicId,
    customerIds: recipients.map(recipient => recipient.customer_id),
  });
  assertRecipientsStillEligible({ recipients, customersById });

  const recentRecipients = await fetchRecentOutreachRecipients(supabase, {
    clinicId: input.clinicId,
    campaignId: input.campaignId,
    customerIds: recipients.map(recipient => recipient.customer_id),
    now,
  });
  if (recentRecipients.length > 0) {
    throw new OutreachDraftValidationError(
      `同一患者への再来促進配信は${OUTREACH_FREQUENCY_LIMIT_DAYS}日間に1通までです`
    );
  }

  const sentAt = now.toISOString();
  const campaign = await claimDraftCampaignForSend(supabase, {
    clinicId: input.clinicId,
    campaignId: input.campaignId,
    sentAt,
  });

  try {
    const bookingUrl = buildOutreachBookingUrl({
      clinicId: input.clinicId,
      campaignId: input.campaignId,
      appUrl: input.appUrl,
    });
    const outboxRows: LineMessageOutboxInsert[] = recipients.map(recipient => {
      const customer = customersById.get(recipient.customer_id);
      if (!customer) {
        throw new OutreachDraftValidationError(
          '対象外の患者が含まれています。再抽出してから配信してください'
        );
      }

      return {
        clinic_id: input.clinicId,
        line_user_id: recipient.line_user_id,
        message_type: 'outreach',
        payload: buildOutreachLinePayload({
          messageBody: campaign.message_body,
          customerName: customer.name,
          bookingUrl,
          campaignId: input.campaignId,
          recipientId: recipient.id,
          customerId: recipient.customer_id,
        }),
        status: 'pending',
      };
    });

    const { error: outboxError } = await supabase
      .from('line_message_outbox')
      .insert(outboxRows);

    if (outboxError) {
      throw outboxError;
    }

    const recipientUpdate: OutreachRecipientUpdate = {
      delivery_status: 'pending',
      sent_at: sentAt,
    };
    const { error: recipientError } = await supabase
      .from('patient_outreach_recipients')
      .update(recipientUpdate)
      .eq('clinic_id', input.clinicId)
      .eq('campaign_id', input.campaignId)
      .in(
        'id',
        recipients.map(recipient => recipient.id)
      );

    if (recipientError) {
      throw recipientError;
    }

    return {
      campaign_id: input.campaignId,
      status: 'sent',
      enqueued_count: recipients.length,
      sent_at: sentAt,
    };
  } catch (error) {
    await resetCampaignSendClaim(supabase, {
      clinicId: input.clinicId,
      campaignId: input.campaignId,
    });
    throw error;
  }
}

function summarizeCampaigns(params: {
  campaigns: readonly OutreachCampaignRow[];
  recipients: readonly OutreachRecipientRow[];
  reservationStatuses: ReadonlyMap<string, string>;
}): OutreachCampaignSummary[] {
  const recipientsByCampaign = new Map<string, OutreachRecipientRow[]>();
  for (const recipient of params.recipients) {
    const current = recipientsByCampaign.get(recipient.campaign_id) ?? [];
    current.push(recipient);
    recipientsByCampaign.set(recipient.campaign_id, current);
  }

  return params.campaigns.map(campaign => {
    const recipients = recipientsByCampaign.get(campaign.id) ?? [];
    return {
      campaign_id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      message_body: campaign.message_body,
      created_at: campaign.created_at,
      sent_at: campaign.sent_at,
      selected_count: recipients.length,
      sent_count: recipients.filter(recipient => recipient.sent_at).length,
      delivered_count: recipients.filter(
        recipient => recipient.delivery_status === 'sent'
      ).length,
      booked_count: recipients.filter(
        recipient => recipient.booked_reservation_id
      ).length,
      visited_count: recipients.filter(recipient => {
        if (!recipient.booked_reservation_id) return false;
        const status = params.reservationStatuses.get(
          recipient.booked_reservation_id
        );
        return status ? VISITED_RESERVATION_STATUSES.has(status) : false;
      }).length,
    };
  });
}

export async function listOutreachCampaigns(
  supabase: Pick<SupabaseServerClient, 'from'>,
  input: OutreachCampaignsQuery
): Promise<OutreachCampaignsResponse> {
  const { data: campaigns, error: campaignError } = await supabase
    .from('patient_outreach_campaigns')
    .select('id, clinic_id, name, status, message_body, created_at, sent_at')
    .eq('clinic_id', input.clinic_id)
    .order('created_at', { ascending: false })
    .limit(OUTREACH_CAMPAIGN_LIST_LIMIT)
    .returns<OutreachCampaignRow[]>();

  if (campaignError) {
    throw campaignError;
  }

  const campaignRows = campaigns ?? [];
  if (campaignRows.length === 0) {
    return {
      clinic_id: input.clinic_id,
      campaigns: [],
    };
  }

  const campaignIds = campaignRows.map(campaign => campaign.id);
  const { data: recipients, error: recipientError } = await supabase
    .from('patient_outreach_recipients')
    .select(
      'id, campaign_id, clinic_id, customer_id, line_user_id, delivery_status, booked_reservation_id, sent_at'
    )
    .eq('clinic_id', input.clinic_id)
    .in('campaign_id', campaignIds)
    .returns<OutreachRecipientRow[]>();

  if (recipientError) {
    throw recipientError;
  }

  const recipientRows = recipients ?? [];
  const reservationIds = Array.from(
    new Set(
      recipientRows
        .map(recipient => recipient.booked_reservation_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const reservationStatuses = new Map<string, string>();

  if (reservationIds.length > 0) {
    const { data: reservations, error: reservationError } = await supabase
      .from('reservations')
      .select('id, status')
      .eq('clinic_id', input.clinic_id)
      .in('id', reservationIds)
      .returns<ReservationStatusRow[]>();

    if (reservationError) {
      throw reservationError;
    }

    for (const reservation of reservations ?? []) {
      reservationStatuses.set(reservation.id, reservation.status);
    }
  }

  return {
    clinic_id: input.clinic_id,
    campaigns: summarizeCampaigns({
      campaigns: campaignRows,
      recipients: recipientRows,
      reservationStatuses,
    }),
  };
}

export async function resolveOutreachAttribution(
  supabase: Pick<SupabaseServerClient, 'from'>,
  params: {
    clinicId: string;
    campaignId: string | undefined;
    customerId: string;
  }
): Promise<OutreachAttribution | null> {
  if (!params.campaignId) {
    return null;
  }

  const { data: campaigns, error: campaignError } = await supabase
    .from('patient_outreach_campaigns')
    .select('id')
    .eq('id', params.campaignId)
    .eq('clinic_id', params.clinicId)
    .limit(1)
    .returns<Array<Pick<OutreachCampaignRow, 'id'>>>();

  if (campaignError || !campaigns?.[0]) {
    return null;
  }

  const { data: recipients, error: recipientError } = await supabase
    .from('patient_outreach_recipients')
    .select('id')
    .eq('campaign_id', params.campaignId)
    .eq('clinic_id', params.clinicId)
    .eq('customer_id', params.customerId)
    .is('booked_reservation_id', null)
    .limit(1)
    .returns<Array<Pick<OutreachRecipientRow, 'id'>>>();

  const recipient = recipients?.[0];
  if (recipientError || !recipient) {
    return null;
  }

  return {
    campaignId: params.campaignId,
    recipientId: recipient.id,
  };
}

export async function markOutreachRecipientBooked(
  supabase: Pick<SupabaseServerClient, 'from'>,
  params: {
    clinicId: string;
    campaignId: string;
    recipientId: string;
    reservationId: string;
  }
): Promise<void> {
  const update: OutreachRecipientUpdate = {
    booked_reservation_id: params.reservationId,
  };

  const { error } = await supabase
    .from('patient_outreach_recipients')
    .update(update)
    .eq('id', params.recipientId)
    .eq('clinic_id', params.clinicId)
    .eq('campaign_id', params.campaignId)
    .is('booked_reservation_id', null);

  if (error) {
    throw error;
  }
}
