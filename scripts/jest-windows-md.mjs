import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const jsonPath = path.join(rootDir, 'jest-windows.json');
const mdPath = path.join(rootDir, 'jest-windows.md');

function resolveJestCommand() {
  const jestCli = path.join(rootDir, 'node_modules', 'jest', 'bin', 'jest.js');
  if (existsSync(jestCli)) {
    return { command: process.execPath, argsPrefix: [jestCli] };
  }

  const binName = process.platform === 'win32' ? 'jest.cmd' : 'jest';
  return {
    command: path.join(rootDir, 'node_modules', '.bin', binName),
    argsPrefix: [],
  };
}

function sanitizeFence(text) {
  return text.replace(/```/g, '``\\`');
}

function formatDurationMs(testResults) {
  let earliest = null;
  let latest = null;

  for (const result of testResults) {
    const stats = result?.perfStats;
    if (!stats) continue;
    if (typeof stats.start === 'number') {
      earliest =
        earliest === null ? stats.start : Math.min(earliest, stats.start);
    }
    if (typeof stats.end === 'number') {
      latest = latest === null ? stats.end : Math.max(latest, stats.end);
    }
  }

  if (earliest === null || latest === null) return null;
  return Math.max(0, latest - earliest);
}

function renderMarkdown(jsonData, runResult) {
  const lines = [];
  lines.push('# Jest Windows Report');
  lines.push('');
  lines.push(`generated_at: ${new Date().toISOString()}`);

  if (!jsonData) {
    const errorMessage = runResult?.error?.message || 'Jest output not found.';
    lines.push(`status: error`);
    lines.push('');
    lines.push('## Error');
    lines.push('');
    lines.push('```text');
    lines.push(sanitizeFence(errorMessage));
    lines.push('```');
    return lines.join('\n');
  }

  lines.push(`status: ${jsonData.success ? 'success' : 'failed'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`total_tests: ${jsonData.numTotalTests}`);
  lines.push(`passed_tests: ${jsonData.numPassedTests}`);
  lines.push(`failed_tests: ${jsonData.numFailedTests}`);
  lines.push(`skipped_tests: ${jsonData.numPendingTests}`);
  lines.push(`total_suites: ${jsonData.numTotalTestSuites}`);
  lines.push(`passed_suites: ${jsonData.numPassedTestSuites}`);
  lines.push(`failed_suites: ${jsonData.numFailedTestSuites}`);
  lines.push(`skipped_suites: ${jsonData.numPendingTestSuites}`);

  const durationMs = formatDurationMs(jsonData.testResults ?? []);
  if (durationMs !== null) {
    lines.push(`duration_ms: ${durationMs}`);
  }

  const failures = [];
  for (const result of jsonData.testResults ?? []) {
    for (const assertion of result.assertionResults ?? []) {
      if (assertion.status !== 'failed') continue;
      failures.push({
        file: result.name,
        name: assertion.fullName || assertion.title || 'unknown test',
        messages: assertion.failureMessages ?? [],
      });
    }
  }

  lines.push('');
  lines.push('## Failures');
  lines.push('');

  if (failures.length === 0) {
    lines.push('No failed tests.');
    return lines.join('\n');
  }

  const grouped = new Map();
  for (const failure of failures) {
    const file = failure.file || 'unknown file';
    if (!grouped.has(file)) grouped.set(file, []);
    grouped.get(file).push(failure);
  }

  for (const [file, fileFailures] of grouped.entries()) {
    const relative = file
      ? path.relative(rootDir, file).replace(/\\/g, '/')
      : file;
    lines.push(`File: ${relative || file}`);
    lines.push('');
    for (const failure of fileFailures) {
      lines.push(`Test: ${failure.name}`);
      const messages =
        failure.messages.length > 0
          ? failure.messages
          : ['No failure message provided.'];
      for (const message of messages) {
        lines.push('```text');
        lines.push(sanitizeFence(String(message)));
        lines.push('```');
      }
      lines.push('');
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

async function run() {
  const { command, argsPrefix } = resolveJestCommand();
  const args = [
    ...argsPrefix,
    '--runInBand',
    '--testPathIgnorePatterns=e2e',
    '--json',
    `--outputFile=${jsonPath}`,
  ];

  const result = await new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', error => resolve({ error }));
    child.on('exit', code => resolve({ code: code ?? 1 }));
  });

  let jsonData = null;
  if (existsSync(jsonPath)) {
    try {
      jsonData = JSON.parse(readFileSync(jsonPath, 'utf8'));
    } catch (error) {
      jsonData = null;
      result.error = error;
    }
  }

  const markdown = renderMarkdown(jsonData, result);
  writeFileSync(mdPath, `${markdown}\n`, 'utf8');

  if (existsSync(jsonPath)) {
    unlinkSync(jsonPath);
  }

  if (result?.error) {
    process.exitCode = 1;
  } else if (typeof result?.code === 'number') {
    process.exitCode = result.code;
  }
}

run().catch(error => {
  const fallback = renderMarkdown(null, { error });
  writeFileSync(mdPath, `${fallback}\n`, 'utf8');
  process.exitCode = 1;
});
