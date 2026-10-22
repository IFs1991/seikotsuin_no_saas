#!/usr/bin/env node
// 公開サイト（共通トップ・Works／OS LP・問い合わせ・法務）の公開前チェック。
//
// - build・CI・本番リクエスト処理には組み込まない。リリース担当が公開前に明示的に実行する。
// - 承認台帳（src/components/public/release-readiness.ts）と問い合わせフォームURLの設定を確認し、
//   公開に必要な項目が未承認なら終了コード1で「公開不可（RELEASE_BLOCKED）」と判定する。
// - --scan-build <dir>: ビルド出力（例: .next）に画像の仮ドメイン等が混入していないかを確認する。
// - --private-terms-file <path>: 公開してはいけない文字列（氏名・所在地・電話番号等）を1行1件で書いた
//   リポジトリ外のファイル。値そのものは出力せず、何番目の文字列が何件見つかったかだけを表示する。
// - --project-dir <dir>: 環境ファイルを読むディレクトリ（既定はリポジトリのルート）。
//   `next build` と同じ @next/env の本番モードで .env.production.local → .env.local → .env.production → .env
//   の順に読み、既に設定済みのプロセス環境変数を優先する。環境変数を読むモジュールより先に読み込む。
//
// 例: npm run public-site:release-check -- --scan-build .next --private-terms-file ../private/terms.txt

import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FORM_URL_KEY = 'NEXT_PUBLIC_LP_FORM_URL';

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} には値が必要です。`);
    process.exit(2);
  }
  return value;
}

// NODE_ENV=test では @next/env が .env.test を読み、本番buildと異なる環境を検証してしまう。
if (process.env.NODE_ENV === 'test') {
  console.error(
    'NODE_ENV=test では本番buildと同じ環境ファイルを読めないため実行できません（NODE_ENV を外すか production にしてください）。'
  );
  process.exit(2);
}

const projectDir = path.resolve(
  readOption('--project-dir') ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
);
const formUrlFromProcess = Object.prototype.hasOwnProperty.call(
  process.env,
  FORM_URL_KEY
);
const { loadEnvConfig } = require('@next/env');
const quietLog = { info: () => {}, error: message => console.error(message) };
// dev=false: `next build` / `next start` と同じ本番用の環境ファイル。
const { loadedEnvFiles } = loadEnvConfig(projectDir, false, quietLog, true);

// 環境ファイルの読込後に、環境変数を参照するモジュールを読み込む。
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});

const {
  PLACEHOLDER_DOMAINS,
  checkReleaseItem,
  decideRelease,
  evaluateReleaseReadiness,
  releaseCheckItems,
  worksClaims,
} = require('../../src/components/public/release-readiness.ts');
const {
  resolveLpFormLink,
} = require('../../src/components/public/lp-links.ts');

const PLACEHOLDER_PATTERNS = PLACEHOLDER_DOMAINS;
const SCANNED_EXTENSIONS = new Set([
  '.html',
  '.rsc',
  '.js',
  '.json',
  '.body',
  '.meta',
  '.txt',
  '.map',
]);

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stats = statSync(current);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (entry === 'cache') continue;
        stack.push(path.join(current, entry));
      }
    } else if (SCANNED_EXTENSIONS.has(path.extname(current))) {
      files.push(current);
    }
  }
  return files;
}

function countOccurrences(text, term) {
  let count = 0;
  let from = 0;
  for (;;) {
    const index = text.indexOf(term, from);
    if (index === -1) return count;
    count += 1;
    from = index + term.length;
  }
}

function scanBuildOutput(buildDir, privateTerms) {
  const files = listFiles(buildDir);
  const placeholderHits = new Map(PLACEHOLDER_PATTERNS.map(p => [p, []]));
  const privateHits = privateTerms.map(() => 0);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (text.includes(pattern)) {
        placeholderHits.get(pattern).push(path.relative(buildDir, file));
      }
    }
    privateTerms.forEach((term, index) => {
      privateHits[index] += countOccurrences(text, term);
    });
  }
  return { fileCount: files.length, placeholderHits, privateHits };
}

const statusLabels = {
  missing: '未決定',
  draft: '下書き（事業者の確認前）',
  confirmed: '事実確認済み（公開承認待ち）',
  approved_for_publication: '公開承認済み',
};

const checkErrors = [];

console.log('公開サイト 公開前チェック');
console.log('==========================');

const result = evaluateReleaseReadiness(releaseCheckItems);
for (const item of releaseCheckItems) {
  const check = checkReleaseItem(item);
  const mark = check.satisfied ? 'OK ' : 'NG ';
  const scope = item.requiredFor === 'release' ? '' : '（申請時）';
  console.log(
    `${mark}[${item.ledger}] ${item.label}${scope}: ${statusLabels[item.status]}`
  );
  if (check.valueProblem) {
    console.log(`      実値: ${check.valueProblem}`);
  }
  if (!check.satisfied) {
    console.log(`      次の対応: ${item.nextAction}`);
  }
}

console.log('');
console.log('Works 公開主張の管理表');
const approvedClaims = worksClaims.filter(
  claim => claim.status === 'approved_for_publication'
);
console.log(
  `  ${worksClaims.length}件中 ${approvedClaims.length}件が公開承認済み`
);
for (const claim of worksClaims) {
  if (claim.status === 'approved_for_publication') continue;
  console.log(
    `  - ${claim.claimId}: ${statusLabels[claim.status]} / 有効化: ${claim.enablement} / 本番E2E確認日: ${claim.lastProductionE2eOn ?? 'なし'} / 確認者: ${claim.reviewer ?? 'なし'}`
  );
}

console.log('');
const formUrlSource = (() => {
  if (formUrlFromProcess) return 'プロセス環境変数';
  const file = loadedEnvFiles.find(entry =>
    Object.prototype.hasOwnProperty.call(entry.env, FORM_URL_KEY)
  );
  return file ? path.basename(file.path) : null;
})();
console.log(
  `環境ファイル（本番モード）: ${
    loadedEnvFiles.length > 0
      ? loadedEnvFiles.map(entry => path.basename(entry.path)).join(', ')
      : 'なし'
  }`
);
// 値そのもの（URL）は出力しない。
const formLink = resolveLpFormLink(process.env[FORM_URL_KEY]);
if (formLink.status === 'ready') {
  const source =
    formLink.source === 'env'
      ? `${FORM_URL_KEY}（${formUrlSource}）`
      : `既定のGoogleフォーム（${FORM_URL_KEY} は未設定）`;
  console.log(`問い合わせフォームURL: 使用可能な形式（${source}）`);
  console.log(
    '  ※ 形式の確認のみ。ホスティング側だけに設定された本番の値は、同じ値をこの実行環境に与えない限り未確認。'
  );
  console.log('  ※ 設問・通知・受信の現物確認は B02 で行う。');
} else {
  checkErrors.push('form-url');
  console.log(
    `問い合わせフォームURL: 不正な設定（${FORM_URL_KEY}、出所: ${formUrlSource}）。https のURLではない、または資格情報を含むため、問い合わせページにリンクを表示できません。既定のフォームには切り替えません。`
  );
}

const scanDir = readOption('--scan-build');
const privateTermsFile = readOption('--private-terms-file');
if (scanDir) {
  console.log('');
  const buildDir = path.resolve(scanDir);
  if (!existsSync(buildDir)) {
    console.error(`ビルド出力が見つかりません: ${buildDir}`);
    process.exit(2);
  }
  let privateTerms = [];
  if (privateTermsFile) {
    privateTerms = readFileSync(path.resolve(privateTermsFile), 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  }
  const scan = scanBuildOutput(buildDir, privateTerms);
  console.log(`ビルド出力の確認: ${scan.fileCount}ファイル`);
  for (const [pattern, files] of scan.placeholderHits) {
    if (files.length > 0) {
      checkErrors.push(`placeholder:${pattern}`);
      console.log(`  NG 仮ドメイン「${pattern}」: ${files.length}ファイル`);
      for (const file of files.slice(0, 10)) console.log(`     ${file}`);
    } else {
      console.log(`  OK 仮ドメイン「${pattern}」: 0ファイル`);
    }
  }
  if (privateTerms.length === 0) {
    console.log(
      '  非公開文字列: 未確認（--private-terms-file を指定すると確認します）'
    );
  }
  scan.privateHits.forEach((count, index) => {
    if (count > 0) checkErrors.push(`private-term:${index + 1}`);
    console.log(
      `  ${count > 0 ? 'NG' : 'OK'} 非公開文字列 #${index + 1}: ${count}件`
    );
  });
}

console.log('');
if (decideRelease(result, checkErrors) === 'RELEASE_BLOCKED') {
  console.log(
    `判定: 公開不可（RELEASE_BLOCKED）。公開に必要な未承認項目 ${result.blocking.length}件${checkErrors.length > 0 ? `、確認エラー ${checkErrors.length}件` : ''}。`
  );
  process.exitCode = 1;
} else {
  console.log(
    '判定: 公開前条件を満たしています（READY_FOR_RELEASE）。デプロイの許可や実行済みを意味しません。'
  );
}
if (result.deferred.length > 0) {
  console.log(
    `参考: プラグイン申請時に必要な未完了項目 ${result.deferred.length}件（公開判定には含めない）。`
  );
}
