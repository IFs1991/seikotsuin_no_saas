/** @jest-environment node */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

type VerifierResult = {
  status: number | null;
  output: string;
};

const repoRoot = path.resolve(__dirname, '../../..');
const verifierPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/verify-mutating-routes.mjs'
);
const fixtureRoot = path.join(
  __dirname,
  '../fixtures/commercial-pr10-mutating-route-policy'
);

function runVerifier(
  fixture?: string,
  policyName = 'policy.ts'
): VerifierResult {
  const args = [verifierPath];
  if (fixture) {
    const fixtureDirectory = path.join(fixtureRoot, fixture);
    args.push(
      '--source-root',
      path.join(fixtureDirectory, 'api'),
      '--policy',
      path.join(fixtureDirectory, policyName)
    );
  }

  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return {
    status: result.status,
    output: [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join('\n'),
  };
}

function expectContractFailure(result: VerifierResult, code: string): void {
  expect(result.status).toBe(1);
  expect(result.output).toContain(code);
}

describe('commercial PR-10 mutating route policy', () => {
  it('accepts the production manifest only when every route is classified', () => {
    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.output).toContain('117 mutating handlers classified');
    expect(result.output).toContain('9 side-effecting GET handlers classified');
  });

  it('rejects an unclassified mutation handler', () => {
    expectContractFailure(runVerifier('unclassified'), 'COMM-ROUTE-001');
  });

  it('rejects a public mutation without schema validation', () => {
    expectContractFailure(
      runVerifier('public-without-validator'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects a route with a required rate limit but no approved limiter', () => {
    expectContractFailure(
      runVerifier('public-without-validator'),
      'COMM-ROUTE-011'
    );
  });

  it('rejects a false claim of middleware rate-limit coverage', () => {
    expectContractFailure(
      runVerifier('middleware-rate-limit-spoof'),
      'COMM-ROUTE-011'
    );
  });

  it('rejects an internal mutation without an approved secret guard', () => {
    expectContractFailure(
      runVerifier('internal-without-secret'),
      'COMM-ROUTE-005'
    );
  });

  it('rejects a billed mutation without a billing gate', () => {
    expectContractFailure(runVerifier('billed-without-gate'), 'COMM-ROUTE-003');
  });

  it('rejects a billing gate that runs after a write', () => {
    expectContractFailure(
      runVerifier('billing-guard-after-write'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects a conditional billing gate that does not protect the write', () => {
    expectContractFailure(
      runVerifier('conditional-billing-guard'),
      'COMM-ROUTE-003'
    );
  });

  it('accepts an explicit unbilled exception with an owner and reason', () => {
    const result = runVerifier('explicit-exception');

    expect(result.status).toBe(0);
  });

  it('rejects an exception without a reason', () => {
    expectContractFailure(
      runVerifier('explicit-exception', 'policy-missing-reason.ts'),
      'COMM-ROUTE-008'
    );
  });

  it('rejects duplicate route and method entries', () => {
    expectContractFailure(
      runVerifier('explicit-exception', 'policy-duplicate.ts'),
      'COMM-ROUTE-002'
    );
  });

  it('rejects a policy whose method does not match the live export', () => {
    expectContractFailure(
      runVerifier('explicit-exception', 'policy-method-mismatch.ts'),
      'COMM-ROUTE-002'
    );
  });

  it('rejects a signed webhook without signature verification', () => {
    expectContractFailure(
      runVerifier('webhook-without-signature'),
      'COMM-ROUTE-006'
    );
  });

  it('rejects an unregistered side-effecting GET handler', () => {
    expectContractFailure(
      runVerifier('unregistered-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('does not accept locally spoofed guard function names as evidence', () => {
    expectContractFailure(runVerifier('lexical-spoof'), 'COMM-ROUTE-003');
  });

  it('binds scoped admin assertions to the canonical context receiver', () => {
    expectContractFailure(
      runVerifier('scoped-admin-receiver-spoof'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects an ignored processApiRequest result', () => {
    expectContractFailure(
      runVerifier('ignored-process-api-result'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a processApiRequest result that was never awaited', () => {
    expectContractFailure(
      runVerifier('unawaited-process-api-result'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects an ignored processClinicScopedBody result', () => {
    expectContractFailure(
      runVerifier('ignored-process-clinic-result'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects a shadowed imported guard binding', () => {
    expectContractFailure(
      runVerifier('shadowed-import-guard'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a conditionally executed authentication gate', () => {
    expectContractFailure(runVerifier('conditional-guard'), 'COMM-ROUTE-004');
  });

  it('rejects an authentication gate that runs after a write', () => {
    expectContractFailure(runVerifier('guard-after-write'), 'COMM-ROUTE-004');
  });

  it('rejects a write performed inside an authentication denial branch', () => {
    expectContractFailure(runVerifier('denial-branch-write'), 'COMM-ROUTE-004');
  });

  it('rejects JSON.parse and a local parse method as schema evidence', () => {
    expectContractFailure(runVerifier('validation-spoof'), 'COMM-ROUTE-007');
  });

  it('rejects an ignored result from a canonical Zod safeParse call', () => {
    expectContractFailure(
      runVerifier('ignored-zod-safe-parse'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects a bare safeParse result check that never inspects success', () => {
    expectContractFailure(
      runVerifier('bare-safe-parse-result'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects Zod validation of a constant when the raw request is written', () => {
    expectContractFailure(runVerifier('zod-constant-input'), 'COMM-ROUTE-007');
  });

  it('rejects writing raw request data after safeParse validation', () => {
    expectContractFailure(runVerifier('zod-raw-output'), 'COMM-ROUTE-007');
  });

  it('rejects a throwing Zod parser whose failure is swallowed', () => {
    expectContractFailure(runVerifier('swallowed-zod-parse'), 'COMM-ROUTE-007');
  });

  it('rejects CRON facts that are not bound into one denial guard', () => {
    expectContractFailure(runVerifier('unbound-cron-facts'), 'COMM-ROUTE-005');
  });

  it('rejects a CRON denial guard hidden behind an outer condition', () => {
    expectContractFailure(
      runVerifier('conditional-cron-guard'),
      'COMM-ROUTE-005'
    );
  });

  it('rejects a CRON denial guard joined with AND instead of OR', () => {
    expectContractFailure(runVerifier('cron-and-guard'), 'COMM-ROUTE-005');
  });

  it('rejects an unrelated 405 or 410 numeric literal as no-mutation proof', () => {
    expectContractFailure(
      runVerifier('numeric-status-spoof'),
      'COMM-ROUTE-009'
    );
  });

  it('rejects a conditional fixed denial when another path returns success', () => {
    expectContractFailure(
      runVerifier('conditional-fixed-response'),
      'COMM-ROUTE-009'
    );
  });

  it('enforces AUTH_SCOPED_UNBILLED auth and clinic coherence', () => {
    expectContractFailure(
      runVerifier('explicit-exception', 'policy-invalid-auth.ts'),
      'COMM-ROUTE-002'
    );
  });

  it('registers exact canonical AuditLogger data-access calls as side effects', () => {
    expectContractFailure(
      runVerifier('unregistered-audit-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('registers an exact canonical AuditLogger alias as a side effect', () => {
    expectContractFailure(
      runVerifier('audit-alias-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('registers a destructured canonical AuditLogger method as a side effect', () => {
    expectContractFailure(
      runVerifier('audit-destructure-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('does not register a local AuditLogger lookalike as a side effect', () => {
    expect(runVerifier('audit-side-effect-spoof').status).toBe(0);
  });

  it('rejects an admin policy whose allowedRoles has no admin-class role', () => {
    expectContractFailure(
      runVerifier('admin-without-admin-role'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects mixed admin and non-admin allowedRoles for an admin policy', () => {
    expectContractFailure(runVerifier('mixed-admin-roles'), 'COMM-ROUTE-004');
  });

  it('rejects ensureClinicAccess without a concrete clinic target', () => {
    expectContractFailure(
      runVerifier('clinic-guard-with-null-target'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a null clinic target hidden behind a variable', () => {
    expectContractFailure(
      runVerifier('null-variable-clinic-target'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a dynamically false requireClinicMatch option', () => {
    expectContractFailure(
      runVerifier('dynamic-false-clinic-match'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects an ignored canonical clinic-scope resolver result', () => {
    expectContractFailure(
      runVerifier('ignored-scope-resolver'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects an assigned but unused clinic-scope resolver result', () => {
    expectContractFailure(
      runVerifier('assigned-unused-scope-resolver'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects an inverted clinic-scope resolver guard', () => {
    expectContractFailure(
      runVerifier('inverted-scope-resolver-guard'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a scope resolver guard that permits an empty collection', () => {
    expectContractFailure(
      runVerifier('empty-scope-resolver-guard'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a double-negated clinic membership guard', () => {
    expectContractFailure(
      runVerifier('double-negated-scope-membership'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a derived scope guard that protects only one write branch', () => {
    expectContractFailure(
      runVerifier('derived-alternate-scope-write'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a derived scope guard that protects only one switch case', () => {
    expectContractFailure(
      runVerifier('derived-switch-scope-write'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a derived scope guard with an unprotected catch write', () => {
    expectContractFailure(
      runVerifier('derived-catch-scope-write'),
      'COMM-ROUTE-004'
    );
  });

  it('does not collect evidence from an unreachable nested guard', () => {
    expectContractFailure(
      runVerifier('unreachable-nested-guard'),
      'COMM-ROUTE-003'
    );
  });

  it('binds a shadowed local helper call to its exact declaration', () => {
    expectContractFailure(
      runVerifier('shadowed-local-helper'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects a gate that protects only one alternate write branch', () => {
    expectContractFailure(
      runVerifier('alternate-branch-write'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects a throwing billing gate whose failure is swallowed', () => {
    expectContractFailure(
      runVerifier('swallowed-billing-guard'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects a billing gate run concurrently with the protected write', () => {
    expectContractFailure(
      runVerifier('concurrent-billing-guard'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects a catch-path write triggered by a throwing billing gate', () => {
    expectContractFailure(
      runVerifier('catch-write-after-billing-guard'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects a reassigned canonical result before its denial guard', () => {
    expectContractFailure(
      runVerifier('mutated-result-discriminant'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a canonical result replaced inside its declaration', () => {
    expectContractFailure(
      runVerifier('transformed-guard-result'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a mutated static admin role list', () => {
    expectContractFailure(runVerifier('mutated-admin-roles'), 'COMM-ROUTE-004');
  });

  it('rejects a locally shadowed Array.from role transform', () => {
    expectContractFailure(runVerifier('shadowed-array-from'), 'COMM-ROUTE-004');
  });

  it('rejects a mutable requireClinicMatch option', () => {
    expectContractFailure(
      runVerifier('mutated-clinic-match-option'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a local process object that spoofs CRON_SECRET', () => {
    expectContractFailure(
      runVerifier('shadowed-cron-process'),
      'COMM-ROUTE-005'
    );
  });

  it('rejects a CRON header binding overwritten before denial', () => {
    expectContractFailure(
      runVerifier('mutated-cron-binding'),
      'COMM-ROUTE-005'
    );
  });

  it('rejects authorization provenance from a non-request parameter', () => {
    expectContractFailure(
      runVerifier('non-request-header-provenance'),
      'COMM-ROUTE-005'
    );
  });

  it('registers a canonical AuditLogger object alias as a side effect', () => {
    expectContractFailure(
      runVerifier('audit-object-alias-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('rejects request taint overwritten by a static value before validation', () => {
    expectContractFailure(
      runVerifier('zod-overwritten-request-input'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects partial validation followed by a raw payload write', () => {
    expectContractFailure(
      runVerifier('zod-partial-input-raw-write'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects a throwing parser when raw input is written with its result', () => {
    expectContractFailure(runVerifier('zod-parse-raw-write'), 'COMM-ROUTE-007');
  });

  it('rejects a local parser when the request body is read outside it', () => {
    expectContractFailure(
      runVerifier('local-zod-parser-raw-reread'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects a local parser when its raw argument is also written', () => {
    expectContractFailure(
      runVerifier('local-zod-parser-raw-argument'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects an ignored Stripe idempotency-claim result', () => {
    expectContractFailure(
      runVerifier('ignored-stripe-claim-result'),
      'COMM-ROUTE-012'
    );
  });

  it('rejects writing an unvalidated sibling from a request destructure', () => {
    expectContractFailure(
      runVerifier('zod-sibling-request-write'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects writing an independently read request clone body', () => {
    expectContractFailure(
      runVerifier('zod-second-request-body-write'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects a validated output alias reassigned before the write', () => {
    expectContractFailure(
      runVerifier('zod-reassigned-validated-output'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects admin roles changed through Object.assign', () => {
    expectContractFailure(
      runVerifier('object-assign-admin-roles'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a request parameter replaced before a CRON header read', () => {
    expectContractFailure(
      runVerifier('mutated-request-before-cron-header'),
      'COMM-ROUTE-005'
    );
  });

  it('rejects request headers mutated before a CRON header read', () => {
    expectContractFailure(
      runVerifier('mutated-request-headers-before-cron-header'),
      'COMM-ROUTE-005'
    );
  });

  it('registers a namespace-imported AuditLogger as a side effect', () => {
    expectContractFailure(
      runVerifier('audit-namespace-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('does not register a spread-and-override AuditLogger lookalike as a side effect', () => {
    expect(runVerifier('audit-spread-copy-side-effect-get').status).toBe(0);
  });

  it('rejects a mutated Stripe idempotency-claim discriminant', () => {
    expectContractFailure(
      runVerifier('mutated-stripe-claim-result'),
      'COMM-ROUTE-012'
    );
  });

  it('rejects Stripe claim denial guards after event processing', () => {
    expectContractFailure(
      runVerifier('stripe-guards-after-processing'),
      'COMM-ROUTE-012'
    );
  });

  it('rejects fabricated permissions passed to canAccessClinicScope', () => {
    expectContractFailure(
      runVerifier('fabricated-permissions-can-access'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects fabricated permissions passed to a clinic-scope resolver', () => {
    expectContractFailure(
      runVerifier('fabricated-permissions-resolver'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a mutated clinic-scope resolver result', () => {
    expectContractFailure(
      runVerifier('mutated-scope-resolver-result'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a mutated canonical permissions clinic scope', () => {
    expectContractFailure(
      runVerifier('mutated-canonical-permissions-scope'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a derived scope gate that protects no write path', () => {
    expectContractFailure(
      runVerifier('derived-zero-write-coverage'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects an admin role weakened by a later options spread', () => {
    expectContractFailure(
      runVerifier('security-option-spread-override'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects fabricated permissions passed to a scoped billing gate', () => {
    expectContractFailure(
      runVerifier('fabricated-billing-permissions'),
      'COMM-ROUTE-003'
    );
  });

  it('rejects checking clinic A before writing clinic B', () => {
    expectContractFailure(
      runVerifier('checked-clinic-a-write-clinic-b'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a nonempty scope collection unbound from the write target', () => {
    expectContractFailure(
      runVerifier('unbound-scope-collection-target'),
      'COMM-ROUTE-004'
    );
  });

  it('accepts a scalar clinic scope check bound to the write target', () => {
    expect(runVerifier('bound-scalar-scope-target').status).toBe(0);
  });

  it('accepts collection scope checks bound to the written collection', () => {
    expect(runVerifier('bound-collection-scope-target').status).toBe(0);
  });

  it('rejects a guarded clinic mixed into an unrelated write field', () => {
    expectContractFailure(
      runVerifier('guarded-clinic-in-unrelated-write-field'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a multi-row write with only one clinic target checked', () => {
    expectContractFailure(
      runVerifier('multi-sink-partial-scope-proof'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a clinic target reassigned after its scope gate', () => {
    expectContractFailure(
      runVerifier('reassigned-guarded-scope-target'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects an inline callback write that runs before authentication', () => {
    expectContractFailure(
      runVerifier('nested-inline-callback-write-before-auth'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects a named callback write that runs before authentication', () => {
    expectContractFailure(
      runVerifier('nested-named-callback-write-before-auth'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects raw request data written beside a wrapper-validated DTO', () => {
    expectContractFailure(
      runVerifier('wrapper-raw-unrelated-write'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects an internal gate bound to a synthetic request', () => {
    expectContractFailure(
      runVerifier('synthetic-internal-request'),
      'COMM-ROUTE-005'
    );
  });

  it('rejects a Stripe signature checked against a static payload', () => {
    expectContractFailure(
      runVerifier('static-stripe-webhook-payload'),
      'COMM-ROUTE-006'
    );
  });

  it('rejects processing a Resend event unrelated to the verified body', () => {
    expectContractFailure(
      runVerifier('mismatched-resend-webhook-payload'),
      'COMM-ROUTE-006'
    );
  });

  it('rejects a fresh random rate-limit key per request', () => {
    expectContractFailure(
      runVerifier('random-rate-limit-key'),
      'COMM-ROUTE-011'
    );
  });

  it('rejects claiming a different Stripe event than it processes', () => {
    expectContractFailure(
      runVerifier('mismatched-stripe-claim-event'),
      'COMM-ROUTE-012'
    );
  });

  it('rejects a Stripe event reassigned after its idempotency claim', () => {
    expectContractFailure(
      runVerifier('reassigned-stripe-claim-event'),
      'COMM-ROUTE-012'
    );
  });

  it('rejects z.any as request validation evidence', () => {
    expectContractFailure(runVerifier('zod-any-schema'), 'COMM-ROUTE-007');
  });

  it('rejects z.unknown as request validation evidence', () => {
    expectContractFailure(runVerifier('zod-unknown-schema'), 'COMM-ROUTE-007');
  });

  it('registers an assignment-form AuditLogger alias as a side effect', () => {
    expectContractFailure(
      runVerifier('assigned-audit-alias-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('does not trust a nonexistent canonical wrapper export', () => {
    expectContractFailure(
      runVerifier('nonexistent-trusted-wrapper'),
      'COMM-ROUTE-007'
    );
  });

  it('registers a named callback mutation in an unlisted GET', () => {
    expectContractFailure(
      runVerifier('named-callback-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('registers a computed-property mutation in an unlisted GET', () => {
    expectContractFailure(
      runVerifier('computed-write-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });

  it('rejects a callback alias write that runs before authentication', () => {
    const result = runVerifier('callback-alias-write-before-auth');
    expectContractFailure(result, 'COMM-ROUTE-004');
    expect(result.output).toContain('no approved user auth gate');
  });

  it('rejects a request-derived rate key mixed with random entropy', () => {
    expectContractFailure(
      runVerifier('mixed-random-rate-limit-key'),
      'COMM-ROUTE-011'
    );
  });

  it('rejects a transformed event after Stripe signature verification', () => {
    expectContractFailure(
      runVerifier('transformed-stripe-verified-event'),
      'COMM-ROUTE-006'
    );
  });

  it('rejects a mixed event after Resend signature verification', () => {
    expectContractFailure(
      runVerifier('mixed-resend-verified-event'),
      'COMM-ROUTE-006'
    );
  });

  it('rejects z.any through a stable namespace alias', () => {
    expectContractFailure(
      runVerifier('zod-alias-any-schema'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects a Zod schema binding reassigned before validation', () => {
    expectContractFailure(
      runVerifier('zod-reassigned-schema-binding'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects an imported object-method write that runs before auth', () => {
    expectContractFailure(
      runVerifier('imported-object-write-before-guard'),
      'COMM-ROUTE-004'
    );
  });

  it('fails closed when an ordinary mutation handler has zero reachable writes', () => {
    expectContractFailure(
      runVerifier('unresolved-imported-write-zero-path'),
      'COMM-ROUTE-004'
    );
  });

  it('rejects z.any nested in a canonical object schema', () => {
    expectContractFailure(
      runVerifier('zod-nested-any-schema'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects z.unknown nested through lazy, union, and array schemas', () => {
    expectContractFailure(
      runVerifier('zod-nested-lazy-unknown-schema'),
      'COMM-ROUTE-007'
    );
  });

  it('rejects a Stripe claim result mutated through a const alias', () => {
    expectContractFailure(
      runVerifier('aliased-stripe-claim-result'),
      'COMM-ROUTE-012'
    );
  });

  it('registers canonical AuditLogger admin actions as side effects', () => {
    expectContractFailure(
      runVerifier('audit-admin-action-side-effect-get'),
      'COMM-ROUTE-010'
    );
  });
});
