# コード・資産 棚卸しリスト（2026-07-04）

調査方法: Sonnet 5 サブエージェント4体による並列調査（①レガシー/未使用コード ②ドキュメント ③依存関係/スクリプト ④DB/SQL/テスト資産）。
補正: 2026-07-04 に Codex サブエージェント6体で再検証し、誤削除につながる候補を補正済み。
各項目の「判断」欄はオーナー（開発者）が記入する。**このリストは候補の列挙であり、削除実行は未承認。**

凡例 — 確度: ◎=参照ゼロ確認済み / ○=高確度（要最終確認） / △=要個別調査
処分案: 削除 / アーカイブ / 統合 / 移行 / 修正 / 保留

---

## A. セキュリティ・整合性に関わる要対応事項（棚卸しより優先度高）

| # | 項目 | 内容 | 確度 | 処分案 | 判断 |
|---|------|------|------|--------|------|
| A-1 | `src/__tests__/e2e-playwright/storage/{admin,staff}.json` | Playwright storageState（認証Cookie/トークン）がgit追跡されコミットされ続けている。`.gitignore` 未登録 | ◎ | gitignore化 + CIで都度生成 | 実施 |
| A-2 | ルートの実env系ファイル `.env.local` `.env.development` `.env.production` `.env.staging` `.env.test` | git追跡なし・`.gitignore` 対象確認済み。ローカル秘密情報のローテーション要否はオーナー判断 | ○ | repo変更なし（必要時ローカル対応） | 確認済み |
| A-3 | `src/legacy/Reservation/.env.local` | git追跡なし・legacy配下の `.gitignore` 対象確認済み。ローカル `GEMINI_API_KEY` 相当の扱いはオーナー判断 | ○ | repo変更なし（必要時ローカル対応） | 確認済み |
| A-4 | Nodeバージョン不整合 | `.node-version`（v22.22.2・UTF-16破損気味） vs `.nvmrc`（24） vs `engines`（24.x） | ◎ | `.node-version` 削除 or 統一 | 実施 |
| A-5 | `20260508000100_fix_reservation_list_view_security_invoker.sql.sql` | 二重拡張子の命名バグ。ロールバック欠落とも連動 | ◎ | 修正 | 実施 |
| A-6 | ロールバック整理 | `20260507000100_daily_report_items` は `docs/stabilization/rollbacks/` に存在。`20260508000100_*` / `20260508000200_*` は欠落。追加はsecurity/RLS弱体化リスクを伴うため別spec必須 | △ | 別PRでspec + rollback plan | 保留 |

## B. レガシー・未使用コード（src/）

| # | 項目 | 規模 | 根拠 | 確度 | 処分案 | 判断 |
|---|------|------|------|------|--------|------|
| B-1 | `src/legacy/Reservation/` | 27ファイル ~2,800 LOC | 本体からのimportゼロ。R02テストで隔離保証済み。tsconfig除外済み | ◎ | 削除（R02テストも同時整理） | 実施 |
| B-2 | `src/hooks/useAdminMaster.ts` | 190 LOC | `@deprecated`。参照は自己+テストのみ。masterページは非推奨バナー表示のみ | ○ | 削除 | 実施 |
| B-3 | `useMasterData` 名の二重定義 | — | `src/hooks/useMasterData.ts`（実装）と `useAdminMaster.ts` 内の別名exportが同名衝突 | ◎ | 修正（B-2削除で解消） | 実施 |
| B-4 | SystemSettings系フック3種 | 計 ~570 LOC | `useSystemSettings.ts`（正）/ `useSystemSettingsV2.ts`（再exportシムのはずが160 LOC、要中身確認）/ `queries/useSystemSettingsQuery.ts`（R04テスト対象外の第3実装） | △ | 統合（1実装に集約） | |
| B-5 | `src/hooks/useSessionManagement.ts` | — | 外部importerゼロ | ○ | 削除 | 実施 |
| B-6 | `src/hooks/useSystemStatus.ts` | — | 自テストのみが参照 | ○ | 削除 | 実施 |
| B-7 | `src/components/admin/CSPDashboard.tsx` | — | 参照ゼロ | ○ | 削除 | 実施 |
| B-8 | `src/components/examples/design-system-showcase.tsx` | — | 参照ゼロ。dev/demo残骸 | ○ | 削除 | 実施 |
| B-9 | `src/components/multi-store/best-practice-card.tsx` | — | 参照ゼロ | ○ | 削除 | 実施 |
| B-10 | `src/lib/insurance-fees/validate-master.ts` | — | `scripts/insurance-fees/validate-master.ts` と `npm run insurance:validate-master` が利用。削除不可 | ◎ | 保留 | 削除不可 |
| B-11 | `lp-ai-showcase` / `lp-dynamic-sections` / `lp-roi-calculator` / `lp-faq` 系コンポーネント | — | `src/app/(public)/page.tsx` から動的import/直接importされる現役LP部品 | ◎ | 保留 | 削除不可 |
| B-12 | `appointments` レガシーテーブル参照（live側） | — | live code の `from('appointments')` は確認できず、`appointments` は生成型・docs・legacy read-only文脈に残存 | ○ | 棚卸し完了扱い | 対象外 |
| B-13 | Pilotで無効化中のルート群 | page各1 + API計~10 | `/chat` `/ai-insights` `/blocks` `/master-data` `/admin/security-*`。ゲート機構は `feature-flags.ts`/`flags.ts`/middleware の要確認 | △ | 保留（商用計画次第） | |

## C. ドキュメント（ルート直下・docs/）

| # | 項目 | 規模 | 根拠 | 確度 | 処分案 | 判断 |
|---|------|------|------|------|--------|------|
| C-1 | ルートの歴史的レポート群 | ~25ファイル | `PHASE*_REPORT.md`、`*_COMPLETION_REPORT.md`、`*_EVALUATION_REPORT.md`、`PROJECT_ANALYSIS_REPORT.md`、`VULNERABILITY_REPORT.md`、`error.md`、`frontend_Error.md` 等。CLAUDE.md自身が「歴史的経緯メモ」と宣言 | ◎ | アーカイブ（`docs/archive/`）or 削除 | 実施 |
| C-2 | 破損ファイル名 `# Google OAuth認証実装ガイド（Supabase + Next.groovy` | 1 | 保存事故と思われる異常ファイル名だが内容は固有 | ◎ | `docs/setup/google-oauth-supabase-nextjs.md` へリネーム | 修正 |
| C-3 | `docs/` 直下と `docs/stabilization/` の同名重複 | ~20ペア | `technical-debt.md` `ci-fix-plan.md` `PHASE3_PLANNING.md` `refactor-instructions.md` 等が両所に存在。どちらが正か不明 | ◎ | diff→片方削除 | 実施 |
| C-4 | `docs/stabilization/` の旧バージョンspec | 7チェーン | hq-analytics-line-query(v0.1–0.3)、manager-dashboard(v0.1)、ui-ux-design-system(v0.1–0.4)、mobile-uiux-static(v0.1)、stripe-billing旧系、therapist-uiux(v0.1–0.2)、perf-auth-waterfall(v0.1–0.2)。最新版のみ残す | ○ | アーカイブ | |
| C-5 | ファイル名事故2件 | 2 | `spec-shift-request-calendar-uiux-v0.1(1).md`（重複DL痕跡）、`specmanagerpatientanalysisperiodchartsv0.2.md`（ハイフン欠落） | ◎ | 削除/リネーム | 実施 |
| C-6 | 日付付き進捗メモ・レビュー文書 | ~15ファイル | `次にやるべきリスト_*.md`、`DoD-verification-report-2026-03-*.md`、`pilot-*-2026-03-27.md` 等の時点スナップショット | ○ | アーカイブ | |
| C-7 | `docs/` 直下のad-hoc yaml/yml | ~8ファイル | `エラーの解決法.yml`、`修復 要件定義.yml`、`改修.yml` 等の問題解決メモ | ○ | アーカイブ | 実施 |
| C-8 | MCP/Serena関連ファイル群 | 7+ | `MCP_SETUP_README.md`、`claude_desktop_config.json`、`cursor_mcp_config.json`、`start_serena_mcp.sh`、`SERENA_MEMORY_*.md`、`.serena/`、`serena_env/` | ○ | 1ドキュメントに統合 or local-only化 | 実施 |
| C-9 | `AGENTS.md` と `CLAUDE.md` の重複度 | 2 | 両方ともエージェント指示ファイル。役割分担の明文化 or 統合 | △ | 要判断 | |
| C-10 | `機能棚卸し一覧.md`（2025-12-23の旧棚卸し） | 1 | 本リストへの統合候補 | ○ | 統合→アーカイブ | |

## D. SQL・DB参照資料

| # | 項目 | 規模 | 根拠 | 確度 | 処分案 | 判断 |
|---|------|------|------|------|--------|------|
| D-1 | `src/api/database/*.sql`（schema/functions/rls-policies） | 3ファイル ~43KB | ランタイム参照ゼロ。migrations と重複するスナップショット。`supabase-client.ts` は対象外 | ◎ | アーカイブ | 実施 |
| D-2 | `src/database/`（schemas/policies/functions/seed_data） | 10ファイル | README自身が「参照資料・適用禁止」宣言。ランタイム参照ゼロ。SSOTと乖離リスク | ○ | アーカイブ | 実施 |
| D-3 | `sql/`（cleanup/migrations/seeds） | 12ファイル | ランタイム参照ゼロ。古い `reservation_system_rls.sql` は clinic_id なし/role-only policy を含み誤適用リスクあり | ○ | アーカイブ | 実施 |

## E. 依存関係・スクリプト・設定

| # | 項目 | 根拠 | 確度 | 処分案 | 判断 |
|---|------|------|------|--------|------|
| E-1 | 未使用npm依存候補: `react-hook-form` + `@hookform/resolvers` | src内importゼロ（※CLAUDE.mdは「フォームはRHF+Zod」と記載しており矛盾 — 削除前に再検証必須） | △ | 再検証→削除 | |
| E-2 | `zustand` | importゼロ | ○ | 削除 | |
| E-3 | `ioredis` | importゼロ。実クライアントは `@upstash/redis` | ○ | 削除 | |
| E-4 | `isomorphic-dompurify` | importゼロ（サニタイズ空白がないか確認） | ○ | 確認→削除 | |
| E-5 | `undici`（dev） | `jest.setup.js` の Web API polyfill で利用中 | ◎ | 保留 | 削除不可 |
| E-6 | 孤立スクリプト: `create_booking_design_worktrees.ps1` / `start_booking_design_dev.ps1` / `start_parallel_ai_editors.ps1` / `run-security-tests.sh` / `run-advanced-security-tests.sh` | npm scripts/CIから未参照（手動利用の可能性はオーナー確認） | ○ | 削除 or personalツール置場へ | |
| E-7 | `scripts/insurance-fees/validate-master.ts` | `.mjs` wrapper が `ts-node` 経由で直接requireしている実装本体 | ◎ | 保留 | 削除不可 |
| E-8 | `env.example`（ドット無し） | `.env.*.example` 体系以前の古いテンプレの疑い | ○ | diff→削除 | 実施 |
| E-9 | env テンプレのdrift | 未使用定義: `RESEND_SMTP_*`(6) `NEXT_PUBLIC_CLINIC_GROUP_NAME` 等 / 未記載の実利用: `API_KEY` `LOG_LEVEL` `NEXT_PUBLIC_LP_FORM_URL`（※`src/lib/env.ts` 経由の間接参照を再確認のこと） | △ | テンプレ整備 | |
| E-10 | ルートのログ残骸 | `.codex-*-err-*.log` `.next-dev*.log` `debug.log` `dev.log` `tsc.log` `nul` | ◎ | 削除 + gitignore | 実施 |
| E-11 | `npm run clean` | POSIX `rm -rf` でWindowsネイティブ非互換 | ◎ | 修正 | 実施 |
| E-12 | `test:pr05:focused` / `phase4a:verify-benchmark-readiness` | `test:pr05:focused` はCI現役ゲート。`phase4a:verify-benchmark-readiness` はCI未参照だがdocs/testで参照あり | ○ | 保留 | 削除不可/要判断 |

## F. 未追跡ディレクトリ（リポジトリ外資産）

| # | 項目 | 規模 | 根拠 | 確度 | 処分案 | 判断 |
|---|------|------|------|------|--------|------|
| F-1 | `TiramisuUI-UX/` | 33ファイル ~842KB | 未追跡・ネスト独立gitリポジトリ。プロトタイプだが **notifications API + migration（20260507000000_create_notifications.sql）という未マージ実装を内包** — 破棄前に取り込み要否判断 | △ | 要判断（取込 or 外部退避） | |
| F-2 | `モバイルUIUX設計/` | 20ファイル ~692KB | `.dc.html` / JS / screenshots / uploaded specs を含む実行可能プロトタイプ。`private-assets/mobile-uiux*` との正本比較が必要 | △ | 要判断 | |
| F-3 | `Tiramisu2.md` / `TiramisuLP/` | — | `Tiramisu2.md` はtracked文書。`TiramisuLP/` はtracked削除状態かつ一部環境でaccess denied/不可視。ACL解消後に判断 | △ | 要判断 | |

## G. テスト資産（軽微）

| # | 項目 | 根拠 | 処分案 | 判断 |
|---|------|------|--------|------|
| G-1 | 恒久skipテスト2件 | `src/__tests__/lib/api-client.test.ts:106`（timeout）/ `src/__tests__/pages/reservations.test.tsx:196` | 理由確認→復活 or 削除 | |
| G-2 | e2e系の条件付きskip群 | 環境未整備時の意図的skip。問題なし | 現状維持 | |

---

## 実行順の推奨（承認後）

1. **A群**（セキュリティ・整合性）— 棚卸しと独立に即時対応推奨
2. **確度◎/○の安全整理**（B-1〜B-9, C-1〜C-8, D-1〜D-3, E-8〜E-11）— archive優先で可逆に
3. **依存削除候補**（E-1〜E-4）— npm lockfile更新を伴うため別承認
4. **保留/削除不可**（B-10〜B-13, E-5, E-7, E-12, F群）— 個別調査 or オーナー判断が先

各削除は 1 task = 1 PR、Conventional Commits（`chore:` / `refactor:`）で小さく可逆に行う。
