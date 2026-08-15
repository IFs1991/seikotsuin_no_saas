/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

interface RecorderModule {
  recordAction003DerivedExecutionBinding(input: JsonObject): JsonObject;
}

interface DerivationModule {
  deriveAction003ExecutionBindingCreateNew(input: JsonObject): JsonObject;
}

const repoRoot = path.resolve(__dirname, '../../..');
const recorderPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/record-pr12-action003-derived-execution-binding.mjs'
);
const derivationPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/derive-pr12-action003-execution-binding.mjs'
);
let recorder: RecorderModule;
let derivation: DerivationModule;

beforeAll(async () => {
  recorder = (await import(recorderPath)) as RecorderModule;
  derivation = (await import(derivationPath)) as DerivationModule;
});

describe('PR12 ACTION-003 derived execution binding recorder', () => {
  test('rejects an incomplete local input before any filesystem or provider action', () => {
    expect(() =>
      recorder.recordAction003DerivedExecutionBinding({
        descriptorPath: 'C:\\owner\\descriptor.json',
      })
    ).toThrow('RECORDER_INPUT_INVALID');
  });

  test('preserves a typed fail-closed reason for malformed derivation input', () => {
    expect(() =>
      derivation.deriveAction003ExecutionBindingCreateNew({})
    ).toThrow('DERIVED_RECEIPT_INPUT_INVALID');
  });

  test('revalidates the packet before and after one local create-new derivation', () => {
    const source = fs.readFileSync(recorderPath, 'utf8');

    expect(
      source.match(/\brevalidateAction003ApprovalPacket\s*\(/gu)
    ).toHaveLength(2);
    expect(
      source.match(/\bderiveAction003ExecutionBindingCreateNew\s*\(/gu)
    ).toHaveLength(1);
    expect(source).toContain(
      'RECORD_PR12_ACTION003_DERIVED_EXECUTION_BINDING_LOCAL_ONLY'
    );
    expect(source).not.toContain('approvedByPrincipalId');
    expect(source).not.toContain('operatorReconfirmedAt');
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain('retrieveClaimBoundCredentials');
    expect(source).not.toContain('Unprotect');
    expect(source).not.toContain('https://api.supabase.com');
  });

  test('recomputes candidate hashes and protects the create-new output', () => {
    const source = fs.readFileSync(derivationPath, 'utf8');

    expect(source).toContain('buildBindingMaterial(bindingValue)');
    expect(source).toContain('buildSecretFreeRequestProjection(');
    expect(source).toContain('recordAction003ExecutionBindingCreateNew({');
    expect(source).toContain(
      'path.basename(outputDirectory) === EXECUTION_BINDING_DIRECTORY'
    );
    expect(source).not.toContain("openSync(input.outputPath, 'wx'");
    expect(source).toContain('AUTHORITY_SCOPE_MISMATCH');
    expect(source).toContain('CANDIDATE_DERIVATION_MISMATCH');
    expect(source).not.toContain('approvedByPrincipalId');
    expect(source).not.toContain('approvedByDisplayName');
    expect(source).not.toContain('operatorReconfirmedAt');
  });
});
