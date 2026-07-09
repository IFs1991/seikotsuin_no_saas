# refactor-instructions.md — 整骨院管理SaaS リファクタリング指示書 v1.0

- 作成日: 2026-06-10
- 対象リポジトリ: IFs1991/seikotsuin_no_saas
- 対象コミット時点: `679960f` (Merge pull request #24)
- 本書の位置づけ: 実装担当モデルへの作業指示書。本書に書かれていない大規模な削除・書き換え・挙動変更は行わないこと。

---

## 1. Objective

既存仕様・既存挙動を一切壊さずに、以下を達成する。

1. リポジトリから生成物・ゴミファイルを除去し、リポジトリ衛生を回復する
2. 参照ゼロが検証済みの死コードを安全に削除する
3. 重複した型定義・エラークラスを統一し、契約の曖昧さを減らす
4. 局所的な型安全性の穴（`any` ホットスポット）を塞ぐ
5. 大きな設計変更（巨大ルート分割・strict化・サービス層統合など）は実装せず、提案書としてまとめる

**目的は「綺麗にすること」ではない。既存仕様を壊さず、負債を減らし、今後変更しやすい状態にすることである。**

---

## 2. Project Understanding

### 2.1 プロダクト概要

整骨院・治療院グループ（最大46店舗想定）向けのマルチテナント業務管理SaaS。予約、患者、日報、収益分析、スタッフ管理、管理者設定、セキュリティ監視を1つのNext.jsアプリで提供する。現在は **pilot フェーズ**（`package.json` の version: `0.1.0-pilot`）で、開発方針は新機能追加より **安定化**（`docs/stabilization/DoD-v0.1.md` 準拠）。

### 2.2 技術スタック

- Next.js 15 (App Router) + React 19 + TypeScript 5.9.3（lockfile固定。`tsconfig.json` は `strict: false`）
- Supabase (PostgreSQL + RLS + Auth)。`supabase/migrations/` がスキーマの正本（squashed baseline + 30本の増分）
- TanStack Query / React Hook Form / Zod / Zustand
- Upstash Redis（レート制限）、Resend（メール）、Sentry、Gemini AI
- Jest（241スイート / 1833テスト）+ Playwright（14 spec、CI対象外）

### 2.3 アーキテクチャの要点（変更時に必ず意識すること）

- **テナント分離が最重要関心事**。JWT claims（`user_role`, `clinic_id`, `clinic_scope_ids`）+ RLSポリシー + アプリ層ガードの多層防御。
- 認可の主経路: `middleware.ts`（ルート保護・CSP・レート制限）→ 各APIルートの `processApiRequest` / `ensureClinicAccess`（`src/lib/supabase/guards.ts`）→ RLS。
- Supabaseクライアントは3系統:
  - `src/lib/supabase/server.ts` — `createClient()`（認証ユーザー・cookie・RLS有効）と `createAdminClient()`（service role・RLSバイパス）
  - `src/lib/supabase/client.ts` — ブラウザ用 `createClient()`（server.tsと同名。要注意）
  - `src/lib/supabase/scoped-admin.ts` — service role + アプリ層スコープ検証（`createScopedAdminContext` / `createPublicClinicContext`）
- service role を使うルート（`/api/admin/users/*`, `/api/admin/tenants/*` 等）では **クリニックスコープがRLSではなくアプリコードで強制されている**。この境界のコードは1文字の変更でもテナント分離を壊しうる。
- `manager` ロールは `manager_clinic_assignments` テーブル由来の別経路でスコープ解決される（`src/lib/auth/manager-scope.ts`）。直近のPR (#19〜#24) はこの領域の作業であり、活発に変更されている。
- ロール互換マッピング `clinic_manager` → `clinic_admin` が `normalizeRole`（`src/lib/constants/roles.ts`）に存在する。spec: `docs/stabilization/spec-auth-role-alignment-v0.1.md`。
- APIルートは99本。約95%は `createSuccessResponse` / `createErrorResponse`（`src/lib/api-helpers.ts`）のエンベロープ `{ success, data | error }` を使う。
- エラー処理の正本は `src/lib/error-handler.ts`（`AppError`, `ERROR_CODES`, `handleRouteError` は `src/lib/route-helpers.ts`）。
- `src/legacy/Reservation/`（26ファイル）は完全隔離済み（本番参照0、tsconfig exclude、`R02-legacy-reservation-isolation.test.ts` が隔離を守っている）。**触らない**。
- `src/database/`, `src/api/database/` は参照専用。スキーマ正本は `supabase/migrations/`。
- 安定化のための「ガードテスト」文化がある: `src/__tests__/stabilization/R0x-*.test.ts` は「廃止済みモジュールへの参照が0件であること」等をgrepで検証する。リファクタ時はこれらのテストの意図に沿うこと。

### 2.4 ガバナンス文書（必読・遵守）

- `AGENTS.md` — 本プロジェクトの憲法。型規律（`any`禁止・`@ts-ignore`禁止）、RLS/認可を弱めない、1 task = 1 PR、破壊的操作は承認必須、fail-closed原則。
- `docs/stabilization/DoD-v0.1.md` — 安定化の完了定義（12項目）。
- `docs/セキュリティ改修仕様書_2026-06_v1.0.md` — **2026-06-09に追加されたばかりの未実装セキュリティ改修計画（SEC-01〜SEC-12）**。middleware.ts のCSP、レート制限、MFA強制、依存更新などを対象とする。**本リファクタリングはこの仕様書の対象ファイル・対象事項と衝突してはならない**（後述の Out-of-scope 参照）。

---

## 3. Behaviors To Preserve（絶対に壊してはいけない既存挙動）

1. **テナント分離**: 全APIで、ユーザーは自分の `clinic_scope_ids`（なければ `clinic_id`）の範囲外のデータへ読み書きできない。`manager` は `manager_clinic_assignments` 由来のスコープのみ。
2. **認証リダイレクト分岐**: 未認証アクセスは `/admin/**` → `/admin/login`、その他保護ルート → `/login`（`redirectTo` クエリ付き）。`middleware.ts` の `PROTECTED_ROUTE_PREFIXES` / Pilot mode ブロック（`PILOT_BLOCKED_ROUTE_PREFIXES`）の挙動。
3. **APIレスポンス契約**: 既存ルートのJSONレスポンスの形（キー名・ネスト・ステータスコード）。特に:
   - `/api/public/menus`, `/api/public/reservations` は**未認証の外部公開API**。レスポンス形・受け入れる入力を一切変えない。
   - `/api/webhooks/resend`, `/api/internal/process-email-outbox`, `/api/security/csp-report`, `/api/health` は外部サービス/運用が直接叩く契約。変えない。
4. **ロール互換マッピング**: `clinic_manager` → `clinic_admin` の正規化（`normalizeRole`）と、各ルートの `allowedRoles` / `deniedRoles` 判定結果。
5. **エラー時のHTTPステータス**: 認可失敗 401/403、バリデーション 400、スコープ外 403 等の現状のステータスコード。
6. **メール送信導線**: 予約作成/変更/取消 → `email_queue` への enqueue → `process-email-outbox` での送信、の流れと重複排除（`src/lib/notifications/email/dedupe.ts`）。
7. **環境変数の起動時検証**（`src/lib/env.ts`）: 必須4変数欠如時に test 以外で例外。
8. **DBスキーマ・RLSポリシー・JWT claims 構造**: 一切変更しない（migrationは本書のスコープ外）。
9. **CI が green であること**: lint / type-check / scan:secrets / build / supabase.ts ヘッダ検証 / fixture preflight / PR-05 focused 9スイート（`.github/workflows/ci.yml`）。
10. **ベースラインで pass している 1828 個のJestテスト**（§6参照。既知の失敗3件を除く）。

---

## 4. Non-Negotiables（絶対規則）

作業全体を通じて以下を厳守する。

1. **最初に `git status` を確認する**。未コミットの変更が存在する場合、自分の変更と混ぜない（既存変更がある場合はその場で停止し報告する）。
2. **編集前にベースラインの検証結果を記録する**（§6のコマンドを全て実行し、結果をそのまま控える）。
3. **変更は小さく、戻しやすい単位にする**。1フェーズ=1コミット以上。論理的に独立した変更は別コミット。フェーズをまたぐ変更を1コミットに混ぜない。
4. **無関係な整形・ついでのリファクタリングをしない**。Prettierの差分が出るのは自分が編集した行の範囲のみ。
5. **既存挙動を勝手に変えない**。「明らかにバグに見える」場合も §5 に従い停止して質問する。
6. **`any` / `as any` / `@ts-ignore` を新規に導入しない**（`AGENTS.md` 準拠）。既存の `any` の置換は、本書で明示されたホットスポット（D-09）のみ。
7. **RLS・認可・テナント分離・clinic スコープのロジックを弱めない**。テストを通すために認可を緩める変更は禁止。
8. **migration ファイル（`supabase/migrations/`）、`supabase/config.toml`、RLSポリシーを変更しない**。
9. **`src/types/supabase.ts`（自動生成）を手で編集しない**。
10. **npm を使う**。他のパッケージマネージャ・lockfile を導入しない。依存の追加・更新・削除をしない（SEC-01 の担当範囲のため）。
11. **各フェーズ完了ごとに §9 の検証を実行する**。検証せずに次のフェーズへ進まない。
12. **最後に、実行した全コマンドと結果を §10 の形式で報告する**。実行していない検証を「実行した」と報告しない。
13. ファイル削除は本書 §8 で明示的に列挙されたファイルのみ。**列挙されていないファイルの削除・リネーム・移動は禁止**。
14. テストの期待値を実装に合わせて書き換えない。テスト変更が必要なのは「廃止ファイル削除に伴うガードテストの更新」（本書で明示した箇所）のみ。

---

## 5. Stop And Ask Conditions（実装を止めて質問する条件）

以下のいずれかに該当したら、**作業を止めて人間に質問する**。推測で進めない。

1. ベースライン検証の結果が §6 に記録された結果と異なる（既知の3失敗以外のテストが落ちる、lint/type-check/buildが落ちる等）。
2. 削除対象ファイルに、本書の検証時点（2026-06-10）には存在しなかった**新しい参照**が見つかった。
3. 変更しようとしているファイルが `docs/セキュリティ改修仕様書_2026-06_v1.0.md`（SEC-01〜SEC-12）の改修対象と重なることに気づいた（例: `middleware.ts`, `src/lib/security/csp-config.ts`, `src/lib/rate-limiting/*`, MFA関連, `/api/chat`, package.json の依存）。
4. 型統一の過程で、**実行時の挙動（レスポンス形・ステータスコード・分岐）が変わる**ことが避けられないと判明した。
5. `ScopeAccessError` 統一（D-05）で、現状 500 を返している経路が 403 に変わる等、**エラー経路の挙動差**が発生することが判明した（これはバグ修正の可能性が高いが、挙動変更なので承認が必要）。
6. テストと実装が矛盾しており、どちらが正しいか仕様から判断できない（既知の3失敗テストを含む。§6.3参照）。
7. 公開API（`/api/public/*`）、webhook、DBスキーマ、保存済みデータ、認証、課金、通知、外部連携に影響する可能性に気づいた。
8. 本書に列挙されていない大きな負債を発見し、修正したくなった（→ 修正せず、最終報告の「発見事項」に記載する）。
9. コンフリクトや rebase が必要になった。

質問するときは、対象ファイルパス・該当行・矛盾の内容・選択肢と推奨案を添えること。

---

## 6. Baseline Commands（検証コマンドと 2026-06-10 時点の実測結果）

### 6.1 環境前提

- Node >= 20.19.0 / npm >= 10（`package.json` engines）
- 依存インストール: `npm ci`（lockfile厳守。TypeScript は 5.9.3 に固定される）
- **注意**: 依存未インストール状態で `npx tsc` を実行すると最新の TypeScript 6.x が取得され、`tsconfig.json` の `baseUrl` 非推奨エラー (TS5101) で**偽の失敗**になる。必ず `npm ci` 後にプロジェクトローカルの tsc を使うこと。

### 6.2 ベースライン結果（このコミット時点・クリーンツリーでの実測）

| コマンド | 結果 |
|---|---|
| `npm ci` | 成功 |
| `npm run type-check` | **PASS**（エラー0） |
| `npm run lint` | **PASS**（`--quiet`、エラー0） |
| `npm run test:pr05:focused` | **PASS**（9スイート / 129テスト） |
| `npm run test -- --ci --testPathIgnorePatterns=e2e` | **2スイート / 3テスト FAIL**（既知。下記6.3）。241スイート中239 pass、1833テスト中1828 pass / 2 skip |
| `npm run build` | **PASS**（placeholder環境変数で実行。下記6.4） |

### 6.3 既知のベースライン失敗テスト（リファクタ前から落ちている）

1. `src/__tests__/api/menu-templates-route.test.ts` — `POST /api/menu-templates/import › imports a parent template into the selected child clinic menu list`（201期待が不一致）
2. `src/__tests__/integration/api-staging-data.test.ts` — `returns dashboard data aggregated from Supabase views`（revenue 147000 期待に対し 0）
3. `src/__tests__/integration/api-staging-data.test.ts` — `returns patient analysis data with LTV and risk scores`

- タイムゾーン起因ではない（`TZ=Asia/Tokyo` でも失敗することを確認済み）。
- CI は focused 9スイートしかゲートにしていないため、CI上は検出されない。
- **指示**: この3件は修正しない・隠さない・スキップにしない。Phase 0 で同じ3件が落ちることを確認・記録し、以降の全フェーズで「失敗がこの3件のまま増えていない」ことを合格条件とする。原因調査の結果（実装が悪いのか期待値が古いのか）は最終報告に書くこと。修正の実施は人間の判断待ち（§5-6）。

### 6.4 build 用環境変数（CI と同等の placeholder）

```bash
NEXT_PUBLIC_SUPABASE_URL='https://placeholder.supabase.co' \
NEXT_PUBLIC_SUPABASE_ANON_KEY='placeholder-anon-key' \
NEXT_PUBLIC_APP_URL='http://localhost:3000' \
SUPABASE_SERVICE_ROLE_KEY='placeholder-service-key' \
npm run build
```

### 6.5 ローカルSupabase / Playwright

本リファクタリングの検証には**不要**（Jest はSupabaseを全面モックする）。`supabase db reset` 等の破壊的コマンドは実行しない（`AGENTS.md` Approval Required）。

---

## 7. Debt Map（負債マップ）

各項目: 根拠 / なぜ負債か / 影響範囲 / 変更リスク / 改善案 / 検証方法 / **実装可否**。

---

### D-01: 生成物・一時ファイルが git 追跡されている 【実装してよい / Phase 1】

- **根拠**: `git ls-files` で確認済み。`jest-output.json` (2.5MB), `eslint-output.json` (2.0MB), `eslint-out.json` (1.39MB), `eslint-report.json` (1.38MB), `jest-windows.json` (1.41MB), `build-errors.txt` (1.24MB), `build_errors.txt`, `ts-errors.json`, `ts-errors.txt`, `ts-errors-check.txt`, `ts-errors-current.txt`, `ts-errors-final.txt`, `tsc-errors.txt`, `tmpclaude-{2d41,4720,4b9d,6a1d,6b03,ce8d}-cwd`（6個）, `playwright-report/index.html` (521KB), `test-results/`, `.kamui/`（ツール状態ファイル群）。
- **なぜ負債か**: 合計約10MBの生成ログがリポジトリを肥大化させ、diff・clone・検索を汚染する。`tmpclaude-*` はAIセッションの一時ファイル。`jest-windows.json` は `scripts/jest-windows-md.mjs` が実行時に生成・削除する一時成果物（同スクリプト内で `unlinkSync` まで行う）であり、追跡する意味がない。
- **影響範囲**: リポジトリのみ。実行時コードからの読み込みは `scripts/jest-windows-md.mjs` の `jest-windows.json` のみで、これは実行時に再生成されるため untrack して問題ない。
- **変更リスク**: 極小。
- **改善案**: `git rm --cached`（作業ツリーからは削除しない場合）または `git rm`（削除する場合は生成ログ・tmpファイルのみ）+ `.gitignore` にパターン追加（`jest-output.json`, `jest-windows.json`, `jest-windows.md`, `eslint-out*.json`, `eslint-report.json`, `build-errors.txt`, `build_errors.txt`, `ts-errors*`, `tsc-errors.txt`, `tmpclaude-*`, `playwright-report/`, `test-results/`, `.kamui/`）。git履歴の書き換え（filter-branch等）は**しない**。
- **検証方法**: `git status` クリーン → §9 フル検証 → `npm run test:windows:md` がエラーなく動く（任意）。
- **注意**: ルート直下の手書きドキュメント（`PHASE*_REPORT.md`, `Tiramisu2.md`, `管理者改善.md` 等、約60ファイル）はこの項目に**含めない**。それらの移動・削除は人間の判断待ち（§11 質問3）。

### D-02: ベースラインで失敗する3テスト 【調査・報告のみ。修正禁止】

- **根拠**: §6.3。クリーンツリーで再現確認済み。
- **なぜ負債か**: 「全テストgreen」という前提が既に崩れており、リファクタの回帰検出能力を下げる。CIのfocusedゲートが検出できない盲点でもある。
- **影響範囲**: menu-templates のインポートAPI、dashboard/患者分析の集計API。
- **変更リスク**: 期待値修正か実装修正かをコードだけから断定できない（仕様の真実が不明）。
- **改善案**: Phase 0 で原因を調査し「実装・テスト・モックのどれが古いか」の所見を最終報告に記載。修正は承認後の別タスク。
- **実装可否**: **修正は提案のみ**。

### D-03: 参照ゼロの死コード 【検証付きで実装してよい / Phase 2】

- **根拠**（2026-06-10 に grep で参照0件を確認済み。削除直前に必ず再検証すること）:
  - `src/lib/middleware-optimizer.ts`（269行）— 参照0
  - `src/hooks/useQualityAssurance.ts`（219行）— 参照0。かつ、このフックだけが `src/lib/integration-tests.ts`（268行）, `src/lib/accessibility-test.ts`（268行）, `src/lib/performance.ts`（187行）の唯一の利用者 → 計約940行の死コード島
  - `src/lib/supabase-browser.ts`（22行・@deprecated）— 本番参照0。テスト3本（`src/__tests__/types/supabase-client-typing.test.ts` が **fs.readFileSync でファイル自体を読む**、`R03-supabase-client-unification.test.ts` / `R08-unused-code-cleanup.test.ts` は「参照0件」をgrepで検証）のみが言及
  - `src/api/database/supabase-client.ts` — 本番参照0（参照専用と過去分析でも認定済み）
  - `src/lib/feature-flags.ts`（5行）— 参照0。**ただし削除は保留**: `docs/refactoring-analysis-2026-03-16.md` §2.1 が「P2-05 フィーチャーフラグ基盤整備まで保留」と明記（§11 質問4の回答待ち）
- **なぜ負債か**: 読む者を惑わせ、grep結果を汚し、「使われているかもしれない」という調査コストを発生させ続ける。
- **影響範囲**: 削除対象ファイル + 上記ガードテスト。
- **変更リスク**: 小。ただし `supabase-browser.ts` 削除時は `supabase-client-typing.test.ts` の該当2テスト（ファイルを直接読む）の削除/更新が必須。R03/R08 は「参照0」をアサートしているため削除後も pass する（コメントの「廃止後」が削除方針を裏付けている)。
- **注意**: `src/lib/admin/master-data-deprecation.ts` は一見プレースホルダだが**本番4ファイルから参照されている**（`useSystemSettings.ts`, `useSystemSettingsQuery.ts`, `admin/(protected)/master/page.tsx`, `master-data-client.ts`）。**削除禁止**。
- **改善案**: 上記の参照0確認済みファイルを削除。1ファイル（または死コード島1グループ）ずつコミット。
- **検証方法**: 削除前に各ファイル名・export名で `grep -rn` を再実行し参照0を確認 → 削除 → §9 フル検証（type-check が import 切れを検出する）。
- **実装可否**: `middleware-optimizer.ts`・QA島4ファイル・`src/api/database/supabase-client.ts`・`supabase-browser.ts`（テスト更新込み）は**実装してよい**。`feature-flags.ts` は**質問4の回答があるまで保留**。

### D-04: `ApiResponse<T>` が5箇所で重複定義 【実装してよい / Phase 3】

- **根拠**: `src/types/index.ts:65`、`src/types/api.ts:11`、`src/types/admin.ts:181`、`src/types/security.ts:319`（`T = any`！）、`src/lib/api-helpers.ts:42`（discriminated union。実行時の正本）。
- **なぜ負債か**: 同名で構造が微妙に異なる型が並存し、どれが契約か分からない。`security.ts` 版は `any` デフォルトで型安全性を破壊する。
- **影響範囲**: APIレスポンスを型注釈している全ファイル（ルート・フック・コンポーネント）。
- **変更リスク**: 中。型の置き換えで `type-check` が壊れる可能性はあるが、**実行時挙動はゼロ変更**（型のみ）。
- **改善案**: `src/lib/api-helpers.ts` の `ApiSuccessResponse / ApiErrorResponse / ApiResponse`（discriminated union）を正本とする。`src/types/api.ts` から re-export し、`types/index.ts`・`types/admin.ts`・`types/security.ts` の重複定義を正本への re-export（`export type { ApiResponse } from ...`）に置き換える。**インポート元の書き換えを全ファイルで強行せず、re-export で互換を維持する**（big-bang禁止）。構造が実際に異なり互換にできない箇所が見つかったら §5-4 で停止。
- **検証方法**: §9 フル検証（特に type-check）。
- **実装可否**: **実装してよい**（re-export 方式に限る）。

### D-05: `ScopeAccessError` がクラスとして二重定義 【テスト先行で実装してよい / Phase 4】

- **根拠**: `src/lib/auth/manager-scope.ts:38` と `src/lib/supabase/scoped-admin.ts:33` が**別クラス**として定義し、それぞれ throw している（`manager-scope.ts:189`、`scoped-admin.ts:91`）。catch側はバラバラ: `guards.ts:17` は manager-scope 版を instanceof 判定（:125）、`/api/admin/security/events/route.ts:25` や `/api/admin/notifications/route.ts` は scoped-admin 版を判定。
- **なぜ負債か**: クロスモジュールの `instanceof` は別クラス同士では成立しない。「scoped-admin 版を catch しているハンドラに manager-scope 版が届く」経路ができた瞬間、403 で返すべきものが 500 になる。現状は経路ごとに偶然整合している可能性が高いが、極めて壊れやすい暗黙の前提。
- **影響範囲**: admin系ルートのエラーハンドリング経路（認可拒否時のステータスコード）。
- **変更リスク**: **中〜高（セキュリティ隣接）**。統一によって「今まで500だった経路が403になる」等の挙動差が出る可能性がある。
- **改善案**:
  1. まず現状固定テストを書く: 各 throw 経路（`assertClinicInEffectiveScope` 経由、`assertClinicInScope` 経由）ごとに、代表ルートが返す**現在の**ステータスコードをテストで固定する。
  2. その上で、定義を1箇所（推奨: `src/lib/auth/manager-scope.ts`）に統一し、`scoped-admin.ts` は `export { ScopeAccessError } from '@/lib/auth/manager-scope'` で互換維持。
  3. 手順1のテストが**変化なしで**通ることを確認する。1テストでもステータスコードが変わる場合は §5-5 に従い停止して質問（挙動差の内容を添えて）。
- **検証方法**: 新規テスト + `npm run test -- --ci --testPathPattern="admin|scope|guards"` + §9 フル検証。
- **実装可否**: **上記手順厳守で実装してよい**。挙動差が出たら停止。

### D-06: `src/types/index.ts` の手書き型がDB実態と乖離し、ほぼ死んでいる 【限定的に実装してよい / Phase 3】

- **根拠**: 本番からのimportは2ファイルのみ（`src/components/dashboard/ai-comment-card.tsx`, `src/api/gemini/ai-analysis-service.ts`）。`docs/refactoring-analysis-2026-03-16.md` §3.3 が `Clinic.manager_id`（DBに存在しない）等の乖離を列挙済み。
- **なぜ負債か**: DBと一致しない型が「公式の共通型」の顔をしてルートに置かれており、新規コードが誤って使う。
- **影響範囲**: 上記2ファイル + `types/index.ts` を import しているテスト。
- **変更リスク**: 小〜中。2ファイルが実際に使っている型（`AIComment` 系）だけを移設すればよい。
- **改善案**: 2ファイルが使用する型を特定し、その型定義を利用箇所の近く（または `types/api.ts`）へ移し、`types/index.ts` から**未使用の型定義を削除**する。ファイル自体を消すか空にするかは残存参照次第。`ai-analysis-service.ts` は SEC/DOD-09 関連の移設候補ファイルなので、**型のimport差し替え以上のこと（ロジック変更・ファイル移動）はしない**。
- **検証方法**: §9 フル検証。
- **実装可否**: **実装してよい**（importの差し替えと未使用型の削除に限る）。

### D-07: `src/types/reservation.ts` の camelCase ドメインモデル 【現状維持。提案のみ】

- **根拠**: 本番15ファイルが import。`reservation-service.ts` 等が `mapReservationInsertToRow()` 等のマッパーで snake_case DB行と相互変換している。
- **なぜ負債か/なぜ触らないか**: 過去の分析（2026-03-16 §3.4）は「DB不一致」として再構築を推奨したが、実態は**マッパーを備えた意図的なドメインモデル層**として機能しており、15ファイルから使われている。再構築は広範囲な挙動リスクに対して益が薄い。
- **改善案（提案のみ）**: ドメインモデル＋マッパー方式を正式な方針として文書化するか、`Database` 派生型へ寄せるか — プロダクト判断（§11 質問5）。
- **実装可否**: **実装禁止（提案のみ）**。

### D-08: レスポンスエンベロープの不統一（少数の生 `NextResponse.json` ルート） 【限定的に実装してよい / Phase 6】

- **根拠**: 大半のルートは `createSuccessResponse`/`createErrorResponse` を使うが、`/api/daily-reports/route.ts` 等少数が手書きの `NextResponse.json({ success: true, data })` を返す（探索で確認）。
- **なぜ負債か**: エラー形が `{ error: 'msg' }` だったり details の有無が違ったりして、クライアント側のエラーハンドリングが分岐する。
- **影響範囲**: 該当ルートとそれを呼ぶフック。
- **変更リスク**: 中。**JSONのキー構成が1つでも変わればクライアントが壊れる**。
- **改善案**: 認証必須の**内部ルートのみ**対象。置き換え前に、現在のレスポンスJSONを固定するテストを書き、ヘルパー置き換え後に**バイト等価**（キー・構造・ステータスコード完全一致）であることをテストで証明できる場合のみ実施。等価にできないルートはスキップして報告。
- **対象外**: `/api/public/*`、`/api/webhooks/*`、`/api/internal/*`、`/api/health`（外部契約）。
- **実装可否**: **等価性をテストで証明できる内部ルートのみ実装してよい**。

### D-09: `any` ホットスポット 【局所的に実装してよい / Phase 5】

- **根拠**: 本番コード41ファイルに `any` 系パターン。集中箇所: `src/lib/api-client.ts`（7）、`src/api/gemini/ai-analysis-service.ts`（7）、`src/lib/notifications/email/reservation-enqueue.ts`（6）、`src/app/api/ai-insights/route.ts`（6）、`src/lib/notifications/email/processor.ts`（`supabase: any` ×3）、`src/lib/schemas/auth.ts`（4）。さらに `eslint.config.mjs` が `src/app/api/**`, `src/lib/**`, `src/hooks/**`, `src/components/**` で `no-explicit-any: off` にしており、`AGENTS.md` の型規律と矛盾。
- **なぜ負債か**: 型の穴は認可・スコープ判定のような重要コードの回帰をコンパイラが検出できなくする。
- **影響範囲**: 上記ファイル。
- **変更リスク**: 小〜中（型のみの変更に限れば実行時影響なし。ただし型を直すと隠れていた不整合が顕在化しうる — それは正しい挙動）。
- **改善案**: まず**機械的に安全な置換のみ**: `supabase: any` → `SupabaseServerClient`（`src/lib/notifications/email/processor.ts` 等）、明らかなDB行型 → `Database['public']['Tables'][...]['Row']`。型を厳密化した結果 type-check エラーになり、**修正に実行時ロジックの変更が必要**な箇所は触らずに報告へ回す。eslint 設定の例外縮小（`no-explicit-any` を `warn` に戻す等）は**提案のみ**（D-10）。
- **検証方法**: §9 フル検証。
- **実装可否**: **型注釈のみの変更に限り実装してよい**。

### D-10: `tsconfig strict: false` と eslint の `any` 全面免除 【提案のみ】

- **根拠**: `tsconfig.json:10` `"strict": false`、`noImplicitReturns: false` 等。`AGENTS.md` は「Strict TypeScript discipline is required」。`eslint.config.mjs` はAPI/lib/hooks/componentsで `no-explicit-any: off`。
- **なぜ負債か**: プロジェクトの掲げる規律と実際のツール設定が逆を向いており、新規コードの劣化を止められない。
- **変更リスク**: **高**。strict 化は数百件規模のエラーを顕在化させる大工事。
- **改善案（提案のみ）**: 段階的移行計画（例: `strictNullChecks` 単独 → ディレクトリ別 override → full strict）を提案書に書く。
- **実装可否**: **実装禁止（提案のみ）**。

### D-11: 巨大APIルート（責務混在） 【提案のみ】

- **根拠**: `src/app/api/daily-reports/items/route.ts`（**1461行**: バリデーション+保険請求+料金スナップショット+ケアエピソード計算が同居）、`/api/reservations/route.ts`（1020行）、`/api/admin/users/route.ts`（1020行）、`/api/admin/tenants/route.ts`（870行・ロールバック段階管理込み）、`/api/staff/shifts/route.ts`（648行）。サービス層（`src/lib/services/`）は存在するが利用ルートは6〜7本のみ。
- **なぜ負債か**: テスト不能な単位。特に admin/users・admin/tenants は **service role + アプリ層スコープ強制**の最重要セキュリティ境界がビジネスロジックと絡み合っている。
- **変更リスク**: **高（テナント分離を壊すリスクが最大の領域）**。
- **改善案（提案のみ）**: ルートごとの分割設計（スキーマ抽出 → 純関数抽出 → サービス層移設の3段階）を提案書に書く。承認なしに着手しない。
- **実装可否**: **実装禁止（提案のみ）**。

### D-12: セキュリティ系クエリの重複（`security_events` INSERT ×4ファイル、`user_sessions` SELECT ×6箇所） 【提案のみ】

- **根拠**: `docs/refactoring-analysis-2026-03-16.md` §4.3（`session-manager.ts`, `mfa/*`, `security-monitor.ts`, `multi-device-manager.ts`）。
- **なぜ触らないか**: この領域（session/security/MFA）は `docs/セキュリティ改修仕様書_2026-06_v1.0.md` SEC-04（MFA強制）等の改修対象と重なる。並行変更はコンフリクトと事故の元。
- **実装可否**: **実装禁止（提案のみ）**。SEC改修完了後に `SecurityEventService` 統合を提案。

### D-13: クライアントサイドからの Supabase 直接アクセス残存（DOD-09の未収束部分） 【触らない】

- **根拠**: `docs/stabilization/DoD-v0.1.md` DOD-09 の Scope note —「`session-manager`, `security-monitor`, `multi-device-manager`, `ai-analysis` 系に client-side 直アクセスが残る」。
- **実装可否**: **触らない**。SEC改修と DOD-09 の管轄。

### D-14: `createClient` の同名衝突（server版とbrowser版） 【提案のみ】

- **根拠**: `src/lib/supabase/server.ts:89`（async・cookie）と `src/lib/supabase/client.ts`（ブラウザ）が同名。eslint の `no-restricted-imports` で `@/lib/supabase/server` 直importは禁止され `@/lib/supabase` 経由に誘導されているため、現状は運用で回避できている。
- **なぜ提案止まりか**: リネームは多数ファイルに波及する割に、現状の誤用防止策（eslint）が機能している。
- **実装可否**: **提案のみ**（例: browser 版を `createBrowserSupabaseClient` にリネームする案）。

### D-15: ドキュメントの陳腐化と矛盾 【限定的に実装してよい / Phase 1】

- **根拠**: `docs/PROJECT_OVERVIEW.md`（2025-11-04付）は「予約82%完了」「localhost:3001」「Node >=18.18.0」等、README が「現行コードベースと一致しないため削除した」と明言した内容を未だ記載。README 内のリンクが作成者ローカルの絶対パス（`/C:/Users/seekf/...`）になっている。ルート直下に約60の歴史的レポート（`PHASE*_REPORT.md`, `BUILD_ERRORS_REPORT.md`, `Tiramisu2.md`, `狙い撃ち.yaml` 等）が散在。
- **改善案**: 実装してよいのは2点のみ — (1) `docs/PROJECT_OVERVIEW.md` の冒頭に「歴史的文書。現状は README と docs/stabilization/DoD-v0.1.md を正とする」旨の注記を追加、(2) README のローカル絶対パスリンクを相対パスへ修正。**ファイルの移動・削除・本文の大規模書き換えはしない**（§11 質問3）。
- **実装可否**: 上記2点のみ**実装してよい**。

### D-16: テストのSupabaseモックが3系統に分裂 【提案のみ】

- **根拠**: `jest.setup.after.js` のグローバル in-memory モック（`__MOCK_DB`）、`test-utils/supabaseMock.ts` の共有ファクトリ、各テストの手書きチェーンモック（例: `src/__tests__/rls/notifications-rls.test.ts:14-32`）。
- **なぜ提案止まりか**: 262テストファイルに波及する大規模変更で、回帰リスクが利益を上回る。
- **実装可否**: **提案のみ**（新規テストでは `test-utils/supabaseMock.ts` を推奨、程度の方針提案）。

### D-17: tsconfig の将来リスク（`baseUrl` 非推奨 / TS7で廃止予定） 【提案のみ】

- **根拠**: TypeScript 6.x で `tsc` 実行すると TS5101。lockfile は 5.9.3 なので現在は問題なし。
- **実装可否**: **提案のみ**（`paths` の相対化 or `ignoreDeprecations` 追加は TS 更新タスクと同時に行うべき）。

---

## 8. Implementation Phases（実装フェーズ）

フェーズは番号順に実施する。**各フェーズの完了条件は §9 の検証が green（既知3失敗のみ）であること**。フェーズ内の各ステップは独立コミットにする。コミットメッセージは `refactor(phaseN): <内容>` 形式。

### Phase 0: 現状確認と安全網（コードを1行も変更しない）

1. `git status` — クリーンであることを確認。クリーンでなければ停止・報告。
2. 作業ブランチを確認（指定ブランチ以外で作業しない）。
3. `npm ci` を実行。
4. §6 の全コマンドを実行し、結果を記録（§10の形式）。
5. §6.2/§6.3 と差分がないか照合。**差分があれば §5-1 に従い停止**。
6. 既知の3失敗テストについて、失敗原因の所見（実装側か期待値側か、根拠付き）をまとめる。**修正はしない**。

### Phase 1: リポジトリ衛生（D-01, D-15の許可部分）

1. D-01 の生成物・一時ファイルを `git rm`（`jest-windows.json` 等の生成ログ・`tmpclaude-*`・`playwright-report/`・`test-results/`・`.kamui/`）し、`.gitignore` にパターンを追加。**手書きドキュメントは対象外**。
2. D-15: `docs/PROJECT_OVERVIEW.md` 冒頭への注記追加、README のローカル絶対パスリンク修正。
3. §9 検証 → コミット（衛生とドキュメントは別コミット）。

### Phase 2: 死コード削除（D-03）

各ファイルについて、**削除直前に** `grep -rn "<ファイル名(拡張子なし)>" src scripts supabase --include="*.ts" --include="*.tsx" --include="*.mjs"` 等で参照0を再確認してから削除する。新参照があれば §5-2 で停止。

1. `src/lib/middleware-optimizer.ts` 削除 → 検証 → コミット
2. 死コード島の削除（1コミット）: `src/hooks/useQualityAssurance.ts` → `src/lib/integration-tests.ts` → `src/lib/accessibility-test.ts` → `src/lib/performance.ts`（この順で参照を確認しながら）→ 検証 → コミット
3. `src/api/database/supabase-client.ts` 削除（R03/R08 ガードテストが pass し続けることを確認）→ 検証 → コミット
4. `src/lib/supabase-browser.ts` 削除 + `src/__tests__/types/supabase-client-typing.test.ts` 内の同ファイルを fs で読む2テストを削除（同一コミット。テスト削除理由をコミットメッセージに明記）→ 検証 → コミット
5. `src/lib/feature-flags.ts` は**質問4の回答がない限り触らない**。
6. `src/lib/admin/master-data-deprecation.ts` は**参照ありのため削除禁止**。

### Phase 3: 型契約の統一（D-04, D-06）

1. D-04: `ApiResponse` 統一。正本 = `src/lib/api-helpers.ts` の discriminated union。`types/api.ts` で re-export し、`types/index.ts` / `types/admin.ts` / `types/security.ts` の重複定義を re-export に置換。型構造の非互換が出たら停止（§5-4）→ 検証 → コミット
2. D-06: `@/types`（index.ts）の本番2importer（`ai-comment-card.tsx`, `ai-analysis-service.ts`）が使う型だけを適切な場所へ移設し import を差し替え、`types/index.ts` の未使用型を削除 → 検証 → コミット

### Phase 4: `ScopeAccessError` 統一（D-05）— テスト先行

1. 現状固定テストを追加: manager-scope 経路と scoped-admin 経路それぞれの throw が、代表的ルート（例: `/api/admin/security/events`, `/api/admin/notifications`, guards 経由のルート）で返す**現在の**ステータスコードを固定 → このテストだけ先にコミット。
2. クラス定義を `src/lib/auth/manager-scope.ts` に一本化し、`scoped-admin.ts` から re-export。catch 側の import はそのまま動くことを確認。
3. 手順1のテストが**無変更で** pass することを確認。1件でもステータスが変わるなら revert して §5-5 の質問へ。
4. §9 検証 → コミット。

### Phase 5: 局所的な型強化（D-09）

1. `src/lib/notifications/email/processor.ts` ほかの `supabase: any` → `SupabaseServerClient` 等、**型注釈のみ**の置換。1ファイルずつ検証・コミット。
2. 型を直した結果、実行時ロジックの修正が必要になる箇所は**触らずに**最終報告へ記載。
3. `src/lib/api-client.ts` のジェネリクス化は、公開シグネチャの互換（既存呼び出し側が無修正でコンパイルできること）を維持できる場合のみ。

### Phase 6: 内部ルートのレスポンスエンベロープ整合（D-08）

1. 対象候補（認証必須の内部ルートで生 `NextResponse.json` を使うもの）を列挙し、各ルートの現在のレスポンスJSONを固定するテストを追加。
2. `createSuccessResponse`/`createErrorResponse` への置換が**完全等価**になるルートのみ置換。等価にならないルートはスキップし報告。
3. 1ルートずつ検証・コミット。

### Phase 7: 提案書の作成（コード変更なし）

`docs/refactoring-proposals-<日付>.md` を新規作成し、D-07, D-10, D-11, D-12, D-14, D-16, D-17 および D-02 の所見について、それぞれ「現状 / 提案 / 影響範囲 / 移行手順 / 必要な承認」を記載する。**コードは変更しない**。

---

## 9. Verification Requirements（各フェーズ共通の検証）

各フェーズ（および Phase 2〜6 の各コミット単位）で以下を実行し、結果を記録する。

```bash
npm run lint                                      # エラー0
npm run type-check                                # エラー0
npm run test:pr05:focused                         # 9スイート全pass（CIゲート相当）
npm run test -- --ci --testPathIgnorePatterns=e2e # 失敗が §6.3 の既知3件「のみ」であること
```

フェーズ完了時（最低でも Phase 1, 3, 4, 6 の完了時と最終時）は加えて:

```bash
# §6.4 の placeholder 環境変数付きで
npm run build                                     # 成功
npm run scan:secrets                              # 成功（CIゲート相当）
```

**合格基準**: ベースラインからの悪化ゼロ。テスト失敗は既知3件のみ・skipは既知2件のみ。新たな lint warning を増やさない。

---

## 10. Reporting Format（最終報告の形式）

最終報告は以下の構成で行うこと。

```markdown
# リファクタリング実施報告

## 1. ベースライン記録（Phase 0）
- git status / branch / commit hash
- 各検証コマンドの結果（§6.2 との一致確認）

## 2. フェーズ別実施内容
### Phase N: <名前>
- 変更ファイル一覧（コミットhash付き）
- 実施した内容と、しなかった/できなかった内容（理由付き）
- 検証コマンドと結果（コピー&ペースト。要約ではなく実出力の末尾）
- 挙動への影響: 「なし」と断言できる根拠 / 影響がある場合はその内容

## 3. 既知3失敗テストの調査所見（D-02）
- 各テストについて: 実装・テスト・モックのどれが古いかの所見と根拠

## 4. スキップ・保留項目
- §5 により停止して質問した項目 / 等価性を証明できずスキップしたルート 等

## 5. 発見事項（本書に載っていない負債・バグの疑い。修正はしていない）

## 6. 最終検証
- 全検証コマンドの最終実行結果
```

「実行していないコマンドを実行したと書かない」「検証できなかったものは検証できなかったと書く」こと（`AGENTS.md` Evidence Standard）。

---

## 11. 実装前に確認すべき質問（人間の回答待ち）

> 回答が得られるまで、該当項目は実装しない。回答がなくても他のフェーズは進められる。

1. **既知の3失敗テスト（D-02）**: 調査所見を出した後、修正してよいか？ 修正する場合「実装に合わせてテストを直す」「テストに合わせて実装を直す」のどちらの方針か？（コードからは仕様の真実を断定できないため）
2. **セキュリティ改修仕様書（SEC-01〜12）との順序**: 本リファクタリングは SEC 改修と並行してよいか、SEC 完了を待つべきか？ 並行する場合、本書は SEC 対象ファイル（middleware.ts / csp-config / rate-limiting / MFA / 依存）を全て回避する設計だが、それで問題ないか？
3. **ルート直下の手書きドキュメント約60ファイル**（`PHASE*_REPORT.md`, `Tiramisu2.md`, `管理者改善.md`, `狙い撃ち.yaml`, `# Google OAuth認証実装ガイド（Supabase + Next.groovy`〔拡張子が壊れている〕等）: `docs/archive/` へ移動してよいか、現状維持か？
4. **`src/lib/feature-flags.ts`**: `docs/specs/pilot-release-spec-v0.1.md` の P2-05（フィーチャーフラグ基盤整備）はまだ生きている計画か？ 生きていれば保留、死んでいれば削除対象に加える。
5. **`src/types/reservation.ts` のドメインモデル方式（D-07）**: camelCase ドメインモデル＋マッパーを正式方針として維持でよいか？（推奨: 維持。再構築は15ファイルに波及するため）
6. **Phase 2 の削除リスト承認**: §8 Phase 2 に列挙したファイルの物理削除を承認するか？（参照0は検証済みだが、`AGENTS.md` がファイル削除に明示承認を求めているため）

---

## 12. Out-of-scope Items（本リファクタリングでやらないこと)

- `docs/セキュリティ改修仕様書_2026-06_v1.0.md` の SEC-01〜SEC-12 に属する一切（依存更新・`npm audit fix`・CSP・nonce 配線・レート制限・MFA 強制・`/api/chat` 認可・CSRF・`GRANT` 見直し・HMAC鍵・logger PII redaction）
- `supabase/migrations/`・RLSポリシー・DBスキーマ・JWT claims・`supabase/config.toml` の変更
- `middleware.ts` の変更（SEC-02/03 の対象であり、認証の主防御層のため）
- 公開API（`/api/public/*`）・webhook・`/api/internal/*`・`/api/health` のレスポンス/入力契約の変更
- `package.json` の依存追加・更新・削除、Node/TS バージョン変更
- tsconfig の strict 化（D-10。提案のみ）
- 巨大ルートの分割実装（D-11。提案のみ）
- session/security/MFA/multi-device 系コードの変更（D-12, D-13）
- テストモック基盤の統一（D-16。提案のみ)
- `src/legacy/**` への一切の変更
- UI/UX変更、パフォーマンス最適化（923KBのvendorsチャンク等は提案書での言及に留める）
- git 履歴の書き換え（filter-branch / BFG 等）
- Playwright E2E の安定化・実行（ローカルSupabase必須のため本作業の検証対象外)
