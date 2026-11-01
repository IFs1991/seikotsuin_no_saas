// Works専用のsource/buildチェック。Production設定や公開操作は行わない。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeLegalManifest,
  verifyLegalManifest,
} from './legal-manifest.mjs';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(root, false, { info: () => {}, error: () => {} }, true);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});
const {
  getWorksLegalPublication,
  worksLegalGates,
} = require('../../src/components/public/works-release-readiness.ts');
const {
  resolveLpFormLink,
} = require('../../src/components/public/lp-links.ts');
const errors = [];
if (!verifyLegalManifest(root)) errors.push('source-manifest');
const contents = computeLegalManifest(root).documents;
for (const document of ['works/privacy', 'works/terms', 'works/plugin']) {
  if (
    !getWorksLegalPublication(document, undefined, undefined, contents).approved
  )
    errors.push(document);
}
if (resolveLpFormLink().status !== 'ready') errors.push('contact-form-url');
for (const gate of worksLegalGates) console.log(`${gate.id}: ${gate.status}`);
const buildIndex = process.argv.indexOf('--scan-build');
if (buildIndex !== -1) {
  const directory = process.argv[buildIndex + 1];
  if (!directory || directory.startsWith('--'))
    throw new Error('scan-build requires a directory');
  const { scanBuildOutput } = require('./build-scan.ts');
  const privateIndex = process.argv.indexOf('--private-terms-file');
  const privateFile =
    privateIndex === -1 ? undefined : process.argv[privateIndex + 1];
  if (privateIndex !== -1 && (!privateFile || privateFile.startsWith('--')))
    throw new Error('private-terms-file requires a file');
  const privateTerms = privateFile
    ? fs
        .readFileSync(privateFile, 'utf8')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
    : [];
  const scan = scanBuildOutput(
    path.resolve(root, directory),
    privateTerms,
    root
  );
  for (const finding of scan.findings)
    if (finding.verdict === 'BLOCK') errors.push(`build:${finding.category}`);
  if (!privateTerms.length)
    console.log('PRIVATE_TERMS: UNVERIFIED（非公開原本を取得していません）');
}
console.log(
  errors.length
    ? `WORKS_RELEASE_BLOCKED: ${[...new Set(errors)].join(', ')}`
    : 'WORKS_CODE_GATE_PASS（公開・申請完了ではありません）'
);
process.exitCode = errors.length ? 1 : 0;
