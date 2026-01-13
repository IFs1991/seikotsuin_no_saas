#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  ADMIN_EMAIL,
  CLINIC_A_ID,
  CLINIC_B_ID,
  FIXTURE_CLINICS,
  FIXTURE_USERS,
  USER_ADMIN_ID,
  STAFF_SHIFT_IDS,
  STAFF_PREFERENCE_IDS,
} from './fixtures.mjs';

function loadEnvFile(fileName) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

['.env.test', '.env.local', '.env'].forEach(loadEnvFile);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase environment variables.');
  console.error(
    'Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const CUSTOMER_IDS = [
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000c002',
  '00000000-0000-0000-0000-00000000c003',
  '00000000-0000-0000-0000-00000000c004',
  '00000000-0000-0000-0000-00000000c005',
];
const MENU_IDS = [
  '00000000-0000-0000-0000-00000000d001',
  '00000000-0000-0000-0000-00000000d002',
];
const RESOURCE_IDS = [
  '00000000-0000-0000-0000-00000000e001',
  '00000000-0000-0000-0000-00000000e002',
  '00000000-0000-0000-0000-00000000e003',
];
const RESERVATION_IDS = [
  '00000000-0000-0000-0000-00000000f001',
  '00000000-0000-0000-0000-00000000f002',
  '00000000-0000-0000-0000-00000000f003',
  '00000000-0000-0000-0000-00000000f004',
  '00000000-0000-0000-0000-00000000f005',
];
const ANALYTICS_RESERVATION_IDS = [
  '00000000-0000-0000-0000-00000000f101',
  '00000000-0000-0000-0000-00000000f102',
  '00000000-0000-0000-0000-00000000f103',
  '00000000-0000-0000-0000-00000000f104',
  '00000000-0000-0000-0000-00000000f105',
  '00000000-0000-0000-0000-00000000f106',
  '00000000-0000-0000-0000-00000000f107',
];
const PATIENT_IDS = [
  '00000000-0000-0000-0000-00000000b101',
  '00000000-0000-0000-0000-00000000b102',
  '00000000-0000-0000-0000-00000000b103',
  '00000000-0000-0000-0000-00000000b201',
  '00000000-0000-0000-0000-00000000b202',
];
const VISIT_IDS = [
  '00000000-0000-0000-0000-00000000a101',
  '00000000-0000-0000-0000-00000000a102',
  '00000000-0000-0000-0000-00000000a103',
  '00000000-0000-0000-0000-00000000a104',
  '00000000-0000-0000-0000-00000000a105',
  '00000000-0000-0000-0000-00000000a106',
  '00000000-0000-0000-0000-00000000a107',
];
const REVENUE_IDS = [
  '00000000-0000-0000-0000-00000000a201',
  '00000000-0000-0000-0000-00000000a202',
  '00000000-0000-0000-0000-00000000a203',
  '00000000-0000-0000-0000-00000000a204',
  '00000000-0000-0000-0000-00000000a205',
  '00000000-0000-0000-0000-00000000a206',
  '00000000-0000-0000-0000-00000000a207',
];
const AI_COMMENT_ID = '00000000-0000-0000-0000-00000000a301';
const SECURITY_EVENT_IDS = [
  '00000000-0000-0000-0000-00000000a401',
  '00000000-0000-0000-0000-00000000a402',
];
const USER_SESSION_ID = '00000000-0000-0000-0000-00000000a501';
const AUDIT_LOG_IDS = [
  '00000000-0000-0000-0000-00000000a601',
  '00000000-0000-0000-0000-00000000a602',
];

function addDays(baseDate, days) {
  const copy = new Date(baseDate);
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function ensureAuthUser(user) {
  const { data, error } = await supabase.auth.admin.getUserById(user.id);
  if (data?.user) {
    const updates = {};
    if (data.user.email !== user.email) {
      updates.email = user.email;
      updates.email_confirm = true;
    }
    if (user.password) {
      // Keep seed accounts loginable by resetting to fixture password.
      updates.password = user.password;
    }
    updates.user_metadata = { full_name: user.full_name };
    updates.app_metadata = {
      user_role: user.role,
      clinic_id: user.permissions_clinic_id ?? user.clinic_id ?? null,
    };
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        updates
      );
      if (updateError) {
        throw new Error(`Failed to update auth user ${user.email}`);
      }
    }
    return;
  }

  if (error && !data?.user) {
    const { error: createError } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
      app_metadata: {
        user_role: user.role,
        clinic_id: user.permissions_clinic_id ?? user.clinic_id ?? null,
      },
    });

    if (createError) {
      throw new Error(`Failed to create auth user ${user.email}`);
    }
  }
}

async function upsertClinics() {
  const { error } = await supabase
    .from('clinics')
    .upsert(FIXTURE_CLINICS, { onConflict: 'id' });
  if (error) {
    throw new Error(`Clinics upsert failed: ${error.message}`);
  }
}

async function upsertProfiles() {
  const profiles = FIXTURE_USERS.map(user => ({
    user_id: user.id,
    clinic_id: user.clinic_id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('profiles')
    .upsert(profiles, { onConflict: 'user_id' });

  if (error) {
    throw new Error(`Profiles upsert failed: ${error.message}`);
  }
}

async function upsertStaff() {
  const staffRows = FIXTURE_USERS.map(user => ({
    id: user.id,
    clinic_id: user.clinic_id,
    name: user.full_name,
    role: user.role,
    email: user.email,
    password_hash: 'managed_by_supabase',
    is_therapist: false,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('staff')
    .upsert(staffRows, { onConflict: 'id' });

  if (error) {
    console.warn(`Staff upsert skipped: ${error.message}`);
  }
}

async function upsertUserPermissions() {
  const permissions = FIXTURE_USERS.filter(
    user => user.permissions_clinic_id !== undefined
  ).map(user => ({
    staff_id: user.id,
    clinic_id: user.permissions_clinic_id,
    role: user.role,
    username: user.email,
    hashed_password: 'managed_by_supabase',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('user_permissions')
    .upsert(permissions, { onConflict: 'staff_id' });

  if (error) {
    throw new Error(`User permissions upsert failed: ${error.message}`);
  }
}

async function seedReservationData() {
  const customers = [
    {
      id: CUSTOMER_IDS[0],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Customer 1',
      phone: '090-0000-0001',
      email: 'e2e-customer1@example.com',
      consent_marketing: true,
      consent_reminder: true,
      created_by: USER_ADMIN_ID,
    },
    {
      id: CUSTOMER_IDS[1],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Customer 2',
      phone: '090-0000-0002',
      email: 'e2e-customer2@example.com',
      consent_marketing: true,
      consent_reminder: false,
      created_by: USER_ADMIN_ID,
    },
    {
      id: CUSTOMER_IDS[2],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Customer 3',
      phone: '090-0000-0003',
      email: 'e2e-customer3@example.com',
      consent_marketing: false,
      consent_reminder: true,
      created_by: USER_ADMIN_ID,
    },
    {
      id: CUSTOMER_IDS[3],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Customer 4',
      phone: '090-0000-0004',
      email: 'e2e-customer4@example.com',
      consent_marketing: false,
      consent_reminder: false,
      created_by: USER_ADMIN_ID,
    },
    {
      id: CUSTOMER_IDS[4],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Customer 5',
      phone: '090-0000-0005',
      email: 'e2e-customer5@example.com',
      consent_marketing: true,
      consent_reminder: true,
      created_by: USER_ADMIN_ID,
    },
  ];

  const menus = [
    {
      id: MENU_IDS[0],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Self Pay 60',
      description: 'E2E self pay menu',
      category: 'self_pay',
      price: 6000,
      duration_minutes: 60,
      insurance_type: 'self_pay',
      is_active: true,
      is_public: true,
      created_by: USER_ADMIN_ID,
    },
    {
      id: MENU_IDS[1],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Insurance 30',
      description: 'E2E insurance menu',
      category: 'insurance',
      price: 1800,
      duration_minutes: 30,
      insurance_type: 'insurance',
      is_active: true,
      is_public: true,
      created_by: USER_ADMIN_ID,
    },
  ];

  const resources = [
    {
      id: RESOURCE_IDS[0],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Staff 1',
      type: 'staff',
      staff_code: 'E2E-ST-01',
      supported_menus: MENU_IDS,
      is_active: true,
      is_bookable: true,
      created_by: USER_ADMIN_ID,
    },
    {
      id: RESOURCE_IDS[1],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Staff 2',
      type: 'staff',
      staff_code: 'E2E-ST-02',
      supported_menus: MENU_IDS,
      is_active: true,
      is_bookable: true,
      created_by: USER_ADMIN_ID,
    },
    {
      id: RESOURCE_IDS[2],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Room 1',
      type: 'room',
      display_order: 1,
      is_active: true,
      is_bookable: true,
      created_by: USER_ADMIN_ID,
    },
  ];

  const now = new Date();
  const todayMorning = new Date(now);
  todayMorning.setHours(9, 0, 0, 0);
  const todayMid = new Date(now);
  todayMid.setHours(11, 0, 0, 0);
  const tomorrowMorning = addDays(todayMorning, 1);
  const nextWeekMorning = addDays(todayMorning, 7);
  const nextWeekAfternoon = addDays(todayMorning, 7);
  nextWeekAfternoon.setHours(14, 0, 0, 0);

  const reservations = [
    {
      id: RESERVATION_IDS[0],
      clinic_id: CLINIC_A_ID,
      customer_id: CUSTOMER_IDS[0],
      menu_id: MENU_IDS[0],
      staff_id: RESOURCE_IDS[0],
      start_time: todayMorning.toISOString(),
      end_time: new Date(todayMorning.getTime() + 60 * 60000).toISOString(),
      status: 'confirmed',
      channel: 'phone',
      price: 6000,
      created_by: USER_ADMIN_ID,
    },
    {
      id: RESERVATION_IDS[1],
      clinic_id: CLINIC_A_ID,
      customer_id: CUSTOMER_IDS[1],
      menu_id: MENU_IDS[1],
      staff_id: RESOURCE_IDS[1],
      start_time: todayMid.toISOString(),
      end_time: new Date(todayMid.getTime() + 30 * 60000).toISOString(),
      status: 'confirmed',
      channel: 'web',
      price: 1800,
      created_by: USER_ADMIN_ID,
    },
    {
      id: RESERVATION_IDS[2],
      clinic_id: CLINIC_A_ID,
      customer_id: CUSTOMER_IDS[2],
      menu_id: MENU_IDS[0],
      staff_id: RESOURCE_IDS[0],
      start_time: tomorrowMorning.toISOString(),
      end_time: new Date(tomorrowMorning.getTime() + 60 * 60000).toISOString(),
      status: 'confirmed',
      channel: 'phone',
      price: 6000,
      created_by: USER_ADMIN_ID,
    },
    {
      id: RESERVATION_IDS[3],
      clinic_id: CLINIC_A_ID,
      customer_id: CUSTOMER_IDS[3],
      menu_id: MENU_IDS[1],
      staff_id: RESOURCE_IDS[1],
      start_time: nextWeekMorning.toISOString(),
      end_time: new Date(nextWeekMorning.getTime() + 30 * 60000).toISOString(),
      status: 'confirmed',
      channel: 'walk_in',
      price: 1800,
      created_by: USER_ADMIN_ID,
    },
    {
      id: RESERVATION_IDS[4],
      clinic_id: CLINIC_A_ID,
      customer_id: CUSTOMER_IDS[4],
      menu_id: MENU_IDS[0],
      staff_id: RESOURCE_IDS[0],
      start_time: nextWeekAfternoon.toISOString(),
      end_time: new Date(nextWeekAfternoon.getTime() + 60 * 60000).toISOString(),
      status: 'confirmed',
      channel: 'line',
      price: 6000,
      created_by: USER_ADMIN_ID,
    },
  ];

  const analyticsReservations = ANALYTICS_RESERVATION_IDS.map(
    (reservationId, index) => {
      const reservationDate = addDays(todayMorning, -index);
      const startTime = new Date(reservationDate);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(startTime.getTime() + 60 * 60000);

      return {
        id: reservationId,
        clinic_id: CLINIC_A_ID,
        customer_id: CUSTOMER_IDS[index % CUSTOMER_IDS.length],
        menu_id: MENU_IDS[index % MENU_IDS.length],
        staff_id: RESOURCE_IDS[index % 2],
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'completed',
        channel: 'web',
        price: 6000 + index * 200,
        created_by: USER_ADMIN_ID,
      };
    }
  );

  const { error: customerError } = await supabase
    .from('customers')
    .upsert(customers, { onConflict: 'id' });
  if (customerError) {
    throw new Error(`Customers upsert failed: ${customerError.message}`);
  }

  const { error: menuError } = await supabase
    .from('menus')
    .upsert(menus, { onConflict: 'id' });
  if (menuError) {
    throw new Error(`Menus upsert failed: ${menuError.message}`);
  }

  const { error: resourceError } = await supabase
    .from('resources')
    .upsert(resources, { onConflict: 'id' });
  if (resourceError) {
    throw new Error(`Resources upsert failed: ${resourceError.message}`);
  }

  const { error: reservationError } = await supabase
    .from('reservations')
    .upsert([...reservations, ...analyticsReservations], { onConflict: 'id' });
  if (reservationError) {
    throw new Error(`Reservations upsert failed: ${reservationError.message}`);
  }
}

async function seedAnalyticsData() {
  const today = new Date();
  const todayDate = today.toISOString().split('T')[0];

  const patients = [
    {
      id: PATIENT_IDS[0],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Patient A1',
      gender: 'male',
      registration_date: todayDate,
      phone_number: '080-0000-0001',
    },
    {
      id: PATIENT_IDS[1],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Patient A2',
      gender: 'female',
      registration_date: todayDate,
      phone_number: '080-0000-0002',
    },
    {
      id: PATIENT_IDS[2],
      clinic_id: CLINIC_A_ID,
      name: 'E2E Patient A3',
      gender: 'other',
      registration_date: todayDate,
      phone_number: '080-0000-0003',
    },
    {
      id: PATIENT_IDS[3],
      clinic_id: CLINIC_B_ID,
      name: 'E2E Patient B1',
      gender: 'male',
      registration_date: todayDate,
      phone_number: '080-0000-0101',
    },
    {
      id: PATIENT_IDS[4],
      clinic_id: CLINIC_B_ID,
      name: 'E2E Patient B2',
      gender: 'female',
      registration_date: todayDate,
      phone_number: '080-0000-0102',
    },
  ];

  const { error: patientError } = await supabase
    .from('patients')
    .upsert(patients, { onConflict: 'id' });
  if (patientError) {
    throw new Error(`Patients upsert failed: ${patientError.message}`);
  }

  const visits = [];
  const revenues = [];
  for (let i = 0; i < 7; i += 1) {
    const visitDate = addDays(today, -i);
    const visitStart = new Date(visitDate);
    visitStart.setHours(10, 0, 0, 0);
    const revenueDate = visitDate.toISOString().split('T')[0];

    visits.push({
      id: VISIT_IDS[i],
      clinic_id: CLINIC_A_ID,
      patient_id: PATIENT_IDS[i % 3],
      visit_date: visitStart.toISOString(),
      therapist_id: null,
      notes: 'E2E visit',
    });

    revenues.push({
      id: REVENUE_IDS[i],
      visit_id: VISIT_IDS[i],
      clinic_id: CLINIC_A_ID,
      patient_id: PATIENT_IDS[i % 3],
      revenue_date: revenueDate,
      amount: 5000 + i * 500,
      insurance_revenue: 2000,
      private_revenue: 3000 + i * 500,
    });
  }

  const { error: visitError } = await supabase
    .from('visits')
    .upsert(visits, { onConflict: 'id' });
  if (visitError) {
    throw new Error(`Visits upsert failed: ${visitError.message}`);
  }

  const { error: revenueError } = await supabase
    .from('revenues')
    .upsert(revenues, { onConflict: 'id' });
  if (revenueError) {
    throw new Error(`Revenues upsert failed: ${revenueError.message}`);
  }

  const aiComment = {
    id: AI_COMMENT_ID,
    clinic_id: CLINIC_A_ID,
    comment_date: todayDate,
    summary: 'E2E summary',
    good_points: ['E2E good points'],
    improvement_points: ['E2E improvements'],
    recommendations: ['E2E suggestion'],
  };

  const upsertAiComment = async payload => {
    const { error } = await supabase
      .from('ai_comments')
      .upsert([payload], { onConflict: 'id' });
    return error;
  };

  const toText = value =>
    Array.isArray(value) ? value.filter(Boolean).join('\n') : value;
  const toArrayLiteral = value => {
    if (!Array.isArray(value)) return value;
    const escaped = value.map(entry =>
      `"${String(entry).replace(/"/g, '\"')}"`
    );
    return `{${escaped.join(',')}}`;
  };

  const aiCommentFallback = {
    ...aiComment,
    good_points: toText(aiComment.good_points),
    improvement_points: toText(aiComment.improvement_points),
    recommendations: toText(aiComment.recommendations),
  };
  const aiCommentArrayLiteral = {
    ...aiComment,
    good_points: toArrayLiteral(aiComment.good_points),
    improvement_points: toArrayLiteral(aiComment.improvement_points),
    recommendations: toArrayLiteral(aiComment.recommendations),
  };
  const dropSuggestion = ({ suggestion_for_tomorrow, ...rest }) => rest;
  const aiCommentLegacy = {
    id: AI_COMMENT_ID,
    clinic_id: CLINIC_A_ID,
    comment_date: todayDate,
    summary: 'E2E summary',
    good_points: toText(aiComment.good_points),
    improvement_points: toText(aiComment.improvement_points),
    suggestion_for_tomorrow: 'E2E suggestion',
  };
  const aiCommentLegacyNoSuggestion = dropSuggestion(aiCommentLegacy);

  const attempts = [
    aiComment,
    aiCommentArrayLiteral,
    aiCommentFallback,
    aiCommentLegacy,
    aiCommentLegacyNoSuggestion,
  ];

  let aiError;
  for (const payload of attempts) {
    const error = await upsertAiComment(payload);
    if (!error) {
      aiError = undefined;
      break;
    }

    aiError = error;
    const message = error.message || '';
    const isSchemaMismatch =
      /malformed array literal|text\[\]|array|does not exist|schema cache/i.test(
        message
      );
    if (!isSchemaMismatch) {
      break;
    }
  }

  if (aiError) {
    console.warn(`AI comments upsert skipped: ${aiError.message}`);
  }
}

async function seedSecurityData() {
  const nowIso = new Date().toISOString();

  const { error: sessionError } = await supabase
    .from('user_sessions')
    .upsert(
      [
        {
          id: USER_SESSION_ID,
          user_id: USER_ADMIN_ID,
          clinic_id: CLINIC_A_ID,
          session_token: 'e2e-session-admin',
          device_info: { device: 'desktop', os: 'Windows', browser: 'Chrome' },
          ip_address: '127.0.0.1',
          user_agent: 'E2E Agent',
          created_at: nowIso,
          last_activity: nowIso,
          expires_at: addDays(new Date(), 1).toISOString(),
          is_active: true,
          is_revoked: false,
          max_idle_minutes: 30,
          max_session_hours: 8,
          remember_device: false,
        },
      ],
      { onConflict: 'id' }
    );
  if (sessionError) {
    throw new Error(`User sessions upsert failed: ${sessionError.message}`);
  }

  const { error: securityError } = await supabase
    .from('security_events')
    .upsert(
      [
        {
          id: SECURITY_EVENT_IDS[0],
          user_id: USER_ADMIN_ID,
          clinic_id: CLINIC_A_ID,
          session_id: USER_SESSION_ID,
          event_type: 'failed_login',
          event_category: 'authentication',
          severity_level: 'critical',
          event_description: 'E2E failed login',
          event_data: { reason: 'invalid_password' },
          ip_address: '127.0.0.1',
          user_agent: 'E2E Agent',
          created_at: nowIso,
          source_component: 'auth_system',
        },
        {
          id: SECURITY_EVENT_IDS[1],
          user_id: USER_ADMIN_ID,
          clinic_id: CLINIC_A_ID,
          session_id: USER_SESSION_ID,
          event_type: 'unauthorized_access',
          event_category: 'authorization',
          severity_level: 'warning',
          event_description: 'E2E unauthorized access',
          event_data: { resource: 'admin' },
          ip_address: '127.0.0.1',
          user_agent: 'E2E Agent',
          created_at: nowIso,
          source_component: 'middleware',
        },
      ],
      { onConflict: 'id' }
    );

  if (securityError) {
    throw new Error(`Security events upsert failed: ${securityError.message}`);
  }

  const { error: auditError } = await supabase
    .from('audit_logs')
    .upsert(
      [
        {
          id: AUDIT_LOG_IDS[0],
          event_type: 'failed_login',
          user_id: USER_ADMIN_ID,
          user_email: ADMIN_EMAIL,
          clinic_id: CLINIC_A_ID,
          ip_address: '127.0.0.1',
          user_agent: 'E2E Agent',
          success: false,
          error_message: 'E2E invalid password',
          created_at: nowIso,
        },
        {
          id: AUDIT_LOG_IDS[1],
          event_type: 'unauthorized_access',
          user_id: USER_ADMIN_ID,
          user_email: ADMIN_EMAIL,
          clinic_id: CLINIC_A_ID,
          ip_address: '127.0.0.1',
          user_agent: 'E2E Agent',
          success: false,
          error_message: 'E2E forbidden',
          created_at: nowIso,
        },
      ],
      { onConflict: 'id' }
    );

  if (auditError) {
    throw new Error(`Audit logs upsert failed: ${auditError.message}`);
  }
}

async function seedShiftData() {
  const now = new Date();
  const shifts = [];

  // 7日分のシフトデータを作成
  for (let i = 0; i < 7; i++) {
    const shiftDate = addDays(now, i);
    const startTime = new Date(shiftDate);
    startTime.setHours(9, 0, 0, 0);
    const endTime = new Date(shiftDate);
    endTime.setHours(18, 0, 0, 0);

    shifts.push({
      id: STAFF_SHIFT_IDS[i],
      clinic_id: CLINIC_A_ID,
      staff_id: RESOURCE_IDS[i % 2], // 2人のスタッフで交互に
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: i < 3 ? 'confirmed' : 'proposed',
      notes: `E2E シフト ${i + 1}日目`,
      created_by: USER_ADMIN_ID,
    });
  }

  const { error: shiftError } = await supabase
    .from('staff_shifts')
    .upsert(shifts, { onConflict: 'id' });

  if (shiftError) {
    console.warn(`Staff shifts upsert skipped: ${shiftError.message}`);
  }

  // スタッフ希望データを作成
  const preferences = [
    {
      id: STAFF_PREFERENCE_IDS[0],
      clinic_id: CLINIC_A_ID,
      staff_id: RESOURCE_IDS[0],
      preference_text: '週末の勤務を希望します',
      preference_type: 'shift_pattern',
      priority: 3,
      is_active: true,
    },
    {
      id: STAFF_PREFERENCE_IDS[1],
      clinic_id: CLINIC_A_ID,
      staff_id: RESOURCE_IDS[1],
      preference_text: '午前中の勤務を希望します',
      preference_type: 'time_preference',
      priority: 2,
      is_active: true,
    },
  ];

  const { error: prefError } = await supabase
    .from('staff_preferences')
    .upsert(preferences, { onConflict: 'id' });

  if (prefError) {
    console.warn(`Staff preferences upsert skipped: ${prefError.message}`);
  }
}

export async function seedE2EData() {
  const { error: clinicSettingsError } = await supabase
    .from('clinic_settings')
    .delete()
    .in('clinic_id', [CLINIC_A_ID, CLINIC_B_ID]);
  if (clinicSettingsError) {
    console.warn(`clinic_settings cleanup warning: ${clinicSettingsError.message}`);
  }

  await upsertClinics();
  for (const user of FIXTURE_USERS) {
    await ensureAuthUser(user);
  }
  await upsertProfiles();
  await upsertStaff();
  await upsertUserPermissions();
  await seedReservationData();
  await seedAnalyticsData();
  await seedSecurityData();
  await seedShiftData();
  console.log('E2E seed data ready.');
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  seedE2EData().catch(error => {
    console.error('Failed to seed E2E data.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
