# Vercel デプロイログ警告 解消仕様書 v1.0

| 項目 | 内容 |
| --- | --- |
| 作成日 | 2026-06-11 |
| ステータス | Draft |
| 対象 | Vercel 本番デプロイビルドログ（`main` @ `7b30217`、リージョン iad1） |
| 前提 | ビルド・デプロイ自体は**成功**している。本書はログに出力された警告・潜在問題の解消を目的とする |
| 関連 | `docs/lint-warning-fix-canvas-v1.md` / `docs/eslint_lint_fix_plan_v0.1.md` / `docs/SETUP_VERCEL_SUPABASE.md` |

---

## 1. ログ分析サマリ

| ログ箇所（時刻） | 内容 | 課題ID | 優先度 |
| --- | --- | --- | --- |
| 16:10:51 `10 vulnerabilities (1 low, 6 moderate, 3 high)` | npm 依存に既知脆弱性10件（next 本体の high を含む） | **T1** | **P0** |
| 16:12:22 `First Load JS shared by all 929 kB`（`vendors` チャンク 925kB） | 全ページが約982kBのJSを初回ロード | **T2** | **P1** |
| 16:10:36–37 `npm warn deprecated @supabase/auth-helpers-*` | 非推奨パッケージが依存に残存（コードでは未使用） | **T3** | P1 |
| 16:10:28 `Warning: Detected "engines": { "node": ">=20.19.0" }` | Node メジャーバージョンが自動アップグレードされる設定 | **T4** | P1 |
| 16:11:28 `The Next.js plugin was not detected in your ESLint configuration` | ESLint 設定の Next.js プラグイン検出失敗 | **T5** | P2 |
| 16:11:17 `Browserslist: caniuse-lite is 6 months old` | ブラウザ互換データの陳腐化 | **T6** | P2 |
| 16:11:48 ESLint Warning 約230件 | `no-console` / `jsx-a11y` / `no-explicit-any` / `unused-vars` 等 | **T7** | P2（一部P1） |
| 16:10:34–40 `npm warn deprecated`（whatwg-encoding / inflight / glob@7 / domexception / abab / uuid@10） | 推移的依存の非推奨警告 | **T8** | P3 |

---

## 2. 課題別仕様

### T1【P0】依存パッケージ脆弱性 10件の解消

#### 現状・リスク

`npm audit` の結果（全件 `fixAvailable: true` = semver 互換範囲で修正可能であることを確認済み）:

| パッケージ | 深刻度 | 経路 | 内容 | 本システムへの影響 |
| --- | --- | --- | --- | --- |
| **next** (15.5.15) | **High** | 直接依存 | アドバイザリ計13件。Middleware 認可バイパス（GHSA-26hh-7cqf-hhc6 / GHSA-492v-c6pp-mqqv / GHSA-267c-6grr-h53f 等）、CSP nonce 利用時 XSS（GHSA-ffhc-5mcf-pf4q）、RSC キャッシュポイズニング、DoS 等 | **直撃**。本システムは middleware による認証・セッション管理、CSP nonce 運用に依存しており、認可バイパスは医療情報への不正アクセスに直結し得る |
| **@rvf/set-get** | **High** | `zod-form-data` 経由 | HTTP フォームデータ経由で到達可能なプロトタイプ汚染（GHSA-c567-44rc-m5hq） | **直撃**。`zod-form-data` はフォーム検証で本番利用中 |
| **fast-uri** | High | webpack（schema-utils → ajv）経由 | パストラバーサル / ホスト混同 | ビルド時依存。影響は限定的 |
| **uuid** (<11.1.1) | Moderate | `resend` → `svix` 経由 | バッファ境界チェック欠如 | メール送信経路 |
| **postcss** (<8.5.10) | Moderate | next 同梱 | CSS 出力経由 XSS | next 更新で同時解消 |
| **ws** (8.0.0–8.20.0) | Moderate | `@supabase/realtime-js` / jsdom(dev) 経由 | 未初期化メモリ開示 | Realtime 利用経路 |
| **brace-expansion** | Moderate | `@sentry/*` 経由 | DoS（正規表現） | ビルド時依存 |
| **@tootallnate/once** | Low | dev 依存経由 | 制御フロー不備 | テスト環境のみ |

#### 対応

```bash
# 1. next を 15.5.18 以上の最新 15.5.x へ更新（package.json の指定も明示更新）
npm install next@^15.5.18

# 2. resend を最新 6.x へ更新（svix → uuid@10 の脆弱性・非推奨警告を同時解消）
npm install resend@latest

# 3. 残りの推移的依存を一括修正（semver 互換のため --force 不要）
npm audit fix

# 4. 確認
npm audit          # → 0 vulnerabilities を確認
```

- 変更ファイル: `package.json`（next / resend のバージョン指定）、`package-lock.json`
- `eslint-config-next` の更新は T5 で実施

#### 検証

1. `npm audit` で 0 vulnerabilities
2. `npm run type-check` / `npm run build` / `npm test` がグリーン
3. middleware の認可挙動に修正が含まれるため、**Playwright E2E（ログイン → 保護ページ → ログアウト）のスモークを必須**とする
4. CSP nonce 関連の修正が含まれるため、本番相当環境で CSP violation が増えていないこと（`/api/security/csp-report`）

#### リスク

- パッチバージョン更新だが middleware / キャッシュ挙動の修正を含む。E2E スモークで担保し、問題時は lockfile を revert

---

### T2【P1】全ページ共有 925kB バンドルの解消

#### 現状・原因

ビルドログで全ルートの First Load JS が約 982kB、共有チャンクが 929kB（うち `chunks/vendors-*.js` が 925kB）。

原因は `next.config.js` の webpack カスタム設定。**全 node_modules を単一の `vendors` チャンクに固定**しているため、Next.js デフォルトの粒度別チャンク分割（framework / 利用ページ単位のライブラリ分割）が無効化され、`recharts`・`@sentry/nextjs`・`@tanstack/react-query` 等がログインページを含む全ページで読み込まれている。

```js
// next.config.js（現状・削除対象）
webpack: (config, { dev, isServer }) => {
  if (!dev && !isServer) {
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: { test: /[\\/]node_modules[\\/]/, name: 'vendors', ... },
        common: { ... },
      },
    };
  }
  return config;
},
```

#### 対応

1. `next.config.js` から上記 `webpack` プロパティを**ブロックごと削除**し、Next.js デフォルトのチャンク分割に戻す（このブロックは splitChunks 設定以外を行っていないため全削除でよい）
2. `output: 'standalone'`・Sentry 連携・ヘッダー設定は変更しない

#### 検証

1. `npm run build` のルートテーブルで以下を記録し PR に貼付:
   - `First Load JS shared by all` の値（**目安: 300kB 以下**。確定値は計測で確認）
   - 925kB 級の単一 vendors チャンクが消えていること
   - `/login` `/register` 等の軽量ページの First Load JS が大幅減していること
2. 主要ページ（/login, /dashboard, /reservations, /revenue）の表示・操作確認
3. Docker（standalone）ビルドが従来どおり成功すること

#### リスク・備考

- チャンク数は増えるが HTTP/2 配信の Vercel では問題にならない
- さらなる削減（recharts の dynamic import 化、Sentry の tree-shaking 設定）は効果計測後の任意フォローアップとし、本仕様のスコープ外

---

### T3【P1】非推奨 `@supabase/auth-helpers-nextjs` の削除

#### 現状

- `package.json` の dependencies に `@supabase/auth-helpers-nextjs@^0.10.0` が残存し、インストール時に非推奨警告（`auth-helpers-nextjs` / `auth-helpers-shared` の2件）が出力される
- **`src/` 内に import は 0 件**（リポジトリ全文 grep で確認済み。言及はドキュメントのみ）。実装は `@supabase/ssr` へ移行完了している

#### 対応

```bash
npm uninstall @supabase/auth-helpers-nextjs
```

#### 検証

- `npm run build` / `npm test` がグリーン
- 次回デプロイログに `npm warn deprecated @supabase/auth-helpers-*` が出ないこと

---

### T4【P1】Node.js バージョンの固定と統一

#### 現状・リスク

- `package.json` の `engines` が `"node": ">=20.19.0"`（範囲指定）のため、Vercel が新しいメジャー版リリース時に**自動アップグレード**する旨の警告が出ている。意図しないタイミングでのランタイム変更はビルド・実行差異の事故要因
- 環境間の不整合: Dockerfile は `node:20-bookworm-slim`、CI は `node-version: 20`、`.nvmrc` なし
- **Node.js 20 は 2026-04-30 に EOL 済み**（本書作成時点で既にサポート終了）

#### 対応

Node 22（LTS、EOL 2027-04）へ統一する。

| ファイル | 変更 |
| --- | --- |
| `package.json` | `"engines": { "node": "22.x", "npm": ">=10.0.0" }` |
| `Dockerfile` / `Dockerfile.dev` | `FROM node:20-bookworm-slim` → `FROM node:22-bookworm-slim`（全ステージ） |
| `.github/workflows/*.yml` | `node-version: 20` → `node-version: 22` |
| `.nvmrc`（新規） | `22` |

#### 検証

1. CI（Node 22）で `npm ci` / `npm run build` / `npm test` がグリーン
2. `scripts/check-swc-binary.mjs`（prebuild）が Node 22 で正常動作すること
3. Docker イメージのビルド・起動確認
4. 次回デプロイログで engines 警告が消えていること（Vercel は `22.x` 指定を尊重）

#### リスク

- ネイティブ依存はほぼないが、SWC バイナリ検証スクリプトがあるため CI での確認を必須とする

---

### T5【P2】ESLint「Next.js plugin was not detected」警告の解消

#### 現状・原因

- `eslint.config.mjs` は FlatCompat 経由で `'plugin:@next/next/core-web-vitals'` を直接 extends しており、Next.js の検出ロジック（`eslint-config-next` の `next/core-web-vitals` を期待）に認識されない
- さらに `eslint-config-next` が `15.1.6` で、next 本体（15.5.x）とバージョン不整合

#### 対応

1. `eslint-config-next` を next と同一系列へ更新:

   ```bash
   npm install -D eslint-config-next@^15.5.18   # T1 で更新した next と同一バージョン系列
   ```

2. `eslint.config.mjs` の extends を公式移行ガイドの形式に変更:

   ```diff
     extends: [
   -   'plugin:@next/next/core-web-vitals',
   +   'next/core-web-vitals',
       'plugin:@typescript-eslint/recommended',
       ...
     ],
   ```

   ※ `next/core-web-vitals` は react / react-hooks / jsx-a11y のルールも内包するが、既存の明示 extends・個別ルール設定は現行挙動の維持のためそのまま残す（後勝ちマージで現行ルール値が優先される）

#### 検証

1. `npm run lint:check` を実行し、**エラーが 0 件のまま**であること（警告件数の増減は記録）
2. `npx eslint --print-config src/app/layout.tsx` に `@next/next/*` ルールが含まれること
3. `npm run build` で当該警告が消えていること

#### リスク

- `eslint-config-next` 更新により新規ルールで警告が増える可能性 → `lint:check` の差分で確認し、増分は T7 のラチェット値に反映

---

### T6【P2】Browserslist（caniuse-lite）データ更新

#### 現状

`caniuse-lite` が6ヶ月古い旨の警告。ビルド失敗には繋がらないが、CSS prefix 等の互換判定が古くなる。

#### 対応

```bash
npx update-browserslist-db@latest   # package-lock.json の caniuse-lite を更新
```

- ビルド時の自動実行（prebuild への組込み）は**行わない**（ビルドの外部ネットワーク依存を増やすため）。月次の依存更新運用に含めて定期実行する

#### 検証

- 次回デプロイログで Browserslist 警告が消えていること

---

### T7【P2・一部P1】ESLint 警告 約230件の段階的解消

#### 現状

ビルドログ集計（概算）:

| ルール | 件数（概算） | 主な発生箇所 |
| --- | --- | --- |
| `no-console` | 約120 | server actions（login/invite/admin 等）、hooks、components |
| `jsx-a11y/label-has-associated-control` | 35 | AppointmentForm / AppointmentEditForm / booking / login 等のフォーム |
| `unused-imports/no-unused-vars` | 約30 | 全域 |
| `@typescript-eslint/no-explicit-any` | 24 | `src/api/` / server actions / `src/types/` |
| `jsx-a11y/click-events-have-key-events` + `no-static-element-interactions` | 12（6箇所×2） | blocks / data-table / モーダル類 |
| `jsx-a11y/aria-role` ほか | 8 | design-system-showcase / alert 系 |
| `react-hooks/exhaustive-deps` | 2 | reservations/page、useMasterData |

注意: ローカルの `npm run lint` は `--quiet` のため警告が**見えない**。Vercel ビルド（`next build` 内の lint）でのみ全件表示されるのが、ログが警告で埋まる直接原因。開発時の確認は `npm run lint:check` を使用すること。

#### 対応方針（パターン別・段階実施）

ファイル単位の詳細な修正手順は既存の **`docs/lint-warning-fix-canvas-v1.md`** に従う。本仕様では優先順位と再発防止のみ定める。

- **Phase A（P1・セキュリティ性格）**: server actions / route handler の `no-console` を既存の統一ロガー **`src/lib/logger.ts`** へ置換する。
  対象: `src/app/(public)/login/actions.ts`、`invite/actions.ts`、`admin/actions.ts`、`admin/callback/route.ts`、`forgot-password/actions.ts`、`register/actions.ts`、`reset-password/actions.ts`
  理由: 認証フローの console 出力はメールアドレス等の個人情報が **Vercel Function ログに永続化**されるリスクがあり、医療系システムとして優先解消する
- **Phase B**: `jsx-a11y` 系（フォームの `htmlFor`/`id` 関連付け、クリック要素の button 化 or `role`+キーボードハンドラ付与）。canvas v1 の推奨順（AppointmentEditForm → AppointmentForm → booking）に従う
- **Phase C**: `unused-vars`（`_` prefix 付与 or 削除）、`no-explicit-any`（型付け）、`exhaustive-deps`（依存配列修正）

- **再発防止（ラチェット方式)**: CI の lint ジョブを `--max-warnings=<現在値>` 付きで実行し、Phase 完了ごとに上限値を引き下げる。新規警告の追加をブロックしつつ段階削減する

  ```jsonc
  // package.json scripts（例）
  "lint:ci": "eslint --no-error-on-unmatched-pattern \"src/**/*.{js,jsx,ts,tsx}\" --max-warnings=233"
  ```

#### 検証

- 各 Phase 完了時に `npm run lint:check` の警告件数を記録し、ラチェット値を更新
- Phase A 完了後、本番ログ（Vercel Functions）に認証系の console 出力が残らないこと

---

### T8【P3】開発依存由来の deprecation 警告 — 対応不要（明記）

`whatwg-encoding@2` / `domexception@4` / `abab@2` / `inflight@1` / `glob@7` は **jest@29 / jest-environment-jsdom（devDependencies）由来の推移的依存**であり、本番ランタイムに含まれない。jest 30 系へのメジャー更新時に自然解消されるため、本仕様では対応しない（uuid@10 のみ T1 の resend 更新で解消される）。

---

## 3. 推奨作業順序と PR 分割

| 順 | PR | 内容 | 課題 |
| --- | --- | --- | --- |
| 1 | PR-1 | 依存更新（next / resend / audit fix / auth-helpers 削除） | T1 + T3 |
| 2 | PR-2 | `next.config.js` の splitChunks 撤去 | T2 |
| 3 | PR-3 | Node 22 統一（engines / Dockerfile / CI / .nvmrc） | T4 |
| 4 | PR-4 | ESLint 設定移行 + eslint-config-next 更新 + browserslist 更新 + lint ラチェット導入 | T5 + T6 + T7(基盤) |
| 5 | PR-5〜 | lint 警告解消 Phase A → B → C（canvas v1 準拠） | T7 |

各 PR は独立して revert 可能な粒度とする。PR-1 と PR-2 は次回デプロイまでに完了させること（セキュリティ・性能への実影響があるため）。

## 4. 受け入れ基準（次回デプロイログでの確認項目）

1. `npm audit`: **0 vulnerabilities**
2. デプロイログに以下が**出力されない**こと:
   - `npm warn deprecated @supabase/auth-helpers-*` / `uuid@10`
   - `Warning: Detected "engines" ... will automatically upgrade`
   - `Browserslist: ... is 6 months old`
   - `The Next.js plugin was not detected`
3. ルートテーブルで 925kB 級の単一 vendors チャンクが存在せず、`First Load JS shared by all` が大幅減（数値を PR に記録、目安 300kB 以下）
4. ESLint 警告件数がラチェット上限以下（Phase 進行に応じ削減）
5. `npm run build` / `npm run type-check` / `npm test` / E2E スモークがグリーン

## 5. ロールバック

- 各 PR 単位で revert 可能
- T1: `package.json` + `package-lock.json` の revert（脆弱性は残るため再対応必須とする）
- T2: webpack ブロック復元で旧チャンク構成に戻る
- T4: イメージ・CI のバージョン指定戻しのみ

## 6. スコープ外（任意フォローアップ）

- recharts 利用画面の dynamic import 化、`@sentry/nextjs` のバンドル削減チューニング（T2 の計測結果を見て判断）
- jest 30 への更新（T8 の根本解消)
- `npm run lint` の `--quiet` 運用見直し
