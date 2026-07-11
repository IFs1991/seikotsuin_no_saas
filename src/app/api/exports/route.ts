import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import { createCsv, type CsvColumn } from '@/lib/csv-export';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError } from '@/lib/route-helpers';
import {
  createScopedAdminContext,
  type SupabaseServerClient,
} from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import { clinicExportQuerySchema, type ClinicExportResource } from './schema';

const PATH = '/api/exports';
const CLINIC_EXPORT_ROLES = ['admin', 'clinic_admin'] as const;
const UTF8_BOM = '\uFEFF';

type CustomerExportRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'phone' | 'email' | 'created_at' | 'updated_at'
>;

type ReservationExportRow = Pick<
  Database['public']['Tables']['reservations']['Row'],
  | 'id'
  | 'customer_id'
  | 'staff_id'
  | 'menu_id'
  | 'start_time'
  | 'end_time'
  | 'status'
  | 'channel'
  | 'price'
  | 'actual_price'
  | 'payment_status'
  | 'created_at'
>;

type DailyReportExportRow = Pick<
  Database['public']['Tables']['daily_reports']['Row'],
  | 'id'
  | 'report_date'
  | 'total_revenue'
  | 'insurance_revenue'
  | 'private_revenue'
  | 'total_patients'
  | 'new_patients'
  | 'created_at'
>;

type ClinicExportResult = {
  csv: string;
  recordCount: number;
};

const CUSTOMER_COLUMNS: readonly CsvColumn<CustomerExportRow>[] = [
  { header: 'id', value: row => row.id },
  { header: 'name', value: row => row.name },
  { header: 'phone', value: row => row.phone },
  { header: 'email', value: row => row.email },
  { header: 'created_at', value: row => row.created_at },
  { header: 'updated_at', value: row => row.updated_at },
];

const RESERVATION_COLUMNS: readonly CsvColumn<ReservationExportRow>[] = [
  { header: 'id', value: row => row.id },
  { header: 'customer_id', value: row => row.customer_id },
  { header: 'staff_id', value: row => row.staff_id },
  { header: 'menu_id', value: row => row.menu_id },
  { header: 'start_time', value: row => row.start_time },
  { header: 'end_time', value: row => row.end_time },
  { header: 'status', value: row => row.status },
  { header: 'channel', value: row => row.channel },
  { header: 'price', value: row => row.price },
  { header: 'actual_price', value: row => row.actual_price },
  { header: 'payment_status', value: row => row.payment_status },
  { header: 'created_at', value: row => row.created_at },
];

const DAILY_REPORT_COLUMNS: readonly CsvColumn<DailyReportExportRow>[] = [
  { header: 'id', value: row => row.id },
  { header: 'report_date', value: row => row.report_date },
  { header: 'total_revenue', value: row => row.total_revenue },
  { header: 'insurance_revenue', value: row => row.insurance_revenue },
  { header: 'private_revenue', value: row => row.private_revenue },
  { header: 'total_patients', value: row => row.total_patients },
  { header: 'new_patients', value: row => row.new_patients },
  { header: 'created_at', value: row => row.created_at },
];

async function exportCustomers(
  client: SupabaseServerClient,
  clinicId: string,
  limit: number
): Promise<ClinicExportResult> {
  const { data, error } = await client
    .from('customers')
    .select('id, name, phone, email, created_at, updated_at')
    .eq('clinic_id', clinicId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
    .returns<CustomerExportRow[]>();

  if (error) throw normalizeSupabaseError(error, PATH);
  const rows = data ?? [];
  return { csv: createCsv(rows, CUSTOMER_COLUMNS), recordCount: rows.length };
}

async function exportReservations(
  client: SupabaseServerClient,
  clinicId: string,
  limit: number
): Promise<ClinicExportResult> {
  const { data, error } = await client
    .from('reservations')
    .select(
      'id, customer_id, staff_id, menu_id, start_time, end_time, status, channel, price, actual_price, payment_status, created_at'
    )
    .eq('clinic_id', clinicId)
    .eq('is_deleted', false)
    .order('start_time', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
    .returns<ReservationExportRow[]>();

  if (error) throw normalizeSupabaseError(error, PATH);
  const rows = data ?? [];
  return {
    csv: createCsv(rows, RESERVATION_COLUMNS),
    recordCount: rows.length,
  };
}

async function exportDailyReports(
  client: SupabaseServerClient,
  clinicId: string,
  limit: number
): Promise<ClinicExportResult> {
  const { data, error } = await client
    .from('daily_reports')
    .select(
      'id, report_date, total_revenue, insurance_revenue, private_revenue, total_patients, new_patients, created_at'
    )
    .eq('clinic_id', clinicId)
    .order('report_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
    .returns<DailyReportExportRow[]>();

  if (error) throw normalizeSupabaseError(error, PATH);
  const rows = data ?? [];
  return {
    csv: createCsv(rows, DAILY_REPORT_COLUMNS),
    recordCount: rows.length,
  };
}

async function createClinicExport(
  client: SupabaseServerClient,
  resource: ClinicExportResource,
  clinicId: string,
  limit: number
): Promise<ClinicExportResult> {
  switch (resource) {
    case 'customers':
      return exportCustomers(client, clinicId, limit);
    case 'reservations':
      return exportReservations(client, clinicId, limit);
    case 'daily_reports':
      return exportDailyReports(client, clinicId, limit);
  }
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = clinicExportQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id: clinicId, resource, limit } = parsedQuery.data;
    const guard = await processApiRequest(request, {
      clinicId,
      requireClinicMatch: true,
      allowedRoles: CLINIC_EXPORT_ROLES,
    });
    if (!guard.success) return guard.error;

    // service_role client is only created after user, role and tenant scope validation.
    const scopedAdmin = createScopedAdminContext(guard.permissions);
    scopedAdmin.assertClinicInScope(clinicId);
    const result = await createClinicExport(
      scopedAdmin.client,
      resource,
      clinicId,
      limit
    );

    const { ipAddress } = getRequestInfo(request);
    await AuditLogger.logDataExport(
      guard.auth.id,
      guard.auth.email,
      `clinic_${resource}_csv`,
      result.recordCount,
      clinicId,
      ipAddress
    );

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(`${UTF8_BOM}${result.csv}`, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="clinic-${resource}-${date}.csv"`,
        'Content-Type': 'text/csv; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
