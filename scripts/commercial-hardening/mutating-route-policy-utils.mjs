import { readFileSync } from 'node:fs';

import ts from 'typescript';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MUTATION_CLASSES = new Set([
  'PUBLIC_VALIDATED',
  'AUTH_SCOPED_BILLED',
  'AUTH_SCOPED_UNBILLED',
  'ADMIN_SCOPED',
  'INTERNAL_SECRET',
  'SIGNED_WEBHOOK',
  'HEALTH_OR_NO_MUTATION',
]);
const CLINIC_SCOPES = new Set(['required', 'derived', 'not-applicable']);
const BILLING_MODES = new Set([
  'required',
  'explicit-exception',
  'not-applicable',
]);
const AUTH_MODES = new Set([
  'supabase-user',
  'admin-role',
  'cron-secret',
  'internal-secret',
  'webhook-signature',
  'line-my-page-token',
  'public',
]);
const IDEMPOTENCY_MODES = new Set([
  'required',
  'recommended',
  'not-applicable',
]);
const RATE_LIMIT_MODES = new Set(['required', 'middleware', 'not-applicable']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnosticText(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

export async function loadMutatingRoutePolicy(policyPath) {
  const source = readFileSync(policyPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: policyPath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
  );
  if (errors.length > 0) {
    throw new Error(
      'Unable to load mutating route policy:\n' +
        errors.map(diagnosticText).join('\n')
    );
  }

  const moduleUrl =
    'data:text/javascript;base64,' +
    Buffer.from(transpiled.outputText, 'utf8').toString('base64');
  const loaded = await import(moduleUrl);

  return {
    mutatingRoutePolicies: loaded.mutatingRoutePolicies,
    sideEffectingGetPolicies: loaded.sideEffectingGetPolicies,
  };
}

function addError(errors, code, message) {
  errors.push({ code, message });
}

function isMiddlewareRateLimited(route, method) {
  const normalizedMethod = String(method).toUpperCase();
  const isMutation = MUTATION_METHODS.has(normalizedMethod);

  if (route.startsWith('/api/public/')) return true;
  if (route.startsWith('/api/mobile-uiux/')) {
    return normalizedMethod === 'GET' || isMutation;
  }
  if (route.startsWith('/api/mfa/')) return true;
  if (
    route === '/api/admin/security/sessions' ||
    route === '/api/admin/security/sessions/terminate'
  ) {
    return true;
  }
  if (route.startsWith('/api/admin/security/')) {
    return normalizedMethod === 'GET' || isMutation;
  }
  if (!isMutation || !route.startsWith('/api/')) return false;

  return !(
    route.startsWith('/api/internal/') ||
    route.startsWith('/api/webhooks/') ||
    route === '/api/stripe/webhook' ||
    route === '/api/security/csp-report'
  );
}

function validatePolicyFields(policy, index, kind, errors) {
  const label = kind + '[' + String(index) + ']';
  if (!isRecord(policy)) {
    addError(errors, 'COMM-ROUTE-002', label + ' must be an object');
    return false;
  }

  if (typeof policy.route !== 'string' || !policy.route.startsWith('/api/')) {
    addError(errors, 'COMM-ROUTE-002', label + ' has an invalid route');
  }
  if (!Array.isArray(policy.methods) || policy.methods.length === 0) {
    addError(errors, 'COMM-ROUTE-002', label + ' has no methods');
  }
  if (!MUTATION_CLASSES.has(policy.classification)) {
    addError(
      errors,
      'COMM-ROUTE-002',
      label + ' has an invalid classification'
    );
  }
  if (!CLINIC_SCOPES.has(policy.clinicScope)) {
    addError(errors, 'COMM-ROUTE-002', label + ' has an invalid clinicScope');
  }
  if (!BILLING_MODES.has(policy.billing)) {
    addError(errors, 'COMM-ROUTE-002', label + ' has an invalid billing mode');
  }
  if (!AUTH_MODES.has(policy.auth)) {
    addError(errors, 'COMM-ROUTE-002', label + ' has an invalid auth mode');
  }
  if (!IDEMPOTENCY_MODES.has(policy.idempotency)) {
    addError(errors, 'COMM-ROUTE-002', label + ' has invalid idempotency');
  }
  if (!RATE_LIMIT_MODES.has(policy.rateLimit)) {
    addError(errors, 'COMM-ROUTE-002', label + ' has an invalid rateLimit');
  }
  if (typeof policy.owner !== 'string' || policy.owner.trim().length === 0) {
    addError(errors, 'COMM-ROUTE-008', label + ' is missing owner');
  }

  const requiresExceptionReason =
    policy.billing === 'explicit-exception' ||
    policy.classification === 'HEALTH_OR_NO_MUTATION' ||
    kind === 'sideEffectingGetPolicies';
  if (
    requiresExceptionReason &&
    (typeof policy.exceptionReason !== 'string' ||
      policy.exceptionReason.trim().length === 0)
  ) {
    addError(errors, 'COMM-ROUTE-008', label + ' is missing exceptionReason');
  }

  if (
    policy.classification === 'AUTH_SCOPED_BILLED' &&
    (policy.billing !== 'required' ||
      policy.clinicScope === 'not-applicable' ||
      policy.auth !== 'supabase-user')
  ) {
    addError(
      errors,
      'COMM-ROUTE-002',
      label + ' violates AUTH_SCOPED_BILLED invariants'
    );
  }
  if (
    policy.classification === 'AUTH_SCOPED_UNBILLED' &&
    (policy.billing !== 'explicit-exception' ||
      !['supabase-user', 'line-my-page-token'].includes(policy.auth) ||
      (policy.auth === 'line-my-page-token' &&
        policy.clinicScope === 'not-applicable'))
  ) {
    addError(
      errors,
      'COMM-ROUTE-002',
      label + ' violates AUTH_SCOPED_UNBILLED invariants'
    );
  }
  if (
    policy.classification === 'ADMIN_SCOPED' &&
    (policy.auth !== 'admin-role' || policy.billing !== 'explicit-exception')
  ) {
    addError(
      errors,
      'COMM-ROUTE-002',
      label + ' violates ADMIN_SCOPED invariants'
    );
  }
  if (
    policy.classification === 'INTERNAL_SECRET' &&
    !['cron-secret', 'internal-secret'].includes(policy.auth)
  ) {
    addError(
      errors,
      'COMM-ROUTE-002',
      label + ' must use an internal secret auth mode'
    );
  }
  if (
    policy.classification === 'SIGNED_WEBHOOK' &&
    policy.auth !== 'webhook-signature'
  ) {
    addError(
      errors,
      'COMM-ROUTE-002',
      label + ' must use webhook signature auth'
    );
  }
  if (
    policy.classification === 'PUBLIC_VALIDATED' &&
    policy.auth !== 'public'
  ) {
    addError(
      errors,
      'COMM-ROUTE-002',
      label + ' must explicitly use public auth'
    );
  }

  return true;
}

function expandPolicies(policies, kind, errors) {
  if (!Array.isArray(policies)) {
    addError(errors, 'COMM-ROUTE-002', kind + ' must be an array');
    return new Map();
  }

  const expanded = new Map();
  policies.forEach((policy, index) => {
    if (!validatePolicyFields(policy, index, kind, errors)) return;

    for (const method of policy.methods) {
      const methodAllowed =
        kind === 'sideEffectingGetPolicies'
          ? method === 'GET'
          : MUTATION_METHODS.has(method);
      if (!methodAllowed) {
        addError(
          errors,
          'COMM-ROUTE-002',
          kind + '[' + String(index) + '] has invalid method ' + String(method)
        );
        continue;
      }

      if (
        policy.rateLimit === 'middleware' &&
        !isMiddlewareRateLimited(policy.route, method)
      ) {
        addError(
          errors,
          'COMM-ROUTE-011',
          method +
            ' ' +
            policy.route +
            ' is not covered by rate-limit middleware'
        );
      }

      const id = method + ' ' + policy.route;
      if (expanded.has(id)) {
        addError(errors, 'COMM-ROUTE-002', 'Duplicate policy entry: ' + id);
        continue;
      }
      expanded.set(id, policy);
    }
  });

  return expanded;
}

function evidenceCount(handler, category) {
  const values = handler.approved?.[category];
  return Array.isArray(values) ? values.length : 0;
}

function verifyHandlerEvidence(handler, policy, errors) {
  const id = handler.id;

  if (
    policy.billing === 'required' &&
    evidenceCount(handler, 'billing') === 0
  ) {
    addError(errors, 'COMM-ROUTE-003', id + ' has no approved billing gate');
  }
  const clinicScopeEvidenceCategory = 'clinicScopeCoverage';
  if (
    policy.clinicScope !== 'not-applicable' &&
    evidenceCount(handler, clinicScopeEvidenceCategory) === 0
  ) {
    addError(
      errors,
      'COMM-ROUTE-004',
      id + ' has no approved clinic scope gate'
    );
  }

  if (policy.auth === 'supabase-user' && evidenceCount(handler, 'auth') === 0) {
    addError(errors, 'COMM-ROUTE-004', id + ' has no approved user auth gate');
  }
  if (
    policy.auth === 'admin-role' &&
    evidenceCount(handler, 'adminRole') === 0
  ) {
    addError(errors, 'COMM-ROUTE-004', id + ' has no approved admin role gate');
  }
  if (
    ['cron-secret', 'internal-secret'].includes(policy.auth) &&
    evidenceCount(handler, 'internalSecret') === 0
  ) {
    addError(
      errors,
      'COMM-ROUTE-005',
      id + ' has no approved internal secret gate'
    );
  }
  if (
    policy.auth === 'webhook-signature' &&
    evidenceCount(handler, 'webhookSignature') === 0
  ) {
    addError(errors, 'COMM-ROUTE-006', id + ' has no approved signature gate');
  }
  if (
    policy.auth === 'line-my-page-token' &&
    evidenceCount(handler, 'lineAuth') === 0
  ) {
    addError(errors, 'COMM-ROUTE-004', id + ' has no approved LINE token gate');
  }
  if (
    policy.classification === 'PUBLIC_VALIDATED' &&
    evidenceCount(handler, 'validation') === 0
  ) {
    addError(
      errors,
      'COMM-ROUTE-007',
      id + ' has no approved schema validation'
    );
  }
  if (
    policy.classification === 'HEALTH_OR_NO_MUTATION' &&
    evidenceCount(handler, 'noMutation') === 0
  ) {
    addError(
      errors,
      'COMM-ROUTE-009',
      id + ' is not proven to be a fixed no-mutation response'
    );
  }
  if (
    policy.idempotency === 'required' &&
    evidenceCount(handler, 'idempotency') === 0
  ) {
    addError(
      errors,
      'COMM-ROUTE-012',
      id + ' has no approved idempotency gate'
    );
  }
  if (
    policy.rateLimit === 'required' &&
    evidenceCount(handler, 'rateLimit') === 0
  ) {
    addError(errors, 'COMM-ROUTE-011', id + ' has no approved rate-limit gate');
  }
}

export function verifyMutatingRoutePolicy(inventory, policyModule) {
  const errors = [];
  const mutationPolicies = expandPolicies(
    policyModule.mutatingRoutePolicies,
    'mutatingRoutePolicies',
    errors
  );
  const sideEffectPolicies = expandPolicies(
    policyModule.sideEffectingGetPolicies,
    'sideEffectingGetPolicies',
    errors
  );
  const liveMutations = new Map(
    inventory.handlers.map(handler => [handler.id, handler])
  );
  const liveSideEffects = new Map(
    inventory.sideEffectingGetCandidates.map(handler => [handler.id, handler])
  );

  for (const [id, handler] of liveMutations) {
    const policy = mutationPolicies.get(id);
    if (!policy) {
      addError(
        errors,
        'COMM-ROUTE-001',
        'Unclassified mutation handler: ' + id
      );
      continue;
    }
    verifyHandlerEvidence(handler, policy, errors);
  }
  for (const id of mutationPolicies.keys()) {
    if (!liveMutations.has(id)) {
      addError(errors, 'COMM-ROUTE-002', 'Stale mutation policy entry: ' + id);
    }
  }

  for (const [id, handler] of liveSideEffects) {
    const policy = sideEffectPolicies.get(id);
    if (!policy) {
      addError(
        errors,
        'COMM-ROUTE-010',
        'Unclassified side-effecting GET: ' + id
      );
      continue;
    }
    verifyHandlerEvidence(handler, policy, errors);
  }
  for (const id of sideEffectPolicies.keys()) {
    if (!liveSideEffects.has(id)) {
      addError(errors, 'COMM-ROUTE-002', 'Stale side-effect GET policy: ' + id);
    }
  }

  return {
    errors,
    mutationPolicies,
    sideEffectPolicies,
  };
}

export function mergePolicyIntoInventory(inventory, verification) {
  const handlers = inventory.handlers.map(handler => {
    const policy = verification.mutationPolicies.get(handler.id);
    if (!policy) return handler;
    return {
      ...handler,
      classification: policy.classification,
      policy: { ...policy },
      unknowns: [],
    };
  });
  const sideEffectingGetCandidates = inventory.sideEffectingGetCandidates.map(
    handler => {
      const policy = verification.sideEffectPolicies.get(handler.id);
      if (!policy) return handler;
      return {
        ...handler,
        classification: policy.classification,
        policy: { ...policy },
        unknowns: [],
      };
    }
  );

  return {
    ...inventory,
    policyStatus: 'ENFORCED',
    summary: {
      ...inventory.summary,
      unclassifiedHandlers: handlers.filter(
        handler => handler.classification === 'UNKNOWN'
      ).length,
    },
    handlers,
    sideEffectingGetCandidates,
  };
}
