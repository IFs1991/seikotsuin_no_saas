export const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

export type MutationMethod = (typeof MUTATION_METHODS)[number];

export type MutationClass =
  | 'PUBLIC_VALIDATED'
  | 'AUTH_SCOPED_BILLED'
  | 'AUTH_SCOPED_UNBILLED'
  | 'ADMIN_SCOPED'
  | 'INTERNAL_SECRET'
  | 'SIGNED_WEBHOOK'
  | 'HEALTH_OR_NO_MUTATION';

export type RouteMutationPolicy = {
  route: string;
  methods: readonly MutationMethod[];
  classification: MutationClass;
  clinicScope: 'required' | 'derived' | 'not-applicable';
  billing: 'required' | 'explicit-exception' | 'not-applicable';
  auth:
    | 'supabase-user'
    | 'admin-role'
    | 'cron-secret'
    | 'internal-secret'
    | 'webhook-signature'
    | 'line-my-page-token'
    | 'public';
  idempotency: 'required' | 'recommended' | 'not-applicable';
  rateLimit: 'required' | 'middleware' | 'not-applicable';
  exceptionReason?: string;
  owner: string;
};

export type SideEffectingGetPolicy = Omit<RouteMutationPolicy, 'methods'> & {
  methods: readonly ['GET'];
  exceptionReason: string;
};

type ClinicScopeRequirement = RouteMutationPolicy['clinicScope'];

function billed(
  route: string,
  methods: readonly MutationMethod[],
  owner = 'clinical-operations'
): RouteMutationPolicy {
  return {
    route,
    methods,
    classification: 'AUTH_SCOPED_BILLED',
    clinicScope: 'required',
    billing: 'required',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    owner,
  };
}

function admin(
  route: string,
  methods: readonly MutationMethod[],
  clinicScope: ClinicScopeRequirement,
  exceptionReason: string,
  owner = 'platform-administration'
): RouteMutationPolicy {
  return {
    route,
    methods,
    classification: 'ADMIN_SCOPED',
    clinicScope,
    billing: 'explicit-exception',
    auth: 'admin-role',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason,
    owner,
  };
}

function unbilled(
  route: string,
  methods: readonly MutationMethod[],
  clinicScope: ClinicScopeRequirement,
  exceptionReason: string,
  owner: string,
  auth: RouteMutationPolicy['auth'] = 'supabase-user'
): RouteMutationPolicy {
  return {
    route,
    methods,
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope,
    billing: 'explicit-exception',
    auth,
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason,
    owner,
  };
}

function internal(
  route: string,
  idempotency: RouteMutationPolicy['idempotency'] = 'recommended'
): RouteMutationPolicy {
  return {
    route,
    methods: ['POST'],
    classification: 'INTERNAL_SECRET',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'internal-secret',
    idempotency,
    rateLimit: 'not-applicable',
    owner: 'billing-operations',
  };
}

function noMutation(
  route: string,
  methods: readonly MutationMethod[]
): RouteMutationPolicy {
  return {
    route,
    methods,
    classification: 'HEALTH_OR_NO_MUTATION',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'public',
    idempotency: 'not-applicable',
    rateLimit: 'not-applicable',
    exceptionReason:
      'Deprecated method is retained only as a fixed 405/410 denial and performs no mutation.',
    owner: 'platform-security',
  };
}

export const mutatingRoutePolicies = [
  billed('/api/ai-comments', ['POST'], 'ai-operations'),
  billed('/api/blocks', ['POST', 'DELETE'], 'scheduling'),
  billed('/api/care-episodes', ['POST']),
  billed('/api/care-episodes/[id]', ['PATCH']),
  billed('/api/care-episodes/recalculate-visit-stages', ['POST']),
  billed('/api/chat', ['POST'], 'ai-operations'),
  billed('/api/customers', ['POST', 'PATCH']),
  billed('/api/customers/[customerId]/insurance-coverages', ['POST']),
  billed('/api/customers/[customerId]/insurance-coverages/[coverageId]', [
    'PATCH',
  ]),
  billed('/api/daily-reports', ['POST', 'DELETE']),
  billed('/api/daily-reports/items', ['POST', 'PATCH', 'DELETE']),
  billed('/api/daily-reports/items/[id]/care-episode', ['POST']),
  billed('/api/daily-reports/items/[id]/pricing/confirm', ['POST']),
  billed('/api/daily-reports/items/[id]/tags', ['POST']),
  billed('/api/daily-reports/items/[id]/tags/[tagCode]', ['DELETE']),
  billed('/api/manager/rosters/assign', ['POST'], 'workforce-scheduling'),
  billed('/api/menu-templates', ['POST', 'PATCH', 'DELETE']),
  billed('/api/menu-templates/[id]/billing-profiles', ['POST']),
  billed('/api/menu-templates/[id]/billing-profiles/[profileId]', ['PATCH']),
  billed('/api/menu-templates/import', ['POST']),
  billed('/api/menus', ['POST', 'PATCH', 'DELETE']),
  billed('/api/menus/[id]/billing-profiles', ['POST']),
  billed('/api/menus/[id]/billing-profiles/[profileId]', ['PATCH']),
  billed('/api/mobile-uiux/daily-reports', ['POST']),
  billed('/api/mobile-uiux/reservations', ['POST', 'PATCH']),
  billed('/api/outreach/campaigns', ['POST'], 'patient-outreach'),
  billed('/api/outreach/campaigns/[id]/send', ['POST'], 'patient-outreach'),
  billed('/api/reservations', ['POST', 'PATCH'], 'scheduling'),
  billed('/api/resources', ['POST', 'PATCH', 'DELETE'], 'scheduling'),
  billed('/api/revenue-estimates/recalculate', ['POST']),
  billed('/api/staff', ['POST'], 'workforce-scheduling'),
  billed('/api/staff/preferences', ['POST'], 'workforce-scheduling'),
  billed('/api/staff/shift-request-periods', ['POST'], 'workforce-scheduling'),
  billed(
    '/api/staff/shift-request-periods/[id]',
    ['PATCH'],
    'workforce-scheduling'
  ),
  billed('/api/staff/shift-requests', ['POST'], 'workforce-scheduling'),
  billed('/api/staff/shift-requests/[id]', ['PATCH'], 'workforce-scheduling'),
  billed('/api/staff/shift-requests/convert', ['POST'], 'workforce-scheduling'),
  billed('/api/staff/shifts', ['POST', 'PATCH'], 'workforce-scheduling'),

  admin(
    '/api/admin/billing/checkout',
    ['POST'],
    'derived',
    'Subscription checkout must remain available before paid access is active.',
    'billing-operations'
  ),
  admin(
    '/api/admin/billing/portal',
    ['POST'],
    'derived',
    'Subscription self-service must remain available while business writes are locked.',
    'billing-operations'
  ),
  admin(
    '/api/admin/billing/upgrade',
    ['POST'],
    'derived',
    'Subscription upgrade must remain available while business writes are locked.',
    'billing-operations'
  ),
  admin(
    '/api/admin/chat',
    ['POST'],
    'derived',
    'Administrative support messaging is an operator control path.',
    'platform-administration'
  ),
  admin(
    '/api/admin/line-credentials',
    ['PUT'],
    'derived',
    'Credential rotation is a security control and must remain available during billing lock.',
    'messaging-operations'
  ),
  admin(
    '/api/admin/managers/[managerUserId]/clinics',
    ['PUT'],
    'derived',
    'Manager scope revocation and repair must remain available during billing lock.',
    'identity-operations'
  ),
  admin(
    '/api/admin/mobile-uiux/entitlements',
    ['PUT'],
    'derived',
    'Entitlement recovery is an administrative control path.',
    'platform-administration'
  ),
  admin(
    '/api/admin/monitoring/sentry-test',
    ['POST'],
    'not-applicable',
    'Monitoring diagnostics do not mutate tenant business data.',
    'security-operations'
  ),
  admin(
    '/api/admin/notifications',
    ['PATCH'],
    'derived',
    'Acknowledging administrative notifications must remain available during billing lock.',
    'platform-administration'
  ),
  admin(
    '/api/admin/rate-limit/reset',
    ['POST'],
    'not-applicable',
    'Abuse-control recovery must remain available during billing lock.',
    'security-operations'
  ),
  admin(
    '/api/admin/rate-limit/whitelist',
    ['POST'],
    'not-applicable',
    'Abuse-control configuration must remain available during billing lock.',
    'security-operations'
  ),
  admin(
    '/api/admin/security/csp-violations',
    ['PATCH'],
    'derived',
    'Security incident triage must remain available during billing lock.',
    'security-operations'
  ),
  admin(
    '/api/admin/security/events',
    ['POST', 'PATCH'],
    'derived',
    'Security event acknowledgement and repair must remain available during billing lock.',
    'security-operations'
  ),
  admin(
    '/api/admin/security/sessions/terminate',
    ['POST'],
    'derived',
    'Session termination is a security control and must remain available during billing lock.',
    'security-operations'
  ),
  admin(
    '/api/admin/settings',
    ['PUT'],
    'derived',
    'Administrative configuration recovery must remain available during billing lock.'
  ),
  admin(
    '/api/admin/staff/invites',
    ['POST'],
    'derived',
    'Identity provisioning is an administrative lifecycle control.',
    'identity-operations'
  ),
  admin(
    '/api/admin/tables',
    ['POST', 'PUT'],
    'not-applicable',
    'Platform table administration is restricted to global operators.',
    'platform-administration'
  ),
  admin(
    '/api/admin/tenants',
    ['POST'],
    'derived',
    'Tenant provisioning must be possible before subscription activation.',
    'identity-operations'
  ),
  admin(
    '/api/admin/tenants/[clinic_id]',
    ['PATCH'],
    'derived',
    'Tenant suspension and recovery must remain available during billing lock.',
    'identity-operations'
  ),
  admin(
    '/api/admin/users',
    ['POST'],
    'derived',
    'Account provisioning and repair are global identity controls.',
    'identity-operations'
  ),
  admin(
    '/api/admin/users/[permission_id]',
    ['PATCH'],
    'derived',
    'Permission revocation and repair must remain available during billing lock.',
    'identity-operations'
  ),
  admin(
    '/api/admin/users/accounts',
    ['POST', 'PATCH'],
    'derived',
    'Account suspension and recovery must remain available during billing lock.',
    'identity-operations'
  ),
  admin(
    '/api/beta/backlog',
    ['POST', 'PATCH', 'DELETE'],
    'derived',
    'Pilot backlog administration is product telemetry, not tenant business data.',
    'product-operations'
  ),
  admin(
    '/api/beta/feedback',
    ['PATCH'],
    'not-applicable',
    'Feedback triage is product telemetry, not tenant business data.',
    'product-operations'
  ),
  admin(
    '/api/beta/metrics',
    ['POST'],
    'not-applicable',
    'Pilot metrics collection is product telemetry, not tenant business data.',
    'product-operations'
  ),
  admin(
    '/api/mobile-uiux/settings',
    ['PUT'],
    'derived',
    'Administrative settings recovery must remain available during billing lock.'
  ),

  unbilled(
    '/api/beta/feedback',
    ['POST'],
    'derived',
    'Users may submit product feedback regardless of subscription state.',
    'product-operations'
  ),
  unbilled(
    '/api/calendar/feed-tokens',
    ['POST'],
    'derived',
    'Calendar token issuance is an access-control lifecycle operation.',
    'security-operations'
  ),
  unbilled(
    '/api/calendar/feed-tokens',
    ['DELETE'],
    'not-applicable',
    'Calendar token revocation is an unbilled security-control operation constrained by authenticated creator ownership and intentionally remains available after clinic access removal.',
    'security-operations'
  ),
  unbilled(
    '/api/mfa/backup-codes/regenerate',
    ['POST'],
    'not-applicable',
    'Account MFA recovery must remain available regardless of subscription state.',
    'identity-operations'
  ),
  unbilled(
    '/api/mfa/disable',
    ['POST'],
    'not-applicable',
    'Account MFA recovery must remain available regardless of subscription state.',
    'identity-operations'
  ),
  unbilled(
    '/api/mfa/setup/complete',
    ['POST'],
    'not-applicable',
    'Account security setup must remain available regardless of subscription state.',
    'identity-operations'
  ),
  unbilled(
    '/api/mfa/setup/initiate',
    ['POST'],
    'not-applicable',
    'Account security setup must remain available regardless of subscription state.',
    'identity-operations'
  ),
  unbilled(
    '/api/mfa/verify',
    ['POST'],
    'not-applicable',
    'Authentication verification must remain available regardless of subscription state.',
    'identity-operations'
  ),
  unbilled(
    '/api/onboarding/clinic',
    ['POST'],
    'not-applicable',
    'Initial tenant provisioning occurs before subscription activation.',
    'identity-operations'
  ),
  unbilled(
    '/api/onboarding/invites',
    ['POST'],
    'not-applicable',
    'Initial identity provisioning occurs before subscription activation.',
    'identity-operations'
  ),
  unbilled(
    '/api/onboarding/profile',
    ['POST'],
    'not-applicable',
    'Initial profile provisioning occurs before subscription activation.',
    'identity-operations'
  ),
  unbilled(
    '/api/onboarding/seed',
    ['POST'],
    'derived',
    'Initial tenant seed runs before subscription activation.',
    'identity-operations'
  ),
  unbilled(
    '/api/public/my-reservations',
    ['PATCH'],
    'derived',
    'Patient consent updates must remain available regardless of clinic billing state.',
    'patient-safety',
    'line-my-page-token'
  ),
  unbilled(
    '/api/public/reservations/[id]/cancel',
    ['POST'],
    'derived',
    'Patient cancellation must remain available regardless of clinic billing state.',
    'patient-safety',
    'line-my-page-token'
  ),

  {
    route: '/api/public/reservations',
    methods: ['POST'],
    classification: 'PUBLIC_VALIDATED',
    clinicScope: 'derived',
    billing: 'required',
    auth: 'public',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    owner: 'scheduling',
  },
  {
    route: '/api/security/csp-report',
    methods: ['POST'],
    classification: 'PUBLIC_VALIDATED',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'public',
    idempotency: 'not-applicable',
    rateLimit: 'required',
    owner: 'security-operations',
  },

  internal('/api/internal/billing/create-override'),
  internal('/api/internal/billing/expire-overrides'),
  internal('/api/internal/billing/reconcile-tenant-quantity'),
  internal('/api/internal/billing/replay-webhook-event'),
  internal('/api/internal/billing/resync-subscription'),
  internal('/api/internal/billing/revoke-override'),

  {
    route: '/api/stripe/webhook',
    methods: ['POST'],
    classification: 'SIGNED_WEBHOOK',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'webhook-signature',
    idempotency: 'required',
    rateLimit: 'not-applicable',
    exceptionReason:
      'Stripe delivery is authenticated by signature and deduplicated by the claimed event ID; this path is intentionally excluded from authenticated mutation middleware.',
    owner: 'billing-operations',
  },
  {
    route: '/api/webhooks/resend',
    methods: ['POST'],
    classification: 'SIGNED_WEBHOOK',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'webhook-signature',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'Resend delivery is authenticated by its Svix signature and is intentionally excluded from authenticated mutation middleware.',
    owner: 'messaging-operations',
  },

  noMutation('/api/admin/master-data', ['POST', 'PUT', 'DELETE']),
  noMutation('/api/admin/master-data/import', ['POST']),
  noMutation('/api/admin/master-data/rollback', ['POST']),
  noMutation('/api/patients', ['POST', 'PATCH', 'DELETE']),
  noMutation('/api/reservations', ['DELETE']),
  noMutation('/api/revenue', ['POST']),
] as const satisfies readonly RouteMutationPolicy[];

export const sideEffectingGetPolicies = [
  {
    route: '/api/ai-comments',
    methods: ['GET'],
    classification: 'AUTH_SCOPED_BILLED',
    clinicScope: 'required',
    billing: 'required',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'Legacy read-through generation writes a clinic-scoped cache on miss; billing and scope gates are mandatory and no new side-effecting GET is allowed.',
    owner: 'ai-operations',
  },
  {
    route: '/api/admin/tables',
    methods: ['GET'],
    classification: 'ADMIN_SCOPED',
    clinicScope: 'not-applicable',
    billing: 'explicit-exception',
    auth: 'admin-role',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'HQ table inspection is a read operation whose only mutation is a mandatory audit record; it is not a tenant business write.',
    owner: 'platform-administration',
  },
  {
    route: '/api/customers/analysis',
    methods: ['GET'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'required',
    billing: 'explicit-exception',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'The business operation is read-only; the only mutation is a mandatory clinic-scoped audit log and it must remain available during billing lock.',
    owner: 'clinical-analytics',
  },
  {
    route: '/api/exports',
    methods: ['GET'],
    classification: 'ADMIN_SCOPED',
    clinicScope: 'required',
    billing: 'explicit-exception',
    auth: 'admin-role',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'The export is read-only; its mandatory clinic-scoped audit record must remain available during billing lock.',
    owner: 'data-governance',
  },
  {
    route: '/api/mobile-uiux/patient-analysis',
    methods: ['GET'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'required',
    billing: 'explicit-exception',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason:
      'The analysis is read-only; its mandatory clinic-scoped audit record is unbilled and the mobile read limiter remains active.',
    owner: 'clinical-analytics',
  },
  {
    route: '/api/patients',
    methods: ['GET'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'required',
    billing: 'explicit-exception',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'The deprecated analysis endpoint is read-only; the only mutation is its mandatory clinic-scoped audit record.',
    owner: 'clinical-analytics',
  },
  {
    route: '/api/internal/process-email-outbox',
    methods: ['GET'],
    classification: 'INTERNAL_SECRET',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'cron-secret',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'Legacy scheduler compatibility; CRON_SECRET remains mandatory and new stateful GET routes are forbidden.',
    owner: 'messaging-operations',
  },
  {
    route: '/api/internal/process-line-outbox',
    methods: ['GET'],
    classification: 'INTERNAL_SECRET',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'cron-secret',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'Legacy scheduler compatibility; CRON_SECRET remains mandatory and new stateful GET routes are forbidden.',
    owner: 'messaging-operations',
  },
  {
    route: '/api/internal/reservation-reminders',
    methods: ['GET'],
    classification: 'INTERNAL_SECRET',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'cron-secret',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason:
      'Legacy scheduler compatibility; CRON_SECRET remains mandatory and new stateful GET routes are forbidden.',
    owner: 'messaging-operations',
  },
] as const satisfies readonly SideEffectingGetPolicy[];
