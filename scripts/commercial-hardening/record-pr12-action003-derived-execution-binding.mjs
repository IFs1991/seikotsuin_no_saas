import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from './pr12-source-project-provisioning-contract.mjs';
import { revalidateAction003ApprovalPacket } from './prepare-pr12-action003-approval-packet.mjs';
import { deriveAction003ExecutionBindingCreateNew } from './derive-pr12-action003-execution-binding.mjs';

const OPERATION = 'RECORD_PR12_ACTION003_DERIVED_EXECUTION_BINDING_LOCAL_ONLY';
const EXPECTED_FLAGS = Object.freeze([
  '--candidate-directory',
  '--derived-execution-binding-output',
  '--input',
  '--owner-private-root',
  '--pricing-evidence',
  '--pricing-owner-private-root',
  '--single-action-approval-receipt',
]);

export class Action003ExecutionBindingRecorderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Action003ExecutionBindingRecorderError';
    this.code = code;
  }
}

function fail(code) {
  throw new Action003ExecutionBindingRecorderError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function parseArguments(argv) {
  requireCondition(argv.length === EXPECTED_FLAGS.length * 2, 'USAGE_INVALID');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireCondition(
      EXPECTED_FLAGS.includes(flag) &&
        !Object.hasOwn(values, flag) &&
        typeof value === 'string' &&
        path.isAbsolute(value),
      'USAGE_INVALID'
    );
    values[flag] = path.resolve(value);
  }
  requireCondition(
    Object.keys(values).length === EXPECTED_FLAGS.length,
    'USAGE_INVALID'
  );
  return values;
}

export function recordAction003DerivedExecutionBinding(inputValue) {
  requireCondition(
    typeof inputValue === 'object' &&
      inputValue !== null &&
      !Array.isArray(inputValue),
    'RECORDER_INPUT_INVALID'
  );
  const input = inputValue;
  requireCondition(
    canonicalJson(Object.keys(input).sort()) ===
      canonicalJson(
        [
          'candidateDirectory',
          'descriptorPath',
          'initialApprovalReceiptPath',
          'outputPath',
          'ownerPrivateRoot',
          'pricingEvidencePath',
          'pricingOwnerPrivateRoot',
        ].sort()
      ),
    'RECORDER_INPUT_INVALID'
  );
  const before = revalidateAction003ApprovalPacket(input.descriptorPath);
  requireCondition(
    before.status === 'REVALIDATED' &&
      before.sourceProjectProvisioningAuthorized === false &&
      before.derivedExecutionBindingRequired === true &&
      before.remoteContactPerformed === false &&
      before.credentialPlaintextReadPerformed === false,
    'PACKET_REVALIDATION_FAILED'
  );
  const recorded = deriveAction003ExecutionBindingCreateNew({
    candidateDirectory: input.candidateDirectory,
    initialApprovalReceiptPath: input.initialApprovalReceiptPath,
    ownerPrivateRoot: input.ownerPrivateRoot,
    outputPath: input.outputPath,
    pricingEvidencePath: input.pricingEvidencePath,
    pricingOwnerPrivateRoot: input.pricingOwnerPrivateRoot,
  });
  const after = revalidateAction003ApprovalPacket(input.descriptorPath);
  requireCondition(
    after.status === 'REVALIDATED' &&
      after.bindingSha256 === before.bindingSha256 &&
      after.credentialConfigurationSha256 ===
        before.credentialConfigurationSha256 &&
      after.authorizationProjectionSha256 ===
        before.authorizationProjectionSha256 &&
      after.remoteContactPerformed === false &&
      after.credentialPlaintextReadPerformed === false,
    'PACKET_CHANGED_DURING_DERIVATION'
  );
  return {
    operation: OPERATION,
    ...recorded,
    packetDescriptorSha256: before.descriptorSha256,
    candidateBindingSha256: before.bindingSha256,
    authorizationProjectionSha256: before.authorizationProjectionSha256,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
}

function fromCli(values) {
  return {
    candidateDirectory: values['--candidate-directory'],
    descriptorPath: values['--input'],
    initialApprovalReceiptPath: values['--single-action-approval-receipt'],
    outputPath: values['--derived-execution-binding-output'],
    ownerPrivateRoot: values['--owner-private-root'],
    pricingEvidencePath: values['--pricing-evidence'],
    pricingOwnerPrivateRoot: values['--pricing-owner-private-root'],
  };
}

async function main() {
  const result = recordAction003DerivedExecutionBinding(
    fromCli(parseArguments(process.argv.slice(2)))
  );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    const code =
      error instanceof Action003ExecutionBindingRecorderError ||
      (error && typeof error.code === 'string')
        ? error.code
        : 'ACTION003_EXECUTION_BINDING_RECORD_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
