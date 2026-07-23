/** @jest-environment node */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type Artifact = {
  path: string;
  bytes: number;
  sha256: string;
  classification: 'PUBLIC_SANITIZED';
};

type CredentialPolicy = {
  channel: string;
  storage: string;
  retrieval: string;
  logging: string;
  serverOnly: boolean;
  browserExposureAllowed: boolean;
  commandLineExposureAllowed: boolean;
  evidenceExposureAllowed: boolean;
  clientResponseExposureAllowed: boolean;
  logExposureAllowed: boolean;
  sourceControlExposureAllowed: boolean;
  urlExposureAllowed: boolean;
};

type FixtureOptions = {
  approvalAt?: string;
  nodeVersion?: string;
  supabaseCliVersion?: string;
  psqlVersion?: string;
  credentialOverrides?: Partial<CredentialPolicy>;
  sourceProjectRef?: string;
  restoreProjectRef?: string;
  commandLedgerStatus?: string;
  selfApproveMigration?: boolean;
  selfApproveCleanup?: boolean;
  restoreCredentialProviderName?: string;
  sourceAnonKeyPresent?: boolean;
  sourceAnonKeyFingerprintFromEmptyValue?: boolean;
  preActionInventoryObservedAt?: string;
  preActionInventoryIncludesRequestedTarget?: boolean;
  completionTimerSessionId?: string;
  completionRunnerInstanceId?: string;
  restoreSystemIdentifier?: string;
  restoreRelationshipToSource?: 'SAME' | 'DIFFERENT';
  backupProviderEndpoint?: string;
  backupProviderStatus?: number;
  backupProviderObservedAt?: string;
  backupProviderAdditionalEarlierEligible?: boolean;
};

const repoRoot = path.resolve(__dirname, '../../..');
const verifierPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs'
);
const baseCommit = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';
const migrationHead = '20260718011731';
const logicalBaselineHash =
  'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78';
const physicalBaselineHash =
  '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86';
const supabaseCliSha256 =
  '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118';
const supabaseCliArchiveSha256 =
  'd2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b';
const evidencePath = 'evidence.txt';
const futureTimestamp = '2999-01-01T00:00:00Z';
const sourceProvisioningFundedThrough = '2999-01-04T00:00:00Z';
const restoreFundedThrough = '2999-01-02T00:00:00Z';
const pastTimestamp = '2000-01-01T00:00:00Z';
const provisioningApprovedAt = '1999-12-31T23:59:00Z';
const sourceCreatedAt = '1999-12-31T23:59:25Z';
const sourceProvisionedAt = '1999-12-31T23:59:30Z';
const sourceBootstrapApprovedAt = '1999-12-31T23:59:31Z';
const sourceBootstrapCapturedAt = '1999-12-31T23:59:37Z';
const sourceReplayApprovedAt = '1999-12-31T23:59:40Z';
const migrationReplayCompletedAt = '2000-01-01T00:00:10Z';
const postReplayCatalogCapturedAt = '2000-01-01T00:00:10.500Z';
const migrationHistoryCompletedAt = '2000-01-01T00:00:11Z';
const sourceIntegrityCompletedAt = '2000-01-01T00:00:12Z';
const generatedTypesCompletedAt = '2000-01-01T00:00:13Z';
const canonicalPerformanceCompletedAt = '2000-01-01T00:00:14Z';
const hostedSloCompletedAt = '2000-01-01T00:00:20Z';
const sourceSecurityCompletedAt = '2000-01-01T00:00:21Z';
const sourceDataApiGraphQlCompletedAt = '2000-01-01T00:00:22Z';
const watermarkStartedAt = '2000-01-01T00:00:22Z';
const sourceSideEffectsCompletedAt = '2000-01-01T00:00:35Z';
const backupStartedAt = '2000-01-01T00:00:40Z';
const backupProviderInsertedAt = '2000-01-01T00:01:00Z';
const backupInventoryStartedAt = '2000-01-01T00:01:10Z';
const backupInventoryCompletedAt = '2000-01-01T00:01:20Z';
const restoreCreationApprovedAt = '2000-01-01T00:01:30Z';
const restoreActionStartedAt = '2000-01-01T00:01:50Z';
const rpoObservedAt = '2000-01-01T00:01:59Z';
const restoreProviderCreatedAt = '2000-01-01T00:01:52Z';
const restoreConfirmationAt = '2000-01-01T00:02:00Z';
const restoreReadyObservedAt = '2000-01-01T00:02:02Z';
const restoreProviderCapturedAt = '2000-01-01T00:02:10Z';
const restoreRetentionDeadline = '2000-01-02T00:01:52Z';
const supplementalApprovedAt = '2000-01-01T00:02:30Z';
const restoreIdentityClockStartedAt = '2000-01-01T00:02:40Z';
const restoreIdentityClockCompletedAt = '2000-01-01T00:02:50Z';
const postRestoreStartedAt = '2000-01-01T00:03:00Z';
const postRestoreIntegrityCompletedAt = '2000-01-01T00:04:00Z';
const postRestoreSecurityCompletedAt = '2000-01-01T00:06:00Z';
const postRestoreDataApiCompletedAt = '2000-01-01T00:08:00Z';
const postRestoreGraphQlCompletedAt = '2000-01-01T00:09:00Z';
const postRestoreSideEffectsCompletedAt = '2000-01-01T00:10:00Z';
const postRestoreCompletedAt = '2000-01-01T00:12:00Z';
const privacyManualReviewedAt = '2000-01-01T00:12:05Z';
const privacyScanStartedAt = '2000-01-01T00:12:10Z';
const privacyScanCompletedAt = '2000-01-01T00:12:20Z';
const qualificationCompletedAt = privacyScanCompletedAt;
const syntheticWatermark = '2000-01-01T00:00:30Z';
const requiredSideEffectFamilies = [
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
const sideEffectRequests: Record<
  string,
  { probeId: string; requestOrQueryText: string }
> = {
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
const dataApiDefaultPrivilegeQuery =
  "with owners(owner_role, owner_oid, owner_order) as (select v.owner_role, r.oid, v.owner_order from (values ('postgres', 1), ('supabase_admin', 2)) v(owner_role, owner_order) join pg_roles r on r.rolname = v.owner_role), scopes(scope_name, namespace_oid, scope_order) as (values ('GLOBAL_OR_HARDWIRED', 0::oid, 1), ('PUBLIC_SCHEMA_ADDITIONAL', 'public'::regnamespace::oid, 2)), objects(object_type, object_order) as (values ('r'::\"char\", 1), ('S'::\"char\", 2), ('f'::\"char\", 3)), api_roles(api_role, grantee_oid, role_order) as (select v.api_role, case when v.api_role = 'PUBLIC' then 0::oid else r.oid end, v.role_order from (values ('PUBLIC', 1), ('anon', 2), ('authenticated', 3), ('service_role', 4)) v(api_role, role_order) left join pg_roles r on r.rolname = v.api_role) select o.owner_role, s.scope_name as scope, obj.object_type::text as object_type, a.api_role, coalesce((select array_agg(distinct x.privilege_type order by x.privilege_type) from aclexplode(case when s.namespace_oid = 0 then coalesce((select d.defaclacl from pg_default_acl d where d.defaclrole = o.owner_oid and d.defaclnamespace = 0 and d.defaclobjtype = obj.object_type), acldefault(obj.object_type, o.owner_oid)) else coalesce((select d.defaclacl from pg_default_acl d where d.defaclrole = o.owner_oid and d.defaclnamespace = s.namespace_oid and d.defaclobjtype = obj.object_type), array[]::aclitem[]) end) x where x.grantee = a.grantee_oid), array[]::text[]) as privileges from owners o cross join scopes s cross join objects obj cross join api_roles a order by o.owner_order, s.scope_order, obj.object_order, a.role_order;";
const graphQlExtensionQuery =
  "select 'pg_graphql'::text as extension_name, (select default_version from pg_catalog.pg_available_extensions where name = 'pg_graphql') as available_version, (select extversion from pg_catalog.pg_extension where extname = 'pg_graphql') as installed_version;";
const graphQlExposureQuery =
  "select current_setting('pgrst.db_schemas', true) as db_schema, current_setting('pgrst.db_extra_search_path', true) as db_extra_search_path;";
const dataApiDefaultPrivilegeRows = ['postgres', 'supabase_admin'].flatMap(
  ownerRole =>
    ['GLOBAL_OR_HARDWIRED', 'PUBLIC_SCHEMA_ADDITIONAL'].flatMap(
      namespaceScope =>
        ['r', 'S', 'f'].flatMap(objectType =>
          ['PUBLIC', 'anon', 'authenticated', 'service_role'].map(apiRole => ({
            ownerRole,
            namespaceScope,
            objectType,
            apiRole,
            privileges: [],
          }))
        )
    )
);
const authProviderEnabledFields = [
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
const authSmtpPresenceFields = [
  'smtp_admin_email',
  'smtp_host',
  'smtp_pass',
  'smtp_port',
  'smtp_sender_name',
  'smtp_user',
];
const authSmsPresenceFields = [
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
const authSafeProjectionFields = [
  ...authSmtpPresenceFields,
  ...authSmsPresenceFields,
  ...authProviderEnabledFields.map(field =>
    field.replace(/_enabled$/u, '_secret')
  ),
  'nimbus_oauth_client_secret',
  ...[
    'after_user_created',
    'before_user_created',
    'custom_access_token',
    'mfa_verification_attempt',
    'password_verification_attempt',
    'send_email',
    'send_sms',
  ].flatMap(family => [
    `hook_${family}_enabled`,
    `hook_${family}_secrets`,
    `hook_${family}_uri`,
  ]),
].sort();
const requiredRoles = [
  'anon',
  'authenticated',
  'service_role',
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
  'postgres',
];
const applicationRoles = [
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
];
const authenticatedBoundaryJwtCases = [
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
];
const hostedAuthenticatedBoundaryJwtCases =
  authenticatedBoundaryJwtCases.filter(
    jwtCase => !['empty_jwt', 'malformed_jwt'].includes(jwtCase)
  );
const hostedAuthActorSet = [
  ...applicationRoles.flatMap(applicationRole =>
    ['tenant_a', 'tenant_b'].map(clinicId => ({
      actorId: `synthetic_${applicationRole}_${clinicId}`,
      applicationRole,
      clinicId,
      actorPurpose: 'TENANT_CRUD',
      jwtCase: 'valid_jwt',
    }))
  ),
  ...hostedAuthenticatedBoundaryJwtCases.map(jwtCase => ({
    actorId: `synthetic_authenticated_${jwtCase}_tenant_a`,
    applicationRole: 'authenticated_boundary',
    clinicId: 'tenant_a',
    actorPurpose: 'AUTH_NEGATIVE_CASE',
    jwtCase,
  })),
  {
    actorId: 'synthetic_authority_active_control_tenant_a',
    applicationRole: 'authority_active_control',
    clinicId: 'tenant_a',
    actorPurpose: 'AUTHORITY_POSITIVE_CONTROL',
    jwtCase: 'valid_jwt',
  },
  ...['tenant_a', 'tenant_b'].map(clinicId => ({
    actorId: `synthetic_data_api_${clinicId}`,
    applicationRole: 'data_api_direct_role',
    clinicId,
    actorPurpose: 'DATA_API_DIRECT_ROLE',
    jwtCase: 'valid_jwt',
  })),
].map((actor, index) => ({
  ...actor,
  authUserId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
  databaseRole: 'authenticated',
}));
const requiredJwtCases = [
  ...authenticatedBoundaryJwtCases,
  'missing_resource',
  'null_resource',
  'parent_rehome',
  'resource_delete_cascade',
  'clinic_delete_cascade',
];
const tenantCrudCases = ['read', 'insert', 'update', 'delete'];
const tenantDirections = ['A_TO_B', 'B_TO_A'];
const securityTargets = [
  'public.blocks',
  'public.representative_relation',
  'public.reservations',
];
const hostedAuthActorSetSha256 = sha256(
  JSON.stringify(
    hostedAuthActorSet
      .map(actor => [
        actor.actorId,
        actor.authUserId,
        actor.databaseRole,
        actor.applicationRole,
        actor.clinicId,
        actor.actorPurpose,
        actor.jwtCase,
      ])
      .sort((left, right) => left[0].localeCompare(right[0], 'en'))
  )
);

function sourceTenantForDirection(tenantDirection: string): string {
  return tenantDirection === 'A_TO_B' ? 'tenant_a' : 'tenant_b';
}

function securityActorId(
  role: string,
  jwtCase: string,
  tenantDirection: string
): string {
  if (applicationRoles.includes(role) && jwtCase === 'valid_jwt') {
    return `synthetic_${role}_${sourceTenantForDirection(tenantDirection)}`;
  }
  if (role === 'authenticated') {
    return `synthetic_authenticated_${jwtCase}_tenant_a`;
  }
  if (role === 'postgres') return 'synthetic_direct_postgres_operator';
  return `synthetic_${role}`;
}

function expectedAuthTokenSource(role: string, jwtCase: string): string {
  if (role === 'postgres') return 'DIRECT_POSTGRES_NO_JWT';
  if (role === 'service_role') return 'SERVER_ONLY_CREDENTIAL_BOUNDARY';
  if (role === 'anon' || jwtCase === 'empty_jwt') return 'NO_USER_TOKEN';
  if (jwtCase === 'malformed_jwt') return 'INTENTIONALLY_INVALID_NON_JWT';
  if (jwtCase === 'stale_jwt') return 'HOSTED_STALE_SESSION';
  if (jwtCase === 'expired_jwt') return 'HOSTED_EXPIRED_SESSION';
  return 'HOSTED_REFRESHED_SESSION';
}

function authTokenUse(
  expected: Record<string, unknown>,
  environmentPrefix: 'source' | 'restore'
): Record<string, unknown> {
  const source = String(expected.expectedAuthTokenSource);
  const actorId = String(expected.expectedAuthActorId);
  const hosted = [
    'HOSTED_REFRESHED_SESSION',
    'HOSTED_STALE_SESSION',
    'HOSTED_EXPIRED_SESSION',
  ].includes(source);
  if (!hosted) {
    return {
      source,
      actorId: 'NOT_APPLICABLE',
      tokenHandleId: 'NOT_APPLICABLE',
      provenanceObservationId: 'NOT_APPLICABLE',
    };
  }
  const originalSessionToken = [
    'HOSTED_STALE_SESSION',
    'HOSTED_EXPIRED_SESSION',
  ].includes(source);
  return {
    source,
    actorId,
    tokenHandleId: `${environmentPrefix}-auth-${actorId}-${originalSessionToken ? 'sign-in' : 'refreshed'}-token-handle`,
    provenanceObservationId: `${environmentPrefix}-auth-${actorId}-${originalSessionToken ? 'sign-in' : 'refresh'}`,
  };
}

function hostedAuthSessionId(
  environmentPrefix: 'source' | 'restore',
  actorIndex: number
): string {
  const offset = environmentPrefix === 'source' ? 201 : 301;
  return `00000000-0000-4000-8000-${String(offset + actorIndex).padStart(12, '0')}`;
}

function hostedAuthActorSessions(
  environmentPrefix: 'source' | 'restore'
): Record<string, unknown>[] {
  return hostedAuthActorSet.map((actor, index) => ({
    actorId: actor.actorId,
    authUserId: actor.authUserId,
    sessionId: hostedAuthSessionId(environmentPrefix, index),
    signInObservationId: `${environmentPrefix}-auth-${actor.actorId}-sign-in`,
    refreshObservationId: `${environmentPrefix}-auth-${actor.actorId}-refresh`,
    signInTokenHandleId: `${environmentPrefix}-auth-${actor.actorId}-sign-in-token-handle`,
    refreshedTokenHandleId: `${environmentPrefix}-auth-${actor.actorId}-refreshed-token-handle`,
    refreshRotated: true,
    status: 'PASS',
  }));
}

function hostedAuthRawObservations(
  environmentPrefix: 'source' | 'restore',
  issuer: string,
  observedAt: string
): Record<string, unknown>[] {
  const source = environmentPrefix === 'source';
  const signInIssuedAt = source
    ? '2000-01-01T00:00:20.100Z'
    : '2000-01-01T00:04:30Z';
  const normalSignInExpiresAt = source
    ? '2000-01-01T01:00:20.100Z'
    : '2000-01-01T01:04:30Z';
  const expiredSignInExpiresAt = source
    ? '2000-01-01T00:00:20.500Z'
    : '2000-01-01T00:04:40Z';
  const refreshIssuedAt = source
    ? '2000-01-01T00:00:20.600Z'
    : '2000-01-01T00:04:45Z';
  const refreshExpiresAt = source
    ? '2000-01-01T01:00:20.600Z'
    : '2000-01-01T01:04:45Z';
  return hostedAuthActorSet.flatMap((actor, index) => {
    const sessionId = hostedAuthSessionId(environmentPrefix, index);
    const signInTokenHandleId = `${environmentPrefix}-auth-${actor.actorId}-sign-in-token-handle`;
    const common = {
      observationType: 'AUTH_TOKEN_PROVENANCE',
      observedAt,
      httpStatus: 200,
      sessionReturned: true,
      issuer,
      actorSetSha256: hostedAuthActorSetSha256,
      actorId: actor.actorId,
      authUserId: actor.authUserId,
      sessionId,
      rawTokenMaterialCaptured: false,
      jwtSigningSecretAcquired: false,
      fabricatedUserJwtUsed: false,
      userMetadataAuthorityUsed: false,
      status: 'PASS',
    };
    const signInExpiresAt =
      actor.jwtCase === 'expired_jwt'
        ? expiredSignInExpiresAt
        : normalSignInExpiresAt;
    return [
      {
        ...common,
        observationId: `${environmentPrefix}-auth-${actor.actorId}-sign-in`,
        stage: 'SIGN_IN',
        grantType: 'password',
        operation: 'signInWithPassword',
        tokenHandleId: signInTokenHandleId,
        parentTokenHandleId: null,
        issuedAt: signInIssuedAt,
        expiresAt: signInExpiresAt,
        accessTokenChanged: false,
        refreshTokenChanged: false,
      },
      {
        ...common,
        observationId: `${environmentPrefix}-auth-${actor.actorId}-refresh`,
        stage: 'REFRESH',
        grantType: 'refresh_token',
        operation: 'refreshSession',
        tokenHandleId: `${environmentPrefix}-auth-${actor.actorId}-refreshed-token-handle`,
        parentTokenHandleId: signInTokenHandleId,
        issuedAt: refreshIssuedAt,
        expiresAt: refreshExpiresAt,
        accessTokenChanged: true,
        refreshTokenChanged: true,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  context: string
): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object`);
  return value;
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array`);
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, entry]) => [key, canonicalizeForHash(entry)])
  );
}

function canonicalJsonSha256(value: unknown): string {
  return sha256(JSON.stringify(canonicalizeForHash(value)));
}

function writeArtifact(
  directory: string,
  relativePath: string,
  content: string | Buffer
): Artifact {
  const absolutePath = path.join(directory, relativePath);
  fs.writeFileSync(absolutePath, content);
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    classification: 'PUBLIC_SANITIZED',
  };
}

function writeJsonArtifact(
  directory: string,
  relativePath: string,
  value: unknown
): Artifact {
  return writeArtifact(
    directory,
    relativePath,
    `${JSON.stringify(value, null, 2)}\n`
  );
}

function binding(artifact: Artifact): { path: string; sha256: string } {
  return { path: artifact.path, sha256: artifact.sha256 };
}

function rewriteJsonArtifact(
  directory: string,
  manifest: Record<string, unknown>,
  relativePath: string,
  value: unknown
): string {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(directory, relativePath), bytes);
  const digest = sha256(bytes);
  const artifacts = requireArray(manifest.artifacts, 'artifacts');
  const artifact = artifacts
    .map((entry, index) => requireRecord(entry, `artifacts[${String(index)}]`))
    .find(entry => entry.path === relativePath);
  if (!artifact) throw new Error(`artifact not found: ${relativePath}`);
  artifact.bytes = bytes.length;
  artifact.sha256 = digest;
  return digest;
}

function rebindCommandStdout(
  manifest: Record<string, unknown>,
  artifactPath: string,
  artifactSha256: string
): void {
  const command = requireArray(manifest.commands, 'manifest commands')
    .map((entry, index) => requireRecord(entry, `commands[${String(index)}]`))
    .find(entry => entry.stdoutPath === artifactPath);
  if (!command) throw new Error(`command stdout not found: ${artifactPath}`);
  command.stdoutSha256 = artifactSha256;
}

function readBoundJson(
  directory: string,
  value: unknown,
  context: string
): { relativePath: string; parsed: Record<string, unknown> } {
  const bound = requireRecord(value, context);
  if (typeof bound.path !== 'string') {
    throw new TypeError(`${context}.path must be a string`);
  }
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(directory, bound.path), 'utf8')
  );
  return {
    relativePath: bound.path,
    parsed: requireRecord(parsed, `${context}.parsed`),
  };
}

type PostRestoreResultName =
  | 'integrity'
  | 'securityMatrix'
  | 'dataApi'
  | 'graphQl';

function rebindPostRestoreResultChain(
  directory: string,
  manifest: Record<string, unknown>,
  name: PostRestoreResultName,
  resultSha256: string
): void {
  const commandIds: Record<PostRestoreResultName, string> = {
    integrity: 'PR12-CMD-019',
    securityMatrix: 'PR12-CMD-019S',
    dataApi: 'PR12-CMD-019D',
    graphQl: 'PR12-CMD-019G',
  };
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const resultCommand = commands.find(
    command => command.id === commandIds[name]
  );
  if (!resultCommand) throw new Error(`missing ${name} result command`);
  resultCommand.stdoutSha256 = resultSha256;

  const finalCommand = commands.find(command => command.id === 'PR12-CMD-019F');
  if (!finalCommand || typeof finalCommand.stdoutPath !== 'string') {
    throw new Error('missing post-restore finalization command');
  }
  const operationValue: unknown = JSON.parse(
    fs.readFileSync(path.join(directory, finalCommand.stdoutPath), 'utf8')
  );
  const operation = requireRecord(operationValue, 'post-restore operation');
  if (name === 'integrity') {
    requireRecord(
      operation.integrityResult,
      'post-restore operation integrity result'
    ).sha256 = resultSha256;
  } else {
    const structured = requireRecord(
      operation.structuredResults,
      'post-restore operation structured results'
    );
    requireRecord(structured[name], `post-restore operation ${name}`).sha256 =
      resultSha256;
  }
  finalCommand.stdoutSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    finalCommand.stdoutPath,
    operation
  );
}

function rebindPostRestoreServiceRoleScan(
  directory: string,
  manifest: Record<string, unknown>,
  rawArtifactPath: string,
  rawArtifactSha256: string
): void {
  const artifacts = requireArray(manifest.artifacts, 'manifest artifacts').map(
    (value, index) =>
      requireRecord(value, `manifest artifacts[${String(index)}]`)
  );
  const rawArtifact = artifacts.find(value => value.path === rawArtifactPath);
  if (!rawArtifact || typeof rawArtifact.bytes !== 'number') {
    throw new Error(`missing rewritten raw artifact: ${rawArtifactPath}`);
  }

  const restoreSideEffects = requireRecord(
    requireRecord(manifest.externalSideEffects, 'externalSideEffects').restore,
    'externalSideEffects.restore'
  );
  const boundary = requireRecord(
    restoreSideEffects.serviceRoleNonExposure,
    'restore service-role boundary'
  );
  const reportArtifact = readBoundJson(
    directory,
    { path: boundary.reportPath, sha256: boundary.reportSha256 },
    'restore service-role report'
  );
  for (const bindings of [
    requireArray(
      boundary.coveredCaseBindings,
      'restore boundary covered case bindings'
    ),
    requireArray(
      reportArtifact.parsed.coveredCaseBindings,
      'restore report covered case bindings'
    ),
  ]) {
    for (const [index, value] of bindings.entries()) {
      const coveredCase = requireRecord(
        value,
        `restore covered case binding ${String(index)}`
      );
      if (coveredCase.rawArtifactPath === rawArtifactPath) {
        coveredCase.rawArtifactSha256 = rawArtifactSha256;
      }
    }
  }

  const domains = requireArray(
    reportArtifact.parsed.domains,
    'restore service-role report domains'
  );
  for (const [domainIndex, value] of domains.entries()) {
    const domain = requireRecord(
      value,
      `restore service-role report domain ${String(domainIndex)}`
    );
    const inventoryArtifact = readBoundJson(
      directory,
      {
        path: domain.inventoryPath,
        sha256: domain.inventorySha256,
      },
      'restore service-role scan inventory'
    );
    const files = requireArray(
      inventoryArtifact.parsed.files,
      'restore service-role scan inventory files'
    );
    let rewritten = false;
    for (const [fileIndex, fileValue] of files.entries()) {
      const file = requireRecord(
        fileValue,
        `restore service-role scan file ${String(fileIndex)}`
      );
      if (file.path === rawArtifactPath) {
        file.sha256 = rawArtifactSha256;
        file.bytes = rawArtifact.bytes;
        rewritten = true;
      }
    }
    if (rewritten) {
      inventoryArtifact.parsed.totalBytes = files.reduce(
        (sum, fileValue, fileIndex) =>
          sum +
          Number(
            requireRecord(
              fileValue,
              `restore service-role scan file ${String(fileIndex)}`
            ).bytes
          ),
        0
      );
      domain.totalBytes = inventoryArtifact.parsed.totalBytes;
      domain.inventorySha256 = rewriteJsonArtifact(
        directory,
        manifest,
        inventoryArtifact.relativePath,
        inventoryArtifact.parsed
      );
    }
  }
  reportArtifact.parsed.scannedByteCount = domains.reduce(
    (sum, value, index) =>
      sum +
      Number(
        requireRecord(
          value,
          `restore service-role report domain ${String(index)}`
        ).totalBytes
      ),
    0
  );
  boundary.reportSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    reportArtifact.relativePath,
    reportArtifact.parsed
  );

  const sideEffectResult = readBoundJson(
    directory,
    {
      path: restoreSideEffects.artifactPath,
      sha256: restoreSideEffects.artifactSha256,
    },
    'restore side-effect result'
  );
  const resultBoundary = requireRecord(
    sideEffectResult.parsed.serviceRoleNonExposure,
    'restore side-effect result service-role boundary'
  );
  resultBoundary.coveredCaseBindings = boundary.coveredCaseBindings;
  resultBoundary.reportSha256 = boundary.reportSha256;
  restoreSideEffects.artifactSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    sideEffectResult.relativePath,
    sideEffectResult.parsed
  );
  rebindCommandStdout(
    manifest,
    sideEffectResult.relativePath,
    String(restoreSideEffects.artifactSha256)
  );

  const finalCommand = requireArray(manifest.commands, 'commands')
    .map((value, index) => requireRecord(value, `commands[${String(index)}]`))
    .find(command => command.id === 'PR12-CMD-019F');
  if (!finalCommand || typeof finalCommand.stdoutPath !== 'string') {
    throw new Error('missing post-restore finalization command');
  }
  const operationValue: unknown = JSON.parse(
    fs.readFileSync(path.join(directory, finalCommand.stdoutPath), 'utf8')
  );
  const operation = requireRecord(operationValue, 'post-restore operation');
  requireRecord(
    operation.externalSideEffects,
    'post-restore operation external side effects'
  ).sha256 = restoreSideEffects.artifactSha256;
  finalCommand.stdoutSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    finalCommand.stdoutPath,
    operation
  );
}

function rewriteSourceApproval(
  directory: string,
  manifest: Record<string, unknown>,
  approval: Record<string, unknown>
): void {
  const source = requireRecord(manifest.source, 'source');
  if (typeof source.approvalPacketPath !== 'string') {
    throw new TypeError('source.approvalPacketPath must be a string');
  }
  source.approvalPacketSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    source.approvalPacketPath,
    approval
  );
}

function mutateLegacySourceProvisioningProviderRaw(
  directory: string,
  manifest: Record<string, unknown>,
  rawArtifactIndex: number,
  mutate: (rawArtifact: Record<string, unknown>) => void
): void {
  const source = requireRecord(manifest.source, 'source');
  const approvalArtifact = readBoundJson(
    directory,
    {
      path: source.approvalPacketPath,
      sha256: source.approvalPacketSha256,
    },
    'source approval'
  );
  const resultBinding = requireRecord(
    approvalArtifact.parsed.sourceProjectProvisioningResult,
    'source provisioning result binding'
  );
  const resultArtifact = readBoundJson(
    directory,
    resultBinding,
    'source provisioning result'
  );
  const providerBinding = requireRecord(
    resultArtifact.parsed.providerEvidence,
    'source provisioning provider binding'
  );
  const providerArtifact = readBoundJson(
    directory,
    providerBinding,
    'source provisioning provider'
  );
  const rawBindings = requireArray(
    providerArtifact.parsed.rawProviderArtifacts,
    'source provisioning raw provider bindings'
  );
  const rawBinding = requireRecord(
    rawBindings[rawArtifactIndex],
    'source provisioning raw provider binding'
  );
  const rawArtifact = readBoundJson(
    directory,
    rawBinding,
    'source provisioning raw provider artifact'
  );
  mutate(rawArtifact.parsed);
  rawBinding.sha256 = rewriteJsonArtifact(
    directory,
    manifest,
    rawArtifact.relativePath,
    rawArtifact.parsed
  );
  providerBinding.sha256 = rewriteJsonArtifact(
    directory,
    manifest,
    providerArtifact.relativePath,
    providerArtifact.parsed
  );
  resultBinding.sha256 = rewriteJsonArtifact(
    directory,
    manifest,
    resultArtifact.relativePath,
    resultArtifact.parsed
  );
  rewriteSourceApproval(directory, manifest, approvalArtifact.parsed);
}

function rebindSourceBootstrapRawObservation(
  directory: string,
  manifest: Record<string, unknown>,
  familyKey: 'dataApi' | 'auth' | 'graphQl',
  mutateRaw: (value: Record<string, unknown>) => void,
  mutateNormalized?: (
    operationValue: Record<string, unknown>,
    resultValue: Record<string, unknown>
  ) => void
): void {
  const source = requireRecord(manifest.source, 'source');
  const sourceApprovalArtifact = readBoundJson(
    directory,
    {
      path: source.approvalPacketPath,
      sha256: source.approvalPacketSha256,
    },
    'source approval'
  );
  const bootstrapResultBinding = requireRecord(
    sourceApprovalArtifact.parsed.sourceIdentityBootstrapResult,
    'source bootstrap result binding'
  );
  const bootstrapResultArtifact = readBoundJson(
    directory,
    bootstrapResultBinding,
    'source bootstrap result'
  );
  const operationBinding = requireRecord(
    bootstrapResultArtifact.parsed.commandStdout,
    'source bootstrap operation binding'
  );
  const operationArtifact = readBoundJson(
    directory,
    operationBinding,
    'source bootstrap operation'
  );
  const operationFamily = requireRecord(
    requireRecord(
      operationArtifact.parsed.preReplayPlatformConfiguration,
      'source bootstrap operation platform configuration'
    )[familyKey],
    `source bootstrap operation ${familyKey}`
  );
  const rawBinding = requireRecord(
    operationFamily.rawObservation,
    `source bootstrap operation ${familyKey} raw binding`
  );
  const rawArtifact = readBoundJson(
    directory,
    rawBinding,
    `source bootstrap ${familyKey} raw observation`
  );
  mutateRaw(rawArtifact.parsed);
  const rawSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    rawArtifact.relativePath,
    rawArtifact.parsed
  );
  rawBinding.sha256 = rawSha256;
  const resultFamily = requireRecord(
    requireRecord(
      bootstrapResultArtifact.parsed.preReplayPlatformConfiguration,
      'source bootstrap result platform configuration'
    )[familyKey],
    `source bootstrap result ${familyKey}`
  );
  mutateNormalized?.(operationFamily, resultFamily);
  requireRecord(
    resultFamily.rawObservation,
    `source bootstrap result ${familyKey} raw binding`
  ).sha256 = rawSha256;
  const operationSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    operationArtifact.relativePath,
    operationArtifact.parsed
  );
  operationBinding.sha256 = operationSha256;
  rebindCommandStdout(
    manifest,
    operationArtifact.relativePath,
    operationSha256
  );
  const bootstrapResultSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    bootstrapResultArtifact.relativePath,
    bootstrapResultArtifact.parsed
  );
  bootstrapResultBinding.sha256 = bootstrapResultSha256;

  const replayApprovalBinding = requireRecord(
    sourceApprovalArtifact.parsed.sourceReplayCatalogCaptureApproval,
    'source replay approval binding'
  );
  const replayApprovalArtifact = readBoundJson(
    directory,
    replayApprovalBinding,
    'source replay approval'
  );
  requireRecord(
    replayApprovalArtifact.parsed.sourceIdentityBootstrapResult,
    'source replay approval bootstrap result binding'
  ).sha256 = bootstrapResultSha256;
  const replayApprovalSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    replayApprovalArtifact.relativePath,
    replayApprovalArtifact.parsed
  );
  replayApprovalBinding.sha256 = replayApprovalSha256;

  const replayResultBinding = requireRecord(
    sourceApprovalArtifact.parsed.sourceReplayCatalogCaptureResult,
    'source replay result binding'
  );
  const replayResultArtifact = readBoundJson(
    directory,
    replayResultBinding,
    'source replay result'
  );
  requireRecord(
    replayResultArtifact.parsed.approval,
    'source replay result approval binding'
  ).sha256 = replayApprovalSha256;
  requireRecord(
    replayResultArtifact.parsed.sourceIdentityClockOperation,
    'source replay result identity operation binding'
  ).sha256 = operationSha256;
  const replayResultSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    replayResultArtifact.relativePath,
    replayResultArtifact.parsed
  );
  replayResultBinding.sha256 = replayResultSha256;
  rewriteSourceApproval(directory, manifest, sourceApprovalArtifact.parsed);
}

function rebindRestoreCreationApprovalChain(
  directory: string,
  manifest: Record<string, unknown>,
  creationApproval: Record<string, unknown>
): string {
  const restore = requireRecord(manifest.restore, 'restore');
  if (typeof restore.creationApprovalPath !== 'string') {
    throw new TypeError('restore.creationApprovalPath must be a string');
  }
  const creationSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    restore.creationApprovalPath,
    creationApproval
  );
  restore.creationApprovalSha256 = creationSha256;
  const supplementalArtifact = readBoundJson(
    directory,
    {
      path: restore.supplementalApprovalPath,
      sha256: restore.supplementalApprovalSha256,
    },
    'restore supplemental approval'
  );
  requireRecord(
    supplementalArtifact.parsed.restoreCreationApproval,
    'restore supplemental creation approval binding'
  ).sha256 = creationSha256;
  restore.supplementalApprovalSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    supplementalArtifact.relativePath,
    supplementalArtifact.parsed
  );
  return creationSha256;
}

function rebindRestoreProviderExportChain(
  directory: string,
  manifest: Record<string, unknown>,
  providerExport: Record<string, unknown>
): void {
  const restore = requireRecord(manifest.restore, 'restore');
  if (typeof restore.providerEvidencePath !== 'string') {
    throw new TypeError('restore.providerEvidencePath must be a string');
  }
  const providerSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    restore.providerEvidencePath,
    providerExport
  );
  restore.providerEvidenceSha256 = providerSha256;
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const creationCommand = commands.find(
    command => command.id === 'PR12-ACTION-017'
  );
  if (!creationCommand || typeof creationCommand.stdoutPath !== 'string') {
    throw new Error('restore creation command is missing');
  }
  const creationOperationValue: unknown = JSON.parse(
    fs.readFileSync(path.join(directory, creationCommand.stdoutPath), 'utf8')
  );
  const creationOperation = requireRecord(
    creationOperationValue,
    'restore creation operation'
  );
  requireRecord(
    creationOperation.providerEvidence,
    'restore creation provider evidence binding'
  ).sha256 = providerSha256;
  const providerIdentifierAvailability = requireRecord(
    providerExport.providerOperationIdentifier,
    'restore provider operation identifier'
  ).availability;
  creationOperation.providerOperationIdentifierAvailability =
    providerIdentifierAvailability;
  const creationOperationSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    creationCommand.stdoutPath,
    creationOperation
  );
  creationCommand.stdoutSha256 = creationOperationSha256;
  const supplementalArtifact = readBoundJson(
    directory,
    {
      path: restore.supplementalApprovalPath,
      sha256: restore.supplementalApprovalSha256,
    },
    'restore supplemental approval'
  );
  const supplementalOperation = requireRecord(
    supplementalArtifact.parsed.restoreCreationOperation,
    'restore supplemental creation operation'
  );
  supplementalOperation.sha256 = creationOperationSha256;
  supplementalOperation.providerOperationIdentifierAvailability =
    providerIdentifierAvailability;
  requireRecord(
    supplementalOperation.providerEvidence,
    'restore supplemental provider evidence binding'
  ).sha256 = providerSha256;
  restore.supplementalApprovalSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    supplementalArtifact.relativePath,
    supplementalArtifact.parsed
  );
}

function rebindSelectedBackupMetadataChain(
  directory: string,
  manifest: Record<string, unknown>,
  backupMetadataSha256: string
): void {
  const backup = requireRecord(manifest.backup, 'backup');
  backup.artifactSha256 = backupMetadataSha256;
  const source = requireRecord(manifest.source, 'source');
  const sourceApprovalSha256 = String(source.approvalPacketSha256);
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const inventoryCommand = commands.find(
    command => command.id === 'PR12-CMD-017A'
  );
  if (!inventoryCommand) throw new Error('backup inventory command is missing');
  inventoryCommand.stdoutSha256 = backupMetadataSha256;

  const restore = requireRecord(manifest.restore, 'restore');
  const creationArtifact = readBoundJson(
    directory,
    {
      path: restore.creationApprovalPath,
      sha256: restore.creationApprovalSha256,
    },
    'restore creation approval'
  );
  requireRecord(
    creationArtifact.parsed.sourceExecutionApproval,
    'restore creation source approval binding'
  ).sha256 = sourceApprovalSha256;
  requireRecord(
    creationArtifact.parsed.selectedBackup,
    'restore creation selected backup'
  ).backupMetadataSha256 = backupMetadataSha256;
  requireRecord(
    creationArtifact.parsed.restoreSelection,
    'restore creation selection'
  ).backupMetadataSha256 = backupMetadataSha256;
  rebindRestoreCreationApprovalChain(
    directory,
    manifest,
    creationArtifact.parsed
  );

  const providerArtifact = readBoundJson(
    directory,
    {
      path: restore.providerEvidencePath,
      sha256: restore.providerEvidenceSha256,
    },
    'restore provider export'
  );
  requireRecord(
    providerArtifact.parsed.selectedBackup,
    'restore provider selected backup'
  ).backupMetadataSha256 = backupMetadataSha256;
  rebindRestoreProviderExportChain(
    directory,
    manifest,
    providerArtifact.parsed
  );

  const supplementalArtifact = readBoundJson(
    directory,
    {
      path: restore.supplementalApprovalPath,
      sha256: restore.supplementalApprovalSha256,
    },
    'restore supplemental approval'
  );
  requireRecord(
    supplementalArtifact.parsed.sourceExecutionApproval,
    'restore supplemental source approval binding'
  ).sha256 = sourceApprovalSha256;
  requireRecord(
    supplementalArtifact.parsed.selectedBackup,
    'restore supplemental selected backup'
  ).backupMetadataSha256 = backupMetadataSha256;
  restore.supplementalApprovalSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    supplementalArtifact.relativePath,
    supplementalArtifact.parsed
  );
}

type FrozenIntegrityFact = 'logicalHash' | 'historicalNormalizedPhysicalHash';

function rebindFrozenIntegrityFactChain(
  directory: string,
  manifest: Record<string, unknown>,
  field: FrozenIntegrityFact,
  value: string
): void {
  const integrity = requireRecord(
    manifest.integrityResults,
    'integrityResults'
  );
  const sourceBinding = requireRecord(integrity.source, 'integrity.source');
  const sourceArtifact = readBoundJson(
    directory,
    sourceBinding,
    'source integrity result'
  );
  sourceArtifact.parsed[field] = value;
  const sourceObservation = requireRecord(
    requireArray(
      sourceArtifact.parsed.observations,
      'source integrity observations'
    )[0],
    'source integrity observation'
  );
  requireRecord(
    sourceObservation.payload,
    'source integrity observation payload'
  )[field] = value;
  const sourceSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    sourceArtifact.relativePath,
    sourceArtifact.parsed
  );
  sourceBinding.sha256 = sourceSha256;
  rebindCommandStdout(manifest, sourceArtifact.relativePath, sourceSha256);

  const backup = requireRecord(manifest.backup, 'backup');
  const watermarkArtifact = readBoundJson(
    directory,
    backup.watermarkOperation,
    'backup watermark operation'
  );
  requireRecord(
    watermarkArtifact.parsed.baselineSourceIntegrity,
    'watermark baseline source integrity'
  ).sha256 = sourceSha256;
  requireRecord(
    watermarkArtifact.parsed.postWatermarkSourceIntegrity,
    'post-watermark source integrity'
  )[field] = value;
  const watermarkSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    watermarkArtifact.relativePath,
    watermarkArtifact.parsed
  );
  for (const bindingValue of [
    integrity.postWatermarkSource,
    backup.watermarkOperation,
    backup.postWatermarkSourceIntegrity,
  ]) {
    requireRecord(bindingValue, 'watermark binding').sha256 = watermarkSha256;
  }
  rebindCommandStdout(
    manifest,
    watermarkArtifact.relativePath,
    watermarkSha256
  );

  const backupMetadataArtifact = readBoundJson(
    directory,
    {
      path: backup.artifactPath,
      sha256: backup.artifactSha256,
    },
    'backup metadata'
  );
  const eligibility = requireRecord(
    backupMetadataArtifact.parsed.watermarkEligibility,
    'backup watermark eligibility'
  );
  requireRecord(eligibility.operation, 'backup operation binding').sha256 =
    watermarkSha256;
  requireRecord(
    eligibility.postWatermarkSourceIntegrity,
    'backup post-watermark source integrity binding'
  ).sha256 = watermarkSha256;
  const backupMetadataSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    backupMetadataArtifact.relativePath,
    backupMetadataArtifact.parsed
  );
  rebindSelectedBackupMetadataChain(directory, manifest, backupMetadataSha256);

  const restoreBinding = requireRecord(integrity.restore, 'integrity.restore');
  const restoreArtifact = readBoundJson(
    directory,
    restoreBinding,
    'restore integrity result'
  );
  requireRecord(
    restoreArtifact.parsed.postWatermarkSourceIntegrity,
    'restore post-watermark source integrity binding'
  ).sha256 = watermarkSha256;
  for (const side of ['source', 'restored']) {
    requireRecord(restoreArtifact.parsed[side], `restore integrity ${side}`)[
      field
    ] = value;
  }
  const rawBinding = requireRecord(
    requireArray(
      restoreArtifact.parsed.rawEvidence,
      'restore integrity raw evidence'
    )[0],
    'restore integrity raw binding'
  );
  const rawArtifact = readBoundJson(
    directory,
    rawBinding,
    'restore integrity raw observation'
  );
  const rawObservation = requireRecord(
    requireArray(
      rawArtifact.parsed.observations,
      'restore integrity raw observations'
    )[0],
    'restore integrity raw observation'
  );
  for (const side of ['source', 'restored']) {
    requireRecord(rawObservation[side], `restore raw integrity ${side}`)[
      field
    ] = value;
  }
  rawBinding.sha256 = rewriteJsonArtifact(
    directory,
    manifest,
    rawArtifact.relativePath,
    rawArtifact.parsed
  );
  restoreBinding.sha256 = rewriteJsonArtifact(
    directory,
    manifest,
    restoreArtifact.relativePath,
    restoreArtifact.parsed
  );
  rebindPostRestoreResultChain(
    directory,
    manifest,
    'integrity',
    String(restoreBinding.sha256)
  );
  requireRecord(manifest.hashes, 'manifest hashes')[field] = value;
}

type DrScopeTarget = 'source' | 'restore';

function rebindDrScopeChain(
  directory: string,
  manifest: Record<string, unknown>,
  target: DrScopeTarget,
  mutate: (scope: Record<string, unknown>) => void
): void {
  const scopeInventory = requireRecord(
    manifest.drScopeInventory,
    'drScopeInventory'
  );
  const targetBinding = requireRecord(
    scopeInventory[target],
    `drScopeInventory.${target}`
  );
  const targetArtifact = readBoundJson(
    directory,
    targetBinding,
    `drScopeInventory.${target}`
  );
  mutate(targetArtifact.parsed);
  const targetSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    targetArtifact.relativePath,
    targetArtifact.parsed
  );
  targetBinding.sha256 = targetSha256;

  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  const commandId = target === 'source' ? 'PR12-CMD-016A' : 'PR12-CMD-019A';
  const command = commands.find(value => value.id === commandId);
  if (!command || typeof command.stdoutPath !== 'string') {
    throw new Error(`DR scope command is missing: ${commandId}`);
  }
  const commandStdoutValue: unknown = JSON.parse(
    fs.readFileSync(path.join(directory, command.stdoutPath), 'utf8')
  );
  const commandStdout = requireRecord(
    commandStdoutValue,
    `${commandId} stdout`
  );
  requireRecord(
    commandStdout.drScopeInventory,
    `${commandId} DR scope binding`
  ).sha256 = targetSha256;
  command.stdoutSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    command.stdoutPath,
    commandStdout
  );
  const externalSideEffects = requireRecord(
    manifest.externalSideEffects,
    'externalSideEffects'
  );
  requireRecord(
    externalSideEffects[target],
    `externalSideEffects.${target}`
  ).artifactSha256 = command.stdoutSha256;

  let restoreSideEffectSha256 = command.stdoutSha256;
  if (target === 'source') {
    const restore = requireRecord(manifest.restore, 'restore');
    const creationArtifact = readBoundJson(
      directory,
      {
        path: restore.creationApprovalPath,
        sha256: restore.creationApprovalSha256,
      },
      'restore creation approval'
    );
    requireRecord(
      creationArtifact.parsed.sourceExternalSideEffectInventory,
      'restore creation source side-effect binding'
    ).sha256 = command.stdoutSha256;
    rebindRestoreCreationApprovalChain(
      directory,
      manifest,
      creationArtifact.parsed
    );
    const restoreCommand = commands.find(value => value.id === 'PR12-CMD-019A');
    if (!restoreCommand || typeof restoreCommand.stdoutPath !== 'string') {
      throw new Error('restore side-effect command is missing');
    }
    const restoreStdoutValue: unknown = JSON.parse(
      fs.readFileSync(path.join(directory, restoreCommand.stdoutPath), 'utf8')
    );
    const restoreStdout = requireRecord(
      restoreStdoutValue,
      'restore side-effect command stdout'
    );
    requireRecord(
      restoreStdout.sourceInventory,
      'restore side-effect source inventory binding'
    ).sha256 = command.stdoutSha256;
    restoreCommand.stdoutSha256 = rewriteJsonArtifact(
      directory,
      manifest,
      restoreCommand.stdoutPath,
      restoreStdout
    );
    requireRecord(
      externalSideEffects.restore,
      'externalSideEffects.restore'
    ).artifactSha256 = restoreCommand.stdoutSha256;
    restoreSideEffectSha256 = restoreCommand.stdoutSha256;
  }

  const comparisonBinding = requireRecord(
    scopeInventory.comparison,
    'drScopeInventory.comparison'
  );
  const comparisonArtifact = readBoundJson(
    directory,
    comparisonBinding,
    'drScopeInventory.comparison'
  );
  requireRecord(
    comparisonArtifact.parsed[target],
    `DR scope comparison ${target}`
  ).sha256 = targetSha256;
  const comparisonSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    comparisonArtifact.relativePath,
    comparisonArtifact.parsed
  );
  comparisonBinding.sha256 = comparisonSha256;

  const finalCommand = commands.find(value => value.id === 'PR12-CMD-019F');
  if (!finalCommand || typeof finalCommand.stdoutPath !== 'string') {
    throw new Error('DR scope final command is missing');
  }
  const finalValue: unknown = JSON.parse(
    fs.readFileSync(path.join(directory, finalCommand.stdoutPath), 'utf8')
  );
  const finalOperation = requireRecord(finalValue, 'DR scope final operation');
  requireRecord(
    finalOperation.externalSideEffects,
    'DR scope final external side-effect binding'
  ).sha256 = restoreSideEffectSha256;
  requireRecord(
    finalOperation.drScopeComparison,
    'DR scope final comparison binding'
  ).sha256 = comparisonSha256;
  finalCommand.stdoutSha256 = rewriteJsonArtifact(
    directory,
    manifest,
    finalCommand.stdoutPath,
    finalOperation
  );
}

function rebindCommandLedgerApprovalChain(
  directory: string,
  manifest: Record<string, unknown>,
  approval: Record<string, unknown>,
  ledgerSha256: string
): void {
  const bindings = requireRecord(approval.bindings, 'source approval bindings');
  requireRecord(
    bindings.commandLedger,
    'source approval command ledger'
  ).sha256 = ledgerSha256;
  rewriteSourceApproval(directory, manifest, approval);
}

function writeManifest(
  directory: string,
  _filename: string,
  manifest: Record<string, unknown>
): string {
  const manifestPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  return manifestPath;
}

function refreshPrivacyScan(
  directory: string,
  filename: string,
  manifest: Record<string, unknown>
): string {
  const privacyScan = requireRecord(
    manifest.privacyScan,
    'manifest.privacyScan'
  );
  const manualReviewPaths = requireArray(
    privacyScan.manualReviewEvidence,
    'manifest.privacyScan.manualReviewEvidence'
  );
  if (manualReviewPaths.length !== 1) {
    throw new Error(
      'fixture requires exactly one manual privacy review artifact'
    );
  }
  const manualReviewPath = String(manualReviewPaths[0]);
  const commands = requireArray(manifest.commands, 'manifest.commands').map(
    (value, index) =>
      requireRecord(value, `manifest.commands[${String(index)}]`)
  );
  const command = requireRecord(
    commands.find(value => value.id === 'PR12-CMD-020'),
    'privacy scan command'
  );
  const stdoutPath = String(command.stdoutPath);
  const stderrPath = String(command.stderrPath);
  const artifacts = requireArray(manifest.artifacts, 'manifest.artifacts').map(
    (value, index) =>
      requireRecord(value, `manifest.artifacts[${String(index)}]`)
  );
  const reviewedArtifacts = artifacts
    .filter(
      artifact =>
        ![stdoutPath, stderrPath, manualReviewPath].includes(
          String(artifact.path)
        )
    )
    .map(artifact => ({
      path: artifact.path,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      classification: artifact.classification,
    }))
    .sort((left, right) =>
      String(left.path).localeCompare(String(right.path), 'en')
    );
  const manualReview = requireRecord(
    JSON.parse(fs.readFileSync(path.join(directory, manualReviewPath), 'utf8')),
    'manual privacy review artifact'
  );
  manualReview.reviewedArtifactCount = reviewedArtifacts.length;
  manualReview.reviewedArtifacts = reviewedArtifacts;
  rewriteJsonArtifact(directory, manifest, manualReviewPath, manualReview);
  const manifestPath = writeManifest(directory, filename, manifest);
  const scan = spawnSync(
    process.execPath,
    [
      path.join(
        repoRoot,
        'scripts/commercial-hardening/scan-pr12-evidence.mjs'
      ),
      '--manifest',
      manifestPath,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (scan.status !== 0) {
    throw new Error(
      `fixture privacy scan refresh failed: ${scan.stderr || scan.stdout}`
    );
  }
  fs.writeFileSync(path.join(directory, stdoutPath), scan.stdout, 'utf8');
  fs.writeFileSync(path.join(directory, stderrPath), scan.stderr, 'utf8');
  for (const streamPath of [stdoutPath, stderrPath]) {
    const artifact = requireRecord(
      artifacts.find(value => value.path === streamPath),
      `privacy scan stream artifact ${streamPath}`
    );
    const bytes = fs.readFileSync(path.join(directory, streamPath));
    artifact.bytes = bytes.length;
    artifact.sha256 = sha256(bytes);
  }
  const stdoutArtifact = requireRecord(
    artifacts.find(value => value.path === stdoutPath),
    'privacy scan stdout artifact'
  );
  const stderrArtifact = requireRecord(
    artifacts.find(value => value.path === stderrPath),
    'privacy scan stderr artifact'
  );
  command.stdoutSha256 = stdoutArtifact.sha256;
  command.stderrSha256 = stderrArtifact.sha256;
  const report = requireRecord(JSON.parse(scan.stdout), 'privacy scan report');
  requireRecord(
    manifest.privacyScan,
    'manifest.privacyScan'
  ).scannedArtifactCount = report.scannedArtifactCount;
  return writeManifest(directory, filename, manifest);
}

function currentHead(): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error('git rev-parse HEAD failed');
  return result.stdout.trim();
}

function runVerifier(manifestPath: string): {
  status: number | null;
  output: string;
} {
  const result = spawnSync(
    process.execPath,
    [verifierPath, '--manifest', manifestPath],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return {
    status: result.status,
    output: [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join('\n'),
  };
}

function tenantProbeControl(
  target: string,
  targetTenant: string,
  tenantDirection: string,
  operation: string,
  deniedRole: string,
  deniedActorId: string,
  surface: 'SECURITY' | 'DATA_API' = 'SECURITY'
): Record<string, unknown> {
  const rowSha256 = sha256(
    `synthetic-tenant-probe:${target}:${targetTenant}:${tenantDirection}`
  );
  const controlRole =
    surface === 'DATA_API'
      ? 'authenticated'
      : applicationRoles.includes(deniedRole)
        ? deniedRole
        : 'staff';
  const controlActorId =
    surface === 'DATA_API'
      ? `synthetic_data_api_${targetTenant}`
      : `synthetic_${controlRole}_${targetTenant}`;
  const controlKey = `${surface}:${target}:${targetTenant}:${tenantDirection}:${operation}:${controlRole}`;
  const changedRowSha256 = sha256(`${controlKey}:changed-row`);
  const isWrite = ['insert', 'update', 'delete'].includes(operation);
  const stateResult =
    operation === 'insert'
      ? {
          beforeExists: false,
          afterExists: true,
          postRollbackExists: false,
          beforeSha256: null,
          afterSha256: changedRowSha256,
          postRollbackSha256: null,
        }
      : operation === 'delete'
        ? {
            beforeExists: true,
            afterExists: false,
            postRollbackExists: true,
            beforeSha256: rowSha256,
            afterSha256: null,
            postRollbackSha256: rowSha256,
          }
        : operation === 'update'
          ? {
              beforeExists: true,
              afterExists: true,
              postRollbackExists: true,
              beforeSha256: rowSha256,
              afterSha256: changedRowSha256,
              postRollbackSha256: rowSha256,
            }
          : {
              beforeExists: true,
              afterExists: true,
              postRollbackExists: true,
              beforeSha256: rowSha256,
              afterSha256: rowSha256,
              postRollbackSha256: rowSha256,
            };
  const expected = {
    httpStatus: 200,
    sqlstate: 'NONE',
    rowCount: 1,
    mutationCount: isWrite ? 1 : 0,
    directAffectedRows: isWrite ? 1 : 0,
    decision: 'ALLOW',
  };
  return {
    selector: {
      relation: target,
      primaryKeyColumn: 'id',
      primaryKeyValue: `synthetic-${tenantDirection.toLowerCase()}-target-row`,
      tenantColumn: 'clinic_id',
      expectedTenant: targetTenant,
    },
    precondition: {
      rowCount: 1,
      observedTenant: targetTenant,
      rowSha256,
    },
    sameTenantPositiveControl: {
      rawObservationId: 'DERIVED_AT_EXECUTION',
      actorId: controlActorId,
      role: controlRole,
      jwtCase: 'valid_jwt',
      deniedActorId,
      authTokenUse: {
        source: 'HOSTED_REFRESHED_SESSION',
        actorId: controlActorId,
        tokenHandleId: 'DERIVED_AT_EXECUTION',
        provenanceObservationId: 'DERIVED_AT_EXECUTION',
      },
      sourceTenant: targetTenant,
      targetTenant,
      target,
      operation,
      selector: {
        relation: target,
        primaryKeyColumn: 'id',
        primaryKeyValue: `synthetic-positive-${tenantDirection.toLowerCase()}-${operation}-row`,
        tenantColumn: 'clinic_id',
        expectedTenant: targetTenant,
      },
      expected,
      observed: { ...expected },
      transaction: {
        transactionId: 'DERIVED_AT_EXECUTION',
        endCommand: 'ROLLBACK',
        endStatus: 'COMMAND_OK',
        rollbackCompletedAt: 'DERIVED_AT_EXECUTION',
        postRollbackCheckedAt: 'DERIVED_AT_EXECUTION',
      },
      stateResults: [
        {
          assertionId: `same-tenant-${operation}`,
          relation: target,
          operation,
          ...stateResult,
        },
      ],
    },
    postDeny: {
      rowCount: 1,
      observedTenant: targetTenant,
      rowSha256,
    },
  };
}

function materializeTenantProbeControl(
  value: unknown,
  environmentPrefix: 'source' | 'restore',
  observedAt: string
): unknown {
  if (!isRecord(value)) return value;
  const materialized = structuredClone(value);
  const positive = requireRecord(
    materialized.sameTenantPositiveControl,
    'tenant positive control'
  );
  const actorId = String(positive.actorId);
  const controlKey = `${String(positive.target)}:${String(positive.targetTenant)}:${String(positive.operation)}:${actorId}:${String(positive.deniedActorId)}`;
  const observationSuffix = sha256(controlKey).slice(0, 16);
  positive.rawObservationId = `${environmentPrefix}-tenant-positive-${observationSuffix}`;
  positive.authTokenUse = {
    source: 'HOSTED_REFRESHED_SESSION',
    actorId,
    tokenHandleId: `${environmentPrefix}-auth-${actorId}-refreshed-token-handle`,
    provenanceObservationId: `${environmentPrefix}-auth-${actorId}-refresh`,
  };
  positive.transaction = {
    transactionId: `${environmentPrefix}-tenant-positive-${observationSuffix}-transaction`,
    endCommand: 'ROLLBACK',
    endStatus: 'COMMAND_OK',
    rollbackCompletedAt: observedAt,
    postRollbackCheckedAt: observedAt,
  };
  return materialized;
}

function tenantPositiveRawObservation(
  rowValue: Record<string, unknown>,
  observedAt: string
): Record<string, unknown> | null {
  if (rowValue.tenantProbeControl === undefined) return null;
  const control = requireRecord(
    rowValue.tenantProbeControl,
    'tenant probe control'
  );
  const positive = requireRecord(
    control.sameTenantPositiveControl,
    'same-tenant positive control'
  );
  const observed = requireRecord(
    positive.observed,
    'same-tenant positive observed result'
  );
  return {
    observationId: positive.rawObservationId,
    observationType: 'TENANT_SAME_OPERATION_POSITIVE_CONTROL',
    observedAt,
    actorId: positive.actorId,
    role: positive.role,
    jwtCase: positive.jwtCase,
    deniedActorId: positive.deniedActorId,
    authTokenUse: positive.authTokenUse,
    sourceTenant: positive.sourceTenant,
    targetTenant: positive.targetTenant,
    target: positive.target,
    operation: positive.operation,
    selector: positive.selector,
    http: { status: observed.httpStatus },
    sql: {
      sqlstate: observed.sqlstate,
      rowCount: observed.rowCount,
      mutationCount: observed.mutationCount,
      directAffectedRows: observed.directAffectedRows,
    },
    authorization: { decision: observed.decision },
    transaction: positive.transaction,
    stateResults: positive.stateResults,
    status: 'PASS',
  };
}

function tenantAllowControl(
  target: string,
  tenant: string
): Record<string, unknown> {
  const rowSha256 = sha256(`synthetic-tenant-allow:${target}:${tenant}`);
  return {
    selector: {
      relation: target,
      primaryKeyColumn: 'id',
      primaryKeyValue: 'synthetic-a-to-a-target-row',
      tenantColumn: 'clinic_id',
      expectedTenant: tenant,
    },
    precondition: {
      rowCount: 1,
      observedTenant: tenant,
      rowSha256,
    },
    allowObservation: {
      actorTenant: tenant,
      returnedTenant: tenant,
      rowCount: 1,
      returnedRowSha256: rowSha256,
    },
    postRead: {
      rowCount: 1,
      observedTenant: tenant,
      rowSha256,
    },
  };
}

function authorityStateControl(
  target: string,
  actorId: string,
  jwtCase: string
): Record<string, unknown> {
  const conditions: Record<
    string,
    {
      condition: string;
      profileStatus: string;
      profileLookupStatus: string;
      managerAssignmentStatus: string;
      managerAssignmentClinicId: string;
      permissionLookupStatus: string;
      jwtIssuedAt: string;
      authorityChangedAt: string;
    }
  > = {
    inactive_profile: {
      condition: 'PROFILE_INACTIVE',
      profileStatus: 'INACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'GRANTED',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    expired_manager_assignment: {
      condition: 'ASSIGNMENT_EXPIRED',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'EXPIRED',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'GRANTED',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    revoked_manager_assignment: {
      condition: 'ASSIGNMENT_REVOKED',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'REVOKED',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'GRANTED',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    missing_authority: {
      condition: 'PERMISSION_MISSING',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'ACTIVE',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'MISSING',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    stale_jwt: {
      condition: 'JWT_STALE_AFTER_AUTHORITY_CHANGE',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'ACTIVE',
      managerAssignmentClinicId: 'tenant_a',
      permissionLookupStatus: 'GRANTED',
      jwtIssuedAt: 'DERIVED_FROM_HOSTED_SIGN_IN_PROVENANCE',
      authorityChangedAt: 'AFTER_TOKEN_ISSUANCE_BEFORE_REQUEST',
    },
    cross_clinic: {
      condition: 'ASSIGNMENT_CLINIC_MISMATCH',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'ACTIVE',
      managerAssignmentClinicId: 'tenant_b',
      permissionLookupStatus: 'GRANTED',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    permissions_query_error: {
      condition: 'PERMISSION_LOOKUP_ERROR',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'ERROR',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    permissions_row_missing: {
      condition: 'PERMISSION_ROW_MISSING',
      profileStatus: 'ACTIVE',
      profileLookupStatus: 'FOUND',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'MISSING_ROW',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    profile_status_query_error: {
      condition: 'PROFILE_LOOKUP_ERROR',
      profileStatus: 'NOT_CAPTURED_DUE_TO_ERROR',
      profileLookupStatus: 'ERROR',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'NOT_EVALUATED',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
    profile_row_missing: {
      condition: 'PROFILE_ROW_MISSING',
      profileStatus: 'MISSING',
      profileLookupStatus: 'MISSING_ROW',
      managerAssignmentStatus: 'NOT_APPLICABLE',
      managerAssignmentClinicId: 'NOT_APPLICABLE',
      permissionLookupStatus: 'NOT_EVALUATED',
      jwtIssuedAt: 'NOT_APPLICABLE',
      authorityChangedAt: 'NOT_APPLICABLE',
    },
  };
  const authorityCause = conditions[jwtCase];
  if (!authorityCause) {
    throw new Error(`unsupported authority control case: ${jwtCase}`);
  }
  const rowSha256 = sha256(`authority-control:${target}:${jwtCase}:tenant_a`);
  return {
    selector: {
      relation: target,
      primaryKeyColumn: 'id',
      primaryKeyValue: `authority-target-${jwtCase}`,
      tenantColumn: 'clinic_id',
      expectedTenant: 'tenant_a',
    },
    precondition: {
      rowCount: 1,
      observedTenant: 'tenant_a',
      rowSha256,
    },
    deniedActor: {
      actorId,
      actorTenant: 'tenant_a',
      targetTenant: 'tenant_a',
      jwtCase,
    },
    authorityCause,
    sameTenantActiveActorControl: {
      actorId: 'synthetic_authority_active_control_tenant_a',
      actorTenant: 'tenant_a',
      targetTenant: 'tenant_a',
      tokenSource: 'HOSTED_PASSWORD_SIGN_IN_SESSION',
      tokenHandleId: 'DERIVED_AT_EXECUTION',
      provenanceObservationId: 'DERIVED_AT_EXECUTION',
      rowCount: 1,
      decision: 'ALLOW',
    },
    deniedResult: {
      rowCount: 0,
      mutationCount: 0,
      decision: 'DENY',
    },
    postDeny: {
      rowCount: 1,
      observedTenant: 'tenant_a',
      rowSha256,
    },
  };
}

function materializeAuthorityStateControl(
  value: unknown,
  environmentPrefix: 'source' | 'restore',
  jwtCase: string
): Record<string, unknown> {
  const control = requireRecord(value, 'authorityStateControl');
  const authorityCause = requireRecord(
    control.authorityCause,
    'authorityStateControl.authorityCause'
  );
  const positive = requireRecord(
    control.sameTenantActiveActorControl,
    'authorityStateControl.sameTenantActiveActorControl'
  );
  const staleTimes =
    environmentPrefix === 'source'
      ? {
          jwtIssuedAt: '2000-01-01T00:00:20.100Z',
          authorityChangedAt: '2000-01-01T00:00:20.300Z',
        }
      : {
          jwtIssuedAt: '2000-01-01T00:04:30Z',
          authorityChangedAt: '2000-01-01T00:04:34Z',
        };
  const positiveActorId = String(positive.actorId);
  return {
    ...control,
    authorityCause: {
      ...authorityCause,
      ...(jwtCase === 'stale_jwt' ? staleTimes : {}),
    },
    sameTenantActiveActorControl: {
      ...positive,
      tokenHandleId: `${environmentPrefix}-auth-${positiveActorId}-sign-in-token-handle`,
      provenanceObservationId: `${environmentPrefix}-auth-${positiveActorId}-sign-in`,
    },
  };
}

function securityExpectedRow(
  caseId: string,
  role: string,
  jwtCase: string,
  operation: string,
  target = 'public.representative_relation',
  tenantDirection = 'A_TO_B'
): Record<string, unknown> {
  const sourceTenant = sourceTenantForDirection(tenantDirection);
  const targetTenant = tenantDirection === 'A_TO_B' ? 'tenant_b' : 'tenant_a';
  const actor = securityActorId(role, jwtCase, tenantDirection);
  const tokenSource = expectedAuthTokenSource(role, jwtCase);
  const tokenActorId = [
    'HOSTED_REFRESHED_SESSION',
    'HOSTED_STALE_SESSION',
    'HOSTED_EXPIRED_SESSION',
  ].includes(tokenSource)
    ? actor
    : 'NOT_APPLICABLE';
  let caseClass: string;
  let expectedHttpStatus = 403;
  let expectedSqlstate = 'NONE';
  let expectedAclOutcome: string;
  let expectedRlsOutcome: string;
  if (applicationRoles.includes(role) && jwtCase === 'valid_jwt') {
    caseClass = 'TENANT_RLS_NEGATIVE';
    expectedAclOutcome = 'ACL_ALLOWED_TO_EVALUATE_RLS';
    expectedRlsOutcome =
      operation === 'insert' ? 'WRITE_REJECTED' : 'FILTERED_ZERO_ROWS';
  } else if (
    role === 'authenticated' &&
    ['empty_jwt', 'malformed_jwt', 'expired_jwt'].includes(jwtCase)
  ) {
    caseClass = 'AUTH_REJECTED_BEFORE_DB';
    expectedHttpStatus = 401;
    expectedSqlstate = 'NOT_EXECUTED';
    expectedAclOutcome = 'NOT_EVALUATED';
    expectedRlsOutcome = 'NOT_EVALUATED';
  } else if (
    role === 'authenticated' &&
    [
      'permissions_query_error',
      'permissions_row_missing',
      'profile_status_query_error',
      'profile_row_missing',
    ].includes(jwtCase)
  ) {
    caseClass = 'AUTHORITY_LOOKUP_FAIL_CLOSED';
    expectedSqlstate = 'NOT_EXECUTED';
    expectedHttpStatus = [
      'permissions_query_error',
      'profile_status_query_error',
    ].includes(jwtCase)
      ? 503
      : 403;
    expectedAclOutcome = 'NOT_EVALUATED';
    expectedRlsOutcome = 'NOT_EVALUATED';
  } else if (
    role === 'authenticated' &&
    [
      'inactive_profile',
      'expired_manager_assignment',
      'revoked_manager_assignment',
      'missing_authority',
      'stale_jwt',
      'cross_clinic',
    ].includes(jwtCase)
  ) {
    caseClass = 'AUTHORITY_FAIL_CLOSED';
    expectedAclOutcome = 'AUTHENTICATED_ACL_ALLOWED';
    expectedRlsOutcome = 'AUTHORITY_DENIED';
  } else if (role === 'authenticated') {
    caseClass = 'RELATIONAL_SEMANTIC_FAIL_CLOSED';
    expectedAclOutcome = 'AUTHENTICATED_ACL_ALLOWED';
    expectedRlsOutcome = 'RELATIONAL_INVARIANT_DENIED';
  } else if (role === 'anon') {
    caseClass = 'ANON_NO_SESSION';
    expectedHttpStatus = 200;
    expectedAclOutcome = 'ANON_ACL_ALLOWED';
    expectedRlsOutcome = 'ANON_TENANT_DENIED';
  } else {
    caseClass = 'SERVER_ONLY_PRIVILEGED_PATH';
    expectedSqlstate = 'NOT_EXECUTED';
    expectedAclOutcome = 'NOT_EVALUATED';
    expectedRlsOutcome = 'NOT_EVALUATED';
  }
  const authoritySemanticCase = [
    'AUTHORITY_FAIL_CLOSED',
    'AUTHORITY_LOOKUP_FAIL_CLOSED',
  ].includes(caseClass);
  const effectiveTargetTenant = authoritySemanticCase
    ? sourceTenant
    : targetTenant;
  return {
    caseId,
    role,
    actor,
    jwtCase,
    caseClass,
    sourceTenant,
    targetTenant: effectiveTargetTenant,
    tenantBoundary: authoritySemanticCase
      ? 'SAME_TENANT_AUTHORITY_DENIED'
      : 'CROSS_TENANT_DENIED',
    tenantDirection: authoritySemanticCase ? 'NOT_APPLICABLE' : tenantDirection,
    target,
    operation,
    expectedHttpStatus,
    expectedSqlstate,
    expectedRowCount: 0,
    expectedDecision: 'DENY',
    expectedMutationCount: 0,
    expectedDirectAffectedRows: 0,
    expectedAclOutcome,
    expectedRlsOutcome,
    expectedAuthTokenSource: tokenSource,
    expectedAuthActorId: tokenActorId,
    expectedErrorIdentity: 'NOT_APPLICABLE',
    expectedPostcondition: 'NOT_APPLICABLE',
    expectedPreservedSentinel: 'NOT_APPLICABLE',
    expectedStateTransitions: [],
    expectedErrorDiagnostic: { status: 'NOT_APPLICABLE' },
    expectedTransactionEndCommand: 'NOT_APPLICABLE',
    expectedTransactionEndStatus: 'NOT_APPLICABLE',
    ...(authoritySemanticCase
      ? { authorityStateControl: authorityStateControl(target, actor, jwtCase) }
      : expectedSqlstate === 'NOT_EXECUTED'
        ? {}
        : {
            tenantProbeControl: tenantProbeControl(
              target,
              effectiveTargetTenant,
              tenantDirection,
              operation,
              role,
              actor
            ),
          }),
  };
}

function relationalStateTransitions(
  jwtCase:
    | 'missing_resource'
    | 'null_resource'
    | 'parent_rehome'
    | 'resource_delete_cascade'
    | 'clinic_delete_cascade'
): Record<string, unknown>[] {
  if (jwtCase === 'missing_resource') {
    return [
      ['attempted_block', 'public.blocks', 'ABSENT_TO_ABSENT'],
      ['missing_resource', 'public.resources', 'ABSENT_TO_ABSENT'],
      ['other_tenant_sentinel', 'public.blocks', 'HASH_UNCHANGED'],
    ].map(([assertionId, relation, transition]) => ({
      assertionId,
      relation,
      transition,
    }));
  }
  if (jwtCase === 'null_resource') {
    return [
      ['attempted_block', 'public.blocks', 'ABSENT_TO_ABSENT'],
      ['existing_clinic', 'public.clinics', 'HASH_UNCHANGED'],
      ['other_tenant_sentinel', 'public.blocks', 'HASH_UNCHANGED'],
    ].map(([assertionId, relation, transition]) => ({
      assertionId,
      relation,
      transition,
    }));
  }
  if (jwtCase === 'parent_rehome') {
    return [
      ['target_resource', 'public.resources', 'HASH_UNCHANGED'],
      ['referencing_block', 'public.blocks', 'HASH_UNCHANGED'],
      ['other_tenant_sentinel', 'public.blocks', 'HASH_UNCHANGED'],
    ].map(([assertionId, relation, transition]) => ({
      assertionId,
      relation,
      transition,
    }));
  }
  if (jwtCase === 'resource_delete_cascade') {
    return [
      ['target_resource', 'public.resources', 'PRESENT_TO_ABSENT'],
      ['dependent_block', 'public.blocks', 'PRESENT_TO_ABSENT'],
      ['unrelated_resource_block', 'public.blocks', 'HASH_UNCHANGED'],
      ['other_tenant_sentinel', 'public.blocks', 'HASH_UNCHANGED'],
    ].map(([assertionId, relation, transition]) => ({
      assertionId,
      relation,
      transition,
    }));
  }
  return [
    ['target_clinic', 'public.clinics', 'PRESENT_TO_ABSENT'],
    ['target_resource', 'public.resources', 'PRESENT_TO_ABSENT'],
    ['dependent_block', 'public.blocks', 'PRESENT_TO_ABSENT'],
    ['other_tenant_sentinel', 'public.blocks', 'HASH_UNCHANGED'],
  ].map(([assertionId, relation, transition]) => ({
    assertionId,
    relation,
    transition,
  }));
}

function relationalSecurityExpectedRow(
  jwtCase:
    | 'missing_resource'
    | 'null_resource'
    | 'parent_rehome'
    | 'resource_delete_cascade'
    | 'clinic_delete_cascade'
): Record<string, unknown> {
  const rejection = [
    'missing_resource',
    'null_resource',
    'parent_rehome',
  ].includes(jwtCase);
  const parentRehome = jwtCase === 'parent_rehome';
  const resourceCascade = jwtCase === 'resource_delete_cascade';
  const target = parentRehome
    ? 'public.resources'
    : resourceCascade
      ? 'public.resources'
      : jwtCase === 'clinic_delete_cascade'
        ? 'public.clinics'
        : 'public.blocks';
  const operation = parentRehome ? 'update' : rejection ? 'insert' : 'delete';
  const expectedPostcondition = parentRehome
    ? 'RESOURCE_CLINIC_AND_REFERENCING_BLOCK_UNCHANGED'
    : jwtCase === 'clinic_delete_cascade'
      ? 'RESOURCE_AND_BLOCK_ABSENT'
      : 'BLOCK_ABSENT';
  const expectedPreservedSentinel = parentRehome
    ? 'RESERVATION_AND_OTHER_TENANT_SENTINELS_UNCHANGED'
    : resourceCascade
      ? 'OTHER_RESOURCES_AND_OTHER_TENANT_SENTINELS_UNCHANGED'
      : jwtCase === 'clinic_delete_cascade'
        ? 'OTHER_TENANT_SENTINELS_UNCHANGED'
        : 'OTHER_TENANT_SENTINEL_UNCHANGED';
  const emptyDiagnostic = {
    message: null,
    detail: null,
    hint: null,
    schema: null,
    table: null,
    column: null,
    constraint: null,
  };
  const expectedErrorDiagnostic = rejection
    ? parentRehome
      ? {
          message:
            'update or delete on table "resources" violates foreign key constraint "blocks_resource_id_fkey" on table "blocks"',
          detail:
            'Key (id, clinic_id)=(fb110000-0000-4000-8000-000000008101, fb110000-0000-4000-8000-000000008001) is still referenced from table "blocks".',
          hint: null,
          schema: 'public',
          table: 'blocks',
          column: null,
          constraint: 'blocks_resource_id_fkey',
        }
      : { ...emptyDiagnostic, message: 'resources.id not found' }
    : emptyDiagnostic;
  return {
    caseId: `relational_${jwtCase}`,
    role: 'postgres',
    actor: 'synthetic_direct_postgres_operator',
    jwtCase,
    caseClass: rejection
      ? 'RELATIONAL_CONSTRAINT_REJECTION'
      : 'RELATIONAL_CASCADE_POSTCONDITION',
    sourceTenant: 'tenant_a',
    targetTenant: 'tenant_a',
    tenantBoundary: rejection
      ? 'SAME_TENANT_CONSTRAINT_CHECK'
      : 'SAME_TENANT_CASCADE_CHECK',
    tenantDirection: 'NOT_APPLICABLE',
    target,
    operation,
    expectedHttpStatus: 'NOT_APPLICABLE',
    expectedSqlstate: rejection ? '23503' : 'NO_ERROR_DIAGNOSTIC',
    expectedRowCount: rejection ? 0 : 1,
    expectedDecision: rejection ? 'CONSTRAINT_REJECTED' : 'CASCADE_CONFIRMED',
    expectedMutationCount: rejection ? 0 : 'DERIVED_BY_CASCADE_POSTCONDITION',
    expectedDirectAffectedRows: rejection ? 0 : 1,
    expectedAclOutcome: 'OWNER_PRIVILEGE',
    expectedRlsOutcome: 'NOT_APPLICABLE_DIRECT_POSTGRES_OWNER',
    expectedAuthTokenSource: 'DIRECT_POSTGRES_NO_JWT',
    expectedAuthActorId: 'NOT_APPLICABLE',
    expectedErrorIdentity: rejection
      ? parentRehome
        ? 'CONSTRAINT:blocks_resource_id_fkey'
        : 'MESSAGE:resources.id not found'
      : 'NOT_APPLICABLE',
    expectedPostcondition,
    expectedPreservedSentinel,
    expectedStateTransitions: relationalStateTransitions(jwtCase),
    expectedErrorDiagnostic,
    expectedTransactionEndCommand: 'ROLLBACK',
    expectedTransactionEndStatus: 'COMMAND_OK',
  };
}

function observedSecurityStateResults(
  value: unknown
): Record<string, unknown>[] {
  return requireArray(value, 'expected security state transitions').map(
    (entryValue, index) => {
      const entry = requireRecord(
        entryValue,
        `expected security state transition ${String(index)}`
      );
      const assertionId = String(entry.assertionId);
      const transition = String(entry.transition);
      const beforeHash = sha256(`before:${assertionId}`);
      return {
        assertionId,
        relation: entry.relation,
        transition,
        beforeExists: transition !== 'ABSENT_TO_ABSENT',
        afterExists: transition === 'HASH_UNCHANGED',
        beforeSha256: transition === 'ABSENT_TO_ABSENT' ? null : beforeHash,
        afterSha256: transition === 'HASH_UNCHANGED' ? beforeHash : null,
        postRollbackExists: transition !== 'ABSENT_TO_ABSENT',
        postRollbackSha256:
          transition === 'ABSENT_TO_ABSENT' ? null : beforeHash,
      };
    }
  );
}

function observedSecurityRow(
  expected: Record<string, unknown>,
  resultEvidencePath = evidencePath,
  rollbackCompletedAt = '2000-01-01T00:00:20.800Z',
  postRollbackCheckedAt = '2000-01-01T00:00:20.900Z',
  environmentPrefix: 'source' | 'restore' = 'source'
): Record<string, unknown> {
  const relational = expected.role === 'postgres';
  const authorityLookup = [
    'permissions_query_error',
    'permissions_row_missing',
    'profile_status_query_error',
    'profile_row_missing',
  ].includes(String(expected.jwtCase));
  return {
    ...expected,
    observedHttpStatus: expected.expectedHttpStatus,
    observedSqlstate: expected.expectedSqlstate,
    observedRowCount: expected.expectedRowCount,
    observedDecision: expected.expectedDecision,
    observedMutationCount: expected.expectedMutationCount,
    observedDirectAffectedRows: expected.expectedDirectAffectedRows,
    observedAclOutcome: expected.expectedAclOutcome,
    observedRlsOutcome: expected.expectedRlsOutcome,
    observedErrorIdentity: expected.expectedErrorIdentity,
    observedPostcondition: expected.expectedPostcondition,
    observedPreservedSentinel: expected.expectedPreservedSentinel,
    observedStateResults: observedSecurityStateResults(
      expected.expectedStateTransitions
    ),
    observedErrorDiagnostic: expected.expectedErrorDiagnostic,
    observedTransactionEndCommand: expected.expectedTransactionEndCommand,
    observedTransactionEndStatus: expected.expectedTransactionEndStatus,
    authTokenUse: authTokenUse(expected, environmentPrefix),
    observedRollbackCompletedAt: relational
      ? rollbackCompletedAt
      : 'NOT_APPLICABLE',
    observedPostRollbackCheckedAt: relational
      ? postRollbackCheckedAt
      : 'NOT_APPLICABLE',
    aclVerdict: relational || authorityLookup ? 'NOT_APPLICABLE' : 'PASS',
    rlsVerdict: relational || authorityLookup ? 'NOT_APPLICABLE' : 'PASS',
    status: 'PASS',
    evidence: [resultEvidencePath],
  };
}

function directRoleAuthTokenUse(
  role: string,
  actorId: string,
  environmentPrefix: 'source' | 'restore' | null = null
): Record<string, unknown> {
  if (role === 'authenticated') {
    return {
      source: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
      actorId,
      tokenHandleId:
        environmentPrefix === null
          ? 'DERIVED_AT_EXECUTION'
          : `${environmentPrefix}-auth-${actorId}-refreshed-token-handle`,
      provenanceObservationId:
        environmentPrefix === null
          ? 'DERIVED_AT_EXECUTION'
          : `${environmentPrefix}-auth-${actorId}-refresh`,
    };
  }
  if (role === 'anon') {
    return {
      source: 'ANON_PUBLIC_KEY_NO_USER_SESSION',
      actorId,
      tokenHandleId: 'ANON_PUBLIC_KEY_HANDLE',
      provenanceObservationId: 'NOT_APPLICABLE',
    };
  }
  return {
    source: 'SERVER_SECRET_STORE_RUNTIME_INJECTION',
    actorId,
    tokenHandleId: 'SERVER_ONLY_SERVICE_ROLE_CREDENTIAL_HANDLE',
    provenanceObservationId: 'NOT_APPLICABLE',
  };
}

function directRoleHttpBinding(
  httpMethod: 'GET' | 'POST',
  requestPath: string,
  requestBody: string,
  responseBody: string
): Record<string, unknown> {
  return {
    httpMethod,
    requestPath,
    requestBodySha256: sha256(requestBody),
    expectedResponseBodySha256: sha256(responseBody),
  };
}

function directRoleContractRows(prefix: string): Record<string, unknown>[] {
  if (prefix === 'graphql') {
    return ['anon', 'authenticated', 'service_role'].map(role => {
      const provenance =
        role === 'anon'
          ? {
              actorId: 'ANON_PUBLIC_ACTOR',
              credentialHandle: 'ANON_PUBLIC_KEY_HANDLE',
              tokenProvenance: 'ANON_PUBLIC_KEY_NO_USER_SESSION',
            }
          : role === 'authenticated'
            ? {
                actorId: 'synthetic_data_api_tenant_a',
                credentialHandle: 'HOSTED_AUTH_SESSION_HANDLE',
                tokenProvenance: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
              }
            : {
                actorId: 'SERVER_ONLY_SERVICE_ROLE_ACTOR',
                credentialHandle: 'SERVER_ONLY_SERVICE_ROLE_CREDENTIAL_HANDLE',
                tokenProvenance: 'SERVER_SECRET_STORE_RUNTIME_INJECTION',
              };
      return {
        caseId: `${prefix}_${role}`,
        caseClass: 'GRAPHQL_DISABLED_ENDPOINT_REJECTION',
        role,
        ...provenance,
        sourceTenant: 'NOT_APPLICABLE',
        targetTenant: 'NOT_APPLICABLE',
        tenantDirection: 'NOT_APPLICABLE',
        expectedAuthTokenSource: provenance.tokenProvenance,
        expectedAuthActorId: provenance.actorId,
        authTokenUse: directRoleAuthTokenUse(role, provenance.actorId),
        target: 'graphql_endpoint',
        targetObjectId: 'graphql_endpoint',
        targetObjectKind: 'GRAPHQL_ENDPOINT',
        targetObjectIdentity: 'graphql_endpoint',
        aclInventoryCaseId: 'NOT_APPLICABLE_GRAPHQL_DISABLED',
        operation: 'read',
        ...directRoleHttpBinding(
          'POST',
          '/graphql/v1',
          '{"query":"query PR12DisabledProbe { __typename }"}',
          '{"code":"ENDPOINT_NOT_FOUND"}'
        ),
        expectedHttpStatus: 404,
        expectedSqlExecuted: false,
        expectedSqlstate: 'NOT_EXECUTED',
        expectedRowCount: 0,
        expectedMutationCount: 0,
        expectedAclOutcome: 'NOT_EVALUATED',
        expectedRlsOutcome: 'NOT_EVALUATED',
        expectedEndpointOutcome: 'ENDPOINT_REJECTED',
      };
    });
  }
  const anonIdentity = {
    role: 'anon',
    actorId: 'ANON_PUBLIC_ACTOR',
    credentialHandle: 'ANON_PUBLIC_KEY_HANDLE',
    tokenProvenance: 'ANON_PUBLIC_KEY_NO_USER_SESSION',
    sourceTenant: 'NOT_APPLICABLE',
    targetTenant: 'NOT_APPLICABLE',
    tenantDirection: 'NOT_APPLICABLE',
    expectedAuthTokenSource: 'ANON_PUBLIC_KEY_NO_USER_SESSION',
    expectedAuthActorId: 'ANON_PUBLIC_ACTOR',
    authTokenUse: directRoleAuthTokenUse('anon', 'ANON_PUBLIC_ACTOR'),
  };
  const authenticatedA = {
    role: 'authenticated',
    actorId: 'synthetic_data_api_tenant_a',
    credentialHandle: 'HOSTED_AUTH_SESSION_HANDLE',
    tokenProvenance: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
    expectedAuthTokenSource: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
    expectedAuthActorId: 'synthetic_data_api_tenant_a',
    authTokenUse: directRoleAuthTokenUse(
      'authenticated',
      'synthetic_data_api_tenant_a'
    ),
  };
  const authenticatedB = {
    role: 'authenticated',
    actorId: 'synthetic_data_api_tenant_b',
    credentialHandle: 'HOSTED_AUTH_SESSION_HANDLE',
    tokenProvenance: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
    expectedAuthTokenSource: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
    expectedAuthActorId: 'synthetic_data_api_tenant_b',
    authTokenUse: directRoleAuthTokenUse(
      'authenticated',
      'synthetic_data_api_tenant_b'
    ),
  };
  const serviceRoleIdentity = {
    role: 'service_role',
    actorId: 'SERVER_ONLY_SERVICE_ROLE_ACTOR',
    credentialHandle: 'SERVER_ONLY_SERVICE_ROLE_CREDENTIAL_HANDLE',
    tokenProvenance: 'SERVER_SECRET_STORE_RUNTIME_INJECTION',
    sourceTenant: 'NOT_APPLICABLE',
    targetTenant: 'NOT_APPLICABLE',
    tenantDirection: 'NOT_APPLICABLE',
    expectedAuthTokenSource: 'SERVER_SECRET_STORE_RUNTIME_INJECTION',
    expectedAuthActorId: 'SERVER_ONLY_SERVICE_ROLE_ACTOR',
    authTokenUse: directRoleAuthTokenUse(
      'service_role',
      'SERVER_ONLY_SERVICE_ROLE_ACTOR'
    ),
  };
  const aclDeny = {
    expectedHttpStatus: 403,
    expectedSqlExecuted: true,
    expectedSqlstate: '42501',
    expectedRowCount: 0,
    expectedMutationCount: 0,
    expectedAclOutcome: 'ACL_DENIED',
    expectedRlsOutcome: 'NOT_EVALUATED',
    expectedEndpointOutcome: 'REQUEST_REJECTED',
  };
  const clinicsRelation = {
    target: 'public.clinics',
    targetObjectId: 'relation:public.clinics',
    targetObjectKind: 'RELATION',
  };
  const clinicsColumn = {
    target: 'public.clinics',
    targetObjectId: 'column:public.clinics.id',
    targetObjectKind: 'COLUMN',
  };
  return [
    {
      caseId: 'data_api_anon_relation_deny',
      caseClass: 'DATA_API_ACL_DENY',
      ...anonIdentity,
      ...clinicsRelation,
      targetObjectIdentity: 'public.clinics',
      aclInventoryCaseId: 'acl_relation:public.clinics_SELECT_anon',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinics?select=*&limit=1',
        '',
        '{"code":"42501"}'
      ),
      ...aclDeny,
    },
    {
      caseId: 'data_api_anon_column_deny',
      caseClass: 'DATA_API_ACL_DENY',
      ...anonIdentity,
      ...clinicsColumn,
      targetObjectIdentity: 'public.clinics.id',
      aclInventoryCaseId: 'acl_column:public.clinics.id_SELECT_anon',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinics?select=id&limit=1',
        '',
        '{"code":"42501"}'
      ),
      ...aclDeny,
    },
    {
      caseId: 'data_api_authenticated_relation_deny',
      caseClass: 'DATA_API_ACL_DENY',
      ...authenticatedA,
      sourceTenant: 'tenant_a',
      targetTenant: 'tenant_a',
      tenantDirection: 'A_TO_A',
      target: 'public.clinic_line_credentials',
      targetObjectId: 'relation:public.clinic_line_credentials',
      targetObjectKind: 'RELATION',
      targetObjectIdentity: 'public.clinic_line_credentials',
      aclInventoryCaseId:
        'acl_relation:public.clinic_line_credentials_SELECT_authenticated',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinic_line_credentials?select=*&limit=1',
        '',
        '{"code":"42501"}'
      ),
      ...aclDeny,
    },
    {
      caseId: 'data_api_authenticated_column_deny',
      caseClass: 'DATA_API_ACL_DENY',
      ...authenticatedA,
      sourceTenant: 'tenant_a',
      targetTenant: 'tenant_a',
      tenantDirection: 'A_TO_A',
      target: 'public.clinic_line_credentials',
      targetObjectId:
        'column:public.clinic_line_credentials.encrypted_access_token',
      targetObjectKind: 'COLUMN',
      targetObjectIdentity:
        'public.clinic_line_credentials.encrypted_access_token',
      aclInventoryCaseId:
        'acl_column:public.clinic_line_credentials.encrypted_access_token_SELECT_authenticated',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinic_line_credentials?select=encrypted_access_token&limit=1',
        '',
        '{"code":"42501"}'
      ),
      ...aclDeny,
    },
    {
      caseId: 'data_api_authenticated_a_to_b',
      caseClass: 'DATA_API_RLS_FILTERED',
      ...authenticatedA,
      sourceTenant: 'tenant_a',
      targetTenant: 'tenant_b',
      tenantDirection: 'A_TO_B',
      ...clinicsRelation,
      targetObjectIdentity: 'public.clinics',
      aclInventoryCaseId: 'acl_relation:public.clinics_SELECT_authenticated',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinics?select=*&id=eq.synthetic-clinic-b',
        '',
        '[]'
      ),
      expectedHttpStatus: 200,
      expectedSqlExecuted: true,
      expectedSqlstate: 'NONE',
      expectedRowCount: 0,
      expectedMutationCount: 0,
      expectedAclOutcome: 'ACL_ALLOWED',
      expectedRlsOutcome: 'RLS_FILTERED',
      expectedEndpointOutcome: 'ALLOW',
      tenantProbeControl: tenantProbeControl(
        'public.clinics',
        'tenant_b',
        'A_TO_B',
        'read',
        'authenticated',
        'synthetic_data_api_tenant_a',
        'DATA_API'
      ),
    },
    {
      caseId: 'data_api_authenticated_b_to_a',
      caseClass: 'DATA_API_RLS_FILTERED',
      ...authenticatedB,
      sourceTenant: 'tenant_b',
      targetTenant: 'tenant_a',
      tenantDirection: 'B_TO_A',
      ...clinicsRelation,
      targetObjectIdentity: 'public.clinics',
      aclInventoryCaseId: 'acl_relation:public.clinics_SELECT_authenticated',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinics?select=*&id=eq.synthetic-clinic-a',
        '',
        '[]'
      ),
      expectedHttpStatus: 200,
      expectedSqlExecuted: true,
      expectedSqlstate: 'NONE',
      expectedRowCount: 0,
      expectedMutationCount: 0,
      expectedAclOutcome: 'ACL_ALLOWED',
      expectedRlsOutcome: 'RLS_FILTERED',
      expectedEndpointOutcome: 'ALLOW',
      tenantProbeControl: tenantProbeControl(
        'public.clinics',
        'tenant_a',
        'B_TO_A',
        'read',
        'authenticated',
        'synthetic_data_api_tenant_b',
        'DATA_API'
      ),
    },
    {
      caseId: 'data_api_authenticated_relation_allow',
      caseClass: 'DATA_API_ALLOW',
      ...authenticatedA,
      sourceTenant: 'tenant_a',
      targetTenant: 'tenant_a',
      tenantDirection: 'A_TO_A',
      ...clinicsRelation,
      targetObjectIdentity: 'public.clinics',
      aclInventoryCaseId: 'acl_relation:public.clinics_SELECT_authenticated',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinics?select=*&id=eq.synthetic-clinic-a',
        '',
        '[{"id":"synthetic-clinic-a"}]'
      ),
      expectedHttpStatus: 200,
      expectedSqlExecuted: true,
      expectedSqlstate: 'NONE',
      expectedRowCount: 1,
      expectedMutationCount: 0,
      expectedAclOutcome: 'ACL_ALLOWED',
      expectedRlsOutcome: 'RLS_ROW_ALLOWED',
      expectedEndpointOutcome: 'ALLOW',
      tenantAllowControl: tenantAllowControl('public.clinics', 'tenant_a'),
    },
    {
      caseId: 'data_api_authenticated_column_allow',
      caseClass: 'DATA_API_ALLOW',
      ...authenticatedA,
      sourceTenant: 'tenant_a',
      targetTenant: 'tenant_a',
      tenantDirection: 'A_TO_A',
      ...clinicsColumn,
      targetObjectIdentity: 'public.clinics.id',
      aclInventoryCaseId: 'acl_column:public.clinics.id_SELECT_authenticated',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinics?select=id&id=eq.synthetic-clinic-a',
        '',
        '[{"id":"synthetic-clinic-a"}]'
      ),
      expectedHttpStatus: 200,
      expectedSqlExecuted: true,
      expectedSqlstate: 'NONE',
      expectedRowCount: 1,
      expectedMutationCount: 0,
      expectedAclOutcome: 'ACL_ALLOWED',
      expectedRlsOutcome: 'RLS_ROW_ALLOWED',
      expectedEndpointOutcome: 'ALLOW',
      tenantAllowControl: tenantAllowControl('public.clinics', 'tenant_a'),
    },
    {
      caseId: 'data_api_service_role_rest',
      caseClass: 'DATA_API_ALLOW',
      ...serviceRoleIdentity,
      ...clinicsRelation,
      targetObjectIdentity: 'public.clinics',
      aclInventoryCaseId: 'acl_relation:public.clinics_SELECT_service_role',
      operation: 'read',
      ...directRoleHttpBinding(
        'GET',
        '/rest/v1/clinics?select=id&limit=1',
        '',
        '[{"id":"synthetic-clinic-a"}]'
      ),
      expectedHttpStatus: 200,
      expectedSqlExecuted: true,
      expectedSqlstate: 'NONE',
      expectedRowCount: 1,
      expectedMutationCount: 0,
      expectedAclOutcome: 'ACL_ALLOWED',
      expectedRlsOutcome: 'RLS_BYPASSED_SERVER_ONLY',
      expectedEndpointOutcome: 'ALLOW',
    },
    {
      caseId: 'data_api_service_role_rpc_normalize_customer_phone',
      caseClass: 'DATA_API_RPC_ALLOW',
      ...serviceRoleIdentity,
      target: 'public.normalize_customer_phone(text)',
      targetObjectId: 'function:public.normalize_customer_phone(text)',
      targetObjectKind: 'FUNCTION',
      targetObjectIdentity: 'public.normalize_customer_phone(text)',
      aclInventoryCaseId:
        'acl_function:public.normalize_customer_phone(text)_EXECUTE_service_role',
      operation: 'rpc_read',
      ...directRoleHttpBinding(
        'POST',
        '/rest/v1/rpc/normalize_customer_phone',
        '{"input":"03-1234-5678"}',
        '"0312345678"'
      ),
      expectedHttpStatus: 200,
      expectedSqlExecuted: true,
      expectedSqlstate: 'NONE',
      expectedRowCount: 1,
      expectedMutationCount: 0,
      expectedAclOutcome: 'ACL_ALLOWED',
      expectedRlsOutcome: 'NOT_EVALUATED',
      expectedEndpointOutcome: 'ALLOW',
    },
  ];
}

function directRoleResults(
  rows: readonly Record<string, unknown>[],
  disabled: boolean,
  resultEvidencePath = evidencePath,
  environmentPrefix: 'source' | 'restore' = 'source'
): Record<string, unknown>[] {
  return rows.map(row => ({
    ...row,
    ...(row.tenantProbeControl === undefined
      ? {}
      : {
          tenantProbeControl: materializeTenantProbeControl(
            row.tenantProbeControl,
            environmentPrefix,
            environmentPrefix === 'source'
              ? sourceDataApiGraphQlCompletedAt
              : postRestoreDataApiCompletedAt
          ),
        }),
    authTokenUse: directRoleAuthTokenUse(
      String(row.role),
      String(row.actorId),
      environmentPrefix
    ),
    observedHttpStatus: row.expectedHttpStatus,
    observedSqlExecuted: row.expectedSqlExecuted,
    observedSqlstate: row.expectedSqlstate,
    observedRowCount: row.expectedRowCount,
    observedMutationCount: row.expectedMutationCount,
    observedAclOutcome: row.expectedAclOutcome,
    observedRlsOutcome: row.expectedRlsOutcome,
    observedEndpointOutcome: row.expectedEndpointOutcome,
    observedResponseBodySha256: row.expectedResponseBodySha256,
    aclVerdict:
      disabled || row.expectedAclOutcome === 'NOT_EVALUATED'
        ? 'NOT_APPLICABLE'
        : 'PASS',
    rlsVerdict:
      disabled || row.expectedRlsOutcome === 'NOT_EVALUATED'
        ? 'NOT_APPLICABLE'
        : 'PASS',
    status: 'PASS',
    evidence: [resultEvidencePath],
  }));
}

function replaceEvidencePaths(
  value: unknown,
  resultEvidencePath: string
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => replaceEvidencePaths(item, resultEvidencePath));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      key === 'evidence'
        ? [resultEvidencePath]
        : replaceEvidencePaths(nested, resultEvidencePath),
    ])
  );
}

function metricResults(
  value: unknown,
  resultEvidencePath = evidencePath
): Record<string, unknown>[] {
  return requireArray(value, 'performance gates').map((gateValue, index) => {
    const gate = requireRecord(gateValue, `performance gate ${String(index)}`);
    if (typeof gate.limit !== 'number' || typeof gate.unit !== 'string') {
      throw new TypeError('performance gate limit/unit invalid');
    }
    const samples = [gate.limit * 0.5, gate.limit * 0.6, gate.limit * 0.7];
    return {
      id: gate.id,
      sampleIds: ['pair1_after', 'pair2_after', 'pair3_after'],
      samples,
      median: samples[1],
      limit: gate.limit,
      unit: gate.unit,
      status: 'PASS',
      evidence: [resultEvidencePath],
    };
  });
}

function namedResults(
  value: unknown,
  resultEvidencePath = evidencePath
): Record<string, unknown>[] {
  return requireArray(value, 'named gates').map(id => ({
    id,
    status: 'PASS',
    evidence: [resultEvidencePath],
  }));
}

function buildPassingFixture(
  directory: string,
  options: FixtureOptions = {}
): {
  manifestPath: string;
  manifest: Record<string, unknown>;
} {
  const artifacts: Artifact[] = [];
  const sourceProjectRef = options.sourceProjectRef ?? 'synthetic-project-ref';
  const restoreProjectRef =
    options.restoreProjectRef ?? 'synthetic-restore-ref';
  const head = currentHead();
  const add = (artifact: Artifact): Artifact => {
    artifacts.push(artifact);
    return artifact;
  };
  const generalEvidence = add(
    writeArtifact(directory, evidencePath, 'synthetic qualification evidence\n')
  );
  const machineScan = add(writeArtifact(directory, 'machine-scan.json', ''));
  const machineScanStderr = add(
    writeArtifact(directory, 'machine-scan.stderr.txt', '')
  );
  const stderr = add(writeArtifact(directory, 'stderr.txt', ''));
  const approvalEvidence = add(
    writeArtifact(
      directory,
      'approval-evidence.txt',
      'synthetic owner approval\n'
    )
  );
  const monotonicTimerRunner = add(
    writeArtifact(
      directory,
      'rto-monotonic-timer-runner.mjs',
      '// synthetic owner-approved process.hrtime.bigint timer fixture\n'
    )
  );
  const drPlatformConfigProjectionContract = add(
    writeArtifact(
      directory,
      'dr-platform-config-projection-contract-v1.json',
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/stabilization/evidence/commercial-hardening/pr12/dr-platform-config-projection-contract-v1.json'
        )
      )
    )
  );
  const drPlatformConfigProjectionCollector = add(
    writeArtifact(
      directory,
      'dr-platform-config-projection-collector.mjs',
      '// synthetic owner-approved full-schema projection collector fixture\n'
    )
  );
  const monotonicTimerSession = {
    timerSessionId: '00000000-0000-4000-8000-000000000001',
    runnerInstanceId: '00000000-0000-4000-8000-000000000002',
    clockSource: 'NODE_PROCESS_HRTIME_BIGINT',
    processStartedAt: '2000-01-01T00:01:40Z',
    runner: binding(monotonicTimerRunner),
  };
  const manualPrivacyReviewEvidence = add(
    writeArtifact(directory, 'manual-privacy-review.json', '')
  );
  const governanceProposal = add(
    writeArtifact(
      directory,
      'staging-execution-approval-packet.yaml',
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml'
        )
      )
    )
  );
  const sourceRuntimeIdentity = {
    projectRef: sourceProjectRef,
    projectUrl: `https://${sourceProjectRef}.supabase.co`,
    databaseHost: `db.${sourceProjectRef}.supabase.co`,
    databaseConnectionMode: 'DIRECT',
    databaseUser: 'postgres',
    databaseVersion: '17.4',
    systemIdentifier: 'synthetic-system-id',
  };
  const integrityCollector = add(
    writeArtifact(
      directory,
      'integrity-hash-collector.sql',
      '-- synthetic frozen integrity collector fixture\n'
    )
  );
  const integrityQueries = (relation: string): Record<string, string> => ({
    dataQueryText: `SELECT to_jsonb(t)::text FROM ${relation} AS t ORDER BY t.id ASC NULLS FIRST`,
    schemaQueryText: `SELECT normalized_schema FROM pr12_catalog WHERE relation = '${relation}' ORDER BY ordinal`,
    physicalStructureQueryText: `SELECT normalized_physical_structure FROM pr12_catalog WHERE relation = '${relation}' ORDER BY object_name`,
  });
  const integrityRelations = [
    'public.representative_relation',
    'public.reservations',
  ].map(relation => {
    const queries = integrityQueries(relation);
    return {
      relation,
      primaryKeyColumns: ['id'],
      dataQuerySha256: sha256(queries.dataQueryText),
      schemaQuerySha256: sha256(queries.schemaQueryText),
      physicalStructureQuerySha256: sha256(queries.physicalStructureQueryText),
    };
  });
  const dataIntegrityHashContract = {
    contractId: 'PR12-DATA-INTEGRITY-HASH-V1',
    status: 'OWNER_APPROVED_FOR_EXECUTION',
    transaction: 'REPEATABLE_READ_READ_ONLY',
    hashAlgorithm: 'SHA-256',
    relationSet: 'EXACT_KEYS_OF_ALL_ROW_COUNTS',
    relationOrder: 'UTF8_BYTEWISE_ASCENDING_QUALIFIED_RELATION',
    primaryKeyOrder: 'ASC_NULLS_FIRST_IN_DECLARED_PRIMARY_KEY_COLUMN_ORDER',
    missingPrimaryKeyPolicy: 'ABORT',
    collectorPath: integrityCollector.path,
    collectorSha256: integrityCollector.sha256,
    relations: integrityRelations,
    rowProjection: 'FULL_ROW_TO_JSONB_INCLUDING_PUBLIC_RESERVATIONS_UPDATED_AT',
    rowEncoding: 'UTF8_BYTE_LENGTH_COLON_JSONB_TEXT_LF',
    queryEvidence:
      'OWNER_FROZEN_LITERAL_SQL_AND_UTF8_SHA256_PER_RELATION_REQUIRED',
    perRelationDigest: 'SHA256_OF_CONCATENATED_ROW_ENCODINGS',
    aggregateEncoding:
      'UTF8 <relation> TAB <rowCount> TAB <querySha256> TAB <digestSha256> LF in relationOrder',
    aggregateDataHash: 'SHA256_OF_AGGREGATE_ENCODING',
    schemaProjection:
      'NORMALIZED_COLUMN_CONSTRAINT_POLICY_TRIGGER_HELPER_FK_ACL_CATALOG_V1',
    aggregateSchemaHash: 'SHA256_OF_AGGREGATE_ENCODING',
    physicalStructureProjection:
      'RELATION_AND_INDEX_NAMES_RELKIND_PERSISTENCE_ACCESS_METHOD_NORMALIZED_INDEX_DEFINITION_UNIQUE_PRIMARY_EXCLUSION_PREDICATE_VALID_READY_LIVE_ONLY',
    excludedVolatilePhysicalFields: [
      'oid',
      'relfilenode',
      'bytes',
      'pages',
      'tuples',
      'statistics',
    ],
    aggregateEnvironmentPhysicalStructureHash: 'SHA256_OF_AGGREGATE_ENCODING',
    rawRowsPersisted: false,
    watermarkColumn: 'public.reservations.updated_at',
    watermarkColumnIncluded: true,
  };
  const representativeDataValue = {
    schemaVersion: 1,
    classification: 'SYNTHETIC',
    volume: 'small_test_fixture',
    sourceSha256: '1'.repeat(64),
    expiresAt: futureTimestamp,
    explicitPersistentRowTargets: {
      combinedSubtotal: 1,
      byRelation: { 'public.representative_relation': 1 },
    },
    derivedRows: { exactCount: 1, byRelation: { 'public.reservations': 1 } },
    dataIntegrityHashContract,
  };
  const representativeDataContract = add(
    writeJsonArtifact(
      directory,
      'representative-data-contract.json',
      representativeDataValue
    )
  );
  const migrationContractValue = requireRecord(
    JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json'
        ),
        'utf8'
      )
    ),
    'migration contract'
  );
  const orderedMigrations = fs
    .readdirSync(path.join(repoRoot, 'supabase/migrations'), {
      withFileTypes: true,
    })
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const nonMigrationInputs = requireRecord(
    migrationContractValue.nonMigrationInputs,
    'migration contract non-migration inputs'
  );
  const generatedTypesInput = requireRecord(
    nonMigrationInputs.generatedTypes,
    'migration contract generated types'
  );
  const generatedTypesSha256 = requireRecord(
    generatedTypesInput,
    'generated types input'
  ).sha256;
  const sourceExplicitRowCounts = { 'public.representative_relation': 1 };
  const sourceDerivedRowCounts = { 'public.reservations': 1 };
  const sourceRowCounts = {
    ...sourceExplicitRowCounts,
    ...sourceDerivedRowCounts,
  };
  const buildRelationDigests = (
    reservationDataDigest: string
  ): Record<string, unknown>[] =>
    integrityRelations.map((relationContract, index) => {
      const queries = integrityQueries(relationContract.relation);
      return {
        relation: relationContract.relation,
        rowCount: sourceRowCounts[relationContract.relation] ?? 0,
        primaryKeyColumns: relationContract.primaryKeyColumns,
        dataQueryText: queries.dataQueryText,
        dataQuerySha256: relationContract.dataQuerySha256,
        dataDigestSha256:
          relationContract.relation === 'public.reservations'
            ? reservationDataDigest
            : '8'.repeat(64),
        schemaQueryText: queries.schemaQueryText,
        schemaQuerySha256: relationContract.schemaQuerySha256,
        schemaDigestSha256: index === 0 ? 'b'.repeat(64) : 'c'.repeat(64),
        physicalStructureQueryText: queries.physicalStructureQueryText,
        physicalStructureQuerySha256:
          relationContract.physicalStructureQuerySha256,
        physicalStructureDigestSha256:
          index === 0 ? 'd'.repeat(64) : 'e'.repeat(64),
      };
    });
  const aggregateIntegrityHash = (
    rows: Record<string, unknown>[],
    queryField: string,
    digestField: string
  ): string =>
    sha256(
      rows
        .map(
          row =>
            `${String(row.relation)}\t${String(row.rowCount)}\t${String(row[queryField])}\t${String(row[digestField])}\n`
        )
        .join('')
    );
  const sourceRelationDigests = buildRelationDigests('9'.repeat(64));
  const sourceHashes = {
    logicalHash: logicalBaselineHash,
    historicalNormalizedPhysicalHash: physicalBaselineHash,
    environmentPhysicalStructureHash: aggregateIntegrityHash(
      sourceRelationDigests,
      'physicalStructureQuerySha256',
      'physicalStructureDigestSha256'
    ),
    schemaHash: aggregateIntegrityHash(
      sourceRelationDigests,
      'schemaQuerySha256',
      'schemaDigestSha256'
    ),
    dataHash: aggregateIntegrityHash(
      sourceRelationDigests,
      'dataQuerySha256',
      'dataDigestSha256'
    ),
  };
  const sourceIntegrityResultPath = 'source-integrity-result.json';
  const sourceIntegrityPayload = {
    explicitRowCounts: sourceExplicitRowCounts,
    derivedRowCounts: sourceDerivedRowCounts,
    allRowCounts: sourceRowCounts,
    ...sourceHashes,
    hashContractId: dataIntegrityHashContract.contractId,
    hashContractPath: representativeDataContract.path,
    hashContractSha256: representativeDataContract.sha256,
    relationDigests: sourceRelationDigests,
  };
  const sourceIntegrityResult = add(
    writeJsonArtifact(directory, sourceIntegrityResultPath, {
      schemaVersion: 1,
      resultType: 'SOURCE_DATA_INTEGRITY',
      status: 'PASS',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      ...sourceIntegrityPayload,
      migrationHead: migrationContractValue.migrationHead,
      orderedMigrations,
      generatedTypesSha256,
      commandId: 'PR12-CMD-009',
      capturedAt: sourceIntegrityCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'SOURCE_DATA_INTEGRITY',
      transport: 'DIRECT_POSTGRES',
      observationCount: 1,
      observations: [
        {
          observationId: 'PR12-CMD-009-001',
          observationType: 'SOURCE_ROW_AND_HASH_SNAPSHOT',
          observedAt: sourceIntegrityCompletedAt,
          payload: sourceIntegrityPayload,
        },
      ],
      evidence: [sourceIntegrityResultPath],
    })
  );
  const postWatermarkRelationDigests = buildRelationDigests('a'.repeat(64));
  const postWatermarkSourceIntegrity = {
    schemaVersion: 1,
    resultType: 'POST_WATERMARK_SOURCE_DATA_INTEGRITY',
    status: 'PASS',
    capturedAt: syntheticWatermark,
    runtimeIdentity: sourceRuntimeIdentity,
    explicitRowCounts: sourceExplicitRowCounts,
    derivedRowCounts: sourceDerivedRowCounts,
    allRowCounts: sourceRowCounts,
    logicalHash: sourceHashes.logicalHash,
    historicalNormalizedPhysicalHash:
      sourceHashes.historicalNormalizedPhysicalHash,
    environmentPhysicalStructureHash:
      sourceHashes.environmentPhysicalStructureHash,
    schemaHash: sourceHashes.schemaHash,
    dataHash: aggregateIntegrityHash(
      postWatermarkRelationDigests,
      'dataQuerySha256',
      'dataDigestSha256'
    ),
    hashContractId: dataIntegrityHashContract.contractId,
    hashContractPath: representativeDataContract.path,
    hashContractSha256: representativeDataContract.sha256,
    relationDigests: postWatermarkRelationDigests,
    migrationHead: migrationContractValue.migrationHead,
    orderedMigrations,
    generatedTypesSha256,
  };
  const backupWatermarkOperation = add(
    writeJsonArtifact(directory, 'backup-watermark-operation.json', {
      schemaVersion: 1,
      resultType: 'BACKUP_WATERMARK_OPERATION',
      status: 'COMPLETED',
      commandId: 'PR12-CMD-017',
      sourceProjectRef,
      watermark: syntheticWatermark,
      target: {
        relation: 'public.reservations',
        primaryKey: '00000000-0000-0000-0000-00000000f005',
        timestampColumn: 'updated_at',
      },
      candidateSql:
        "update public.reservations set updated_at = clock_timestamp() where id = '00000000-0000-0000-0000-00000000f005';",
      beforeValue: '1999-12-01T00:00:00Z',
      afterValue: syntheticWatermark,
      beforeObservedAt: '2000-01-01T00:00:23Z',
      afterObservedAt: syntheticWatermark,
      affectedRows: 1,
      baselineSourceIntegrity: binding(sourceIntegrityResult),
      postWatermarkSourceIntegrity,
    })
  );
  const backupProviderInventory = add(
    writeJsonArtifact(directory, 'backup-provider-inventory.raw.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_BACKUP_INVENTORY_RAW_EVIDENCE',
      status: 'CAPTURED',
      commandId: 'PR12-CMD-017A',
      projectRef: sourceProjectRef,
      observedAt: options.backupProviderObservedAt ?? '2000-01-01T00:01:15Z',
      runtimeIdentity: sourceRuntimeIdentity,
      request: {
        method: 'GET',
        url:
          options.backupProviderEndpoint ??
          `https://api.supabase.com/v1/projects/${sourceProjectRef}/database/backups`,
        oauthScope: 'database:read',
        requiredPermission: 'backups_read',
        body: null,
        authorizationHeaderCaptured: false,
      },
      response: {
        status: options.backupProviderStatus ?? 200,
        body: {
          region: 'ap-northeast-1',
          walg_enabled: true,
          pitr_enabled: false,
          backups: [
            ...(options.backupProviderAdditionalEarlierEligible === true
              ? [
                  {
                    id: 'earlier-eligible-backup-id',
                    is_physical_backup: true,
                    status: 'COMPLETED',
                    inserted_at: '2000-01-01T00:00:45Z',
                  },
                ]
              : []),
            {
              id: 'synthetic-backup-id',
              is_physical_backup: true,
              status: 'COMPLETED',
              inserted_at: backupProviderInsertedAt,
            },
          ],
          physical_backup_data: {
            earliest_physical_backup_date_unix: 946684800,
            latest_physical_backup_date_unix: 946684860,
          },
        },
      },
      secretValuesCaptured: false,
    })
  );
  const backupArtifact = add(
    writeJsonArtifact(directory, 'backup-metadata.json', {
      schemaVersion: 1,
      resultType: 'SUPABASE_PHYSICAL_BACKUP_METADATA',
      status: 'COMPLETED',
      commandId: 'PR12-CMD-017A',
      capturedAt: backupInventoryCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      backupId: 'synthetic-backup-id',
      backupType: 'PHYSICAL',
      providerStatus: 'COMPLETED',
      sourceProjectRef,
      region: 'ap-northeast-1',
      pitrEnabled: false,
      providerInsertedAt: backupProviderInsertedAt,
      selectionRule:
        'FIRST_COMPLETED_PHYSICAL_BACKUP_INSERTED_AT_OR_AFTER_POST_WATERMARK_BASELINE',
      providerInventory: binding(backupProviderInventory),
      watermarkEligibility: {
        operation: binding(backupWatermarkOperation),
        postWatermarkSourceIntegrity: binding(backupWatermarkOperation),
        watermarkValue: syntheticWatermark,
        temporalEligible: true,
        inclusionStatus: 'PROVEN_ONLY_AFTER_RESTORE',
      },
    })
  );
  const mirroredConfiguration = {
    region: 'ap-northeast-1',
    computeAddonVariant: 'ci_large',
    diskAttributes: {
      volumeType: 'gp3',
      sizeGb: 32,
      iops: 3000,
      throughputMbps: 125,
    },
    sslEnforcement: true,
    networkRestrictions: {
      mode: 'APPROVED_CIDR_ALLOWLIST',
      cidrSetSha256: sha256('synthetic-approved-cidr-set'),
    },
  };
  const buildMirroredConfigurationRaw = (
    projectRef: string,
    commandId: string,
    observedAt: string
  ): Record<string, unknown> => ({
    schemaVersion: 1,
    resultType: 'PROJECT_MIRRORED_CONFIGURATION_RAW',
    projectRef,
    commandId,
    projectResponse: {
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${projectRef}`,
      },
      response: { status: 200, body: { region: mirroredConfiguration.region } },
    },
    computeResponse: {
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${projectRef}/billing/addons`,
      },
      response: {
        status: 200,
        body: {
          selected_addons: [
            {
              variant: mirroredConfiguration.computeAddonVariant,
              status: 'ACTIVE',
            },
          ],
        },
      },
    },
    dashboardSettingsExport: {
      captureMethod: 'SUPABASE_DASHBOARD_SETTINGS_EXPORT',
      diskAttributes: mirroredConfiguration.diskAttributes,
      sslEnforcement: mirroredConfiguration.sslEnforcement,
      networkRestrictions: mirroredConfiguration.networkRestrictions,
    },
    observedAt,
  });
  const sourceMirroredConfigurationRaw = add(
    writeJsonArtifact(
      directory,
      'source-mirrored-configuration-raw.json',
      buildMirroredConfigurationRaw(
        sourceProjectRef,
        'PR12-CMD-017A',
        backupInventoryCompletedAt
      )
    )
  );
  const restoreMirroredConfigurationRaw = add(
    writeJsonArtifact(
      directory,
      'restore-mirrored-configuration-raw.json',
      buildMirroredConfigurationRaw(
        restoreProjectRef,
        'PR12-ACTION-017',
        '2000-01-01T00:02:06Z'
      )
    )
  );
  const sourceMirroredConfiguration = add(
    writeJsonArtifact(directory, 'source-mirrored-configuration.json', {
      schemaVersion: 1,
      resultType: 'PROJECT_MIRRORED_CONFIGURATION_SNAPSHOT',
      status: 'CAPTURED',
      projectRef: sourceProjectRef,
      commandId: 'PR12-CMD-017A',
      observedAt: backupInventoryCompletedAt,
      rawArtifact: binding(sourceMirroredConfigurationRaw),
      configuration: mirroredConfiguration,
    })
  );
  const restoreMirroredConfiguration = add(
    writeJsonArtifact(directory, 'restore-mirrored-configuration.json', {
      schemaVersion: 1,
      resultType: 'PROJECT_MIRRORED_CONFIGURATION_SNAPSHOT',
      status: 'CAPTURED',
      projectRef: restoreProjectRef,
      commandId: 'PR12-ACTION-017',
      observedAt: '2000-01-01T00:02:06Z',
      rawArtifact: binding(restoreMirroredConfigurationRaw),
      configuration: mirroredConfiguration,
    })
  );
  const preActionInventoryObservedAt =
    options.preActionInventoryObservedAt ?? '2000-01-01T00:01:25.500Z';
  const preActionProjectRows = [
    {
      ref: sourceProjectRef,
      name: 'seikotsuin-pr12-isolated-qualification-20260719',
    },
    ...(options.preActionInventoryIncludesRequestedTarget === true
      ? [
          {
            ref: restoreProjectRef,
            name: 'seikotsuin-pr12-isolated-restore-20260719',
          },
        ]
      : []),
  ];
  const restorePreActionInventory = add(
    writeJsonArtifact(directory, 'restore-pre-action-project-inventory.json', {
      schemaVersion: 1,
      resultType: 'RESTORE_PRE_ACTION_PROJECT_INVENTORY',
      organizationId: 'synthetic-organization-id',
      observedAt: preActionInventoryObservedAt,
      request: {
        method: 'GET',
        url: 'https://api.supabase.com/v1/projects',
      },
      response: {
        status: 200,
        body: preActionProjectRows,
      },
    })
  );
  const restoreQuoteRaw = add(
    writeJsonArtifact(directory, 'restore-dashboard-quote.json', {
      schemaVersion: 1,
      resultType: 'RESTORE_DASHBOARD_COST_QUOTE',
      status: 'CAPTURED',
      sourceProjectRef,
      backupId: 'synthetic-backup-id',
      currency: 'USD',
      cadence: 'RESTORE_PROJECT_CREATION_ESTIMATE',
      lineItems: [
        { id: 'compute_large', amountUsd: 20 },
        { id: 'mirrored_disk', amountUsd: 20 },
      ],
      normalizedTotalUsd: 40,
      observedAt: '2000-01-01T00:01:26Z',
    })
  );
  const restoreDashboardActionRaw = add(
    writeJsonArtifact(directory, 'restore-dashboard-action.json', {
      schemaVersion: 1,
      resultType: 'RESTORE_TO_NEW_PROJECT_DASHBOARD_ACTION',
      method: 'SUPABASE_DASHBOARD_RESTORE_TO_NEW_PROJECT',
      sourceProjectRef,
      backupId: 'synthetic-backup-id',
      requestedProjectName: 'seikotsuin-pr12-isolated-restore-20260719',
      actionStartedAt: restoreActionStartedAt,
      restoreConfirmationAt,
      providerOperationIdentifierAvailability:
        'NOT_EXPOSED_BY_DOCUMENTED_RESTORE_TO_NEW_PROJECT_FLOW',
      providerOperationIdentifier: null,
    })
  );
  const restoreProjectProviderRaw = add(
    writeJsonArtifact(directory, 'restore-provider-project.json', {
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${restoreProjectRef}`,
      },
      response: {
        status: 200,
        body: {
          ref: restoreProjectRef,
          organization_id: 'synthetic-organization-id',
          name: 'seikotsuin-pr12-isolated-restore-20260719',
          region: 'ap-northeast-1',
          status: 'ACTIVE_HEALTHY',
          created_at: restoreProviderCreatedAt,
          database: {
            host: `db.${restoreProjectRef}.supabase.co`,
            version: '17.4',
          },
        },
      },
      observedAt: '2000-01-01T00:02:02Z',
    })
  );
  const restoreComputeProviderRaw = add(
    writeJsonArtifact(directory, 'restore-provider-compute.json', {
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${restoreProjectRef}/billing/addons`,
      },
      response: {
        status: 200,
        body: {
          selected_addons: [
            {
              type: 'compute_instance',
              variant: {
                id: 'ci_large',
                name: 'Large',
                price: {
                  description: 'Large compute',
                  type: 'fixed',
                  interval: 'hourly',
                  amount: 0.1517,
                },
              },
            },
          ],
          available_addons: [],
        },
      },
      observedAt: '2000-01-01T00:02:04Z',
    })
  );
  const restoreProviderExport = add(
    writeJsonArtifact(directory, 'restore-provider-export.json', {
      schemaVersion: 1,
      exportType: 'SUPABASE_RESTORE_PROJECT_PROVIDER_EXPORT',
      status: 'CAPTURED',
      provider: 'SUPABASE_DASHBOARD_AND_MANAGEMENT_API',
      captureMethod:
        'HASH_BOUND_DASHBOARD_ACTION_AND_PROVIDER_READ_ONLY_OBSERVATIONS',
      actionId: 'PR12-ACTION-017',
      selectedBackup: {
        sourceProjectRef,
        backupId: 'synthetic-backup-id',
        backupMetadataPath: backupArtifact.path,
        backupMetadataSha256: backupArtifact.sha256,
        backupInventoryRawPath: backupProviderInventory.path,
        backupInventoryRawSha256: backupProviderInventory.sha256,
        watermarkValue: syntheticWatermark,
      },
      preActionProjectInventory: {
        observedAt: preActionInventoryObservedAt,
        rawArtifact: binding(restorePreActionInventory),
      },
      dashboardActionEvidence: {
        method: 'SUPABASE_DASHBOARD_RESTORE_TO_NEW_PROJECT',
        sourceProjectRef,
        backupId: 'synthetic-backup-id',
        requestedProjectName: 'seikotsuin-pr12-isolated-restore-20260719',
        actionStartedAt: restoreActionStartedAt,
        restoreConfirmationAt,
        rawArtifact: binding(restoreDashboardActionRaw),
      },
      providerOperationIdentifier: {
        availability: 'NOT_EXPOSED_BY_DOCUMENTED_RESTORE_TO_NEW_PROJECT_FLOW',
        value: null,
        rawArtifact: binding(restoreDashboardActionRaw),
      },
      projectObservation: {
        httpMethod: 'GET',
        endpoint: `https://api.supabase.com/v1/projects/${restoreProjectRef}`,
        httpStatus: 200,
        projectRef: restoreProjectRef,
        organizationId: 'synthetic-organization-id',
        projectName: 'seikotsuin-pr12-isolated-restore-20260719',
        region: 'ap-northeast-1',
        status: 'ACTIVE_HEALTHY',
        providerCreatedAt: restoreProviderCreatedAt,
        databaseHost: `db.${restoreProjectRef}.supabase.co`,
        databaseVersion: '17.4',
        observedAt: '2000-01-01T00:02:02Z',
        rawArtifact: binding(restoreProjectProviderRaw),
      },
      computeObservation: {
        httpMethod: 'GET',
        endpoint: `https://api.supabase.com/v1/projects/${restoreProjectRef}/billing/addons`,
        httpStatus: 200,
        projectRef: restoreProjectRef,
        variantId: 'ci_large',
        observedAt: '2000-01-01T00:02:04Z',
        rawArtifact: binding(restoreComputeProviderRaw),
      },
      sourceMirroredConfiguration: binding(sourceMirroredConfiguration),
      restoreMirroredConfiguration: binding(restoreMirroredConfiguration),
      mirrorComparison: {
        region: 'PASS',
        compute: 'PASS',
        diskAttributes: 'PASS',
        sslEnforcement: 'PASS',
        networkRestrictions: 'PASS',
        status: 'PASS',
      },
      costQuote: {
        sourceProjectRef,
        backupId: 'synthetic-backup-id',
        currency: 'USD',
        cadence: 'RESTORE_PROJECT_CREATION_ESTIMATE',
        lineItems: [
          { id: 'compute_large', amountUsd: 20 },
          { id: 'mirrored_disk', amountUsd: 20 },
        ],
        normalizedTotalUsd: 40,
        observedAt: '2000-01-01T00:01:26Z',
        acceptedAt: '2000-01-01T00:01:29Z',
        acceptedBy: 'synthetic_approver',
        rawArtifact: binding(restoreQuoteRaw),
      },
      rawProviderArtifacts: [
        binding(restorePreActionInventory),
        binding(restoreQuoteRaw),
        binding(restoreDashboardActionRaw),
        binding(restoreProjectProviderRaw),
        binding(restoreComputeProviderRaw),
        binding(sourceMirroredConfigurationRaw),
        binding(restoreMirroredConfigurationRaw),
      ],
      capturedAt: restoreProviderCapturedAt,
      capturedBy: 'synthetic_dr_operator',
    })
  );
  const restoreCreationOperation = add(
    writeJsonArtifact(directory, 'restore-creation-operation.json', {
      schemaVersion: 1,
      resultType: 'RESTORE_PROJECT_CREATION_OPERATION',
      status: 'COMPLETED',
      commandId: 'PR12-ACTION-017',
      sourceProjectRef,
      backupId: 'synthetic-backup-id',
      sourceWatermark: syntheticWatermark,
      providerOperationIdentifierAvailability:
        'NOT_EXPOSED_BY_DOCUMENTED_RESTORE_TO_NEW_PROJECT_FLOW',
      providerEvidence: binding(restoreProviderExport),
      actionStartedAt: restoreActionStartedAt,
      createdProjectRef: restoreProjectRef,
      createdProjectName: 'seikotsuin-pr12-isolated-restore-20260719',
      createdProjectRegion: 'ap-northeast-1',
      createdProjectDatabaseTier: 'LARGE',
      createdProjectDatabaseVersion: '17.4',
      createdProjectUrl: `https://${restoreProjectRef}.supabase.co`,
      createdProjectDatabaseHost: `db.${restoreProjectRef}.supabase.co`,
      createdProjectDatabaseConnectionMode: 'DIRECT',
      createdProjectDatabaseUser: 'postgres',
      providerCreatedAt: restoreProviderCreatedAt,
      restoreReadyObservedAt,
      sourceDatabaseUtcAtActionStart: restoreActionStartedAt,
      operatorUtcAtActionStart: restoreActionStartedAt,
      sourceDatabaseUtcAtRpoObservation: rpoObservedAt,
      operatorUtcAtRpoObservation: restoreConfirmationAt,
      monotonicTimer: {
        ...monotonicTimerSession,
        startNanoseconds: '1000000000',
      },
      rpoObservedAt,
      restoreConfirmationAt,
      providerCapturedAt: restoreProviderCapturedAt,
    })
  );
  const securityCatalogRelations = [
    'public.blocks',
    'public.legacy_quarantine',
    'public.representative_relation',
    'public.reservations',
    'public.service_queue',
    'public.shared_master',
  ];
  const sourceSecurityTargetCatalog = add(
    writeJsonArtifact(directory, 'source-security-target-catalog.json', {
      schemaVersion: 1,
      resultType: 'SECURITY_TARGET_CATALOG',
      status: 'CAPTURED',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      migrationHead,
      commandId: 'PR12-CMD-007A',
      capturedAt: postReplayCatalogCapturedAt,
      scope: {
        schemas: ['public'],
        relkinds: ['r', 'p'],
        requiredAuthTargets: ['auth.identities', 'auth.users'],
      },
      relations: securityCatalogRelations.map(relation => ({
        relation,
        relkind: 'r',
        owner: 'postgres',
        rlsEnabled: true,
        rlsForced: false,
      })),
    })
  );
  const securityTargetClassification = add(
    writeJsonArtifact(directory, 'security-target-classification.json', {
      schemaVersion: 1,
      classificationId: 'SECURITY-TARGET-CLASSIFICATION-TEST',
      status: 'APPROVED_FOR_EXECUTION',
      relations: [
        {
          relation: 'public.blocks',
          classification: 'A_TENANT_CANONICAL',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: true,
          coverageFamilies: ['TENANT_CRUD_MATRIX', 'PUBLIC_SURFACE_SPECIAL'],
        },
        {
          relation: 'public.representative_relation',
          classification: 'A_TENANT_CANONICAL',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: false,
          coverageFamilies: ['TENANT_CRUD_MATRIX'],
        },
        {
          relation: 'public.reservations',
          classification: 'A_TENANT_CANONICAL',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: false,
          coverageFamilies: ['TENANT_CRUD_MATRIX'],
        },
        {
          relation: 'public.service_queue',
          classification: 'B_SERVICE_ROLE_ONLY',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: false,
          coverageFamilies: ['DATA_API_ACL_SERVICE_ROLE'],
        },
        {
          relation: 'public.shared_master',
          classification: 'C_SHARED_MASTER_READ_ONLY',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: false,
          coverageFamilies: ['DATA_API_READ_ONLY'],
        },
        {
          relation: 'public.legacy_quarantine',
          classification: 'E_LEGACY_QUARANTINE',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: false,
          coverageFamilies: ['LEGACY_QUARANTINE'],
        },
        {
          relation: 'auth.identities',
          classification: 'AUTH_PLATFORM_MANAGED',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: false,
          coverageFamilies: ['AUTH_JWT_MATRIX'],
        },
        {
          relation: 'auth.users',
          classification: 'AUTH_PLATFORM_MANAGED',
          reviewStatus: 'OWNER_APPROVED',
          publicSurfaceSpecial: false,
          coverageFamilies: ['AUTH_JWT_MATRIX'],
        },
      ],
      coverageTargets: {
        TENANT_CRUD_MATRIX: [
          'public.blocks',
          'public.representative_relation',
          'public.reservations',
        ],
        DATA_API_ACL_SERVICE_ROLE: ['public.service_queue'],
        DATA_API_READ_ONLY: ['public.shared_master'],
        LEGACY_QUARANTINE: ['public.legacy_quarantine'],
        AUTH_JWT_MATRIX: ['auth.identities', 'auth.users'],
        PUBLIC_SURFACE_SPECIAL: ['public.blocks'],
      },
    })
  );
  const securityTargetInventory = add(
    writeJsonArtifact(directory, 'security-target-inventory.json', {
      schemaVersion: 1,
      inventoryId: 'SECURITY-TARGET-INVENTORY-TEST',
      status: 'APPROVED_FOR_EXECUTION',
      sourceCatalog: binding(sourceSecurityTargetCatalog),
      representativeDataContract: binding(representativeDataContract),
      canonicalProbeRelations: ['public.blocks'],
      relations: [...securityCatalogRelations, 'auth.identities', 'auth.users'],
      classificationContract: binding(securityTargetClassification),
    })
  );
  const securityRows = [
    ...securityTargets.flatMap(target =>
      applicationRoles.flatMap(role =>
        tenantDirections.flatMap(direction =>
          tenantCrudCases.map(operation =>
            securityExpectedRow(
              `cross_${target}_${direction}_${role}_${operation}`,
              role,
              'valid_jwt',
              operation,
              target,
              direction
            )
          )
        )
      )
    ),
    ...requiredJwtCases
      .filter(
        jwtCase =>
          ![
            'missing_resource',
            'null_resource',
            'parent_rehome',
            'resource_delete_cascade',
            'clinic_delete_cascade',
          ].includes(jwtCase)
      )
      .map(jwtCase =>
        securityExpectedRow(`auth_${jwtCase}`, 'authenticated', jwtCase, 'read')
      ),
    relationalSecurityExpectedRow('missing_resource'),
    relationalSecurityExpectedRow('null_resource'),
    relationalSecurityExpectedRow('parent_rehome'),
    relationalSecurityExpectedRow('resource_delete_cascade'),
    relationalSecurityExpectedRow('clinic_delete_cascade'),
    securityExpectedRow('direct_anon', 'anon', 'empty_jwt', 'read'),
    securityExpectedRow(
      'direct_service_role',
      'service_role',
      'service_role_server_only',
      'read'
    ),
  ];
  const securityContract = add(
    writeJsonArtifact(directory, 'security-matrix.json', {
      schemaVersion: 1,
      matrixId: 'SECURITY-MATRIX-TEST',
      roles: requiredRoles,
      jwtCases: ['valid_jwt', 'service_role_server_only', ...requiredJwtCases],
      tenantCrudCases,
      targets: securityTargets,
      tenantDirections,
      targetInventory: binding(securityTargetInventory),
      authTokenProvenancePolicy: {
        collectorStatus: 'IMPLEMENTED',
        acquisitionMethod: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
        requiredGrantTypes: ['password', 'refresh_token'],
        actorSet: hostedAuthActorSet,
        actorSetSha256: hostedAuthActorSetSha256,
        rawTokenMaterialEvidenceAllowed: false,
        jwtSigningSecretAcquisitionAllowed: false,
        fabricatedUserJwtAllowed: false,
      },
      rows: securityRows,
    })
  );

  const dataApiRows = directRoleContractRows('data_api');
  const dataApiConfiguration = {
    enabled: true,
    exposedSchemas: ['public'],
    automaticGrants: 'disabled',
    defaultPrivileges: { postgres: 'captured', supabaseAdmin: 'captured' },
  };
  const aclRoles = ['anon', 'authenticated', 'service_role'];
  const relationPrivileges = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN',
  ];
  const dataApiAclPrivilegeUniverse = {
    ACL_SCHEMA: ['USAGE', 'CREATE'],
    ACL_RELATION: relationPrivileges,
    ACL_COLUMN: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
    ACL_SEQUENCE: ['SELECT', 'UPDATE', 'USAGE'],
    ACL_FUNCTION: ['EXECUTE'],
    ACL_DEFAULT_TABLES: relationPrivileges,
    ACL_DEFAULT_SEQUENCES: ['SELECT', 'UPDATE', 'USAGE'],
    ACL_DEFAULT_FUNCTIONS: ['EXECUTE'],
    ACL_DEFAULT_TYPES: ['USAGE'],
    ACL_DEFAULT_SCHEMAS: ['USAGE', 'CREATE'],
  };
  const defaultPrivilegeSetIds = {
    TABLES: 'ACL_DEFAULT_TABLES',
    SEQUENCES: 'ACL_DEFAULT_SEQUENCES',
    FUNCTIONS: 'ACL_DEFAULT_FUNCTIONS',
    TYPES: 'ACL_DEFAULT_TYPES',
    SCHEMAS: 'ACL_DEFAULT_SCHEMAS',
  } as const;
  const dataApiAclObjects = [
    {
      objectId: 'schema:public',
      objectKind: 'SCHEMA',
      objectIdentity: 'public',
      privilegeSetId: 'ACL_SCHEMA',
      applicablePrivileges: ['USAGE', 'CREATE'],
    },
    ...securityCatalogRelations.map(relation => ({
      objectId: `relation:${relation}`,
      objectKind: 'RELATION',
      objectIdentity: relation,
      privilegeSetId: 'ACL_RELATION',
      applicablePrivileges: relationPrivileges,
    })),
    ...['public.clinics', 'public.clinic_line_credentials'].map(relation => ({
      objectId: `relation:${relation}`,
      objectKind: 'RELATION',
      objectIdentity: relation,
      privilegeSetId: 'ACL_RELATION',
      applicablePrivileges: relationPrivileges,
    })),
    {
      objectId: 'column:public.representative_relation.id',
      objectKind: 'COLUMN',
      objectIdentity: 'public.representative_relation.id',
      privilegeSetId: 'ACL_COLUMN',
      applicablePrivileges: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
    },
    {
      objectId: 'column:public.clinics.id',
      objectKind: 'COLUMN',
      objectIdentity: 'public.clinics.id',
      privilegeSetId: 'ACL_COLUMN',
      applicablePrivileges: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
    },
    {
      objectId: 'column:public.clinic_line_credentials.encrypted_access_token',
      objectKind: 'COLUMN',
      objectIdentity: 'public.clinic_line_credentials.encrypted_access_token',
      privilegeSetId: 'ACL_COLUMN',
      applicablePrivileges: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
    },
    {
      objectId: 'sequence:public.representative_relation_id_seq',
      objectKind: 'SEQUENCE',
      objectIdentity: 'public.representative_relation_id_seq',
      privilegeSetId: 'ACL_SEQUENCE',
      applicablePrivileges: ['SELECT', 'UPDATE', 'USAGE'],
    },
    {
      objectId: 'function:public.representative_function()',
      objectKind: 'FUNCTION',
      objectIdentity: 'public.representative_function()',
      privilegeSetId: 'ACL_FUNCTION',
      applicablePrivileges: ['EXECUTE'],
    },
    {
      objectId: 'function:public.normalize_customer_phone(text)',
      objectKind: 'FUNCTION',
      objectIdentity: 'public.normalize_customer_phone(text)',
      privilegeSetId: 'ACL_FUNCTION',
      applicablePrivileges: ['EXECUTE'],
    },
    ...['postgres', 'supabase_admin'].flatMap(owner =>
      (
        Object.keys(defaultPrivilegeSetIds) as Array<
          keyof typeof defaultPrivilegeSetIds
        >
      ).flatMap(objectType => {
        const scopes =
          objectType === 'SCHEMAS' ? ['GLOBAL'] : ['GLOBAL', 'public'];
        const privilegeSetId = defaultPrivilegeSetIds[objectType];
        return scopes.map(scopeName => ({
          objectId: `default:${owner}:${scopeName}:${objectType}`,
          objectKind: 'DEFAULT_PRIVILEGE',
          objectIdentity: `${owner}:${scopeName}:${objectType}`,
          privilegeSetId,
          applicablePrivileges: dataApiAclPrivilegeUniverse[privilegeSetId],
        }));
      })
    ),
  ];
  const sourceDataApiAclCatalog = add(
    writeJsonArtifact(directory, 'source-data-api-acl-catalog.json', {
      schemaVersion: 1,
      resultType: 'DATA_API_ACL_OBJECT_CATALOG',
      status: 'CAPTURED',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      migrationHead,
      commandId: 'PR12-CMD-007A',
      capturedAt: postReplayCatalogCapturedAt,
      exposedSchemas: dataApiConfiguration.exposedSchemas,
      roles: aclRoles,
      scope: {
        source: 'POST_REPLAY_PG_CATALOG',
        schemasFromProjectSettings: true,
        relationRelkinds: ['r', 'p', 'v', 'm', 'f'],
        sequenceRelkind: 'S',
        columnsIncluded: true,
        functionIdentityArgumentsIncluded: true,
        defaultPrivilegeOwners: ['postgres', 'supabase_admin'],
        defaultPrivilegeObjectTypes: [
          'TABLES',
          'SEQUENCES',
          'FUNCTIONS',
          'TYPES',
          'SCHEMAS',
        ],
      },
      objects: dataApiAclObjects,
    })
  );
  const postReplayCatalogCaptureEnvelope = add(
    writeJsonArtifact(directory, 'post-replay-catalog-capture.json', {
      schemaVersion: 1,
      resultType: 'POST_REPLAY_CATALOG_CAPTURE',
      status: 'CAPTURED',
      commandId: 'PR12-CMD-007A',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      migrationHead,
      capturedAt: postReplayCatalogCapturedAt,
      securityTargetCatalog: binding(sourceSecurityTargetCatalog),
      dataApiAclCatalog: binding(sourceDataApiAclCatalog),
      dataApiProvisioning: {
        enabled: true,
        exposedSchemas: ['public'],
        automaticallyExposeNewTablesAndFunctions: false,
      },
      graphQlProvisioning: {
        pgGraphqlEnabled: false,
        introspectionEnabled: false,
        exposedSchemas: [],
      },
    })
  );
  const dataApiAclRows = dataApiAclObjects.flatMap(object =>
    object.applicablePrivileges.flatMap(privilege =>
      aclRoles.map(role => {
        const expectedDirectGrant =
          role === 'service_role' ||
          (role === 'authenticated' &&
            ((object.objectKind === 'SCHEMA' && privilege === 'USAGE') ||
              (privilege === 'SELECT' &&
                [
                  'public.representative_relation',
                  'public.shared_master',
                  'public.representative_relation.id',
                  'public.clinics',
                  'public.clinics.id',
                ].includes(object.objectIdentity))));
        const expectedPublicGrant =
          object.objectIdentity === 'public.normalize_customer_phone(text)' &&
          privilege === 'EXECUTE';
        const expectedInheritedGrant = false;
        const expectedGranted =
          expectedDirectGrant || expectedPublicGrant || expectedInheritedGrant;
        return {
          caseId: `acl_${object.objectId}_${privilege}_${role}`,
          objectId: object.objectId,
          objectKind: object.objectKind,
          objectIdentity: object.objectIdentity,
          role,
          privilege,
          expectedDirectGrant,
          expectedPublicGrant,
          expectedInheritedGrant,
          expectedGranted,
          expectedSqlstate: 'NONE',
          expectedAclOutcome: expectedGranted ? 'ACL_ALLOWED' : 'ACL_DENIED',
        };
      })
    )
  );
  const dataApiContract = add(
    writeJsonArtifact(directory, 'data-api-matrix.json', {
      schemaVersion: 1,
      matrixId: 'DATA-API-MATRIX-TEST',
      configuration: dataApiConfiguration,
      rows: dataApiRows,
      aclInventory: {
        sourceCatalog: binding(sourceDataApiAclCatalog),
        roles: aclRoles,
        requiredObjectKinds: [
          'SCHEMA',
          'RELATION',
          'COLUMN',
          'SEQUENCE',
          'FUNCTION',
          'DEFAULT_PRIVILEGE',
        ],
        privilegeUniverse: dataApiAclPrivilegeUniverse,
        cases: dataApiAclRows,
      },
    })
  );
  const dataApiCaseIds = dataApiRows.map(row => String(row.caseId));
  const dataApiAclCaseIds = dataApiAclRows.map(row => String(row.caseId));
  const dataApiSchemaCaseIds = dataApiAclRows
    .filter(row => row.objectKind === 'SCHEMA')
    .map(row => String(row.caseId));
  const graphQlRows = directRoleContractRows('graphql');
  const graphQlConfiguration = {
    installedVersion: 'test-version',
    enabled: false,
    exposedSchemas: [],
    introspection: 'disabled',
  };
  const graphQlContract = add(
    writeJsonArtifact(directory, 'graphql-matrix.json', {
      schemaVersion: 1,
      matrixId: 'GRAPHQL-MATRIX-TEST',
      configuration: graphQlConfiguration,
      rows: graphQlRows,
    })
  );
  const graphQlCaseIds = graphQlRows.map(row => String(row.caseId));

  const frozenPerformanceBytes = fs.readFileSync(
    path.join(
      repoRoot,
      'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json'
    )
  );
  const performanceContract = add(
    writeArtifact(
      directory,
      'frozen-performance-contract.json',
      frozenPerformanceBytes
    )
  );
  const parsedFrozenPerformance: unknown = JSON.parse(
    frozenPerformanceBytes.toString('utf8')
  );
  const frozenPerformance = requireRecord(
    parsedFrozenPerformance,
    'frozen performance contract'
  );
  const hostedThresholds = {
    p95Ms: 100,
    p99Ms: 150,
    minimumThroughputPerSecond: 10,
    maximumUnexpectedFailedRequests: 0,
    maximum5xxRate: 0.01,
    maximumTimeoutRate: 0.01,
    maximumCpuPercent: 80,
    minimumPoolHeadroomPercent: 20,
    maximumLockWaitMs: 100,
    maximumWalBytes: 1000000,
    maximumMigrationDurationSeconds: 600,
  };
  const hostedContractValue = {
    schemaVersion: 1,
    workloadId: 'HOSTED-SLO-TEST',
    concurrency: 2,
    sampleOrder: ['sample_1', 'sample_2', 'sample_3'],
    durationSeconds: 6,
    thresholds: hostedThresholds,
    scoredSamples: [
      { id: 'sample_1', order: 1, durationSeconds: 2, concurrency: 2 },
      { id: 'sample_2', order: 2, durationSeconds: 2, concurrency: 2 },
      { id: 'sample_3', order: 3, durationSeconds: 2, concurrency: 2 },
    ],
    databaseAbortThresholds: {
      cpuWindowSeconds: 300,
      poolWindowSeconds: 120,
      walScope: 'cumulative_delta_across_all_three_scored_samples',
    },
    monitoring: {
      cpuAndPoolSamplingSeconds: 60,
      lockSamplingSeconds: 5,
      walSampling: 'boundary_snapshots_plus_cumulative_delta',
    },
  };
  const hostedContract = add(
    writeJsonArtifact(
      directory,
      'hosted-slo-contract.json',
      hostedContractValue
    )
  );
  const authProvisioning = {
    anonymousSignInEnabled: false,
    realEmailSmsOrOAuthDeliveryConfigured: false,
    hostedFixturePasswords:
      'owner_secret_store_generated_ephemeral_minimum_32_characters',
    hostedUserJwtAcquisitionMethod: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
    jwtSigningSecretAcquisitionAllowed: false,
    fabricatedUserJwtAllowed: false,
    tokenValueCaptureAllowed: false,
  };
  const environment = {
    organizationId: 'synthetic-organization-id',
    organizationPlan: 'PRO',
    projectRef: sourceProjectRef,
    projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
    projectUrl: `https://${sourceProjectRef}.supabase.co`,
    databaseHost: `db.${sourceProjectRef}.supabase.co`,
    databaseConnectionMode: 'DIRECT',
    databaseUser: 'postgres',
    region: 'ap-northeast-1',
    databaseTier: 'LARGE',
    databaseVersion: '17.4',
    systemIdentifier: 'synthetic-system-id',
    authProvisioning,
    dataApi: {
      enabled: dataApiConfiguration.enabled,
      matrixId: 'DATA-API-MATRIX-TEST',
      matrixPath: dataApiContract.path,
      matrixSha256: dataApiContract.sha256,
      aclCatalogPath: sourceDataApiAclCatalog.path,
      aclCatalogSha256: sourceDataApiAclCatalog.sha256,
      exposedSchemas: dataApiConfiguration.exposedSchemas,
      automaticGrants: dataApiConfiguration.automaticGrants,
      defaultPrivileges: dataApiConfiguration.defaultPrivileges,
      schemaUsage: {
        status: 'PASS',
        coveredCaseIds: dataApiSchemaCaseIds,
        evidence: [evidencePath],
      },
      objectAcl: {
        status: 'PASS',
        coveredCaseIds: dataApiAclCaseIds,
        evidence: [evidencePath],
      },
      aclInventoryResults: dataApiAclRows.map(row => ({
        ...row,
        observedDirectGrant: row.expectedDirectGrant,
        observedPublicGrant: row.expectedPublicGrant,
        observedInheritedGrant: row.expectedInheritedGrant,
        observedGranted: row.expectedGranted,
        observedSqlstate: row.expectedSqlstate,
        observedAclOutcome: row.expectedAclOutcome,
        status: 'PASS',
        evidence: [evidencePath],
      })),
      directRoleResults: directRoleResults(dataApiRows, false),
      aclVerdict: {
        status: 'PASS',
        coveredCaseIds: [...dataApiCaseIds, ...dataApiAclCaseIds],
        evidence: [evidencePath],
      },
      rlsVerdict: {
        status: 'PASS',
        coveredCaseIds: dataApiCaseIds,
        evidence: [evidencePath],
      },
    },
    graphQl: {
      installedVersion: graphQlConfiguration.installedVersion,
      enabled: graphQlConfiguration.enabled,
      matrixId: 'GRAPHQL-MATRIX-TEST',
      matrixPath: graphQlContract.path,
      matrixSha256: graphQlContract.sha256,
      exposedSchemas: graphQlConfiguration.exposedSchemas,
      introspection: graphQlConfiguration.introspection,
      directRoleResults: directRoleResults(graphQlRows, true),
      tenantBoundary: {
        status: 'NOT_APPLICABLE',
        coveredCaseIds: [],
        evidence: [evidencePath],
      },
      fieldVisibility: {
        status: 'NOT_APPLICABLE',
        coveredCaseIds: [],
        evidence: [evidencePath],
      },
      disabledEndpointRejection: {
        status: 'PASS',
        coveredCaseIds: graphQlCaseIds,
        evidence: [evidencePath],
      },
    },
  };
  const restoreEnvironment = {
    organizationId: environment.organizationId,
    projectRef: restoreProjectRef,
    projectName: 'seikotsuin-pr12-isolated-restore-20260719',
    region: environment.region,
    databaseTier: environment.databaseTier,
    databaseVersion: environment.databaseVersion,
    systemIdentifier:
      options.restoreSystemIdentifier ?? 'synthetic-restore-system-id',
    projectUrl: `https://${restoreProjectRef}.supabase.co`,
    databaseHost: `db.${restoreProjectRef}.supabase.co`,
    databaseConnectionMode: 'DIRECT',
    databaseUser: 'postgres',
  };
  const buildCredentialProviderConfiguration = (
    targetKind: 'SOURCE' | 'RESTORE',
    targetEnvironment: Record<string, unknown>,
    capturedAt: string
  ): Record<string, unknown> => {
    const marker = targetKind.toLowerCase();
    const anonKeyPresent =
      targetKind === 'SOURCE' ? (options.sourceAnonKeyPresent ?? true) : true;
    const anonKeyFingerprint =
      targetKind === 'SOURCE' &&
      options.sourceAnonKeyFingerprintFromEmptyValue === true
        ? sha256('')
        : sha256(`${marker}-anon-key`);
    return {
      schemaVersion: 1,
      resultType: 'TARGET_CREDENTIAL_PROVIDER_CONFIGURATION',
      status: 'CAPTURED',
      targetKind,
      secretStoreProvider:
        targetKind === 'RESTORE'
          ? (options.restoreCredentialProviderName ??
            'synthetic_owner_secret_store')
          : 'synthetic_owner_secret_store',
      targetIdentity: {
        projectRef: targetEnvironment.projectRef,
        projectUrl: targetEnvironment.projectUrl,
        databaseHost: targetEnvironment.databaseHost,
      },
      nonSecretFingerprints: {
        projectRefSha256: sha256(String(targetEnvironment.projectRef)),
        projectUrlSha256: sha256(String(targetEnvironment.projectUrl)),
        databaseHostSha256: sha256(String(targetEnvironment.databaseHost)),
        anonKeySha256: anonKeyFingerprint,
        serviceRoleKeySha256: sha256(`${marker}-service-role-key`),
        databasePasswordHandleSha256: sha256(
          `${marker}-database-password-handle`
        ),
        actorPasswordMapHandleSha256: sha256(
          'approved-restored-auth-password-map-handle'
        ),
      },
      keyPresenceCollector: {
        collectorId: 'PR12-TARGET-CREDENTIAL-PRESENCE-V1',
        method: 'TARGET_PREFIXED_PROCESS_ENVIRONMENT_NON_EMPTY_SHA256',
        status: 'PASS',
        anonKeyEnvironmentVariable: `PR12_${targetKind}_ANON_KEY`,
        serviceRoleKeyEnvironmentVariable: `PR12_${targetKind}_SERVICE_ROLE_KEY`,
        anonKeyPresent,
        serviceRoleKeyPresent: true,
        fingerprintsComputedFromSameRuntimeValues: true,
        emptyStringFingerprintRejected: true,
        rawValuesPersisted: false,
      },
      parentEnvironmentPrefix: `PR12_${targetKind}_`,
      ownerApprovedFingerprintCapture: true,
      secretValuesCaptured: false,
      crossTargetFallbackAllowed: false,
      capturedAt,
      capturedBy: 'synthetic_credential_owner',
    };
  };
  const sourceCredentialProviderConfiguration = add(
    writeJsonArtifact(
      directory,
      'source-credential-provider-configuration.json',
      buildCredentialProviderConfiguration(
        'SOURCE',
        environment,
        '1999-12-31T23:58:50Z'
      )
    )
  );
  const restoreCredentialProviderConfiguration = add(
    writeJsonArtifact(
      directory,
      'restore-credential-provider-configuration.json',
      buildCredentialProviderConfiguration(
        'RESTORE',
        restoreEnvironment,
        '2000-01-01T00:02:20Z'
      )
    )
  );
  const restoreRuntimeIdentity = {
    projectRef: restoreEnvironment.projectRef,
    projectUrl: restoreEnvironment.projectUrl,
    databaseHost: restoreEnvironment.databaseHost,
    databaseConnectionMode: restoreEnvironment.databaseConnectionMode,
    databaseUser: restoreEnvironment.databaseUser,
    databaseVersion: restoreEnvironment.databaseVersion,
    systemIdentifier: restoreEnvironment.systemIdentifier,
  };
  const serviceRoleScanDomains = [
    'BROWSER_BUILD',
    'CLIENT_RESPONSE',
    'APPLICATION_LOG',
    'COMMAND_STREAM_AND_EVIDENCE',
  ] as const;
  const buildServiceRoleNonExposureEvidence = (
    targetKind: 'SOURCE' | 'RESTORE',
    projectRef: string,
    commandId: string,
    capturedAt: string,
    runtimeIdentity: Record<string, unknown>,
    serviceRoleValue: string,
    coveredCaseBindings: Record<string, unknown>[],
    domainArtifacts: Record<(typeof serviceRoleScanDomains)[number], Artifact[]>
  ): Artifact => {
    const marker = targetKind.toLowerCase();
    const domains = serviceRoleScanDomains.map(domain => {
      const domainMarker = domain.toLowerCase().replaceAll('_', '-');
      const scannedArtifacts = domainArtifacts[domain];
      if (scannedArtifacts.length === 0) {
        throw new Error(`missing service-role scan artifacts for ${domain}`);
      }
      const files = scannedArtifacts.map(scannedArtifact => {
        const scannedBytes = fs.readFileSync(
          path.join(directory, scannedArtifact.path)
        );
        return {
          path: scannedArtifact.path,
          sha256: scannedArtifact.sha256,
          bytes: scannedArtifact.bytes,
          provenance: `${domain}_COMMAND_SCOPED_CAPTURE`,
          exactMatchCount: scannedBytes.includes(serviceRoleValue) ? 1 : 0,
        };
      });
      const exactMatchCount = files.reduce(
        (sum, file) => sum + file.exactMatchCount,
        0
      );
      const inventoryValue = {
        schemaVersion: 1,
        resultType: 'SERVICE_ROLE_SCAN_INVENTORY',
        status: 'CAPTURED',
        targetKind,
        environmentProjectRef: projectRef,
        gitCommit: head,
        commandId,
        capturedAt,
        runtimeIdentity,
        domain,
        files: files.map(file => ({
          path: file.path,
          sha256: file.sha256,
          bytes: file.bytes,
          provenance: file.provenance,
        })),
        fileCount: files.length,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      };
      const inventory = add(
        writeJsonArtifact(
          directory,
          `${marker}-service-role-${domainMarker}-inventory.json`,
          inventoryValue
        )
      );
      return {
        domain,
        inventoryPath: inventory.path,
        inventorySha256: inventory.sha256,
        fileCount: files.length,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        exactMatchCount,
        patternFindingCount: 0,
      };
    });
    return add(
      writeJsonArtifact(
        directory,
        `${marker}-service-role-non-exposure-report.json`,
        {
          schemaVersion: 1,
          resultType: 'SERVICE_ROLE_NON_EXPOSURE_SCAN',
          status: 'PASS',
          targetKind,
          environmentProjectRef: projectRef,
          gitCommit: head,
          commandId,
          capturedAt,
          runtimeIdentity,
          credentialFingerprintSha256: sha256(serviceRoleValue),
          scanMethod: 'IN_MEMORY_EXACT_VALUE_AND_PATTERN_SCAN',
          exactValueLoadedOnlyInMemory: true,
          rawCredentialPersisted: false,
          coveredCaseBindings,
          scannedFileCount: domains.reduce(
            (sum, domain) => sum + domain.fileCount,
            0
          ),
          scannedByteCount: domains.reduce(
            (sum, domain) => sum + domain.totalBytes,
            0
          ),
          domains,
        }
      )
    );
  };
  const drScopeProjectionSchemas = {
    auth: {
      schemaName: 'AuthConfigResponse',
      propertyCount: 237,
      schemaPropertyNamesSha256:
        '0b0e65320da7a2289eac69c65b5cda3de793dc9f1c53927c04d12a357c13b9f8',
      sanitizedCanonicalSha256: sha256('auth-sanitized-projection'),
      sensitiveConfiguredPresenceSha256: sha256(
        'auth-sensitive-configured-presence'
      ),
    },
    realtime: {
      schemaName: 'RealtimeConfigResponse',
      propertyCount: 11,
      schemaPropertyNamesSha256:
        '09a565f576fa42a04652d68d307fa5cd1edb69a42f24fe51d34c96176741532e',
      sanitizedCanonicalSha256: sha256('realtime-sanitized-projection'),
      sensitiveConfiguredPresenceSha256: sha256(
        'realtime-sensitive-configured-presence'
      ),
    },
    storage: {
      schemaName: 'StorageConfigResponse',
      propertyCount: 6,
      schemaPropertyNamesSha256:
        '9239cf272f3a3e92e55a9e9d5ef0ed7e1a4e56e7dc76ee5a00a8c0942f97bf80',
      sanitizedCanonicalSha256: sha256('storage-sanitized-projection'),
      sensitiveConfiguredPresenceSha256: sha256(
        'storage-sensitive-configured-presence'
      ),
    },
  };
  const drScopeProjectionContractValue = requireRecord(
    JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/stabilization/evidence/commercial-hardening/pr12/dr-platform-config-projection-contract-v1.json'
        ),
        'utf8'
      )
    ),
    'DR scope projection contract'
  );
  const drScopeInventoryCollectors = requireRecord(
    drScopeProjectionContractValue.inventoryCollectors,
    'DR scope inventory collectors'
  );
  const drScopeDatabaseCatalogContract = requireRecord(
    drScopeInventoryCollectors.databaseCatalog,
    'DR scope database catalog contract'
  );
  const drScopeDatabaseQueries = requireArray(
    drScopeDatabaseCatalogContract.queries,
    'DR scope database queries'
  ).map((value, index) =>
    requireRecord(value, `DR scope database query ${String(index)}`)
  );
  const drScopeDatabaseFacts = {
    storageBucketRowCount: 0,
    storageObjectMetadataRowCount: 0,
    customRolesRequiringPasswords: [],
    extensionCatalog: ['pg_graphql:NOT_INSTALLED'],
    normalizedDatabaseSettings: ['search_path:DEFAULT'],
    realtimePublicationTables: ['public.chat_messages', 'public.notifications'],
  };
  const buildDrScopeInventory = (
    targetKind: 'SOURCE' | 'RESTORE',
    projectRef: string,
    commandId: string,
    observedAt: string,
    runtimeIdentity: Record<string, unknown>,
    credentialProviderConfiguration: Artifact
  ): Record<string, unknown> => {
    const listObservation = (endpoint: string): Record<string, unknown> => ({
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${projectRef}/${endpoint}`,
        authorizationHeaderCaptured: false,
      },
      responseStatus: 200,
      collector: binding(drPlatformConfigProjectionCollector),
      canonicalResponseSha256: canonicalJsonSha256([]),
      items: [],
      rawResponsePersisted: true,
      secretValuesCaptured: false,
    });
    const configObservation = (
      schema: keyof typeof drScopeProjectionSchemas,
      endpoint: string
    ): Record<string, unknown> => ({
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${projectRef}/${endpoint}`,
        authorizationHeaderCaptured: false,
      },
      responseStatus: 200,
      projectionContract: binding(drPlatformConfigProjectionContract),
      collector: binding(drPlatformConfigProjectionCollector),
      ...drScopeProjectionSchemas[schema],
      unknownFields: [],
      rawResponsePersisted: false,
    });
    const databaseCatalog = {
      collector: binding(drPlatformConfigProjectionCollector),
      querySetId: drScopeDatabaseCatalogContract.querySetId,
      querySetSha256: canonicalJsonSha256(drScopeDatabaseQueries),
      queryEvidence: drScopeDatabaseQueries.map(query => ({
        queryId: query.id,
        querySha256: sha256(String(query.sql)),
        observedAt,
      })),
      observedAt,
      ...drScopeDatabaseFacts,
      normalizedCatalogSha256: canonicalJsonSha256(drScopeDatabaseFacts),
      rawQueryOutputPersisted: false,
      secretValuesCaptured: false,
    };
    return {
      schemaVersion: 1,
      resultType: 'DR_EXCLUDED_MANUAL_SCOPE_RAW_EVIDENCE',
      status: 'CAPTURED',
      targetKind,
      projectRef,
      commandId,
      observedAt,
      runtimeIdentity,
      managementApi: {
        storageBuckets: listObservation('storage/buckets'),
        edgeFunctions: listObservation('functions'),
        authConfig: configObservation('auth', 'config/auth'),
        realtimeConfig: configObservation('realtime', 'config/realtime'),
        storageConfig: configObservation('storage', 'config/storage'),
      },
      dashboardExport: {
        captureMethod: 'SUPABASE_DASHBOARD_SETTINGS_EXPORT',
        pageId: 'DATABASE_READ_REPLICAS',
        collector: binding(drPlatformConfigProjectionCollector),
        readReplicaRefs: [],
        observedAt,
        snapshotCanonicalSha256: canonicalJsonSha256({
          readReplicaRefs: [],
        }),
        rawSnapshotPersisted: false,
        secretValuesCaptured: false,
      },
      databaseCatalog,
      credentialProviderConfiguration: binding(credentialProviderConfiguration),
      credentialValuesCaptured: false,
      secretValuesCaptured: false,
    };
  };
  const sourceDrScopeInventory = add(
    writeJsonArtifact(
      directory,
      'source-dr-excluded-manual-scope.raw.json',
      buildDrScopeInventory(
        'SOURCE',
        sourceProjectRef,
        'PR12-CMD-016A',
        sourceSideEffectsCompletedAt,
        sourceRuntimeIdentity,
        sourceCredentialProviderConfiguration
      )
    )
  );
  const restoreDrScopeInventory = add(
    writeJsonArtifact(
      directory,
      'restore-dr-excluded-manual-scope.raw.json',
      buildDrScopeInventory(
        'RESTORE',
        restoreProjectRef,
        'PR12-CMD-019A',
        postRestoreSideEffectsCompletedAt,
        restoreRuntimeIdentity,
        restoreCredentialProviderConfiguration
      )
    )
  );
  const drScopeComparison = add(
    writeJsonArtifact(directory, 'dr-excluded-manual-scope-comparison.json', {
      schemaVersion: 1,
      resultType: 'DR_EXCLUDED_MANUAL_SCOPE_COMPARISON',
      status: 'PASS',
      commandId: 'PR12-CMD-019F',
      capturedAt: postRestoreCompletedAt,
      source: binding(sourceDrScopeInventory),
      restore: binding(restoreDrScopeInventory),
      assertions: {
        storageBucketsAndObjectsZero: true,
        edgeFunctionsAbsent: true,
        readReplicasAbsent: true,
        noCustomRolePasswordDependency: true,
        authSettingsParity: true,
        realtimeSettingsParity: true,
        storageSettingsParity: true,
        extensionCatalogParity: true,
        databaseSettingsParity: true,
        realtimePublicationParity: true,
        targetSpecificApiKeysPresentWithoutValueCapture: true,
      },
      secretValuesCaptured: false,
    })
  );
  const restoreIdentityClockOperation = add(
    writeJsonArtifact(directory, 'restore-identity-clock-operation.json', {
      schemaVersion: 1,
      resultType: 'RESTORE_IDENTITY_CLOCK_OPERATION',
      status: 'CAPTURED',
      commandId: 'PR12-CMD-018',
      capturedAt: restoreIdentityClockCompletedAt,
      restoreDatabaseUtc: '2000-01-01T00:02:45Z',
      relationshipToSource:
        options.restoreRelationshipToSource ??
        (restoreEnvironment.systemIdentifier ===
        sourceRuntimeIdentity.systemIdentifier
          ? 'SAME'
          : 'DIFFERENT'),
      runtimeIdentity: restoreRuntimeIdentity,
    })
  );
  const sourcePlatformDataApiResult = {
    enabled: true,
    serviceHealthy: true,
    directEndpointReachable: true,
    exposedSchemas: ['public'],
    automaticallyExposeNewTablesAndFunctions: false,
  };
  const sourcePlatformAuthResult = {
    anonymousSignInEnabled: false,
    emailProviderConfigured: false,
    smsProviderConfigured: false,
    oauthProvidersEnabled: [],
    realEmailSmsOrOAuthDeliveryConfigured: false,
  };
  const sourcePlatformGraphQlResult = {
    installedVersion: null,
    enabled: false,
    configuredApiSchemas: ['public'],
    exposedSchemas: [],
    introspectionEnabled: false,
  };
  const authProviderEnabled = {
    external_apple_enabled: false,
    external_azure_enabled: false,
    external_bitbucket_enabled: false,
    external_discord_enabled: false,
    external_facebook_enabled: false,
    external_figma_enabled: false,
    external_github_enabled: false,
    external_gitlab_enabled: false,
    external_google_enabled: false,
    external_kakao_enabled: false,
    external_keycloak_enabled: false,
    external_linkedin_oidc_enabled: false,
    external_notion_enabled: false,
    external_slack_enabled: false,
    external_slack_oidc_enabled: false,
    external_spotify_enabled: false,
    external_twitch_enabled: false,
    external_twitter_enabled: false,
    external_web3_ethereum_enabled: false,
    external_web3_solana_enabled: false,
    external_workos_enabled: false,
    external_x_enabled: false,
    external_zoom_enabled: false,
  };
  const sourceDataApiDashboardCapture = add(
    writeJsonArtifact(
      directory,
      'source-data-api-dashboard-settings-capture.json',
      {
        captureMethod: 'OWNER_READ_ONLY_BROWSER_ACCESSIBILITY_SNAPSHOT',
        projectRef: environment.projectRef,
        capturedAt: '1999-12-31T23:59:36.050Z',
        pageId: 'DATA_API_SETTINGS',
        controlLabel: 'Enable Data API',
        controlState: 'ENABLED',
        secretValuesCaptured: false,
      }
    )
  );
  const sourcePlatformDataApiRaw = add(
    writeJsonArtifact(directory, 'source-platform-data-api-raw.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_PLATFORM_CONFIGURATION_RAW_EVIDENCE',
      status: 'CAPTURED',
      observationFamily: 'DATA_API',
      transport:
        'SUPABASE_MANAGEMENT_API_POSTGREST_CONFIGURATION_AND_DIRECT_POSTGRES_DEFAULT_ACL',
      commandId: 'PR12-CMD-004A',
      projectRef: environment.projectRef,
      observedAt: '1999-12-31T23:59:36.100Z',
      secretValuesCaptured: false,
      requestOrQuery: {
        method: 'GET_AND_DIRECT_POSTGRES',
        endpointOrQueryId: 'PR12-SOURCE-DATA-API-CONFIGURATION-V1',
        requestOrQuerySha256: sha256(
          `SUPABASE_DASHBOARD_DATA_API_SETTINGS_ACCESSIBILITY_CAPTURE; GET /v1/projects/{ref}/postgrest; GET /v1/projects/{ref}/health?services=rest&timeout_ms=2000; GET /rest/v1/ direct endpoint smoke; DIRECT_POSTGRES ${dataApiDefaultPrivilegeQuery}`
        ),
        responseStatus: 'MANAGEMENT_HTTP_200_AND_SQL_COMMAND_OK',
      },
      providerPayload: {
        configuredState: {
          source: 'SUPABASE_DASHBOARD_DATA_API_SETTINGS_ACCESSIBILITY_CAPTURE',
          status: 'CAPTURED',
          rawArtifact: binding(sourceDataApiDashboardCapture),
          secretFieldsRetained: false,
        },
        postgrestConfiguration: {
          operationId: 'v1-get-postgrest-service-config',
          httpStatus: 200,
          dbSchema: 'public',
          dbExtraSearchPath: 'public,extensions',
          maxRows: 1000,
          dbPool: null,
          dbPoolAcquisitionTimeout: null,
          secretFieldsRetained: false,
        },
        restHealth: {
          operationId: 'v1-get-services-health',
          httpStatus: 200,
          serviceName: 'rest',
          status: 'ACTIVE_HEALTHY',
        },
        directRestSmoke: {
          endpointPath: '/rest/v1/',
          role: 'service_role',
          queryText: 'GET /rest/v1/',
          querySha256: sha256('GET /rest/v1/'),
          httpStatus: 200,
          contentType: 'application/openapi+json',
          sanitizedResponse: {
            documentKind: 'OPENAPI',
            version: '3.0.0',
            pathCount: 0,
          },
          sanitizedBodySha256: sha256(
            JSON.stringify({
              documentKind: 'OPENAPI',
              version: '3.0.0',
              pathCount: 0,
            })
          ),
        },
        defaultPrivilegeExposure: {
          queryId: 'PR12-DATA-API-DEFAULT-PRIVILEGES-V2',
          queryText: dataApiDefaultPrivilegeQuery,
          querySha256: sha256(dataApiDefaultPrivilegeQuery),
          commandStatus: 'COMMAND_OK',
          rowCount: dataApiDefaultPrivilegeRows.length,
          rowsSha256: sha256(JSON.stringify(dataApiDefaultPrivilegeRows)),
          rows: dataApiDefaultPrivilegeRows,
        },
      },
    })
  );
  const sourcePlatformAuthRaw = add(
    writeJsonArtifact(directory, 'source-platform-auth-raw.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_PLATFORM_CONFIGURATION_RAW_EVIDENCE',
      status: 'CAPTURED',
      observationFamily: 'AUTH',
      transport: 'SUPABASE_MANAGEMENT_API_AUTH_CONFIGURATION',
      commandId: 'PR12-CMD-004A',
      projectRef: environment.projectRef,
      observedAt: '1999-12-31T23:59:36.200Z',
      secretValuesCaptured: false,
      requestOrQuery: {
        method: 'GET',
        endpointOrQueryId: 'v1-get-auth-service-config',
        requestOrQuerySha256: sha256('GET /v1/projects/{ref}/config/auth'),
        responseStatus: 'HTTP_200',
      },
      providerPayload: {
        operationId: 'v1-get-auth-service-config',
        httpStatus: 200,
        core: {
          disable_signup: false,
          external_anonymous_users_enabled: false,
          external_email_enabled: false,
          external_phone_enabled: false,
          jwt_exp: 3600,
          mailer_autoconfirm: false,
          sms_autoconfirm: false,
          refresh_token_rotation_enabled: true,
        },
        providerEnabled: authProviderEnabled,
        safeProjectionVersion: 'PR12-AUTH-SAFE-PROJECTION-V2',
        inspectedDeliveryFields: authSafeProjectionFields,
        inspectedFieldSetSha256: sha256(
          JSON.stringify(authSafeProjectionFields)
        ),
        fieldPresence: Object.fromEntries(
          authSafeProjectionFields.map(field => [field, false])
        ),
        secretFieldsRetained: false,
      },
    })
  );
  const sourcePlatformGraphQlRaw = add(
    writeJsonArtifact(directory, 'source-platform-graphql-raw.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_PLATFORM_CONFIGURATION_RAW_EVIDENCE',
      status: 'CAPTURED',
      observationFamily: 'GRAPHQL',
      transport:
        'SUPABASE_MANAGEMENT_API_AND_DIRECT_POSTGRES_GRAPHQL_CONFIGURATION',
      commandId: 'PR12-CMD-004A',
      projectRef: environment.projectRef,
      observedAt: '1999-12-31T23:59:36.300Z',
      secretValuesCaptured: false,
      requestOrQuery: {
        method: 'DIRECT_POSTGRES_AND_HTTPS_POST',
        endpointOrQueryId: 'PR12-SOURCE-GRAPHQL-CONFIGURATION-V1',
        requestOrQuerySha256: sha256(
          `DIRECT_POSTGRES ${graphQlExtensionQuery}; DIRECT_POSTGRES ${graphQlExposureQuery}; POST /graphql/v1 endpoint and introspection probes`
        ),
        responseStatus: 'SQL_COMMAND_OK_AND_HTTP_CAPTURED',
      },
      providerPayload: {
        extensionCatalog: {
          queryId: 'PR12-PG-AVAILABLE-EXTENSIONS-PG-GRAPHQL-V1',
          queryText: graphQlExtensionQuery,
          querySha256: sha256(graphQlExtensionQuery),
          commandStatus: 'COMMAND_OK',
          rows: [
            {
              extensionName: 'pg_graphql',
              availableVersion: 'test-default-version',
              installedVersion: null,
            },
          ],
        },
        exposureCatalog: {
          queryId: 'PR12-GRAPHQL-EXPOSURE-CATALOG-V1',
          queryText: graphQlExposureQuery,
          querySha256: sha256(graphQlExposureQuery),
          commandStatus: 'COMMAND_OK',
          dbSchema: 'public',
          dbExtraSearchPath: 'public,extensions',
        },
        endpointProbe: {
          endpointPath: '/graphql/v1',
          role: 'anon',
          queryText: 'query PR12EndpointProbe { __typename }',
          querySha256: sha256('query PR12EndpointProbe { __typename }'),
          httpStatus: 404,
          sanitizedResponse: {
            data: null,
            errors: [{ message: 'GraphQL endpoint rejected' }],
          },
          sanitizedResponseSha256: sha256(
            JSON.stringify({
              data: null,
              errors: [{ message: 'GraphQL endpoint rejected' }],
            })
          ),
        },
        introspectionProbe: {
          endpointPath: '/graphql/v1',
          role: 'anon',
          queryText:
            'query PR12IntrospectionProbe { __schema { queryType { name } } }',
          querySha256: sha256(
            'query PR12IntrospectionProbe { __schema { queryType { name } } }'
          ),
          httpStatus: 400,
          sanitizedResponse: {
            data: null,
            errors: [{ message: 'Unknown field "__schema" on type Query' }],
          },
          sanitizedResponseSha256: sha256(
            JSON.stringify({
              data: null,
              errors: [{ message: 'Unknown field "__schema" on type Query' }],
            })
          ),
        },
        secretFieldsRetained: false,
      },
    })
  );
  const preReplayPlatformConfiguration = {
    dataApi: {
      ...sourcePlatformDataApiResult,
      rawObservation: binding(sourcePlatformDataApiRaw),
    },
    auth: {
      ...sourcePlatformAuthResult,
      rawObservation: binding(sourcePlatformAuthRaw),
    },
    graphQl: {
      ...sourcePlatformGraphQlResult,
      rawObservation: binding(sourcePlatformGraphQlRaw),
    },
    comparison: { status: 'PASS', mismatches: [] },
  };
  const sourceIdentityClockOperation = add(
    writeJsonArtifact(directory, 'source-identity-clock-operation.json', {
      schemaVersion: 1,
      phase: 'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP_RESULT',
      resultType: 'SOURCE_IDENTITY_CLOCK_OPERATION',
      status: 'PASS',
      commandId: 'PR12-CMD-004A',
      gitCommit: head,
      runtimeIdentity: sourceRuntimeIdentity,
      sourceDatabaseUtc: '1999-12-31T23:59:36Z',
      preReplayPlatformConfiguration,
      capturedAt: sourceBootstrapCapturedAt,
      mandatoryStopObserved: true,
    })
  );
  const migrationInputContract = add(
    writeArtifact(
      directory,
      'migration-input-contract.json',
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json'
        )
      )
    )
  );
  const cleanReplayPrecondition = add(
    writeJsonArtifact(directory, 'clean-replay-precondition.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_CLEAN_REPLAY_PRECONDITION',
      status: 'PASS',
      projectRef: environment.projectRef,
      gitCommit: head,
      commandId: 'PR12-CMD-004',
      capturedAt: '1999-12-31T23:59:42Z',
      runtimeIdentity: sourceRuntimeIdentity,
      databaseMutationPerformed: false,
      scope: {
        applicationSchemas: ['public'],
        platformAndExtensionOwnedSchemasExcluded: true,
        databaseWideEmptyClaimed: false,
      },
      migrationHistory: {
        appliedMigrationCount: 0,
        orderedAppliedMigrations: [],
      },
      applicationCatalog: {
        relationCount: 0,
        routineCount: 0,
        typeCount: 0,
        unexpectedApplicationSchemas: [],
      },
      applicationStateEmpty: true,
    })
  );
  const migrationReplayDryRun = add(
    writeJsonArtifact(directory, 'migration-replay-dry-run.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_MIGRATION_REPLAY_DRY_RUN',
      status: 'PASS',
      projectRef: environment.projectRef,
      gitCommit: head,
      commandId: 'PR12-CMD-005',
      capturedAt: '1999-12-31T23:59:43Z',
      runtimeIdentity: sourceRuntimeIdentity,
      migrationInputContract: binding(migrationInputContract),
      databaseMutationPerformed: false,
      exitCode: 0,
      alreadyAppliedMigrationCount: 0,
      pendingMigrationCount: migrationContractValue.migrationCount,
      orderedPendingMigrations: orderedMigrations,
      migrationHead: migrationContractValue.migrationHead,
      migrationSetSha256: migrationContractValue.migrationSetSha256,
    })
  );
  const migrationReplayOperation = add(
    writeJsonArtifact(directory, 'migration-replay-operation.json', {
      schemaVersion: 1,
      resultType: 'CLEAN_MIGRATION_REPLAY_OPERATION',
      status: 'PASS',
      projectRef: environment.projectRef,
      gitCommit: head,
      commandId: 'PR12-CMD-007',
      startedAt: pastTimestamp,
      completedAt: migrationReplayCompletedAt,
      durationSeconds: 10,
      runtimeIdentity: sourceRuntimeIdentity,
      migrationInputContract: binding(migrationInputContract),
      preconditionResult: binding(cleanReplayPrecondition),
      dryRunResult: binding(migrationReplayDryRun),
      exitCode: 0,
      appliedMigrationCount: migrationContractValue.migrationCount,
      orderedAppliedMigrations: orderedMigrations,
      migrationHead: migrationContractValue.migrationHead,
      migrationSetSha256: migrationContractValue.migrationSetSha256,
      failedMigration: null,
      lockTimeoutObserved: false,
      statementTimeoutObserved: false,
    })
  );
  const migrationHistoryResultPath = 'migration-history-result.json';
  const migrationHistoryPayload = {
    migrationHead: migrationContractValue.migrationHead,
    migrationCount: migrationContractValue.migrationCount,
    migrationSetSha256: migrationContractValue.migrationSetSha256,
    rollbackCount: migrationContractValue.rollbackCount,
    rollbackSetSha256: migrationContractValue.rollbackSetSha256,
    rollbackParity: migrationContractValue.rollbackParity,
    orderedMigrations,
  };
  const migrationHistoryResult = add(
    writeJsonArtifact(directory, migrationHistoryResultPath, {
      schemaVersion: 1,
      resultType: 'MIGRATION_HISTORY_PARITY',
      status: 'PASS',
      environmentProjectRef: environment.projectRef,
      gitCommit: head,
      ...migrationHistoryPayload,
      commandId: 'PR12-CMD-008A',
      capturedAt: migrationHistoryCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'MIGRATION_HISTORY_PARITY',
      transport: 'DIRECT_POSTGRES_AND_REPOSITORY',
      observationCount: 1,
      observations: [
        {
          observationId: 'PR12-CMD-008A-001',
          observationType: 'MIGRATION_AND_ROLLBACK_PARITY',
          observedAt: migrationHistoryCompletedAt,
          payload: migrationHistoryPayload,
        },
      ],
      evidence: [migrationHistoryResultPath],
    })
  );
  const generatedTypesCapture = add(
    writeArtifact(
      directory,
      'generated-types.capture.ts',
      fs.readFileSync(path.join(repoRoot, String(generatedTypesInput.path)))
    )
  );
  const generatedTypesResultPath = 'generated-types-result.json';
  const generatedTypesPayload = {
    generatedTypesSha256,
    repositoryTypesSha256: generatedTypesSha256,
    diffEmpty: true,
    generatedTypesArtifact: binding(generatedTypesCapture),
  };
  const generatedTypesResult = add(
    writeJsonArtifact(directory, generatedTypesResultPath, {
      schemaVersion: 1,
      resultType: 'GENERATED_TYPES_PARITY',
      status: 'PASS',
      environmentProjectRef: environment.projectRef,
      gitCommit: head,
      ...generatedTypesPayload,
      commandId: 'PR12-CMD-010',
      capturedAt: generatedTypesCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'GENERATED_TYPES_PARITY',
      transport: 'SUPABASE_CLI_AND_REPOSITORY_BYTES',
      observationCount: 1,
      observations: [
        {
          observationId: 'PR12-CMD-010-001',
          observationType: 'GENERATED_TYPES_BYTE_PARITY',
          observedAt: generatedTypesCompletedAt,
          payload: generatedTypesPayload,
        },
      ],
      evidence: [generatedTypesResultPath, generatedTypesCapture.path],
    })
  );
  const canonicalPerformanceResultPath = 'canonical-pr11-result.json';
  const canonicalPerformancePayload = {
    sampleCount: 3,
    aggregation: 'median_of_exactly_3',
    pairedSampleOrder: 'before_after_after_before_before_after',
    primaryExecutionResults: metricResults(
      frozenPerformance.primaryExecutionGates,
      canonicalPerformanceResultPath
    ),
    primaryWalResults: metricResults(
      frozenPerformance.primaryWalGates,
      canonicalPerformanceResultPath
    ),
    auxiliaryExecutionResults: metricResults(
      frozenPerformance.auxiliaryExecutionGates,
      canonicalPerformanceResultPath
    ),
    auxiliaryWalResults: metricResults(
      frozenPerformance.auxiliaryWalGates,
      canonicalPerformanceResultPath
    ),
    planResults: namedResults(
      frozenPerformance.planGates,
      canonicalPerformanceResultPath
    ),
    semanticResults: namedResults(
      frozenPerformance.semanticGates,
      canonicalPerformanceResultPath
    ),
  };
  const canonicalPlanFacts: Record<string, Record<string, unknown>> = {
    'created_by_read:natural_index_scan:blocks_created_by_idx': {
      nodeType: 'Index Scan',
      indexName: 'blocks_created_by_idx',
      naturalPlan: true,
    },
    'rls_read:natural_index_scan': { naturalIndexPlan: true },
    'rls_read:no_sort': { sortCount: 0 },
    'rls_read:no_bitmap_heap_scan': { targetBitmapHeapScanCount: 0 },
    'rls_read:no_target_seq_scan': { targetSeqScanCount: 0 },
    'rls_read:row_limit_250': { returnedRows: 250, stoppedAtRows: 250 },
    'blocks:trigger_and_fk_each_10000_calls': {
      triggerCalls: 10000,
      fkCalls: 10000,
    },
    'target_indexes:exact_catalog_identity': {
      exactCatalogIdentity: true,
      idxBlocksResourceIdPresent: true,
    },
  };
  const canonicalSemanticFacts: Record<string, Record<string, unknown>> = {
    'blocks_integrity:30_cases': { caseCount: 30, failedCaseCount: 0 },
    'blocks_integrity:sqlstate_message_equivalence': {
      sqlstateEquivalent: true,
      messageEquivalent: true,
    },
    'rls_scope:27_before_27_after': { beforeCount: 27, afterCount: 27 },
    'rls_scope:tenant_a_b_exact_semantics': {
      tenantAAllowed: true,
      tenantBDenied: true,
    },
    'pgtap:52_ok_0_not_ok': { okCount: 52, notOkCount: 0 },
  };
  const canonicalMetricObservations = [
    [
      'primaryExecutionResults',
      canonicalPerformancePayload.primaryExecutionResults,
    ],
    ['primaryWalResults', canonicalPerformancePayload.primaryWalResults],
    [
      'auxiliaryExecutionResults',
      canonicalPerformancePayload.auxiliaryExecutionResults,
    ],
    ['auxiliaryWalResults', canonicalPerformancePayload.auxiliaryWalResults],
  ].flatMap(([category, values]) =>
    (values as Record<string, unknown>[]).map(result => ({
      observationId: `canonical-${String(category)}-${String(result.id)}`,
      observationType: 'CANONICAL_METRIC_GATE',
      observedAt: canonicalPerformanceCompletedAt,
      category,
      id: result.id,
      result,
    }))
  );
  const canonicalNamedObservations = [
    [
      'planResults',
      canonicalPerformancePayload.planResults,
      canonicalPlanFacts,
    ],
    [
      'semanticResults',
      canonicalPerformancePayload.semanticResults,
      canonicalSemanticFacts,
    ],
  ].flatMap(([category, values, facts]) =>
    (values as Record<string, unknown>[]).map(result => ({
      observationId: `canonical-${String(category)}-${String(result.id)}`,
      observationType: 'CANONICAL_DERIVED_GATE',
      observedAt: canonicalPerformanceCompletedAt,
      category,
      id: result.id,
      facts: (facts as Record<string, Record<string, unknown>>)[
        String(result.id)
      ],
      result,
    }))
  );
  const canonicalPerformanceResult = add(
    writeJsonArtifact(directory, canonicalPerformanceResultPath, {
      schemaVersion: 1,
      resultType: 'CANONICAL_PR11_RAW_EVIDENCE',
      status: 'CAPTURED',
      projectRef: environment.projectRef,
      gitCommit: head,
      commandId: 'PR12-CMD-011',
      capturedAt: canonicalPerformanceCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'CANONICAL_PR11_PERFORMANCE',
      transport: 'DIRECT_POSTGRES_CANONICAL_PROBES',
      observationCount:
        canonicalMetricObservations.length + canonicalNamedObservations.length,
      observations: [
        ...canonicalMetricObservations,
        ...canonicalNamedObservations,
      ],
      canonical: canonicalPerformancePayload,
    })
  );
  const hostedSloResultPath = 'hosted-slo-result.json';
  const sampleLatenciesMs = [...Array<number>(39).fill(50), 75];
  const hostedSampleResults = hostedContractValue.sampleOrder.map(id => ({
    id,
    durationSeconds: 2,
    concurrency: 2,
    attemptedRequests: 40,
    completedRequests: 40,
    failedRequests: 0,
    response5xxCount: 0,
    timeoutCount: 0,
    observed: {
      p95Ms: 50,
      p99Ms: 75,
      throughputPerSecond: 20,
      rate5xx: 0,
      timeoutRate: 0,
      cpuPercent: 40,
      cpuAboveThresholdSeconds: 0,
      poolHeadroomPercent: 50,
      poolBelowThresholdSeconds: 0,
      lockWaitMs: 10,
      walBytes: 100,
    },
    status: 'PASS',
    evidence: [hostedSloResultPath],
  }));
  const hostedPooledResult = {
    id: 'pooled',
    durationSeconds: 6,
    concurrency: 2,
    attemptedRequests: 120,
    completedRequests: 120,
    failedRequests: 0,
    response5xxCount: 0,
    timeoutCount: 0,
    observed: {
      p95Ms: 50,
      p99Ms: 75,
      throughputPerSecond: 20,
      rate5xx: 0,
      timeoutRate: 0,
      cpuPercent: 40,
      cpuAboveThresholdSeconds: 0,
      poolHeadroomPercent: 50,
      poolBelowThresholdSeconds: 0,
      lockWaitMs: 10,
      walBytes: 300,
    },
    status: 'PASS',
    evidence: [hostedSloResultPath],
  };
  const hostedSloPayload = {
    contractPath: hostedContract.path,
    contractSha256: hostedContract.sha256,
    workloadId: hostedContractValue.workloadId,
    concurrency: hostedContractValue.concurrency,
    sampleOrder: hostedContractValue.sampleOrder,
    durationSeconds: hostedContractValue.durationSeconds,
    thresholds: hostedThresholds,
    sampleResults: hostedSampleResults,
    pooledResult: hostedPooledResult,
    migrationDurationSeconds: 10,
    migrationReplay: binding(migrationReplayOperation),
    status: 'PASS',
    evidence: [hostedSloResultPath],
  };
  const hostedSloResult = add(
    writeJsonArtifact(directory, hostedSloResultPath, {
      schemaVersion: 1,
      resultType: 'HOSTED_SLO_RAW_EVIDENCE',
      status: 'CAPTURED',
      projectRef: environment.projectRef,
      gitCommit: head,
      commandId: 'PR12-CMD-012',
      capturedAt: hostedSloCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'HOSTED_SLO',
      transport: 'HTTPS_WORKLOAD_AND_DIRECT_POSTGRES_MONITORING',
      observationCount: 5,
      observations: [
        ...hostedSampleResults.map(result => ({
          observationId: `hosted-${result.id}`,
          observationType: 'HOSTED_SCORED_SAMPLE',
          observedAt: hostedSloCompletedAt,
          result,
          latenciesMs: sampleLatenciesMs,
        })),
        {
          observationId: 'hosted-pooled',
          observationType: 'HOSTED_POOLED_SAMPLE',
          observedAt: hostedSloCompletedAt,
          result: hostedPooledResult,
          latenciesMs: hostedSampleResults.flatMap(() => sampleLatenciesMs),
        },
        {
          observationId: 'hosted-monitoring',
          observationType: 'HOSTED_DATABASE_MONITORING',
          observedAt: hostedSloCompletedAt,
          sampleOrder: hostedContractValue.sampleOrder,
          cpuPercentSamples: [40, 40, 40],
          poolHeadroomPercentSamples: [50, 50, 50],
          lockWaitMsSamples: [10, 10, 10],
          walBoundaryDeltas: [100, 100, 100],
        },
      ],
      hostedSlo: hostedSloPayload,
    })
  );
  const sourceSecurityRawPath = 'source-security.raw.json';
  const sourceDataApiRawPath = 'source-data-api.raw.json';
  const sourceGraphQlRawPath = 'source-graphql.raw.json';
  const sourceSecurityRows = securityRows.map(row => {
    const observed = observedSecurityRow(row, sourceSecurityRawPath);
    return {
      ...observed,
      ...(row.tenantProbeControl === undefined
        ? {}
        : {
            tenantProbeControl: materializeTenantProbeControl(
              row.tenantProbeControl,
              'source',
              sourceSecurityCompletedAt
            ),
          }),
      ...(row.authorityStateControl === undefined
        ? {}
        : {
            authorityStateControl: materializeAuthorityStateControl(
              row.authorityStateControl,
              'source',
              String(row.jwtCase)
            ),
          }),
      rawObservationId: `source-security-${String(row.caseId)}`,
    };
  });
  const sourceSecurityMatrix = {
    environmentProjectRef: sourceProjectRef,
    matrixId: 'SECURITY-MATRIX-TEST',
    contractPath: securityContract.path,
    contractSha256: securityContract.sha256,
    roles: requiredRoles,
    jwtCases: ['valid_jwt', 'service_role_server_only', ...requiredJwtCases],
    tenantCrudCases,
    targets: securityTargets,
    tenantDirections,
    targetCatalogPath: sourceSecurityTargetCatalog.path,
    targetCatalogSha256: sourceSecurityTargetCatalog.sha256,
    authTokenProvenance: {
      acquisitionMethod: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
      actorSetSha256: hostedAuthActorSetSha256,
      issuer: `https://${sourceProjectRef}.supabase.co/auth/v1`,
      actorSessions: hostedAuthActorSessions('source'),
      rawTokenMaterialCaptured: false,
      jwtSigningSecretAcquired: false,
      fabricatedUserJwtUsed: false,
      status: 'PASS',
      evidence: [sourceSecurityRawPath],
    },
    rows: sourceSecurityRows,
    serviceRoleBoundary: {
      status: 'PASS',
      rawObservationId: 'source-security-service-role-boundary',
      evidence: [sourceSecurityRawPath],
    },
    aclRlsIndependence: {
      status: 'PASS',
      rawObservationId: 'source-security-acl-rls-independence',
      evidence: [sourceSecurityRawPath],
    },
  };
  const sourceSecurityCaseObservations = sourceSecurityRows.map(
    (value, index) => {
      const row = requireRecord(value, `sourceSecurityRows[${String(index)}]`);
      return {
        observationId: row.rawObservationId,
        observationType: 'SECURITY_AUTH_TENANT_CASE',
        observedAt:
          row.jwtCase === 'stale_jwt'
            ? '2000-01-01T00:00:20.400Z'
            : sourceSecurityCompletedAt,
        caseId: row.caseId,
        role: row.role,
        actor: row.actor,
        jwtCase: row.jwtCase,
        caseClass: row.caseClass,
        sourceTenant: row.sourceTenant,
        targetTenant: row.targetTenant,
        tenantBoundary: row.tenantBoundary,
        tenantDirection: row.tenantDirection,
        target: row.target,
        targetObjectId: row.targetObjectId,
        targetObjectKind: row.targetObjectKind,
        targetObjectIdentity: row.targetObjectIdentity,
        aclInventoryCaseId: row.aclInventoryCaseId,
        operation: row.operation,
        http: {
          method: row.httpMethod,
          path: row.requestPath,
          status: row.observedHttpStatus,
          requestBodySha256: row.requestBodySha256,
          responseBodySha256: row.observedResponseBodySha256,
        },
        sql: {
          executed: row.observedSqlstate !== 'NOT_EXECUTED',
          sqlstate: row.observedSqlstate,
          rowCount: row.observedRowCount,
          mutationCount: row.observedMutationCount,
          directAffectedRows: row.observedDirectAffectedRows,
        },
        authorization: {
          decision: row.observedDecision,
          aclOutcome: row.observedAclOutcome,
          rlsOutcome: row.observedRlsOutcome,
          aclVerdict: row.aclVerdict,
          rlsVerdict: row.rlsVerdict,
        },
        authTokenUse: row.authTokenUse,
        ...(row.tenantProbeControl === undefined
          ? {}
          : { tenantProbeControl: row.tenantProbeControl }),
        ...(row.tenantAllowControl === undefined
          ? {}
          : { tenantAllowControl: row.tenantAllowControl }),
        ...(row.authorityStateControl === undefined
          ? {}
          : { authorityStateControl: row.authorityStateControl }),
        semantic: {
          errorIdentity: row.observedErrorIdentity,
          postcondition: row.observedPostcondition,
          preservedSentinel: row.observedPreservedSentinel,
          transactionEndCommand: row.observedTransactionEndCommand,
          transactionEndStatus: row.observedTransactionEndStatus,
          rollbackCompletedAt: row.observedRollbackCompletedAt,
          postRollbackCheckedAt: row.observedPostRollbackCheckedAt,
          stateResults: row.observedStateResults,
          errorDiagnostic: row.observedErrorDiagnostic,
        },
        status: row.status,
      };
    }
  );
  const sourceSecurityPositiveObservations = sourceSecurityRows
    .map(row => tenantPositiveRawObservation(row, sourceSecurityCompletedAt))
    .filter((value): value is Record<string, unknown> => value !== null);
  const sourceSecurityRaw = add(
    writeJsonArtifact(directory, sourceSecurityRawPath, {
      schemaVersion: 1,
      resultType: 'SOURCE_SECURITY_AUTH_TENANT_RAW_EVIDENCE',
      status: 'CAPTURED',
      commandId: 'PR12-CMD-013',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      capturedAt: sourceSecurityCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'SECURITY_AUTH_TENANT',
      transport: 'AUTH_HTTP_AND_DIRECT_POSTGRES',
      authProvisioning: environment.authProvisioning,
      observationCount:
        sourceSecurityCaseObservations.length +
        sourceSecurityPositiveObservations.length +
        hostedAuthActorSet.length * 2 +
        2,
      observations: [
        ...sourceSecurityCaseObservations,
        ...sourceSecurityPositiveObservations,
        ...hostedAuthRawObservations(
          'source',
          `https://${sourceProjectRef}.supabase.co/auth/v1`,
          sourceSecurityCompletedAt
        ),
        {
          observationId: 'source-security-service-role-boundary',
          observationType: 'SECURITY_SUMMARY',
          observedAt: sourceSecurityCompletedAt,
          gate: 'serviceRoleBoundary',
          status: 'PASS',
        },
        {
          observationId: 'source-security-acl-rls-independence',
          observationType: 'SECURITY_SUMMARY',
          observedAt: sourceSecurityCompletedAt,
          gate: 'aclRlsIndependence',
          status: 'PASS',
        },
      ],
    })
  );
  const sourceSecurityResult = add(
    writeJsonArtifact(directory, 'source-security-result.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_SECURITY_AUTH_TENANT_RESULT',
      status: 'PASS',
      commandId: 'PR12-CMD-013',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      capturedAt: sourceSecurityCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      contract: binding(securityContract),
      rawEvidence: [binding(sourceSecurityRaw)],
      authProvisioning: environment.authProvisioning,
      result: sourceSecurityMatrix,
    })
  );
  const sourceDataApiBase = requireRecord(
    replaceEvidencePaths(environment.dataApi, sourceDataApiRawPath),
    'source Data API base'
  );
  const sourceDataApiRows = requireArray(
    sourceDataApiBase.directRoleResults,
    'source Data API rows'
  ).map((value, index) => {
    const row = requireRecord(value, `source Data API rows[${String(index)}]`);
    return {
      ...row,
      rawObservationId: `source-data-api-${String(row.caseId)}`,
    };
  });
  const sourceDataApiAclRows = requireArray(
    sourceDataApiBase.aclInventoryResults,
    'source Data API ACL inventory rows'
  ).map((value, index) => {
    const row = requireRecord(
      value,
      `source Data API ACL inventory rows[${String(index)}]`
    );
    return {
      ...row,
      rawObservationId: `source-data-api-acl-${String(row.caseId)}`,
    };
  });
  const sourceDataApiSummaryFields = [
    'schemaUsage',
    'objectAcl',
    'aclVerdict',
    'rlsVerdict',
  ] as const;
  const sourceDataApi = {
    ...sourceDataApiBase,
    directRoleResults: sourceDataApiRows,
    aclInventoryResults: sourceDataApiAclRows,
    ...Object.fromEntries(
      sourceDataApiSummaryFields.map(field => [
        field,
        {
          ...requireRecord(
            sourceDataApiBase[field],
            `source Data API ${field}`
          ),
          rawObservationId: `source-data-api-${field}`,
        },
      ])
    ),
  };
  const sourceDataApiRoleObservations = sourceDataApiRows.map(
    (value, index) => {
      const row = requireRecord(value, `sourceDataApiRows[${String(index)}]`);
      return {
        observationId: row.rawObservationId,
        observationType: 'DATA_API_ROLE_CASE',
        observedAt: sourceDataApiGraphQlCompletedAt,
        caseId: row.caseId,
        caseClass: row.caseClass,
        role: row.role,
        actorId: row.actorId,
        credentialHandle: row.credentialHandle,
        tokenProvenance: row.tokenProvenance,
        sourceTenant: row.sourceTenant,
        targetTenant: row.targetTenant,
        tenantDirection: row.tenantDirection,
        target: row.target,
        targetObjectId: row.targetObjectId,
        targetObjectKind: row.targetObjectKind,
        targetObjectIdentity: row.targetObjectIdentity,
        aclInventoryCaseId: row.aclInventoryCaseId,
        operation: row.operation,
        http: {
          method: row.httpMethod,
          path: row.requestPath,
          status: row.observedHttpStatus,
          requestBodySha256: row.requestBodySha256,
          responseBodySha256: row.observedResponseBodySha256,
        },
        sql: {
          executed: row.observedSqlExecuted,
          sqlstate: row.observedSqlstate,
        },
        rowCount: row.observedRowCount,
        mutationCount: row.observedMutationCount,
        endpointOutcome: row.observedEndpointOutcome,
        authorization: {
          aclOutcome: row.observedAclOutcome,
          rlsOutcome: row.observedRlsOutcome,
          aclVerdict: row.aclVerdict,
          rlsVerdict: row.rlsVerdict,
        },
        authTokenUse: row.authTokenUse,
        ...(row.tenantProbeControl === undefined
          ? {}
          : { tenantProbeControl: row.tenantProbeControl }),
        ...(row.tenantAllowControl === undefined
          ? {}
          : { tenantAllowControl: row.tenantAllowControl }),
        status: row.status,
      };
    }
  );
  const sourceDataApiPositiveObservations = sourceDataApiRows
    .map(row =>
      tenantPositiveRawObservation(row, sourceDataApiGraphQlCompletedAt)
    )
    .filter((value): value is Record<string, unknown> => value !== null);
  const sourceDataApiAclObservations = sourceDataApiAclRows.map(
    (value, index) => {
      const row = requireRecord(
        value,
        `sourceDataApiAclRows[${String(index)}]`
      );
      return {
        observationId: row.rawObservationId,
        observationType: 'DATA_API_ACL_CASE',
        observedAt: sourceDataApiGraphQlCompletedAt,
        caseId: row.caseId,
        objectId: row.objectId,
        objectKind: row.objectKind,
        objectIdentity: row.objectIdentity,
        role: row.role,
        privilege: row.privilege,
        directGrant: row.observedDirectGrant,
        publicGrant: row.observedPublicGrant,
        inheritedGrant: row.observedInheritedGrant,
        granted: row.observedGranted,
        sqlstate: row.observedSqlstate,
        aclOutcome: row.observedAclOutcome,
        status: row.status,
      };
    }
  );
  const sourceDataApiRaw = add(
    writeJsonArtifact(directory, sourceDataApiRawPath, {
      schemaVersion: 1,
      resultType: 'SOURCE_DATA_API_RAW_EVIDENCE',
      status: 'CAPTURED',
      commandId: 'PR12-CMD-014',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      capturedAt: sourceDataApiGraphQlCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'DATA_API_DIRECT_ROLE',
      transport: 'HTTPS_REST_AND_DIRECT_POSTGRES_ACL',
      configuration: {
        enabled: sourceDataApi.enabled,
        exposedSchemas: sourceDataApi.exposedSchemas,
        automaticGrants: sourceDataApi.automaticGrants,
        defaultPrivileges: sourceDataApi.defaultPrivileges,
      },
      observationCount:
        sourceDataApiRoleObservations.length +
        sourceDataApiPositiveObservations.length +
        sourceDataApiAclObservations.length +
        sourceDataApiSummaryFields.length,
      observations: [
        ...sourceDataApiRoleObservations,
        ...sourceDataApiPositiveObservations,
        ...sourceDataApiAclObservations,
        ...sourceDataApiSummaryFields.map(field => ({
          observationId: `source-data-api-${field}`,
          observationType: 'DATA_API_SUMMARY',
          observedAt: sourceDataApiGraphQlCompletedAt,
          gate: field,
          status: requireRecord(
            sourceDataApi[field],
            `source Data API ${field}`
          ).status,
          coveredCaseIds: requireRecord(
            sourceDataApi[field],
            `source Data API ${field}`
          ).coveredCaseIds,
        })),
      ],
    })
  );
  const sourceGraphQlBase = requireRecord(
    replaceEvidencePaths(environment.graphQl, sourceGraphQlRawPath),
    'source GraphQL base'
  );
  const sourceGraphQlRows = requireArray(
    sourceGraphQlBase.directRoleResults,
    'source GraphQL rows'
  ).map((value, index) => {
    const row = requireRecord(value, `source GraphQL rows[${String(index)}]`);
    return {
      ...row,
      rawObservationId: `source-graphql-${String(row.caseId)}`,
    };
  });
  const sourceGraphQlSummaryFields = [
    'tenantBoundary',
    'fieldVisibility',
    'disabledEndpointRejection',
  ] as const;
  const sourceGraphQl = {
    ...sourceGraphQlBase,
    directRoleResults: sourceGraphQlRows,
    ...Object.fromEntries(
      sourceGraphQlSummaryFields.map(field => [
        field,
        {
          ...requireRecord(sourceGraphQlBase[field], `source GraphQL ${field}`),
          rawObservationId: `source-graphql-${field}`,
        },
      ])
    ),
  };
  const sourceGraphQlRoleObservations = sourceGraphQlRows.map(
    (value, index) => {
      const row = requireRecord(value, `sourceGraphQlRows[${String(index)}]`);
      return {
        observationId: row.rawObservationId,
        observationType: 'GRAPHQL_ROLE_CASE',
        observedAt: sourceDataApiGraphQlCompletedAt,
        caseId: row.caseId,
        caseClass: row.caseClass,
        role: row.role,
        actorId: row.actorId,
        credentialHandle: row.credentialHandle,
        tokenProvenance: row.tokenProvenance,
        sourceTenant: row.sourceTenant,
        targetTenant: row.targetTenant,
        tenantDirection: row.tenantDirection,
        target: row.target,
        operation: row.operation,
        http: { status: row.observedHttpStatus },
        sql: {
          executed: row.observedSqlExecuted,
          sqlstate: row.observedSqlstate,
        },
        rowCount: row.observedRowCount,
        mutationCount: row.observedMutationCount,
        endpointOutcome: row.observedEndpointOutcome,
        authorization: {
          aclOutcome: row.observedAclOutcome,
          rlsOutcome: row.observedRlsOutcome,
          aclVerdict: row.aclVerdict,
          rlsVerdict: row.rlsVerdict,
        },
        authTokenUse: row.authTokenUse,
        status: row.status,
      };
    }
  );
  const sourceGraphQlRaw = add(
    writeJsonArtifact(directory, sourceGraphQlRawPath, {
      schemaVersion: 1,
      resultType: 'SOURCE_GRAPHQL_RAW_EVIDENCE',
      status: 'CAPTURED',
      commandId: 'PR12-CMD-014',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      capturedAt: sourceDataApiGraphQlCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      observationSchemaVersion: 1,
      observationFamily: 'GRAPHQL_DIRECT_ROLE',
      transport: 'HTTPS_GRAPHQL',
      configuration: {
        installedVersion: sourceGraphQl.installedVersion,
        enabled: sourceGraphQl.enabled,
        exposedSchemas: sourceGraphQl.exposedSchemas,
        introspection: sourceGraphQl.introspection,
      },
      observationCount:
        sourceGraphQlRoleObservations.length +
        sourceGraphQlSummaryFields.length,
      observations: [
        ...sourceGraphQlRoleObservations,
        ...sourceGraphQlSummaryFields.map(field => ({
          observationId: `source-graphql-${field}`,
          observationType: 'GRAPHQL_SUMMARY',
          observedAt: sourceDataApiGraphQlCompletedAt,
          gate: field,
          status: requireRecord(sourceGraphQl[field], `source GraphQL ${field}`)
            .status,
          coveredCaseIds: requireRecord(
            sourceGraphQl[field],
            `source GraphQL ${field}`
          ).coveredCaseIds,
        })),
      ],
    })
  );
  environment.dataApi = sourceDataApi;
  environment.graphQl = sourceGraphQl;
  const sourceDataApiGraphQlResult = add(
    writeJsonArtifact(directory, 'source-data-api-graphql-result.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_DATA_API_GRAPHQL_RESULT',
      status: 'PASS',
      commandId: 'PR12-CMD-014',
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      capturedAt: sourceDataApiGraphQlCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      contracts: {
        dataApi: binding(dataApiContract),
        graphQl: binding(graphQlContract),
      },
      rawEvidence: {
        dataApi: binding(sourceDataApiRaw),
        graphQl: binding(sourceGraphQlRaw),
      },
      result: { dataApi: sourceDataApi, graphQl: sourceGraphQl },
    })
  );
  const postRestoreIntegrityRawPath = 'post-restore-integrity.raw.json';
  const postRestoreSecurityRawPath = 'post-restore-security.raw.json';
  const postRestoreDataApiRawPath = 'post-restore-data-api.raw.json';
  const postRestoreGraphQlRawPath = 'post-restore-graphql.raw.json';
  const restoreSourceSnapshot = {
    logicalHash: postWatermarkSourceIntegrity.logicalHash,
    historicalNormalizedPhysicalHash:
      postWatermarkSourceIntegrity.historicalNormalizedPhysicalHash,
    environmentPhysicalStructureHash:
      postWatermarkSourceIntegrity.environmentPhysicalStructureHash,
    schemaHash: postWatermarkSourceIntegrity.schemaHash,
    dataHash: postWatermarkSourceIntegrity.dataHash,
    hashContractId: postWatermarkSourceIntegrity.hashContractId,
    hashContractPath: postWatermarkSourceIntegrity.hashContractPath,
    hashContractSha256: postWatermarkSourceIntegrity.hashContractSha256,
    relationDigests: postWatermarkSourceIntegrity.relationDigests,
    migrationHead,
    orderedMigrations,
    generatedTypesSha256,
    rowCounts: sourceRowCounts,
  };
  const restoreTargetSnapshot = {
    ...restoreSourceSnapshot,
    relationDigests: restoreSourceSnapshot.relationDigests.map(value => ({
      ...value,
    })),
  };
  const postRestoreIntegrityRaw = add(
    writeJsonArtifact(directory, postRestoreIntegrityRawPath, {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_INTEGRITY_RAW_EVIDENCE',
      status: 'CAPTURED',
      projectRef: restoreProjectRef,
      commandId: 'PR12-CMD-019',
      capturedAt: postRestoreIntegrityCompletedAt,
      systemIdentifier: restoreEnvironment.systemIdentifier,
      databaseHost: restoreEnvironment.databaseHost,
      observationSchemaVersion: 1,
      observationFamily: 'INTEGRITY_PARITY',
      transport: 'DIRECT_POSTGRES',
      observationCount: 1,
      observations: [
        {
          observationId: 'restore-integrity-snapshot-001',
          observationType: 'MIGRATION_SCHEMA_DATA_PARITY',
          observedAt: postRestoreIntegrityCompletedAt,
          source: restoreSourceSnapshot,
          restored: restoreTargetSnapshot,
        },
      ],
    })
  );
  const restoreIntegrityResult = add(
    writeJsonArtifact(directory, 'restore-integrity-result.json', {
      schemaVersion: 1,
      resultType: 'RESTORE_DATA_INTEGRITY',
      status: 'PASS',
      sourceProjectRef: environment.projectRef,
      restoreProjectRef: restoreEnvironment.projectRef,
      gitCommit: head,
      commandId: 'PR12-CMD-019',
      capturedAt: postRestoreIntegrityCompletedAt,
      runtimeIdentity: restoreRuntimeIdentity,
      rawEvidence: [binding(postRestoreIntegrityRaw)],
      rawObservationId: 'restore-integrity-snapshot-001',
      postWatermarkSourceIntegrity: binding(backupWatermarkOperation),
      source: restoreSourceSnapshot,
      restored: restoreTargetSnapshot,
      evidence: [postRestoreIntegrityRawPath],
    })
  );
  const restoredSecurityRows = securityRows.map(row => {
    const observed = observedSecurityRow(
      row,
      postRestoreSecurityRawPath,
      '2000-01-01T00:05:58Z',
      '2000-01-01T00:05:59Z',
      'restore'
    );
    return {
      ...observed,
      ...(row.tenantProbeControl === undefined
        ? {}
        : {
            tenantProbeControl: materializeTenantProbeControl(
              row.tenantProbeControl,
              'restore',
              postRestoreSecurityCompletedAt
            ),
          }),
      ...(row.authorityStateControl === undefined
        ? {}
        : {
            authorityStateControl: materializeAuthorityStateControl(
              row.authorityStateControl,
              'restore',
              String(row.jwtCase)
            ),
          }),
      rawObservationId: `restore-security-${String(row.caseId)}`,
    };
  });
  const restoreSecurityTargetCatalog = add(
    writeJsonArtifact(directory, 'restore-security-target-catalog.json', {
      schemaVersion: 1,
      resultType: 'SECURITY_TARGET_CATALOG',
      status: 'CAPTURED',
      environmentProjectRef: restoreProjectRef,
      gitCommit: head,
      migrationHead,
      commandId: 'PR12-CMD-019S',
      capturedAt: postRestoreSecurityCompletedAt,
      scope: {
        schemas: ['public'],
        relkinds: ['r', 'p'],
        requiredAuthTargets: ['auth.identities', 'auth.users'],
      },
      relations: securityCatalogRelations.map(relation => ({
        relation,
        relkind: 'r',
        owner: 'postgres',
        rlsEnabled: true,
        rlsForced: false,
      })),
    })
  );
  const restoredSecurityMatrix = {
    environmentProjectRef: restoreProjectRef,
    matrixId: 'SECURITY-MATRIX-TEST',
    contractPath: securityContract.path,
    contractSha256: securityContract.sha256,
    roles: requiredRoles,
    jwtCases: ['valid_jwt', 'service_role_server_only', ...requiredJwtCases],
    tenantCrudCases,
    targets: securityTargets,
    tenantDirections,
    targetCatalogPath: restoreSecurityTargetCatalog.path,
    targetCatalogSha256: restoreSecurityTargetCatalog.sha256,
    authTokenProvenance: {
      acquisitionMethod: 'HOSTED_AUTH_PASSWORD_SIGN_IN_AND_REFRESH',
      actorSetSha256: hostedAuthActorSetSha256,
      issuer: `https://${restoreProjectRef}.supabase.co/auth/v1`,
      actorSessions: hostedAuthActorSessions('restore'),
      rawTokenMaterialCaptured: false,
      jwtSigningSecretAcquired: false,
      fabricatedUserJwtUsed: false,
      status: 'PASS',
      evidence: [postRestoreSecurityRawPath],
    },
    rows: restoredSecurityRows,
    serviceRoleBoundary: {
      status: 'PASS',
      rawObservationId: 'restore-security-service-role-boundary',
      evidence: [postRestoreSecurityRawPath],
    },
    aclRlsIndependence: {
      status: 'PASS',
      rawObservationId: 'restore-security-acl-rls-independence',
      evidence: [postRestoreSecurityRawPath],
    },
  };
  const securityCaseObservations = restoredSecurityRows.map((value, index) => {
    const row = requireRecord(value, `restoredSecurityRows[${String(index)}]`);
    return {
      observationId: row.rawObservationId,
      observationType: 'SECURITY_AUTH_TENANT_CASE',
      observedAt:
        row.jwtCase === 'stale_jwt'
          ? '2000-01-01T00:04:35Z'
          : postRestoreSecurityCompletedAt,
      caseId: row.caseId,
      role: row.role,
      actor: row.actor,
      jwtCase: row.jwtCase,
      caseClass: row.caseClass,
      sourceTenant: row.sourceTenant,
      targetTenant: row.targetTenant,
      tenantBoundary: row.tenantBoundary,
      tenantDirection: row.tenantDirection,
      target: row.target,
      targetObjectId: row.targetObjectId,
      targetObjectKind: row.targetObjectKind,
      targetObjectIdentity: row.targetObjectIdentity,
      aclInventoryCaseId: row.aclInventoryCaseId,
      operation: row.operation,
      http: {
        method: row.httpMethod,
        path: row.requestPath,
        status: row.observedHttpStatus,
        requestBodySha256: row.requestBodySha256,
        responseBodySha256: row.observedResponseBodySha256,
      },
      sql: {
        executed: row.observedSqlstate !== 'NOT_EXECUTED',
        sqlstate: row.observedSqlstate,
        rowCount: row.observedRowCount,
        mutationCount: row.observedMutationCount,
        directAffectedRows: row.observedDirectAffectedRows,
      },
      authorization: {
        decision: row.observedDecision,
        aclOutcome: row.observedAclOutcome,
        rlsOutcome: row.observedRlsOutcome,
        aclVerdict: row.aclVerdict,
        rlsVerdict: row.rlsVerdict,
      },
      ...(row.tenantProbeControl === undefined
        ? {}
        : { tenantProbeControl: row.tenantProbeControl }),
      ...(row.tenantAllowControl === undefined
        ? {}
        : { tenantAllowControl: row.tenantAllowControl }),
      ...(row.authorityStateControl === undefined
        ? {}
        : { authorityStateControl: row.authorityStateControl }),
      authTokenUse: row.authTokenUse,
      semantic: {
        errorIdentity: row.observedErrorIdentity,
        postcondition: row.observedPostcondition,
        preservedSentinel: row.observedPreservedSentinel,
        transactionEndCommand: row.observedTransactionEndCommand,
        transactionEndStatus: row.observedTransactionEndStatus,
        rollbackCompletedAt: row.observedRollbackCompletedAt,
        postRollbackCheckedAt: row.observedPostRollbackCheckedAt,
        stateResults: row.observedStateResults,
        errorDiagnostic: row.observedErrorDiagnostic,
      },
      status: row.status,
    };
  });
  const restoreSecurityPositiveObservations = restoredSecurityRows
    .map(row =>
      tenantPositiveRawObservation(row, postRestoreSecurityCompletedAt)
    )
    .filter((value): value is Record<string, unknown> => value !== null);
  const postRestoreSecurityRaw = add(
    writeJsonArtifact(directory, postRestoreSecurityRawPath, {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_SECURITY_RAW_EVIDENCE',
      status: 'CAPTURED',
      projectRef: restoreProjectRef,
      commandId: 'PR12-CMD-019S',
      capturedAt: postRestoreSecurityCompletedAt,
      systemIdentifier: restoreEnvironment.systemIdentifier,
      databaseHost: restoreEnvironment.databaseHost,
      observationSchemaVersion: 1,
      observationFamily: 'SECURITY_AUTH_TENANT',
      transport: 'AUTH_HTTP_AND_DIRECT_POSTGRES',
      authProvisioning: environment.authProvisioning,
      observationCount:
        securityCaseObservations.length +
        restoreSecurityPositiveObservations.length +
        hostedAuthActorSet.length * 2 +
        2,
      observations: [
        ...securityCaseObservations,
        ...restoreSecurityPositiveObservations,
        ...hostedAuthRawObservations(
          'restore',
          `https://${restoreProjectRef}.supabase.co/auth/v1`,
          postRestoreSecurityCompletedAt
        ),
        {
          observationId: 'restore-security-service-role-boundary',
          observationType: 'SECURITY_SUMMARY',
          observedAt: postRestoreSecurityCompletedAt,
          gate: 'serviceRoleBoundary',
          status: 'PASS',
        },
        {
          observationId: 'restore-security-acl-rls-independence',
          observationType: 'SECURITY_SUMMARY',
          observedAt: postRestoreSecurityCompletedAt,
          gate: 'aclRlsIndependence',
          status: 'PASS',
        },
      ],
    })
  );
  const postRestoreSecurityResult = add(
    writeJsonArtifact(directory, 'post-restore-security-result.json', {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_SECURITY_MATRIX_RESULT',
      status: 'PASS',
      projectRef: restoreProjectRef,
      commandId: 'PR12-CMD-019S',
      capturedAt: postRestoreSecurityCompletedAt,
      runtimeIdentity: restoreRuntimeIdentity,
      rawEvidence: [binding(postRestoreSecurityRaw)],
      authProvisioning: environment.authProvisioning,
      result: restoredSecurityMatrix,
    })
  );
  const restoreDataApiAclCatalog = add(
    writeJsonArtifact(directory, 'restore-data-api-acl-catalog.json', {
      schemaVersion: 1,
      resultType: 'DATA_API_ACL_OBJECT_CATALOG',
      status: 'CAPTURED',
      environmentProjectRef: restoreProjectRef,
      gitCommit: head,
      migrationHead,
      commandId: 'PR12-CMD-019D',
      capturedAt: postRestoreDataApiCompletedAt,
      exposedSchemas: dataApiConfiguration.exposedSchemas,
      roles: aclRoles,
      scope: {
        source: 'POST_REPLAY_PG_CATALOG',
        schemasFromProjectSettings: true,
        relationRelkinds: ['r', 'p', 'v', 'm', 'f'],
        sequenceRelkind: 'S',
        columnsIncluded: true,
        functionIdentityArgumentsIncluded: true,
        defaultPrivilegeOwners: ['postgres', 'supabase_admin'],
        defaultPrivilegeObjectTypes: [
          'TABLES',
          'SEQUENCES',
          'FUNCTIONS',
          'TYPES',
          'SCHEMAS',
        ],
      },
      objects: dataApiAclObjects,
    })
  );
  const dataApiBase = requireRecord(
    replaceEvidencePaths(environment.dataApi, postRestoreDataApiRawPath),
    'restored Data API base'
  );
  dataApiBase.aclCatalogPath = restoreDataApiAclCatalog.path;
  dataApiBase.aclCatalogSha256 = restoreDataApiAclCatalog.sha256;
  const restoredDataApiRows = requireArray(
    dataApiBase.directRoleResults,
    'restored Data API rows'
  ).map((value, index) => {
    const row = requireRecord(
      value,
      `restored Data API rows[${String(index)}]`
    );
    return {
      ...row,
      ...(row.tenantProbeControl === undefined
        ? {}
        : {
            tenantProbeControl: materializeTenantProbeControl(
              row.tenantProbeControl,
              'restore',
              postRestoreDataApiCompletedAt
            ),
          }),
      authTokenUse: directRoleAuthTokenUse(
        String(row.role),
        String(row.actorId),
        'restore'
      ),
      rawObservationId: `restore-data-api-${String(row.caseId)}`,
    };
  });
  const restoredDataApiAclRows = requireArray(
    dataApiBase.aclInventoryResults,
    'restored Data API ACL inventory rows'
  ).map((value, index) => {
    const row = requireRecord(
      value,
      `restored Data API ACL inventory rows[${String(index)}]`
    );
    return {
      ...row,
      rawObservationId: `restore-data-api-acl-${String(row.caseId)}`,
    };
  });
  const dataApiSummaryFields = [
    'schemaUsage',
    'objectAcl',
    'aclVerdict',
    'rlsVerdict',
  ] as const;
  const restoredDataApi = {
    ...dataApiBase,
    directRoleResults: restoredDataApiRows,
    aclInventoryResults: restoredDataApiAclRows,
    ...Object.fromEntries(
      dataApiSummaryFields.map(field => [
        field,
        {
          ...requireRecord(dataApiBase[field], `restored Data API ${field}`),
          rawObservationId: `restore-data-api-${field}`,
        },
      ])
    ),
  };
  const dataApiRoleObservations = restoredDataApiRows.map((value, index) => {
    const row = requireRecord(value, `restoredDataApiRows[${String(index)}]`);
    return {
      observationId: row.rawObservationId,
      observationType: 'DATA_API_ROLE_CASE',
      observedAt: postRestoreDataApiCompletedAt,
      caseId: row.caseId,
      caseClass: row.caseClass,
      role: row.role,
      actorId: row.actorId,
      credentialHandle: row.credentialHandle,
      tokenProvenance: row.tokenProvenance,
      sourceTenant: row.sourceTenant,
      targetTenant: row.targetTenant,
      tenantDirection: row.tenantDirection,
      target: row.target,
      targetObjectId: row.targetObjectId,
      targetObjectKind: row.targetObjectKind,
      targetObjectIdentity: row.targetObjectIdentity,
      aclInventoryCaseId: row.aclInventoryCaseId,
      operation: row.operation,
      http: {
        method: row.httpMethod,
        path: row.requestPath,
        status: row.observedHttpStatus,
        requestBodySha256: row.requestBodySha256,
        responseBodySha256: row.observedResponseBodySha256,
      },
      sql: {
        executed: row.observedSqlExecuted,
        sqlstate: row.observedSqlstate,
      },
      rowCount: row.observedRowCount,
      mutationCount: row.observedMutationCount,
      endpointOutcome: row.observedEndpointOutcome,
      authorization: {
        aclOutcome: row.observedAclOutcome,
        rlsOutcome: row.observedRlsOutcome,
        aclVerdict: row.aclVerdict,
        rlsVerdict: row.rlsVerdict,
      },
      authTokenUse: row.authTokenUse,
      ...(row.tenantProbeControl === undefined
        ? {}
        : { tenantProbeControl: row.tenantProbeControl }),
      ...(row.tenantAllowControl === undefined
        ? {}
        : { tenantAllowControl: row.tenantAllowControl }),
      status: row.status,
    };
  });
  const restoreDataApiPositiveObservations = restoredDataApiRows
    .map(row =>
      tenantPositiveRawObservation(row, postRestoreDataApiCompletedAt)
    )
    .filter((value): value is Record<string, unknown> => value !== null);
  const dataApiAclObservations = restoredDataApiAclRows.map((value, index) => {
    const row = requireRecord(
      value,
      `restoredDataApiAclRows[${String(index)}]`
    );
    return {
      observationId: row.rawObservationId,
      observationType: 'DATA_API_ACL_CASE',
      observedAt: postRestoreDataApiCompletedAt,
      caseId: row.caseId,
      objectId: row.objectId,
      objectKind: row.objectKind,
      objectIdentity: row.objectIdentity,
      role: row.role,
      privilege: row.privilege,
      directGrant: row.observedDirectGrant,
      publicGrant: row.observedPublicGrant,
      inheritedGrant: row.observedInheritedGrant,
      granted: row.observedGranted,
      sqlstate: row.observedSqlstate,
      aclOutcome: row.observedAclOutcome,
      status: row.status,
    };
  });
  const postRestoreDataApiRaw = add(
    writeJsonArtifact(directory, postRestoreDataApiRawPath, {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_DATA_API_RAW_EVIDENCE',
      status: 'CAPTURED',
      projectRef: restoreProjectRef,
      commandId: 'PR12-CMD-019D',
      capturedAt: postRestoreDataApiCompletedAt,
      systemIdentifier: restoreEnvironment.systemIdentifier,
      databaseHost: restoreEnvironment.databaseHost,
      observationSchemaVersion: 1,
      observationFamily: 'DATA_API_DIRECT_ROLE',
      transport: 'HTTPS_REST_AND_DIRECT_POSTGRES_ACL',
      configuration: {
        enabled: restoredDataApi.enabled,
        exposedSchemas: restoredDataApi.exposedSchemas,
        automaticGrants: restoredDataApi.automaticGrants,
        defaultPrivileges: restoredDataApi.defaultPrivileges,
      },
      observationCount:
        dataApiRoleObservations.length +
        restoreDataApiPositiveObservations.length +
        dataApiAclObservations.length +
        dataApiSummaryFields.length,
      observations: [
        ...dataApiRoleObservations,
        ...restoreDataApiPositiveObservations,
        ...dataApiAclObservations,
        ...dataApiSummaryFields.map(field => ({
          observationId: `restore-data-api-${field}`,
          observationType: 'DATA_API_SUMMARY',
          observedAt: postRestoreDataApiCompletedAt,
          gate: field,
          status: requireRecord(
            restoredDataApi[field],
            `restored Data API ${field}`
          ).status,
          coveredCaseIds: requireRecord(
            restoredDataApi[field],
            `restored Data API ${field}`
          ).coveredCaseIds,
        })),
      ],
    })
  );
  const postRestoreDataApiResult = add(
    writeJsonArtifact(directory, 'post-restore-data-api-result.json', {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_DATA_API_RESULT',
      status: 'PASS',
      projectRef: restoreProjectRef,
      commandId: 'PR12-CMD-019D',
      capturedAt: postRestoreDataApiCompletedAt,
      runtimeIdentity: restoreRuntimeIdentity,
      rawEvidence: [binding(postRestoreDataApiRaw)],
      result: restoredDataApi,
    })
  );
  const graphQlBase = requireRecord(
    replaceEvidencePaths(environment.graphQl, postRestoreGraphQlRawPath),
    'restored GraphQL base'
  );
  const restoredGraphQlRows = requireArray(
    graphQlBase.directRoleResults,
    'restored GraphQL rows'
  ).map((value, index) => {
    const row = requireRecord(value, `restored GraphQL rows[${String(index)}]`);
    return {
      ...row,
      authTokenUse: directRoleAuthTokenUse(
        String(row.role),
        String(row.actorId),
        'restore'
      ),
      rawObservationId: `restore-graphql-${String(row.caseId)}`,
    };
  });
  const graphQlSummaryFields = [
    'tenantBoundary',
    'fieldVisibility',
    'disabledEndpointRejection',
  ] as const;
  const restoredGraphQl = {
    ...graphQlBase,
    directRoleResults: restoredGraphQlRows,
    ...Object.fromEntries(
      graphQlSummaryFields.map(field => [
        field,
        {
          ...requireRecord(graphQlBase[field], `restored GraphQL ${field}`),
          rawObservationId: `restore-graphql-${field}`,
        },
      ])
    ),
  };
  const graphQlRoleObservations = restoredGraphQlRows.map((value, index) => {
    const row = requireRecord(value, `restoredGraphQlRows[${String(index)}]`);
    return {
      observationId: row.rawObservationId,
      observationType: 'GRAPHQL_ROLE_CASE',
      observedAt: postRestoreGraphQlCompletedAt,
      caseId: row.caseId,
      caseClass: row.caseClass,
      role: row.role,
      actorId: row.actorId,
      credentialHandle: row.credentialHandle,
      tokenProvenance: row.tokenProvenance,
      sourceTenant: row.sourceTenant,
      targetTenant: row.targetTenant,
      tenantDirection: row.tenantDirection,
      target: row.target,
      operation: row.operation,
      http: { status: row.observedHttpStatus },
      sql: {
        executed: row.observedSqlExecuted,
        sqlstate: row.observedSqlstate,
      },
      rowCount: row.observedRowCount,
      mutationCount: row.observedMutationCount,
      endpointOutcome: row.observedEndpointOutcome,
      authorization: {
        aclOutcome: row.observedAclOutcome,
        rlsOutcome: row.observedRlsOutcome,
        aclVerdict: row.aclVerdict,
        rlsVerdict: row.rlsVerdict,
      },
      authTokenUse: row.authTokenUse,
      status: row.status,
    };
  });
  const postRestoreGraphQlRaw = add(
    writeJsonArtifact(directory, postRestoreGraphQlRawPath, {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_GRAPHQL_RAW_EVIDENCE',
      status: 'CAPTURED',
      projectRef: restoreProjectRef,
      commandId: 'PR12-CMD-019G',
      capturedAt: postRestoreGraphQlCompletedAt,
      systemIdentifier: restoreEnvironment.systemIdentifier,
      databaseHost: restoreEnvironment.databaseHost,
      observationSchemaVersion: 1,
      observationFamily: 'GRAPHQL_DIRECT_ROLE',
      transport: 'HTTPS_GRAPHQL',
      configuration: {
        installedVersion: restoredGraphQl.installedVersion,
        enabled: restoredGraphQl.enabled,
        exposedSchemas: restoredGraphQl.exposedSchemas,
        introspection: restoredGraphQl.introspection,
      },
      observationCount:
        graphQlRoleObservations.length + graphQlSummaryFields.length,
      observations: [
        ...graphQlRoleObservations,
        ...graphQlSummaryFields.map(field => ({
          observationId: `restore-graphql-${field}`,
          observationType: 'GRAPHQL_SUMMARY',
          observedAt: postRestoreGraphQlCompletedAt,
          gate: field,
          status: requireRecord(
            restoredGraphQl[field],
            `restored GraphQL ${field}`
          ).status,
          coveredCaseIds: requireRecord(
            restoredGraphQl[field],
            `restored GraphQL ${field}`
          ).coveredCaseIds,
        })),
      ],
    })
  );
  const postRestoreGraphQlResult = add(
    writeJsonArtifact(directory, 'post-restore-graphql-result.json', {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_GRAPHQL_RESULT',
      status: 'PASS',
      projectRef: restoreProjectRef,
      commandId: 'PR12-CMD-019G',
      capturedAt: postRestoreGraphQlCompletedAt,
      runtimeIdentity: restoreRuntimeIdentity,
      rawEvidence: [binding(postRestoreGraphQlRaw)],
      result: restoredGraphQl,
    })
  );
  const postRestoreSideEffectResult = add(
    writeJsonArtifact(directory, 'post-restore-side-effect-result.json', {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_SIDE_EFFECT_RESULT',
      status: 'PASS',
      commandId: 'PR12-CMD-019A',
      sourceProjectRef,
      restoreProjectRef,
      capturedAt: postRestoreSideEffectsCompletedAt,
      runtimeIdentity: restoreRuntimeIdentity,
      drScopeInventory: binding(restoreDrScopeInventory),
      mode: 'DISABLED',
      attemptedDispatchCount: 0,
      providerDispatchCount: 0,
      duplicateCount: 0,
      evidence: [evidencePath],
    })
  );
  const restoreValidationCommandIds = [
    'PR12-CMD-019',
    'PR12-CMD-019S',
    'PR12-CMD-019D',
    'PR12-CMD-019G',
    'PR12-CMD-019A',
    'PR12-CMD-019F',
  ];
  const restoreMutationCommandIds = ['PR12-CMD-019S', 'PR12-CMD-019D'];
  const postRestoreOperation = add(
    writeJsonArtifact(directory, 'post-restore-operation.json', {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_QUALIFICATION_OPERATION',
      status: 'PASS',
      commandId: 'PR12-CMD-019F',
      sourceProjectRef,
      restoreProjectRef,
      restoredWatermark: syntheticWatermark,
      completedAt: postRestoreCompletedAt,
      operatorUtcAtCompletion: postRestoreCompletedAt,
      monotonicTimer: {
        ...monotonicTimerSession,
        timerSessionId:
          options.completionTimerSessionId ??
          monotonicTimerSession.timerSessionId,
        runnerInstanceId:
          options.completionRunnerInstanceId ??
          monotonicTimerSession.runnerInstanceId,
        endNanoseconds: '611000000000',
        elapsedNanoseconds: '610000000000',
        elapsedSeconds: 610,
      },
      runtimeIdentity: restoreRuntimeIdentity,
      validationCommandIds: restoreValidationCommandIds,
      integrityResult: {
        ...binding(restoreIntegrityResult),
        commandId: 'PR12-CMD-019',
      },
      structuredResults: {
        securityMatrix: {
          ...binding(postRestoreSecurityResult),
          commandId: 'PR12-CMD-019S',
        },
        dataApi: {
          ...binding(postRestoreDataApiResult),
          commandId: 'PR12-CMD-019D',
        },
        graphQl: {
          ...binding(postRestoreGraphQlResult),
          commandId: 'PR12-CMD-019G',
        },
      },
      externalSideEffects: {
        ...binding(postRestoreSideEffectResult),
        commandId: 'PR12-CMD-019A',
      },
      drScopeComparison: binding(drScopeComparison),
    })
  );
  const toolVersions = {
    node: options.nodeVersion ?? `v${process.versions.node}`,
    supabaseCli: options.supabaseCliVersion ?? '2.109.0',
    psql: options.psqlVersion ?? 'psql (PostgreSQL) 17.4',
  };
  const nodeVersionStdout = add(
    writeArtifact(
      directory,
      'node-version.stdout.txt',
      `${toolVersions.node}\n`
    )
  );
  const supabaseVersionStdout = add(
    writeArtifact(
      directory,
      'supabase-version.stdout.txt',
      `${toolVersions.supabaseCli}\n`
    )
  );
  const psqlVersionStdout = add(
    writeArtifact(
      directory,
      'psql-version.stdout.txt',
      `${toolVersions.psql}\n`
    )
  );
  const supabaseBinaryPath = 'C:\\approved\\supabase.exe';
  const supabaseArchivePath =
    'C:\\approved\\supabase_2.109.0_windows_amd64.zip';
  const psqlBinaryPath = 'C:\\approved\\psql.exe';
  const psqlBinarySha256 = 'a'.repeat(64);
  const supabaseHashStdout = add(
    writeArtifact(
      directory,
      'supabase-hash.stdout.txt',
      `${supabaseCliSha256}\n`
    )
  );
  const supabaseArchiveHashStdout = add(
    writeArtifact(
      directory,
      'supabase-archive-hash.stdout.txt',
      `${supabaseCliArchiveSha256}\n`
    )
  );
  const psqlHashStdout = add(
    writeArtifact(directory, 'psql-hash.stdout.txt', `${psqlBinarySha256}\n`)
  );
  const commands = [
    {
      id: 'capture-node-version',
      redactedCommand: 'node --version',
      startedAt: sourceBootstrapApprovedAt,
      endedAt: sourceBootstrapApprovedAt,
      exitCode: 0,
      stdoutPath: nodeVersionStdout.path,
      stdoutSha256: nodeVersionStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'capture-supabase-version',
      redactedCommand: 'supabase --version',
      startedAt: sourceBootstrapApprovedAt,
      endedAt: sourceBootstrapApprovedAt,
      exitCode: 0,
      stdoutPath: supabaseVersionStdout.path,
      stdoutSha256: supabaseVersionStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'capture-psql-version',
      redactedCommand: 'psql --version',
      startedAt: sourceBootstrapApprovedAt,
      endedAt: sourceBootstrapApprovedAt,
      exitCode: 0,
      stdoutPath: psqlVersionStdout.path,
      stdoutSha256: psqlVersionStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'hash-supabase-binary',
      redactedCommand: `Get-FileHash -Algorithm SHA256 -LiteralPath ${supabaseBinaryPath}`,
      startedAt: sourceBootstrapApprovedAt,
      endedAt: sourceBootstrapApprovedAt,
      exitCode: 0,
      stdoutPath: supabaseHashStdout.path,
      stdoutSha256: supabaseHashStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'hash-supabase-archive',
      redactedCommand: `Get-FileHash -Algorithm SHA256 -LiteralPath ${supabaseArchivePath}`,
      startedAt: sourceBootstrapApprovedAt,
      endedAt: sourceBootstrapApprovedAt,
      exitCode: 0,
      stdoutPath: supabaseArchiveHashStdout.path,
      stdoutSha256: supabaseArchiveHashStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'hash-psql-binary',
      redactedCommand: `Get-FileHash -Algorithm SHA256 -LiteralPath ${psqlBinaryPath}`,
      startedAt: sourceBootstrapApprovedAt,
      endedAt: sourceBootstrapApprovedAt,
      exitCode: 0,
      stdoutPath: psqlHashStdout.path,
      stdoutSha256: psqlHashStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-000',
      redactedCommand: 'approved phase binding and target guard validator',
      startedAt: sourceBootstrapApprovedAt,
      endedAt: '1999-12-31T23:59:32Z',
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-000A',
      redactedCommand: 'approved tool version and binary freeze collector',
      startedAt: '1999-12-31T23:59:32Z',
      endedAt: '1999-12-31T23:59:33Z',
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-001',
      redactedCommand: 'git rev-parse HEAD',
      startedAt: '1999-12-31T23:59:33Z',
      endedAt: '1999-12-31T23:59:34Z',
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-002',
      redactedCommand: 'approved offline preparation verifier',
      startedAt: '1999-12-31T23:59:34Z',
      endedAt: '1999-12-31T23:59:35Z',
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-004A',
      redactedCommand: 'approved first source identity and clock collector',
      startedAt: '1999-12-31T23:59:35Z',
      endedAt: sourceBootstrapCapturedAt,
      exitCode: 0,
      stdoutPath: sourceIdentityClockOperation.path,
      stdoutSha256: sourceIdentityClockOperation.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-003',
      redactedCommand: 'approved source project link wrapper',
      startedAt: sourceReplayApprovedAt,
      endedAt: '1999-12-31T23:59:41Z',
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-004',
      redactedCommand: 'approved pre-replay migration history collector',
      startedAt: '1999-12-31T23:59:41Z',
      endedAt: '1999-12-31T23:59:42Z',
      exitCode: 0,
      stdoutPath: cleanReplayPrecondition.path,
      stdoutSha256: cleanReplayPrecondition.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-005',
      redactedCommand: 'approved migration replay preview collector',
      startedAt: '1999-12-31T23:59:42Z',
      endedAt: '1999-12-31T23:59:43Z',
      exitCode: 0,
      stdoutPath: migrationReplayDryRun.path,
      stdoutSha256: migrationReplayDryRun.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-006',
      redactedCommand: 'approved pre-replay Advisor collector',
      startedAt: '1999-12-31T23:59:43Z',
      endedAt: '1999-12-31T23:59:44Z',
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-007',
      redactedCommand: 'approved clean full migration replay collector',
      startedAt: pastTimestamp,
      endedAt: migrationReplayCompletedAt,
      exitCode: 0,
      stdoutPath: migrationReplayOperation.path,
      stdoutSha256: migrationReplayOperation.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-007A',
      redactedCommand: 'approved post-replay catalog and API setting collector',
      startedAt: migrationReplayCompletedAt,
      endedAt: postReplayCatalogCapturedAt,
      exitCode: 0,
      stdoutPath: postReplayCatalogCaptureEnvelope.path,
      stdoutSha256: postReplayCatalogCaptureEnvelope.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-008A',
      redactedCommand: 'approved migration history parity collector',
      startedAt: postReplayCatalogCapturedAt,
      endedAt: migrationHistoryCompletedAt,
      exitCode: 0,
      stdoutPath: migrationHistoryResult.path,
      stdoutSha256: migrationHistoryResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-008B',
      redactedCommand: 'approved full source execution binding validator',
      startedAt: migrationHistoryCompletedAt,
      endedAt: migrationHistoryCompletedAt,
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-008',
      redactedCommand: 'approved hosted representative seed adapter',
      startedAt: migrationHistoryCompletedAt,
      endedAt: migrationHistoryCompletedAt,
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-009',
      redactedCommand: 'approved source row and hash collector',
      startedAt: migrationHistoryCompletedAt,
      endedAt: sourceIntegrityCompletedAt,
      exitCode: 0,
      stdoutPath: sourceIntegrityResult.path,
      stdoutSha256: sourceIntegrityResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-010',
      redactedCommand: 'approved generated types parity collector',
      startedAt: sourceIntegrityCompletedAt,
      endedAt: generatedTypesCompletedAt,
      exitCode: 0,
      stdoutPath: generatedTypesResult.path,
      stdoutSha256: generatedTypesResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-011',
      redactedCommand: 'approved canonical PR11 performance collector',
      startedAt: generatedTypesCompletedAt,
      endedAt: canonicalPerformanceCompletedAt,
      exitCode: 0,
      stdoutPath: canonicalPerformanceResult.path,
      stdoutSha256: canonicalPerformanceResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-012',
      redactedCommand: 'approved frozen hosted SLO collector',
      startedAt: canonicalPerformanceCompletedAt,
      endedAt: hostedSloCompletedAt,
      exitCode: 0,
      stdoutPath: hostedSloResult.path,
      stdoutSha256: hostedSloResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-013',
      redactedCommand: 'approved source security/Auth/tenant collector',
      startedAt: hostedSloCompletedAt,
      endedAt: sourceSecurityCompletedAt,
      exitCode: 0,
      stdoutPath: sourceSecurityResult.path,
      stdoutSha256: sourceSecurityResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-014',
      redactedCommand: 'approved source Data API and GraphQL collector',
      startedAt: sourceSecurityCompletedAt,
      endedAt: sourceDataApiGraphQlCompletedAt,
      exitCode: 0,
      stdoutPath: sourceDataApiGraphQlResult.path,
      stdoutSha256: sourceDataApiGraphQlResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-015',
      redactedCommand: 'approved sandbox billing and integration collector',
      startedAt: sourceDataApiGraphQlCompletedAt,
      endedAt: sourceDataApiGraphQlCompletedAt,
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-016',
      redactedCommand: 'approved post-qualification Advisor diff collector',
      startedAt: sourceDataApiGraphQlCompletedAt,
      endedAt: sourceDataApiGraphQlCompletedAt,
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-017',
      redactedCommand: 'approved single synthetic backup watermark wrapper',
      startedAt: watermarkStartedAt,
      endedAt: syntheticWatermark,
      exitCode: 0,
      stdoutPath: backupWatermarkOperation.path,
      stdoutSha256: backupWatermarkOperation.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-017A',
      redactedCommand: 'approved physical backup inventory collector',
      startedAt: backupInventoryStartedAt,
      endedAt: backupInventoryCompletedAt,
      exitCode: 0,
      stdoutPath: backupArtifact.path,
      stdoutSha256: backupArtifact.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-017B',
      redactedCommand:
        'approved selected-backup restore-creation stop validator',
      startedAt: restoreCreationApprovedAt,
      endedAt: restoreCreationApprovedAt,
      exitCode: 0,
      stdoutPath: generalEvidence.path,
      stdoutSha256: generalEvidence.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-ACTION-017',
      redactedCommand: 'approved restore-to-new-project wrapper',
      startedAt: restoreActionStartedAt,
      endedAt: restoreProviderCapturedAt,
      exitCode: 0,
      stdoutPath: restoreCreationOperation.path,
      stdoutSha256: restoreCreationOperation.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-018',
      redactedCommand:
        'approved read-only restore identity and clock collector',
      startedAt: restoreIdentityClockStartedAt,
      endedAt: restoreIdentityClockCompletedAt,
      exitCode: 0,
      stdoutPath: restoreIdentityClockOperation.path,
      stdoutSha256: restoreIdentityClockOperation.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-019',
      redactedCommand: 'approved restore integrity collector',
      startedAt: postRestoreStartedAt,
      endedAt: postRestoreIntegrityCompletedAt,
      exitCode: 0,
      stdoutPath: restoreIntegrityResult.path,
      stdoutSha256: restoreIntegrityResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-019S',
      redactedCommand: 'approved scoped restore security matrix collector',
      startedAt: postRestoreIntegrityCompletedAt,
      endedAt: postRestoreSecurityCompletedAt,
      exitCode: 0,
      stdoutPath: postRestoreSecurityResult.path,
      stdoutSha256: postRestoreSecurityResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-019D',
      redactedCommand: 'approved scoped restore Data API collector',
      startedAt: postRestoreSecurityCompletedAt,
      endedAt: postRestoreDataApiCompletedAt,
      exitCode: 0,
      stdoutPath: postRestoreDataApiResult.path,
      stdoutSha256: postRestoreDataApiResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-019G',
      redactedCommand: 'approved restore GraphQL collector',
      startedAt: postRestoreDataApiCompletedAt,
      endedAt: postRestoreGraphQlCompletedAt,
      exitCode: 0,
      stdoutPath: postRestoreGraphQlResult.path,
      stdoutSha256: postRestoreGraphQlResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-019A',
      redactedCommand:
        'approved restore external-side-effect and duplicate collector',
      startedAt: postRestoreGraphQlCompletedAt,
      endedAt: postRestoreSideEffectsCompletedAt,
      exitCode: 0,
      stdoutPath: postRestoreSideEffectResult.path,
      stdoutSha256: postRestoreSideEffectResult.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-019F',
      redactedCommand: 'approved non-mutating post-restore finalizer',
      startedAt: postRestoreSideEffectsCompletedAt,
      endedAt: postRestoreCompletedAt,
      exitCode: 0,
      stdoutPath: postRestoreOperation.path,
      stdoutSha256: postRestoreOperation.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'PR12-CMD-020',
      redactedCommand:
        'node scripts/commercial-hardening/scan-pr12-evidence.mjs --manifest manifest.json',
      startedAt: privacyScanStartedAt,
      endedAt: privacyScanCompletedAt,
      exitCode: 0,
      stdoutPath: machineScan.path,
      stdoutSha256: machineScan.sha256,
      stderrPath: machineScanStderr.path,
      stderrSha256: machineScanStderr.sha256,
    },
  ];
  const commandPolicies = new Map<
    string,
    {
      phase: string;
      remoteContact: boolean;
      mutating: boolean;
      mutationScope: string;
    }
  >([
    [
      'PR12-CMD-000',
      {
        phase: 'approval_freeze',
        remoteContact: false,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-000A',
      {
        phase: 'tool_freeze',
        remoteContact: false,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-001',
      {
        phase: 'offline_freeze',
        remoteContact: false,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-002',
      {
        phase: 'offline_freeze',
        remoteContact: false,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-004A',
      {
        phase: 'source_identity_bootstrap',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-003',
      {
        phase: 'staging_identity',
        remoteContact: true,
        mutating: true,
        mutationScope: 'LOCAL_LINK_METADATA_ONLY',
      },
    ],
    [
      'PR12-CMD-004',
      {
        phase: 'staging_preflight',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-005',
      {
        phase: 'staging_preflight',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-006',
      {
        phase: 'advisor_before',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-020',
      {
        phase: 'evidence_privacy',
        remoteContact: false,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-007',
      {
        phase: 'migration_replay',
        remoteContact: true,
        mutating: true,
        mutationScope: 'ISOLATED_SCHEMA_REPLAY_ONLY',
      },
    ],
    [
      'PR12-CMD-008A',
      {
        phase: 'migration_replay',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-007A',
      {
        phase: 'post_replay_catalog_capture',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-008B',
      {
        phase: 'source_execution_approval_freeze',
        remoteContact: false,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-008',
      {
        phase: 'representative_seed',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SYNTHETIC_REPRESENTATIVE_DATA_ONLY',
      },
    ],
    [
      'PR12-CMD-009',
      {
        phase: 'representative_data_parity',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-010',
      {
        phase: 'schema_and_type_parity',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-011',
      {
        phase: 'canonical_pr11',
        remoteContact: true,
        mutating: true,
        mutationScope: 'CANONICAL_PROBE_TRANSACTION_ONLY',
      },
    ],
    [
      'PR12-CMD-012',
      {
        phase: 'hosted_slo',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SYNTHETIC_HOSTED_WORKLOAD_ONLY',
      },
    ],
    [
      'PR12-CMD-013',
      {
        phase: 'security_auth_tenant',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SYNTHETIC_SECURITY_MATRIX_ONLY',
      },
    ],
    [
      'PR12-CMD-014',
      {
        phase: 'data_api_graphql',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SYNTHETIC_API_MATRIX_ONLY',
      },
    ],
    [
      'PR12-CMD-015',
      {
        phase: 'billing_integrations',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SANDBOX_BILLING_ONLY',
      },
    ],
    [
      'PR12-CMD-016',
      {
        phase: 'advisor_after',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-017',
      {
        phase: 'backup_watermark',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SYNTHETIC_BACKUP_WATERMARK_ONLY',
      },
    ],
    [
      'PR12-CMD-017A',
      {
        phase: 'backup_inventory',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-017B',
      {
        phase: 'restore_creation_approval_stop',
        remoteContact: false,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-ACTION-017',
      {
        phase: 'restore_project_creation',
        remoteContact: true,
        mutating: true,
        mutationScope: 'RESTORE_PROJECT_CREATION',
      },
    ],
    [
      'PR12-CMD-018',
      {
        phase: 'restore_identity',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-019',
      {
        phase: 'post_restore_qualification',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-019S',
      {
        phase: 'post_restore_qualification',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SYNTHETIC_QUALIFICATION_ONLY',
      },
    ],
    [
      'PR12-CMD-019D',
      {
        phase: 'post_restore_qualification',
        remoteContact: true,
        mutating: true,
        mutationScope: 'SYNTHETIC_QUALIFICATION_ONLY',
      },
    ],
    [
      'PR12-CMD-019G',
      {
        phase: 'post_restore_qualification',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-019A',
      {
        phase: 'post_restore_side_effects',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
    [
      'PR12-CMD-019F',
      {
        phase: 'post_restore_qualification',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
      },
    ],
  ]);
  const executionCommands = commands.map(command => ({
    ...command,
    ...(commandPolicies.get(command.id) ?? {
      phase: 'offline_evidence',
      remoteContact: false,
      mutating: false,
      mutationScope: 'NONE',
    }),
  }));
  const sourceBootstrapCommandIds = [
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
  const sourceReplayCommandIds = [
    'PR12-CMD-003',
    'PR12-CMD-004',
    'PR12-CMD-005',
    'PR12-CMD-006',
    'PR12-CMD-007',
    'PR12-CMD-007A',
    'PR12-CMD-008A',
  ];
  const ledgerCommands = executionCommands
    .filter(command => command.id.startsWith('PR12-'))
    .map(command => {
      const { remoteContact } = command;
      return {
        id: command.id,
        redactedCommand: command.redactedCommand,
        phase: command.phase,
        remoteContact,
        mutating: command.mutating,
        mutationScope: command.mutationScope,
        ...(remoteContact
          ? { guardedBy: 'synthetic_fail_closed_target_guard' }
          : {}),
      };
    });
  const commandLedger = add(
    writeJsonArtifact(directory, 'command-ledger.json', {
      schemaVersion: 1,
      status: options.commandLedgerStatus ?? 'APPROVED_EXECUTABLE',
      executionAuthorized: true,
      cleanupOrProjectDeletionCommandsAllowed: false,
      cleanupRequiresSeparateApproval: true,
      targetGuard: {
        implementationPath: 'synthetic_fail_closed_target_guard',
        requiredForEveryRemoteCommand: true,
        prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
        approvedSourceProjectRef: sourceProjectRef,
        approvedSourceProjectUrl: `https://${sourceProjectRef}.supabase.co`,
        approvedSourceDatabaseHost: `db.${sourceProjectRef}.supabase.co`,
        databaseConnectionMode: 'DIRECT',
        databaseUser: 'postgres',
        databaseHostMustEqualDbDotProjectRefDotSupabaseDotCo: true,
        sourceSystemIdentifierCaptureMode:
          'CAPTURE_ONCE_THEN_REQUIRE_EXACT_MATCH',
        sourceIdentityBootstrapCommandId: 'PR12-CMD-004A',
        preKnownSystemIdentifierRequiredForBootstrap: false,
        bootstrapGuardMustMatchProvisioningResultIdentity: true,
        capturedSystemIdentifierRequiredForEverySubsequentSourceDatabaseCommand: true,
        runtimeIdentityEvidenceRequiredBeforeEveryRemoteDatabaseCommandExceptBootstrap: true,
        restoreCreationRequiresSelectedBackupApprovalBinding: true,
        restoreConnectionRequiresPostCreationSupplementalBinding: true,
        inheritParentEnvironmentAllowed: false,
        ambientGenericCredentialFallbackAllowed: false,
      },
      commands: ledgerCommands,
    })
  );
  const sourceBootstrapPhaseLedger = add(
    writeJsonArtifact(directory, 'source-bootstrap-command-ledger.json', {
      schemaVersion: 1,
      phase: 'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP',
      status: 'APPROVED_EXECUTABLE',
      commandIds: sourceBootstrapCommandIds,
      commands: sourceBootstrapCommandIds.map(id =>
        requireRecord(
          executionCommands.find(command => command.id === id),
          `source bootstrap ledger ${id}`
        )
      ),
    })
  );
  const sourceReplayPhaseLedger = add(
    writeJsonArtifact(directory, 'source-replay-command-ledger.json', {
      schemaVersion: 1,
      phase: 'ISOLATED_STAGING_SOURCE_REPLAY_CATALOG_CAPTURE',
      status: 'APPROVED_EXECUTABLE',
      inheritedBootstrapCommandIds: sourceBootstrapCommandIds,
      commandIds: sourceReplayCommandIds,
      commands: sourceReplayCommandIds.map(id =>
        requireRecord(
          executionCommands.find(command => command.id === id),
          `source replay ledger ${id}`
        )
      ),
    })
  );
  const drContractValue = requireRecord(
    JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/stabilization/evidence/commercial-hardening/pr12/dr-contract.proposed.json'
        ),
        'utf8'
      )
    ),
    'tracked DR contract'
  );
  drContractValue.status = 'OWNER_APPROVED_FOR_EXECUTION';
  drContractValue.executionStatus = 'APPROVED_NOT_RUN';
  requireRecord(
    drContractValue.cleanup,
    'tracked DR cleanup policy'
  ).cleanupOwner = 'synthetic_cleanup_owner';
  const fixtureDrClockPolicy = requireRecord(
    drContractValue.clockSkewPolicy,
    'tracked DR clock policy'
  );
  fixtureDrClockPolicy.maximumAllowedClockSkewSeconds = 300;
  fixtureDrClockPolicy.maximumRpoObservationLeadSeconds = 5;
  fixtureDrClockPolicy.clockProvenanceCollectorStatus = 'IMPLEMENTED_NOT_RUN';
  fixtureDrClockPolicy.numericSkewValidatorStatus = 'IMPLEMENTED';
  fixtureDrClockPolicy.ownerDecision = 'APPROVED';
  const fixtureDrOperationEvidence = requireRecord(
    drContractValue.operationEvidence,
    'tracked DR operation evidence'
  );
  fixtureDrOperationEvidence.clockProvenanceCollectorStatus =
    'IMPLEMENTED_NOT_RUN';
  fixtureDrOperationEvidence.numericSkewValidatorStatus = 'IMPLEMENTED';
  fixtureDrOperationEvidence.monotonicTimerSessionBindingStatus =
    'IMPLEMENTED_NOT_RUN';
  fixtureDrOperationEvidence.monotonicTimerRunnerPath =
    monotonicTimerRunner.path;
  fixtureDrOperationEvidence.monotonicTimerRunnerSha256 =
    monotonicTimerRunner.sha256;
  fixtureDrOperationEvidence.excludedOrManualScopeInventoryStatus =
    'IMPLEMENTED_NOT_RUN';
  fixtureDrOperationEvidence.platformConfigProjectionContractSha256 =
    drPlatformConfigProjectionContract.sha256;
  fixtureDrOperationEvidence.platformConfigProjectionCollectorPath =
    drPlatformConfigProjectionCollector.path;
  fixtureDrOperationEvidence.platformConfigProjectionCollectorSha256 =
    drPlatformConfigProjectionCollector.sha256;
  fixtureDrOperationEvidence.rtoRpoPassCurrentlyPossible = false;
  const fixtureDrSource = requireRecord(
    drContractValue.source,
    'tracked DR source'
  );
  fixtureDrSource.projectRef = sourceProjectRef;
  const fixtureProductTargetConflict = requireRecord(
    drContractValue.productTargetConflict,
    'tracked DR product target conflict'
  );
  fixtureProductTargetConflict.drillExecutionDecision = 'APPROVED_DRILL_ONLY';
  fixtureProductTargetConflict.commercialReleaseAuthorityDecision =
    'FORMALLY_ACCEPT_8H_24H_AS_RELEASE_AUTHORITY';
  fixtureProductTargetConflict.commercialReleaseAuthorizedByThisDecision = true;
  fixtureProductTargetConflict.owner = 'synthetic_commercial_release_owner';
  fixtureProductTargetConflict.approvedAt = provisioningApprovedAt;
  fixtureProductTargetConflict.evidence = binding(approvalEvidence);
  const drContract = add(
    writeJsonArtifact(directory, 'dr-contract.json', drContractValue)
  );
  const integrationContract = add(
    writeJsonArtifact(directory, 'integration-contract.json', {
      schemaVersion: 1,
      mode: 'SANDBOXED',
      targetModes: { source: 'SANDBOXED', restore: 'DISABLED' },
      sideEffectCollector: {
        collectorId: 'PR12-SIDE-EFFECT-COLLECTOR-V2',
        descriptorPath:
          'docs/stabilization/evidence/commercial-hardening/pr12/external-side-effect-collector-descriptors-v2.json',
        descriptorArtifactSha256: sha256(
          fs.readFileSync(
            path.join(
              repoRoot,
              'docs/stabilization/evidence/commercial-hardening/pr12/external-side-effect-collector-descriptors-v2.json'
            )
          )
        ),
        implementationStatus: 'IMPLEMENTED',
      },
      realExternalSideEffectsAllowed: false,
      applicationHarness: {
        publicDeployment: false,
        productionVercelProjectAllowed: false,
      },
      integrations: {
        stripe: {
          mode: 'TEST_MODE_SANDBOX_ONLY',
          liveKeyAllowed: false,
          liveChargeAllowed: false,
          testObjectCreationAllowedAfterApproval: true,
          webhookDestination: 'approved_local_or_isolated_harness_only',
        },
        email: {
          provider: 'DISABLED',
          resendApiKeyPresent: false,
          workerEnabled: false,
          cronEnabled: false,
          outboxEnqueueOnly: true,
          realSendAllowed: false,
        },
        line: {
          provider: 'DISABLED',
          credentialPresent: false,
          processorEnabled: false,
          cronEnabled: false,
          liffEnabled: false,
          realSendAllowed: false,
        },
        sms: {
          provider: 'DISABLED',
          credentialPresent: false,
          realSendAllowed: false,
        },
        inboundWebhooks: {
          stripeTestEndpointOnly: true,
          resendEndpointEnabled: false,
          lineEndpointEnabled: false,
        },
        cronAndQueues: {
          allConsumersDisabled: true,
          unattendedBatchEnabled: false,
        },
        bulk: {
          externalImportEnabled: false,
          externalSyncEnabled: false,
        },
        upstashOrExternalRateLimit: {
          disposition: 'DISABLED',
          isolatedNamespaceRequiredIfEnabled: true,
          productionNamespaceAllowed: false,
        },
      },
      restoreIntegrationOverrides: {
        stripe: {
          mode: 'DISABLED',
          liveKeyAllowed: false,
          liveChargeAllowed: false,
          testObjectCreationAllowedAfterApproval: false,
          webhookDestination: 'DISABLED',
        },
        inboundWebhooks: {
          stripeTestEndpointOnly: false,
          resendEndpointEnabled: false,
          lineEndpointEnabled: false,
        },
      },
      databaseExternalOperations: {
        pgNet: 'DISABLED_OR_ABSENT_REQUIRED',
        pgCron: 'NO_EXTERNAL_JOB_REQUIRED',
        wrappers: 'DISABLED_OR_ABSENT_REQUIRED',
        databaseWebhooks: 'DISABLED_REQUIRED',
      },
    })
  );
  const credentialPolicy: CredentialPolicy = {
    channel: 'process_environment',
    storage: 'owner_approved_server_secret_store',
    retrieval: 'ephemeral_server_subprocess_injection',
    logging: 'redacted_variable_names_only',
    serverOnly: true,
    browserExposureAllowed: false,
    commandLineExposureAllowed: false,
    evidenceExposureAllowed: false,
    clientResponseExposureAllowed: false,
    logExposureAllowed: false,
    sourceControlExposureAllowed: false,
    urlExposureAllowed: false,
    ...options.credentialOverrides,
  };
  const credentialContractValue = {
    schemaVersion: 1,
    ...credentialPolicy,
    storageProvider: 'synthetic_owner_secret_store',
    credentialChannels: {
      sharedProvider: {
        provider: 'synthetic_owner_secret_store',
        approvedProviderRequired: true,
        channel: 'process_environment',
        retrieval: 'ephemeral_server_subprocess_injection',
        persistence: 'process_lifetime_only',
        logging: 'redacted_variable_names_only',
        requiredParentEnvironmentNames: [
          'PR12_SUPABASE_ACCESS_TOKEN',
          'PR12_PSQL_EXE',
        ],
        childProcessMappings: {
          SUPABASE_ACCESS_TOKEN: 'PR12_SUPABASE_ACCESS_TOKEN',
        },
      },
      source: {
        targetKind: 'SOURCE',
        requiredParentEnvironmentNames: [
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
        optionalSandboxParentEnvironmentNames: [
          'PR12_SOURCE_STRIPE_TEST_SECRET_KEY',
          'PR12_SOURCE_STRIPE_TEST_WEBHOOK_SECRET',
        ],
        childProcessMappings: {
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
      },
      restore: {
        targetKind: 'RESTORE',
        requiredParentEnvironmentNames: [
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
        optionalSandboxParentEnvironmentNames: [],
        childProcessMappings: {
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
      },
      commonIsolationRules: {
        inheritParentEnvironment: false,
        ambientGenericFallbackAllowed: false,
        unsetEveryGenericChildBeforeMapping: true,
        forbiddenLocations: [
          'command_line_arguments',
          'database_url',
          'browser_or_bundle',
          'client_response',
          'source_control',
          'dotenv_file',
          'stdout_or_stderr',
          'evidence_artifact',
          'application_log',
        ],
        serviceRoleServerOnly: true,
        hostedJwtSigningSecretAcquisitionAllowed: false,
        userMetadataAuthorizationAllowed: false,
        committedFixturePasswordsAllowedOnHosted: false,
        ephemeralFixturePasswordRequirements: {
          minimumLength: 32,
          uniquePerActor: true,
          generatedByOwnerApprovedSecretStore: true,
          valueMayBePersistedOrCaptured: false,
          fixedActorIdsAndRolesMustRemainUnchanged: true,
          passwordMapKeySetMustEqualApprovedActorSet: true,
          unknownOrMissingActorAliasAllowed: false,
          passwordMapValueEvidenceAllowed: false,
        },
      },
    },
    targetBindingRules: {
      providerConfigurationResultType:
        'TARGET_CREDENTIAL_PROVIDER_CONFIGURATION',
      keyPresenceCollectorId: 'PR12-TARGET-CREDENTIAL-PRESENCE-V1',
      targetSpecificKeyPresenceMustBeCollectorDerived: true,
      fingerprintsMustBeComputedFromTheSameRuntimeValues: true,
      emptyCredentialFingerprintAllowed: false,
      sourceAndRestoreProviderConfigurationsMustBeSeparatelyHashBound: true,
      exactProjectRefUrlAndDatabaseHostMatchRequired: true,
      nonSecretHandleFingerprintsRequired: true,
      sourceAndRestoreProjectRefsMustDiffer: true,
      sourceAndRestoreDatabaseHostsMustDiffer: true,
      sourceAndRestoreAnonKeyFingerprintsMustDiffer: true,
      sourceAndRestoreServiceRoleKeyFingerprintsMustDiffer: true,
      crossTargetCredentialFallbackAllowed: false,
      abortBeforeRemoteCommandOnMismatch: true,
    },
  };
  const credentialContract = add(
    writeJsonArtifact(
      directory,
      'credential-contract.json',
      credentialContractValue
    )
  );
  const sideEffectFamilyConfigurations: Record<
    string,
    Record<string, unknown>
  > = {
    DATABASE_EXTENSION_STATE: {
      pgNet: 'DISABLED_OR_ABSENT_REQUIRED',
      pgCron: 'NO_EXTERNAL_JOB_REQUIRED',
      wrappers: 'DISABLED_OR_ABSENT_REQUIRED',
      databaseWebhooks: 'DISABLED_REQUIRED',
    },
    PG_CRON_JOB_INVENTORY: {
      approvedState: 'NO_EXTERNAL_JOB_REQUIRED',
      enabledJobCount: 0,
    },
    PG_NET_QUEUE_INVENTORY: {
      approvedState: 'DISABLED_OR_ABSENT_REQUIRED',
      queuedRequestCount: 0,
      responseCount: 0,
    },
    DATABASE_WEBHOOK_TRIGGER_INVENTORY: {
      approvedState: 'DISABLED_REQUIRED',
      enabledWebhookCount: 0,
    },
    WRAPPER_FDW_INVENTORY: {
      approvedState: 'DISABLED_OR_ABSENT_REQUIRED',
      externalServerCount: 0,
    },
    STRIPE_CONFIGURATION_AND_DISPATCH: {
      mode: 'TEST_MODE_SANDBOX_ONLY',
      liveKeyAllowed: false,
      liveChargeAllowed: false,
      testObjectCreationAllowedAfterApproval: true,
      webhookDestination: 'approved_local_or_isolated_harness_only',
    },
    EMAIL_CONFIGURATION_AND_DISPATCH: {
      provider: 'DISABLED',
      resendApiKeyPresent: false,
      workerEnabled: false,
      cronEnabled: false,
      outboxEnqueueOnly: true,
      realSendAllowed: false,
    },
    LINE_CONFIGURATION_AND_DISPATCH: {
      provider: 'DISABLED',
      credentialPresent: false,
      processorEnabled: false,
      cronEnabled: false,
      liffEnabled: false,
      realSendAllowed: false,
    },
    SMS_CONFIGURATION_AND_DISPATCH: {
      provider: 'DISABLED',
      credentialPresent: false,
      realSendAllowed: false,
    },
    INBOUND_WEBHOOK_CONFIGURATION: {
      stripeTestEndpointOnly: true,
      resendEndpointEnabled: false,
      lineEndpointEnabled: false,
    },
    WORKER_CRON_QUEUE_CONFIGURATION: {
      allConsumersDisabled: true,
      unattendedBatchEnabled: false,
    },
    BULK_IMPORT_SYNC_CONFIGURATION: {
      externalImportEnabled: false,
      externalSyncEnabled: false,
    },
    EXTERNAL_RATE_LIMIT_NAMESPACE: {
      disposition: 'DISABLED',
      isolatedNamespaceRequiredIfEnabled: true,
      productionNamespaceAllowed: false,
    },
    DUPLICATE_SIDE_EFFECT_SCAN: {
      duplicateCount: 0,
      pendingExternalOperationCount: 0,
    },
  };
  const sideEffectTransports: Record<string, string> = {
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
  const buildSideEffectObservations = (
    targetKind: 'SOURCE' | 'RESTORE',
    observedAt: string
  ): {
    raw: Record<string, unknown>[];
    normalized: Record<string, unknown>[];
  } => {
    const raw = requiredSideEffectFamilies.map((family, index) => {
      const transport = sideEffectTransports[family];
      if (!transport)
        throw new Error(`missing side-effect transport: ${family}`);
      const request = sideEffectRequests[family];
      if (!request) throw new Error(`missing side-effect request: ${family}`);
      const factsByFamily: Record<
        string,
        { observedSettings: Record<string, unknown>; catalogRows: unknown[] }
      > = {
        DATABASE_EXTENSION_STATE: {
          observedSettings: { paginationComplete: true },
          catalogRows: ['pg_cron', 'pg_net', 'wrappers'].map(name => ({
            name,
            availableVersion: null,
            installedVersion: null,
            externalOperationEnabled: false,
          })),
        },
        PG_CRON_JOB_INVENTORY: {
          observedSettings: {
            paginationComplete: true,
            relationPresent: false,
          },
          catalogRows: [],
        },
        PG_NET_QUEUE_INVENTORY: {
          observedSettings: {
            paginationComplete: true,
            queueRelationPresent: false,
            responseRelationPresent: false,
          },
          catalogRows: [{ queuedRequestCount: 0, responseCount: 0 }],
        },
        DATABASE_WEBHOOK_TRIGGER_INVENTORY: {
          observedSettings: { paginationComplete: true },
          catalogRows: [],
        },
        WRAPPER_FDW_INVENTORY: {
          observedSettings: { paginationComplete: true },
          catalogRows: [],
        },
        STRIPE_CONFIGURATION_AND_DISPATCH: {
          observedSettings: {
            liveCredentialPresent: false,
            paginationComplete: true,
            testCredentialPresent: targetKind === 'SOURCE',
            webhookDestinationClass:
              targetKind === 'SOURCE'
                ? 'APPROVED_ISOLATED_HARNESS'
                : 'DISABLED',
          },
          catalogRows: [],
        },
        EMAIL_CONFIGURATION_AND_DISPATCH: {
          observedSettings: {
            cronConfigured: false,
            credentialPresent: false,
            fromAddressConfigured: false,
            paginationComplete: true,
            webhookConfigured: false,
            workerConfigured: false,
          },
          catalogRows: [],
        },
        LINE_CONFIGURATION_AND_DISPATCH: {
          observedSettings: {
            credentialPresent: false,
            cronConfigured: false,
            liffConfigured: false,
            paginationComplete: true,
            processorConfigured: false,
          },
          catalogRows: [],
        },
        SMS_CONFIGURATION_AND_DISPATCH: {
          observedSettings: {
            credentialPresent: false,
            paginationComplete: true,
            providerSelected: false,
            sinkCount: 0,
          },
          catalogRows: [],
        },
        INBOUND_WEBHOOK_CONFIGURATION: {
          observedSettings: {
            databaseMutationCount: 0,
            lineRouteStatus: 404,
            paginationComplete: true,
            resendNegativeControlStatus: 500,
            stripeUnsignedStatus: targetKind === 'SOURCE' ? 400 : 404,
          },
          catalogRows: [],
        },
        WORKER_CRON_QUEUE_CONFIGURATION: {
          observedSettings: {
            paginationComplete: true,
            runtimeConsumerCredentialPresent: false,
            staticCronEntryCount: 3,
            unauthenticatedStatusCodes: [401, 401, 401],
          },
          catalogRows: [],
        },
        BULK_IMPORT_SYNC_CONFIGURATION: {
          observedSettings: {
            enabledExternalSinkCount: 0,
            paginationComplete: true,
          },
          catalogRows: [],
        },
        EXTERNAL_RATE_LIMIT_NAMESPACE: {
          observedSettings: {
            credentialPresent: false,
            namespacePrefix: null,
            paginationComplete: true,
          },
          catalogRows: [],
        },
        DUPLICATE_SIDE_EFFECT_SCAN: {
          observedSettings: { paginationComplete: true },
          catalogRows: [],
        },
      };
      const facts = factsByFamily[family];
      if (!facts) throw new Error(`missing side-effect facts: ${family}`);
      const rawState = {
        observedSettings: facts.observedSettings,
        catalogRows: facts.catalogRows,
        pendingExternalOperations: [],
        attemptedRealDispatches: [],
        providerRealDispatches: [],
        duplicateReceipts: [],
        productionIdentityMatches: [],
        destinationFingerprintSha256:
          family === 'STRIPE_CONFIGURATION_AND_DISPATCH' &&
          targetKind === 'SOURCE'
            ? sha256('synthetic-isolated-stripe-test-destination')
            : null,
      };
      return {
        observationId: `${targetKind.toLowerCase()}-side-effect-${String(index + 1).padStart(2, '0')}`,
        family,
        transport,
        observedAt,
        provenance: {
          sourceKind: transport,
          collectorId: 'PR12-SIDE-EFFECT-COLLECTOR-V2',
          descriptorPath:
            'docs/stabilization/evidence/commercial-hardening/pr12/external-side-effect-collector-descriptors-v2.json',
          descriptorArtifactSha256: sha256(
            fs.readFileSync(
              path.join(
                repoRoot,
                'docs/stabilization/evidence/commercial-hardening/pr12/external-side-effect-collector-descriptors-v2.json'
              )
            )
          ),
          probeId: request.probeId,
          requestOrQueryText: request.requestOrQueryText,
          requestOrQuerySha256: sha256(request.requestOrQueryText),
          steps: [
            {
              stepId: `${request.probeId}-01`,
              status: 'COMMAND_OK',
              rowCount: facts.catalogRows.length,
              responseBodySha256: sha256(JSON.stringify(rawState)),
            },
          ],
        },
        rawState,
        secretValueCaptured: false,
      };
    });
    const normalized = raw.map((value, index) => {
      const observation = requireRecord(
        value,
        `raw side-effect observation ${String(index)}`
      );
      const rawState = requireRecord(
        observation.rawState,
        `raw side-effect state ${String(index)}`
      );
      return {
        observationId: observation.observationId,
        family: observation.family,
        transport: observation.transport,
        observedAt: observation.observedAt,
        operationMode:
          observation.family === 'STRIPE_CONFIGURATION_AND_DISPATCH' &&
          targetKind === 'SOURCE'
            ? 'SANDBOXED'
            : 'DISABLED',
        pendingExternalOperationCount: 0,
        attemptedRealDispatchCount: 0,
        providerRealDispatchCount: 0,
        duplicateCount: 0,
        productionIdentityDetected: false,
        secretValueCaptured: false,
        destinationFingerprintSha256: rawState.destinationFingerprintSha256,
        configuration:
          targetKind === 'RESTORE' &&
          observation.family === 'STRIPE_CONFIGURATION_AND_DISPATCH'
            ? {
                mode: 'DISABLED',
                liveKeyAllowed: false,
                liveChargeAllowed: false,
                testObjectCreationAllowedAfterApproval: false,
                webhookDestination: 'DISABLED',
              }
            : targetKind === 'RESTORE' &&
                observation.family === 'INBOUND_WEBHOOK_CONFIGURATION'
              ? {
                  stripeTestEndpointOnly: false,
                  resendEndpointEnabled: false,
                  lineEndpointEnabled: false,
                }
              : sideEffectFamilyConfigurations[String(observation.family)],
      };
    });
    return { raw, normalized };
  };
  const buildServiceRoleCoveredCaseBindings = (
    targetKind: 'SOURCE' | 'RESTORE',
    dataApiRaw: Artifact,
    graphQlRaw: Artifact,
    dataApiObservedAt: string,
    graphQlObservedAt: string,
    credentialFingerprintSha256: string
  ): Record<string, unknown>[] => {
    const marker = targetKind.toLowerCase();
    const dataApiCommandId =
      targetKind === 'SOURCE' ? 'PR12-CMD-014' : 'PR12-CMD-019D';
    const graphQlCommandId =
      targetKind === 'SOURCE' ? 'PR12-CMD-014' : 'PR12-CMD-019G';
    return [
      'data_api_service_role_rest',
      'data_api_service_role_rpc_normalize_customer_phone',
    ]
      .map(caseId => ({
        caseId,
        rawObservationId: `${marker}-data-api-${caseId}`,
        rawArtifactPath: dataApiRaw.path,
        rawArtifactSha256: dataApiRaw.sha256,
        producingCommandId: dataApiCommandId,
        observedAt: dataApiObservedAt,
        credentialFingerprintSha256,
      }))
      .concat({
        caseId: 'graphql_service_role',
        rawObservationId: `${marker}-graphql-graphql_service_role`,
        rawArtifactPath: graphQlRaw.path,
        rawArtifactSha256: graphQlRaw.sha256,
        producingCommandId: graphQlCommandId,
        observedAt: graphQlObservedAt,
        credentialFingerprintSha256,
      });
  };
  const sourceBrowserBuildArtifact = add(
    writeArtifact(
      directory,
      'source-browser-build-service-role-scan.js',
      'export const serviceRoleCredentialPresent = false;\n'
    )
  );
  const sourceApplicationLogArtifact = add(
    writeArtifact(
      directory,
      'source-application-service-role-scan.log',
      'source API and GraphQL collectors completed with redacted credential handles\n'
    )
  );
  const restoreBrowserBuildArtifact = add(
    writeArtifact(
      directory,
      'restore-browser-build-service-role-scan.js',
      'export const serviceRoleCredentialPresent = false;\n'
    )
  );
  const restoreApplicationLogArtifact = add(
    writeArtifact(
      directory,
      'restore-application-service-role-scan.log',
      'restore API and GraphQL collectors completed with redacted credential handles\n'
    )
  );
  const sourceServiceRoleFingerprint = sha256('source-service-role-key');
  const restoreServiceRoleFingerprint = sha256('restore-service-role-key');
  const sourceServiceRoleCoveredCaseBindings =
    buildServiceRoleCoveredCaseBindings(
      'SOURCE',
      sourceDataApiRaw,
      sourceGraphQlRaw,
      sourceDataApiGraphQlCompletedAt,
      sourceDataApiGraphQlCompletedAt,
      sourceServiceRoleFingerprint
    );
  const restoreServiceRoleCoveredCaseBindings =
    buildServiceRoleCoveredCaseBindings(
      'RESTORE',
      postRestoreDataApiRaw,
      postRestoreGraphQlRaw,
      postRestoreDataApiCompletedAt,
      postRestoreGraphQlCompletedAt,
      restoreServiceRoleFingerprint
    );
  const sourceServiceRoleNonExposureReport =
    buildServiceRoleNonExposureEvidence(
      'SOURCE',
      sourceProjectRef,
      'PR12-CMD-016A',
      sourceSideEffectsCompletedAt,
      sourceRuntimeIdentity,
      'source-service-role-key',
      sourceServiceRoleCoveredCaseBindings,
      {
        BROWSER_BUILD: [sourceBrowserBuildArtifact],
        CLIENT_RESPONSE: [sourceDataApiRaw, sourceGraphQlRaw],
        APPLICATION_LOG: [sourceApplicationLogArtifact],
        COMMAND_STREAM_AND_EVIDENCE: [sourceDataApiRaw, sourceGraphQlRaw],
      }
    );
  const restoreServiceRoleNonExposureReport =
    buildServiceRoleNonExposureEvidence(
      'RESTORE',
      restoreProjectRef,
      'PR12-CMD-019A',
      postRestoreSideEffectsCompletedAt,
      restoreRuntimeIdentity,
      'restore-service-role-key',
      restoreServiceRoleCoveredCaseBindings,
      {
        BROWSER_BUILD: [restoreBrowserBuildArtifact],
        CLIENT_RESPONSE: [postRestoreDataApiRaw, postRestoreGraphQlRaw],
        APPLICATION_LOG: [restoreApplicationLogArtifact],
        COMMAND_STREAM_AND_EVIDENCE: [
          postRestoreDataApiRaw,
          postRestoreGraphQlRaw,
        ],
      }
    );
  const sourceServiceRoleNonExposure = {
    status: 'PASS',
    coveredCaseBindings: sourceServiceRoleCoveredCaseBindings,
    reportPath: sourceServiceRoleNonExposureReport.path,
    reportSha256: sourceServiceRoleNonExposureReport.sha256,
    evidence: [sourceDataApiRaw.path, sourceGraphQlRaw.path],
  };
  const restoreServiceRoleNonExposure = {
    status: 'PASS',
    coveredCaseBindings: restoreServiceRoleCoveredCaseBindings,
    reportPath: restoreServiceRoleNonExposureReport.path,
    reportSha256: restoreServiceRoleNonExposureReport.sha256,
    evidence: [postRestoreDataApiRaw.path, postRestoreGraphQlRaw.path],
  };
  const sourceSideEffectObservationSet = buildSideEffectObservations(
    'SOURCE',
    '2000-01-01T00:00:34Z'
  );
  const sourceSideEffectRaw = add(
    writeJsonArtifact(directory, 'source-side-effect-raw.json', {
      schemaVersion: 1,
      resultType: 'EXTERNAL_SIDE_EFFECT_RAW_EVIDENCE',
      status: 'CAPTURED',
      targetKind: 'SOURCE',
      commandId: 'PR12-CMD-016A',
      projectRef: environment.projectRef,
      capturedAt: sourceSideEffectsCompletedAt,
      observations: sourceSideEffectObservationSet.raw,
    })
  );
  const sourceSideEffectResult = add(
    writeJsonArtifact(directory, 'source-side-effect-result.json', {
      schemaVersion: 1,
      resultType: 'SOURCE_EXTERNAL_SIDE_EFFECT_INVENTORY_RESULT',
      status: 'PASS',
      commandId: 'PR12-CMD-016A',
      gitCommit: head,
      projectRef: environment.projectRef,
      capturedAt: sourceSideEffectsCompletedAt,
      runtimeIdentity: sourceRuntimeIdentity,
      drScopeInventory: binding(sourceDrScopeInventory),
      integrationContract: binding(integrationContract),
      credentialContract: binding(credentialContract),
      credentialProviderConfiguration: binding(
        sourceCredentialProviderConfiguration
      ),
      observationFamilies: requiredSideEffectFamilies,
      rawEvidence: [binding(sourceSideEffectRaw)],
      observations: sourceSideEffectObservationSet.normalized,
      mode: 'SANDBOXED',
      attemptedRealDispatchCount: 0,
      providerRealDispatchCount: 0,
      duplicateCount: 0,
      pendingExternalOperationCount: 0,
      productionIdentityDetected: false,
      secretValuesCaptured: false,
      privacyScanStatus: 'PASS',
      serviceRoleNonExposure: sourceServiceRoleNonExposure,
      evidence: [evidencePath],
    })
  );
  const sourceSideEffectCommand = {
    id: 'PR12-CMD-016A',
    redactedCommand: 'approved source external-side-effect inventory collector',
    startedAt: syntheticWatermark,
    endedAt: sourceSideEffectsCompletedAt,
    exitCode: 0,
    stdoutPath: sourceSideEffectResult.path,
    stdoutSha256: sourceSideEffectResult.sha256,
    stderrPath: stderr.path,
    stderrSha256: stderr.sha256,
  };
  const sourceSideEffectInsertIndex = commands.findIndex(
    command => command.id === 'PR12-CMD-017A'
  );
  if (sourceSideEffectInsertIndex < 0) {
    throw new Error('missing backup inventory command');
  }
  commands.splice(sourceSideEffectInsertIndex, 0, sourceSideEffectCommand);
  executionCommands.splice(sourceSideEffectInsertIndex, 0, {
    ...sourceSideEffectCommand,
    phase: 'external_side_effects',
    remoteContact: true,
    mutating: false,
    mutationScope: 'NONE',
  });
  const ledgerSideEffectInsertIndex = ledgerCommands.findIndex(
    command => command.id === 'PR12-CMD-017A'
  );
  if (ledgerSideEffectInsertIndex < 0) {
    throw new Error('missing backup inventory ledger command');
  }
  ledgerCommands.splice(ledgerSideEffectInsertIndex, 0, {
    id: 'PR12-CMD-016A',
    redactedCommand: sourceSideEffectCommand.redactedCommand,
    phase: 'external_side_effects',
    remoteContact: true,
    mutating: false,
    mutationScope: 'NONE',
    guardedBy: 'synthetic_fail_closed_target_guard',
  });
  const rewrittenLedger = writeJsonArtifact(directory, 'command-ledger.json', {
    schemaVersion: 1,
    status: options.commandLedgerStatus ?? 'APPROVED_EXECUTABLE',
    executionAuthorized: true,
    cleanupOrProjectDeletionCommandsAllowed: false,
    cleanupRequiresSeparateApproval: true,
    targetGuard: {
      implementationPath: 'synthetic_fail_closed_target_guard',
      requiredForEveryRemoteCommand: true,
      prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
      approvedSourceProjectRef: sourceProjectRef,
      approvedSourceProjectUrl: `https://${sourceProjectRef}.supabase.co`,
      approvedSourceDatabaseHost: `db.${sourceProjectRef}.supabase.co`,
      databaseConnectionMode: 'DIRECT',
      databaseUser: 'postgres',
      databaseHostMustEqualDbDotProjectRefDotSupabaseDotCo: true,
      sourceSystemIdentifierCaptureMode:
        'CAPTURE_ONCE_THEN_REQUIRE_EXACT_MATCH',
      sourceIdentityBootstrapCommandId: 'PR12-CMD-004A',
      preKnownSystemIdentifierRequiredForBootstrap: false,
      bootstrapGuardMustMatchProvisioningResultIdentity: true,
      capturedSystemIdentifierRequiredForEverySubsequentSourceDatabaseCommand: true,
      runtimeIdentityEvidenceRequiredBeforeEveryRemoteDatabaseCommandExceptBootstrap: true,
      restoreCreationRequiresSelectedBackupApprovalBinding: true,
      restoreConnectionRequiresPostCreationSupplementalBinding: true,
      inheritParentEnvironmentAllowed: false,
      ambientGenericCredentialFallbackAllowed: false,
    },
    commands: ledgerCommands,
  });
  commandLedger.bytes = rewrittenLedger.bytes;
  commandLedger.sha256 = rewrittenLedger.sha256;

  const restoreSideEffectObservationSet = buildSideEffectObservations(
    'RESTORE',
    '2000-01-01T00:09:30Z'
  );
  const restoreSideEffectRaw = add(
    writeJsonArtifact(directory, 'restore-side-effect-raw.json', {
      schemaVersion: 1,
      resultType: 'EXTERNAL_SIDE_EFFECT_RAW_EVIDENCE',
      status: 'CAPTURED',
      targetKind: 'RESTORE',
      commandId: 'PR12-CMD-019A',
      projectRef: restoreEnvironment.projectRef,
      capturedAt: postRestoreSideEffectsCompletedAt,
      observations: restoreSideEffectObservationSet.raw,
    })
  );
  const rewrittenRestoreSideEffect = writeJsonArtifact(
    directory,
    postRestoreSideEffectResult.path,
    {
      schemaVersion: 1,
      resultType: 'POST_RESTORE_SIDE_EFFECT_RESULT',
      status: 'PASS',
      commandId: 'PR12-CMD-019A',
      sourceProjectRef,
      restoreProjectRef,
      capturedAt: postRestoreSideEffectsCompletedAt,
      runtimeIdentity: restoreRuntimeIdentity,
      drScopeInventory: binding(restoreDrScopeInventory),
      sourceInventory: binding(sourceSideEffectResult),
      integrationContract: binding(integrationContract),
      credentialContract: binding(credentialContract),
      credentialProviderConfiguration: binding(
        restoreCredentialProviderConfiguration
      ),
      observationFamilies: requiredSideEffectFamilies,
      rawEvidence: [binding(restoreSideEffectRaw)],
      observations: restoreSideEffectObservationSet.normalized,
      mode: 'DISABLED',
      attemptedRealDispatchCount: 0,
      providerRealDispatchCount: 0,
      duplicateCount: 0,
      pendingExternalOperationCount: 0,
      productionIdentityDetected: false,
      secretValuesCaptured: false,
      privacyScanStatus: 'PASS',
      serviceRoleNonExposure: restoreServiceRoleNonExposure,
      evidence: [evidencePath],
    }
  );
  postRestoreSideEffectResult.bytes = rewrittenRestoreSideEffect.bytes;
  postRestoreSideEffectResult.sha256 = rewrittenRestoreSideEffect.sha256;
  for (const commandCollection of [commands, executionCommands]) {
    const sideEffectCommand = commandCollection.find(
      command => command.id === 'PR12-CMD-019A'
    );
    if (!sideEffectCommand)
      throw new Error('missing restore side-effect command');
    sideEffectCommand.stdoutSha256 = postRestoreSideEffectResult.sha256;
  }
  const postRestoreOperationValue = requireRecord(
    JSON.parse(
      fs.readFileSync(path.join(directory, postRestoreOperation.path), 'utf8')
    ),
    'post-restore operation'
  );
  requireRecord(
    postRestoreOperationValue.externalSideEffects,
    'post-restore operation external side effects'
  ).sha256 = postRestoreSideEffectResult.sha256;
  const rewrittenPostRestoreOperation = writeJsonArtifact(
    directory,
    postRestoreOperation.path,
    postRestoreOperationValue
  );
  postRestoreOperation.bytes = rewrittenPostRestoreOperation.bytes;
  postRestoreOperation.sha256 = rewrittenPostRestoreOperation.sha256;
  for (const commandCollection of [commands, executionCommands]) {
    const finalCommand = commandCollection.find(
      command => command.id === 'PR12-CMD-019F'
    );
    if (!finalCommand) throw new Error('missing post-restore final command');
    finalCommand.stdoutSha256 = postRestoreOperation.sha256;
  }

  const sourceProviderRedactedWireBody = {
    db_pass: 'REDACTED',
    name: environment.projectName,
    organization_slug: 'synthetic-organization-slug',
    region_selection: {
      type: 'specific',
      code: environment.region,
    },
    desired_instance_size: 'large',
  };
  const sourceProviderRedactedRequest = {
    httpMethod: 'POST',
    endpoint: 'https://api.supabase.com/v1/projects',
    organizationSlug: 'synthetic-organization-slug',
    name: environment.projectName,
    regionSelection: {
      type: 'specific',
      code: environment.region,
    },
    desiredInstanceSize: 'large',
    databasePasswordSource: 'OWNER_SECRET_STORE_RUNTIME_INJECTION',
    managementAccessTokenSource: 'OWNER_SECRET_STORE_RUNTIME_INJECTION',
    rawSecretValuesCaptured: false,
    redactedWireBody: sourceProviderRedactedWireBody,
  };
  const sourceOrganizationEntitlementRaw = add(
    writeJsonArtifact(
      directory,
      'source-provider-organization-entitlement-capture.json',
      {
        captureMethod: 'OWNER_READ_ONLY_SCREENSHOT_WITH_NORMALIZED_METADATA',
        organizationId: environment.organizationId,
        organizationSlug: sourceProviderRedactedRequest.organizationSlug,
        organizationPlan: 'PRO',
        actualDashboardQuoteUsd: 40,
        observedAt: '1999-12-31T23:58:30Z',
        secretValuesCaptured: false,
      }
    )
  );
  const sourceRegionAvailabilityRaw = add(
    writeJsonArtifact(directory, 'source-provider-region-availability.json', {
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/available-regions?organization_slug=${sourceProviderRedactedRequest.organizationSlug}&desired_instance_size=large`,
      },
      response: {
        status: 200,
        body: {
          recommendations: {
            smartGroup: {
              name: 'APAC',
              code: 'apac',
              type: 'smartGroup',
            },
            specific: [],
          },
          all: {
            smartGroup: [{ name: 'APAC', code: 'apac', type: 'smartGroup' }],
            specific: [
              {
                name: 'Tokyo',
                code: environment.region,
                type: 'specific',
                provider: 'AWS',
                status: 'capacity',
              },
            ],
          },
        },
      },
      observedAt: '1999-12-31T23:59:20.400Z',
    })
  );
  const sourceCreateProviderResponse = add(
    writeJsonArtifact(directory, 'source-provider-create-response.json', {
      request: {
        method: 'POST',
        url: 'https://api.supabase.com/v1/projects',
        redactedBody: sourceProviderRedactedWireBody,
        redactedBodySha256: sha256(
          JSON.stringify(sourceProviderRedactedWireBody)
        ),
      },
      response: {
        status: 201,
        body: {
          id: 'deprecated-provider-project-id',
          ref: environment.projectRef,
          organization_id: environment.organizationId,
          organization_slug: sourceProviderRedactedRequest.organizationSlug,
          name: environment.projectName,
          region: environment.region,
          created_at: sourceCreatedAt,
          status: 'COMING_UP',
        },
      },
      observedAt: '1999-12-31T23:59:26Z',
    })
  );
  const sourceProjectProviderObservation = add(
    writeJsonArtifact(directory, 'source-provider-project-observation.json', {
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${environment.projectRef}`,
      },
      response: {
        status: 200,
        body: {
          id: environment.projectRef,
          ref: environment.projectRef,
          organization_id: environment.organizationId,
          organization_slug: sourceProviderRedactedRequest.organizationSlug,
          name: environment.projectName,
          region: environment.region,
          created_at: sourceCreatedAt,
          status: 'ACTIVE_HEALTHY',
          database: {
            host: environment.databaseHost,
            version: environment.databaseVersion,
            postgres_engine: '17',
            release_channel: 'ga',
          },
        },
      },
      observedAt: '1999-12-31T23:59:29Z',
    })
  );
  const sourceComputeProviderObservation = add(
    writeJsonArtifact(directory, 'source-provider-compute-observation.json', {
      request: {
        method: 'GET',
        url: `https://api.supabase.com/v1/projects/${environment.projectRef}/billing/addons`,
      },
      response: {
        status: 200,
        body: {
          selected_addons: [
            {
              type: 'compute_instance',
              variant: {
                id: 'ci_large',
                name: 'Large',
                price: {
                  description: 'Large compute',
                  type: 'fixed',
                  interval: 'hourly',
                  amount: 0.1517,
                },
                meta: null,
              },
            },
          ],
          available_addons: [],
        },
      },
      observedAt: sourceProvisionedAt,
    })
  );
  const sourceProviderExport = add(
    writeJsonArtifact(directory, 'source-project-provider-export.json', {
      schemaVersion: 1,
      exportType: 'SUPABASE_SOURCE_PROJECT_PROVIDER_EXPORT',
      status: 'CAPTURED',
      provider: 'SUPABASE_MANAGEMENT_API',
      captureMethod:
        'HASH_BOUND_REDACTED_REQUEST_PROVIDER_HTTP_ENVELOPES_AND_BILLING_DASHBOARD_ENTITLEMENT',
      actionId: 'PR12-ACTION-003',
      providerOperationIdentifierAvailability:
        'NOT_EXPOSED_BY_DOCUMENTED_CREATE_RESPONSE',
      request: {
        ...sourceProviderRedactedRequest,
        redactedRequestSha256: sha256(
          JSON.stringify(sourceProviderRedactedWireBody)
        ),
      },
      organizationEntitlementObservation: {
        source: 'SUPABASE_BILLING_DASHBOARD',
        captureMethod: 'OWNER_READ_ONLY_SCREENSHOT_WITH_NORMALIZED_METADATA',
        organizationId: environment.organizationId,
        organizationSlug: sourceProviderRedactedRequest.organizationSlug,
        organizationPlan: 'PRO',
        actualDashboardQuoteUsd: 40,
        observedAt: '1999-12-31T23:58:30Z',
        rawArtifact: binding(sourceOrganizationEntitlementRaw),
      },
      regionAvailabilityObservation: {
        httpMethod: 'GET',
        endpoint: `https://api.supabase.com/v1/projects/available-regions?organization_slug=${sourceProviderRedactedRequest.organizationSlug}&desired_instance_size=large`,
        httpStatus: 200,
        organizationSlug: sourceProviderRedactedRequest.organizationSlug,
        desiredInstanceSize: 'large',
        selectionType: 'specific',
        regionCode: environment.region,
        provider: 'AWS',
        capacityStatus: 'capacity',
        observedAt: '1999-12-31T23:59:20.400Z',
      },
      createResponse: {
        httpStatus: 201,
        projectRef: environment.projectRef,
        organizationId: environment.organizationId,
        organizationSlug: sourceProviderRedactedRequest.organizationSlug,
        projectName: environment.projectName,
        region: environment.region,
        createdAt: sourceCreatedAt,
        status: 'COMING_UP',
      },
      projectObservation: {
        httpMethod: 'GET',
        endpoint: `https://api.supabase.com/v1/projects/${environment.projectRef}`,
        httpStatus: 200,
        projectRef: environment.projectRef,
        projectName: environment.projectName,
        region: environment.region,
        status: 'ACTIVE_HEALTHY',
        databaseHost: environment.databaseHost,
        databaseVersion: environment.databaseVersion,
        observedAt: '1999-12-31T23:59:29Z',
      },
      computeObservation: {
        httpMethod: 'GET',
        endpoint: `https://api.supabase.com/v1/projects/${environment.projectRef}/billing/addons`,
        httpStatus: 200,
        projectRef: environment.projectRef,
        variantId: 'ci_large',
        observedAt: sourceProvisionedAt,
      },
      rawProviderArtifacts: [
        binding(sourceOrganizationEntitlementRaw),
        binding(sourceRegionAvailabilityRaw),
        binding(sourceCreateProviderResponse),
        binding(sourceProjectProviderObservation),
        binding(sourceComputeProviderObservation),
      ],
      capturedAt: sourceProvisionedAt,
      capturedBy: 'synthetic_platform_owner',
    })
  );
  const provisioningApproval = add(
    writeJsonArtifact(directory, 'source-project-provisioning-approved.json', {
      schemaVersion: 1,
      phase: 'SOURCE_PROJECT_PROVISIONING',
      status: 'APPROVED',
      target: { gitCommit: head, baseCommit },
      governanceProposal: binding(governanceProposal),
      credentialControls: {
        credentialContract: binding(credentialContract),
        credentialProviderConfiguration: binding(
          sourceCredentialProviderConfiguration
        ),
        databasePasswordSecretName: 'PR12_SOURCE_DB_PASSWORD',
        managementAccessTokenSecretName: 'PR12_SUPABASE_ACCESS_TOKEN',
        providerConfigurationMustExistBeforeApproval: true,
        secretValuesCaptured: false,
      },
      authorization: {
        sourceProjectProvisioningAuthorized: true,
        isolatedStagingConnectionAuthorized: false,
        isolatedStagingExecutionAuthorized: false,
        restoreProjectCreationAuthorized: false,
        productionConnectionAuthorized: false,
        readyTransitionAuthorized: false,
        mergeAuthorized: false,
        commercialReleaseAuthorized: false,
        indexRetirementAuthorized: false,
      },
      provisioningAction: {
        actionId: 'PR12-ACTION-003',
        resultType: 'SOURCE_PROJECT_PROVISIONING_OPERATION',
        method: 'OWNER_MANAGEMENT_API_CREATE_PROJECT',
        httpMethod: 'POST',
        endpoint: 'https://api.supabase.com/v1/projects',
        regionSelectionType: 'specific',
        desiredInstanceSize: 'large',
        databasePasswordSource: 'OWNER_SECRET_STORE_RUNTIME_INJECTION',
        databasePasswordMinimumLength: 32,
        databasePasswordTransmission:
          'HTTPS_JSON_BODY_RUNTIME_INJECTION_REDACTED_BEFORE_CAPTURE',
        databasePasswordValueMayBeLoggedPersistedOrPassedInArguments: false,
        managementAccessTokenSource: 'OWNER_SECRET_STORE_RUNTIME_INJECTION',
        managementAccessTokenValueMayBeLoggedPersistedOrPassedInArguments: false,
        rawSecretValuesMayBeCaptured: false,
        providerCreatedAtMaximumClockSkewSeconds: 300,
        documentedProviderOperationIdExpected: false,
        remoteContact: true,
        mutating: true,
        mutationScope: 'SOURCE_PROJECT_CREATION',
        maximumExecutionCount: 1,
        databaseConnectionAuthorized: false,
        resultMustBeHashBound: true,
      },
      environmentProposal: {
        organizationId: environment.organizationId,
        organizationSlug: sourceProviderRedactedRequest.organizationSlug,
        organizationPlan: environment.organizationPlan,
        projectName: environment.projectName,
        region: environment.region,
        databaseTier: environment.databaseTier,
        postgresMajor: 17,
        prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
        dataApi: {
          enabled: true,
          exposedSchemas: ['public'],
          automaticallyExposeNewTablesAndFunctions: false,
        },
        graphQl: {
          pgGraphqlEnabledAtProvisioning: false,
          introspectionEnabledAtProvisioning: false,
        },
        auth: environment.authProvisioning,
      },
      approval: {
        approvedBy: 'synthetic_provision_approver',
        approvedAt: provisioningApprovedAt,
        expiresAt: futureTimestamp,
        evidencePath: approvalEvidence.path,
        evidenceSha256: approvalEvidence.sha256,
      },
      lifecycle: {
        sourceMaximumHoursFromCreation: 72,
        automaticDeletionAuthorized: false,
        deletionRequiresSeparateApproval: true,
        fundedRetentionAndCleanupDecisionRequiredBeforeProvisioning: true,
      },
      cost: {
        proposedBudgetCeilingUsd: 50,
        actualDashboardQuoteUsd: 40,
        ceilingEnforceableWithoutCleanupApproval: false,
      },
      retentionAndCleanupDecision: {
        disposition:
          'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION',
        sourceFundedHours: 72,
        restoreFundedHours: 24,
        fundingMustCoverHoursAfterApprovalExpiry: 72,
        fundedThrough: sourceProvisioningFundedThrough,
        fundingCeilingUsd: 50,
        extensionRequiresSeparateApproval: true,
        cleanupOwner: 'synthetic_cleanup_owner',
      },
      owners: {
        commercialReleaseOwner: 'synthetic_provision_approver',
        supabasePlatformOwner: 'synthetic_platform_owner',
        databaseMigrationOperator: 'synthetic_migration_operator',
        disasterRecoveryOperator: 'synthetic_dr_operator',
        securityTenantReviewer: 'synthetic_security_reviewer',
        clinicalDataPrivacyReviewer: 'synthetic_privacy_reviewer',
        billingMessagingSandboxOwner: 'synthetic_billing_owner',
        siteReliabilityOwner: 'synthetic_sre_owner',
        incidentCommander: 'synthetic_incident_commander',
        cleanupOwner: 'synthetic_cleanup_owner',
        evidenceCustodian: 'synthetic_provision_evidence_custodian',
      },
    })
  );
  const provisioningResult = add(
    writeJsonArtifact(directory, 'source-project-provisioning-result.json', {
      schemaVersion: 1,
      phase: 'SOURCE_PROJECT_PROVISIONING_RESULT',
      resultType: 'SOURCE_PROJECT_PROVISIONING_OPERATION',
      status: 'PASS',
      approval: binding(provisioningApproval),
      actionId: 'PR12-ACTION-003',
      gitCommit: head,
      providerOperationIdentifierAvailability:
        'NOT_EXPOSED_BY_DOCUMENTED_CREATE_RESPONSE',
      providerEvidence: binding(sourceProviderExport),
      createdEnvironment: {
        organizationId: environment.organizationId,
        organizationPlan: environment.organizationPlan,
        projectRef: environment.projectRef,
        projectName: environment.projectName,
        projectUrl: environment.projectUrl,
        databaseHost: environment.databaseHost,
        databaseConnectionMode: environment.databaseConnectionMode,
        databaseUser: environment.databaseUser,
        region: environment.region,
        databaseTier: environment.databaseTier,
        databaseVersion: environment.databaseVersion,
      },
      databaseObservation: {
        databaseConnectionPerformed: false,
        systemIdentifierCaptured: false,
        databaseClockCaptured: false,
      },
      actionStartedAt: '1999-12-31T23:59:20Z',
      organizationEntitlementObservedAt: '1999-12-31T23:58:30Z',
      regionAvailabilityObservedAt: '1999-12-31T23:59:20.400Z',
      requestSentAt: '1999-12-31T23:59:21Z',
      createResponseReceivedAt: '1999-12-31T23:59:26Z',
      sourceCreatedAt,
      sourceProvisionedAt,
      capturedAt: sourceProvisionedAt,
      operator: 'synthetic_platform_owner',
    })
  );
  const approvedOwners = {
    commercialReleaseOwner: 'synthetic_approver',
    supabasePlatformOwner: 'synthetic_platform_owner',
    databaseMigrationOperator: options.selfApproveMigration
      ? 'synthetic_approver'
      : 'synthetic_migration_operator',
    disasterRecoveryOperator: 'synthetic_dr_operator',
    securityTenantReviewer: 'synthetic_security_reviewer',
    clinicalDataPrivacyReviewer: 'synthetic_privacy_reviewer',
    billingMessagingSandboxOwner: 'synthetic_billing_owner',
    siteReliabilityOwner: 'synthetic_sre_owner',
    incidentCommander: 'synthetic_incident_commander',
    cleanupOwner: options.selfApproveCleanup
      ? 'synthetic_approver'
      : 'synthetic_cleanup_owner',
    evidenceCustodian: 'synthetic_evidence_custodian',
  };
  const sourceRetentionDeadline = new Date(
    Date.parse(sourceCreatedAt) + 71 * 60 * 60 * 1000
  ).toISOString();
  const commGateMap = add(
    writeArtifact(
      directory,
      'comm-gate-evidence-map-v1.json',
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/stabilization/evidence/commercial-hardening/pr12/comm-gate-evidence-map-v1.json'
        )
      )
    )
  );
  const phasePreExecutionFreeze = {
    migrationInputContract: binding(migrationInputContract),
    targetGuardImplementation: binding(generalEvidence),
    sourceIdentityCollector: binding(generalEvidence),
    sourcePlatformConfigurationCollector: binding(generalEvidence),
    migrationReplayCollector: binding(generalEvidence),
    postReplayCatalogCollector: binding(generalEvidence),
    migrationHistoryCollector: binding(generalEvidence),
    credentialContract: binding(credentialContract),
    credentialProviderConfiguration: binding(
      sourceCredentialProviderConfiguration
    ),
    toolVersionOutputs: {
      node: binding(nodeVersionStdout),
      supabaseCli: binding(supabaseVersionStdout),
      psql: binding(psqlVersionStdout),
    },
    toolBinaries: {
      supabaseCli: {
        path: supabaseBinaryPath,
        sha256: supabaseCliSha256,
      },
      psql: { path: psqlBinaryPath, sha256: psqlBinarySha256 },
    },
  };
  const sourceBootstrapApproval = add(
    writeJsonArtifact(directory, 'source-identity-bootstrap-approved.json', {
      schemaVersion: 1,
      phase: 'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP',
      status: 'APPROVED',
      authorization: {
        sourceIdentityConnectionAuthorized: true,
        sourceIdentityCaptureAuthorized: true,
        sourceLinkAuthorized: false,
        cleanMigrationReplayAuthorized: false,
        representativeSeedAuthorized: false,
        fullQualificationAuthorized: false,
        restoreProjectCreationAuthorized: false,
        productionConnectionAuthorized: false,
        readyTransitionAuthorized: false,
        mergeAuthorized: false,
        commercialReleaseAuthorized: false,
        indexRetirementAuthorized: false,
      },
      governanceProposal: binding(governanceProposal),
      sourceProjectProvisioningApproval: binding(provisioningApproval),
      sourceProjectProvisioningResult: binding(provisioningResult),
      phaseCommandLedger: binding(sourceBootstrapPhaseLedger),
      preExecutionFreeze: phasePreExecutionFreeze,
      target: {
        gitCommit: head,
        baseCommit,
        migrationHead,
        environmentProjectRef: sourceProjectRef,
        projectUrl: environment.projectUrl,
        databaseHost: environment.databaseHost,
        databaseConnectionMode: environment.databaseConnectionMode,
        databaseUser: environment.databaseUser,
        databaseVersion: environment.databaseVersion,
      },
      firstSourceIdentityAndClockCommand: {
        commandId: 'PR12-CMD-004A',
        resultType: 'SOURCE_IDENTITY_CLOCK_OPERATION',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
        preKnownSystemIdentifierRequired: false,
        mustCompleteBeforeLinkHistoryAdvisorOrReplay: true,
        bootstrapGuardUsesProvisioningResult: true,
        subsequentCommandsMustMatchCapturedSystemIdentifier: true,
        readOnlyPlatformConfigurationCaptureRequired: true,
        requiredConfigurationFamilies: ['DATA_API', 'AUTH', 'GRAPHQL'],
        familySpecificRawArtifactsRequired: true,
        configurationMustMatchProvisioningProposal: true,
      },
      approvedCommandIds: sourceBootstrapCommandIds,
      mandatoryStop: {
        stopAfterCommandId: 'PR12-CMD-004A',
        sourceReplayRequiresSeparatePostCaptureApproval: true,
        automaticContinuationAuthorized: false,
      },
      approval: {
        approvedBy: approvedOwners.commercialReleaseOwner,
        approvedAt: sourceBootstrapApprovedAt,
        expiresAt: futureTimestamp,
        evidencePath: approvalEvidence.path,
        evidenceSha256: approvalEvidence.sha256,
      },
      owners: approvedOwners,
    })
  );
  const sourceBootstrapResult = add(
    writeJsonArtifact(directory, 'source-identity-bootstrap-result.json', {
      schemaVersion: 1,
      phase: 'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP_RESULT',
      resultType: 'SOURCE_IDENTITY_CLOCK_OPERATION',
      status: 'PASS',
      approval: binding(sourceBootstrapApproval),
      commandId: 'PR12-CMD-004A',
      gitCommit: head,
      runtimeIdentity: sourceRuntimeIdentity,
      sourceDatabaseUtc: '1999-12-31T23:59:36Z',
      preReplayPlatformConfiguration,
      capturedAt: sourceBootstrapCapturedAt,
      commandStdout: binding(sourceIdentityClockOperation),
      mandatoryStopObserved: true,
    })
  );
  const sourceReplayApproval = add(
    writeJsonArtifact(directory, 'source-replay-catalog-approved.json', {
      schemaVersion: 1,
      phase: 'ISOLATED_STAGING_SOURCE_REPLAY_CATALOG_CAPTURE',
      status: 'APPROVED',
      authorization: {
        isolatedStagingConnectionAuthorized: true,
        cleanMigrationReplayAuthorized: true,
        postReplayCatalogCaptureAuthorized: true,
        representativeSeedAuthorized: false,
        fullQualificationAuthorized: false,
        restoreProjectCreationAuthorized: false,
        productionConnectionAuthorized: false,
        readyTransitionAuthorized: false,
        mergeAuthorized: false,
        commercialReleaseAuthorized: false,
        indexRetirementAuthorized: false,
      },
      governanceProposal: binding(governanceProposal),
      sourceProjectProvisioningApproval: binding(provisioningApproval),
      sourceProjectProvisioningResult: binding(provisioningResult),
      sourceIdentityBootstrapApproval: binding(sourceBootstrapApproval),
      sourceIdentityBootstrapResult: binding(sourceBootstrapResult),
      phaseCommandLedger: binding(sourceReplayPhaseLedger),
      preExecutionFreeze: phasePreExecutionFreeze,
      target: {
        gitCommit: head,
        baseCommit,
        migrationHead,
        environmentProjectRef: sourceProjectRef,
        systemIdentifier: environment.systemIdentifier,
      },
      approvedCommandIds: sourceReplayCommandIds,
      postBootstrapReapproval: {
        bootstrapResultMustBePass: true,
        approvalMustBeAfterBootstrapCapturedAt: true,
        systemIdentifierMustEqualBootstrapResult: true,
        automaticContinuationAuthorized: false,
      },
      approval: {
        approvedBy: approvedOwners.commercialReleaseOwner,
        approvedAt: sourceReplayApprovedAt,
        expiresAt: futureTimestamp,
        evidencePath: approvalEvidence.path,
        evidenceSha256: approvalEvidence.sha256,
      },
      owners: approvedOwners,
    })
  );
  const sourceReplayResult = add(
    writeJsonArtifact(directory, 'source-replay-catalog-result.json', {
      schemaVersion: 1,
      phase: 'ISOLATED_STAGING_SOURCE_REPLAY_CATALOG_CAPTURE_RESULT',
      status: 'PASS',
      approval: binding(sourceReplayApproval),
      environmentProjectRef: sourceProjectRef,
      gitCommit: head,
      migrationHead,
      executedCommandIds: sourceReplayCommandIds,
      completedAt: migrationHistoryCompletedAt,
      sourceIdentityClockCommandId: 'PR12-CMD-004A',
      sourceIdentityClockOperation: binding(sourceIdentityClockOperation),
      preconditionCommandId: 'PR12-CMD-004',
      preconditionResult: binding(cleanReplayPrecondition),
      dryRunCommandId: 'PR12-CMD-005',
      dryRunResult: binding(migrationReplayDryRun),
      migrationReplayCommandId: 'PR12-CMD-007',
      migrationReplayOperation: binding(migrationReplayOperation),
      catalogCaptureCommandId: 'PR12-CMD-007A',
      catalogCapture: binding(postReplayCatalogCaptureEnvelope),
      migrationHistoryCommandId: 'PR12-CMD-008A',
      migrationHistoryResult: binding(migrationHistoryResult),
    })
  );
  const approvalBinding = add(
    writeJsonArtifact(directory, 'approved-binding.json', {
      schemaVersion: 1,
      status: 'APPROVED',
      authorization: {
        sourceProjectProvisioningAuthorized: false,
        isolatedStagingConnectionAuthorized: true,
        isolatedStagingExecutionAuthorized: true,
        restoreProjectCreationAuthorized: false,
        restoreProjectConnectionAuthorized: false,
        postRestoreValidationAuthorized: false,
        readyTransitionAuthorized: false,
        mergeAuthorized: false,
        productionConnectionAuthorized: false,
        commercialReleaseAuthorized: false,
        indexRetirementAuthorized: false,
      },
      governanceProposal: binding(governanceProposal),
      sourceProjectProvisioningApproval: binding(provisioningApproval),
      sourceProjectProvisioningResult: binding(provisioningResult),
      sourceIdentityBootstrapApproval: binding(sourceBootstrapApproval),
      sourceIdentityBootstrapResult: binding(sourceBootstrapResult),
      sourceReplayCatalogCaptureApproval: binding(sourceReplayApproval),
      sourceReplayCatalogCaptureResult: binding(sourceReplayResult),
      target: {
        gitCommit: head,
        baseCommit,
        migrationHead,
        migrationInputContract: binding(migrationInputContract),
      },
      environment: {
        organizationId: environment.organizationId,
        organizationPlan: environment.organizationPlan,
        projectRef: environment.projectRef,
        projectName: environment.projectName,
        projectUrl: environment.projectUrl,
        databaseHost: environment.databaseHost,
        databaseConnectionMode: environment.databaseConnectionMode,
        databaseUser: environment.databaseUser,
        region: environment.region,
        databaseTier: environment.databaseTier,
        databaseVersion: environment.databaseVersion,
        systemIdentifier: environment.systemIdentifier,
        authProvisioning: environment.authProvisioning,
        prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
        dataApiProvisioning: {
          enabled: true,
          exposedSchemas: ['public'],
          automaticallyExposeNewTablesAndFunctions: false,
        },
        graphQlProvisioning: {
          pgGraphqlEnabled: false,
          introspectionEnabled: false,
          exposedSchemas: [],
        },
      },
      ownerDecisions: {
        smallFlowSecurityDatasetAcceptedAsCapacityRepresentative: false,
        smallFlowSecurityDatasetAcceptedForFlowAndSecurityOnly: true,
        productionTierParityAccepted: true,
        rto8hRpo24hAcceptedDespiteProduct30m15mTarget: true,
        actualDashboardQuoteAccepted: true,
        fundedRetentionAndCleanupDecisionAccepted: true,
        upstashDisposition: 'DISABLED',
      },
      lifecycle: {
        sourceCreatedAt,
        sourceProvisionedAt,
        sourceRetentionDeadline,
        fundedThrough: restoreFundedThrough,
        sourceMaximumHoursFromCreation: 72,
        restoreMaximumHoursFromCreation: 24,
        cleanupDisposition:
          'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION',
        fundingCeilingUsd: 50,
        cleanupOwner: approvedOwners.cleanupOwner,
        automaticDeletionAuthorized: false,
        deletionRequiresSeparateApproval: true,
        billingExtensionAfterDeadlineRequiresSeparateFundedApproval: true,
      },
      cost: {
        computeRateUsdPerProjectHour: 0.1517,
        computeSubtotalUsd: 14.5632,
        proposedBudgetCeilingUsd: 50,
        actualDashboardQuoteUsd: 40,
        ceilingEnforceableWithoutCleanupApproval: false,
      },
      toolVersions,
      toolVersionCommands: {
        node: 'capture-node-version',
        supabaseCli: 'capture-supabase-version',
        psql: 'capture-psql-version',
      },
      toolBinaries: {
        supabaseCli: {
          path: supabaseBinaryPath,
          sha256: supabaseCliSha256,
          hashCommandId: 'hash-supabase-binary',
          archivePath: supabaseArchivePath,
          archiveSha256: supabaseCliArchiveSha256,
          archiveHashCommandId: 'hash-supabase-archive',
        },
        psql: {
          path: psqlBinaryPath,
          sha256: psqlBinarySha256,
          hashCommandId: 'hash-psql-binary',
        },
      },
      bindings: {
        securityMatrix: binding(securityContract),
        securityTargetInventory: binding(securityTargetInventory),
        securityTargetClassification: binding(securityTargetClassification),
        dataApiMatrix: binding(dataApiContract),
        graphQlMatrix: binding(graphQlContract),
        performanceContract: binding(performanceContract),
        hostedSloContract: binding(hostedContract),
        representativeDataContract: binding(representativeDataContract),
        commandLedger: binding(commandLedger),
        drContract: binding(drContract),
        integrationContract: binding(integrationContract),
        credentialContract: binding(credentialContract),
        commGateEvidenceMap: binding(commGateMap),
      },
      approval: {
        approvedBy: 'synthetic_approver',
        approvedAt: options.approvalAt ?? migrationHistoryCompletedAt,
        expiresAt: futureTimestamp,
        evidencePath: approvalEvidence.path,
        evidenceSha256: approvalEvidence.sha256,
      },
      owners: approvedOwners,
    })
  );
  const selectedBackup = {
    sourceProjectRef: environment.projectRef,
    backupId: 'synthetic-backup-id',
    backupMetadataPath: backupArtifact.path,
    backupMetadataSha256: backupArtifact.sha256,
    backupInventoryRawPath: backupProviderInventory.path,
    backupInventoryRawSha256: backupProviderInventory.sha256,
    watermarkValue: syntheticWatermark,
  };
  const restoreCreationApproval = add(
    writeJsonArtifact(directory, 'restore-creation-approved.json', {
      schemaVersion: 1,
      phase: 'RESTORE_PROJECT_CREATION',
      status: 'APPROVED',
      authorization: {
        restoreProjectCreationAuthorized: true,
        restoreProjectConnectionAuthorized: false,
        postRestoreValidationAuthorized: false,
        sourceProjectMutationAuthorized: false,
        productionConnectionAuthorized: false,
        readyTransitionAuthorized: false,
        mergeAuthorized: false,
        commercialReleaseAuthorized: false,
        indexRetirementAuthorized: false,
      },
      sourceExecutionApproval: binding(approvalBinding),
      selectedBackup,
      sourceExternalSideEffectInventory: binding(sourceSideEffectResult),
      restoreSelection: {
        sourceProjectRef: environment.projectRef,
        organizationId: environment.organizationId,
        backupId: 'synthetic-backup-id',
        backupMetadataSha256: backupArtifact.sha256,
        requestedName: restoreEnvironment.projectName,
        prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
      },
      expectedMirroredState: {
        freshSourceConfigurationSnapshot: binding(sourceMirroredConfiguration),
        sameRegion: true,
        computeAddonVariant: 'ci_large',
        diskAttributes: 'EXACT_SOURCE_SNAPSHOT_MATCH_REQUIRED',
        sslEnforcement: 'EXACT_SOURCE_SNAPSHOT_MATCH_REQUIRED',
        networkRestrictions: 'EXACT_SOURCE_SNAPSHOT_MATCH_REQUIRED',
        databaseVersionIsPostCreationObservationNotRequestInput: true,
      },
      lifecycle: {
        restoreMaximumHoursFromCreation: 24,
        cleanupDisposition:
          'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION',
        fundedThrough: restoreFundedThrough,
        fundingCeilingUsd: 50,
        cleanupOwner: approvedOwners.cleanupOwner,
        automaticDeletionAuthorized: false,
        deletionRequiresSeparateApproval: true,
        extensionRequiresSeparateApproval: true,
      },
      cost: {
        proposedBudgetCeilingUsd: 50,
        quote: {
          sourceProjectRef: environment.projectRef,
          backupId: 'synthetic-backup-id',
          currency: 'USD',
          cadence: 'RESTORE_PROJECT_CREATION_ESTIMATE',
          lineItems: [
            { id: 'compute_large', amountUsd: 20 },
            { id: 'mirrored_disk', amountUsd: 20 },
          ],
          normalizedTotalUsd: 40,
          observedAt: '2000-01-01T00:01:26Z',
          rawArtifact: binding(restoreQuoteRaw),
        },
        actualDashboardQuoteAccepted: true,
        acceptedAt: '2000-01-01T00:01:29Z',
        acceptedBy: approvedOwners.commercialReleaseOwner,
      },
      clockPolicy: {
        maximumAllowedClockSkewSeconds: 300,
        maximumRpoObservationLeadSeconds: 5,
        ownerAccepted: true,
        collectorStatus: 'PROVIDER_CREATED_AT_FROM_MANAGEMENT_API',
        rtoRpoPassAllowed: true,
      },
      approval: {
        approvedBy: approvedOwners.commercialReleaseOwner,
        approvedAt: restoreCreationApprovedAt,
        expiresAt: futureTimestamp,
        evidencePath: approvalEvidence.path,
        evidenceSha256: approvalEvidence.sha256,
      },
      owners: approvedOwners,
    })
  );
  const restoreSupplementalApproval = add(
    writeJsonArtifact(directory, 'restore-supplemental-approved.json', {
      schemaVersion: 1,
      phase: 'RESTORE_TARGET_VALIDATION',
      status: 'APPROVED',
      authorization: {
        restoreProjectConnectionAuthorized: true,
        postRestoreValidationAuthorized: true,
        approvedQualificationMutationAuthorized: true,
        restoreProjectGeneralMutationAuthorized: false,
        sourceProjectMutationAuthorized: false,
        productionConnectionAuthorized: false,
        readyTransitionAuthorized: false,
        mergeAuthorized: false,
        commercialReleaseAuthorized: false,
        indexRetirementAuthorized: false,
      },
      sourceExecutionApproval: binding(approvalBinding),
      restoreCreationApproval: binding(restoreCreationApproval),
      restoreCreationOperation: {
        path: restoreCreationOperation.path,
        sha256: restoreCreationOperation.sha256,
        commandId: 'PR12-ACTION-017',
        providerOperationIdentifierAvailability:
          'NOT_EXPOSED_BY_DOCUMENTED_RESTORE_TO_NEW_PROJECT_FLOW',
        createdProjectRef: restoreEnvironment.projectRef,
        providerCreatedAt: restoreProviderCreatedAt,
        restoreReadyObservedAt,
        providerEvidence: binding(restoreProviderExport),
      },
      credentialControls: {
        credentialContract: binding(credentialContract),
        restoreCredentialProviderConfiguration: binding(
          restoreCredentialProviderConfiguration
        ),
        parentEnvironmentPrefix: 'PR12_RESTORE_',
        crossTargetFallbackAllowed: false,
        secretValuesCaptured: false,
      },
      selectedBackup,
      sourceEnvironment: {
        organizationId: environment.organizationId,
        projectRef: environment.projectRef,
        projectName: environment.projectName,
        region: environment.region,
        databaseTier: environment.databaseTier,
        databaseVersion: environment.databaseVersion,
        systemIdentifier: environment.systemIdentifier,
        databaseHost: environment.databaseHost,
        databaseConnectionMode: environment.databaseConnectionMode,
        databaseUser: environment.databaseUser,
      },
      restoreEnvironment: {
        organizationId: restoreEnvironment.organizationId,
        projectRef: restoreEnvironment.projectRef,
        projectName: restoreEnvironment.projectName,
        region: restoreEnvironment.region,
        databaseTier: restoreEnvironment.databaseTier,
        databaseVersion: restoreEnvironment.databaseVersion,
        projectUrl: restoreEnvironment.projectUrl,
        databaseHost: restoreEnvironment.databaseHost,
        databaseConnectionMode: restoreEnvironment.databaseConnectionMode,
        databaseUser: restoreEnvironment.databaseUser,
      },
      firstSupplementalIdentityAndClockCommand: {
        commandId: 'PR12-CMD-018',
        resultType: 'RESTORE_IDENTITY_CLOCK_OPERATION',
        status: 'APPROVED_NOT_RUN',
        remoteContact: true,
        mutating: false,
        mutationScope: 'NONE',
        requiredCapturedFields: [
          'restore project ref',
          'project URL',
          'direct database host and user',
          'database version',
          'database system identifier',
          'restore database clock_timestamp() UTC',
          'command start/end UTC',
          'stdout/stderr SHA-256',
        ],
        mustCompleteBeforeAnyOtherRestoreCommand: true,
        sourceAndRestoreSystemIdentifierRelationshipMustBeObserved: true,
      },
      approvedQualificationMutationCommandIds: restoreMutationCommandIds,
      postRestoreContracts: {
        securityMatrix: binding(securityContract),
        securityTargetInventory: binding(securityTargetInventory),
        securityTargetClassification: binding(securityTargetClassification),
        dataApi: binding(dataApiContract),
        graphQl: binding(graphQlContract),
      },
      resultProvenance: {
        validationCommandIdsMustExactlyEqualApprovedLedgerPhase:
          'post_restore_qualification',
        dedicatedCommandStdoutRequiredFor: [
          'integrity',
          'securityMatrix',
          'dataApi',
          'graphQl',
        ],
        finalOperationMustHashBindEveryDedicatedResult: true,
        freshRestoreRuntimeIdentityRequired: true,
        sourceEvidenceReuseAllowed: false,
        restoreRawEvidenceMustBeHashBoundAndCommandScoped: true,
        familySpecificRawObservationReconciliationRequired: true,
        finalizationMustBeNonMutating: true,
      },
      identityConstraints: {
        prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
        sourceAndRestoreProjectRefsMustDiffer: true,
        sourceAndRestoreSystemIdentifierRelationshipPolicy:
          'OBSERVE_SAME_OR_DIFFERENT_NO_CROSS_TARGET_VERDICT',
        organizationMustMatch: true,
        regionAndTierMustMatchApprovedDrContract: true,
        currentLinkMustMatchRestoreRefBeforeEveryRemoteCommand: true,
      },
      approval: {
        approvedBy: approvedOwners.commercialReleaseOwner,
        approvedAt: supplementalApprovedAt,
        expiresAt: futureTimestamp,
        evidencePath: approvalEvidence.path,
        evidenceSha256: approvalEvidence.sha256,
      },
      owners: approvedOwners,
    })
  );
  const gateSource = fs.readFileSync(
    path.join(repoRoot, 'docs/releases/current-gate-status.yaml'),
    'utf8'
  );
  const commGateIds = [
    ...gateSource.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gmu),
  ].map(match => match[1]);
  const parsedCommGateMap = requireRecord(
    JSON.parse(fs.readFileSync(path.join(directory, commGateMap.path), 'utf8')),
    'COMM gate evidence map'
  );
  const mapRows = requireArray(
    parsedCommGateMap.gates,
    'COMM gate evidence map gates'
  ).map((value, index) =>
    requireRecord(value, `COMM gate evidence map gate ${String(index)}`)
  );
  const mapById = new Map(mapRows.map(row => [String(row.id), row]));
  const familyDefaults = requireRecord(
    parsedCommGateMap.familyDefaults,
    'COMM gate family defaults'
  );
  const resultTypes: Record<string, string> = {
    DB: 'DATABASE_QUALIFICATION_RESULT',
    TENANT: 'TENANT_ISOLATION_RESULT',
    AUTH: 'AUTHORIZATION_BOUNDARY_RESULT',
    API: 'API_EXPOSURE_RESULT',
    BILL: 'BILLING_SANDBOX_RESULT',
    OPS: 'OPERATIONS_DR_RESULT',
  };
  const gateResults = commGateIds.map(id => {
    const family = /^COMM-([A-Z]+)-\d{3}$/u.exec(id)?.[1];
    if (!family || !(family in resultTypes)) {
      throw new TypeError(`unsupported synthetic COMM family for ${id}`);
    }
    const mapRow = requireRecord(mapById.get(id), `COMM gate map ${id}`);
    const claimIds = [
      ...requireArray(
        familyDefaults[family],
        `COMM gate defaults ${family}`
      ).map(String),
      ...requireArray(mapRow.requires, `COMM gate map ${id} requires`).map(
        String
      ),
    ];
    const finalDerived = id === 'COMM-OPS-011';
    const result = add(
      writeJsonArtifact(directory, `${id.toLowerCase()}-result.json`, {
        schemaVersion: 1,
        gateId: id,
        family: `COMM-${family}`,
        resultType: resultTypes[family],
        status: finalDerived
          ? 'CONDITIONAL_PENDING_TERMINAL_SCAN_AND_FINAL_VERIFIER'
          : 'PASS',
        environmentProjectRef: environment.projectRef,
        gitCommit: head,
        supportingContract: binding(commGateMap),
        checks: claimIds.map(claimId => ({
          id: claimId,
          status:
            finalDerived && claimId !== 'DERIVED.ALL_OTHER_53_COMM_GATES_PASS'
              ? 'CONDITIONAL'
              : 'PASS',
          evidence: [evidencePath],
        })),
        ...(finalDerived
          ? {
              conditionalSignoff: {
                status: 'CONDITIONAL',
                approvedBy: approvedOwners.commercialReleaseOwner,
                signedAt: privacyManualReviewedAt,
                expiresAt: futureTimestamp,
                conditions: [
                  'EXACT_OTHER_53_COMM_GATES_PASS',
                  'TERMINAL_PRIVACY_SCAN_PASS_FOR_THIS_MANIFEST_ARTIFACT_SET',
                  'FINAL_VERIFIER_PASS_WITHOUT_POST_SCAN_EVIDENCE_MUTATION',
                ],
              },
            }
          : {}),
      })
    );
    return { id, result };
  });
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    qualificationId: 'PR12-SYNTHETIC-VERIFIER-TEST',
    status: 'PASS',
    source: {
      gitCommit: head,
      baseCommit,
      migrationHead,
      approvalPacketPath: approvalBinding.path,
      approvalPacketSha256: approvalBinding.sha256,
    },
    commGateEvidenceMap: binding(commGateMap),
    environment,
    credentialHandling: {
      contractPath: credentialContract.path,
      contractSha256: credentialContract.sha256,
      ...credentialPolicy,
      targetResults: {
        source: {
          status: 'PASS',
          targetKind: 'SOURCE',
          providerConfigurationPath: sourceCredentialProviderConfiguration.path,
          providerConfigurationSha256:
            sourceCredentialProviderConfiguration.sha256,
          evidence: [evidencePath],
        },
        restore: {
          status: 'PASS',
          targetKind: 'RESTORE',
          providerConfigurationPath:
            restoreCredentialProviderConfiguration.path,
          providerConfigurationSha256:
            restoreCredentialProviderConfiguration.sha256,
          evidence: [evidencePath],
        },
      },
      crossTargetIsolation: {
        status: 'PASS',
        projectRefsDiffer: true,
        databaseHostsDiffer: true,
        anonKeyFingerprintsDiffer: true,
        serviceRoleKeyFingerprintsDiffer: true,
        databasePasswordFingerprintsDiffer: true,
      },
      status: 'PASS',
      evidence: [evidencePath],
    },
    toolVersions,
    toolBinaries: {
      supabaseCli: {
        path: supabaseBinaryPath,
        sha256: supabaseCliSha256,
        hashCommandId: 'hash-supabase-binary',
        archivePath: supabaseArchivePath,
        archiveSha256: supabaseCliArchiveSha256,
        archiveHashCommandId: 'hash-supabase-archive',
      },
      psql: {
        path: psqlBinaryPath,
        sha256: psqlBinarySha256,
        hashCommandId: 'hash-psql-binary',
      },
    },
    timing: {
      startedAt: sourceBootstrapApprovedAt,
      endedAt: qualificationCompletedAt,
      durationSeconds:
        (Date.parse(qualificationCompletedAt) -
          Date.parse(sourceBootstrapApprovedAt)) /
        1000,
    },
    commands: executionCommands,
    artifacts,
    rowCounts: sourceRowCounts,
    hashes: {
      logicalHash: sourceHashes.logicalHash,
      historicalNormalizedPhysicalHash:
        sourceHashes.historicalNormalizedPhysicalHash,
      environmentPhysicalStructureHash:
        sourceHashes.environmentPhysicalStructureHash,
      schemaHash: sourceHashes.schemaHash,
      preWatermarkDataHash: sourceHashes.dataHash,
      backupDataHash: postWatermarkSourceIntegrity.dataHash,
    },
    cleanReplay: {
      status: 'PASS',
      precondition: binding(cleanReplayPrecondition),
      dryRun: binding(migrationReplayDryRun),
      apply: binding(migrationReplayOperation),
      postApplyMigrationHistory: binding(migrationHistoryResult),
    },
    integrityResults: {
      migrationHistory: binding(migrationHistoryResult),
      generatedTypes: binding(generatedTypesResult),
      source: binding(sourceIntegrityResult),
      postWatermarkSource: binding(backupWatermarkOperation),
      restore: binding(restoreIntegrityResult),
    },
    drScopeInventory: {
      source: binding(sourceDrScopeInventory),
      restore: binding(restoreDrScopeInventory),
      comparison: binding(drScopeComparison),
    },
    sourceStructuredResults: {
      securityMatrix: binding(sourceSecurityResult),
      dataApiGraphQl: binding(sourceDataApiGraphQlResult),
    },
    representativeData: {
      contractPath: representativeDataContract.path,
      contractSha256: representativeDataContract.sha256,
      ...representativeDataValue,
      evidence: [evidencePath],
    },
    performance: {
      contractPath: performanceContract.path,
      contractSha256: performanceContract.sha256,
      ...canonicalPerformancePayload,
      canonicalObservation: binding(canonicalPerformanceResult),
      hostedSlo: {
        ...hostedSloPayload,
        observation: binding(hostedSloResult),
      },
    },
    gates: gateResults.map(({ id, result }) => ({
      id,
      status: id === 'COMM-OPS-011' ? 'NOT_RUN' : 'PASS',
      evidence: [evidencePath],
      resultArtifactPath: result.path,
      resultArtifactSha256: result.sha256,
    })),
    securityMatrix: sourceSecurityMatrix,
    externalSideEffects: {
      source: {
        status: 'PASS',
        mode: 'SANDBOXED',
        attemptedRealDispatchCount: 0,
        providerRealDispatchCount: 0,
        duplicateCount: 0,
        pendingExternalOperationCount: 0,
        productionIdentityDetected: false,
        commandId: 'PR12-CMD-016A',
        capturedAt: sourceSideEffectsCompletedAt,
        artifactPath: sourceSideEffectResult.path,
        artifactSha256: sourceSideEffectResult.sha256,
        serviceRoleNonExposure: sourceServiceRoleNonExposure,
        evidence: [evidencePath],
      },
      restore: {
        status: 'PASS',
        mode: 'DISABLED',
        attemptedRealDispatchCount: 0,
        providerRealDispatchCount: 0,
        duplicateCount: 0,
        pendingExternalOperationCount: 0,
        productionIdentityDetected: false,
        commandId: 'PR12-CMD-019A',
        capturedAt: postRestoreSideEffectsCompletedAt,
        artifactPath: postRestoreSideEffectResult.path,
        artifactSha256: postRestoreSideEffectResult.sha256,
        serviceRoleNonExposure: restoreServiceRoleNonExposure,
        evidence: [evidencePath],
      },
      comparison: {
        status: 'PASS',
        sourceAndRestoreArtifactsDiffer: true,
        requiredFamiliesMatch: true,
      },
    },
    backup: {
      status: 'PASS',
      backupId: 'synthetic-backup-id',
      method: drContractValue.backupMethod,
      scope: drContractValue.backupScope,
      capturedAt: backupInventoryCompletedAt,
      sourceWatermark: syntheticWatermark,
      watermarkCommandId: 'PR12-CMD-017',
      captureCommandId: 'PR12-CMD-017A',
      watermarkOperation: binding(backupWatermarkOperation),
      postWatermarkSourceIntegrity: binding(backupWatermarkOperation),
      artifactPath: backupArtifact.path,
      artifactSha256: backupArtifact.sha256,
      evidence: [evidencePath],
    },
    restore: {
      status: 'PASS',
      creationApprovalPath: restoreCreationApproval.path,
      creationApprovalSha256: restoreCreationApproval.sha256,
      creationCommandId: 'PR12-ACTION-017',
      supplementalApprovalPath: restoreSupplementalApproval.path,
      supplementalApprovalSha256: restoreSupplementalApproval.sha256,
      targetEnvironment: restoreEnvironment,
      providerEvidencePath: restoreProviderExport.path,
      providerEvidenceSha256: restoreProviderExport.sha256,
      providerCreatedAt: restoreProviderCreatedAt,
      restoreReadyObservedAt,
      retentionDeadline: restoreRetentionDeadline,
      cleanupDeadline: restoreRetentionDeadline,
      fundedThrough: restoreFundedThrough,
      validationCommandIds: restoreValidationCommandIds,
      mutationCommandIds: restoreMutationCommandIds,
      restoreSource: drContractValue.restoreSource,
      restorePoint: drContractValue.restorePoint,
      rtoStartEvent: drContractValue.rtoStartEvent,
      rtoEndEvent: drContractValue.rtoEndEvent,
      rtoMeasurementClockAndSource:
        drContractValue.rtoMeasurementClockAndSource,
      rpoWatermarkDefinition: drContractValue.rpoWatermarkDefinition,
      rpoObservationEvent: drContractValue.rpoObservationEvent,
      rpoMeasurementClockAndSource:
        drContractValue.rpoMeasurementClockAndSource,
      rtoStartedAt: restoreActionStartedAt,
      restoreConfirmationAt,
      postRestoreQualificationCompletedAt: postRestoreCompletedAt,
      rpoObservedAt,
      restoredWatermark: syntheticWatermark,
      rtoThresholdSeconds: drContractValue.rtoThresholdSeconds,
      rpoThresholdSeconds: drContractValue.rpoThresholdSeconds,
      rtoSeconds: 610,
      rpoSeconds: 89,
      evidence: [evidencePath],
    },
    postRestore: {
      schemaParity: { status: 'PASS', evidence: [evidencePath] },
      dataParity: { status: 'PASS', evidence: [evidencePath] },
      tenantIsolation: {
        status: 'PASS',
        evidence: [postRestoreSecurityResult.path],
      },
      authBoundary: {
        status: 'PASS',
        evidence: [postRestoreSecurityResult.path],
      },
      dataApiBoundary: {
        status: 'PASS',
        evidence: [postRestoreDataApiResult.path],
      },
      graphQlBoundary: {
        status: 'PASS',
        evidence: [postRestoreGraphQlResult.path],
      },
      structuredResults: {
        securityMatrix: binding(postRestoreSecurityResult),
        dataApi: binding(postRestoreDataApiResult),
        graphQl: binding(postRestoreGraphQlResult),
      },
    },
    ownership: {
      approver: 'synthetic_approver',
      ...approvedOwners,
    },
    privacyScan: {
      status: 'PASS',
      scannedAt: privacyScanCompletedAt,
      scannerVersion: 'pr12-evidence-scan-v2',
      findingCount: 0,
      coverageMode: 'EXACT_MANIFEST_ARTIFACTS_EXCEPT_SCANNER_STREAMS',
      scannedArtifactCount: null,
      machineScanCommandId: 'PR12-CMD-020',
      machineScanEvidence: [machineScan.path],
      manualReviewStatus: 'PASS',
      manualReviewer: 'synthetic_privacy_reviewer',
      manualReviewedAt: privacyManualReviewedAt,
      manualReviewEvidence: [manualPrivacyReviewEvidence.path],
    },
    residualRisk: [],
    expiresAt: futureTimestamp,
  };
  const manifestArtifacts = requireArray(
    manifest.artifacts,
    'manifest.artifacts'
  ).map((value, index) =>
    requireRecord(value, `manifest.artifacts[${String(index)}]`)
  );
  const reviewedArtifacts = manifestArtifacts
    .filter(
      artifact =>
        ![
          machineScan.path,
          machineScanStderr.path,
          manualPrivacyReviewEvidence.path,
        ].includes(String(artifact.path))
    )
    .map(artifact => ({
      path: artifact.path,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      classification: artifact.classification,
    }))
    .sort((left, right) =>
      String(left.path).localeCompare(String(right.path), 'en')
    );
  const manualReviewBytes = Buffer.from(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        resultType: 'PR12_HUMAN_PRIVACY_REVIEW',
        status: 'PASS',
        reviewer: 'synthetic_privacy_reviewer',
        reviewedAt: privacyManualReviewedAt,
        scope:
          'ALL_MANIFEST_ARTIFACTS_EXCEPT_SCANNER_STREAMS_AND_THIS_ATTESTATION',
        reviewedArtifactCount: reviewedArtifacts.length,
        reviewedArtifacts,
        clinicalDataAbsenceClaimed: false,
        residualRisk: [
          'machine patterns and human review reduce but do not prove zero clinical data',
        ],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(directory, manualPrivacyReviewEvidence.path),
    manualReviewBytes
  );
  manualPrivacyReviewEvidence.bytes = manualReviewBytes.length;
  manualPrivacyReviewEvidence.sha256 = sha256(manualReviewBytes);
  const manifestPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  const scan = spawnSync(
    process.execPath,
    [
      path.join(
        repoRoot,
        'scripts/commercial-hardening/scan-pr12-evidence.mjs'
      ),
      '--manifest',
      manifestPath,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (scan.status !== 0) {
    throw new Error(
      `fixture privacy scan failed: ${scan.stderr || scan.stdout}`
    );
  }
  fs.writeFileSync(path.join(directory, machineScan.path), scan.stdout, 'utf8');
  fs.writeFileSync(
    path.join(directory, machineScanStderr.path),
    scan.stderr,
    'utf8'
  );
  for (const artifact of [machineScan, machineScanStderr]) {
    const bytes = fs.readFileSync(path.join(directory, artifact.path));
    artifact.bytes = bytes.length;
    artifact.sha256 = sha256(bytes);
  }
  const scanCommand = requireArray(manifest.commands, 'manifest.commands')
    .map((value, index) =>
      requireRecord(value, `manifest.commands[${String(index)}]`)
    )
    .find(command => command.id === 'PR12-CMD-020');
  if (!scanCommand) throw new Error('fixture privacy scan command missing');
  scanCommand.stdoutSha256 = machineScan.sha256;
  scanCommand.stderrSha256 = machineScanStderr.sha256;
  const scanReport = requireRecord(
    JSON.parse(scan.stdout),
    'privacy scan report'
  );
  requireRecord(
    manifest.privacyScan,
    'manifest.privacyScan'
  ).scannedArtifactCount = scanReport.scannedArtifactCount;
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  expect(generalEvidence.sha256).toHaveLength(64);
  return { manifestPath, manifest };
}

describe('commercial PR-12 execution evidence verifier', () => {
  it('keeps execution PASS blocked until every mapped COMM claim has a typed collector', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-evidence-verifier-')
    );
    try {
      const { manifestPath, manifest } = buildPassingFixture(directory);
      const valid = runVerifier(manifestPath);
      expect(valid.status).toBe(1);
      expect(valid.output).toContain('COMM verified claim registry incomplete');

      const environment = requireRecord(manifest.environment, 'environment');
      environment.region = 'unapproved-region';
      const mismatchPath = writeManifest(
        directory,
        'manifest-mismatch.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain('environment.region approval mismatch');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects the known production project ref even when every source binding agrees', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-production-source-ref-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        sourceProjectRef: 'qnanuoqveidwvacvbhqp',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'approvalPacket.environment.projectRef is a prohibited production project ref'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a prohibited or source-equal restore target after supplemental approval', () => {
    for (const restoreProjectRef of [
      'qnanuoqveidwvacvbhqp',
      'synthetic-project-ref',
    ]) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-unsafe-restore-ref-verifier-')
      );
      try {
        const { manifestPath } = buildPassingFixture(directory, {
          restoreProjectRef,
        });
        const result = runVerifier(manifestPath);
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /prohibited production project ref|must differ from source project ref|restore target (?:provider )?identity violates source\/restore isolation|credentialHandling source\/restore target isolation mismatch/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects operator self-approval and a proposal-only command ledger', () => {
    for (const options of [
      { selfApproveMigration: true },
      { selfApproveCleanup: true },
      { commandLedgerStatus: 'PROPOSED_NOT_EXECUTABLE' },
    ]) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-approval-boundary-verifier-')
      );
      try {
        const { manifestPath } = buildPassingFixture(directory, options);
        const result = runVerifier(manifestPath);
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /must differ from databaseMigrationOperator|must differ from cleanupOwner|command ledger status must be APPROVED_EXECUTABLE/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects Commercial Release Owner reuse for platform, SRE, or incident authority', () => {
    for (const ownerField of [
      'supabasePlatformOwner',
      'siteReliabilityOwner',
      'incidentCommander',
    ]) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-owner-separation-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        const approvalRecord = requireRecord(
          approval.approval,
          'source approval record'
        );
        requireRecord(approval.owners, 'source approval owners')[ownerField] =
          approvalRecord.approvedBy;
        rewriteSourceApproval(directory, manifest, approval);
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-owner-${ownerField}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain(`must differ from ${ownerField}`);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects a replay/catalog approval that crosses the representative-seed boundary', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-replay-phase-boundary-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const source = requireRecord(manifest.source, 'source');
      const { parsed: approval } = readBoundJson(
        directory,
        {
          path: source.approvalPacketPath,
          sha256: source.approvalPacketSha256,
        },
        'source approval'
      );
      const replayBinding = requireRecord(
        approval.sourceReplayCatalogCaptureApproval,
        'source replay approval binding'
      );
      const replay = readBoundJson(
        directory,
        replayBinding,
        'source replay approval'
      );
      requireArray(
        replay.parsed.approvedCommandIds,
        'source replay approved command IDs'
      ).push('PR12-CMD-008');
      replayBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        replay.relativePath,
        replay.parsed
      );
      rewriteSourceApproval(directory, manifest, approval);
      const result = runVerifier(
        writeManifest(directory, 'manifest-replay-seed-crossing.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /ledger prefix|permits seed|phase ledger approval mismatch/u
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects Data API provisioning of graphql_public even when source approval and manifest agree', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-data-api-schema-boundary-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const source = requireRecord(manifest.source, 'source');
      const { parsed: approval } = readBoundJson(
        directory,
        {
          path: source.approvalPacketPath,
          sha256: source.approvalPacketSha256,
        },
        'source approval'
      );
      requireRecord(
        requireRecord(approval.environment, 'approval environment')
          .dataApiProvisioning,
        'approval Data API provisioning'
      ).exposedSchemas = ['public', 'graphql_public'];
      requireRecord(
        requireRecord(manifest.environment, 'manifest environment').dataApi,
        'manifest Data API provisioning'
      ).exposedSchemas = ['public', 'graphql_public'];
      rewriteSourceApproval(directory, manifest, approval);
      const result = runVerifier(
        writeManifest(
          directory,
          'manifest-graphql-public-exposed.json',
          manifest
        )
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'approvalPacket.environment.dataApiProvisioning.exposedSchemas'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects expected/observed security outcome mismatch', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-security-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const security = requireRecord(manifest.securityMatrix, 'securityMatrix');
      const rows = requireArray(security.rows, 'securityMatrix.rows');
      const firstRow = requireRecord(rows[0], 'securityMatrix.rows[0]');
      firstRow.observedHttpStatus = 200;
      const mismatchPath = writeManifest(
        directory,
        'manifest-security-mismatch.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'observedHttpStatus does not match expectedHttpStatus'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects Data API configuration drift from the hash-bound matrix', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-data-api-config-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const environment = requireRecord(manifest.environment, 'environment');
      const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
      dataApi.enabled = false;
      const mismatchPath = writeManifest(
        directory,
        'manifest-data-api-config-mismatch.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'environment.dataApi.enabled approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects bootstrap platform transport, command, provider-payload, and synchronized approval drift', () => {
    for (const mutation of [
      'transport',
      'command',
      'raw-payload',
      'synchronized',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-bootstrap-platform-raw-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        rebindSourceBootstrapRawObservation(
          directory,
          manifest,
          'dataApi',
          raw => {
            if (mutation === 'transport') {
              raw.transport = 'SELF_ATTESTED';
            } else if (mutation === 'command') {
              raw.commandId = 'PR12-CMD-007A';
            } else {
              requireRecord(
                requireRecord(raw.providerPayload, 'provider payload')
                  .restHealth,
                'REST health payload'
              ).status = 'UNHEALTHY';
            }
          },
          mutation === 'synchronized'
            ? (operationValue, resultValue) => {
                operationValue.enabled = false;
                resultValue.enabled = false;
              }
            : undefined
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-bootstrap-platform-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /provider-native envelope drift|normalization is not derived from its secret-stripped provider payload|configuration differs from the approved proposal/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('does not treat a service_role-only default grant as public automatic exposure', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-default-acl-service-role-only-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      rebindSourceBootstrapRawObservation(
        directory,
        manifest,
        'dataApi',
        raw => {
          const defaultPrivilege = requireRecord(
            requireRecord(raw.providerPayload, 'provider payload')
              .defaultPrivilegeExposure,
            'default privilege exposure'
          );
          const rows = requireArray(
            defaultPrivilege.rows,
            'default privilege rows'
          );
          const serviceRoleRow = rows
            .map((value, index) =>
              requireRecord(value, `default privilege row ${String(index)}`)
            )
            .find(
              row =>
                row.ownerRole === 'postgres' &&
                row.namespaceScope === 'GLOBAL_OR_HARDWIRED' &&
                row.objectType === 'r' &&
                row.apiRole === 'service_role'
            );
          if (!serviceRoleRow) throw new Error('missing service_role ACL row');
          serviceRoleRow.privileges = ['SELECT'];
          defaultPrivilege.rowsSha256 = sha256(JSON.stringify(rows));
        }
      );
      const result = runVerifier(
        writeManifest(
          directory,
          'manifest-service-role-default-only.json',
          manifest
        )
      );
      expect(result.status).toBe(1);
      expect(result.output).not.toMatch(
        /Data API configuration differs|normalization is not derived|defaultPrivilegeExposure/u
      );
      expect(result.output).toContain(
        'restore creation approval is not bound to source execution approval'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: 'dashboard binding hash',
      family: 'dataApi' as const,
      mutate: (raw: Record<string, unknown>) => {
        requireRecord(
          requireRecord(
            requireRecord(raw.providerPayload, 'provider payload')
              .configuredState,
            'configured state'
          ).rawArtifact,
          'configured state raw artifact'
        ).sha256 = '0'.repeat(64);
      },
    },
    {
      name: 'REST 401 synchronized claim',
      family: 'dataApi' as const,
      mutate: (raw: Record<string, unknown>) => {
        requireRecord(
          requireRecord(raw.providerPayload, 'provider payload')
            .directRestSmoke,
          'direct REST smoke'
        ).httpStatus = 401;
      },
      mutateNormalized: (
        operationValue: Record<string, unknown>,
        resultValue: Record<string, unknown>
      ) => {
        operationValue.directEndpointReachable = false;
        resultValue.directEndpointReachable = false;
      },
    },
    {
      name: 'Auth SMTP presence synchronized claim',
      family: 'auth' as const,
      mutate: (raw: Record<string, unknown>) => {
        requireRecord(
          requireRecord(raw.providerPayload, 'provider payload').fieldPresence,
          'Auth field presence'
        ).smtp_pass = true;
      },
      mutateNormalized: (
        operationValue: Record<string, unknown>,
        resultValue: Record<string, unknown>
      ) => {
        operationValue.realEmailSmsOrOAuthDeliveryConfigured = true;
        resultValue.realEmailSmsOrOAuthDeliveryConfigured = true;
      },
    },
    {
      name: 'GraphQL fixed-query drift with matching hash',
      family: 'graphQl' as const,
      mutate: (raw: Record<string, unknown>) => {
        const endpoint = requireRecord(
          requireRecord(raw.providerPayload, 'provider payload').endpointProbe,
          'GraphQL endpoint probe'
        );
        endpoint.queryText = 'query Changed { __typename }';
        endpoint.querySha256 = sha256(String(endpoint.queryText));
      },
    },
    {
      name: 'GraphQL 5xx body',
      family: 'graphQl' as const,
      mutate: (raw: Record<string, unknown>) => {
        const endpoint = requireRecord(
          requireRecord(raw.providerPayload, 'provider payload').endpointProbe,
          'GraphQL endpoint probe'
        );
        endpoint.httpStatus = 500;
      },
    },
  ])('rejects $name in platform raw evidence', testCase => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-platform-negative-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      rebindSourceBootstrapRawObservation(
        directory,
        manifest,
        testCase.family,
        testCase.mutate,
        testCase.mutateNormalized
      );
      const result = runVerifier(
        writeManifest(directory, 'manifest-platform-negative.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /does not match the artifact|identity drift|request identity drift|configuration differs from the approved proposal|raw Dashboard capture drift|neither an accepted GraphQL result nor a captured rejection/u
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects execution that started before approval', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-retroactive-approval-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        approvalAt: '2000-01-02T00:00:00Z',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /timing\.startedAt precedes approvalPacket\.approval\.approvedAt|startedAt precedes source qualification approval/u
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unpinned Supabase CLI version even when the packet agrees', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-cli-version-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        supabaseCliVersion: '2.110.0',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'toolVersions.supabaseCli must be 2.109.0'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects missing psql version evidence', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-missing-psql-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const toolVersions = requireRecord(manifest.toolVersions, 'toolVersions');
      delete toolVersions.psql;
      const mismatchPath = writeManifest(
        directory,
        'manifest-missing-psql.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'toolVersions key set approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a psql claim that is not exact version-command output', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-invalid-psql-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        psqlVersion: 'PostgreSQL 17.4',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'toolVersions.psql must be an exact PostgreSQL 17 psql --version output'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a self-reported Node 24 version that differs from the runtime', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-node-runtime-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        nodeVersion: 'v24.99.99',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'toolVersions.node does not match the executing Node runtime'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects tool-version stdout that does not match its hash-bound claim', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-tool-output-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const artifacts = requireArray(manifest.artifacts, 'artifacts');
      const generalEvidence = artifacts
        .map((value, index) =>
          requireRecord(value, `artifacts[${String(index)}]`)
        )
        .find(value => value.path === evidencePath);
      if (!generalEvidence)
        throw new Error('general evidence artifact missing');
      const commands = requireArray(manifest.commands, 'commands');
      const nodeVersionCommand = requireRecord(commands[0], 'commands[0]');
      nodeVersionCommand.stdoutPath = generalEvidence.path;
      nodeVersionCommand.stdoutSha256 = generalEvidence.sha256;
      const mismatchPath = writeManifest(
        directory,
        'manifest-tool-output-mismatch.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'tool version stdout mismatch for node'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unsafe credential channel even when manifest and approval agree', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-unsafe-credential-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        credentialOverrides: { channel: 'command_line' },
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'credentialHandling.channel violates the server-only credential boundary'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects secret logging or client-response exposure in an approved contract', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-unsafe-exposure-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        credentialOverrides: {
          logging: 'plaintext_secret',
          clientResponseExposureAllowed: true,
        },
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'credentialHandling.logging violates the server-only credential boundary'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects credential-channel drift from the approved contract', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-credential-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const credential = requireRecord(
        manifest.credentialHandling,
        'credentialHandling'
      );
      credential.channel = 'unapproved_channel';
      const mismatchPath = writeManifest(
        directory,
        'manifest-credential-mismatch.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'credentialHandling.channel approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a restore credential provider outside the shared approved store', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-credential-provider-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        restoreCredentialProviderName: 'unapproved_restore_secret_store',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'credentialHandling.targetResults.restore.secretStoreProvider approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('derives target API-key presence from non-empty provider runtime values', () => {
    for (const mutation of ['absent-key', 'empty-fingerprint'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `pr12-credential-presence-${mutation}-`)
      );
      try {
        const { manifestPath } = buildPassingFixture(directory, {
          ...(mutation === 'absent-key'
            ? { sourceAnonKeyPresent: false }
            : { sourceAnonKeyFingerprintFromEmptyValue: true }),
        });
        const result = runVerifier(manifestPath);
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'credentialHandling.targetResults.source key presence was not derived from non-empty target-specific runtime values'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects source and restore database hosts that do not derive from their project refs', () => {
    for (const target of ['source', 'restore'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-database-host-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        if (target === 'source') {
          const environment = requireRecord(
            manifest.environment,
            'environment'
          );
          environment.databaseHost = 'db.unapproved-project.supabase.co';
          const source = requireRecord(manifest.source, 'source');
          const { parsed: approval } = readBoundJson(
            directory,
            {
              path: source.approvalPacketPath,
              sha256: source.approvalPacketSha256,
            },
            'source approval'
          );
          requireRecord(
            approval.environment,
            'approval.environment'
          ).databaseHost = environment.databaseHost;
          rewriteSourceApproval(directory, manifest, approval);
        } else {
          const restore = requireRecord(manifest.restore, 'restore');
          const targetEnvironment = requireRecord(
            restore.targetEnvironment,
            'restore.targetEnvironment'
          );
          targetEnvironment.databaseHost = 'db.unapproved-restore.supabase.co';
          const { relativePath, parsed: supplemental } = readBoundJson(
            directory,
            {
              path: restore.supplementalApprovalPath,
              sha256: restore.supplementalApprovalSha256,
            },
            'restore supplemental approval'
          );
          requireRecord(
            supplemental.restoreEnvironment,
            'supplemental.restoreEnvironment'
          ).databaseHost = targetEnvironment.databaseHost;
          restore.supplementalApprovalSha256 = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            supplemental
          );
        }
        const mismatchPath = writeManifest(
          directory,
          `manifest-${target}-host.json`,
          manifest
        );
        const mismatch = runVerifier(mismatchPath);
        expect(mismatch.status).toBe(1);
        expect(mismatch.output).toMatch(
          /databaseHost does not match the project ref|target identity mismatch/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects Auth provisioning drift even when source manifest and approval agree', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-auth-provisioning-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const environment = requireRecord(manifest.environment, 'environment');
      requireRecord(
        environment.authProvisioning,
        'environment.authProvisioning'
      ).anonymousSignInEnabled = true;
      const source = requireRecord(manifest.source, 'source');
      const { parsed: approval } = readBoundJson(
        directory,
        {
          path: source.approvalPacketPath,
          sha256: source.approvalPacketSha256,
        },
        'source approval'
      );
      requireRecord(
        requireRecord(approval.environment, 'approval.environment')
          .authProvisioning,
        'approval.environment.authProvisioning'
      ).anonymousSignInEnabled = true;
      rewriteSourceApproval(directory, manifest, approval);
      const mismatchPath = writeManifest(
        directory,
        'manifest-auth-provisioning.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'authProvisioning.anonymousSignInEnabled must be false'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects nested credential and integration invariant regressions', () => {
    for (const contractKind of ['credential', 'integration'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-nested-boundary-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        const bindings = requireRecord(approval.bindings, 'approval.bindings');
        const bindingName =
          contractKind === 'credential'
            ? 'credentialContract'
            : 'integrationContract';
        const { relativePath, parsed: contract } = readBoundJson(
          directory,
          bindings[bindingName],
          bindingName
        );
        if (contractKind === 'credential') {
          const credentialChannels = requireRecord(
            contract.credentialChannels,
            'credentialContract.credentialChannels'
          );
          requireRecord(
            credentialChannels.commonIsolationRules,
            'credentialContract.credentialChannels.commonIsolationRules'
          ).committedFixturePasswordsAllowedOnHosted = true;
        } else {
          requireRecord(
            requireRecord(
              contract.integrations,
              'integrationContract.integrations'
            ).stripe,
            'integrationContract.integrations.stripe'
          ).liveKeyAllowed = true;
        }
        const contractSha = rewriteJsonArtifact(
          directory,
          manifest,
          relativePath,
          contract
        );
        requireRecord(
          bindings[bindingName],
          `approval.bindings.${bindingName}`
        ).sha256 = contractSha;
        if (contractKind === 'credential') {
          requireRecord(
            manifest.credentialHandling,
            'credentialHandling'
          ).contractSha256 = contractSha;
        }
        rewriteSourceApproval(directory, manifest, approval);
        const mismatchPath = writeManifest(
          directory,
          `manifest-${contractKind}-nested.json`,
          manifest
        );
        const mismatch = runVerifier(mismatchPath);
        expect(mismatch.status).toBe(1);
        expect(mismatch.output).toMatch(
          /nested server-only invariant drift|Stripe boundary drift|credentialContract\.sha256 does not match the artifact/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects service-role remapping to public names and incomplete forbidden locations', () => {
    for (const mutation of [
      'public-remap',
      'missing-forbidden-location',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-credential-mapping-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const credential = requireRecord(
          manifest.credentialHandling,
          'credentialHandling'
        );
        const credentialArtifact = readBoundJson(
          directory,
          {
            path: credential.contractPath,
            sha256: credential.contractSha256,
          },
          'credential contract'
        );
        const channels = requireRecord(
          credentialArtifact.parsed.credentialChannels,
          'credential channels'
        );
        const sourceChannel = requireRecord(
          channels.source,
          'source credential channel'
        );
        const commonIsolationRules = requireRecord(
          channels.commonIsolationRules,
          'common credential isolation rules'
        );
        if (mutation === 'public-remap') {
          requireRecord(
            sourceChannel.childProcessMappings,
            'child process mappings'
          ).NEXT_PUBLIC_SUPABASE_ANON_KEY = 'PR12_SOURCE_SERVICE_ROLE_KEY';
        } else {
          const locations = requireArray(
            commonIsolationRules.forbiddenLocations,
            'forbidden locations'
          );
          locations.splice(locations.indexOf('database_url'), 1);
        }
        credential.contractSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          credentialArtifact.relativePath,
          credentialArtifact.parsed
        );
        const source = requireRecord(manifest.source, 'source');
        const approvalArtifact = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        requireRecord(
          requireRecord(
            approvalArtifact.parsed.bindings,
            'source approval bindings'
          ).credentialContract,
          'approved credential binding'
        ).sha256 = credential.contractSha256;
        rewriteSourceApproval(directory, manifest, approvalArtifact.parsed);

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /differs from the server-only reviewed mapping|forbiddenLocations approval mismatch|credentialContract\.sha256 does not match the artifact/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects missing owner decisions and tool hashes outside the pinned release asset', () => {
    for (const mutation of [
      'owner-decision',
      'binary-hash',
      'archive-hash',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-owner-tool-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        if (mutation === 'owner-decision') {
          requireRecord(
            approval.ownerDecisions,
            'approval.ownerDecisions'
          ).productionTierParityAccepted = false;
        } else if (mutation === 'binary-hash') {
          const unsafeSha = 'b'.repeat(64);
          requireRecord(
            requireRecord(approval.toolBinaries, 'approval.toolBinaries')
              .supabaseCli,
            'approval.toolBinaries.supabaseCli'
          ).sha256 = unsafeSha;
          requireRecord(
            requireRecord(manifest.toolBinaries, 'toolBinaries').supabaseCli,
            'toolBinaries.supabaseCli'
          ).sha256 = unsafeSha;
        } else {
          const unsafeSha = 'c'.repeat(64);
          requireRecord(
            requireRecord(approval.toolBinaries, 'approval.toolBinaries')
              .supabaseCli,
            'approval.toolBinaries.supabaseCli'
          ).archiveSha256 = unsafeSha;
          requireRecord(
            requireRecord(manifest.toolBinaries, 'toolBinaries').supabaseCli,
            'toolBinaries.supabaseCli'
          ).archiveSha256 = unsafeSha;
        }
        rewriteSourceApproval(directory, manifest, approval);
        const mismatchPath = writeManifest(
          directory,
          `manifest-${mutation}.json`,
          manifest
        );
        const mismatch = runVerifier(mismatchPath);
        expect(mismatch.status).toBe(1);
        expect(mismatch.output).toMatch(
          /funded retention\/cleanup decision|pinned 2\.109\.0 Windows executable|official 2\.109\.0 Windows archive|toolBinaries\.supabaseCli approval mismatch/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects SLO denominator drift, unbound source hashes, and self-reported RTO', () => {
    for (const mutation of ['slo', 'integrity', 'rto'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-observed-result-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        if (mutation === 'slo') {
          const hosted = requireRecord(
            requireRecord(manifest.performance, 'performance').hostedSlo,
            'performance.hostedSlo'
          );
          const samples = requireArray(hosted.sampleResults, 'sampleResults');
          requireRecord(samples[0], 'sampleResults[0]').failedRequests = 1;
        } else if (mutation === 'integrity') {
          const integrity = requireRecord(
            manifest.integrityResults,
            'integrityResults'
          );
          const sourceBinding = requireRecord(
            integrity.source,
            'integrity.source'
          );
          const { relativePath, parsed: result } = readBoundJson(
            directory,
            sourceBinding,
            'source integrity result'
          );
          result.logicalHash = 'b'.repeat(64);
          sourceBinding.sha256 = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            result
          );
          rebindCommandStdout(
            manifest,
            relativePath,
            String(sourceBinding.sha256)
          );
        } else {
          requireRecord(manifest.restore, 'restore').rtoSeconds = 1;
        }
        const mismatchPath = writeManifest(
          directory,
          `manifest-${mutation}-observed.json`,
          manifest
        );
        const mismatch = runVerifier(mismatchPath);
        expect(mismatch.status).toBe(1);
        expect(mismatch.output).toMatch(
          /request denominator mismatch|manifest\.hashes\.logicalHash does not match|were not recomputed|backup\.watermarkOperation\.baselineSourceIntegrity\.sha256 does not match the artifact/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects synchronized drift from frozen historical integrity facts', () => {
    for (const field of [
      'logicalHash',
      'historicalNormalizedPhysicalHash',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-frozen-integrity-fact-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        rebindFrozenIntegrityFactChain(
          directory,
          manifest,
          field,
          field === 'logicalHash' ? 'a'.repeat(64) : 'b'.repeat(64)
        );
        const result = runVerifier(
          writeManifest(directory, `manifest-${field}-drift.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'integrityResults.source historical logical or normalized physical fact drift'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects restored environmental physical structure drift after digest recomputation', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-environment-physical-parity-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const integrity = requireRecord(
        manifest.integrityResults,
        'integrityResults'
      );
      const restoreBinding = requireRecord(
        integrity.restore,
        'restore binding'
      );
      const restoreArtifact = readBoundJson(
        directory,
        restoreBinding,
        'restore integrity'
      );
      const restored = requireRecord(
        restoreArtifact.parsed.restored,
        'restored integrity snapshot'
      );
      const restoredRelations = requireArray(
        restored.relationDigests,
        'restored integrity relation digests'
      ).map((value, index) =>
        requireRecord(value, `restored relation digest ${String(index)}`)
      );
      requireRecord(
        restoredRelations[0],
        'first restored relation digest'
      ).physicalStructureDigestSha256 = 'f'.repeat(64);
      restored.environmentPhysicalStructureHash = sha256(
        restoredRelations
          .map(
            row =>
              `${String(row.relation)}\t${String(row.rowCount)}\t${String(row.physicalStructureQuerySha256)}\t${String(row.physicalStructureDigestSha256)}\n`
          )
          .join('')
      );
      const rawBinding = requireRecord(
        requireArray(
          restoreArtifact.parsed.rawEvidence,
          'restore integrity raw evidence'
        )[0],
        'restore integrity raw binding'
      );
      const rawArtifact = readBoundJson(
        directory,
        rawBinding,
        'restore integrity raw observation'
      );
      const rawObservation = requireRecord(
        requireArray(
          rawArtifact.parsed.observations,
          'restore integrity raw observations'
        )[0],
        'restore integrity raw observation'
      );
      rawObservation.restored = restored;
      rawBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        rawArtifact.relativePath,
        rawArtifact.parsed
      );
      restoreBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        restoreArtifact.relativePath,
        restoreArtifact.parsed
      );
      rebindPostRestoreResultChain(
        directory,
        manifest,
        'integrity',
        String(restoreBinding.sha256)
      );
      const result = runVerifier(
        writeManifest(
          directory,
          'manifest-environment-physical-drift.json',
          manifest
        )
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'integrityResults.restore environmentPhysicalStructureHash parity mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects DR excluded-scope provenance, parity, credential, and secret drift', () => {
    type ScopeMutation = {
      name: string;
      expected: RegExp;
      mutate: (
        scope: Record<string, unknown>,
        manifest: Record<string, unknown>
      ) => void;
    };
    const mutations: ScopeMutation[] = [
      {
        name: 'storage-bucket',
        expected:
          /storageBuckets inventory lacks fresh typed Management API provenance or is non-empty/u,
        mutate: scope => {
          const management = requireRecord(scope.managementApi, 'management');
          requireArray(
            requireRecord(management.storageBuckets, 'storage buckets').items,
            'storage bucket items'
          ).push({ id: 'unexpected-bucket' });
        },
      },
      {
        name: 'edge-function',
        expected:
          /edgeFunctions inventory lacks fresh typed Management API provenance or is non-empty/u,
        mutate: scope => {
          const management = requireRecord(scope.managementApi, 'management');
          requireArray(
            requireRecord(management.edgeFunctions, 'edge functions').items,
            'edge function items'
          ).push({ slug: 'unexpected-function' });
        },
      },
      {
        name: 'read-replica',
        expected:
          /read-replica inventory lacks typed Dashboard provenance or is non-empty/u,
        mutate: scope => {
          requireArray(
            requireRecord(scope.dashboardExport, 'dashboard export')
              .readReplicaRefs,
            'read replica refs'
          ).push('unexpected-replica-ref');
        },
      },
      {
        name: 'storage-object-row',
        expected: /Storage rows or database catalog typed evidence mismatch/u,
        mutate: scope => {
          requireRecord(
            scope.databaseCatalog,
            'database catalog'
          ).storageObjectMetadataRowCount = 1;
        },
      },
      {
        name: 'custom-role-password',
        expected: /Storage rows or database catalog typed evidence mismatch/u,
        mutate: scope => {
          requireArray(
            requireRecord(scope.databaseCatalog, 'database catalog')
              .customRolesRequiringPasswords,
            'custom roles requiring passwords'
          ).push('unexpected_login_role');
        },
      },
      {
        name: 'realtime-publication',
        expected: /Storage rows or database catalog typed evidence mismatch/u,
        mutate: scope => {
          requireArray(
            requireRecord(scope.databaseCatalog, 'database catalog')
              .realtimePublicationTables,
            'Realtime publication tables'
          ).pop();
        },
      },
      {
        name: 'catalog-query-sha',
        expected: /database catalog query provenance mismatch/u,
        mutate: scope => {
          const catalog = requireRecord(scope.databaseCatalog, 'catalog');
          requireRecord(
            requireArray(catalog.queryEvidence, 'query evidence')[0],
            'first query evidence'
          ).querySha256 = 'f'.repeat(64);
        },
      },
      {
        name: 'catalog-normalized-hash',
        expected: /Storage rows or database catalog typed evidence mismatch/u,
        mutate: scope => {
          requireArray(
            requireRecord(scope.databaseCatalog, 'database catalog')
              .extensionCatalog,
            'extension catalog'
          ).push('unapproved_extension:1.0');
        },
      },
      {
        name: 'auth-config-parity',
        expected:
          /authConfig full-schema projection differs between source and restore/u,
        mutate: scope => {
          const management = requireRecord(scope.managementApi, 'management');
          requireRecord(
            management.authConfig,
            'Auth config'
          ).sanitizedCanonicalSha256 = 'f'.repeat(64);
        },
      },
      {
        name: 'projection-schema',
        expected: /authConfig full-schema projection mismatch/u,
        mutate: scope => {
          const management = requireRecord(scope.managementApi, 'management');
          requireRecord(management.authConfig, 'Auth config').propertyCount =
            236;
        },
      },
      {
        name: 'projection-unknown-field',
        expected: /authConfig full-schema projection mismatch/u,
        mutate: scope => {
          const management = requireRecord(scope.managementApi, 'management');
          requireArray(
            requireRecord(management.authConfig, 'Auth config').unknownFields,
            'Auth unknown fields'
          ).push('future_field');
        },
      },
      {
        name: 'projection-raw-persisted',
        expected: /authConfig full-schema projection mismatch/u,
        mutate: scope => {
          const management = requireRecord(scope.managementApi, 'management');
          requireRecord(
            management.authConfig,
            'Auth config'
          ).rawResponsePersisted = true;
        },
      },
      {
        name: 'credential-binding',
        expected:
          /DR scope credential provider configuration: source\.(path|sha256) approval mismatch/u,
        mutate: (scope, manifest) => {
          const credentialHandling = requireRecord(
            manifest.credentialHandling,
            'credential handling'
          );
          const restoreCredential = requireRecord(
            requireRecord(
              credentialHandling.targetResults,
              'credential target results'
            ).restore,
            'restore credential result'
          );
          scope.credentialProviderConfiguration = {
            path: restoreCredential.providerConfigurationPath,
            sha256: restoreCredential.providerConfigurationSha256,
          };
        },
      },
      {
        name: 'raw-target-api-key-self-claim',
        expected:
          /drScopeInventory\.source\.result contains missing or unsupported fields/u,
        mutate: scope => {
          scope.targetSpecificApiKeysPresent = false;
        },
      },
      {
        name: 'credential-value-capture',
        expected:
          /DR excluded\/manual scope identity or secret boundary mismatch/u,
        mutate: scope => {
          scope.credentialValuesCaptured = true;
        },
      },
      {
        name: 'secret-value-capture',
        expected:
          /DR excluded\/manual scope identity or secret boundary mismatch/u,
        mutate: scope => {
          scope.secretValuesCaptured = true;
        },
      },
      {
        name: 'wrong-command-window',
        expected:
          /DR excluded\/manual scope identity or secret boundary mismatch/u,
        mutate: scope => {
          scope.observedAt = '1999-12-31T23:00:00Z';
        },
      },
    ];

    for (const mutation of mutations) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `pr12-dr-scope-${mutation.name}-`)
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        rebindDrScopeChain(directory, manifest, 'source', scope => {
          mutation.mutate(scope, manifest);
        });
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-dr-scope-${mutation.name}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(mutation.expected);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects DR scope artifact reuse and nested command binding drift', () => {
    for (const mutation of ['artifact-reuse', 'stdout-binding'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `pr12-dr-scope-${mutation}-`)
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const scopeInventory = requireRecord(
          manifest.drScopeInventory,
          'DR scope inventory'
        );
        const sourceBinding = requireRecord(
          scopeInventory.source,
          'source DR scope binding'
        );
        const commands = requireArray(manifest.commands, 'commands').map(
          (value, index) => requireRecord(value, `commands[${String(index)}]`)
        );
        const restoreCommand = commands.find(
          command => command.id === 'PR12-CMD-019A'
        );
        if (!restoreCommand || typeof restoreCommand.stdoutPath !== 'string') {
          throw new Error('restore DR scope command is missing');
        }
        const stdoutValue: unknown = JSON.parse(
          fs.readFileSync(
            path.join(directory, restoreCommand.stdoutPath),
            'utf8'
          )
        );
        const stdout = requireRecord(stdoutValue, 'restore command stdout');
        const nested = requireRecord(
          stdout.drScopeInventory,
          'restore command DR scope binding'
        );
        if (mutation === 'artifact-reuse') {
          scopeInventory.restore = {
            path: sourceBinding.path,
            sha256: sourceBinding.sha256,
          };
          nested.path = sourceBinding.path;
          nested.sha256 = sourceBinding.sha256;
        } else {
          nested.sha256 = 'f'.repeat(64);
        }
        restoreCommand.stdoutSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          restoreCommand.stdoutPath,
          stdout
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-dr-scope-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /DR excluded\/manual scope identity or secret boundary mismatch|does not match the artifact/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects restore creation backup drift, generic COMM evidence, and privacy reviewer substitution', () => {
    for (const mutation of ['backup', 'comm', 'privacy'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-phase-evidence-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        if (mutation === 'backup') {
          const restore = requireRecord(manifest.restore, 'restore');
          const { relativePath, parsed: approval } = readBoundJson(
            directory,
            {
              path: restore.creationApprovalPath,
              sha256: restore.creationApprovalSha256,
            },
            'restore creation approval'
          );
          requireRecord(
            approval.selectedBackup,
            'restore creation selected backup'
          ).backupId = 'unapproved-backup-id';
          restore.creationApprovalSha256 = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            approval
          );
        } else if (mutation === 'comm') {
          const gates = requireArray(manifest.gates, 'gates');
          const gate = requireRecord(gates[0], 'gates[0]');
          const { relativePath, parsed: result } = readBoundJson(
            directory,
            {
              path: gate.resultArtifactPath,
              sha256: gate.resultArtifactSha256,
            },
            'COMM result'
          );
          result.gateId = 'COMM-DB-999';
          gate.resultArtifactSha256 = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            result
          );
        } else {
          requireRecord(manifest.privacyScan, 'privacyScan').manualReviewer =
            'substitute_reviewer';
        }
        const mismatchPath = refreshPrivacyScan(
          directory,
          `manifest-${mutation}-phase.json`,
          manifest
        );
        const mismatch = runVerifier(mismatchPath);
        expect(mismatch.status).toBe(1);
        expect(mismatch.output).toMatch(
          /selected backup mismatch|structured result mismatch|manualReviewer must equal/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('keeps COMM-OPS-011 NOT_RUN until the terminal verifier derives it', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-final-derived-gate-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const finalGate = requireRecord(
        requireArray(manifest.gates, 'gates').find(
          value => requireRecord(value, 'gate').id === 'COMM-OPS-011'
        ),
        'COMM-OPS-011 gate'
      );
      finalGate.status = 'PASS';
      const result = runVerifier(
        writeManifest(directory, 'manifest-premature-final-gate.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'COMM-OPS-011 must remain NOT_RUN until the terminal verifier derives it'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a restore database clock claimed by the pre-supplemental creation operation', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-restore-clock-boundary-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const creationCommand = requireRecord(
        requireArray(manifest.commands, 'commands').find(
          value => requireRecord(value, 'command').id === 'PR12-ACTION-017'
        ),
        'restore creation command'
      );
      const operation = readBoundJson(
        directory,
        {
          path: creationCommand.stdoutPath,
          sha256: creationCommand.stdoutSha256,
        },
        'restore creation operation'
      );
      operation.parsed.restoreDatabaseUtc = restoreConfirmationAt;
      creationCommand.stdoutSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        operation.relativePath,
        operation.parsed
      );
      const result = runVerifier(
        writeManifest(directory, 'manifest-early-restore-clock.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'restore.supplementalApproval.restoreCreationOperation.sha256 approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a supplemental restore credential configuration swapped to the source target', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-restore-credential-swap-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const credentialHandling = requireRecord(
        manifest.credentialHandling,
        'credentialHandling'
      );
      const sourceCredential = requireRecord(
        requireRecord(
          credentialHandling.targetResults,
          'credentialHandling.targetResults'
        ).source,
        'credentialHandling.targetResults.source'
      );
      const restore = requireRecord(manifest.restore, 'restore');
      const supplementalArtifact = readBoundJson(
        directory,
        {
          path: restore.supplementalApprovalPath,
          sha256: restore.supplementalApprovalSha256,
        },
        'restore supplemental approval'
      );
      const credentialControls = requireRecord(
        supplementalArtifact.parsed.credentialControls,
        'restore supplemental credential controls'
      );
      credentialControls.restoreCredentialProviderConfiguration = {
        path: sourceCredential.providerConfigurationPath,
        sha256: sourceCredential.providerConfigurationSha256,
      };
      restore.supplementalApprovalSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        supplementalArtifact.relativePath,
        supplementalArtifact.parsed
      );
      const result = runVerifier(
        writeManifest(
          directory,
          'manifest-restore-credential-swap.json',
          manifest
        )
      );
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /restore\.supplementalApproval\.credentialControls\.restoreCredentialProviderConfiguration(?:\.path)? approval mismatch/u
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects unresolved restore clocks and a quote total not derived from line items', () => {
    for (const mutation of ['clock-policy', 'quote-total'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-restore-approval-integrity-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const restore = requireRecord(manifest.restore, 'restore');
        const creationArtifact = readBoundJson(
          directory,
          {
            path: restore.creationApprovalPath,
            sha256: restore.creationApprovalSha256,
          },
          'restore creation approval'
        );
        if (mutation === 'clock-policy') {
          requireRecord(
            creationArtifact.parsed.clockPolicy,
            'restore creation clock policy'
          ).maximumAllowedClockSkewSeconds = 301;
        } else {
          const quote = requireRecord(
            requireRecord(creationArtifact.parsed.cost, 'restore creation cost')
              .quote,
            'restore creation quote'
          );
          requireRecord(
            requireArray(quote.lineItems, 'restore quote line items')[0],
            'restore quote line item'
          ).amountUsd = 30;
        }
        rebindRestoreCreationApprovalChain(
          directory,
          manifest,
          creationArtifact.parsed
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-restore-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /provider-clock policy|line items do not sum exactly/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects an RPO observation taken too early before restore confirmation', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-rpo-observation-lead-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const restore = requireRecord(manifest.restore, 'restore');
      const commands = requireArray(manifest.commands, 'commands').map(
        (value, index) => requireRecord(value, `commands[${String(index)}]`)
      );
      const creationCommand = commands.find(
        command => command.id === 'PR12-ACTION-017'
      );
      if (!creationCommand || typeof creationCommand.stdoutPath !== 'string') {
        throw new Error('restore creation command missing');
      }
      const creationOperationValue: unknown = JSON.parse(
        fs.readFileSync(
          path.join(directory, creationCommand.stdoutPath),
          'utf8'
        )
      );
      const creationOperation = requireRecord(
        creationOperationValue,
        'restore creation operation'
      );
      creationOperation.sourceDatabaseUtcAtRpoObservation =
        restoreActionStartedAt;
      creationOperation.operatorUtcAtRpoObservation = restoreActionStartedAt;
      creationOperation.rpoObservedAt = restoreActionStartedAt;
      const creationOperationSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        creationCommand.stdoutPath,
        creationOperation
      );
      creationCommand.stdoutSha256 = creationOperationSha256;
      const supplementalArtifact = readBoundJson(
        directory,
        {
          path: restore.supplementalApprovalPath,
          sha256: restore.supplementalApprovalSha256,
        },
        'restore supplemental approval'
      );
      requireRecord(
        supplementalArtifact.parsed.restoreCreationOperation,
        'restore supplemental creation operation'
      ).sha256 = creationOperationSha256;
      restore.supplementalApprovalSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        supplementalArtifact.relativePath,
        supplementalArtifact.parsed
      );
      restore.rpoObservedAt = restoreActionStartedAt;
      restore.rpoSeconds = 80;
      const result = runVerifier(
        writeManifest(directory, 'manifest-rpo-observation-lead.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain('pre-confirmation RPO observation drift');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects stale or pre-existing restore-target inventory evidence', () => {
    for (const mutation of ['stale', 'pre-existing'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `pr12-pre-action-inventory-${mutation}-`)
      );
      try {
        const { manifestPath } = buildPassingFixture(directory, {
          ...(mutation === 'stale'
            ? { preActionInventoryObservedAt: '2000-01-01T00:00:00Z' }
            : { preActionInventoryIncludesRequestedTarget: true }),
        });
        const result = runVerifier(manifestPath);
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'restore pre-action project inventory does not prove target absence'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects monotonic timer session or runner-instance discontinuity', () => {
    for (const mutation of ['session', 'runner-instance'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `pr12-monotonic-${mutation}-`)
      );
      try {
        const { manifestPath } = buildPassingFixture(directory, {
          ...(mutation === 'session'
            ? {
                completionTimerSessionId:
                  '00000000-0000-4000-8000-000000000003',
              }
            : {
                completionRunnerInstanceId:
                  '00000000-0000-4000-8000-000000000004',
              }),
        });
        const result = runVerifier(manifestPath);
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'restore multi-clock RTO/RPO provenance or numeric skew validation failed'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('accepts a derived SAME system-identifier observation and rejects a contradictory relationship', () => {
    const sameDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-system-identifier-same-')
    );
    try {
      const { manifestPath } = buildPassingFixture(sameDirectory, {
        restoreSystemIdentifier: 'synthetic-system-id',
      });
      const sameResult = runVerifier(manifestPath);
      expect(sameResult.status).toBe(1);
      expect(sameResult.output).toContain(
        'COMM verified claim registry incomplete'
      );
      expect(sameResult.output).not.toContain(
        'restore system-identifier relationship was not derived and recorded'
      );
    } finally {
      fs.rmSync(sameDirectory, { recursive: true, force: true });
    }

    for (const mutation of [
      'same-reported-different',
      'different-reported-same',
    ] as const) {
      const mismatchDirectory = fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          `pr12-system-identifier-relationship-${mutation}-`
        )
      );
      try {
        const { manifestPath } = buildPassingFixture(mismatchDirectory, {
          ...(mutation === 'same-reported-different'
            ? {
                restoreSystemIdentifier: 'synthetic-system-id',
                restoreRelationshipToSource: 'DIFFERENT' as const,
              }
            : { restoreRelationshipToSource: 'SAME' as const }),
        });
        const mismatchResult = runVerifier(manifestPath);
        expect(mismatchResult.status).toBe(1);
        expect(mismatchResult.output).toContain(
          'restore system-identifier relationship was not derived and recorded'
        );
      } finally {
        fs.rmSync(mismatchDirectory, { recursive: true, force: true });
      }
    }
  });

  it('rejects incomplete restore provider provenance and contradictory provider identifiers', () => {
    for (const mutation of [
      'raw-list',
      'collector-owner',
      'provider-id',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-restore-provider-provenance-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const restore = requireRecord(manifest.restore, 'restore');
        const providerArtifact = readBoundJson(
          directory,
          {
            path: restore.providerEvidencePath,
            sha256: restore.providerEvidenceSha256,
          },
          'restore provider export'
        );
        if (mutation === 'raw-list') {
          requireArray(
            providerArtifact.parsed.rawProviderArtifacts,
            'restore raw provider artifacts'
          ).pop();
        } else if (mutation === 'collector-owner') {
          providerArtifact.parsed.capturedBy = 'synthetic_wrong_operator';
        } else {
          const dashboard = requireRecord(
            providerArtifact.parsed.dashboardActionEvidence,
            'restore dashboard action evidence'
          );
          const dashboardRaw = readBoundJson(
            directory,
            dashboard.rawArtifact,
            'restore dashboard action raw'
          );
          dashboardRaw.parsed.providerOperationIdentifier =
            'synthetic-provider-operation-id';
          const dashboardRawSha256 = rewriteJsonArtifact(
            directory,
            manifest,
            dashboardRaw.relativePath,
            dashboardRaw.parsed
          );
          requireRecord(
            dashboard.rawArtifact,
            'restore dashboard raw binding'
          ).sha256 = dashboardRawSha256;
          const providerIdentifier = requireRecord(
            providerArtifact.parsed.providerOperationIdentifier,
            'restore provider identifier'
          );
          providerIdentifier.availability = 'CAPTURED';
          providerIdentifier.value = 'synthetic-provider-operation-id';
          requireRecord(
            providerIdentifier.rawArtifact,
            'restore provider identifier raw binding'
          ).sha256 = dashboardRawSha256;
          const rawProviderBinding = requireArray(
            providerArtifact.parsed.rawProviderArtifacts,
            'restore raw provider artifacts'
          )
            .map((value, index) =>
              requireRecord(
                value,
                `restore raw provider artifacts[${String(index)}]`
              )
            )
            .find(value => value.path === dashboardRaw.relativePath);
          if (!rawProviderBinding) {
            throw new Error('restore dashboard raw provider binding missing');
          }
          rawProviderBinding.sha256 = dashboardRawSha256;
        }
        rebindRestoreProviderExportChain(
          directory,
          manifest,
          providerArtifact.parsed
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-restore-provider-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /rawProviderArtifacts approval mismatch|capturedBy does not match|captured provider operation identifier lacks raw provenance/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects restore mirrored settings not derived from the raw provider capture', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-restore-mirror-raw-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const restore = requireRecord(manifest.restore, 'restore');
      const providerArtifact = readBoundJson(
        directory,
        {
          path: restore.providerEvidencePath,
          sha256: restore.providerEvidenceSha256,
        },
        'restore provider export'
      );
      const restoreSnapshotBinding = requireRecord(
        providerArtifact.parsed.restoreMirroredConfiguration,
        'restore mirrored configuration binding'
      );
      const restoreSnapshot = readBoundJson(
        directory,
        restoreSnapshotBinding,
        'restore mirrored configuration'
      );
      const rawBinding = requireRecord(
        restoreSnapshot.parsed.rawArtifact,
        'restore mirrored raw binding'
      );
      const rawArtifact = readBoundJson(
        directory,
        rawBinding,
        'restore mirrored raw artifact'
      );
      requireRecord(
        requireRecord(
          rawArtifact.parsed.dashboardSettingsExport,
          'restore dashboard settings export'
        ).diskAttributes,
        'restore disk attributes'
      ).sizeGb = 64;
      const rawSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        rawArtifact.relativePath,
        rawArtifact.parsed
      );
      rawBinding.sha256 = rawSha256;
      const snapshotSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        restoreSnapshot.relativePath,
        restoreSnapshot.parsed
      );
      restoreSnapshotBinding.sha256 = snapshotSha256;
      const rawProviderBinding = requireArray(
        providerArtifact.parsed.rawProviderArtifacts,
        'restore raw provider artifacts'
      )
        .map((value, index) =>
          requireRecord(
            value,
            `restore raw provider artifacts[${String(index)}]`
          )
        )
        .find(value => value.path === rawArtifact.relativePath);
      if (!rawProviderBinding) {
        throw new Error('restore mirror raw provider binding missing');
      }
      rawProviderBinding.sha256 = rawSha256;
      rebindRestoreProviderExportChain(
        directory,
        manifest,
        providerArtifact.parsed
      );
      const result = runVerifier(
        writeManifest(directory, 'manifest-restore-mirror-raw.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'is not derived from command-scoped provider configuration evidence'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects side-effect transport, provenance, raw-state, and destination drift', () => {
    for (const mutation of [
      'configuration',
      'fingerprint',
      'transport',
      'provenance',
      'pending',
      'sms-provider',
      'sms-sink',
      'pgnet-response',
      'git-commit',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-side-effect-family-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const sourceSummary = requireRecord(
          requireRecord(manifest.externalSideEffects, 'externalSideEffects')
            .source,
          'externalSideEffects.source'
        );
        const resultArtifact = readBoundJson(
          directory,
          {
            path: sourceSummary.artifactPath,
            sha256: sourceSummary.artifactSha256,
          },
          'source side-effect result'
        );
        const rawBinding = requireRecord(
          requireArray(
            resultArtifact.parsed.rawEvidence,
            'source side-effect raw evidence'
          )[0],
          'source side-effect raw binding'
        );
        const rawArtifact = readBoundJson(
          directory,
          rawBinding,
          'source side-effect raw artifact'
        );
        const rawObservations = requireArray(
          rawArtifact.parsed.observations,
          'raw observations'
        );
        const selectedRawObservation =
          mutation === 'sms-provider' || mutation === 'sms-sink'
            ? rawObservations.find(
                value =>
                  requireRecord(value, 'raw side-effect observation').family ===
                  'SMS_CONFIGURATION_AND_DISPATCH'
              )
            : mutation === 'pgnet-response'
              ? rawObservations.find(
                  value =>
                    requireRecord(value, 'raw side-effect observation')
                      .family === 'PG_NET_QUEUE_INVENTORY'
                )
              : rawObservations[0];
        const rawObservation = requireRecord(
          selectedRawObservation,
          'raw side-effect observation'
        );
        const normalizedObservation = requireRecord(
          requireArray(
            resultArtifact.parsed.observations,
            'normalized observations'
          )[0],
          'normalized side-effect observation'
        );
        const rawState = requireRecord(
          rawObservation.rawState,
          'raw side-effect state'
        );
        if (mutation === 'configuration') {
          requireRecord(
            requireArray(
              rawState.catalogRows,
              'raw side-effect catalog rows'
            )[0],
            'raw side-effect extension row'
          ).externalOperationEnabled = true;
          requireRecord(
            normalizedObservation.configuration,
            'normalized side-effect configuration'
          ).pgNet = 'ENABLED';
        } else if (mutation === 'fingerprint') {
          rawState.destinationFingerprintSha256 = ['a'.repeat(64)];
          normalizedObservation.destinationFingerprintSha256 = ['a'.repeat(64)];
        } else if (mutation === 'transport') {
          rawObservation.transport = 'SELF_ATTESTED';
        } else if (mutation === 'provenance') {
          requireRecord(
            rawObservation.provenance,
            'raw side-effect provenance'
          ).requestOrQuerySha256 = '0'.repeat(64);
        } else if (mutation === 'pending') {
          requireArray(
            rawState.pendingExternalOperations,
            'raw pending external operations'
          ).push({ operationId: 'synthetic_pending_operation' });
        } else if (mutation === 'sms-provider') {
          requireRecord(
            rawState.observedSettings,
            'raw SMS observed settings'
          ).providerSelected = true;
        } else if (mutation === 'sms-sink') {
          requireRecord(
            rawState.observedSettings,
            'raw SMS observed settings'
          ).sinkCount = 5;
        } else if (mutation === 'pgnet-response') {
          requireRecord(
            requireArray(rawState.catalogRows, 'raw pg_net rows')[0],
            'raw pg_net count row'
          ).responseCount = 5;
        } else {
          resultArtifact.parsed.gitCommit = 'f'.repeat(40);
        }
        if (
          mutation === 'sms-provider' ||
          mutation === 'sms-sink' ||
          mutation === 'pgnet-response'
        ) {
          const provenance = requireRecord(
            rawObservation.provenance,
            'raw side-effect provenance'
          );
          requireRecord(
            requireArray(provenance.steps, 'raw provenance steps')[0],
            'raw provenance step'
          ).responseBodySha256 = sha256(JSON.stringify(rawState));
        }
        const rawSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          rawArtifact.relativePath,
          rawArtifact.parsed
        );
        rawBinding.sha256 = rawSha256;
        const resultSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          resultArtifact.relativePath,
          resultArtifact.parsed
        );
        sourceSummary.artifactSha256 = resultSha256;
        rebindCommandStdout(
          manifest,
          resultArtifact.relativePath,
          resultSha256
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-side-effect-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        if (mutation === 'sms-provider' || mutation === 'sms-sink') {
          expect(result.output).toContain(
            'SMS provider, credential, or sink must be disabled'
          );
        } else if (mutation === 'pgnet-response') {
          expect(result.output).toContain(
            'pg_net queue and response counts must be zero'
          );
        } else if (mutation === 'git-commit') {
          expect(result.output).toContain(
            'source external-side-effect project ref or git commit mismatch'
          );
        } else {
          expect(result.output).toMatch(
            /rawState facts do not match|rawState destination fingerprint boundary drift|family transport or secret boundary drift|collector provenance drift|response provenance drift|version or external-operation state drift|normalized observations do not derive exactly from raw evidence/u
          );
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects synthetic, missing, extra, duplicate, or family-default-deficient COMM claims', () => {
    for (const mutation of [
      'synthetic',
      'missing',
      'extra',
      'duplicate',
      'family-default-missing',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-comm-claim-map-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const gateId =
          mutation === 'family-default-missing'
            ? 'COMM-BILL-001'
            : 'COMM-DB-001';
        const gate = requireRecord(
          requireArray(manifest.gates, 'gates').find(
            value => requireRecord(value, 'gate').id === gateId
          ),
          `${gateId} gate`
        );
        const resultArtifact = readBoundJson(
          directory,
          {
            path: gate.resultArtifactPath,
            sha256: gate.resultArtifactSha256,
          },
          `${gateId} result`
        );
        const checks = requireArray(
          resultArtifact.parsed.checks,
          `${gateId} checks`
        );
        if (mutation === 'synthetic') {
          requireRecord(checks[0], 'first COMM check').id =
            `${gateId}-synthetic-check`;
        } else if (
          mutation === 'missing' ||
          mutation === 'family-default-missing'
        ) {
          checks.pop();
        } else if (mutation === 'extra') {
          checks.push({
            id: `${gateId}.EXTRA`,
            status: 'PASS',
            evidence: [evidencePath],
          });
        } else {
          requireRecord(checks[1], 'second COMM check').id = requireRecord(
            checks[0],
            'first COMM check'
          ).id;
        }
        gate.resultArtifactSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          resultArtifact.relativePath,
          resultArtifact.parsed
        );

        const result = runVerifier(
          refreshPrivacyScan(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /checks approval mismatch|check count does not match the frozen claim map/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects fail-open security expectations even when contract and observation are rehashed together', () => {
    for (const mutation of ['allow-row', 'mutate-row'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-nonwaivable-security-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const security = requireRecord(
          manifest.securityMatrix,
          'securityMatrix'
        );
        const { relativePath, parsed: contract } = readBoundJson(
          directory,
          {
            path: security.contractPath,
            sha256: security.contractSha256,
          },
          'security contract'
        );
        const contractRow = requireRecord(
          requireArray(contract.rows, 'security contract rows')[0],
          'security contract row'
        );
        const observedRow = requireRecord(
          requireArray(security.rows, 'security rows')[0],
          'security observed row'
        );
        if (mutation === 'allow-row') {
          contractRow.expectedDecision = 'ALLOW';
          contractRow.expectedRowCount = 1;
          observedRow.expectedDecision = 'ALLOW';
          observedRow.observedDecision = 'ALLOW';
          observedRow.expectedRowCount = 1;
          observedRow.observedRowCount = 1;
        } else {
          contractRow.expectedMutationCount = 1;
          observedRow.expectedMutationCount = 1;
          observedRow.observedMutationCount = 1;
        }
        const contractSha = rewriteJsonArtifact(
          directory,
          manifest,
          relativePath,
          contract
        );
        security.contractSha256 = contractSha;
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        requireRecord(
          requireRecord(approval.bindings, 'approval bindings').securityMatrix,
          'approval security binding'
        ).sha256 = contractSha;
        rewriteSourceApproval(directory, manifest, approval);
        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /non-waivable DENY|zero cross-tenant rows|mutate zero cross-tenant rows|must mutate zero denied rows/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects empty-target and post-denial drift controls even when security contract and result agree', () => {
    for (const mutation of [
      'empty-precondition',
      'post-denial-drift',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-tenant-row-control-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const security = requireRecord(
          manifest.securityMatrix,
          'securityMatrix'
        );
        const { relativePath, parsed: contract } = readBoundJson(
          directory,
          {
            path: security.contractPath,
            sha256: security.contractSha256,
          },
          'security contract'
        );
        const contractRow = requireRecord(
          requireArray(contract.rows, 'security contract rows')[0],
          'security contract row'
        );
        const resultRow = requireRecord(
          requireArray(security.rows, 'security result rows')[0],
          'security result row'
        );
        for (const row of [contractRow, resultRow]) {
          const control = requireRecord(
            row.tenantProbeControl,
            'tenant probe control'
          );
          if (mutation === 'empty-precondition') {
            requireRecord(
              control.precondition,
              'tenant precondition'
            ).rowCount = 0;
          } else {
            requireRecord(control.postDeny, 'tenant post-deny').rowSha256 =
              'f'.repeat(64);
          }
        }
        const contractSha = rewriteJsonArtifact(
          directory,
          manifest,
          relativePath,
          contract
        );
        security.contractSha256 = contractSha;
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        requireRecord(
          requireRecord(approval.bindings, 'approval bindings').securityMatrix,
          'approval security binding'
        ).sha256 = contractSha;
        rewriteSourceApproval(directory, manifest, approval);
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-tenant-control-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'does not prove a real target row, same-tenant allow control, and post-denial invariance'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects an empty Data API RLS target even when the approved matrix agrees', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-data-api-row-control-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const environment = requireRecord(manifest.environment, 'environment');
      const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
      const { relativePath, parsed: contract } = readBoundJson(
        directory,
        { path: dataApi.matrixPath, sha256: dataApi.matrixSha256 },
        'Data API contract'
      );
      const contractRow = requireRecord(
        requireArray(contract.rows, 'Data API contract rows').find(
          value =>
            requireRecord(value, 'Data API contract row').caseClass ===
            'DATA_API_RLS_FILTERED'
        ),
        'Data API filtered contract row'
      );
      const resultRow = requireRecord(
        requireArray(dataApi.directRoleResults, 'Data API result rows').find(
          value =>
            requireRecord(value, 'Data API result row').caseClass ===
            'DATA_API_RLS_FILTERED'
        ),
        'Data API filtered result row'
      );
      for (const row of [contractRow, resultRow]) {
        requireRecord(
          requireRecord(row.tenantProbeControl, 'Data API tenant control')
            .precondition,
          'Data API tenant precondition'
        ).rowCount = 0;
      }
      const contractSha = rewriteJsonArtifact(
        directory,
        manifest,
        relativePath,
        contract
      );
      dataApi.matrixSha256 = contractSha;
      const source = requireRecord(manifest.source, 'source');
      const { parsed: approval } = readBoundJson(
        directory,
        {
          path: source.approvalPacketPath,
          sha256: source.approvalPacketSha256,
        },
        'source approval'
      );
      requireRecord(
        requireRecord(approval.bindings, 'approval bindings').dataApiMatrix,
        'approval Data API binding'
      ).sha256 = contractSha;
      rewriteSourceApproval(directory, manifest, approval);
      const result = runVerifier(
        writeManifest(
          directory,
          'manifest-data-api-empty-target.json',
          manifest
        )
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'does not prove a real target row, same-tenant allow control, and post-denial invariance'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects same-tenant positive controls that drift from the denied CRUD operation', () => {
    for (const mutation of [
      'operation-drift',
      'actor-drift',
      'affected-zero',
      'rollback-hash-drift',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-tenant-positive-semantic-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const security = requireRecord(
          manifest.securityMatrix,
          'securityMatrix'
        );
        const contractArtifact = readBoundJson(
          directory,
          {
            path: security.contractPath,
            sha256: security.contractSha256,
          },
          'security contract'
        );
        const desiredOperation =
          mutation === 'affected-zero'
            ? 'insert'
            : mutation === 'rollback-hash-drift'
              ? 'update'
              : 'read';
        const contractRow = requireRecord(
          requireArray(
            contractArtifact.parsed.rows,
            'security contract rows'
          ).find(value => {
            const row = requireRecord(value, 'security contract row');
            return (
              row.operation === desiredOperation &&
              row.tenantProbeControl !== undefined
            );
          }),
          'selected security contract row'
        );
        const resultRow = requireRecord(
          requireArray(security.rows, 'security result rows').find(
            value =>
              requireRecord(value, 'security result row').caseId ===
              contractRow.caseId
          ),
          'selected security result row'
        );
        for (const row of [contractRow, resultRow]) {
          const positive = requireRecord(
            requireRecord(row.tenantProbeControl, 'tenant probe control')
              .sameTenantPositiveControl,
            'same-tenant positive control'
          );
          if (mutation === 'operation-drift') {
            positive.operation = 'delete';
          } else if (mutation === 'actor-drift') {
            positive.actorId = 'synthetic_wrong_counterpart_actor';
            requireRecord(
              positive.authTokenUse,
              'positive auth token use'
            ).actorId = 'synthetic_wrong_counterpart_actor';
          } else if (mutation === 'affected-zero') {
            for (const field of ['expected', 'observed'] as const) {
              const outcome = requireRecord(positive[field], field);
              outcome.mutationCount = 0;
              outcome.directAffectedRows = 0;
            }
          } else {
            requireRecord(
              requireArray(positive.stateResults, 'positive state results')[0],
              'positive state result'
            ).postRollbackSha256 = 'f'.repeat(64);
          }
        }
        const contractSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          contractArtifact.relativePath,
          contractArtifact.parsed
        );
        security.contractSha256 = contractSha256;
        const source = requireRecord(manifest.source, 'source');
        const approvalArtifact = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        requireRecord(
          requireRecord(approvalArtifact.parsed.bindings, 'approval bindings')
            .securityMatrix,
          'approval security binding'
        ).sha256 = contractSha256;
        rewriteSourceApproval(directory, manifest, approvalArtifact.parsed);
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-tenant-positive-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /not a distinct same-tenant actor|expected does not prove the same operation succeeds|does not prove a real target row, same-tenant allow control, and post-denial invariance/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects missing or drifted catalog-bound Data API direct-role and RPC cases', () => {
    for (const mutation of [
      'rpc-missing',
      'catalog-mismatch',
      'rpc-method-path',
      'rpc-body-hash',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-data-api-direct-role-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const environment = requireRecord(manifest.environment, 'environment');
        const dataApi = requireRecord(
          environment.dataApi,
          'environment.dataApi'
        );
        const contractArtifact = readBoundJson(
          directory,
          { path: dataApi.matrixPath, sha256: dataApi.matrixSha256 },
          'Data API contract'
        );
        const contractRows = requireArray(
          contractArtifact.parsed.rows,
          'Data API contract rows'
        );
        const resultRows = requireArray(
          dataApi.directRoleResults,
          'Data API result rows'
        );
        const rpcCaseId = 'data_api_service_role_rpc_normalize_customer_phone';
        if (mutation === 'rpc-missing') {
          for (const rows of [contractRows, resultRows]) {
            const index = rows.findIndex(
              value => requireRecord(value, 'Data API row').caseId === rpcCaseId
            );
            if (index < 0) throw new Error('RPC row missing');
            rows.splice(index, 1);
          }
        } else {
          const contractRow = requireRecord(
            contractRows.find(
              value => requireRecord(value, 'Data API row').caseId === rpcCaseId
            ),
            'Data API RPC contract row'
          );
          const resultRow = requireRecord(
            resultRows.find(
              value => requireRecord(value, 'Data API row').caseId === rpcCaseId
            ),
            'Data API RPC result row'
          );
          for (const row of [contractRow, resultRow]) {
            if (mutation === 'catalog-mismatch') {
              row.aclInventoryCaseId =
                'acl_relation:public.clinics_SELECT_service_role';
            } else if (mutation === 'rpc-method-path') {
              row.httpMethod = 'GET';
              row.requestPath = '/rest/v1/clinics?select=id&limit=1';
            } else {
              row.requestBodySha256 = 'a'.repeat(64);
            }
          }
        }
        const contractSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          contractArtifact.relativePath,
          contractArtifact.parsed
        );
        dataApi.matrixSha256 = contractSha256;
        const source = requireRecord(manifest.source, 'source');
        const approvalArtifact = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        requireRecord(
          requireRecord(approvalArtifact.parsed.bindings, 'approval bindings')
            .dataApiMatrix,
          'approval Data API binding'
        ).sha256 = contractSha256;
        rewriteSourceApproval(directory, manifest, approvalArtifact.parsed);
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-data-api-direct-role-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /result count does not match|is missing DATA_API_RPC_ALLOW|service-role RPC semantics drift|does not bind to the matching catalog-derived ACL result/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects a shrunken matrix target set or an unapproved target classification after full approval rebinding', () => {
    for (const mutation of [
      'target-shrink',
      'classification-unapproved',
      'catalog-classification-missing',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-security-target-inventory-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const security = requireRecord(
          manifest.securityMatrix,
          'securityMatrix'
        );
        const { relativePath, parsed: contract } = readBoundJson(
          directory,
          {
            path: security.contractPath,
            sha256: security.contractSha256,
          },
          'security contract'
        );
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        const approvalBindings = requireRecord(
          approval.bindings,
          'approval bindings'
        );
        if (mutation === 'target-shrink') {
          contract.targets = ['public.representative_relation'];
          security.targets = ['public.representative_relation'];
        } else {
          const targetInventoryBinding = requireRecord(
            contract.targetInventory,
            'security target inventory binding'
          );
          const targetInventory = readBoundJson(
            directory,
            targetInventoryBinding,
            'security target inventory'
          );
          const classificationBinding = requireRecord(
            targetInventory.parsed.classificationContract,
            'security target classification binding'
          );
          const classification = readBoundJson(
            directory,
            classificationBinding,
            'security target classification'
          );
          const classificationRows = requireArray(
            classification.parsed.relations,
            'security target classifications'
          );
          if (mutation === 'classification-unapproved') {
            requireRecord(
              classificationRows[0],
              'security target classification row'
            ).reviewStatus = 'UNASSIGNED';
          } else {
            const removeIndex = classificationRows.findIndex(
              value =>
                requireRecord(value, 'classification row').relation ===
                'public.service_queue'
            );
            if (removeIndex < 0)
              throw new Error('service queue classification missing');
            classificationRows.splice(removeIndex, 1);
          }
          const classificationSha = rewriteJsonArtifact(
            directory,
            manifest,
            classification.relativePath,
            classification.parsed
          );
          classificationBinding.sha256 = classificationSha;
          const inventorySha = rewriteJsonArtifact(
            directory,
            manifest,
            targetInventory.relativePath,
            targetInventory.parsed
          );
          targetInventoryBinding.sha256 = inventorySha;
          requireRecord(
            approvalBindings.securityTargetClassification,
            'approval target classification'
          ).sha256 = classificationSha;
          requireRecord(
            approvalBindings.securityTargetInventory,
            'approval target inventory'
          ).sha256 = inventorySha;
        }
        const contractSha = rewriteJsonArtifact(
          directory,
          manifest,
          relativePath,
          contract
        );
        security.contractSha256 = contractSha;
        requireRecord(
          approvalBindings.securityMatrix,
          'approval security matrix'
        ).sha256 = contractSha;
        rewriteSourceApproval(directory, manifest, approval);

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /derived from approved target inventory|reviewStatus is not owner-approved|does not cover every post-replay catalog relation/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects cascade denial, surviving children, and relational diagnostic drift after contract rebinding', () => {
    for (const mutation of [
      'cascade-denial',
      'cascade-child-present',
      'parent-diagnostic-drift',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-relational-integrity-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const security = requireRecord(
          manifest.securityMatrix,
          'securityMatrix'
        );
        const { relativePath, parsed: contract } = readBoundJson(
          directory,
          {
            path: security.contractPath,
            sha256: security.contractSha256,
          },
          'security contract'
        );
        const jwtCase =
          mutation === 'parent-diagnostic-drift'
            ? 'parent_rehome'
            : 'resource_delete_cascade';
        const contractRow = requireRecord(
          requireArray(contract.rows, 'security contract rows').find(
            value =>
              requireRecord(value, 'security contract row').jwtCase === jwtCase
          ),
          'relational contract row'
        );
        const observedRow = requireRecord(
          requireArray(security.rows, 'security rows').find(
            value => requireRecord(value, 'security row').jwtCase === jwtCase
          ),
          'relational observed row'
        );
        if (mutation === 'cascade-denial') {
          contractRow.expectedDecision = 'DENY';
          contractRow.expectedMutationCount = 0;
          contractRow.expectedDirectAffectedRows = 0;
          observedRow.expectedDecision = 'DENY';
          observedRow.observedDecision = 'DENY';
          observedRow.expectedMutationCount = 0;
          observedRow.observedMutationCount = 0;
          observedRow.expectedDirectAffectedRows = 0;
          observedRow.observedDirectAffectedRows = 0;
        } else if (mutation === 'cascade-child-present') {
          const expectedTransition = requireRecord(
            requireArray(
              contractRow.expectedStateTransitions,
              'contract state transitions'
            ).find(
              value =>
                requireRecord(value, 'contract state transition')
                  .assertionId === 'dependent_block'
            ),
            'dependent block contract transition'
          );
          expectedTransition.transition = 'HASH_UNCHANGED';
          const rowTransition = requireRecord(
            requireArray(
              observedRow.expectedStateTransitions,
              'row state transitions'
            ).find(
              value =>
                requireRecord(value, 'row state transition').assertionId ===
                'dependent_block'
            ),
            'dependent block row transition'
          );
          rowTransition.transition = 'HASH_UNCHANGED';
          const stateResult = requireRecord(
            requireArray(
              observedRow.observedStateResults,
              'observed state results'
            ).find(
              value =>
                requireRecord(value, 'observed state result').assertionId ===
                'dependent_block'
            ),
            'dependent block state result'
          );
          stateResult.transition = 'HASH_UNCHANGED';
          stateResult.afterExists = true;
          stateResult.afterSha256 = stateResult.beforeSha256;
        } else {
          requireRecord(
            contractRow.expectedErrorDiagnostic,
            'contract error diagnostic'
          ).message = 'rewritten diagnostic';
          requireRecord(
            observedRow.expectedErrorDiagnostic,
            'expected error diagnostic'
          ).message = 'rewritten diagnostic';
          requireRecord(
            observedRow.observedErrorDiagnostic,
            'observed error diagnostic'
          ).message = 'rewritten diagnostic';
        }
        const contractSha = rewriteJsonArtifact(
          directory,
          manifest,
          relativePath,
          contract
        );
        security.contractSha256 = contractSha;
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        requireRecord(
          requireRecord(approval.bindings, 'approval bindings').securityMatrix,
          'approval security binding'
        ).sha256 = contractSha;
        rewriteSourceApproval(directory, manifest, approval);

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /cascade postcondition semantics drift|expectedStateTransitions|expectedErrorDiagnostic/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects rehashed source raw security drift and missing Data API ACL or tenant cells', () => {
    for (const mutation of [
      'security-semantic-drift',
      'auth-provenance-fabricated',
      'security-cell-missing',
      'data-api-acl-missing',
      'tenant-positive-missing',
      'tenant-positive-reuse',
      'tenant-positive-outcome-drift',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-source-raw-security-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const sourceResults = requireRecord(
          manifest.sourceStructuredResults,
          'source structured results'
        );
        const resultBinding = requireRecord(
          mutation === 'data-api-acl-missing'
            ? sourceResults.dataApiGraphQl
            : sourceResults.securityMatrix,
          'source result binding'
        );
        const resultArtifact = readBoundJson(
          directory,
          resultBinding,
          'source result'
        );
        const rawBinding =
          mutation === 'data-api-acl-missing'
            ? requireRecord(
                requireRecord(
                  resultArtifact.parsed.rawEvidence,
                  'source API raw evidence'
                ).dataApi,
                'source Data API raw binding'
              )
            : requireRecord(
                requireArray(
                  resultArtifact.parsed.rawEvidence,
                  'source security raw evidence'
                )[0],
                'source security raw binding'
              );
        const rawArtifact = readBoundJson(
          directory,
          rawBinding,
          'source raw artifact'
        );
        const observations = requireArray(
          rawArtifact.parsed.observations,
          'source raw observations'
        );
        if (mutation === 'security-semantic-drift') {
          const observation = requireRecord(
            observations.find(
              value =>
                requireRecord(value, 'security observation').observationType ===
                'SECURITY_AUTH_TENANT_CASE'
            ),
            'security raw observation'
          );
          requireRecord(
            observation.semantic,
            'security raw semantic observation'
          ).postcondition = 'REWRITTEN_POSTCONDITION';
        } else if (mutation === 'auth-provenance-fabricated') {
          const observation = requireRecord(
            observations.find(value => {
              const candidate = requireRecord(
                value,
                'Auth provenance observation'
              );
              return (
                candidate.observationType === 'AUTH_TOKEN_PROVENANCE' &&
                candidate.stage === 'REFRESH'
              );
            }),
            'refresh Auth provenance observation'
          );
          observation.fabricatedUserJwtUsed = true;
        } else if (
          mutation === 'security-cell-missing' ||
          mutation === 'data-api-acl-missing' ||
          mutation === 'tenant-positive-missing'
        ) {
          const removeIndex = observations.findIndex(value => {
            const observation = requireRecord(value, 'raw observation');
            if (mutation === 'security-cell-missing') {
              return (
                observation.observationType === 'SECURITY_AUTH_TENANT_CASE'
              );
            }
            if (mutation === 'tenant-positive-missing') {
              return (
                observation.observationType ===
                'TENANT_SAME_OPERATION_POSITIVE_CONTROL'
              );
            }
            return (
              observation.observationType === 'DATA_API_ACL_CASE' &&
              observation.objectKind === 'FUNCTION'
            );
          });
          if (removeIndex < 0)
            throw new Error('raw observation to remove missing');
          observations.splice(removeIndex, 1);
          rawArtifact.parsed.observationCount = observations.length;
        } else if (mutation === 'tenant-positive-reuse') {
          const positiveObservations = observations
            .map((value, index) =>
              requireRecord(value, `raw observation ${String(index)}`)
            )
            .filter(
              observation =>
                observation.observationType ===
                'TENANT_SAME_OPERATION_POSITIVE_CONTROL'
            );
          if (positiveObservations.length < 2) {
            throw new Error('two positive observations are required');
          }
          positiveObservations[1].observationId =
            positiveObservations[0].observationId;
        } else {
          const positiveObservation = requireRecord(
            observations.find(value => {
              const observation = requireRecord(value, 'positive observation');
              return (
                observation.observationType ===
                  'TENANT_SAME_OPERATION_POSITIVE_CONTROL' &&
                requireRecord(observation.sql, 'positive SQL observation')
                  .directAffectedRows === 1
              );
            }),
            'tenant positive raw observation'
          );
          requireRecord(
            positiveObservation.sql,
            'tenant positive SQL observation'
          ).directAffectedRows = 0;
        }
        rawBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          rawArtifact.relativePath,
          rawArtifact.parsed
        );
        const resultSha = rewriteJsonArtifact(
          directory,
          manifest,
          resultArtifact.relativePath,
          resultArtifact.parsed
        );
        resultBinding.sha256 = resultSha;
        rebindCommandStdout(manifest, resultArtifact.relativePath, resultSha);

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /semantic observation mismatch|hosted Auth provenance drift|security observation count does not cover every case|Data API observation count does not cover every role and ACL|observationId is duplicated|positive raw HTTP\/SQL\/authorization observation mismatch/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects rehashed PR12-CMD-013 phase or mutation-scope drift', () => {
    for (const mutation of ['phase', 'scope'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-source-command-policy-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        const ledgerBinding = requireRecord(
          requireRecord(approval.bindings, 'approval bindings').commandLedger,
          'command ledger binding'
        );
        const ledger = readBoundJson(
          directory,
          ledgerBinding,
          'command ledger'
        );
        const command = requireRecord(
          requireArray(ledger.parsed.commands, 'ledger commands').find(
            value =>
              requireRecord(value, 'ledger command').id === 'PR12-CMD-013'
          ),
          'PR12-CMD-013 ledger command'
        );
        if (mutation === 'phase') {
          command.phase = 'data_api_graphql';
        } else {
          command.mutationScope = 'SYNTHETIC_API_MATRIX_ONLY';
        }
        const ledgerSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          ledger.relativePath,
          ledger.parsed
        );
        rebindCommandLedgerApprovalChain(
          directory,
          manifest,
          approval,
          ledgerSha256
        );

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /phase does not match the required command phase|mutation scope does not match the required command scope|mutationScope is not approved for phase/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects reordered execution commands even when the ledger and manifest agree', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-command-order-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const source = requireRecord(manifest.source, 'source');
      const approvalArtifact = readBoundJson(
        directory,
        {
          path: source.approvalPacketPath,
          sha256: source.approvalPacketSha256,
        },
        'source approval'
      );
      const ledgerBinding = requireRecord(
        requireRecord(
          approvalArtifact.parsed.bindings,
          'source approval bindings'
        ).commandLedger,
        'command ledger binding'
      );
      const ledgerArtifact = readBoundJson(
        directory,
        ledgerBinding,
        'command ledger'
      );
      const swapCommands = (
        values: unknown[],
        firstId: string,
        secondId: string,
        context: string
      ): void => {
        const firstIndex = values.findIndex(
          value => requireRecord(value, context).id === firstId
        );
        const secondIndex = values.findIndex(
          value => requireRecord(value, context).id === secondId
        );
        if (firstIndex < 0 || secondIndex < 0) {
          throw new Error(`${context} is missing the commands to swap`);
        }
        const first = values[firstIndex];
        const second = values[secondIndex];
        if (first === undefined || second === undefined) {
          throw new Error(`${context} command order fixture is incomplete`);
        }
        values[firstIndex] = second;
        values[secondIndex] = first;
      };
      swapCommands(
        requireArray(ledgerArtifact.parsed.commands, 'approved commands'),
        'PR12-CMD-012',
        'PR12-CMD-013',
        'approved command'
      );
      swapCommands(
        requireArray(manifest.commands, 'manifest commands'),
        'PR12-CMD-012',
        'PR12-CMD-013',
        'manifest command'
      );
      const ledgerSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        ledgerArtifact.relativePath,
        ledgerArtifact.parsed
      );
      rebindCommandLedgerApprovalChain(
        directory,
        manifest,
        approvalArtifact.parsed,
        ledgerSha256
      );
      const result = runVerifier(
        writeManifest(directory, 'manifest-command-order.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /approval\.commandLedger\.commands canonical order approval mismatch|commands canonical execution order approval mismatch/u
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a synchronized relational result whose post-ROLLBACK state is not restored', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-post-rollback-restoration-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const sourceResults = requireRecord(
        manifest.sourceStructuredResults,
        'source structured results'
      );
      const resultBinding = requireRecord(
        sourceResults.securityMatrix,
        'source security result binding'
      );
      const resultArtifact = readBoundJson(
        directory,
        resultBinding,
        'source security result'
      );
      const wrapperMatrix = requireRecord(
        resultArtifact.parsed.result,
        'source security wrapper matrix'
      );
      const mutateDependentBlock = (
        matrixValue: Record<string, unknown>
      ): void => {
        const row = requireRecord(
          requireArray(matrixValue.rows, 'security rows').find(
            value =>
              requireRecord(value, 'security row').caseId ===
              'relational_resource_delete_cascade'
          ),
          'resource cascade row'
        );
        const state = requireRecord(
          requireArray(row.observedStateResults, 'observed state results').find(
            value =>
              requireRecord(value, 'state result').assertionId ===
              'dependent_block'
          ),
          'dependent block state result'
        );
        state.postRollbackExists = false;
        state.postRollbackSha256 = null;
      };
      mutateDependentBlock(
        requireRecord(manifest.securityMatrix, 'manifest security matrix')
      );
      mutateDependentBlock(wrapperMatrix);
      const rawBinding = requireRecord(
        requireArray(
          resultArtifact.parsed.rawEvidence,
          'source security raw evidence'
        )[0],
        'source security raw binding'
      );
      const rawArtifact = readBoundJson(
        directory,
        rawBinding,
        'source security raw artifact'
      );
      const rawObservation = requireRecord(
        requireArray(rawArtifact.parsed.observations, 'raw observations').find(
          value =>
            requireRecord(value, 'raw observation').caseId ===
            'relational_resource_delete_cascade'
        ),
        'resource cascade raw observation'
      );
      const rawState = requireRecord(
        requireArray(
          requireRecord(rawObservation.semantic, 'raw semantic').stateResults,
          'raw state results'
        ).find(
          value =>
            requireRecord(value, 'raw state result').assertionId ===
            'dependent_block'
        ),
        'raw dependent block state result'
      );
      rawState.postRollbackExists = false;
      rawState.postRollbackSha256 = null;
      rawBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        rawArtifact.relativePath,
        rawArtifact.parsed
      );
      const resultSha = rewriteJsonArtifact(
        directory,
        manifest,
        resultArtifact.relativePath,
        resultArtifact.parsed
      );
      resultBinding.sha256 = resultSha;
      rebindCommandStdout(manifest, resultArtifact.relativePath, resultSha);

      const result = runVerifier(
        writeManifest(directory, 'manifest-post-rollback-drift.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain('PRESENT_TO_ABSENT observation mismatch');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an ACL contract/result pair that omits one post-replay catalog tuple', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-acl-catalog-tuple-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const environment = requireRecord(manifest.environment, 'environment');
      const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
      const contractArtifact = readBoundJson(
        directory,
        { path: dataApi.matrixPath, sha256: dataApi.matrixSha256 },
        'Data API contract'
      );
      const contractCases = requireArray(
        requireRecord(
          contractArtifact.parsed.aclInventory,
          'Data API ACL inventory'
        ).cases,
        'Data API ACL cases'
      );
      const resultRows = requireArray(
        dataApi.aclInventoryResults,
        'Data API ACL results'
      );
      const targetCaseId = 'acl_relation:public.service_queue_SELECT_anon';
      const contractIndex = contractCases.findIndex(
        value => requireRecord(value, 'ACL case').caseId === targetCaseId
      );
      const resultIndex = resultRows.findIndex(
        value => requireRecord(value, 'ACL result').caseId === targetCaseId
      );
      if (contractIndex < 0 || resultIndex < 0) {
        throw new Error('target ACL tuple is absent from passing fixture');
      }
      contractCases.splice(contractIndex, 1);
      resultRows.splice(resultIndex, 1);
      const contractSha = rewriteJsonArtifact(
        directory,
        manifest,
        contractArtifact.relativePath,
        contractArtifact.parsed
      );
      dataApi.matrixSha256 = contractSha;
      const source = requireRecord(manifest.source, 'source');
      const { parsed: approval } = readBoundJson(
        directory,
        {
          path: source.approvalPacketPath,
          sha256: source.approvalPacketSha256,
        },
        'source approval'
      );
      requireRecord(
        requireRecord(approval.bindings, 'approval bindings').dataApiMatrix,
        'approval Data API matrix binding'
      ).sha256 = contractSha;
      rewriteSourceApproval(directory, manifest, approval);

      const result = runVerifier(
        writeManifest(directory, 'manifest-acl-tuple-missing.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'complete post-replay ACL catalog cross product'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a rehashed privacy report that omits one manifest artifact', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-privacy-exact-coverage-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const command = requireRecord(
        requireArray(manifest.commands, 'commands').find(
          value => requireRecord(value, 'command').id === 'PR12-CMD-020'
        ),
        'privacy scan command'
      );
      const reportArtifact = readBoundJson(
        directory,
        { path: command.stdoutPath, sha256: command.stdoutSha256 },
        'privacy scan report'
      );
      const scannedArtifacts = requireArray(
        reportArtifact.parsed.scannedArtifacts,
        'privacy scanned artifacts'
      );
      scannedArtifacts.pop();
      reportArtifact.parsed.scannedArtifactCount = scannedArtifacts.length;
      const privacy = requireRecord(manifest.privacyScan, 'privacyScan');
      privacy.scannedArtifactCount = scannedArtifacts.length;
      const reportSha = rewriteJsonArtifact(
        directory,
        manifest,
        reportArtifact.relativePath,
        reportArtifact.parsed
      );
      command.stdoutSha256 = reportSha;

      const result = runVerifier(
        writeManifest(directory, 'manifest-privacy-subset.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /exact coverage count mismatch|exact manifest artifact coverage/u
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unmanifested file in an otherwise hash-valid evidence directory', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-evidence-directory-closure-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory);
      fs.writeFileSync(
        path.join(directory, 'unmanifested.txt'),
        'synthetic unlisted output\n',
        'utf8'
      );
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'evidence directory is not manifest-closed'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects sensitive content injected into the final manifest itself', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-final-manifest-privacy-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      manifest.injectedSensitiveValue =
        'sb_secret_synthetic_value_never_printed_1234567890';
      const result = runVerifier(
        writeManifest(directory, 'manifest-sensitive-final.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain('manifest contains sensitive content');
      expect(result.output).not.toContain(
        String(manifest.injectedSensitiveValue)
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects incomplete provisioning target, authorization, or PostgreSQL 17 binding', () => {
    for (const mutation of [
      'unknown-authorization',
      'target',
      'postgres-major',
      'database-version',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-provisioning-binding-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        if (mutation === 'database-version') {
          requireRecord(manifest.environment, 'environment').databaseVersion =
            '16.9';
          requireRecord(
            approval.environment,
            'approval environment'
          ).databaseVersion = '16.9';
        } else {
          const provisioningBinding = requireRecord(
            approval.sourceProjectProvisioningApproval,
            'source provisioning binding'
          );
          const { relativePath, parsed: provisioning } = readBoundJson(
            directory,
            provisioningBinding,
            'source provisioning approval'
          );
          if (mutation === 'unknown-authorization') {
            requireRecord(
              provisioning.authorization,
              'provisioning authorization'
            ).unexpectedAuthorization = false;
          } else if (mutation === 'target') {
            requireRecord(
              provisioning.target,
              'provisioning target'
            ).gitCommit = 'f'.repeat(40);
          } else {
            requireRecord(
              provisioning.environmentProposal,
              'provisioning environment'
            ).postgresMajor = 16;
          }
          provisioningBinding.sha256 = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            provisioning
          );
        }
        rewriteSourceApproval(directory, manifest, approval);
        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /missing or unsupported fields|target does not match|PostgreSQL major must be 17/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('fail-closes schema v2 source provisioning until promotion is implemented', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-provisioning-v2-promotion-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const source = requireRecord(manifest.source, 'source');
      const { parsed: approval } = readBoundJson(
        directory,
        {
          path: source.approvalPacketPath,
          sha256: source.approvalPacketSha256,
        },
        'source approval'
      );
      const provisioningBinding = requireRecord(
        approval.sourceProjectProvisioningApproval,
        'source provisioning binding'
      );
      const { relativePath, parsed: provisioning } = readBoundJson(
        directory,
        provisioningBinding,
        'source provisioning approval'
      );
      provisioning.schemaVersion = 2;
      provisioningBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        relativePath,
        provisioning
      );
      rewriteSourceApproval(directory, manifest, approval);
      const result = runVerifier(
        writeManifest(directory, 'manifest-v2-promotion.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'SOURCE_PROVISIONING_V2_PROMOTION_NOT_IMPLEMENTED'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects legacy source-provider raw region and addon nested schema drift', () => {
    for (const mutation of ['region-smart-group', 'addon-price'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-provider-nested-schema-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        mutateLegacySourceProvisioningProviderRaw(
          directory,
          manifest,
          mutation === 'region-smart-group' ? 1 : 4,
          rawArtifact => {
            const response = requireRecord(
              rawArtifact.response,
              'raw provider response'
            );
            const body = requireRecord(response.body, 'raw provider body');
            if (mutation === 'region-smart-group') {
              const recommendations = requireRecord(
                body.recommendations,
                'raw region recommendations'
              );
              recommendations.smartGroup = {};
            } else {
              const selectedAddons = requireArray(
                body.selected_addons,
                'raw selected addons'
              );
              const addon = requireRecord(selectedAddons[0], 'raw addon');
              const variant = requireRecord(addon.variant, 'raw addon variant');
              variant.price = null;
            }
          }
        );
        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          mutation === 'region-smart-group'
            ? /smartGroup.*missing|smartGroup.*unsupported|smartGroup.*documented/u
            : /variant\.price/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects governance proposal bytes that diverge from the canonical approval packet', () => {
    for (const mutation of [
      'source-execution',
      'source-provisioning',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-canonical-governance-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const replacementArtifact = requireArray(
          manifest.artifacts,
          'manifest artifacts'
        )
          .map((value, index) =>
            requireRecord(value, `artifacts[${String(index)}]`)
          )
          .find(artifact => artifact.path === evidencePath);
        if (!replacementArtifact) {
          throw new Error('missing synthetic replacement artifact');
        }
        const replacementBinding = {
          path: replacementArtifact.path,
          sha256: replacementArtifact.sha256,
        };
        const source = requireRecord(manifest.source, 'source');
        const { parsed: approval } = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        if (mutation === 'source-execution') {
          approval.governanceProposal = replacementBinding;
        } else {
          const provisioningBinding = requireRecord(
            approval.sourceProjectProvisioningApproval,
            'source provisioning binding'
          );
          const provisioningArtifact = readBoundJson(
            directory,
            provisioningBinding,
            'source provisioning approval'
          );
          provisioningArtifact.parsed.governanceProposal = replacementBinding;
          provisioningBinding.sha256 = rewriteJsonArtifact(
            directory,
            manifest,
            provisioningArtifact.relativePath,
            provisioningArtifact.parsed
          );
        }
        rewriteSourceApproval(directory, manifest, approval);

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          mutation === 'source-execution'
            ? 'approvalPacket.governanceProposal does not match the canonical staging execution approval packet'
            : 'sourceProjectProvisioningApproval.governanceProposal does not match the canonical staging execution approval packet'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects retroactive phase approvals and underfunded restore retention', () => {
    for (const mutation of [
      'source-approval',
      'restore-approval',
      'supplemental-approval',
      'restore-funding',
      'source-funding',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-phase-order-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        if (mutation === 'source-approval' || mutation === 'source-funding') {
          const source = requireRecord(manifest.source, 'source');
          const { parsed: approval } = readBoundJson(
            directory,
            {
              path: source.approvalPacketPath,
              sha256: source.approvalPacketSha256,
            },
            'source approval'
          );
          if (mutation === 'source-approval') {
            requireRecord(
              approval.approval,
              'source approval decision'
            ).approvedAt = provisioningApprovedAt;
          } else {
            const provisioningBinding = requireRecord(
              approval.sourceProjectProvisioningApproval,
              'source provisioning binding'
            );
            const provisioningArtifact = readBoundJson(
              directory,
              provisioningBinding,
              'source provisioning approval'
            );
            requireRecord(
              provisioningArtifact.parsed.retentionAndCleanupDecision,
              'source provisioning retention decision'
            ).fundedThrough = futureTimestamp;
            provisioningBinding.sha256 = rewriteJsonArtifact(
              directory,
              manifest,
              provisioningArtifact.relativePath,
              provisioningArtifact.parsed
            );
          }
          rewriteSourceApproval(directory, manifest, approval);
        } else {
          const restore = requireRecord(manifest.restore, 'restore');
          const bindingValue =
            mutation === 'supplemental-approval'
              ? {
                  path: restore.supplementalApprovalPath,
                  sha256: restore.supplementalApprovalSha256,
                }
              : {
                  path: restore.creationApprovalPath,
                  sha256: restore.creationApprovalSha256,
                };
          const { relativePath, parsed: phaseApproval } = readBoundJson(
            directory,
            bindingValue,
            'restore phase approval'
          );
          if (mutation === 'restore-approval') {
            requireRecord(
              phaseApproval.approval,
              'restore creation approval'
            ).approvedAt = pastTimestamp;
          } else if (mutation === 'supplemental-approval') {
            requireRecord(
              phaseApproval.approval,
              'restore supplemental approval'
            ).approvedAt = '2000-01-01T00:01:59Z';
          } else {
            requireRecord(
              phaseApproval.lifecycle,
              'restore creation lifecycle'
            ).fundedThrough = futureTimestamp;
          }
          const digest = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            phaseApproval
          );
          if (mutation === 'supplemental-approval') {
            restore.supplementalApprovalSha256 = digest;
          } else {
            restore.creationApprovalSha256 = digest;
          }
        }
        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /precedes source project provisioning completion|precedes provisioning or replay\/catalog capture completion|precedes selected backup completion|precedes restore project creation completion|precedes backup, side-effect, mirror, or quote evidence|does not cover 24 hours|does not cover 72 hours/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects a backup captured before source approval or before the watermark command completes', () => {
    for (const mutation of [
      'before-source-approval',
      'before-watermark',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-backup-chronology-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const commands = requireArray(manifest.commands, 'commands').map(
          (value, index) => requireRecord(value, `commands[${String(index)}]`)
        );
        if (mutation === 'before-watermark') {
          const watermarkCommand = commands.find(
            command => command.id === 'PR12-CMD-017'
          );
          if (!watermarkCommand) throw new Error('watermark command missing');
          watermarkCommand.endedAt = '2000-01-01T00:00:50Z';
        } else {
          const backup = requireRecord(manifest.backup, 'backup');
          const backupArtifact = readBoundJson(
            directory,
            {
              path: backup.artifactPath,
              sha256: backup.artifactSha256,
            },
            'backup metadata'
          );
          backupArtifact.parsed.providerInsertedAt = '1999-12-31T23:59:59Z';
          const providerInventoryBinding = requireRecord(
            backupArtifact.parsed.providerInventory,
            'backup provider inventory binding'
          );
          const providerInventoryArtifact = readBoundJson(
            directory,
            providerInventoryBinding,
            'backup provider inventory'
          );
          const providerBody = requireRecord(
            requireRecord(
              providerInventoryArtifact.parsed.response,
              'backup provider response'
            ).body,
            'backup provider response body'
          );
          requireRecord(
            requireArray(providerBody.backups, 'backup provider rows')[0],
            'first backup provider row'
          ).inserted_at = '1999-12-31T23:59:59Z';
          providerInventoryBinding.sha256 = rewriteJsonArtifact(
            directory,
            manifest,
            providerInventoryArtifact.relativePath,
            providerInventoryArtifact.parsed
          );
          const backupSha = rewriteJsonArtifact(
            directory,
            manifest,
            backupArtifact.relativePath,
            backupArtifact.parsed
          );
          rebindSelectedBackupMetadataChain(directory, manifest, backupSha);
        }

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /outside the approved source qualification window|backup watermark and final source side-effect inventory are not bound before the selected backup eligibility point|startedAt precedes previous command end|no eligible completed physical backup exists/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('derives backup selection from fresh provider inventory and the frozen 36-hour window', () => {
    for (const mutation of [
      'wrong-endpoint',
      'non-200-response',
      'non-first-eligible',
      'observation-over-36-hours',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `pr12-backup-provider-${mutation}-`)
      );
      try {
        const { manifestPath } = buildPassingFixture(directory, {
          ...(mutation === 'wrong-endpoint'
            ? { backupProviderEndpoint: 'https://api.supabase.com/v1/projects' }
            : mutation === 'non-200-response'
              ? { backupProviderStatus: 500 }
              : mutation === 'non-first-eligible'
                ? { backupProviderAdditionalEarlierEligible: true }
                : {
                    backupProviderObservedAt: '2000-01-02T12:00:31Z',
                  }),
        });
        const result = runVerifier(manifestPath);
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /backup provider inventory request, response, or secret boundary drift|normalized backup metadata does not derive from the first eligible provider row|eligible backup was not observed within the frozen 36-hour wait window/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('derives the supplemental restore mutation allowlist from the approved ledger', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-ledger-mutation-scope-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const restore = requireRecord(manifest.restore, 'restore');
      restore.mutationCommandIds = ['capture-node-version'];
      const { relativePath, parsed: supplemental } = readBoundJson(
        directory,
        {
          path: restore.supplementalApprovalPath,
          sha256: restore.supplementalApprovalSha256,
        },
        'restore supplemental approval'
      );
      supplemental.approvedQualificationMutationCommandIds = [
        'capture-node-version',
      ];
      restore.supplementalApprovalSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        relativePath,
        supplemental
      );
      const result = runVerifier(
        writeManifest(directory, 'manifest-ledger-mutation.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'ledger-derived restore qualification mutation command IDs'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects unapproved restore mutation scopes and project cleanup hidden in the ledger', () => {
    for (const mutation of ['general-restore', 'project-cleanup'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-ledger-operation-policy-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const source = requireRecord(manifest.source, 'source');
        const approvalArtifact = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        const bindings = requireRecord(
          approvalArtifact.parsed.bindings,
          'source approval bindings'
        );
        const ledgerBinding = requireRecord(
          bindings.commandLedger,
          'command ledger binding'
        );
        const ledgerArtifact = readBoundJson(
          directory,
          ledgerBinding,
          'command ledger'
        );
        const approvedCommands = requireArray(
          ledgerArtifact.parsed.commands,
          'approved commands'
        ).map((value, index) =>
          requireRecord(value, `approved commands[${String(index)}]`)
        );
        const manifestCommands = requireArray(
          manifest.commands,
          'manifest commands'
        ).map((value, index) =>
          requireRecord(value, `manifest commands[${String(index)}]`)
        );
        const commandId =
          mutation === 'general-restore' ? 'PR12-CMD-019F' : 'PR12-CMD-020';
        const approvedCommand = approvedCommands.find(
          command => command.id === commandId
        );
        const manifestCommand = manifestCommands.find(
          command => command.id === commandId
        );
        if (!approvedCommand || !manifestCommand) {
          throw new Error(`missing command ${commandId}`);
        }
        if (mutation === 'general-restore') {
          for (const command of [approvedCommand, manifestCommand]) {
            command.mutating = true;
            command.mutationScope = 'GENERAL_RESTORE_MUTATION';
          }
        } else {
          const cleanupCommand =
            'supabase projects delete --project-ref synthetic-restore-project-ref';
          approvedCommand.redactedCommand = cleanupCommand;
          manifestCommand.redactedCommand = cleanupCommand;
        }
        const ledgerSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          ledgerArtifact.relativePath,
          ledgerArtifact.parsed
        );
        rebindCommandLedgerApprovalChain(
          directory,
          manifest,
          approvalArtifact.parsed,
          ledgerSha256
        );

        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /mutationScope is not approved|attempts project cleanup or deletion/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects unexplained row keys and restore migration or type drift', () => {
    for (const mutation of [
      'extra-row',
      'migration-head',
      'migration-history',
      'generated-types',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-restore-integrity-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const integrity = requireRecord(
          manifest.integrityResults,
          'integrity results'
        );
        const bindingValue = requireRecord(
          mutation === 'extra-row' ? integrity.source : integrity.restore,
          'integrity binding'
        );
        const { relativePath, parsed: resultArtifact } = readBoundJson(
          directory,
          bindingValue,
          'integrity result artifact'
        );
        if (mutation === 'extra-row') {
          requireRecord(manifest.rowCounts, 'manifest row counts')[
            'public.unapproved_extra'
          ] = 1;
        } else {
          const sourceResult = requireRecord(
            resultArtifact.source,
            'restore source result'
          );
          const restoredResult = requireRecord(
            resultArtifact.restored,
            'restored result'
          );
          if (mutation === 'migration-head') {
            sourceResult.migrationHead = '20990101000000';
            restoredResult.migrationHead = '20990101000000';
          } else if (mutation === 'migration-history') {
            requireArray(
              sourceResult.orderedMigrations,
              'source ordered migrations'
            ).push('20990101000000_unapproved.sql');
            requireArray(
              restoredResult.orderedMigrations,
              'restored ordered migrations'
            ).push('20990101000000_unapproved.sql');
          } else {
            sourceResult.generatedTypesSha256 = 'f'.repeat(64);
            restoredResult.generatedTypesSha256 = 'f'.repeat(64);
          }
        }
        if (mutation !== 'extra-row') {
          bindingValue.sha256 = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            resultArtifact
          );
          rebindPostRestoreResultChain(
            directory,
            manifest,
            'integrity',
            String(bindingValue.sha256)
          );
        }
        const verifierResult = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(verifierResult.status).toBe(1);
        expect(verifierResult.output).toMatch(
          /missing or unsupported fields|migration head parity mismatch|orderedMigrations approval mismatch|generated types parity mismatch|does not reconcile with raw observations/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('binds DR timestamps and post-restore matrices to structured operation artifacts', () => {
    for (const mutation of [
      'operation-time',
      'restore-security-target',
      'restore-data-api-observation',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-post-restore-structured-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const restore = requireRecord(manifest.restore, 'restore');
        if (mutation === 'operation-time') {
          restore.restoreConfirmationAt = '2000-01-01T00:02:01Z';
          restore.rtoSeconds = 599;
          const commands = requireArray(manifest.commands, 'commands');
          const creationCommand = commands
            .map((value, index) =>
              requireRecord(value, `commands[${String(index)}]`)
            )
            .find(value => value.id === 'PR12-ACTION-017');
          if (!creationCommand) throw new Error('restore command missing');
          creationCommand.endedAt = '2000-01-01T00:02:01Z';
        } else {
          const postRestore = requireRecord(
            manifest.postRestore,
            'postRestore'
          );
          const structured = requireRecord(
            postRestore.structuredResults,
            'postRestore structured results'
          );
          const bindingName =
            mutation === 'restore-security-target'
              ? 'securityMatrix'
              : 'dataApi';
          const resultBinding = requireRecord(
            structured[bindingName],
            `postRestore.${bindingName}`
          );
          const { relativePath, parsed: resultArtifact } = readBoundJson(
            directory,
            resultBinding,
            `postRestore ${bindingName}`
          );
          if (mutation === 'restore-security-target') {
            resultArtifact.projectRef = 'synthetic-project-ref';
          } else {
            requireRecord(
              resultArtifact.result,
              'postRestore data API result'
            ).enabled = false;
          }
          resultBinding.sha256 = rewriteJsonArtifact(
            directory,
            manifest,
            relativePath,
            resultArtifact
          );
          rebindPostRestoreResultChain(
            directory,
            manifest,
            bindingName,
            String(resultBinding.sha256)
          );
        }
        const verifierResult = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(verifierResult.status).toBe(1);
        expect(verifierResult.output).toMatch(
          /not bound to the creation operation result|target or result type mismatch|dataApi.enabled approval mismatch|does not reconcile with raw observations|provider action, creation, readiness, or capture chronology mismatch|restoreMirroredConfiguration is not derived from command-scoped provider configuration evidence/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects rehashed source evidence replay for every restore result family', () => {
    for (const name of [
      'integrity',
      'securityMatrix',
      'dataApi',
      'graphQl',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-post-restore-replay-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const artifacts = requireArray(manifest.artifacts, 'artifacts').map(
          (value, index) => requireRecord(value, `artifacts[${String(index)}]`)
        );
        const sourceBinding = (() => {
          if (name === 'integrity') {
            return requireRecord(
              requireRecord(manifest.integrityResults, 'integrityResults')
                .source,
              'source integrity binding'
            );
          }
          const sourceResults = requireRecord(
            manifest.sourceStructuredResults,
            'sourceStructuredResults'
          );
          if (name === 'securityMatrix') {
            const sourceResult = readBoundJson(
              directory,
              sourceResults.securityMatrix,
              'source security result'
            );
            return requireRecord(
              requireArray(
                sourceResult.parsed.rawEvidence,
                'source security rawEvidence'
              )[0],
              'source security raw binding'
            );
          }
          const sourceResult = readBoundJson(
            directory,
            sourceResults.dataApiGraphQl,
            'source API result'
          );
          return requireRecord(
            requireRecord(
              sourceResult.parsed.rawEvidence,
              'source API rawEvidence'
            )[name],
            `source ${name} raw binding`
          );
        })();
        const sourceEvidence = artifacts.find(
          artifact => artifact.path === sourceBinding.path
        );
        if (!sourceEvidence)
          throw new Error('source evidence artifact missing');
        const resultBinding =
          name === 'integrity'
            ? requireRecord(
                requireRecord(manifest.integrityResults, 'integrityResults')
                  .restore,
                'restore integrity binding'
              )
            : requireRecord(
                requireRecord(
                  requireRecord(manifest.postRestore, 'postRestore')
                    .structuredResults,
                  'postRestore structured results'
                )[name],
                `postRestore ${name} binding`
              );
        const resultArtifact = readBoundJson(
          directory,
          resultBinding,
          `${name} result`
        );
        resultArtifact.parsed.rawEvidence = [
          { path: sourceEvidence.path, sha256: sourceEvidence.sha256 },
        ];
        if (name === 'integrity') {
          resultArtifact.parsed.evidence = [evidencePath];
        } else {
          resultArtifact.parsed.result = replaceEvidencePaths(
            resultArtifact.parsed.result,
            evidencePath
          );
        }
        resultBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          resultArtifact.relativePath,
          resultArtifact.parsed
        );
        rebindPostRestoreResultChain(
          directory,
          manifest,
          name,
          String(resultBinding.sha256)
        );

        const result = runVerifier(
          writeManifest(directory, `manifest-replay-${name}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain('reuses source-environment evidence');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects source result content rewrapped with fresh restore metadata, paths, and hashes', () => {
    for (const name of ['securityMatrix', 'dataApi', 'graphQl'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-post-restore-content-replay-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const postRestore = requireRecord(manifest.postRestore, 'postRestore');
        const structuredResults = requireRecord(
          postRestore.structuredResults,
          'postRestore structured results'
        );
        const resultBinding = requireRecord(
          structuredResults[name],
          `postRestore ${name} binding`
        );
        const resultArtifact = readBoundJson(
          directory,
          resultBinding,
          `postRestore ${name}`
        );
        const rawBinding = requireRecord(
          requireArray(
            resultArtifact.parsed.rawEvidence,
            `postRestore ${name} rawEvidence`
          )[0],
          `postRestore ${name} raw binding`
        );
        if (typeof rawBinding.path !== 'string') {
          throw new TypeError(`postRestore ${name} raw path must be a string`);
        }
        const sourceContent =
          name === 'securityMatrix'
            ? structuredClone(
                requireRecord(manifest.securityMatrix, 'source security matrix')
              )
            : structuredClone(
                requireRecord(manifest.environment, 'source environment')[
                  name === 'dataApi' ? 'dataApi' : 'graphQl'
                ]
              );
        const rewrapped = requireRecord(
          replaceEvidencePaths(sourceContent, rawBinding.path),
          `rewrapped ${name} source result`
        );
        if (name === 'securityMatrix') {
          rewrapped.environmentProjectRef = 'synthetic-restore-ref';
        }
        resultArtifact.parsed.result = rewrapped;
        resultBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          resultArtifact.relativePath,
          resultArtifact.parsed
        );
        rebindPostRestoreResultChain(
          directory,
          manifest,
          name,
          String(resultBinding.sha256)
        );

        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-content-replay-${name}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /rawObservationId|does not reconcile with raw observations|must be an object/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects raw restore observations captured outside every dedicated command window', () => {
    for (const name of [
      'integrity',
      'securityMatrix',
      'dataApi',
      'graphQl',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-raw-window-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const resultBinding =
          name === 'integrity'
            ? requireRecord(
                requireRecord(manifest.integrityResults, 'integrityResults')
                  .restore,
                'restore integrity binding'
              )
            : requireRecord(
                requireRecord(
                  requireRecord(manifest.postRestore, 'postRestore')
                    .structuredResults,
                  'postRestore structured results'
                )[name],
                `postRestore ${name}`
              );
        const resultArtifact = readBoundJson(
          directory,
          resultBinding,
          `${name} result`
        );
        const rawBinding = requireRecord(
          requireArray(
            resultArtifact.parsed.rawEvidence,
            `${name} rawEvidence`
          )[0],
          `${name} raw binding`
        );
        const rawArtifact = readBoundJson(directory, rawBinding, `${name} raw`);
        requireRecord(
          requireArray(
            rawArtifact.parsed.observations,
            `${name} observations`
          )[0],
          `${name} observation`
        ).observedAt = pastTimestamp;
        rawBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          rawArtifact.relativePath,
          rawArtifact.parsed
        );
        resultBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          resultArtifact.relativePath,
          resultArtifact.parsed
        );
        rebindPostRestoreResultChain(
          directory,
          manifest,
          name,
          String(resultBinding.sha256)
        );
        const result = runVerifier(
          writeManifest(directory, `manifest-stale-${name}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'observedAt is outside its dedicated command window'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects contradictory security SQL execution evidence after full hash rebinding', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-security-sql-state-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const resultBinding = requireRecord(
        requireRecord(
          requireRecord(manifest.postRestore, 'postRestore').structuredResults,
          'postRestore structured results'
        ).securityMatrix,
        'security result binding'
      );
      const resultArtifact = readBoundJson(
        directory,
        resultBinding,
        'security result'
      );
      const rawBinding = requireRecord(
        requireArray(
          resultArtifact.parsed.rawEvidence,
          'security rawEvidence'
        )[0],
        'security raw binding'
      );
      const rawArtifact = readBoundJson(directory, rawBinding, 'security raw');
      const observation = requireArray(
        rawArtifact.parsed.observations,
        'security observations'
      )
        .map((value, index) =>
          requireRecord(value, `security observation ${String(index)}`)
        )
        .find(value =>
          isRecord(value.sql) ? value.sql.sqlstate === 'NOT_EXECUTED' : false
        );
      if (!observation) throw new Error('NOT_EXECUTED security case missing');
      requireRecord(observation.sql, 'security SQL observation').executed =
        true;
      rawBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        rawArtifact.relativePath,
        rawArtifact.parsed
      );
      resultBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        resultArtifact.relativePath,
        resultArtifact.parsed
      );
      rebindPostRestoreResultChain(
        directory,
        manifest,
        'securityMatrix',
        String(resultBinding.sha256)
      );
      const result = runVerifier(
        writeManifest(directory, 'manifest-security-sql-state.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'HTTP/SQL/ACL/RLS/semantic observation mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects synchronized Data API and GraphQL observations that violate approved outcomes', () => {
    for (const name of ['dataApi', 'graphQl'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-api-expected-outcome-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const resultBinding = requireRecord(
          requireRecord(
            requireRecord(manifest.postRestore, 'postRestore')
              .structuredResults,
            'postRestore structured results'
          )[name],
          `${name} result binding`
        );
        const resultArtifact = readBoundJson(
          directory,
          resultBinding,
          `${name} result`
        );
        const resultPayload = requireRecord(
          resultArtifact.parsed.result,
          `${name} result payload`
        );
        const structuredRow = requireRecord(
          requireArray(resultPayload.directRoleResults, `${name} rows`)[0],
          `${name} row`
        );
        const rawBinding = requireRecord(
          requireArray(
            resultArtifact.parsed.rawEvidence,
            `${name} rawEvidence`
          )[0],
          `${name} raw binding`
        );
        const rawArtifact = readBoundJson(directory, rawBinding, `${name} raw`);
        const rawObservation = requireArray(
          rawArtifact.parsed.observations,
          `${name} observations`
        )
          .map((value, index) =>
            requireRecord(value, `${name} observation ${String(index)}`)
          )
          .find(
            value => value.observationId === structuredRow.rawObservationId
          );
        if (!rawObservation) throw new Error(`${name} raw row missing`);
        if (name === 'dataApi') {
          structuredRow.observedHttpStatus = 500;
          requireRecord(rawObservation.http, 'Data API raw HTTP').status = 500;
        } else {
          structuredRow.observedHttpStatus = 200;
          structuredRow.observedEndpointOutcome = 'ALLOW';
          requireRecord(rawObservation.http, 'GraphQL raw HTTP').status = 200;
          rawObservation.endpointOutcome = 'ALLOW';
        }
        rawBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          rawArtifact.relativePath,
          rawArtifact.parsed
        );
        rebindPostRestoreServiceRoleScan(
          directory,
          manifest,
          rawArtifact.relativePath,
          String(rawBinding.sha256)
        );
        resultBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          resultArtifact.relativePath,
          resultArtifact.parsed
        );
        rebindPostRestoreResultChain(
          directory,
          manifest,
          name,
          String(resultBinding.sha256)
        );
        const result = runVerifier(
          writeManifest(directory, `manifest-${name}-expected.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /observedHttpStatus does not match expectedHttpStatus|observedEndpointOutcome does not match expectedEndpointOutcome/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects incomplete raw summary case coverage', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-api-summary-coverage-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const resultBinding = requireRecord(
        requireRecord(
          requireRecord(manifest.postRestore, 'postRestore').structuredResults,
          'postRestore structured results'
        ).dataApi,
        'Data API result binding'
      );
      const resultArtifact = readBoundJson(
        directory,
        resultBinding,
        'Data API result'
      );
      const rawBinding = requireRecord(
        requireArray(
          resultArtifact.parsed.rawEvidence,
          'Data API rawEvidence'
        )[0],
        'Data API raw binding'
      );
      const rawArtifact = readBoundJson(directory, rawBinding, 'Data API raw');
      const summary = requireArray(
        rawArtifact.parsed.observations,
        'Data API observations'
      )
        .map((value, index) =>
          requireRecord(value, `Data API observation ${String(index)}`)
        )
        .find(value => value.gate === 'schemaUsage');
      if (!summary) throw new Error('Data API summary missing');
      requireArray(summary.coveredCaseIds, 'coveredCaseIds').pop();
      rawBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        rawArtifact.relativePath,
        rawArtifact.parsed
      );
      resultBinding.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        resultArtifact.relativePath,
        resultArtifact.parsed
      );
      rebindPostRestoreResultChain(
        directory,
        manifest,
        'dataApi',
        String(resultBinding.sha256)
      );
      const result = runVerifier(
        writeManifest(directory, 'manifest-summary-coverage.json', manifest)
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'coveredCaseIds does not reconcile with raw observations'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects weakened immutable DR policy and unbound approved cleanup owners', () => {
    for (const mutation of [
      'immutable-policy',
      'unassigned-cleanup-owner',
      'wrong-cleanup-owner',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-dr-policy-owner-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const source = requireRecord(manifest.source, 'source');
        const approvalArtifact = readBoundJson(
          directory,
          {
            path: source.approvalPacketPath,
            sha256: source.approvalPacketSha256,
          },
          'source approval'
        );
        const drBinding = requireRecord(
          requireRecord(
            approvalArtifact.parsed.bindings,
            'source approval bindings'
          ).drContract,
          'source approval DR binding'
        );
        const drArtifact = readBoundJson(
          directory,
          drBinding,
          'approved DR contract'
        );
        if (mutation === 'immutable-policy') {
          requireRecord(
            drArtifact.parsed.method,
            'approved DR method'
          ).logicalFallbackAllowedWithoutReapproval = true;
        } else {
          requireRecord(
            drArtifact.parsed.cleanup,
            'approved DR cleanup'
          ).cleanupOwner =
            mutation === 'unassigned-cleanup-owner'
              ? 'UNASSIGNED'
              : 'synthetic_wrong_cleanup_owner';
        }
        drBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          drArtifact.relativePath,
          drArtifact.parsed
        );
        rewriteSourceApproval(directory, manifest, approvalArtifact.parsed);
        const result = runVerifier(
          writeManifest(directory, `manifest-dr-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          mutation === 'immutable-policy'
            ? /approved DR contract changes an immutable tracked safety boundary/u
            : mutation === 'unassigned-cleanup-owner'
              ? /approvalPacket\.drContract\.cleanup\.cleanupOwner (?:must be concrete|contains a placeholder or unresolved value)/u
              : /approved DR cleanup owner does not match manifest ownership/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects incomplete or credential-unbound service-role non-exposure scans', () => {
    for (const mutation of [
      'missing-browser-domain',
      'zero-files',
      'fingerprint-mismatch',
      'exact-match-finding',
      'pattern-finding',
      'wrong-covered-observation',
      'command-stream-omits-covered-artifact',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-service-role-scan-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const sideEffects = requireRecord(
          manifest.externalSideEffects,
          'externalSideEffects'
        );
        const sourceSideEffects = requireRecord(
          sideEffects.source,
          'externalSideEffects.source'
        );
        const boundary = requireRecord(
          sourceSideEffects.serviceRoleNonExposure,
          'serviceRoleNonExposure'
        );
        const reportArtifact = readBoundJson(
          directory,
          { path: boundary.reportPath, sha256: boundary.reportSha256 },
          'service-role non-exposure report'
        );
        const domains = requireArray(
          reportArtifact.parsed.domains,
          'service-role report domains'
        );
        const firstDomain = requireRecord(domains[0], 'first scan domain');
        if (mutation === 'missing-browser-domain') {
          domains.shift();
          reportArtifact.parsed.scannedFileCount = 3;
        } else if (mutation === 'zero-files') {
          firstDomain.fileCount = 0;
        } else if (mutation === 'fingerprint-mismatch') {
          reportArtifact.parsed.credentialFingerprintSha256 = 'a'.repeat(64);
        } else if (mutation === 'exact-match-finding') {
          firstDomain.exactMatchCount = 1;
        } else if (mutation === 'pattern-finding') {
          firstDomain.patternFindingCount = 1;
        } else if (mutation === 'wrong-covered-observation') {
          const boundaryBindings = requireArray(
            boundary.coveredCaseBindings,
            'boundary covered case bindings'
          );
          const reportBindings = requireArray(
            reportArtifact.parsed.coveredCaseBindings,
            'report covered case bindings'
          );
          requireRecord(
            boundaryBindings[0],
            'boundary first covered case binding'
          ).rawObservationId = 'source-data-api-not-the-covered-observation';
          requireRecord(
            reportBindings[0],
            'report first covered case binding'
          ).rawObservationId = 'source-data-api-not-the-covered-observation';
        } else {
          const commandStreamDomain = requireRecord(
            domains.find(
              value =>
                requireRecord(value, 'scan domain').domain ===
                'COMMAND_STREAM_AND_EVIDENCE'
            ),
            'command-stream scan domain'
          );
          const inventoryArtifact = readBoundJson(
            directory,
            {
              path: commandStreamDomain.inventoryPath,
              sha256: commandStreamDomain.inventorySha256,
            },
            'command-stream scan inventory'
          );
          const files = requireArray(
            inventoryArtifact.parsed.files,
            'command-stream scan files'
          );
          const removedFile = requireRecord(
            files.pop(),
            'removed command-stream scan file'
          );
          inventoryArtifact.parsed.fileCount = files.length;
          inventoryArtifact.parsed.totalBytes =
            Number(inventoryArtifact.parsed.totalBytes) -
            Number(removedFile.bytes);
          commandStreamDomain.fileCount = inventoryArtifact.parsed.fileCount;
          commandStreamDomain.totalBytes = inventoryArtifact.parsed.totalBytes;
          reportArtifact.parsed.scannedFileCount =
            Number(reportArtifact.parsed.scannedFileCount) - 1;
          reportArtifact.parsed.scannedByteCount =
            Number(reportArtifact.parsed.scannedByteCount) -
            Number(removedFile.bytes);
          commandStreamDomain.inventorySha256 = rewriteJsonArtifact(
            directory,
            manifest,
            inventoryArtifact.relativePath,
            inventoryArtifact.parsed
          );
        }
        boundary.reportSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          reportArtifact.relativePath,
          reportArtifact.parsed
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-service-role-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /report\.domains|scan coverage, byte totals, or findings drift|service-role fingerprint mismatch|rawObservation must be an object|does not resolve to its service-role raw observation|command-stream inventory omits covered API evidence/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects service-role non-exposure scans captured before covered API observations', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-service-role-scan-chronology-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const sourceSideEffects = requireRecord(
        requireRecord(manifest.externalSideEffects, 'externalSideEffects')
          .source,
        'externalSideEffects.source'
      );
      const boundary = requireRecord(
        sourceSideEffects.serviceRoleNonExposure,
        'serviceRoleNonExposure'
      );
      const reportArtifact = readBoundJson(
        directory,
        { path: boundary.reportPath, sha256: boundary.reportSha256 },
        'service-role non-exposure report'
      );
      reportArtifact.parsed.commandId = 'PR12-CMD-013';
      reportArtifact.parsed.capturedAt = sourceSecurityCompletedAt;
      boundary.reportSha256 = rewriteJsonArtifact(
        directory,
        manifest,
        reportArtifact.relativePath,
        reportArtifact.parsed
      );
      const result = runVerifier(
        writeManifest(
          directory,
          'manifest-service-role-scan-chronology.json',
          manifest
        )
      );
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /late service-role scan command|service-role non-exposure scan precedes a covered API observation/u
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects future, duration, and privacy chronology forgery', () => {
    for (const mutation of ['future', 'duration', 'privacy-order'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-timing-privacy-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const timing = requireRecord(manifest.timing, 'timing');
        const privacy = requireRecord(manifest.privacyScan, 'privacyScan');
        if (mutation === 'future') {
          timing.endedAt = futureTimestamp;
        } else if (mutation === 'duration') {
          timing.durationSeconds = 1;
        } else {
          privacy.manualReviewedAt = privacyScanCompletedAt;
        }
        const result = runVerifier(
          writeManifest(directory, `manifest-${mutation}.json`, manifest)
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /must not be in the future|durationSeconds does not match|manualReviewedAt must (?:follow every pre-scan command and )?precede the terminal machine scan/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects canonical facts and hosted percentiles forged in structured and raw evidence', () => {
    for (const mutation of ['canonical', 'hosted'] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-performance-raw-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const performance = requireRecord(manifest.performance, 'performance');
        const bindingValue = requireRecord(
          mutation === 'canonical'
            ? performance.canonicalObservation
            : requireRecord(performance.hostedSlo, 'hostedSlo').observation,
          `${mutation} observation binding`
        );
        const artifact = readBoundJson(
          directory,
          bindingValue,
          `${mutation} observation`
        );
        if (mutation === 'canonical') {
          const observation = requireArray(
            artifact.parsed.observations,
            'canonical observations'
          )
            .map((value, index) =>
              requireRecord(value, `canonical observation ${String(index)}`)
            )
            .find(
              value =>
                value.id ===
                'created_by_read:natural_index_scan:blocks_created_by_idx'
            );
          if (!observation)
            throw new Error('canonical plan observation missing');
          requireRecord(observation.facts, 'canonical plan facts').indexName =
            'forged_index';
        } else {
          const hosted = requireRecord(performance.hostedSlo, 'hostedSlo');
          const structuredSample = requireRecord(
            requireArray(hosted.sampleResults, 'hosted samples')[0],
            'hosted sample'
          );
          requireRecord(
            structuredSample.observed,
            'hosted sample observed'
          ).p95Ms = 40;
          const rawHosted = requireRecord(
            artifact.parsed.hostedSlo,
            'raw hosted SLO'
          );
          requireRecord(
            requireRecord(
              requireArray(rawHosted.sampleResults, 'raw hosted samples')[0],
              'raw hosted sample'
            ).observed,
            'raw hosted observed'
          ).p95Ms = 40;
          const rawSampleObservation = requireRecord(
            requireArray(
              artifact.parsed.observations,
              'hosted observations'
            )[0],
            'hosted sample observation'
          );
          requireRecord(
            requireRecord(rawSampleObservation.result, 'raw hosted result')
              .observed,
            'raw hosted result observed'
          ).p95Ms = 40;
        }
        bindingValue.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          artifact.relativePath,
          artifact.parsed
        );
        rebindCommandStdout(
          manifest,
          artifact.relativePath,
          String(bindingValue.sha256)
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-${mutation}-forgery.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /facts does not reconcile with raw observations|percentiles are not derived from raw latency values/u
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it.each([
    ['primary execution', 'primaryExecutionResults'],
    ['primary WAL', 'primaryWalResults'],
    ['auxiliary execution', 'auxiliaryExecutionResults'],
    ['auxiliary WAL', 'auxiliaryWalResults'],
    ['plan', 'planResults'],
    ['semantic', 'semanticResults'],
  ] as const)(
    'rejects reordered %s gates even when structured and raw evidence agree',
    (_label, familyKey) => {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-canonical-order-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const performance = requireRecord(manifest.performance, 'performance');
        const structuredResults = requireArray(
          performance[familyKey],
          `performance.${familyKey}`
        );
        const structuredFirst = structuredResults[0];
        const structuredSecond = structuredResults[1];
        if (structuredFirst === undefined || structuredSecond === undefined) {
          throw new Error(`${familyKey} fixture requires at least two gates`);
        }
        structuredResults[0] = structuredSecond;
        structuredResults[1] = structuredFirst;

        const observationBinding = requireRecord(
          performance.canonicalObservation,
          'performance.canonicalObservation'
        );
        const observationArtifact = readBoundJson(
          directory,
          observationBinding,
          'canonical observation'
        );
        const rawCanonical = requireRecord(
          observationArtifact.parsed.canonical,
          'canonical observation payload'
        );
        const rawResults = requireArray(
          rawCanonical[familyKey],
          `canonical.${familyKey}`
        );
        const rawFirst = rawResults[0];
        const rawSecond = rawResults[1];
        if (rawFirst === undefined || rawSecond === undefined) {
          throw new Error(
            `${familyKey} raw fixture requires at least two gates`
          );
        }
        rawResults[0] = rawSecond;
        rawResults[1] = rawFirst;

        const observations = requireArray(
          observationArtifact.parsed.observations,
          'canonical observations'
        );
        const matchingIndexes = observations.flatMap((value, index) =>
          requireRecord(value, `canonical observations[${String(index)}]`)
            .category === familyKey
            ? [index]
            : []
        );
        const firstIndex = matchingIndexes[0];
        const secondIndex = matchingIndexes[1];
        if (firstIndex === undefined || secondIndex === undefined) {
          throw new Error(
            `${familyKey} observation fixture requires at least two gates`
          );
        }
        const observationFirst = observations[firstIndex];
        const observationSecond = observations[secondIndex];
        if (observationFirst === undefined || observationSecond === undefined) {
          throw new Error(`${familyKey} observation fixture is incomplete`);
        }
        observations[firstIndex] = observationSecond;
        observations[secondIndex] = observationFirst;

        observationBinding.sha256 = rewriteJsonArtifact(
          directory,
          manifest,
          observationArtifact.relativePath,
          observationArtifact.parsed
        );
        rebindCommandStdout(
          manifest,
          observationArtifact.relativePath,
          String(observationBinding.sha256)
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-canonical-${familyKey}-order.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain('id order drift');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it('rejects incomplete backup watermark before/after proof', () => {
    for (const mutation of [
      'same-values',
      'wrong-target',
      'wrong-count',
    ] as const) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pr12-watermark-proof-verifier-')
      );
      try {
        const { manifest } = buildPassingFixture(directory);
        const command = requireArray(manifest.commands, 'commands')
          .map((value, index) =>
            requireRecord(value, `commands[${String(index)}]`)
          )
          .find(value => value.id === 'PR12-CMD-017');
        if (!command || typeof command.stdoutPath !== 'string') {
          throw new Error('backup watermark command missing');
        }
        const operationValue: unknown = JSON.parse(
          fs.readFileSync(path.join(directory, command.stdoutPath), 'utf8')
        );
        const operation = requireRecord(operationValue, 'watermark operation');
        if (mutation === 'same-values') {
          operation.beforeValue = operation.afterValue;
        } else if (mutation === 'wrong-target') {
          requireRecord(operation.target, 'watermark target').relation =
            'public.other_relation';
        } else {
          operation.affectedRows = 2;
        }
        command.stdoutSha256 = rewriteJsonArtifact(
          directory,
          manifest,
          command.stdoutPath,
          operation
        );
        const result = runVerifier(
          writeManifest(
            directory,
            `manifest-watermark-${mutation}.json`,
            manifest
          )
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain(
          'backup watermark operation identity, observation chronology, or affected-row proof mismatch'
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects source result replay from another runtime after hash rebinding', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-runtime-replay-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const bindingValue = requireRecord(
        requireRecord(manifest.integrityResults, 'integrityResults')
          .migrationHistory,
        'migration history binding'
      );
      const artifact = readBoundJson(
        directory,
        bindingValue,
        'migration history result'
      );
      requireRecord(
        artifact.parsed.runtimeIdentity,
        'source runtime identity'
      ).systemIdentifier = 'replayed-system-identifier';
      bindingValue.sha256 = rewriteJsonArtifact(
        directory,
        manifest,
        artifact.relativePath,
        artifact.parsed
      );
      rebindCommandStdout(
        manifest,
        artifact.relativePath,
        String(bindingValue.sha256)
      );
      const result = runVerifier(
        writeManifest(
          directory,
          'manifest-source-runtime-replay.json',
          manifest
        )
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'sourceReplayCatalogCaptureResult.migrationHistoryResult.sha256 does not match the artifact'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'TYPO_CLASSIFICATION'],
  ])('rejects %s artifact classification', (_label, value) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-classification-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const artifacts = requireArray(manifest.artifacts, 'artifacts');
      const first = requireRecord(artifacts[0], 'artifacts[0]');
      if (value === undefined) {
        delete first.classification;
      } else {
        first.classification = value;
      }
      const mismatchPath = writeManifest(
        directory,
        'manifest-classification-mismatch.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain('artifacts[0].classification');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects top-level PASS_WITH_RISK without evaluating it as a pass', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-pass-with-risk-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      manifest.status = 'PASS_WITH_RISK';
      const mismatchPath = writeManifest(
        directory,
        'manifest-pass-with-risk.json',
        manifest
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain('manifest status is unsupported');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
