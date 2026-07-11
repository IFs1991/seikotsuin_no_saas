#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening'
);
const SOURCE = path.join(EVIDENCE_DIR, 'tables-before.csv');
const OUTPUT = path.join(EVIDENCE_DIR, 'table-classification-draft.csv');

const CLASS_CANDIDATES = new Map([
  [
    'A_TENANT_CANONICAL',
    new Set([
      'clinics',
      'profiles',
      'user_permissions',
      'staff',
      'manager_clinic_assignments',
      'customers',
      'menus',
      'resources',
      'reservations',
      'blocks',
      'care_episodes',
      'customer_insurance_coverages',
      'menu_billing_profiles',
      'daily_reports',
      'daily_report_items',
      'daily_report_item_tags',
      'reservation_history',
      'reservation_notifications',
      'staff_preferences',
      'staff_shifts',
      'shift_requests',
      'patient_outreach_campaigns',
      'patient_outreach_recipients',
      'calendar_feed_tokens',
    ]),
  ],
  [
    'B_SERVICE_ROLE_ONLY',
    new Set([
      'clinic_line_credentials',
      'encryption_keys',
      'internal_job_runs',
      'line_message_outbox',
      'email_outbox',
      'email_delivery_logs',
    ]),
  ],
  [
    'C_SHARED_MASTER_READ_ONLY',
    new Set([
      'master_categories',
      'master_patient_types',
      'master_payment_methods',
      'menu_categories',
    ]),
  ],
  [
    'E_LEGACY_QUARANTINE',
    new Set([
      'appointments',
      'visits',
      'revenues',
      'treatments',
      'treatment_menu_records',
    ]),
  ],
]);
const PUBLIC_SURFACE_CANDIDATES = new Set([
  'clinics',
  'menus',
  'resources',
  'staff_invites',
]);

function parseArgs(argv) {
  if (argv.length !== 1 || !['--write', '--check'].includes(argv[0])) {
    throw new Error('Usage: generate-table-classification.mjs --write|--check');
  }
  return argv[0].slice(2);
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted && character === '"' && content[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (character === '\n' && !quoted) {
      row.push(value.replace(/\r$/, ''));
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  return rows;
}

function csvValue(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

function candidateClass(tableName) {
  for (const [candidate, tables] of CLASS_CANDIDATES) {
    if (tables.has(tableName)) return candidate;
  }
  return 'UNKNOWN';
}

const mode = parseArgs(process.argv.slice(2));
const [headers, ...sourceRows] = parseCsv(readFileSync(SOURCE, 'utf8'));
const headerIndex = new Map(headers.map((header, index) => [header, index]));
const outputHeaders = [
  'table_name',
  'candidate_class',
  'status',
  'reason',
  'clinic_id_contract',
  'public_surface_candidate',
  'owner_decision_required',
];
const outputRows = sourceRows
  .filter(row => row[headerIndex.get('schema')] === 'public')
  .map(row => {
    const tableName = row[headerIndex.get('table_name')];
    const candidate = candidateClass(tableName);
    const hasClinicId = row[headerIndex.get('has_clinic_id')] === 'true';
    const nullable = row[headerIndex.get('clinic_id_nullable')];
    const legacy = candidate === 'E_LEGACY_QUARANTINE';
    const unknown = candidate === 'UNKNOWN';
    return [
      tableName,
      candidate,
      unknown ? 'BLOCK_UNCLASSIFIED' : 'DRAFT_SPEC_CANDIDATE',
      unknown
        ? 'Not explicitly classified by spec section 6'
        : 'Spec section ' +
          (candidate.startsWith('A_')
            ? '6.1'
            : candidate.startsWith('B_')
              ? '6.2'
              : candidate.startsWith('C_')
                ? '6.3'
                : '6.5') +
          ' candidate',
      hasClinicId ? 'clinic_id ' + nullable.replace('YES', 'NULLABLE').replace('NO', 'NOT NULL') : 'NO clinic_id',
      String(PUBLIC_SURFACE_CANDIDATES.has(tableName)),
      unknown
        ? 'classification owner required'
        : legacy
          ? 'retention/quarantine owner decision'
          : '',
    ];
  })
  .sort((left, right) => left[0].localeCompare(right[0]));
const output =
  [outputHeaders, ...outputRows]
    .map(row => row.map(csvValue).join(','))
    .join('\n') + '\n';

if (mode === 'check') {
  if (readFileSync(OUTPUT, 'utf8') !== output) {
    console.error('Table classification draft drift: ' + path.relative(REPO_ROOT, OUTPUT));
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUTPUT, output, 'utf8');
  console.log('Wrote ' + path.relative(REPO_ROOT, OUTPUT));
}
