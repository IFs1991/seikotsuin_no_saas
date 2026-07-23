#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const DEFAULT_PATHS = [
  'docs/stabilization/evidence/commercial-hardening/pr12',
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
  'docs/stabilization/spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md',
  'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md',
  'docs/operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md',
  'docs/releases/current-gate-status.yaml',
];
const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.json',
  '.md',
  '.raw',
  '.sql',
  '.toml',
  '.txt',
  '.yaml',
  '.yml',
]);

const RULES = [
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  },
  {
    id: 'supabase-secret-key',
    pattern: /\bsb_secret_[A-Za-z0-9_-]{12,}\b/gu,
  },
  {
    id: 'supabase-management-access-token',
    pattern: /\bsbp_[A-Za-z0-9_-]{20,}\b/gu,
  },
  {
    id: 'jwt-value',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
  },
  {
    id: 'provider-token',
    pattern:
      /\b(?:sk_live|sk_test|whsec|ghp|github_pat|xoxb|xoxp|xoxa)-?[A-Za-z0-9_-]{12,}\b/gu,
  },
  {
    id: 'aws-access-key',
    pattern: /\bAKIA[A-Z0-9]{16}\b/gu,
  },
  {
    id: 'credentialed-database-url',
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@[^\s]+/gu,
  },
  {
    id: 'password-assignment',
    pattern:
      /\b(?:password|passwd|pgpassword|db[_-]?pass|smtp[_-]?pass)\s*[:=]\s*["']?(?!NOT_CAPTURED\b|UNASSIGNED\b|REDACTED\b|RUNTIME_SECRET_NOT_IN_EVIDENCE\b|PR12_[A-Z0-9_]+\b|<)[^\s"']{8,}/giu,
  },
  {
    id: 'json-password-assignment',
    pattern:
      /"(?:password|passwd|pgpassword|db[_-]?(?:pass|password)|database[_-]?password|databasePassword|smtp[_-]?(?:pass|password))"\s*:\s*"(?!NOT_CAPTURED\b|UNASSIGNED\b|REDACTED\b|RUNTIME_SECRET_NOT_IN_EVIDENCE\b|PR12_[A-Z0-9_]+\b|<)[^"\r\n]{8,}"/giu,
  },
  {
    id: 'windows-user-home',
    pattern: /\b[A-Za-z]:\\Users\\[^\\\s]+\\/gu,
  },
  {
    id: 'unix-user-home',
    pattern: /(?:^|\s)\/(?:home|Users)\/[^/\s]+\//gu,
  },
  {
    id: 'international-phone',
    pattern: /\+[1-9][0-9][0-9 ()-]{7,}[0-9]/gu,
  },
  {
    id: 'japanese-domestic-phone',
    pattern:
      /\b0(?:[789]0[- ]?[0-9]{4}[- ]?[0-9]{4}|[1-9][0-9]?[- ]?[0-9]{1,4}[- ]?[0-9]{4})\b/gu,
  },
];

function parseArgs(argv) {
  if (argv.length === 0)
    return { mode: 'REPOSITORY_PREFLIGHT', paths: DEFAULT_PATHS };
  if (argv.length === 2 && argv[0] === '--manifest' && argv[1]) {
    return { mode: 'QUALIFICATION_MANIFEST', manifestPath: argv[1] };
  }
  const paths = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--path') {
      throw new Error(
        'Usage: scan-pr12-evidence.mjs [--path <file-or-directory>]... | --manifest <manifest.json>'
      );
    }
    const value = argv[index + 1];
    if (!value) throw new Error('--path requires a value');
    paths.push(value);
    index += 1;
  }
  return { mode: 'REPOSITORY_PREFLIGHT', paths };
}

function collectFiles(absolutePath) {
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symbolic links are not accepted: ${absolutePath}`);
  }
  if (stat.isFile()) return [absolutePath];
  if (!stat.isDirectory()) return [];

  return readdirSync(absolutePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap(entry => collectFiles(path.join(absolutePath, entry.name)));
}

function normalizedDirectoryFiles(directory) {
  return collectFiles(directory)
    .map(file => path.relative(directory, file).replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right, 'en'));
}

function assertManifestClosedDirectory(
  manifestPath,
  manifestDirectory,
  artifactPaths
) {
  const manifestRelative = path
    .relative(manifestDirectory, manifestPath)
    .replaceAll('\\', '/');
  if (artifactPaths.has(manifestRelative)) {
    throw new Error('manifest must not self-hash as an artifact');
  }
  const expected = [manifestRelative, ...artifactPaths].sort((left, right) =>
    left.localeCompare(right, 'en')
  );
  const observed = normalizedDirectoryFiles(manifestDirectory);
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error('evidence directory is not manifest-closed');
  }
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function emailFindings(source) {
  const findings = [];
  const pattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
  for (const match of source.matchAll(pattern)) {
    const value = match[0].toLowerCase();
    if (
      value.endsWith('@example.invalid') ||
      value.endsWith('@example.com') ||
      value.endsWith('@example.org')
    ) {
      continue;
    }
    findings.push({ id: 'email-address', index: match.index ?? 0 });
  }
  return findings;
}

export function scanTextForSensitiveData(source) {
  const findings = [];
  for (const rule of RULES) {
    for (const match of source.matchAll(rule.pattern)) {
      findings.push({ id: rule.id, index: match.index ?? 0 });
    }
  }
  findings.push(...emailFindings(source));
  return findings.map(finding => ({
    id: finding.id,
    line: lineNumberAt(source, finding.index),
  }));
}

function scanFile(absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();
  const source = TEXT_EXTENSIONS.has(extension)
    ? readFileSync(absolutePath, 'utf8')
    : readFileSync(absolutePath).toString('utf8');
  return scanTextForSensitiveData(source);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireRecord(value, context) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value;
}

function requireString(value, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

function resolveManifestArtifact(manifestDirectory, artifactPath) {
  const normalized = requireString(artifactPath, 'artifact.path').replaceAll(
    '\\',
    '/'
  );
  if (
    path.isAbsolute(normalized) ||
    normalized.split('/').some(segment => segment === '..')
  ) {
    throw new Error(
      `artifact path escapes the manifest directory: ${normalized}`
    );
  }
  const absolutePath = path.resolve(manifestDirectory, normalized);
  const relative = path.relative(manifestDirectory, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `artifact path escapes the manifest directory: ${normalized}`
    );
  }
  return { normalized, absolutePath };
}

function scanQualificationManifest(manifestPathValue) {
  const manifestPath = path.resolve(REPO_ROOT, manifestPathValue);
  const manifestDirectory = path.dirname(manifestPath);
  const manifest = requireRecord(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    'manifest'
  );
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error('manifest.artifacts must be a non-empty array');
  }
  if (!Array.isArray(manifest.commands)) {
    throw new Error('manifest.commands must be an array');
  }
  const privacyScan = requireRecord(
    manifest.privacyScan,
    'manifest.privacyScan'
  );
  const machineScanCommandId = requireString(
    privacyScan.machineScanCommandId,
    'manifest.privacyScan.machineScanCommandId'
  );
  const machineCommand = manifest.commands
    .map((value, index) =>
      requireRecord(value, `manifest.commands[${String(index)}]`)
    )
    .find(command => command.id === machineScanCommandId);
  if (!machineCommand) {
    throw new Error('privacy scan command is absent from manifest.commands');
  }
  const stdoutPath = requireString(
    machineCommand.stdoutPath,
    'privacy scan command stdoutPath'
  ).replaceAll('\\', '/');
  const stderrPath = requireString(
    machineCommand.stderrPath,
    'privacy scan command stderrPath'
  ).replaceAll('\\', '/');
  if (stdoutPath === stderrPath) {
    throw new Error('privacy scan stdoutPath and stderrPath must be distinct');
  }
  for (const commandValue of manifest.commands) {
    const command = requireRecord(commandValue, 'manifest command');
    if (command.id === machineScanCommandId) continue;
    if (
      command.stdoutPath === stdoutPath ||
      command.stderrPath === stdoutPath ||
      command.stdoutPath === stderrPath ||
      command.stderrPath === stderrPath
    ) {
      throw new Error(
        'privacy scan streams must not be reused by another command'
      );
    }
  }

  const excludedGeneratedArtifactPaths = [stdoutPath, stderrPath].sort(
    (left, right) => left.localeCompare(right, 'en')
  );
  const excluded = new Set(excludedGeneratedArtifactPaths);
  const seen = new Set();
  const findings = [];
  const scannedArtifacts = [];
  for (const [index, value] of manifest.artifacts.entries()) {
    const artifact = requireRecord(
      value,
      `manifest.artifacts[${String(index)}]`
    );
    const { normalized, absolutePath } = resolveManifestArtifact(
      manifestDirectory,
      artifact.path
    );
    if (seen.has(normalized))
      throw new Error(`duplicate artifact path: ${normalized}`);
    seen.add(normalized);
    if (excluded.has(normalized)) continue;
    const bytes = readFileSync(absolutePath);
    const actualSha256 = sha256(bytes);
    if (artifact.bytes !== bytes.length || artifact.sha256 !== actualSha256) {
      throw new Error(`manifest artifact bytes/SHA mismatch: ${normalized}`);
    }
    for (const finding of scanFile(absolutePath)) {
      findings.push({ ...finding, path: normalized });
    }
    scannedArtifacts.push({
      path: normalized,
      bytes: bytes.length,
      sha256: actualSha256,
      classification: requireString(
        artifact.classification,
        `manifest artifact ${normalized} classification`
      ),
    });
  }
  for (const excludedPath of excluded) {
    if (!seen.has(excludedPath)) {
      throw new Error(
        `privacy scan generated stream is absent from artifacts: ${excludedPath}`
      );
    }
  }
  assertManifestClosedDirectory(manifestPath, manifestDirectory, seen);
  scannedArtifacts.sort((left, right) =>
    left.path.localeCompare(right.path, 'en')
  );
  if (scannedArtifacts.length === 0) {
    throw new Error('privacy scan has no eligible manifest artifacts');
  }
  const report = {
    schemaVersion: 2,
    resultType: 'PR12_EVIDENCE_PRIVACY_SCAN_RESULT',
    scannerVersion: 'pr12-evidence-scan-v2',
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findingCount: findings.length,
    manifestArtifactCount: manifest.artifacts.length,
    excludedGeneratedArtifactPaths,
    scannedArtifactCount: scannedArtifacts.length,
    scannedArtifacts,
  };
  console.log(JSON.stringify(report, null, 2));
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.id}: ${finding.path}:${String(finding.line)}`);
    }
    throw new Error(
      `PR12 evidence privacy scan found ${String(findings.length)} issue(s)`
    );
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.mode === 'QUALIFICATION_MANIFEST') {
    scanQualificationManifest(parsed.manifestPath);
    return;
  }
  const roots = parsed.paths.map(value => path.resolve(REPO_ROOT, value));
  const files = [...new Set(roots.flatMap(collectFiles))].sort((left, right) =>
    left.localeCompare(right, 'en')
  );
  const findings = [];
  for (const file of files) {
    for (const finding of scanFile(file)) {
      findings.push({
        ...finding,
        path: path.relative(REPO_ROOT, file).replaceAll('\\', '/'),
      });
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.id}: ${finding.path}:${String(finding.line)}`);
    }
    throw new Error(
      `PR12 evidence privacy scan found ${String(findings.length)} issue(s)`
    );
  }

  console.log(
    `PR12 evidence privacy scan: PASS (${String(files.length)} text artifacts checked against configured machine-detectable patterns; matched values are never printed).`
  );
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
