#!/usr/bin/env node
// 公開サイト（共通トップ・Works／OS LP・問い合わせ・法務）の公開前チェック。
//
// - build・CI・本番リクエスト処理には組み込まない。リリース担当が公開前に明示的に実行する。
// - 承認台帳（src/components/public/release-readiness.ts）と問い合わせフォームURLの設定を確認し、
//   公開に必要な項目が未承認なら終了コード1で「公開不可（RELEASE_BLOCKED）」と判定する。
// - --scan-build <dir>: ビルド出力（例: .next）に画像の仮ドメイン等が混入していないかを確認する。
// - --private-terms-file <path>: 公開してはいけない文字列（氏名・所在地・電話番号等）を1行1件で書いた
//   リポジトリ外のファイル。値そのものは出力せず、何番目の文字列が何件見つかったかだけを表示する。
//
// 例: npm run public-site:release-check -- --scan-build .next --private-terms-file ../private/terms.txt

import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});

const {
  evaluateReleaseReadiness,
  releaseCheckItems,
  worksClaims,
} = require('../../src/components/public/release-readiness.ts');
const {
  resolveLpFormLink,
} = require('../../src/components/public/lp-links.ts');

// 参照画像・テンプレートに含まれる仮のドメイン。公開物に混入してはいけない。
const PLACEHOLDER_PATTERNS = ['tiramisu.jp', 'your-app.vercel.app'];
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

let failed = false;

console.log('公開サイト 公開前チェック');
console.log('==========================');

const result = evaluateReleaseReadiness(releaseCheckItems);
for (const item of releaseCheckItems) {
  const mark = item.status === 'approved_for_publication' ? 'OK ' : 'NG ';
  const scope = item.requiredFor === 'release' ? '' : '（申請時）';
  console.log(
    `${mark}[${item.ledger}] ${item.label}${scope}: ${statusLabels[item.status]}`
  );
  if (item.status !== 'approved_for_publication') {
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
const formLink = resolveLpFormLink(process.env.NEXT_PUBLIC_LP_FORM_URL);
if (formLink.status === 'ready') {
  const source =
    formLink.source === 'env'
      ? 'NEXT_PUBLIC_LP_FORM_URL'
      : '既定のGoogleフォーム';
  console.log(`問い合わせフォームURL: 使用可能な形式（${source}）`);
  console.log('  ※ 形式の確認のみ。設問・通知・受信の現物確認は B02 で行う。');
} else {
  failed = true;
  console.log(
    '問い合わせフォームURL: NEXT_PUBLIC_LP_FORM_URL が https のURLではないため、問い合わせページにリンクを表示できません。'
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
      failed = true;
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
    if (count > 0) failed = true;
    console.log(
      `  ${count > 0 ? 'NG' : 'OK'} 非公開文字列 #${index + 1}: ${count}件`
    );
  });
}

console.log('');
if (!result.ready || failed) {
  console.log(
    `判定: 公開不可（RELEASE_BLOCKED）。公開に必要な未承認項目 ${result.blocking.length}件${failed ? '、確認エラーあり' : ''}。`
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
