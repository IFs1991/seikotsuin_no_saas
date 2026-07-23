#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTextForSensitiveData } from './scan-pr12-evidence.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const CURRENT_GATE_PATH = path.join(
  REPO_ROOT,
  'docs/releases/current-gate-status.yaml'
);
const FROZEN_PERFORMANCE_CONTRACT_PATH = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json'
);
const COMM_GATE_EVIDENCE_MAP_PATH = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening/pr12/comm-gate-evidence-map-v1.json'
);
const STAGING_EXECUTION_GOVERNANCE_PATH = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml'
);
const BASE_COMMIT = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';
const MIGRATION_HEAD = '20260718011731';
const SUPABASE_CLI_ARCHIVE_SHA256 =
  'd2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b';
const SUPABASE_CLI_EXECUTABLE_SHA256 =
  '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118';
const PSQL_MAJOR = 17;
const CANONICAL_LEDGER_COMMAND_IDS = [
  'PR12-CMD-000',
  'PR12-CMD-000A',
  'PR12-CMD-001',
  'PR12-CMD-002',
  'PR12-CMD-004A',
  'PR12-CMD-003',
  'PR12-CMD-004',
  'PR12-CMD-005',
  'PR12-CMD-006',
  'PR12-CMD-007',
  'PR12-CMD-007A',
  'PR12-CMD-008A',
  'PR12-CMD-008B',
  'PR12-CMD-008',
  'PR12-CMD-009',
  'PR12-CMD-010',
  'PR12-CMD-011',
  'PR12-CMD-012',
  'PR12-CMD-013',
  'PR12-CMD-014',
  'PR12-CMD-015',
  'PR12-CMD-016',
  'PR12-CMD-017',
  'PR12-CMD-016A',
  'PR12-CMD-017A',
  'PR12-CMD-017B',
  'PR12-ACTION-017',
  'PR12-CMD-018',
  'PR12-CMD-019',
  'PR12-CMD-019S',
  'PR12-CMD-019D',
  'PR12-CMD-019G',
  'PR12-CMD-019A',
  'PR12-CMD-019F',
  'PR12-CMD-020',
];
const TOOL_EVIDENCE_COMMAND_IDS = [
  'capture-node-version',
  'capture-supabase-version',
  'capture-psql-version',
  'hash-supabase-binary',
  'hash-supabase-archive',
  'hash-psql-binary',
];
const SOURCE_PLATFORM_RAW_ENVELOPE_KEYS = [
  'schemaVersion',
  'resultType',
  'status',
  'observationFamily',
  'transport',
  'commandId',
  'projectRef',
  'observedAt',
  'secretValuesCaptured',
  'requestOrQuery',
  'providerPayload',
];
const SOURCE_PLATFORM_REQUEST_KEYS = [
  'method',
  'endpointOrQueryId',
  'requestOrQuerySha256',
  'responseStatus',
];
const SOURCE_PLATFORM_TRANSPORTS = {
  DATA_API:
    'SUPABASE_MANAGEMENT_API_POSTGREST_CONFIGURATION_AND_DIRECT_POSTGRES_DEFAULT_ACL',
  AUTH: 'SUPABASE_MANAGEMENT_API_AUTH_CONFIGURATION',
  GRAPHQL: 'SUPABASE_MANAGEMENT_API_AND_DIRECT_POSTGRES_GRAPHQL_CONFIGURATION',
};
const DATA_API_DEFAULT_PRIVILEGE_QUERY =
  "with owners(owner_role, owner_oid, owner_order) as (select v.owner_role, r.oid, v.owner_order from (values ('postgres', 1), ('supabase_admin', 2)) v(owner_role, owner_order) join pg_roles r on r.rolname = v.owner_role), scopes(scope_name, namespace_oid, scope_order) as (values ('GLOBAL_OR_HARDWIRED', 0::oid, 1), ('PUBLIC_SCHEMA_ADDITIONAL', 'public'::regnamespace::oid, 2)), objects(object_type, object_order) as (values ('r'::\"char\", 1), ('S'::\"char\", 2), ('f'::\"char\", 3)), api_roles(api_role, grantee_oid, role_order) as (select v.api_role, case when v.api_role = 'PUBLIC' then 0::oid else r.oid end, v.role_order from (values ('PUBLIC', 1), ('anon', 2), ('authenticated', 3), ('service_role', 4)) v(api_role, role_order) left join pg_roles r on r.rolname = v.api_role) select o.owner_role, s.scope_name as scope, obj.object_type::text as object_type, a.api_role, coalesce((select array_agg(distinct x.privilege_type order by x.privilege_type) from aclexplode(case when s.namespace_oid = 0 then coalesce((select d.defaclacl from pg_default_acl d where d.defaclrole = o.owner_oid and d.defaclnamespace = 0 and d.defaclobjtype = obj.object_type), acldefault(obj.object_type, o.owner_oid)) else coalesce((select d.defaclacl from pg_default_acl d where d.defaclrole = o.owner_oid and d.defaclnamespace = s.namespace_oid and d.defaclobjtype = obj.object_type), array[]::aclitem[]) end) x where x.grantee = a.grantee_oid), array[]::text[]) as privileges from owners o cross join scopes s cross join objects obj cross join api_roles a order by o.owner_order, s.scope_order, obj.object_order, a.role_order;";
const DATA_API_DEFAULT_PRIVILEGE_QUERY_ID =
  'PR12-DATA-API-DEFAULT-PRIVILEGES-V2';
const DATA_API_DEFAULT_PRIVILEGE_OWNERS = ['postgres', 'supabase_admin'];
const DATA_API_DEFAULT_PRIVILEGE_OBJECT_TYPES = ['r', 'S', 'f'];
const DATA_API_DEFAULT_PRIVILEGE_SCOPES = [
  'GLOBAL_OR_HARDWIRED',
  'PUBLIC_SCHEMA_ADDITIONAL',
];
const DATA_API_DEFAULT_PRIVILEGE_ROLES = [
  'PUBLIC',
  'anon',
  'authenticated',
  'service_role',
];
const DATA_API_DIRECT_REST_SMOKE_QUERY = 'GET /rest/v1/';
const GRAPHQL_EXTENSION_QUERY =
  "select 'pg_graphql'::text as extension_name, (select default_version from pg_catalog.pg_available_extensions where name = 'pg_graphql') as available_version, (select extversion from pg_catalog.pg_extension where extname = 'pg_graphql') as installed_version;";
const GRAPHQL_EXPOSURE_QUERY =
  "select current_setting('pgrst.db_schemas', true) as db_schema, current_setting('pgrst.db_extra_search_path', true) as db_extra_search_path;";
const GRAPHQL_ENDPOINT_PROBE_QUERY = 'query PR12EndpointProbe { __typename }';
const GRAPHQL_INTROSPECTION_PROBE_QUERY =
  'query PR12IntrospectionProbe { __schema { queryType { name } } }';
const SOURCE_PLATFORM_REQUESTS = {
  DATA_API: {
    method: 'GET_AND_DIRECT_POSTGRES',
    endpointOrQueryId: 'PR12-SOURCE-DATA-API-CONFIGURATION-V1',
    descriptor: `SUPABASE_DASHBOARD_DATA_API_SETTINGS_ACCESSIBILITY_CAPTURE; GET /v1/projects/{ref}/postgrest; GET /v1/projects/{ref}/health?services=rest&timeout_ms=2000; GET /rest/v1/ direct endpoint smoke; DIRECT_POSTGRES ${DATA_API_DEFAULT_PRIVILEGE_QUERY}`,
    responseStatus: 'MANAGEMENT_HTTP_200_AND_SQL_COMMAND_OK',
  },
  AUTH: {
    method: 'GET',
    endpointOrQueryId: 'v1-get-auth-service-config',
    descriptor: 'GET /v1/projects/{ref}/config/auth',
    responseStatus: 'HTTP_200',
  },
  GRAPHQL: {
    method: 'DIRECT_POSTGRES_AND_HTTPS_POST',
    endpointOrQueryId: 'PR12-SOURCE-GRAPHQL-CONFIGURATION-V1',
    descriptor: `DIRECT_POSTGRES ${GRAPHQL_EXTENSION_QUERY}; DIRECT_POSTGRES ${GRAPHQL_EXPOSURE_QUERY}; POST /graphql/v1 endpoint and introspection probes`,
    responseStatus: 'SQL_COMMAND_OK_AND_HTTP_CAPTURED',
  },
};
const AUTH_PROVIDER_ENABLED_FIELDS = [
  'external_apple_enabled',
  'external_azure_enabled',
  'external_bitbucket_enabled',
  'external_discord_enabled',
  'external_facebook_enabled',
  'external_figma_enabled',
  'external_github_enabled',
  'external_gitlab_enabled',
  'external_google_enabled',
  'external_kakao_enabled',
  'external_keycloak_enabled',
  'external_linkedin_oidc_enabled',
  'external_notion_enabled',
  'external_slack_enabled',
  'external_slack_oidc_enabled',
  'external_spotify_enabled',
  'external_twitch_enabled',
  'external_twitter_enabled',
  'external_web3_ethereum_enabled',
  'external_web3_solana_enabled',
  'external_workos_enabled',
  'external_x_enabled',
  'external_zoom_enabled',
];
const AUTH_SMTP_PRESENCE_FIELDS = [
  'smtp_admin_email',
  'smtp_host',
  'smtp_pass',
  'smtp_port',
  'smtp_sender_name',
  'smtp_user',
];
const AUTH_SMS_PRESENCE_FIELDS = [
  'sms_messagebird_access_key',
  'sms_provider',
  'sms_test_otp',
  'sms_textlocal_api_key',
  'sms_twilio_account_sid',
  'sms_twilio_auth_token',
  'sms_twilio_content_sid',
  'sms_twilio_message_service_sid',
  'sms_twilio_verify_account_sid',
  'sms_twilio_verify_auth_token',
  'sms_twilio_verify_message_service_sid',
  'sms_vonage_api_key',
  'sms_vonage_api_secret',
];
const AUTH_OAUTH_SECRET_PRESENCE_FIELDS = [
  ...AUTH_PROVIDER_ENABLED_FIELDS.map(field =>
    field.replace(/_enabled$/u, '_secret')
  ),
  'nimbus_oauth_client_secret',
];
const AUTH_HOOK_FAMILIES = [
  'after_user_created',
  'before_user_created',
  'custom_access_token',
  'mfa_verification_attempt',
  'password_verification_attempt',
  'send_email',
  'send_sms',
];
const AUTH_HOOK_PRESENCE_FIELDS = AUTH_HOOK_FAMILIES.flatMap(family => [
  `hook_${family}_enabled`,
  `hook_${family}_secrets`,
  `hook_${family}_uri`,
]);
const AUTH_SAFE_PROJECTION_FIELDS = [
  ...AUTH_SMTP_PRESENCE_FIELDS,
  ...AUTH_SMS_PRESENCE_FIELDS,
  ...AUTH_OAUTH_SECRET_PRESENCE_FIELDS,
  ...AUTH_HOOK_PRESENCE_FIELDS,
].sort();
const CANONICAL_PLAN_FACTS = new Map([
  [
    'created_by_read:natural_index_scan:blocks_created_by_idx',
    {
      nodeType: 'Index Scan',
      indexName: 'blocks_created_by_idx',
      naturalPlan: true,
    },
  ],
  ['rls_read:natural_index_scan', { naturalIndexPlan: true }],
  ['rls_read:no_sort', { sortCount: 0 }],
  ['rls_read:no_bitmap_heap_scan', { targetBitmapHeapScanCount: 0 }],
  ['rls_read:no_target_seq_scan', { targetSeqScanCount: 0 }],
  ['rls_read:row_limit_250', { returnedRows: 250, stoppedAtRows: 250 }],
  [
    'blocks:trigger_and_fk_each_10000_calls',
    { triggerCalls: 10000, fkCalls: 10000 },
  ],
  [
    'target_indexes:exact_catalog_identity',
    { exactCatalogIdentity: true, idxBlocksResourceIdPresent: true },
  ],
]);
const CANONICAL_SEMANTIC_FACTS = new Map([
  ['blocks_integrity:30_cases', { caseCount: 30, failedCaseCount: 0 }],
  [
    'blocks_integrity:sqlstate_message_equivalence',
    { sqlstateEquivalent: true, messageEquivalent: true },
  ],
  ['rls_scope:27_before_27_after', { beforeCount: 27, afterCount: 27 }],
  [
    'rls_scope:tenant_a_b_exact_semantics',
    { tenantAAllowed: true, tenantBDenied: true },
  ],
  ['pgtap:52_ok_0_not_ok', { okCount: 52, notOkCount: 0 }],
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const EXECUTION_STATUSES = new Set(['PASS']);
const UNRESOLVED = new Set([
  'NOT_CAPTURED',
  'NOT_RUN',
  'UNASSIGNED',
  'NOT_APPLICABLE',
  'NOT_IMPLEMENTED',
  'PROPOSED_NOT_EXECUTABLE',
  'PROPOSED_OWNER_APPROVAL_REQUIRED',
]);
const PROHIBITED_PROJECT_REFS = ['qnanuoqveidwvacvbhqp'];
const COMMAND_PHASE_POLICIES = new Map([
  [
    'offline_evidence',
    { remoteContact: false, mutationScopes: new Set(['NONE']) },
  ],
  [
    'approval_freeze',
    { remoteContact: false, mutationScopes: new Set(['NONE']) },
  ],
  ['tool_freeze', { remoteContact: false, mutationScopes: new Set(['NONE']) }],
  [
    'offline_freeze',
    { remoteContact: false, mutationScopes: new Set(['NONE']) },
  ],
  [
    'source_identity_bootstrap',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'staging_identity',
    {
      remoteContact: true,
      mutationScopes: new Set(['NONE', 'LOCAL_LINK_METADATA_ONLY']),
    },
  ],
  [
    'staging_preflight',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'advisor_before',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'migration_replay',
    {
      remoteContact: true,
      mutationScopes: new Set(['NONE', 'ISOLATED_SCHEMA_REPLAY_ONLY']),
    },
  ],
  [
    'post_replay_catalog_capture',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'source_execution_approval_freeze',
    { remoteContact: false, mutationScopes: new Set(['NONE']) },
  ],
  [
    'representative_seed',
    {
      remoteContact: true,
      mutationScopes: new Set(['SYNTHETIC_REPRESENTATIVE_DATA_ONLY']),
    },
  ],
  [
    'representative_data_parity',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'schema_and_type_parity',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'canonical_pr11',
    {
      remoteContact: true,
      mutationScopes: new Set(['CANONICAL_PROBE_TRANSACTION_ONLY']),
    },
  ],
  [
    'hosted_slo',
    {
      remoteContact: true,
      mutationScopes: new Set(['SYNTHETIC_HOSTED_WORKLOAD_ONLY']),
    },
  ],
  [
    'security_auth_tenant',
    {
      remoteContact: true,
      mutationScopes: new Set(['SYNTHETIC_SECURITY_MATRIX_ONLY']),
    },
  ],
  [
    'data_api_graphql',
    {
      remoteContact: true,
      mutationScopes: new Set(['SYNTHETIC_API_MATRIX_ONLY']),
    },
  ],
  [
    'billing_integrations',
    {
      remoteContact: true,
      mutationScopes: new Set(['SANDBOX_BILLING_ONLY']),
    },
  ],
  ['advisor_after', { remoteContact: true, mutationScopes: new Set(['NONE']) }],
  [
    'external_side_effects',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'backup_watermark',
    {
      remoteContact: true,
      mutationScopes: new Set(['SYNTHETIC_BACKUP_WATERMARK_ONLY']),
    },
  ],
  [
    'backup_inventory',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'restore_creation_approval_stop',
    { remoteContact: false, mutationScopes: new Set(['NONE']) },
  ],
  [
    'restore_project_creation',
    {
      remoteContact: true,
      mutationScopes: new Set(['RESTORE_PROJECT_CREATION']),
    },
  ],
  [
    'restore_identity',
    {
      remoteContact: true,
      mutationScopes: new Set(['NONE', 'LOCAL_LINK_METADATA_ONLY']),
    },
  ],
  [
    'post_restore_qualification',
    {
      remoteContact: true,
      mutationScopes: new Set(['NONE', 'SYNTHETIC_QUALIFICATION_ONLY']),
    },
  ],
  [
    'post_restore_side_effects',
    { remoteContact: true, mutationScopes: new Set(['NONE']) },
  ],
  [
    'evidence_privacy',
    { remoteContact: false, mutationScopes: new Set(['NONE']) },
  ],
]);
const PROJECT_DELETION_COMMAND_PATTERN =
  /(?:(?:delete|destroy|remove)\s+.{0,40}(?:project|staging|restore)|(?:project|staging|restore)\s+.{0,40}(?:delete|destroy|remove)|drop\s+database)/iu;
const SHARED_CREDENTIAL_PARENT_NAMES = [
  'PR12_SUPABASE_ACCESS_TOKEN',
  'PR12_PSQL_EXE',
];
const SHARED_CHILD_PROCESS_MAPPINGS = {
  SUPABASE_ACCESS_TOKEN: 'PR12_SUPABASE_ACCESS_TOKEN',
};
const TARGET_CREDENTIAL_PARENT_NAMES = {
  SOURCE: [
    'PR12_SOURCE_DB_PASSWORD',
    'PR12_SOURCE_PROJECT_REF',
    'PR12_SOURCE_SUPABASE_URL',
    'PR12_SOURCE_ANON_KEY',
    'PR12_SOURCE_SERVICE_ROLE_KEY',
    'PR12_SOURCE_PGHOST',
    'PR12_SOURCE_PGPORT',
    'PR12_SOURCE_PGDATABASE',
    'PR12_SOURCE_PGUSER',
    'PR12_SOURCE_PGPASSWORD',
    'PR12_SOURCE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
  ],
  RESTORE: [
    'PR12_RESTORE_DB_PASSWORD',
    'PR12_RESTORE_PROJECT_REF',
    'PR12_RESTORE_SUPABASE_URL',
    'PR12_RESTORE_ANON_KEY',
    'PR12_RESTORE_SERVICE_ROLE_KEY',
    'PR12_RESTORE_PGHOST',
    'PR12_RESTORE_PGPORT',
    'PR12_RESTORE_PGDATABASE',
    'PR12_RESTORE_PGUSER',
    'PR12_RESTORE_PGPASSWORD',
    'PR12_RESTORE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
  ],
};
const TARGET_OPTIONAL_CREDENTIAL_PARENT_NAMES = {
  SOURCE: [
    'PR12_SOURCE_STRIPE_TEST_SECRET_KEY',
    'PR12_SOURCE_STRIPE_TEST_WEBHOOK_SECRET',
  ],
  RESTORE: [],
};
const TARGET_CHILD_PROCESS_MAPPINGS = {
  SOURCE: {
    SUPABASE_DB_PASSWORD: 'PR12_SOURCE_DB_PASSWORD',
    NEXT_PUBLIC_SUPABASE_URL: 'PR12_SOURCE_SUPABASE_URL',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'PR12_SOURCE_ANON_KEY',
    SUPABASE_SERVICE_ROLE_KEY: 'PR12_SOURCE_SERVICE_ROLE_KEY',
    PGHOST: 'PR12_SOURCE_PGHOST',
    PGPORT: 'PR12_SOURCE_PGPORT',
    PGDATABASE: 'PR12_SOURCE_PGDATABASE',
    PGUSER: 'PR12_SOURCE_PGUSER',
    PGPASSWORD: 'PR12_SOURCE_PGPASSWORD',
    PR12_HOSTED_ACTOR_PASSWORD_MAP_JSON:
      'PR12_SOURCE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
    STRIPE_SECRET_KEY: 'PR12_SOURCE_STRIPE_TEST_SECRET_KEY',
    STRIPE_WEBHOOK_SECRET: 'PR12_SOURCE_STRIPE_TEST_WEBHOOK_SECRET',
  },
  RESTORE: {
    SUPABASE_DB_PASSWORD: 'PR12_RESTORE_DB_PASSWORD',
    NEXT_PUBLIC_SUPABASE_URL: 'PR12_RESTORE_SUPABASE_URL',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'PR12_RESTORE_ANON_KEY',
    SUPABASE_SERVICE_ROLE_KEY: 'PR12_RESTORE_SERVICE_ROLE_KEY',
    PGHOST: 'PR12_RESTORE_PGHOST',
    PGPORT: 'PR12_RESTORE_PGPORT',
    PGDATABASE: 'PR12_RESTORE_PGDATABASE',
    PGUSER: 'PR12_RESTORE_PGUSER',
    PGPASSWORD: 'PR12_RESTORE_PGPASSWORD',
    PR12_HOSTED_ACTOR_PASSWORD_MAP_JSON:
      'PR12_RESTORE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
  },
};
const FORBIDDEN_CREDENTIAL_LOCATIONS = [
  'command_line_arguments',
  'database_url',
  'browser_or_bundle',
  'client_response',
  'source_control',
  'dotenv_file',
  'stdout_or_stderr',
  'evidence_artifact',
  'application_log',
];
const REQUIRED_SIDE_EFFECT_FAMILIES = [
  'DATABASE_EXTENSION_STATE',
  'PG_CRON_JOB_INVENTORY',
  'PG_NET_QUEUE_INVENTORY',
  'DATABASE_WEBHOOK_TRIGGER_INVENTORY',
  'WRAPPER_FDW_INVENTORY',
  'STRIPE_CONFIGURATION_AND_DISPATCH',
  'EMAIL_CONFIGURATION_AND_DISPATCH',
  'LINE_CONFIGURATION_AND_DISPATCH',
  'SMS_CONFIGURATION_AND_DISPATCH',
  'INBOUND_WEBHOOK_CONFIGURATION',
  'WORKER_CRON_QUEUE_CONFIGURATION',
  'BULK_IMPORT_SYNC_CONFIGURATION',
  'EXTERNAL_RATE_LIMIT_NAMESPACE',
  'DUPLICATE_SIDE_EFFECT_SCAN',
];
const SIDE_EFFECT_TRANSPORTS = {
  DATABASE_EXTENSION_STATE: 'DIRECT_POSTGRES_PG_EXTENSION',
  PG_CRON_JOB_INVENTORY: 'DIRECT_POSTGRES_CRON_JOB',
  PG_NET_QUEUE_INVENTORY: 'DIRECT_POSTGRES_NET_HTTP_REQUEST_QUEUE',
  DATABASE_WEBHOOK_TRIGGER_INVENTORY: 'DIRECT_POSTGRES_PG_TRIGGER',
  WRAPPER_FDW_INVENTORY: 'DIRECT_POSTGRES_PG_FOREIGN_SERVER',
  STRIPE_CONFIGURATION_AND_DISPATCH: 'SERVER_CONFIG_AND_STRIPE_TEST_API',
  EMAIL_CONFIGURATION_AND_DISPATCH: 'SERVER_CONFIG_AND_EMAIL_PROVIDER_STATUS',
  LINE_CONFIGURATION_AND_DISPATCH: 'SERVER_CONFIG_AND_LINE_PROVIDER_STATUS',
  SMS_CONFIGURATION_AND_DISPATCH: 'SERVER_CONFIG_AND_SMS_PROVIDER_STATUS',
  INBOUND_WEBHOOK_CONFIGURATION: 'APPLICATION_ROUTE_CONFIGURATION',
  WORKER_CRON_QUEUE_CONFIGURATION:
    'APPLICATION_WORKER_CRON_QUEUE_CONFIGURATION',
  BULK_IMPORT_SYNC_CONFIGURATION: 'APPLICATION_BULK_JOB_CONFIGURATION',
  EXTERNAL_RATE_LIMIT_NAMESPACE: 'SERVER_CONFIG_AND_RATE_LIMIT_NAMESPACE',
  DUPLICATE_SIDE_EFFECT_SCAN:
    'DATABASE_OUTBOX_AND_PROVIDER_TEST_RECEIPT_RECONCILIATION',
};
const SIDE_EFFECT_COLLECTOR_ID = 'PR12-SIDE-EFFECT-COLLECTOR-V2';
const SIDE_EFFECT_DESCRIPTOR_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr12/external-side-effect-collector-descriptors-v2.json';
const SIDE_EFFECT_REQUESTS = {
  DATABASE_EXTENSION_STATE: {
    probeId: 'PR12-SE-V2-EXTENSIONS',
    requestOrQueryText:
      "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('pg_cron','pg_net','wrappers') ORDER BY name;",
  },
  PG_CRON_JOB_INVENTORY: {
    probeId: 'PR12-SE-V2-PG-CRON',
    requestOrQueryText:
      "SELECT to_regclass('cron.job') AS relation; IF PRESENT SELECT jobid::text, active FROM cron.job ORDER BY jobid;",
  },
  PG_NET_QUEUE_INVENTORY: {
    probeId: 'PR12-SE-V2-PG-NET',
    requestOrQueryText:
      "SELECT to_regclass('net.http_request_queue'), to_regclass('net._http_response'); IF PRESENT SELECT count(*) ONLY; NEVER SELECT URL, HEADERS, OR BODY;",
  },
  DATABASE_WEBHOOK_TRIGGER_INVENTORY: {
    probeId: 'PR12-SE-V2-DATABASE-WEBHOOKS',
    requestOrQueryText:
      'SELECT schema_name, table_name, trigger_name, function_name, enabled FROM pg_trigger JOIN pg_proc WHERE function identifies net.http_*, supabase_functions.http_request, or HTTP destination; omit arguments and secrets; ORDER BY schema_name, table_name, trigger_name;',
  },
  WRAPPER_FDW_INVENTORY: {
    probeId: 'PR12-SE-V2-WRAPPERS',
    requestOrQueryText:
      'SELECT server_name, wrapper_name FROM pg_foreign_server JOIN pg_foreign_data_wrapper; NEVER SELECT OPTIONS; ORDER BY server_name;',
  },
  STRIPE_CONFIGURATION_AND_DISPATCH: {
    probeId: 'PR12-SE-V2-STRIPE',
    requestOrQueryText:
      'SAFE_ENV_PRESENCE_PROJECTION; NO PROVIDER REQUEST WHEN DISABLED; IF OWNER-APPROVED TEST MODE: GET /v1/balance AND COMPLETE GET /v1/events?created[gte]=<frozen-window>&limit=100 PAGINATION;',
  },
  EMAIL_CONFIGURATION_AND_DISPATCH: {
    probeId: 'PR12-SE-V2-EMAIL',
    requestOrQueryText:
      'SAFE_EMAIL_CONFIG_PRESENCE_PROJECTION; SELECT pending, processing, post-window provider-dispatch counts FROM email_outbox; NEVER RETURN RECIPIENT OR BODY;',
  },
  LINE_CONFIGURATION_AND_DISPATCH: {
    probeId: 'PR12-SE-V2-LINE',
    requestOrQueryText:
      'SAFE_LINE_CONFIG_PRESENCE_PROJECTION; SELECT enabled-gate and post-window dispatch counts FROM LINE credential/cache/outbox catalogs; NEVER RETURN TOKEN OR MESSAGE;',
  },
  SMS_CONFIGURATION_AND_DISPATCH: {
    probeId: 'PR12-SE-V2-SMS',
    requestOrQueryText:
      'AUTH_SAFE_PROJECTION_V2_BINDING; TRACKED_SERVER_SOURCE SMS sink inventory; NEVER RETURN CREDENTIAL OR MESSAGE;',
  },
  INBOUND_WEBHOOK_CONFIGURATION: {
    probeId: 'PR12-SE-V2-INBOUND-WEBHOOKS',
    requestOrQueryText:
      'TRACKED_ROUTE_MANIFEST_BINDING; STRIPE unsigned POST expected 400; RESEND missing-secret negative control expected 500 outside hosted SLO; LINE absent route expected 404; verify zero DB mutations;',
  },
  WORKER_CRON_QUEUE_CONFIGURATION: {
    probeId: 'PR12-SE-V2-WORKERS',
    requestOrQueryText:
      'HASH-BOUND vercel.json and route manifest; unauthenticated GET /api/internal/process-email-outbox, /api/internal/process-line-outbox, /api/internal/reservation-reminders expected 401;',
  },
  BULK_IMPORT_SYNC_CONFIGURATION: {
    probeId: 'PR12-SE-V2-BULK',
    requestOrQueryText:
      'FROZEN TRACKED SOURCE GRAPH: enumerate external bulk import/sync destinations and enabled gates; database-only internal import is excluded;',
  },
  EXTERNAL_RATE_LIMIT_NAMESPACE: {
    probeId: 'PR12-SE-V2-RATE-LIMIT',
    requestOrQueryText:
      'SAFE UPSTASH URL/TOKEN PRESENCE PROJECTION AND NAMESPACE PREFIX CLASSIFICATION; NEVER RETURN URL OR TOKEN;',
  },
  DUPLICATE_SIDE_EFFECT_SCAN: {
    probeId: 'PR12-SE-V2-DUPLICATES',
    requestOrQueryText:
      'ALL-TIME AND POST-WINDOW COUNTS FOR email/LINE outboxes and Stripe webhook event idempotency keys; NEVER RETURN PAYLOADS;',
  },
};
const SIDE_EFFECT_DESCRIPTOR_ABSOLUTE_PATH = path.join(
  REPO_ROOT,
  SIDE_EFFECT_DESCRIPTOR_PATH
);
const SIDE_EFFECT_DESCRIPTOR_FILE = JSON.parse(
  readFileSync(SIDE_EFFECT_DESCRIPTOR_ABSOLUTE_PATH, 'utf8')
);
if (
  SIDE_EFFECT_DESCRIPTOR_FILE.schemaVersion !== 2 ||
  SIDE_EFFECT_DESCRIPTOR_FILE.collectorId !== SIDE_EFFECT_COLLECTOR_ID ||
  JSON.stringify(SIDE_EFFECT_DESCRIPTOR_FILE.families) !==
    JSON.stringify(SIDE_EFFECT_REQUESTS)
) {
  throw new Error(
    'tracked side-effect descriptor contract differs from verifier constants'
  );
}
const SIDE_EFFECT_DESCRIPTOR_ARTIFACT_SHA256 = createHash('sha256')
  .update(readFileSync(SIDE_EFFECT_DESCRIPTOR_ABSOLUTE_PATH))
  .digest('hex');
const REQUIRED_OWNER_FIELDS = [
  'commercialReleaseOwner',
  'supabasePlatformOwner',
  'databaseMigrationOperator',
  'disasterRecoveryOperator',
  'securityTenantReviewer',
  'clinicalDataPrivacyReviewer',
  'billingMessagingSandboxOwner',
  'siteReliabilityOwner',
  'incidentCommander',
  'cleanupOwner',
  'evidenceCustodian',
];
const REQUIRED_ROLES = [
  'anon',
  'authenticated',
  'service_role',
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
];
const APPLICATION_ROLES = [
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
];
const REQUIRED_SERVICE_ROLE_SCAN_DOMAINS = [
  'APPLICATION_LOG',
  'BROWSER_BUILD',
  'CLIENT_RESPONSE',
  'COMMAND_STREAM_AND_EVIDENCE',
];
const REQUIRED_SERVICE_ROLE_BOUNDARY_CASE_IDS = [
  'data_api_service_role_rest',
  'data_api_service_role_rpc_normalize_customer_phone',
  'graphql_service_role',
];
const REQUIRED_JWT_CASES = [
  'permissions_query_error',
  'permissions_row_missing',
  'profile_status_query_error',
  'profile_row_missing',
  'inactive_profile',
  'expired_manager_assignment',
  'revoked_manager_assignment',
  'missing_authority',
  'stale_jwt',
  'empty_jwt',
  'malformed_jwt',
  'expired_jwt',
  'cross_clinic',
  'missing_resource',
  'null_resource',
  'parent_rehome',
  'resource_delete_cascade',
  'clinic_delete_cascade',
];
const REQUIRED_TENANT_CRUD = ['read', 'insert', 'update', 'delete'];
const HOSTED_USER_JWT_ACQUISITION_METHOD =
  'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH';
const REQUIRED_AUTH_GRANT_TYPES = ['password', 'refresh_token'];
const AUTH_TOKEN_USE_SOURCES = new Set([
  'HOSTED_REFRESHED_SESSION',
  'HOSTED_STALE_SESSION',
  'HOSTED_EXPIRED_SESSION',
  'NO_USER_TOKEN',
  'INTENTIONALLY_INVALID_NON_JWT',
  'SERVER_ONLY_CREDENTIAL_BOUNDARY',
  'DIRECT_POSTGRES_NO_JWT',
]);
const DATA_API_ACL_PRIVILEGE_UNIVERSE = {
  ACL_SCHEMA: ['USAGE', 'CREATE'],
  ACL_RELATION: [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN',
  ],
  ACL_COLUMN: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
  ACL_SEQUENCE: ['SELECT', 'UPDATE', 'USAGE'],
  ACL_FUNCTION: ['EXECUTE'],
  ACL_DEFAULT_TABLES: [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN',
  ],
  ACL_DEFAULT_SEQUENCES: ['SELECT', 'UPDATE', 'USAGE'],
  ACL_DEFAULT_FUNCTIONS: ['EXECUTE'],
  ACL_DEFAULT_TYPES: ['USAGE'],
  ACL_DEFAULT_SCHEMAS: ['USAGE', 'CREATE'],
};
const DATA_API_ACL_PRIVILEGE_SET_BY_OBJECT_KIND = new Map([
  ['SCHEMA', 'ACL_SCHEMA'],
  ['RELATION', 'ACL_RELATION'],
  ['COLUMN', 'ACL_COLUMN'],
  ['SEQUENCE', 'ACL_SEQUENCE'],
  ['FUNCTION', 'ACL_FUNCTION'],
]);
const DATA_API_ACL_DEFAULT_PRIVILEGE_SET_BY_OBJECT_TYPE = new Map([
  ['TABLES', 'ACL_DEFAULT_TABLES'],
  ['SEQUENCES', 'ACL_DEFAULT_SEQUENCES'],
  ['FUNCTIONS', 'ACL_DEFAULT_FUNCTIONS'],
  ['TYPES', 'ACL_DEFAULT_TYPES'],
  ['SCHEMAS', 'ACL_DEFAULT_SCHEMAS'],
]);
const AUTH_REJECTED_JWT_CASES = new Set([
  'empty_jwt',
  'malformed_jwt',
  'expired_jwt',
]);
const AUTHORITY_FAIL_CLOSED_JWT_CASES = new Set([
  'inactive_profile',
  'expired_manager_assignment',
  'revoked_manager_assignment',
  'missing_authority',
  'stale_jwt',
  'cross_clinic',
]);
const AUTHORITY_LOOKUP_FAIL_CLOSED_JWT_CASES = new Set([
  'permissions_query_error',
  'permissions_row_missing',
  'profile_status_query_error',
  'profile_row_missing',
]);
const AUTHORITY_LOOKUP_ERROR_JWT_CASES = new Set([
  'permissions_query_error',
  'profile_status_query_error',
]);
const AUTHORITY_CAUSE_BY_JWT_CASE = new Map([
  [
    'inactive_profile',
    {
      condition: 'PROFILE_INACTIVE',
      profileStatus: 'INACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'GRANTED',
    },
  ],
  [
    'expired_manager_assignment',
    {
      condition: 'ASSIGNMENT_EXPIRED',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'EXPIRED',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'GRANTED',
    },
  ],
  [
    'revoked_manager_assignment',
    {
      condition: 'ASSIGNMENT_REVOKED',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'REVOKED',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'GRANTED',
    },
  ],
  [
    'missing_authority',
    {
      condition: 'PERMISSION_MISSING',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'ACTIVE',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'MISSING',
    },
  ],
  [
    'stale_jwt',
    {
      condition: 'JWT_STALE_AFTER_AUTHORITY_CHANGE',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'ACTIVE',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'GRANTED',
    },
  ],
  [
    'cross_clinic',
    {
      condition: 'ASSIGNMENT_CLINIC_MISMATCH',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'ACTIVE',
      managerAssignmentClinicId: 'tenant_b',
      permissionLookupStatus: 'GRANTED',
    },
  ],
  [
    'permissions_query_error',
    {
      condition: 'PERMISSION_LOOKUP_ERROR',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'ERROR',
    },
  ],
  [
    'permissions_row_missing',
    {
      condition: 'PERMISSION_ROW_MISSING',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'MISSING_ROW',
    },
  ],
  [
    'profile_status_query_error',
    {
      condition: 'PROFILE_LOOKUP_ERROR',
      profileStatus: 'NOT_CAPTURED_DUE_TO_ERROR',
      profileLookupStatus: 'ERROR',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'NOT_EVALUATED',
    },
  ],
  [
    'profile_row_missing',
    {
      condition: 'PROFILE_ROW_MISSING',
      profileStatus: 'MISSING',
      profileLookupStatus: 'MISSING_ROW',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'NOT_EVALUATED',
    },
  ],
]);
const RELATIONAL_REJECTION_CASES = new Set([
  'missing_resource',
  'null_resource',
  'parent_rehome',
]);
const RELATIONAL_CASCADE_CASES = new Set([
  'resource_delete_cascade',
  'clinic_delete_cascade',
]);
const SECURITY_TARGET_CLASSIFICATIONS = new Set([
  'A_TENANT_CANONICAL',
  'B_SERVICE_ROLE_ONLY',
  'C_SHARED_MASTER_READ_ONLY',
  'E_LEGACY_QUARANTINE',
  'AUTH_PLATFORM_MANAGED',
]);
const REQUIRED_CANONICAL_SECURITY_TARGETS = ['public.blocks'];
const SECURITY_COVERAGE_FAMILY_BY_CLASSIFICATION = new Map([
  ['A_TENANT_CANONICAL', 'TENANT_CRUD_MATRIX'],
  ['B_SERVICE_ROLE_ONLY', 'DATA_API_ACL_SERVICE_ROLE'],
  ['C_SHARED_MASTER_READ_ONLY', 'DATA_API_READ_ONLY'],
  ['E_LEGACY_QUARANTINE', 'LEGACY_QUARANTINE'],
  ['AUTH_PLATFORM_MANAGED', 'AUTH_JWT_MATRIX'],
]);
const RELATIONAL_STATE_TRANSITION_CONTRACTS = new Map([
  [
    'missing_resource',
    [
      {
        assertionId: 'attempted_block',
        relation: 'public.blocks',
        transition: 'ABSENT_TO_ABSENT',
      },
      {
        assertionId: 'missing_resource',
        relation: 'public.resources',
        transition: 'ABSENT_TO_ABSENT',
      },
      {
        assertionId: 'other_tenant_sentinel',
        relation: 'public.blocks',
        transition: 'HASH_UNCHANGED',
      },
    ],
  ],
  [
    'null_resource',
    [
      {
        assertionId: 'attempted_block',
        relation: 'public.blocks',
        transition: 'ABSENT_TO_ABSENT',
      },
      {
        assertionId: 'existing_clinic',
        relation: 'public.clinics',
        transition: 'HASH_UNCHANGED',
      },
      {
        assertionId: 'other_tenant_sentinel',
        relation: 'public.blocks',
        transition: 'HASH_UNCHANGED',
      },
    ],
  ],
  [
    'parent_rehome',
    [
      {
        assertionId: 'target_resource',
        relation: 'public.resources',
        transition: 'HASH_UNCHANGED',
      },
      {
        assertionId: 'referencing_block',
        relation: 'public.blocks',
        transition: 'HASH_UNCHANGED',
      },
      {
        assertionId: 'other_tenant_sentinel',
        relation: 'public.blocks',
        transition: 'HASH_UNCHANGED',
      },
    ],
  ],
  [
    'resource_delete_cascade',
    [
      {
        assertionId: 'target_resource',
        relation: 'public.resources',
        transition: 'PRESENT_TO_ABSENT',
      },
      {
        assertionId: 'dependent_block',
        relation: 'public.blocks',
        transition: 'PRESENT_TO_ABSENT',
      },
      {
        assertionId: 'unrelated_resource_block',
        relation: 'public.blocks',
        transition: 'HASH_UNCHANGED',
      },
      {
        assertionId: 'other_tenant_sentinel',
        relation: 'public.blocks',
        transition: 'HASH_UNCHANGED',
      },
    ],
  ],
  [
    'clinic_delete_cascade',
    [
      {
        assertionId: 'target_clinic',
        relation: 'public.clinics',
        transition: 'PRESENT_TO_ABSENT',
      },
      {
        assertionId: 'target_resource',
        relation: 'public.resources',
        transition: 'PRESENT_TO_ABSENT',
      },
      {
        assertionId: 'dependent_block',
        relation: 'public.blocks',
        transition: 'PRESENT_TO_ABSENT',
      },
      {
        assertionId: 'other_tenant_sentinel',
        relation: 'public.blocks',
        transition: 'HASH_UNCHANGED',
      },
    ],
  ],
]);
const NO_ERROR_DIAGNOSTIC = {
  message: null,
  detail: null,
  hint: null,
  schema: null,
  table: null,
  column: null,
  constraint: null,
};
const RELATIONAL_ERROR_DIAGNOSTIC_CONTRACTS = new Map([
  [
    'missing_resource',
    {
      ...NO_ERROR_DIAGNOSTIC,
      message: 'resources.id not found',
    },
  ],
  [
    'null_resource',
    {
      ...NO_ERROR_DIAGNOSTIC,
      message: 'resources.id not found',
    },
  ],
  [
    'parent_rehome',
    {
      message:
        'update or delete on table "resources" violates foreign key constraint "blocks_resource_id_fkey" on table "blocks"',
      detail:
        'Key (id, clinic_id)=(fb110000-0000-4000-8000-000000008101, fb110000-0000-4000-8000-000000008001) is still referenced from table "blocks".',
      hint: null,
      schema: 'public',
      table: 'blocks',
      column: null,
      constraint: 'blocks_resource_id_fkey',
    },
  ],
  ['resource_delete_cascade', NO_ERROR_DIAGNOSTIC],
  ['clinic_delete_cascade', NO_ERROR_DIAGNOSTIC],
]);
const REQUIRED_TENANT_DIRECTIONS = ['A_TO_B', 'B_TO_A'];
const COMM_RESULT_TYPES = new Map([
  ['DB', 'DATABASE_QUALIFICATION_RESULT'],
  ['TENANT', 'TENANT_ISOLATION_RESULT'],
  ['AUTH', 'AUTHORIZATION_BOUNDARY_RESULT'],
  ['API', 'API_EXPOSURE_RESULT'],
  ['BILL', 'BILLING_SANDBOX_RESULT'],
  ['OPS', 'OPERATIONS_DR_RESULT'],
]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function requireRecord(value, context) {
  assert(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${context} must be an object`
  );
  return value;
}

function requireArray(value, context) {
  assert(Array.isArray(value), `${context} must be an array`);
  return value;
}

function requireString(value, context) {
  assert(
    typeof value === 'string' && value.length > 0,
    `${context} must be a string`
  );
  return value;
}

function requireNumber(value, context) {
  assert(
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
    `${context} must be a non-negative number`
  );
  return value;
}

function requireConcreteString(value, context) {
  const candidate = requireString(value, context);
  assert(
    !UNRESOLVED.has(candidate),
    `${context} contains a placeholder or unresolved value`
  );
  return candidate;
}

function requireSha256(value, context) {
  const candidate = requireConcreteString(value, context);
  assert(SHA256_PATTERN.test(candidate), `${context} must be a SHA-256`);
  return candidate;
}

function requireGitCommit(value, context) {
  const candidate = requireConcreteString(value, context);
  assert(GIT_COMMIT_PATTERN.test(candidate), `${context} must be a Git commit`);
  return candidate;
}

function requireNonProductionProjectRef(value, context) {
  const projectRef = requireConcreteString(value, context);
  assert(
    !PROHIBITED_PROJECT_REFS.includes(projectRef),
    `${context} is a prohibited production project ref`
  );
  return projectRef;
}

function assertExactRecordKeys(value, expectedKeys, context) {
  const observed = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(
    observed.length === expected.length &&
      observed.every((key, index) => key === expected[index]),
    `${context} contains missing or unsupported fields`
  );
}

function assertExactRecordValues(actual, expected, context) {
  assertExactRecordKeys(actual, Object.keys(expected), context);
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = requireNumber(actual[key], `${context}.${key}`);
    assert(
      Number.isInteger(actualValue) && actualValue === expectedValue,
      `${context}.${key} does not match the approved exact value`
    );
  }
}

function verifyDirectDatabaseIdentity(environment, context) {
  const projectRef = requireNonProductionProjectRef(
    environment.projectRef,
    `${context}.projectRef`
  );
  assert(
    environment.databaseConnectionMode === 'DIRECT',
    `${context}.databaseConnectionMode must be DIRECT`
  );
  assert(
    environment.databaseHost === `db.${projectRef}.supabase.co`,
    `${context}.databaseHost does not match the project ref`
  );
  assert(
    environment.databaseUser === 'postgres',
    `${context}.databaseUser must be postgres for the approved direct connection`
  );
}

function verifyAuthProvisioning(value, context) {
  const auth = requireRecord(value, context);
  assertExactRecordKeys(
    auth,
    [
      'anonymousSignInEnabled',
      'realEmailSmsOrOAuthDeliveryConfigured',
      'hostedFixturePasswords',
      'hostedUserJwtAcquisitionMethod',
      'jwtSigningSecretAcquisitionAllowed',
      'fabricatedUserJwtAllowed',
      'tokenValueCaptureAllowed',
    ],
    context
  );
  assert(
    auth.anonymousSignInEnabled === false,
    `${context}.anonymousSignInEnabled must be false`
  );
  assert(
    auth.realEmailSmsOrOAuthDeliveryConfigured === false,
    `${context}.realEmailSmsOrOAuthDeliveryConfigured must be false`
  );
  assert(
    auth.hostedFixturePasswords ===
      'owner_secret_store_generated_ephemeral_minimum_32_characters',
    `${context}.hostedFixturePasswords drift`
  );
  assert(
    auth.hostedUserJwtAcquisitionMethod === HOSTED_USER_JWT_ACQUISITION_METHOD,
    `${context}.hostedUserJwtAcquisitionMethod drift`
  );
  assert(
    auth.jwtSigningSecretAcquisitionAllowed === false &&
      auth.fabricatedUserJwtAllowed === false &&
      auth.tokenValueCaptureAllowed === false,
    `${context} must forbid signing-secret acquisition, fabricated JWTs, and token-value capture`
  );
}

function verifyOwnerSeparation(approval, owners, context) {
  const approvedBy = requireConcreteString(
    approval.approvedBy,
    `${context}.approval.approvedBy`
  );
  for (const field of REQUIRED_OWNER_FIELDS) {
    requireConcreteString(owners[field], `${context}.owners.${field}`);
  }
  assert(
    approvedBy === owners.commercialReleaseOwner,
    `${context}.approval.approvedBy must equal commercialReleaseOwner`
  );
  for (const field of [
    'supabasePlatformOwner',
    'databaseMigrationOperator',
    'disasterRecoveryOperator',
    'securityTenantReviewer',
    'clinicalDataPrivacyReviewer',
    'billingMessagingSandboxOwner',
    'siteReliabilityOwner',
    'incidentCommander',
    'cleanupOwner',
    'evidenceCustodian',
  ]) {
    assert(
      approvedBy !== owners[field],
      `${context}.approval.approvedBy must differ from ${field}`
    );
  }
}

function sha256File(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function integrityAggregateHash(entries, queryField, digestField) {
  return sha256Text(
    entries
      .map(
        entry =>
          `${entry.relation}\t${String(entry.rowCount)}\t${entry[queryField]}\t${entry[digestField]}\n`
      )
      .join('')
  );
}

function verifyIntegrityHashContract({
  representativeBinding,
  representativeContract,
  expectedRowCounts,
  artifactHashes,
  artifactFiles,
}) {
  const contract = requireRecord(
    representativeContract.dataIntegrityHashContract,
    'representativeData.contract.dataIntegrityHashContract'
  );
  assertExactRecordKeys(
    contract,
    [
      'contractId',
      'status',
      'transaction',
      'hashAlgorithm',
      'relationSet',
      'relationOrder',
      'primaryKeyOrder',
      'missingPrimaryKeyPolicy',
      'collectorPath',
      'collectorSha256',
      'relations',
      'rowProjection',
      'rowEncoding',
      'queryEvidence',
      'perRelationDigest',
      'aggregateEncoding',
      'aggregateDataHash',
      'schemaProjection',
      'aggregateSchemaHash',
      'physicalStructureProjection',
      'excludedVolatilePhysicalFields',
      'aggregateEnvironmentPhysicalStructureHash',
      'rawRowsPersisted',
      'watermarkColumn',
      'watermarkColumnIncluded',
    ],
    'representativeData.contract.dataIntegrityHashContract'
  );
  assert(
    contract.contractId === 'PR12-DATA-INTEGRITY-HASH-V1' &&
      contract.status === 'OWNER_APPROVED_FOR_EXECUTION' &&
      contract.transaction === 'REPEATABLE_READ_READ_ONLY' &&
      contract.hashAlgorithm === 'SHA-256' &&
      contract.relationSet === 'EXACT_KEYS_OF_ALL_ROW_COUNTS' &&
      contract.relationOrder === 'UTF8_BYTEWISE_ASCENDING_QUALIFIED_RELATION' &&
      contract.primaryKeyOrder ===
        'ASC_NULLS_FIRST_IN_DECLARED_PRIMARY_KEY_COLUMN_ORDER' &&
      contract.missingPrimaryKeyPolicy === 'ABORT' &&
      contract.rowProjection ===
        'FULL_ROW_TO_JSONB_INCLUDING_PUBLIC_RESERVATIONS_UPDATED_AT' &&
      contract.rowEncoding === 'UTF8_BYTE_LENGTH_COLON_JSONB_TEXT_LF' &&
      contract.queryEvidence ===
        'OWNER_FROZEN_LITERAL_SQL_AND_UTF8_SHA256_PER_RELATION_REQUIRED' &&
      contract.perRelationDigest === 'SHA256_OF_CONCATENATED_ROW_ENCODINGS' &&
      contract.aggregateEncoding ===
        'UTF8 <relation> TAB <rowCount> TAB <querySha256> TAB <digestSha256> LF in relationOrder' &&
      contract.aggregateDataHash === 'SHA256_OF_AGGREGATE_ENCODING' &&
      contract.schemaProjection ===
        'NORMALIZED_COLUMN_CONSTRAINT_POLICY_TRIGGER_HELPER_FK_ACL_CATALOG_V1' &&
      contract.aggregateSchemaHash === 'SHA256_OF_AGGREGATE_ENCODING' &&
      contract.physicalStructureProjection ===
        'RELATION_AND_INDEX_NAMES_RELKIND_PERSISTENCE_ACCESS_METHOD_NORMALIZED_INDEX_DEFINITION_UNIQUE_PRIMARY_EXCLUSION_PREDICATE_VALID_READY_LIVE_ONLY' &&
      JSON.stringify(contract.excludedVolatilePhysicalFields) ===
        JSON.stringify([
          'oid',
          'relfilenode',
          'bytes',
          'pages',
          'tuples',
          'statistics',
        ]) &&
      contract.aggregateEnvironmentPhysicalStructureHash ===
        'SHA256_OF_AGGREGATE_ENCODING' &&
      contract.rawRowsPersisted === false &&
      contract.watermarkColumn === 'public.reservations.updated_at' &&
      contract.watermarkColumnIncluded === true,
    'representative data-integrity hash method is not the frozen V1 contract'
  );
  const collector = verifyBoundArtifact(
    {
      path: requireConcreteString(
        contract.collectorPath,
        'representativeData.contract.dataIntegrityHashContract.collectorPath'
      ),
      sha256: requireSha256(
        contract.collectorSha256,
        'representativeData.contract.dataIntegrityHashContract.collectorSha256'
      ),
    },
    'representativeData.contract.dataIntegrityHashContract.collector',
    artifactHashes,
    artifactFiles
  );
  const expectedRelations =
    Object.keys(expectedRowCounts).sort(compareUtf8Bytes);
  const relations = requireArray(
    contract.relations,
    'representativeData.contract.dataIntegrityHashContract.relations'
  ).map((value, index) => {
    const relation = requireRecord(
      value,
      `representativeData.contract.dataIntegrityHashContract.relations[${String(index)}]`
    );
    assertExactRecordKeys(
      relation,
      [
        'relation',
        'primaryKeyColumns',
        'dataQuerySha256',
        'schemaQuerySha256',
        'physicalStructureQuerySha256',
      ],
      `representativeData.contract.dataIntegrityHashContract.relations[${String(index)}]`
    );
    const relationName = requireConcreteString(
      relation.relation,
      `integrity hash relation ${String(index)}`
    );
    const primaryKeyColumns = requireConcreteStringArray(
      relation.primaryKeyColumns,
      `integrity hash relation ${relationName}.primaryKeyColumns`
    );
    assert(
      primaryKeyColumns.length > 0 &&
        new Set(primaryKeyColumns).size === primaryKeyColumns.length,
      `integrity hash relation ${relationName} requires unique primary-key columns`
    );
    return {
      relation: relationName,
      primaryKeyColumns,
      dataQuerySha256: requireSha256(
        relation.dataQuerySha256,
        `integrity hash relation ${relationName}.dataQuerySha256`
      ),
      schemaQuerySha256: requireSha256(
        relation.schemaQuerySha256,
        `integrity hash relation ${relationName}.schemaQuerySha256`
      ),
      physicalStructureQuerySha256: requireSha256(
        relation.physicalStructureQuerySha256,
        `integrity hash relation ${relationName}.physicalStructureQuerySha256`
      ),
    };
  });
  assertExactStringArray(
    relations.map(value => value.relation),
    expectedRelations,
    'representativeData.contract.dataIntegrityHashContract.relations'
  );
  return {
    id: contract.contractId,
    binding: representativeBinding,
    collector,
    relations,
  };
}

function verifyIntegritySnapshot(
  snapshot,
  context,
  hashContract,
  expectedRows
) {
  assert(
    snapshot.hashContractId === hashContract.id &&
      snapshot.hashContractPath.replaceAll('\\', '/') ===
        hashContract.binding.path &&
      snapshot.hashContractSha256 === hashContract.binding.sha256,
    `${context} hash-contract binding mismatch`
  );
  const relationDigests = requireArray(
    snapshot.relationDigests,
    `${context}.relationDigests`
  ).map((value, index) => {
    const digest = requireRecord(
      value,
      `${context}.relationDigests[${String(index)}]`
    );
    assertExactRecordKeys(
      digest,
      [
        'relation',
        'rowCount',
        'primaryKeyColumns',
        'dataQueryText',
        'dataQuerySha256',
        'dataDigestSha256',
        'schemaQueryText',
        'schemaQuerySha256',
        'schemaDigestSha256',
        'physicalStructureQueryText',
        'physicalStructureQuerySha256',
        'physicalStructureDigestSha256',
      ],
      `${context}.relationDigests[${String(index)}]`
    );
    const contractRelation = hashContract.relations[index];
    assert(contractRelation, `${context} contains an extra relation digest`);
    const relation = requireConcreteString(
      digest.relation,
      `${context}.relationDigests[${String(index)}].relation`
    );
    const rowCount = requireNumber(
      digest.rowCount,
      `${context}.relationDigests[${String(index)}].rowCount`
    );
    assert(
      Number.isInteger(rowCount) &&
        relation === contractRelation.relation &&
        rowCount === expectedRows[relation],
      `${context} relation order or row count mismatch`
    );
    assertExactStringArray(
      requireConcreteStringArray(
        digest.primaryKeyColumns,
        `${context}.${relation}.primaryKeyColumns`
      ),
      contractRelation.primaryKeyColumns,
      `${context}.${relation}.primaryKeyColumns`
    );
    for (const [queryTextField, queryShaField] of [
      ['dataQueryText', 'dataQuerySha256'],
      ['schemaQueryText', 'schemaQuerySha256'],
      ['physicalStructureQueryText', 'physicalStructureQuerySha256'],
    ]) {
      const queryText = requireConcreteString(
        digest[queryTextField],
        `${context}.${relation}.${queryTextField}`
      );
      const querySha = requireSha256(
        digest[queryShaField],
        `${context}.${relation}.${queryShaField}`
      );
      assert(
        sha256Text(queryText) === querySha &&
          querySha === contractRelation[queryShaField] &&
          queryText.includes(relation),
        `${context}.${relation}.${queryTextField} is not the owner-frozen literal query`
      );
    }
    assert(
      digest.dataQueryText.includes('to_jsonb') &&
        digest.dataQueryText.toUpperCase().includes('ORDER BY') &&
        contractRelation.primaryKeyColumns.every(column =>
          digest.dataQueryText.includes(column)
        ),
      `${context}.${relation}.dataQueryText does not prove full-row primary-key ordering`
    );
    return {
      ...digest,
      relation,
      rowCount,
      dataDigestSha256: requireSha256(
        digest.dataDigestSha256,
        `${context}.${relation}.dataDigestSha256`
      ),
      schemaDigestSha256: requireSha256(
        digest.schemaDigestSha256,
        `${context}.${relation}.schemaDigestSha256`
      ),
      physicalStructureDigestSha256: requireSha256(
        digest.physicalStructureDigestSha256,
        `${context}.${relation}.physicalStructureDigestSha256`
      ),
    };
  });
  assert(
    relationDigests.length === hashContract.relations.length,
    `${context} relation digest set mismatch`
  );
  const dataHash = integrityAggregateHash(
    relationDigests,
    'dataQuerySha256',
    'dataDigestSha256'
  );
  const schemaHash = integrityAggregateHash(
    relationDigests,
    'schemaQuerySha256',
    'schemaDigestSha256'
  );
  const environmentPhysicalStructureHash = integrityAggregateHash(
    relationDigests,
    'physicalStructureQuerySha256',
    'physicalStructureDigestSha256'
  );
  assert(
    snapshot.dataHash === dataHash &&
      snapshot.schemaHash === schemaHash &&
      snapshot.environmentPhysicalStructureHash ===
        environmentPhysicalStructureHash,
    `${context} aggregate hash does not recompute from ordered relation digests`
  );
  return {
    relationDigests,
    dataHash,
    schemaHash,
    environmentPhysicalStructureHash,
  };
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(item => canonicalizeJson(item));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map(key => [key, canonicalizeJson(value[key])])
  );
}

function validateSupabaseSmartGroup(value, context) {
  const smartGroup = requireRecord(value, context);
  assertExactRecordKeys(smartGroup, ['name', 'code', 'type'], context);
  assert(
    typeof smartGroup.name === 'string' &&
      ['americas', 'emea', 'apac'].includes(smartGroup.code) &&
      smartGroup.type === 'smartGroup',
    `${context} is not a documented Supabase smart group`
  );
}

function validateSupabaseSpecificRegion(value, context) {
  const region = requireRecord(value, context);
  const keys = Object.keys(region).sort();
  assert(
    JSON.stringify(keys) ===
      JSON.stringify(['code', 'name', 'provider', 'status', 'type']) ||
      JSON.stringify(keys) ===
        JSON.stringify(['code', 'name', 'provider', 'type']),
    `${context} has unexpected region fields`
  );
  assert(
    typeof region.name === 'string' &&
      typeof region.code === 'string' &&
      region.type === 'specific' &&
      ['AWS', 'FLY', 'AWS_K8S', 'AWS_NIMBUS'].includes(region.provider) &&
      (region.status === undefined ||
        ['capacity', 'other'].includes(region.status)),
    `${context} is not a documented Supabase specific region`
  );
  return region;
}

function validateSupabaseRegionAvailabilityBody(value, context) {
  const body = requireRecord(value, context);
  assertExactRecordKeys(body, ['recommendations', 'all'], context);
  const recommendations = requireRecord(
    body.recommendations,
    `${context}.recommendations`
  );
  const all = requireRecord(body.all, `${context}.all`);
  assertExactRecordKeys(
    recommendations,
    ['smartGroup', 'specific'],
    `${context}.recommendations`
  );
  assertExactRecordKeys(all, ['smartGroup', 'specific'], `${context}.all`);
  validateSupabaseSmartGroup(
    recommendations.smartGroup,
    `${context}.recommendations.smartGroup`
  );
  requireArray(all.smartGroup, `${context}.all.smartGroup`).forEach(
    (entry, index) =>
      validateSupabaseSmartGroup(
        entry,
        `${context}.all.smartGroup[${String(index)}]`
      )
  );
  requireArray(
    recommendations.specific,
    `${context}.recommendations.specific`
  ).forEach((entry, index) =>
    validateSupabaseSpecificRegion(
      entry,
      `${context}.recommendations.specific[${String(index)}]`
    )
  );
  return requireArray(all.specific, `${context}.all.specific`).map(
    (entry, index) =>
      validateSupabaseSpecificRegion(
        entry,
        `${context}.all.specific[${String(index)}]`
      )
  );
}

function validateSupabaseAddonVariant(value, context) {
  const variant = requireRecord(value, context);
  const keys = Object.keys(variant);
  assert(
    ['id', 'name', 'price'].every(key => keys.includes(key)) &&
      keys.every(key => ['id', 'name', 'price', 'meta'].includes(key)),
    `${context} has unexpected or missing addon variant fields`
  );
  const price = requireRecord(variant.price, `${context}.price`);
  assertExactRecordKeys(
    price,
    ['description', 'type', 'interval', 'amount'],
    `${context}.price`
  );
  assert(
    typeof variant.id === 'string' &&
      typeof variant.name === 'string' &&
      typeof price.description === 'string' &&
      ['fixed', 'usage'].includes(price.type) &&
      ['monthly', 'hourly'].includes(price.interval) &&
      typeof price.amount === 'number' &&
      Number.isFinite(price.amount) &&
      price.amount >= 0,
    `${context} is not a documented Supabase addon variant`
  );
  if (Object.hasOwn(variant, 'meta')) canonicalizeJson(variant.meta);
  return variant;
}

function validateSupabaseAddonResponseBody(value, context) {
  const body = requireRecord(value, context);
  assertExactRecordKeys(body, ['selected_addons', 'available_addons'], context);
  const selected = requireArray(
    body.selected_addons,
    `${context}.selected_addons`
  ).map((value, index) => {
    const addonContext = `${context}.selected_addons[${String(index)}]`;
    const addon = requireRecord(value, addonContext);
    assertExactRecordKeys(addon, ['type', 'variant'], addonContext);
    assert(typeof addon.type === 'string', `${addonContext}.type is invalid`);
    validateSupabaseAddonVariant(addon.variant, `${addonContext}.variant`);
    return addon;
  });
  requireArray(body.available_addons, `${context}.available_addons`).forEach(
    (value, index) => {
      const addonContext = `${context}.available_addons[${String(index)}]`;
      const addon = requireRecord(value, addonContext);
      assertExactRecordKeys(addon, ['type', 'name', 'variants'], addonContext);
      assert(
        typeof addon.type === 'string' && typeof addon.name === 'string',
        `${addonContext} identity is invalid`
      );
      requireArray(addon.variants, `${addonContext}.variants`).forEach(
        (variant, variantIndex) =>
          validateSupabaseAddonVariant(
            variant,
            `${addonContext}.variants[${String(variantIndex)}]`
          )
      );
    }
  );
  return selected;
}

function assertJsonEquivalent(actual, expected, context) {
  assert(
    JSON.stringify(canonicalizeJson(actual)) ===
      JSON.stringify(canonicalizeJson(expected)),
    `${context} does not reconcile with raw observations`
  );
}

function readJsonFile(absolutePath, context) {
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  return requireRecord(parsed, context);
}

function currentGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert(result.status === 0, 'git rev-parse HEAD failed');
  return requireGitCommit(result.stdout.trim(), 'current Git HEAD');
}

function requireIsoTimestamp(value, context, options = {}) {
  const candidate = requireConcreteString(value, context);
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      candidate
    ),
    `${context} must be an ISO-8601 timestamp with timezone`
  );
  const instant = Date.parse(candidate);
  assert(Number.isFinite(instant), `${context} must be a valid timestamp`);
  if (options.future === true) {
    assert(instant > Date.now(), `${context} is expired`);
  }
  if (options.notFuture === true) {
    assert(instant <= Date.now(), `${context} must not be in the future`);
  }
  return candidate;
}

function requireConcreteStringArray(value, context, options = {}) {
  const values = requireArray(value, context);
  if (options.allowEmpty !== true) {
    assert(values.length > 0, `${context} must not be empty`);
  }
  return values.map((item, index) =>
    requireConcreteString(item, `${context}[${String(index)}]`)
  );
}

function assertExactStringArray(actual, expected, context) {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${context} approval mismatch`
  );
}

function requiredCommGateIds() {
  const source = readFileSync(CURRENT_GATE_PATH, 'utf8');
  const ids = [...source.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gmu)].map(
    match => match[1]
  );
  assert(
    ids.length === 54,
    'current gate inventory must contain 54 COMM gates'
  );
  assert(
    new Set(ids).size === 54,
    'current gate inventory has duplicate COMM gates'
  );
  return ids;
}

function resolveEvidencePath(manifestDirectory, relativePath, context) {
  const candidate = requireConcreteString(relativePath, context);
  assert(!path.isAbsolute(candidate), `${context} must be relative`);
  const absolute = path.resolve(manifestDirectory, candidate);
  const relative = path.relative(manifestDirectory, absolute);
  assert(
    relative.length > 0 &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative),
    `${context} escapes the manifest directory`
  );
  assert(existsSync(absolute), `${context} does not exist`);
  assert(
    !lstatSync(absolute).isSymbolicLink(),
    `${context} must not be a symbolic link`
  );
  assert(lstatSync(absolute).isFile(), `${context} must be a file`);
  return { absolute, relative: candidate.replaceAll('\\', '/') };
}

function collectEvidenceDirectoryFiles(absolutePath) {
  const stat = lstatSync(absolutePath);
  assert(
    !stat.isSymbolicLink(),
    `evidence directory contains a symbolic link: ${absolutePath}`
  );
  if (stat.isFile()) return [absolutePath];
  assert(
    stat.isDirectory(),
    `evidence directory contains an unsupported entry: ${absolutePath}`
  );
  return readdirSync(absolutePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap(entry =>
      collectEvidenceDirectoryFiles(path.join(absolutePath, entry.name))
    );
}

function verifyEvidenceDirectoryClosure(
  manifestPath,
  manifestDirectory,
  artifactPaths
) {
  const manifestRelative = path
    .relative(manifestDirectory, manifestPath)
    .replaceAll('\\', '/');
  assert(
    manifestRelative.length > 0 &&
      !manifestRelative.startsWith('..') &&
      !path.isAbsolute(manifestRelative),
    'manifest must be inside its evidence directory'
  );
  assert(
    !artifactPaths.has(manifestRelative),
    'manifest must not self-hash as an artifact'
  );
  const expected = [manifestRelative];
  for (const artifactPath of artifactPaths) {
    const normalized = path
      .relative(
        manifestDirectory,
        path.resolve(manifestDirectory, artifactPath)
      )
      .replaceAll('\\', '/');
    assert(
      artifactPath === normalized,
      `artifact path is not canonical: ${artifactPath}`
    );
    expected.push(normalized);
  }
  expected.sort((left, right) => left.localeCompare(right, 'en'));
  const observed = collectEvidenceDirectoryFiles(manifestDirectory)
    .map(file => path.relative(manifestDirectory, file).replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right, 'en'));
  assert(
    JSON.stringify(observed) === JSON.stringify(expected),
    'evidence directory is not manifest-closed'
  );
}

function verifyEvidenceReferences(value, context, artifactPaths) {
  const evidence = requireArray(value, context);
  assert(evidence.length > 0, `${context} must not be empty`);
  for (const [index, item] of evidence.entries()) {
    const reference = requireConcreteString(
      item,
      `${context}[${String(index)}]`
    );
    assert(
      artifactPaths.has(reference.replaceAll('\\', '/')),
      `${context}[${String(index)}] is not a hashed artifact`
    );
  }
}

function collectEvidencePaths(value) {
  const paths = new Set();
  const visit = candidate => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      if (key === 'evidence' && Array.isArray(nested)) {
        for (const item of nested) {
          if (typeof item === 'string') paths.add(item.replaceAll('\\', '/'));
        }
      } else {
        visit(nested);
      }
    }
  };
  visit(value);
  return paths;
}

function verifyRuntimeIdentityBinding(actual, approvedEnvironment, context) {
  const identity = requireRecord(actual, context);
  const fields = [
    'projectRef',
    'projectUrl',
    'databaseHost',
    'databaseConnectionMode',
    'databaseUser',
    'databaseVersion',
    'systemIdentifier',
  ];
  assertExactRecordKeys(identity, fields, context);
  for (const field of fields) {
    assert(
      identity[field] === approvedEnvironment[field],
      `${context}.${field} does not match the approved runtime identity`
    );
  }
  verifyDirectDatabaseIdentity(identity, context);
}

function verifyPassedGate(
  value,
  context,
  artifactPaths,
  allowNotApplicable = false
) {
  const gate = requireRecord(value, context);
  const status = requireString(gate.status, `${context}.status`);
  const allowed = allowNotApplicable
    ? new Set(['PASS', 'NOT_APPLICABLE'])
    : new Set(['PASS']);
  assert(allowed.has(status), `${context}.status is not supported`);
  verifyEvidenceReferences(gate.evidence, `${context}.evidence`, artifactPaths);
}

function verifyArtifacts(manifest, manifestDirectory) {
  const artifacts = requireArray(manifest.artifacts, 'artifacts');
  assert(artifacts.length > 0, 'artifacts must not be empty');
  const artifactPaths = new Set();
  const artifactHashes = new Map();
  const artifactFiles = new Map();
  for (const [index, value] of artifacts.entries()) {
    const context = `artifacts[${String(index)}]`;
    const artifact = requireRecord(value, context);
    const resolved = resolveEvidencePath(
      manifestDirectory,
      artifact.path,
      `${context}.path`
    );
    assert(
      !artifactPaths.has(resolved.relative),
      `${context}.path is duplicated`
    );
    const expectedBytes = requireNumber(artifact.bytes, `${context}.bytes`);
    const expectedSha256 = requireSha256(artifact.sha256, `${context}.sha256`);
    const classification = requireConcreteString(
      artifact.classification,
      `${context}.classification`
    );
    assert(
      ['PUBLIC_SANITIZED', 'INTERNAL_NO_PII'].includes(classification),
      `${context}.classification is not allowed in passing evidence`
    );
    assert(
      statSync(resolved.absolute).size === expectedBytes,
      `${context}.bytes drift`
    );
    assert(
      sha256File(resolved.absolute) === expectedSha256,
      `${context}.sha256 drift`
    );
    artifactPaths.add(resolved.relative);
    artifactHashes.set(resolved.relative, expectedSha256);
    artifactFiles.set(resolved.relative, resolved.absolute);
  }
  return { artifactPaths, artifactHashes, artifactFiles };
}

function verifyBoundArtifact(value, context, artifactHashes, artifactFiles) {
  const binding = requireRecord(value, context);
  const artifactPath = requireConcreteString(
    binding.path,
    `${context}.path`
  ).replaceAll('\\', '/');
  const artifactSha256 = requireSha256(binding.sha256, `${context}.sha256`);
  assert(
    artifactHashes.has(artifactPath),
    `${context}.path is not a hashed artifact`
  );
  assert(
    artifactHashes.get(artifactPath) === artifactSha256,
    `${context}.sha256 does not match the artifact`
  );
  const absolutePath = artifactFiles.get(artifactPath);
  assert(
    typeof absolutePath === 'string',
    `${context}.path cannot be resolved`
  );
  return { path: artifactPath, sha256: artifactSha256, absolutePath };
}

function verifyCanonicalGovernanceProposal(
  value,
  context,
  artifactHashes,
  artifactFiles
) {
  const bound = verifyBoundArtifact(
    value,
    context,
    artifactHashes,
    artifactFiles
  );
  assert(
    bound.sha256 === sha256File(STAGING_EXECUTION_GOVERNANCE_PATH) &&
      readFileSync(bound.absolutePath).equals(
        readFileSync(STAGING_EXECUTION_GOVERNANCE_PATH)
      ),
    `${context} does not match the canonical staging execution approval packet`
  );
  return bound;
}

function verifyCommands(manifest, artifactPaths, artifactHashes) {
  const commands = requireArray(manifest.commands, 'commands');
  assert(commands.length > 0, 'commands must not be empty');
  for (const [index, value] of commands.entries()) {
    const context = `commands[${String(index)}]`;
    const command = requireRecord(value, context);
    requireConcreteString(command.id, `${context}.id`);
    requireConcreteString(
      command.redactedCommand,
      `${context}.redactedCommand`
    );
    requireConcreteString(command.startedAt, `${context}.startedAt`);
    requireConcreteString(command.endedAt, `${context}.endedAt`);
    assert(command.exitCode === 0, `${context}.exitCode must be zero`);
    for (const stream of ['stdout', 'stderr']) {
      const streamPath = requireConcreteString(
        command[`${stream}Path`],
        `${context}.${stream}Path`
      ).replaceAll('\\', '/');
      const streamHash = requireSha256(
        command[`${stream}Sha256`],
        `${context}.${stream}Sha256`
      );
      assert(
        artifactPaths.has(streamPath),
        `${context}.${stream}Path is not an artifact`
      );
      assert(
        artifactHashes.get(streamPath) === streamHash,
        `${context}.${stream}Sha256 does not match the artifact`
      );
    }
  }
}

function verifyDirectRoleResults(
  value,
  context,
  artifactPaths,
  options,
  contract
) {
  const { surface, enabled } = options;
  assert(
    ['DATA_API', 'GRAPHQL'].includes(surface) && typeof enabled === 'boolean',
    `${context} verifier surface configuration is invalid`
  );
  const results = requireArray(value, context);
  const expectedRows = requireArray(contract.rows, `${context}.contract.rows`);
  assert(
    results.length === expectedRows.length && results.length > 0,
    `${context} result count does not match its approved contract`
  );
  const expectedById = new Map();
  for (const [index, value] of expectedRows.entries()) {
    const expectedContext = `${context}.contract.rows[${String(index)}]`;
    const expected = requireRecord(value, expectedContext);
    const caseId = requireConcreteString(
      expected.caseId,
      `${expectedContext}.caseId`
    );
    assert(
      !expectedById.has(caseId),
      `${expectedContext}.caseId is duplicated`
    );
    expectedById.set(caseId, expected);
  }
  const roles = new Set();
  const caseClasses = new Set();
  const observedIds = new Set();
  const dataApiCoverage = new Set();
  for (const [index, item] of results.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(item, rowContext);
    const caseId = requireConcreteString(row.caseId, `${rowContext}.caseId`);
    assert(!observedIds.has(caseId), `${rowContext}.caseId is duplicated`);
    observedIds.add(caseId);
    const expectedRow = requireRecord(
      expectedById.get(caseId),
      `${rowContext}.approvedContract`
    );
    const role = requireConcreteString(row.role, `${rowContext}.role`);
    assert(
      ['anon', 'authenticated', 'service_role'].includes(role),
      `${rowContext}.role is unsupported`
    );
    roles.add(role);
    for (const field of [
      'caseClass',
      'role',
      'actorId',
      'credentialHandle',
      'tokenProvenance',
      'sourceTenant',
      'targetTenant',
      'tenantDirection',
      'expectedAuthTokenSource',
      'expectedAuthActorId',
      'target',
      'targetObjectId',
      'targetObjectKind',
      'targetObjectIdentity',
      'aclInventoryCaseId',
      'operation',
      'httpMethod',
      'requestPath',
    ]) {
      const expectedValue = requireString(
        expectedRow[field],
        `${rowContext}.approvedContract.${field}`
      );
      const observed = [
        'sourceTenant',
        'targetTenant',
        'tenantDirection',
      ].includes(field)
        ? requireString(row[field], `${rowContext}.${field}`)
        : requireConcreteString(row[field], `${rowContext}.${field}`);
      assert(
        expectedValue === observed,
        `${rowContext}.${field} approval mismatch`
      );
    }
    for (const field of ['requestBodySha256', 'expectedResponseBodySha256']) {
      const value = requireSha256(row[field], `${rowContext}.${field}`);
      assert(
        expectedRow[field] === value,
        `${rowContext}.${field} approval mismatch`
      );
    }
    assert(
      row.observedResponseBodySha256 === row.expectedResponseBodySha256,
      `${rowContext}.observedResponseBodySha256 does not match the approved response body`
    );
    assert(
      row.tokenProvenance === row.expectedAuthTokenSource &&
        row.actorId === row.expectedAuthActorId,
      `${rowContext} actor and token provenance do not match the approved Auth identity`
    );
    const authTokenUse = requireRecord(
      row.authTokenUse,
      `${rowContext}.authTokenUse`
    );
    assertExactRecordKeys(
      authTokenUse,
      ['source', 'actorId', 'tokenHandleId', 'provenanceObservationId'],
      `${rowContext}.authTokenUse`
    );
    const approvedAuthTokenUse = requireRecord(
      expectedRow.authTokenUse,
      `${rowContext}.approvedContract.authTokenUse`
    );
    assert(
      authTokenUse.source === approvedAuthTokenUse.source &&
        authTokenUse.actorId === approvedAuthTokenUse.actorId,
      `${rowContext}.authTokenUse source or actor approval mismatch`
    );
    const notTenantScoped =
      row.sourceTenant === 'NOT_APPLICABLE' &&
      row.targetTenant === 'NOT_APPLICABLE' &&
      row.tenantDirection === 'NOT_APPLICABLE';
    if (role === 'anon') {
      assert(
        row.actorId === 'ANON_PUBLIC_ACTOR' &&
          row.credentialHandle === 'ANON_PUBLIC_KEY_HANDLE' &&
          row.tokenProvenance === 'ANON_PUBLIC_KEY_NO_USER_SESSION' &&
          authTokenUse.source === 'ANON_PUBLIC_KEY_NO_USER_SESSION' &&
          authTokenUse.actorId === row.actorId &&
          authTokenUse.tokenHandleId === 'ANON_PUBLIC_KEY_HANDLE' &&
          authTokenUse.provenanceObservationId === 'NOT_APPLICABLE' &&
          notTenantScoped,
        `${rowContext} anon credential provenance or tenant scope drift`
      );
    } else if (role === 'authenticated') {
      if (surface === 'GRAPHQL') {
        assert(
          row.actorId === 'synthetic_data_api_tenant_a' &&
            row.credentialHandle === 'HOSTED_AUTH_SESSION_HANDLE' &&
            row.tokenProvenance ===
              'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH' &&
            authTokenUse.source ===
              'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH' &&
            authTokenUse.actorId === row.actorId &&
            authTokenUse.tokenHandleId.endsWith('-refreshed-token-handle') &&
            authTokenUse.provenanceObservationId.endsWith('-refresh') &&
            authTokenUse.tokenHandleId !== 'DERIVED_AT_EXECUTION' &&
            authTokenUse.provenanceObservationId !== 'DERIVED_AT_EXECUTION' &&
            notTenantScoped,
          `${rowContext} disabled GraphQL authenticated credential provenance drift`
        );
      } else {
        const expectedActorByTenant = {
          tenant_a: 'synthetic_data_api_tenant_a',
          tenant_b: 'synthetic_data_api_tenant_b',
        };
        assert(
          row.credentialHandle === 'HOSTED_AUTH_SESSION_HANDLE' &&
            row.tokenProvenance ===
              'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH' &&
            authTokenUse.source ===
              'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH' &&
            authTokenUse.actorId === row.actorId &&
            authTokenUse.tokenHandleId.endsWith('-refreshed-token-handle') &&
            authTokenUse.provenanceObservationId.endsWith('-refresh') &&
            authTokenUse.tokenHandleId !== 'DERIVED_AT_EXECUTION' &&
            authTokenUse.provenanceObservationId !== 'DERIVED_AT_EXECUTION' &&
            expectedActorByTenant[row.sourceTenant] === row.actorId &&
            ['tenant_a', 'tenant_b'].includes(row.targetTenant),
          `${rowContext} authenticated actor, credential, or tenant provenance drift`
        );
        const direction = `${row.sourceTenant === 'tenant_a' ? 'A' : 'B'}_TO_${row.targetTenant === 'tenant_a' ? 'A' : 'B'}`;
        assert(
          row.tenantDirection === direction,
          `${rowContext}.tenantDirection does not match sourceTenant and targetTenant`
        );
      }
    } else {
      assert(
        row.actorId === 'SERVER_ONLY_SERVICE_ROLE_ACTOR' &&
          row.credentialHandle ===
            'SERVER_ONLY_SERVICE_ROLE_CREDENTIAL_HANDLE' &&
          row.tokenProvenance === 'SERVER_SECRET_STORE_RUNTIME_INJECTION' &&
          authTokenUse.source === 'SERVER_SECRET_STORE_RUNTIME_INJECTION' &&
          authTokenUse.actorId === row.actorId &&
          authTokenUse.tokenHandleId ===
            'SERVER_ONLY_SERVICE_ROLE_CREDENTIAL_HANDLE' &&
          authTokenUse.provenanceObservationId === 'NOT_APPLICABLE' &&
          notTenantScoped,
        `${rowContext} service-role credential provenance or server-only scope drift`
      );
    }
    caseClasses.add(row.caseClass);
    for (const field of [
      'expectedHttpStatus',
      'expectedRowCount',
      'expectedMutationCount',
    ]) {
      assert(
        Number.isInteger(row[field]) && row[field] >= 0,
        `${rowContext}.${field} must be a non-negative integer`
      );
      assert(
        expectedRow[field] === row[field],
        `${rowContext}.${field} approval mismatch`
      );
    }
    assert(
      typeof row.expectedSqlExecuted === 'boolean' &&
        expectedRow.expectedSqlExecuted === row.expectedSqlExecuted,
      `${rowContext}.expectedSqlExecuted approval mismatch`
    );
    for (const field of [
      'expectedSqlstate',
      'expectedAclOutcome',
      'expectedRlsOutcome',
      'expectedEndpointOutcome',
    ]) {
      const expectedValue = requireConcreteString(
        row[field],
        `${rowContext}.${field}`
      );
      assert(
        expectedRow[field] === expectedValue,
        `${rowContext}.${field} approval mismatch`
      );
    }
    for (const [expectedField, observedField] of [
      ['expectedHttpStatus', 'observedHttpStatus'],
      ['expectedSqlExecuted', 'observedSqlExecuted'],
      ['expectedSqlstate', 'observedSqlstate'],
      ['expectedRowCount', 'observedRowCount'],
      ['expectedMutationCount', 'observedMutationCount'],
      ['expectedAclOutcome', 'observedAclOutcome'],
      ['expectedRlsOutcome', 'observedRlsOutcome'],
      ['expectedEndpointOutcome', 'observedEndpointOutcome'],
    ]) {
      assert(
        row[observedField] === row[expectedField],
        `${rowContext}.${observedField} does not match ${expectedField}`
      );
    }
    assert(
      row.observedSqlExecuted === (row.observedSqlstate !== 'NOT_EXECUTED'),
      `${rowContext} SQL execution state mismatch`
    );
    assert(
      row.operation !== 'read' || row.observedMutationCount === 0,
      `${rowContext} read operation produced a mutation`
    );
    assert(
      row.requestPath.startsWith('/') &&
        (surface === 'GRAPHQL'
          ? row.httpMethod === 'POST' && row.requestPath === '/graphql/v1'
          : row.requestPath.startsWith('/rest/v1/')),
      `${rowContext} HTTP method or path is outside the approved API surface`
    );
    if (row.caseClass === 'DATA_API_RLS_FILTERED') {
      assertJsonEquivalent(
        tenantProbeControlApprovalView(
          row.tenantProbeControl,
          `${rowContext}.tenantProbeControl`
        ),
        tenantProbeControlApprovalView(
          expectedRow.tenantProbeControl,
          `${rowContext}.approvedTenantProbeControl`
        ),
        `${rowContext}.tenantProbeControl approval`
      );
      verifyTenantProbeControl(
        row.tenantProbeControl,
        `${rowContext}.tenantProbeControl`,
        row.target,
        row.targetTenant,
        row.operation,
        row.role,
        row.actorId
      );
    } else {
      assert(
        row.tenantProbeControl === undefined &&
          expectedRow.tenantProbeControl === undefined,
        `${rowContext}.tenantProbeControl is only valid for a Data API RLS denial`
      );
    }
    if (row.caseClass === 'DATA_API_ALLOW' && row.role === 'authenticated') {
      assertJsonEquivalent(
        row.tenantAllowControl,
        expectedRow.tenantAllowControl,
        `${rowContext}.tenantAllowControl approval`
      );
      verifyTenantAllowControl(
        row.tenantAllowControl,
        `${rowContext}.tenantAllowControl`,
        row
      );
    } else {
      assert(
        row.tenantAllowControl === undefined &&
          expectedRow.tenantAllowControl === undefined,
        `${rowContext}.tenantAllowControl is only valid for an authenticated Data API same-tenant allow`
      );
    }
    if (row.caseClass === 'DATA_API_ACL_DENY') {
      assert(
        surface === 'DATA_API' &&
          row.observedHttpStatus === 403 &&
          row.observedSqlExecuted === true &&
          row.observedSqlstate === '42501' &&
          row.observedRowCount === 0 &&
          row.observedMutationCount === 0 &&
          row.observedAclOutcome === 'ACL_DENIED' &&
          row.observedRlsOutcome === 'NOT_EVALUATED' &&
          row.observedEndpointOutcome === 'REQUEST_REJECTED',
        `${rowContext} non-waivable Data API ACL deny semantics drift`
      );
    } else if (row.caseClass === 'DATA_API_RLS_FILTERED') {
      assert(
        surface === 'DATA_API' &&
          row.observedHttpStatus === 200 &&
          row.observedSqlExecuted === true &&
          row.observedSqlstate === 'NONE' &&
          row.observedRowCount === 0 &&
          row.observedMutationCount === 0 &&
          row.observedAclOutcome === 'ACL_ALLOWED' &&
          row.observedRlsOutcome === 'RLS_FILTERED' &&
          row.observedEndpointOutcome === 'ALLOW',
        `${rowContext} non-waivable Data API RLS filter semantics drift`
      );
    } else if (row.caseClass === 'DATA_API_ALLOW') {
      assert(
        surface === 'DATA_API' &&
          row.observedHttpStatus === 200 &&
          row.observedSqlExecuted === true &&
          row.observedSqlstate === 'NONE' &&
          row.observedRowCount > 0 &&
          row.observedMutationCount === 0 &&
          row.observedAclOutcome === 'ACL_ALLOWED' &&
          ['RLS_ROW_ALLOWED', 'RLS_BYPASSED_SERVER_ONLY'].includes(
            row.observedRlsOutcome
          ) &&
          row.observedEndpointOutcome === 'ALLOW',
        `${rowContext} non-waivable Data API allow semantics drift`
      );
    } else if (row.caseClass === 'DATA_API_RPC_ALLOW') {
      assert(
        surface === 'DATA_API' &&
          role === 'service_role' &&
          row.targetObjectKind === 'FUNCTION' &&
          row.targetObjectIdentity ===
            'public.normalize_customer_phone(text)' &&
          row.target === row.targetObjectIdentity &&
          row.operation === 'rpc_read' &&
          row.httpMethod === 'POST' &&
          row.requestPath === '/rest/v1/rpc/normalize_customer_phone' &&
          row.requestBodySha256 === sha256Text('{"input":"03-1234-5678"}') &&
          row.expectedResponseBodySha256 === sha256Text('"0312345678"') &&
          row.observedHttpStatus === 200 &&
          row.observedSqlExecuted === true &&
          row.observedSqlstate === 'NONE' &&
          row.observedRowCount === 1 &&
          row.observedMutationCount === 0 &&
          row.observedAclOutcome === 'ACL_ALLOWED' &&
          row.observedRlsOutcome === 'NOT_EVALUATED' &&
          row.observedEndpointOutcome === 'ALLOW',
        `${rowContext} non-waivable service-role RPC semantics drift`
      );
    } else if (row.caseClass === 'GRAPHQL_DISABLED_ENDPOINT_REJECTION') {
      assert(
        surface === 'GRAPHQL' &&
          enabled === false &&
          row.observedHttpStatus === 404 &&
          row.observedSqlExecuted === false &&
          row.observedSqlstate === 'NOT_EXECUTED' &&
          row.observedRowCount === 0 &&
          row.observedMutationCount === 0 &&
          row.observedAclOutcome === 'NOT_EVALUATED' &&
          row.observedRlsOutcome === 'NOT_EVALUATED' &&
          row.observedEndpointOutcome === 'ENDPOINT_REJECTED',
        `${rowContext} non-waivable disabled GraphQL semantics drift`
      );
    } else {
      assert(false, `${rowContext}.caseClass is unsupported`);
    }
    if (surface === 'DATA_API') {
      const coverageKey = `${row.caseClass}|${role}|${row.targetObjectKind}|${row.tenantDirection}`;
      dataApiCoverage.add(coverageKey);
      if (row.caseClass === 'DATA_API_RLS_FILTERED') {
        assert(
          role === 'authenticated' &&
            ['A_TO_B', 'B_TO_A'].includes(row.tenantDirection),
          `${rowContext} filtered Data API case is not a bidirectional authenticated tenant denial`
        );
      }
      if (row.caseClass === 'DATA_API_ALLOW' && role === 'authenticated') {
        assert(
          row.tenantDirection === 'A_TO_A' &&
            row.observedRlsOutcome === 'RLS_ROW_ALLOWED',
          `${rowContext} authenticated Data API allow is not a same-tenant RLS allow control`
        );
      }
      if (row.caseClass === 'DATA_API_ALLOW' && role === 'service_role') {
        assert(
          row.tenantDirection === 'NOT_APPLICABLE' &&
            row.observedRlsOutcome === 'RLS_BYPASSED_SERVER_ONLY',
          `${rowContext} service-role Data API allow is not server-only bypass evidence`
        );
      }
      if (row.caseClass === 'DATA_API_RPC_ALLOW') {
        assert(
          role === 'service_role' &&
            row.targetObjectKind === 'FUNCTION' &&
            row.tenantDirection === 'NOT_APPLICABLE',
          `${rowContext} RPC evidence is not bound to the server-only function case`
        );
      }
    }
    const expectedAclVerdict =
      row.observedAclOutcome === 'NOT_EVALUATED' ? 'NOT_APPLICABLE' : 'PASS';
    const expectedRlsVerdict =
      row.observedRlsOutcome === 'NOT_EVALUATED' ? 'NOT_APPLICABLE' : 'PASS';
    assert(
      row.aclVerdict === expectedAclVerdict,
      `${rowContext}.aclVerdict does not match observed ACL evaluation`
    );
    assert(
      row.rlsVerdict === expectedRlsVerdict,
      `${rowContext}.rlsVerdict does not match observed RLS evaluation`
    );
    assert(row.status === 'PASS', `${rowContext}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${rowContext}.evidence`,
      artifactPaths
    );
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert(roles.has(role), `${context} is missing ${role}`);
  }
  const requiredCaseClasses =
    surface === 'DATA_API'
      ? [
          'DATA_API_ACL_DENY',
          'DATA_API_RLS_FILTERED',
          'DATA_API_ALLOW',
          'DATA_API_RPC_ALLOW',
        ]
      : ['GRAPHQL_DISABLED_ENDPOINT_REJECTION'];
  for (const caseClass of requiredCaseClasses) {
    assert(caseClasses.has(caseClass), `${context} is missing ${caseClass}`);
  }
  if (surface === 'DATA_API') {
    assert(
      results.length === 10,
      `${context} must contain exactly ten frozen Data API direct-role cases`
    );
    for (const coverageKey of [
      'DATA_API_ACL_DENY|anon|RELATION|NOT_APPLICABLE',
      'DATA_API_ACL_DENY|anon|COLUMN|NOT_APPLICABLE',
      'DATA_API_ACL_DENY|authenticated|RELATION|A_TO_A',
      'DATA_API_ACL_DENY|authenticated|COLUMN|A_TO_A',
      'DATA_API_RLS_FILTERED|authenticated|RELATION|A_TO_B',
      'DATA_API_RLS_FILTERED|authenticated|RELATION|B_TO_A',
      'DATA_API_ALLOW|authenticated|RELATION|A_TO_A',
      'DATA_API_ALLOW|authenticated|COLUMN|A_TO_A',
      'DATA_API_ALLOW|service_role|RELATION|NOT_APPLICABLE',
      'DATA_API_RPC_ALLOW|service_role|FUNCTION|NOT_APPLICABLE',
    ]) {
      assert(
        dataApiCoverage.has(coverageKey),
        `${context} is missing required direct-role coverage ${coverageKey}`
      );
    }
  }
  if (surface === 'GRAPHQL') {
    assert(
      enabled === false && results.length === 3,
      `${context} approved GraphQL mode must be disabled`
    );
  }
  return [...observedIds];
}

function verifyDataApiAclInventory(
  dataApi,
  context,
  manifest,
  expectedProjectRef,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  contract
) {
  const inventory = requireRecord(
    contract.aclInventory,
    `${context}.contract.aclInventory`
  );
  const roles = requireConcreteStringArray(
    inventory.roles,
    `${context}.contract.aclInventory.roles`
  );
  assertExactStringArray(
    roles,
    ['anon', 'authenticated', 'service_role'],
    `${context}.contract.aclInventory.roles`
  );
  const requiredKinds = requireConcreteStringArray(
    inventory.requiredObjectKinds,
    `${context}.contract.aclInventory.requiredObjectKinds`
  );
  assertJsonEquivalent(
    requireRecord(
      inventory.privilegeUniverse,
      `${context}.contract.aclInventory.privilegeUniverse`
    ),
    DATA_API_ACL_PRIVILEGE_UNIVERSE,
    `${context}.contract.aclInventory.privilegeUniverse`
  );
  assertExactStringArray(
    [...requiredKinds].sort(),
    [
      'COLUMN',
      'DEFAULT_PRIVILEGE',
      'FUNCTION',
      'RELATION',
      'SCHEMA',
      'SEQUENCE',
    ],
    `${context}.contract.aclInventory.requiredObjectKinds`
  );
  const readCatalog = (bindingValue, catalogContext, projectRef) => {
    const binding = verifyBoundArtifact(
      bindingValue,
      catalogContext,
      artifactHashes,
      artifactFiles
    );
    const catalog = readJsonFile(binding.absolutePath, catalogContext);
    const source = requireRecord(manifest.source, 'source');
    assert(
      catalog.schemaVersion === 1 &&
        catalog.resultType === 'DATA_API_ACL_OBJECT_CATALOG' &&
        catalog.status === 'CAPTURED' &&
        catalog.environmentProjectRef === projectRef &&
        catalog.gitCommit === source.gitCommit &&
        catalog.migrationHead === MIGRATION_HEAD,
      `${catalogContext} provenance or target mismatch`
    );
    const commandId = requireConcreteString(
      catalog.commandId,
      `${catalogContext}.commandId`
    );
    const command = requireArray(manifest.commands, 'commands')
      .map((value, index) => requireRecord(value, `commands[${String(index)}]`))
      .find(value => value.id === commandId);
    assert(
      command,
      `${catalogContext}.commandId is absent from manifest.commands`
    );
    assert(
      catalog.capturedAt === command.endedAt,
      `${catalogContext}.capturedAt is not bound to its command`
    );
    assertExactStringArray(
      requireConcreteStringArray(
        catalog.exposedSchemas,
        `${catalogContext}.exposedSchemas`
      ),
      requireConcreteStringArray(
        requireRecord(
          contract.configuration,
          `${context}.contract.configuration`
        ).exposedSchemas,
        `${context}.contract.configuration.exposedSchemas`
      ),
      `${catalogContext}.exposedSchemas`
    );
    assertExactStringArray(
      requireConcreteStringArray(catalog.roles, `${catalogContext}.roles`),
      roles,
      `${catalogContext}.roles`
    );
    const scope = requireRecord(catalog.scope, `${catalogContext}.scope`);
    assertExactRecordKeys(
      scope,
      [
        'source',
        'schemasFromProjectSettings',
        'relationRelkinds',
        'sequenceRelkind',
        'columnsIncluded',
        'functionIdentityArgumentsIncluded',
        'defaultPrivilegeOwners',
        'defaultPrivilegeObjectTypes',
      ],
      `${catalogContext}.scope`
    );
    assert(
      scope.source === 'POST_REPLAY_PG_CATALOG' &&
        scope.schemasFromProjectSettings === true &&
        scope.sequenceRelkind === 'S' &&
        scope.columnsIncluded === true &&
        scope.functionIdentityArgumentsIncluded === true,
      `${catalogContext}.scope is not catalog-complete`
    );
    assertExactStringArray(
      requireConcreteStringArray(
        scope.relationRelkinds,
        `${catalogContext}.scope.relationRelkinds`
      ),
      ['r', 'p', 'v', 'm', 'f'],
      `${catalogContext}.scope.relationRelkinds`
    );
    assertExactStringArray(
      requireConcreteStringArray(
        scope.defaultPrivilegeOwners,
        `${catalogContext}.scope.defaultPrivilegeOwners`
      ),
      ['postgres', 'supabase_admin'],
      `${catalogContext}.scope.defaultPrivilegeOwners`
    );
    assertExactStringArray(
      requireConcreteStringArray(
        scope.defaultPrivilegeObjectTypes,
        `${catalogContext}.scope.defaultPrivilegeObjectTypes`
      ),
      ['TABLES', 'SEQUENCES', 'FUNCTIONS', 'TYPES', 'SCHEMAS'],
      `${catalogContext}.scope.defaultPrivilegeObjectTypes`
    );
    const exposedSchemas = requireConcreteStringArray(
      catalog.exposedSchemas,
      `${catalogContext}.exposedSchemas`
    );
    const objects = requireArray(
      catalog.objects,
      `${catalogContext}.objects`
    ).map((value, index) => {
      const objectContext = `${catalogContext}.objects[${String(index)}]`;
      const object = requireRecord(value, objectContext);
      assertExactRecordKeys(
        object,
        [
          'objectId',
          'objectKind',
          'objectIdentity',
          'privilegeSetId',
          'applicablePrivileges',
        ],
        objectContext
      );
      const objectId = requireConcreteString(
        object.objectId,
        `${objectContext}.objectId`
      );
      const objectKind = requireConcreteString(
        object.objectKind,
        `${objectContext}.objectKind`
      );
      const objectIdentity = requireConcreteString(
        object.objectIdentity,
        `${objectContext}.objectIdentity`
      );
      const privilegeSetId = requireConcreteString(
        object.privilegeSetId,
        `${objectContext}.privilegeSetId`
      );
      assert(
        requiredKinds.includes(objectKind),
        `${objectContext}.objectKind is outside the required ACL catalog kinds`
      );
      const applicablePrivileges = requireConcreteStringArray(
        object.applicablePrivileges,
        `${objectContext}.applicablePrivileges`
      );
      assert(
        applicablePrivileges.length > 0 &&
          new Set(applicablePrivileges).size === applicablePrivileges.length,
        `${objectContext}.applicablePrivileges must be non-empty and unique`
      );
      let expectedPrivilegeSetId =
        DATA_API_ACL_PRIVILEGE_SET_BY_OBJECT_KIND.get(objectKind);
      if (objectKind === 'DEFAULT_PRIVILEGE') {
        const match =
          /^default:(postgres|supabase_admin):(GLOBAL|[a-z_][a-z0-9_]*):(TABLES|SEQUENCES|FUNCTIONS|TYPES|SCHEMAS)$/u.exec(
            objectId
          );
        assert(match, `${objectContext}.objectId is not canonical`);
        const [, owner, scopeName, objectType] = match;
        assert(
          objectIdentity === `${owner}:${scopeName}:${objectType}` &&
            (objectType === 'SCHEMAS'
              ? scopeName === 'GLOBAL'
              : scopeName === 'GLOBAL' || exposedSchemas.includes(scopeName)),
          `${objectContext} default-privilege identity or scope drift`
        );
        expectedPrivilegeSetId =
          DATA_API_ACL_DEFAULT_PRIVILEGE_SET_BY_OBJECT_TYPE.get(objectType);
      } else {
        assert(
          objectId === `${objectKind.toLowerCase()}:${objectIdentity}`,
          `${objectContext}.objectId is not canonical`
        );
      }
      assert(
        privilegeSetId === expectedPrivilegeSetId,
        `${objectContext}.privilegeSetId does not match its object kind`
      );
      assertExactStringArray(
        applicablePrivileges,
        DATA_API_ACL_PRIVILEGE_UNIVERSE[privilegeSetId],
        `${objectContext}.applicablePrivileges`
      );
      return {
        objectId,
        objectKind,
        objectIdentity,
        privilegeSetId,
        applicablePrivileges,
      };
    });
    const objectIds = objects.map(object => object.objectId);
    assert(
      new Set(objectIds).size === objectIds.length,
      `${catalogContext}.objects contains duplicate objectId values`
    );
    assert(
      new Set(
        objects.map(
          object => `${object.objectKind}\u0000${object.objectIdentity}`
        )
      ).size === objects.length,
      `${catalogContext}.objects contains duplicate kind/identity values`
    );
    for (const schemaName of exposedSchemas) {
      assert(
        objectIds.includes(`schema:${schemaName}`),
        `${catalogContext}.objects is missing exposed schema ${schemaName}`
      );
    }
    for (const owner of ['postgres', 'supabase_admin']) {
      for (const objectType of [
        'TABLES',
        'SEQUENCES',
        'FUNCTIONS',
        'TYPES',
        'SCHEMAS',
      ]) {
        const scopes =
          objectType === 'SCHEMAS' ? ['GLOBAL'] : ['GLOBAL', ...exposedSchemas];
        for (const scopeName of scopes) {
          assert(
            objectIds.includes(`default:${owner}:${scopeName}:${objectType}`),
            `${catalogContext}.objects is missing normalized default privileges for ${owner}:${scopeName}:${objectType}`
          );
        }
      }
    }
    return { binding, objects };
  };
  const sourceCatalogBinding = requireRecord(
    inventory.sourceCatalog,
    `${context}.contract.aclInventory.sourceCatalog`
  );
  const sourceCatalogPreview = readJsonFile(
    verifyBoundArtifact(
      sourceCatalogBinding,
      `${context}.contract.aclInventory.sourceCatalog`,
      artifactHashes,
      artifactFiles
    ).absolutePath,
    `${context}.contract.aclInventory.sourceCatalog`
  );
  const sourceProjectRef = requireNonProductionProjectRef(
    sourceCatalogPreview.environmentProjectRef,
    `${context}.contract.aclInventory.sourceCatalog.environmentProjectRef`
  );
  const sourceCatalog = readCatalog(
    sourceCatalogBinding,
    `${context}.contract.aclInventory.sourceCatalog`,
    sourceProjectRef
  );
  const runtimeCatalog = readCatalog(
    {
      path: dataApi.aclCatalogPath,
      sha256: dataApi.aclCatalogSha256,
    },
    `${context}.runtimeCatalog`,
    expectedProjectRef
  );
  assertJsonEquivalent(
    runtimeCatalog.objects,
    sourceCatalog.objects,
    `${context}.runtimeCatalog object parity`
  );
  if (expectedProjectRef !== sourceProjectRef) {
    assert(
      runtimeCatalog.binding.path !== sourceCatalog.binding.path,
      `${context}.runtimeCatalog reuses source evidence`
    );
  }
  const expectedTupleKeys = new Set();
  for (const object of sourceCatalog.objects) {
    for (const privilege of object.applicablePrivileges) {
      for (const role of roles) {
        expectedTupleKeys.add(
          `${object.objectId}\u0000${privilege}\u0000${role}`
        );
      }
    }
  }
  const expectedRows = requireArray(
    inventory.cases,
    `${context}.contract.aclInventory.cases`
  );
  const results = requireArray(dataApi.aclInventoryResults, context);
  assert(
    results.length === expectedRows.length &&
      results.length === expectedTupleKeys.size &&
      results.length > 0,
    `${context} does not cover the complete post-replay ACL catalog cross product`
  );
  const expectedById = new Map();
  const expectedObservedTupleKeys = new Set();
  for (const [index, value] of expectedRows.entries()) {
    const expected = requireRecord(
      value,
      `${context}.contract.aclInventory.cases[${String(index)}]`
    );
    const caseId = requireConcreteString(
      expected.caseId,
      `${context}.contract.aclInventory.cases[${String(index)}].caseId`
    );
    assert(
      !expectedById.has(caseId),
      `${context} contract duplicates ${caseId}`
    );
    const tupleKey = `${expected.objectId}\u0000${expected.privilege}\u0000${expected.role}`;
    assert(
      expectedTupleKeys.has(tupleKey),
      `${context} contract case ${caseId} is not derived from the ACL catalog`
    );
    assert(
      !expectedObservedTupleKeys.has(tupleKey),
      `${context} contract duplicates ACL tuple ${tupleKey}`
    );
    expectedObservedTupleKeys.add(tupleKey);
    expectedById.set(caseId, expected);
  }
  assertExactStringArray(
    [...expectedObservedTupleKeys].sort(),
    [...expectedTupleKeys].sort(),
    `${context}.contract ACL tuple coverage`
  );
  const observedIds = [];
  const rowsByCaseId = new Map();
  const observedKinds = new Set();
  const schemaCaseIds = [];
  for (const [index, value] of results.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(value, rowContext);
    const caseId = requireConcreteString(row.caseId, `${rowContext}.caseId`);
    const expected = requireRecord(
      expectedById.get(caseId),
      `${rowContext}.approvedContract`
    );
    assert(!observedIds.includes(caseId), `${rowContext}.caseId is duplicated`);
    observedIds.push(caseId);
    rowsByCaseId.set(caseId, row);
    for (const field of [
      'objectId',
      'objectKind',
      'objectIdentity',
      'role',
      'privilege',
      'expectedSqlstate',
      'expectedAclOutcome',
    ]) {
      assert(
        requireConcreteString(row[field], `${rowContext}.${field}`) ===
          expected[field],
        `${rowContext}.${field} approval mismatch`
      );
    }
    assert(
      typeof row.expectedDirectGrant === 'boolean' &&
        typeof row.expectedPublicGrant === 'boolean' &&
        typeof row.expectedInheritedGrant === 'boolean' &&
        typeof row.expectedGranted === 'boolean' &&
        row.expectedDirectGrant === expected.expectedDirectGrant &&
        row.expectedPublicGrant === expected.expectedPublicGrant &&
        row.expectedInheritedGrant === expected.expectedInheritedGrant &&
        row.expectedGranted === expected.expectedGranted &&
        row.expectedGranted ===
          (row.expectedDirectGrant ||
            row.expectedPublicGrant ||
            row.expectedInheritedGrant) &&
        row.observedDirectGrant === row.expectedDirectGrant &&
        row.observedPublicGrant === row.expectedPublicGrant &&
        row.observedInheritedGrant === row.expectedInheritedGrant &&
        row.observedGranted === row.expectedGranted &&
        row.observedGranted ===
          (row.observedDirectGrant ||
            row.observedPublicGrant ||
            row.observedInheritedGrant) &&
        row.observedSqlstate === row.expectedSqlstate &&
        row.observedAclOutcome === row.expectedAclOutcome &&
        row.status === 'PASS',
      `${rowContext} observed ACL result does not match the approved outcome`
    );
    assert(
      roles.includes(row.role) && row.expectedSqlstate === 'NONE',
      `${rowContext}.role is unsupported`
    );
    assert(
      row.expectedAclOutcome ===
        (row.expectedGranted ? 'ACL_ALLOWED' : 'ACL_DENIED'),
      `${rowContext}.expectedAclOutcome does not match expected effective grant`
    );
    observedKinds.add(row.objectKind);
    if (row.objectKind === 'SCHEMA') schemaCaseIds.push(caseId);
    verifyEvidenceReferences(
      row.evidence,
      `${rowContext}.evidence`,
      artifactPaths
    );
  }
  assertExactStringArray(
    [...observedKinds].sort(),
    [...requiredKinds].sort(),
    `${context}.objectKinds`
  );
  return { caseIds: observedIds, schemaCaseIds, rowsByCaseId };
}

function verifyDataApiDirectRoleAclBindings(dataApi, aclInventory, context) {
  const inventoryRows = aclInventory.rowsByCaseId;
  assert(
    inventoryRows instanceof Map,
    `${context} ACL inventory lookup is unavailable`
  );
  const rows = requireArray(dataApi.directRoleResults, context);
  for (const [index, value] of rows.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(value, rowContext);
    const aclCaseId = requireConcreteString(
      row.aclInventoryCaseId,
      `${rowContext}.aclInventoryCaseId`
    );
    const aclRow = requireRecord(
      inventoryRows.get(aclCaseId),
      `${rowContext}.aclInventoryCase`
    );
    const expectedPrivilege =
      row.caseClass === 'DATA_API_RPC_ALLOW' ? 'EXECUTE' : 'SELECT';
    const expectedGranted = row.caseClass !== 'DATA_API_ACL_DENY';
    assert(
      aclRow.objectId === row.targetObjectId &&
        aclRow.objectKind === row.targetObjectKind &&
        aclRow.objectIdentity === row.targetObjectIdentity &&
        aclRow.role === row.role &&
        aclRow.privilege === expectedPrivilege &&
        aclRow.observedGranted === expectedGranted &&
        aclRow.observedAclOutcome === row.observedAclOutcome,
      `${rowContext} does not bind to the matching catalog-derived ACL result`
    );
  }
}

function verifyCoveredGate(
  value,
  context,
  artifactPaths,
  expectedCaseIds,
  allowNotApplicable = false
) {
  verifyPassedGate(value, context, artifactPaths, allowNotApplicable);
  const gate = requireRecord(value, context);
  const coveredCaseIds = requireConcreteStringArray(
    gate.coveredCaseIds,
    `${context}.coveredCaseIds`,
    { allowEmpty: true }
  );
  assert(
    new Set(coveredCaseIds).size === coveredCaseIds.length,
    `${context}.coveredCaseIds contains duplicates`
  );
  assertExactStringArray(
    [...coveredCaseIds].sort(),
    [...expectedCaseIds].sort(),
    `${context}.coveredCaseIds`
  );
}

function verifyEnvironment(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  executionManifest = manifest,
  approvedProvisioningEnvironment
) {
  const approvedEnvironment = requireRecord(
    approvedProvisioningEnvironment,
    'approvedProvisioningEnvironment'
  );
  const environment = requireRecord(manifest.environment, 'environment');
  for (const field of [
    'organizationId',
    'organizationPlan',
    'projectRef',
    'projectName',
    'projectUrl',
    'databaseHost',
    'databaseConnectionMode',
    'databaseUser',
    'region',
    'databaseTier',
    'databaseVersion',
    'systemIdentifier',
  ]) {
    requireConcreteString(environment[field], `environment.${field}`);
  }
  const projectRef = requireNonProductionProjectRef(
    environment.projectRef,
    'environment.projectRef'
  );
  const projectUrl = new URL(
    requireConcreteString(environment.projectUrl, 'environment.projectUrl')
  );
  assert(
    projectUrl.protocol === 'https:' &&
      projectUrl.hostname === `${projectRef}.supabase.co`,
    'environment.projectUrl does not match the approved project ref'
  );
  verifyDirectDatabaseIdentity(environment, 'environment');
  verifyAuthProvisioning(
    environment.authProvisioning,
    'environment.authProvisioning'
  );

  const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
  const dataApiMatrix = verifyBoundArtifact(
    { path: dataApi.matrixPath, sha256: dataApi.matrixSha256 },
    'environment.dataApi.matrix',
    artifactHashes,
    artifactFiles
  );
  const dataApiContract = readJsonFile(
    dataApiMatrix.absolutePath,
    'environment.dataApi.matrixContract'
  );
  assert(
    dataApiContract.schemaVersion === 1,
    'Data API matrix schemaVersion drift'
  );
  assert(
    dataApiContract.matrixId === dataApi.matrixId,
    'environment.dataApi.matrixId approval mismatch'
  );
  const dataApiConfiguration = requireRecord(
    dataApiContract.configuration,
    'environment.dataApi.matrixContract.configuration'
  );
  assert(
    typeof dataApi.enabled === 'boolean',
    'environment.dataApi.enabled must be boolean'
  );
  assert(
    dataApi.enabled === dataApiConfiguration.enabled,
    'environment.dataApi.enabled approval mismatch'
  );
  const exposedSchemas = requireConcreteStringArray(
    dataApi.exposedSchemas,
    'environment.dataApi.exposedSchemas'
  );
  const approvedExposedSchemas = requireConcreteStringArray(
    dataApiConfiguration.exposedSchemas,
    'environment.dataApi.matrixContract.configuration.exposedSchemas'
  );
  assertExactStringArray(
    exposedSchemas,
    approvedExposedSchemas,
    'environment.dataApi.exposedSchemas'
  );
  const automaticGrants = requireConcreteString(
    dataApi.automaticGrants,
    'environment.dataApi.automaticGrants'
  );
  assert(
    automaticGrants === dataApiConfiguration.automaticGrants,
    'environment.dataApi.automaticGrants approval mismatch'
  );
  const approvedDataApiProvisioning = requireRecord(
    approvedEnvironment.dataApiProvisioning,
    'approvedProvisioningEnvironment.dataApiProvisioning'
  );
  const approvedAutomaticGrants =
    approvedDataApiProvisioning.automaticallyExposeNewTablesAndFunctions ===
    false
      ? 'disabled'
      : 'enabled';
  assert(
    dataApi.enabled === approvedDataApiProvisioning.enabled &&
      automaticGrants === approvedAutomaticGrants,
    'environment.dataApi runtime configuration differs from approved provisioning'
  );
  assertExactStringArray(
    exposedSchemas,
    requireConcreteStringArray(
      approvedDataApiProvisioning.exposedSchemas,
      'approvedProvisioningEnvironment.dataApiProvisioning.exposedSchemas'
    ),
    'environment.dataApi approved provisioning exposed schemas'
  );
  const defaults = requireRecord(
    dataApi.defaultPrivileges,
    'environment.dataApi.defaultPrivileges'
  );
  const approvedDefaults = requireRecord(
    dataApiConfiguration.defaultPrivileges,
    'environment.dataApi.matrixContract.configuration.defaultPrivileges'
  );
  for (const field of ['postgres', 'supabaseAdmin']) {
    const observed = requireConcreteString(
      defaults[field],
      `environment.dataApi.defaultPrivileges.${field}`
    );
    const approved = requireConcreteString(
      approvedDefaults[field],
      `environment.dataApi.matrixContract.configuration.defaultPrivileges.${field}`
    );
    assert(
      observed === approved,
      `environment.dataApi.defaultPrivileges.${field} approval mismatch`
    );
  }
  const dataApiCaseIds = verifyDirectRoleResults(
    dataApi.directRoleResults,
    'environment.dataApi.directRoleResults',
    artifactPaths,
    { surface: 'DATA_API', enabled: dataApi.enabled },
    dataApiContract
  );
  const dataApiAclInventory = verifyDataApiAclInventory(
    dataApi,
    'environment.dataApi.aclInventoryResults',
    executionManifest,
    projectRef,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    dataApiContract
  );
  verifyDataApiDirectRoleAclBindings(
    dataApi,
    dataApiAclInventory,
    'environment.dataApi.directRoleResults'
  );
  verifyCoveredGate(
    dataApi.schemaUsage,
    'environment.dataApi.schemaUsage',
    artifactPaths,
    dataApiAclInventory.schemaCaseIds
  );
  verifyCoveredGate(
    dataApi.objectAcl,
    'environment.dataApi.objectAcl',
    artifactPaths,
    dataApiAclInventory.caseIds
  );
  verifyCoveredGate(
    dataApi.aclVerdict,
    'environment.dataApi.aclVerdict',
    artifactPaths,
    [...dataApiCaseIds, ...dataApiAclInventory.caseIds]
  );
  verifyCoveredGate(
    dataApi.rlsVerdict,
    'environment.dataApi.rlsVerdict',
    artifactPaths,
    dataApiCaseIds
  );

  const graphQl = requireRecord(environment.graphQl, 'environment.graphQl');
  const graphQlMatrix = verifyBoundArtifact(
    { path: graphQl.matrixPath, sha256: graphQl.matrixSha256 },
    'environment.graphQl.matrix',
    artifactHashes,
    artifactFiles
  );
  const graphQlContract = readJsonFile(
    graphQlMatrix.absolutePath,
    'environment.graphQl.matrixContract'
  );
  assert(
    graphQlContract.schemaVersion === 1,
    'GraphQL matrix schemaVersion drift'
  );
  assert(
    graphQlContract.matrixId === graphQl.matrixId,
    'environment.graphQl.matrixId approval mismatch'
  );
  const graphQlConfiguration = requireRecord(
    graphQlContract.configuration,
    'environment.graphQl.matrixContract.configuration'
  );
  const installedVersion = requireConcreteString(
    graphQl.installedVersion,
    'environment.graphQl.installedVersion'
  );
  assert(
    installedVersion === graphQlConfiguration.installedVersion,
    'environment.graphQl.installedVersion approval mismatch'
  );
  assert(
    typeof graphQl.enabled === 'boolean',
    'environment.graphQl.enabled must be boolean'
  );
  assert(
    graphQl.enabled === graphQlConfiguration.enabled,
    'environment.graphQl.enabled approval mismatch'
  );
  const graphQlExposedSchemas = requireConcreteStringArray(
    graphQl.exposedSchemas,
    'environment.graphQl.exposedSchemas',
    { allowEmpty: true }
  );
  const approvedGraphQlExposedSchemas = requireConcreteStringArray(
    graphQlConfiguration.exposedSchemas,
    'environment.graphQl.matrixContract.configuration.exposedSchemas',
    { allowEmpty: true }
  );
  assertExactStringArray(
    graphQlExposedSchemas,
    approvedGraphQlExposedSchemas,
    'environment.graphQl.exposedSchemas'
  );
  const introspection = requireConcreteString(
    graphQl.introspection,
    'environment.graphQl.introspection'
  );
  assert(
    introspection === graphQlConfiguration.introspection,
    'environment.graphQl.introspection approval mismatch'
  );
  const approvedGraphQlProvisioning = requireRecord(
    approvedEnvironment.graphQlProvisioning,
    'approvedProvisioningEnvironment.graphQlProvisioning'
  );
  const approvedGraphQlEnabled =
    approvedGraphQlProvisioning.pgGraphqlEnabled === true;
  const approvedIntrospection =
    approvedGraphQlProvisioning.introspectionEnabled === true
      ? 'enabled'
      : 'disabled';
  assert(
    graphQl.enabled === approvedGraphQlEnabled &&
      introspection === approvedIntrospection,
    'environment.graphQl runtime configuration differs from approved provisioning'
  );
  assertExactStringArray(
    graphQlExposedSchemas,
    requireConcreteStringArray(
      approvedGraphQlProvisioning.exposedSchemas,
      'approvedProvisioningEnvironment.graphQlProvisioning.exposedSchemas',
      { allowEmpty: true }
    ),
    'environment.graphQl approved provisioning exposed schemas'
  );
  const graphQlCaseIds = verifyDirectRoleResults(
    graphQl.directRoleResults,
    'environment.graphQl.directRoleResults',
    artifactPaths,
    { surface: 'GRAPHQL', enabled: graphQl.enabled },
    graphQlContract
  );
  verifyCoveredGate(
    graphQl.tenantBoundary,
    'environment.graphQl.tenantBoundary',
    artifactPaths,
    [],
    !graphQl.enabled
  );
  verifyCoveredGate(
    graphQl.fieldVisibility,
    'environment.graphQl.fieldVisibility',
    artifactPaths,
    [],
    !graphQl.enabled
  );
  verifyCoveredGate(
    graphQl.disabledEndpointRejection,
    'environment.graphQl.disabledEndpointRejection',
    artifactPaths,
    graphQlCaseIds,
    graphQl.enabled
  );
  if (graphQl.enabled) {
    assert(
      requireRecord(
        graphQl.disabledEndpointRejection,
        'disabledEndpointRejection'
      ).status === 'NOT_APPLICABLE',
      'enabled GraphQL must evidence why disabled endpoint rejection is NOT_APPLICABLE'
    );
  } else {
    assert(
      requireRecord(
        graphQl.disabledEndpointRejection,
        'disabledEndpointRejection'
      ).status === 'PASS',
      'disabled GraphQL requires endpoint rejection PASS'
    );
  }
}

function verifySecurityTargetInventory(
  manifest,
  matrix,
  expectedProjectRef,
  contract,
  artifactHashes,
  artifactFiles
) {
  const inventoryBinding = verifyBoundArtifact(
    contract.targetInventory,
    'securityMatrix.contract.targetInventory',
    artifactHashes,
    artifactFiles
  );
  const inventory = readJsonFile(
    inventoryBinding.absolutePath,
    'securityMatrix.contract.targetInventory'
  );
  assert(
    inventory.schemaVersion === 1 &&
      inventory.status === 'APPROVED_FOR_EXECUTION',
    'security target inventory is not approved for execution'
  );
  requireConcreteString(
    inventory.inventoryId,
    'securityMatrix.contract.targetInventory.inventoryId'
  );
  const readCatalog = (bindingValue, context, projectRef) => {
    const binding = verifyBoundArtifact(
      bindingValue,
      context,
      artifactHashes,
      artifactFiles
    );
    const catalog = readJsonFile(binding.absolutePath, context);
    assert(
      catalog.schemaVersion === 1 &&
        catalog.resultType === 'SECURITY_TARGET_CATALOG' &&
        catalog.status === 'CAPTURED' &&
        catalog.environmentProjectRef === projectRef &&
        catalog.gitCommit === manifest.source.gitCommit &&
        catalog.migrationHead === MIGRATION_HEAD,
      `${context} provenance or target mismatch`
    );
    const commandId = requireConcreteString(
      catalog.commandId,
      `${context}.commandId`
    );
    const command = requireArray(manifest.commands, 'commands')
      .map((value, index) => requireRecord(value, `commands[${String(index)}]`))
      .find(value => value.id === commandId);
    assert(command, `${context}.commandId is absent from manifest.commands`);
    assert(
      catalog.capturedAt === command.endedAt,
      `${context}.capturedAt is not bound to its command`
    );
    const scope = requireRecord(catalog.scope, `${context}.scope`);
    assertExactStringArray(
      requireConcreteStringArray(scope.schemas, `${context}.scope.schemas`),
      ['public'],
      `${context}.scope.schemas`
    );
    assertExactStringArray(
      requireConcreteStringArray(scope.relkinds, `${context}.scope.relkinds`),
      ['r', 'p'],
      `${context}.scope.relkinds`
    );
    const authTargets = requireConcreteStringArray(
      scope.requiredAuthTargets,
      `${context}.scope.requiredAuthTargets`
    );
    assertExactStringArray(
      [...authTargets].sort(),
      ['auth.identities', 'auth.users'],
      `${context}.scope.requiredAuthTargets`
    );
    const relationRows = requireArray(
      catalog.relations,
      `${context}.relations`
    );
    assert(relationRows.length > 0, `${context}.relations must not be empty`);
    const relations = [];
    const seen = new Set();
    for (const [index, value] of relationRows.entries()) {
      const rowContext = `${context}.relations[${String(index)}]`;
      const row = requireRecord(value, rowContext);
      assertExactRecordKeys(
        row,
        ['relation', 'relkind', 'owner', 'rlsEnabled', 'rlsForced'],
        rowContext
      );
      const relation = requireConcreteString(
        row.relation,
        `${rowContext}.relation`
      );
      assert(
        relation.startsWith('public.') &&
          ['r', 'p'].includes(row.relkind) &&
          typeof row.rlsEnabled === 'boolean' &&
          typeof row.rlsForced === 'boolean',
        `${rowContext} is outside the approved public r/p catalog scope`
      );
      requireConcreteString(row.owner, `${rowContext}.owner`);
      assert(!seen.has(relation), `${rowContext}.relation is duplicated`);
      seen.add(relation);
      relations.push(relation);
    }
    assertExactStringArray(
      relations,
      [...relations].sort((left, right) => left.localeCompare(right, 'en')),
      `${context}.relations sort order`
    );
    return {
      binding,
      relations: [...relations, ...authTargets].sort((left, right) =>
        left.localeCompare(right, 'en')
      ),
    };
  };
  const sourceProjectRef = requireNonProductionProjectRef(
    requireRecord(manifest.environment, 'environment').projectRef,
    'environment.projectRef'
  );
  const sourceCatalog = readCatalog(
    inventory.sourceCatalog,
    'securityMatrix.contract.targetInventory.sourceCatalog',
    sourceProjectRef
  );
  const runtimeCatalog = readCatalog(
    {
      path: matrix.targetCatalogPath,
      sha256: matrix.targetCatalogSha256,
    },
    'securityMatrix.targetCatalog',
    expectedProjectRef
  );
  assertExactStringArray(
    runtimeCatalog.relations,
    sourceCatalog.relations,
    'securityMatrix runtime catalog parity with approved source catalog'
  );
  if (expectedProjectRef !== sourceProjectRef) {
    assert(
      runtimeCatalog.binding.path !== sourceCatalog.binding.path,
      'post-restore security target catalog reuses source evidence'
    );
  }
  const representativeBinding = verifyBoundArtifact(
    inventory.representativeDataContract,
    'securityMatrix.contract.targetInventory.representativeDataContract',
    artifactHashes,
    artifactFiles
  );
  const representative = readJsonFile(
    representativeBinding.absolutePath,
    'securityMatrix.contract.targetInventory.representativeDataContract'
  );
  const manifestRepresentative = requireRecord(
    manifest.representativeData,
    'representativeData'
  );
  assertBindingMatch(
    manifestRepresentative.contractPath,
    manifestRepresentative.contractSha256,
    representativeBinding,
    'security target inventory representative data contract'
  );
  const explicitTargets = requireRecord(
    requireRecord(
      representative.explicitPersistentRowTargets,
      'security target inventory representativeData.explicitPersistentRowTargets'
    ).byRelation,
    'security target inventory representativeData.explicitPersistentRowTargets.byRelation'
  );
  const derivedTargets = requireRecord(
    requireRecord(
      representative.derivedRows,
      'security target inventory representativeData.derivedRows'
    ).byRelation,
    'security target inventory representativeData.derivedRows.byRelation'
  );
  const canonicalProbeRelations = requireConcreteStringArray(
    inventory.canonicalProbeRelations,
    'securityMatrix.contract.targetInventory.canonicalProbeRelations'
  );
  assertExactStringArray(
    [...canonicalProbeRelations].sort(),
    [...REQUIRED_CANONICAL_SECURITY_TARGETS].sort(),
    'securityMatrix.contract.targetInventory.canonicalProbeRelations'
  );
  const expectedRelations = new Set(sourceCatalog.relations);
  for (const relation of canonicalProbeRelations) {
    assert(
      expectedRelations.has(relation),
      `security target catalog is missing canonical probe relation ${relation}`
    );
  }
  for (const [sourceName, source] of [
    ['explicit', explicitTargets],
    ['derived', derivedTargets],
  ]) {
    for (const [relation, value] of Object.entries(source)) {
      const qualifiedRelation = requireConcreteString(
        relation,
        `security target inventory ${sourceName} representative relation`
      );
      assert(
        Number.isInteger(value) && value >= 0,
        `security target inventory ${sourceName} row count is invalid for ${qualifiedRelation}`
      );
      if (value > 0) {
        assert(
          expectedRelations.has(qualifiedRelation),
          `security target inventory ${sourceName} fixture relation is absent from the post-replay catalog: ${qualifiedRelation}`
        );
      }
    }
  }
  const inventoryRelations = requireConcreteStringArray(
    inventory.relations,
    'securityMatrix.contract.targetInventory.relations'
  );
  assertExactStringArray(
    [...inventoryRelations].sort(),
    [...expectedRelations].sort(),
    'security target inventory post-replay catalog coverage'
  );
  const classificationBinding = verifyBoundArtifact(
    inventory.classificationContract,
    'securityMatrix.contract.targetInventory.classificationContract',
    artifactHashes,
    artifactFiles
  );
  const classificationContract = readJsonFile(
    classificationBinding.absolutePath,
    'securityMatrix.contract.targetInventory.classificationContract'
  );
  assert(
    classificationContract.schemaVersion === 1 &&
      classificationContract.status === 'APPROVED_FOR_EXECUTION',
    'security target classification is not approved for execution'
  );
  const classifications = requireArray(
    classificationContract.relations,
    'securityMatrix.contract.targetInventory.classificationContract.relations'
  );
  assert(
    classifications.length === expectedRelations.size,
    'security target classification does not cover every post-replay catalog relation'
  );
  const observedRelations = new Set();
  const targetsByFamily = new Map(
    [
      'TENANT_CRUD_MATRIX',
      'DATA_API_ACL_SERVICE_ROLE',
      'DATA_API_READ_ONLY',
      'LEGACY_QUARANTINE',
      'AUTH_JWT_MATRIX',
      'PUBLIC_SURFACE_SPECIAL',
    ].map(family => [family, []])
  );
  for (const [index, value] of classifications.entries()) {
    const context = `securityMatrix.contract.targetInventory.classificationContract.relations[${String(index)}]`;
    const entry = requireRecord(value, context);
    const relation = requireConcreteString(
      entry.relation,
      `${context}.relation`
    );
    assert(
      !observedRelations.has(relation),
      `${context}.relation is duplicated`
    );
    observedRelations.add(relation);
    assert(
      expectedRelations.has(relation),
      `${context}.relation is absent from the post-replay catalog`
    );
    assert(
      entry.reviewStatus === 'OWNER_APPROVED',
      `${context}.reviewStatus is not owner-approved`
    );
    const classification = requireConcreteString(
      entry.classification,
      `${context}.classification`
    );
    assert(
      SECURITY_TARGET_CLASSIFICATIONS.has(classification),
      `${context}.classification is unresolved or unsupported`
    );
    if (relation.startsWith('auth.')) {
      assert(
        classification === 'AUTH_PLATFORM_MANAGED',
        `${context} Auth relation classification drift`
      );
    } else {
      assert(
        relation.startsWith('public.') &&
          classification !== 'AUTH_PLATFORM_MANAGED',
        `${context} public relation classification drift`
      );
    }
    const primaryCoverageFamily =
      SECURITY_COVERAGE_FAMILY_BY_CLASSIFICATION.get(classification);
    assert(
      typeof entry.publicSurfaceSpecial === 'boolean',
      `${context}.publicSurfaceSpecial must be a boolean`
    );
    assert(
      !relation.startsWith('auth.') || entry.publicSurfaceSpecial === false,
      `${context} Auth relation cannot be public-surface special`
    );
    const expectedCoverageFamilies = [
      primaryCoverageFamily,
      ...(entry.publicSurfaceSpecial ? ['PUBLIC_SURFACE_SPECIAL'] : []),
    ];
    const coverageFamilies = requireConcreteStringArray(
      entry.coverageFamilies,
      `${context}.coverageFamilies`
    );
    assertExactStringArray(
      coverageFamilies,
      expectedCoverageFamilies,
      `${context}.coverageFamilies`
    );
    for (const family of expectedCoverageFamilies) {
      targetsByFamily.get(family).push(relation);
    }
  }
  for (const relation of expectedRelations) {
    assert(
      observedRelations.has(relation),
      `security target inventory missing post-replay catalog relation ${relation}`
    );
  }
  const approvedCoverageTargets = requireRecord(
    classificationContract.coverageTargets,
    'securityMatrix.contract.targetInventory.classificationContract.coverageTargets'
  );
  assertExactRecordKeys(
    approvedCoverageTargets,
    [...targetsByFamily.keys()],
    'securityMatrix.contract.targetInventory.classificationContract.coverageTargets'
  );
  for (const [family, derivedTargets] of targetsByFamily.entries()) {
    assert(
      derivedTargets.length > 0,
      `security target inventory has no ${family} target`
    );
    assertExactStringArray(
      requireConcreteStringArray(
        approvedCoverageTargets[family],
        `security target classification coverageTargets.${family}`
      ),
      [...derivedTargets].sort((left, right) =>
        left.localeCompare(right, 'en')
      ),
      `security target classification coverageTargets.${family}`
    );
  }
  return [...targetsByFamily.get('TENANT_CRUD_MATRIX')].sort((left, right) =>
    left.localeCompare(right, 'en')
  );
}

function verifySecurityStateTransitions(row, context, relationalSemanticCase) {
  const expectedTransitions = requireArray(
    row.expectedStateTransitions,
    `${context}.expectedStateTransitions`
  );
  const observedResults = requireArray(
    row.observedStateResults,
    `${context}.observedStateResults`
  );
  if (!relationalSemanticCase) {
    assert(
      expectedTransitions.length === 0 && observedResults.length === 0,
      `${context} non-relational row must not self-assert relational state`
    );
    assert(
      row.expectedTransactionEndCommand === 'NOT_APPLICABLE' &&
        row.expectedTransactionEndStatus === 'NOT_APPLICABLE' &&
        row.observedTransactionEndCommand === 'NOT_APPLICABLE' &&
        row.observedTransactionEndStatus === 'NOT_APPLICABLE' &&
        row.observedRollbackCompletedAt === 'NOT_APPLICABLE' &&
        row.observedPostRollbackCheckedAt === 'NOT_APPLICABLE',
      `${context} non-relational row must not self-assert a transaction rollback`
    );
    return;
  }
  assert(
    row.expectedTransactionEndCommand === 'ROLLBACK' &&
      row.expectedTransactionEndStatus === 'COMMAND_OK' &&
      row.observedTransactionEndCommand === 'ROLLBACK' &&
      row.observedTransactionEndStatus === 'COMMAND_OK',
    `${context} relational probe must end with a successful ROLLBACK`
  );
  const rollbackCompletedAt = requireIsoTimestamp(
    row.observedRollbackCompletedAt,
    `${context}.observedRollbackCompletedAt`
  );
  const postRollbackCheckedAt = requireIsoTimestamp(
    row.observedPostRollbackCheckedAt,
    `${context}.observedPostRollbackCheckedAt`
  );
  assert(
    Date.parse(rollbackCompletedAt) <= Date.parse(postRollbackCheckedAt),
    `${context} post-ROLLBACK verification precedes ROLLBACK completion`
  );
  assert(
    expectedTransitions.length > 0 &&
      expectedTransitions.length === observedResults.length,
    `${context} relational state transition coverage mismatch`
  );
  const expectedById = new Map();
  for (const [index, value] of expectedTransitions.entries()) {
    const transitionContext = `${context}.expectedStateTransitions[${String(index)}]`;
    const transition = requireRecord(value, transitionContext);
    const assertionId = requireConcreteString(
      transition.assertionId,
      `${transitionContext}.assertionId`
    );
    assert(
      !expectedById.has(assertionId),
      `${transitionContext}.assertionId is duplicated`
    );
    const relation = requireConcreteString(
      transition.relation,
      `${transitionContext}.relation`
    );
    const transitionType = requireConcreteString(
      transition.transition,
      `${transitionContext}.transition`
    );
    assert(
      ['ABSENT_TO_ABSENT', 'PRESENT_TO_ABSENT', 'HASH_UNCHANGED'].includes(
        transitionType
      ),
      `${transitionContext}.transition is unsupported`
    );
    expectedById.set(assertionId, { relation, transition: transitionType });
  }
  const observedIds = new Set();
  for (const [index, value] of observedResults.entries()) {
    const resultContext = `${context}.observedStateResults[${String(index)}]`;
    const result = requireRecord(value, resultContext);
    const assertionId = requireConcreteString(
      result.assertionId,
      `${resultContext}.assertionId`
    );
    assert(!observedIds.has(assertionId), `${resultContext} is duplicated`);
    observedIds.add(assertionId);
    const expected = requireRecord(
      expectedById.get(assertionId),
      `${resultContext}.approvedTransition`
    );
    assert(
      result.relation === expected.relation &&
        result.transition === expected.transition,
      `${resultContext} transition identity mismatch`
    );
    assert(
      typeof result.beforeExists === 'boolean' &&
        typeof result.afterExists === 'boolean' &&
        typeof result.postRollbackExists === 'boolean',
      `${resultContext} existence observations must be boolean`
    );
    const beforeSha256 = result.beforeSha256;
    const afterSha256 = result.afterSha256;
    const postRollbackSha256 = result.postRollbackSha256;
    if (expected.transition === 'ABSENT_TO_ABSENT') {
      assert(
        result.beforeExists === false &&
          result.afterExists === false &&
          result.postRollbackExists === false &&
          beforeSha256 === null &&
          afterSha256 === null &&
          postRollbackSha256 === null,
        `${resultContext} ABSENT_TO_ABSENT observation mismatch`
      );
    } else if (expected.transition === 'PRESENT_TO_ABSENT') {
      assert(
        result.beforeExists === true &&
          result.afterExists === false &&
          result.postRollbackExists === true &&
          typeof beforeSha256 === 'string' &&
          SHA256_PATTERN.test(beforeSha256) &&
          afterSha256 === null &&
          postRollbackSha256 === beforeSha256,
        `${resultContext} PRESENT_TO_ABSENT observation mismatch`
      );
    } else {
      assert(
        result.beforeExists === true &&
          result.afterExists === true &&
          result.postRollbackExists === true &&
          typeof beforeSha256 === 'string' &&
          SHA256_PATTERN.test(beforeSha256) &&
          beforeSha256 === afterSha256 &&
          beforeSha256 === postRollbackSha256,
        `${resultContext} HASH_UNCHANGED observation mismatch`
      );
    }
  }
  for (const assertionId of expectedById.keys()) {
    assert(
      observedIds.has(assertionId),
      `${context}.observedStateResults missing ${assertionId}`
    );
  }
}

function verifyNonWaivableSecuritySemantics(row, context) {
  if (
    RELATIONAL_REJECTION_CASES.has(row.jwtCase) ||
    RELATIONAL_CASCADE_CASES.has(row.jwtCase)
  ) {
    assertJsonEquivalent(
      row.expectedStateTransitions,
      RELATIONAL_STATE_TRANSITION_CONTRACTS.get(row.jwtCase),
      `${context}.expectedStateTransitions`
    );
    assertJsonEquivalent(
      row.expectedErrorDiagnostic,
      RELATIONAL_ERROR_DIAGNOSTIC_CONTRACTS.get(row.jwtCase),
      `${context}.expectedErrorDiagnostic`
    );
  }
  if (RELATIONAL_REJECTION_CASES.has(row.jwtCase)) {
    const expected =
      row.jwtCase === 'parent_rehome'
        ? {
            operation: 'update',
            target: 'public.resources',
            errorIdentity: 'CONSTRAINT:blocks_resource_id_fkey',
            postcondition: 'RESOURCE_CLINIC_AND_REFERENCING_BLOCK_UNCHANGED',
            preservedSentinel:
              'RESERVATION_AND_OTHER_TENANT_SENTINELS_UNCHANGED',
          }
        : {
            operation: 'insert',
            target: 'public.blocks',
            errorIdentity: 'MESSAGE:resources.id not found',
            postcondition: 'BLOCK_ABSENT',
            preservedSentinel: 'OTHER_TENANT_SENTINEL_UNCHANGED',
          };
    assert(
      row.role === 'postgres' &&
        row.caseClass === 'RELATIONAL_CONSTRAINT_REJECTION' &&
        row.sourceTenant === row.targetTenant &&
        row.tenantBoundary === 'SAME_TENANT_CONSTRAINT_CHECK' &&
        row.tenantDirection === 'NOT_APPLICABLE' &&
        row.operation === expected.operation &&
        row.target === expected.target &&
        row.expectedHttpStatus === 'NOT_APPLICABLE' &&
        row.expectedSqlstate === '23503' &&
        row.expectedRowCount === 0 &&
        row.expectedMutationCount === 0 &&
        row.expectedDirectAffectedRows === 0 &&
        row.expectedDecision === 'CONSTRAINT_REJECTED' &&
        row.expectedAclOutcome === 'OWNER_PRIVILEGE' &&
        row.expectedRlsOutcome === 'NOT_APPLICABLE_DIRECT_POSTGRES_OWNER' &&
        row.expectedErrorIdentity === expected.errorIdentity &&
        row.expectedPostcondition === expected.postcondition &&
        row.expectedPreservedSentinel === expected.preservedSentinel,
      `${context} relational constraint rejection semantics drift`
    );
    return;
  }

  if (RELATIONAL_CASCADE_CASES.has(row.jwtCase)) {
    const expected =
      row.jwtCase === 'resource_delete_cascade'
        ? {
            target: 'public.resources',
            postcondition: 'BLOCK_ABSENT',
            preservedSentinel:
              'OTHER_RESOURCES_AND_OTHER_TENANT_SENTINELS_UNCHANGED',
          }
        : {
            target: 'public.clinics',
            postcondition: 'RESOURCE_AND_BLOCK_ABSENT',
            preservedSentinel: 'OTHER_TENANT_SENTINELS_UNCHANGED',
          };
    assert(
      row.role === 'postgres' &&
        row.caseClass === 'RELATIONAL_CASCADE_POSTCONDITION' &&
        row.sourceTenant === row.targetTenant &&
        row.tenantBoundary === 'SAME_TENANT_CASCADE_CHECK' &&
        row.tenantDirection === 'NOT_APPLICABLE' &&
        row.operation === 'delete' &&
        row.target === expected.target &&
        row.expectedHttpStatus === 'NOT_APPLICABLE' &&
        row.expectedSqlstate === 'NO_ERROR_DIAGNOSTIC' &&
        row.expectedRowCount === 1 &&
        row.expectedMutationCount === 'DERIVED_BY_CASCADE_POSTCONDITION' &&
        row.expectedDirectAffectedRows === 1 &&
        row.expectedDecision === 'CASCADE_CONFIRMED' &&
        row.expectedAclOutcome === 'OWNER_PRIVILEGE' &&
        row.expectedRlsOutcome === 'NOT_APPLICABLE_DIRECT_POSTGRES_OWNER' &&
        row.expectedErrorIdentity === 'NOT_APPLICABLE' &&
        row.expectedPostcondition === expected.postcondition &&
        row.expectedPreservedSentinel === expected.preservedSentinel,
      `${context} relational cascade postcondition semantics drift`
    );
    return;
  }

  const authoritySemanticCase =
    AUTHORITY_FAIL_CLOSED_JWT_CASES.has(row.jwtCase) ||
    AUTHORITY_LOOKUP_FAIL_CLOSED_JWT_CASES.has(row.jwtCase);
  if (authoritySemanticCase) {
    assert(
      row.sourceTenant === row.targetTenant &&
        row.tenantBoundary === 'SAME_TENANT_AUTHORITY_DENIED' &&
        row.tenantDirection === 'NOT_APPLICABLE' &&
        row.tenantProbeControl === undefined,
      `${context} authority case must isolate the same-tenant authority cause from tenant RLS`
    );
    verifyAuthorityStateControl(
      row.authorityStateControl,
      `${context}.authorityStateControl`,
      row
    );
  } else if (row.expectedSqlstate !== 'NOT_EXECUTED') {
    verifyTenantProbeControl(
      row.tenantProbeControl,
      `${context}.tenantProbeControl`,
      row.target,
      row.targetTenant,
      row.operation,
      row.role,
      row.actor
    );
  } else {
    assert(
      row.tenantProbeControl === undefined,
      `${context}.tenantProbeControl cannot claim database controls when SQL was not executed`
    );
  }

  assert(
    row.expectedDecision === 'DENY' && row.observedDecision === 'DENY',
    `${context} must remain a non-waivable DENY`
  );
  assert(
    row.expectedRowCount === 0 && row.observedRowCount === 0,
    `${context} must return zero denied rows`
  );
  assert(
    row.expectedMutationCount === 0 && row.observedMutationCount === 0,
    `${context} must mutate zero denied rows`
  );
  assert(
    row.expectedDirectAffectedRows === 0 &&
      row.observedDirectAffectedRows === 0,
    `${context} direct affected-row count drift`
  );
  assert(
    row.expectedErrorIdentity === 'NOT_APPLICABLE' &&
      row.expectedPostcondition === 'NOT_APPLICABLE' &&
      row.expectedPreservedSentinel === 'NOT_APPLICABLE' &&
      requireRecord(
        row.expectedErrorDiagnostic,
        `${context}.expectedErrorDiagnostic`
      ).status === 'NOT_APPLICABLE',
    `${context} non-relational semantic fields drift`
  );

  if (APPLICATION_ROLES.includes(row.role) && row.jwtCase === 'valid_jwt') {
    const expectedRlsOutcome =
      row.operation === 'insert' ? 'WRITE_REJECTED' : 'FILTERED_ZERO_ROWS';
    assert(
      row.caseClass === 'TENANT_RLS_NEGATIVE' &&
        row.expectedAclOutcome === 'ACL_ALLOWED_TO_EVALUATE_RLS' &&
        row.expectedRlsOutcome === expectedRlsOutcome,
      `${context} cross-tenant role/operation semantics drift`
    );
    return;
  }

  if (
    row.role === 'authenticated' &&
    AUTH_REJECTED_JWT_CASES.has(row.jwtCase)
  ) {
    assert(
      row.caseClass === 'AUTH_REJECTED_BEFORE_DB' &&
        row.expectedHttpStatus === 401 &&
        row.expectedSqlstate === 'NOT_EXECUTED' &&
        row.expectedAclOutcome === 'NOT_EVALUATED' &&
        row.expectedRlsOutcome === 'NOT_EVALUATED',
      `${context} rejected-JWT semantics drift`
    );
    return;
  }

  if (
    row.role === 'authenticated' &&
    AUTHORITY_LOOKUP_FAIL_CLOSED_JWT_CASES.has(row.jwtCase)
  ) {
    assert(
      row.caseClass === 'AUTHORITY_LOOKUP_FAIL_CLOSED' &&
        row.expectedHttpStatus ===
          (AUTHORITY_LOOKUP_ERROR_JWT_CASES.has(row.jwtCase) ? 503 : 403) &&
        row.expectedSqlstate === 'NOT_EXECUTED' &&
        row.expectedAclOutcome === 'NOT_EVALUATED' &&
        row.expectedRlsOutcome === 'NOT_EVALUATED',
      `${context} fail-closed authority lookup semantics drift`
    );
    return;
  }

  if (
    row.role === 'authenticated' &&
    AUTHORITY_FAIL_CLOSED_JWT_CASES.has(row.jwtCase)
  ) {
    assert(
      row.caseClass === 'AUTHORITY_FAIL_CLOSED' &&
        row.expectedAclOutcome === 'AUTHENTICATED_ACL_ALLOWED' &&
        row.expectedRlsOutcome === 'AUTHORITY_DENIED',
      `${context} fail-closed authority semantics drift`
    );
    return;
  }

  if (row.role === 'anon' && row.jwtCase === 'empty_jwt') {
    assert(
      row.caseClass === 'ANON_NO_SESSION' &&
        row.expectedAclOutcome === 'ANON_ACL_ALLOWED' &&
        row.expectedRlsOutcome === 'ANON_TENANT_DENIED',
      `${context} anon no-session semantics drift`
    );
    return;
  }

  if (
    row.role === 'service_role' &&
    row.jwtCase === 'service_role_server_only'
  ) {
    assert(
      row.caseClass === 'SERVER_ONLY_PRIVILEGED_PATH' &&
        row.expectedHttpStatus === 403 &&
        row.expectedSqlstate === 'NOT_EXECUTED' &&
        row.expectedAclOutcome === 'NOT_EVALUATED' &&
        row.expectedRlsOutcome === 'NOT_EVALUATED',
      `${context} service-role server-only semantics drift`
    );
    return;
  }

  fail(`${context} has no non-waivable semantic mapping`);
}

function tenantProbeControlApprovalView(value, context) {
  if (value === undefined) return undefined;
  const normalized = structuredClone(requireRecord(value, context));
  const positive = requireRecord(
    normalized.sameTenantPositiveControl,
    `${context}.sameTenantPositiveControl`
  );
  positive.rawObservationId = 'DERIVED_AT_EXECUTION';
  const authTokenUse = requireRecord(
    positive.authTokenUse,
    `${context}.sameTenantPositiveControl.authTokenUse`
  );
  authTokenUse.tokenHandleId = 'DERIVED_AT_EXECUTION';
  authTokenUse.provenanceObservationId = 'DERIVED_AT_EXECUTION';
  const transaction = requireRecord(
    positive.transaction,
    `${context}.sameTenantPositiveControl.transaction`
  );
  transaction.transactionId = 'DERIVED_AT_EXECUTION';
  transaction.rollbackCompletedAt = 'DERIVED_AT_EXECUTION';
  transaction.postRollbackCheckedAt = 'DERIVED_AT_EXECUTION';
  return normalized;
}

function verifyTenantProbeControl(
  value,
  context,
  expectedTarget,
  expectedTargetTenant = undefined,
  expectedOperation = undefined,
  deniedRole = undefined,
  deniedActorId = undefined
) {
  const control = requireRecord(value, context);
  assertExactRecordKeys(
    control,
    ['selector', 'precondition', 'sameTenantPositiveControl', 'postDeny'],
    context
  );
  const selector = requireRecord(control.selector, `${context}.selector`);
  assertExactRecordKeys(
    selector,
    [
      'relation',
      'primaryKeyColumn',
      'primaryKeyValue',
      'tenantColumn',
      'expectedTenant',
    ],
    `${context}.selector`
  );
  const targetTenant = requireConcreteString(
    selector.expectedTenant,
    `${context}.selector.expectedTenant`
  );
  assert(
    selector.relation === expectedTarget &&
      requireConcreteString(
        selector.primaryKeyColumn,
        `${context}.selector.primaryKeyColumn`
      ).length > 0 &&
      requireConcreteString(
        selector.primaryKeyValue,
        `${context}.selector.primaryKeyValue`
      ).length > 0 &&
      requireConcreteString(
        selector.tenantColumn,
        `${context}.selector.tenantColumn`
      ).length > 0 &&
      (expectedTargetTenant === undefined ||
        targetTenant === expectedTargetTenant),
    `${context}.selector does not bind the denied target and tenant`
  );
  const precondition = requireRecord(
    control.precondition,
    `${context}.precondition`
  );
  const positive = requireRecord(
    control.sameTenantPositiveControl,
    `${context}.sameTenantPositiveControl`
  );
  const postDeny = requireRecord(control.postDeny, `${context}.postDeny`);
  assertExactRecordKeys(
    precondition,
    ['rowCount', 'observedTenant', 'rowSha256'],
    `${context}.precondition`
  );
  assertExactRecordKeys(
    positive,
    [
      'rawObservationId',
      'actorId',
      'role',
      'jwtCase',
      'deniedActorId',
      'authTokenUse',
      'sourceTenant',
      'targetTenant',
      'target',
      'operation',
      'selector',
      'expected',
      'observed',
      'transaction',
      'stateResults',
    ],
    `${context}.sameTenantPositiveControl`
  );
  assertExactRecordKeys(
    postDeny,
    ['rowCount', 'observedTenant', 'rowSha256'],
    `${context}.postDeny`
  );
  const beforeHash = requireSha256(
    precondition.rowSha256,
    `${context}.precondition.rowSha256`
  );
  const afterHash = requireSha256(
    postDeny.rowSha256,
    `${context}.postDeny.rowSha256`
  );
  const positiveContext = `${context}.sameTenantPositiveControl`;
  const positiveActorId = requireConcreteString(
    positive.actorId,
    `${positiveContext}.actorId`
  );
  const positiveRole = requireConcreteString(
    positive.role,
    `${positiveContext}.role`
  );
  const operation = requireConcreteString(
    positive.operation,
    `${positiveContext}.operation`
  );
  const dataApiControl =
    typeof deniedActorId === 'string' &&
    deniedActorId.startsWith('synthetic_data_api_');
  const expectedPositiveRole = dataApiControl
    ? 'authenticated'
    : APPLICATION_ROLES.includes(deniedRole)
      ? deniedRole
      : 'staff';
  const expectedPositiveActorId = dataApiControl
    ? `synthetic_data_api_${targetTenant}`
    : `synthetic_${expectedPositiveRole}_${targetTenant}`;
  assert(
    positiveActorId === expectedPositiveActorId &&
      positiveActorId !== deniedActorId &&
      positive.deniedActorId === deniedActorId &&
      positive.jwtCase === 'valid_jwt' &&
      positive.sourceTenant === targetTenant &&
      positive.targetTenant === targetTenant &&
      positive.target === expectedTarget &&
      (expectedOperation === undefined || operation === expectedOperation) &&
      positiveRole === expectedPositiveRole,
    `${positiveContext} is not a distinct same-tenant actor for the denied operation`
  );
  const positiveSelector = requireRecord(
    positive.selector,
    `${positiveContext}.selector`
  );
  assertExactRecordKeys(
    positiveSelector,
    [
      'relation',
      'primaryKeyColumn',
      'primaryKeyValue',
      'tenantColumn',
      'expectedTenant',
    ],
    `${positiveContext}.selector`
  );
  assert(
    positiveSelector.relation === expectedTarget &&
      positiveSelector.expectedTenant === targetTenant &&
      requireConcreteString(
        positiveSelector.primaryKeyColumn,
        `${positiveContext}.selector.primaryKeyColumn`
      ).length > 0 &&
      requireConcreteString(
        positiveSelector.primaryKeyValue,
        `${positiveContext}.selector.primaryKeyValue`
      ).length > 0 &&
      requireConcreteString(
        positiveSelector.tenantColumn,
        `${positiveContext}.selector.tenantColumn`
      ).length > 0,
    `${positiveContext}.selector is not bound to the same relation and target tenant`
  );
  requireConcreteString(
    positive.rawObservationId,
    `${positiveContext}.rawObservationId`
  );
  const authTokenUse = requireRecord(
    positive.authTokenUse,
    `${positiveContext}.authTokenUse`
  );
  assertExactRecordKeys(
    authTokenUse,
    ['source', 'actorId', 'tokenHandleId', 'provenanceObservationId'],
    `${positiveContext}.authTokenUse`
  );
  assert(
    authTokenUse.source === 'HOSTED_REFRESHED_SESSION' &&
      authTokenUse.actorId === positiveActorId &&
      requireConcreteString(
        authTokenUse.tokenHandleId,
        `${positiveContext}.authTokenUse.tokenHandleId`
      ) !== 'DERIVED_AT_EXECUTION' &&
      requireConcreteString(
        authTokenUse.provenanceObservationId,
        `${positiveContext}.authTokenUse.provenanceObservationId`
      ) !== 'DERIVED_AT_EXECUTION',
    `${positiveContext}.authTokenUse is not a concrete hosted refreshed session`
  );
  const expected = requireRecord(
    positive.expected,
    `${positiveContext}.expected`
  );
  const observed = requireRecord(
    positive.observed,
    `${positiveContext}.observed`
  );
  const outcomeKeys = [
    'httpStatus',
    'sqlstate',
    'rowCount',
    'mutationCount',
    'directAffectedRows',
    'decision',
  ];
  assertExactRecordKeys(expected, outcomeKeys, `${positiveContext}.expected`);
  assertExactRecordKeys(observed, outcomeKeys, `${positiveContext}.observed`);
  const expectedMutations = operation === 'read' ? 0 : 1;
  assert(
    expected.httpStatus === 200 &&
      expected.sqlstate === 'NONE' &&
      expected.rowCount === 1 &&
      expected.mutationCount === expectedMutations &&
      expected.directAffectedRows === expectedMutations &&
      expected.decision === 'ALLOW',
    `${positiveContext}.expected does not prove the same operation succeeds`
  );
  assertJsonEquivalent(
    observed,
    expected,
    `${positiveContext}.observed outcome`
  );
  const transaction = requireRecord(
    positive.transaction,
    `${positiveContext}.transaction`
  );
  assertExactRecordKeys(
    transaction,
    [
      'transactionId',
      'endCommand',
      'endStatus',
      'rollbackCompletedAt',
      'postRollbackCheckedAt',
    ],
    `${positiveContext}.transaction`
  );
  const rollbackCompletedAt = requireIsoTimestamp(
    transaction.rollbackCompletedAt,
    `${positiveContext}.transaction.rollbackCompletedAt`
  );
  const postRollbackCheckedAt = requireIsoTimestamp(
    transaction.postRollbackCheckedAt,
    `${positiveContext}.transaction.postRollbackCheckedAt`
  );
  assert(
    requireConcreteString(
      transaction.transactionId,
      `${positiveContext}.transaction.transactionId`
    ) !== 'DERIVED_AT_EXECUTION' &&
      transaction.endCommand === 'ROLLBACK' &&
      transaction.endStatus === 'COMMAND_OK' &&
      Date.parse(rollbackCompletedAt) <= Date.parse(postRollbackCheckedAt),
    `${positiveContext}.transaction does not prove rollback completion`
  );
  const stateResults = requireArray(
    positive.stateResults,
    `${positiveContext}.stateResults`
  );
  assert(
    stateResults.length === 1,
    `${positiveContext}.stateResults must contain exactly one operation control`
  );
  const state = requireRecord(
    stateResults[0],
    `${positiveContext}.stateResults[0]`
  );
  assertExactRecordKeys(
    state,
    [
      'assertionId',
      'relation',
      'operation',
      'beforeExists',
      'afterExists',
      'postRollbackExists',
      'beforeSha256',
      'afterSha256',
      'postRollbackSha256',
    ],
    `${positiveContext}.stateResults[0]`
  );
  requireConcreteString(
    state.assertionId,
    `${positiveContext}.stateResults[0].assertionId`
  );
  assert(
    state.relation === expectedTarget && state.operation === operation,
    `${positiveContext}.stateResults[0] target or operation drift`
  );
  const requireHashOrNull = (field, allowNull) => {
    if (allowNull && state[field] === null) return null;
    return requireSha256(
      state[field],
      `${positiveContext}.stateResults[0].${field}`
    );
  };
  const beforeStateHash = requireHashOrNull('beforeSha256', true);
  const afterStateHash = requireHashOrNull('afterSha256', true);
  const postRollbackStateHash = requireHashOrNull('postRollbackSha256', true);
  const validState =
    operation === 'insert'
      ? state.beforeExists === false &&
        state.afterExists === true &&
        state.postRollbackExists === false &&
        beforeStateHash === null &&
        afterStateHash !== null &&
        postRollbackStateHash === null
      : operation === 'delete'
        ? state.beforeExists === true &&
          state.afterExists === false &&
          state.postRollbackExists === true &&
          beforeStateHash !== null &&
          afterStateHash === null &&
          postRollbackStateHash === beforeStateHash
        : operation === 'update'
          ? state.beforeExists === true &&
            state.afterExists === true &&
            state.postRollbackExists === true &&
            beforeStateHash !== null &&
            afterStateHash !== null &&
            afterStateHash !== beforeStateHash &&
            postRollbackStateHash === beforeStateHash
          : operation === 'read' &&
            state.beforeExists === true &&
            state.afterExists === true &&
            state.postRollbackExists === true &&
            beforeStateHash !== null &&
            afterStateHash === beforeStateHash &&
            postRollbackStateHash === beforeStateHash;
  assert(
    precondition.rowCount === 1 &&
      precondition.observedTenant === targetTenant &&
      postDeny.rowCount === 1 &&
      postDeny.observedTenant === targetTenant &&
      afterHash === beforeHash &&
      validState,
    `${context} does not prove a real target row, same-tenant allow control, and post-denial invariance`
  );
}

function verifyTenantAllowControl(value, context, row) {
  const control = requireRecord(value, context);
  assertExactRecordKeys(
    control,
    ['selector', 'precondition', 'allowObservation', 'postRead'],
    context
  );
  const selector = requireRecord(control.selector, `${context}.selector`);
  const precondition = requireRecord(
    control.precondition,
    `${context}.precondition`
  );
  const observed = requireRecord(
    control.allowObservation,
    `${context}.allowObservation`
  );
  const postRead = requireRecord(control.postRead, `${context}.postRead`);
  assertExactRecordKeys(
    selector,
    [
      'relation',
      'primaryKeyColumn',
      'primaryKeyValue',
      'tenantColumn',
      'expectedTenant',
    ],
    `${context}.selector`
  );
  assertExactRecordKeys(
    precondition,
    ['rowCount', 'observedTenant', 'rowSha256'],
    `${context}.precondition`
  );
  assertExactRecordKeys(
    observed,
    ['actorTenant', 'returnedTenant', 'rowCount', 'returnedRowSha256'],
    `${context}.allowObservation`
  );
  assertExactRecordKeys(
    postRead,
    ['rowCount', 'observedTenant', 'rowSha256'],
    `${context}.postRead`
  );
  const expectedTenant = requireConcreteString(
    selector.expectedTenant,
    `${context}.selector.expectedTenant`
  );
  const beforeHash = requireSha256(
    precondition.rowSha256,
    `${context}.precondition.rowSha256`
  );
  const returnedHash = requireSha256(
    observed.returnedRowSha256,
    `${context}.allowObservation.returnedRowSha256`
  );
  const afterHash = requireSha256(
    postRead.rowSha256,
    `${context}.postRead.rowSha256`
  );
  assert(
    selector.relation === row.target &&
      requireConcreteString(
        selector.primaryKeyColumn,
        `${context}.selector.primaryKeyColumn`
      ).length > 0 &&
      requireConcreteString(
        selector.primaryKeyValue,
        `${context}.selector.primaryKeyValue`
      ).length > 0 &&
      requireConcreteString(
        selector.tenantColumn,
        `${context}.selector.tenantColumn`
      ).length > 0 &&
      expectedTenant === row.sourceTenant &&
      expectedTenant === row.targetTenant &&
      precondition.rowCount === 1 &&
      precondition.observedTenant === expectedTenant &&
      observed.actorTenant === expectedTenant &&
      observed.returnedTenant === expectedTenant &&
      observed.rowCount === 1 &&
      row.observedRowCount === 1 &&
      returnedHash === beforeHash &&
      postRead.rowCount === 1 &&
      postRead.observedTenant === expectedTenant &&
      afterHash === beforeHash,
    `${context} does not prove that the authenticated same-tenant allow returned the frozen target row without mutation`
  );
}

function verifyAuthorityStateControl(value, context, row, observedAt = null) {
  const control = requireRecord(value, context);
  assertExactRecordKeys(
    control,
    [
      'selector',
      'precondition',
      'deniedActor',
      'authorityCause',
      'sameTenantActiveActorControl',
      'deniedResult',
      'postDeny',
    ],
    context
  );
  const selector = requireRecord(control.selector, `${context}.selector`);
  assertExactRecordKeys(
    selector,
    [
      'relation',
      'primaryKeyColumn',
      'primaryKeyValue',
      'tenantColumn',
      'expectedTenant',
    ],
    `${context}.selector`
  );
  assert(
    selector.relation === row.target &&
      selector.expectedTenant === row.targetTenant &&
      requireConcreteString(
        selector.primaryKeyColumn,
        `${context}.selector.primaryKeyColumn`
      ).length > 0 &&
      requireConcreteString(
        selector.primaryKeyValue,
        `${context}.selector.primaryKeyValue`
      ).length > 0 &&
      requireConcreteString(
        selector.tenantColumn,
        `${context}.selector.tenantColumn`
      ).length > 0,
    `${context}.selector does not bind the same-tenant authority target`
  );
  const precondition = requireRecord(
    control.precondition,
    `${context}.precondition`
  );
  const postDeny = requireRecord(control.postDeny, `${context}.postDeny`);
  const deniedActor = requireRecord(
    control.deniedActor,
    `${context}.deniedActor`
  );
  const positive = requireRecord(
    control.sameTenantActiveActorControl,
    `${context}.sameTenantActiveActorControl`
  );
  const deniedResult = requireRecord(
    control.deniedResult,
    `${context}.deniedResult`
  );
  assertExactRecordKeys(
    precondition,
    ['rowCount', 'observedTenant', 'rowSha256'],
    `${context}.precondition`
  );
  assertExactRecordKeys(
    postDeny,
    ['rowCount', 'observedTenant', 'rowSha256'],
    `${context}.postDeny`
  );
  assertExactRecordKeys(
    deniedActor,
    ['actorId', 'actorTenant', 'targetTenant', 'jwtCase'],
    `${context}.deniedActor`
  );
  assertExactRecordKeys(
    positive,
    [
      'actorId',
      'actorTenant',
      'targetTenant',
      'tokenSource',
      'tokenHandleId',
      'provenanceObservationId',
      'rowCount',
      'decision',
    ],
    `${context}.sameTenantActiveActorControl`
  );
  assertExactRecordKeys(
    deniedResult,
    ['rowCount', 'mutationCount', 'decision'],
    `${context}.deniedResult`
  );
  const beforeHash = requireSha256(
    precondition.rowSha256,
    `${context}.precondition.rowSha256`
  );
  const afterHash = requireSha256(
    postDeny.rowSha256,
    `${context}.postDeny.rowSha256`
  );
  assert(
    precondition.rowCount === 1 &&
      precondition.observedTenant === row.targetTenant &&
      postDeny.rowCount === 1 &&
      postDeny.observedTenant === row.targetTenant &&
      afterHash === beforeHash &&
      deniedActor.actorId === row.actor &&
      deniedActor.actorTenant === row.sourceTenant &&
      deniedActor.targetTenant === row.targetTenant &&
      deniedActor.jwtCase === row.jwtCase &&
      positive.actorId !== row.actor &&
      positive.actorId === 'synthetic_authority_active_control_tenant_a' &&
      positive.actorTenant === row.targetTenant &&
      positive.targetTenant === row.targetTenant &&
      positive.tokenSource === 'HOSTED_PASSWORD_SIGN_IN_SESSION' &&
      requireConcreteString(
        positive.tokenHandleId,
        `${context}.sameTenantActiveActorControl.tokenHandleId`
      ).length > 0 &&
      requireConcreteString(
        positive.provenanceObservationId,
        `${context}.sameTenantActiveActorControl.provenanceObservationId`
      ).length > 0 &&
      positive.rowCount === 1 &&
      positive.decision === 'ALLOW' &&
      deniedResult.rowCount === 0 &&
      deniedResult.mutationCount === 0 &&
      deniedResult.decision === 'DENY',
    `${context} does not prove one same-tenant row, active-actor allow, authority denial, and unchanged post-state`
  );
  const cause = requireRecord(
    control.authorityCause,
    `${context}.authorityCause`
  );
  assertExactRecordKeys(
    cause,
    [
      'condition',
      'profileStatus',
      'profileLookupStatus',
      'managerAssignmentStatus',
      'managerAssignmentClinicId',
      'permissionLookupStatus',
      'jwtIssuedAt',
      'authorityChangedAt',
    ],
    `${context}.authorityCause`
  );
  const expectedCause = requireRecord(
    AUTHORITY_CAUSE_BY_JWT_CASE.get(row.jwtCase),
    `${context}.approvedAuthorityCause`
  );
  for (const field of [
    'condition',
    'profileStatus',
    'profileLookupStatus',
    'managerAssignmentStatus',
    'managerAssignmentClinicId',
    'permissionLookupStatus',
  ]) {
    assert(
      cause[field] === expectedCause[field],
      `${context}.authorityCause.${field} semantic drift`
    );
  }
  if (row.jwtCase === 'stale_jwt') {
    const jwtIssuedAt = requireIsoTimestamp(
      cause.jwtIssuedAt,
      `${context}.authorityCause.jwtIssuedAt`
    );
    const authorityChangedAt = requireIsoTimestamp(
      cause.authorityChangedAt,
      `${context}.authorityCause.authorityChangedAt`
    );
    assert(
      Date.parse(jwtIssuedAt) < Date.parse(authorityChangedAt) &&
        (observedAt === null ||
          Date.parse(authorityChangedAt) <= Date.parse(observedAt)),
      `${context}.authorityCause stale-JWT chronology mismatch`
    );
  } else {
    assert(
      cause.jwtIssuedAt === 'NOT_APPLICABLE' &&
        cause.authorityChangedAt === 'NOT_APPLICABLE',
      `${context}.authorityCause must not claim unrelated JWT chronology`
    );
  }
}

function authorityStateControlApprovalView(value, context) {
  if (value === undefined) return undefined;
  const control = requireRecord(value, context);
  const cause = requireRecord(
    control.authorityCause,
    `${context}.authorityCause`
  );
  const positive = requireRecord(
    control.sameTenantActiveActorControl,
    `${context}.sameTenantActiveActorControl`
  );
  return {
    ...control,
    authorityCause: {
      ...cause,
      jwtIssuedAt: 'DERIVED_AT_EXECUTION',
      authorityChangedAt: 'DERIVED_AT_EXECUTION',
    },
    sameTenantActiveActorControl: {
      ...positive,
      tokenHandleId: 'DERIVED_AT_EXECUTION',
      provenanceObservationId: 'DERIVED_AT_EXECUTION',
    },
  };
}

function verifyAuthTokenProvenance(
  matrix,
  contract,
  expectedProjectRef,
  artifactPaths
) {
  const policy = requireRecord(
    contract.authTokenProvenancePolicy,
    'securityMatrix.contract.authTokenProvenancePolicy'
  );
  assertExactRecordKeys(
    policy,
    [
      'collectorStatus',
      'acquisitionMethod',
      'requiredGrantTypes',
      'actorSet',
      'actorSetSha256',
      'rawTokenMaterialEvidenceAllowed',
      'jwtSigningSecretAcquisitionAllowed',
      'fabricatedUserJwtAllowed',
    ],
    'securityMatrix.contract.authTokenProvenancePolicy'
  );
  assert(
    policy.collectorStatus === 'IMPLEMENTED' &&
      policy.acquisitionMethod === HOSTED_USER_JWT_ACQUISITION_METHOD,
    'securityMatrix.contract.authTokenProvenancePolicy.acquisitionMethod drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      policy.requiredGrantTypes,
      'securityMatrix.contract.authTokenProvenancePolicy.requiredGrantTypes'
    ),
    REQUIRED_AUTH_GRANT_TYPES,
    'securityMatrix.contract.authTokenProvenancePolicy.requiredGrantTypes'
  );
  const actorSet = requireArray(
    policy.actorSet,
    'securityMatrix.contract.authTokenProvenancePolicy.actorSet'
  ).map((value, index) => {
    const context = `securityMatrix.contract.authTokenProvenancePolicy.actorSet[${String(index)}]`;
    const actor = requireRecord(value, context);
    assertExactRecordKeys(
      actor,
      [
        'actorId',
        'authUserId',
        'databaseRole',
        'applicationRole',
        'clinicId',
        'actorPurpose',
        'jwtCase',
      ],
      context
    );
    const normalized = {
      actorId: requireConcreteString(actor.actorId, `${context}.actorId`),
      authUserId: requireConcreteString(
        actor.authUserId,
        `${context}.authUserId`
      ),
      databaseRole: requireConcreteString(
        actor.databaseRole,
        `${context}.databaseRole`
      ),
      applicationRole: requireConcreteString(
        actor.applicationRole,
        `${context}.applicationRole`
      ),
      clinicId: requireConcreteString(actor.clinicId, `${context}.clinicId`),
      actorPurpose: requireConcreteString(
        actor.actorPurpose,
        `${context}.actorPurpose`
      ),
      jwtCase: requireConcreteString(actor.jwtCase, `${context}.jwtCase`),
    };
    assert(
      UUID_PATTERN.test(normalized.authUserId) &&
        normalized.databaseRole === 'authenticated' &&
        [
          ...APPLICATION_ROLES,
          'authenticated_boundary',
          'authority_active_control',
          'data_api_direct_role',
        ].includes(normalized.applicationRole) &&
        ['tenant_a', 'tenant_b'].includes(normalized.clinicId) &&
        [
          'TENANT_CRUD',
          'AUTH_NEGATIVE_CASE',
          'AUTHORITY_POSITIVE_CONTROL',
          'DATA_API_DIRECT_ROLE',
        ].includes(normalized.actorPurpose),
      `${context} hosted actor authority tuple drift`
    );
    return normalized;
  });
  assert(actorSet.length > 0, 'hosted Auth actor set must be non-empty');
  assert(
    new Set(actorSet.map(actor => actor.actorId)).size === actorSet.length &&
      new Set(actorSet.map(actor => actor.authUserId)).size === actorSet.length,
    'hosted Auth actor IDs and user IDs must be unique'
  );
  const requiredActorTuples = [
    ...APPLICATION_ROLES.flatMap(role => [
      `${role}\u0000tenant_a\u0000TENANT_CRUD\u0000valid_jwt`,
      `${role}\u0000tenant_b\u0000TENANT_CRUD\u0000valid_jwt`,
    ]),
    ...[
      ...AUTHORITY_FAIL_CLOSED_JWT_CASES,
      ...AUTHORITY_LOOKUP_FAIL_CLOSED_JWT_CASES,
      'expired_jwt',
    ].map(
      jwtCase =>
        `authenticated_boundary\u0000tenant_a\u0000AUTH_NEGATIVE_CASE\u0000${jwtCase}`
    ),
    'authority_active_control\u0000tenant_a\u0000AUTHORITY_POSITIVE_CONTROL\u0000valid_jwt',
    'data_api_direct_role\u0000tenant_a\u0000DATA_API_DIRECT_ROLE\u0000valid_jwt',
    'data_api_direct_role\u0000tenant_b\u0000DATA_API_DIRECT_ROLE\u0000valid_jwt',
  ].sort();
  assertExactStringArray(
    actorSet
      .map(
        actor =>
          `${actor.applicationRole}\u0000${actor.clinicId}\u0000${actor.actorPurpose}\u0000${actor.jwtCase}`
      )
      .sort(),
    requiredActorTuples,
    'hosted Auth actor role/clinic coverage'
  );
  const canonicalActorSet = actorSet
    .map(actor => [
      actor.actorId,
      actor.authUserId,
      actor.databaseRole,
      actor.applicationRole,
      actor.clinicId,
      actor.actorPurpose,
      actor.jwtCase,
    ])
    .sort((left, right) => left[0].localeCompare(right[0], 'en'));
  assert(
    requireSha256(
      policy.actorSetSha256,
      'securityMatrix.contract.authTokenProvenancePolicy.actorSetSha256'
    ) === sha256Text(JSON.stringify(canonicalActorSet)),
    'securityMatrix.contract hosted Auth actor-set hash mismatch'
  );
  assert(
    policy.rawTokenMaterialEvidenceAllowed === false &&
      policy.jwtSigningSecretAcquisitionAllowed === false &&
      policy.fabricatedUserJwtAllowed === false,
    'securityMatrix.contract auth token provenance must forbid token capture, signing-secret acquisition, and fabricated JWTs'
  );

  const result = requireRecord(
    matrix.authTokenProvenance,
    'securityMatrix.authTokenProvenance'
  );
  assertExactRecordKeys(
    result,
    [
      'acquisitionMethod',
      'actorSetSha256',
      'issuer',
      'actorSessions',
      'rawTokenMaterialCaptured',
      'jwtSigningSecretAcquired',
      'fabricatedUserJwtUsed',
      'status',
      'evidence',
    ],
    'securityMatrix.authTokenProvenance'
  );
  assert(
    result.acquisitionMethod === policy.acquisitionMethod &&
      result.actorSetSha256 === policy.actorSetSha256 &&
      result.issuer === `https://${expectedProjectRef}.supabase.co/auth/v1` &&
      result.rawTokenMaterialCaptured === false &&
      result.jwtSigningSecretAcquired === false &&
      result.fabricatedUserJwtUsed === false &&
      result.status === 'PASS',
    'securityMatrix.authTokenProvenance hosted Auth invariant drift'
  );
  const actorSessions = requireArray(
    result.actorSessions,
    'securityMatrix.authTokenProvenance.actorSessions'
  ).map((value, index) => {
    const context = `securityMatrix.authTokenProvenance.actorSessions[${String(index)}]`;
    const session = requireRecord(value, context);
    assertExactRecordKeys(
      session,
      [
        'actorId',
        'authUserId',
        'sessionId',
        'signInObservationId',
        'refreshObservationId',
        'signInTokenHandleId',
        'refreshedTokenHandleId',
        'refreshRotated',
        'status',
      ],
      context
    );
    const normalized = {
      actorId: requireConcreteString(session.actorId, `${context}.actorId`),
      authUserId: requireConcreteString(
        session.authUserId,
        `${context}.authUserId`
      ),
      sessionId: requireConcreteString(
        session.sessionId,
        `${context}.sessionId`
      ),
      signInObservationId: requireConcreteString(
        session.signInObservationId,
        `${context}.signInObservationId`
      ),
      refreshObservationId: requireConcreteString(
        session.refreshObservationId,
        `${context}.refreshObservationId`
      ),
      signInTokenHandleId: requireConcreteString(
        session.signInTokenHandleId,
        `${context}.signInTokenHandleId`
      ),
      refreshedTokenHandleId: requireConcreteString(
        session.refreshedTokenHandleId,
        `${context}.refreshedTokenHandleId`
      ),
      refreshRotated: session.refreshRotated,
      status: session.status,
    };
    assert(
      UUID_PATTERN.test(normalized.sessionId) &&
        normalized.signInObservationId !== normalized.refreshObservationId &&
        normalized.signInTokenHandleId !== normalized.refreshedTokenHandleId &&
        normalized.refreshRotated === true &&
        normalized.status === 'PASS',
      `${context} sign-in/refresh chain drift`
    );
    return normalized;
  });
  assert(
    actorSessions.length === actorSet.length &&
      new Set(actorSessions.map(session => session.actorId)).size ===
        actorSessions.length &&
      new Set(actorSessions.map(session => session.sessionId)).size ===
        actorSessions.length,
    'securityMatrix.authTokenProvenance must contain one session per hosted actor'
  );
  const actorById = new Map(actorSet.map(actor => [actor.actorId, actor]));
  const sessionByActor = new Map(
    actorSessions.map(session => [session.actorId, session])
  );
  for (const actor of actorSet) {
    const session = sessionByActor.get(actor.actorId);
    assert(
      session && session.authUserId === actor.authUserId,
      `securityMatrix.authTokenProvenance is missing actor ${actor.actorId}`
    );
  }
  const observationIds = actorSessions.flatMap(session => [
    session.signInObservationId,
    session.refreshObservationId,
  ]);
  const tokenHandleIds = actorSessions.flatMap(session => [
    session.signInTokenHandleId,
    session.refreshedTokenHandleId,
  ]);
  assert(
    new Set(observationIds).size === observationIds.length &&
      new Set(tokenHandleIds).size === tokenHandleIds.length,
    'hosted Auth provenance observation IDs and token handles must be unique'
  );
  verifyEvidenceReferences(
    result.evidence,
    'securityMatrix.authTokenProvenance.evidence',
    artifactPaths
  );
  return { policy, result, actorById, sessionByActor };
}

function expectedAuthTokenSource(row) {
  if (row.role === 'postgres') return 'DIRECT_POSTGRES_NO_JWT';
  if (row.role === 'service_role') return 'SERVER_ONLY_CREDENTIAL_BOUNDARY';
  if (row.role === 'anon' || row.jwtCase === 'empty_jwt')
    return 'NO_USER_TOKEN';
  if (row.jwtCase === 'malformed_jwt') return 'INTENTIONALLY_INVALID_NON_JWT';
  if (row.jwtCase === 'stale_jwt') return 'HOSTED_STALE_SESSION';
  if (row.jwtCase === 'expired_jwt') return 'HOSTED_EXPIRED_SESSION';
  return 'HOSTED_REFRESHED_SESSION';
}

function verifyAuthTokenUse(row, expected, authProvenance, context) {
  const source = requireConcreteString(
    row.expectedAuthTokenSource,
    `${context}.expectedAuthTokenSource`
  );
  assert(
    AUTH_TOKEN_USE_SOURCES.has(source) &&
      source === expected.expectedAuthTokenSource &&
      source === expectedAuthTokenSource(row),
    `${context}.expectedAuthTokenSource approval or semantic drift`
  );
  const expectedActorId = requireString(
    row.expectedAuthActorId,
    `${context}.expectedAuthActorId`
  );
  assert(
    expectedActorId === expected.expectedAuthActorId,
    `${context}.expectedAuthActorId approval mismatch`
  );
  const use = requireRecord(row.authTokenUse, `${context}.authTokenUse`);
  assertExactRecordKeys(
    use,
    ['source', 'actorId', 'tokenHandleId', 'provenanceObservationId'],
    `${context}.authTokenUse`
  );
  assert(use.source === source, `${context}.authTokenUse.source drift`);
  if (
    [
      'HOSTED_REFRESHED_SESSION',
      'HOSTED_STALE_SESSION',
      'HOSTED_EXPIRED_SESSION',
    ].includes(source)
  ) {
    assert(
      expectedActorId === row.actor && use.actorId === expectedActorId,
      `${context}.authTokenUse actor drift`
    );
    const actor = authProvenance.actorById.get(expectedActorId);
    const session = authProvenance.sessionByActor.get(expectedActorId);
    assert(actor && session, `${context}.authTokenUse actor session is absent`);
    assert(
      actor.clinicId === row.sourceTenant,
      `${context}.authTokenUse actor clinic does not match source tenant`
    );
    assert(
      (APPLICATION_ROLES.includes(row.role) &&
        actor.applicationRole === row.role &&
        actor.actorPurpose === 'TENANT_CRUD' &&
        actor.jwtCase === 'valid_jwt') ||
        (row.role === 'authenticated' &&
          actor.applicationRole === 'authenticated_boundary' &&
          actor.actorPurpose === 'AUTH_NEGATIVE_CASE' &&
          actor.jwtCase === row.jwtCase),
      `${context}.authTokenUse actor application role does not match the case`
    );
    const originalSessionToken = [
      'HOSTED_STALE_SESSION',
      'HOSTED_EXPIRED_SESSION',
    ].includes(source);
    assert(
      use.tokenHandleId ===
        (originalSessionToken
          ? session.signInTokenHandleId
          : session.refreshedTokenHandleId) &&
        use.provenanceObservationId ===
          (originalSessionToken
            ? session.signInObservationId
            : session.refreshObservationId),
      `${context}.authTokenUse is not bound to the actor's token provenance`
    );
  } else {
    assert(
      expectedActorId === 'NOT_APPLICABLE' &&
        use.actorId === 'NOT_APPLICABLE' &&
        use.tokenHandleId === 'NOT_APPLICABLE' &&
        use.provenanceObservationId === 'NOT_APPLICABLE',
      `${context}.authTokenUse must not claim a user-token provenance`
    );
  }
}

function verifyServiceRoleNonExposureBoundary(
  value,
  context,
  manifest,
  expectedTargetKind,
  expectedProjectRef,
  credentialConfiguration,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const boundary = requireRecord(value, context);
  assertExactRecordKeys(
    boundary,
    ['status', 'coveredCaseBindings', 'reportPath', 'reportSha256', 'evidence'],
    context
  );
  assert(boundary.status === 'PASS', `${context}.status must be PASS`);
  const coveredCaseBindings = requireArray(
    boundary.coveredCaseBindings,
    `${context}.coveredCaseBindings`
  ).map((entry, index) =>
    requireRecord(entry, `${context}.coveredCaseBindings[${String(index)}]`)
  );
  assertExactStringArray(
    coveredCaseBindings
      .map((binding, index) =>
        requireConcreteString(
          binding.caseId,
          `${context}.coveredCaseBindings[${String(index)}].caseId`
        )
      )
      .sort(),
    [...REQUIRED_SERVICE_ROLE_BOUNDARY_CASE_IDS].sort(),
    `${context}.coveredCaseBindings.caseIds`
  );
  verifyEvidenceReferences(
    boundary.evidence,
    `${context}.evidence`,
    artifactPaths
  );
  const reportBinding = verifyBoundArtifact(
    { path: boundary.reportPath, sha256: boundary.reportSha256 },
    `${context}.report`,
    artifactHashes,
    artifactFiles
  );
  const report = readJsonFile(reportBinding.absolutePath, `${context}.report`);
  assertExactRecordKeys(
    report,
    [
      'schemaVersion',
      'resultType',
      'status',
      'targetKind',
      'environmentProjectRef',
      'gitCommit',
      'commandId',
      'capturedAt',
      'runtimeIdentity',
      'credentialFingerprintSha256',
      'scanMethod',
      'exactValueLoadedOnlyInMemory',
      'rawCredentialPersisted',
      'scannedFileCount',
      'scannedByteCount',
      'coveredCaseBindings',
      'domains',
    ],
    `${context}.report`
  );
  const source = requireRecord(manifest.source, 'source');
  assert(
    report.schemaVersion === 1 &&
      report.resultType === 'SERVICE_ROLE_NON_EXPOSURE_SCAN' &&
      report.status === 'PASS' &&
      report.targetKind === expectedTargetKind &&
      report.environmentProjectRef === expectedProjectRef &&
      report.gitCommit === source.gitCommit &&
      report.scanMethod === 'IN_MEMORY_EXACT_VALUE_AND_PATTERN_SCAN' &&
      report.exactValueLoadedOnlyInMemory === true &&
      report.rawCredentialPersisted === false,
    `${context}.report provenance or secret-handling boundary drift`
  );
  const commandId = requireConcreteString(
    report.commandId,
    `${context}.report.commandId`
  );
  const expectedCommandId =
    expectedTargetKind === 'SOURCE' ? 'PR12-CMD-016A' : 'PR12-CMD-019A';
  const commands = requireArray(manifest.commands, 'commands').map(
    (entry, index) => requireRecord(entry, `commands[${String(index)}]`)
  );
  const command = commands.find(entry => entry.id === commandId);
  assert(
    command &&
      commandId === expectedCommandId &&
      report.capturedAt === command.endedAt,
    `${context}.report is not bound to its late service-role scan command`
  );
  const runtimeIdentity = requireRecord(
    report.runtimeIdentity,
    `${context}.report.runtimeIdentity`
  );
  const credential = requireRecord(
    credentialConfiguration,
    `${context}.credentialConfiguration`
  );
  const identity = requireRecord(
    credential.identity,
    `${context}.credentialConfiguration.identity`
  );
  const fingerprints = requireRecord(
    credential.fingerprints,
    `${context}.credentialConfiguration.fingerprints`
  );
  assert(
    runtimeIdentity.projectRef === expectedProjectRef &&
      runtimeIdentity.projectUrl === identity.projectUrl &&
      runtimeIdentity.databaseHost === identity.databaseHost &&
      report.credentialFingerprintSha256 ===
        fingerprints.serviceRoleKeySha256 &&
      requireSha256(
        report.credentialFingerprintSha256,
        `${context}.report.credentialFingerprintSha256`
      ) !== sha256Text(''),
    `${context}.report runtime target or service-role fingerprint mismatch`
  );
  assertJsonEquivalent(
    report.coveredCaseBindings,
    coveredCaseBindings,
    `${context}.report.coveredCaseBindings`
  );
  const expectedProducingCommands =
    expectedTargetKind === 'SOURCE'
      ? new Map([
          ['data_api_service_role_rest', 'PR12-CMD-014'],
          [
            'data_api_service_role_rpc_normalize_customer_phone',
            'PR12-CMD-014',
          ],
          ['graphql_service_role', 'PR12-CMD-014'],
        ])
      : new Map([
          ['data_api_service_role_rest', 'PR12-CMD-019D'],
          [
            'data_api_service_role_rpc_normalize_customer_phone',
            'PR12-CMD-019D',
          ],
          ['graphql_service_role', 'PR12-CMD-019G'],
        ]);
  const coveredRawArtifactPaths = new Set();
  for (const [index, binding] of coveredCaseBindings.entries()) {
    const bindingContext = `${context}.coveredCaseBindings[${String(index)}]`;
    assertExactRecordKeys(
      binding,
      [
        'caseId',
        'rawObservationId',
        'rawArtifactPath',
        'rawArtifactSha256',
        'producingCommandId',
        'observedAt',
        'credentialFingerprintSha256',
      ],
      bindingContext
    );
    const caseId = requireConcreteString(
      binding.caseId,
      `${bindingContext}.caseId`
    );
    const rawObservationId = requireConcreteString(
      binding.rawObservationId,
      `${bindingContext}.rawObservationId`
    );
    const producingCommandId = requireConcreteString(
      binding.producingCommandId,
      `${bindingContext}.producingCommandId`
    );
    const observedAt = requireIsoTimestamp(
      binding.observedAt,
      `${bindingContext}.observedAt`
    );
    assert(
      producingCommandId === expectedProducingCommands.get(caseId) &&
        binding.credentialFingerprintSha256 ===
          report.credentialFingerprintSha256,
      `${bindingContext} producing command or credential fingerprint drift`
    );
    const rawBinding = verifyBoundArtifact(
      {
        path: binding.rawArtifactPath,
        sha256: binding.rawArtifactSha256,
      },
      `${bindingContext}.rawArtifact`,
      artifactHashes,
      artifactFiles
    );
    coveredRawArtifactPaths.add(rawBinding.path);
    const raw = readJsonFile(
      rawBinding.absolutePath,
      `${bindingContext}.rawArtifact`
    );
    const isGraphQl = caseId === 'graphql_service_role';
    const expectedRawResultType =
      expectedTargetKind === 'SOURCE'
        ? isGraphQl
          ? 'SOURCE_GRAPHQL_RAW_EVIDENCE'
          : 'SOURCE_DATA_API_RAW_EVIDENCE'
        : isGraphQl
          ? 'POST_RESTORE_GRAPHQL_RAW_EVIDENCE'
          : 'POST_RESTORE_DATA_API_RAW_EVIDENCE';
    const rawProjectRef =
      expectedTargetKind === 'SOURCE'
        ? raw.environmentProjectRef
        : raw.projectRef;
    const producingCommand = commands.find(
      entry => entry.id === producingCommandId
    );
    const observation = requireRecord(
      requireArray(
        raw.observations,
        `${bindingContext}.rawArtifact.observations`
      )
        .map((entry, observationIndex) =>
          requireRecord(
            entry,
            `${bindingContext}.rawArtifact.observations[${String(observationIndex)}]`
          )
        )
        .find(entry => entry.observationId === rawObservationId),
      `${bindingContext}.rawObservation`
    );
    assert(
      raw.resultType === expectedRawResultType &&
        raw.status === 'CAPTURED' &&
        rawProjectRef === expectedProjectRef &&
        raw.commandId === producingCommandId &&
        producingCommand &&
        raw.capturedAt === producingCommand.endedAt &&
        observation.observationId === rawObservationId &&
        observation.caseId === caseId &&
        observation.role === 'service_role' &&
        observation.observationType ===
          (isGraphQl ? 'GRAPHQL_ROLE_CASE' : 'DATA_API_ROLE_CASE') &&
        observation.observedAt === observedAt &&
        observation.status === 'PASS',
      `${bindingContext} does not resolve to its service-role raw observation`
    );
    assert(
      Date.parse(observedAt) <= Date.parse(producingCommand.endedAt) &&
        Date.parse(producingCommand.endedAt) <= Date.parse(command.startedAt),
      'service-role non-exposure scan precedes a covered API observation'
    );
  }
  const domains = requireArray(report.domains, `${context}.report.domains`).map(
    (entry, index) => {
      const domainContext = `${context}.report.domains[${String(index)}]`;
      const domain = requireRecord(entry, domainContext);
      assertExactRecordKeys(
        domain,
        [
          'domain',
          'inventoryPath',
          'inventorySha256',
          'fileCount',
          'totalBytes',
          'exactMatchCount',
          'patternFindingCount',
        ],
        domainContext
      );
      const domainName = requireConcreteString(
        domain.domain,
        `${domainContext}.domain`
      );
      assert(
        REQUIRED_SERVICE_ROLE_SCAN_DOMAINS.includes(domainName),
        `${domainContext}.domain is not required`
      );
      const inventoryBinding = verifyBoundArtifact(
        { path: domain.inventoryPath, sha256: domain.inventorySha256 },
        `${domainContext}.inventory`,
        artifactHashes,
        artifactFiles
      );
      const inventory = readJsonFile(
        inventoryBinding.absolutePath,
        `${domainContext}.inventory`
      );
      assertExactRecordKeys(
        inventory,
        [
          'schemaVersion',
          'resultType',
          'status',
          'targetKind',
          'environmentProjectRef',
          'gitCommit',
          'commandId',
          'capturedAt',
          'runtimeIdentity',
          'domain',
          'files',
          'fileCount',
          'totalBytes',
        ],
        `${domainContext}.inventory`
      );
      assert(
        inventory.schemaVersion === 1 &&
          inventory.resultType === 'SERVICE_ROLE_SCAN_INVENTORY' &&
          inventory.status === 'CAPTURED' &&
          inventory.targetKind === expectedTargetKind &&
          inventory.environmentProjectRef === expectedProjectRef &&
          inventory.gitCommit === source.gitCommit &&
          inventory.commandId === commandId &&
          inventory.capturedAt === report.capturedAt &&
          inventory.domain === domainName,
        `${domainContext}.inventory provenance drift`
      );
      assertJsonEquivalent(
        inventory.runtimeIdentity,
        runtimeIdentity,
        `${domainContext}.inventory.runtimeIdentity`
      );
      const files = requireArray(
        inventory.files,
        `${domainContext}.inventory.files`
      ).map((fileValue, fileIndex) => {
        const fileContext = `${domainContext}.inventory.files[${String(fileIndex)}]`;
        const file = requireRecord(fileValue, fileContext);
        assertExactRecordKeys(
          file,
          ['path', 'sha256', 'bytes', 'provenance'],
          fileContext
        );
        const fileBinding = verifyBoundArtifact(
          { path: file.path, sha256: file.sha256 },
          fileContext,
          artifactHashes,
          artifactFiles
        );
        const bytes = requireNumber(file.bytes, `${fileContext}.bytes`);
        assert(
          bytes > 0 && statSync(fileBinding.absolutePath).size === bytes,
          `${fileContext}.bytes is empty or does not match the scanned file`
        );
        requireConcreteString(file.provenance, `${fileContext}.provenance`);
        return { path: fileBinding.path, bytes };
      });
      assert(
        files.length > 0 &&
          new Set(files.map(file => file.path)).size === files.length &&
          inventory.fileCount === files.length &&
          inventory.totalBytes ===
            files.reduce((sum, file) => sum + file.bytes, 0) &&
          domain.fileCount === inventory.fileCount &&
          domain.totalBytes === inventory.totalBytes &&
          domain.exactMatchCount === 0 &&
          domain.patternFindingCount === 0,
        `${domainContext} scan coverage, byte totals, or findings drift`
      );
      return {
        domainName,
        fileCount: inventory.fileCount,
        totalBytes: inventory.totalBytes,
        filePaths: files.map(file => file.path),
      };
    }
  );
  assertExactStringArray(
    domains.map(domain => domain.domainName).sort(),
    [...REQUIRED_SERVICE_ROLE_SCAN_DOMAINS].sort(),
    `${context}.report.domains`
  );
  assert(
    report.scannedFileCount ===
      domains.reduce((sum, domain) => sum + domain.fileCount, 0) &&
      report.scannedByteCount ===
        domains.reduce((sum, domain) => sum + domain.totalBytes, 0) &&
      report.scannedFileCount >= REQUIRED_SERVICE_ROLE_SCAN_DOMAINS.length &&
      report.scannedByteCount > 0,
    `${context}.report scan totals do not derive from every required domain`
  );
  const commandStreamDomain = domains.find(
    domain => domain.domainName === 'COMMAND_STREAM_AND_EVIDENCE'
  );
  assert(
    commandStreamDomain &&
      [...coveredRawArtifactPaths].every(artifactPath =>
        commandStreamDomain.filePaths.includes(artifactPath)
      ),
    `${context}.report command-stream inventory omits covered API evidence`
  );
  return reportBinding;
}

function verifySecurityMatrix(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  expectedProjectRef,
  expectedTargetKind,
  credentialConfiguration
) {
  const matrix = requireRecord(manifest.securityMatrix, 'securityMatrix');
  assert(
    requireNonProductionProjectRef(
      matrix.environmentProjectRef,
      'securityMatrix.environmentProjectRef'
    ) === expectedProjectRef,
    'securityMatrix.environmentProjectRef target mismatch'
  );
  const matrixId = requireConcreteString(
    matrix.matrixId,
    'securityMatrix.matrixId'
  );
  const contractBinding = verifyBoundArtifact(
    { path: matrix.contractPath, sha256: matrix.contractSha256 },
    'securityMatrix.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    contractBinding.absolutePath,
    'securityMatrix.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'securityMatrix contract schemaVersion drift'
  );
  assert(
    contract.matrixId === matrixId,
    'securityMatrix.matrixId approval mismatch'
  );
  const authProvenance = verifyAuthTokenProvenance(
    matrix,
    contract,
    expectedProjectRef,
    artifactPaths
  );
  const roles = new Set(
    requireArray(matrix.roles, 'securityMatrix.roles').map((value, index) =>
      requireConcreteString(value, `securityMatrix.roles[${String(index)}]`)
    )
  );
  const jwtCases = new Set(
    requireArray(matrix.jwtCases, 'securityMatrix.jwtCases').map(
      (value, index) =>
        requireConcreteString(
          value,
          `securityMatrix.jwtCases[${String(index)}]`
        )
    )
  );
  const tenantCrudCases = new Set(
    requireArray(matrix.tenantCrudCases, 'securityMatrix.tenantCrudCases').map(
      (value, index) =>
        requireConcreteString(
          value,
          `securityMatrix.tenantCrudCases[${String(index)}]`
        )
    )
  );
  const targets = new Set(
    requireArray(matrix.targets, 'securityMatrix.targets').map((value, index) =>
      requireConcreteString(value, `securityMatrix.targets[${String(index)}]`)
    )
  );
  assert(targets.size > 0, 'securityMatrix.targets must not be empty');
  const tenantDirections = new Set(
    requireArray(
      matrix.tenantDirections,
      'securityMatrix.tenantDirections'
    ).map((value, index) =>
      requireConcreteString(
        value,
        `securityMatrix.tenantDirections[${String(index)}]`
      )
    )
  );
  assertExactStringArray(
    [...tenantDirections].sort(),
    [...REQUIRED_TENANT_DIRECTIONS].sort(),
    'securityMatrix.tenantDirections'
  );
  for (const role of REQUIRED_ROLES)
    assert(roles.has(role), `securityMatrix.roles missing ${role}`);
  for (const jwtCase of REQUIRED_JWT_CASES) {
    assert(jwtCases.has(jwtCase), `securityMatrix.jwtCases missing ${jwtCase}`);
  }
  for (const operation of REQUIRED_TENANT_CRUD) {
    assert(
      tenantCrudCases.has(operation),
      `securityMatrix.tenantCrudCases missing ${operation}`
    );
  }

  const contractRoles = requireArray(
    contract.roles,
    'securityMatrix.contract.roles'
  );
  const contractJwtCases = requireArray(
    contract.jwtCases,
    'securityMatrix.contract.jwtCases'
  );
  const contractTenantCrud = requireArray(
    contract.tenantCrudCases,
    'securityMatrix.contract.tenantCrudCases'
  );
  const contractTargets = requireConcreteStringArray(
    contract.targets,
    'securityMatrix.contract.targets'
  );
  const inventoryTargets = verifySecurityTargetInventory(
    manifest,
    matrix,
    expectedProjectRef,
    contract,
    artifactHashes,
    artifactFiles
  );
  const contractTenantDirections = requireConcreteStringArray(
    contract.tenantDirections,
    'securityMatrix.contract.tenantDirections'
  );
  assert(
    JSON.stringify([...roles].sort()) ===
      JSON.stringify([...contractRoles].sort()),
    'securityMatrix.roles approval mismatch'
  );
  assert(
    JSON.stringify([...jwtCases].sort()) ===
      JSON.stringify([...contractJwtCases].sort()),
    'securityMatrix.jwtCases approval mismatch'
  );
  assert(
    JSON.stringify([...tenantCrudCases].sort()) ===
      JSON.stringify([...contractTenantCrud].sort()),
    'securityMatrix.tenantCrudCases approval mismatch'
  );
  assertExactStringArray(
    [...targets].sort(),
    [...contractTargets].sort(),
    'securityMatrix.targets'
  );
  assertExactStringArray(
    [...contractTargets].sort(),
    inventoryTargets,
    'securityMatrix.contract.targets derived from approved target inventory'
  );
  assertExactStringArray(
    [...tenantDirections].sort(),
    [...contractTenantDirections].sort(),
    'securityMatrix.tenantDirections'
  );

  const expectedRows = requireArray(
    contract.rows,
    'securityMatrix.contract.rows'
  );
  const expectedById = new Map();
  for (const [index, value] of expectedRows.entries()) {
    const context = `securityMatrix.contract.rows[${String(index)}]`;
    const expected = requireRecord(value, context);
    const caseId = requireConcreteString(expected.caseId, `${context}.caseId`);
    assert(!expectedById.has(caseId), `${context}.caseId is duplicated`);
    expectedById.set(caseId, expected);
  }

  const rows = requireArray(matrix.rows, 'securityMatrix.rows');
  assert(
    rows.length === expectedRows.length && rows.length > 0,
    'securityMatrix.rows do not match the approved contract count'
  );
  const observedRoles = new Set();
  const observedJwtCases = new Set();
  const observedOperations = new Set();
  const observedCrossTenantCases = new Set();
  const observedIds = new Set();
  for (const [index, value] of rows.entries()) {
    const context = `securityMatrix.rows[${String(index)}]`;
    const row = requireRecord(value, context);
    const caseId = requireConcreteString(row.caseId, `${context}.caseId`);
    assert(!observedIds.has(caseId), `${context}.caseId is duplicated`);
    observedIds.add(caseId);
    const expected = requireRecord(
      expectedById.get(caseId),
      `${context}.approvedContract`
    );
    const relationalSemanticCase =
      RELATIONAL_REJECTION_CASES.has(row.jwtCase) ||
      RELATIONAL_CASCADE_CASES.has(row.jwtCase);
    const authoritySemanticCase =
      AUTHORITY_FAIL_CLOSED_JWT_CASES.has(row.jwtCase) ||
      AUTHORITY_LOOKUP_FAIL_CLOSED_JWT_CASES.has(row.jwtCase);
    for (const field of [
      'role',
      'actor',
      'jwtCase',
      'caseClass',
      'sourceTenant',
      'targetTenant',
      'tenantBoundary',
      'tenantDirection',
      'target',
      'operation',
    ]) {
      const observedValue =
        field === 'tenantDirection' &&
        (relationalSemanticCase || authoritySemanticCase)
          ? requireString(row[field], `${context}.${field}`)
          : requireConcreteString(row[field], `${context}.${field}`);
      if (
        field === 'tenantDirection' &&
        (relationalSemanticCase || authoritySemanticCase)
      ) {
        assert(
          observedValue === 'NOT_APPLICABLE',
          `${context}.tenantDirection relational semantic drift`
        );
      }
      assert(
        expected[field] === observedValue,
        `${context}.${field} approval mismatch`
      );
    }
    if (relationalSemanticCase) {
      assert(
        row.sourceTenant === row.targetTenant,
        `${context} relational semantic case must remain within one tenant`
      );
    } else if (authoritySemanticCase) {
      assert(
        row.sourceTenant === row.targetTenant &&
          row.tenantBoundary === 'SAME_TENANT_AUTHORITY_DENIED' &&
          row.tenantDirection === 'NOT_APPLICABLE',
        `${context} authority case must remain same-tenant and authority-specific`
      );
    } else {
      assert(
        row.sourceTenant !== row.targetTenant,
        `${context} must use distinct source and target tenants`
      );
      assert(
        row.tenantBoundary === 'CROSS_TENANT_DENIED',
        `${context}.tenantBoundary must be CROSS_TENANT_DENIED`
      );
    }
    observedRoles.add(row.role);
    observedJwtCases.add(row.jwtCase);
    observedOperations.add(row.operation);
    if (APPLICATION_ROLES.includes(row.role) && row.jwtCase === 'valid_jwt') {
      observedCrossTenantCases.add(
        `${row.target}:${row.role}:${row.tenantDirection}:${row.operation}`
      );
    }
    for (const field of [
      'expectedHttpStatus',
      'expectedSqlstate',
      'expectedRowCount',
      'expectedDecision',
      'expectedMutationCount',
      'expectedDirectAffectedRows',
      'expectedAclOutcome',
      'expectedRlsOutcome',
    ]) {
      assert(
        (typeof row[field] === 'string' &&
          (!UNRESOLVED.has(row[field]) ||
            (relationalSemanticCase &&
              field === 'expectedHttpStatus' &&
              row[field] === 'NOT_APPLICABLE'))) ||
          Number.isInteger(row[field]),
        `${context}.${field} contains a placeholder or unresolved value`
      );
      assert(
        expected[field] === row[field],
        `${context}.${field} approval mismatch`
      );
    }
    verifyAuthTokenUse(row, expected, authProvenance, context);
    for (const field of [
      'expectedErrorIdentity',
      'expectedPostcondition',
      'expectedPreservedSentinel',
      'expectedTransactionEndCommand',
      'expectedTransactionEndStatus',
    ]) {
      const expectedValue = requireString(row[field], `${context}.${field}`);
      assert(
        !UNRESOLVED.has(expectedValue) || expectedValue === 'NOT_APPLICABLE',
        `${context}.${field} contains a placeholder or unresolved value`
      );
      assert(
        expected[field] === expectedValue,
        `${context}.${field} approval mismatch`
      );
    }
    for (const [expectedField, observedField] of [
      ['expectedHttpStatus', 'observedHttpStatus'],
      ['expectedSqlstate', 'observedSqlstate'],
      ['expectedRowCount', 'observedRowCount'],
      ['expectedDecision', 'observedDecision'],
      ['expectedMutationCount', 'observedMutationCount'],
      ['expectedDirectAffectedRows', 'observedDirectAffectedRows'],
      ['expectedAclOutcome', 'observedAclOutcome'],
      ['expectedRlsOutcome', 'observedRlsOutcome'],
      ['expectedErrorIdentity', 'observedErrorIdentity'],
      ['expectedPostcondition', 'observedPostcondition'],
      ['expectedPreservedSentinel', 'observedPreservedSentinel'],
      ['expectedTransactionEndCommand', 'observedTransactionEndCommand'],
      ['expectedTransactionEndStatus', 'observedTransactionEndStatus'],
    ]) {
      assert(
        row[observedField] === row[expectedField],
        `${context}.${observedField} does not match ${expectedField}`
      );
    }
    assertJsonEquivalent(
      row.expectedStateTransitions,
      expected.expectedStateTransitions,
      `${context}.expectedStateTransitions approval`
    );
    assertJsonEquivalent(
      row.expectedErrorDiagnostic,
      expected.expectedErrorDiagnostic,
      `${context}.expectedErrorDiagnostic approval`
    );
    assertJsonEquivalent(
      tenantProbeControlApprovalView(
        row.tenantProbeControl,
        `${context}.tenantProbeControl`
      ),
      tenantProbeControlApprovalView(
        expected.tenantProbeControl,
        `${context}.approvedTenantProbeControl`
      ),
      `${context}.tenantProbeControl approval`
    );
    assertJsonEquivalent(
      authorityStateControlApprovalView(
        row.authorityStateControl,
        `${context}.authorityStateControl`
      ),
      authorityStateControlApprovalView(
        expected.authorityStateControl,
        `${context}.approvedAuthorityStateControl`
      ),
      `${context}.authorityStateControl approval`
    );
    assertJsonEquivalent(
      row.observedErrorDiagnostic,
      row.expectedErrorDiagnostic,
      `${context}.observedErrorDiagnostic`
    );
    verifyNonWaivableSecuritySemantics(row, context);
    verifySecurityStateTransitions(row, context, relationalSemanticCase);
    if (
      relationalSemanticCase ||
      AUTHORITY_LOOKUP_FAIL_CLOSED_JWT_CASES.has(row.jwtCase)
    ) {
      assert(
        row.aclVerdict === 'NOT_APPLICABLE',
        `${context}.aclVerdict must be NOT_APPLICABLE when ACL was not evaluated`
      );
      assert(
        row.rlsVerdict === 'NOT_APPLICABLE',
        `${context}.rlsVerdict must be NOT_APPLICABLE when RLS was not evaluated`
      );
    } else {
      assert(row.aclVerdict === 'PASS', `${context}.aclVerdict must be PASS`);
      assert(row.rlsVerdict === 'PASS', `${context}.rlsVerdict must be PASS`);
    }
    assert(row.status === 'PASS', `${context}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${context}.evidence`,
      artifactPaths
    );
  }
  for (const role of REQUIRED_ROLES) {
    assert(
      observedRoles.has(role),
      `securityMatrix.rows have no case for ${role}`
    );
  }
  for (const jwtCase of REQUIRED_JWT_CASES) {
    assert(
      observedJwtCases.has(jwtCase),
      `securityMatrix.rows have no case for ${jwtCase}`
    );
  }
  for (const operation of REQUIRED_TENANT_CRUD) {
    assert(
      observedOperations.has(operation),
      `securityMatrix.rows have no case for ${operation}`
    );
  }
  for (const target of targets) {
    for (const role of APPLICATION_ROLES) {
      for (const direction of REQUIRED_TENANT_DIRECTIONS) {
        for (const operation of REQUIRED_TENANT_CRUD) {
          assert(
            observedCrossTenantCases.has(
              `${target}:${role}:${direction}:${operation}`
            ),
            `securityMatrix.rows missing cross-tenant ${target} ${role} ${direction} ${operation}`
          );
        }
      }
    }
  }
  verifyPassedGate(
    matrix.serviceRoleBoundary,
    'securityMatrix.serviceRoleBoundary',
    artifactPaths
  );
  verifyPassedGate(
    matrix.aclRlsIndependence,
    'securityMatrix.aclRlsIndependence',
    artifactPaths
  );
}

function verifyRepresentativeData(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const data = requireRecord(manifest.representativeData, 'representativeData');
  const binding = verifyBoundArtifact(
    { path: data.contractPath, sha256: data.contractSha256 },
    'representativeData.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    binding.absolutePath,
    'representativeData.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'representativeData contract schemaVersion drift'
  );
  const classification = requireConcreteString(
    data.classification,
    'representativeData.classification'
  );
  assert(
    ['SYNTHETIC', 'ANONYMIZED'].includes(classification),
    'representativeData.classification is unsupported'
  );
  for (const field of [
    'classification',
    'volume',
    'sourceSha256',
    'expiresAt',
  ]) {
    assert(
      contract[field] === data[field],
      `representativeData.${field} approval mismatch`
    );
  }
  requireConcreteString(data.volume, 'representativeData.volume');
  requireSha256(data.sourceSha256, 'representativeData.sourceSha256');
  requireIsoTimestamp(data.expiresAt, 'representativeData.expiresAt', {
    future: true,
  });
  verifyEvidenceReferences(
    data.evidence,
    'representativeData.evidence',
    artifactPaths
  );
}

function verifyMetricResults(
  resultsValue,
  expectedGates,
  context,
  artifactPaths
) {
  const results = requireArray(resultsValue, context);
  assert(
    results.length === expectedGates.length,
    `${context} count does not match the frozen contract`
  );
  const observedIds = new Set();
  for (const [index, value] of results.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(value, rowContext);
    const id = requireConcreteString(row.id, `${rowContext}.id`);
    assert(!observedIds.has(id), `${rowContext}.id is duplicated`);
    observedIds.add(id);
    const expected = requireRecord(
      expectedGates[index],
      `${rowContext}.frozenGate`
    );
    assert(
      id === expected.id,
      `${rowContext}.id order drift: expected ${String(expected.id)}`
    );
    const samples = requireArray(row.samples, `${rowContext}.samples`).map(
      (sample, sampleIndex) =>
        requireNumber(sample, `${rowContext}.samples[${String(sampleIndex)}]`)
    );
    assertExactStringArray(
      requireConcreteStringArray(row.sampleIds, `${rowContext}.sampleIds`),
      ['pair1_after', 'pair2_after', 'pair3_after'],
      `${rowContext}.sampleIds`
    );
    assert(
      samples.length === 3,
      `${rowContext}.samples must contain exactly three values`
    );
    const median = [...samples].sort((left, right) => left - right)[1];
    assert(
      row.median === median,
      `${rowContext}.median does not match the samples`
    );
    assert(row.limit === expected.limit, `${rowContext}.limit drift`);
    assert(row.unit === expected.unit, `${rowContext}.unit drift`);
    assert(
      median <= expected.limit,
      `${rowContext}.median exceeds the frozen limit`
    );
    assert(row.status === 'PASS', `${rowContext}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${rowContext}.evidence`,
      artifactPaths
    );
  }
  for (const expected of expectedGates) {
    assert(
      observedIds.has(expected.id),
      `${context} is missing ${expected.id}`
    );
  }
}

function verifyNamedResults(resultsValue, expectedIds, context, artifactPaths) {
  const results = requireArray(resultsValue, context);
  assert(results.length === expectedIds.length, `${context} count drift`);
  const observed = new Set();
  for (const [index, value] of results.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(value, rowContext);
    const id = requireConcreteString(row.id, `${rowContext}.id`);
    assert(
      id === expectedIds[index],
      `${rowContext}.id order drift: expected ${String(expectedIds[index])}`
    );
    assert(!observed.has(id), `${rowContext}.id is duplicated`);
    observed.add(id);
    assert(row.status === 'PASS', `${rowContext}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${rowContext}.evidence`,
      artifactPaths
    );
  }
}

function requireDedicatedCommand(
  manifest,
  commandId,
  expectedPhase,
  binding,
  context,
  expectedMutating,
  expectedMutationScope
) {
  const matches = requireArray(manifest.commands, 'commands')
    .map((value, index) => requireRecord(value, `commands[${String(index)}]`))
    .filter(command => command.id === commandId);
  assert(
    matches.length === 1,
    `${context}.commandId is not unique in commands`
  );
  const command = matches[0];
  assert(
    command.phase === expectedPhase && command.remoteContact === true,
    `${context} dedicated command phase or remote-contact scope mismatch`
  );
  assert(
    command.mutating === expectedMutating &&
      command.mutationScope === expectedMutationScope,
    `${context} dedicated command mutation scope mismatch`
  );
  assert(
    command.stdoutPath.replaceAll('\\', '/') === binding.path &&
      command.stdoutSha256 === binding.sha256,
    `${context} is not the exact stdout of its approved dedicated command`
  );
  return command;
}

function verifySourceCommandResult({
  manifest,
  result,
  binding,
  context,
  commandId,
  phase,
  family,
  transport,
  observationType,
  payload,
  expectedEvidencePaths,
  mutating,
  mutationScope,
}) {
  assert(result.commandId === commandId, `${context}.commandId mismatch`);
  const command = requireDedicatedCommand(
    manifest,
    commandId,
    phase,
    binding,
    context,
    mutating,
    mutationScope
  );
  const capturedAt = requireIsoTimestamp(
    result.capturedAt,
    `${context}.capturedAt`
  );
  assert(
    capturedAt === command.endedAt,
    `${context}.capturedAt is not bound to its command`
  );
  assert(
    result.environmentProjectRef === manifest.environment.projectRef &&
      result.gitCommit === manifest.source.gitCommit,
    `${context} source target or commit mismatch`
  );
  verifyRuntimeIdentityBinding(
    result.runtimeIdentity,
    manifest.environment,
    `${context}.runtimeIdentity`
  );
  const { observations } = requireRawObservationEnvelope(
    result,
    context,
    family,
    transport,
    { startedAt: command.startedAt, endedAt: command.endedAt }
  );
  assert(
    observations.length === 1,
    `${context} must contain one raw observation`
  );
  const observation = observations[0];
  assert(
    observation.observationType === observationType,
    `${context} raw observation type mismatch`
  );
  assertJsonEquivalent(
    observation.payload,
    payload,
    `${context}.rawObservation.payload`
  );
  const evidencePaths = requireConcreteStringArray(
    result.evidence,
    `${context}.evidence`
  );
  assertExactStringArray(
    [...evidencePaths].sort(),
    [...expectedEvidencePaths].sort(),
    `${context}.evidence`
  );
  return command;
}

function nearestRank(values, percentile, context) {
  const samples = requireArray(values, context).map((value, index) =>
    requireNumber(value, `${context}[${String(index)}]`)
  );
  assert(samples.length > 0, `${context} must not be empty`);
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(percentile * ordered.length) - 1];
}

function verifyCanonicalObservation(
  manifest,
  performance,
  artifactHashes,
  artifactFiles
) {
  const binding = verifyBoundArtifact(
    performance.canonicalObservation,
    'performance.canonicalObservation',
    artifactHashes,
    artifactFiles
  );
  const raw = readJsonFile(
    binding.absolutePath,
    'performance.canonicalObservation'
  );
  assert(
    raw.schemaVersion === 1 &&
      raw.resultType === 'CANONICAL_PR11_RAW_EVIDENCE' &&
      raw.status === 'CAPTURED' &&
      raw.projectRef === manifest.environment.projectRef &&
      raw.gitCommit === manifest.source.gitCommit &&
      raw.commandId === 'PR12-CMD-011',
    'performance.canonicalObservation source identity or result type mismatch'
  );
  const command = requireDedicatedCommand(
    manifest,
    'PR12-CMD-011',
    'canonical_pr11',
    binding,
    'performance.canonicalObservation',
    true,
    'CANONICAL_PROBE_TRANSACTION_ONLY'
  );
  assert(
    raw.capturedAt === command.endedAt,
    'performance.canonicalObservation.capturedAt is not bound to its command'
  );
  verifyRuntimeIdentityBinding(
    raw.runtimeIdentity,
    manifest.environment,
    'performance.canonicalObservation.runtimeIdentity'
  );
  const canonical = {
    sampleCount: performance.sampleCount,
    aggregation: performance.aggregation,
    pairedSampleOrder: performance.pairedSampleOrder,
    primaryExecutionResults: performance.primaryExecutionResults,
    primaryWalResults: performance.primaryWalResults,
    auxiliaryExecutionResults: performance.auxiliaryExecutionResults,
    auxiliaryWalResults: performance.auxiliaryWalResults,
    planResults: performance.planResults,
    semanticResults: performance.semanticResults,
  };
  assertJsonEquivalent(
    raw.canonical,
    canonical,
    'performance.canonicalObservation.canonical'
  );
  const { observations } = requireRawObservationEnvelope(
    raw,
    'performance.canonicalObservation',
    'CANONICAL_PR11_PERFORMANCE',
    'DIRECT_POSTGRES_CANONICAL_PROBES',
    { startedAt: command.startedAt, endedAt: command.endedAt }
  );
  const expectedMetricCategories = [
    ['primaryExecutionResults', performance.primaryExecutionResults],
    ['primaryWalResults', performance.primaryWalResults],
    ['auxiliaryExecutionResults', performance.auxiliaryExecutionResults],
    ['auxiliaryWalResults', performance.auxiliaryWalResults],
  ];
  const expectedNamedCategories = [
    ['planResults', performance.planResults, CANONICAL_PLAN_FACTS],
    ['semanticResults', performance.semanticResults, CANONICAL_SEMANTIC_FACTS],
  ];
  const expectedCount = [
    ...expectedMetricCategories,
    ...expectedNamedCategories,
  ]
    .map(([, values]) => requireArray(values, 'canonical result family').length)
    .reduce((total, count) => total + count, 0);
  assert(
    observations.length === expectedCount && expectedCount === 32,
    'performance.canonicalObservation must cover all 32 frozen gates'
  );
  let observationIndex = 0;
  for (const [category, values] of expectedMetricCategories) {
    for (const [index, value] of requireArray(values, category).entries()) {
      const result = requireRecord(value, `${category}[${String(index)}]`);
      const observation = observations[observationIndex++];
      assert(
        observation.observationType === 'CANONICAL_METRIC_GATE' &&
          observation.category === category &&
          observation.id === result.id,
        'performance.canonicalObservation metric gate order or identity drift'
      );
      assertJsonEquivalent(
        observation.result,
        result,
        `performance.canonicalObservation.${category}.${String(result.id)}`
      );
      assertExactStringArray(
        requireConcreteStringArray(result.evidence, `${category}.evidence`),
        [binding.path],
        `${category}.evidence`
      );
    }
  }
  for (const [category, values, expectedFacts] of expectedNamedCategories) {
    for (const [index, value] of requireArray(values, category).entries()) {
      const result = requireRecord(value, `${category}[${String(index)}]`);
      const observation = observations[observationIndex++];
      assert(
        observation.observationType === 'CANONICAL_DERIVED_GATE' &&
          observation.category === category &&
          observation.id === result.id,
        'performance.canonicalObservation derived gate order or identity drift'
      );
      assertJsonEquivalent(
        observation.result,
        result,
        `performance.canonicalObservation.${category}.${String(result.id)}`
      );
      assertJsonEquivalent(
        observation.facts,
        expectedFacts.get(result.id),
        `performance.canonicalObservation.${category}.${String(result.id)}.facts`
      );
      assertExactStringArray(
        requireConcreteStringArray(result.evidence, `${category}.evidence`),
        [binding.path],
        `${category}.evidence`
      );
    }
  }
}

function verifyHostedObservation(
  manifest,
  hosted,
  artifactHashes,
  artifactFiles
) {
  const binding = verifyBoundArtifact(
    hosted.observation,
    'performance.hostedSlo.observation',
    artifactHashes,
    artifactFiles
  );
  const raw = readJsonFile(
    binding.absolutePath,
    'performance.hostedSlo.observation'
  );
  assert(
    raw.schemaVersion === 1 &&
      raw.resultType === 'HOSTED_SLO_RAW_EVIDENCE' &&
      raw.status === 'CAPTURED' &&
      raw.projectRef === manifest.environment.projectRef &&
      raw.gitCommit === manifest.source.gitCommit &&
      raw.commandId === 'PR12-CMD-012',
    'performance.hostedSlo.observation source identity or result type mismatch'
  );
  const command = requireDedicatedCommand(
    manifest,
    'PR12-CMD-012',
    'hosted_slo',
    binding,
    'performance.hostedSlo.observation',
    true,
    'SYNTHETIC_HOSTED_WORKLOAD_ONLY'
  );
  assert(
    raw.capturedAt === command.endedAt,
    'performance.hostedSlo.observation.capturedAt is not bound to its command'
  );
  verifyRuntimeIdentityBinding(
    raw.runtimeIdentity,
    manifest.environment,
    'performance.hostedSlo.observation.runtimeIdentity'
  );
  const { observation: ignoredObservation, ...hostedPayload } = hosted;
  void ignoredObservation;
  assertJsonEquivalent(
    raw.hostedSlo,
    hostedPayload,
    'performance.hostedSlo.observation.hostedSlo'
  );
  const { observations } = requireRawObservationEnvelope(
    raw,
    'performance.hostedSlo.observation',
    'HOSTED_SLO',
    'HTTPS_WORKLOAD_AND_DIRECT_POSTGRES_MONITORING',
    { startedAt: command.startedAt, endedAt: command.endedAt }
  );
  assert(
    observations.length === 5,
    'performance.hostedSlo.observation must contain 3 samples, pooled, and monitoring'
  );
  const samples = requireArray(
    hosted.sampleResults,
    'performance.hostedSlo.sampleResults'
  );
  const rawLatencyVectors = [];
  for (const [index, value] of samples.entries()) {
    const result = requireRecord(
      value,
      `performance.hostedSlo.sampleResults[${String(index)}]`
    );
    const observation = observations[index];
    assert(
      observation.observationType === 'HOSTED_SCORED_SAMPLE' &&
        observation.observationId === `hosted-${String(result.id)}`,
      'performance.hostedSlo raw sample order drift'
    );
    assertJsonEquivalent(
      observation.result,
      result,
      `performance.hostedSlo.rawSample.${String(result.id)}`
    );
    const latencies = requireArray(
      observation.latenciesMs,
      `performance.hostedSlo.rawSample.${String(result.id)}.latenciesMs`
    );
    rawLatencyVectors.push(latencies);
    const observed = requireRecord(result.observed, 'hosted sample observed');
    assert(
      latencies.length === result.completedRequests &&
        observed.p95Ms === nearestRank(latencies, 0.95, 'hosted sample p95') &&
        observed.p99Ms === nearestRank(latencies, 0.99, 'hosted sample p99'),
      'performance.hostedSlo sample population or percentiles are not derived from raw latency values'
    );
    assertExactStringArray(
      requireConcreteStringArray(result.evidence, 'hosted sample evidence'),
      [binding.path],
      'performance.hostedSlo sample evidence'
    );
  }
  const pooledObservation = observations[3];
  assert(
    pooledObservation.observationType === 'HOSTED_POOLED_SAMPLE',
    'performance.hostedSlo pooled observation is missing'
  );
  assertJsonEquivalent(
    pooledObservation.result,
    hosted.pooledResult,
    'performance.hostedSlo.rawPooledResult'
  );
  const pooledLatencies = requireArray(
    pooledObservation.latenciesMs,
    'performance.hostedSlo.rawPooledLatencies'
  );
  assertJsonEquivalent(
    pooledLatencies,
    rawLatencyVectors.flat(),
    'performance.hostedSlo pooled latency population'
  );
  const pooledObserved = requireRecord(
    requireRecord(hosted.pooledResult, 'hosted pooled result').observed,
    'hosted pooled observed'
  );
  assert(
    pooledLatencies.length === hosted.pooledResult.completedRequests &&
      pooledObserved.p95Ms ===
        nearestRank(pooledLatencies, 0.95, 'pooled p95') &&
      pooledObserved.p99Ms === nearestRank(pooledLatencies, 0.99, 'pooled p99'),
    'performance.hostedSlo pooled population or percentiles are not derived from raw latency values'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      requireRecord(hosted.pooledResult, 'hosted pooled result').evidence,
      'hosted pooled evidence'
    ),
    [binding.path],
    'performance.hostedSlo pooled evidence'
  );
  const monitoring = observations[4];
  assert(
    monitoring.observationType === 'HOSTED_DATABASE_MONITORING',
    'performance.hostedSlo monitoring observation is missing'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      monitoring.sampleOrder,
      'hosted monitoring order'
    ),
    requireConcreteStringArray(hosted.sampleOrder, 'hosted sample order'),
    'performance.hostedSlo monitoring sample order'
  );
  const walDeltas = requireArray(
    monitoring.walBoundaryDeltas,
    'performance.hostedSlo monitoring WAL deltas'
  ).map((value, index) =>
    requireNumber(
      value,
      `performance.hostedSlo monitoring WAL[${String(index)}]`
    )
  );
  const cpuSamples = requireArray(
    monitoring.cpuPercentSamples,
    'performance.hostedSlo monitoring CPU samples'
  ).map((value, index) =>
    requireNumber(
      value,
      `performance.hostedSlo monitoring CPU[${String(index)}]`
    )
  );
  const poolSamples = requireArray(
    monitoring.poolHeadroomPercentSamples,
    'performance.hostedSlo monitoring pool samples'
  ).map((value, index) =>
    requireNumber(
      value,
      `performance.hostedSlo monitoring pool[${String(index)}]`
    )
  );
  const lockSamples = requireArray(
    monitoring.lockWaitMsSamples,
    'performance.hostedSlo monitoring lock samples'
  ).map((value, index) =>
    requireNumber(
      value,
      `performance.hostedSlo monitoring lock[${String(index)}]`
    )
  );
  assert(
    cpuSamples.length === samples.length &&
      poolSamples.length === samples.length &&
      lockSamples.length === samples.length,
    'performance.hostedSlo monitoring sample counts do not reconcile'
  );
  for (const [index, value] of samples.entries()) {
    const result = requireRecord(
      value,
      `performance.hostedSlo.sampleResults[${String(index)}]`
    );
    const observed = requireRecord(
      result.observed,
      `performance.hostedSlo.sampleResults[${String(index)}].observed`
    );
    assert(
      cpuSamples[index] === observed.cpuPercent &&
        poolSamples[index] === observed.poolHeadroomPercent &&
        lockSamples[index] === observed.lockWaitMs &&
        walDeltas[index] === observed.walBytes,
      'performance.hostedSlo monitoring values do not reconcile with scored samples'
    );
  }
  assert(
    walDeltas.length === samples.length &&
      walDeltas.reduce((total, value) => total + value, 0) ===
        pooledObserved.walBytes &&
      Math.max(...cpuSamples) === pooledObserved.cpuPercent &&
      Math.min(...poolSamples) === pooledObserved.poolHeadroomPercent &&
      Math.max(...lockSamples) === pooledObserved.lockWaitMs,
    'performance.hostedSlo monitoring values do not reconcile with pooled result'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      hosted.evidence,
      'performance.hostedSlo.evidence'
    ),
    [binding.path],
    'performance.hostedSlo.evidence'
  );

  const replayBinding = verifyBoundArtifact(
    hosted.migrationReplay,
    'performance.hostedSlo.migrationReplay',
    artifactHashes,
    artifactFiles
  );
  const cleanReplayApply = requireRecord(
    requireRecord(manifest.cleanReplay, 'cleanReplay').apply,
    'cleanReplay.apply'
  );
  assertBindingMatch(
    cleanReplayApply.path,
    cleanReplayApply.sha256,
    replayBinding,
    'performance.hostedSlo.migrationReplay'
  );
  const replay = readJsonFile(
    replayBinding.absolutePath,
    'performance.hostedSlo.migrationReplay'
  );
  const replayCommand = requireDedicatedCommand(
    manifest,
    'PR12-CMD-007',
    'migration_replay',
    replayBinding,
    'performance.hostedSlo.migrationReplay',
    true,
    'ISOLATED_SCHEMA_REPLAY_ONLY'
  );
  assert(
    replay.resultType === 'CLEAN_MIGRATION_REPLAY_OPERATION' &&
      replay.status === 'PASS' &&
      replay.commandId === 'PR12-CMD-007' &&
      replay.projectRef === manifest.environment.projectRef &&
      replay.gitCommit === manifest.source.gitCommit &&
      replay.startedAt === replayCommand.startedAt &&
      replay.completedAt === replayCommand.endedAt,
    'performance.hostedSlo migration replay operation identity mismatch'
  );
  verifyRuntimeIdentityBinding(
    replay.runtimeIdentity,
    manifest.environment,
    'performance.hostedSlo.migrationReplay.runtimeIdentity'
  );
  const replayDuration =
    (Date.parse(replay.completedAt) - Date.parse(replay.startedAt)) / 1000;
  assert(
    replay.durationSeconds === replayDuration &&
      hosted.migrationDurationSeconds === replayDuration,
    'performance.hostedSlo migration duration is not derived from the replay command'
  );
}

function verifyHostedSlo(
  manifest,
  hostedValue,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const hosted = requireRecord(hostedValue, 'performance.hostedSlo');
  const binding = verifyBoundArtifact(
    { path: hosted.contractPath, sha256: hosted.contractSha256 },
    'performance.hostedSlo.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    binding.absolutePath,
    'performance.hostedSlo.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'hosted SLO contract schemaVersion drift'
  );
  for (const field of [
    'workloadId',
    'concurrency',
    'sampleOrder',
    'durationSeconds',
  ]) {
    assert(
      JSON.stringify(hosted[field]) === JSON.stringify(contract[field]),
      `performance.hostedSlo.${field} approval mismatch`
    );
  }
  requireConcreteString(hosted.workloadId, 'performance.hostedSlo.workloadId');
  assert(
    Number.isInteger(hosted.concurrency) && hosted.concurrency > 0,
    'performance.hostedSlo.concurrency must be a positive integer'
  );
  assert(
    requireArray(hosted.sampleOrder, 'performance.hostedSlo.sampleOrder')
      .length > 0,
    'performance.hostedSlo.sampleOrder must not be empty'
  );
  assert(
    requireNumber(
      hosted.durationSeconds,
      'performance.hostedSlo.durationSeconds'
    ) > 0,
    'performance.hostedSlo.durationSeconds must be positive'
  );
  const thresholds = requireRecord(
    hosted.thresholds,
    'performance.hostedSlo.thresholds'
  );
  const approvedThresholds = requireRecord(
    contract.thresholds,
    'performance.hostedSlo.contract.thresholds'
  );
  assert(
    JSON.stringify(thresholds) === JSON.stringify(approvedThresholds),
    'performance.hostedSlo.thresholds approval mismatch'
  );
  const approvedSamples = requireArray(
    contract.scoredSamples,
    'performance.hostedSlo.contract.scoredSamples'
  ).map((value, index) =>
    requireRecord(
      value,
      `performance.hostedSlo.contract.scoredSamples[${String(index)}]`
    )
  );
  assert(
    approvedSamples.length === 3,
    'performance.hostedSlo.contract.scoredSamples must contain exactly three samples'
  );
  assertExactStringArray(
    approvedSamples.map(sample =>
      requireConcreteString(
        sample.id,
        'performance.hostedSlo.contract.scoredSamples.id'
      )
    ),
    requireConcreteStringArray(
      hosted.sampleOrder,
      'performance.hostedSlo.sampleOrder'
    ),
    'performance.hostedSlo sample order'
  );
  const approvedAbort = requireRecord(
    contract.databaseAbortThresholds,
    'performance.hostedSlo.contract.databaseAbortThresholds'
  );
  const cpuWindowSeconds = requireNumber(
    approvedAbort.cpuWindowSeconds,
    'performance.hostedSlo.contract.databaseAbortThresholds.cpuWindowSeconds'
  );
  const poolWindowSeconds = requireNumber(
    approvedAbort.poolWindowSeconds,
    'performance.hostedSlo.contract.databaseAbortThresholds.poolWindowSeconds'
  );
  assert(
    approvedAbort.walScope ===
      'cumulative_delta_across_all_three_scored_samples',
    'performance.hostedSlo contract WAL scope drift'
  );
  const monitoring = requireRecord(
    contract.monitoring,
    'performance.hostedSlo.contract.monitoring'
  );
  assert(
    monitoring.cpuAndPoolSamplingSeconds === 60 &&
      monitoring.lockSamplingSeconds === 5 &&
      monitoring.walSampling === 'boundary_snapshots_plus_cumulative_delta',
    'performance.hostedSlo monitoring cadence drift'
  );

  const sampleResults = requireArray(
    hosted.sampleResults,
    'performance.hostedSlo.sampleResults'
  ).map((value, index) =>
    requireRecord(
      value,
      `performance.hostedSlo.sampleResults[${String(index)}]`
    )
  );
  assert(
    sampleResults.length === approvedSamples.length,
    'performance.hostedSlo.sampleResults must contain all three scored samples'
  );

  const verifyResult = (result, expected, context) => {
    assert(result.id === expected.id, `${context}.id approval mismatch`);
    assert(
      result.durationSeconds === expected.durationSeconds,
      `${context}.durationSeconds approval mismatch`
    );
    assert(
      result.concurrency === expected.concurrency,
      `${context}.concurrency approval mismatch`
    );
    const attempted = requireNumber(
      result.attemptedRequests,
      `${context}.attemptedRequests`
    );
    const completed = requireNumber(
      result.completedRequests,
      `${context}.completedRequests`
    );
    const failed = requireNumber(
      result.failedRequests,
      `${context}.failedRequests`
    );
    const responses5xx = requireNumber(
      result.response5xxCount,
      `${context}.response5xxCount`
    );
    const timeouts = requireNumber(
      result.timeoutCount,
      `${context}.timeoutCount`
    );
    assert(
      Number.isInteger(attempted) &&
        Number.isInteger(completed) &&
        Number.isInteger(failed) &&
        Number.isInteger(responses5xx) &&
        Number.isInteger(timeouts) &&
        attempted > 0,
      `${context} request counters must be non-negative integers with attemptedRequests > 0`
    );
    assert(
      attempted === completed + failed,
      `${context} request denominator mismatch`
    );
    assert(
      failed <=
        requireNumber(
          thresholds.maximumUnexpectedFailedRequests,
          'performance.hostedSlo.thresholds.maximumUnexpectedFailedRequests'
        ),
      `${context}.failedRequests exceeds the frozen unexpected-failure threshold`
    );
    const observed = requireRecord(result.observed, `${context}.observed`);
    const expectedThroughput = completed / result.durationSeconds;
    const expected5xxRate = responses5xx / attempted;
    const expectedTimeoutRate = timeouts / attempted;
    for (const [field, expectedValue] of [
      ['throughputPerSecond', expectedThroughput],
      ['rate5xx', expected5xxRate],
      ['timeoutRate', expectedTimeoutRate],
    ]) {
      const actual = requireNumber(
        observed[field],
        `${context}.observed.${field}`
      );
      assert(
        Math.abs(actual - expectedValue) <= 1e-9,
        `${context}.observed.${field} is not recomputed from the frozen denominator`
      );
    }
    for (const [observedField, thresholdField, direction] of [
      ['p95Ms', 'p95Ms', 'max'],
      ['p99Ms', 'p99Ms', 'max'],
      ['throughputPerSecond', 'minimumThroughputPerSecond', 'min'],
      ['rate5xx', 'maximum5xxRate', 'max'],
      ['timeoutRate', 'maximumTimeoutRate', 'max'],
      ['lockWaitMs', 'maximumLockWaitMs', 'max'],
    ]) {
      const observedValue = requireNumber(
        observed[observedField],
        `${context}.observed.${observedField}`
      );
      const threshold = requireNumber(
        thresholds[thresholdField],
        `performance.hostedSlo.thresholds.${thresholdField}`
      );
      assert(
        direction === 'min'
          ? observedValue >= threshold
          : observedValue <= threshold,
        `${context}.observed.${observedField} fails its frozen threshold`
      );
    }
    const cpuPercent = requireNumber(
      observed.cpuPercent,
      `${context}.observed.cpuPercent`
    );
    const cpuAboveSeconds = requireNumber(
      observed.cpuAboveThresholdSeconds,
      `${context}.observed.cpuAboveThresholdSeconds`
    );
    assert(
      cpuPercent <= thresholds.maximumCpuPercent ||
        cpuAboveSeconds < cpuWindowSeconds,
      `${context} exceeds the frozen CPU abort window`
    );
    const poolHeadroom = requireNumber(
      observed.poolHeadroomPercent,
      `${context}.observed.poolHeadroomPercent`
    );
    const poolBelowSeconds = requireNumber(
      observed.poolBelowThresholdSeconds,
      `${context}.observed.poolBelowThresholdSeconds`
    );
    assert(
      poolHeadroom >= thresholds.minimumPoolHeadroomPercent ||
        poolBelowSeconds < poolWindowSeconds,
      `${context} exceeds the frozen pool-headroom abort window`
    );
    requireNumber(observed.walBytes, `${context}.observed.walBytes`);
    assert(result.status === 'PASS', `${context}.status must be PASS`);
    verifyEvidenceReferences(
      result.evidence,
      `${context}.evidence`,
      artifactPaths
    );
    return { attempted, completed, failed, responses5xx, timeouts, observed };
  };

  const aggregates = sampleResults.map((result, index) =>
    verifyResult(
      result,
      approvedSamples[index],
      `performance.hostedSlo.sampleResults[${String(index)}]`
    )
  );
  const pooled = requireRecord(
    hosted.pooledResult,
    'performance.hostedSlo.pooledResult'
  );
  const pooledExpected = {
    id: 'pooled',
    durationSeconds: hosted.durationSeconds,
    concurrency: hosted.concurrency,
  };
  const pooledAggregate = verifyResult(
    pooled,
    pooledExpected,
    'performance.hostedSlo.pooledResult'
  );
  for (const [field, sum] of [
    [
      'attemptedRequests',
      aggregates.reduce((total, row) => total + row.attempted, 0),
    ],
    [
      'completedRequests',
      aggregates.reduce((total, row) => total + row.completed, 0),
    ],
    [
      'failedRequests',
      aggregates.reduce((total, row) => total + row.failed, 0),
    ],
    [
      'response5xxCount',
      aggregates.reduce((total, row) => total + row.responses5xx, 0),
    ],
    [
      'timeoutCount',
      aggregates.reduce((total, row) => total + row.timeouts, 0),
    ],
  ]) {
    assert(
      pooled[field] === sum,
      `performance.hostedSlo.pooledResult.${field} mismatch`
    );
  }
  const pooledWal = requireNumber(
    pooledAggregate.observed.walBytes,
    'performance.hostedSlo.pooledResult.observed.walBytes'
  );
  assert(
    pooledWal ===
      aggregates.reduce(
        (total, row) =>
          total + requireNumber(row.observed.walBytes, 'sample WAL'),
        0
      ),
    'performance.hostedSlo pooled WAL does not equal the three sample deltas'
  );
  assert(
    pooledWal <= thresholds.maximumWalBytes,
    'performance.hostedSlo pooled WAL exceeds its frozen threshold'
  );
  const migrationDuration = requireNumber(
    hosted.migrationDurationSeconds,
    'performance.hostedSlo.migrationDurationSeconds'
  );
  assert(
    migrationDuration <= thresholds.maximumMigrationDurationSeconds,
    'performance.hostedSlo migration duration exceeds its frozen threshold'
  );
  assert(hosted.status === 'PASS', 'performance.hostedSlo.status must be PASS');
  verifyEvidenceReferences(
    hosted.evidence,
    'performance.hostedSlo.evidence',
    artifactPaths
  );
  verifyHostedObservation(manifest, hosted, artifactHashes, artifactFiles);
}

function verifyPerformance(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const performance = requireRecord(manifest.performance, 'performance');
  const binding = verifyBoundArtifact(
    { path: performance.contractPath, sha256: performance.contractSha256 },
    'performance.contract',
    artifactHashes,
    artifactFiles
  );
  const frozenHash = sha256File(FROZEN_PERFORMANCE_CONTRACT_PATH);
  assert(
    binding.sha256 === frozenHash,
    'performance.contractSha256 repository drift'
  );
  assert(
    readFileSync(binding.absolutePath).equals(
      readFileSync(FROZEN_PERFORMANCE_CONTRACT_PATH)
    ),
    'performance contract artifact is not the repository frozen contract'
  );
  const contract = readJsonFile(binding.absolutePath, 'performance.contract');
  assert(performance.sampleCount === 3, 'performance.sampleCount must be 3');
  assert(
    performance.aggregation === 'median_of_exactly_3',
    'performance.aggregation drift'
  );
  assert(
    performance.pairedSampleOrder === 'before_after_after_before_before_after',
    'performance.pairedSampleOrder drift'
  );
  verifyMetricResults(
    performance.primaryExecutionResults,
    requireArray(
      contract.primaryExecutionGates,
      'performance.contract.primaryExecutionGates'
    ),
    'performance.primaryExecutionResults',
    artifactPaths
  );
  verifyMetricResults(
    performance.primaryWalResults,
    requireArray(
      contract.primaryWalGates,
      'performance.contract.primaryWalGates'
    ),
    'performance.primaryWalResults',
    artifactPaths
  );
  verifyMetricResults(
    performance.auxiliaryExecutionResults,
    requireArray(
      contract.auxiliaryExecutionGates,
      'performance.contract.auxiliaryExecutionGates'
    ),
    'performance.auxiliaryExecutionResults',
    artifactPaths
  );
  verifyMetricResults(
    performance.auxiliaryWalResults,
    requireArray(
      contract.auxiliaryWalGates,
      'performance.contract.auxiliaryWalGates'
    ),
    'performance.auxiliaryWalResults',
    artifactPaths
  );
  verifyNamedResults(
    performance.planResults,
    requireArray(contract.planGates, 'performance.contract.planGates'),
    'performance.planResults',
    artifactPaths
  );
  verifyNamedResults(
    performance.semanticResults,
    requireArray(contract.semanticGates, 'performance.contract.semanticGates'),
    'performance.semanticResults',
    artifactPaths
  );
  verifyCanonicalObservation(
    manifest,
    performance,
    artifactHashes,
    artifactFiles
  );
  verifyHostedSlo(
    manifest,
    performance.hostedSlo,
    artifactPaths,
    artifactHashes,
    artifactFiles
  );
}

function verifyIntegrityResults(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  postWatermarkBaseline
) {
  const bindings = requireRecord(manifest.integrityResults, 'integrityResults');
  const resultBindings = new Map();
  const readResult = (name, expectedType) => {
    const bound = verifyBoundArtifact(
      bindings[name],
      `integrityResults.${name}`,
      artifactHashes,
      artifactFiles
    );
    const result = readJsonFile(bound.absolutePath, `integrityResults.${name}`);
    assert(
      result.schemaVersion === 1,
      `integrityResults.${name} schemaVersion drift`
    );
    assert(
      result.resultType === expectedType,
      `integrityResults.${name}.resultType drift`
    );
    assert(
      result.status === 'PASS',
      `integrityResults.${name}.status must be PASS`
    );
    resultBindings.set(name, bound);
    return result;
  };

  const migrationContract = readJsonFile(
    path.join(
      REPO_ROOT,
      'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json'
    ),
    'migrationInputContract'
  );
  const migration = readResult('migrationHistory', 'MIGRATION_HISTORY_PARITY');
  const expectedMigrations = readdirSync(
    path.join(REPO_ROOT, 'supabase/migrations'),
    { withFileTypes: true }
  )
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  assertExactStringArray(
    requireConcreteStringArray(
      migration.orderedMigrations,
      'integrityResults.migrationHistory.orderedMigrations'
    ),
    expectedMigrations,
    'integrityResults.migrationHistory.orderedMigrations'
  );
  for (const field of [
    'migrationHead',
    'migrationCount',
    'migrationSetSha256',
    'rollbackCount',
    'rollbackSetSha256',
    'rollbackParity',
  ]) {
    assert(
      migration[field] === migrationContract[field],
      `integrityResults.migrationHistory.${field} contract mismatch`
    );
  }
  assert(
    migration.environmentProjectRef === manifest.environment.projectRef &&
      migration.gitCommit === manifest.source.gitCommit,
    'integrityResults.migrationHistory target mismatch'
  );
  verifyEvidenceReferences(
    migration.evidence,
    'integrityResults.migrationHistory.evidence',
    artifactPaths
  );
  const migrationBinding = resultBindings.get('migrationHistory');
  verifySourceCommandResult({
    manifest,
    result: migration,
    binding: migrationBinding,
    context: 'integrityResults.migrationHistory',
    commandId: 'PR12-CMD-008A',
    phase: 'migration_replay',
    family: 'MIGRATION_HISTORY_PARITY',
    transport: 'DIRECT_POSTGRES_AND_REPOSITORY',
    observationType: 'MIGRATION_AND_ROLLBACK_PARITY',
    payload: {
      migrationHead: migration.migrationHead,
      migrationCount: migration.migrationCount,
      migrationSetSha256: migration.migrationSetSha256,
      rollbackCount: migration.rollbackCount,
      rollbackSetSha256: migration.rollbackSetSha256,
      rollbackParity: migration.rollbackParity,
      orderedMigrations: migration.orderedMigrations,
    },
    expectedEvidencePaths: [migrationBinding.path],
    mutating: false,
    mutationScope: 'NONE',
  });

  const generatedTypes = readResult('generatedTypes', 'GENERATED_TYPES_PARITY');
  const expectedTypesSha = requireRecord(
    requireRecord(
      migrationContract.nonMigrationInputs,
      'migrationInputContract.nonMigrationInputs'
    ).generatedTypes,
    'migrationInputContract.nonMigrationInputs.generatedTypes'
  ).sha256;
  assert(
    generatedTypes.environmentProjectRef === manifest.environment.projectRef &&
      generatedTypes.gitCommit === manifest.source.gitCommit &&
      generatedTypes.generatedTypesSha256 === expectedTypesSha &&
      generatedTypes.repositoryTypesSha256 === expectedTypesSha,
    'integrityResults.generatedTypes parity mismatch'
  );
  verifyEvidenceReferences(
    generatedTypes.evidence,
    'integrityResults.generatedTypes.evidence',
    artifactPaths
  );
  assert(
    generatedTypes.diffEmpty === true,
    'integrityResults.generatedTypes diff must be empty'
  );
  const generatedTypesArtifact = verifyBoundArtifact(
    generatedTypes.generatedTypesArtifact,
    'integrityResults.generatedTypes.generatedTypesArtifact',
    artifactHashes,
    artifactFiles
  );
  assert(
    generatedTypesArtifact.sha256 === expectedTypesSha,
    'integrityResults.generatedTypes captured artifact hash mismatch'
  );
  const generatedTypesBinding = resultBindings.get('generatedTypes');
  verifySourceCommandResult({
    manifest,
    result: generatedTypes,
    binding: generatedTypesBinding,
    context: 'integrityResults.generatedTypes',
    commandId: 'PR12-CMD-010',
    phase: 'schema_and_type_parity',
    family: 'GENERATED_TYPES_PARITY',
    transport: 'SUPABASE_CLI_AND_REPOSITORY_BYTES',
    observationType: 'GENERATED_TYPES_BYTE_PARITY',
    payload: {
      generatedTypesSha256: generatedTypes.generatedTypesSha256,
      repositoryTypesSha256: generatedTypes.repositoryTypesSha256,
      diffEmpty: generatedTypes.diffEmpty,
      generatedTypesArtifact: generatedTypes.generatedTypesArtifact,
    },
    expectedEvidencePaths: [
      generatedTypesBinding.path,
      generatedTypesArtifact.path,
    ],
    mutating: false,
    mutationScope: 'NONE',
  });

  const representativeBinding = verifyBoundArtifact(
    {
      path: manifest.representativeData.contractPath,
      sha256: manifest.representativeData.contractSha256,
    },
    'representativeData.contract',
    artifactHashes,
    artifactFiles
  );
  const representativeContract = readJsonFile(
    representativeBinding.absolutePath,
    'representativeData.contract'
  );
  const targetRows = requireRecord(
    requireRecord(
      representativeContract.explicitPersistentRowTargets,
      'representativeData.contract.explicitPersistentRowTargets'
    ).byRelation,
    'representativeData.contract.explicitPersistentRowTargets.byRelation'
  );
  const sourceIntegrity = readResult('source', 'SOURCE_DATA_INTEGRITY');
  const explicitRows = requireRecord(
    sourceIntegrity.explicitRowCounts,
    'integrityResults.source.explicitRowCounts'
  );
  assert(
    JSON.stringify(explicitRows) === JSON.stringify(targetRows),
    'integrityResults.source explicit row counts do not match the approved representative-data contract'
  );
  const explicitTotal = Object.values(explicitRows).reduce(
    (total, count) => total + requireNumber(count, 'source explicit row count'),
    0
  );
  assert(
    explicitTotal ===
      representativeContract.explicitPersistentRowTargets.combinedSubtotal,
    'integrityResults.source explicit row subtotal mismatch'
  );
  const derivedRows = requireRecord(
    sourceIntegrity.derivedRowCounts,
    'integrityResults.source.derivedRowCounts'
  );
  const approvedDerivedRows = requireRecord(
    representativeContract.derivedRows.byRelation,
    'representativeData.contract.derivedRows.byRelation'
  );
  assertExactRecordValues(
    derivedRows,
    approvedDerivedRows,
    'integrityResults.source.derivedRowCounts'
  );
  const derivedTotal = Object.values(derivedRows).reduce(
    (total, count) => total + requireNumber(count, 'source derived row count'),
    0
  );
  assert(
    derivedTotal === representativeContract.derivedRows.exactCount,
    'integrityResults.source derived row count mismatch'
  );
  const allRows = requireRecord(
    sourceIntegrity.allRowCounts,
    'integrityResults.source.allRowCounts'
  );
  const expectedAllRows = {};
  for (const rowSet of [explicitRows, derivedRows]) {
    for (const [relation, count] of Object.entries(rowSet)) {
      const exactCount = requireNumber(count, `row count ${relation}`);
      assert(
        Number.isInteger(exactCount),
        `row count ${relation} must be integer`
      );
      expectedAllRows[relation] = (expectedAllRows[relation] ?? 0) + exactCount;
    }
  }
  assertExactRecordValues(
    allRows,
    expectedAllRows,
    'integrityResults.source.allRowCounts'
  );
  assertExactRecordValues(
    requireRecord(manifest.rowCounts, 'manifest.rowCounts'),
    expectedAllRows,
    'manifest.rowCounts'
  );
  const hashContract = verifyIntegrityHashContract({
    representativeBinding,
    representativeContract,
    expectedRowCounts: expectedAllRows,
    artifactHashes,
    artifactFiles,
  });
  verifyIntegritySnapshot(
    sourceIntegrity,
    'integrityResults.source',
    hashContract,
    expectedAllRows
  );
  for (const field of [
    'logicalHash',
    'historicalNormalizedPhysicalHash',
    'environmentPhysicalStructureHash',
    'schemaHash',
    'dataHash',
  ]) {
    requireSha256(sourceIntegrity[field], `integrityResults.source.${field}`);
  }
  const frozenPerformance = readJsonFile(
    FROZEN_PERFORMANCE_CONTRACT_PATH,
    'frozenPerformanceContract'
  );
  const historicalFacts = requireRecord(
    frozenPerformance.historicalFacts,
    'frozenPerformanceContract.historicalFacts'
  );
  assert(
    sourceIntegrity.logicalHash === historicalFacts.logicalBaseline &&
      sourceIntegrity.historicalNormalizedPhysicalHash ===
        historicalFacts.normalizedPhysicalBaseline,
    'integrityResults.source historical logical or normalized physical fact drift'
  );
  assert(
    sourceIntegrity.environmentProjectRef === manifest.environment.projectRef &&
      sourceIntegrity.gitCommit === manifest.source.gitCommit,
    'integrityResults.source target mismatch'
  );
  verifyEvidenceReferences(
    sourceIntegrity.evidence,
    'integrityResults.source.evidence',
    artifactPaths
  );
  const sourceBinding = resultBindings.get('source');
  verifySourceCommandResult({
    manifest,
    result: sourceIntegrity,
    binding: sourceBinding,
    context: 'integrityResults.source',
    commandId: 'PR12-CMD-009',
    phase: 'representative_data_parity',
    family: 'SOURCE_DATA_INTEGRITY',
    transport: 'DIRECT_POSTGRES',
    observationType: 'SOURCE_ROW_AND_HASH_SNAPSHOT',
    payload: {
      explicitRowCounts: sourceIntegrity.explicitRowCounts,
      derivedRowCounts: sourceIntegrity.derivedRowCounts,
      allRowCounts: sourceIntegrity.allRowCounts,
      logicalHash: sourceIntegrity.logicalHash,
      historicalNormalizedPhysicalHash:
        sourceIntegrity.historicalNormalizedPhysicalHash,
      environmentPhysicalStructureHash:
        sourceIntegrity.environmentPhysicalStructureHash,
      schemaHash: sourceIntegrity.schemaHash,
      dataHash: sourceIntegrity.dataHash,
      hashContractId: sourceIntegrity.hashContractId,
      hashContractPath: sourceIntegrity.hashContractPath,
      hashContractSha256: sourceIntegrity.hashContractSha256,
      relationDigests: sourceIntegrity.relationDigests,
    },
    expectedEvidencePaths: [sourceBinding.path],
    mutating: false,
    mutationScope: 'NONE',
  });

  const manifestPostWatermarkBinding = verifyBoundArtifact(
    bindings.postWatermarkSource,
    'integrityResults.postWatermarkSource',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    manifestPostWatermarkBinding.path,
    manifestPostWatermarkBinding.sha256,
    postWatermarkBaseline.binding,
    'integrityResults.postWatermarkSource'
  );
  const postWatermarkIntegrity = postWatermarkBaseline.integrity;
  assertExactRecordValues(
    requireRecord(
      postWatermarkIntegrity.explicitRowCounts,
      'integrityResults.postWatermarkSource.explicitRowCounts'
    ),
    explicitRows,
    'integrityResults.postWatermarkSource.explicitRowCounts'
  );
  assertExactRecordValues(
    requireRecord(
      postWatermarkIntegrity.derivedRowCounts,
      'integrityResults.postWatermarkSource.derivedRowCounts'
    ),
    derivedRows,
    'integrityResults.postWatermarkSource.derivedRowCounts'
  );
  assertExactRecordValues(
    requireRecord(
      postWatermarkIntegrity.allRowCounts,
      'integrityResults.postWatermarkSource.allRowCounts'
    ),
    expectedAllRows,
    'integrityResults.postWatermarkSource.allRowCounts'
  );
  verifyIntegritySnapshot(
    postWatermarkIntegrity,
    'integrityResults.postWatermarkSource',
    hashContract,
    expectedAllRows
  );
  for (const field of [
    'logicalHash',
    'historicalNormalizedPhysicalHash',
    'environmentPhysicalStructureHash',
    'schemaHash',
  ]) {
    assert(
      postWatermarkIntegrity[field] === sourceIntegrity[field],
      `integrityResults.postWatermarkSource ${field} drift`
    );
  }
  assert(
    postWatermarkIntegrity.dataHash !== sourceIntegrity.dataHash,
    'integrityResults.postWatermarkSource dataHash must change after the approved watermark mutation'
  );
  const changedRelations = postWatermarkIntegrity.relationDigests
    .filter(
      (value, index) =>
        value.dataDigestSha256 !==
        sourceIntegrity.relationDigests[index]?.dataDigestSha256
    )
    .map(value => value.relation);
  assertExactStringArray(
    changedRelations,
    ['public.reservations'],
    'integrityResults.postWatermarkSource changed data relations'
  );
  const manifestHashes = requireRecord(manifest.hashes, 'manifest.hashes');
  const expectedManifestHashes = {
    logicalHash: sourceIntegrity.logicalHash,
    historicalNormalizedPhysicalHash:
      sourceIntegrity.historicalNormalizedPhysicalHash,
    environmentPhysicalStructureHash:
      sourceIntegrity.environmentPhysicalStructureHash,
    schemaHash: sourceIntegrity.schemaHash,
    preWatermarkDataHash: sourceIntegrity.dataHash,
    backupDataHash: postWatermarkIntegrity.dataHash,
  };
  assert(
    JSON.stringify(manifestHashes) === JSON.stringify(expectedManifestHashes),
    'manifest.hashes does not distinguish historical, pre-watermark, and backup-source observations'
  );

  const restoreIntegrity = readResult('restore', 'RESTORE_DATA_INTEGRITY');
  assert(
    restoreIntegrity.sourceProjectRef === manifest.environment.projectRef &&
      restoreIntegrity.restoreProjectRef ===
        manifest.restore.targetEnvironment.projectRef &&
      restoreIntegrity.gitCommit === manifest.source.gitCommit,
    'integrityResults.restore target mismatch'
  );
  const restorePostWatermarkBinding = verifyBoundArtifact(
    restoreIntegrity.postWatermarkSourceIntegrity,
    'integrityResults.restore.postWatermarkSourceIntegrity',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    restorePostWatermarkBinding.path,
    restorePostWatermarkBinding.sha256,
    postWatermarkBaseline.binding,
    'integrityResults.restore.postWatermarkSourceIntegrity'
  );
  for (const field of [
    'schemaHash',
    'dataHash',
    'logicalHash',
    'historicalNormalizedPhysicalHash',
    'environmentPhysicalStructureHash',
  ]) {
    assert(
      restoreIntegrity.source[field] === postWatermarkIntegrity[field] &&
        restoreIntegrity.restored[field] === postWatermarkIntegrity[field],
      `integrityResults.restore ${field} parity mismatch`
    );
  }
  verifyIntegritySnapshot(
    requireRecord(restoreIntegrity.source, 'integrityResults.restore.source'),
    'integrityResults.restore.source',
    hashContract,
    expectedAllRows
  );
  verifyIntegritySnapshot(
    requireRecord(
      restoreIntegrity.restored,
      'integrityResults.restore.restored'
    ),
    'integrityResults.restore.restored',
    hashContract,
    expectedAllRows
  );
  assert(
    restoreIntegrity.source.migrationHead === migration.migrationHead &&
      restoreIntegrity.restored.migrationHead === migration.migrationHead,
    'integrityResults.restore migration head parity mismatch'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      restoreIntegrity.source.orderedMigrations,
      'integrityResults.restore.source.orderedMigrations'
    ),
    migration.orderedMigrations,
    'integrityResults.restore.source.orderedMigrations'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      restoreIntegrity.restored.orderedMigrations,
      'integrityResults.restore.restored.orderedMigrations'
    ),
    migration.orderedMigrations,
    'integrityResults.restore.restored.orderedMigrations'
  );
  assert(
    restoreIntegrity.source.generatedTypesSha256 === expectedTypesSha &&
      restoreIntegrity.restored.generatedTypesSha256 === expectedTypesSha,
    'integrityResults.restore generated types parity mismatch'
  );
  assertExactRecordValues(
    requireRecord(
      restoreIntegrity.source.rowCounts,
      'integrityResults.restore.source.rowCounts'
    ),
    expectedAllRows,
    'integrityResults.restore.source.rowCounts'
  );
  assertExactRecordValues(
    requireRecord(
      restoreIntegrity.restored.rowCounts,
      'integrityResults.restore.restored.rowCounts'
    ),
    expectedAllRows,
    'integrityResults.restore.restored.rowCounts'
  );
  verifyEvidenceReferences(
    restoreIntegrity.evidence,
    'integrityResults.restore.evidence',
    artifactPaths
  );
}

const FINAL_DERIVED_COMM_GATE_ID = 'COMM-OPS-011';

function verifyConditionalFinalCommGate({
  manifest,
  gate,
  mapRow,
  familyDefaults,
  manifestMap,
  frozenMapSha256,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  resultPaths,
  lastPreScanEndedAt,
  releaseTargetConflictResolved,
}) {
  const context = `gates.${FINAL_DERIVED_COMM_GATE_ID}`;
  assert(
    mapRow.resultMode ===
      'FINAL_VERIFIER_DERIVED_FROM_SCANNED_CONDITIONAL_SIGNOFF',
    `${context} result mode drift`
  );
  assert(
    gate.status === 'NOT_RUN',
    `${context} must remain NOT_RUN until the terminal verifier derives it`
  );
  verifyEvidenceReferences(gate.evidence, `${context}.evidence`, artifactPaths);
  const bound = verifyBoundArtifact(
    {
      path: gate.resultArtifactPath,
      sha256: gate.resultArtifactSha256,
    },
    `${context}.conditionalResultArtifact`,
    artifactHashes,
    artifactFiles
  );
  assert(
    !resultPaths.has(bound.path),
    `${context} reuses another gate result artifact`
  );
  resultPaths.add(bound.path);
  const result = readJsonFile(
    bound.absolutePath,
    `${context}.conditionalResultArtifact`
  );
  assert(
    result.schemaVersion === 1 &&
      result.gateId === FINAL_DERIVED_COMM_GATE_ID &&
      result.family === 'COMM-OPS' &&
      result.resultType === 'OPERATIONS_DR_RESULT' &&
      result.status ===
        'CONDITIONAL_PENDING_TERMINAL_SCAN_AND_FINAL_VERIFIER' &&
      result.environmentProjectRef === manifest.environment.projectRef &&
      result.gitCommit === manifest.source.gitCommit,
    `${context} conditional structured result mismatch`
  );
  const supportingContract = verifyBoundArtifact(
    result.supportingContract,
    `${context}.conditionalResultArtifact.supportingContract`,
    artifactHashes,
    artifactFiles
  );
  assert(
    supportingContract.path === manifestMap.path &&
      supportingContract.sha256 === frozenMapSha256,
    `${context} supporting contract is not the frozen COMM evidence map`
  );
  const expectedClaimIds = [
    ...requireConcreteStringArray(
      familyDefaults.OPS,
      'commGateEvidenceMap.familyDefaults.OPS',
      { allowEmpty: true }
    ),
    ...requireConcreteStringArray(
      mapRow.requires,
      `commGateEvidenceMap.${FINAL_DERIVED_COMM_GATE_ID}.requires`
    ),
  ];
  const checks = requireArray(result.checks, `${context}.checks`);
  assert(
    checks.length === expectedClaimIds.length,
    `${context} check count does not match the frozen claim map`
  );
  const observedClaimIds = [];
  for (const [index, value] of checks.entries()) {
    const check = requireRecord(value, `${context}.checks[${String(index)}]`);
    const claimId = requireConcreteString(
      check.id,
      `${context}.checks[${String(index)}].id`
    );
    observedClaimIds.push(claimId);
    assert(
      check.status ===
        (claimId === 'DERIVED.ALL_OTHER_53_COMM_GATES_PASS'
          ? 'PASS'
          : 'CONDITIONAL'),
      `${context}.checks[${String(index)}].status is not safely conditional`
    );
    verifyEvidenceReferences(
      check.evidence,
      `${context}.checks[${String(index)}].evidence`,
      artifactPaths
    );
  }
  assertExactStringArray(
    observedClaimIds,
    expectedClaimIds,
    `${context}.checks`
  );
  const signoff = requireRecord(
    result.conditionalSignoff,
    `${context}.conditionalSignoff`
  );
  assertExactRecordKeys(
    signoff,
    ['status', 'approvedBy', 'signedAt', 'expiresAt', 'conditions'],
    `${context}.conditionalSignoff`
  );
  const ownership = requireRecord(manifest.ownership, 'ownership');
  const signedAt = requireIsoTimestamp(
    signoff.signedAt,
    `${context}.conditionalSignoff.signedAt`,
    { notFuture: true }
  );
  assert(
    signoff.status === 'CONDITIONAL' &&
      signoff.approvedBy === ownership.approver &&
      signoff.approvedBy === ownership.commercialReleaseOwner &&
      signoff.expiresAt === manifest.expiresAt &&
      Date.parse(signedAt) >= Date.parse(lastPreScanEndedAt) &&
      Date.parse(signedAt) <= Date.parse(manifest.privacyScan.scannedAt),
    `${context} conditional owner sign-off identity, expiry, or chronology drift`
  );
  assertExactStringArray(
    requireConcreteStringArray(
      signoff.conditions,
      `${context}.conditionalSignoff.conditions`
    ),
    [
      'EXACT_OTHER_53_COMM_GATES_PASS',
      'TERMINAL_PRIVACY_SCAN_PASS_FOR_THIS_MANIFEST_ARTIFACT_SET',
      'FINAL_VERIFIER_PASS_WITHOUT_POST_SCAN_EVIDENCE_MUTATION',
    ],
    `${context}.conditionalSignoff.conditions`
  );
  assert(
    releaseTargetConflictResolved,
    `${context} cannot PASS while the 8h/24h drill and 30m/15m product release authority conflict is unresolved`
  );
}

function verifyCommGates(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  approvedMap,
  lastPreScanEndedAt,
  releaseTargetConflictResolved
) {
  const frozenMap = readJsonFile(
    COMM_GATE_EVIDENCE_MAP_PATH,
    'commGateEvidenceMap'
  );
  assert(
    frozenMap.schemaVersion === 1 &&
      frozenMap.status === 'DESIGN_FROZEN_EXECUTION_BLOCKED' &&
      frozenMap.unknownClaimsFailClosed === true,
    'COMM gate evidence map is not fail-closed'
  );
  const manifestMap = verifyBoundArtifact(
    manifest.commGateEvidenceMap,
    'commGateEvidenceMap',
    artifactHashes,
    artifactFiles
  );
  const frozenMapSha256 = sha256File(COMM_GATE_EVIDENCE_MAP_PATH);
  assert(
    manifestMap.path === approvedMap.path &&
      manifestMap.sha256 === approvedMap.sha256 &&
      manifestMap.sha256 === frozenMapSha256 &&
      readFileSync(manifestMap.absolutePath).equals(
        readFileSync(COMM_GATE_EVIDENCE_MAP_PATH)
      ),
    'COMM gate evidence map does not match the approved frozen contract'
  );
  const familyResultTypes = requireRecord(
    frozenMap.familyResultTypes,
    'commGateEvidenceMap.familyResultTypes'
  );
  const familyDefaults = requireRecord(
    frozenMap.familyDefaults,
    'commGateEvidenceMap.familyDefaults'
  );
  const mapRows = requireArray(frozenMap.gates, 'commGateEvidenceMap.gates');
  const mapById = new Map();
  for (const [index, value] of mapRows.entries()) {
    const row = requireRecord(
      value,
      `commGateEvidenceMap.gates[${String(index)}]`
    );
    const id = requireConcreteString(
      row.id,
      `commGateEvidenceMap.gates[${String(index)}].id`
    );
    assert(!mapById.has(id), `commGateEvidenceMap duplicates ${id}`);
    mapById.set(id, row);
  }
  assertExactStringArray(
    [...mapById.keys()],
    requiredCommGateIds(),
    'commGateEvidenceMap gate inventory'
  );
  const gates = requireArray(manifest.gates, 'gates');
  const byId = new Map();
  for (const [index, value] of gates.entries()) {
    const context = `gates[${String(index)}]`;
    const gate = requireRecord(value, context);
    const id = requireConcreteString(gate.id, `${context}.id`);
    assert(!byId.has(id), `${context}.id is duplicated`);
    byId.set(id, gate);
  }
  const resultPaths = new Set();
  for (const id of requiredCommGateIds()) {
    assert(byId.has(id), `gates is missing ${id}`);
    const gate = byId.get(id);
    const mapRow = requireRecord(mapById.get(id), `commGateEvidenceMap.${id}`);
    if (id === FINAL_DERIVED_COMM_GATE_ID) {
      verifyConditionalFinalCommGate({
        manifest,
        gate,
        mapRow,
        familyDefaults,
        manifestMap,
        frozenMapSha256,
        artifactPaths,
        artifactHashes,
        artifactFiles,
        resultPaths,
        lastPreScanEndedAt,
        releaseTargetConflictResolved,
      });
      continue;
    }
    verifyPassedGate(gate, `gates.${id}`, artifactPaths);
    const bound = verifyBoundArtifact(
      {
        path: gate.resultArtifactPath,
        sha256: gate.resultArtifactSha256,
      },
      `gates.${id}.resultArtifact`,
      artifactHashes,
      artifactFiles
    );
    assert(
      !resultPaths.has(bound.path),
      `gates.${id} reuses another gate result artifact`
    );
    resultPaths.add(bound.path);
    const result = readJsonFile(
      bound.absolutePath,
      `gates.${id}.resultArtifact`
    );
    const family = /^COMM-([A-Z]+)-\d{3}$/u.exec(id)?.[1];
    assert(
      family && COMM_RESULT_TYPES.has(family),
      `gates.${id} family is unsupported`
    );
    assert(
      result.schemaVersion === 1 &&
        result.gateId === id &&
        result.family === `COMM-${family}` &&
        result.resultType === COMM_RESULT_TYPES.get(family) &&
        result.resultType === familyResultTypes[family] &&
        result.status === 'PASS' &&
        result.environmentProjectRef === manifest.environment.projectRef &&
        result.gitCommit === manifest.source.gitCommit,
      `gates.${id} structured result mismatch`
    );
    const supportingContract = verifyBoundArtifact(
      result.supportingContract,
      `gates.${id}.resultArtifact.supportingContract`,
      artifactHashes,
      artifactFiles
    );
    assert(
      supportingContract.path === manifestMap.path &&
        supportingContract.sha256 === frozenMapSha256 &&
        readFileSync(supportingContract.absolutePath).equals(
          readFileSync(COMM_GATE_EVIDENCE_MAP_PATH)
        ),
      `gates.${id} supporting contract is not the frozen COMM evidence map`
    );
    const expectedClaimIds = [
      ...requireConcreteStringArray(
        familyDefaults[family],
        `commGateEvidenceMap.familyDefaults.${family}`,
        { allowEmpty: true }
      ),
      ...requireConcreteStringArray(
        mapRow.requires,
        `commGateEvidenceMap.${id}.requires`
      ),
    ];
    const checks = requireArray(
      result.checks,
      `gates.${id}.resultArtifact.checks`
    );
    assert(
      checks.length === expectedClaimIds.length,
      `gates.${id} check count does not match the frozen claim map`
    );
    const observedClaimIds = [];
    for (const [index, value] of checks.entries()) {
      const check = requireRecord(
        value,
        `gates.${id}.checks[${String(index)}]`
      );
      const claimId = requireConcreteString(
        check.id,
        `gates.${id}.checks[${String(index)}].id`
      );
      observedClaimIds.push(claimId);
      assert(
        check.status === 'PASS',
        `gates.${id}.checks[${String(index)}].status must be PASS`
      );
      verifyEvidenceReferences(
        check.evidence,
        `gates.${id}.checks[${String(index)}].evidence`,
        artifactPaths
      );
    }
    assertExactStringArray(
      observedClaimIds,
      expectedClaimIds,
      `gates.${id}.checks`
    );
  }
  for (const [id, gate] of byId.entries()) {
    if (id === FINAL_DERIVED_COMM_GATE_ID) continue;
    assert(
      gate.status === 'PASS',
      `${id} must PASS before ${FINAL_DERIVED_COMM_GATE_ID} can be derived`
    );
  }
  assert(
    manifest.privacyScan.status === 'PASS',
    `${FINAL_DERIVED_COMM_GATE_ID} cannot be derived before terminal privacy PASS`
  );
  const unresolvedClaims = mapRows.flatMap(value => {
    const row = requireRecord(value, 'commGateEvidenceMap gate');
    const family = /^COMM-([A-Z]+)-\d{3}$/u.exec(row.id)?.[1];
    return [
      ...requireConcreteStringArray(
        familyDefaults[family],
        `commGateEvidenceMap.familyDefaults.${String(family)}`,
        { allowEmpty: true }
      ),
      ...requireConcreteStringArray(
        row.requires,
        `commGateEvidenceMap.${String(row.id)}.requires`
      ),
    ];
  });
  assert(
    unresolvedClaims.length === 0,
    `COMM verified claim registry incomplete; execution PASS remains blocked (${String(
      new Set(unresolvedClaims).size
    )} immutable claims require typed collectors)`
  );
}

function assertBindingMatch(actualPath, actualSha256, approved, context) {
  const normalizedPath = requireConcreteString(
    actualPath,
    `${context}.path`
  ).replaceAll('\\', '/');
  const sha256 = requireSha256(actualSha256, `${context}.sha256`);
  assert(normalizedPath === approved.path, `${context}.path approval mismatch`);
  assert(sha256 === approved.sha256, `${context}.sha256 approval mismatch`);
}

function verifyCommandLedger(manifest, approvedLedger, approvedEnvironment) {
  const ledger = readJsonFile(
    approvedLedger.absolutePath,
    'approval.commandLedger'
  );
  assert(ledger.schemaVersion === 1, 'command ledger schemaVersion drift');
  assert(
    ledger.status === 'APPROVED_EXECUTABLE',
    'command ledger status must be APPROVED_EXECUTABLE'
  );
  assert(
    ledger.executionAuthorized === true,
    'command ledger executionAuthorized must be true'
  );
  assert(
    ledger.cleanupOrProjectDeletionCommandsAllowed === false &&
      ledger.cleanupRequiresSeparateApproval === true,
    'command ledger must exclude cleanup and project deletion from PR12 qualification authority'
  );
  const targetGuard = requireRecord(
    ledger.targetGuard,
    'approval.commandLedger.targetGuard'
  );
  const guardPath = requireConcreteString(
    targetGuard.implementationPath,
    'approval.commandLedger.targetGuard.implementationPath'
  );
  assert(
    targetGuard.requiredForEveryRemoteCommand === true,
    'command ledger must guard every remote command'
  );
  const prohibitedProjectRefs = requireConcreteStringArray(
    targetGuard.prohibitedProjectRefs,
    'approval.commandLedger.targetGuard.prohibitedProjectRefs'
  );
  assertExactStringArray(
    prohibitedProjectRefs,
    PROHIBITED_PROJECT_REFS,
    'approval.commandLedger.targetGuard.prohibitedProjectRefs'
  );
  assert(
    targetGuard.approvedSourceProjectRef === approvedEnvironment.projectRef,
    'command ledger approved source project ref mismatch'
  );
  assert(
    targetGuard.approvedSourceProjectUrl === approvedEnvironment.projectUrl &&
      targetGuard.approvedSourceDatabaseHost ===
        approvedEnvironment.databaseHost &&
      targetGuard.databaseConnectionMode ===
        approvedEnvironment.databaseConnectionMode &&
      targetGuard.databaseUser === approvedEnvironment.databaseUser &&
      targetGuard.databaseHostMustEqualDbDotProjectRefDotSupabaseDotCo ===
        true &&
      targetGuard.sourceSystemIdentifierCaptureMode ===
        'CAPTURE_ONCE_THEN_REQUIRE_EXACT_MATCH' &&
      targetGuard.sourceIdentityBootstrapCommandId === 'PR12-CMD-004A' &&
      targetGuard.preKnownSystemIdentifierRequiredForBootstrap === false &&
      targetGuard.bootstrapGuardMustMatchProvisioningResultIdentity === true &&
      targetGuard.capturedSystemIdentifierRequiredForEverySubsequentSourceDatabaseCommand ===
        true &&
      targetGuard.runtimeIdentityEvidenceRequiredBeforeEveryRemoteDatabaseCommandExceptBootstrap ===
        true &&
      targetGuard.restoreCreationRequiresSelectedBackupApprovalBinding ===
        true &&
      targetGuard.restoreConnectionRequiresPostCreationSupplementalBinding ===
        true &&
      targetGuard.inheritParentEnvironmentAllowed === false &&
      targetGuard.ambientGenericCredentialFallbackAllowed === false,
    'command ledger target and credential guard drift'
  );
  verifyDirectDatabaseIdentity(
    {
      projectRef: targetGuard.approvedSourceProjectRef,
      databaseHost: targetGuard.approvedSourceDatabaseHost,
      databaseConnectionMode: targetGuard.databaseConnectionMode,
      databaseUser: targetGuard.databaseUser,
    },
    'approval.commandLedger.targetGuard'
  );
  requireNonProductionProjectRef(
    targetGuard.approvedSourceProjectRef,
    'approval.commandLedger.targetGuard.approvedSourceProjectRef'
  );
  const approvedCommands = requireArray(
    ledger.commands,
    'approval.commandLedger.commands'
  );
  assertExactStringArray(
    approvedCommands.map((value, index) =>
      requireConcreteString(
        requireRecord(
          value,
          `approval.commandLedger.commands[${String(index)}]`
        ).id,
        `approval.commandLedger.commands[${String(index)}].id`
      )
    ),
    CANONICAL_LEDGER_COMMAND_IDS,
    'approval.commandLedger.commands canonical order'
  );
  const commands = requireArray(manifest.commands, 'commands');
  assertExactStringArray(
    commands.map((value, index) =>
      requireConcreteString(
        requireRecord(value, `commands[${String(index)}]`).id,
        `commands[${String(index)}].id`
      )
    ),
    [...TOOL_EVIDENCE_COMMAND_IDS, ...CANONICAL_LEDGER_COMMAND_IDS],
    'commands canonical execution order'
  );
  const approvedIds = new Set();
  const restoreQualificationMutationCommandIds = [];
  const restoreQualificationCommandIds = [];
  const sourceIdentityBootstrapCommandIds = [];
  const restoreIdentityCommandIds = [];
  const sourceExecutionFreezeCommandIds = [];
  const restoreCreationCommandIds = [];
  const backupWatermarkCommandIds = [];
  const backupInventoryCommandIds = [];
  for (const [index, value] of approvedCommands.entries()) {
    const context = `approval.commandLedger.commands[${String(index)}]`;
    const approved = requireRecord(value, context);
    const id = requireConcreteString(approved.id, `${context}.id`);
    assert(!approvedIds.has(id), `${context}.id is duplicated`);
    approvedIds.add(id);
    const phase = requireConcreteString(approved.phase, `${context}.phase`);
    const phasePolicy = COMMAND_PHASE_POLICIES.get(phase);
    assert(
      phasePolicy,
      `${context}.phase is not approved for PR12 qualification`
    );
    assert(
      typeof approved.mutating === 'boolean',
      `${context}.mutating must be boolean`
    );
    const mutationScope = requireConcreteString(
      approved.mutationScope,
      `${context}.mutationScope`
    );
    assert(
      approved.mutating ? mutationScope !== 'NONE' : mutationScope === 'NONE',
      `${context}.mutationScope does not match mutating`
    );
    assert(
      phasePolicy.mutationScopes.has(mutationScope),
      `${context}.mutationScope is not approved for phase ${phase}`
    );
    const redactedCommand = requireConcreteString(
      approved.redactedCommand,
      `${context}.redactedCommand`
    );
    assert(
      redactedCommand !== 'NOT_IMPLEMENTED',
      `${context}.redactedCommand is not implemented`
    );
    assert(
      !PROJECT_DELETION_COMMAND_PATTERN.test(redactedCommand),
      `${context}.redactedCommand attempts project cleanup or deletion without separate approval`
    );
    assert(
      typeof approved.remoteContact === 'boolean',
      `${context}.remoteContact must be boolean`
    );
    assert(
      approved.remoteContact === phasePolicy.remoteContact,
      `${context}.remoteContact is not approved for phase ${phase}`
    );
    if (approved.remoteContact) {
      assert(
        approved.guardedBy === guardPath,
        `${context}.guardedBy does not match the approved target guard`
      );
    }
    const manifestCommandIndex = TOOL_EVIDENCE_COMMAND_IDS.length + index;
    const command = requireRecord(
      commands[manifestCommandIndex],
      `commands[${String(manifestCommandIndex)}]`
    );
    for (const field of [
      'id',
      'redactedCommand',
      'phase',
      'remoteContact',
      'mutating',
      'mutationScope',
    ]) {
      assert(
        command[field] === approved[field],
        `commands[${String(manifestCommandIndex)}].${field} approval mismatch`
      );
    }
    if (
      phase === 'post_restore_qualification' &&
      approved.mutating === true &&
      mutationScope === 'SYNTHETIC_QUALIFICATION_ONLY'
    ) {
      restoreQualificationMutationCommandIds.push(id);
    }
    if (
      phase === 'post_restore_qualification' ||
      phase === 'post_restore_side_effects'
    ) {
      restoreQualificationCommandIds.push(id);
    }
    if (phase === 'restore_identity') {
      restoreIdentityCommandIds.push(id);
    }
    if (phase === 'source_identity_bootstrap') {
      sourceIdentityBootstrapCommandIds.push(id);
    }
    if (phase === 'source_execution_approval_freeze') {
      sourceExecutionFreezeCommandIds.push(id);
    }
    if (phase === 'restore_project_creation') {
      restoreCreationCommandIds.push(id);
    }
    if (phase === 'backup_watermark') {
      backupWatermarkCommandIds.push(id);
    }
    if (phase === 'backup_inventory') {
      backupInventoryCommandIds.push(id);
    }
  }
  assert(
    restoreQualificationMutationCommandIds.length > 0,
    'command ledger has no approved scoped post-restore qualification mutation'
  );
  assert(
    restoreCreationCommandIds.length === 1,
    'command ledger must contain exactly one restore project creation command'
  );
  assert(
    sourceIdentityBootstrapCommandIds.length === 1 &&
      sourceIdentityBootstrapCommandIds[0] === 'PR12-CMD-004A',
    'command ledger must contain exactly one PR12-CMD-004A source identity bootstrap command'
  );
  assert(
    restoreIdentityCommandIds.length === 1,
    'command ledger must contain exactly one first restore identity/clock command'
  );
  assert(
    sourceExecutionFreezeCommandIds.length === 1 &&
      sourceExecutionFreezeCommandIds[0] === 'PR12-CMD-008B',
    'command ledger must contain exactly one PR12-CMD-008B full source approval barrier'
  );
  assert(
    backupWatermarkCommandIds.length === 1,
    'command ledger must contain exactly one backup watermark command'
  );
  assert(
    backupInventoryCommandIds.length === 1,
    'command ledger must contain exactly one backup inventory command'
  );
  assert(
    restoreQualificationCommandIds.length >= 6,
    'command ledger must contain distinct post-restore integrity, security, Data API, GraphQL, side-effect, and finalization commands'
  );
  return {
    restoreQualificationMutationCommandIds,
    restoreQualificationCommandIds,
    sourceIdentityBootstrapCommandId: sourceIdentityBootstrapCommandIds[0],
    restoreIdentityCommandId: restoreIdentityCommandIds[0],
    restoreCreationCommandId: restoreCreationCommandIds[0],
    backupWatermarkCommandId: backupWatermarkCommandIds[0],
    backupInventoryCommandId: backupInventoryCommandIds[0],
  };
}

function verifyApprovedToolVersions(manifest, packet, artifactFiles) {
  const observed = requireRecord(manifest.toolVersions, 'toolVersions');
  const approved = requireRecord(
    packet.toolVersions,
    'approvalPacket.toolVersions'
  );
  const observedKeys = Object.keys(observed).sort();
  const approvedKeys = Object.keys(approved).sort();
  assert(
    observedKeys.length === approvedKeys.length &&
      observedKeys.every((value, index) => value === approvedKeys[index]),
    'toolVersions key set approval mismatch'
  );
  for (const tool of observedKeys) {
    const observedVersion = requireConcreteString(
      observed[tool],
      `toolVersions.${tool}`
    );
    const approvedVersion = requireConcreteString(
      approved[tool],
      `approvalPacket.toolVersions.${tool}`
    );
    assert(
      observedVersion === approvedVersion,
      `toolVersions.${tool} approval mismatch`
    );
  }
  const nodeVersion = requireConcreteString(observed.node, 'toolVersions.node');
  assert(
    /^v?24\.\d+\.\d+$/u.test(nodeVersion),
    'toolVersions.node must be an exact Node 24 version'
  );
  assert(
    observed.supabaseCli === '2.109.0',
    'toolVersions.supabaseCli must be 2.109.0'
  );
  const psqlVersion = requireConcreteString(observed.psql, 'toolVersions.psql');
  assert(
    new RegExp(
      `^psql \\(PostgreSQL\\) ${String(PSQL_MAJOR)}(?:\\.\\d+){0,2}(?:\\s.*)?$`,
      'u'
    ).test(psqlVersion),
    `toolVersions.psql must be an exact PostgreSQL ${String(PSQL_MAJOR)} psql --version output`
  );
  const executingNodeVersion = `v${process.versions.node}`;
  assert(
    observed.node === executingNodeVersion,
    'toolVersions.node does not match the executing Node runtime'
  );

  const versionCommands = requireRecord(
    packet.toolVersionCommands,
    'approvalPacket.toolVersionCommands'
  );
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  for (const [tool, expectedCommand, expectedOutput] of [
    ['node', 'node --version', observed.node],
    ['supabaseCli', 'supabase --version', observed.supabaseCli],
    ['psql', 'psql --version', observed.psql],
  ]) {
    const commandId = requireConcreteString(
      versionCommands[tool],
      `approvalPacket.toolVersionCommands.${tool}`
    );
    const command = commands.find(value => value.id === commandId);
    assert(command, `tool version command is missing for ${tool}`);
    assert(
      command.redactedCommand === expectedCommand,
      `tool version command drift for ${tool}`
    );
    const stdoutPath = requireConcreteString(
      command.stdoutPath,
      `toolVersionCommands.${tool}.stdoutPath`
    ).replaceAll('\\', '/');
    const stderrPath = requireConcreteString(
      command.stderrPath,
      `toolVersionCommands.${tool}.stderrPath`
    ).replaceAll('\\', '/');
    const stdoutAbsolute = artifactFiles.get(stdoutPath);
    const stderrAbsolute = artifactFiles.get(stderrPath);
    assert(
      typeof stdoutAbsolute === 'string',
      `tool version stdout is not a hashed artifact for ${tool}`
    );
    assert(
      typeof stderrAbsolute === 'string',
      `tool version stderr is not a hashed artifact for ${tool}`
    );
    assert(
      readFileSync(stdoutAbsolute, 'utf8').trim() === expectedOutput,
      `tool version stdout mismatch for ${tool}`
    );
    assert(
      readFileSync(stderrAbsolute, 'utf8').trim() === '',
      `tool version stderr must be empty for ${tool}`
    );
  }

  const binaries = requireRecord(manifest.toolBinaries, 'toolBinaries');
  const approvedBinaries = requireRecord(
    packet.toolBinaries,
    'approvalPacket.toolBinaries'
  );
  for (const tool of ['supabaseCli', 'psql']) {
    const binary = requireRecord(binaries[tool], `toolBinaries.${tool}`);
    const approvedBinary = requireRecord(
      approvedBinaries[tool],
      `approvalPacket.toolBinaries.${tool}`
    );
    for (const field of ['path', 'sha256', 'hashCommandId']) {
      assert(
        binary[field] === approvedBinary[field],
        `toolBinaries.${tool}.${field} approval mismatch`
      );
    }
    const binaryPath = requireConcreteString(
      binary.path,
      `toolBinaries.${tool}.path`
    );
    const binarySha = requireSha256(
      binary.sha256,
      `toolBinaries.${tool}.sha256`
    );
    if (tool === 'supabaseCli') {
      assert(
        binarySha === SUPABASE_CLI_EXECUTABLE_SHA256,
        'toolBinaries.supabaseCli.sha256 does not match the pinned 2.109.0 Windows executable'
      );
    }
    const hashCommandId = requireConcreteString(
      binary.hashCommandId,
      `toolBinaries.${tool}.hashCommandId`
    );
    const command = commands.find(value => value.id === hashCommandId);
    assert(command, `tool binary hash command is missing for ${tool}`);
    assert(
      command.redactedCommand ===
        `Get-FileHash -Algorithm SHA256 -LiteralPath ${binaryPath}`,
      `tool binary hash command drift for ${tool}`
    );
    const stdoutPath = requireConcreteString(
      command.stdoutPath,
      `toolBinaries.${tool}.stdoutPath`
    ).replaceAll('\\', '/');
    const stderrPath = requireConcreteString(
      command.stderrPath,
      `toolBinaries.${tool}.stderrPath`
    ).replaceAll('\\', '/');
    const stdoutAbsolute = artifactFiles.get(stdoutPath);
    const stderrAbsolute = artifactFiles.get(stderrPath);
    assert(
      typeof stdoutAbsolute === 'string' &&
        readFileSync(stdoutAbsolute, 'utf8').trim().toLowerCase() === binarySha,
      `tool binary hash stdout mismatch for ${tool}`
    );
    assert(
      typeof stderrAbsolute === 'string' &&
        readFileSync(stderrAbsolute, 'utf8').trim() === '',
      `tool binary hash stderr must be empty for ${tool}`
    );

    if (tool === 'supabaseCli') {
      for (const field of [
        'archivePath',
        'archiveSha256',
        'archiveHashCommandId',
      ]) {
        assert(
          binary[field] === approvedBinary[field],
          `toolBinaries.supabaseCli.${field} approval mismatch`
        );
      }
      const archivePath = requireConcreteString(
        binary.archivePath,
        'toolBinaries.supabaseCli.archivePath'
      );
      const archiveSha = requireSha256(
        binary.archiveSha256,
        'toolBinaries.supabaseCli.archiveSha256'
      );
      assert(
        archiveSha === SUPABASE_CLI_ARCHIVE_SHA256,
        'toolBinaries.supabaseCli.archiveSha256 does not match the official 2.109.0 Windows archive'
      );
      const archiveHashCommandId = requireConcreteString(
        binary.archiveHashCommandId,
        'toolBinaries.supabaseCli.archiveHashCommandId'
      );
      const archiveCommand = commands.find(
        value => value.id === archiveHashCommandId
      );
      assert(archiveCommand, 'Supabase CLI archive hash command is missing');
      assert(
        archiveCommand.redactedCommand ===
          `Get-FileHash -Algorithm SHA256 -LiteralPath ${archivePath}`,
        'Supabase CLI archive hash command drift'
      );
      const archiveStdoutPath = requireConcreteString(
        archiveCommand.stdoutPath,
        'toolBinaries.supabaseCli.archiveStdoutPath'
      ).replaceAll('\\\\', '/');
      const archiveStderrPath = requireConcreteString(
        archiveCommand.stderrPath,
        'toolBinaries.supabaseCli.archiveStderrPath'
      ).replaceAll('\\\\', '/');
      const archiveStdoutAbsolute = artifactFiles.get(archiveStdoutPath);
      const archiveStderrAbsolute = artifactFiles.get(archiveStderrPath);
      assert(
        typeof archiveStdoutAbsolute === 'string' &&
          readFileSync(archiveStdoutAbsolute, 'utf8').trim().toLowerCase() ===
            archiveSha,
        'Supabase CLI archive hash stdout mismatch'
      );
      assert(
        typeof archiveStderrAbsolute === 'string' &&
          readFileSync(archiveStderrAbsolute, 'utf8').trim() === '',
        'Supabase CLI archive hash stderr must be empty'
      );
    }
  }
}

function verifySourceProvisioningApproval(
  packet,
  approvedEnvironment,
  artifactHashes,
  artifactFiles
) {
  const bound = verifyBoundArtifact(
    packet.sourceProjectProvisioningApproval,
    'approvalPacket.sourceProjectProvisioningApproval',
    artifactHashes,
    artifactFiles
  );
  const provisioning = readJsonFile(
    bound.absolutePath,
    'sourceProjectProvisioningApproval'
  );
  assert(
    provisioning.schemaVersion !== 2,
    'SOURCE_PROVISIONING_V2_PROMOTION_NOT_IMPLEMENTED'
  );
  assert(
    provisioning.schemaVersion === 1 &&
      provisioning.phase === 'SOURCE_PROJECT_PROVISIONING' &&
      provisioning.status === 'APPROVED',
    'source project provisioning approval is not APPROVED'
  );
  const provisioningTarget = requireRecord(
    provisioning.target,
    'sourceProjectProvisioningApproval.target'
  );
  assertExactRecordKeys(
    provisioningTarget,
    ['gitCommit', 'baseCommit'],
    'sourceProjectProvisioningApproval.target'
  );
  const sourceTarget = requireRecord(packet.target, 'approvalPacket.target');
  assert(
    provisioningTarget.gitCommit === sourceTarget.gitCommit &&
      provisioningTarget.baseCommit === sourceTarget.baseCommit &&
      provisioningTarget.baseCommit === BASE_COMMIT,
    'source project provisioning approval target does not match the source execution target'
  );
  verifyCanonicalGovernanceProposal(
    provisioning.governanceProposal,
    'sourceProjectProvisioningApproval.governanceProposal',
    artifactHashes,
    artifactFiles
  );
  const credentialControls = requireRecord(
    provisioning.credentialControls,
    'sourceProjectProvisioningApproval.credentialControls'
  );
  assertExactRecordKeys(
    credentialControls,
    [
      'credentialContract',
      'credentialProviderConfiguration',
      'databasePasswordSecretName',
      'managementAccessTokenSecretName',
      'providerConfigurationMustExistBeforeApproval',
      'secretValuesCaptured',
    ],
    'sourceProjectProvisioningApproval.credentialControls'
  );
  const phaseCredentialContract = verifyBoundArtifact(
    credentialControls.credentialContract,
    'sourceProjectProvisioningApproval.credentialControls.credentialContract',
    artifactHashes,
    artifactFiles
  );
  const packetCredentialContract = requireRecord(
    requireRecord(packet.bindings, 'approvalPacket.bindings')
      .credentialContract,
    'approvalPacket.bindings.credentialContract'
  );
  assertBindingMatch(
    phaseCredentialContract.path,
    phaseCredentialContract.sha256,
    packetCredentialContract,
    'sourceProjectProvisioningApproval.credentialControls.credentialContract'
  );
  const sourceCredentialProviderConfigurationBinding = verifyBoundArtifact(
    credentialControls.credentialProviderConfiguration,
    'sourceProjectProvisioningApproval.credentialControls.credentialProviderConfiguration',
    artifactHashes,
    artifactFiles
  );
  assert(
    credentialControls.databasePasswordSecretName ===
      'PR12_SOURCE_DB_PASSWORD' &&
      credentialControls.managementAccessTokenSecretName ===
        'PR12_SUPABASE_ACCESS_TOKEN' &&
      credentialControls.providerConfigurationMustExistBeforeApproval ===
        true &&
      credentialControls.secretValuesCaptured === false,
    'source project provisioning credential provider or secret-name boundary drift'
  );
  const authorization = requireRecord(
    provisioning.authorization,
    'sourceProjectProvisioningApproval.authorization'
  );
  assertExactRecordKeys(
    authorization,
    [
      'sourceProjectProvisioningAuthorized',
      'isolatedStagingConnectionAuthorized',
      'isolatedStagingExecutionAuthorized',
      'restoreProjectCreationAuthorized',
      'productionConnectionAuthorized',
      'readyTransitionAuthorized',
      'mergeAuthorized',
      'commercialReleaseAuthorized',
      'indexRetirementAuthorized',
    ],
    'sourceProjectProvisioningApproval.authorization'
  );
  assert(
    authorization.sourceProjectProvisioningAuthorized === true,
    'source project provisioning approval does not authorize provisioning'
  );
  for (const field of [
    'isolatedStagingConnectionAuthorized',
    'isolatedStagingExecutionAuthorized',
    'restoreProjectCreationAuthorized',
    'productionConnectionAuthorized',
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ]) {
    assert(
      authorization[field] === false,
      `sourceProjectProvisioningApproval.authorization.${field} must be false`
    );
  }
  const provisioningAction = requireRecord(
    provisioning.provisioningAction,
    'sourceProjectProvisioningApproval.provisioningAction'
  );
  assertExactRecordKeys(
    provisioningAction,
    [
      'actionId',
      'resultType',
      'method',
      'httpMethod',
      'endpoint',
      'regionSelectionType',
      'desiredInstanceSize',
      'databasePasswordSource',
      'databasePasswordMinimumLength',
      'databasePasswordTransmission',
      'databasePasswordValueMayBeLoggedPersistedOrPassedInArguments',
      'managementAccessTokenSource',
      'managementAccessTokenValueMayBeLoggedPersistedOrPassedInArguments',
      'rawSecretValuesMayBeCaptured',
      'providerCreatedAtMaximumClockSkewSeconds',
      'documentedProviderOperationIdExpected',
      'remoteContact',
      'mutating',
      'mutationScope',
      'maximumExecutionCount',
      'databaseConnectionAuthorized',
      'resultMustBeHashBound',
    ],
    'sourceProjectProvisioningApproval.provisioningAction'
  );
  assert(
    provisioningAction.actionId === 'PR12-ACTION-003' &&
      provisioningAction.resultType ===
        'SOURCE_PROJECT_PROVISIONING_OPERATION' &&
      provisioningAction.method === 'OWNER_MANAGEMENT_API_CREATE_PROJECT' &&
      provisioningAction.httpMethod === 'POST' &&
      provisioningAction.endpoint === 'https://api.supabase.com/v1/projects' &&
      provisioningAction.regionSelectionType === 'specific' &&
      provisioningAction.desiredInstanceSize === 'large' &&
      provisioningAction.databasePasswordSource ===
        'OWNER_SECRET_STORE_RUNTIME_INJECTION' &&
      provisioningAction.databasePasswordMinimumLength === 32 &&
      provisioningAction.databasePasswordTransmission ===
        'HTTPS_JSON_BODY_RUNTIME_INJECTION_REDACTED_BEFORE_CAPTURE' &&
      provisioningAction.databasePasswordValueMayBeLoggedPersistedOrPassedInArguments ===
        false &&
      provisioningAction.managementAccessTokenSource ===
        'OWNER_SECRET_STORE_RUNTIME_INJECTION' &&
      provisioningAction.managementAccessTokenValueMayBeLoggedPersistedOrPassedInArguments ===
        false &&
      provisioningAction.rawSecretValuesMayBeCaptured === false &&
      provisioningAction.providerCreatedAtMaximumClockSkewSeconds === 300 &&
      provisioningAction.documentedProviderOperationIdExpected === false &&
      provisioningAction.remoteContact === true &&
      provisioningAction.mutating === true &&
      provisioningAction.mutationScope === 'SOURCE_PROJECT_CREATION' &&
      provisioningAction.maximumExecutionCount === 1 &&
      provisioningAction.databaseConnectionAuthorized === false &&
      provisioningAction.resultMustBeHashBound === true,
    'source project provisioning action contract drift'
  );
  const proposal = requireRecord(
    provisioning.environmentProposal,
    'sourceProjectProvisioningApproval.environmentProposal'
  );
  const organizationSlug = requireConcreteString(
    proposal.organizationSlug,
    'sourceProjectProvisioningApproval.environmentProposal.organizationSlug'
  );
  for (const [proposalField, environmentField] of [
    ['organizationId', 'organizationId'],
    ['organizationPlan', 'organizationPlan'],
    ['projectName', 'projectName'],
    ['region', 'region'],
    ['databaseTier', 'databaseTier'],
  ]) {
    assert(
      proposal[proposalField] === approvedEnvironment[environmentField],
      `source provisioning ${proposalField} does not match source execution approval`
    );
  }
  assert(
    proposal.postgresMajor === PSQL_MAJOR &&
      new RegExp(`^${String(PSQL_MAJOR)}(?:\\.|$)`, 'u').test(
        requireConcreteString(
          approvedEnvironment.databaseVersion,
          'approvalPacket.environment.databaseVersion'
        )
      ),
    'source provisioning PostgreSQL major must be 17'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      proposal.prohibitedProjectRefs,
      'sourceProjectProvisioningApproval.environmentProposal.prohibitedProjectRefs'
    ),
    PROHIBITED_PROJECT_REFS,
    'sourceProjectProvisioningApproval.environmentProposal.prohibitedProjectRefs'
  );
  const dataApi = requireRecord(
    proposal.dataApi,
    'sourceProjectProvisioningApproval.environmentProposal.dataApi'
  );
  assert(
    dataApi.enabled === true,
    'source provisioning Data API must be enabled'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      dataApi.exposedSchemas,
      'sourceProjectProvisioningApproval.environmentProposal.dataApi.exposedSchemas'
    ),
    ['public'],
    'sourceProjectProvisioningApproval.environmentProposal.dataApi.exposedSchemas'
  );
  assert(
    dataApi.automaticallyExposeNewTablesAndFunctions === false,
    'source provisioning automatic Data API exposure must be disabled'
  );
  const graphQl = requireRecord(
    proposal.graphQl,
    'sourceProjectProvisioningApproval.environmentProposal.graphQl'
  );
  assert(
    graphQl.pgGraphqlEnabledAtProvisioning === false &&
      graphQl.introspectionEnabledAtProvisioning === false,
    'source provisioning GraphQL must start disabled with introspection disabled'
  );
  verifyAuthProvisioning(
    proposal.auth,
    'sourceProjectProvisioningApproval.environmentProposal.auth'
  );
  const approval = requireRecord(
    provisioning.approval,
    'sourceProjectProvisioningApproval.approval'
  );
  const provisionApprovedAt = requireIsoTimestamp(
    approval.approvedAt,
    'sourceProjectProvisioningApproval.approval.approvedAt',
    { notFuture: true }
  );
  const provisionExpiresAt = requireIsoTimestamp(
    approval.expiresAt,
    'sourceProjectProvisioningApproval.approval.expiresAt'
  );
  verifyBoundArtifact(
    {
      path: approval.evidencePath,
      sha256: approval.evidenceSha256,
    },
    'sourceProjectProvisioningApproval.approval.evidence',
    artifactHashes,
    artifactFiles
  );
  const lifecycle = requireRecord(
    provisioning.lifecycle,
    'sourceProjectProvisioningApproval.lifecycle'
  );
  assert(
    lifecycle.sourceMaximumHoursFromCreation === 72 &&
      lifecycle.automaticDeletionAuthorized === false &&
      lifecycle.deletionRequiresSeparateApproval === true &&
      lifecycle.fundedRetentionAndCleanupDecisionRequiredBeforeProvisioning ===
        true,
    'source project provisioning lifecycle drift'
  );
  const cost = requireRecord(
    provisioning.cost,
    'sourceProjectProvisioningApproval.cost'
  );
  assert(
    cost.proposedBudgetCeilingUsd === 50 &&
      cost.ceilingEnforceableWithoutCleanupApproval === false,
    'source project provisioning cost boundary drift'
  );
  const actualQuote = requireNumber(
    cost.actualDashboardQuoteUsd,
    'sourceProjectProvisioningApproval.cost.actualDashboardQuoteUsd'
  );
  assert(
    actualQuote <= cost.proposedBudgetCeilingUsd,
    'source project provisioning actual quote exceeds the approved budget'
  );
  const retentionDecision = requireRecord(
    provisioning.retentionAndCleanupDecision,
    'sourceProjectProvisioningApproval.retentionAndCleanupDecision'
  );
  assert(
    retentionDecision.disposition ===
      'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION' &&
      retentionDecision.sourceFundedHours === 72 &&
      retentionDecision.restoreFundedHours === 24 &&
      retentionDecision.fundingMustCoverHoursAfterApprovalExpiry === 72 &&
      retentionDecision.fundingCeilingUsd === 50 &&
      retentionDecision.extensionRequiresSeparateApproval === true,
    'source project provisioning retention/cleanup decision drift'
  );
  const fundedThrough = requireIsoTimestamp(
    retentionDecision.fundedThrough,
    'sourceProjectProvisioningApproval.retentionAndCleanupDecision.fundedThrough'
  );
  assert(
    Date.parse(fundedThrough) >=
      Date.parse(provisionExpiresAt) + 72 * 60 * 60 * 1000,
    'source project provisioning funding does not cover 72 hours after the latest approved provisioning time'
  );
  const owners = requireRecord(
    provisioning.owners,
    'sourceProjectProvisioningApproval.owners'
  );
  verifyOwnerSeparation(approval, owners, 'sourceProjectProvisioningApproval');
  assert(
    retentionDecision.cleanupOwner === owners.cleanupOwner,
    'source provisioning retention decision cleanup owner mismatch'
  );
  const resultBinding = verifyBoundArtifact(
    packet.sourceProjectProvisioningResult,
    'approvalPacket.sourceProjectProvisioningResult',
    artifactHashes,
    artifactFiles
  );
  const result = readJsonFile(
    resultBinding.absolutePath,
    'sourceProjectProvisioningResult'
  );
  assert(
    result.schemaVersion === 1 &&
      result.phase === 'SOURCE_PROJECT_PROVISIONING_RESULT' &&
      result.resultType === 'SOURCE_PROJECT_PROVISIONING_OPERATION' &&
      result.status === 'PASS' &&
      result.actionId === provisioningAction.actionId &&
      result.gitCommit === sourceTarget.gitCommit,
    'source project provisioning result identity mismatch'
  );
  assertBindingMatch(
    requireRecord(result.approval, 'sourceProjectProvisioningResult.approval')
      .path,
    requireRecord(result.approval, 'sourceProjectProvisioningResult.approval')
      .sha256,
    bound,
    'sourceProjectProvisioningResult.approval'
  );
  assert(
    result.providerOperationIdentifierAvailability ===
      'NOT_EXPOSED_BY_DOCUMENTED_CREATE_RESPONSE',
    'source project provisioning result must not fabricate an undocumented provider operation ID'
  );
  const providerBinding = verifyBoundArtifact(
    result.providerEvidence,
    'sourceProjectProvisioningResult.providerEvidence',
    artifactHashes,
    artifactFiles
  );
  const providerExport = readJsonFile(
    providerBinding.absolutePath,
    'sourceProjectProvisioningResult.providerEvidence'
  );
  assertExactRecordKeys(
    providerExport,
    [
      'schemaVersion',
      'exportType',
      'status',
      'provider',
      'captureMethod',
      'actionId',
      'providerOperationIdentifierAvailability',
      'request',
      'organizationEntitlementObservation',
      'regionAvailabilityObservation',
      'createResponse',
      'projectObservation',
      'computeObservation',
      'rawProviderArtifacts',
      'capturedAt',
      'capturedBy',
    ],
    'sourceProjectProvisioningResult.providerEvidence'
  );
  assert(
    providerExport.schemaVersion === 1 &&
      providerExport.exportType === 'SUPABASE_SOURCE_PROJECT_PROVIDER_EXPORT' &&
      providerExport.status === 'CAPTURED' &&
      providerExport.provider === 'SUPABASE_MANAGEMENT_API' &&
      providerExport.captureMethod ===
        'HASH_BOUND_REDACTED_REQUEST_PROVIDER_HTTP_ENVELOPES_AND_BILLING_DASHBOARD_ENTITLEMENT' &&
      providerExport.actionId === provisioningAction.actionId &&
      providerExport.providerOperationIdentifierAvailability ===
        result.providerOperationIdentifierAvailability,
    'source project provider export identity drift'
  );
  const providerRequest = requireRecord(
    providerExport.request,
    'sourceProjectProvisioningResult.providerEvidence.request'
  );
  assertExactRecordKeys(
    providerRequest,
    [
      'httpMethod',
      'endpoint',
      'organizationSlug',
      'name',
      'regionSelection',
      'desiredInstanceSize',
      'databasePasswordSource',
      'managementAccessTokenSource',
      'rawSecretValuesCaptured',
      'redactedWireBody',
      'redactedRequestSha256',
    ],
    'sourceProjectProvisioningResult.providerEvidence.request'
  );
  const redactedWireBody = requireRecord(
    providerRequest.redactedWireBody,
    'sourceProjectProvisioningResult.providerEvidence.request.redactedWireBody'
  );
  assertExactRecordKeys(
    redactedWireBody,
    [
      'db_pass',
      'name',
      'organization_slug',
      'region_selection',
      'desired_instance_size',
    ],
    'sourceProjectProvisioningResult.providerEvidence.request.redactedWireBody'
  );
  assertExactRecordKeys(
    requireRecord(
      redactedWireBody.region_selection,
      'sourceProjectProvisioningResult.providerEvidence.request.redactedWireBody.region_selection'
    ),
    ['type', 'code'],
    'sourceProjectProvisioningResult.providerEvidence.request.redactedWireBody.region_selection'
  );
  assert(
    requireRecord(
      providerRequest.regionSelection,
      'sourceProjectProvisioningResult.providerEvidence.request.regionSelection'
    ).type === provisioningAction.regionSelectionType &&
      providerRequest.regionSelection.code === proposal.region &&
      providerRequest.httpMethod === provisioningAction.httpMethod &&
      providerRequest.endpoint === provisioningAction.endpoint &&
      providerRequest.organizationSlug === organizationSlug &&
      providerRequest.name === proposal.projectName &&
      providerRequest.desiredInstanceSize ===
        provisioningAction.desiredInstanceSize &&
      providerRequest.databasePasswordSource ===
        provisioningAction.databasePasswordSource &&
      providerRequest.managementAccessTokenSource ===
        provisioningAction.managementAccessTokenSource &&
      providerRequest.rawSecretValuesCaptured === false &&
      redactedWireBody.db_pass === 'REDACTED' &&
      redactedWireBody.name === proposal.projectName &&
      redactedWireBody.organization_slug === organizationSlug &&
      redactedWireBody.region_selection.type === 'specific' &&
      redactedWireBody.region_selection.code === proposal.region &&
      redactedWireBody.desired_instance_size === 'large' &&
      !Object.hasOwn(redactedWireBody, 'region') &&
      !Object.hasOwn(redactedWireBody, 'plan') &&
      !Object.hasOwn(redactedWireBody, 'organization_id') &&
      !Object.hasOwn(redactedWireBody, 'authorization') &&
      providerRequest.redactedRequestSha256 ===
        sha256Text(JSON.stringify(redactedWireBody)),
    'source project provider redacted create request drift'
  );
  assertExactRecordKeys(
    requireRecord(
      providerRequest.regionSelection,
      'sourceProjectProvisioningResult.providerEvidence.request.regionSelection'
    ),
    ['type', 'code'],
    'sourceProjectProvisioningResult.providerEvidence.request.regionSelection'
  );
  const entitlementObservation = requireRecord(
    providerExport.organizationEntitlementObservation,
    'sourceProjectProvisioningResult.providerEvidence.organizationEntitlementObservation'
  );
  assertExactRecordKeys(
    entitlementObservation,
    [
      'source',
      'captureMethod',
      'organizationId',
      'organizationSlug',
      'organizationPlan',
      'actualDashboardQuoteUsd',
      'observedAt',
      'rawArtifact',
    ],
    'sourceProjectProvisioningResult.providerEvidence.organizationEntitlementObservation'
  );
  const entitlementRawBinding = verifyBoundArtifact(
    entitlementObservation.rawArtifact,
    'sourceProjectProvisioningResult.providerEvidence.organizationEntitlementObservation.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  assert(
    entitlementObservation.source === 'SUPABASE_BILLING_DASHBOARD' &&
      entitlementObservation.captureMethod ===
        'OWNER_READ_ONLY_SCREENSHOT_WITH_NORMALIZED_METADATA' &&
      entitlementObservation.organizationId === proposal.organizationId &&
      entitlementObservation.organizationSlug === organizationSlug &&
      entitlementObservation.organizationPlan === proposal.organizationPlan &&
      entitlementObservation.organizationPlan === 'PRO' &&
      entitlementObservation.actualDashboardQuoteUsd === actualQuote,
    'source project organization entitlement or quote observation mismatch'
  );
  const regionAvailability = requireRecord(
    providerExport.regionAvailabilityObservation,
    'sourceProjectProvisioningResult.providerEvidence.regionAvailabilityObservation'
  );
  assertExactRecordKeys(
    regionAvailability,
    [
      'httpMethod',
      'endpoint',
      'httpStatus',
      'organizationSlug',
      'desiredInstanceSize',
      'selectionType',
      'regionCode',
      'provider',
      'capacityStatus',
      'observedAt',
    ],
    'sourceProjectProvisioningResult.providerEvidence.regionAvailabilityObservation'
  );
  assert(
    regionAvailability.httpMethod === 'GET' &&
      regionAvailability.endpoint ===
        `https://api.supabase.com/v1/projects/available-regions?organization_slug=${organizationSlug}&desired_instance_size=large` &&
      regionAvailability.httpStatus === 200 &&
      regionAvailability.organizationSlug === organizationSlug &&
      regionAvailability.desiredInstanceSize === 'large' &&
      regionAvailability.selectionType === 'specific' &&
      regionAvailability.regionCode === proposal.region &&
      ['AWS', 'FLY', 'AWS_K8S', 'AWS_NIMBUS'].includes(
        regionAvailability.provider
      ) &&
      ['capacity', 'other', 'NOT_EXPOSED'].includes(
        regionAvailability.capacityStatus
      ),
    'source project current region availability observation mismatch'
  );
  const createResponse = requireRecord(
    providerExport.createResponse,
    'sourceProjectProvisioningResult.providerEvidence.createResponse'
  );
  const projectObservation = requireRecord(
    providerExport.projectObservation,
    'sourceProjectProvisioningResult.providerEvidence.projectObservation'
  );
  const computeObservation = requireRecord(
    providerExport.computeObservation,
    'sourceProjectProvisioningResult.providerEvidence.computeObservation'
  );
  assertExactRecordKeys(
    createResponse,
    [
      'httpStatus',
      'projectRef',
      'organizationId',
      'organizationSlug',
      'projectName',
      'region',
      'createdAt',
      'status',
    ],
    'sourceProjectProvisioningResult.providerEvidence.createResponse'
  );
  assertExactRecordKeys(
    projectObservation,
    [
      'httpMethod',
      'endpoint',
      'httpStatus',
      'projectRef',
      'projectName',
      'region',
      'status',
      'databaseHost',
      'databaseVersion',
      'observedAt',
    ],
    'sourceProjectProvisioningResult.providerEvidence.projectObservation'
  );
  assertExactRecordKeys(
    computeObservation,
    [
      'httpMethod',
      'endpoint',
      'httpStatus',
      'projectRef',
      'variantId',
      'observedAt',
    ],
    'sourceProjectProvisioningResult.providerEvidence.computeObservation'
  );
  assert(
    createResponse.httpStatus === 201 &&
      createResponse.organizationId === proposal.organizationId &&
      createResponse.organizationSlug === organizationSlug &&
      createResponse.projectName === proposal.projectName &&
      createResponse.region === proposal.region &&
      ['INACTIVE', 'COMING_UP', 'ACTIVE_HEALTHY'].includes(
        createResponse.status
      ) &&
      projectObservation.httpMethod === 'GET' &&
      projectObservation.endpoint ===
        `https://api.supabase.com/v1/projects/${String(createResponse.projectRef)}` &&
      projectObservation.httpStatus === 200 &&
      projectObservation.projectRef === createResponse.projectRef &&
      projectObservation.projectName === createResponse.projectName &&
      projectObservation.region === createResponse.region &&
      projectObservation.status === 'ACTIVE_HEALTHY' &&
      computeObservation.httpMethod === 'GET' &&
      computeObservation.endpoint ===
        `https://api.supabase.com/v1/projects/${String(createResponse.projectRef)}/billing/addons` &&
      computeObservation.httpStatus === 200 &&
      computeObservation.projectRef === createResponse.projectRef &&
      computeObservation.variantId === 'ci_large',
    'source project provider response, active project, or Large compute observation mismatch'
  );
  const rawProviderArtifacts = requireArray(
    providerExport.rawProviderArtifacts,
    'sourceProjectProvisioningResult.providerEvidence.rawProviderArtifacts'
  );
  assert(
    rawProviderArtifacts.length === 5,
    'source project provider export must bind entitlement, region availability, create, project, and compute observations'
  );
  const rawProviderFiles = rawProviderArtifacts.map((value, index) =>
    verifyBoundArtifact(
      value,
      `sourceProjectProvisioningResult.providerEvidence.rawProviderArtifacts[${String(index)}]`,
      artifactHashes,
      artifactFiles
    )
  );
  assertBindingMatch(
    rawProviderFiles[0].path,
    rawProviderFiles[0].sha256,
    entitlementRawBinding,
    'sourceProjectProvisioningResult.providerEvidence.organizationEntitlementObservation.rawArtifact'
  );
  const rawRegionAvailability = readJsonFile(
    rawProviderFiles[1].absolutePath,
    'sourceProjectProvisioningResult.providerEvidence.rawRegionAvailability'
  );
  const rawCreateResponse = readJsonFile(
    rawProviderFiles[2].absolutePath,
    'sourceProjectProvisioningResult.providerEvidence.rawCreateResponse'
  );
  const rawProjectObservation = readJsonFile(
    rawProviderFiles[3].absolutePath,
    'sourceProjectProvisioningResult.providerEvidence.rawProjectObservation'
  );
  const rawComputeObservation = readJsonFile(
    rawProviderFiles[4].absolutePath,
    'sourceProjectProvisioningResult.providerEvidence.rawComputeObservation'
  );
  const requireProviderHttpEnvelope = (value, context) => {
    const envelope = requireRecord(value, context);
    const request = requireRecord(envelope.request, `${context}.request`);
    const response = requireRecord(envelope.response, `${context}.response`);
    const body = requireRecord(response.body, `${context}.response.body`);
    return { envelope, request, response, body };
  };
  const rawRegion = requireProviderHttpEnvelope(
    rawRegionAvailability,
    'sourceProjectProvisioningResult.providerEvidence.rawRegionAvailability'
  );
  const rawCreate = requireProviderHttpEnvelope(
    rawCreateResponse,
    'sourceProjectProvisioningResult.providerEvidence.rawCreateResponse'
  );
  assertExactRecordKeys(
    rawCreate.body,
    [
      'id',
      'ref',
      'organization_id',
      'organization_slug',
      'name',
      'region',
      'created_at',
      'status',
    ],
    'sourceProjectProvisioningResult.providerEvidence.rawCreateResponse.response.body'
  );
  const rawProject = requireProviderHttpEnvelope(
    rawProjectObservation,
    'sourceProjectProvisioningResult.providerEvidence.rawProjectObservation'
  );
  assertExactRecordKeys(
    rawProject.body,
    [
      'id',
      'ref',
      'organization_id',
      'organization_slug',
      'name',
      'region',
      'created_at',
      'status',
      'database',
    ],
    'sourceProjectProvisioningResult.providerEvidence.rawProjectObservation.response.body'
  );
  const rawCompute = requireProviderHttpEnvelope(
    rawComputeObservation,
    'sourceProjectProvisioningResult.providerEvidence.rawComputeObservation'
  );
  const rawRegionRows = validateSupabaseRegionAvailabilityBody(
    rawRegion.body,
    'sourceProjectProvisioningResult.providerEvidence.rawRegionAvailability.response.body'
  );
  assert(
    rawRegion.request.method === regionAvailability.httpMethod &&
      rawRegion.request.url === regionAvailability.endpoint &&
      rawRegion.response.status === regionAvailability.httpStatus &&
      rawRegion.envelope.observedAt === regionAvailability.observedAt &&
      rawRegionRows.some(
        row =>
          row.code === regionAvailability.regionCode &&
          row.type === regionAvailability.selectionType &&
          row.provider === regionAvailability.provider &&
          (row.status ?? 'NOT_EXPOSED') === regionAvailability.capacityStatus
      ),
    'sourceProjectProvisioningResult provider region normalization does not derive from the exact raw response envelope'
  );
  assert(
    rawCreate.request.method === providerRequest.httpMethod &&
      rawCreate.request.url === providerRequest.endpoint &&
      JSON.stringify(rawCreate.request.redactedBody) ===
        JSON.stringify(redactedWireBody) &&
      rawCreate.request.redactedBodySha256 ===
        providerRequest.redactedRequestSha256 &&
      rawCreate.response.status === createResponse.httpStatus &&
      typeof rawCreate.body.id === 'string' &&
      rawCreate.body.id.length > 0 &&
      rawCreate.body.ref === createResponse.projectRef &&
      rawCreate.body.organization_id === createResponse.organizationId &&
      rawCreate.body.organization_slug === createResponse.organizationSlug &&
      rawCreate.body.name === createResponse.projectName &&
      rawCreate.body.region === createResponse.region &&
      rawCreate.body.created_at === createResponse.createdAt &&
      rawCreate.body.status === createResponse.status &&
      rawCreate.envelope.observedAt === result.createResponseReceivedAt,
    'sourceProjectProvisioningResult provider create normalization does not derive from the exact raw response envelope'
  );
  const rawProjectDatabase = requireRecord(
    rawProject.body.database,
    'sourceProjectProvisioningResult.providerEvidence.rawProjectObservation.response.body.database'
  );
  assertExactRecordKeys(
    rawProjectDatabase,
    ['host', 'version', 'postgres_engine', 'release_channel'],
    'sourceProjectProvisioningResult.providerEvidence.rawProjectObservation.response.body.database'
  );
  assert(
    rawProject.request.method === projectObservation.httpMethod &&
      rawProject.request.url === projectObservation.endpoint &&
      rawProject.response.status === projectObservation.httpStatus &&
      rawProject.body.ref === projectObservation.projectRef &&
      rawProject.body.name === projectObservation.projectName &&
      rawProject.body.region === projectObservation.region &&
      rawProject.body.status === projectObservation.status &&
      rawProjectDatabase.host === projectObservation.databaseHost &&
      rawProjectDatabase.version === projectObservation.databaseVersion &&
      rawProject.envelope.observedAt === projectObservation.observedAt,
    'sourceProjectProvisioningResult provider project normalization does not derive from the exact raw response envelope'
  );
  const selectedAddons = validateSupabaseAddonResponseBody(
    rawCompute.body,
    'sourceProjectProvisioningResult.providerEvidence.rawComputeObservation.response.body'
  );
  assert(
    rawCompute.request.method === computeObservation.httpMethod &&
      rawCompute.request.url === computeObservation.endpoint &&
      rawCompute.response.status === computeObservation.httpStatus &&
      rawCompute.envelope.observedAt === computeObservation.observedAt &&
      selectedAddons.some(
        addon =>
          addon.type === 'compute_instance' &&
          requireRecord(
            addon.variant,
            'sourceProjectProvisioningResult.providerEvidence.rawComputeObservation.response.body.selectedAddon.variant'
          ).id === computeObservation.variantId
      ),
    'sourceProjectProvisioningResult provider compute normalization does not derive the selected ci_large addon from the exact raw response envelope'
  );
  const createdEnvironment = requireRecord(
    result.createdEnvironment,
    'sourceProjectProvisioningResult.createdEnvironment'
  );
  for (const field of [
    'organizationId',
    'organizationPlan',
    'projectRef',
    'projectName',
    'projectUrl',
    'databaseHost',
    'databaseConnectionMode',
    'databaseUser',
    'region',
    'databaseTier',
    'databaseVersion',
  ]) {
    assert(
      createdEnvironment[field] === approvedEnvironment[field],
      `sourceProjectProvisioningResult.createdEnvironment.${field} mismatch`
    );
  }
  assert(
    createResponse.projectRef === createdEnvironment.projectRef &&
      projectObservation.projectRef === createdEnvironment.projectRef &&
      projectObservation.databaseHost === createdEnvironment.databaseHost &&
      projectObservation.databaseVersion ===
        createdEnvironment.databaseVersion &&
      createdEnvironment.projectUrl ===
        `https://${String(createdEnvironment.projectRef)}.supabase.co` &&
      createdEnvironment.databaseTier === 'LARGE' &&
      computeObservation.variantId === 'ci_large',
    'source project provider export does not corroborate the created environment and Large compute tier'
  );
  assert(
    !Object.hasOwn(createdEnvironment, 'systemIdentifier') &&
      !Object.hasOwn(createdEnvironment, 'databaseUtc') &&
      !Object.hasOwn(createdEnvironment, 'databaseClockTimestampUtc'),
    'source provisioning result must not claim database-observed identity or clock values'
  );
  const databaseObservation = requireRecord(
    result.databaseObservation,
    'sourceProjectProvisioningResult.databaseObservation'
  );
  assertExactRecordKeys(
    databaseObservation,
    [
      'databaseConnectionPerformed',
      'systemIdentifierCaptured',
      'databaseClockCaptured',
    ],
    'sourceProjectProvisioningResult.databaseObservation'
  );
  assert(
    databaseObservation.databaseConnectionPerformed === false &&
      databaseObservation.systemIdentifierCaptured === false &&
      databaseObservation.databaseClockCaptured === false,
    'source provisioning result exceeds its no-database-connection boundary'
  );
  const actionStartedAt = requireIsoTimestamp(
    result.actionStartedAt,
    'sourceProjectProvisioningResult.actionStartedAt'
  );
  const organizationEntitlementObservedAt = requireIsoTimestamp(
    result.organizationEntitlementObservedAt,
    'sourceProjectProvisioningResult.organizationEntitlementObservedAt'
  );
  const regionAvailabilityObservedAt = requireIsoTimestamp(
    result.regionAvailabilityObservedAt,
    'sourceProjectProvisioningResult.regionAvailabilityObservedAt'
  );
  const requestSentAt = requireIsoTimestamp(
    result.requestSentAt,
    'sourceProjectProvisioningResult.requestSentAt'
  );
  const createResponseReceivedAt = requireIsoTimestamp(
    result.createResponseReceivedAt,
    'sourceProjectProvisioningResult.createResponseReceivedAt'
  );
  const sourceCreatedAt = requireIsoTimestamp(
    result.sourceCreatedAt,
    'sourceProjectProvisioningResult.sourceCreatedAt'
  );
  const sourceProvisionedAt = requireIsoTimestamp(
    result.sourceProvisionedAt,
    'sourceProjectProvisioningResult.sourceProvisionedAt'
  );
  const capturedAt = requireIsoTimestamp(
    result.capturedAt,
    'sourceProjectProvisioningResult.capturedAt'
  );
  const providerCreatedAt = requireIsoTimestamp(
    createResponse.createdAt,
    'sourceProjectProvisioningResult.providerEvidence.createResponse.createdAt'
  );
  const providerProjectObservedAt = requireIsoTimestamp(
    projectObservation.observedAt,
    'sourceProjectProvisioningResult.providerEvidence.projectObservation.observedAt'
  );
  const providerComputeObservedAt = requireIsoTimestamp(
    computeObservation.observedAt,
    'sourceProjectProvisioningResult.providerEvidence.computeObservation.observedAt'
  );
  const providerCapturedAt = requireIsoTimestamp(
    providerExport.capturedAt,
    'sourceProjectProvisioningResult.providerEvidence.capturedAt'
  );
  const providerEntitlementObservedAt = requireIsoTimestamp(
    entitlementObservation.observedAt,
    'sourceProjectProvisioningResult.providerEvidence.organizationEntitlementObservation.observedAt'
  );
  const providerRegionObservedAt = requireIsoTimestamp(
    regionAvailability.observedAt,
    'sourceProjectProvisioningResult.providerEvidence.regionAvailabilityObservation.observedAt'
  );
  const providerClockSkewMs =
    provisioningAction.providerCreatedAtMaximumClockSkewSeconds * 1000;
  assert(
    Date.parse(organizationEntitlementObservedAt) <=
      Date.parse(provisionApprovedAt) &&
      organizationEntitlementObservedAt === providerEntitlementObservedAt &&
      Date.parse(provisionApprovedAt) <= Date.parse(actionStartedAt) &&
      Date.parse(actionStartedAt) <= Date.parse(regionAvailabilityObservedAt) &&
      regionAvailabilityObservedAt === providerRegionObservedAt &&
      Date.parse(regionAvailabilityObservedAt) <= Date.parse(requestSentAt) &&
      Date.parse(requestSentAt) <= Date.parse(createResponseReceivedAt) &&
      sourceCreatedAt === providerCreatedAt &&
      Date.parse(providerCreatedAt) >=
        Date.parse(requestSentAt) - providerClockSkewMs &&
      Date.parse(providerCreatedAt) <=
        Date.parse(createResponseReceivedAt) + providerClockSkewMs &&
      Date.parse(createResponseReceivedAt) <=
        Date.parse(providerProjectObservedAt) &&
      Date.parse(providerCreatedAt) <= Date.parse(providerProjectObservedAt) &&
      Date.parse(providerProjectObservedAt) <=
        Date.parse(providerComputeObservedAt) &&
      Date.parse(providerComputeObservedAt) <= Date.parse(providerCapturedAt) &&
      sourceProvisionedAt === providerComputeObservedAt &&
      capturedAt === providerCapturedAt &&
      Date.parse(capturedAt) <= Date.parse(provisionExpiresAt),
    'source project provisioning result request/response/readiness chronology mismatch'
  );
  requireConcreteString(
    result.operator,
    'sourceProjectProvisioningResult.operator'
  );
  assert(
    providerExport.capturedBy === result.operator,
    'source project provider export capturedBy does not match the provisioning operator'
  );
  const sourceLifecycle = requireRecord(
    packet.lifecycle,
    'approvalPacket.lifecycle'
  );
  const lifecycleSourceProvisionedAt = requireIsoTimestamp(
    sourceLifecycle.sourceProvisionedAt,
    'approvalPacket.lifecycle.sourceProvisionedAt'
  );
  const lifecycleSourceCreatedAt = requireIsoTimestamp(
    sourceLifecycle.sourceCreatedAt,
    'approvalPacket.lifecycle.sourceCreatedAt'
  );
  assert(
    lifecycleSourceCreatedAt === sourceCreatedAt &&
      lifecycleSourceProvisionedAt === sourceProvisionedAt,
    'approvalPacket.lifecycle source creation/readiness timestamps do not match provider evidence'
  );
  return {
    provisionApprovedAt,
    provisionExpiresAt,
    sourceCreatedAt,
    sourceProvisionedAt,
    provisioningApprovalBinding: bound,
    provisioningResultBinding: resultBinding,
    sourceCredentialProviderConfigurationBinding,
  };
}

function verifyPhasePreExecutionFreeze(
  value,
  packet,
  context,
  artifactHashes,
  artifactFiles,
  { replayCollectorsRequired, platformConfigurationCollectorRequired }
) {
  const freeze = requireRecord(value, context);
  const requiredBindingFields = [
    'migrationInputContract',
    'targetGuardImplementation',
    'sourceIdentityCollector',
    'credentialContract',
    'credentialProviderConfiguration',
  ];
  if (platformConfigurationCollectorRequired) {
    requiredBindingFields.push('sourcePlatformConfigurationCollector');
  }
  if (replayCollectorsRequired) {
    requiredBindingFields.push(
      'migrationReplayCollector',
      'postReplayCatalogCollector',
      'migrationHistoryCollector'
    );
  }
  const bindings = new Map();
  for (const field of requiredBindingFields) {
    bindings.set(
      field,
      verifyBoundArtifact(
        freeze[field],
        `${context}.${field}`,
        artifactHashes,
        artifactFiles
      )
    );
  }
  const target = requireRecord(packet.target, 'approvalPacket.target');
  const approvedMigrationInput = requireRecord(
    target.migrationInputContract,
    'approvalPacket.target.migrationInputContract'
  );
  assertBindingMatch(
    bindings.get('migrationInputContract').path,
    bindings.get('migrationInputContract').sha256,
    approvedMigrationInput,
    `${context}.migrationInputContract`
  );
  const packetBindings = requireRecord(
    packet.bindings,
    'approvalPacket.bindings'
  );
  const approvedCredential = requireRecord(
    packetBindings.credentialContract,
    'approvalPacket.bindings.credentialContract'
  );
  assertBindingMatch(
    bindings.get('credentialContract').path,
    bindings.get('credentialContract').sha256,
    approvedCredential,
    `${context}.credentialContract`
  );
  const toolVersionOutputs = requireRecord(
    freeze.toolVersionOutputs,
    `${context}.toolVersionOutputs`
  );
  for (const tool of ['node', 'supabaseCli', 'psql']) {
    verifyBoundArtifact(
      toolVersionOutputs[tool],
      `${context}.toolVersionOutputs.${tool}`,
      artifactHashes,
      artifactFiles
    );
  }
  const frozenToolBinaries = requireRecord(
    freeze.toolBinaries,
    `${context}.toolBinaries`
  );
  const approvedToolBinaries = requireRecord(
    packet.toolBinaries,
    'approvalPacket.toolBinaries'
  );
  for (const tool of ['supabaseCli', 'psql']) {
    const frozen = requireRecord(
      frozenToolBinaries[tool],
      `${context}.toolBinaries.${tool}`
    );
    const approved = requireRecord(
      approvedToolBinaries[tool],
      `approvalPacket.toolBinaries.${tool}`
    );
    assert(
      frozen.path === approved.path && frozen.sha256 === approved.sha256,
      `${context}.toolBinaries.${tool} approval mismatch`
    );
  }
  return bindings;
}

function verifyPhaseCommandLedger(
  bindingValue,
  manifest,
  expectedPhase,
  expectedCommandIds,
  context,
  artifactHashes,
  artifactFiles,
  inheritedBootstrapCommandIds = null
) {
  const binding = verifyBoundArtifact(
    bindingValue,
    context,
    artifactHashes,
    artifactFiles
  );
  const ledger = readJsonFile(binding.absolutePath, context);
  assert(
    ledger.schemaVersion === 1 &&
      ledger.phase === expectedPhase &&
      ledger.status === 'APPROVED_EXECUTABLE',
    `${context} identity or status mismatch`
  );
  assertExactStringArray(
    requireConcreteStringArray(ledger.commandIds, `${context}.commandIds`),
    expectedCommandIds,
    `${context}.commandIds`
  );
  if (inheritedBootstrapCommandIds !== null) {
    assertExactStringArray(
      requireConcreteStringArray(
        ledger.inheritedBootstrapCommandIds,
        `${context}.inheritedBootstrapCommandIds`
      ),
      inheritedBootstrapCommandIds,
      `${context}.inheritedBootstrapCommandIds`
    );
  } else {
    assert(
      !Object.hasOwn(ledger, 'inheritedBootstrapCommandIds'),
      `${context} must not inherit unapproved commands`
    );
  }
  const phaseCommands = requireArray(ledger.commands, `${context}.commands`);
  assert(
    phaseCommands.length === expectedCommandIds.length,
    `${context}.commands count mismatch`
  );
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const firstIndex = commands.findIndex(
    command => command.id === expectedCommandIds[0]
  );
  assert(firstIndex >= 0, `${context} first command is missing from manifest`);
  const manifestSlice = commands.slice(
    firstIndex,
    firstIndex + expectedCommandIds.length
  );
  assertExactStringArray(
    manifestSlice.map(command => command.id),
    expectedCommandIds,
    `${context}.manifestContiguousSlice`
  );
  for (const [index, id] of expectedCommandIds.entries()) {
    const approved = requireRecord(
      phaseCommands[index],
      `${context}.commands[${String(index)}]`
    );
    const command = manifestSlice[index];
    for (const field of [
      'id',
      'redactedCommand',
      'phase',
      'remoteContact',
      'mutating',
      'mutationScope',
    ]) {
      assert(
        approved[field] === command[field],
        `${context}.commands[${String(index)}].${field} mismatch`
      );
    }
  }
  return {
    binding,
    firstIndex,
    lastIndex: firstIndex + expectedCommandIds.length - 1,
  };
}

function deriveSourcePlatformConfiguration(
  raw,
  familyName,
  approvedProjectRef,
  command,
  artifactHashes,
  artifactFiles
) {
  const context = `sourceIdentityBootstrapResult.preReplayPlatformConfiguration.${familyName}.rawObservation`;
  assertExactRecordKeys(raw, SOURCE_PLATFORM_RAW_ENVELOPE_KEYS, context);
  const transport = SOURCE_PLATFORM_TRANSPORTS[familyName];
  const requestContract = SOURCE_PLATFORM_REQUESTS[familyName];
  assert(
    typeof transport === 'string' && requestContract,
    `${context} family is not supported`
  );
  assert(
    raw.schemaVersion === 1 &&
      raw.resultType === 'SOURCE_PLATFORM_CONFIGURATION_RAW_EVIDENCE' &&
      raw.status === 'CAPTURED' &&
      raw.observationFamily === familyName &&
      raw.transport === transport &&
      raw.commandId === 'PR12-CMD-004A' &&
      raw.projectRef === approvedProjectRef &&
      raw.secretValuesCaptured === false,
    `${context} provider-native envelope drift`
  );
  const requestOrQuery = requireRecord(
    raw.requestOrQuery,
    `${context}.requestOrQuery`
  );
  assertExactRecordKeys(
    requestOrQuery,
    SOURCE_PLATFORM_REQUEST_KEYS,
    `${context}.requestOrQuery`
  );
  assert(
    requestOrQuery.method === requestContract.method &&
      requestOrQuery.endpointOrQueryId === requestContract.endpointOrQueryId &&
      requestOrQuery.requestOrQuerySha256 ===
        sha256Text(requestContract.descriptor) &&
      requestOrQuery.responseStatus === requestContract.responseStatus,
    `${context} provider request/query provenance drift`
  );
  const observedAt = requireIsoTimestamp(
    raw.observedAt,
    `${context}.observedAt`
  );
  assert(
    Date.parse(command.startedAt) <= Date.parse(observedAt) &&
      Date.parse(observedAt) <= Date.parse(command.endedAt),
    `${context}.observedAt is outside PR12-CMD-004A`
  );
  const payload = requireRecord(
    raw.providerPayload,
    `${context}.providerPayload`
  );

  if (familyName === 'DATA_API') {
    assertExactRecordKeys(
      payload,
      [
        'configuredState',
        'postgrestConfiguration',
        'restHealth',
        'directRestSmoke',
        'defaultPrivilegeExposure',
      ],
      `${context}.providerPayload`
    );
    const configuredState = requireRecord(
      payload.configuredState,
      `${context}.providerPayload.configuredState`
    );
    assertExactRecordKeys(
      configuredState,
      ['source', 'status', 'rawArtifact', 'secretFieldsRetained'],
      `${context}.providerPayload.configuredState`
    );
    assert(
      configuredState.source ===
        'SUPABASE_DASHBOARD_DATA_API_SETTINGS_ACCESSIBILITY_CAPTURE' &&
        configuredState.status === 'CAPTURED' &&
        configuredState.secretFieldsRetained === false,
      `${context}.providerPayload.configuredState is not provider-native or retains secrets`
    );
    const dashboardCaptureBinding = verifyBoundArtifact(
      configuredState.rawArtifact,
      `${context}.providerPayload.configuredState.rawArtifact`,
      artifactHashes,
      artifactFiles
    );
    const configuredCapture = readJsonFile(
      dashboardCaptureBinding.absolutePath,
      `${context}.providerPayload.configuredState.rawArtifact`
    );
    assertExactRecordKeys(
      configuredCapture,
      [
        'captureMethod',
        'projectRef',
        'capturedAt',
        'pageId',
        'controlLabel',
        'controlState',
        'secretValuesCaptured',
      ],
      `${context}.providerPayload.configuredState.rawArtifact`
    );
    assert(
      configuredCapture.captureMethod ===
        'OWNER_READ_ONLY_BROWSER_ACCESSIBILITY_SNAPSHOT' &&
        configuredCapture.projectRef === approvedProjectRef &&
        Date.parse(command.startedAt) <=
          Date.parse(
            requireIsoTimestamp(
              configuredCapture.capturedAt,
              `${context}.providerPayload.configuredState.rawArtifact.capturedAt`
            )
          ) &&
        Date.parse(configuredCapture.capturedAt) <=
          Date.parse(command.endedAt) &&
        configuredCapture.pageId === 'DATA_API_SETTINGS' &&
        configuredCapture.controlLabel === 'Enable Data API' &&
        ['ENABLED', 'DISABLED'].includes(configuredCapture.controlState) &&
        configuredCapture.secretValuesCaptured === false,
      `${context}.providerPayload.configuredState raw Dashboard capture drift`
    );
    const postgrest = requireRecord(
      payload.postgrestConfiguration,
      `${context}.providerPayload.postgrestConfiguration`
    );
    assertExactRecordKeys(
      postgrest,
      [
        'operationId',
        'httpStatus',
        'dbSchema',
        'dbExtraSearchPath',
        'maxRows',
        'dbPool',
        'dbPoolAcquisitionTimeout',
        'secretFieldsRetained',
      ],
      `${context}.providerPayload.postgrestConfiguration`
    );
    assert(
      postgrest.operationId === 'v1-get-postgrest-service-config' &&
        postgrest.httpStatus === 200 &&
        Number.isInteger(postgrest.maxRows) &&
        postgrest.maxRows > 0 &&
        (postgrest.dbPool === null || Number.isInteger(postgrest.dbPool)) &&
        (postgrest.dbPoolAcquisitionTimeout === null ||
          Number.isInteger(postgrest.dbPoolAcquisitionTimeout)) &&
        postgrest.secretFieldsRetained === false,
      `${context}.providerPayload.postgrestConfiguration drift or secret retention`
    );
    const exposedSchemas = requireConcreteString(
      postgrest.dbSchema,
      `${context}.providerPayload.postgrestConfiguration.dbSchema`
    )
      .split(',')
      .map(value => value.trim())
      .filter(value => value.length > 0);
    requireConcreteString(
      postgrest.dbExtraSearchPath,
      `${context}.providerPayload.postgrestConfiguration.dbExtraSearchPath`
    );
    const health = requireRecord(
      payload.restHealth,
      `${context}.providerPayload.restHealth`
    );
    assertExactRecordKeys(
      health,
      ['operationId', 'httpStatus', 'serviceName', 'status'],
      `${context}.providerPayload.restHealth`
    );
    assert(
      health.operationId === 'v1-get-services-health' &&
        health.httpStatus === 200 &&
        health.serviceName === 'rest' &&
        ['COMING_UP', 'ACTIVE_HEALTHY', 'UNHEALTHY'].includes(health.status),
      `${context}.providerPayload.restHealth drift`
    );
    const directRestSmoke = requireRecord(
      payload.directRestSmoke,
      `${context}.providerPayload.directRestSmoke`
    );
    assertExactRecordKeys(
      directRestSmoke,
      [
        'endpointPath',
        'role',
        'queryText',
        'querySha256',
        'httpStatus',
        'contentType',
        'sanitizedResponse',
        'sanitizedBodySha256',
      ],
      `${context}.providerPayload.directRestSmoke`
    );
    const directRestResponse = requireRecord(
      directRestSmoke.sanitizedResponse,
      `${context}.providerPayload.directRestSmoke.sanitizedResponse`
    );
    assertExactRecordKeys(
      directRestResponse,
      ['documentKind', 'version', 'pathCount'],
      `${context}.providerPayload.directRestSmoke.sanitizedResponse`
    );
    assert(
      directRestSmoke.endpointPath === '/rest/v1/' &&
        directRestSmoke.role === 'service_role' &&
        directRestSmoke.queryText === DATA_API_DIRECT_REST_SMOKE_QUERY &&
        directRestSmoke.querySha256 ===
          sha256Text(DATA_API_DIRECT_REST_SMOKE_QUERY) &&
        directRestSmoke.httpStatus === 200 &&
        directRestSmoke.contentType === 'application/openapi+json' &&
        directRestResponse.documentKind === 'OPENAPI' &&
        typeof directRestResponse.version === 'string' &&
        directRestResponse.version.length > 0 &&
        Number.isInteger(directRestResponse.pathCount) &&
        directRestResponse.pathCount >= 0 &&
        directRestSmoke.sanitizedBodySha256 ===
          sha256Text(JSON.stringify(directRestResponse)),
      `${context}.providerPayload.directRestSmoke identity drift`
    );
    const defaultPrivilege = requireRecord(
      payload.defaultPrivilegeExposure,
      `${context}.providerPayload.defaultPrivilegeExposure`
    );
    assertExactRecordKeys(
      defaultPrivilege,
      [
        'queryId',
        'queryText',
        'querySha256',
        'commandStatus',
        'rowCount',
        'rowsSha256',
        'rows',
      ],
      `${context}.providerPayload.defaultPrivilegeExposure`
    );
    assert(
      defaultPrivilege.queryId === DATA_API_DEFAULT_PRIVILEGE_QUERY_ID &&
        defaultPrivilege.queryText === DATA_API_DEFAULT_PRIVILEGE_QUERY &&
        defaultPrivilege.querySha256 ===
          sha256Text(DATA_API_DEFAULT_PRIVILEGE_QUERY) &&
        defaultPrivilege.commandStatus === 'COMMAND_OK' &&
        defaultPrivilege.rowCount === 48 &&
        defaultPrivilege.rowsSha256 ===
          sha256Text(JSON.stringify(defaultPrivilege.rows)),
      `${context}.providerPayload.defaultPrivilegeExposure drift`
    );
    const expectedDefaultPrivilegeIdentities =
      DATA_API_DEFAULT_PRIVILEGE_OWNERS.flatMap(ownerRole =>
        DATA_API_DEFAULT_PRIVILEGE_SCOPES.flatMap(scope =>
          DATA_API_DEFAULT_PRIVILEGE_OBJECT_TYPES.flatMap(objectType =>
            DATA_API_DEFAULT_PRIVILEGE_ROLES.map(apiRole => ({
              ownerRole,
              namespaceScope: scope,
              objectType,
              apiRole,
            }))
          )
        )
      );
    const defaultPrivilegeRows = requireArray(
      defaultPrivilege.rows,
      `${context}.providerPayload.defaultPrivilegeExposure.rows`
    ).map((value, index) => {
      const rowContext = `${context}.providerPayload.defaultPrivilegeExposure.rows[${String(index)}]`;
      const row = requireRecord(value, rowContext);
      assertExactRecordKeys(
        row,
        ['ownerRole', 'namespaceScope', 'objectType', 'apiRole', 'privileges'],
        rowContext
      );
      const privileges = requireConcreteStringArray(
        row.privileges,
        `${rowContext}.privileges`,
        { allowEmpty: true }
      );
      assert(
        privileges.every(privilege =>
          [
            'DELETE',
            'EXECUTE',
            'INSERT',
            'MAINTAIN',
            'REFERENCES',
            'SELECT',
            'TRIGGER',
            'TRUNCATE',
            'UPDATE',
            'USAGE',
          ].includes(privilege)
        ),
        `${rowContext}.privileges contains an unknown privilege`
      );
      return {
        ownerRole: row.ownerRole,
        namespaceScope: row.namespaceScope,
        objectType: row.objectType,
        apiRole: row.apiRole,
        privileges,
      };
    });
    assert(
      JSON.stringify(
        defaultPrivilegeRows.map(
          ({ ownerRole, namespaceScope, objectType, apiRole }) => ({
            ownerRole,
            namespaceScope,
            objectType,
            apiRole,
          })
        )
      ) === JSON.stringify(expectedDefaultPrivilegeIdentities),
      `${context}.providerPayload.defaultPrivilegeExposure.rows does not cover the frozen owner/object/role cross-product in order`
    );
    for (const [index, row] of defaultPrivilegeRows.entries()) {
      assert(
        JSON.stringify(row.privileges) ===
          JSON.stringify([...new Set(row.privileges)].sort()),
        `${context}.providerPayload.defaultPrivilegeExposure.rows[${String(index)}].privileges must be unique and sorted`
      );
    }
    return {
      enabled: configuredCapture.controlState === 'ENABLED',
      serviceHealthy: health.status === 'ACTIVE_HEALTHY',
      directEndpointReachable: directRestSmoke.httpStatus === 200,
      exposedSchemas,
      automaticallyExposeNewTablesAndFunctions: defaultPrivilegeRows.some(
        row => row.apiRole !== 'service_role' && row.privileges.length > 0
      ),
    };
  }

  if (familyName === 'AUTH') {
    assertExactRecordKeys(
      payload,
      [
        'operationId',
        'httpStatus',
        'core',
        'providerEnabled',
        'safeProjectionVersion',
        'inspectedDeliveryFields',
        'inspectedFieldSetSha256',
        'fieldPresence',
        'secretFieldsRetained',
      ],
      `${context}.providerPayload`
    );
    assert(
      payload.operationId === 'v1-get-auth-service-config' &&
        payload.httpStatus === 200 &&
        payload.secretFieldsRetained === false,
      `${context}.providerPayload Auth operation or secret-retention drift`
    );
    assert(
      payload.safeProjectionVersion === 'PR12-AUTH-SAFE-PROJECTION-V2',
      `${context}.providerPayload Auth safe projection version drift`
    );
    assertExactStringArray(
      requireConcreteStringArray(
        payload.inspectedDeliveryFields,
        `${context}.providerPayload.inspectedDeliveryFields`
      ),
      AUTH_SAFE_PROJECTION_FIELDS,
      `${context}.providerPayload.inspectedDeliveryFields`
    );
    assert(
      payload.inspectedFieldSetSha256 ===
        sha256Text(JSON.stringify(AUTH_SAFE_PROJECTION_FIELDS)),
      `${context}.providerPayload.inspectedFieldSetSha256 drift`
    );
    const core = requireRecord(payload.core, `${context}.providerPayload.core`);
    const coreFields = [
      'disable_signup',
      'external_anonymous_users_enabled',
      'external_email_enabled',
      'external_phone_enabled',
      'jwt_exp',
      'mailer_autoconfirm',
      'sms_autoconfirm',
      'refresh_token_rotation_enabled',
    ];
    assertExactRecordKeys(core, coreFields, `${context}.providerPayload.core`);
    for (const field of coreFields.filter(field => field !== 'jwt_exp')) {
      assert(
        typeof core[field] === 'boolean',
        `${context}.providerPayload.core.${field} must be boolean`
      );
    }
    assert(
      Number.isInteger(core.jwt_exp) && core.jwt_exp > 0,
      `${context}.providerPayload.core.jwt_exp must be a positive integer`
    );
    const providers = requireRecord(
      payload.providerEnabled,
      `${context}.providerPayload.providerEnabled`
    );
    assertExactRecordKeys(
      providers,
      AUTH_PROVIDER_ENABLED_FIELDS,
      `${context}.providerPayload.providerEnabled`
    );
    const enabledProviders = AUTH_PROVIDER_ENABLED_FIELDS.filter(field => {
      assert(
        typeof providers[field] === 'boolean',
        `${context}.providerPayload.providerEnabled.${field} must be boolean`
      );
      return providers[field] === true;
    });
    const fieldPresence = requireRecord(
      payload.fieldPresence,
      `${context}.providerPayload.fieldPresence`
    );
    assertExactRecordKeys(
      fieldPresence,
      AUTH_SAFE_PROJECTION_FIELDS,
      `${context}.providerPayload.fieldPresence`
    );
    for (const field of AUTH_SAFE_PROJECTION_FIELDS) {
      assert(
        typeof fieldPresence[field] === 'boolean',
        `${context}.providerPayload.fieldPresence.${field} must be a secret-free boolean`
      );
    }
    const emailProviderConfigured = core.external_email_enabled;
    const smsProviderConfigured = core.external_phone_enabled;
    const smtpDeliveryConfigured = AUTH_SMTP_PRESENCE_FIELDS.some(
      field => fieldPresence[field] === true
    );
    const smsDeliveryConfigured = AUTH_SMS_PRESENCE_FIELDS.some(
      field => fieldPresence[field] === true
    );
    const oauthDeliveryConfigured = AUTH_OAUTH_SECRET_PRESENCE_FIELDS.some(
      field => fieldPresence[field] === true
    );
    const authHookConfigured = AUTH_HOOK_PRESENCE_FIELDS.some(
      field => fieldPresence[field] === true
    );
    const realEmailSmsOrOAuthDeliveryConfigured =
      smtpDeliveryConfigured ||
      smsDeliveryConfigured ||
      oauthDeliveryConfigured ||
      authHookConfigured;
    return {
      anonymousSignInEnabled: core.external_anonymous_users_enabled,
      emailProviderConfigured,
      smsProviderConfigured,
      oauthProvidersEnabled: enabledProviders,
      realEmailSmsOrOAuthDeliveryConfigured,
    };
  }

  assert(familyName === 'GRAPHQL', `${context} family is unsupported`);
  assertExactRecordKeys(
    payload,
    [
      'extensionCatalog',
      'exposureCatalog',
      'endpointProbe',
      'introspectionProbe',
      'secretFieldsRetained',
    ],
    `${context}.providerPayload`
  );
  assert(
    payload.secretFieldsRetained === false,
    `${context}.providerPayload must not retain secrets`
  );
  const extension = requireRecord(
    payload.extensionCatalog,
    `${context}.providerPayload.extensionCatalog`
  );
  assertExactRecordKeys(
    extension,
    ['queryId', 'queryText', 'querySha256', 'commandStatus', 'rows'],
    `${context}.providerPayload.extensionCatalog`
  );
  assert(
    extension.queryId === 'PR12-PG-AVAILABLE-EXTENSIONS-PG-GRAPHQL-V1' &&
      extension.queryText === GRAPHQL_EXTENSION_QUERY &&
      extension.querySha256 === sha256Text(GRAPHQL_EXTENSION_QUERY) &&
      extension.commandStatus === 'COMMAND_OK',
    `${context}.providerPayload.extensionCatalog provenance drift`
  );
  const extensionRows = requireArray(
    extension.rows,
    `${context}.providerPayload.extensionCatalog.rows`
  );
  assert(
    extensionRows.length === 1,
    `${context}.providerPayload.extensionCatalog.rows must contain pg_graphql exactly once`
  );
  const extensionRow = requireRecord(
    extensionRows[0],
    `${context}.providerPayload.extensionCatalog.rows[0]`
  );
  assertExactRecordKeys(
    extensionRow,
    ['extensionName', 'availableVersion', 'installedVersion'],
    `${context}.providerPayload.extensionCatalog.rows[0]`
  );
  assert(
    extensionRow.extensionName === 'pg_graphql',
    `${context}.providerPayload.extensionCatalog must identify pg_graphql`
  );
  assert(
    (extensionRow.availableVersion === null ||
      (typeof extensionRow.availableVersion === 'string' &&
        extensionRow.availableVersion.length > 0)) &&
      (extensionRow.installedVersion === null ||
        (typeof extensionRow.installedVersion === 'string' &&
          extensionRow.installedVersion.length > 0)),
    `${context}.providerPayload.extensionCatalog.rows[0] versions must be null or concrete strings`
  );
  const installedVersion = extensionRow.installedVersion;
  const exposure = requireRecord(
    payload.exposureCatalog,
    `${context}.providerPayload.exposureCatalog`
  );
  assertExactRecordKeys(
    exposure,
    [
      'queryId',
      'queryText',
      'querySha256',
      'commandStatus',
      'dbSchema',
      'dbExtraSearchPath',
    ],
    `${context}.providerPayload.exposureCatalog`
  );
  assert(
    exposure.queryId === 'PR12-GRAPHQL-EXPOSURE-CATALOG-V1' &&
      exposure.queryText === GRAPHQL_EXPOSURE_QUERY &&
      exposure.querySha256 === sha256Text(GRAPHQL_EXPOSURE_QUERY) &&
      exposure.commandStatus === 'COMMAND_OK',
    `${context}.providerPayload.exposureCatalog provenance drift`
  );
  const configuredApiSchemas = requireConcreteString(
    exposure.dbSchema,
    `${context}.providerPayload.exposureCatalog.dbSchema`
  )
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
  requireConcreteString(
    exposure.dbExtraSearchPath,
    `${context}.providerPayload.exposureCatalog.dbExtraSearchPath`
  );
  const endpoint = requireRecord(
    payload.endpointProbe,
    `${context}.providerPayload.endpointProbe`
  );
  const introspection = requireRecord(
    payload.introspectionProbe,
    `${context}.providerPayload.introspectionProbe`
  );
  for (const [probe, probeName] of [
    [endpoint, 'endpointProbe'],
    [introspection, 'introspectionProbe'],
  ]) {
    assertExactRecordKeys(
      probe,
      [
        'endpointPath',
        'role',
        'queryText',
        'querySha256',
        'httpStatus',
        'sanitizedResponse',
        'sanitizedResponseSha256',
      ],
      `${context}.providerPayload.${probeName}`
    );
    assert(
      probe.endpointPath === '/graphql/v1' &&
        ['anon', 'authenticated', 'service_role'].includes(probe.role) &&
        Number.isInteger(probe.httpStatus) &&
        probe.queryText ===
          (probeName === 'endpointProbe'
            ? GRAPHQL_ENDPOINT_PROBE_QUERY
            : GRAPHQL_INTROSPECTION_PROBE_QUERY) &&
        probe.querySha256 === sha256Text(probe.queryText),
      `${context}.providerPayload.${probeName} request identity drift`
    );
    requireSha256(
      probe.sanitizedResponseSha256,
      `${context}.providerPayload.${probeName}.sanitizedResponseSha256`
    );
    const sanitizedResponse = requireRecord(
      probe.sanitizedResponse,
      `${context}.providerPayload.${probeName}.sanitizedResponse`
    );
    assertExactRecordKeys(
      sanitizedResponse,
      ['data', 'errors'],
      `${context}.providerPayload.${probeName}.sanitizedResponse`
    );
    const errors = requireArray(
      sanitizedResponse.errors,
      `${context}.providerPayload.${probeName}.sanitizedResponse.errors`
    );
    for (const [index, errorValue] of errors.entries()) {
      const errorContext = `${context}.providerPayload.${probeName}.sanitizedResponse.errors[${String(index)}]`;
      const error = requireRecord(errorValue, errorContext);
      assertExactRecordKeys(error, ['message'], errorContext);
      requireConcreteString(error.message, `${errorContext}.message`);
    }
    assert(
      probe.sanitizedResponseSha256 ===
        sha256Text(JSON.stringify(sanitizedResponse)),
      `${context}.providerPayload.${probeName} sanitized response hash drift`
    );
  }
  const endpointResponse = requireRecord(
    endpoint.sanitizedResponse,
    `${context}.providerPayload.endpointProbe.sanitizedResponse`
  );
  const endpointErrors = requireArray(
    endpointResponse.errors,
    `${context}.providerPayload.endpointProbe.sanitizedResponse.errors`
  );
  const endpointAccepted =
    endpoint.httpStatus >= 200 &&
    endpoint.httpStatus < 300 &&
    endpointErrors.length === 0 &&
    endpointResponse.data !== null &&
    typeof endpointResponse.data === 'object' &&
    typeof endpointResponse.data.__typename === 'string' &&
    endpointResponse.data.__typename.length > 0;
  assert(
    endpoint.httpStatus < 500 &&
      (endpointAccepted ||
        (endpoint.httpStatus >= 400 &&
          endpoint.httpStatus < 500 &&
          endpointResponse.data === null &&
          endpointErrors.length > 0)),
    `${context}.providerPayload.endpointProbe response is neither an accepted GraphQL result nor a captured rejection`
  );
  const introspectionResponse = requireRecord(
    introspection.sanitizedResponse,
    `${context}.providerPayload.introspectionProbe.sanitizedResponse`
  );
  const introspectionErrors = requireArray(
    introspectionResponse.errors,
    `${context}.providerPayload.introspectionProbe.sanitizedResponse.errors`
  );
  const introspectionData = introspectionResponse.data;
  const introspectionEnabled =
    introspection.httpStatus >= 200 &&
    introspection.httpStatus < 300 &&
    introspectionErrors.length === 0 &&
    introspectionData !== null &&
    typeof introspectionData === 'object' &&
    Object.hasOwn(introspectionData, '__schema');
  assert(
    introspection.httpStatus < 500 &&
      (introspectionEnabled ||
        (introspection.httpStatus >= 400 &&
          introspection.httpStatus < 500 &&
          introspectionResponse.data === null &&
          introspectionErrors.length > 0)),
    `${context}.providerPayload.introspectionProbe response does not prove either allowed or rejected introspection`
  );
  assert(
    installedVersion !== null || endpointAccepted === false,
    `${context}.providerPayload cannot accept GraphQL when pg_graphql is not installed`
  );
  return {
    installedVersion,
    enabled: installedVersion !== null && endpointAccepted,
    configuredApiSchemas,
    exposedSchemas:
      installedVersion !== null && endpointAccepted ? configuredApiSchemas : [],
    introspectionEnabled,
  };
}

function verifySourceIdentityBootstrap(
  manifest,
  packet,
  approvedEnvironment,
  provisioningWindow,
  artifactHashes,
  artifactFiles
) {
  const approvalBinding = verifyBoundArtifact(
    packet.sourceIdentityBootstrapApproval,
    'approvalPacket.sourceIdentityBootstrapApproval',
    artifactHashes,
    artifactFiles
  );
  const approval = readJsonFile(
    approvalBinding.absolutePath,
    'sourceIdentityBootstrapApproval'
  );
  assert(
    approval.schemaVersion === 1 &&
      approval.phase === 'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP' &&
      approval.status === 'APPROVED',
    'source identity bootstrap approval is not APPROVED'
  );
  const authorization = requireRecord(
    approval.authorization,
    'sourceIdentityBootstrapApproval.authorization'
  );
  const authorizationKeys = [
    'sourceIdentityConnectionAuthorized',
    'sourceIdentityCaptureAuthorized',
    'sourceLinkAuthorized',
    'cleanMigrationReplayAuthorized',
    'representativeSeedAuthorized',
    'fullQualificationAuthorized',
    'restoreProjectCreationAuthorized',
    'productionConnectionAuthorized',
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ];
  assertExactRecordKeys(
    authorization,
    authorizationKeys,
    'sourceIdentityBootstrapApproval.authorization'
  );
  assert(
    authorization.sourceIdentityConnectionAuthorized === true &&
      authorization.sourceIdentityCaptureAuthorized === true,
    'source identity bootstrap approval does not authorize its read-only capture'
  );
  for (const field of authorizationKeys.slice(2)) {
    assert(
      authorization[field] === false,
      `sourceIdentityBootstrapApproval.authorization.${field} must be false`
    );
  }
  verifyCanonicalGovernanceProposal(
    approval.governanceProposal,
    'sourceIdentityBootstrapApproval.governanceProposal',
    artifactHashes,
    artifactFiles
  );
  for (const [field, approved] of [
    [
      'sourceProjectProvisioningApproval',
      provisioningWindow.provisioningApprovalBinding,
    ],
    [
      'sourceProjectProvisioningResult',
      provisioningWindow.provisioningResultBinding,
    ],
  ]) {
    const candidate = requireRecord(
      approval[field],
      `sourceIdentityBootstrapApproval.${field}`
    );
    assertBindingMatch(
      candidate.path,
      candidate.sha256,
      approved,
      `sourceIdentityBootstrapApproval.${field}`
    );
  }
  const approvedCommandIds = requireConcreteStringArray(
    approval.approvedCommandIds,
    'sourceIdentityBootstrapApproval.approvedCommandIds'
  );
  const expectedCommandIds = [
    'capture-node-version',
    'capture-supabase-version',
    'capture-psql-version',
    'hash-supabase-binary',
    'hash-supabase-archive',
    'hash-psql-binary',
    'PR12-CMD-000',
    'PR12-CMD-000A',
    'PR12-CMD-001',
    'PR12-CMD-002',
    'PR12-CMD-004A',
  ];
  assertExactStringArray(
    approvedCommandIds,
    expectedCommandIds,
    'sourceIdentityBootstrapApproval.approvedCommandIds'
  );
  const bootstrapPhaseCommandLedger = verifyPhaseCommandLedger(
    approval.phaseCommandLedger,
    manifest,
    'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP',
    expectedCommandIds,
    'sourceIdentityBootstrapApproval.phaseCommandLedger',
    artifactHashes,
    artifactFiles
  );
  const bootstrapFreezeBindings = verifyPhasePreExecutionFreeze(
    approval.preExecutionFreeze,
    packet,
    'sourceIdentityBootstrapApproval.preExecutionFreeze',
    artifactHashes,
    artifactFiles,
    {
      replayCollectorsRequired: false,
      platformConfigurationCollectorRequired: true,
    }
  );
  assertBindingMatch(
    bootstrapFreezeBindings.get('credentialProviderConfiguration').path,
    bootstrapFreezeBindings.get('credentialProviderConfiguration').sha256,
    provisioningWindow.sourceCredentialProviderConfigurationBinding,
    'sourceIdentityBootstrapApproval.preExecutionFreeze.credentialProviderConfiguration'
  );
  const target = requireRecord(
    approval.target,
    'sourceIdentityBootstrapApproval.target'
  );
  const packetTarget = requireRecord(packet.target, 'approvalPacket.target');
  assert(
    target.gitCommit === packetTarget.gitCommit &&
      target.baseCommit === packetTarget.baseCommit &&
      target.migrationHead === packetTarget.migrationHead &&
      target.environmentProjectRef === approvedEnvironment.projectRef,
    'source identity bootstrap target commit or project mismatch'
  );
  for (const field of [
    'projectUrl',
    'databaseHost',
    'databaseConnectionMode',
    'databaseUser',
    'databaseVersion',
  ]) {
    assert(
      target[field] === approvedEnvironment[field],
      `sourceIdentityBootstrapApproval.target.${field} mismatch`
    );
  }
  assert(
    !Object.hasOwn(target, 'systemIdentifier'),
    'source identity bootstrap approval must not claim a pre-known system identifier'
  );
  const commandContract = requireRecord(
    approval.firstSourceIdentityAndClockCommand,
    'sourceIdentityBootstrapApproval.firstSourceIdentityAndClockCommand'
  );
  assert(
    commandContract.commandId === 'PR12-CMD-004A' &&
      commandContract.resultType === 'SOURCE_IDENTITY_CLOCK_OPERATION' &&
      commandContract.remoteContact === true &&
      commandContract.mutating === false &&
      commandContract.mutationScope === 'NONE' &&
      commandContract.preKnownSystemIdentifierRequired === false &&
      commandContract.mustCompleteBeforeLinkHistoryAdvisorOrReplay === true &&
      commandContract.bootstrapGuardUsesProvisioningResult === true &&
      commandContract.subsequentCommandsMustMatchCapturedSystemIdentifier ===
        true &&
      commandContract.readOnlyPlatformConfigurationCaptureRequired === true &&
      commandContract.familySpecificRawArtifactsRequired === true &&
      commandContract.configurationMustMatchProvisioningProposal === true,
    'source identity bootstrap command contract drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      commandContract.requiredConfigurationFamilies,
      'sourceIdentityBootstrapApproval.firstSourceIdentityAndClockCommand.requiredConfigurationFamilies'
    ),
    ['DATA_API', 'AUTH', 'GRAPHQL'],
    'sourceIdentityBootstrapApproval.firstSourceIdentityAndClockCommand.requiredConfigurationFamilies'
  );
  const mandatoryStop = requireRecord(
    approval.mandatoryStop,
    'sourceIdentityBootstrapApproval.mandatoryStop'
  );
  assert(
    mandatoryStop.stopAfterCommandId === 'PR12-CMD-004A' &&
      mandatoryStop.sourceReplayRequiresSeparatePostCaptureApproval === true &&
      mandatoryStop.automaticContinuationAuthorized === false,
    'source identity bootstrap mandatory stop drift'
  );
  const approvalRecord = requireRecord(
    approval.approval,
    'sourceIdentityBootstrapApproval.approval'
  );
  const approvedAt = requireIsoTimestamp(
    approvalRecord.approvedAt,
    'sourceIdentityBootstrapApproval.approval.approvedAt',
    { notFuture: true }
  );
  const expiresAt = requireIsoTimestamp(
    approvalRecord.expiresAt,
    'sourceIdentityBootstrapApproval.approval.expiresAt',
    { future: true }
  );
  assert(
    Date.parse(approvedAt) >=
      Date.parse(provisioningWindow.sourceProvisionedAt) &&
      Date.parse(approvedAt) < Date.parse(expiresAt),
    'source identity bootstrap approval chronology mismatch'
  );
  verifyOwnerSeparation(
    approvalRecord,
    requireRecord(approval.owners, 'sourceIdentityBootstrapApproval.owners'),
    'sourceIdentityBootstrapApproval'
  );
  const resultBinding = verifyBoundArtifact(
    packet.sourceIdentityBootstrapResult,
    'approvalPacket.sourceIdentityBootstrapResult',
    artifactHashes,
    artifactFiles
  );
  const result = readJsonFile(
    resultBinding.absolutePath,
    'sourceIdentityBootstrapResult'
  );
  assert(
    result.schemaVersion === 1 &&
      result.phase === 'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP_RESULT' &&
      result.resultType === 'SOURCE_IDENTITY_CLOCK_OPERATION' &&
      result.status === 'PASS' &&
      result.commandId === 'PR12-CMD-004A' &&
      result.gitCommit === packetTarget.gitCommit &&
      result.mandatoryStopObserved === true,
    'source identity bootstrap result identity or mandatory stop mismatch'
  );
  assertBindingMatch(
    requireRecord(result.approval, 'sourceIdentityBootstrapResult.approval')
      .path,
    requireRecord(result.approval, 'sourceIdentityBootstrapResult.approval')
      .sha256,
    approvalBinding,
    'sourceIdentityBootstrapResult.approval'
  );
  verifyRuntimeIdentityBinding(
    result.runtimeIdentity,
    approvedEnvironment,
    'sourceIdentityBootstrapResult.runtimeIdentity'
  );
  const platformConfiguration = requireRecord(
    result.preReplayPlatformConfiguration,
    'sourceIdentityBootstrapResult.preReplayPlatformConfiguration'
  );
  const platformDataApi = requireRecord(
    platformConfiguration.dataApi,
    'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.dataApi'
  );
  const approvedDataApi = requireRecord(
    approvedEnvironment.dataApiProvisioning,
    'approvalPacket.environment.dataApiProvisioning'
  );
  assert(
    platformDataApi.enabled === approvedDataApi.enabled &&
      platformDataApi.serviceHealthy === true &&
      platformDataApi.directEndpointReachable === true &&
      platformDataApi.automaticallyExposeNewTablesAndFunctions ===
        approvedDataApi.automaticallyExposeNewTablesAndFunctions,
    'source identity bootstrap Data API configuration differs from the approved proposal'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      platformDataApi.exposedSchemas,
      'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.dataApi.exposedSchemas'
    ),
    requireConcreteStringArray(
      approvedDataApi.exposedSchemas,
      'approvalPacket.environment.dataApiProvisioning.exposedSchemas'
    ),
    'source identity bootstrap Data API exposed schemas'
  );
  const platformAuth = requireRecord(
    platformConfiguration.auth,
    'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.auth'
  );
  const approvedAuth = requireRecord(
    approvedEnvironment.authProvisioning,
    'approvalPacket.environment.authProvisioning'
  );
  assert(
    platformAuth.anonymousSignInEnabled ===
      approvedAuth.anonymousSignInEnabled &&
      platformAuth.emailProviderConfigured === false &&
      platformAuth.smsProviderConfigured === false &&
      platformAuth.realEmailSmsOrOAuthDeliveryConfigured ===
        approvedAuth.realEmailSmsOrOAuthDeliveryConfigured,
    'source identity bootstrap Auth configuration differs from the approved proposal'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      platformAuth.oauthProvidersEnabled,
      'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.auth.oauthProvidersEnabled',
      { allowEmpty: true }
    ),
    [],
    'source identity bootstrap OAuth provider set'
  );
  const platformGraphQl = requireRecord(
    platformConfiguration.graphQl,
    'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.graphQl'
  );
  const approvedGraphQl = requireRecord(
    approvedEnvironment.graphQlProvisioning,
    'approvalPacket.environment.graphQlProvisioning'
  );
  assert(
    (approvedGraphQl.pgGraphqlEnabled === false &&
      platformGraphQl.installedVersion === null) ||
      (approvedGraphQl.pgGraphqlEnabled === true &&
        typeof platformGraphQl.installedVersion === 'string' &&
        platformGraphQl.installedVersion.length > 0),
    'source identity bootstrap GraphQL installed version does not match its enabled state'
  );
  assert(
    platformGraphQl.enabled === approvedGraphQl.pgGraphqlEnabled &&
      platformGraphQl.introspectionEnabled ===
        approvedGraphQl.introspectionEnabled,
    'source identity bootstrap GraphQL configuration differs from the approved proposal'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      platformGraphQl.configuredApiSchemas,
      'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.graphQl.configuredApiSchemas'
    ),
    requireConcreteStringArray(
      platformDataApi.exposedSchemas,
      'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.dataApi.exposedSchemas'
    ),
    'source identity bootstrap GraphQL configured API schemas must be cross-bound to PostgREST db_schema'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      platformGraphQl.exposedSchemas,
      'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.graphQl.exposedSchemas',
      { allowEmpty: true }
    ),
    requireConcreteStringArray(
      approvedGraphQl.exposedSchemas,
      'approvalPacket.environment.graphQlProvisioning.exposedSchemas',
      { allowEmpty: true }
    ),
    'source identity bootstrap GraphQL exposed schemas'
  );
  const platformComparison = requireRecord(
    platformConfiguration.comparison,
    'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.comparison'
  );
  assert(
    platformComparison.status === 'PASS' &&
      requireArray(
        platformComparison.mismatches,
        'sourceIdentityBootstrapResult.preReplayPlatformConfiguration.comparison.mismatches'
      ).length === 0,
    'source identity bootstrap platform configuration comparison must PASS without mismatches'
  );
  const sourceDatabaseUtc = requireIsoTimestamp(
    result.sourceDatabaseUtc,
    'sourceIdentityBootstrapResult.sourceDatabaseUtc'
  );
  const capturedAt = requireIsoTimestamp(
    result.capturedAt,
    'sourceIdentityBootstrapResult.capturedAt'
  );
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const command = commands.find(value => value.id === 'PR12-CMD-004A');
  assert(command, 'source identity bootstrap command is missing');
  const firstRemoteCommand = commands.find(
    value => value.remoteContact === true
  );
  assert(
    firstRemoteCommand === command,
    'PR12-CMD-004A must be the first remote command'
  );
  const stdoutBinding = verifyBoundArtifact(
    result.commandStdout,
    'sourceIdentityBootstrapResult.commandStdout',
    artifactHashes,
    artifactFiles
  );
  assert(
    command.stdoutPath.replaceAll('\\', '/') === stdoutBinding.path &&
      command.stdoutSha256 === stdoutBinding.sha256 &&
      command.endedAt === capturedAt &&
      Date.parse(command.startedAt) <= Date.parse(sourceDatabaseUtc) &&
      Date.parse(sourceDatabaseUtc) <= Date.parse(capturedAt) &&
      Date.parse(approvedAt) <= Date.parse(command.startedAt) &&
      Date.parse(capturedAt) <= Date.parse(expiresAt),
    'source identity bootstrap command stdout or approval window mismatch'
  );
  const operation = readJsonFile(
    stdoutBinding.absolutePath,
    'sourceIdentityBootstrapResult.commandStdout.operation'
  );
  assert(
    operation.schemaVersion === 1 &&
      operation.resultType === 'SOURCE_IDENTITY_CLOCK_OPERATION' &&
      operation.status === 'PASS' &&
      operation.commandId === 'PR12-CMD-004A' &&
      operation.gitCommit === packetTarget.gitCommit &&
      operation.sourceDatabaseUtc === sourceDatabaseUtc &&
      operation.capturedAt === capturedAt &&
      operation.mandatoryStopObserved === true,
    'source identity bootstrap stdout operation mismatch'
  );
  verifyRuntimeIdentityBinding(
    operation.runtimeIdentity,
    approvedEnvironment,
    'sourceIdentityBootstrapResult.commandStdout.runtimeIdentity'
  );
  assert(
    JSON.stringify(operation.preReplayPlatformConfiguration) ===
      JSON.stringify(platformConfiguration),
    'source identity bootstrap stdout platform configuration differs from the signed result'
  );
  for (const [familyName, normalized] of [
    ['DATA_API', platformDataApi],
    ['AUTH', platformAuth],
    ['GRAPHQL', platformGraphQl],
  ]) {
    const rawBinding = verifyBoundArtifact(
      normalized.rawObservation,
      `sourceIdentityBootstrapResult.preReplayPlatformConfiguration.${familyName}.rawObservation`,
      artifactHashes,
      artifactFiles
    );
    const raw = readJsonFile(
      rawBinding.absolutePath,
      `sourceIdentityBootstrapResult.preReplayPlatformConfiguration.${familyName}.rawObservation`
    );
    const normalizedWithoutBinding = { ...normalized };
    delete normalizedWithoutBinding.rawObservation;
    const derived = deriveSourcePlatformConfiguration(
      raw,
      familyName,
      approvedEnvironment.projectRef,
      command,
      artifactHashes,
      artifactFiles
    );
    assert(
      JSON.stringify(derived) === JSON.stringify(normalizedWithoutBinding),
      `source identity bootstrap ${familyName} normalization is not derived from its secret-stripped provider payload`
    );
  }
  return {
    approvalBinding,
    resultBinding,
    bootstrapApprovedAt: approvedAt,
    bootstrapExpiresAt: expiresAt,
    bootstrapCapturedAt: capturedAt,
    commandStdoutBinding: stdoutBinding,
    bootstrapCommandIds: expectedCommandIds,
    phaseCommandLedger: bootstrapPhaseCommandLedger,
    sourceCredentialProviderConfigurationBinding:
      provisioningWindow.sourceCredentialProviderConfigurationBinding,
  };
}

function verifySourceReplayCatalogCapture(
  manifest,
  packet,
  approvedEnvironment,
  provisioningWindow,
  bootstrapWindow,
  artifactHashes,
  artifactFiles
) {
  const approvalBinding = verifyBoundArtifact(
    packet.sourceReplayCatalogCaptureApproval,
    'approvalPacket.sourceReplayCatalogCaptureApproval',
    artifactHashes,
    artifactFiles
  );
  const approval = readJsonFile(
    approvalBinding.absolutePath,
    'sourceReplayCatalogCaptureApproval'
  );
  assert(
    approval.schemaVersion === 1 &&
      approval.phase === 'ISOLATED_STAGING_SOURCE_REPLAY_CATALOG_CAPTURE' &&
      approval.status === 'APPROVED',
    'source replay/catalog capture approval is not APPROVED'
  );
  const authorization = requireRecord(
    approval.authorization,
    'sourceReplayCatalogCaptureApproval.authorization'
  );
  assertExactRecordKeys(
    authorization,
    [
      'isolatedStagingConnectionAuthorized',
      'cleanMigrationReplayAuthorized',
      'postReplayCatalogCaptureAuthorized',
      'representativeSeedAuthorized',
      'fullQualificationAuthorized',
      'restoreProjectCreationAuthorized',
      'productionConnectionAuthorized',
      'readyTransitionAuthorized',
      'mergeAuthorized',
      'commercialReleaseAuthorized',
      'indexRetirementAuthorized',
    ],
    'sourceReplayCatalogCaptureApproval.authorization'
  );
  assert(
    authorization.isolatedStagingConnectionAuthorized === true &&
      authorization.cleanMigrationReplayAuthorized === true &&
      authorization.postReplayCatalogCaptureAuthorized === true &&
      authorization.representativeSeedAuthorized === false &&
      authorization.fullQualificationAuthorized === false &&
      authorization.restoreProjectCreationAuthorized === false &&
      authorization.productionConnectionAuthorized === false &&
      authorization.readyTransitionAuthorized === false &&
      authorization.mergeAuthorized === false &&
      authorization.commercialReleaseAuthorized === false &&
      authorization.indexRetirementAuthorized === false,
    'source replay/catalog capture approval exceeds its narrow phase'
  );
  verifyCanonicalGovernanceProposal(
    approval.governanceProposal,
    'sourceReplayCatalogCaptureApproval.governanceProposal',
    artifactHashes,
    artifactFiles
  );
  for (const [field, approved] of [
    [
      'sourceProjectProvisioningApproval',
      provisioningWindow.provisioningApprovalBinding,
    ],
    [
      'sourceProjectProvisioningResult',
      provisioningWindow.provisioningResultBinding,
    ],
    ['sourceIdentityBootstrapApproval', bootstrapWindow.approvalBinding],
    ['sourceIdentityBootstrapResult', bootstrapWindow.resultBinding],
  ]) {
    const candidate = requireRecord(
      approval[field],
      `sourceReplayCatalogCaptureApproval.${field}`
    );
    assertBindingMatch(
      candidate.path,
      candidate.sha256,
      approved,
      `sourceReplayCatalogCaptureApproval.${field}`
    );
  }
  const target = requireRecord(
    approval.target,
    'sourceReplayCatalogCaptureApproval.target'
  );
  assert(
    target.gitCommit === packet.target.gitCommit &&
      target.baseCommit === packet.target.baseCommit &&
      target.migrationHead === packet.target.migrationHead &&
      target.environmentProjectRef === approvedEnvironment.projectRef &&
      target.systemIdentifier === approvedEnvironment.systemIdentifier,
    'source replay/catalog capture target mismatch'
  );
  const approvedCommandIds = requireConcreteStringArray(
    approval.approvedCommandIds,
    'sourceReplayCatalogCaptureApproval.approvedCommandIds'
  );
  assert(
    approvedCommandIds.length > 0 &&
      new Set(approvedCommandIds).size === approvedCommandIds.length,
    'source replay/catalog capture command IDs must be non-empty and unique'
  );
  const expectedReplayCommandIds = [
    'PR12-CMD-003',
    'PR12-CMD-004',
    'PR12-CMD-005',
    'PR12-CMD-006',
    'PR12-CMD-007',
    'PR12-CMD-007A',
    'PR12-CMD-008A',
  ];
  assertExactStringArray(
    approvedCommandIds,
    expectedReplayCommandIds,
    'sourceReplayCatalogCaptureApproval.approvedCommandIds phase ledger'
  );
  const replayPhaseCommandLedger = verifyPhaseCommandLedger(
    approval.phaseCommandLedger,
    manifest,
    'ISOLATED_STAGING_SOURCE_REPLAY_CATALOG_CAPTURE',
    expectedReplayCommandIds,
    'sourceReplayCatalogCaptureApproval.phaseCommandLedger',
    artifactHashes,
    artifactFiles,
    bootstrapWindow.bootstrapCommandIds
  );
  assert(
    replayPhaseCommandLedger.firstIndex ===
      bootstrapWindow.phaseCommandLedger.lastIndex + 1,
    'source replay phase must begin immediately after the mandatory bootstrap stop in manifest order'
  );
  const replayFreezeBindings = verifyPhasePreExecutionFreeze(
    approval.preExecutionFreeze,
    packet,
    'sourceReplayCatalogCaptureApproval.preExecutionFreeze',
    artifactHashes,
    artifactFiles,
    {
      replayCollectorsRequired: true,
      platformConfigurationCollectorRequired: false,
    }
  );
  assertBindingMatch(
    replayFreezeBindings.get('credentialProviderConfiguration').path,
    replayFreezeBindings.get('credentialProviderConfiguration').sha256,
    bootstrapWindow.sourceCredentialProviderConfigurationBinding,
    'sourceReplayCatalogCaptureApproval.preExecutionFreeze.credentialProviderConfiguration'
  );
  const requiredReplayIds = ['PR12-CMD-007', 'PR12-CMD-007A', 'PR12-CMD-008A'];
  assert(
    requiredReplayIds.every(id => approvedCommandIds.includes(id)) &&
      approvedCommandIds.indexOf('PR12-CMD-007') <
        approvedCommandIds.indexOf('PR12-CMD-007A') &&
      approvedCommandIds.indexOf('PR12-CMD-007A') <
        approvedCommandIds.indexOf('PR12-CMD-008A') &&
      !approvedCommandIds.includes('PR12-CMD-008') &&
      !approvedCommandIds.includes('PR12-CMD-008B'),
    'source replay/catalog capture command boundary permits seed/full qualification or omits required replay evidence'
  );
  const replayApproval = requireRecord(
    approval.approval,
    'sourceReplayCatalogCaptureApproval.approval'
  );
  const replayApprovedAt = requireIsoTimestamp(
    replayApproval.approvedAt,
    'sourceReplayCatalogCaptureApproval.approval.approvedAt',
    { notFuture: true }
  );
  const replayExpiresAt = requireIsoTimestamp(
    replayApproval.expiresAt,
    'sourceReplayCatalogCaptureApproval.approval.expiresAt',
    { future: true }
  );
  assert(
    Date.parse(replayApprovedAt) >=
      Date.parse(bootstrapWindow.bootstrapCapturedAt) &&
      Date.parse(replayApprovedAt) < Date.parse(replayExpiresAt),
    'source replay/catalog capture approval must be issued after bootstrap capture and before expiry'
  );
  const postBootstrapReapproval = requireRecord(
    approval.postBootstrapReapproval,
    'sourceReplayCatalogCaptureApproval.postBootstrapReapproval'
  );
  assert(
    postBootstrapReapproval.bootstrapResultMustBePass === true &&
      postBootstrapReapproval.approvalMustBeAfterBootstrapCapturedAt === true &&
      postBootstrapReapproval.systemIdentifierMustEqualBootstrapResult ===
        true &&
      postBootstrapReapproval.automaticContinuationAuthorized === false,
    'source replay post-bootstrap reapproval contract drift'
  );
  const owners = requireRecord(
    approval.owners,
    'sourceReplayCatalogCaptureApproval.owners'
  );
  verifyOwnerSeparation(
    replayApproval,
    owners,
    'sourceReplayCatalogCaptureApproval'
  );
  const resultBinding = verifyBoundArtifact(
    packet.sourceReplayCatalogCaptureResult,
    'approvalPacket.sourceReplayCatalogCaptureResult',
    artifactHashes,
    artifactFiles
  );
  const result = readJsonFile(
    resultBinding.absolutePath,
    'sourceReplayCatalogCaptureResult'
  );
  assert(
    result.schemaVersion === 1 &&
      result.phase ===
        'ISOLATED_STAGING_SOURCE_REPLAY_CATALOG_CAPTURE_RESULT' &&
      result.status === 'PASS' &&
      result.environmentProjectRef === approvedEnvironment.projectRef &&
      result.gitCommit === packet.target.gitCommit &&
      result.migrationHead === packet.target.migrationHead &&
      result.catalogCaptureCommandId === 'PR12-CMD-007A',
    'source replay/catalog capture result identity mismatch'
  );
  assertBindingMatch(
    requireRecord(result.approval, 'sourceReplayCatalogCaptureResult.approval')
      .path,
    requireRecord(result.approval, 'sourceReplayCatalogCaptureResult.approval')
      .sha256,
    approvalBinding,
    'sourceReplayCatalogCaptureResult.approval'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      result.executedCommandIds,
      'sourceReplayCatalogCaptureResult.executedCommandIds'
    ),
    approvedCommandIds,
    'sourceReplayCatalogCaptureResult.executedCommandIds'
  );
  assert(
    result.sourceIdentityClockCommandId === 'PR12-CMD-004A' &&
      result.migrationReplayCommandId === 'PR12-CMD-007' &&
      result.migrationHistoryCommandId === 'PR12-CMD-008A',
    'source replay/catalog result command provenance mismatch'
  );
  assertBindingMatch(
    requireRecord(
      result.sourceIdentityClockOperation,
      'sourceReplayCatalogCaptureResult.sourceIdentityClockOperation'
    ).path,
    requireRecord(
      result.sourceIdentityClockOperation,
      'sourceReplayCatalogCaptureResult.sourceIdentityClockOperation'
    ).sha256,
    bootstrapWindow.commandStdoutBinding,
    'sourceReplayCatalogCaptureResult.sourceIdentityClockOperation'
  );
  const replayCompletedAt = requireIsoTimestamp(
    result.completedAt,
    'sourceReplayCatalogCaptureResult.completedAt'
  );
  assert(
    Date.parse(replayApprovedAt) <= Date.parse(replayCompletedAt) &&
      Date.parse(replayCompletedAt) <= Date.parse(replayExpiresAt),
    'source replay/catalog capture result is outside its approval window'
  );
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const firstReplayCommand = commands.find(
    command => command.id === expectedReplayCommandIds[0]
  );
  assert(
    firstReplayCommand &&
      Date.parse(firstReplayCommand.startedAt) >= Date.parse(replayApprovedAt),
    'source replay begins before post-bootstrap owner approval'
  );
  const migrationInputBinding = verifyBoundArtifact(
    requireRecord(
      approval.preExecutionFreeze,
      'sourceReplayCatalogCaptureApproval.preExecutionFreeze'
    ).migrationInputContract,
    'sourceReplayCatalogCaptureApproval.preExecutionFreeze.migrationInputContract',
    artifactHashes,
    artifactFiles
  );
  const migrationInput = readJsonFile(
    migrationInputBinding.absolutePath,
    'sourceReplayCatalogCaptureApproval.preExecutionFreeze.migrationInputContract'
  );
  const expectedOrderedMigrations = readdirSync(
    path.join(REPO_ROOT, 'supabase/migrations')
  )
    .filter(filename => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const migrationSetCanonical = expectedOrderedMigrations
    .map(
      filename =>
        `${sha256File(path.join(REPO_ROOT, 'supabase/migrations', filename))}  ${filename}`
    )
    .join('\n');
  assert(
    migrationInput.schemaVersion === 1 &&
      migrationInput.contractId === 'PR12-MIGRATION-INPUT-001' &&
      migrationInput.baseCommit === BASE_COMMIT &&
      migrationInput.migrationHead === MIGRATION_HEAD &&
      migrationInput.migrationCount === expectedOrderedMigrations.length &&
      migrationInput.migrationSetSha256 ===
        sha256Text(`${migrationSetCanonical}\n`),
    'source replay immutable migration input contract or repository migration set drift'
  );
  const preconditionCommand = commands.find(
    command => command.id === 'PR12-CMD-004'
  );
  const dryRunCommand = commands.find(command => command.id === 'PR12-CMD-005');
  assert(
    preconditionCommand && dryRunCommand,
    'source clean replay precondition or dry-run command is missing'
  );
  assert(
    result.preconditionCommandId === 'PR12-CMD-004' &&
      result.dryRunCommandId === 'PR12-CMD-005',
    'source replay/catalog result precondition or dry-run command provenance mismatch'
  );
  const preconditionBinding = verifyBoundArtifact(
    result.preconditionResult,
    'sourceReplayCatalogCaptureResult.preconditionResult',
    artifactHashes,
    artifactFiles
  );
  const dryRunBinding = verifyBoundArtifact(
    result.dryRunResult,
    'sourceReplayCatalogCaptureResult.dryRunResult',
    artifactHashes,
    artifactFiles
  );
  assert(
    preconditionBinding.path === preconditionCommand.stdoutPath &&
      preconditionBinding.sha256 === preconditionCommand.stdoutSha256 &&
      dryRunBinding.path === dryRunCommand.stdoutPath &&
      dryRunBinding.sha256 === dryRunCommand.stdoutSha256,
    'source replay precondition/dry-run results are not exact command stdout artifacts'
  );
  const precondition = readJsonFile(
    preconditionBinding.absolutePath,
    'sourceReplayCatalogCaptureResult.preconditionResult'
  );
  const preconditionScope = requireRecord(
    precondition.scope,
    'sourceReplayCatalogCaptureResult.preconditionResult.scope'
  );
  const preconditionHistory = requireRecord(
    precondition.migrationHistory,
    'sourceReplayCatalogCaptureResult.preconditionResult.migrationHistory'
  );
  const preconditionCatalog = requireRecord(
    precondition.applicationCatalog,
    'sourceReplayCatalogCaptureResult.preconditionResult.applicationCatalog'
  );
  assert(
    precondition.schemaVersion === 1 &&
      precondition.resultType === 'SOURCE_CLEAN_REPLAY_PRECONDITION' &&
      precondition.status === 'PASS' &&
      precondition.projectRef === approvedEnvironment.projectRef &&
      precondition.gitCommit === packet.target.gitCommit &&
      precondition.commandId === preconditionCommand.id &&
      precondition.capturedAt === preconditionCommand.endedAt &&
      precondition.databaseMutationPerformed === false &&
      precondition.applicationStateEmpty === true &&
      preconditionScope.platformAndExtensionOwnedSchemasExcluded === true &&
      preconditionScope.databaseWideEmptyClaimed === false &&
      preconditionHistory.appliedMigrationCount === 0 &&
      requireArray(
        preconditionHistory.orderedAppliedMigrations,
        'sourceReplayCatalogCaptureResult.preconditionResult.migrationHistory.orderedAppliedMigrations'
      ).length === 0 &&
      preconditionCatalog.relationCount === 0 &&
      preconditionCatalog.routineCount === 0 &&
      preconditionCatalog.typeCount === 0 &&
      requireArray(
        preconditionCatalog.unexpectedApplicationSchemas,
        'sourceReplayCatalogCaptureResult.preconditionResult.applicationCatalog.unexpectedApplicationSchemas'
      ).length === 0,
    'source clean replay precondition does not prove an empty application-owned state'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      preconditionScope.applicationSchemas,
      'sourceReplayCatalogCaptureResult.preconditionResult.scope.applicationSchemas'
    ),
    ['public'],
    'sourceReplayCatalogCaptureResult.preconditionResult.scope.applicationSchemas'
  );
  verifyRuntimeIdentityBinding(
    precondition.runtimeIdentity,
    approvedEnvironment,
    'sourceReplayCatalogCaptureResult.preconditionResult.runtimeIdentity'
  );
  const dryRun = readJsonFile(
    dryRunBinding.absolutePath,
    'sourceReplayCatalogCaptureResult.dryRunResult'
  );
  assertBindingMatch(
    requireRecord(
      dryRun.migrationInputContract,
      'dryRun.migrationInputContract'
    ).path,
    requireRecord(
      dryRun.migrationInputContract,
      'dryRun.migrationInputContract'
    ).sha256,
    migrationInputBinding,
    'sourceReplayCatalogCaptureResult.dryRunResult.migrationInputContract'
  );
  assert(
    dryRun.schemaVersion === 1 &&
      dryRun.resultType === 'SOURCE_MIGRATION_REPLAY_DRY_RUN' &&
      dryRun.status === 'PASS' &&
      dryRun.projectRef === approvedEnvironment.projectRef &&
      dryRun.gitCommit === packet.target.gitCommit &&
      dryRun.commandId === dryRunCommand.id &&
      dryRun.capturedAt === dryRunCommand.endedAt &&
      dryRun.databaseMutationPerformed === false &&
      dryRun.exitCode === 0 &&
      dryRun.alreadyAppliedMigrationCount === 0 &&
      dryRun.pendingMigrationCount === migrationInput.migrationCount &&
      dryRun.migrationHead === migrationInput.migrationHead &&
      dryRun.migrationSetSha256 === migrationInput.migrationSetSha256,
    'source migration replay dry-run identity, non-mutation, or frozen set drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      dryRun.orderedPendingMigrations,
      'sourceReplayCatalogCaptureResult.dryRunResult.orderedPendingMigrations'
    ),
    expectedOrderedMigrations,
    'sourceReplayCatalogCaptureResult.dryRunResult.orderedPendingMigrations'
  );
  verifyRuntimeIdentityBinding(
    dryRun.runtimeIdentity,
    approvedEnvironment,
    'sourceReplayCatalogCaptureResult.dryRunResult.runtimeIdentity'
  );
  const migrationReplayCommand = commands.find(
    command => command.id === 'PR12-CMD-007'
  );
  assert(migrationReplayCommand, 'migration replay command is missing');
  const migrationReplayBinding = verifyBoundArtifact(
    result.migrationReplayOperation,
    'sourceReplayCatalogCaptureResult.migrationReplayOperation',
    artifactHashes,
    artifactFiles
  );
  assert(
    migrationReplayBinding.path === migrationReplayCommand.stdoutPath &&
      migrationReplayBinding.sha256 === migrationReplayCommand.stdoutSha256,
    'migration replay operation is not the exact PR12-CMD-007 stdout'
  );
  const migrationReplayOperation = readJsonFile(
    migrationReplayBinding.absolutePath,
    'sourceReplayCatalogCaptureResult.migrationReplayOperation'
  );
  assert(
    migrationReplayOperation.schemaVersion === 1 &&
      migrationReplayOperation.resultType ===
        'CLEAN_MIGRATION_REPLAY_OPERATION' &&
      migrationReplayOperation.status === 'PASS' &&
      migrationReplayOperation.commandId === 'PR12-CMD-007' &&
      migrationReplayOperation.projectRef === approvedEnvironment.projectRef &&
      migrationReplayOperation.gitCommit === packet.target.gitCommit &&
      migrationReplayOperation.startedAt === migrationReplayCommand.startedAt &&
      migrationReplayOperation.completedAt === migrationReplayCommand.endedAt,
    'migration replay operation identity or command window mismatch'
  );
  verifyRuntimeIdentityBinding(
    migrationReplayOperation.runtimeIdentity,
    approvedEnvironment,
    'sourceReplayCatalogCaptureResult.migrationReplayOperation.runtimeIdentity'
  );
  for (const [field, expectedBinding] of [
    ['migrationInputContract', migrationInputBinding],
    ['preconditionResult', preconditionBinding],
    ['dryRunResult', dryRunBinding],
  ]) {
    const operationBinding = requireRecord(
      migrationReplayOperation[field],
      `sourceReplayCatalogCaptureResult.migrationReplayOperation.${field}`
    );
    assertBindingMatch(
      operationBinding.path,
      operationBinding.sha256,
      expectedBinding,
      `sourceReplayCatalogCaptureResult.migrationReplayOperation.${field}`
    );
  }
  const replayDurationSeconds = requireNumber(
    migrationReplayOperation.durationSeconds,
    'sourceReplayCatalogCaptureResult.migrationReplayOperation.durationSeconds'
  );
  assert(
    replayDurationSeconds ===
      (Date.parse(migrationReplayOperation.completedAt) -
        Date.parse(migrationReplayOperation.startedAt)) /
        1000 &&
      replayDurationSeconds >= 0 &&
      replayDurationSeconds <= 900 &&
      migrationReplayOperation.exitCode === 0 &&
      migrationReplayOperation.appliedMigrationCount ===
        migrationInput.migrationCount &&
      migrationReplayOperation.migrationHead === migrationInput.migrationHead &&
      migrationReplayOperation.migrationSetSha256 ===
        migrationInput.migrationSetSha256 &&
      migrationReplayOperation.failedMigration === null &&
      migrationReplayOperation.lockTimeoutObserved === false &&
      migrationReplayOperation.statementTimeoutObserved === false,
    'clean migration replay apply set, duration, exit, or timeout evidence drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      migrationReplayOperation.orderedAppliedMigrations,
      'sourceReplayCatalogCaptureResult.migrationReplayOperation.orderedAppliedMigrations'
    ),
    expectedOrderedMigrations,
    'sourceReplayCatalogCaptureResult.migrationReplayOperation.orderedAppliedMigrations'
  );
  const captureCommandId = requireConcreteString(
    result.catalogCaptureCommandId,
    'sourceReplayCatalogCaptureResult.catalogCaptureCommandId'
  );
  const captureCommand = commands.find(
    command => command.id === captureCommandId
  );
  assert(
    captureCommand,
    'source replay/catalog capture command is missing from the manifest'
  );
  const captureBinding = verifyBoundArtifact(
    result.catalogCapture,
    'sourceReplayCatalogCaptureResult.catalogCapture',
    artifactHashes,
    artifactFiles
  );
  const capture = readJsonFile(
    captureBinding.absolutePath,
    'sourceReplayCatalogCaptureResult.catalogCapture'
  );
  const capturedAt = requireIsoTimestamp(
    capture.capturedAt,
    'sourceReplayCatalogCaptureResult.catalogCapture.capturedAt'
  );
  assert(
    capture.schemaVersion === 1 &&
      capture.resultType === 'POST_REPLAY_CATALOG_CAPTURE' &&
      capture.status === 'CAPTURED' &&
      capture.commandId === captureCommandId &&
      captureCommandId === 'PR12-CMD-007A' &&
      captureBinding.path === captureCommand.stdoutPath &&
      captureBinding.sha256 === captureCommand.stdoutSha256 &&
      capture.environmentProjectRef === approvedEnvironment.projectRef &&
      capture.gitCommit === packet.target.gitCommit &&
      capture.migrationHead === packet.target.migrationHead &&
      Date.parse(replayApprovedAt) <= Date.parse(captureCommand.startedAt) &&
      Date.parse(captureCommand.startedAt) <= Date.parse(capturedAt) &&
      Date.parse(capturedAt) <= Date.parse(captureCommand.endedAt) &&
      capturedAt === captureCommand.endedAt &&
      Date.parse(capturedAt) <= Date.parse(replayCompletedAt),
    'post-replay catalog capture envelope mismatch'
  );
  assertJsonEquivalent(
    capture.dataApiProvisioning,
    approvedEnvironment.dataApiProvisioning,
    'sourceReplayCatalogCaptureResult.catalogCapture.dataApiProvisioning'
  );
  assertJsonEquivalent(
    capture.graphQlProvisioning,
    approvedEnvironment.graphQlProvisioning,
    'sourceReplayCatalogCaptureResult.catalogCapture.graphQlProvisioning'
  );
  const migrationHistoryCommand = commands.find(
    command => command.id === 'PR12-CMD-008A'
  );
  assert(
    migrationHistoryCommand,
    'migration history result command is missing'
  );
  const migrationHistoryBinding = verifyBoundArtifact(
    result.migrationHistoryResult,
    'sourceReplayCatalogCaptureResult.migrationHistoryResult',
    artifactHashes,
    artifactFiles
  );
  assert(
    migrationHistoryBinding.path === migrationHistoryCommand.stdoutPath &&
      migrationHistoryBinding.sha256 === migrationHistoryCommand.stdoutSha256,
    'migration history result is not the exact PR12-CMD-008A stdout'
  );
  const migrationHistory = readJsonFile(
    migrationHistoryBinding.absolutePath,
    'sourceReplayCatalogCaptureResult.migrationHistoryResult'
  );
  assert(
    migrationHistory.schemaVersion === 1 &&
      migrationHistory.resultType === 'MIGRATION_HISTORY_PARITY' &&
      migrationHistory.status === 'PASS' &&
      migrationHistory.commandId === 'PR12-CMD-008A' &&
      migrationHistory.environmentProjectRef ===
        approvedEnvironment.projectRef &&
      migrationHistory.gitCommit === packet.target.gitCommit &&
      migrationHistory.migrationHead === packet.target.migrationHead &&
      migrationHistory.capturedAt === migrationHistoryCommand.endedAt &&
      migrationHistoryCommand.endedAt === replayCompletedAt,
    'migration history result identity or command window mismatch'
  );
  verifyRuntimeIdentityBinding(
    migrationHistory.runtimeIdentity,
    approvedEnvironment,
    'sourceReplayCatalogCaptureResult.migrationHistoryResult.runtimeIdentity'
  );
  assert(
    migrationHistory.migrationCount === migrationInput.migrationCount &&
      migrationHistory.migrationSetSha256 === migrationInput.migrationSetSha256,
    'post-apply migration history count or set hash differs from the immutable migration input'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      migrationHistory.orderedMigrations,
      'sourceReplayCatalogCaptureResult.migrationHistoryResult.orderedMigrations'
    ),
    expectedOrderedMigrations,
    'sourceReplayCatalogCaptureResult.migrationHistoryResult.orderedMigrations'
  );
  assert(
    Date.parse(preconditionCommand.endedAt) <=
      Date.parse(dryRunCommand.startedAt) &&
      Date.parse(dryRunCommand.endedAt) <=
        Date.parse(migrationReplayCommand.startedAt) &&
      Date.parse(migrationReplayCommand.endedAt) <=
        Date.parse(captureCommand.startedAt) &&
      Date.parse(captureCommand.endedAt) <=
        Date.parse(migrationHistoryCommand.startedAt),
    'source replay precondition, dry-run, apply, catalog, and history chronology mismatch'
  );
  const cleanReplay = requireRecord(manifest.cleanReplay, 'cleanReplay');
  assert(cleanReplay.status === 'PASS', 'cleanReplay.status must be PASS');
  for (const [field, expectedBinding] of [
    ['precondition', preconditionBinding],
    ['dryRun', dryRunBinding],
    ['apply', migrationReplayBinding],
    ['postApplyMigrationHistory', migrationHistoryBinding],
  ]) {
    const manifestBinding = requireRecord(
      cleanReplay[field],
      `cleanReplay.${field}`
    );
    assertBindingMatch(
      manifestBinding.path,
      manifestBinding.sha256,
      expectedBinding,
      `cleanReplay.${field}`
    );
  }
  const integrityResults = requireRecord(
    manifest.integrityResults,
    'integrityResults'
  );
  const manifestHistoryBinding = requireRecord(
    integrityResults.migrationHistory,
    'integrityResults.migrationHistory'
  );
  assertBindingMatch(
    manifestHistoryBinding.path,
    manifestHistoryBinding.sha256,
    migrationHistoryBinding,
    'integrityResults.migrationHistory'
  );
  const securityTargetCatalog = verifyBoundArtifact(
    capture.securityTargetCatalog,
    'sourceReplayCatalogCaptureResult.catalogCapture.securityTargetCatalog',
    artifactHashes,
    artifactFiles
  );
  const dataApiAclCatalog = verifyBoundArtifact(
    capture.dataApiAclCatalog,
    'sourceReplayCatalogCaptureResult.catalogCapture.dataApiAclCatalog',
    artifactHashes,
    artifactFiles
  );
  return {
    replayApprovedAt,
    replayExpiresAt,
    replayCompletedAt,
    approvedCommandIds,
    replayPhaseCommandLedger,
    securityTargetCatalog,
    dataApiAclCatalog,
  };
}

function verifyApprovalBinding(manifest, artifactHashes, artifactFiles) {
  const source = requireRecord(manifest.source, 'source');
  const approvalArtifact = verifyBoundArtifact(
    { path: source.approvalPacketPath, sha256: source.approvalPacketSha256 },
    'source.approvalPacket',
    artifactHashes,
    artifactFiles
  );
  const packet = readJsonFile(approvalArtifact.absolutePath, 'approvalPacket');
  assert(packet.schemaVersion === 1, 'approval packet schemaVersion drift');
  assert(
    packet.status === 'APPROVED',
    'approval packet status must be APPROVED'
  );
  const authorization = requireRecord(
    packet.authorization,
    'approvalPacket.authorization'
  );
  assertExactRecordKeys(
    authorization,
    [
      'sourceProjectProvisioningAuthorized',
      'isolatedStagingConnectionAuthorized',
      'isolatedStagingExecutionAuthorized',
      'restoreProjectCreationAuthorized',
      'restoreProjectConnectionAuthorized',
      'postRestoreValidationAuthorized',
      'readyTransitionAuthorized',
      'mergeAuthorized',
      'productionConnectionAuthorized',
      'commercialReleaseAuthorized',
      'indexRetirementAuthorized',
    ],
    'approvalPacket.authorization'
  );
  assert(
    authorization.isolatedStagingConnectionAuthorized === true &&
      authorization.isolatedStagingExecutionAuthorized === true,
    'approval packet does not authorize isolated staging execution'
  );
  for (const field of [
    'sourceProjectProvisioningAuthorized',
    'restoreProjectCreationAuthorized',
    'restoreProjectConnectionAuthorized',
    'postRestoreValidationAuthorized',
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'productionConnectionAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ]) {
    assert(
      authorization[field] === false,
      `approvalPacket.authorization.${field} must be false`
    );
  }

  const target = requireRecord(packet.target, 'approvalPacket.target');
  const gitHead = currentGitHead();
  assert(
    source.gitCommit === gitHead,
    'source.gitCommit does not match current Git HEAD'
  );
  assert(
    target.gitCommit === source.gitCommit,
    'approval target gitCommit mismatch'
  );
  assert(
    target.baseCommit === source.baseCommit,
    'approval target baseCommit mismatch'
  );
  assert(
    target.migrationHead === source.migrationHead,
    'approval target migrationHead mismatch'
  );
  const migrationInputBinding = verifyBoundArtifact(
    target.migrationInputContract,
    'approvalPacket.target.migrationInputContract',
    artifactHashes,
    artifactFiles
  );
  assert(
    migrationInputBinding.sha256 ===
      sha256File(
        path.join(
          REPO_ROOT,
          'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json'
        )
      ),
    'approval target migration input contract repository drift'
  );

  verifyCanonicalGovernanceProposal(
    packet.governanceProposal,
    'approvalPacket.governanceProposal',
    artifactHashes,
    artifactFiles
  );

  const environment = requireRecord(manifest.environment, 'environment');
  const approvedEnvironment = requireRecord(
    packet.environment,
    'approvalPacket.environment'
  );
  for (const field of [
    'organizationId',
    'organizationPlan',
    'projectRef',
    'projectName',
    'projectUrl',
    'databaseHost',
    'databaseConnectionMode',
    'databaseUser',
    'region',
    'databaseTier',
    'databaseVersion',
    'systemIdentifier',
  ]) {
    assert(
      approvedEnvironment[field] === environment[field],
      `environment.${field} approval mismatch`
    );
  }
  const approvedProjectRef = requireNonProductionProjectRef(
    approvedEnvironment.projectRef,
    'approvalPacket.environment.projectRef'
  );
  assert(
    approvedProjectRef === environment.projectRef,
    'environment.projectRef approval mismatch'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      approvedEnvironment.prohibitedProjectRefs,
      'approvalPacket.environment.prohibitedProjectRefs'
    ),
    PROHIBITED_PROJECT_REFS,
    'approvalPacket.environment.prohibitedProjectRefs'
  );
  assert(
    approvedEnvironment.organizationPlan === 'PRO' &&
      approvedEnvironment.projectName ===
        'seikotsuin-pr12-isolated-qualification-20260719' &&
      approvedEnvironment.region === 'ap-northeast-1' &&
      approvedEnvironment.databaseTier === 'LARGE',
    'approval source environment does not match the fixed Pro/Tokyo/Large proposal'
  );
  verifyDirectDatabaseIdentity(
    approvedEnvironment,
    'approvalPacket.environment'
  );
  const dataApiProvisioning = requireRecord(
    approvedEnvironment.dataApiProvisioning,
    'approvalPacket.environment.dataApiProvisioning'
  );
  assert(
    dataApiProvisioning.enabled === true &&
      dataApiProvisioning.automaticallyExposeNewTablesAndFunctions === false,
    'approval source Data API provisioning boundary drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      dataApiProvisioning.exposedSchemas,
      'approvalPacket.environment.dataApiProvisioning.exposedSchemas'
    ),
    ['public'],
    'approvalPacket.environment.dataApiProvisioning.exposedSchemas'
  );
  const graphQlProvisioning = requireRecord(
    approvedEnvironment.graphQlProvisioning,
    'approvalPacket.environment.graphQlProvisioning'
  );
  assert(
    graphQlProvisioning.pgGraphqlEnabled === false &&
      graphQlProvisioning.introspectionEnabled === false,
    'approval source GraphQL provisioning boundary drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      graphQlProvisioning.exposedSchemas,
      'approvalPacket.environment.graphQlProvisioning.exposedSchemas',
      { allowEmpty: true }
    ),
    [],
    'approvalPacket.environment.graphQlProvisioning.exposedSchemas'
  );
  verifyAuthProvisioning(
    approvedEnvironment.authProvisioning,
    'approvalPacket.environment.authProvisioning'
  );
  assert(
    JSON.stringify(approvedEnvironment.authProvisioning) ===
      JSON.stringify(environment.authProvisioning),
    'environment.authProvisioning approval mismatch'
  );
  const provisioningWindow = verifySourceProvisioningApproval(
    packet,
    approvedEnvironment,
    artifactHashes,
    artifactFiles
  );
  const bootstrapWindow = verifySourceIdentityBootstrap(
    manifest,
    packet,
    approvedEnvironment,
    provisioningWindow,
    artifactHashes,
    artifactFiles
  );
  const replayWindow = verifySourceReplayCatalogCapture(
    manifest,
    packet,
    approvedEnvironment,
    provisioningWindow,
    bootstrapWindow,
    artifactHashes,
    artifactFiles
  );

  const lifecycle = requireRecord(packet.lifecycle, 'approvalPacket.lifecycle');
  assert(
    lifecycle.sourceMaximumHoursFromCreation === 72 &&
      lifecycle.restoreMaximumHoursFromCreation === 24 &&
      lifecycle.automaticDeletionAuthorized === false &&
      lifecycle.deletionRequiresSeparateApproval === true &&
      lifecycle.billingExtensionAfterDeadlineRequiresSeparateFundedApproval ===
        true &&
      lifecycle.cleanupDisposition ===
        'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION' &&
      lifecycle.fundingCeilingUsd === 50,
    'approval lifecycle does not match the reviewed 72h/24h funded boundary'
  );
  const sourceProvisionedAt = requireIsoTimestamp(
    lifecycle.sourceProvisionedAt,
    'approvalPacket.lifecycle.sourceProvisionedAt'
  );
  const sourceCreatedAt = requireIsoTimestamp(
    lifecycle.sourceCreatedAt,
    'approvalPacket.lifecycle.sourceCreatedAt'
  );
  const sourceRetentionDeadline = requireIsoTimestamp(
    lifecycle.sourceRetentionDeadline,
    'approvalPacket.lifecycle.sourceRetentionDeadline'
  );
  const fundedThrough = requireIsoTimestamp(
    lifecycle.fundedThrough,
    'approvalPacket.lifecycle.fundedThrough',
    { future: true }
  );
  const createdMs = Date.parse(sourceCreatedAt);
  const deadlineMs = Date.parse(sourceRetentionDeadline);
  assert(
    sourceCreatedAt === provisioningWindow.sourceCreatedAt &&
      sourceProvisionedAt === provisioningWindow.sourceProvisionedAt &&
      createdMs <= Date.parse(sourceProvisionedAt) &&
      deadlineMs > createdMs &&
      deadlineMs - createdMs <= 72 * 60 * 60 * 1000,
    'approval source retention deadline exceeds 72 hours from provider creation'
  );
  assert(
    Date.parse(fundedThrough) >= deadlineMs,
    'approval funding does not cover the source retention deadline'
  );
  const cost = requireRecord(packet.cost, 'approvalPacket.cost');
  assert(
    cost.computeRateUsdPerProjectHour === 0.1517 &&
      cost.computeSubtotalUsd === 14.5632 &&
      cost.proposedBudgetCeilingUsd === 50 &&
      cost.ceilingEnforceableWithoutCleanupApproval === false,
    'approval cost boundary drift'
  );
  const actualDashboardQuoteUsd = requireNumber(
    cost.actualDashboardQuoteUsd,
    'approvalPacket.cost.actualDashboardQuoteUsd'
  );
  assert(
    actualDashboardQuoteUsd <= cost.proposedBudgetCeilingUsd,
    'approval actual Dashboard quote exceeds the proposed budget ceiling'
  );
  const decisions = requireRecord(
    packet.ownerDecisions,
    'approvalPacket.ownerDecisions'
  );
  assert(
    decisions.smallFlowSecurityDatasetAcceptedAsCapacityRepresentative ===
      false &&
      decisions.smallFlowSecurityDatasetAcceptedForFlowAndSecurityOnly === true,
    'owner must explicitly accept the small dataset for flow/security qualification'
  );
  assert(
    decisions.actualDashboardQuoteAccepted === true &&
      decisions.fundedRetentionAndCleanupDecisionAccepted === true &&
      decisions.productionTierParityAccepted === true &&
      decisions.rto8hRpo24hAcceptedDespiteProduct30m15mTarget === true,
    'owner must accept the actual quote and funded retention/cleanup decision'
  );
  const upstashDisposition = requireConcreteString(
    decisions.upstashDisposition,
    'approvalPacket.ownerDecisions.upstashDisposition'
  );
  assert(
    ['DISABLED', 'ISOLATED_PR12_NAMESPACE'].includes(upstashDisposition),
    'approvalPacket.ownerDecisions.upstashDisposition is unsafe'
  );

  const bindings = requireRecord(packet.bindings, 'approvalPacket.bindings');
  const approvedBindings = new Map();
  for (const name of [
    'securityMatrix',
    'securityTargetInventory',
    'securityTargetClassification',
    'dataApiMatrix',
    'graphQlMatrix',
    'performanceContract',
    'hostedSloContract',
    'representativeDataContract',
    'commandLedger',
    'drContract',
    'integrationContract',
    'credentialContract',
    'commGateEvidenceMap',
  ]) {
    approvedBindings.set(
      name,
      verifyBoundArtifact(
        bindings[name],
        `approvalPacket.bindings.${name}`,
        artifactHashes,
        artifactFiles
      )
    );
  }
  const approvedSecurityContractBinding = requireRecord(
    approvedBindings.get('securityMatrix'),
    'approvalPacket.bindings.securityMatrix'
  );
  const approvedSecurityContract = readJsonFile(
    approvedSecurityContractBinding.absolutePath,
    'approvalPacket.bindings.securityMatrix'
  );
  const approvedTargetInventoryBinding = requireRecord(
    approvedBindings.get('securityTargetInventory'),
    'approvalPacket.bindings.securityTargetInventory'
  );
  assertBindingMatch(
    requireRecord(
      approvedSecurityContract.targetInventory,
      'approval security target inventory'
    ).path,
    requireRecord(
      approvedSecurityContract.targetInventory,
      'approval security target inventory'
    ).sha256,
    approvedTargetInventoryBinding,
    'approval security target inventory'
  );
  const approvedTargetInventory = readJsonFile(
    approvedTargetInventoryBinding.absolutePath,
    'approvalPacket.bindings.securityTargetInventory'
  );
  const approvedTargetClassificationBinding = requireRecord(
    approvedBindings.get('securityTargetClassification'),
    'approvalPacket.bindings.securityTargetClassification'
  );
  const classificationBinding = requireRecord(
    approvedTargetInventory.classificationContract,
    'approval security target classification'
  );
  assertBindingMatch(
    classificationBinding.path,
    classificationBinding.sha256,
    approvedTargetClassificationBinding,
    'approval security target classification'
  );
  assertBindingMatch(
    requireRecord(
      approvedTargetInventory.sourceCatalog,
      'approval security target inventory source catalog'
    ).path,
    requireRecord(
      approvedTargetInventory.sourceCatalog,
      'approval security target inventory source catalog'
    ).sha256,
    replayWindow.securityTargetCatalog,
    'approval security target inventory source catalog'
  );
  const approvedDataApiContractBinding = requireRecord(
    approvedBindings.get('dataApiMatrix'),
    'approvalPacket.bindings.dataApiMatrix'
  );
  const approvedDataApiContract = readJsonFile(
    approvedDataApiContractBinding.absolutePath,
    'approvalPacket.bindings.dataApiMatrix'
  );
  const approvedAclInventory = requireRecord(
    approvedDataApiContract.aclInventory,
    'approvalPacket.bindings.dataApiMatrix.aclInventory'
  );
  assertBindingMatch(
    requireRecord(
      approvedAclInventory.sourceCatalog,
      'approval Data API ACL inventory source catalog'
    ).path,
    requireRecord(
      approvedAclInventory.sourceCatalog,
      'approval Data API ACL inventory source catalog'
    ).sha256,
    replayWindow.dataApiAclCatalog,
    'approval Data API ACL inventory source catalog'
  );

  const security = requireRecord(manifest.securityMatrix, 'securityMatrix');
  const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
  const graphQl = requireRecord(environment.graphQl, 'environment.graphQl');
  const performance = requireRecord(manifest.performance, 'performance');
  const hostedSlo = requireRecord(
    performance.hostedSlo,
    'performance.hostedSlo'
  );
  const representativeData = requireRecord(
    manifest.representativeData,
    'representativeData'
  );
  for (const [actual, approvedName, context] of [
    [security, 'securityMatrix', 'securityMatrix.contract'],
    [
      {
        contractPath: dataApi.matrixPath,
        contractSha256: dataApi.matrixSha256,
      },
      'dataApiMatrix',
      'environment.dataApi.matrix',
    ],
    [
      {
        contractPath: graphQl.matrixPath,
        contractSha256: graphQl.matrixSha256,
      },
      'graphQlMatrix',
      'environment.graphQl.matrix',
    ],
    [performance, 'performanceContract', 'performance.contract'],
    [hostedSlo, 'hostedSloContract', 'performance.hostedSlo.contract'],
    [
      representativeData,
      'representativeDataContract',
      'representativeData.contract',
    ],
  ]) {
    assertBindingMatch(
      actual.contractPath,
      actual.contractSha256,
      approvedBindings.get(approvedName),
      context
    );
  }

  const approval = requireRecord(packet.approval, 'approvalPacket.approval');
  const approvedAt = requireIsoTimestamp(
    approval.approvedAt,
    'approvalPacket.approval.approvedAt',
    { notFuture: true }
  );
  const expiresAt = requireIsoTimestamp(
    approval.expiresAt,
    'approvalPacket.approval.expiresAt',
    { future: true }
  );
  assert(
    Date.parse(approvedAt) < Date.parse(expiresAt),
    'approval expiry must follow approval'
  );
  assert(
    Date.parse(approvedAt) >=
      Date.parse(provisioningWindow.sourceProvisionedAt) &&
      Date.parse(approvedAt) >= Date.parse(replayWindow.replayCompletedAt),
    'source execution approval precedes provisioning or replay/catalog capture completion'
  );
  assert(
    manifest.expiresAt === expiresAt,
    'manifest expiry does not match approval'
  );
  const approvalEvidencePath = requireConcreteString(
    approval.evidencePath,
    'approvalPacket.approval.evidencePath'
  ).replaceAll('\\', '/');
  const approvalEvidenceSha = requireSha256(
    approval.evidenceSha256,
    'approvalPacket.approval.evidenceSha256'
  );
  assert(
    artifactHashes.get(approvalEvidencePath) === approvalEvidenceSha,
    'approval evidence is not a matching hashed artifact'
  );

  const ownership = requireRecord(manifest.ownership, 'ownership');
  const owners = requireRecord(packet.owners, 'approvalPacket.owners');
  verifyOwnerSeparation(approval, owners, 'approvalPacket');
  for (const field of REQUIRED_OWNER_FIELDS) {
    assert(
      owners[field] === ownership[field],
      `ownership.${field} approval mismatch`
    );
  }
  assert(
    approval.approvedBy === ownership.approver,
    'ownership.approver approval mismatch'
  );
  assert(
    lifecycle.cleanupOwner === owners.cleanupOwner,
    'approval lifecycle cleanup owner mismatch'
  );

  verifyApprovedToolVersions(manifest, packet, artifactFiles);
  const commandApproval = verifyCommandLedger(
    manifest,
    approvedBindings.get('commandLedger'),
    approvedEnvironment
  );
  return {
    bindings: approvedBindings,
    approvedAt,
    expiresAt,
    commandApproval,
    approvedEnvironment,
    sourceRetentionDeadline,
    ...bootstrapWindow,
    ...replayWindow,
  };
}

function verifyExecutionTiming(manifest, approvalWindow) {
  const timing = requireRecord(manifest.timing, 'timing');
  const startedAt = requireIsoTimestamp(timing.startedAt, 'timing.startedAt');
  const endedAt = requireIsoTimestamp(timing.endedAt, 'timing.endedAt', {
    notFuture: true,
  });
  const approvedAtMs = Date.parse(approvalWindow.approvedAt);
  const expiresAtMs = Date.parse(approvalWindow.expiresAt);
  const replayApprovedAtMs = Date.parse(approvalWindow.replayApprovedAt);
  const replayExpiresAtMs = Date.parse(approvalWindow.replayExpiresAt);
  const replayCompletedAtMs = Date.parse(approvalWindow.replayCompletedAt);
  const replayCommandIds = new Set(approvalWindow.approvedCommandIds);
  const bootstrapApprovedAtMs = Date.parse(approvalWindow.bootstrapApprovedAt);
  const bootstrapExpiresAtMs = Date.parse(approvalWindow.bootstrapExpiresAt);
  const bootstrapCapturedAtMs = Date.parse(approvalWindow.bootstrapCapturedAt);
  const bootstrapCommandIds = new Set(approvalWindow.bootstrapCommandIds);
  const startedAtMs = Date.parse(startedAt);
  const endedAtMs = Date.parse(endedAt);
  assert(
    bootstrapApprovedAtMs <= startedAtMs,
    'timing.startedAt precedes source identity bootstrap approval'
  );
  assert(startedAtMs <= endedAtMs, 'timing ended before it started');
  assert(
    endedAtMs <= expiresAtMs,
    'timing.endedAt exceeds approvalPacket.approval.expiresAt'
  );
  assert(
    endedAtMs <= Date.parse(approvalWindow.sourceRetentionDeadline),
    'timing.endedAt exceeds the approved source retention deadline'
  );
  assert(
    requireNumber(timing.durationSeconds, 'timing.durationSeconds') ===
      (endedAtMs - startedAtMs) / 1000,
    'timing.durationSeconds does not match startedAt and endedAt'
  );

  const commands = requireArray(manifest.commands, 'commands');
  const seenBootstrapCommandIds = new Set();
  const seenReplayCommandIds = new Set();
  let previousCommandEndedAtMs = startedAtMs;
  for (const [index, value] of commands.entries()) {
    const context = `commands[${String(index)}]`;
    const command = requireRecord(value, context);
    const commandStartedAt = requireIsoTimestamp(
      command.startedAt,
      `${context}.startedAt`
    );
    const commandEndedAt = requireIsoTimestamp(
      command.endedAt,
      `${context}.endedAt`
    );
    const commandStartedAtMs = Date.parse(commandStartedAt);
    const commandEndedAtMs = Date.parse(commandEndedAt);
    const bootstrapCommand = bootstrapCommandIds.has(command.id);
    const replayCommand = replayCommandIds.has(command.id);
    if (bootstrapCommand) {
      seenBootstrapCommandIds.add(command.id);
      assert(
        bootstrapApprovedAtMs <= commandStartedAtMs &&
          commandEndedAtMs <= bootstrapExpiresAtMs &&
          commandEndedAtMs <= bootstrapCapturedAtMs,
        `${context} is outside the source identity bootstrap approval window`
      );
      assert(
        [
          'offline_evidence',
          'approval_freeze',
          'tool_freeze',
          'offline_freeze',
          'source_identity_bootstrap',
        ].includes(command.phase),
        `${context}.phase exceeds source identity bootstrap authority`
      );
    } else if (replayCommand) {
      seenReplayCommandIds.add(command.id);
      assert(
        replayApprovedAtMs <= commandStartedAtMs &&
          commandEndedAtMs <= replayExpiresAtMs &&
          commandEndedAtMs <= replayCompletedAtMs,
        `${context} is outside the source replay/catalog capture approval window`
      );
      assert(
        [
          'offline_evidence',
          'approval_freeze',
          'tool_freeze',
          'offline_freeze',
          'staging_identity',
          'staging_preflight',
          'advisor_before',
          'migration_replay',
          'post_replay_catalog_capture',
        ].includes(command.phase),
        `${context}.phase exceeds source replay/catalog capture authority`
      );
    } else {
      assert(
        approvedAtMs <= commandStartedAtMs,
        `${context}.startedAt precedes source qualification approval`
      );
    }
    assert(
      startedAtMs <= commandStartedAtMs,
      `${context}.startedAt precedes manifest timing`
    );
    assert(
      previousCommandEndedAtMs <= commandStartedAtMs,
      `${context}.startedAt precedes previous command end`
    );
    assert(
      commandStartedAtMs <= commandEndedAtMs,
      `${context} ended before it started`
    );
    assert(
      commandEndedAtMs <= endedAtMs,
      `${context}.endedAt exceeds manifest timing`
    );
    assert(
      commandEndedAtMs <= expiresAtMs,
      `${context}.endedAt exceeds approval expiry`
    );
    previousCommandEndedAtMs = commandEndedAtMs;
  }
  assertExactStringArray(
    [...seenBootstrapCommandIds],
    [...bootstrapCommandIds],
    'source identity bootstrap command execution inventory'
  );
  assertExactStringArray(
    [...seenReplayCommandIds],
    [...replayCommandIds],
    'source replay/catalog capture command execution inventory'
  );
  return { startedAt, endedAt };
}

function verifyCredentialHandling(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  approvedCredentialContract,
  approvalWindow
) {
  const credential = requireRecord(
    manifest.credentialHandling,
    'credentialHandling'
  );
  assertBindingMatch(
    credential.contractPath,
    credential.contractSha256,
    approvedCredentialContract,
    'credentialHandling.contract'
  );
  const binding = verifyBoundArtifact(
    {
      path: credential.contractPath,
      sha256: credential.contractSha256,
    },
    'credentialHandling.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    binding.absolutePath,
    'credentialHandling.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'credentialHandling contract schemaVersion drift'
  );
  for (const field of ['channel', 'storage', 'retrieval', 'logging']) {
    const observed = requireConcreteString(
      credential[field],
      `credentialHandling.${field}`
    );
    const approved = requireConcreteString(
      contract[field],
      `credentialHandling.contract.${field}`
    );
    assert(
      observed === approved,
      `credentialHandling.${field} approval mismatch`
    );
  }
  for (const [field, requiredValue] of [
    ['channel', 'process_environment'],
    ['storage', 'owner_approved_server_secret_store'],
    ['retrieval', 'ephemeral_server_subprocess_injection'],
    ['logging', 'redacted_variable_names_only'],
  ]) {
    assert(
      credential[field] === requiredValue,
      `credentialHandling.${field} violates the server-only credential boundary`
    );
  }
  for (const field of [
    'serverOnly',
    'browserExposureAllowed',
    'commandLineExposureAllowed',
    'evidenceExposureAllowed',
    'clientResponseExposureAllowed',
    'logExposureAllowed',
    'sourceControlExposureAllowed',
    'urlExposureAllowed',
  ]) {
    assert(
      typeof credential[field] === 'boolean' &&
        credential[field] === contract[field],
      `credentialHandling.${field} approval mismatch`
    );
  }
  assert(
    credential.serverOnly === true,
    'credentialHandling.serverOnly must be true'
  );
  for (const field of [
    'browserExposureAllowed',
    'commandLineExposureAllowed',
    'evidenceExposureAllowed',
    'clientResponseExposureAllowed',
    'logExposureAllowed',
    'sourceControlExposureAllowed',
    'urlExposureAllowed',
  ]) {
    assert(
      credential[field] === false,
      `credentialHandling.${field} must be false`
    );
  }
  const channels = requireRecord(
    contract.credentialChannels,
    'credentialHandling.contract.credentialChannels'
  );
  assertExactRecordKeys(
    channels,
    ['sharedProvider', 'source', 'restore', 'commonIsolationRules'],
    'credentialHandling.contract.credentialChannels'
  );
  const sharedChannel = requireRecord(
    channels.sharedProvider,
    'credentialHandling.contract.credentialChannels.sharedProvider'
  );
  const approvedSecretStoreProvider = requireConcreteString(
    sharedChannel.provider,
    'credentialHandling.contract.credentialChannels.sharedProvider.provider'
  );
  assert(
    contract.storageProvider === approvedSecretStoreProvider,
    'credentialHandling contract storage provider approval mismatch'
  );
  assert(
    sharedChannel.approvedProviderRequired === true &&
      sharedChannel.channel === 'process_environment' &&
      sharedChannel.retrieval === 'ephemeral_server_subprocess_injection' &&
      sharedChannel.persistence === 'process_lifetime_only' &&
      sharedChannel.logging === 'redacted_variable_names_only',
    'credentialHandling shared provider channel drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      sharedChannel.requiredParentEnvironmentNames,
      'credentialHandling.contract.credentialChannels.sharedProvider.requiredParentEnvironmentNames'
    ),
    SHARED_CREDENTIAL_PARENT_NAMES,
    'credentialHandling.contract.credentialChannels.sharedProvider.requiredParentEnvironmentNames'
  );
  const sharedMappings = requireRecord(
    sharedChannel.childProcessMappings,
    'credentialHandling.contract.credentialChannels.sharedProvider.childProcessMappings'
  );
  assertExactRecordKeys(
    sharedMappings,
    Object.keys(SHARED_CHILD_PROCESS_MAPPINGS),
    'credentialHandling.contract.credentialChannels.sharedProvider.childProcessMappings'
  );
  for (const [childName, parentName] of Object.entries(sharedMappings)) {
    assert(
      SHARED_CHILD_PROCESS_MAPPINGS[childName] === parentName,
      `credentialHandling shared mapping ${childName} drift`
    );
  }
  const targetChannels = new Map();
  for (const [channelName, targetKind] of [
    ['source', 'SOURCE'],
    ['restore', 'RESTORE'],
  ]) {
    const targetChannel = requireRecord(
      channels[channelName],
      `credentialHandling.contract.credentialChannels.${channelName}`
    );
    assert(
      targetChannel.targetKind === targetKind,
      `credentialHandling ${channelName} target kind drift`
    );
    const requiredParentNames = requireConcreteStringArray(
      targetChannel.requiredParentEnvironmentNames,
      `credentialHandling.contract.credentialChannels.${channelName}.requiredParentEnvironmentNames`
    );
    const optionalParentNames = requireConcreteStringArray(
      targetChannel.optionalSandboxParentEnvironmentNames,
      `credentialHandling.contract.credentialChannels.${channelName}.optionalSandboxParentEnvironmentNames`,
      { allowEmpty: true }
    );
    assertExactStringArray(
      requiredParentNames,
      TARGET_CREDENTIAL_PARENT_NAMES[targetKind],
      `credentialHandling.contract.credentialChannels.${channelName}.requiredParentEnvironmentNames`
    );
    assertExactStringArray(
      optionalParentNames,
      TARGET_OPTIONAL_CREDENTIAL_PARENT_NAMES[targetKind],
      `credentialHandling.contract.credentialChannels.${channelName}.optionalSandboxParentEnvironmentNames`
    );
    const mappings = requireRecord(
      targetChannel.childProcessMappings,
      `credentialHandling.contract.credentialChannels.${channelName}.childProcessMappings`
    );
    assertExactRecordKeys(
      mappings,
      Object.keys(TARGET_CHILD_PROCESS_MAPPINGS[targetKind]),
      `credentialHandling.contract.credentialChannels.${channelName}.childProcessMappings`
    );
    const approvedParentNames = [
      ...requiredParentNames,
      ...optionalParentNames,
    ];
    for (const [childName, parentName] of Object.entries(mappings)) {
      assert(
        typeof parentName === 'string' &&
          approvedParentNames.includes(parentName) &&
          TARGET_CHILD_PROCESS_MAPPINGS[targetKind][childName] === parentName,
        `credentialHandling ${channelName} mapping ${childName} drift`
      );
    }
    targetChannels.set(targetKind, targetChannel);
  }
  const sourceParentNames = new Set([
    ...TARGET_CREDENTIAL_PARENT_NAMES.SOURCE,
    ...TARGET_OPTIONAL_CREDENTIAL_PARENT_NAMES.SOURCE,
  ]);
  assert(
    [...TARGET_CREDENTIAL_PARENT_NAMES.RESTORE].every(
      parentName => !sourceParentNames.has(parentName)
    ),
    'credentialHandling source and restore parent environment names overlap'
  );
  const isolationRules = requireRecord(
    channels.commonIsolationRules,
    'credentialHandling.contract.credentialChannels.commonIsolationRules'
  );
  assert(
    isolationRules.inheritParentEnvironment === false &&
      isolationRules.ambientGenericFallbackAllowed === false &&
      isolationRules.unsetEveryGenericChildBeforeMapping === true &&
      isolationRules.serviceRoleServerOnly === true &&
      isolationRules.hostedJwtSigningSecretAcquisitionAllowed === false &&
      isolationRules.userMetadataAuthorizationAllowed === false &&
      isolationRules.committedFixturePasswordsAllowedOnHosted === false,
    'credentialHandling contract target isolation invariant drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      isolationRules.forbiddenLocations,
      'credentialHandling.contract.credentialChannels.commonIsolationRules.forbiddenLocations'
    ),
    FORBIDDEN_CREDENTIAL_LOCATIONS,
    'credentialHandling.contract.credentialChannels.commonIsolationRules.forbiddenLocations'
  );
  const passwordRules = requireRecord(
    isolationRules.ephemeralFixturePasswordRequirements,
    'credentialHandling.contract.credentialChannels.commonIsolationRules.ephemeralFixturePasswordRequirements'
  );
  assert(
    passwordRules.minimumLength >= 32 &&
      passwordRules.uniquePerActor === true &&
      passwordRules.generatedByOwnerApprovedSecretStore === true &&
      passwordRules.valueMayBePersistedOrCaptured === false &&
      passwordRules.fixedActorIdsAndRolesMustRemainUnchanged === true &&
      passwordRules.passwordMapKeySetMustEqualApprovedActorSet === true &&
      passwordRules.unknownOrMissingActorAliasAllowed === false &&
      passwordRules.passwordMapValueEvidenceAllowed === false,
    'credentialHandling ephemeral hosted password invariant drift'
  );
  const targetBindingRules = requireRecord(
    contract.targetBindingRules,
    'credentialHandling.contract.targetBindingRules'
  );
  assert(
    targetBindingRules.providerConfigurationResultType ===
      'TARGET_CREDENTIAL_PROVIDER_CONFIGURATION' &&
      targetBindingRules.keyPresenceCollectorId ===
        'PR12-TARGET-CREDENTIAL-PRESENCE-V1' &&
      targetBindingRules.targetSpecificKeyPresenceMustBeCollectorDerived ===
        true &&
      targetBindingRules.fingerprintsMustBeComputedFromTheSameRuntimeValues ===
        true &&
      targetBindingRules.emptyCredentialFingerprintAllowed === false &&
      targetBindingRules.sourceAndRestoreProviderConfigurationsMustBeSeparatelyHashBound ===
        true &&
      targetBindingRules.exactProjectRefUrlAndDatabaseHostMatchRequired ===
        true &&
      targetBindingRules.nonSecretHandleFingerprintsRequired === true &&
      targetBindingRules.sourceAndRestoreProjectRefsMustDiffer === true &&
      targetBindingRules.sourceAndRestoreDatabaseHostsMustDiffer === true &&
      targetBindingRules.sourceAndRestoreAnonKeyFingerprintsMustDiffer ===
        true &&
      targetBindingRules.sourceAndRestoreServiceRoleKeyFingerprintsMustDiffer ===
        true &&
      targetBindingRules.crossTargetCredentialFallbackAllowed === false &&
      targetBindingRules.abortBeforeRemoteCommandOnMismatch === true,
    'credentialHandling target binding rules drift'
  );
  const targetResults = requireRecord(
    credential.targetResults,
    'credentialHandling.targetResults'
  );
  const sourceEnvironment = requireRecord(manifest.environment, 'environment');
  const restoreEnvironment = requireRecord(
    requireRecord(manifest.restore, 'restore').targetEnvironment,
    'restore.targetEnvironment'
  );
  const targetConfigurations = new Map();
  for (const [resultName, targetKind, expectedEnvironment, expectedPrefix] of [
    ['source', 'SOURCE', sourceEnvironment, 'PR12_SOURCE_'],
    ['restore', 'RESTORE', restoreEnvironment, 'PR12_RESTORE_'],
  ]) {
    const targetResult = requireRecord(
      targetResults[resultName],
      `credentialHandling.targetResults.${resultName}`
    );
    assert(
      targetResult.status === 'PASS' && targetResult.targetKind === targetKind,
      `credentialHandling.targetResults.${resultName} identity drift`
    );
    const configurationBinding = verifyBoundArtifact(
      {
        path: targetResult.providerConfigurationPath,
        sha256: targetResult.providerConfigurationSha256,
      },
      `credentialHandling.targetResults.${resultName}.providerConfiguration`,
      artifactHashes,
      artifactFiles
    );
    const configuration = readJsonFile(
      configurationBinding.absolutePath,
      `credentialHandling.targetResults.${resultName}.providerConfiguration`
    );
    assert(
      configuration.schemaVersion === 1 &&
        configuration.resultType ===
          'TARGET_CREDENTIAL_PROVIDER_CONFIGURATION' &&
        configuration.status === 'CAPTURED' &&
        configuration.targetKind === targetKind &&
        configuration.parentEnvironmentPrefix === expectedPrefix &&
        configuration.ownerApprovedFingerprintCapture === true &&
        configuration.secretValuesCaptured === false &&
        configuration.crossTargetFallbackAllowed === false,
      `credentialHandling.targetResults.${resultName} provider configuration boundary drift`
    );
    assert(
      requireConcreteString(
        configuration.secretStoreProvider,
        `credentialHandling.targetResults.${resultName}.secretStoreProvider`
      ) === approvedSecretStoreProvider,
      `credentialHandling.targetResults.${resultName}.secretStoreProvider approval mismatch`
    );
    const identity = requireRecord(
      configuration.targetIdentity,
      `credentialHandling.targetResults.${resultName}.targetIdentity`
    );
    assert(
      identity.projectRef === expectedEnvironment.projectRef &&
        identity.projectUrl === expectedEnvironment.projectUrl &&
        identity.databaseHost === expectedEnvironment.databaseHost,
      `credentialHandling.targetResults.${resultName} target identity mismatch`
    );
    const fingerprints = requireRecord(
      configuration.nonSecretFingerprints,
      `credentialHandling.targetResults.${resultName}.nonSecretFingerprints`
    );
    assertExactRecordKeys(
      fingerprints,
      [
        'projectRefSha256',
        'projectUrlSha256',
        'databaseHostSha256',
        'anonKeySha256',
        'serviceRoleKeySha256',
        'databasePasswordHandleSha256',
        'actorPasswordMapHandleSha256',
      ],
      `credentialHandling.targetResults.${resultName}.nonSecretFingerprints`
    );
    assert(
      fingerprints.projectRefSha256 === sha256Text(identity.projectRef) &&
        fingerprints.projectUrlSha256 === sha256Text(identity.projectUrl) &&
        fingerprints.databaseHostSha256 === sha256Text(identity.databaseHost),
      `credentialHandling.targetResults.${resultName} identity fingerprint mismatch`
    );
    for (const field of [
      'anonKeySha256',
      'serviceRoleKeySha256',
      'databasePasswordHandleSha256',
      'actorPasswordMapHandleSha256',
    ]) {
      requireSha256(
        fingerprints[field],
        `credentialHandling.targetResults.${resultName}.nonSecretFingerprints.${field}`
      );
    }
    const keyPresenceCollector = requireRecord(
      configuration.keyPresenceCollector,
      `credentialHandling.targetResults.${resultName}.keyPresenceCollector`
    );
    assertExactRecordKeys(
      keyPresenceCollector,
      [
        'collectorId',
        'method',
        'status',
        'anonKeyEnvironmentVariable',
        'serviceRoleKeyEnvironmentVariable',
        'anonKeyPresent',
        'serviceRoleKeyPresent',
        'fingerprintsComputedFromSameRuntimeValues',
        'emptyStringFingerprintRejected',
        'rawValuesPersisted',
      ],
      `credentialHandling.targetResults.${resultName}.keyPresenceCollector`
    );
    const expectedAnonKeyEnvironmentVariable = `${expectedPrefix}ANON_KEY`;
    const expectedServiceRoleKeyEnvironmentVariable = `${expectedPrefix}SERVICE_ROLE_KEY`;
    assert(
      keyPresenceCollector.collectorId ===
        targetBindingRules.keyPresenceCollectorId &&
        keyPresenceCollector.method ===
          'TARGET_PREFIXED_PROCESS_ENVIRONMENT_NON_EMPTY_SHA256' &&
        keyPresenceCollector.status === 'PASS' &&
        keyPresenceCollector.anonKeyEnvironmentVariable ===
          expectedAnonKeyEnvironmentVariable &&
        keyPresenceCollector.serviceRoleKeyEnvironmentVariable ===
          expectedServiceRoleKeyEnvironmentVariable &&
        keyPresenceCollector.anonKeyPresent === true &&
        keyPresenceCollector.serviceRoleKeyPresent === true &&
        keyPresenceCollector.fingerprintsComputedFromSameRuntimeValues ===
          true &&
        keyPresenceCollector.emptyStringFingerprintRejected === true &&
        keyPresenceCollector.rawValuesPersisted === false &&
        fingerprints.anonKeySha256 !== sha256Text('') &&
        fingerprints.serviceRoleKeySha256 !== sha256Text(''),
      `credentialHandling.targetResults.${resultName} key presence was not derived from non-empty target-specific runtime values`
    );
    requireIsoTimestamp(
      configuration.capturedAt,
      `credentialHandling.targetResults.${resultName}.capturedAt`
    );
    requireConcreteString(
      configuration.capturedBy,
      `credentialHandling.targetResults.${resultName}.capturedBy`
    );
    verifyEvidenceReferences(
      targetResult.evidence,
      `credentialHandling.targetResults.${resultName}.evidence`,
      artifactPaths
    );
    targetConfigurations.set(targetKind, {
      binding: configurationBinding,
      configuration,
      identity,
      fingerprints,
      apiKeysPresent:
        keyPresenceCollector.anonKeyPresent === true &&
        keyPresenceCollector.serviceRoleKeyPresent === true,
    });
  }
  assertBindingMatch(
    targetConfigurations.get('SOURCE').binding.path,
    targetConfigurations.get('SOURCE').binding.sha256,
    approvalWindow.sourceCredentialProviderConfigurationBinding,
    'credentialHandling source provider configuration approval'
  );
  const sourceConfiguration = targetConfigurations.get('SOURCE');
  const restoreConfiguration = targetConfigurations.get('RESTORE');
  const crossTargetIsolation = requireRecord(
    credential.crossTargetIsolation,
    'credentialHandling.crossTargetIsolation'
  );
  assert(
    crossTargetIsolation.status === 'PASS' &&
      crossTargetIsolation.projectRefsDiffer === true &&
      crossTargetIsolation.databaseHostsDiffer === true &&
      crossTargetIsolation.anonKeyFingerprintsDiffer === true &&
      crossTargetIsolation.serviceRoleKeyFingerprintsDiffer === true &&
      crossTargetIsolation.databasePasswordFingerprintsDiffer === true &&
      sourceConfiguration.identity.projectRef !==
        restoreConfiguration.identity.projectRef &&
      sourceConfiguration.identity.databaseHost !==
        restoreConfiguration.identity.databaseHost &&
      sourceConfiguration.fingerprints.anonKeySha256 !==
        restoreConfiguration.fingerprints.anonKeySha256 &&
      sourceConfiguration.fingerprints.serviceRoleKeySha256 !==
        restoreConfiguration.fingerprints.serviceRoleKeySha256 &&
      sourceConfiguration.fingerprints.databasePasswordHandleSha256 !==
        restoreConfiguration.fingerprints.databasePasswordHandleSha256,
    'credentialHandling source/restore target isolation mismatch'
  );
  assert(
    credential.status === 'PASS',
    'credentialHandling.status must be PASS'
  );
  verifyEvidenceReferences(
    credential.evidence,
    'credentialHandling.evidence',
    artifactPaths
  );
  return targetConfigurations;
}

function requireRawObservationEnvelope(
  rawResult,
  context,
  expectedFamily,
  expectedTransport,
  commandWindow
) {
  assert(
    rawResult.observationSchemaVersion === 1 &&
      rawResult.observationFamily === expectedFamily &&
      rawResult.transport === expectedTransport,
    `${context} family-specific raw observation schema mismatch`
  );
  const capturedAt = requireIsoTimestamp(
    rawResult.capturedAt,
    `${context}.capturedAt`
  );
  const commandStartedAt = requireIsoTimestamp(
    commandWindow.startedAt,
    `${context}.commandWindow.startedAt`
  );
  const commandEndedAt = requireIsoTimestamp(
    commandWindow.endedAt,
    `${context}.commandWindow.endedAt`
  );
  const observations = requireArray(
    rawResult.observations,
    `${context}.observations`
  ).map((value, index) =>
    requireRecord(value, `${context}.observations[${String(index)}]`)
  );
  assert(
    observations.length > 0 &&
      rawResult.observationCount === observations.length,
    `${context}.observationCount mismatch`
  );
  const byId = new Map();
  for (const [index, observation] of observations.entries()) {
    const observationContext = `${context}.observations[${String(index)}]`;
    const observationId = requireConcreteString(
      observation.observationId,
      `${observationContext}.observationId`
    );
    assert(
      !byId.has(observationId),
      `${observationContext}.observationId is duplicated`
    );
    const observedAt = requireIsoTimestamp(
      observation.observedAt,
      `${observationContext}.observedAt`
    );
    assert(
      Date.parse(commandStartedAt) <= Date.parse(observedAt) &&
        Date.parse(observedAt) <= Date.parse(commandEndedAt) &&
        Date.parse(observedAt) <= Date.parse(capturedAt),
      `${observationContext}.observedAt is outside its dedicated command window`
    );
    byId.set(observationId, observation);
  }
  return { observations, byId };
}

function requireRawObservationForStructuredValue(
  structured,
  observationsById,
  context
) {
  const observationId = requireConcreteString(
    structured.rawObservationId,
    `${context}.rawObservationId`
  );
  const observation = observationsById.get(observationId);
  assert(
    observation,
    `${context}.rawObservationId is absent from raw evidence`
  );
  return observation;
}

function verifyIntegrityRawObservations(
  rawResult,
  result,
  context,
  commandWindow
) {
  const { observations } = requireRawObservationEnvelope(
    rawResult,
    context,
    'INTEGRITY_PARITY',
    'DIRECT_POSTGRES',
    commandWindow
  );
  assert(
    observations.length === 1,
    `${context} must contain one integrity snapshot`
  );
  const observation = observations[0];
  assert(
    observation.observationType === 'MIGRATION_SCHEMA_DATA_PARITY',
    `${context} integrity observation type mismatch`
  );
  assert(
    result.rawObservationId === observation.observationId,
    `${context} integrity rawObservationId mismatch`
  );
  assertJsonEquivalent(observation.source, result.source, `${context}.source`);
  assertJsonEquivalent(
    observation.restored,
    result.restored,
    `${context}.restored`
  );
}

function verifyTenantPositiveRawObservation(
  positiveValue,
  observationById,
  authProvenanceById,
  commandWindow,
  context
) {
  const positive = requireRecord(positiveValue, context);
  const rawObservationId = requireConcreteString(
    positive.rawObservationId,
    `${context}.rawObservationId`
  );
  const observation = requireRecord(
    observationById.get(rawObservationId),
    `${context}.rawObservation`
  );
  const authTokenUse = requireRecord(
    positive.authTokenUse,
    `${context}.authTokenUse`
  );
  const rawAuthTokenUse = requireRecord(
    observation.authTokenUse,
    `${context}.rawObservation.authTokenUse`
  );
  assertJsonEquivalent(
    rawAuthTokenUse,
    authTokenUse,
    `${context}.rawObservation.authTokenUse`
  );
  for (const field of [
    'actorId',
    'role',
    'jwtCase',
    'deniedActorId',
    'sourceTenant',
    'targetTenant',
    'target',
    'operation',
  ]) {
    assert(
      observation[field] === positive[field],
      `${context}.${field} does not reconcile with its separate positive raw observation`
    );
  }
  assert(
    observation.observationType === 'TENANT_SAME_OPERATION_POSITIVE_CONTROL' &&
      observation.status === 'PASS',
    `${context} positive raw observation type or status drift`
  );
  assertJsonEquivalent(
    observation.selector,
    positive.selector,
    `${context}.rawObservation.selector`
  );
  assertJsonEquivalent(
    observation.transaction,
    positive.transaction,
    `${context}.rawObservation.transaction`
  );
  assertJsonEquivalent(
    observation.stateResults,
    positive.stateResults,
    `${context}.rawObservation.stateResults`
  );
  const observed = requireRecord(positive.observed, `${context}.observed`);
  const http = requireRecord(
    observation.http,
    `${context}.rawObservation.http`
  );
  const sql = requireRecord(observation.sql, `${context}.rawObservation.sql`);
  const authorization = requireRecord(
    observation.authorization,
    `${context}.rawObservation.authorization`
  );
  assert(
    http.status === observed.httpStatus &&
      sql.sqlstate === observed.sqlstate &&
      sql.rowCount === observed.rowCount &&
      sql.mutationCount === observed.mutationCount &&
      sql.directAffectedRows === observed.directAffectedRows &&
      authorization.decision === observed.decision,
    `${context} positive raw HTTP/SQL/authorization observation mismatch`
  );
  assert(
    authProvenanceById instanceof Map,
    `${context} has no hosted Auth provenance lookup`
  );
  const provenance = requireRecord(
    authProvenanceById.get(authTokenUse.provenanceObservationId),
    `${context}.authTokenUse.provenanceObservation`
  );
  const observedAt = requireIsoTimestamp(
    observation.observedAt,
    `${context}.rawObservation.observedAt`
  );
  const issuedAt = requireIsoTimestamp(
    provenance.issuedAt,
    `${context}.authTokenUse.issuedAt`
  );
  const expiresAt = requireIsoTimestamp(
    provenance.expiresAt,
    `${context}.authTokenUse.expiresAt`
  );
  const transaction = requireRecord(
    positive.transaction,
    `${context}.transaction`
  );
  const rollbackCompletedAt = requireIsoTimestamp(
    transaction.rollbackCompletedAt,
    `${context}.transaction.rollbackCompletedAt`
  );
  const postRollbackCheckedAt = requireIsoTimestamp(
    transaction.postRollbackCheckedAt,
    `${context}.transaction.postRollbackCheckedAt`
  );
  assert(
    provenance.observationType === 'AUTH_TOKEN_PROVENANCE' &&
      provenance.stage === 'REFRESH' &&
      provenance.actorId === positive.actorId &&
      provenance.tokenHandleId === authTokenUse.tokenHandleId &&
      authTokenUse.actorId === positive.actorId &&
      Date.parse(issuedAt) <= Date.parse(observedAt) &&
      Date.parse(observedAt) < Date.parse(expiresAt),
    `${context} positive control is not bound to its counterpart actor's valid hosted JWT`
  );
  assert(
    Date.parse(commandWindow.startedAt) <= Date.parse(rollbackCompletedAt) &&
      Date.parse(rollbackCompletedAt) <= Date.parse(postRollbackCheckedAt) &&
      Date.parse(postRollbackCheckedAt) <= Date.parse(observedAt) &&
      Date.parse(observedAt) <= Date.parse(commandWindow.endedAt),
    `${context} positive control rollback chronology is outside its command window`
  );
  return rawObservationId;
}

function verifySecurityRawObservations(
  rawResult,
  result,
  context,
  commandWindow
) {
  const { observations, byId } = requireRawObservationEnvelope(
    rawResult,
    context,
    'SECURITY_AUTH_TENANT',
    'AUTH_HTTP_AND_DIRECT_POSTGRES',
    commandWindow
  );
  assertJsonEquivalent(
    rawResult.authProvisioning,
    result.authProvisioning,
    `${context}.authProvisioning`
  );
  const matrix = requireRecord(result.result, `${context}.structuredResult`);
  const authTokenProvenance = requireRecord(
    matrix.authTokenProvenance,
    `${context}.structuredResult.authTokenProvenance`
  );
  const rows = requireArray(
    matrix.rows,
    `${context}.structuredResult.rows`
  ).map((value, index) =>
    requireRecord(value, `${context}.structuredResult.rows[${String(index)}]`)
  );
  const tenantPositiveControlCount = rows.filter(
    row => row.tenantProbeControl !== undefined
  ).length;
  const tenantPositiveObservationIds = new Set();
  const summaryFields = ['serviceRoleBoundary', 'aclRlsIndependence'];
  const actorSessions = requireArray(
    authTokenProvenance.actorSessions,
    `${context}.structuredResult.authTokenProvenance.actorSessions`
  ).map((value, index) =>
    requireRecord(
      value,
      `${context}.structuredResult.authTokenProvenance.actorSessions[${String(index)}]`
    )
  );
  assert(
    observations.length ===
      rows.length +
        tenantPositiveControlCount +
        summaryFields.length +
        actorSessions.length * 2,
    `${context} security observation count does not cover every case, every actor's hosted Auth provenance events, and summaries`
  );
  const rawProjectRef = requireNonProductionProjectRef(
    rawResult.projectRef ?? rawResult.environmentProjectRef,
    `${context}.authTokenProvenance.projectRef`
  );
  const expectedIssuer = `https://${rawProjectRef}.supabase.co/auth/v1`;
  for (const session of actorSessions) {
    const signInObservation = requireRecord(
      byId.get(session.signInObservationId),
      `${context}.authTokenProvenance.${String(session.actorId)}.signInObservation`
    );
    const refreshObservation = requireRecord(
      byId.get(session.refreshObservationId),
      `${context}.authTokenProvenance.${String(session.actorId)}.refreshObservation`
    );
    for (const [stage, grantType, operation, observation] of [
      ['SIGN_IN', 'password', 'signInWithPassword', signInObservation],
      ['REFRESH', 'refresh_token', 'refreshSession', refreshObservation],
    ]) {
      const provenanceContext = `${context}.authTokenProvenance.${String(session.actorId)}.${stage.toLowerCase()}`;
      assert(
        observation.observationType === 'AUTH_TOKEN_PROVENANCE' &&
          observation.stage === stage &&
          observation.grantType === grantType &&
          observation.operation === operation &&
          observation.httpStatus === 200 &&
          observation.sessionReturned === true &&
          observation.issuer === expectedIssuer &&
          observation.actorSetSha256 === authTokenProvenance.actorSetSha256 &&
          observation.actorId === session.actorId &&
          observation.authUserId === session.authUserId &&
          observation.sessionId === session.sessionId &&
          observation.rawTokenMaterialCaptured === false &&
          observation.jwtSigningSecretAcquired === false &&
          observation.fabricatedUserJwtUsed === false &&
          observation.userMetadataAuthorityUsed === false &&
          observation.status === 'PASS',
        `${provenanceContext} hosted Auth provenance drift`
      );
      requireConcreteString(
        observation.tokenHandleId,
        `${provenanceContext}.tokenHandleId`
      );
      requireIsoTimestamp(
        observation.issuedAt,
        `${provenanceContext}.issuedAt`
      );
      requireIsoTimestamp(
        observation.expiresAt,
        `${provenanceContext}.expiresAt`
      );
      assert(
        Date.parse(commandWindow.startedAt) <=
          Date.parse(observation.issuedAt) &&
          Date.parse(observation.issuedAt) <
            Date.parse(observation.expiresAt) &&
          Date.parse(observation.issuedAt) <=
            Date.parse(observation.observedAt) &&
          Date.parse(observation.observedAt) <=
            Date.parse(commandWindow.endedAt),
        `${provenanceContext} token issuance or observation is outside its command window`
      );
    }
    assert(
      signInObservation.tokenHandleId === session.signInTokenHandleId &&
        signInObservation.parentTokenHandleId === null &&
        refreshObservation.tokenHandleId === session.refreshedTokenHandleId &&
        refreshObservation.parentTokenHandleId ===
          session.signInTokenHandleId &&
        Date.parse(signInObservation.issuedAt) <=
          Date.parse(refreshObservation.issuedAt) &&
        refreshObservation.accessTokenChanged === true &&
        refreshObservation.refreshTokenChanged === true &&
        signInObservation.accessTokenChanged === false &&
        signInObservation.refreshTokenChanged === false,
      `${context}.authTokenProvenance refresh chain or session continuity drift`
    );
  }
  assert(
    authTokenProvenance.acquisitionMethod ===
      HOSTED_USER_JWT_ACQUISITION_METHOD &&
      authTokenProvenance.issuer === expectedIssuer &&
      authTokenProvenance.rawTokenMaterialCaptured === false &&
      authTokenProvenance.jwtSigningSecretAcquired === false &&
      authTokenProvenance.fabricatedUserJwtUsed === false &&
      authTokenProvenance.status === 'PASS',
    `${context}.authTokenProvenance structured/raw boundary drift`
  );
  for (const [index, row] of rows.entries()) {
    const rowContext = `${context}.structuredResult.rows[${String(index)}]`;
    const observation = requireRawObservationForStructuredValue(
      row,
      byId,
      rowContext
    );
    assert(
      observation.observationType === 'SECURITY_AUTH_TENANT_CASE',
      `${rowContext} raw observation type mismatch`
    );
    for (const field of [
      'caseId',
      'role',
      'actor',
      'jwtCase',
      'caseClass',
      'sourceTenant',
      'targetTenant',
      'tenantBoundary',
      'tenantDirection',
      'target',
      'operation',
      'status',
    ]) {
      assert(
        observation[field] === row[field],
        `${rowContext}.${field} does not reconcile with raw observation`
      );
    }
    const http = requireRecord(observation.http, `${rowContext}.raw.http`);
    const sql = requireRecord(observation.sql, `${rowContext}.raw.sql`);
    const authorization = requireRecord(
      observation.authorization,
      `${rowContext}.raw.authorization`
    );
    const semantic = requireRecord(
      observation.semantic,
      `${rowContext}.raw.semantic`
    );
    assert(
      (Number.isInteger(http.status) || http.status === 'NOT_APPLICABLE') &&
        http.status === row.observedHttpStatus &&
        typeof sql.executed === 'boolean' &&
        sql.executed === (row.observedSqlstate !== 'NOT_EXECUTED') &&
        sql.sqlstate === row.observedSqlstate &&
        sql.rowCount === row.observedRowCount &&
        sql.mutationCount === row.observedMutationCount &&
        sql.directAffectedRows === row.observedDirectAffectedRows &&
        authorization.decision === row.observedDecision &&
        authorization.aclOutcome === row.observedAclOutcome &&
        authorization.rlsOutcome === row.observedRlsOutcome &&
        authorization.aclVerdict === row.aclVerdict &&
        authorization.rlsVerdict === row.rlsVerdict &&
        semantic.errorIdentity === row.observedErrorIdentity &&
        semantic.postcondition === row.observedPostcondition &&
        semantic.preservedSentinel === row.observedPreservedSentinel &&
        semantic.transactionEndCommand === row.observedTransactionEndCommand &&
        semantic.transactionEndStatus === row.observedTransactionEndStatus &&
        semantic.rollbackCompletedAt === row.observedRollbackCompletedAt &&
        semantic.postRollbackCheckedAt === row.observedPostRollbackCheckedAt,
      `${rowContext} HTTP/SQL/ACL/RLS/semantic observation mismatch`
    );
    assertJsonEquivalent(
      observation.authTokenUse,
      row.authTokenUse,
      `${rowContext}.authTokenUse`
    );
    if (row.tenantProbeControl !== undefined) {
      assertJsonEquivalent(
        observation.tenantProbeControl,
        row.tenantProbeControl,
        `${rowContext}.tenantProbeControl`
      );
      const positive = requireRecord(
        requireRecord(
          row.tenantProbeControl,
          `${rowContext}.tenantProbeControl`
        ).sameTenantPositiveControl,
        `${rowContext}.tenantProbeControl.sameTenantPositiveControl`
      );
      const positiveObservationId = verifyTenantPositiveRawObservation(
        positive,
        byId,
        byId,
        commandWindow,
        `${rowContext}.tenantProbeControl.sameTenantPositiveControl`
      );
      assert(
        positiveObservationId !== row.rawObservationId &&
          !tenantPositiveObservationIds.has(positiveObservationId),
        `${rowContext} reuses a tenant positive raw observation`
      );
      tenantPositiveObservationIds.add(positiveObservationId);
    } else {
      assert(
        observation.tenantProbeControl === undefined,
        `${rowContext}.raw.tenantProbeControl is unexpected`
      );
    }
    if (row.authorityStateControl !== undefined) {
      assertJsonEquivalent(
        observation.authorityStateControl,
        row.authorityStateControl,
        `${rowContext}.authorityStateControl`
      );
      verifyAuthorityStateControl(
        observation.authorityStateControl,
        `${rowContext}.raw.authorityStateControl`,
        row,
        observation.observedAt
      );
      const authorityControl = requireRecord(
        observation.authorityStateControl,
        `${rowContext}.raw.authorityStateControl`
      );
      const positiveControl = requireRecord(
        authorityControl.sameTenantActiveActorControl,
        `${rowContext}.raw.authorityStateControl.sameTenantActiveActorControl`
      );
      const positiveProvenance = requireRecord(
        byId.get(positiveControl.provenanceObservationId),
        `${rowContext}.raw.authorityStateControl.sameTenantActiveActorControl.provenanceObservation`
      );
      const positiveIssuedAt = requireIsoTimestamp(
        positiveProvenance.issuedAt,
        `${rowContext}.raw.authorityStateControl.sameTenantActiveActorControl.issuedAt`
      );
      const positiveExpiresAt = requireIsoTimestamp(
        positiveProvenance.expiresAt,
        `${rowContext}.raw.authorityStateControl.sameTenantActiveActorControl.expiresAt`
      );
      const positiveObservedAt = requireIsoTimestamp(
        observation.observedAt,
        `${rowContext}.raw.observedAt`
      );
      assert(
        positiveProvenance.observationType === 'AUTH_TOKEN_PROVENANCE' &&
          positiveProvenance.stage === 'SIGN_IN' &&
          positiveProvenance.actorId === positiveControl.actorId &&
          positiveProvenance.tokenHandleId === positiveControl.tokenHandleId &&
          Date.parse(positiveIssuedAt) <= Date.parse(positiveObservedAt) &&
          Date.parse(positiveObservedAt) < Date.parse(positiveExpiresAt),
        `${rowContext}.authorityStateControl active actor does not resolve to a valid hosted Auth session`
      );
    } else {
      assert(
        observation.authorityStateControl === undefined,
        `${rowContext}.raw.authorityStateControl is unexpected`
      );
    }
    const authTokenUse = requireRecord(
      row.authTokenUse,
      `${rowContext}.authTokenUse`
    );
    if (
      [
        'HOSTED_REFRESHED_SESSION',
        'HOSTED_STALE_SESSION',
        'HOSTED_EXPIRED_SESSION',
      ].includes(authTokenUse.source)
    ) {
      const provenanceObservation = requireRecord(
        byId.get(authTokenUse.provenanceObservationId),
        `${rowContext}.authTokenUse.provenanceObservation`
      );
      assert(
        provenanceObservation.observationType === 'AUTH_TOKEN_PROVENANCE' &&
          provenanceObservation.actorId === row.actor &&
          provenanceObservation.tokenHandleId === authTokenUse.tokenHandleId,
        `${rowContext}.authTokenUse does not resolve to the row actor's provenance`
      );
      const requestObservedAt = requireIsoTimestamp(
        observation.observedAt,
        `${rowContext}.raw.observedAt`
      );
      const issuedAt = requireIsoTimestamp(
        provenanceObservation.issuedAt,
        `${rowContext}.authTokenUse.issuedAt`
      );
      const expiresAt = requireIsoTimestamp(
        provenanceObservation.expiresAt,
        `${rowContext}.authTokenUse.expiresAt`
      );
      assert(
        Date.parse(issuedAt) <= Date.parse(requestObservedAt) &&
          (authTokenUse.source === 'HOSTED_EXPIRED_SESSION'
            ? Date.parse(expiresAt) <= Date.parse(requestObservedAt)
            : Date.parse(requestObservedAt) < Date.parse(expiresAt)),
        `${rowContext}.authTokenUse token lifetime does not match the request observation`
      );
      if (row.jwtCase === 'stale_jwt') {
        const authorityControl = requireRecord(
          row.authorityStateControl,
          `${rowContext}.authorityStateControl`
        );
        const authorityCause = requireRecord(
          authorityControl.authorityCause,
          `${rowContext}.authorityStateControl.authorityCause`
        );
        assert(
          authorityCause.jwtIssuedAt === issuedAt &&
            Date.parse(issuedAt) <
              Date.parse(
                requireIsoTimestamp(
                  authorityCause.authorityChangedAt,
                  `${rowContext}.authorityStateControl.authorityCause.authorityChangedAt`
                )
              ) &&
            Date.parse(authorityCause.authorityChangedAt) <=
              Date.parse(requestObservedAt),
          `${rowContext}.authorityStateControl stale token is not bound to its hosted Auth provenance`
        );
      }
    }
    if (row.role === 'postgres') {
      const rollbackCompletedAt = requireIsoTimestamp(
        semantic.rollbackCompletedAt,
        `${rowContext}.raw.semantic.rollbackCompletedAt`
      );
      const postRollbackCheckedAt = requireIsoTimestamp(
        semantic.postRollbackCheckedAt,
        `${rowContext}.raw.semantic.postRollbackCheckedAt`
      );
      assert(
        Date.parse(commandWindow.startedAt) <=
          Date.parse(rollbackCompletedAt) &&
          Date.parse(rollbackCompletedAt) <=
            Date.parse(postRollbackCheckedAt) &&
          Date.parse(postRollbackCheckedAt) <=
            Date.parse(observation.observedAt) &&
          Date.parse(observation.observedAt) <=
            Date.parse(commandWindow.endedAt),
        `${rowContext} ROLLBACK/post-ROLLBACK chronology is outside its command window`
      );
    }
    assertJsonEquivalent(
      semantic.stateResults,
      row.observedStateResults,
      `${rowContext}.semantic.stateResults`
    );
    assertJsonEquivalent(
      semantic.errorDiagnostic,
      row.observedErrorDiagnostic,
      `${rowContext}.semantic.errorDiagnostic`
    );
  }
  assert(
    tenantPositiveObservationIds.size === tenantPositiveControlCount,
    `${context} does not contain one distinct same-operation positive observation per tenant denial`
  );
  for (const field of summaryFields) {
    const structured = requireRecord(matrix[field], `${context}.${field}`);
    const observation = requireRawObservationForStructuredValue(
      structured,
      byId,
      `${context}.${field}`
    );
    assert(
      observation.observationType === 'SECURITY_SUMMARY' &&
        observation.gate === field &&
        observation.status === structured.status,
      `${context}.${field} does not reconcile with raw observation`
    );
  }
  return { byId };
}

function verifyDirectRoleAuthTokenProvenance(
  row,
  observation,
  authProvenanceById,
  context
) {
  const authTokenUse = requireRecord(
    row.authTokenUse,
    `${context}.authTokenUse`
  );
  assertJsonEquivalent(
    observation.authTokenUse,
    authTokenUse,
    `${context}.authTokenUse`
  );
  if (row.role === 'authenticated') {
    assert(
      authProvenanceById instanceof Map,
      `${context}.authTokenUse is not bound to the security/Auth observation family`
    );
    const provenance = requireRecord(
      authProvenanceById.get(authTokenUse.provenanceObservationId),
      `${context}.authTokenUse.provenanceObservation`
    );
    const issuedAt = requireIsoTimestamp(
      provenance.issuedAt,
      `${context}.authTokenUse.issuedAt`
    );
    const expiresAt = requireIsoTimestamp(
      provenance.expiresAt,
      `${context}.authTokenUse.expiresAt`
    );
    const observedAt = requireIsoTimestamp(
      observation.observedAt,
      `${context}.raw.observedAt`
    );
    assert(
      provenance.observationType === 'AUTH_TOKEN_PROVENANCE' &&
        provenance.stage === 'REFRESH' &&
        provenance.actorId === row.actorId &&
        provenance.tokenHandleId === authTokenUse.tokenHandleId &&
        authTokenUse.actorId === row.actorId &&
        authTokenUse.source === 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH' &&
        Date.parse(issuedAt) <= Date.parse(observedAt) &&
        Date.parse(observedAt) < Date.parse(expiresAt),
      `${context}.authTokenUse does not resolve to a valid refreshed Hosted Auth session for the direct-role actor`
    );
  } else {
    assert(
      authTokenUse.provenanceObservationId === 'NOT_APPLICABLE',
      `${context}.authTokenUse unexpectedly claims Hosted Auth provenance`
    );
  }
}

function verifyDataApiRawObservations(
  rawResult,
  result,
  context,
  commandWindow,
  authProvenanceById
) {
  const { observations, byId } = requireRawObservationEnvelope(
    rawResult,
    context,
    'DATA_API_DIRECT_ROLE',
    'HTTPS_REST_AND_DIRECT_POSTGRES_ACL',
    commandWindow
  );
  const dataApi = requireRecord(result.result, `${context}.structuredResult`);
  assertJsonEquivalent(
    rawResult.configuration,
    {
      enabled: dataApi.enabled,
      exposedSchemas: dataApi.exposedSchemas,
      automaticGrants: dataApi.automaticGrants,
      defaultPrivileges: dataApi.defaultPrivileges,
    },
    `${context}.configuration`
  );
  const rows = requireArray(
    dataApi.directRoleResults,
    `${context}.structuredResult.directRoleResults`
  ).map((value, index) =>
    requireRecord(
      value,
      `${context}.structuredResult.directRoleResults[${String(index)}]`
    )
  );
  const tenantPositiveControlCount = rows.filter(
    row => row.tenantProbeControl !== undefined
  ).length;
  const tenantPositiveObservationIds = new Set();
  const aclRows = requireArray(
    dataApi.aclInventoryResults,
    `${context}.structuredResult.aclInventoryResults`
  ).map((value, index) =>
    requireRecord(
      value,
      `${context}.structuredResult.aclInventoryResults[${String(index)}]`
    )
  );
  const summaryFields = [
    'schemaUsage',
    'objectAcl',
    'aclVerdict',
    'rlsVerdict',
  ];
  assert(
    observations.length ===
      rows.length +
        tenantPositiveControlCount +
        aclRows.length +
        summaryFields.length,
    `${context} Data API observation count does not cover every role and ACL/RLS summary`
  );
  for (const [index, row] of rows.entries()) {
    const rowContext = `${context}.structuredResult.directRoleResults[${String(index)}]`;
    const observation = requireRawObservationForStructuredValue(
      row,
      byId,
      rowContext
    );
    const http = requireRecord(observation.http, `${rowContext}.raw.http`);
    const sql = requireRecord(observation.sql, `${rowContext}.raw.sql`);
    const authorization = requireRecord(
      observation.authorization,
      `${rowContext}.raw.authorization`
    );
    assert(
      observation.observationType === 'DATA_API_ROLE_CASE' &&
        observation.caseId === row.caseId &&
        observation.caseClass === row.caseClass &&
        observation.role === row.role &&
        observation.actorId === row.actorId &&
        observation.credentialHandle === row.credentialHandle &&
        observation.tokenProvenance === row.tokenProvenance &&
        observation.sourceTenant === row.sourceTenant &&
        observation.targetTenant === row.targetTenant &&
        observation.tenantDirection === row.tenantDirection &&
        observation.target === row.target &&
        observation.targetObjectId === row.targetObjectId &&
        observation.targetObjectKind === row.targetObjectKind &&
        observation.targetObjectIdentity === row.targetObjectIdentity &&
        observation.aclInventoryCaseId === row.aclInventoryCaseId &&
        observation.operation === row.operation &&
        observation.status === row.status &&
        http.method === row.httpMethod &&
        http.path === row.requestPath &&
        Number.isInteger(http.status) &&
        http.status === row.observedHttpStatus &&
        http.requestBodySha256 === row.requestBodySha256 &&
        http.responseBodySha256 === row.observedResponseBodySha256 &&
        http.responseBodySha256 === row.expectedResponseBodySha256 &&
        typeof sql.executed === 'boolean' &&
        sql.executed === row.observedSqlExecuted &&
        sql.executed === (row.observedSqlstate !== 'NOT_EXECUTED') &&
        sql.sqlstate === row.observedSqlstate &&
        observation.rowCount === row.observedRowCount &&
        observation.mutationCount === row.observedMutationCount &&
        observation.endpointOutcome === row.observedEndpointOutcome &&
        authorization.aclOutcome === row.observedAclOutcome &&
        authorization.rlsOutcome === row.observedRlsOutcome &&
        authorization.aclVerdict === row.aclVerdict &&
        authorization.rlsVerdict === row.rlsVerdict,
      `${rowContext} HTTP/row/ACL/RLS observation mismatch`
    );
    verifyDirectRoleAuthTokenProvenance(
      row,
      observation,
      authProvenanceById,
      rowContext
    );
    if (row.tenantProbeControl !== undefined) {
      assertJsonEquivalent(
        observation.tenantProbeControl,
        row.tenantProbeControl,
        `${rowContext}.tenantProbeControl`
      );
      const positive = requireRecord(
        requireRecord(
          row.tenantProbeControl,
          `${rowContext}.tenantProbeControl`
        ).sameTenantPositiveControl,
        `${rowContext}.tenantProbeControl.sameTenantPositiveControl`
      );
      const positiveObservationId = verifyTenantPositiveRawObservation(
        positive,
        byId,
        authProvenanceById,
        commandWindow,
        `${rowContext}.tenantProbeControl.sameTenantPositiveControl`
      );
      assert(
        positiveObservationId !== row.rawObservationId &&
          !tenantPositiveObservationIds.has(positiveObservationId),
        `${rowContext} reuses a tenant positive raw observation`
      );
      tenantPositiveObservationIds.add(positiveObservationId);
    } else {
      assert(
        observation.tenantProbeControl === undefined,
        `${rowContext}.raw.tenantProbeControl is unexpected`
      );
    }
    if (row.tenantAllowControl !== undefined) {
      assertJsonEquivalent(
        observation.tenantAllowControl,
        row.tenantAllowControl,
        `${rowContext}.tenantAllowControl`
      );
      verifyTenantAllowControl(
        observation.tenantAllowControl,
        `${rowContext}.raw.tenantAllowControl`,
        row
      );
    } else {
      assert(
        observation.tenantAllowControl === undefined,
        `${rowContext}.raw.tenantAllowControl is unexpected`
      );
    }
  }
  assert(
    tenantPositiveObservationIds.size === tenantPositiveControlCount,
    `${context} does not contain one distinct same-operation positive observation per tenant denial`
  );
  for (const [index, row] of aclRows.entries()) {
    const rowContext = `${context}.structuredResult.aclInventoryResults[${String(index)}]`;
    const observation = requireRawObservationForStructuredValue(
      row,
      byId,
      rowContext
    );
    assert(
      observation.observationType === 'DATA_API_ACL_CASE' &&
        observation.caseId === row.caseId &&
        observation.objectId === row.objectId &&
        observation.objectKind === row.objectKind &&
        observation.objectIdentity === row.objectIdentity &&
        observation.role === row.role &&
        observation.privilege === row.privilege &&
        observation.directGrant === row.observedDirectGrant &&
        observation.publicGrant === row.observedPublicGrant &&
        observation.inheritedGrant === row.observedInheritedGrant &&
        observation.granted === row.observedGranted &&
        observation.granted ===
          (observation.directGrant ||
            observation.publicGrant ||
            observation.inheritedGrant) &&
        observation.sqlstate === row.observedSqlstate &&
        observation.aclOutcome === row.observedAclOutcome &&
        observation.status === row.status,
      `${rowContext} raw ACL inventory observation mismatch`
    );
  }
  for (const field of summaryFields) {
    const structured = requireRecord(dataApi[field], `${context}.${field}`);
    const observation = requireRawObservationForStructuredValue(
      structured,
      byId,
      `${context}.${field}`
    );
    assert(
      observation.observationType === 'DATA_API_SUMMARY' &&
        observation.gate === field &&
        observation.status === structured.status,
      `${context}.${field} does not reconcile with raw observation`
    );
    assertJsonEquivalent(
      observation.coveredCaseIds,
      structured.coveredCaseIds,
      `${context}.${field}.coveredCaseIds`
    );
  }
}

function verifyGraphQlRawObservations(
  rawResult,
  result,
  context,
  commandWindow,
  authProvenanceById
) {
  const { observations, byId } = requireRawObservationEnvelope(
    rawResult,
    context,
    'GRAPHQL_DIRECT_ROLE',
    'HTTPS_GRAPHQL',
    commandWindow
  );
  const graphQl = requireRecord(result.result, `${context}.structuredResult`);
  assertJsonEquivalent(
    rawResult.configuration,
    {
      installedVersion: graphQl.installedVersion,
      enabled: graphQl.enabled,
      exposedSchemas: graphQl.exposedSchemas,
      introspection: graphQl.introspection,
    },
    `${context}.configuration`
  );
  const rows = requireArray(
    graphQl.directRoleResults,
    `${context}.structuredResult.directRoleResults`
  ).map((value, index) =>
    requireRecord(
      value,
      `${context}.structuredResult.directRoleResults[${String(index)}]`
    )
  );
  const summaryFields = [
    'tenantBoundary',
    'fieldVisibility',
    'disabledEndpointRejection',
  ];
  assert(
    observations.length === rows.length + summaryFields.length,
    `${context} GraphQL observation count does not cover every role and exposure summary`
  );
  for (const [index, row] of rows.entries()) {
    const rowContext = `${context}.structuredResult.directRoleResults[${String(index)}]`;
    const observation = requireRawObservationForStructuredValue(
      row,
      byId,
      rowContext
    );
    const http = requireRecord(observation.http, `${rowContext}.raw.http`);
    const sql = requireRecord(observation.sql, `${rowContext}.raw.sql`);
    const authorization = requireRecord(
      observation.authorization,
      `${rowContext}.raw.authorization`
    );
    assert(
      observation.observationType === 'GRAPHQL_ROLE_CASE' &&
        observation.caseId === row.caseId &&
        observation.caseClass === row.caseClass &&
        observation.role === row.role &&
        observation.actorId === row.actorId &&
        observation.credentialHandle === row.credentialHandle &&
        observation.tokenProvenance === row.tokenProvenance &&
        observation.sourceTenant === row.sourceTenant &&
        observation.targetTenant === row.targetTenant &&
        observation.tenantDirection === row.tenantDirection &&
        observation.target === row.target &&
        observation.operation === row.operation &&
        observation.endpointOutcome === row.observedEndpointOutcome &&
        observation.status === row.status &&
        Number.isInteger(http.status) &&
        http.status === row.observedHttpStatus &&
        typeof sql.executed === 'boolean' &&
        sql.executed === row.observedSqlExecuted &&
        sql.executed === (row.observedSqlstate !== 'NOT_EXECUTED') &&
        sql.sqlstate === row.observedSqlstate &&
        observation.rowCount === row.observedRowCount &&
        observation.mutationCount === row.observedMutationCount &&
        authorization.aclOutcome === row.observedAclOutcome &&
        authorization.rlsOutcome === row.observedRlsOutcome &&
        authorization.aclVerdict === row.aclVerdict &&
        authorization.rlsVerdict === row.rlsVerdict,
      `${rowContext} HTTP/row/endpoint observation mismatch`
    );
    verifyDirectRoleAuthTokenProvenance(
      row,
      observation,
      authProvenanceById,
      rowContext
    );
  }
  for (const field of summaryFields) {
    const structured = requireRecord(graphQl[field], `${context}.${field}`);
    const observation = requireRawObservationForStructuredValue(
      structured,
      byId,
      `${context}.${field}`
    );
    assert(
      observation.observationType === 'GRAPHQL_SUMMARY' &&
        observation.gate === field &&
        observation.status === structured.status,
      `${context}.${field} does not reconcile with raw observation`
    );
    assertJsonEquivalent(
      observation.coveredCaseIds,
      structured.coveredCaseIds,
      `${context}.${field}.coveredCaseIds`
    );
  }
}

function verifySourceStructuredResults(
  manifest,
  artifactHashes,
  artifactFiles
) {
  const sourceResults = requireRecord(
    manifest.sourceStructuredResults,
    'sourceStructuredResults'
  );
  const source = requireRecord(manifest.source, 'source');
  const environment = requireRecord(manifest.environment, 'environment');
  const readCommandResult = ({
    name,
    resultType,
    commandId,
    phase,
    mutationScope,
  }) => {
    const binding = verifyBoundArtifact(
      sourceResults[name],
      `sourceStructuredResults.${name}`,
      artifactHashes,
      artifactFiles
    );
    const result = readJsonFile(
      binding.absolutePath,
      `sourceStructuredResults.${name}.result`
    );
    const command = requireDedicatedCommand(
      manifest,
      commandId,
      phase,
      binding,
      `sourceStructuredResults.${name}`,
      true,
      mutationScope
    );
    assert(
      result.schemaVersion === 1 &&
        result.resultType === resultType &&
        result.status === 'PASS' &&
        result.commandId === commandId &&
        result.environmentProjectRef === environment.projectRef &&
        result.gitCommit === source.gitCommit &&
        result.capturedAt === command.endedAt,
      `sourceStructuredResults.${name} command, target, or commit mismatch`
    );
    verifyRuntimeIdentityBinding(
      result.runtimeIdentity,
      environment,
      `sourceStructuredResults.${name}.runtimeIdentity`
    );
    return { binding, result, command };
  };
  const verifyRawSourceIdentity = (raw, resultType, command, context) => {
    assert(
      raw.schemaVersion === 1 &&
        raw.resultType === resultType &&
        raw.status === 'CAPTURED' &&
        raw.commandId === command.id &&
        raw.environmentProjectRef === environment.projectRef &&
        raw.gitCommit === source.gitCommit &&
        raw.capturedAt === command.endedAt,
      `${context} command, target, or commit mismatch`
    );
    verifyRuntimeIdentityBinding(
      raw.runtimeIdentity,
      environment,
      `${context}.runtimeIdentity`
    );
  };

  const security = readCommandResult({
    name: 'securityMatrix',
    resultType: 'SOURCE_SECURITY_AUTH_TENANT_RESULT',
    commandId: 'PR12-CMD-013',
    phase: 'security_auth_tenant',
    mutationScope: 'SYNTHETIC_SECURITY_MATRIX_ONLY',
  });
  assertJsonEquivalent(
    security.result.result,
    manifest.securityMatrix,
    'sourceStructuredResults.securityMatrix.result'
  );
  assertJsonEquivalent(
    security.result.authProvisioning,
    environment.authProvisioning,
    'sourceStructuredResults.securityMatrix.authProvisioning'
  );
  const securityContract = verifyBoundArtifact(
    security.result.contract,
    'sourceStructuredResults.securityMatrix.contract',
    artifactHashes,
    artifactFiles
  );
  const matrix = requireRecord(manifest.securityMatrix, 'securityMatrix');
  assert(
    securityContract.path === matrix.contractPath &&
      securityContract.sha256 === matrix.contractSha256,
    'sourceStructuredResults.securityMatrix contract mismatch'
  );
  const securityRawBindings = requireArray(
    security.result.rawEvidence,
    'sourceStructuredResults.securityMatrix.rawEvidence'
  );
  assert(
    securityRawBindings.length === 1,
    'sourceStructuredResults.securityMatrix must bind one raw artifact'
  );
  const securityRawBinding = verifyBoundArtifact(
    securityRawBindings[0],
    'sourceStructuredResults.securityMatrix.rawEvidence[0]',
    artifactHashes,
    artifactFiles
  );
  const securityRaw = readJsonFile(
    securityRawBinding.absolutePath,
    'sourceStructuredResults.securityMatrix.rawEvidence[0]'
  );
  verifyRawSourceIdentity(
    securityRaw,
    'SOURCE_SECURITY_AUTH_TENANT_RAW_EVIDENCE',
    security.command,
    'sourceStructuredResults.securityMatrix.rawEvidence[0]'
  );
  const sourceSecurityRawVerification = verifySecurityRawObservations(
    securityRaw,
    security.result,
    'sourceStructuredResults.securityMatrix',
    {
      startedAt: security.command.startedAt,
      endedAt: security.command.endedAt,
    }
  );

  const api = readCommandResult({
    name: 'dataApiGraphQl',
    resultType: 'SOURCE_DATA_API_GRAPHQL_RESULT',
    commandId: 'PR12-CMD-014',
    phase: 'data_api_graphql',
    mutationScope: 'SYNTHETIC_API_MATRIX_ONLY',
  });
  const apiResult = requireRecord(
    api.result.result,
    'sourceStructuredResults.dataApiGraphQl.result'
  );
  assertJsonEquivalent(
    apiResult.dataApi,
    environment.dataApi,
    'sourceStructuredResults.dataApiGraphQl.result.dataApi'
  );
  assertJsonEquivalent(
    apiResult.graphQl,
    environment.graphQl,
    'sourceStructuredResults.dataApiGraphQl.result.graphQl'
  );
  const apiContracts = requireRecord(
    api.result.contracts,
    'sourceStructuredResults.dataApiGraphQl.contracts'
  );
  for (const [name, structured, label] of [
    ['dataApi', environment.dataApi, 'Data API'],
    ['graphQl', environment.graphQl, 'GraphQL'],
  ]) {
    const contract = verifyBoundArtifact(
      apiContracts[name],
      `sourceStructuredResults.dataApiGraphQl.contracts.${name}`,
      artifactHashes,
      artifactFiles
    );
    const value = requireRecord(structured, `environment.${name}`);
    assert(
      contract.path === value.matrixPath &&
        contract.sha256 === value.matrixSha256,
      `sourceStructuredResults ${label} contract mismatch`
    );
  }
  const rawBindings = requireRecord(
    api.result.rawEvidence,
    'sourceStructuredResults.dataApiGraphQl.rawEvidence'
  );
  const rawArtifacts = new Map();
  for (const [name, resultType] of [
    ['dataApi', 'SOURCE_DATA_API_RAW_EVIDENCE'],
    ['graphQl', 'SOURCE_GRAPHQL_RAW_EVIDENCE'],
  ]) {
    const rawBinding = verifyBoundArtifact(
      rawBindings[name],
      `sourceStructuredResults.dataApiGraphQl.rawEvidence.${name}`,
      artifactHashes,
      artifactFiles
    );
    assert(
      !rawArtifacts.has(rawBinding.path),
      'source Data API and GraphQL raw artifacts must be distinct'
    );
    rawArtifacts.set(rawBinding.path, true);
    const raw = readJsonFile(
      rawBinding.absolutePath,
      `sourceStructuredResults.dataApiGraphQl.rawEvidence.${name}`
    );
    verifyRawSourceIdentity(
      raw,
      resultType,
      api.command,
      `sourceStructuredResults.dataApiGraphQl.rawEvidence.${name}`
    );
    if (name === 'dataApi') {
      verifyDataApiRawObservations(
        raw,
        { result: apiResult.dataApi },
        'sourceStructuredResults.dataApiGraphQl.dataApi',
        { startedAt: api.command.startedAt, endedAt: api.command.endedAt },
        sourceSecurityRawVerification.byId
      );
    } else {
      verifyGraphQlRawObservations(
        raw,
        { result: apiResult.graphQl },
        'sourceStructuredResults.dataApiGraphQl.graphQl',
        { startedAt: api.command.startedAt, endedAt: api.command.endedAt },
        sourceSecurityRawVerification.byId
      );
    }
  }
}

function expectedSideEffectFamilyConfiguration(
  family,
  integrationContract,
  targetName
) {
  const sourceIntegrations = requireRecord(
    integrationContract.integrations,
    'external-side-effect integration contract integrations'
  );
  const restoreOverrides = requireRecord(
    integrationContract.restoreIntegrationOverrides,
    'external-side-effect integration contract restoreIntegrationOverrides'
  );
  const integrations =
    targetName === 'restore'
      ? { ...sourceIntegrations, ...restoreOverrides }
      : sourceIntegrations;
  const database = requireRecord(
    integrationContract.databaseExternalOperations,
    'external-side-effect integration contract databaseExternalOperations'
  );
  const exactIntegration = name => ({
    ...requireRecord(
      integrations[name],
      `external-side-effect integration contract integrations.${name}`
    ),
  });
  switch (family) {
    case 'DATABASE_EXTENSION_STATE':
      return {
        pgNet: database.pgNet,
        pgCron: database.pgCron,
        wrappers: database.wrappers,
        databaseWebhooks: database.databaseWebhooks,
      };
    case 'PG_CRON_JOB_INVENTORY':
      return { approvedState: database.pgCron, enabledJobCount: 0 };
    case 'PG_NET_QUEUE_INVENTORY':
      return {
        approvedState: database.pgNet,
        queuedRequestCount: 0,
        responseCount: 0,
      };
    case 'DATABASE_WEBHOOK_TRIGGER_INVENTORY':
      return {
        approvedState: database.databaseWebhooks,
        enabledWebhookCount: 0,
      };
    case 'WRAPPER_FDW_INVENTORY':
      return { approvedState: database.wrappers, externalServerCount: 0 };
    case 'STRIPE_CONFIGURATION_AND_DISPATCH':
      return exactIntegration('stripe');
    case 'EMAIL_CONFIGURATION_AND_DISPATCH':
      return exactIntegration('email');
    case 'LINE_CONFIGURATION_AND_DISPATCH':
      return exactIntegration('line');
    case 'SMS_CONFIGURATION_AND_DISPATCH':
      return exactIntegration('sms');
    case 'INBOUND_WEBHOOK_CONFIGURATION':
      return exactIntegration('inboundWebhooks');
    case 'WORKER_CRON_QUEUE_CONFIGURATION':
      return exactIntegration('cronAndQueues');
    case 'BULK_IMPORT_SYNC_CONFIGURATION':
      return exactIntegration('bulk');
    case 'EXTERNAL_RATE_LIMIT_NAMESPACE':
      return exactIntegration('upstashOrExternalRateLimit');
    case 'DUPLICATE_SIDE_EFFECT_SCAN':
      return { duplicateCount: 0, pendingExternalOperationCount: 0 };
    default:
      throw new Error(`unsupported external side-effect family: ${family}`);
  }
}

function deriveSideEffectConfigurationFromFacts(
  family,
  targetName,
  observedSettings,
  catalogRows,
  pendingExternalOperations,
  duplicateReceipts,
  context
) {
  const assertSettings = expectedKeys => {
    assertExactRecordKeys(
      observedSettings,
      expectedKeys,
      `${context}.observedSettings`
    );
  };
  const assertBoolean = field => {
    assert(
      typeof observedSettings[field] === 'boolean',
      `${context}.observedSettings.${field} must be boolean`
    );
    return observedSettings[field];
  };
  const requireComplete = () => {
    assert(
      assertBoolean('paginationComplete') === true,
      `${context}.observedSettings.paginationComplete must be true`
    );
  };
  if (family === 'DATABASE_EXTENSION_STATE') {
    assertSettings(['paginationComplete']);
    requireComplete();
    assert(
      catalogRows.length === 3,
      `${context}.catalogRows must cover three extensions`
    );
    const expectedNames = ['pg_cron', 'pg_net', 'wrappers'];
    for (const [index, row] of catalogRows.entries()) {
      const rowContext = `${context}.catalogRows[${String(index)}]`;
      assertExactRecordKeys(
        row,
        [
          'name',
          'availableVersion',
          'installedVersion',
          'externalOperationEnabled',
        ],
        rowContext
      );
      assert(
        row.name === expectedNames[index],
        `${rowContext}.name order drift`
      );
      assert(
        (row.availableVersion === null ||
          (typeof row.availableVersion === 'string' &&
            row.availableVersion.length > 0)) &&
          (row.installedVersion === null ||
            (typeof row.installedVersion === 'string' &&
              row.installedVersion.length > 0)) &&
          row.externalOperationEnabled === false,
        `${rowContext} version or external-operation state drift`
      );
    }
    return {
      operationMode: 'DISABLED',
      configuration: {
        pgNet: 'DISABLED_OR_ABSENT_REQUIRED',
        pgCron: 'NO_EXTERNAL_JOB_REQUIRED',
        wrappers: 'DISABLED_OR_ABSENT_REQUIRED',
        databaseWebhooks: 'DISABLED_REQUIRED',
      },
    };
  }
  if (family === 'PG_CRON_JOB_INVENTORY') {
    assertSettings(['paginationComplete', 'relationPresent']);
    requireComplete();
    assertBoolean('relationPresent');
    let enabledJobCount = 0;
    for (const [index, row] of catalogRows.entries()) {
      const rowContext = `${context}.catalogRows[${String(index)}]`;
      assertExactRecordKeys(row, ['jobId', 'active'], rowContext);
      requireConcreteString(row.jobId, `${rowContext}.jobId`);
      assert(
        typeof row.active === 'boolean',
        `${rowContext}.active must be boolean`
      );
      if (row.active) enabledJobCount += 1;
    }
    assert(
      observedSettings.relationPresent === true || catalogRows.length === 0,
      `${context}.catalogRows require cron.job presence`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        approvedState: 'NO_EXTERNAL_JOB_REQUIRED',
        enabledJobCount,
      },
    };
  }
  if (family === 'PG_NET_QUEUE_INVENTORY') {
    assertSettings([
      'paginationComplete',
      'queueRelationPresent',
      'responseRelationPresent',
    ]);
    requireComplete();
    assertBoolean('queueRelationPresent');
    assertBoolean('responseRelationPresent');
    assert(
      catalogRows.length === 1,
      `${context}.catalogRows must contain safe count facts`
    );
    const row = catalogRows[0];
    assertExactRecordKeys(
      row,
      ['queuedRequestCount', 'responseCount'],
      `${context}.catalogRows[0]`
    );
    for (const field of ['queuedRequestCount', 'responseCount']) {
      assert(
        Number.isInteger(row[field]) && row[field] >= 0,
        `${context}.catalogRows[0].${field} must be a non-negative integer`
      );
    }
    assert(
      row.queuedRequestCount === 0 && row.responseCount === 0,
      `${context}.catalogRows[0] pg_net queue and response counts must be zero`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        approvedState: 'DISABLED_OR_ABSENT_REQUIRED',
        queuedRequestCount: row.queuedRequestCount,
        responseCount: row.responseCount,
      },
    };
  }
  if (family === 'DATABASE_WEBHOOK_TRIGGER_INVENTORY') {
    assertSettings(['paginationComplete']);
    requireComplete();
    let enabledWebhookCount = 0;
    for (const [index, row] of catalogRows.entries()) {
      const rowContext = `${context}.catalogRows[${String(index)}]`;
      assertExactRecordKeys(
        row,
        ['schemaName', 'tableName', 'triggerName', 'functionName', 'enabled'],
        rowContext
      );
      for (const field of [
        'schemaName',
        'tableName',
        'triggerName',
        'functionName',
      ]) {
        requireConcreteString(row[field], `${rowContext}.${field}`);
      }
      assert(
        typeof row.enabled === 'boolean',
        `${rowContext}.enabled must be boolean`
      );
      if (row.enabled) enabledWebhookCount += 1;
    }
    return {
      operationMode: 'DISABLED',
      configuration: {
        approvedState: 'DISABLED_REQUIRED',
        enabledWebhookCount,
      },
    };
  }
  if (family === 'WRAPPER_FDW_INVENTORY') {
    assertSettings(['paginationComplete']);
    requireComplete();
    for (const [index, row] of catalogRows.entries()) {
      const rowContext = `${context}.catalogRows[${String(index)}]`;
      assertExactRecordKeys(row, ['serverName', 'wrapperName'], rowContext);
      requireConcreteString(row.serverName, `${rowContext}.serverName`);
      requireConcreteString(row.wrapperName, `${rowContext}.wrapperName`);
    }
    return {
      operationMode: 'DISABLED',
      configuration: {
        approvedState: 'DISABLED_OR_ABSENT_REQUIRED',
        externalServerCount: catalogRows.length,
      },
    };
  }
  assert(
    catalogRows.length === 0,
    `${context}.catalogRows is unsupported for ${family}`
  );
  if (family === 'STRIPE_CONFIGURATION_AND_DISPATCH') {
    assertSettings([
      'liveCredentialPresent',
      'paginationComplete',
      'testCredentialPresent',
      'webhookDestinationClass',
    ]);
    requireComplete();
    const liveCredentialPresent = assertBoolean('liveCredentialPresent');
    const testCredentialPresent = assertBoolean('testCredentialPresent');
    assert(
      liveCredentialPresent === false,
      `${context}.observedSettings live Stripe credential is forbidden`
    );
    if (targetName === 'source') {
      assert(
        testCredentialPresent === true &&
          observedSettings.webhookDestinationClass ===
            'APPROVED_ISOLATED_HARNESS',
        `${context}.observedSettings source Stripe sandbox drift`
      );
      return {
        operationMode: 'SANDBOXED',
        configuration: {
          mode: 'TEST_MODE_SANDBOX_ONLY',
          liveKeyAllowed: false,
          liveChargeAllowed: false,
          testObjectCreationAllowedAfterApproval: true,
          webhookDestination: 'approved_local_or_isolated_harness_only',
        },
      };
    }
    assert(
      testCredentialPresent === false &&
        observedSettings.webhookDestinationClass === 'DISABLED',
      `${context}.observedSettings restore Stripe must be disabled`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        mode: 'DISABLED',
        liveKeyAllowed: false,
        liveChargeAllowed: false,
        testObjectCreationAllowedAfterApproval: false,
        webhookDestination: 'DISABLED',
      },
    };
  }
  if (family === 'EMAIL_CONFIGURATION_AND_DISPATCH') {
    assertSettings([
      'cronConfigured',
      'credentialPresent',
      'fromAddressConfigured',
      'paginationComplete',
      'webhookConfigured',
      'workerConfigured',
    ]);
    requireComplete();
    for (const field of [
      'cronConfigured',
      'credentialPresent',
      'fromAddressConfigured',
      'webhookConfigured',
      'workerConfigured',
    ])
      assertBoolean(field);
    return {
      operationMode: 'DISABLED',
      configuration: {
        provider: 'DISABLED',
        resendApiKeyPresent: observedSettings.credentialPresent,
        workerEnabled: observedSettings.workerConfigured,
        cronEnabled: observedSettings.cronConfigured,
        outboxEnqueueOnly: true,
        realSendAllowed: false,
      },
    };
  }
  if (family === 'LINE_CONFIGURATION_AND_DISPATCH') {
    assertSettings([
      'credentialPresent',
      'cronConfigured',
      'liffConfigured',
      'paginationComplete',
      'processorConfigured',
    ]);
    requireComplete();
    for (const field of [
      'credentialPresent',
      'cronConfigured',
      'liffConfigured',
      'processorConfigured',
    ])
      assertBoolean(field);
    return {
      operationMode: 'DISABLED',
      configuration: {
        provider: 'DISABLED',
        credentialPresent: observedSettings.credentialPresent,
        processorEnabled: observedSettings.processorConfigured,
        cronEnabled: observedSettings.cronConfigured,
        liffEnabled: observedSettings.liffConfigured,
        realSendAllowed: false,
      },
    };
  }
  if (family === 'SMS_CONFIGURATION_AND_DISPATCH') {
    assertSettings([
      'credentialPresent',
      'paginationComplete',
      'providerSelected',
      'sinkCount',
    ]);
    requireComplete();
    const credentialPresent = assertBoolean('credentialPresent');
    const providerSelected = assertBoolean('providerSelected');
    assert(
      Number.isInteger(observedSettings.sinkCount) &&
        observedSettings.sinkCount >= 0,
      `${context}.observedSettings.sinkCount drift`
    );
    assert(
      credentialPresent === false &&
        providerSelected === false &&
        observedSettings.sinkCount === 0,
      `${context}.observedSettings SMS provider, credential, or sink must be disabled`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        provider: 'DISABLED',
        credentialPresent,
        realSendAllowed: false,
      },
    };
  }
  if (family === 'INBOUND_WEBHOOK_CONFIGURATION') {
    assertSettings([
      'databaseMutationCount',
      'lineRouteStatus',
      'paginationComplete',
      'resendNegativeControlStatus',
      'stripeUnsignedStatus',
    ]);
    requireComplete();
    assert(
      observedSettings.databaseMutationCount === 0 &&
        observedSettings.stripeUnsignedStatus ===
          (targetName === 'source' ? 400 : 404) &&
        observedSettings.resendNegativeControlStatus === 500 &&
        observedSettings.lineRouteStatus === 404,
      `${context}.observedSettings inbound webhook controls drift`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        stripeTestEndpointOnly: targetName === 'source',
        resendEndpointEnabled: false,
        lineEndpointEnabled: false,
      },
    };
  }
  if (family === 'WORKER_CRON_QUEUE_CONFIGURATION') {
    assertSettings([
      'paginationComplete',
      'runtimeConsumerCredentialPresent',
      'staticCronEntryCount',
      'unauthenticatedStatusCodes',
    ]);
    requireComplete();
    assert(
      observedSettings.runtimeConsumerCredentialPresent === false &&
        observedSettings.staticCronEntryCount === 3 &&
        JSON.stringify(observedSettings.unauthenticatedStatusCodes) ===
          JSON.stringify([401, 401, 401]),
      `${context}.observedSettings worker/cron controls drift`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        allConsumersDisabled: true,
        unattendedBatchEnabled: false,
      },
    };
  }
  if (family === 'BULK_IMPORT_SYNC_CONFIGURATION') {
    assertSettings(['enabledExternalSinkCount', 'paginationComplete']);
    requireComplete();
    assert(
      observedSettings.enabledExternalSinkCount === 0,
      `${context}.observedSettings external sink count must be zero`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        externalImportEnabled: false,
        externalSyncEnabled: false,
      },
    };
  }
  if (family === 'EXTERNAL_RATE_LIMIT_NAMESPACE') {
    assertSettings([
      'credentialPresent',
      'namespacePrefix',
      'paginationComplete',
    ]);
    requireComplete();
    assert(
      observedSettings.credentialPresent === false &&
        observedSettings.namespacePrefix === null,
      `${context}.observedSettings rate-limit namespace must be disabled`
    );
    return {
      operationMode: 'DISABLED',
      configuration: {
        disposition: 'DISABLED',
        isolatedNamespaceRequiredIfEnabled: true,
        productionNamespaceAllowed: false,
      },
    };
  }
  assert(
    family === 'DUPLICATE_SIDE_EFFECT_SCAN',
    `${context} family is unsupported`
  );
  assertSettings(['paginationComplete']);
  requireComplete();
  return {
    operationMode: 'DISABLED',
    configuration: {
      duplicateCount: duplicateReceipts.length,
      pendingExternalOperationCount: pendingExternalOperations.length,
    },
  };
}

function deriveExternalSideEffectObservation(
  rawObservation,
  integrationContract,
  targetName,
  command,
  context
) {
  assertExactRecordKeys(
    rawObservation,
    [
      'observationId',
      'family',
      'transport',
      'observedAt',
      'provenance',
      'rawState',
      'secretValueCaptured',
    ],
    context
  );
  const observationId = requireConcreteString(
    rawObservation.observationId,
    `${context}.observationId`
  );
  const family = requireConcreteString(
    rawObservation.family,
    `${context}.family`
  );
  const expectedTransport = SIDE_EFFECT_TRANSPORTS[family];
  assert(
    typeof expectedTransport === 'string' &&
      rawObservation.transport === expectedTransport &&
      rawObservation.secretValueCaptured === false,
    `${context} family transport or secret boundary drift`
  );
  const observedAt = requireIsoTimestamp(
    rawObservation.observedAt,
    `${context}.observedAt`
  );
  assert(
    Date.parse(command.startedAt) <= Date.parse(observedAt) &&
      Date.parse(observedAt) <= Date.parse(command.endedAt),
    `${context}.observedAt is outside its command window`
  );
  const provenance = requireRecord(
    rawObservation.provenance,
    `${context}.provenance`
  );
  assertExactRecordKeys(
    provenance,
    [
      'sourceKind',
      'collectorId',
      'descriptorPath',
      'descriptorArtifactSha256',
      'probeId',
      'requestOrQueryText',
      'requestOrQuerySha256',
      'steps',
    ],
    `${context}.provenance`
  );
  const request = SIDE_EFFECT_REQUESTS[family];
  assert(
    request &&
      provenance.sourceKind === expectedTransport &&
      provenance.collectorId === SIDE_EFFECT_COLLECTOR_ID &&
      provenance.descriptorPath === SIDE_EFFECT_DESCRIPTOR_PATH &&
      provenance.descriptorArtifactSha256 ===
        SIDE_EFFECT_DESCRIPTOR_ARTIFACT_SHA256 &&
      provenance.probeId === request.probeId &&
      provenance.requestOrQueryText === request.requestOrQueryText &&
      provenance.requestOrQuerySha256 ===
        sha256Text(request.requestOrQueryText),
    `${context} collector provenance drift`
  );
  const rawState = requireRecord(
    rawObservation.rawState,
    `${context}.rawState`
  );
  assertExactRecordKeys(
    rawState,
    [
      'observedSettings',
      'catalogRows',
      'pendingExternalOperations',
      'attemptedRealDispatches',
      'providerRealDispatches',
      'duplicateReceipts',
      'productionIdentityMatches',
      'destinationFingerprintSha256',
    ],
    `${context}.rawState`
  );
  const observedSettings = requireRecord(
    rawState.observedSettings,
    `${context}.rawState.observedSettings`
  );
  const catalogRows = requireArray(
    rawState.catalogRows,
    `${context}.rawState.catalogRows`
  ).map((value, index) =>
    requireRecord(value, `${context}.rawState.catalogRows[${String(index)}]`)
  );
  const pendingExternalOperations = requireArray(
    rawState.pendingExternalOperations,
    `${context}.rawState.pendingExternalOperations`
  );
  const attemptedRealDispatches = requireArray(
    rawState.attemptedRealDispatches,
    `${context}.rawState.attemptedRealDispatches`
  );
  const providerRealDispatches = requireArray(
    rawState.providerRealDispatches,
    `${context}.rawState.providerRealDispatches`
  );
  const duplicateReceipts = requireArray(
    rawState.duplicateReceipts,
    `${context}.rawState.duplicateReceipts`
  );
  const productionIdentityMatches = requireArray(
    rawState.productionIdentityMatches,
    `${context}.rawState.productionIdentityMatches`
  );
  const derived = deriveSideEffectConfigurationFromFacts(
    family,
    targetName,
    observedSettings,
    catalogRows,
    pendingExternalOperations,
    duplicateReceipts,
    `${context}.rawState`
  );
  const expectedConfiguration = expectedSideEffectFamilyConfiguration(
    family,
    integrationContract,
    targetName
  );
  assert(
    JSON.stringify(derived.configuration) ===
      JSON.stringify(expectedConfiguration),
    `${context}.rawState facts do not match the approved integration contract`
  );
  const steps = requireArray(provenance.steps, `${context}.provenance.steps`);
  assert(
    steps.length === 1,
    `${context}.provenance.steps must contain one complete probe step`
  );
  const step = requireRecord(steps[0], `${context}.provenance.steps[0]`);
  assertExactRecordKeys(
    step,
    ['stepId', 'status', 'rowCount', 'responseBodySha256'],
    `${context}.provenance.steps[0]`
  );
  assert(
    step.stepId === `${request.probeId}-01` &&
      step.status === 'COMMAND_OK' &&
      step.rowCount === catalogRows.length &&
      step.responseBodySha256 === sha256Text(JSON.stringify(rawState)),
    `${context}.provenance.steps[0] response provenance drift`
  );
  const destinationFingerprintSha256 = rawState.destinationFingerprintSha256;
  assert(
    (derived.operationMode === 'DISABLED' &&
      destinationFingerprintSha256 === null) ||
      (derived.operationMode === 'SANDBOXED' &&
        typeof destinationFingerprintSha256 === 'string' &&
        SHA256_PATTERN.test(destinationFingerprintSha256)),
    `${context}.rawState destination fingerprint boundary drift`
  );
  return {
    observationId,
    family,
    transport: expectedTransport,
    observedAt,
    operationMode: derived.operationMode,
    pendingExternalOperationCount: pendingExternalOperations.length,
    attemptedRealDispatchCount: attemptedRealDispatches.length,
    providerRealDispatchCount: providerRealDispatches.length,
    duplicateCount: duplicateReceipts.length,
    productionIdentityDetected: productionIdentityMatches.length > 0,
    secretValueCaptured: false,
    destinationFingerprintSha256,
    configuration: derived.configuration,
  };
}

function verifyExternalSideEffectTarget({
  manifest,
  targetName,
  expectedResultType,
  expectedCommandId,
  expectedTargetKind,
  expectedProjectRef,
  expectedGitCommit,
  expectedRuntimeIdentity,
  expectedCredentialConfiguration,
  serviceRoleCredentialConfiguration,
  approvedIntegrationContract,
  approvedCredentialContract,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  commands,
}) {
  const sideEffectContainer = requireRecord(
    manifest.externalSideEffects,
    'externalSideEffects'
  );
  const integrationContract = readJsonFile(
    approvedIntegrationContract.absolutePath,
    `externalSideEffects.${targetName}.approvedIntegrationContract`
  );
  const summary = requireRecord(
    sideEffectContainer[targetName],
    `externalSideEffects.${targetName}`
  );
  assert(
    summary.status === 'PASS' &&
      ['DISABLED', 'SANDBOXED'].includes(summary.mode) &&
      summary.attemptedRealDispatchCount === 0 &&
      summary.providerRealDispatchCount === 0 &&
      summary.duplicateCount === 0 &&
      summary.pendingExternalOperationCount === 0 &&
      summary.productionIdentityDetected === false,
    `externalSideEffects.${targetName} must PASS with zero real, pending, duplicate, and production-identity observations`
  );
  const serviceRoleReportBinding = verifyServiceRoleNonExposureBoundary(
    summary.serviceRoleNonExposure,
    `externalSideEffects.${targetName}.serviceRoleNonExposure`,
    manifest,
    expectedTargetKind,
    expectedProjectRef,
    serviceRoleCredentialConfiguration,
    artifactPaths,
    artifactHashes,
    artifactFiles
  );
  const commandId = requireConcreteString(
    summary.commandId,
    `externalSideEffects.${targetName}.commandId`
  );
  assert(
    commandId === expectedCommandId,
    `externalSideEffects.${targetName}.commandId mismatch`
  );
  const command = commands.find(candidate => candidate.id === commandId);
  assert(command, `externalSideEffects.${targetName} command is missing`);
  assert(
    command.remoteContact === true &&
      command.mutating === false &&
      command.mutationScope === 'NONE',
    `externalSideEffects.${targetName} command policy drift`
  );
  const resultBinding = verifyBoundArtifact(
    {
      path: summary.artifactPath,
      sha256: summary.artifactSha256,
    },
    `externalSideEffects.${targetName}.result`,
    artifactHashes,
    artifactFiles
  );
  assert(
    command.stdoutPath.replaceAll('\\', '/') === resultBinding.path &&
      command.stdoutSha256 === resultBinding.sha256,
    `externalSideEffects.${targetName} result is not the exact command stdout`
  );
  const result = readJsonFile(
    resultBinding.absolutePath,
    `externalSideEffects.${targetName}.result`
  );
  assertJsonEquivalent(
    result.serviceRoleNonExposure,
    summary.serviceRoleNonExposure,
    `externalSideEffects.${targetName}.serviceRoleNonExposure`
  );
  const capturedAt = requireIsoTimestamp(
    summary.capturedAt,
    `externalSideEffects.${targetName}.capturedAt`
  );
  assert(
    result.schemaVersion === 1 &&
      result.resultType === expectedResultType &&
      result.status === 'PASS' &&
      result.commandId === commandId &&
      result.capturedAt === capturedAt &&
      command.endedAt === capturedAt &&
      result.mode === summary.mode &&
      result.attemptedRealDispatchCount === 0 &&
      result.providerRealDispatchCount === 0 &&
      result.duplicateCount === 0 &&
      result.pendingExternalOperationCount === 0 &&
      result.productionIdentityDetected === false &&
      result.secretValuesCaptured === false &&
      result.privacyScanStatus === 'PASS',
    `externalSideEffects.${targetName} result identity or aggregate mismatch`
  );
  if (targetName === 'source') {
    assert(
      result.projectRef === expectedProjectRef &&
        requireGitCommit(
          result.gitCommit,
          'source external-side-effect gitCommit'
        ) === expectedGitCommit,
      'source external-side-effect project ref or git commit mismatch'
    );
  } else {
    assert(
      result.restoreProjectRef === expectedProjectRef,
      'restore external-side-effect project ref mismatch'
    );
  }
  verifyRuntimeIdentityBinding(
    result.runtimeIdentity,
    expectedRuntimeIdentity,
    `externalSideEffects.${targetName}.result.runtimeIdentity`
  );
  for (const [field, approved, context] of [
    [
      'integrationContract',
      approvedIntegrationContract,
      `externalSideEffects.${targetName}.result.integrationContract`,
    ],
    [
      'credentialContract',
      approvedCredentialContract,
      `externalSideEffects.${targetName}.result.credentialContract`,
    ],
    [
      'credentialProviderConfiguration',
      expectedCredentialConfiguration,
      `externalSideEffects.${targetName}.result.credentialProviderConfiguration`,
    ],
  ]) {
    const candidate = requireRecord(result[field], context);
    assertBindingMatch(candidate.path, candidate.sha256, approved, context);
  }
  assertExactStringArray(
    requireConcreteStringArray(
      result.observationFamilies,
      `externalSideEffects.${targetName}.result.observationFamilies`
    ),
    REQUIRED_SIDE_EFFECT_FAMILIES,
    `externalSideEffects.${targetName}.result.observationFamilies`
  );
  const rawBindings = requireArray(
    result.rawEvidence,
    `externalSideEffects.${targetName}.result.rawEvidence`
  ).map((value, index) =>
    verifyBoundArtifact(
      value,
      `externalSideEffects.${targetName}.result.rawEvidence[${String(index)}]`,
      artifactHashes,
      artifactFiles
    )
  );
  assert(
    rawBindings.length > 0,
    `externalSideEffects.${targetName}.result.rawEvidence must not be empty`
  );
  const rawObservations = [];
  const rawArtifactPaths = new Set();
  for (const [index, rawBinding] of rawBindings.entries()) {
    assert(
      !rawArtifactPaths.has(rawBinding.path),
      `externalSideEffects.${targetName}.rawEvidence reuses ${rawBinding.path}`
    );
    rawArtifactPaths.add(rawBinding.path);
    const raw = readJsonFile(
      rawBinding.absolutePath,
      `externalSideEffects.${targetName}.rawEvidence[${String(index)}]`
    );
    const rawCapturedAt = requireIsoTimestamp(
      raw.capturedAt,
      `externalSideEffects.${targetName}.rawEvidence[${String(index)}].capturedAt`
    );
    assertExactRecordKeys(
      raw,
      [
        'schemaVersion',
        'resultType',
        'status',
        'targetKind',
        'commandId',
        'projectRef',
        'capturedAt',
        'observations',
      ],
      `externalSideEffects.${targetName}.rawEvidence[${String(index)}]`
    );
    assert(
      raw.schemaVersion === 1 &&
        raw.resultType === 'EXTERNAL_SIDE_EFFECT_RAW_EVIDENCE' &&
        raw.status === 'CAPTURED' &&
        raw.targetKind === expectedTargetKind &&
        raw.commandId === commandId &&
        raw.projectRef === expectedProjectRef &&
        rawCapturedAt === capturedAt,
      `externalSideEffects.${targetName} raw envelope identity mismatch`
    );
    rawObservations.push(
      ...requireArray(
        raw.observations,
        `externalSideEffects.${targetName}.rawEvidence[${String(index)}].observations`
      ).map((value, observationIndex) => {
        const observationContext = `externalSideEffects.${targetName}.rawEvidence[${String(index)}].observations[${String(observationIndex)}]`;
        return deriveExternalSideEffectObservation(
          requireRecord(value, observationContext),
          integrationContract,
          targetName,
          command,
          observationContext
        );
      })
    );
  }
  const normalizedObservations = requireArray(
    result.observations,
    `externalSideEffects.${targetName}.result.observations`
  ).map((value, index) =>
    requireRecord(
      value,
      `externalSideEffects.${targetName}.result.observations[${String(index)}]`
    )
  );
  assert(
    JSON.stringify(normalizedObservations) === JSON.stringify(rawObservations),
    `externalSideEffects.${targetName} normalized observations do not derive exactly from raw evidence`
  );
  assertExactStringArray(
    rawObservations.map(observation =>
      requireConcreteString(
        observation.family,
        `externalSideEffects.${targetName}.observation.family`
      )
    ),
    REQUIRED_SIDE_EFFECT_FAMILIES,
    `externalSideEffects.${targetName} observation families`
  );
  const seenObservationIds = new Set();
  for (const [index, observation] of rawObservations.entries()) {
    const context = `externalSideEffects.${targetName}.observations[${String(index)}]`;
    assertExactRecordKeys(
      observation,
      [
        'observationId',
        'family',
        'transport',
        'observedAt',
        'operationMode',
        'pendingExternalOperationCount',
        'attemptedRealDispatchCount',
        'providerRealDispatchCount',
        'duplicateCount',
        'productionIdentityDetected',
        'secretValueCaptured',
        'destinationFingerprintSha256',
        'configuration',
      ],
      context
    );
    const observationId = requireConcreteString(
      observation.observationId,
      `${context}.observationId`
    );
    assert(!seenObservationIds.has(observationId), `${context} duplicate ID`);
    seenObservationIds.add(observationId);
    const observedAt = requireIsoTimestamp(
      observation.observedAt,
      `${context}.observedAt`
    );
    const expectedConfiguration = expectedSideEffectFamilyConfiguration(
      observation.family,
      integrationContract,
      targetName
    );
    const observedConfiguration = requireRecord(
      observation.configuration,
      `${context}.configuration`
    );
    assert(
      requireConcreteString(observation.transport, `${context}.transport`) &&
        ['DISABLED', 'SANDBOXED'].includes(observation.operationMode) &&
        observation.pendingExternalOperationCount === 0 &&
        observation.attemptedRealDispatchCount === 0 &&
        observation.providerRealDispatchCount === 0 &&
        observation.duplicateCount === 0 &&
        observation.productionIdentityDetected === false &&
        observation.secretValueCaptured === false &&
        ((observation.operationMode === 'DISABLED' &&
          observation.destinationFingerprintSha256 === null) ||
          (observation.operationMode === 'SANDBOXED' &&
            typeof observation.destinationFingerprintSha256 === 'string' &&
            SHA256_PATTERN.test(observation.destinationFingerprintSha256))) &&
        JSON.stringify(observedConfiguration) ===
          JSON.stringify(expectedConfiguration) &&
        Date.parse(command.startedAt) <= Date.parse(observedAt) &&
        Date.parse(observedAt) <= Date.parse(command.endedAt),
      `${context} unsafe state or command-window drift`
    );
  }
  verifyEvidenceReferences(
    result.evidence,
    `externalSideEffects.${targetName}.result.evidence`,
    artifactPaths
  );
  verifyEvidenceReferences(
    summary.evidence,
    `externalSideEffects.${targetName}.evidence`,
    artifactPaths
  );
  return {
    summary,
    result,
    binding: resultBinding,
    command,
    capturedAt,
    rawArtifactPaths,
    serviceRoleReportBinding,
  };
}

function verifyMirroredConfigurationSnapshot({
  snapshot,
  context,
  expectedProjectRef,
  expectedCommandId,
  commands,
  artifactHashes,
  artifactFiles,
}) {
  assertExactRecordKeys(
    snapshot,
    [
      'schemaVersion',
      'resultType',
      'status',
      'projectRef',
      'commandId',
      'observedAt',
      'rawArtifact',
      'configuration',
    ],
    context
  );
  const observedAt = requireIsoTimestamp(
    snapshot.observedAt,
    `${context}.observedAt`
  );
  const command = commands.find(value => value.id === expectedCommandId);
  assert(command, `${context} command is missing`);
  const rawBinding = verifyBoundArtifact(
    snapshot.rawArtifact,
    `${context}.rawArtifact`,
    artifactHashes,
    artifactFiles
  );
  const raw = readJsonFile(rawBinding.absolutePath, `${context}.rawArtifact`);
  assertExactRecordKeys(
    raw,
    [
      'schemaVersion',
      'resultType',
      'projectRef',
      'commandId',
      'projectResponse',
      'computeResponse',
      'dashboardSettingsExport',
      'observedAt',
    ],
    `${context}.rawArtifact`
  );
  const projectResponse = requireRecord(
    raw.projectResponse,
    `${context}.rawArtifact.projectResponse`
  );
  const projectRequest = requireRecord(
    projectResponse.request,
    `${context}.rawArtifact.projectResponse.request`
  );
  const projectResult = requireRecord(
    projectResponse.response,
    `${context}.rawArtifact.projectResponse.response`
  );
  const projectBody = requireRecord(
    projectResult.body,
    `${context}.rawArtifact.projectResponse.response.body`
  );
  const computeResponse = requireRecord(
    raw.computeResponse,
    `${context}.rawArtifact.computeResponse`
  );
  const computeRequest = requireRecord(
    computeResponse.request,
    `${context}.rawArtifact.computeResponse.request`
  );
  const computeResult = requireRecord(
    computeResponse.response,
    `${context}.rawArtifact.computeResponse.response`
  );
  const computeBody = requireRecord(
    computeResult.body,
    `${context}.rawArtifact.computeResponse.response.body`
  );
  const activeCompute = requireArray(
    computeBody.selected_addons,
    `${context}.rawArtifact.computeResponse.response.body.selected_addons`
  )
    .map((value, index) =>
      requireRecord(
        value,
        `${context}.rawArtifact.computeResponse.response.body.selected_addons[${String(index)}]`
      )
    )
    .find(value => value.status === 'ACTIVE');
  assert(activeCompute, `${context} has no active compute addon`);
  const dashboard = requireRecord(
    raw.dashboardSettingsExport,
    `${context}.rawArtifact.dashboardSettingsExport`
  );
  const expectedConfiguration = {
    region: projectBody.region,
    computeAddonVariant: activeCompute.variant,
    diskAttributes: dashboard.diskAttributes,
    sslEnforcement: dashboard.sslEnforcement,
    networkRestrictions: dashboard.networkRestrictions,
  };
  assert(
    snapshot.schemaVersion === 1 &&
      snapshot.resultType === 'PROJECT_MIRRORED_CONFIGURATION_SNAPSHOT' &&
      snapshot.status === 'CAPTURED' &&
      snapshot.projectRef === expectedProjectRef &&
      snapshot.commandId === expectedCommandId &&
      raw.schemaVersion === 1 &&
      raw.resultType === 'PROJECT_MIRRORED_CONFIGURATION_RAW' &&
      raw.projectRef === expectedProjectRef &&
      raw.commandId === expectedCommandId &&
      raw.observedAt === observedAt &&
      projectRequest.method === 'GET' &&
      projectRequest.url ===
        `https://api.supabase.com/v1/projects/${expectedProjectRef}` &&
      projectResult.status === 200 &&
      computeRequest.method === 'GET' &&
      computeRequest.url ===
        `https://api.supabase.com/v1/projects/${expectedProjectRef}/billing/addons` &&
      computeResult.status === 200 &&
      dashboard.captureMethod === 'SUPABASE_DASHBOARD_SETTINGS_EXPORT' &&
      JSON.stringify(snapshot.configuration) ===
        JSON.stringify(expectedConfiguration) &&
      Date.parse(command.startedAt) <= Date.parse(observedAt) &&
      Date.parse(observedAt) <= Date.parse(command.endedAt),
    `${context} is not derived from command-scoped provider configuration evidence`
  );
  return { observedAt, rawBinding, configuration: expectedConfiguration };
}

function verifyDrExcludedManualScope({
  manifest,
  sourceEnvironment,
  restoreEnvironment,
  commands,
  postRestoreOperation,
  projectionContract,
  projectionContractSha256,
  projectionCollectorBinding,
  targetCredentialConfigurations,
  artifactHashes,
  artifactFiles,
}) {
  const inventoryCollectors = requireRecord(
    projectionContract.inventoryCollectors,
    'DR platform projection contract inventoryCollectors'
  );
  assertExactRecordKeys(
    inventoryCollectors,
    ['managementApiLists', 'dashboardReadReplicas', 'databaseCatalog'],
    'DR platform projection contract inventoryCollectors'
  );
  const managementListContract = requireRecord(
    inventoryCollectors.managementApiLists,
    'DR platform projection contract managementApiLists'
  );
  assertExactRecordKeys(
    managementListContract,
    ['storageBuckets', 'edgeFunctions'],
    'DR platform projection contract managementApiLists'
  );
  const dashboardContract = requireRecord(
    inventoryCollectors.dashboardReadReplicas,
    'DR platform projection contract dashboardReadReplicas'
  );
  assertExactRecordKeys(
    dashboardContract,
    ['captureMethod', 'pageId', 'passCondition', 'persistRawSnapshot'],
    'DR platform projection contract dashboardReadReplicas'
  );
  const databaseCatalogContract = requireRecord(
    inventoryCollectors.databaseCatalog,
    'DR platform projection contract databaseCatalog'
  );
  assertExactRecordKeys(
    databaseCatalogContract,
    [
      'querySetId',
      'queries',
      'rawQueryOutputPersistence',
      'secretValuesCaptured',
    ],
    'DR platform projection contract databaseCatalog'
  );
  const databaseQueries = requireArray(
    databaseCatalogContract.queries,
    'DR platform projection contract databaseCatalog.queries'
  ).map((value, index) => {
    const query = requireRecord(
      value,
      `DR platform projection contract databaseCatalog.queries[${String(index)}]`
    );
    assertExactRecordKeys(
      query,
      ['id', 'sql'],
      `DR platform projection contract databaseCatalog.queries[${String(index)}]`
    );
    return {
      id: requireConcreteString(
        query.id,
        `DR platform projection contract query ${String(index)} id`
      ),
      sql: requireConcreteString(
        query.sql,
        `DR platform projection contract query ${String(index)} sql`
      ),
    };
  });
  assert(
    new Set(databaseQueries.map(query => query.id)).size ===
      databaseQueries.length &&
      databaseQueries.length === 6 &&
      databaseCatalogContract.querySetId === 'PR12-DR-DATABASE-CATALOG-V1' &&
      databaseCatalogContract.rawQueryOutputPersistence === 'HASH_ONLY' &&
      databaseCatalogContract.secretValuesCaptured === false,
    'DR database catalog query contract is incomplete or unsafe'
  );
  const databaseQuerySetSha256 = sha256Text(
    JSON.stringify(canonicalizeJson(databaseQueries))
  );
  const scopeManifest = requireRecord(
    manifest.drScopeInventory,
    'drScopeInventory'
  );
  assertExactRecordKeys(
    scopeManifest,
    ['source', 'restore', 'comparison'],
    'drScopeInventory'
  );
  const expectedTargets = [
    {
      name: 'source',
      kind: 'SOURCE',
      environment: sourceEnvironment,
      commandId: 'PR12-CMD-016A',
    },
    {
      name: 'restore',
      kind: 'RESTORE',
      environment: restoreEnvironment,
      commandId: 'PR12-CMD-019A',
    },
  ];
  const verified = new Map();
  for (const target of expectedTargets) {
    const binding = verifyBoundArtifact(
      scopeManifest[target.name],
      `drScopeInventory.${target.name}`,
      artifactHashes,
      artifactFiles
    );
    const result = readJsonFile(
      binding.absolutePath,
      `drScopeInventory.${target.name}.result`
    );
    assertExactRecordKeys(
      result,
      [
        'schemaVersion',
        'resultType',
        'status',
        'targetKind',
        'projectRef',
        'commandId',
        'observedAt',
        'runtimeIdentity',
        'managementApi',
        'dashboardExport',
        'databaseCatalog',
        'credentialProviderConfiguration',
        'credentialValuesCaptured',
        'secretValuesCaptured',
      ],
      `drScopeInventory.${target.name}.result`
    );
    const observedAt = requireIsoTimestamp(
      result.observedAt,
      `drScopeInventory.${target.name}.result.observedAt`
    );
    const command = commands.find(value => value.id === target.commandId);
    assert(command, `DR scope command is missing: ${target.commandId}`);
    const commandStdoutBinding = verifyBoundArtifact(
      { path: command.stdoutPath, sha256: command.stdoutSha256 },
      `drScopeInventory.${target.name}.commandStdout`,
      artifactHashes,
      artifactFiles
    );
    const commandStdout = readJsonFile(
      commandStdoutBinding.absolutePath,
      `drScopeInventory.${target.name}.commandStdout.result`
    );
    const stdoutScopeBinding = verifyBoundArtifact(
      commandStdout.drScopeInventory,
      `drScopeInventory.${target.name}.commandStdout.drScopeInventory`,
      artifactHashes,
      artifactFiles
    );
    assertBindingMatch(
      binding.path,
      binding.sha256,
      stdoutScopeBinding,
      `drScopeInventory.${target.name}.commandStdout.drScopeInventory`
    );
    assert(
      result.schemaVersion === 1 &&
        result.resultType === 'DR_EXCLUDED_MANUAL_SCOPE_RAW_EVIDENCE' &&
        result.status === 'CAPTURED' &&
        result.targetKind === target.kind &&
        result.projectRef === target.environment.projectRef &&
        result.commandId === target.commandId &&
        Date.parse(command.startedAt) <= Date.parse(observedAt) &&
        Date.parse(observedAt) <= Date.parse(command.endedAt) &&
        result.credentialValuesCaptured === false &&
        result.secretValuesCaptured === false,
      `DR excluded/manual scope identity or secret boundary mismatch: ${target.name}`
    );
    verifyRuntimeIdentityBinding(
      result.runtimeIdentity,
      target.environment,
      `drScopeInventory.${target.name}.result.runtimeIdentity`
    );
    const expectedCredentialConfiguration = targetCredentialConfigurations.get(
      target.kind
    );
    assert(
      expectedCredentialConfiguration,
      `DR scope credential configuration is missing: ${target.name}`
    );
    const scopeCredentialBinding = verifyBoundArtifact(
      result.credentialProviderConfiguration,
      `drScopeInventory.${target.name}.result.credentialProviderConfiguration`,
      artifactHashes,
      artifactFiles
    );
    assertBindingMatch(
      scopeCredentialBinding.path,
      scopeCredentialBinding.sha256,
      expectedCredentialConfiguration.binding,
      `DR scope credential provider configuration: ${target.name}`
    );
    assert(
      expectedCredentialConfiguration.apiKeysPresent === true,
      `DR scope ${target.name} target-specific API-key presence is not collector-derived`
    );
    const managementApi = requireRecord(
      result.managementApi,
      `drScopeInventory.${target.name}.result.managementApi`
    );
    assertExactRecordKeys(
      managementApi,
      [
        'storageBuckets',
        'edgeFunctions',
        'authConfig',
        'realtimeConfig',
        'storageConfig',
      ],
      `drScopeInventory.${target.name}.result.managementApi`
    );
    const listObservations = [
      ['storageBuckets', 'storage/buckets'],
      ['edgeFunctions', 'functions'],
    ];
    for (const [field, endpoint] of listObservations) {
      const observation = requireRecord(
        managementApi[field],
        `drScopeInventory.${target.name}.result.managementApi.${field}`
      );
      assertExactRecordKeys(
        observation,
        [
          'request',
          'responseStatus',
          'collector',
          'canonicalResponseSha256',
          'items',
          'rawResponsePersisted',
          'secretValuesCaptured',
        ],
        `drScopeInventory.${target.name}.result.managementApi.${field}`
      );
      const request = requireRecord(
        observation.request,
        `drScopeInventory.${target.name}.result.managementApi.${field}.request`
      );
      assertExactRecordKeys(
        request,
        ['method', 'url', 'authorizationHeaderCaptured'],
        `drScopeInventory.${target.name}.result.managementApi.${field}.request`
      );
      const collectorBinding = verifyBoundArtifact(
        observation.collector,
        `drScopeInventory.${target.name}.result.managementApi.${field}.collector`,
        artifactHashes,
        artifactFiles
      );
      assertBindingMatch(
        collectorBinding.path,
        collectorBinding.sha256,
        projectionCollectorBinding,
        `DR ${field} collector: ${target.name}`
      );
      const listContract = requireRecord(
        managementListContract[field],
        `DR platform projection contract managementApiLists.${field}`
      );
      assertExactRecordKeys(
        listContract,
        [
          'method',
          'pathTemplate',
          'passCondition',
          'persistResponseOnlyWhenEmpty',
        ],
        `DR platform projection contract managementApiLists.${field}`
      );
      const items = requireArray(
        observation.items,
        `drScopeInventory.${target.name}.result.managementApi.${field}.items`
      );
      assert(
        request.method === 'GET' &&
          request.url ===
            `https://api.supabase.com/v1/projects/${target.environment.projectRef}/${endpoint}` &&
          request.authorizationHeaderCaptured === false &&
          observation.responseStatus === 200 &&
          observation.canonicalResponseSha256 ===
            sha256Text(JSON.stringify(canonicalizeJson(items))) &&
          items.length === 0 &&
          observation.rawResponsePersisted === true &&
          observation.secretValuesCaptured === false &&
          listContract.method === 'GET' &&
          listContract.pathTemplate ===
            `/v1/projects/{project_ref}/${endpoint}` &&
          listContract.passCondition === 'HTTP_200_AND_EMPTY_ARRAY' &&
          listContract.persistResponseOnlyWhenEmpty === true,
        `DR ${field} inventory lacks fresh typed Management API provenance or is non-empty: ${target.name}`
      );
    }
    const configFields = [
      [
        'authConfig',
        'config/auth',
        'AuthConfigResponse',
        237,
        '0b0e65320da7a2289eac69c65b5cda3de793dc9f1c53927c04d12a357c13b9f8',
      ],
      [
        'realtimeConfig',
        'config/realtime',
        'RealtimeConfigResponse',
        11,
        '09a565f576fa42a04652d68d307fa5cd1edb69a42f24fe51d34c96176741532e',
      ],
      [
        'storageConfig',
        'config/storage',
        'StorageConfigResponse',
        6,
        '9239cf272f3a3e92e55a9e9d5ef0ed7e1a4e56e7dc76ee5a00a8c0942f97bf80',
      ],
    ];
    for (const [
      field,
      endpoint,
      schemaName,
      propertyCount,
      propertyNamesSha256,
    ] of configFields) {
      const observation = requireRecord(
        managementApi[field],
        `drScopeInventory.${target.name}.result.managementApi.${field}`
      );
      assertExactRecordKeys(
        observation,
        [
          'request',
          'responseStatus',
          'projectionContract',
          'collector',
          'schemaName',
          'propertyCount',
          'schemaPropertyNamesSha256',
          'sanitizedCanonicalSha256',
          'sensitiveConfiguredPresenceSha256',
          'unknownFields',
          'rawResponsePersisted',
        ],
        `drScopeInventory.${target.name}.result.managementApi.${field}`
      );
      const request = requireRecord(
        observation.request,
        `drScopeInventory.${target.name}.result.managementApi.${field}.request`
      );
      assertExactRecordKeys(
        request,
        ['method', 'url', 'authorizationHeaderCaptured'],
        `drScopeInventory.${target.name}.result.managementApi.${field}.request`
      );
      const contractBinding = verifyBoundArtifact(
        observation.projectionContract,
        `drScopeInventory.${target.name}.result.managementApi.${field}.projectionContract`,
        artifactHashes,
        artifactFiles
      );
      assert(
        contractBinding.sha256 === projectionContractSha256,
        `DR ${field} projection contract SHA mismatch: ${target.name}`
      );
      const collectorBinding = verifyBoundArtifact(
        observation.collector,
        `drScopeInventory.${target.name}.result.managementApi.${field}.collector`,
        artifactHashes,
        artifactFiles
      );
      assertBindingMatch(
        collectorBinding.path,
        collectorBinding.sha256,
        projectionCollectorBinding,
        `DR ${field} projection collector: ${target.name}`
      );
      assert(
        request.method === 'GET' &&
          request.url ===
            `https://api.supabase.com/v1/projects/${target.environment.projectRef}/${endpoint}` &&
          request.authorizationHeaderCaptured === false &&
          observation.responseStatus === 200 &&
          observation.schemaName === schemaName &&
          observation.propertyCount === propertyCount &&
          observation.schemaPropertyNamesSha256 === propertyNamesSha256 &&
          SHA256_PATTERN.test(
            requireConcreteString(
              observation.sanitizedCanonicalSha256,
              `DR ${field} sanitized canonical SHA`
            )
          ) &&
          SHA256_PATTERN.test(
            requireConcreteString(
              observation.sensitiveConfiguredPresenceSha256,
              `DR ${field} sensitive configured-presence SHA`
            )
          ) &&
          requireArray(
            observation.unknownFields,
            `drScopeInventory.${target.name}.result.managementApi.${field}.unknownFields`
          ).length === 0 &&
          observation.rawResponsePersisted === false,
        `DR ${field} full-schema projection mismatch: ${target.name}`
      );
    }
    const dashboard = requireRecord(
      result.dashboardExport,
      `drScopeInventory.${target.name}.result.dashboardExport`
    );
    assertExactRecordKeys(
      dashboard,
      [
        'captureMethod',
        'pageId',
        'collector',
        'readReplicaRefs',
        'observedAt',
        'snapshotCanonicalSha256',
        'rawSnapshotPersisted',
        'secretValuesCaptured',
      ],
      `drScopeInventory.${target.name}.result.dashboardExport`
    );
    const dashboardCollectorBinding = verifyBoundArtifact(
      dashboard.collector,
      `drScopeInventory.${target.name}.result.dashboardExport.collector`,
      artifactHashes,
      artifactFiles
    );
    assertBindingMatch(
      dashboardCollectorBinding.path,
      dashboardCollectorBinding.sha256,
      projectionCollectorBinding,
      `DR dashboard collector: ${target.name}`
    );
    const readReplicaRefs = requireConcreteStringArray(
      dashboard.readReplicaRefs,
      `drScopeInventory.${target.name}.result.dashboardExport.readReplicaRefs`,
      { allowEmpty: true }
    );
    assert(
      dashboard.captureMethod === dashboardContract.captureMethod &&
        dashboard.pageId === dashboardContract.pageId &&
        dashboard.captureMethod === 'SUPABASE_DASHBOARD_SETTINGS_EXPORT' &&
        dashboard.pageId === 'DATABASE_READ_REPLICAS' &&
        readReplicaRefs.length === 0 &&
        dashboard.observedAt === observedAt &&
        dashboard.snapshotCanonicalSha256 ===
          sha256Text(JSON.stringify(canonicalizeJson({ readReplicaRefs }))) &&
        dashboard.rawSnapshotPersisted === false &&
        dashboard.secretValuesCaptured === false &&
        dashboardContract.passCondition === 'NO_READ_REPLICA_PROJECT_REFS' &&
        dashboardContract.persistRawSnapshot === false,
      `DR read-replica inventory lacks typed Dashboard provenance or is non-empty: ${target.name}`
    );
    const catalog = requireRecord(
      result.databaseCatalog,
      `drScopeInventory.${target.name}.result.databaseCatalog`
    );
    assertExactRecordKeys(
      catalog,
      [
        'collector',
        'querySetId',
        'querySetSha256',
        'queryEvidence',
        'observedAt',
        'storageBucketRowCount',
        'storageObjectMetadataRowCount',
        'customRolesRequiringPasswords',
        'extensionCatalog',
        'normalizedDatabaseSettings',
        'realtimePublicationTables',
        'normalizedCatalogSha256',
        'rawQueryOutputPersisted',
        'secretValuesCaptured',
      ],
      `drScopeInventory.${target.name}.result.databaseCatalog`
    );
    const catalogCollectorBinding = verifyBoundArtifact(
      catalog.collector,
      `drScopeInventory.${target.name}.result.databaseCatalog.collector`,
      artifactHashes,
      artifactFiles
    );
    assertBindingMatch(
      catalogCollectorBinding.path,
      catalogCollectorBinding.sha256,
      projectionCollectorBinding,
      `DR database catalog collector: ${target.name}`
    );
    const queryEvidence = requireArray(
      catalog.queryEvidence,
      `drScopeInventory.${target.name}.result.databaseCatalog.queryEvidence`
    ).map((value, index) => {
      const evidence = requireRecord(
        value,
        `drScopeInventory.${target.name}.result.databaseCatalog.queryEvidence[${String(index)}]`
      );
      assertExactRecordKeys(
        evidence,
        ['queryId', 'querySha256', 'observedAt'],
        `drScopeInventory.${target.name}.result.databaseCatalog.queryEvidence[${String(index)}]`
      );
      return evidence;
    });
    assert(
      queryEvidence.length === databaseQueries.length,
      `DR database catalog query evidence count mismatch: ${target.name}`
    );
    for (const [index, query] of databaseQueries.entries()) {
      const evidence = queryEvidence[index];
      assert(
        evidence &&
          evidence.queryId === query.id &&
          evidence.querySha256 === sha256Text(query.sql) &&
          evidence.observedAt === observedAt,
        `DR database catalog query provenance mismatch for ${query.id}: ${target.name}`
      );
    }
    const catalogFacts = {
      storageBucketRowCount: catalog.storageBucketRowCount,
      storageObjectMetadataRowCount: catalog.storageObjectMetadataRowCount,
      customRolesRequiringPasswords: catalog.customRolesRequiringPasswords,
      extensionCatalog: catalog.extensionCatalog,
      normalizedDatabaseSettings: catalog.normalizedDatabaseSettings,
      realtimePublicationTables: catalog.realtimePublicationTables,
    };
    assert(
      catalog.querySetId === databaseCatalogContract.querySetId &&
        catalog.querySetSha256 === databaseQuerySetSha256 &&
        catalog.observedAt === observedAt &&
        catalog.storageBucketRowCount === 0 &&
        catalog.storageObjectMetadataRowCount === 0 &&
        requireArray(
          catalog.customRolesRequiringPasswords,
          `drScopeInventory.${target.name}.result.databaseCatalog.customRolesRequiringPasswords`
        ).length === 0 &&
        requireConcreteStringArray(
          catalog.extensionCatalog,
          `drScopeInventory.${target.name}.result.databaseCatalog.extensionCatalog`
        ).length > 0 &&
        requireConcreteStringArray(
          catalog.normalizedDatabaseSettings,
          `drScopeInventory.${target.name}.result.databaseCatalog.normalizedDatabaseSettings`
        ).length > 0 &&
        JSON.stringify(
          requireConcreteStringArray(
            catalog.realtimePublicationTables,
            `drScopeInventory.${target.name}.result.databaseCatalog.realtimePublicationTables`
          )
        ) ===
          JSON.stringify(['public.chat_messages', 'public.notifications']) &&
        catalog.normalizedCatalogSha256 ===
          sha256Text(JSON.stringify(canonicalizeJson(catalogFacts))) &&
        catalog.rawQueryOutputPersisted === false &&
        catalog.secretValuesCaptured === false,
      `DR Storage rows or database catalog typed evidence mismatch: ${target.name}`
    );
    verified.set(target.name, { binding, result });
  }
  const source = verified.get('source');
  const restore = verified.get('restore');
  assert(source && restore, 'DR scope source/restore evidence is incomplete');
  assert(
    source.binding.path !== restore.binding.path &&
      source.binding.sha256 !== restore.binding.sha256,
    'DR scope source and restore must use distinct raw artifacts'
  );
  const sourceManagement = requireRecord(
    source.result.managementApi,
    'drScopeInventory.source.result.managementApi'
  );
  const restoreManagement = requireRecord(
    restore.result.managementApi,
    'drScopeInventory.restore.result.managementApi'
  );
  for (const field of ['authConfig', 'realtimeConfig', 'storageConfig']) {
    const sourceConfig = requireRecord(sourceManagement[field], field);
    const restoreConfig = requireRecord(restoreManagement[field], field);
    assert(
      sourceConfig.schemaName === restoreConfig.schemaName &&
        sourceConfig.propertyCount === restoreConfig.propertyCount &&
        sourceConfig.schemaPropertyNamesSha256 ===
          restoreConfig.schemaPropertyNamesSha256 &&
        sourceConfig.sanitizedCanonicalSha256 ===
          restoreConfig.sanitizedCanonicalSha256 &&
        sourceConfig.sensitiveConfiguredPresenceSha256 ===
          restoreConfig.sensitiveConfiguredPresenceSha256,
      `DR ${field} full-schema projection differs between source and restore`
    );
  }
  const sourceCatalog = requireRecord(
    source.result.databaseCatalog,
    'drScopeInventory.source.result.databaseCatalog'
  );
  const restoreCatalog = requireRecord(
    restore.result.databaseCatalog,
    'drScopeInventory.restore.result.databaseCatalog'
  );
  assert(
    sourceCatalog.querySetId === restoreCatalog.querySetId &&
      sourceCatalog.querySetSha256 === restoreCatalog.querySetSha256 &&
      sourceCatalog.normalizedCatalogSha256 ===
        restoreCatalog.normalizedCatalogSha256,
    'DR Storage, extension, database-setting, or Realtime publication parity mismatch'
  );
  const comparisonBinding = verifyBoundArtifact(
    scopeManifest.comparison,
    'drScopeInventory.comparison',
    artifactHashes,
    artifactFiles
  );
  const finalOperationComparisonBinding = verifyBoundArtifact(
    postRestoreOperation.drScopeComparison,
    'restore.postRestoreQualificationOperation.drScopeComparison',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    comparisonBinding.path,
    comparisonBinding.sha256,
    finalOperationComparisonBinding,
    'DR scope final operation comparison'
  );
  const comparison = readJsonFile(
    comparisonBinding.absolutePath,
    'drScopeInventory.comparison.result'
  );
  assertExactRecordKeys(
    comparison,
    [
      'schemaVersion',
      'resultType',
      'status',
      'commandId',
      'capturedAt',
      'source',
      'restore',
      'assertions',
      'secretValuesCaptured',
    ],
    'drScopeInventory.comparison.result'
  );
  for (const [name, value] of [
    ['source', source],
    ['restore', restore],
  ]) {
    const comparedBinding = verifyBoundArtifact(
      comparison[name],
      `drScopeInventory.comparison.result.${name}`,
      artifactHashes,
      artifactFiles
    );
    assertBindingMatch(
      comparedBinding.path,
      comparedBinding.sha256,
      value.binding,
      `drScopeInventory.comparison.result.${name}`
    );
  }
  const comparisonAssertions = requireRecord(
    comparison.assertions,
    'drScopeInventory.comparison.result.assertions'
  );
  const requiredAssertions = [
    'storageBucketsAndObjectsZero',
    'edgeFunctionsAbsent',
    'readReplicasAbsent',
    'noCustomRolePasswordDependency',
    'authSettingsParity',
    'realtimeSettingsParity',
    'storageSettingsParity',
    'extensionCatalogParity',
    'databaseSettingsParity',
    'realtimePublicationParity',
    'targetSpecificApiKeysPresentWithoutValueCapture',
  ];
  assertExactRecordKeys(
    comparisonAssertions,
    requiredAssertions,
    'drScopeInventory.comparison.result.assertions'
  );
  assert(
    comparison.schemaVersion === 1 &&
      comparison.resultType === 'DR_EXCLUDED_MANUAL_SCOPE_COMPARISON' &&
      comparison.status === 'PASS' &&
      comparison.commandId === 'PR12-CMD-019F' &&
      comparison.capturedAt === postRestoreOperation.completedAt &&
      requiredAssertions.every(field => comparisonAssertions[field] === true) &&
      targetCredentialConfigurations.get('SOURCE').apiKeysPresent === true &&
      targetCredentialConfigurations.get('RESTORE').apiKeysPresent === true &&
      comparison.secretValuesCaptured === false,
    'DR excluded/manual scope comparison is incomplete or overclaims PASS'
  );
}

function normalizeApprovedDrContract(value) {
  const normalized = JSON.parse(JSON.stringify(value));
  const mutablePaths = [
    'status',
    'executionStatus',
    'clockSkewPolicy.maximumAllowedClockSkewSeconds',
    'clockSkewPolicy.maximumRpoObservationLeadSeconds',
    'clockSkewPolicy.clockProvenanceCollectorStatus',
    'clockSkewPolicy.numericSkewValidatorStatus',
    'clockSkewPolicy.ownerDecision',
    'source.projectRef',
    'source.physicalBackupId',
    'source.providerInsertedAt',
    'restoreTarget.projectRef',
    'watermark.sourceValue',
    'watermark.restoredValue',
    'rto.measuredSeconds',
    'rpo.measuredSeconds',
    'cleanup.cleanupOwner',
    'backupEvidence.selectedBackupId',
    'backupEvidence.selectedBackupMetadataSha256',
    'operationEvidence.clockProvenanceCollectorStatus',
    'operationEvidence.numericSkewValidatorStatus',
    'operationEvidence.monotonicTimerSessionBindingStatus',
    'operationEvidence.monotonicTimerRunnerPath',
    'operationEvidence.monotonicTimerRunnerSha256',
    'operationEvidence.excludedOrManualScopeInventoryStatus',
    'operationEvidence.platformConfigProjectionContractSha256',
    'operationEvidence.platformConfigProjectionCollectorPath',
    'operationEvidence.platformConfigProjectionCollectorSha256',
    'operationEvidence.rtoRpoPassCurrentlyPossible',
    'productTargetConflict.drillExecutionDecision',
    'productTargetConflict.commercialReleaseAuthorityDecision',
    'productTargetConflict.commercialReleaseAuthorizedByThisDecision',
    'productTargetConflict.owner',
    'productTargetConflict.approvedAt',
    'productTargetConflict.evidence',
  ];
  for (const mutablePath of mutablePaths) {
    const parts = mutablePath.split('.');
    let cursor = normalized;
    for (const part of parts.slice(0, -1)) {
      cursor = requireRecord(cursor[part], `DR contract ${mutablePath}`);
    }
    const leaf = parts.at(-1);
    assert(
      leaf !== undefined && Object.hasOwn(cursor, leaf),
      `DR contract mutable path is missing: ${mutablePath}`
    );
    cursor[leaf] = '__OWNER_RUNTIME_MUTABLE__';
  }
  return normalized;
}

function verifyApprovedDrContract(
  approvedDrContract,
  artifactHashes,
  artifactFiles
) {
  const approved = readJsonFile(
    approvedDrContract.absolutePath,
    'approvalPacket.drContract'
  );
  const trackedPath = path.join(
    REPO_ROOT,
    'docs/stabilization/evidence/commercial-hardening/pr12/dr-contract.proposed.json'
  );
  const tracked = readJsonFile(trackedPath, 'trackedDrContract');
  assert(
    JSON.stringify(canonicalizeJson(normalizeApprovedDrContract(approved))) ===
      JSON.stringify(canonicalizeJson(normalizeApprovedDrContract(tracked))),
    'approved DR contract changes an immutable tracked safety boundary'
  );
  assert(
    approved.status === 'OWNER_APPROVED_FOR_EXECUTION' &&
      approved.executionStatus === 'APPROVED_NOT_RUN',
    'approved DR contract status is not owner-approved for this drill'
  );
  const method = requireRecord(
    approved.method,
    'approvalPacket.drContract.method'
  );
  const source = requireRecord(
    approved.source,
    'approvalPacket.drContract.source'
  );
  const restoreTarget = requireRecord(
    approved.restoreTarget,
    'approvalPacket.drContract.restoreTarget'
  );
  const cleanup = requireRecord(
    approved.cleanup,
    'approvalPacket.drContract.cleanup'
  );
  const approvedWatermark = requireRecord(
    approved.watermark,
    'approvalPacket.drContract.watermark'
  );
  const approvedRto = requireRecord(
    approved.rto,
    'approvalPacket.drContract.rto'
  );
  const approvedRpo = requireRecord(
    approved.rpo,
    'approvalPacket.drContract.rpo'
  );
  const approvedBackupEvidence = requireRecord(
    approved.backupEvidence,
    'approvalPacket.drContract.backupEvidence'
  );
  requireConcreteString(
    cleanup.cleanupOwner,
    'approvalPacket.drContract.cleanup.cleanupOwner'
  );
  assert(
    method.backup === 'Supabase Pro daily physical backup' &&
      method.restore === 'Supabase Dashboard Restore to a New Project (Beta)' &&
      method.pitrEnabled === false &&
      method.logicalFallbackAllowedWithoutReapproval === false &&
      method.sourceMustRemainUntouched === true &&
      source.maximumWaitForEligibleBackupHours === 36 &&
      restoreTarget.mustBeNewProject === true &&
      restoreTarget.maximumPreActionInventoryAgeSeconds === 60 &&
      restoreTarget.productionIdentityAllowed === false &&
      cleanup.sourceOrTargetDeletionAuthorized === false &&
      cleanup.separateOwnerApprovalRequired === true &&
      cleanup.automaticDeletionAllowed === false,
    'approved DR physical-only isolation, wait, or cleanup boundary drift'
  );
  assert(
    requireConcreteString(
      source.projectRef,
      'approvalPacket.drContract.source.projectRef'
    ).length > 0 &&
      source.physicalBackupId === 'NOT_CAPTURED' &&
      source.providerInsertedAt === 'NOT_CAPTURED' &&
      restoreTarget.projectRef === 'NOT_CAPTURED' &&
      approvedWatermark.sourceValue === 'NOT_CAPTURED' &&
      approvedWatermark.restoredValue === 'NOT_CAPTURED' &&
      approvedRto.measuredSeconds === 'NOT_CAPTURED' &&
      approvedRpo.measuredSeconds === 'NOT_CAPTURED' &&
      approvedBackupEvidence.selectedBackupId === 'NOT_CAPTURED' &&
      approvedBackupEvidence.selectedBackupMetadataSha256 === 'NOT_CAPTURED',
    'approved DR contract must not pre-claim future backup, restore, watermark, or RTO/RPO results'
  );
  const conflict = requireRecord(
    approved.productTargetConflict,
    'approvalPacket.drContract.productTargetConflict'
  );
  assertExactRecordKeys(
    conflict,
    [
      'drillThresholds',
      'productThresholds',
      'requirementsPath',
      'requirementsSha256',
      'drillExecutionDecision',
      'commercialReleaseAuthorityDecision',
      'commercialReleaseAuthorizedByThisDecision',
      'owner',
      'approvedAt',
      'evidence',
      'releaseMeaning',
    ],
    'approvalPacket.drContract.productTargetConflict'
  );
  const drillThresholds = requireRecord(
    conflict.drillThresholds,
    'approvalPacket.drContract.productTargetConflict.drillThresholds'
  );
  const productThresholds = requireRecord(
    conflict.productThresholds,
    'approvalPacket.drContract.productTargetConflict.productThresholds'
  );
  const requirementsPath = requireConcreteString(
    conflict.requirementsPath,
    'approvalPacket.drContract.productTargetConflict.requirementsPath'
  ).replaceAll('\\', '/');
  assert(
    drillThresholds.rtoSeconds === 28800 &&
      drillThresholds.rpoSeconds === 86400 &&
      productThresholds.rtoSeconds === 1800 &&
      productThresholds.rpoSeconds === 900 &&
      requirementsPath === 'docs/repitte_requirements.md' &&
      requireSha256(
        conflict.requirementsSha256,
        'approvalPacket.drContract.productTargetConflict.requirementsSha256'
      ) === sha256File(path.join(REPO_ROOT, requirementsPath)) &&
      conflict.drillExecutionDecision === 'APPROVED_DRILL_ONLY' &&
      requireConcreteString(
        conflict.owner,
        'approvalPacket.drContract.productTargetConflict.owner'
      ).length > 0,
    'DR drill/product RTO-RPO authority or evidence drift'
  );
  requireIsoTimestamp(
    conflict.approvedAt,
    'approvalPacket.drContract.productTargetConflict.approvedAt',
    { notFuture: true }
  );
  verifyBoundArtifact(
    conflict.evidence,
    'approvalPacket.drContract.productTargetConflict.evidence',
    artifactHashes,
    artifactFiles
  );
  const releaseDecision = conflict.commercialReleaseAuthorityDecision;
  const releaseResolved =
    releaseDecision === 'FORMALLY_ACCEPT_8H_24H_AS_RELEASE_AUTHORITY' &&
    conflict.commercialReleaseAuthorizedByThisDecision === true;
  assert(
    releaseResolved ||
      (releaseDecision === 'UNASSIGNED' &&
        conflict.commercialReleaseAuthorizedByThisDecision === false),
    'DR product-target conflict contains an unsupported release decision'
  );
  return { contract: approved, releaseResolved };
}

function verifyBackupRestoreBound(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  approvedDrContract,
  commandApproval,
  sourceApprovalWindow,
  targetCredentialConfigurations
) {
  const verifiedDrContract = verifyApprovedDrContract(
    approvedDrContract,
    artifactHashes,
    artifactFiles
  );
  const drContract = verifiedDrContract.contract;
  assert(drContract.schemaVersion === 1, 'DR contract schemaVersion drift');
  const approvedCleanup = requireRecord(
    drContract.cleanup,
    'approvalPacket.drContract.cleanup'
  );
  const manifestOwners = requireRecord(manifest.ownership, 'ownership');
  assert(
    approvedCleanup.cleanupOwner === manifestOwners.cleanupOwner,
    'approved DR cleanup owner does not match manifest ownership'
  );
  const approvedRpo = requireRecord(
    drContract.rpo,
    'approvalPacket.drContract.rpo'
  );
  assert(
    drContract.rpoCalculationClock === 'SOURCE_DATABASE_CLOCK_TIMESTAMP_UTC' &&
      approvedRpo.calculationClock === 'SOURCE_DATABASE_CLOCK_TIMESTAMP_UTC',
    'DR RPO calculation clock approval drift'
  );
  const drClockPolicy = requireRecord(
    drContract.clockSkewPolicy,
    'approvalPacket.drContract.clockSkewPolicy'
  );
  const approvedMaximumClockSkewSeconds = requireNumber(
    drClockPolicy.maximumAllowedClockSkewSeconds,
    'approvalPacket.drContract.clockSkewPolicy.maximumAllowedClockSkewSeconds'
  );
  const approvedMaximumRpoObservationLeadSeconds = requireNumber(
    drClockPolicy.maximumRpoObservationLeadSeconds,
    'approvalPacket.drContract.clockSkewPolicy.maximumRpoObservationLeadSeconds'
  );
  assert(
    Number.isInteger(approvedMaximumClockSkewSeconds) &&
      approvedMaximumClockSkewSeconds >= 0 &&
      approvedMaximumClockSkewSeconds <= 300 &&
      Number.isInteger(approvedMaximumRpoObservationLeadSeconds) &&
      approvedMaximumRpoObservationLeadSeconds >= 0 &&
      approvedMaximumRpoObservationLeadSeconds <= 5 &&
      JSON.stringify(drClockPolicy.requiredIndependentSources) ===
        JSON.stringify([
          'Supabase provider operation UTC',
          'source database clock_timestamp() UTC',
          'restore database clock_timestamp() UTC',
          'operator UTC wall-clock anchor',
        ]) &&
      drClockPolicy.operatorMonotonicElapsedTimerRequiredSeparately === true &&
      drClockPolicy.clockProvenanceCollectorStatus === 'IMPLEMENTED_NOT_RUN' &&
      drClockPolicy.numericSkewValidatorStatus === 'IMPLEMENTED' &&
      drClockPolicy.passAllowedBeforeOwnerApproval === false &&
      drClockPolicy.ownerDecision === 'APPROVED',
    'DR multi-clock policy is unresolved, not ready for execution, or exceeds 300 seconds'
  );
  const drOperationEvidence = requireRecord(
    drContract.operationEvidence,
    'approvalPacket.drContract.operationEvidence'
  );
  assert(
    drOperationEvidence.clockProvenanceCollectorStatus ===
      'IMPLEMENTED_NOT_RUN' &&
      drOperationEvidence.numericSkewValidatorStatus === 'IMPLEMENTED' &&
      drOperationEvidence.monotonicTimerSessionBindingStatus ===
        'IMPLEMENTED_NOT_RUN' &&
      drOperationEvidence.monotonicTimerClockSource ===
        'NODE_PROCESS_HRTIME_BIGINT' &&
      drOperationEvidence.persistentOrchestratorRequired === true &&
      drOperationEvidence.excludedOrManualScopeInventoryStatus ===
        'IMPLEMENTED_NOT_RUN' &&
      drOperationEvidence.rtoRpoPassCurrentlyPossible === false,
    'DR operation collectors must be implemented but uncaptured before the drill'
  );
  const monotonicTimerRunnerBinding = verifyBoundArtifact(
    {
      path: drOperationEvidence.monotonicTimerRunnerPath,
      sha256: drOperationEvidence.monotonicTimerRunnerSha256,
    },
    'approvalPacket.drContract.operationEvidence.monotonicTimerRunner',
    artifactHashes,
    artifactFiles
  );
  const projectionContractPath =
    'docs/stabilization/evidence/commercial-hardening/pr12/dr-platform-config-projection-contract-v1.json';
  assert(
    drOperationEvidence.platformConfigProjectionContractPath ===
      projectionContractPath &&
      drOperationEvidence.platformConfigProjectionContractSha256 ===
        sha256File(path.join(REPO_ROOT, projectionContractPath)),
    'DR platform configuration projection contract binding drift'
  );
  const projectionContract = readJsonFile(
    path.join(REPO_ROOT, projectionContractPath),
    'DR platform configuration projection contract'
  );
  const projectionCollectorBinding = verifyBoundArtifact(
    {
      path: drOperationEvidence.platformConfigProjectionCollectorPath,
      sha256: drOperationEvidence.platformConfigProjectionCollectorSha256,
    },
    'approvalPacket.drContract.operationEvidence.platformConfigProjectionCollector',
    artifactHashes,
    artifactFiles
  );
  const sourceEnvironment = requireRecord(manifest.environment, 'environment');
  const source = requireRecord(manifest.source, 'source');
  const backup = requireRecord(manifest.backup, 'backup');
  const approvedRestoreTarget = requireRecord(
    drContract.restoreTarget,
    'approvalPacket.drContract.restoreTarget'
  );
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const sourceSideEffectInventory = verifyExternalSideEffectTarget({
    manifest,
    targetName: 'source',
    expectedResultType: 'SOURCE_EXTERNAL_SIDE_EFFECT_INVENTORY_RESULT',
    expectedCommandId: 'PR12-CMD-016A',
    expectedTargetKind: 'SOURCE',
    expectedProjectRef: sourceEnvironment.projectRef,
    expectedGitCommit: source.gitCommit,
    expectedRuntimeIdentity: sourceEnvironment,
    expectedCredentialConfiguration:
      targetCredentialConfigurations.get('SOURCE').binding,
    serviceRoleCredentialConfiguration:
      targetCredentialConfigurations.get('SOURCE'),
    approvedIntegrationContract: sourceApprovalWindow.bindings.get(
      'integrationContract'
    ),
    approvedCredentialContract:
      sourceApprovalWindow.bindings.get('credentialContract'),
    artifactPaths,
    artifactHashes,
    artifactFiles,
    commands,
  });
  assert(backup.status === 'PASS', 'backup.status must be PASS');
  const approvedWatermark = requireRecord(
    drContract.watermark,
    'approvalPacket.drContract.watermark'
  );
  assert(
    approvedWatermark.beforeAfterValueAndCommandEvidenceRequired === true &&
      approvedWatermark.beforeAfterObservedAtAndCommandEvidenceRequired ===
        true &&
      approvedWatermark.sourceIntegrityBaselineCommandId === 'PR12-CMD-009' &&
      approvedWatermark.postWatermarkSourceIntegrityRequired === true &&
      approvedWatermark.postWatermarkSourceIntegrityCommandId ===
        'PR12-CMD-017' &&
      approvedWatermark.normalizedDataHashIncludesWatermarkColumn === true,
    'approved DR watermark evidence contract is incomplete'
  );
  const watermarkCommandId = requireConcreteString(
    backup.watermarkCommandId,
    'backup.watermarkCommandId'
  );
  const captureCommandId = requireConcreteString(
    backup.captureCommandId,
    'backup.captureCommandId'
  );
  assert(
    watermarkCommandId === approvedWatermark.executionCommandId &&
      watermarkCommandId === commandApproval.backupWatermarkCommandId &&
      captureCommandId === commandApproval.backupInventoryCommandId,
    'backup command IDs do not match the approved DR contract and command ledger'
  );
  const watermarkCommand = commands.find(
    command => command.id === watermarkCommandId
  );
  const captureCommand = commands.find(
    command => command.id === captureCommandId
  );
  assert(watermarkCommand, 'backup watermark command is missing');
  assert(captureCommand, 'backup inventory command is missing');
  const watermarkOperationBinding = verifyBoundArtifact(
    {
      path: watermarkCommand.stdoutPath,
      sha256: watermarkCommand.stdoutSha256,
    },
    'backup.watermarkOperation',
    artifactHashes,
    artifactFiles
  );
  const watermarkOperation = readJsonFile(
    watermarkOperationBinding.absolutePath,
    'backup.watermarkOperation'
  );
  assertExactRecordKeys(
    watermarkOperation,
    [
      'schemaVersion',
      'resultType',
      'status',
      'commandId',
      'sourceProjectRef',
      'watermark',
      'target',
      'candidateSql',
      'beforeValue',
      'afterValue',
      'beforeObservedAt',
      'afterObservedAt',
      'affectedRows',
      'baselineSourceIntegrity',
      'postWatermarkSourceIntegrity',
    ],
    'backup.watermarkOperation'
  );
  const operationTarget = requireRecord(
    watermarkOperation.target,
    'backup.watermarkOperation.target'
  );
  assertExactRecordKeys(
    operationTarget,
    ['relation', 'primaryKey', 'timestampColumn'],
    'backup.watermarkOperation.target'
  );
  const beforeValue = requireIsoTimestamp(
    watermarkOperation.beforeValue,
    'backup.watermarkOperation.beforeValue'
  );
  const afterValue = requireIsoTimestamp(
    watermarkOperation.afterValue,
    'backup.watermarkOperation.afterValue'
  );
  const beforeObservedAt = requireIsoTimestamp(
    watermarkOperation.beforeObservedAt,
    'backup.watermarkOperation.beforeObservedAt'
  );
  const afterObservedAt = requireIsoTimestamp(
    watermarkOperation.afterObservedAt,
    'backup.watermarkOperation.afterObservedAt'
  );
  const watermarkAt = requireIsoTimestamp(
    watermarkOperation.watermark,
    'backup.watermarkOperation.watermark'
  );
  assert(
    watermarkOperation.schemaVersion === 1 &&
      watermarkOperation.resultType === 'BACKUP_WATERMARK_OPERATION' &&
      watermarkOperation.status === 'COMPLETED' &&
      watermarkOperation.commandId === watermarkCommandId &&
      watermarkOperation.sourceProjectRef === sourceEnvironment.projectRef &&
      watermarkOperation.afterValue === watermarkAt &&
      watermarkOperation.beforeValue !== watermarkOperation.afterValue &&
      Date.parse(beforeValue) <= Date.parse(afterValue) &&
      Date.parse(watermarkCommand.startedAt) <= Date.parse(beforeObservedAt) &&
      Date.parse(beforeObservedAt) <= Date.parse(afterValue) &&
      Date.parse(afterValue) <= Date.parse(afterObservedAt) &&
      Date.parse(afterObservedAt) <= Date.parse(watermarkCommand.endedAt) &&
      operationTarget.relation === approvedWatermark.relation &&
      operationTarget.primaryKey === approvedWatermark.primaryKey &&
      operationTarget.timestampColumn === approvedWatermark.timestampColumn &&
      watermarkOperation.candidateSql === approvedWatermark.candidateSql &&
      watermarkOperation.affectedRows ===
        approvedWatermark.requiredAffectedRows,
    'backup watermark operation identity, observation chronology, or affected-row proof mismatch'
  );
  const baselineSourceBinding = verifyBoundArtifact(
    watermarkOperation.baselineSourceIntegrity,
    'backup.watermarkOperation.baselineSourceIntegrity',
    artifactHashes,
    artifactFiles
  );
  const manifestSourceBinding = verifyBoundArtifact(
    requireRecord(manifest.integrityResults, 'integrityResults').source,
    'integrityResults.source',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    baselineSourceBinding.path,
    baselineSourceBinding.sha256,
    manifestSourceBinding,
    'backup.watermarkOperation.baselineSourceIntegrity'
  );
  const baselineSourceIntegrity = readJsonFile(
    baselineSourceBinding.absolutePath,
    'backup.watermarkOperation.baselineSourceIntegrity.result'
  );
  const postWatermarkIntegrity = requireRecord(
    watermarkOperation.postWatermarkSourceIntegrity,
    'backup.watermarkOperation.postWatermarkSourceIntegrity'
  );
  assertExactRecordKeys(
    postWatermarkIntegrity,
    [
      'schemaVersion',
      'resultType',
      'status',
      'capturedAt',
      'runtimeIdentity',
      'explicitRowCounts',
      'derivedRowCounts',
      'allRowCounts',
      'logicalHash',
      'historicalNormalizedPhysicalHash',
      'environmentPhysicalStructureHash',
      'schemaHash',
      'dataHash',
      'hashContractId',
      'hashContractPath',
      'hashContractSha256',
      'relationDigests',
      'migrationHead',
      'orderedMigrations',
      'generatedTypesSha256',
    ],
    'backup.watermarkOperation.postWatermarkSourceIntegrity'
  );
  assert(
    postWatermarkIntegrity.schemaVersion === 1 &&
      postWatermarkIntegrity.resultType ===
        'POST_WATERMARK_SOURCE_DATA_INTEGRITY' &&
      postWatermarkIntegrity.status === 'PASS' &&
      postWatermarkIntegrity.capturedAt === afterObservedAt,
    'post-watermark source integrity is not captured at the watermark command boundary'
  );
  verifyRuntimeIdentityBinding(
    postWatermarkIntegrity.runtimeIdentity,
    sourceEnvironment,
    'backup.watermarkOperation.postWatermarkSourceIntegrity.runtimeIdentity'
  );
  const expectedWatermarkRows = requireRecord(
    baselineSourceIntegrity.allRowCounts,
    'backup.watermarkOperation.baselineSourceIntegrity.allRowCounts'
  );
  const representativeBinding = verifyBoundArtifact(
    {
      path: manifest.representativeData.contractPath,
      sha256: manifest.representativeData.contractSha256,
    },
    'representativeData.contract',
    artifactHashes,
    artifactFiles
  );
  const representativeContract = readJsonFile(
    representativeBinding.absolutePath,
    'representativeData.contract'
  );
  const hashContract = verifyIntegrityHashContract({
    representativeBinding,
    representativeContract,
    expectedRowCounts: expectedWatermarkRows,
    artifactHashes,
    artifactFiles,
  });
  verifyIntegritySnapshot(
    baselineSourceIntegrity,
    'backup.watermarkOperation.baselineSourceIntegrity',
    hashContract,
    expectedWatermarkRows
  );
  verifyIntegritySnapshot(
    postWatermarkIntegrity,
    'backup.watermarkOperation.postWatermarkSourceIntegrity',
    hashContract,
    expectedWatermarkRows
  );
  assertExactRecordValues(
    requireRecord(
      postWatermarkIntegrity.allRowCounts,
      'backup.watermarkOperation.postWatermarkSourceIntegrity.allRowCounts'
    ),
    expectedWatermarkRows,
    'backup.watermarkOperation.postWatermarkSourceIntegrity.allRowCounts'
  );
  for (const field of [
    'logicalHash',
    'historicalNormalizedPhysicalHash',
    'environmentPhysicalStructureHash',
    'schemaHash',
  ]) {
    assert(
      postWatermarkIntegrity[field] === baselineSourceIntegrity[field],
      `backup watermark unexpectedly changed ${field}`
    );
  }
  const changedWatermarkRelations = postWatermarkIntegrity.relationDigests
    .filter(
      (value, index) =>
        value.dataDigestSha256 !==
        baselineSourceIntegrity.relationDigests[index]?.dataDigestSha256
    )
    .map(value => value.relation);
  assert(
    postWatermarkIntegrity.dataHash !== baselineSourceIntegrity.dataHash,
    'backup watermark did not change the source data hash'
  );
  assertExactStringArray(
    changedWatermarkRelations,
    ['public.reservations'],
    'backup watermark changed data relations'
  );
  const backupBinding = verifyBoundArtifact(
    { path: backup.artifactPath, sha256: backup.artifactSha256 },
    'backup.metadata',
    artifactHashes,
    artifactFiles
  );
  const metadata = readJsonFile(backupBinding.absolutePath, 'backup.metadata');
  assertExactRecordKeys(
    metadata,
    [
      'schemaVersion',
      'resultType',
      'status',
      'commandId',
      'capturedAt',
      'runtimeIdentity',
      'backupId',
      'backupType',
      'providerStatus',
      'sourceProjectRef',
      'region',
      'pitrEnabled',
      'providerInsertedAt',
      'selectionRule',
      'providerInventory',
      'watermarkEligibility',
    ],
    'backup.metadata'
  );
  assert(
    metadata.schemaVersion === 1 &&
      metadata.resultType === 'SUPABASE_PHYSICAL_BACKUP_METADATA' &&
      metadata.status === 'COMPLETED' &&
      metadata.commandId === captureCommandId &&
      metadata.capturedAt === captureCommand.endedAt &&
      metadata.backupType === 'PHYSICAL' &&
      metadata.providerStatus === 'COMPLETED' &&
      metadata.selectionRule ===
        'FIRST_COMPLETED_PHYSICAL_BACKUP_INSERTED_AT_OR_AFTER_POST_WATERMARK_BASELINE',
    'backup metadata is not a completed physical backup record'
  );
  verifyRuntimeIdentityBinding(
    metadata.runtimeIdentity,
    sourceEnvironment,
    'backup.metadata.runtimeIdentity'
  );
  assert(
    metadata.backupId === backup.backupId &&
      metadata.sourceProjectRef === sourceEnvironment.projectRef,
    'backup metadata source or ID mismatch'
  );
  assert(
    backup.method === drContract.backupMethod &&
      backup.scope === drContract.backupScope,
    'backup method or scope approval mismatch'
  );
  const providerInventoryBinding = verifyBoundArtifact(
    metadata.providerInventory,
    'backup.metadata.providerInventory',
    artifactHashes,
    artifactFiles
  );
  const providerInventory = readJsonFile(
    providerInventoryBinding.absolutePath,
    'backup.metadata.providerInventory.result'
  );
  assertExactRecordKeys(
    providerInventory,
    [
      'schemaVersion',
      'resultType',
      'status',
      'commandId',
      'projectRef',
      'observedAt',
      'runtimeIdentity',
      'request',
      'response',
      'secretValuesCaptured',
    ],
    'backup.metadata.providerInventory.result'
  );
  const providerObservedAt = requireIsoTimestamp(
    providerInventory.observedAt,
    'backup.metadata.providerInventory.observedAt'
  );
  verifyRuntimeIdentityBinding(
    providerInventory.runtimeIdentity,
    sourceEnvironment,
    'backup.metadata.providerInventory.runtimeIdentity'
  );
  const providerRequest = requireRecord(
    providerInventory.request,
    'backup.metadata.providerInventory.request'
  );
  assertExactRecordKeys(
    providerRequest,
    [
      'method',
      'url',
      'oauthScope',
      'requiredPermission',
      'body',
      'authorizationHeaderCaptured',
    ],
    'backup.metadata.providerInventory.request'
  );
  const providerResponse = requireRecord(
    providerInventory.response,
    'backup.metadata.providerInventory.response'
  );
  assertExactRecordKeys(
    providerResponse,
    ['status', 'body'],
    'backup.metadata.providerInventory.response'
  );
  const providerBody = requireRecord(
    providerResponse.body,
    'backup.metadata.providerInventory.response.body'
  );
  assertExactRecordKeys(
    providerBody,
    [
      'region',
      'walg_enabled',
      'pitr_enabled',
      'backups',
      'physical_backup_data',
    ],
    'backup.metadata.providerInventory.response.body'
  );
  assert(
    providerInventory.schemaVersion === 1 &&
      providerInventory.resultType === 'SOURCE_BACKUP_INVENTORY_RAW_EVIDENCE' &&
      providerInventory.status === 'CAPTURED' &&
      providerInventory.commandId === captureCommandId &&
      providerInventory.projectRef === sourceEnvironment.projectRef &&
      providerInventory.secretValuesCaptured === false &&
      providerRequest.method === 'GET' &&
      providerRequest.url ===
        `https://api.supabase.com/v1/projects/${sourceEnvironment.projectRef}/database/backups` &&
      providerRequest.oauthScope === 'database:read' &&
      providerRequest.requiredPermission === 'backups_read' &&
      providerRequest.body === null &&
      providerRequest.authorizationHeaderCaptured === false &&
      providerResponse.status === 200 &&
      providerBody.region === sourceEnvironment.region &&
      providerBody.walg_enabled === true &&
      providerBody.pitr_enabled === false,
    'backup provider inventory request, response, or secret boundary drift'
  );
  const providerBackupRows = requireArray(
    providerBody.backups,
    'backup.metadata.providerInventory.response.body.backups'
  ).map((value, index) => {
    const row = requireRecord(
      value,
      `backup.metadata.providerInventory.response.body.backups[${String(index)}]`
    );
    assertExactRecordKeys(
      row,
      ['id', 'is_physical_backup', 'status', 'inserted_at'],
      `backup.metadata.providerInventory.response.body.backups[${String(index)}]`
    );
    return {
      id: String(row.id),
      isPhysical: row.is_physical_backup === true,
      status: requireConcreteString(
        row.status,
        `backup provider row ${String(index)} status`
      ),
      insertedAt: requireIsoTimestamp(
        row.inserted_at,
        `backup provider row ${String(index)} inserted_at`
      ),
    };
  });
  assert(
    new Set(providerBackupRows.map(row => row.id)).size ===
      providerBackupRows.length,
    'backup provider inventory contains duplicate backup IDs'
  );
  const eligibleBackups = providerBackupRows
    .filter(
      row =>
        row.isPhysical &&
        row.status === 'COMPLETED' &&
        Date.parse(row.insertedAt) >= Date.parse(afterObservedAt)
    )
    .sort((left, right) =>
      left.insertedAt === right.insertedAt
        ? left.id.localeCompare(right.id, 'en')
        : Date.parse(left.insertedAt) - Date.parse(right.insertedAt)
    );
  const selectedBackup = eligibleBackups[0];
  assert(selectedBackup, 'no eligible completed physical backup exists');
  const backupProviderInsertedAt = requireIsoTimestamp(
    metadata.providerInsertedAt,
    'backup.metadata.providerInsertedAt'
  );
  assert(
    metadata.backupId === selectedBackup.id &&
      backupProviderInsertedAt === selectedBackup.insertedAt &&
      metadata.region === providerBody.region &&
      metadata.pitrEnabled === providerBody.pitr_enabled,
    'normalized backup metadata does not derive from the first eligible provider row'
  );
  const approvedDrSource = requireRecord(
    drContract.source,
    'approvalPacket.drContract.source'
  );
  assert(
    approvedDrSource.projectRef === sourceEnvironment.projectRef,
    'approved DR source project does not match the execution environment'
  );
  const maximumBackupWaitSeconds =
    requireNumber(
      approvedDrSource.maximumWaitForEligibleBackupHours,
      'approvalPacket.drContract.source.maximumWaitForEligibleBackupHours'
    ) * 3600;
  const backupWaitSeconds =
    (Date.parse(providerObservedAt) - Date.parse(afterObservedAt)) / 1000;
  assert(
    maximumBackupWaitSeconds === 129600 &&
      backupWaitSeconds >= 0 &&
      backupWaitSeconds <= maximumBackupWaitSeconds,
    'eligible backup was not observed within the frozen 36-hour wait window'
  );
  const inventoryCapturedAt = requireIsoTimestamp(
    backup.capturedAt,
    'backup.capturedAt'
  );
  assert(
    Date.parse(captureCommand.startedAt) <= Date.parse(providerObservedAt) &&
      Date.parse(providerObservedAt) <= Date.parse(captureCommand.endedAt) &&
      captureCommand.endedAt === inventoryCapturedAt &&
      metadata.capturedAt === inventoryCapturedAt &&
      Date.parse(backupProviderInsertedAt) <= Date.parse(providerObservedAt) &&
      Date.parse(backupProviderInsertedAt) >=
        Date.parse(sourceApprovalWindow.approvedAt) &&
      Date.parse(providerObservedAt) <=
        Date.parse(sourceApprovalWindow.expiresAt) &&
      Date.parse(providerObservedAt) <=
        Date.parse(sourceApprovalWindow.sourceRetentionDeadline),
    'backup inventory is outside its command, approval, or retention window'
  );
  const watermarkEligibility = requireRecord(
    metadata.watermarkEligibility,
    'backup.metadata.watermarkEligibility'
  );
  assertExactRecordKeys(
    watermarkEligibility,
    [
      'operation',
      'postWatermarkSourceIntegrity',
      'watermarkValue',
      'temporalEligible',
      'inclusionStatus',
    ],
    'backup.metadata.watermarkEligibility'
  );
  for (const [context, value] of [
    ['backup.watermarkOperation', backup.watermarkOperation],
    [
      'backup.postWatermarkSourceIntegrity',
      backup.postWatermarkSourceIntegrity,
    ],
    [
      'backup.metadata.watermarkEligibility.operation',
      watermarkEligibility.operation,
    ],
    [
      'backup.metadata.watermarkEligibility.postWatermarkSourceIntegrity',
      watermarkEligibility.postWatermarkSourceIntegrity,
    ],
  ]) {
    const operationBinding = verifyBoundArtifact(
      value,
      context,
      artifactHashes,
      artifactFiles
    );
    assertBindingMatch(
      operationBinding.path,
      operationBinding.sha256,
      watermarkOperationBinding,
      context
    );
  }
  assert(
    watermarkEligibility.watermarkValue === watermarkAt &&
      backup.sourceWatermark === watermarkAt &&
      watermarkEligibility.temporalEligible === true &&
      watermarkEligibility.inclusionStatus === 'PROVEN_ONLY_AFTER_RESTORE',
    'backup watermark eligibility overclaims inclusion or mismatches the operation'
  );
  assert(
    Date.parse(watermarkCommand.startedAt) <= Date.parse(watermarkAt) &&
      Date.parse(watermarkAt) <= Date.parse(watermarkCommand.endedAt) &&
      Date.parse(watermarkCommand.endedAt) <=
        Date.parse(sourceSideEffectInventory.command.startedAt) &&
      Date.parse(sourceSideEffectInventory.capturedAt) <=
        Date.parse(backupProviderInsertedAt),
    'backup watermark and final source side-effect inventory are not bound before the selected backup eligibility point'
  );
  assert(
    commands
      .filter(
        command =>
          Date.parse(command.startedAt) >=
            Date.parse(sourceSideEffectInventory.capturedAt) &&
          Date.parse(command.startedAt) < Date.parse(backupProviderInsertedAt)
      )
      .every(command => command.mutating === false),
    'a source mutation occurred after the final side-effect inventory and before backup eligibility'
  );
  assert(
    captureCommand.stdoutPath.replaceAll('\\', '/') === backupBinding.path &&
      captureCommand.stdoutSha256 === backupBinding.sha256,
    'backup metadata is not the exact approved inventory command output'
  );
  verifyEvidenceReferences(backup.evidence, 'backup.evidence', artifactPaths);

  const restore = requireRecord(manifest.restore, 'restore');
  const creationBinding = verifyBoundArtifact(
    {
      path: restore.creationApprovalPath,
      sha256: restore.creationApprovalSha256,
    },
    'restore.creationApproval',
    artifactHashes,
    artifactFiles
  );
  const creation = readJsonFile(
    creationBinding.absolutePath,
    'restore.creationApproval'
  );
  assert(
    creation.schemaVersion === 1 &&
      creation.phase === 'RESTORE_PROJECT_CREATION' &&
      creation.status === 'APPROVED',
    'restore project creation approval is not APPROVED'
  );
  const creationAuthorization = requireRecord(
    creation.authorization,
    'restore.creationApproval.authorization'
  );
  assertExactRecordKeys(
    creationAuthorization,
    [
      'restoreProjectCreationAuthorized',
      'restoreProjectConnectionAuthorized',
      'postRestoreValidationAuthorized',
      'sourceProjectMutationAuthorized',
      'productionConnectionAuthorized',
      'readyTransitionAuthorized',
      'mergeAuthorized',
      'commercialReleaseAuthorized',
      'indexRetirementAuthorized',
    ],
    'restore.creationApproval.authorization'
  );
  assert(
    creationAuthorization.restoreProjectCreationAuthorized === true,
    'restore creation approval does not authorize restore project creation'
  );
  for (const field of [
    'restoreProjectConnectionAuthorized',
    'postRestoreValidationAuthorized',
    'sourceProjectMutationAuthorized',
    'productionConnectionAuthorized',
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ]) {
    assert(
      creationAuthorization[field] === false,
      `restore.creationApproval.authorization.${field} must be false`
    );
  }
  assert(
    creation.sourceExecutionApproval.path === source.approvalPacketPath &&
      creation.sourceExecutionApproval.sha256 === source.approvalPacketSha256,
    'restore creation approval is not bound to source execution approval'
  );
  const creationSourceSideEffects = requireRecord(
    creation.sourceExternalSideEffectInventory,
    'restore.creationApproval.sourceExternalSideEffectInventory'
  );
  assertBindingMatch(
    creationSourceSideEffects.path,
    creationSourceSideEffects.sha256,
    sourceSideEffectInventory.binding,
    'restore.creationApproval.sourceExternalSideEffectInventory'
  );
  const creationBackup = requireRecord(
    creation.selectedBackup,
    'restore.creationApproval.selectedBackup'
  );
  assertExactRecordKeys(
    creationBackup,
    [
      'sourceProjectRef',
      'backupId',
      'backupMetadataPath',
      'backupMetadataSha256',
      'backupInventoryRawPath',
      'backupInventoryRawSha256',
      'watermarkValue',
    ],
    'restore.creationApproval.selectedBackup'
  );
  assert(
    creationBackup.sourceProjectRef === sourceEnvironment.projectRef &&
      creationBackup.backupId === backup.backupId &&
      creationBackup.backupMetadataPath === backupBinding.path &&
      creationBackup.backupMetadataSha256 === backupBinding.sha256 &&
      creationBackup.backupInventoryRawPath === providerInventoryBinding.path &&
      creationBackup.backupInventoryRawSha256 ===
        providerInventoryBinding.sha256 &&
      creationBackup.watermarkValue === backup.sourceWatermark,
    'restore creation approval selected backup mismatch'
  );
  const restoreSelection = requireRecord(
    creation.restoreSelection,
    'restore.creationApproval.restoreSelection'
  );
  assert(
    restoreSelection.sourceProjectRef === sourceEnvironment.projectRef &&
      restoreSelection.organizationId === sourceEnvironment.organizationId &&
      restoreSelection.backupId === backup.backupId &&
      restoreSelection.backupMetadataSha256 === backupBinding.sha256 &&
      restoreSelection.requestedName ===
        'seikotsuin-pr12-isolated-restore-20260719' &&
      !Object.hasOwn(restoreSelection, 'region') &&
      !Object.hasOwn(restoreSelection, 'databaseTier') &&
      !Object.hasOwn(restoreSelection, 'databaseVersion'),
    'restore creation selection target or documented-input boundary mismatch'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      restoreSelection.prohibitedProjectRefs,
      'restore.creationApproval.restoreSelection.prohibitedProjectRefs'
    ),
    PROHIBITED_PROJECT_REFS,
    'restore.creationApproval.restoreSelection.prohibitedProjectRefs'
  );
  const expectedMirroredState = requireRecord(
    creation.expectedMirroredState,
    'restore.creationApproval.expectedMirroredState'
  );
  const sourceMirroredConfigurationBinding = verifyBoundArtifact(
    expectedMirroredState.freshSourceConfigurationSnapshot,
    'restore.creationApproval.expectedMirroredState.freshSourceConfigurationSnapshot',
    artifactHashes,
    artifactFiles
  );
  const sourceMirroredConfiguration = readJsonFile(
    sourceMirroredConfigurationBinding.absolutePath,
    'restore.creationApproval.expectedMirroredState.freshSourceConfigurationSnapshot'
  );
  const sourceMirroredConfigurationVerification =
    verifyMirroredConfigurationSnapshot({
      snapshot: sourceMirroredConfiguration,
      context:
        'restore.creationApproval.expectedMirroredState.freshSourceConfigurationSnapshot',
      expectedProjectRef: sourceEnvironment.projectRef,
      expectedCommandId: 'PR12-CMD-017A',
      commands,
      artifactHashes,
      artifactFiles,
    });
  assert(
    expectedMirroredState.sameRegion === true &&
      expectedMirroredState.computeAddonVariant === 'ci_large' &&
      expectedMirroredState.diskAttributes ===
        'EXACT_SOURCE_SNAPSHOT_MATCH_REQUIRED' &&
      expectedMirroredState.sslEnforcement ===
        'EXACT_SOURCE_SNAPSHOT_MATCH_REQUIRED' &&
      expectedMirroredState.networkRestrictions ===
        'EXACT_SOURCE_SNAPSHOT_MATCH_REQUIRED' &&
      expectedMirroredState.databaseVersionIsPostCreationObservationNotRequestInput ===
        true,
    'restore creation expected mirrored-state contract drift'
  );
  const sourceMirroredConfigurationObservedAt =
    sourceMirroredConfigurationVerification.observedAt;
  const creationLifecycle = requireRecord(
    creation.lifecycle,
    'restore.creationApproval.lifecycle'
  );
  assert(
    creationLifecycle.restoreMaximumHoursFromCreation === 24 &&
      creationLifecycle.cleanupDisposition ===
        'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION' &&
      creationLifecycle.fundingCeilingUsd === 50 &&
      creationLifecycle.automaticDeletionAuthorized === false &&
      creationLifecycle.deletionRequiresSeparateApproval === true &&
      creationLifecycle.extensionRequiresSeparateApproval === true,
    'restore creation lifecycle drift'
  );
  const restoreFundedThrough = requireIsoTimestamp(
    creationLifecycle.fundedThrough,
    'restore.creationApproval.lifecycle.fundedThrough',
    { future: true }
  );
  const creationCost = requireRecord(
    creation.cost,
    'restore.creationApproval.cost'
  );
  const approvedQuote = requireRecord(
    creationCost.quote,
    'restore.creationApproval.cost.quote'
  );
  const approvedQuoteRawBinding = verifyBoundArtifact(
    approvedQuote.rawArtifact,
    'restore.creationApproval.cost.quote.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  const approvedQuoteRaw = readJsonFile(
    approvedQuoteRawBinding.absolutePath,
    'restore.creationApproval.cost.quote.rawArtifact'
  );
  const approvedQuoteObservedAt = requireIsoTimestamp(
    approvedQuote.observedAt,
    'restore.creationApproval.cost.quote.observedAt'
  );
  const approvedQuoteAcceptedAt = requireIsoTimestamp(
    creationCost.acceptedAt,
    'restore.creationApproval.cost.acceptedAt'
  );
  const approvedQuoteTotal = requireNumber(
    approvedQuote.normalizedTotalUsd,
    'restore.creationApproval.cost.quote.normalizedTotalUsd'
  );
  const approvedQuoteLineItems = requireArray(
    approvedQuote.lineItems,
    'restore.creationApproval.cost.quote.lineItems'
  ).map((value, index) => {
    const lineItem = requireRecord(
      value,
      `restore.creationApproval.cost.quote.lineItems[${String(index)}]`
    );
    assertExactRecordKeys(
      lineItem,
      ['id', 'amountUsd'],
      `restore.creationApproval.cost.quote.lineItems[${String(index)}]`
    );
    return {
      id: requireConcreteString(
        lineItem.id,
        `restore.creationApproval.cost.quote.lineItems[${String(index)}].id`
      ),
      amountUsd: requireNumber(
        lineItem.amountUsd,
        `restore.creationApproval.cost.quote.lineItems[${String(index)}].amountUsd`
      ),
    };
  });
  assert(
    approvedQuoteLineItems.length > 0 &&
      new Set(approvedQuoteLineItems.map(item => item.id)).size ===
        approvedQuoteLineItems.length &&
      approvedQuoteLineItems.every(item => item.amountUsd >= 0) &&
      approvedQuoteLineItems.reduce(
        (total, item) => total + item.amountUsd,
        0
      ) === approvedQuoteTotal,
    'restore creation cost quote line items do not sum exactly to the normalized USD total'
  );
  assert(
    creationCost.proposedBudgetCeilingUsd === 50 &&
      creationCost.actualDashboardQuoteAccepted === true &&
      approvedQuote.sourceProjectRef === sourceEnvironment.projectRef &&
      approvedQuote.backupId === backup.backupId &&
      approvedQuote.currency === 'USD' &&
      approvedQuote.cadence === 'RESTORE_PROJECT_CREATION_ESTIMATE' &&
      approvedQuoteLineItems.length > 0 &&
      approvedQuoteTotal <= creationCost.proposedBudgetCeilingUsd &&
      approvedQuoteRaw.schemaVersion === 1 &&
      approvedQuoteRaw.resultType === 'RESTORE_DASHBOARD_COST_QUOTE' &&
      approvedQuoteRaw.status === 'CAPTURED' &&
      approvedQuoteRaw.sourceProjectRef === approvedQuote.sourceProjectRef &&
      approvedQuoteRaw.backupId === approvedQuote.backupId &&
      approvedQuoteRaw.currency === approvedQuote.currency &&
      approvedQuoteRaw.cadence === approvedQuote.cadence &&
      JSON.stringify(approvedQuoteRaw.lineItems) ===
        JSON.stringify(approvedQuote.lineItems) &&
      approvedQuoteRaw.normalizedTotalUsd === approvedQuoteTotal &&
      approvedQuoteRaw.observedAt === approvedQuoteObservedAt,
    'restore creation cost quote evidence drift'
  );
  const creationApproval = requireRecord(
    creation.approval,
    'restore.creationApproval.approval'
  );
  const clockPolicy = requireRecord(
    creation.clockPolicy,
    'restore.creationApproval.clockPolicy'
  );
  assertExactRecordKeys(
    clockPolicy,
    [
      'maximumAllowedClockSkewSeconds',
      'maximumRpoObservationLeadSeconds',
      'ownerAccepted',
      'collectorStatus',
      'rtoRpoPassAllowed',
    ],
    'restore.creationApproval.clockPolicy'
  );
  const creationMaximumAllowedClockSkewSeconds = requireNumber(
    clockPolicy.maximumAllowedClockSkewSeconds,
    'restore.creationApproval.clockPolicy.maximumAllowedClockSkewSeconds'
  );
  const creationMaximumRpoObservationLeadSeconds = requireNumber(
    clockPolicy.maximumRpoObservationLeadSeconds,
    'restore.creationApproval.clockPolicy.maximumRpoObservationLeadSeconds'
  );
  assert(
    Number.isInteger(creationMaximumAllowedClockSkewSeconds) &&
      creationMaximumAllowedClockSkewSeconds ===
        approvedMaximumClockSkewSeconds &&
      Number.isInteger(creationMaximumRpoObservationLeadSeconds) &&
      creationMaximumRpoObservationLeadSeconds ===
        approvedMaximumRpoObservationLeadSeconds &&
      clockPolicy.ownerAccepted === true &&
      clockPolicy.collectorStatus ===
        'PROVIDER_CREATED_AT_FROM_MANAGEMENT_API' &&
      clockPolicy.rtoRpoPassAllowed === true,
    'restore creation provider-clock policy is not owner-approved or exceeds 300 seconds'
  );
  const creationApprovedAt = requireIsoTimestamp(
    creationApproval.approvedAt,
    'restore.creationApproval.approval.approvedAt',
    { notFuture: true }
  );
  const creationExpiresAt = requireIsoTimestamp(
    creationApproval.expiresAt,
    'restore.creationApproval.approval.expiresAt',
    { future: true }
  );
  assert(
    Date.parse(restoreFundedThrough) >=
      Date.parse(creationExpiresAt) + 24 * 60 * 60 * 1000,
    'restore funding does not cover 24 hours after the latest approved creation time'
  );
  assert(
    Date.parse(creationApprovedAt) >= Date.parse(backupProviderInsertedAt) &&
      Date.parse(creationApprovedAt) >= Date.parse(inventoryCapturedAt) &&
      Date.parse(creationApprovedAt) >=
        Date.parse(sourceSideEffectInventory.capturedAt) &&
      Date.parse(creationApprovedAt) >=
        Date.parse(sourceMirroredConfigurationObservedAt) &&
      Date.parse(creationApprovedAt) -
        Date.parse(sourceMirroredConfigurationObservedAt) <=
        approvedMaximumClockSkewSeconds * 1000 &&
      Date.parse(creationApprovedAt) >= Date.parse(approvedQuoteAcceptedAt) &&
      creationCost.acceptedBy === creationApproval.approvedBy,
    'restore creation approval precedes backup, side-effect, mirror, or quote evidence'
  );
  assert(
    Date.parse(creationApprovedAt) < Date.parse(creationExpiresAt),
    'restore creation approval expiry must follow approval'
  );
  verifyBoundArtifact(
    {
      path: creationApproval.evidencePath,
      sha256: creationApproval.evidenceSha256,
    },
    'restore.creationApproval.approval.evidence',
    artifactHashes,
    artifactFiles
  );
  const creationOwners = requireRecord(
    creation.owners,
    'restore.creationApproval.owners'
  );
  verifyOwnerSeparation(
    creationApproval,
    creationOwners,
    'restore.creationApproval'
  );
  assert(
    creationLifecycle.cleanupOwner === creationOwners.cleanupOwner &&
      creationLifecycle.cleanupOwner === approvedCleanup.cleanupOwner,
    'restore creation lifecycle cleanup owner mismatch'
  );
  const creationCommandId = requireConcreteString(
    restore.creationCommandId,
    'restore.creationCommandId'
  );
  const creationCommand = commands.find(
    command => command.id === creationCommandId
  );
  assert(creationCommand, 'restore creation command is missing');
  assert(
    creationCommandId === commandApproval.restoreCreationCommandId,
    'restore creation command does not match the approved restore creation ledger entry'
  );
  assert(
    Date.parse(creationCommand.startedAt) >= Date.parse(creationApprovedAt) &&
      Date.parse(creationCommand.endedAt) <= Date.parse(creationExpiresAt),
    'restore creation command is outside its approval window'
  );
  const creationOperationBinding = verifyBoundArtifact(
    {
      path: creationCommand.stdoutPath,
      sha256: creationCommand.stdoutSha256,
    },
    'restore.creationOperationResult',
    artifactHashes,
    artifactFiles
  );
  const creationOperation = readJsonFile(
    creationOperationBinding.absolutePath,
    'restore.creationOperationResult'
  );
  assert(
    creationOperation.schemaVersion === 1 &&
      creationOperation.resultType === 'RESTORE_PROJECT_CREATION_OPERATION' &&
      creationOperation.status === 'COMPLETED' &&
      creationOperation.commandId === creationCommandId &&
      creationOperation.sourceProjectRef === sourceEnvironment.projectRef &&
      creationOperation.backupId === backup.backupId &&
      creationOperation.sourceWatermark === backup.sourceWatermark,
    'restore creation operation result identity mismatch'
  );
  const restoreProviderBinding = verifyBoundArtifact(
    creationOperation.providerEvidence,
    'restore.creationOperationResult.providerEvidence',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    restore.providerEvidencePath,
    restore.providerEvidenceSha256,
    restoreProviderBinding,
    'restore.providerEvidence'
  );
  const restoreProvider = readJsonFile(
    restoreProviderBinding.absolutePath,
    'restore.providerEvidence'
  );
  assertExactRecordKeys(
    restoreProvider,
    [
      'schemaVersion',
      'exportType',
      'status',
      'provider',
      'captureMethod',
      'actionId',
      'selectedBackup',
      'preActionProjectInventory',
      'dashboardActionEvidence',
      'providerOperationIdentifier',
      'projectObservation',
      'computeObservation',
      'sourceMirroredConfiguration',
      'restoreMirroredConfiguration',
      'mirrorComparison',
      'costQuote',
      'rawProviderArtifacts',
      'capturedAt',
      'capturedBy',
    ],
    'restore.providerEvidence'
  );
  assert(
    restoreProvider.schemaVersion === 1 &&
      restoreProvider.exportType ===
        'SUPABASE_RESTORE_PROJECT_PROVIDER_EXPORT' &&
      restoreProvider.status === 'CAPTURED' &&
      restoreProvider.provider === 'SUPABASE_DASHBOARD_AND_MANAGEMENT_API' &&
      restoreProvider.captureMethod ===
        'HASH_BOUND_DASHBOARD_ACTION_AND_PROVIDER_READ_ONLY_OBSERVATIONS' &&
      restoreProvider.actionId === creationCommandId,
    'restore provider export identity drift'
  );
  const providerSelectedBackup = requireRecord(
    restoreProvider.selectedBackup,
    'restore.providerEvidence.selectedBackup'
  );
  assertExactRecordKeys(
    providerSelectedBackup,
    [
      'sourceProjectRef',
      'backupId',
      'backupMetadataPath',
      'backupMetadataSha256',
      'backupInventoryRawPath',
      'backupInventoryRawSha256',
      'watermarkValue',
    ],
    'restore.providerEvidence.selectedBackup'
  );
  assert(
    providerSelectedBackup.sourceProjectRef === sourceEnvironment.projectRef &&
      providerSelectedBackup.backupId === backup.backupId &&
      providerSelectedBackup.backupMetadataPath === backupBinding.path &&
      providerSelectedBackup.backupMetadataSha256 === backupBinding.sha256 &&
      providerSelectedBackup.backupInventoryRawPath ===
        providerInventoryBinding.path &&
      providerSelectedBackup.backupInventoryRawSha256 ===
        providerInventoryBinding.sha256 &&
      providerSelectedBackup.watermarkValue === backup.sourceWatermark,
    'restore provider export selected backup mismatch'
  );
  const preActionInventory = requireRecord(
    restoreProvider.preActionProjectInventory,
    'restore.providerEvidence.preActionProjectInventory'
  );
  assertExactRecordKeys(
    preActionInventory,
    ['observedAt', 'rawArtifact'],
    'restore.providerEvidence.preActionProjectInventory'
  );
  const preActionInventoryBinding = verifyBoundArtifact(
    preActionInventory.rawArtifact,
    'restore.providerEvidence.preActionProjectInventory.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  const preActionInventoryRaw = readJsonFile(
    preActionInventoryBinding.absolutePath,
    'restore.providerEvidence.preActionProjectInventory.rawArtifact'
  );
  assertExactRecordKeys(
    preActionInventoryRaw,
    [
      'schemaVersion',
      'resultType',
      'organizationId',
      'observedAt',
      'request',
      'response',
    ],
    'restore.providerEvidence.preActionProjectInventory.rawArtifact'
  );
  const preActionObservedAt = requireIsoTimestamp(
    preActionInventory.observedAt,
    'restore.providerEvidence.preActionProjectInventory.observedAt'
  );
  const preActionRequest = requireRecord(
    preActionInventoryRaw.request,
    'restore.providerEvidence.preActionProjectInventory.rawArtifact.request'
  );
  const preActionResponse = requireRecord(
    preActionInventoryRaw.response,
    'restore.providerEvidence.preActionProjectInventory.rawArtifact.response'
  );
  const preActionProjects = requireArray(
    preActionResponse.body,
    'restore.providerEvidence.preActionProjectInventory.rawArtifact.response.body'
  ).map((value, index) =>
    requireRecord(
      value,
      `restore.providerEvidence.preActionProjectInventory.rawArtifact.response.body[${String(index)}]`
    )
  );
  const createdProjectRef = requireConcreteString(
    creationOperation.createdProjectRef,
    'restore.creationOperationResult.createdProjectRef'
  );
  const createdProjectName = requireConcreteString(
    creationOperation.createdProjectName,
    'restore.creationOperationResult.createdProjectName'
  );
  const projectIdentities = preActionProjects.map((project, index) => ({
    ref: requireConcreteString(
      project.ref,
      `restore.providerEvidence.preActionProjectInventory.rawArtifact.response.body[${String(index)}].ref`
    ),
    name: requireConcreteString(
      project.name,
      `restore.providerEvidence.preActionProjectInventory.rawArtifact.response.body[${String(index)}].name`
    ),
  }));
  const requestedNameAbsent = projectIdentities.every(
    project => project.name !== restoreSelection.requestedName
  );
  const createdProjectRefAbsent = projectIdentities.every(
    project => project.ref !== createdProjectRef
  );
  const preActionAgeSeconds =
    (Date.parse(
      requireIsoTimestamp(
        creationOperation.actionStartedAt,
        'restore.creationOperationResult.actionStartedAt'
      )
    ) -
      Date.parse(preActionObservedAt)) /
    1000;
  assert(
    preActionInventoryRaw.schemaVersion === 1 &&
      preActionInventoryRaw.resultType ===
        'RESTORE_PRE_ACTION_PROJECT_INVENTORY' &&
      preActionInventoryRaw.organizationId ===
        restoreSelection.organizationId &&
      preActionRequest.method === 'GET' &&
      preActionRequest.url === 'https://api.supabase.com/v1/projects' &&
      preActionResponse.status === 200 &&
      requestedNameAbsent === true &&
      createdProjectRefAbsent === true &&
      createdProjectName === restoreSelection.requestedName &&
      preActionInventoryRaw.observedAt === preActionObservedAt &&
      preActionAgeSeconds >= 0 &&
      preActionAgeSeconds <=
        approvedRestoreTarget.maximumPreActionInventoryAgeSeconds,
    'restore pre-action project inventory does not prove target absence'
  );
  const dashboardAction = requireRecord(
    restoreProvider.dashboardActionEvidence,
    'restore.providerEvidence.dashboardActionEvidence'
  );
  const dashboardActionBinding = verifyBoundArtifact(
    dashboardAction.rawArtifact,
    'restore.providerEvidence.dashboardActionEvidence.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  const dashboardActionRaw = readJsonFile(
    dashboardActionBinding.absolutePath,
    'restore.providerEvidence.dashboardActionEvidence.rawArtifact'
  );
  const providerIdentifier = requireRecord(
    restoreProvider.providerOperationIdentifier,
    'restore.providerEvidence.providerOperationIdentifier'
  );
  const providerIdentifierBinding = verifyBoundArtifact(
    providerIdentifier.rawArtifact,
    'restore.providerEvidence.providerOperationIdentifier.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    providerIdentifierBinding.path,
    providerIdentifierBinding.sha256,
    dashboardActionBinding,
    'restore.providerEvidence.providerOperationIdentifier.rawArtifact'
  );
  assert(
    providerIdentifier.availability ===
      creationOperation.providerOperationIdentifierAvailability &&
      [
        'CAPTURED',
        'NOT_EXPOSED_BY_DOCUMENTED_RESTORE_TO_NEW_PROJECT_FLOW',
      ].includes(providerIdentifier.availability),
    'restore provider operation identifier availability drift'
  );
  if (providerIdentifier.availability === 'CAPTURED') {
    assert(
      requireConcreteString(
        providerIdentifier.value,
        'restore.providerEvidence.providerOperationIdentifier.value'
      ) === dashboardActionRaw.providerOperationIdentifier &&
        dashboardActionRaw.providerOperationIdentifierAvailability ===
          'CAPTURED',
      'restore captured provider operation identifier lacks raw provenance'
    );
  } else {
    assert(
      providerIdentifier.value === null &&
        dashboardActionRaw.providerOperationIdentifier === null &&
        dashboardActionRaw.providerOperationIdentifierAvailability ===
          providerIdentifier.availability,
      'restore provider operation identifier must remain null when the documented flow does not expose one'
    );
  }
  const restoreActionStartedAt = requireIsoTimestamp(
    creationOperation.actionStartedAt,
    'restore.creationOperationResult.actionStartedAt'
  );
  const operationRestoreConfirmationAt = requireIsoTimestamp(
    creationOperation.restoreConfirmationAt,
    'restore.creationOperationResult.restoreConfirmationAt'
  );
  const providerCreatedAt = requireIsoTimestamp(
    creationOperation.providerCreatedAt,
    'restore.creationOperationResult.providerCreatedAt'
  );
  const restoreReadyObservedAt = requireIsoTimestamp(
    creationOperation.restoreReadyObservedAt,
    'restore.creationOperationResult.restoreReadyObservedAt'
  );
  const providerCapturedAt = requireIsoTimestamp(
    creationOperation.providerCapturedAt,
    'restore.creationOperationResult.providerCapturedAt'
  );
  const sourceDatabaseUtcAtActionStart = requireIsoTimestamp(
    creationOperation.sourceDatabaseUtcAtActionStart,
    'restore.creationOperationResult.sourceDatabaseUtcAtActionStart'
  );
  const operatorUtcAtActionStart = requireIsoTimestamp(
    creationOperation.operatorUtcAtActionStart,
    'restore.creationOperationResult.operatorUtcAtActionStart'
  );
  const sourceDatabaseUtcAtRpoObservation = requireIsoTimestamp(
    creationOperation.sourceDatabaseUtcAtRpoObservation,
    'restore.creationOperationResult.sourceDatabaseUtcAtRpoObservation'
  );
  const operatorUtcAtRpoObservation = requireIsoTimestamp(
    creationOperation.operatorUtcAtRpoObservation,
    'restore.creationOperationResult.operatorUtcAtRpoObservation'
  );
  const creationMonotonicTimer = requireRecord(
    creationOperation.monotonicTimer,
    'restore.creationOperationResult.monotonicTimer'
  );
  assertExactRecordKeys(
    creationMonotonicTimer,
    [
      'timerSessionId',
      'runnerInstanceId',
      'clockSource',
      'processStartedAt',
      'runner',
      'startNanoseconds',
    ],
    'restore.creationOperationResult.monotonicTimer'
  );
  const timerSessionId = requireConcreteString(
    creationMonotonicTimer.timerSessionId,
    'restore.creationOperationResult.monotonicTimer.timerSessionId'
  );
  const timerRunnerInstanceId = requireConcreteString(
    creationMonotonicTimer.runnerInstanceId,
    'restore.creationOperationResult.monotonicTimer.runnerInstanceId'
  );
  const timerProcessStartedAt = requireIsoTimestamp(
    creationMonotonicTimer.processStartedAt,
    'restore.creationOperationResult.monotonicTimer.processStartedAt'
  );
  const startNanosecondsText = requireConcreteString(
    creationMonotonicTimer.startNanoseconds,
    'restore.creationOperationResult.monotonicTimer.startNanoseconds'
  );
  assert(
    /^\d+$/.test(startNanosecondsText),
    'restore monotonic timer start must be an unsigned integer string'
  );
  const monotonicTimerStartNanoseconds = BigInt(startNanosecondsText);
  const creationTimerRunnerBinding = verifyBoundArtifact(
    creationMonotonicTimer.runner,
    'restore.creationOperationResult.monotonicTimer.runner',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    monotonicTimerRunnerBinding.path,
    monotonicTimerRunnerBinding.sha256,
    creationTimerRunnerBinding,
    'restore monotonic timer runner approval'
  );
  assert(
    creationMonotonicTimer.clockSource === 'NODE_PROCESS_HRTIME_BIGINT' &&
      Date.parse(timerProcessStartedAt) <=
        Date.parse(creationOperation.actionStartedAt) &&
      Math.abs(
        Date.parse(sourceDatabaseUtcAtActionStart) -
          Date.parse(operatorUtcAtActionStart)
      ) <=
        approvedMaximumClockSkewSeconds * 1000 &&
      Math.abs(
        Date.parse(operatorUtcAtActionStart) -
          Date.parse(restoreActionStartedAt)
      ) <=
        approvedMaximumClockSkewSeconds * 1000 &&
      Math.abs(
        Date.parse(sourceDatabaseUtcAtRpoObservation) -
          Date.parse(operatorUtcAtRpoObservation)
      ) <=
        approvedMaximumClockSkewSeconds * 1000 &&
      Date.parse(operatorUtcAtRpoObservation) >=
        Date.parse(restoreActionStartedAt) &&
      Date.parse(operatorUtcAtRpoObservation) <=
        Date.parse(operationRestoreConfirmationAt) &&
      Date.parse(operationRestoreConfirmationAt) -
        Date.parse(operatorUtcAtRpoObservation) <=
        approvedMaximumRpoObservationLeadSeconds * 1000,
    'restore source/operator clock provenance or pre-confirmation RPO observation drift'
  );
  const providerProject = requireRecord(
    restoreProvider.projectObservation,
    'restore.providerEvidence.projectObservation'
  );
  const providerProjectBinding = verifyBoundArtifact(
    providerProject.rawArtifact,
    'restore.providerEvidence.projectObservation.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  const providerProjectRaw = readJsonFile(
    providerProjectBinding.absolutePath,
    'restore.providerEvidence.projectObservation.rawArtifact'
  );
  const providerProjectRawRequest = requireRecord(
    providerProjectRaw.request,
    'restore.providerEvidence.projectObservation.rawArtifact.request'
  );
  const providerProjectRawResponse = requireRecord(
    providerProjectRaw.response,
    'restore.providerEvidence.projectObservation.rawArtifact.response'
  );
  const providerProjectRawBody = requireRecord(
    providerProjectRawResponse.body,
    'restore.providerEvidence.projectObservation.rawArtifact.response.body'
  );
  const providerProjectRawDatabase = requireRecord(
    providerProjectRawBody.database,
    'restore.providerEvidence.projectObservation.rawArtifact.response.body.database'
  );
  const providerProjectObservedAt = requireIsoTimestamp(
    providerProject.observedAt,
    'restore.providerEvidence.projectObservation.observedAt'
  );
  assert(
    providerProject.httpMethod === 'GET' &&
      providerProject.endpoint ===
        `https://api.supabase.com/v1/projects/${String(providerProject.projectRef)}` &&
      providerProject.httpStatus === 200 &&
      providerProject.projectRef === creationOperation.createdProjectRef &&
      providerProject.organizationId === sourceEnvironment.organizationId &&
      providerProject.projectName === restoreSelection.requestedName &&
      providerProject.region === sourceEnvironment.region &&
      providerProject.status === 'ACTIVE_HEALTHY' &&
      providerProject.providerCreatedAt === providerCreatedAt &&
      providerProject.databaseHost ===
        creationOperation.createdProjectDatabaseHost &&
      providerProject.databaseVersion ===
        creationOperation.createdProjectDatabaseVersion &&
      providerProjectRawRequest.method === providerProject.httpMethod &&
      providerProjectRawRequest.url === providerProject.endpoint &&
      providerProjectRawResponse.status === providerProject.httpStatus &&
      providerProjectRawBody.ref === providerProject.projectRef &&
      providerProjectRawBody.organization_id ===
        providerProject.organizationId &&
      providerProjectRawBody.name === providerProject.projectName &&
      providerProjectRawBody.region === providerProject.region &&
      providerProjectRawBody.status === providerProject.status &&
      providerProjectRawBody.created_at === providerCreatedAt &&
      providerProjectRawDatabase.host === providerProject.databaseHost &&
      providerProjectRawDatabase.version === providerProject.databaseVersion &&
      providerProjectRaw.observedAt === providerProjectObservedAt &&
      providerProjectObservedAt === restoreReadyObservedAt,
    'restore provider project normalization does not derive from the raw Management API response'
  );
  const providerCompute = requireRecord(
    restoreProvider.computeObservation,
    'restore.providerEvidence.computeObservation'
  );
  const providerComputeBinding = verifyBoundArtifact(
    providerCompute.rawArtifact,
    'restore.providerEvidence.computeObservation.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  const providerComputeRaw = readJsonFile(
    providerComputeBinding.absolutePath,
    'restore.providerEvidence.computeObservation.rawArtifact'
  );
  const providerComputeRawResponse = requireRecord(
    providerComputeRaw.response,
    'restore.providerEvidence.computeObservation.rawArtifact.response'
  );
  const providerComputeRawBody = requireRecord(
    providerComputeRawResponse.body,
    'restore.providerEvidence.computeObservation.rawArtifact.response.body'
  );
  const selectedAddons = validateSupabaseAddonResponseBody(
    providerComputeRawBody,
    'restore.providerEvidence.computeObservation.rawArtifact.response.body'
  );
  const providerComputeObservedAt = requireIsoTimestamp(
    providerCompute.observedAt,
    'restore.providerEvidence.computeObservation.observedAt'
  );
  assert(
    providerCompute.httpMethod === 'GET' &&
      providerCompute.endpoint ===
        `https://api.supabase.com/v1/projects/${String(providerProject.projectRef)}/billing/addons` &&
      providerCompute.httpStatus === 200 &&
      providerCompute.projectRef === providerProject.projectRef &&
      providerCompute.variantId === 'ci_large' &&
      providerComputeRaw.request.method === providerCompute.httpMethod &&
      providerComputeRaw.request.url === providerCompute.endpoint &&
      providerComputeRawResponse.status === providerCompute.httpStatus &&
      providerComputeRaw.observedAt === providerComputeObservedAt &&
      selectedAddons.some(
        addon =>
          addon.type === 'compute_instance' &&
          requireRecord(
            addon.variant,
            'restore.providerEvidence.computeObservation.selectedAddon.variant'
          ).id === providerCompute.variantId
      ),
    'restore provider Large compute observation lacks raw provenance'
  );
  const providerSourceMirrorBinding = verifyBoundArtifact(
    restoreProvider.sourceMirroredConfiguration,
    'restore.providerEvidence.sourceMirroredConfiguration',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    providerSourceMirrorBinding.path,
    providerSourceMirrorBinding.sha256,
    sourceMirroredConfigurationBinding,
    'restore.providerEvidence.sourceMirroredConfiguration'
  );
  const providerRestoreMirrorBinding = verifyBoundArtifact(
    restoreProvider.restoreMirroredConfiguration,
    'restore.providerEvidence.restoreMirroredConfiguration',
    artifactHashes,
    artifactFiles
  );
  const restoreMirroredConfiguration = readJsonFile(
    providerRestoreMirrorBinding.absolutePath,
    'restore.providerEvidence.restoreMirroredConfiguration'
  );
  const restoreMirroredConfigurationVerification =
    verifyMirroredConfigurationSnapshot({
      snapshot: restoreMirroredConfiguration,
      context: 'restore.providerEvidence.restoreMirroredConfiguration',
      expectedProjectRef: providerProject.projectRef,
      expectedCommandId: creationCommandId,
      commands,
      artifactHashes,
      artifactFiles,
    });
  const restoreMirroredConfigurationObservedAt =
    restoreMirroredConfigurationVerification.observedAt;
  const mirrorComparison = requireRecord(
    restoreProvider.mirrorComparison,
    'restore.providerEvidence.mirrorComparison'
  );
  assert(
    JSON.stringify(restoreMirroredConfigurationVerification.configuration) ===
      JSON.stringify(sourceMirroredConfigurationVerification.configuration) &&
      restoreMirroredConfigurationVerification.configuration.region ===
        providerProject.region &&
      restoreMirroredConfigurationVerification.configuration
        .computeAddonVariant === providerCompute.variantId &&
      [
        'region',
        'compute',
        'diskAttributes',
        'sslEnforcement',
        'networkRestrictions',
      ].every(field => mirrorComparison[field] === 'PASS') &&
      mirrorComparison.status === 'PASS',
    'restore provider mirrored configuration comparison failed'
  );
  const providerQuote = requireRecord(
    restoreProvider.costQuote,
    'restore.providerEvidence.costQuote'
  );
  const providerQuoteBinding = verifyBoundArtifact(
    providerQuote.rawArtifact,
    'restore.providerEvidence.costQuote.rawArtifact',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    providerQuoteBinding.path,
    providerQuoteBinding.sha256,
    approvedQuoteRawBinding,
    'restore.providerEvidence.costQuote.rawArtifact'
  );
  assert(
    providerQuote.sourceProjectRef === approvedQuote.sourceProjectRef &&
      providerQuote.backupId === approvedQuote.backupId &&
      providerQuote.currency === approvedQuote.currency &&
      providerQuote.cadence === approvedQuote.cadence &&
      JSON.stringify(providerQuote.lineItems) ===
        JSON.stringify(approvedQuote.lineItems) &&
      providerQuote.normalizedTotalUsd === approvedQuoteTotal &&
      providerQuote.observedAt === approvedQuoteObservedAt &&
      providerQuote.acceptedAt === creationCost.acceptedAt &&
      providerQuote.acceptedBy === creationCost.acceptedBy,
    'restore provider quote differs from the owner-approved Dashboard quote'
  );
  const rawProviderBindings = requireArray(
    restoreProvider.rawProviderArtifacts,
    'restore.providerEvidence.rawProviderArtifacts'
  ).map((value, index) =>
    verifyBoundArtifact(
      value,
      `restore.providerEvidence.rawProviderArtifacts[${String(index)}]`,
      artifactHashes,
      artifactFiles
    )
  );
  const expectedRawProviderBindings = [
    preActionInventoryBinding,
    approvedQuoteRawBinding,
    dashboardActionBinding,
    providerProjectBinding,
    providerComputeBinding,
    sourceMirroredConfigurationVerification.rawBinding,
    restoreMirroredConfigurationVerification.rawBinding,
  ];
  assertExactStringArray(
    rawProviderBindings.map(value => `${value.path}:${value.sha256}`),
    expectedRawProviderBindings.map(value => `${value.path}:${value.sha256}`),
    'restore.providerEvidence.rawProviderArtifacts'
  );
  const restoreProviderCapturedBy = requireConcreteString(
    restoreProvider.capturedBy,
    'restore.providerEvidence.capturedBy'
  );
  assert(
    restoreProviderCapturedBy === creationOwners.disasterRecoveryOperator,
    'restore provider export capturedBy does not match the approved disaster recovery operator'
  );
  const dashboardActionStartedAt = requireIsoTimestamp(
    dashboardAction.actionStartedAt,
    'restore.providerEvidence.dashboardActionEvidence.actionStartedAt'
  );
  const dashboardRestoreConfirmationAt = requireIsoTimestamp(
    dashboardAction.restoreConfirmationAt,
    'restore.providerEvidence.dashboardActionEvidence.restoreConfirmationAt'
  );
  const restoreProviderCapturedAt = requireIsoTimestamp(
    restoreProvider.capturedAt,
    'restore.providerEvidence.capturedAt'
  );
  assert(
    dashboardAction.method === 'SUPABASE_DASHBOARD_RESTORE_TO_NEW_PROJECT' &&
      dashboardActionRaw.schemaVersion === 1 &&
      dashboardActionRaw.resultType ===
        'RESTORE_TO_NEW_PROJECT_DASHBOARD_ACTION' &&
      dashboardAction.sourceProjectRef === sourceEnvironment.projectRef &&
      dashboardAction.backupId === backup.backupId &&
      dashboardAction.requestedProjectName === restoreSelection.requestedName &&
      dashboardActionRaw.method === dashboardAction.method &&
      dashboardActionRaw.sourceProjectRef ===
        dashboardAction.sourceProjectRef &&
      dashboardActionRaw.backupId === dashboardAction.backupId &&
      dashboardActionRaw.requestedProjectName ===
        dashboardAction.requestedProjectName &&
      dashboardActionRaw.actionStartedAt === dashboardActionStartedAt &&
      dashboardActionRaw.restoreConfirmationAt ===
        dashboardRestoreConfirmationAt &&
      restoreActionStartedAt === creationCommand.startedAt &&
      restoreActionStartedAt === dashboardActionStartedAt &&
      operationRestoreConfirmationAt === dashboardRestoreConfirmationAt &&
      Date.parse(operationRestoreConfirmationAt) <=
        Date.parse(restoreReadyObservedAt) &&
      Date.parse(preActionObservedAt) <= Date.parse(creationApprovedAt) &&
      Date.parse(approvedQuoteObservedAt) <=
        Date.parse(approvedQuoteAcceptedAt) &&
      Date.parse(approvedQuoteAcceptedAt) <= Date.parse(creationApprovedAt) &&
      Date.parse(creationApprovedAt) <= Date.parse(restoreActionStartedAt) &&
      Date.parse(providerCreatedAt) >=
        Date.parse(restoreActionStartedAt) -
          creationMaximumAllowedClockSkewSeconds * 1000 &&
      Date.parse(providerCreatedAt) <= Date.parse(restoreReadyObservedAt) &&
      restoreReadyObservedAt === providerProjectObservedAt &&
      Date.parse(providerProjectObservedAt) <=
        Date.parse(providerComputeObservedAt) &&
      Date.parse(providerComputeObservedAt) <=
        Date.parse(restoreMirroredConfigurationObservedAt) &&
      Date.parse(restoreMirroredConfigurationObservedAt) <=
        Date.parse(restoreProviderCapturedAt) &&
      restoreProviderCapturedAt === providerCapturedAt &&
      providerCapturedAt === creationCommand.endedAt,
    'restore provider action, creation, readiness, or capture chronology mismatch'
  );
  assert(
    creationOperation.createdProjectRef === providerProject.projectRef &&
      creationOperation.createdProjectName === providerProject.projectName &&
      creationOperation.createdProjectRegion === providerProject.region &&
      creationOperation.createdProjectDatabaseTier === 'LARGE' &&
      creationOperation.createdProjectDatabaseVersion ===
        providerProject.databaseVersion &&
      creationOperation.createdProjectUrl ===
        `https://${String(providerProject.projectRef)}.supabase.co` &&
      creationOperation.createdProjectDatabaseHost ===
        providerProject.databaseHost &&
      creationOperation.createdProjectDatabaseConnectionMode === 'DIRECT' &&
      creationOperation.createdProjectDatabaseUser === 'postgres',
    'restore creation operation environment is not derived from provider observations'
  );
  const manifestProviderCreatedAt = requireIsoTimestamp(
    restore.providerCreatedAt,
    'restore.providerCreatedAt'
  );
  const manifestRestoreReadyObservedAt = requireIsoTimestamp(
    restore.restoreReadyObservedAt,
    'restore.restoreReadyObservedAt'
  );
  const restoreRetentionDeadline = requireIsoTimestamp(
    restore.retentionDeadline,
    'restore.retentionDeadline'
  );
  const restoreCleanupDeadline = requireIsoTimestamp(
    restore.cleanupDeadline,
    'restore.cleanupDeadline'
  );
  const actualRestoreFundedThrough = requireIsoTimestamp(
    restore.fundedThrough,
    'restore.fundedThrough'
  );
  assert(
    manifestProviderCreatedAt === providerCreatedAt &&
      manifestRestoreReadyObservedAt === restoreReadyObservedAt &&
      Date.parse(restoreRetentionDeadline) ===
        Date.parse(providerCreatedAt) + 24 * 60 * 60 * 1000 &&
      Date.parse(restoreCleanupDeadline) >= Date.parse(providerCreatedAt) &&
      Date.parse(restoreCleanupDeadline) <=
        Date.parse(restoreRetentionDeadline) &&
      actualRestoreFundedThrough === restoreFundedThrough &&
      Date.parse(actualRestoreFundedThrough) >=
        Date.parse(restoreRetentionDeadline),
    'restore provider creation, readiness, retention, cleanup, or funding lifecycle mismatch'
  );

  const supplementalBinding = verifyBoundArtifact(
    {
      path: restore.supplementalApprovalPath,
      sha256: restore.supplementalApprovalSha256,
    },
    'restore.supplementalApproval',
    artifactHashes,
    artifactFiles
  );
  const supplemental = readJsonFile(
    supplementalBinding.absolutePath,
    'restore.supplementalApproval'
  );
  assert(
    supplemental.schemaVersion === 1 &&
      supplemental.phase === 'RESTORE_TARGET_VALIDATION' &&
      supplemental.status === 'APPROVED',
    'restore supplemental approval is not APPROVED'
  );
  assert(
    supplemental.sourceExecutionApproval.path === source.approvalPacketPath &&
      supplemental.sourceExecutionApproval.sha256 ===
        source.approvalPacketSha256 &&
      supplemental.restoreCreationApproval.path === creationBinding.path &&
      supplemental.restoreCreationApproval.sha256 === creationBinding.sha256,
    'restore supplemental approval is not bound to both prior approvals'
  );
  const supplementalCreationOperation = requireRecord(
    supplemental.restoreCreationOperation,
    'restore.supplementalApproval.restoreCreationOperation'
  );
  assertBindingMatch(
    supplementalCreationOperation.path,
    supplementalCreationOperation.sha256,
    creationOperationBinding,
    'restore.supplementalApproval.restoreCreationOperation'
  );
  assert(
    supplementalCreationOperation.commandId === creationCommandId &&
      supplementalCreationOperation.providerOperationIdentifierAvailability ===
        creationOperation.providerOperationIdentifierAvailability &&
      supplementalCreationOperation.createdProjectRef ===
        creationOperation.createdProjectRef &&
      supplementalCreationOperation.providerCreatedAt === providerCreatedAt &&
      supplementalCreationOperation.restoreReadyObservedAt ===
        restoreReadyObservedAt,
    'restore supplemental approval is not bound to the actual creation operation identity'
  );
  const supplementalProviderEvidence = requireRecord(
    supplementalCreationOperation.providerEvidence,
    'restore.supplementalApproval.restoreCreationOperation.providerEvidence'
  );
  assertBindingMatch(
    supplementalProviderEvidence.path,
    supplementalProviderEvidence.sha256,
    restoreProviderBinding,
    'restore.supplementalApproval.restoreCreationOperation.providerEvidence'
  );
  const supplementalAuthorization = requireRecord(
    supplemental.authorization,
    'restore.supplementalApproval.authorization'
  );
  assertExactRecordKeys(
    supplementalAuthorization,
    [
      'restoreProjectConnectionAuthorized',
      'postRestoreValidationAuthorized',
      'approvedQualificationMutationAuthorized',
      'restoreProjectGeneralMutationAuthorized',
      'sourceProjectMutationAuthorized',
      'productionConnectionAuthorized',
      'readyTransitionAuthorized',
      'mergeAuthorized',
      'commercialReleaseAuthorized',
      'indexRetirementAuthorized',
    ],
    'restore.supplementalApproval.authorization'
  );
  assert(
    supplementalAuthorization.restoreProjectConnectionAuthorized === true &&
      supplementalAuthorization.postRestoreValidationAuthorized === true &&
      supplementalAuthorization.approvedQualificationMutationAuthorized ===
        true,
    'restore supplemental approval does not authorize scoped restore validation'
  );
  for (const field of [
    'restoreProjectGeneralMutationAuthorized',
    'sourceProjectMutationAuthorized',
    'productionConnectionAuthorized',
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ]) {
    assert(
      supplementalAuthorization[field] === false,
      `restore.supplementalApproval.authorization.${field} must be false`
    );
  }
  const restoreEnvironment = requireRecord(
    restore.targetEnvironment,
    'restore.targetEnvironment'
  );
  const approvedRestore = requireRecord(
    supplemental.restoreEnvironment,
    'restore.supplementalApproval.restoreEnvironment'
  );
  for (const field of [
    'organizationId',
    'projectRef',
    'projectName',
    'region',
    'databaseTier',
    'databaseVersion',
    'projectUrl',
    'databaseHost',
    'databaseConnectionMode',
    'databaseUser',
  ]) {
    assert(
      approvedRestore[field] === restoreEnvironment[field],
      `restore.targetEnvironment.${field} approval mismatch`
    );
    requireConcreteString(
      restoreEnvironment[field],
      `restore.targetEnvironment.${field}`
    );
  }
  for (const [operationField, environmentField] of [
    ['createdProjectRef', 'projectRef'],
    ['createdProjectName', 'projectName'],
    ['createdProjectRegion', 'region'],
    ['createdProjectDatabaseTier', 'databaseTier'],
    ['createdProjectDatabaseVersion', 'databaseVersion'],
    ['createdProjectUrl', 'projectUrl'],
    ['createdProjectDatabaseHost', 'databaseHost'],
    ['createdProjectDatabaseConnectionMode', 'databaseConnectionMode'],
    ['createdProjectDatabaseUser', 'databaseUser'],
  ]) {
    assert(
      creationOperation[operationField] ===
        restoreEnvironment[environmentField],
      `restore creation operation ${operationField} does not match restore target ${environmentField}`
    );
  }
  const restoreProjectRef = requireNonProductionProjectRef(
    restoreEnvironment.projectRef,
    'restore.targetEnvironment.projectRef'
  );
  assert(
    restoreProjectRef !== sourceEnvironment.projectRef &&
      restoreEnvironment.organizationId === sourceEnvironment.organizationId &&
      restoreEnvironment.projectName === restoreSelection.requestedName,
    'restore target provider identity violates source/restore isolation'
  );
  requireConcreteString(
    restoreEnvironment.systemIdentifier,
    'restore.targetEnvironment.systemIdentifier'
  );
  for (const field of ['region', 'databaseTier', 'databaseVersion']) {
    assert(
      restoreEnvironment[field] === sourceEnvironment[field],
      `restore ${field} must match the source environment`
    );
  }
  const restoreUrl = new URL(restoreEnvironment.projectUrl);
  assert(
    restoreUrl.protocol === 'https:' &&
      restoreUrl.hostname === `${restoreProjectRef}.supabase.co`,
    'restore project URL does not match the restore project ref'
  );
  verifyDirectDatabaseIdentity(restoreEnvironment, 'restore.targetEnvironment');
  const approvedSource = requireRecord(
    supplemental.sourceEnvironment,
    'restore.supplementalApproval.sourceEnvironment'
  );
  for (const field of [
    'organizationId',
    'projectRef',
    'projectName',
    'region',
    'databaseTier',
    'databaseVersion',
    'systemIdentifier',
    'databaseHost',
    'databaseConnectionMode',
    'databaseUser',
  ]) {
    assert(
      approvedSource[field] === sourceEnvironment[field],
      `restore supplemental source ${field} mismatch`
    );
  }
  verifyDirectDatabaseIdentity(
    approvedSource,
    'restore.supplementalApproval.sourceEnvironment'
  );
  const supplementalBackup = requireRecord(
    supplemental.selectedBackup,
    'restore.supplementalApproval.selectedBackup'
  );
  assert(
    JSON.stringify(supplementalBackup) === JSON.stringify(creationBackup),
    'restore supplemental selected backup differs from creation approval'
  );
  const supplementalApproval = requireRecord(
    supplemental.approval,
    'restore.supplementalApproval.approval'
  );
  const supplementalApprovedAt = requireIsoTimestamp(
    supplementalApproval.approvedAt,
    'restore.supplementalApproval.approval.approvedAt',
    { notFuture: true }
  );
  const supplementalExpiresAt = requireIsoTimestamp(
    supplementalApproval.expiresAt,
    'restore.supplementalApproval.approval.expiresAt',
    { future: true }
  );
  assert(
    Date.parse(supplementalApprovedAt) >= Date.parse(creationCommand.endedAt),
    'restore supplemental approval precedes restore project creation completion'
  );
  assert(
    Date.parse(supplementalApprovedAt) < Date.parse(supplementalExpiresAt),
    'restore supplemental approval expiry must follow approval'
  );
  verifyBoundArtifact(
    {
      path: supplementalApproval.evidencePath,
      sha256: supplementalApproval.evidenceSha256,
    },
    'restore.supplementalApproval.approval.evidence',
    artifactHashes,
    artifactFiles
  );
  const supplementalOwners = requireRecord(
    supplemental.owners,
    'restore.supplementalApproval.owners'
  );
  verifyOwnerSeparation(
    supplementalApproval,
    supplementalOwners,
    'restore.supplementalApproval'
  );
  const identityCommandContract = requireRecord(
    supplemental.firstSupplementalIdentityAndClockCommand,
    'restore.supplementalApproval.firstSupplementalIdentityAndClockCommand'
  );
  assertExactRecordKeys(
    identityCommandContract,
    [
      'commandId',
      'resultType',
      'status',
      'remoteContact',
      'mutating',
      'mutationScope',
      'requiredCapturedFields',
      'mustCompleteBeforeAnyOtherRestoreCommand',
      'sourceAndRestoreSystemIdentifierRelationshipMustBeObserved',
    ],
    'restore.supplementalApproval.firstSupplementalIdentityAndClockCommand'
  );
  assert(
    identityCommandContract.commandId ===
      commandApproval.restoreIdentityCommandId &&
      identityCommandContract.resultType ===
        'RESTORE_IDENTITY_CLOCK_OPERATION' &&
      identityCommandContract.status === 'APPROVED_NOT_RUN' &&
      identityCommandContract.remoteContact === true &&
      identityCommandContract.mutating === false &&
      identityCommandContract.mutationScope === 'NONE' &&
      JSON.stringify(identityCommandContract.requiredCapturedFields) ===
        JSON.stringify([
          'restore project ref',
          'project URL',
          'direct database host and user',
          'database version',
          'database system identifier',
          'restore database clock_timestamp() UTC',
          'command start/end UTC',
          'stdout/stderr SHA-256',
        ]) &&
      identityCommandContract.mustCompleteBeforeAnyOtherRestoreCommand ===
        true &&
      identityCommandContract.sourceAndRestoreSystemIdentifierRelationshipMustBeObserved ===
        true,
    'restore supplemental first identity/clock command contract drift'
  );
  const identityCommand = commands.find(
    command => command.id === commandApproval.restoreIdentityCommandId
  );
  assert(identityCommand, 'restore identity/clock command is missing');
  assert(
    identityCommand.phase === 'restore_identity' &&
      identityCommand.remoteContact === true &&
      identityCommand.mutating === false &&
      identityCommand.mutationScope === 'NONE' &&
      Date.parse(identityCommand.startedAt) >=
        Date.parse(supplementalApprovedAt) &&
      Date.parse(identityCommand.endedAt) <= Date.parse(supplementalExpiresAt),
    'restore identity/clock command exceeds supplemental read-only authority'
  );
  const identityOperationBinding = verifyBoundArtifact(
    {
      path: identityCommand.stdoutPath,
      sha256: identityCommand.stdoutSha256,
    },
    'restore.identityClockOperation',
    artifactHashes,
    artifactFiles
  );
  const identityOperation = readJsonFile(
    identityOperationBinding.absolutePath,
    'restore.identityClockOperation'
  );
  const restoreDatabaseUtc = requireIsoTimestamp(
    identityOperation.restoreDatabaseUtc,
    'restore.identityClockOperation.restoreDatabaseUtc'
  );
  assert(
    identityOperation.schemaVersion === 1 &&
      identityOperation.resultType === 'RESTORE_IDENTITY_CLOCK_OPERATION' &&
      identityOperation.status === 'CAPTURED' &&
      identityOperation.commandId === identityCommand.id &&
      identityOperation.capturedAt === identityCommand.endedAt &&
      Date.parse(identityCommand.startedAt) <= Date.parse(restoreDatabaseUtc) &&
      Date.parse(restoreDatabaseUtc) <= Date.parse(identityCommand.endedAt),
    'restore identity/clock operation is not bound to its command window'
  );
  verifyRuntimeIdentityBinding(
    identityOperation.runtimeIdentity,
    restoreEnvironment,
    'restore.identityClockOperation.runtimeIdentity'
  );
  const expectedSystemIdentifierRelationship =
    restoreEnvironment.systemIdentifier === sourceEnvironment.systemIdentifier
      ? 'SAME'
      : 'DIFFERENT';
  assert(
    identityOperation.relationshipToSource ===
      expectedSystemIdentifierRelationship,
    'restore system-identifier relationship was not derived and recorded'
  );
  const identityConstraints = requireRecord(
    supplemental.identityConstraints,
    'restore.supplementalApproval.identityConstraints'
  );
  assertExactRecordKeys(
    identityConstraints,
    [
      'prohibitedProjectRefs',
      'sourceAndRestoreProjectRefsMustDiffer',
      'sourceAndRestoreSystemIdentifierRelationshipPolicy',
      'organizationMustMatch',
      'regionAndTierMustMatchApprovedDrContract',
      'currentLinkMustMatchRestoreRefBeforeEveryRemoteCommand',
    ],
    'restore.supplementalApproval.identityConstraints'
  );
  assert(
    JSON.stringify(identityConstraints.prohibitedProjectRefs) ===
      JSON.stringify(PROHIBITED_PROJECT_REFS) &&
      identityConstraints.sourceAndRestoreProjectRefsMustDiffer === true &&
      identityConstraints.sourceAndRestoreSystemIdentifierRelationshipPolicy ===
        'OBSERVE_SAME_OR_DIFFERENT_NO_CROSS_TARGET_VERDICT' &&
      identityConstraints.organizationMustMatch === true &&
      identityConstraints.regionAndTierMustMatchApprovedDrContract === true &&
      identityConstraints.currentLinkMustMatchRestoreRefBeforeEveryRemoteCommand ===
        true,
    'restore identity constraints drift'
  );
  assert(
    !Object.hasOwn(creationOperation, 'restoreDatabaseUtc') &&
      !Object.hasOwn(creationOperation, 'restoreDatabaseClockTimestampUtc'),
    'restore creation operation must not claim a restore database clock before supplemental approval'
  );
  const validationCommandIds = requireConcreteStringArray(
    restore.validationCommandIds,
    'restore.validationCommandIds'
  );
  const mutationCommandIds = requireConcreteStringArray(
    restore.mutationCommandIds,
    'restore.mutationCommandIds'
  );
  assertExactStringArray(
    commandApproval.restoreQualificationCommandIds,
    validationCommandIds,
    'ledger-derived restore validation command IDs'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      supplemental.approvedQualificationMutationCommandIds,
      'restore.supplementalApproval.approvedQualificationMutationCommandIds'
    ),
    mutationCommandIds,
    'restore qualification mutation command IDs'
  );
  assertExactStringArray(
    commandApproval.restoreQualificationMutationCommandIds,
    mutationCommandIds,
    'ledger-derived restore qualification mutation command IDs'
  );
  for (const commandId of mutationCommandIds) {
    assert(
      validationCommandIds.includes(commandId),
      `restore mutation command is outside validation scope: ${commandId}`
    );
  }
  const validationIds = new Set();
  const validationCommands = [];
  let previousValidationEndedAt = null;
  for (const commandId of validationCommandIds) {
    assert(
      !validationIds.has(commandId),
      `restore validation command is duplicated: ${commandId}`
    );
    validationIds.add(commandId);
    const command = commands.find(value => value.id === commandId);
    assert(command, `restore validation command is missing: ${commandId}`);
    assert(
      Date.parse(command.startedAt) >= Date.parse(supplementalApprovedAt) &&
        Date.parse(command.endedAt) <= Date.parse(supplementalExpiresAt),
      `restore validation command is outside supplemental approval: ${commandId}`
    );
    if (previousValidationEndedAt !== null) {
      assert(
        Date.parse(command.startedAt) >= Date.parse(previousValidationEndedAt),
        `restore validation command order is reversed: ${commandId}`
      );
    }
    previousValidationEndedAt = command.endedAt;
    validationCommands.push(command);
  }
  const lastValidationCommand = validationCommands.at(-1);
  assert(lastValidationCommand, 'restore validation command list is empty');
  assert(
    Date.parse(identityCommand.endedAt) <=
      Date.parse(validationCommands[0].startedAt),
    'restore identity/clock command must complete before every validation command'
  );
  assert(
    lastValidationCommand.mutating === false &&
      lastValidationCommand.mutationScope === 'NONE',
    'final post-restore qualification operation must be non-mutating'
  );
  const postRestoreOperationBinding = verifyBoundArtifact(
    {
      path: lastValidationCommand.stdoutPath,
      sha256: lastValidationCommand.stdoutSha256,
    },
    'restore.postRestoreQualificationOperation',
    artifactHashes,
    artifactFiles
  );
  const postRestoreOperation = readJsonFile(
    postRestoreOperationBinding.absolutePath,
    'restore.postRestoreQualificationOperation'
  );
  assert(
    postRestoreOperation.schemaVersion === 1 &&
      postRestoreOperation.resultType ===
        'POST_RESTORE_QUALIFICATION_OPERATION' &&
      postRestoreOperation.status === 'PASS' &&
      postRestoreOperation.commandId === lastValidationCommand.id &&
      postRestoreOperation.sourceProjectRef === sourceEnvironment.projectRef &&
      postRestoreOperation.restoreProjectRef === restoreProjectRef &&
      postRestoreOperation.restoredWatermark === backup.sourceWatermark,
    'post-restore qualification operation result identity mismatch'
  );
  verifyDrExcludedManualScope({
    manifest,
    sourceEnvironment,
    restoreEnvironment,
    commands,
    postRestoreOperation,
    projectionContract,
    projectionContractSha256:
      drOperationEvidence.platformConfigProjectionContractSha256,
    projectionCollectorBinding,
    targetCredentialConfigurations,
    artifactHashes,
    artifactFiles,
  });

  assert(restore.status === 'PASS', 'restore.status must be PASS');
  for (const [manifestField, contractField] of [
    ['restoreSource', 'restoreSource'],
    ['restorePoint', 'restorePoint'],
    ['rtoStartEvent', 'rtoStartEvent'],
    ['rtoEndEvent', 'rtoEndEvent'],
    ['rtoMeasurementClockAndSource', 'rtoMeasurementClockAndSource'],
    ['rpoWatermarkDefinition', 'rpoWatermarkDefinition'],
    ['rpoObservationEvent', 'rpoObservationEvent'],
    ['rpoMeasurementClockAndSource', 'rpoMeasurementClockAndSource'],
  ]) {
    assert(
      restore[manifestField] === drContract[contractField],
      `restore.${manifestField} approval mismatch`
    );
  }
  const rtoStartAt = requireIsoTimestamp(
    restore.rtoStartedAt,
    'restore.rtoStartedAt'
  );
  const restoreConfirmationAt = requireIsoTimestamp(
    restore.restoreConfirmationAt,
    'restore.restoreConfirmationAt'
  );
  const rtoEndAt = requireIsoTimestamp(
    restore.postRestoreQualificationCompletedAt,
    'restore.postRestoreQualificationCompletedAt'
  );
  const rpoObservedAt = requireIsoTimestamp(
    restore.rpoObservedAt,
    'restore.rpoObservedAt'
  );
  const restoredWatermark = requireIsoTimestamp(
    restore.restoredWatermark,
    'restore.restoredWatermark'
  );
  assert(
    restore.restoredWatermark === backup.sourceWatermark,
    'restore watermark does not match the selected backup watermark'
  );
  assert(
    creationOperation.actionStartedAt === rtoStartAt &&
      creationCommand.startedAt === rtoStartAt,
    'restore RTO start is not bound to the owner-approved creation action start'
  );
  assert(
    creationOperation.restoreConfirmationAt === restoreConfirmationAt &&
      Date.parse(restore.restoreReadyObservedAt) >=
        Date.parse(restoreConfirmationAt) &&
      Date.parse(restoreConfirmationAt) <= Date.parse(creationCommand.endedAt),
    'restore confirmation timestamp is not bound to the creation operation result'
  );
  assert(
    creationOperation.rpoObservedAt === rpoObservedAt &&
      Date.parse(creationCommand.startedAt) <= Date.parse(rpoObservedAt) &&
      Date.parse(rpoObservedAt) <= Date.parse(creationCommand.endedAt),
    'RPO observation timestamp is not bound to the creation operation result'
  );
  assert(
    postRestoreOperation.completedAt === rtoEndAt &&
      lastValidationCommand.endedAt === rtoEndAt,
    'post-restore completion timestamp is not bound to the final validation operation result'
  );
  assert(
    Date.parse(backupProviderInsertedAt) <= Date.parse(rpoObservedAt) &&
      Date.parse(rtoStartAt) <= Date.parse(rpoObservedAt) &&
      Date.parse(rpoObservedAt) <= Date.parse(restoreConfirmationAt) &&
      Date.parse(restoreConfirmationAt) <= Date.parse(rtoEndAt),
    'restore RTO event order is invalid'
  );
  const operatorUtcAtCompletion = requireIsoTimestamp(
    postRestoreOperation.operatorUtcAtCompletion,
    'restore.postRestoreQualificationOperation.operatorUtcAtCompletion'
  );
  const completionMonotonicTimer = requireRecord(
    postRestoreOperation.monotonicTimer,
    'restore.postRestoreQualificationOperation.monotonicTimer'
  );
  assertExactRecordKeys(
    completionMonotonicTimer,
    [
      'timerSessionId',
      'runnerInstanceId',
      'clockSource',
      'processStartedAt',
      'runner',
      'endNanoseconds',
      'elapsedNanoseconds',
      'elapsedSeconds',
    ],
    'restore.postRestoreQualificationOperation.monotonicTimer'
  );
  const completionTimerRunnerBinding = verifyBoundArtifact(
    completionMonotonicTimer.runner,
    'restore.postRestoreQualificationOperation.monotonicTimer.runner',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    creationTimerRunnerBinding.path,
    creationTimerRunnerBinding.sha256,
    completionTimerRunnerBinding,
    'restore monotonic timer runner continuity'
  );
  const endNanosecondsText = requireConcreteString(
    completionMonotonicTimer.endNanoseconds,
    'restore.postRestoreQualificationOperation.monotonicTimer.endNanoseconds'
  );
  const elapsedNanosecondsText = requireConcreteString(
    completionMonotonicTimer.elapsedNanoseconds,
    'restore.postRestoreQualificationOperation.monotonicTimer.elapsedNanoseconds'
  );
  assert(
    /^\d+$/.test(endNanosecondsText) && /^\d+$/.test(elapsedNanosecondsText),
    'restore monotonic timer end and elapsed values must be unsigned integer strings'
  );
  const monotonicTimerEndNanoseconds = BigInt(endNanosecondsText);
  const reportedElapsedNanoseconds = BigInt(elapsedNanosecondsText);
  const computedElapsedNanoseconds =
    monotonicTimerEndNanoseconds - monotonicTimerStartNanoseconds;
  const reportedMonotonicElapsedSeconds = requireNumber(
    completionMonotonicTimer.elapsedSeconds,
    'restore.postRestoreQualificationOperation.monotonicTimer.elapsedSeconds'
  );
  const computedRto = Number(computedElapsedNanoseconds) / 1_000_000_000;
  const wallClockElapsedSeconds =
    (Date.parse(rtoEndAt) - Date.parse(rtoStartAt)) / 1000;
  const computedRpo =
    (Date.parse(sourceDatabaseUtcAtRpoObservation) -
      Date.parse(restoredWatermark)) /
    1000;
  assert(
    operatorUtcAtCompletion === rtoEndAt &&
      completionMonotonicTimer.timerSessionId === timerSessionId &&
      completionMonotonicTimer.runnerInstanceId === timerRunnerInstanceId &&
      completionMonotonicTimer.clockSource === 'NODE_PROCESS_HRTIME_BIGINT' &&
      completionMonotonicTimer.processStartedAt === timerProcessStartedAt &&
      monotonicTimerEndNanoseconds >= monotonicTimerStartNanoseconds &&
      reportedElapsedNanoseconds === computedElapsedNanoseconds &&
      reportedMonotonicElapsedSeconds === computedRto &&
      Math.abs(wallClockElapsedSeconds - computedRto) <=
        approvedMaximumClockSkewSeconds &&
      creationOperation.sourceDatabaseUtcAtRpoObservation === rpoObservedAt &&
      Date.parse(restoreConfirmationAt) - Date.parse(rpoObservedAt) <=
        approvedMaximumRpoObservationLeadSeconds * 1000 &&
      computedRpo >= 0,
    'restore multi-clock RTO/RPO provenance or numeric skew validation failed'
  );
  const rtoThreshold = requireNumber(
    restore.rtoThresholdSeconds,
    'restore.rtoThresholdSeconds'
  );
  const rpoThreshold = requireNumber(
    restore.rpoThresholdSeconds,
    'restore.rpoThresholdSeconds'
  );
  assert(
    rtoThreshold === drContract.rtoThresholdSeconds &&
      rpoThreshold === drContract.rpoThresholdSeconds,
    'restore RTO/RPO threshold approval mismatch'
  );
  assert(
    restore.rtoSeconds === computedRto && restore.rpoSeconds === computedRpo,
    'restore RTO/RPO values were not recomputed from the approved event timestamps'
  );
  assert(
    computedRto <= rtoThreshold && computedRpo <= rpoThreshold,
    'restore RTO or RPO exceeds its frozen threshold'
  );
  verifyEvidenceReferences(restore.evidence, 'restore.evidence', artifactPaths);
  const postRestore = requireRecord(manifest.postRestore, 'postRestore');
  const structuredResults = requireRecord(
    postRestore.structuredResults,
    'postRestore.structuredResults'
  );
  const sourceSecurity = requireRecord(
    manifest.securityMatrix,
    'securityMatrix'
  );
  const sourceDataApi = requireRecord(
    sourceEnvironment.dataApi,
    'environment.dataApi'
  );
  const sourceGraphQl = requireRecord(
    sourceEnvironment.graphQl,
    'environment.graphQl'
  );
  const sourceIntegrityBinding = verifyBoundArtifact(
    requireRecord(manifest.integrityResults, 'integrityResults').source,
    'integrityResults.source',
    artifactHashes,
    artifactFiles
  );
  const sourceIntegrityResult = readJsonFile(
    sourceIntegrityBinding.absolutePath,
    'integrityResults.source.result'
  );
  const sourceEvidencePaths = new Set([
    ...collectEvidencePaths(sourceSecurity),
    ...collectEvidencePaths(sourceDataApi),
    ...collectEvidencePaths(sourceGraphQl),
    ...collectEvidencePaths(sourceIntegrityResult),
  ]);
  const restoreRawEvidencePaths = new Set();
  const restoreResultCommandIds = new Set();
  const readFreshRestoreResult = ({
    bindingValue,
    context,
    resultType,
    rawResultType,
    projectRefField,
    evidencePayload,
    verifyRawObservations,
  }) => {
    const binding = verifyBoundArtifact(
      bindingValue,
      context,
      artifactHashes,
      artifactFiles
    );
    const result = readJsonFile(binding.absolutePath, `${context}.result`);
    assert(
      result.schemaVersion === 1 &&
        result.resultType === resultType &&
        result.status === 'PASS' &&
        result[projectRefField] === restoreProjectRef,
      `${context} target or result type mismatch`
    );
    const commandId = requireConcreteString(
      result.commandId,
      `${context}.commandId`
    );
    assert(
      validationIds.has(commandId),
      `${context}.commandId is outside supplemental approval scope`
    );
    const command = validationCommands.find(value => value.id === commandId);
    assert(command, `${context}.commandId is missing`);
    assert(
      command.id !== lastValidationCommand.id &&
        command.stdoutPath.replaceAll('\\', '/') === binding.path &&
        command.stdoutSha256 === binding.sha256,
      `${context} is not the exact stdout of its dedicated approved command`
    );
    assert(
      !restoreResultCommandIds.has(commandId),
      `${context}.commandId is reused by another restore result`
    );
    restoreResultCommandIds.add(commandId);
    const capturedAt = requireIsoTimestamp(
      result.capturedAt,
      `${context}.capturedAt`
    );
    assert(
      capturedAt === command.endedAt,
      `${context}.capturedAt is not bound to its command`
    );
    verifyRuntimeIdentityBinding(
      result.runtimeIdentity,
      restoreEnvironment,
      `${context}.runtimeIdentity`
    );
    const rawBindings = requireArray(
      result.rawEvidence,
      `${context}.rawEvidence`
    );
    assert(
      rawBindings.length === 1,
      `${context}.rawEvidence must contain exactly one family-specific observation envelope`
    );
    const resultRawPaths = [];
    let rawObservationEnvelope;
    for (const [index, rawValue] of rawBindings.entries()) {
      const rawContext = `${context}.rawEvidence[${String(index)}]`;
      const rawBinding = verifyBoundArtifact(
        rawValue,
        rawContext,
        artifactHashes,
        artifactFiles
      );
      assert(
        !sourceEvidencePaths.has(rawBinding.path),
        `${rawContext} reuses source-environment evidence`
      );
      assert(
        !restoreRawEvidencePaths.has(rawBinding.path),
        `${rawContext} is reused by another restore result`
      );
      restoreRawEvidencePaths.add(rawBinding.path);
      resultRawPaths.push(rawBinding.path);
      const rawResult = readJsonFile(
        rawBinding.absolutePath,
        `${rawContext}.result`
      );
      assert(
        rawResult.schemaVersion === 1 &&
          rawResult.resultType === rawResultType &&
          rawResult.status === 'CAPTURED' &&
          rawResult.projectRef === restoreProjectRef &&
          rawResult.commandId === commandId &&
          rawResult.capturedAt === capturedAt &&
          rawResult.systemIdentifier === restoreEnvironment.systemIdentifier &&
          rawResult.databaseHost === restoreEnvironment.databaseHost,
        `${rawContext} is not fresh restore-scoped raw evidence`
      );
      rawObservationEnvelope = rawResult;
    }
    const rawVerification = verifyRawObservations(
      requireRecord(
        rawObservationEnvelope,
        `${context}.rawObservationEnvelope`
      ),
      result,
      `${context}.rawObservationEnvelope`,
      { startedAt: command.startedAt, endedAt: command.endedAt }
    );
    const payload = evidencePayload(result);
    const payloadEvidencePaths = [...collectEvidencePaths(payload)].sort();
    const expectedRawPaths = [...resultRawPaths].sort();
    assertExactStringArray(
      payloadEvidencePaths,
      expectedRawPaths,
      `${context}.rawEvidence usage`
    );
    return { binding, result, rawVerification };
  };
  const restoreIntegrityBinding = requireRecord(
    manifest.integrityResults,
    'integrityResults'
  ).restore;
  const postRestoreIntegrity = readFreshRestoreResult({
    bindingValue: restoreIntegrityBinding,
    context: 'integrityResults.restore',
    resultType: 'RESTORE_DATA_INTEGRITY',
    rawResultType: 'POST_RESTORE_INTEGRITY_RAW_EVIDENCE',
    projectRefField: 'restoreProjectRef',
    evidencePayload: result => result,
    verifyRawObservations: verifyIntegrityRawObservations,
  });
  const postRestoreSecurity = readFreshRestoreResult({
    bindingValue: structuredResults.securityMatrix,
    context: 'postRestore.structuredResults.securityMatrix',
    resultType: 'POST_RESTORE_SECURITY_MATRIX_RESULT',
    rawResultType: 'POST_RESTORE_SECURITY_RAW_EVIDENCE',
    projectRefField: 'projectRef',
    evidencePayload: result => result.result,
    verifyRawObservations: verifySecurityRawObservations,
  });
  const postRestoreDataApi = readFreshRestoreResult({
    bindingValue: structuredResults.dataApi,
    context: 'postRestore.structuredResults.dataApi',
    resultType: 'POST_RESTORE_DATA_API_RESULT',
    rawResultType: 'POST_RESTORE_DATA_API_RAW_EVIDENCE',
    projectRefField: 'projectRef',
    evidencePayload: result => result.result,
    verifyRawObservations: (...args) =>
      verifyDataApiRawObservations(
        ...args,
        postRestoreSecurity.rawVerification.byId
      ),
  });
  const postRestoreGraphQl = readFreshRestoreResult({
    bindingValue: structuredResults.graphQl,
    context: 'postRestore.structuredResults.graphQl',
    resultType: 'POST_RESTORE_GRAPHQL_RESULT',
    rawResultType: 'POST_RESTORE_GRAPHQL_RAW_EVIDENCE',
    projectRefField: 'projectRef',
    evidencePayload: result => result.result,
    verifyRawObservations: (...args) =>
      verifyGraphQlRawObservations(
        ...args,
        postRestoreSecurity.rawVerification.byId
      ),
  });
  const supplementalCredentialControls = requireRecord(
    supplemental.credentialControls,
    'restore.supplementalApproval.credentialControls'
  );
  const supplementalCredentialContract = verifyBoundArtifact(
    supplementalCredentialControls.credentialContract,
    'restore.supplementalApproval.credentialControls.credentialContract',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    supplementalCredentialContract.path,
    supplementalCredentialContract.sha256,
    sourceApprovalWindow.bindings.get('credentialContract'),
    'restore.supplementalApproval.credentialControls.credentialContract'
  );
  const restoreCredentialProviderConfiguration = verifyBoundArtifact(
    supplementalCredentialControls.restoreCredentialProviderConfiguration,
    'restore.supplementalApproval.credentialControls.restoreCredentialProviderConfiguration',
    artifactHashes,
    artifactFiles
  );
  assertBindingMatch(
    restoreCredentialProviderConfiguration.path,
    restoreCredentialProviderConfiguration.sha256,
    targetCredentialConfigurations.get('RESTORE').binding,
    'restore.supplementalApproval.credentialControls.restoreCredentialProviderConfiguration'
  );
  assert(
    supplementalCredentialControls.parentEnvironmentPrefix ===
      'PR12_RESTORE_' &&
      supplementalCredentialControls.crossTargetFallbackAllowed === false &&
      supplementalCredentialControls.secretValuesCaptured === false,
    'restore supplemental credential target boundary drift'
  );
  const restoreSideEffects = verifyExternalSideEffectTarget({
    manifest,
    targetName: 'restore',
    expectedResultType: 'POST_RESTORE_SIDE_EFFECT_RESULT',
    expectedCommandId: 'PR12-CMD-019A',
    expectedTargetKind: 'RESTORE',
    expectedProjectRef: restoreProjectRef,
    expectedRuntimeIdentity: restoreEnvironment,
    expectedCredentialConfiguration: restoreCredentialProviderConfiguration,
    serviceRoleCredentialConfiguration:
      targetCredentialConfigurations.get('RESTORE'),
    approvedIntegrationContract: sourceApprovalWindow.bindings.get(
      'integrationContract'
    ),
    approvedCredentialContract:
      sourceApprovalWindow.bindings.get('credentialContract'),
    artifactPaths,
    artifactHashes,
    artifactFiles,
    commands,
  });
  assert(
    [...sourceSideEffectInventory.rawArtifactPaths].every(
      artifactPath => !restoreSideEffects.rawArtifactPaths.has(artifactPath)
    ),
    'source and restore external-side-effect raw artifacts must be disjoint'
  );
  assert(
    sourceSideEffectInventory.serviceRoleReportBinding.path !==
      restoreSideEffects.serviceRoleReportBinding.path &&
      sourceSideEffectInventory.serviceRoleReportBinding.sha256 !==
        restoreSideEffects.serviceRoleReportBinding.sha256,
    'post-restore service-role non-exposure report reuses source evidence'
  );
  assert(
    validationCommandIds.includes(restoreSideEffects.command.id) &&
      restoreSideEffects.result.sourceProjectRef ===
        sourceEnvironment.projectRef,
    'restore external-side-effect command or source identity mismatch'
  );
  const restoreSourceInventory = requireRecord(
    restoreSideEffects.result.sourceInventory,
    'externalSideEffects.restore.result.sourceInventory'
  );
  assertBindingMatch(
    restoreSourceInventory.path,
    restoreSourceInventory.sha256,
    sourceSideEffectInventory.binding,
    'externalSideEffects.restore.result.sourceInventory'
  );
  verifyRuntimeIdentityBinding(
    postRestoreOperation.runtimeIdentity,
    restoreEnvironment,
    'restore.postRestoreQualificationOperation.runtimeIdentity'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      postRestoreOperation.validationCommandIds,
      'restore.postRestoreQualificationOperation.validationCommandIds'
    ),
    validationCommandIds,
    'restore.postRestoreQualificationOperation.validationCommandIds'
  );
  const operationIntegrity = requireRecord(
    postRestoreOperation.integrityResult,
    'restore.postRestoreQualificationOperation.integrityResult'
  );
  assertBindingMatch(
    operationIntegrity.path,
    operationIntegrity.sha256,
    postRestoreIntegrity.binding,
    'restore.postRestoreQualificationOperation.integrityResult'
  );
  assert(
    operationIntegrity.commandId === postRestoreIntegrity.result.commandId,
    'restore.postRestoreQualificationOperation.integrityResult command mismatch'
  );
  const operationStructuredResults = requireRecord(
    postRestoreOperation.structuredResults,
    'restore.postRestoreQualificationOperation.structuredResults'
  );
  assertExactRecordKeys(
    operationStructuredResults,
    ['securityMatrix', 'dataApi', 'graphQl'],
    'restore.postRestoreQualificationOperation.structuredResults'
  );
  for (const [name, observed] of [
    ['securityMatrix', postRestoreSecurity],
    ['dataApi', postRestoreDataApi],
    ['graphQl', postRestoreGraphQl],
  ]) {
    const operationResult = requireRecord(
      operationStructuredResults[name],
      `restore.postRestoreQualificationOperation.structuredResults.${name}`
    );
    assertBindingMatch(
      operationResult.path,
      operationResult.sha256,
      observed.binding,
      `restore.postRestoreQualificationOperation.structuredResults.${name}`
    );
    assert(
      operationResult.commandId === observed.result.commandId,
      `restore.postRestoreQualificationOperation.structuredResults.${name} command mismatch`
    );
  }
  const operationSideEffects = requireRecord(
    postRestoreOperation.externalSideEffects,
    'restore.postRestoreQualificationOperation.externalSideEffects'
  );
  assertBindingMatch(
    operationSideEffects.path,
    operationSideEffects.sha256,
    restoreSideEffects.binding,
    'restore.postRestoreQualificationOperation.externalSideEffects'
  );
  assert(
    operationSideEffects.commandId === restoreSideEffects.command.id,
    'restore.postRestoreQualificationOperation.externalSideEffects command mismatch'
  );
  const postRestoreContracts = requireRecord(
    supplemental.postRestoreContracts,
    'restore.supplementalApproval.postRestoreContracts'
  );
  assertExactRecordKeys(
    postRestoreContracts,
    [
      'securityMatrix',
      'securityTargetInventory',
      'securityTargetClassification',
      'dataApi',
      'graphQl',
    ],
    'restore.supplementalApproval.postRestoreContracts'
  );
  const sourceSecurityContractBinding = verifyBoundArtifact(
    {
      path: sourceSecurity.contractPath,
      sha256: sourceSecurity.contractSha256,
    },
    'restore.sourceSecurityContract',
    artifactHashes,
    artifactFiles
  );
  const sourceSecurityContract = readJsonFile(
    sourceSecurityContractBinding.absolutePath,
    'restore.sourceSecurityContract'
  );
  const restoreTargetInventoryBinding = verifyBoundArtifact(
    postRestoreContracts.securityTargetInventory,
    'restore.supplementalApproval.postRestoreContracts.securityTargetInventory',
    artifactHashes,
    artifactFiles
  );
  const sourceTargetInventory = requireRecord(
    sourceSecurityContract.targetInventory,
    'restore.sourceSecurityContract.targetInventory'
  );
  assertBindingMatch(
    sourceTargetInventory.path,
    sourceTargetInventory.sha256,
    restoreTargetInventoryBinding,
    'restore target inventory'
  );
  const restoreTargetInventory = readJsonFile(
    restoreTargetInventoryBinding.absolutePath,
    'restore target inventory'
  );
  const restoreTargetClassificationBinding = verifyBoundArtifact(
    postRestoreContracts.securityTargetClassification,
    'restore.supplementalApproval.postRestoreContracts.securityTargetClassification',
    artifactHashes,
    artifactFiles
  );
  const sourceTargetClassification = requireRecord(
    restoreTargetInventory.classificationContract,
    'restore target inventory classificationContract'
  );
  assertBindingMatch(
    sourceTargetClassification.path,
    sourceTargetClassification.sha256,
    restoreTargetClassificationBinding,
    'restore target classification'
  );
  const resultProvenance = requireRecord(
    supplemental.resultProvenance,
    'restore.supplementalApproval.resultProvenance'
  );
  assertExactRecordKeys(
    resultProvenance,
    [
      'validationCommandIdsMustExactlyEqualApprovedLedgerPhase',
      'dedicatedCommandStdoutRequiredFor',
      'finalOperationMustHashBindEveryDedicatedResult',
      'freshRestoreRuntimeIdentityRequired',
      'sourceEvidenceReuseAllowed',
      'restoreRawEvidenceMustBeHashBoundAndCommandScoped',
      'familySpecificRawObservationReconciliationRequired',
      'finalizationMustBeNonMutating',
    ],
    'restore.supplementalApproval.resultProvenance'
  );
  assert(
    resultProvenance.validationCommandIdsMustExactlyEqualApprovedLedgerPhase ===
      'post_restore_qualification' &&
      resultProvenance.finalOperationMustHashBindEveryDedicatedResult ===
        true &&
      resultProvenance.freshRestoreRuntimeIdentityRequired === true &&
      resultProvenance.sourceEvidenceReuseAllowed === false &&
      resultProvenance.restoreRawEvidenceMustBeHashBoundAndCommandScoped ===
        true &&
      resultProvenance.familySpecificRawObservationReconciliationRequired ===
        true &&
      resultProvenance.finalizationMustBeNonMutating === true,
    'restore supplemental result provenance boundary drift'
  );
  assertExactStringArray(
    requireConcreteStringArray(
      resultProvenance.dedicatedCommandStdoutRequiredFor,
      'restore.supplementalApproval.resultProvenance.dedicatedCommandStdoutRequiredFor'
    ),
    ['integrity', 'securityMatrix', 'dataApi', 'graphQl'],
    'restore.supplementalApproval.resultProvenance.dedicatedCommandStdoutRequiredFor'
  );
  for (const [name, sourceContract, result] of [
    ['securityMatrix', sourceSecurity, postRestoreSecurity.result.result],
    [
      'dataApi',
      {
        contractPath: sourceDataApi.matrixPath,
        contractSha256: sourceDataApi.matrixSha256,
      },
      postRestoreDataApi.result.result,
    ],
    [
      'graphQl',
      {
        contractPath: sourceGraphQl.matrixPath,
        contractSha256: sourceGraphQl.matrixSha256,
      },
      postRestoreGraphQl.result.result,
    ],
  ]) {
    const approvedContract = requireRecord(
      postRestoreContracts[name],
      `restore.supplementalApproval.postRestoreContracts.${name}`
    );
    assertBindingMatch(
      sourceContract.contractPath,
      sourceContract.contractSha256,
      {
        path: requireConcreteString(
          approvedContract.path,
          `restore.supplementalApproval.postRestoreContracts.${name}.path`
        ).replaceAll('\\', '/'),
        sha256: requireSha256(
          approvedContract.sha256,
          `restore.supplementalApproval.postRestoreContracts.${name}.sha256`
        ),
      },
      `restore.supplementalApproval.postRestoreContracts.${name}`
    );
    const resultContractPath =
      name === 'securityMatrix' ? result.contractPath : result.matrixPath;
    const resultContractSha256 =
      name === 'securityMatrix' ? result.contractSha256 : result.matrixSha256;
    assertBindingMatch(
      resultContractPath,
      resultContractSha256,
      {
        path: requireConcreteString(
          sourceContract.contractPath,
          `${name}.sourceContractPath`
        ).replaceAll('\\', '/'),
        sha256: requireSha256(
          sourceContract.contractSha256,
          `${name}.sourceContractSha256`
        ),
      },
      `postRestore.structuredResults.${name}.contract`
    );
  }
  verifySecurityMatrix(
    {
      ...manifest,
      securityMatrix: postRestoreSecurity.result.result,
      representativeData: manifest.representativeData,
    },
    artifactPaths,
    artifactHashes,
    artifactFiles,
    restoreProjectRef,
    'RESTORE',
    targetCredentialConfigurations.get('RESTORE')
  );
  const restoredAuthProvisioning = requireRecord(
    postRestoreSecurity.result.authProvisioning,
    'postRestore.structuredResults.securityMatrix.authProvisioning'
  );
  verifyAuthProvisioning(
    restoredAuthProvisioning,
    'postRestore.structuredResults.securityMatrix.authProvisioning'
  );
  assert(
    JSON.stringify(restoredAuthProvisioning) ===
      JSON.stringify(sourceEnvironment.authProvisioning),
    'post-restore Auth provisioning parity mismatch'
  );
  verifyEnvironment(
    {
      environment: {
        ...restoreEnvironment,
        organizationPlan: sourceEnvironment.organizationPlan,
        authProvisioning: restoredAuthProvisioning,
        dataApi: postRestoreDataApi.result.result,
        graphQl: postRestoreGraphQl.result.result,
      },
    },
    artifactPaths,
    artifactHashes,
    artifactFiles,
    manifest,
    sourceApprovalWindow.approvedEnvironment
  );
  const requiredStructuredEvidence = new Map([
    ['tenantIsolation', postRestoreSecurity.binding.path],
    ['authBoundary', postRestoreSecurity.binding.path],
    ['dataApiBoundary', postRestoreDataApi.binding.path],
    ['graphQlBoundary', postRestoreGraphQl.binding.path],
  ]);
  for (const field of ['schemaParity', 'dataParity']) {
    verifyPassedGate(postRestore[field], `postRestore.${field}`, artifactPaths);
  }
  for (const [field, evidencePath] of requiredStructuredEvidence) {
    verifyPassedGate(postRestore[field], `postRestore.${field}`, artifactPaths);
    assert(
      requireArray(
        postRestore[field].evidence,
        `postRestore.${field}.evidence`
      ).includes(evidencePath),
      `postRestore.${field}.evidence does not include its structured result`
    );
  }
  return {
    binding: watermarkOperationBinding,
    integrity: postWatermarkIntegrity,
    releaseTargetConflictResolved: verifiedDrContract.releaseResolved,
  };
}

function verifyIntegrationContract(manifest, approvedIntegration) {
  const contract = readJsonFile(
    approvedIntegration.absolutePath,
    'approvalPacket.integrationContract'
  );
  assert(
    contract.schemaVersion === 1,
    'integration contract schemaVersion drift'
  );
  const sideEffects = requireRecord(
    manifest.externalSideEffects,
    'externalSideEffects'
  );
  const targetModes = requireRecord(
    contract.targetModes,
    'approvalPacket.integrationContract.targetModes'
  );
  assertExactRecordKeys(
    targetModes,
    ['source', 'restore'],
    'approvalPacket.integrationContract.targetModes'
  );
  assert(
    targetModes.source === 'SANDBOXED' && targetModes.restore === 'DISABLED',
    'integration contract target modes drift'
  );
  const sideEffectCollector = requireRecord(
    contract.sideEffectCollector,
    'approvalPacket.integrationContract.sideEffectCollector'
  );
  assertExactRecordKeys(
    sideEffectCollector,
    [
      'collectorId',
      'descriptorPath',
      'descriptorArtifactSha256',
      'implementationStatus',
    ],
    'approvalPacket.integrationContract.sideEffectCollector'
  );
  assert(
    sideEffectCollector.collectorId === SIDE_EFFECT_COLLECTOR_ID &&
      sideEffectCollector.descriptorPath === SIDE_EFFECT_DESCRIPTOR_PATH &&
      sideEffectCollector.descriptorArtifactSha256 ===
        SIDE_EFFECT_DESCRIPTOR_ARTIFACT_SHA256 &&
      sideEffectCollector.implementationStatus === 'IMPLEMENTED',
    'integration contract side-effect collector descriptor drift'
  );
  for (const targetName of ['source', 'restore']) {
    const target = requireRecord(
      sideEffects[targetName],
      `externalSideEffects.${targetName}`
    );
    assert(
      target.mode === targetModes[targetName],
      `externalSideEffects.${targetName}.mode approval mismatch`
    );
  }
  assert(
    contract.realExternalSideEffectsAllowed === false,
    'integration contract must prohibit real external side effects'
  );
  assert(
    contract.mode === 'SANDBOXED',
    'integration contract mode is unsupported'
  );
  const harness = requireRecord(
    contract.applicationHarness,
    'approvalPacket.integrationContract.applicationHarness'
  );
  assert(
    harness.publicDeployment === false &&
      harness.productionVercelProjectAllowed === false,
    'integration contract application harness boundary drift'
  );
  const integrations = requireRecord(
    contract.integrations,
    'approvalPacket.integrationContract.integrations'
  );
  const stripe = requireRecord(
    integrations.stripe,
    'approvalPacket.integrationContract.integrations.stripe'
  );
  assertExactRecordKeys(
    stripe,
    [
      'mode',
      'liveKeyAllowed',
      'liveChargeAllowed',
      'testObjectCreationAllowedAfterApproval',
      'webhookDestination',
    ],
    'approvalPacket.integrationContract.integrations.stripe'
  );
  assert(
    stripe.mode === 'TEST_MODE_SANDBOX_ONLY' &&
      stripe.liveKeyAllowed === false &&
      stripe.liveChargeAllowed === false &&
      stripe.testObjectCreationAllowedAfterApproval === true &&
      stripe.webhookDestination === 'approved_local_or_isolated_harness_only',
    'integration contract Stripe boundary drift'
  );
  const restoreIntegrationOverrides = requireRecord(
    contract.restoreIntegrationOverrides,
    'approvalPacket.integrationContract.restoreIntegrationOverrides'
  );
  assertExactRecordKeys(
    restoreIntegrationOverrides,
    ['stripe', 'inboundWebhooks'],
    'approvalPacket.integrationContract.restoreIntegrationOverrides'
  );
  const restoreStripe = requireRecord(
    restoreIntegrationOverrides.stripe,
    'approvalPacket.integrationContract.restoreIntegrationOverrides.stripe'
  );
  const restoreInbound = requireRecord(
    restoreIntegrationOverrides.inboundWebhooks,
    'approvalPacket.integrationContract.restoreIntegrationOverrides.inboundWebhooks'
  );
  assertExactRecordKeys(
    restoreStripe,
    [
      'mode',
      'liveKeyAllowed',
      'liveChargeAllowed',
      'testObjectCreationAllowedAfterApproval',
      'webhookDestination',
    ],
    'approvalPacket.integrationContract.restoreIntegrationOverrides.stripe'
  );
  assert(
    restoreStripe.mode === 'DISABLED' &&
      restoreStripe.liveKeyAllowed === false &&
      restoreStripe.liveChargeAllowed === false &&
      restoreStripe.testObjectCreationAllowedAfterApproval === false &&
      restoreStripe.webhookDestination === 'DISABLED' &&
      restoreInbound.stripeTestEndpointOnly === false &&
      restoreInbound.resendEndpointEnabled === false &&
      restoreInbound.lineEndpointEnabled === false,
    'integration contract restore override boundary drift'
  );
  const email = requireRecord(
    integrations.email,
    'approvalPacket.integrationContract.integrations.email'
  );
  assertExactRecordKeys(
    email,
    [
      'provider',
      'resendApiKeyPresent',
      'workerEnabled',
      'cronEnabled',
      'outboxEnqueueOnly',
      'realSendAllowed',
    ],
    'approvalPacket.integrationContract.integrations.email'
  );
  assert(
    email.provider === 'DISABLED' &&
      email.resendApiKeyPresent === false &&
      email.workerEnabled === false &&
      email.cronEnabled === false &&
      email.outboxEnqueueOnly === true &&
      email.realSendAllowed === false,
    'integration contract email boundary drift'
  );
  const line = requireRecord(
    integrations.line,
    'approvalPacket.integrationContract.integrations.line'
  );
  assert(
    line.provider === 'DISABLED' &&
      line.credentialPresent === false &&
      line.processorEnabled === false &&
      line.cronEnabled === false &&
      line.liffEnabled === false &&
      line.realSendAllowed === false,
    'integration contract LINE boundary drift'
  );
  const sms = requireRecord(
    integrations.sms,
    'approvalPacket.integrationContract.integrations.sms'
  );
  assert(
    sms.provider === 'DISABLED' &&
      sms.credentialPresent === false &&
      sms.realSendAllowed === false,
    'integration contract SMS boundary drift'
  );
  const inbound = requireRecord(
    integrations.inboundWebhooks,
    'approvalPacket.integrationContract.integrations.inboundWebhooks'
  );
  assert(
    inbound.stripeTestEndpointOnly === true &&
      inbound.resendEndpointEnabled === false &&
      inbound.lineEndpointEnabled === false,
    'integration contract inbound webhook boundary drift'
  );
  const workers = requireRecord(
    integrations.cronAndQueues,
    'approvalPacket.integrationContract.integrations.cronAndQueues'
  );
  assert(
    workers.allConsumersDisabled === true &&
      workers.unattendedBatchEnabled === false,
    'integration contract cron/queue boundary drift'
  );
  const bulk = requireRecord(
    integrations.bulk,
    'approvalPacket.integrationContract.integrations.bulk'
  );
  assert(
    bulk.externalImportEnabled === false && bulk.externalSyncEnabled === false,
    'integration contract bulk boundary drift'
  );
  const upstash = requireRecord(
    integrations.upstashOrExternalRateLimit,
    'approvalPacket.integrationContract.integrations.upstashOrExternalRateLimit'
  );
  assert(
    ['DISABLED', 'ISOLATED_PR12_NAMESPACE'].includes(upstash.disposition) &&
      upstash.isolatedNamespaceRequiredIfEnabled === true &&
      upstash.productionNamespaceAllowed === false,
    'integration contract external rate-limit namespace boundary drift'
  );
  const databaseOperations = requireRecord(
    contract.databaseExternalOperations,
    'approvalPacket.integrationContract.databaseExternalOperations'
  );
  assert(
    databaseOperations.pgNet === 'DISABLED_OR_ABSENT_REQUIRED' &&
      databaseOperations.pgCron === 'NO_EXTERNAL_JOB_REQUIRED' &&
      databaseOperations.wrappers === 'DISABLED_OR_ABSENT_REQUIRED' &&
      databaseOperations.databaseWebhooks === 'DISABLED_REQUIRED',
    'integration contract database external-operation boundary drift'
  );
}

function verifyExecutionManifest(manifest, manifestDirectory, manifestPath) {
  assert(manifest.schemaVersion === 1, 'schemaVersion must be 1');
  requireConcreteString(manifest.qualificationId, 'qualificationId');
  const source = requireRecord(manifest.source, 'source');
  requireGitCommit(source.gitCommit, 'source.gitCommit');
  assert(
    requireGitCommit(source.baseCommit, 'source.baseCommit') === BASE_COMMIT,
    'source.baseCommit drift'
  );
  assert(source.migrationHead === MIGRATION_HEAD, 'source.migrationHead drift');
  requireConcreteString(source.approvalPacketPath, 'source.approvalPacketPath');
  requireSha256(source.approvalPacketSha256, 'source.approvalPacketSha256');

  const { artifactPaths, artifactHashes, artifactFiles } = verifyArtifacts(
    manifest,
    manifestDirectory
  );
  verifyEvidenceDirectoryClosure(
    manifestPath,
    manifestDirectory,
    artifactPaths
  );
  verifyCommands(manifest, artifactPaths, artifactHashes);

  const ownership = requireRecord(manifest.ownership, 'ownership');
  for (const field of ['approver', ...REQUIRED_OWNER_FIELDS]) {
    requireConcreteString(ownership[field], `ownership.${field}`);
  }
  const approvalWindow = verifyApprovalBinding(
    manifest,
    artifactHashes,
    artifactFiles
  );
  verifyEnvironment(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    manifest,
    approvalWindow.approvedEnvironment
  );
  const targetCredentialConfigurations = verifyCredentialHandling(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    approvalWindow.bindings.get('credentialContract'),
    approvalWindow
  );
  verifySecurityMatrix(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    requireRecord(manifest.environment, 'environment').projectRef,
    'SOURCE',
    targetCredentialConfigurations.get('SOURCE')
  );
  verifySourceStructuredResults(manifest, artifactHashes, artifactFiles);
  verifyRepresentativeData(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles
  );
  verifyPerformance(manifest, artifactPaths, artifactHashes, artifactFiles);

  const toolVersions = requireRecord(manifest.toolVersions, 'toolVersions');
  assert(
    Object.keys(toolVersions).length > 0,
    'toolVersions must not be empty'
  );
  for (const [tool, version] of Object.entries(toolVersions)) {
    requireConcreteString(version, `toolVersions.${tool}`);
  }
  const executionTiming = verifyExecutionTiming(manifest, approvalWindow);

  const rowCounts = requireRecord(manifest.rowCounts, 'rowCounts');
  assert(Object.keys(rowCounts).length > 0, 'rowCounts must not be empty');
  for (const [relation, count] of Object.entries(rowCounts)) {
    assert(
      Number.isInteger(count) && count >= 0,
      `rowCounts.${relation} must be an integer`
    );
  }
  const hashes = requireRecord(manifest.hashes, 'hashes');
  for (const field of [
    'logicalHash',
    'historicalNormalizedPhysicalHash',
    'environmentPhysicalStructureHash',
    'schemaHash',
    'preWatermarkDataHash',
    'backupDataHash',
  ]) {
    requireSha256(hashes[field], `hashes.${field}`);
  }

  const sideEffects = requireRecord(
    manifest.externalSideEffects,
    'externalSideEffects'
  );
  for (const targetName of ['source', 'restore']) {
    const target = requireRecord(
      sideEffects[targetName],
      `externalSideEffects.${targetName}`
    );
    assert(
      ['DISABLED', 'SANDBOXED'].includes(target.mode),
      `externalSideEffects.${targetName}.mode contains a placeholder or unresolved value`
    );
    assert(
      target.duplicateCount === 0 &&
        target.attemptedRealDispatchCount === 0 &&
        target.providerRealDispatchCount === 0 &&
        target.pendingExternalOperationCount === 0 &&
        target.productionIdentityDetected === false,
      `externalSideEffects.${targetName} aggregate must be zero and non-production`
    );
    verifyEvidenceReferences(
      target.evidence,
      `externalSideEffects.${targetName}.evidence`,
      artifactPaths
    );
  }
  const sideEffectComparison = requireRecord(
    sideEffects.comparison,
    'externalSideEffects.comparison'
  );
  assert(
    sideEffectComparison.status === 'PASS' &&
      sideEffectComparison.sourceAndRestoreArtifactsDiffer === true &&
      sideEffectComparison.requiredFamiliesMatch === true &&
      sideEffects.source.artifactSha256 !== sideEffects.restore.artifactSha256,
    'externalSideEffects source/restore comparison mismatch'
  );
  verifyIntegrationContract(
    manifest,
    approvalWindow.bindings.get('integrationContract')
  );
  const postWatermarkBaseline = verifyBackupRestoreBound(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    approvalWindow.bindings.get('drContract'),
    approvalWindow.commandApproval,
    approvalWindow,
    targetCredentialConfigurations
  );
  verifyIntegrityResults(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    postWatermarkBaseline
  );
  const privacy = requireRecord(manifest.privacyScan, 'privacyScan');
  assert(privacy.status === 'PASS', 'privacyScan.status must be PASS');
  const privacyScannedAt = requireIsoTimestamp(
    privacy.scannedAt,
    'privacyScan.scannedAt',
    { notFuture: true }
  );
  assert(
    privacy.scannerVersion === 'pr12-evidence-scan-v2',
    'privacyScan.scannerVersion drift'
  );
  assert(privacy.findingCount === 0, 'privacyScan.findingCount must be zero');
  assert(
    privacy.coverageMode === 'EXACT_MANIFEST_ARTIFACTS_EXCEPT_SCANNER_STREAMS',
    'privacyScan.coverageMode drift'
  );
  const machineScanCommandId = requireConcreteString(
    privacy.machineScanCommandId,
    'privacyScan.machineScanCommandId'
  );
  const executionCommands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const machineCommandIndex = executionCommands.findIndex(
    command => command.id === machineScanCommandId
  );
  const machineCommand = executionCommands[machineCommandIndex];
  assert(machineCommand, 'privacyScan.machineScanCommandId is not in commands');
  assert(
    machineCommand.phase === 'evidence_privacy' &&
      machineCommand.remoteContact === false &&
      machineCommand.mutating === false &&
      machineCommand.mutationScope === 'NONE',
    'privacyScan command execution boundary drift'
  );
  assert(
    machineCommand.endedAt === privacyScannedAt,
    'privacyScan.scannedAt must equal its machine scan command end'
  );
  assert(
    requireString(
      machineCommand.redactedCommand,
      'privacy scan command'
    ).includes('scan-pr12-evidence.mjs') &&
      machineCommand.redactedCommand.includes('--manifest') &&
      !machineCommand.redactedCommand.includes('--path'),
    'privacyScan.machineScanCommandId is not the pinned manifest-closed scanner command'
  );
  verifyEvidenceReferences(
    privacy.machineScanEvidence,
    'privacyScan.machineScanEvidence',
    artifactPaths
  );
  assertExactStringArray(
    requireConcreteStringArray(
      privacy.machineScanEvidence,
      'privacyScan.machineScanEvidence'
    ),
    [machineCommand.stdoutPath.replaceAll('\\', '/')],
    'privacyScan.machineScanEvidence'
  );
  const machineStdoutPath = machineCommand.stdoutPath.replaceAll('\\', '/');
  const machineStderrPath = machineCommand.stderrPath.replaceAll('\\', '/');
  assert(
    machineStdoutPath !== machineStderrPath,
    'privacy scan stdout and stderr paths must be distinct'
  );
  for (const command of executionCommands) {
    if (command.id === machineScanCommandId) continue;
    const otherStreams = [command.stdoutPath, command.stderrPath].map(value =>
      requireConcreteString(value, 'command stream path').replaceAll('\\', '/')
    );
    assert(
      !otherStreams.includes(machineStdoutPath) &&
        !otherStreams.includes(machineStderrPath),
      'privacy scan streams must not be reused by another command'
    );
  }
  const machineStderrAbsolute = artifactFiles.get(machineStderrPath);
  assert(
    typeof machineStderrAbsolute === 'string' &&
      statSync(machineStderrAbsolute).size === 0,
    'privacy scan stderr must be an empty hashed artifact'
  );
  const machineStdoutAbsolute = artifactFiles.get(machineStdoutPath);
  assert(
    typeof machineStdoutAbsolute === 'string',
    'privacy scan stdout artifact cannot be resolved'
  );
  let privacyReport;
  try {
    privacyReport = requireRecord(
      JSON.parse(readFileSync(machineStdoutAbsolute, 'utf8')),
      'privacy scan report'
    );
  } catch (error) {
    fail(
      `privacy scan stdout is not a valid JSON report: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  assertExactRecordKeys(
    privacyReport,
    [
      'schemaVersion',
      'resultType',
      'scannerVersion',
      'status',
      'findingCount',
      'manifestArtifactCount',
      'excludedGeneratedArtifactPaths',
      'scannedArtifactCount',
      'scannedArtifacts',
    ],
    'privacy scan report'
  );
  const manifestArtifacts = requireArray(manifest.artifacts, 'artifacts').map(
    (value, index) => requireRecord(value, `artifacts[${String(index)}]`)
  );
  const excludedGeneratedArtifactPaths = [
    machineStdoutPath,
    machineStderrPath,
  ].sort((left, right) => left.localeCompare(right, 'en'));
  assertExactStringArray(
    requireConcreteStringArray(
      privacyReport.excludedGeneratedArtifactPaths,
      'privacy scan report.excludedGeneratedArtifactPaths'
    ),
    excludedGeneratedArtifactPaths,
    'privacy scan report.excludedGeneratedArtifactPaths'
  );
  const excludedSet = new Set(excludedGeneratedArtifactPaths);
  const expectedScannedArtifacts = manifestArtifacts
    .filter(
      artifact =>
        !excludedSet.has(
          requireConcreteString(artifact.path, 'artifact.path').replaceAll(
            '\\',
            '/'
          )
        )
    )
    .map(artifact => ({
      path: artifact.path.replaceAll('\\', '/'),
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      classification: artifact.classification,
    }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  assert(
    expectedScannedArtifacts.length > 0 &&
      privacyReport.schemaVersion === 2 &&
      privacyReport.resultType === 'PR12_EVIDENCE_PRIVACY_SCAN_RESULT' &&
      privacyReport.scannerVersion === privacy.scannerVersion &&
      privacyReport.status === 'PASS' &&
      privacyReport.findingCount === 0 &&
      privacyReport.manifestArtifactCount === manifestArtifacts.length &&
      privacyReport.scannedArtifactCount === expectedScannedArtifacts.length &&
      privacy.scannedArtifactCount === expectedScannedArtifacts.length,
    'privacy scan report metadata or exact coverage count mismatch'
  );
  assertJsonEquivalent(
    privacyReport.scannedArtifacts,
    expectedScannedArtifacts,
    'privacy scan report exact manifest artifact coverage'
  );
  assert(
    privacy.manualReviewStatus === 'PASS',
    'privacyScan.manualReviewStatus must be PASS'
  );
  const manualReviewer = requireConcreteString(
    privacy.manualReviewer,
    'privacyScan.manualReviewer'
  );
  assert(
    manualReviewer === ownership.clinicalDataPrivacyReviewer,
    'privacyScan.manualReviewer must equal ownership.clinicalDataPrivacyReviewer'
  );
  const manualReviewedAt = requireIsoTimestamp(
    privacy.manualReviewedAt,
    'privacyScan.manualReviewedAt',
    { notFuture: true }
  );
  const preScanCommands = executionCommands.slice(0, machineCommandIndex);
  const lastPreScanEndedAt = preScanCommands.reduce(
    (latest, command) =>
      Date.parse(command.endedAt) > Date.parse(latest)
        ? command.endedAt
        : latest,
    executionTiming.startedAt
  );
  assert(
    Date.parse(manualReviewedAt) >= Date.parse(lastPreScanEndedAt) &&
      Date.parse(manualReviewedAt) <= Date.parse(machineCommand.startedAt),
    'privacyScan.manualReviewedAt must follow every pre-scan command and precede the terminal machine scan'
  );
  assert(
    Date.parse(manualReviewedAt) <= Date.parse(executionTiming.endedAt),
    'privacyScan.manualReviewedAt exceeds manifest timing.endedAt'
  );
  for (const command of preScanCommands) {
    assert(
      Date.parse(command.endedAt) <= Date.parse(machineCommand.startedAt),
      'privacy scan starts before evidence-producing commands complete'
    );
  }
  assert(
    executionCommands.length === machineCommandIndex + 1,
    'PR12-CMD-020 terminal privacy scan must be the final manifest command; final verification runs out-of-manifest without redirected output'
  );
  verifyEvidenceReferences(
    privacy.manualReviewEvidence,
    'privacyScan.manualReviewEvidence',
    artifactPaths
  );
  const manualReviewEvidencePaths = requireConcreteStringArray(
    privacy.manualReviewEvidence,
    'privacyScan.manualReviewEvidence'
  );
  assert(
    manualReviewEvidencePaths.length === 1,
    'privacyScan.manualReviewEvidence must contain one signed review artifact'
  );
  const manualReviewPath = manualReviewEvidencePaths[0].replaceAll('\\', '/');
  assert(
    !excludedSet.has(manualReviewPath),
    'privacy manual review evidence cannot reuse scanner streams'
  );
  const manualReviewAbsolute = artifactFiles.get(manualReviewPath);
  assert(
    typeof manualReviewAbsolute === 'string',
    'privacy manual review evidence cannot be resolved'
  );
  const manualReview = readJsonFile(
    manualReviewAbsolute,
    'privacy manual review evidence'
  );
  assertExactRecordKeys(
    manualReview,
    [
      'schemaVersion',
      'resultType',
      'status',
      'reviewer',
      'reviewedAt',
      'scope',
      'reviewedArtifactCount',
      'reviewedArtifacts',
      'clinicalDataAbsenceClaimed',
      'residualRisk',
    ],
    'privacy manual review evidence'
  );
  const expectedHumanReviewedArtifacts = manifestArtifacts
    .filter(artifact => {
      const normalized = requireConcreteString(
        artifact.path,
        'artifact.path'
      ).replaceAll('\\', '/');
      return !excludedSet.has(normalized) && normalized !== manualReviewPath;
    })
    .map(artifact => ({
      path: artifact.path.replaceAll('\\', '/'),
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      classification: artifact.classification,
    }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  assert(
    manualReview.schemaVersion === 1 &&
      manualReview.resultType === 'PR12_HUMAN_PRIVACY_REVIEW' &&
      manualReview.status === 'PASS' &&
      manualReview.reviewer === manualReviewer &&
      manualReview.reviewedAt === manualReviewedAt &&
      manualReview.scope ===
        'ALL_MANIFEST_ARTIFACTS_EXCEPT_SCANNER_STREAMS_AND_THIS_ATTESTATION' &&
      manualReview.reviewedArtifactCount ===
        expectedHumanReviewedArtifacts.length &&
      manualReview.clinicalDataAbsenceClaimed === false &&
      Array.isArray(manualReview.residualRisk),
    'privacy manual review metadata or scope drift'
  );
  assertJsonEquivalent(
    manualReview.reviewedArtifacts,
    expectedHumanReviewedArtifacts,
    'privacy manual review exact artifact coverage'
  );
  requireIsoTimestamp(manifest.expiresAt, 'expiresAt', { future: true });
  verifyCommGates(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    approvalWindow.bindings.get('commGateEvidenceMap'),
    lastPreScanEndedAt,
    postWatermarkBaseline.releaseTargetConflictResolved
  );
}

function parseManifestPath(argv) {
  assert(
    argv.length === 2 && argv[0] === '--manifest' && argv[1],
    'Usage: verify-pr12-evidence-manifest.mjs --manifest <manifest.json>'
  );
  return path.resolve(REPO_ROOT, argv[1]);
}

function main() {
  const manifestPath = parseManifestPath(process.argv.slice(2));
  assert(existsSync(manifestPath), 'manifest does not exist');
  assert(
    !lstatSync(manifestPath).isSymbolicLink(),
    'manifest must not be a symbolic link'
  );
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifestPrivacyFindings = scanTextForSensitiveData(manifestText);
  assert(
    manifestPrivacyFindings.length === 0,
    `manifest contains sensitive content: ${manifestPrivacyFindings
      .map(finding => `${finding.id}:line-${String(finding.line)}`)
      .join(', ')}`
  );
  const parsed = JSON.parse(manifestText);
  const manifest = requireRecord(parsed, 'manifest');
  const status = requireString(manifest.status, 'status');
  assert(
    ['PASS', 'FAIL', 'NOT_RUN'].includes(status),
    'manifest status is unsupported'
  );
  if (EXECUTION_STATUSES.has(status)) {
    verifyExecutionManifest(manifest, path.dirname(manifestPath), manifestPath);
    console.log(
      'PR12 execution evidence manifest: PASS (semantic and artifact hashes verified).'
    );
    return;
  }
  console.log(
    `PR12 evidence manifest: ${status} (non-qualifying status accepted; no PASS inferred).`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PR12 evidence manifest: FAIL\n${message}`);
  process.exitCode = 1;
}
