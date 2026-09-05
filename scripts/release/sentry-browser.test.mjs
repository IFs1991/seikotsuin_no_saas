import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

test('browser init uses the inlined public DSN when runtime process.env is empty', () => {
  // Next substitutes only direct public env expressions during client builds.
  const source = readFileSync(
    new URL('../../src/lib/monitoring/sentry.ts', import.meta.url),
    'utf8'
  ).replaceAll(
    'process.env.NEXT_PUBLIC_SENTRY_DSN',
    JSON.stringify('https://public@example.ingest.sentry.io/1')
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exported = {};
  runInNewContext(compiled.outputText, {
    exports: exported,
    process: { env: {} },
  });
  const captured = [];
  assert.equal(
    exported.initSentry({ init: options => captured.push(options) }, 'client'),
    true
  );
  assert.equal(captured[0].dsn, 'https://public@example.ingest.sentry.io/1');
});
