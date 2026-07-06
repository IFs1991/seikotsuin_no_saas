import { z } from 'zod';
import type { SupabaseServerClient } from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';
import {
  addJSTCalendarDays,
  differenceInJSTCalendarDays,
  toJSTDateString,
} from '@/lib/jst';

export const OUTREACH_ALLOWED_ROLES = [
  'admin',
  'clinic_admin',
  'manager',
] as const;

export const MAX_OUTREACH_RECIPIENTS = 300;

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

export type DormantCandidatesQuery = z.infer<
  typeof dormantCandidatesQuerySchema
>;
export type OutreachDraftInput = z.infer<typeof outreachDraftSchema>;

export type DormantCandidate = {
  customer_id: string;
  name: string;
  last_visit_date: string;
  days_since_last_visit: number;
  total_visits: number | null;
  lifetime_value: number | null;
  line_display_name: string | null;
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

type CustomerCandidateRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  | 'id'
  | 'name'
  | 'last_visit_date'
  | 'total_visits'
  | 'lifetime_value'
  | 'line_display_name'
>;

type CustomerRecipientRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'last_visit_date' | 'line_user_id'
>;

type OutreachCampaignInsert =
  Database['public']['Tables']['patient_outreach_campaigns']['Insert'];
type OutreachRecipientInsert =
  Database['public']['Tables']['patient_outreach_recipients']['Insert'];

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
  today: string
): DormantCandidate | null {
  if (!row.last_visit_date) {
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
  };
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
      'id, name, last_visit_date, total_visits, lifetime_value, line_display_name'
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

  const candidates = (data ?? [])
    .map(row => mapCandidateRow(row, today))
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
