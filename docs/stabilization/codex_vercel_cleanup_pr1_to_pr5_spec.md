# Codex投入用仕様書: Vercel Deploy Log Cleanup PR-1〜PR-5

| 項目 | 内容 |
| --- | --- |
| Version | v1.0 |
| 作成日 | 2026-06-17 |
| 対象リポジトリ | `IFs1991/seikotsuin_no_saas` |
| 対象 | Vercel production deploy log warnings cleanup |
| 入力ログ | 最新Vercelログ: 2026-06-17 00:34〜00:36 JST相当 |
| 方針 | 依存更新・PIIログ・bundle・Node・ESLint基盤をPR単位で分離する |
| Codex実行方針 | **一括実行禁止。必ずPR番号を指定して1PRずつ実行する** |

---

## 0. 最新Vercelログから確定している未解消事項

### Install / Runtime warning

```text
Warning: Detected "engines": { "node": ">=20.19.0" } in your `package.json`
```

### Deprecated package warning

```text
npm warn deprecated @supabase/auth-helpers-shared@0.7.0
npm warn deprecated @supabase/auth-helpers-nextjs@0.10.0
npm warn deprecated uuid@10.0.0
npm warn deprecated whatwg-encoding@2.0.0
npm warn deprecated inflight@1.0.6
npm warn deprecated glob@7.2.3
npm warn deprecated domexception@4.0.0
npm warn deprecated abab@2.0.6
```

### Next.js / ESLint warning

```text
The Next.js plugin was not detected in your ESLint configuration.
```

### ESLint warning count

最新ログ上のESLint warningは **233件**。

| Rule | Count |
| --- | ---: |
| `no-console` | 126 |
| `jsx-a11y/label-has-associated-control` | 37 |
| `unused-imports/no-unused-vars` | 31 |
| `@typescript-eslint/no-explicit-any` | 22 |
| `jsx-a11y/click-events-have-key-events` | 6 |
| `jsx-a11y/no-static-element-interactions` | 6 |
| `react-hooks/exhaustive-deps` | 3 |
| `jsx-a11y/heading-has-content` | 2 |

### 重要判断

- `no-console` が最大件数だが、全件削除を最初にやらない。
- まず認証・admin callback・password reset など、PII/認証情報に近いログを先に潰す。
- ESLint warning 233件の全面解消はPR-6以降の対象。本仕様のPR-5では「管理できる状態」にするところまで。

---

## 1. 全体PR構成

| PR | タイトル | 主目的 | 必須度 |
| ---: | --- | --- | --- |
| PR-1 | Dependency security cleanup | `next` patch更新、audit、`auth-helpers`削除、`uuid@10`経路確認 | P0 |
| PR-2 | Remove auth PII logs | 認証系/管理系のPIIログ・direct console除去 | P0 |
| PR-3 | Restore Next.js chunk splitting | `next.config.js` の巨大vendors固定を撤去 | P1 |
| PR-4 | Pin Node runtime | Node 24.x第一候補 / 22.xフォールバックで環境統一 | P1 |
| PR-5 | ESLint baseline and Next plugin cleanup | Next plugin警告、Browserslist、`lint:ci`、warningラチェット導入 | P1 |

---

## 2. 共通実行ルール

Codexは以下を必ず守ること。

### 必須

- 1回のタスクで1PR分だけ実装する。
- 仕様範囲外のリファクタリングをしない。
- 変更ファイル一覧を最終報告に含める。
- 実行したコマンドと結果を最終報告に含める。
- 失敗したコマンドがある場合、原因が「このPR由来」か「既存問題」かを分けて記録する。
- package更新では `package.json` と `package-lock.json` の整合性を保つ。
- lockfileだけの不自然な更新を残さない。

### 禁止

- PR-1でNodeバージョンを変更しない。
- PR-1でwebpack `splitChunks` を触らない。
- PR-1〜PR-5でESLint warning 233件を全面修正しない。
- `any` を雑に `unknown` へ一括置換しない。
- 本番ログからPIIが消える保証なしに「ログ対応完了」と報告しない。
- テスト失敗を握り潰して成功扱いしない。

### 共通チェックコマンド

PRごとに必要なものを実行する。

```bash
npm ci
npm run type-check
npm run build
npm test
npm run lint:check
npm audit
```

存在しないscriptがある場合は、`package.json`を確認し、代替scriptを使う。代替不能なら「該当scriptなし」と報告する。

---

# PR-1: Dependency security cleanup

## 目的

Vercelログ上の依存・deprecated・audit系リスクを最初に潰す。

## Scope

実装すること。

1. `next` を patched 15.5.x へ更新する。
   - 最低 `15.5.18`
   - 既存Next major/minorを不用意に上げない
2. `@supabase/auth-helpers-nextjs` を削除する。
   - 実装は `@supabase/ssr` 移行済み想定
   - importが残っていないことをgrepで確認する
3. `npm audit` を実行し、結果を記録する。
4. semver互換範囲で修正可能な脆弱性を修正する。
   - 原則 `npm audit fix`
   - `--force` は使わない
5. `uuid@10` warningの経路を調査する。
   - `npm ls uuid`
   - `npm explain uuid`
   - `resend` / `svix` / その他の経路を確認
   - 安全な範囲で更新可能なら更新
   - major upgradeが必要ならPR-1では無理に上げず、残課題として記録

## Out of scope

- Node runtime変更
- `next.config.js`変更
- ESLint warning大量修正
- PIIログ修正
- Jest major update
- 画面修正
- 機能追加

## 推奨実行コマンド

```bash
npm ci
npm ls @supabase/auth-helpers-nextjs || true
grep -R "@supabase/auth-helpers" -n src app lib components . || true

npm install next@^15.5.18
npm uninstall @supabase/auth-helpers-nextjs

npm ls uuid || true
npm explain uuid || true
npm audit
npm audit fix

npm run type-check
npm run build
npm test
npm audit
```

## Acceptance criteria

- `package.json` から `@supabase/auth-helpers-nextjs` が消えている。
- `package-lock.json` から `@supabase/auth-helpers-nextjs` / `@supabase/auth-helpers-shared` が消えている、または依存経路が残っていない。
- `next` が `15.5.18` 以上の15.5.xになっている。
- `npm audit` の結果が最終報告に記録されている。
- `npm audit fix --force` を使っていない。
- Vercel install warningのうち `@supabase/auth-helpers-*` が消える見込みがある。
- `uuid@10` が解消できた場合は解消内容、残る場合は依存経路と理由が明記されている。
- `npm run build` が通る、または既存要因の失敗として明記されている。

## Rollback

- `package.json`
- `package-lock.json`

上記2ファイルをrevertする。

## Codex投入プロンプト

```md
Implement only PR-1 from `codex_vercel_cleanup_pr1_to_pr5_spec.md`.

Do not change Node version.
Do not edit `next.config.js`.
Do not start broad ESLint cleanup.
Do not remove console logs in this PR.

Focus only on dependency/security cleanup:
- update next to patched 15.5.x, at least 15.5.18
- remove @supabase/auth-helpers-nextjs
- run npm audit and semver-compatible fixes
- investigate uuid@10 path

After implementation, report changed files, commands run, pass/fail results, audit result, and remaining warnings.
```

---

# PR-2: Remove auth PII logs

## 目的

認証・管理・パスワード系フローの direct `console.*` とPIIログを除去する。

これは単なるlint cleanupではない。医療系SaaSとして、Vercel Function logsにメールアドレス・認証文脈・ユーザー識別情報が残る信用リスクを潰すPR。

## Scope

優先対象。

- `src/app/(public)/login/actions.ts`
- `src/app/(public)/register/actions.ts`
- `src/app/(public)/forgot-password/actions.ts`
- `src/app/(public)/reset-password/actions.ts`
- `src/app/(public)/invite/actions.ts`
- `src/app/admin/actions.ts`
- `src/app/admin/callback/route.ts`
- その他、認証・admin・invite・password resetに関係するserver action / route handler

実装すること。

1. direct `console.*` を撤去する。
2. 既存の統一loggerがある場合はそれを使う。
3. loggerへ渡すmetadataからPIIを除去またはマスクする。
4. email raw出力は禁止。
5. userIdを出す必要がある場合は、業務上必要な箇所だけに限定する。
6. 失敗理由をログに残す場合も、入力値そのものは残さない。
7. 認証失敗の監査が必要な場合は、AuditLoggerなど既存監査経路へ寄せる。

## PII masking policy

### 禁止

```ts
logger.warn('login failed', { email });
console.warn('login failed', email);
console.info({ userEmail: email });
```

### 許容

```ts
logger.warn('login failed', {
  reason: 'invalid_credentials',
  emailDomain: getEmailDomain(email),
});
```

または

```ts
logger.warn('login failed', {
  reason: 'invalid_credentials',
  emailHash: hashEmail(email),
});
```

ただしhash helperを新規追加する場合は、過剰設計にしないこと。

## Out of scope

- 全リポジトリの `no-console` 126件を一括修正しない。
- UIコンポーネントのconsoleは触らない。
- `no-explicit-any` は触らない。
- a11y warningは触らない。
- logging基盤の大規模再設計はしない。

## 推奨実行コマンド

```bash
grep -R "console\." -n src/app | grep -E "login|register|forgot|reset|invite|admin|callback" || true
grep -R "email" -n src/app/\(public\) src/app/admin || true

npm run type-check
npm run build
npm run lint:check
```

## Acceptance criteria

- 対象認証系ファイルから direct `console.*` が消えている、またはPIIを含まない明確な理由付きで残している。
- raw emailがlogger/consoleに渡っていない。
- Vercel Function logへメールアドレスが出る実装が残っていない。
- 認証・invite・password reset・admin callbackの動作が壊れていない。
- `npm run type-check` が通る。
- `npm run build` が通る。
- ESLint warning countは大幅減していなくてもよい。目的はPIIログ除去。

## Rollback

対象ファイルのみrevertする。

## Codex投入プロンプト

```md
Implement only PR-2 from `codex_vercel_cleanup_pr1_to_pr5_spec.md`.

Focus on auth/admin/password/invite server action and route-handler logs.

Remove direct console statements from authentication-sensitive code and ensure raw email or other PII is not written to Vercel Function logs.

Do not perform broad no-console cleanup.
Do not touch UI component warnings.
Do not edit dependency versions or Node version.

After implementation, report changed files, commands run, pass/fail results, and remaining auth-log risks.
```

---

# PR-3: Restore Next.js chunk splitting

## 目的

`next.config.js` の独自webpack `splitChunks` 設定によって、全 `node_modules` が巨大な単一 `vendors` チャンクへ固定される問題を解消する。

Vercelログ上では過去に `First Load JS shared by all` が約929kB、`vendors` チャンクが約925kB級だったため、Next.jsデフォルトのチャンク分割へ戻す。

## Scope

実装すること。

1. `next.config.js` の client production向け `optimization.splitChunks` カスタム設定を削除する。
2. `webpack` プロパティがsplitChunks以外をしていない場合、webpack blockごと削除する。
3. `output: 'standalone'` は維持する。
4. Sentry設定は維持する。
5. headers/security設定は維持する。
6. build後のroute tableを確認し、Before/After比較用の数値を記録する。

## Out of scope

- `recharts` dynamic import化
- Sentry bundle tuning
- React Query構成変更
- UIコード変更
- Node変更
- 依存更新

## 推奨実行コマンド

```bash
grep -n "splitChunks\|vendors\|cacheGroups\|webpack" next.config.js

npm run build
```

build logから以下を記録する。

- `First Load JS shared by all`
- `/login`
- `/register`
- `/dashboard`
- `/reservations`
- `/revenue`
- `vendors-*.js` が925kB級で残っているか

## Acceptance criteria

- `next.config.js` から巨大vendors固定の `splitChunks` 設定が消えている。
- `npm run build` が通る。
- `First Load JS shared by all` が大幅に下がっていることを確認する。
- ただし `300kB以下` はハードゲートではなく目標値とする。
- 主要画面のルートtableがbuild logに残っている。
- Sentry / standalone / headers設定を壊していない。

## Rollback

- `next.config.js` をrevertする。

## Codex投入プロンプト

```md
Implement only PR-3 from `codex_vercel_cleanup_pr1_to_pr5_spec.md`.

Remove the custom webpack splitChunks configuration that forces all node_modules into a single vendors chunk.

Do not change dependencies.
Do not change Node version.
Do not tune recharts or Sentry in this PR.
Do not edit unrelated config.

After implementation, run build and report First Load JS shared by all plus key route sizes if present in the build output.
```

---

# PR-4: Pin Node runtime

## 目的

`package.json` の `engines.node: >=20.19.0` によるVercel自動メジャーアップグレード警告を解消し、local / Docker / CI / VercelのNode runtimeを統一する。

## 方針

### 第一候補

Node **24.x** へ統一。

理由。

- Node 20はEOL。
- Vercelの新規プロジェクトdefaultは最新LTS。
- 2026年時点では Node 24.x / 22.x がLTS候補。
- 今後の寿命を考えると24.xの方が長い。

### フォールバック

Node 24.xでSWC/Next/dependency/CI互換問題が出る場合、Node **22.x** へ統一する。

その場合、最終報告に以下を明記する。

- Node 24.xで何が失敗したか
- なぜ22.xへ落としたか
- 22.xでのcheck結果

## Scope

変更対象。

- `package.json`
- `.nvmrc`
- `Dockerfile`
- `Dockerfile.dev`
- `.github/workflows/*.yml`
- その他Node versionを明示している設定ファイル

実装すること。

1. `package.json` enginesを固定する。
   - 第一候補: `"node": "24.x"`
   - npmは既存互換を見て `"npm": ">=10.0.0"` など
2. `.nvmrc` を追加または更新する。
   - 第一候補: `24`
3. Docker imageをNode 24系へ更新する。
   - 例: `node:24-bookworm-slim`
4. GitHub Actionsの `node-version` を24へ更新する。
5. すべてのNode指定が同一majorに揃っていることを確認する。

## Out of scope

- Next更新
- dependency audit fix
- ESLint warning修正
- splitChunks修正
- Dockerfileの大規模最適化
- CI workflow全体の再設計

## 推奨実行コマンド

```bash
grep -R "node-version\|node:" -n .github Dockerfile Dockerfile.dev package.json .nvmrc || true

node -v
npm -v

npm ci
npm run type-check
npm run build
npm test
```

Dockerが使える環境なら。

```bash
docker build -t seikotsuin-saas-node-runtime-check .
```

## Acceptance criteria

- `package.json` の `engines.node` が範囲指定ではなく固定majorになっている。
- `.nvmrc` が存在し、Node majorと一致している。
- Dockerfile / Dockerfile.dev が同じNode majorを使っている。
- CI workflowの `node-version` が同じNode majorを使っている。
- Vercelの自動メジャーアップグレード警告が消える見込みがある。
- `npm run build` が通る。
- Node 24が無理でNode 22へフォールバックした場合、理由と失敗ログ要約が記録されている。

## Rollback

- Node version関連ファイルをrevertする。
- ただしNode 20へ戻す場合はEOLリスクが残るため、暫定rollback扱いとする。

## Codex投入プロンプト

```md
Implement only PR-4 from `codex_vercel_cleanup_pr1_to_pr5_spec.md`.

Pin and unify the Node runtime.

Use Node 24.x as the first candidate.
If Node 24.x fails because of dependency/SWC/Next incompatibility, fall back to Node 22.x and document exactly why.

Update package.json engines, .nvmrc, Dockerfile, Dockerfile.dev, and GitHub Actions node-version references.

Do not update dependencies except if absolutely required for Node runtime compatibility, and document any such change.
Do not edit splitChunks.
Do not perform ESLint cleanup.

Report changed files, commands run, pass/fail results, and the final selected Node major.
```

---

# PR-5: ESLint baseline and Next plugin cleanup

## 目的

Next.js plugin detection warningを解消し、ESLint warning 233件をCIで管理可能にする。  
このPRではwarningを全面解消しない。**ラチェット基盤を作る**。

## Scope

実装すること。

1. `eslint-config-next` をNext本体と同一系列へ更新する。
2. `eslint.config.mjs` をNext.js公式Flat Config形式へ寄せる、または最小修正でplugin detection warningを消す。
3. `lint:ci` scriptを追加する。
4. warningラチェットを導入する。
   - 初期値: `--max-warnings=233`
5. CIのlint jobが `lint:ci` を呼ぶようにする。
6. `npm run lint:check` でwarning件数を確認する。
7. Browserslist/caniuse-liteを更新する。
   - `npx update-browserslist-db@latest`
   - build時自動実行にはしない

## ESLint方針

### 第一候補: 公式Flat Config寄せ

Next.jsの公式Flat Configに近づける。

例。

```js
import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  // existing project-specific config
];
```

ただし既存configが複雑な場合、無理に全面移行しない。

### フォールバック: 最小修正

既存FlatCompat構成を維持し、Next plugin detection warningを消す最小変更を行う。

例。

```diff
- 'plugin:@next/next/core-web-vitals'
+ 'next/core-web-vitals'
```

実際に `npm run build` で警告が消えることを確認する。

## Package scripts例

既存scriptを確認したうえで、以下のようなscriptを追加する。

```json
{
  "scripts": {
    "lint:ci": "eslint --no-error-on-unmatched-pattern \"src/**/*.{js,jsx,ts,tsx}\" --max-warnings=233"
  }
}
```

既存の `lint:check` が同等機能を持つ場合は、重複を避けてもよい。  
ただしCIでwarning上限が効くことが必須。

## Out of scope

- warning 233件の全面修正
- `no-console` 126件の全削除
- a11y warning大量修正
- `any` 型修正
- UI挙動変更
- Node変更
- dependency security update

## 推奨実行コマンド

```bash
npm install -D eslint-config-next@latest
npx update-browserslist-db@latest

npm run lint:check
npm run lint:ci
npm run type-check
npm run build
```

必要なら。

```bash
npx eslint --print-config src/app/layout.tsx > /tmp/eslint-layout-config.json
grep -n "@next/next" /tmp/eslint-layout-config.json || true
```

## Acceptance criteria

- Vercel build logの `The Next.js plugin was not detected` が消える見込みがある。
- `eslint-config-next` と `next` のバージョン系列が不自然にズレていない。
- `lint:ci` が存在する。
- `lint:ci` は `--max-warnings=233` を持つ。
- CIが `npm run lint:ci` を呼ぶ。
- 現時点のwarning数が233以下ならCIが通る。
- 新規warningが増えた場合はCIで検知できる。
- Browserslist warningが消える見込みがある。
- `npm run build` が通る。

## Rollback

- `eslint.config.mjs`
- `package.json`
- `package-lock.json`
- `.github/workflows/*.yml`
- Browserslist/caniuse-lite lockfile差分

上記をrevertする。

## Codex投入プロンプト

```md
Implement only PR-5 from `codex_vercel_cleanup_pr1_to_pr5_spec.md`.

Resolve the Next.js ESLint plugin detection warning and introduce ESLint warning ratcheting.

Do not fix all 233 warnings.
Do not remove all console statements.
Do not change Node runtime.
Do not edit next.config.js splitChunks.
Do not perform broad refactors.

Tasks:
- align eslint-config-next with Next
- update eslint config so Next plugin is detected
- add lint:ci with --max-warnings=233
- update CI lint job to use lint:ci
- update Browserslist/caniuse-lite data
- run lint/build/type-check

Report changed files, commands run, pass/fail results, current warning count, and any remaining ESLint risks.
```

---

## 3. PR-1〜PR-5完了後の期待状態

| Warning | 期待状態 |
| --- | --- |
| `@supabase/auth-helpers-*` deprecated | 消える |
| `uuid@10` deprecated | 可能なら消える。残る場合は経路と理由を記録 |
| `engines.node >=20.19.0` warning | PR-4後に消える |
| `Next.js plugin was not detected` | PR-5後に消える |
| Browserslist old caniuse-lite | PR-5後に消える |
| 巨大vendors chunk | PR-3後に改善 |
| ESLint warning 233件 | PR-5時点では残ってよい。ただしCIで増加を防ぐ |
| 認証系PIIログ | PR-2後に除去 |

---

## 4. PR-5後に残すべき課題

PR-1〜PR-5では、以下はあえて残す。

| 次PR | 内容 |
| ---: | --- |
| PR-6 | 残り `no-console` 一括削減。ただしdebug用途・server/clientで方針分離 |
| PR-7 | `jsx-a11y` フォームlabel・click handler修正 |
| PR-8 | `unused-vars` 整理 |
| PR-9 | `no-explicit-any` / hooks warning修正 |
| PR-10 | Jest 30などdev dependency deprecation根本対応 |
| PR-11 | recharts dynamic import / Sentry bundle tuning |

---

## 5. 最後の注意

この仕様書はCodexへ「全部やって」と投げるためのものではない。  
必ず以下のようにPR番号を指定して投入する。

```md
Implement only PR-1 from `codex_vercel_cleanup_pr1_to_pr5_spec.md`.
```

1PRずつmergeまたはreviewし、Vercel preview/build resultを確認してから次へ進む。  
複数PRを同時に走らせると、dependency / Node / build / lintの失敗原因が追跡不能になる。
