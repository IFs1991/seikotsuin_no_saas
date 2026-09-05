import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import {
  CORE100_ASSIGNED_CLINIC_ID,
  CORE100_ASSIGNMENT_ID,
  CORE100_BOOKING_FIXTURES,
  CORE100_COMPANY_ID,
  CORE100_EXTRA_RESERVATIONS,
  CORE100_MANAGER,
  CORE100_PREVIOUS_REPORT_ID,
  CORE100_UNASSIGNED_CLINIC_ID,
  CORE100_UNASSIGNED_STAFF,
} from '../core100-fixtures';

type Client = SupabaseClient<Database>;
type FixtureAccount = typeof CORE100_MANAGER | typeof CORE100_UNASSIGNED_STAFF;
type ReservationInsert = Database['public']['Tables']['reservations']['Insert'];
type ReportInsert = Database['public']['Tables']['daily_reports']['Insert'];

export function assertCore100LocalEnvironment(
  effectiveAppUrl = process.env.NEXT_PUBLIC_APP_URL
) {
  if (process.env.CORE100_E2E_ENABLED !== 'true') {
    throw new Error('Core100 fixture seed requires CORE100_E2E_ENABLED=true.');
  }
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const value of [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    effectiveAppUrl,
  ]) {
    if (!value) throw new Error('Core100 fixture target must be explicit.');
    const url = new URL(value);
    if (
      !loopback.has(url.hostname) ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error(
        'Core100 fixture seed requires loopback app and database targets.'
      );
    }
  }
}

async function requireSuccess(
  query: PromiseLike<{ error: { message: string } | null }>,
  label: string
) {
  const { error } = await query;
  if (error)
    throw new Error(`Core100 fixture ${label} failed: ${error.message}`);
}

async function ensureAccount(client: Client, account: FixtureAccount) {
  const current = await client.auth.admin.getUserById(account.id);
  if (current.error && current.error.status !== 404) {
    throw new Error('Core100 Auth fixture lookup failed.');
  }
  if (current.data.user && current.data.user.email !== account.email) {
    throw new Error('Core100 Auth fixture ID is owned by another account.');
  }
  const attributes = {
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: `Core100 ${account.role}` },
    app_metadata: { user_role: account.role, clinic_id: account.clinicId },
  };
  const result = current.data.user
    ? await client.auth.admin.updateUserById(account.id, attributes)
    : await client.auth.admin.createUser({ id: account.id, ...attributes });
  if (result.error || result.data.user?.id !== account.id) {
    throw new Error('Core100 Auth fixture creation/update failed.');
  }
  await requireSuccess(
    client.from('staff').upsert(
      {
        id: account.id,
        clinic_id: account.clinicId,
        name: `Core100 ${account.role}`,
        role: account.role,
        email: account.email,
        password_hash: 'managed_by_supabase',
      },
      { onConflict: 'id' }
    ),
    'staff'
  );
  await requireSuccess(
    client.from('profiles').upsert(
      {
        user_id: account.id,
        clinic_id: account.clinicId,
        email: account.email,
        full_name: `Core100 ${account.role}`,
        role: account.role,
        is_active: true,
      },
      { onConflict: 'user_id' }
    ),
    'profiles'
  );
  await requireSuccess(
    client.from('user_permissions').upsert(
      {
        staff_id: account.id,
        clinic_id: account.clinicId,
        role: account.role,
        username: account.email,
        hashed_password: 'managed_by_supabase',
      },
      { onConflict: 'staff_id' }
    ),
    'permissions'
  );
}

export async function seedCore100Fixtures(client: Client) {
  assertCore100LocalEnvironment();
  // A dedicated company avoids widening any existing A/B account's scope.
  await requireSuccess(
    client.from('clinics').upsert(
      {
        id: CORE100_COMPANY_ID,
        name: 'Core100 company C',
        parent_id: null,
        is_active: true,
      },
      { onConflict: 'id' }
    ),
    'company'
  );
  await requireSuccess(
    client.from('clinics').upsert(
      [
        {
          id: CORE100_ASSIGNED_CLINIC_ID,
          name: 'Core100 assigned clinic',
          parent_id: CORE100_COMPANY_ID,
          is_active: true,
        },
        {
          id: CORE100_UNASSIGNED_CLINIC_ID,
          name: 'Core100 unassigned clinic',
          parent_id: CORE100_COMPANY_ID,
          is_active: true,
        },
      ],
      { onConflict: 'id' }
    ),
    'child clinics'
  );
  const children = await client
    .from('clinics')
    .select('id, parent_id')
    .in('id', [CORE100_ASSIGNED_CLINIC_ID, CORE100_UNASSIGNED_CLINIC_ID]);
  if (
    children.error ||
    children.data?.length !== 2 ||
    children.data.some(row => row.parent_id !== CORE100_COMPANY_ID)
  ) {
    throw new Error('Core100 same-company child clinic witness is invalid.');
  }
  for (const account of [CORE100_MANAGER, CORE100_UNASSIGNED_STAFF]) {
    await ensureAccount(client, account);
  }
  await requireSuccess(
    client.from('manager_clinic_assignments').upsert(
      {
        id: CORE100_ASSIGNMENT_ID,
        manager_user_id: CORE100_MANAGER.id,
        clinic_id: CORE100_ASSIGNED_CLINIC_ID,
        assigned_by: CORE100_MANAGER.id,
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
      },
      { onConflict: 'id' }
    ),
    'manager assignment'
  );
  const assignments = await client
    .from('manager_clinic_assignments')
    .select('clinic_id')
    .eq('manager_user_id', CORE100_MANAGER.id)
    .is('revoked_at', null);
  if (
    assignments.error ||
    assignments.data?.length !== 1 ||
    assignments.data[0]?.clinic_id !== CORE100_ASSIGNED_CLINIC_ID
  ) {
    throw new Error(
      'Core100 manager must have exactly one assigned child clinic.'
    );
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayStart = Date.parse(`${today}T00:00:00+09:00`);
  const previousDay = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  for (const fixture of CORE100_BOOKING_FIXTURES) {
    await requireSuccess(
      client.from('customers').upsert(
        {
          id: fixture.customerId,
          clinic_id: fixture.clinicId,
          name: `${fixture.label} patient`,
          phone: '09000000000',
          created_by: fixture.userId,
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
        },
        { onConflict: 'id' }
      ),
      'customer'
    );
    await requireSuccess(
      client.from('menus').upsert(
        {
          id: fixture.menuId,
          clinic_id: fixture.clinicId,
          name: `${fixture.label} menu`,
          duration_minutes: 30,
          price: 1000,
          is_active: true,
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
          created_by: fixture.userId,
        },
        { onConflict: 'id' }
      ),
      'menu'
    );
    await requireSuccess(
      client.from('resources').upsert(
        {
          id: fixture.resourceId,
          clinic_id: fixture.clinicId,
          name: `${fixture.label} resource`,
          type: 'staff',
          supported_menus: [fixture.menuId],
          max_concurrent: 1,
          is_active: true,
          is_bookable: true,
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
          created_by: fixture.userId,
        },
        { onConflict: 'id' }
      ),
      'resource'
    );
    const base: ReservationInsert = {
      id: fixture.reservationId,
      clinic_id: fixture.clinicId,
      customer_id: fixture.customerId,
      menu_id: fixture.menuId,
      staff_id: fixture.resourceId,
      start_time: new Date(todayStart).toISOString(),
      end_time: new Date(todayStart + 1_800_000).toISOString(),
      status: 'confirmed',
      channel: 'phone',
      price: 1000,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      created_by: fixture.userId,
    };
    const reservations: ReservationInsert[] = [base];
    if (fixture.clinicId === CORE100_ASSIGNED_CLINIC_ID) {
      reservations.push(
        {
          ...base,
          id: CORE100_EXTRA_RESERVATIONS.todayCompleted,
          status: 'completed',
          start_time: new Date(todayStart + 3_600_000).toISOString(),
          end_time: new Date(todayStart + 5_400_000).toISOString(),
        },
        {
          ...base,
          id: CORE100_EXTRA_RESERVATIONS.todayCancelled,
          status: 'cancelled',
          start_time: new Date(todayStart + 7_200_000).toISOString(),
          end_time: new Date(todayStart + 9_000_000).toISOString(),
        },
        {
          ...base,
          id: CORE100_EXTRA_RESERVATIONS.previousWeekday,
          start_time: new Date(todayStart - 7 * 86_400_000).toISOString(),
          end_time: new Date(
            todayStart - 7 * 86_400_000 + 1_800_000
          ).toISOString(),
        }
      );
    }
    await requireSuccess(
      client.from('reservations').upsert(reservations, { onConflict: 'id' }),
      'reservations'
    );
    // Only C clinics receive fixed KPI reports; B's existing reporting is untouched.
    if (
      fixture.clinicId === CORE100_ASSIGNED_CLINIC_ID ||
      fixture.clinicId === CORE100_UNASSIGNED_CLINIC_ID
    ) {
      const assigned = fixture.clinicId === CORE100_ASSIGNED_CLINIC_ID;
      const report: ReportInsert = {
        id: fixture.reportId,
        clinic_id: fixture.clinicId,
        report_date: today,
        total_patients: assigned ? 5 : 99,
        new_patients: 1,
        total_revenue: assigned ? 10_000 : 99_000,
        insurance_revenue: 0,
        private_revenue: assigned ? 10_000 : 99_000,
        report_text: fixture.label,
      };
      const reports: ReportInsert[] = [report];
      if (assigned)
        reports.push({
          ...report,
          id: CORE100_PREVIOUS_REPORT_ID,
          report_date: previousDay,
          total_patients: 4,
          total_revenue: 8000,
          private_revenue: 8000,
        });
      await requireSuccess(
        client.from('daily_reports').upsert(reports, { onConflict: 'id' }),
        'reports'
      );
    }
  }
}
