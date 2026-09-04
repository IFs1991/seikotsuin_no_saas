/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const receiptContractPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs'
);
const pricingCapturePath = path.join(
  repoRoot,
  'scripts/commercial-hardening/capture-pr12-action003-public-pricing.mjs'
);
const derivedReceiptPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/derive-pr12-action003-execution-binding.mjs'
);
const provisioningContractPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs'
);
const preparationSpecPath = path.join(
  repoRoot,
  'docs/stabilization/spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md'
);
const pricingTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-official-pricing-evidence-v3.template.json'
);
const singleApprovalTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-single-action-approval-receipt-v2.template.json'
);
const executionBindingTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-derived-execution-binding-v1.template.json'
);
const bigintIdentityFiles = [
  'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs',
  'scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs',
  'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs',
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
] as const;

describe('PR12 ACTION-003 simplified single-approval protocol', () => {
  test('removes the implementation-added two-stage JIT timing contract', () => {
    const receiptSource = fs.readFileSync(receiptContractPath, 'utf8');
    const provisioningSource = fs.readFileSync(
      provisioningContractPath,
      'utf8'
    );

    expect(receiptSource).toContain(
      'SOLE_OPERATOR_EXPLICIT_SINGLE_ACTION_APPROVAL'
    );
    expect(receiptSource).toContain(
      'SYSTEM_DERIVED_HASH_BINDING_FROM_SINGLE_APPROVAL'
    );
    expect(receiptSource).toContain(
      'const INITIAL_TO_SCHEDULE_MILLISECONDS = 0;'
    );
    expect(receiptSource).toContain(
      'const INITIAL_TO_EXPIRY_MILLISECONDS = 60 * 60 * 1000;'
    );
    expect(receiptSource).not.toContain(
      'SOLE_OPERATOR_EXPLICIT_FINAL_HASH_RECONFIRMATION'
    );
    expect(receiptSource).toContain(
      'PR12_SOURCE_PROJECT_PROVISIONING_SINGLE_ACTION_APPROVAL_RECEIPT'
    );
    expect(receiptSource).toContain(
      'PR12_SOURCE_PROJECT_PROVISIONING_DERIVED_EXECUTION_BINDING'
    );
    expect(receiptSource).not.toContain(
      'PR12_SOURCE_PROJECT_PROVISIONING_FINAL_APPROVAL_RECEIPT'
    );
    expect(provisioningSource).toContain(
      'operatorControl.minimumCoolingOffSeconds === 0'
    );
    expect(provisioningSource).toContain(
      'operatorControl.maximumApprovalWindowSeconds === 3600'
    );
  });

  test('keeps public pricing capture automatic, bounded, unauthenticated, and create-new', () => {
    const source = fs.readFileSync(pricingCapturePath, 'utf8');
    const template: unknown = JSON.parse(
      fs.readFileSync(pricingTemplatePath, 'utf8')
    );

    expect(source.match(/\bfetch\s*\(/gu)).toHaveLength(1);
    expect(source).toContain("method: 'GET'");
    expect(source).toContain("redirect: 'error'");
    expect(source).toContain('const REQUEST_TIMEOUT_MILLISECONDS = 30_000;');
    expect(source).toContain('const MAXIMUM_SOURCE_BYTES = 8 * 1_048_576;');
    expect(source).toContain("contentType.startsWith('text/html')");
    expect(source).toContain('PRICING_SOURCE_SEMANTICS_INVALID');
    expect(source).toContain("openSync(filename, 'wx'");
    expect(source).toContain('protectOwnerPrivatePath');
    expect(source).toContain('isForbiddenAmbientCredentialName');
    expect(source.toLowerCase()).not.toContain('authorization:');
    expect(source).not.toContain('https://api.supabase.com');
    expect(template).toMatchObject({
      freshness: {
        maximumAgeAtApprovalSeconds: 86400,
        lifetimeSeconds: 86400,
      },
    });
  });

  test('derives exact hashes locally without transport or credential access', () => {
    const source = fs.readFileSync(derivedReceiptPath, 'utf8');

    expect(source).toContain('deriveAction003ExecutionBinding');
    expect(source).toContain('buildBindingMaterial');
    expect(source).toContain('buildSecretFreeRequestProjection');
    expect(source).toContain('recordAction003ExecutionBindingCreateNew');
    expect(source).not.toContain("openSync(input.outputPath, 'wx'");
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain('retrieveClaimBoundCredentials');
    expect(source).not.toContain('Unprotect');
    expect(source).not.toContain('https://api.supabase.com');
  });

  test('uses precision-safe Windows file identities at every Action-003 credential and approval boundary', () => {
    for (const relativePath of bigintIdentityFiles) {
      const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
      expect(source).toContain('{ bigint: true }');
      expect(source).toContain('BigInt(bytes.length)');
    }
  });

  test('version-bumps changed artifacts and never labels system output as human approval', () => {
    const singleApproval: unknown = JSON.parse(
      fs.readFileSync(singleApprovalTemplatePath, 'utf8')
    );
    const executionBinding: unknown = JSON.parse(
      fs.readFileSync(executionBindingTemplatePath, 'utf8')
    );
    const derivedSource = fs.readFileSync(derivedReceiptPath, 'utf8');

    expect(singleApproval).toMatchObject({
      schemaVersion: 2,
      recordType:
        'PR12_SOURCE_PROJECT_PROVISIONING_SINGLE_ACTION_APPROVAL_RECEIPT',
      decision: 'NOT_CAPTURED',
      sourceProjectProvisioningAuthorized: false,
    });
    expect(executionBinding).toMatchObject({
      schemaVersion: 1,
      recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_DERIVED_EXECUTION_BINDING',
      derivationStatus: 'NOT_DERIVED',
      authorityScopeConfirmed: false,
    });
    expect(derivedSource).not.toContain('approvedByPrincipalId');
    expect(derivedSource).not.toContain('approvedByDisplayName');
    expect(derivedSource).not.toContain('operatorReconfirmedAt');
  });

  test('documents SSOT authority and reserves JIT for later destructive operations', () => {
    const specification = fs.readFileSync(preparationSpecPath, 'utf8');

    expect(specification).toContain(
      'removed the implementation-added two-stage human approval loop'
    );
    expect(specification).toContain('relative 60-minute TTL');
    expect(specification).toContain(
      'JIT approval remains required later for production apply, deletion, restore, and other destructive operations'
    );
    expect(specification).toContain(
      'must not be represented as a second human approval'
    );
  });
});
