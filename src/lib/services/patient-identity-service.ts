import type {
  CrmSupabaseClient,
  PatientIdentityAliasRow,
} from '@/lib/crm-line/db';

type CustomerIdentityRow = {
  id: string;
  name: string;
  name_kana: string | null;
  phone: string;
  normalized_phone: string | null;
  line_user_id: string | null;
  created_at: string;
};

type ReservationHistoryRow = {
  customer_id: string;
  staff_id: string;
  menu_id: string;
  start_time: string;
  status: string;
};

type NamedRow = { id: string; name: string };
type AliasCustomerIdRow = { customer_id: string };

export type PatientIdentityCandidateInput = {
  clinicId: string;
  name?: string;
  phone?: string;
  lineUserId?: string;
  staffId?: string;
  menuId?: string;
};

export type PatientIdentityCandidate = {
  customerId: string;
  displayName: string;
  phoneticName: string | null;
  score: number;
  scoreBreakdown: {
    lineUserId: number;
    phone: number;
    name: number;
    alias: number;
    staffHistory: number;
    menuHistory: number;
  };
  visitCount: number;
  lastVisitAt: string | null;
  averageVisitIntervalDays: number | null;
  staffHistory: Array<{ staffId: string; staffName: string | null }>;
  menuHistory: Array<{ menuId: string; menuName: string | null }>;
};

const VISITED_STATUSES = ['completed', 'arrived'] as const;
const MAX_CANDIDATES = 50;

export function normalizeIdentityText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u30a1-\u30f6]/gu, character =>
      String.fromCharCode(character.charCodeAt(0) - 0x60)
    )
    .replace(/\s+/gu, '')
    .trim()
    .toLocaleLowerCase('ja-JP');
}

export function normalizePhone(value: string | undefined): string | null {
  if (!value) return null;
  const compact = value.trim().replace(/[\s-]/gu, '');
  if (!compact) return null;
  if (compact.startsWith('+81')) {
    return `0${compact.slice(3)}`;
  }
  return compact;
}

function cleanSearchText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 255) : null;
}

function isPatientIdentityAliasType(
  value: string
): value is PatientIdentityAliasRow['alias_type'] {
  return ['name', 'phonetic_name', 'other'].includes(value);
}

function isPatientIdentityAliasSource(
  value: string
): value is PatientIdentityAliasRow['source'] {
  return ['manual', 'line_profile', 'import'].includes(value);
}

function addCandidate(
  candidates: Map<string, CustomerIdentityRow>,
  rows: CustomerIdentityRow[]
): void {
  for (const row of rows) {
    candidates.set(row.id, row);
  }
}

async function fetchCustomerCandidates(
  client: CrmSupabaseClient,
  input: PatientIdentityCandidateInput
): Promise<CustomerIdentityRow[]> {
  const candidateMap = new Map<string, CustomerIdentityRow>();
  const name = cleanSearchText(input.name);
  const phone = normalizePhone(input.phone);

  if (input.lineUserId) {
    const { data, error } = await client
      .from('customers')
      .select(
        'id, name, name_kana, phone, normalized_phone, line_user_id, created_at'
      )
      .eq('clinic_id', input.clinicId)
      .eq('line_user_id', input.lineUserId)
      .eq('is_deleted', false)
      .limit(MAX_CANDIDATES)
      .returns<CustomerIdentityRow[]>();
    if (error) throw error;
    addCandidate(candidateMap, data ?? []);
  }

  if (phone) {
    const { data, error } = await client
      .from('customers')
      .select(
        'id, name, name_kana, phone, normalized_phone, line_user_id, created_at'
      )
      .eq('clinic_id', input.clinicId)
      .eq('normalized_phone', phone)
      .eq('is_deleted', false)
      .limit(MAX_CANDIDATES)
      .returns<CustomerIdentityRow[]>();
    if (error) throw error;
    addCandidate(candidateMap, data ?? []);
  }

  if (name) {
    const normalizedAlias = normalizeIdentityText(name);
    if (normalizedAlias) {
      const { data: aliasRows, error: aliasError } = await client
        .from('patient_identity_aliases')
        .select('customer_id')
        .eq('clinic_id', input.clinicId)
        .eq('normalized_alias', normalizedAlias)
        .limit(MAX_CANDIDATES)
        .returns<AliasCustomerIdRow[]>();
      if (aliasError) throw aliasError;

      const aliasCustomerIds = Array.from(
        new Set((aliasRows ?? []).map(row => row.customer_id))
      );
      if (aliasCustomerIds.length > 0) {
        const { data: aliasCustomers, error: aliasCustomerError } = await client
          .from('customers')
          .select(
            'id, name, name_kana, phone, normalized_phone, line_user_id, created_at'
          )
          .eq('clinic_id', input.clinicId)
          .in('id', aliasCustomerIds)
          .eq('is_deleted', false)
          .limit(MAX_CANDIDATES)
          .returns<CustomerIdentityRow[]>();
        if (aliasCustomerError) throw aliasCustomerError;
        addCandidate(candidateMap, aliasCustomers ?? []);
      }
    }

    const exactNameResults = await Promise.all([
      client
        .from('customers')
        .select(
          'id, name, name_kana, phone, normalized_phone, line_user_id, created_at'
        )
        .eq('clinic_id', input.clinicId)
        .eq('name', name)
        .eq('is_deleted', false)
        .limit(MAX_CANDIDATES)
        .returns<CustomerIdentityRow[]>(),
      client
        .from('customers')
        .select(
          'id, name, name_kana, phone, normalized_phone, line_user_id, created_at'
        )
        .eq('clinic_id', input.clinicId)
        .eq('name_kana', name)
        .eq('is_deleted', false)
        .limit(MAX_CANDIDATES)
        .returns<CustomerIdentityRow[]>(),
    ]);
    for (const result of exactNameResults) {
      if (result.error) throw result.error;
      addCandidate(candidateMap, result.data ?? []);
    }

    if (candidateMap.size === 0) {
      const safeName = name.replace(/[%,*()\\]/gu, '');
      if (safeName) {
        const { data, error } = await client
          .from('customers')
          .select(
            'id, name, name_kana, phone, normalized_phone, line_user_id, created_at'
          )
          .eq('clinic_id', input.clinicId)
          .ilike('name', `%${safeName}%`)
          .eq('is_deleted', false)
          .limit(MAX_CANDIDATES)
          .returns<CustomerIdentityRow[]>();
        if (error) throw error;
        addCandidate(candidateMap, data ?? []);
      }
    }
  }

  if (candidateMap.size === 0) {
    return [];
  }

  return Array.from(candidateMap.values()).slice(0, MAX_CANDIDATES);
}

async function fetchAliases(
  client: CrmSupabaseClient,
  clinicId: string,
  customerIds: string[]
): Promise<PatientIdentityAliasRow[]> {
  if (customerIds.length === 0) return [];
  const { data, error } = await client
    .from('patient_identity_aliases')
    .select('*')
    .eq('clinic_id', clinicId)
    .in('customer_id', customerIds)
    .returns<PatientIdentityAliasRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function fetchReservationHistory(
  client: CrmSupabaseClient,
  clinicId: string,
  customerIds: string[]
): Promise<ReservationHistoryRow[]> {
  if (customerIds.length === 0) return [];
  const { data, error } = await client
    .from('reservations')
    .select('customer_id, staff_id, menu_id, start_time, status')
    .eq('clinic_id', clinicId)
    .in('customer_id', customerIds)
    .in('status', [...VISITED_STATUSES])
    .eq('is_deleted', false)
    .order('start_time', { ascending: false })
    .returns<ReservationHistoryRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function fetchNames(
  client: CrmSupabaseClient,
  clinicId: string,
  ids: string[],
  table: 'resources' | 'menus'
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from(table)
    .select('id, name')
    .eq('clinic_id', clinicId)
    .in('id', ids)
    .returns<NamedRow[]>();
  if (error) throw error;
  return new Map((data ?? []).map(row => [row.id, row.name]));
}

function calculateAverageIntervalDays(
  history: ReservationHistoryRow[]
): number | null {
  const dates = history
    .map(row => Date.parse(row.start_time))
    .filter((value): value is number => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (dates.length < 2) return null;
  let total = 0;
  for (let index = 1; index < dates.length; index += 1) {
    total += dates[index] - dates[index - 1];
  }
  return Math.round(total / (dates.length - 1) / (24 * 60 * 60 * 1000));
}

export async function findPatientIdentityCandidates(
  client: CrmSupabaseClient,
  input: PatientIdentityCandidateInput
): Promise<PatientIdentityCandidate[]> {
  const customers = await fetchCustomerCandidates(client, input);
  if (customers.length === 0) return [];

  const customerIds = customers.map(row => row.id);
  const [aliases, reservations] = await Promise.all([
    fetchAliases(client, input.clinicId, customerIds),
    fetchReservationHistory(client, input.clinicId, customerIds),
  ]);
  const staffIds = Array.from(new Set(reservations.map(row => row.staff_id)));
  const menuIds = Array.from(new Set(reservations.map(row => row.menu_id)));
  const [staffNames, menuNames] = await Promise.all([
    fetchNames(client, input.clinicId, staffIds, 'resources'),
    fetchNames(client, input.clinicId, menuIds, 'menus'),
  ]);

  const normalizedName = input.name ? normalizeIdentityText(input.name) : null;
  const normalizedPhone = normalizePhone(input.phone);
  const aliasesByCustomer = new Map<string, PatientIdentityAliasRow[]>();
  for (const alias of aliases) {
    const current = aliasesByCustomer.get(alias.customer_id) ?? [];
    current.push(alias);
    aliasesByCustomer.set(alias.customer_id, current);
  }
  const historyByCustomer = new Map<string, ReservationHistoryRow[]>();
  for (const reservation of reservations) {
    const current = historyByCustomer.get(reservation.customer_id) ?? [];
    current.push(reservation);
    historyByCustomer.set(reservation.customer_id, current);
  }

  return customers
    .map(customer => {
      const history = historyByCustomer.get(customer.id) ?? [];
      const customerAliases = aliasesByCustomer.get(customer.id) ?? [];
      const lineUserIdScore =
        input.lineUserId && customer.line_user_id === input.lineUserId
          ? 100
          : 0;
      const phoneScore =
        normalizedPhone && customer.normalized_phone === normalizedPhone
          ? 60
          : 0;
      const nameScore =
        normalizedName &&
        (normalizeIdentityText(customer.name) === normalizedName ||
          (customer.name_kana !== null &&
            normalizeIdentityText(customer.name_kana) === normalizedName))
          ? 25
          : 0;
      const aliasScore =
        normalizedName &&
        customerAliases.some(
          alias =>
            normalizeIdentityText(alias.normalized_alias) === normalizedName
        )
          ? 20
          : 0;
      const staffHistoryScore =
        input.staffId && history.some(row => row.staff_id === input.staffId)
          ? 10
          : 0;
      const menuHistoryScore =
        input.menuId && history.some(row => row.menu_id === input.menuId)
          ? 10
          : 0;
      const staffHistory = Array.from(
        new Set(history.map(row => row.staff_id))
      ).map(staffId => ({
        staffId,
        staffName: staffNames.get(staffId) ?? null,
      }));
      const menuHistory = Array.from(
        new Set(history.map(row => row.menu_id))
      ).map(menuId => ({ menuId, menuName: menuNames.get(menuId) ?? null }));

      return {
        customerId: customer.id,
        displayName: customer.name,
        phoneticName: customer.name_kana,
        score:
          lineUserIdScore +
          phoneScore +
          nameScore +
          aliasScore +
          staffHistoryScore +
          menuHistoryScore,
        scoreBreakdown: {
          lineUserId: lineUserIdScore,
          phone: phoneScore,
          name: nameScore,
          alias: aliasScore,
          staffHistory: staffHistoryScore,
          menuHistory: menuHistoryScore,
        },
        visitCount: history.length,
        lastVisitAt: history[0]?.start_time ?? null,
        averageVisitIntervalDays: calculateAverageIntervalDays(history),
        staffHistory,
        menuHistory,
      } satisfies PatientIdentityCandidate;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

export type CreatePatientIdentityAliasInput = {
  clinicId: string;
  customerId: string;
  alias: string;
  aliasType: 'name' | 'phonetic_name' | 'other';
  source?: 'manual' | 'line_profile' | 'import';
};

export async function createPatientIdentityAlias(
  client: CrmSupabaseClient,
  input: CreatePatientIdentityAliasInput
): Promise<PatientIdentityAliasRow> {
  const alias = input.alias.trim();
  if (!alias) throw new Error('Alias must not be blank');
  const { data, error } = await client
    .from('patient_identity_aliases')
    .insert({
      clinic_id: input.clinicId,
      customer_id: input.customerId,
      alias,
      normalized_alias: normalizeIdentityText(alias),
      alias_type: input.aliasType,
      source: input.source ?? 'manual',
    })
    .select('*')
    .single();
  if (error || !data)
    throw error ?? new Error('Failed to create identity alias');
  if (
    !isPatientIdentityAliasType(data.alias_type) ||
    !isPatientIdentityAliasSource(data.source)
  ) {
    throw new Error('Invalid identity alias classification returned');
  }
  return {
    ...data,
    alias_type: data.alias_type,
    source: data.source,
  };
}

export async function listPatientIdentityAliases(
  client: CrmSupabaseClient,
  params: { clinicId: string; customerId: string }
): Promise<PatientIdentityAliasRow[]> {
  const { data, error } = await client
    .from('patient_identity_aliases')
    .select('*')
    .eq('clinic_id', params.clinicId)
    .eq('customer_id', params.customerId)
    .order('created_at', { ascending: false })
    .returns<PatientIdentityAliasRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function deletePatientIdentityAlias(
  client: CrmSupabaseClient,
  params: { clinicId: string; aliasId: string }
): Promise<void> {
  const { error } = await client
    .from('patient_identity_aliases')
    .delete()
    .eq('id', params.aliasId)
    .eq('clinic_id', params.clinicId);
  if (error) throw error;
}
