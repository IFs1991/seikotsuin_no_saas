import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  protectOwnerPrivatePath,
  requireOwnerPrivateBoundary,
} from './pr12-action003-approval-receipt-contract.mjs';
import {
  OFFICIAL_PRICING_SOURCES,
  assertOfficialPricingSourceSemantics,
  assertSecretFreeEvidence,
  canonicalJson,
  isForbiddenAmbientCredentialName,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';

const ACTION_ID = 'PR12-PRICING-CAPTURE-AUTO';
const EXECUTION_CONFIRMATION = ACTION_ID;
const EVIDENCE_FILENAME = 'source-project-official-pricing-evidence-v3.json';
const MAXIMUM_SOURCE_BYTES = 8 * 1_048_576;
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const LOCAL_LIFETIME_SECONDS = 86_400;
const SOURCE_FILENAMES = Object.freeze({
  COMPUTE_AND_DISK: 'compute-and-disk.html',
  COMPUTE_USAGE: 'compute-usage.html',
  PRICING: 'pricing.html',
});
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

export class Action003PricingCaptureError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Action003PricingCaptureError';
    this.code = code;
  }
}

function fail(code) {
  throw new Action003PricingCaptureError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function canonicalFileSha256(value) {
  return sha256Text(`${canonicalJson(value)}\n`);
}

function writeCreateNew(filename, bytes) {
  let descriptor;
  try {
    descriptor = openSync(filename, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch {
    fail('PRICING_CAPTURE_CREATE_NEW_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function requireNoAmbientCredentials() {
  requireCondition(
    Object.keys(process.env).every(
      name => !isForbiddenAmbientCredentialName(name)
    ),
    'AMBIENT_CREDENTIAL_FORBIDDEN'
  );
}

function validateOfficialPricingSourceBytes(input) {
  requireCondition(
    typeof input === 'object' &&
      input !== null &&
      !Array.isArray(input) &&
      typeof input.contentType === 'string' &&
      typeof input.sourceId === 'string' &&
      (Buffer.isBuffer(input.bytes) || input.bytes instanceof Uint8Array),
    'PRICING_SOURCE_SEMANTICS_INVALID'
  );
  const contentType = input.contentType.trim().toLowerCase();
  requireCondition(
    contentType.startsWith('text/html'),
    'PRICING_SOURCE_SEMANTICS_INVALID'
  );
  assertOfficialPricingSourceSemantics({
    sourceId: input.sourceId,
    bytes: input.bytes,
  });
}

export function validateOfficialPricingSourceBytesForTest(input) {
  validateOfficialPricingSourceBytes(input);
}

async function boundedResponseBytes(response, sourceId) {
  requireCondition(
    response.status === 200 &&
      response.url.length > 0 &&
      response.headers.get('location') === null,
    'PUBLIC_PRICING_RESPONSE_INVALID'
  );
  const contentType = response.headers.get('content-type') ?? '';
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    requireCondition(
      Number.isSafeInteger(parsed) &&
        parsed >= 0 &&
        parsed <= MAXIMUM_SOURCE_BYTES,
      'PUBLIC_PRICING_RESPONSE_OVERSIZED'
    );
  }
  requireCondition(response.body !== null, 'PUBLIC_PRICING_RESPONSE_INVALID');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    length += bytes.byteLength;
    requireCondition(
      length <= MAXIMUM_SOURCE_BYTES,
      'PUBLIC_PRICING_RESPONSE_OVERSIZED'
    );
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks, length);
  validateOfficialPricingSourceBytes({ sourceId, contentType, bytes });
  return bytes;
}

async function fetchOfficialSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MILLISECONDS
  );
  try {
    const response = await fetch(source.url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    requireCondition(
      response.url === source.url,
      'PUBLIC_PRICING_REDIRECT_FORBIDDEN'
    );
    const bytes = await boundedResponseBytes(response, source.sourceId);
    return {
      bytes,
      retrievedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof Action003PricingCaptureError) throw error;
    fail('PUBLIC_PRICING_GET_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}

function validatePaths(inputValue) {
  requireCondition(
    typeof inputValue === 'object' &&
      inputValue !== null &&
      !Array.isArray(inputValue),
    'PRICING_CAPTURE_INPUT_INVALID'
  );
  const input = inputValue;
  requireCondition(
    canonicalJson(Object.keys(input).sort()) ===
      canonicalJson(['outputDirectory', 'ownerPrivateRoot']),
    'PRICING_CAPTURE_INPUT_INVALID'
  );
  requireCondition(
    typeof input.ownerPrivateRoot === 'string' &&
      path.isAbsolute(input.ownerPrivateRoot) &&
      typeof input.outputDirectory === 'string' &&
      path.isAbsolute(input.outputDirectory),
    'PRICING_CAPTURE_INPUT_INVALID'
  );
  const ownerPrivateRoot = path.resolve(input.ownerPrivateRoot);
  const outputDirectory = path.resolve(input.outputDirectory);
  requireCondition(
    existsSync(ownerPrivateRoot) &&
      !isWithin(REPOSITORY_ROOT, ownerPrivateRoot) &&
      path.dirname(outputDirectory) === ownerPrivateRoot &&
      !existsSync(outputDirectory),
    'PRICING_CAPTURE_OUTPUT_INVALID'
  );
  requireOwnerPrivateBoundary({
    ownerPrivateRoot,
    targetPath: ownerPrivateRoot,
    kind: 'DIRECTORY',
  });
  return { ownerPrivateRoot, outputDirectory };
}

export async function captureAction003PublicPricing(inputValue) {
  const paths = validatePaths(inputValue);
  requireNoAmbientCredentials();
  mkdirSync(paths.outputDirectory, { recursive: false });
  protectOwnerPrivatePath({
    ownerPrivateRoot: paths.ownerPrivateRoot,
    targetPath: paths.outputDirectory,
    kind: 'DIRECTORY',
  });
  const capturedSources = [];
  for (const source of OFFICIAL_PRICING_SOURCES) {
    const filename = SOURCE_FILENAMES[source.sourceId];
    requireCondition(
      typeof filename === 'string',
      'OFFICIAL_PRICING_SOURCE_INVALID'
    );
    const capture = await fetchOfficialSource(source);
    const outputPath = path.join(paths.outputDirectory, filename);
    writeCreateNew(outputPath, capture.bytes);
    protectOwnerPrivatePath({
      ownerPrivateRoot: paths.ownerPrivateRoot,
      targetPath: outputPath,
      kind: 'FILE',
    });
    const readback = readFileSync(outputPath);
    requireCondition(
      readback.equals(capture.bytes),
      'PRICING_CAPTURE_READBACK_INVALID'
    );
    capturedSources.push({
      sourceId: source.sourceId,
      url: source.url,
      retrievedAt: capture.retrievedAt,
      artifactPath: filename,
      artifactSha256: createHash('sha256').update(readback).digest('hex'),
    });
  }
  const earliestRetrievedAt = Math.min(
    ...capturedSources.map(source => Date.parse(source.retrievedAt))
  );
  const evidence = {
    schemaVersion: 3,
    recordType: 'PR12_SOURCE_PROJECT_OFFICIAL_PRICING_EVIDENCE',
    status: 'CAPTURED',
    provider: 'SUPABASE',
    currency: 'USD',
    moneyScale: 10000,
    officialSources: capturedSources,
    pricing: {
      requiredExistingOrganizationPlan: 'PRO',
      planPurchaseOrChangeAuthorized: false,
      planIncrementalUsdScaled: 0,
      computeTier: 'LARGE',
      desiredInstanceSize: 'large',
      computeAddonVariant: 'ci_large',
      billingUnit: 'PROJECT_HOUR',
      partialHourRounding: 'ROUNDED_UP_TO_FULL_HOUR',
      hourlyRateUsdScaled: 1517,
      maximumBillableHours: 72,
      maximumComputeUsdScaled: 109224,
    },
    conservativeTreatment: {
      creditReliance: 'NONE',
      computeCreditAppliedUsdScaled: 0,
      taxAndOtherChargesQuoted: false,
      taxAndOtherChargesEstimateUsdScaled: null,
      unallocatedAuthorizationHeadroomUsdScaled: 390776,
    },
    authorizationBoundary: {
      ownerAuthorizationCeilingUsdScaled: 500000,
      providerSpendCapEnforced: false,
      knownCostOverCeilingAction: 'ABORT_BEFORE_POST',
      ceilingMeaning: 'OWNER_GOVERNANCE_AUTHORIZATION_NOT_PROVIDER_SPEND_CAP',
    },
    freshness: {
      policy: 'LOCAL_24_HOUR_REVALIDATION_NOT_PROVIDER_QUOTE_VALIDITY',
      maximumAgeAtApprovalSeconds: LOCAL_LIFETIME_SECONDS,
      lifetimeSeconds: LOCAL_LIFETIME_SECONDS,
      freshThrough: new Date(
        earliestRetrievedAt + LOCAL_LIFETIME_SECONDS * 1000
      ).toISOString(),
    },
    capturedBy: 'owner:futoshi-iwasawa',
    rawOfficialSourceArtifactsPersistedInRepository: false,
    notes:
      'Automated public official list-price capture; not an organization-specific quote or provider-enforced spend cap.',
  };
  assertSecretFreeEvidence(evidence, []);
  const evidencePath = path.join(paths.outputDirectory, EVIDENCE_FILENAME);
  writeCreateNew(evidencePath, `${canonicalJson(evidence)}\n`);
  protectOwnerPrivatePath({
    ownerPrivateRoot: paths.ownerPrivateRoot,
    targetPath: evidencePath,
    kind: 'FILE',
  });
  requireCondition(
    canonicalFileSha256(evidence) ===
      createHash('sha256').update(readFileSync(evidencePath)).digest('hex'),
    'PRICING_EVIDENCE_READBACK_INVALID'
  );
  return {
    status: 'CAPTURED',
    actionId: ACTION_ID,
    pricingEvidenceSha256: canonicalFileSha256(evidence),
    sourceCount: capturedSources.length,
    remoteGetAttemptCount: capturedSources.length,
    retryCount: 0,
    redirectCount: 0,
    requestTimeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
    maximumResponseBytes: MAXIMUM_SOURCE_BYTES,
    freshThrough: evidence.freshness.freshThrough,
    credentialReadPerformed: false,
    managementApiContactPerformed: false,
    projectCreationPerformed: false,
    productionContactPerformed: false,
  };
}

function parseArguments(argv) {
  requireCondition(
    argv.length === 6 &&
      argv[0] === '--execute-public-pricing-capture' &&
      argv[1] === EXECUTION_CONFIRMATION,
    'ACTION_CONFIRMATION_INVALID'
  );
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireCondition(
      ['--owner-private-root', '--output-directory'].includes(flag) &&
        !Object.hasOwn(values, flag) &&
        typeof value === 'string' &&
        value.length > 0,
      'USAGE_INVALID'
    );
    values[flag] = value;
  }
  return {
    ownerPrivateRoot: values['--owner-private-root'],
    outputDirectory: values['--output-directory'],
  };
}

async function main() {
  const result = await captureAction003PublicPricing(
    parseArguments(process.argv.slice(2))
  );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    const code =
      error instanceof Action003PricingCaptureError ||
      (error && typeof error.code === 'string')
        ? error.code
        : 'PR12_PUBLIC_PRICING_CAPTURE_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
