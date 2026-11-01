// Vercelからのコード配信と法務文書の正式配信を分離する。通常CI/buildはそのまま。
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const require = createRequire(import.meta.url);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});
const {
  requiresLegalReleaseCheck,
  legalDeliveryEnvironment,
} = require('../../src/components/public/legal-delivery.ts');
export function planLegalBuild(projectDir) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(projectDir, false, { info: () => {}, error: () => {} }, true);
  const environment = legalDeliveryEnvironment();
  return { environment, checkRequired: requiresLegalReleaseCheck(environment) };
}
function run(script, args = []) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, script), ...args],
    { cwd: root, env: process.env, stdio: 'inherit' }
  );
  if (result.error || result.status !== 0) process.exit(result.status ?? 2);
}
function main() {
  const { environment, checkRequired } = planLegalBuild(root);
  run('scripts/public-site/legal-manifest.mjs', ['--check']);
  if (checkRequired && environment.vercelEnv !== 'production') {
    console.error(
      'RELEASE_BLOCKED: 正式配信には明示されたProduction環境が必要です。'
    );
    process.exit(1);
  }
  if (checkRequired) run('scripts/public-site/check-release-readiness.mjs');
  console.log(
    checkRequired
      ? '法務正式配信: 前後の公開チェックを必須実行'
      : '法務正式配信: 保留（Previewは原稿確認可）。業務アプリのビルドは継続'
  );
  run('scripts/check-swc-binary.mjs');
  run('node_modules/next/dist/bin/next', ['build']);
  if (checkRequired)
    run('scripts/public-site/check-release-readiness.mjs', [
      '--scan-build',
      '.next',
    ]);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
