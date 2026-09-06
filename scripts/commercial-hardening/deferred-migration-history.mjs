import { readdirSync } from 'node:fs';

const MIGRATION_NAME_PATTERN = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function readExpectedMigrationVersions(directory, requiredVersions) {
  const versions = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => {
      const match = MIGRATION_NAME_PATTERN.exec(entry.name);
      invariant(match, `Invalid migration filename: ${entry.name}`);
      return match[1];
    })
    .sort();
  invariant(versions.length > 0, 'Expected migration history is empty');
  invariant(
    new Set(versions).size === versions.length,
    'Expected migration history contains duplicate versions'
  );
  for (const version of requiredVersions) {
    invariant(
      versions.includes(version),
      `Required deferred migration is missing: ${version}`
    );
  }
  return versions;
}

export function assertDeferredMigrationHistory(
  historyResult,
  expectedVersions,
  recoveryVersion
) {
  const fields = historyResult.trim().split('|');
  const [head, repairedCount, recoveryCount, appliedHistory] = fields;
  // 復旧versionは固定し、以後のappendも含む全履歴をrepoと厳密に照合する。
  invariant(
    fields.length === 4 &&
      expectedVersions.includes(recoveryVersion) &&
      head === expectedVersions.at(-1) &&
      repairedCount === '1' &&
      recoveryCount === '1',
    'Deferred migration history did not reach the repository head with repaired and recovery versions exactly once'
  );
  const appliedVersions = appliedHistory.split(',');
  invariant(
    appliedVersions.length === expectedVersions.length &&
      new Set(appliedVersions).size === appliedVersions.length &&
      appliedVersions.every(
        (version, index) => version === expectedVersions[index]
      ),
    'Deferred applied migration versions do not exactly match the repository'
  );
}
