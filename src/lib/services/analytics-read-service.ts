/**
 * AnalyticsReadService
 *
 * Shared service for reading from analytics summary tables:
 * - daily_revenue_summary
 * - staff_performance_summary
 * - patient_visit_summary
 *
 * Centralizes the query patterns that were previously duplicated across
 * ai-insights, clinic/analysis, admin/tenants, and other routes.
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-07)
 */

import type { SupabaseServerClient } from '@/lib/supabase/server';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface DateRange {
  startDate: string;
  endDate?: string;
}

export interface StaffPerformanceOptions {
  columns?: string;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
}

export interface PatientVisitOptions {
  columns?: string;
  dateFilter?: DateRange;
}

export interface ClinicKPI {
  revenue: number;
  patients: number;
  staff_performance_score: number | null;
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class AnalyticsReadService {
  constructor(private readonly client: SupabaseServerClient) {}

  /**
   * Fetch daily revenue summary for a single clinic.
   * Optionally filter by date range.
   */
  async fetchDailyRevenue(
    clinicId: string,
    dateRange?: DateRange
  ): Promise<unknown[]> {
    let query = this.client
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', clinicId);

    if (dateRange?.startDate) {
      query = query.gte('revenue_date', dateRange.startDate);
    }
    if (dateRange?.endDate) {
      query = query.lte('revenue_date', dateRange.endDate);
    }

    query = query.order('revenue_date', { ascending: true });

    const { data, error } = await query;
    if (error) {
      throw new Error(`daily_revenue_summary query failed: ${error.message}`);
    }
    return data ?? [];
  }

  /**
   * Fetch staff performance summary for a single clinic.
   */
  async fetchStaffPerformance(
    clinicId: string,
    options?: StaffPerformanceOptions
  ): Promise<unknown[]> {
    const cols = options?.columns ?? '*';
    let query = this.client
      .from('staff_performance_summary')
      .select(cols)
      .eq('clinic_id', clinicId);

    if (options?.orderBy) {
      query = query.order(options.orderBy, {
        ascending: options.ascending ?? false,
      });
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `staff_performance_summary query failed: ${error.message}`
      );
    }
    return data ?? [];
  }

  /**
   * Fetch patient visit summary for a single clinic.
   */
  async fetchPatientVisitSummary(
    clinicId: string,
    options?: PatientVisitOptions
  ): Promise<unknown[]> {
    const cols = options?.columns ?? '*';
    let query = this.client
      .from('patient_visit_summary')
      .select(cols)
      .eq('clinic_id', clinicId);

    if (options?.dateFilter?.startDate) {
      const start = options.dateFilter.startDate;
      query = query.or(
        `first_visit_date.gte.${start},last_visit_date.gte.${start}`
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `patient_visit_summary query failed: ${error.message}`
      );
    }
    return data ?? [];
  }

  /**
   * Fetch and aggregate KPI data across multiple clinics.
   * Used by admin/tenants for multi-store overview.
   */
  async fetchMultiClinicKPI(
    clinicIds: string[]
  ): Promise<Map<string, ClinicKPI>> {
    const kpiMap = new Map<string, ClinicKPI>();

    // Initialize defaults
    clinicIds.forEach(id => {
      kpiMap.set(id, { revenue: 0, patients: 0, staff_performance_score: null });
    });

    // Revenue aggregation
    const { data: revenueData } = await this.client
      .from('daily_revenue_summary')
      .select('clinic_id, total_revenue');

    if (revenueData) {
      const revenueByClinic = new Map<string, number>();
      (revenueData as { clinic_id: string; total_revenue: number }[]).forEach(
        row => {
          const current = revenueByClinic.get(row.clinic_id) ?? 0;
          revenueByClinic.set(row.clinic_id, current + Number(row.total_revenue));
        }
      );
      revenueByClinic.forEach((total, clinicId) => {
        const kpi = kpiMap.get(clinicId);
        if (kpi) kpi.revenue = total;
      });
    }

    // Patient count aggregation
    const { data: patientData } = await this.client
      .from('patient_visit_summary')
      .select('clinic_id, patient_id');

    if (patientData) {
      const patientsByClinic = new Map<string, Set<string>>();
      (patientData as { clinic_id: string; patient_id: string }[]).forEach(
        row => {
          if (!patientsByClinic.has(row.clinic_id)) {
            patientsByClinic.set(row.clinic_id, new Set());
          }
          patientsByClinic.get(row.clinic_id)!.add(row.patient_id);
        }
      );
      patientsByClinic.forEach((patients, clinicId) => {
        const kpi = kpiMap.get(clinicId);
        if (kpi) kpi.patients = patients.size;
      });
    }

    // Staff performance aggregation
    const { data: staffData } = await this.client
      .from('staff_performance_summary')
      .select('clinic_id, total_revenue_generated, total_visits');

    if (staffData) {
      const perfByClinic = new Map<
        string,
        { totalRevenue: number; count: number }
      >();
      (
        staffData as {
          clinic_id: string;
          total_revenue_generated: number;
          total_visits: number;
        }[]
      ).forEach(row => {
        if (!perfByClinic.has(row.clinic_id)) {
          perfByClinic.set(row.clinic_id, { totalRevenue: 0, count: 0 });
        }
        const stats = perfByClinic.get(row.clinic_id)!;
        stats.totalRevenue += Number(row.total_revenue_generated);
        stats.count += 1;
      });
      perfByClinic.forEach((stats, clinicId) => {
        const kpi = kpiMap.get(clinicId);
        if (kpi && stats.count > 0) {
          const avgRevenuePerStaff = stats.totalRevenue / stats.count;
          kpi.staff_performance_score = Math.min(
            5,
            Math.round((avgRevenuePerStaff / 100000) * 10) / 10
          );
        }
      });
    }

    return kpiMap;
  }
}
