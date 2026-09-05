import type {
  CrmSupabaseClient,
  PatientStaffPreferenceRow,
} from '@/lib/crm-line/db';

type CustomerLineRow = {
  id: string;
  name: string;
  line_user_id: string | null;
};

type StaffResourceRow = {
  id: string;
  name: string;
};

type StaffHistoryRow = { staff_id: string };

export class StaffPreferenceHistoryRequiredError extends Error {
  constructor() {
    super('過去に担当したスタッフだけを通知対象に設定できます');
    this.name = 'StaffPreferenceHistoryRequiredError';
  }
}

export type LineStaffPreferenceView = {
  customerId: string;
  staff: Array<{ id: string; name: string; notificationEnabled: boolean }>;
};

async function findCustomerByLineUserId(
  client: CrmSupabaseClient,
  clinicId: string,
  lineUserId: string,
  credentialGenerationId: string
): Promise<CustomerLineRow> {
  const { data, error } = await client
    .from('customers')
    .select('id, name, line_user_id')
    .eq('clinic_id', clinicId)
    .eq('line_user_id', lineUserId)
    .eq('line_credential_generation_id', credentialGenerationId)
    .eq('is_deleted', false)
    .maybeSingle<CustomerLineRow>();
  if (error || !data) {
    throw new Error('LINE連携済みの患者情報が見つかりません');
  }
  return data;
}

export async function listLineStaffPreferences(
  client: CrmSupabaseClient,
  params: {
    clinicId: string;
    credentialGenerationId: string;
    lineUserId: string;
  }
): Promise<LineStaffPreferenceView> {
  const customer = await findCustomerByLineUserId(
    client,
    params.clinicId,
    params.lineUserId,
    params.credentialGenerationId
  );
  const historyResult = await client
    .from('reservations')
    .select('staff_id')
    .eq('clinic_id', params.clinicId)
    .eq('customer_id', customer.id)
    .in('status', ['completed', 'arrived'])
    .eq('is_deleted', false)
    .returns<StaffHistoryRow[]>();
  if (historyResult.error) throw historyResult.error;
  const previousStaffIds = Array.from(
    new Set((historyResult.data ?? []).map(row => row.staff_id))
  );
  if (previousStaffIds.length === 0) {
    return { customerId: customer.id, staff: [] };
  }

  const [staffResult, preferenceResult] = await Promise.all([
    client
      .from('resources')
      .select('id, name')
      .eq('clinic_id', params.clinicId)
      .eq('type', 'staff')
      .eq('is_active', true)
      .eq('is_bookable', true)
      .eq('is_deleted', false)
      .in('id', previousStaffIds)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
      .returns<StaffResourceRow[]>(),
    client
      .from('patient_staff_preferences')
      .select('*')
      .eq('clinic_id', params.clinicId)
      .eq('customer_id', customer.id)
      .returns<PatientStaffPreferenceRow[]>(),
  ]);
  if (staffResult.error) throw staffResult.error;
  if (preferenceResult.error) throw preferenceResult.error;

  const enabledByStaff = new Map(
    (preferenceResult.data ?? []).map(row => [
      row.staff_id,
      row.notification_enabled,
    ])
  );
  return {
    customerId: customer.id,
    staff: (staffResult.data ?? []).map(staff => ({
      id: staff.id,
      name: staff.name,
      notificationEnabled: enabledByStaff.get(staff.id) ?? false,
    })),
  };
}

export async function setLineStaffPreference(
  client: CrmSupabaseClient,
  params: {
    clinicId: string;
    credentialGenerationId: string;
    lineUserId: string;
    staffId: string;
    notificationEnabled: boolean;
  }
): Promise<PatientStaffPreferenceRow> {
  const customer = await findCustomerByLineUserId(
    client,
    params.clinicId,
    params.lineUserId,
    params.credentialGenerationId
  );
  const { data: staff, error: staffError } = await client
    .from('resources')
    .select('id')
    .eq('id', params.staffId)
    .eq('clinic_id', params.clinicId)
    .eq('type', 'staff')
    .eq('is_active', true)
    .eq('is_bookable', true)
    .eq('is_deleted', false)
    .maybeSingle();
  if (staffError || !staff) {
    throw new Error('指定されたスタッフが見つかりません');
  }

  const { data: history, error: historyError } = await client
    .from('reservations')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('customer_id', customer.id)
    .eq('staff_id', params.staffId)
    .in('status', ['completed', 'arrived'])
    .eq('is_deleted', false)
    .limit(1)
    .maybeSingle();
  if (historyError) throw historyError;
  if (!history) throw new StaffPreferenceHistoryRequiredError();

  const { data, error } = await client
    .from('patient_staff_preferences')
    .upsert(
      {
        clinic_id: params.clinicId,
        customer_id: customer.id,
        staff_id: params.staffId,
        notification_enabled: params.notificationEnabled,
      },
      { onConflict: 'clinic_id,customer_id,staff_id' }
    )
    .select('*')
    .single();
  if (error || !data) {
    throw error ?? new Error('指名スタッフ設定を保存できませんでした');
  }
  return data;
}
