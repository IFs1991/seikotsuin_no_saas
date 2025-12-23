#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables.');
  console.error(
    '   Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkConnection() {
  const results = [];

  try {
    // 1. Ping database metadata
    const { data: schemaData, error: schemaError } = await supabase
      .from('clinics')
      .select('id, name')
      .limit(1);

    if (schemaError)
      throw new Error(`clinics table query failed: ${schemaError.message}`);
    results.push('✅ clinics table reachable');

    // 2. Verify KPI views
    const { data: kpiData, error: kpiError } = await supabase
      .from('mv_monthly_kpi_summary')
      .select('clinic_id, kpi_month, gross_revenue')
      .limit(1);

    if (kpiError)
      throw new Error(
        `mv_monthly_kpi_summary query failed: ${kpiError.message}`
      );
    results.push('✅ mv_monthly_kpi_summary view reachable');

    // 3. Verify compatibility views
    const { data: dashboardData, error: dashboardError } = await supabase
      .from('daily_revenue_summary')
      .select('clinic_id, revenue_date, total_revenue')
      .limit(1);

    if (dashboardError)
      throw new Error(
        `daily_revenue_summary view failed: ${dashboardError.message}`
      );
    results.push('✅ daily_revenue_summary view reachable');

    const { data: visitsData, error: visitsError } = await supabase
      .from('visits')
      .select('clinic_id, visit_date')
      .limit(1);

    if (visitsError)
      throw new Error(`visits view failed: ${visitsError.message}`);
    results.push('✅ visits view reachable');

    // 4. RPC check
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_hourly_visit_pattern',
      {
        clinic_uuid: schemaData?.[0]?.id ?? null,
      }
    );

    if (rpcError && rpcError.code !== 'PGRST116') {
      throw new Error(
        `get_hourly_visit_pattern RPC failed: ${rpcError.message}`
      );
    }
    results.push('✅ get_hourly_visit_pattern RPC callable');

    console.log('--- Supabase verification summary ---');
    results.forEach(line => console.log(line));

    if (!schemaData?.length) {
      console.warn(
        '⚠️ clinics table returned no rows. Seed data may be missing.'
      );
    }

    if (!kpiData?.length) {
      console.warn(
        '⚠️ mv_monthly_kpi_summary returned no rows. Run seeds or refresh materialized views.'
      );
    }

    if (!dashboardData?.length) {
      console.warn('⚠️ daily_revenue_summary returned no rows.');
    }

    if (!visitsData?.length) {
      console.warn('⚠️ visits view returned no rows.');
    }

    if (!rpcData?.length) {
      console.warn('⚠️ get_hourly_visit_pattern RPC returned empty result.');
    }

    console.log('✅ Supabase connectivity checks completed.');
  } catch (error) {
    console.error('❌ Supabase verification failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

checkConnection();
