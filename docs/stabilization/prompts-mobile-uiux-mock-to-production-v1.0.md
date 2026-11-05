# Mobile UIUX モック→本番実践 Codex指示プロンプト集 v1.0

対応仕様書: `docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md`（以下「本仕様書」）

各プロンプトは 1 task = 1 PR を前提に、そのまま Codex へ貼って使う。実行順は次のとおり。

```text
Phase 0（即日）:        PR-1
Phase 1（閲覧投入ライン / P0）: PR-2 → PR-3 / PR-4
Phase 2（write pilot ライン / P1）: PR-11 → PR-5 / PR-10 / PR-7 → PR-6
Phase 3（仕上げ / P2）:  PR-8 / PR-9
```

すべてのプロンプトに共通する前提（各プロンプト冒頭に含めてある）:

- 仕様書 `docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md` を必ず読んでから着手する
- v0.9 由来の非交渉条件（仕様書 §0）: UI/UX デザイン非変更 / DC runtime 非破壊 / 原本 `.dc.html` 非変更 / 認可・RLS・clinic scope を緩めない / fail-closed
- コミットは Conventional Commits。PR前に `npm run lint` / `npm run type-check` / 関連テストを通す

---

## Phase 0

### PR-1: CI drift check 組み込み

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §7（GAP-5）を読み、
そのとおりに実装してください。

タスク:
- .github/workflows/ci.yml に `npm run mobile-uiux:check-production-assets` を
  既存の lint + type-check ゲートと同等の必須 step として追加する

制約:
- generator 本体（scripts/mobile-uiux/generate-production-assets.ts）や
  production asset は変更しない。CI への組み込みのみ
- 既存 CI ゲート（lint / type-check / scan:secrets / build / supabase types 検証 /
  e2e:validate-fixtures / test:pr05:focused）の構成を壊さない

検証:
- ローカルで npm run mobile-uiux:check-production-assets が pass すること
- 原本 private-assets/mobile-uiux/reservations.dc.html を一時的に変更した状態で
  同コマンドが non-zero exit することを確認し、変更は元に戻すこと

受け入れ条件は仕様書 §7.3。コミットは docs/ci 系の Conventional Commits で。
```

---

## Phase 1（閲覧投入ライン / P0）

### PR-2: hydration カバレッジ棚卸し + write 画面のサンプル遮蔽

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §4（GAP-2）を読み、
そのとおりに実装してください。

タスク:
1. 6画面（home / reservations / patients / daily-reports / settings / settings-detail）の
   各 renderVals() 全キーを「hydrated / sample / static」に分類した棚卸し表を
   docs/stabilization/mobile-uiux-hydration-coverage-v1.0.md として作成する。
   sample 分類の各キーには (a) hydrate / (b) 非表示 / (c) サンプルラベル残置 の決定を記録する
2. write 開放画面（daily-reports / reservations / settings-detail）について、
   write 導線が参照・表示する値から (c) をゼロにする。
   (a) は /api/mobile-uiux/settings-detail の menus / resources 流用を第一候補にし、
   新規 BFF endpoint は追加しない。
   (b) は production transform / generated asset 側でのみ行い、原本 .dc.html は変更しない
3. 生成資産を npm run mobile-uiux:generate-production-assets で再生成してコミットする

制約（仕様書 §0 の非交渉条件）:
- UI デザイン・文言・カード構成は変えない（ブロック除去 (b) を除く）
- ref="{{ setRoot }}" / <x-dc> / script[data-dc-script] / DCLogic を維持する

テスト（仕様書 §4.3 / §14）:
- write 開放画面にサンプル由来の固有文字列が残らない fixture test
- (b) で除去したブロックが production asset に含まれないことの検証
- 既存 src/__tests__/mobile-uiux/ 全体と npm run mobile-uiux:check-production-assets が pass

受け入れ条件は仕様書 §4.3。
```

### PR-3: patients 画面の実データ接続

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §3（GAP-1）を読み、
A案（patients hydration 実装）で実装してください。
docs/stabilization/mobile-uiux-hydration-coverage-v1.0.md（PR-2成果物）の patients 行も更新すること。

タスク（仕様書 §3.3 の 1〜5）:
1. src/lib/mobile-uiux/production-asset.ts の MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES に
   patients を追加し、generated production asset を生成・コミットする
2. src/lib/mobile-uiux/dc-script-patch.ts に patients 用 hydration adapter を追加する
   （既存5画面と同じ rename + delegate 方式）
3. 反映最小キー: 患者数系 KPI / 患者リスト rows / 分析タブ主要サマリ
4. MobileUiuxPatientAnalysisResponse に画面表示へ必要な最小 rows が無ければ
   contracts.ts と /api/mobile-uiux/patient-analysis を拡張する。
   PII は既存 patients 画面が表示している項目を超えて返さない。
   AuditLogger.logDataAccess の記録は維持する
5. bridge の summarizePayload に patients 分岐（件数つきメッセージ）を追加する

制約:
- 原本 private-assets/mobile-uiux/patients.dc.html は変更しない
- 認可（ensureClinicAccess + entitlement）を緩めない

テスト（仕様書 §3.4 / §14）:
- dc-script-patch.test.ts / production-asset.test.ts / mobile-uiux-patient-analysis.test.ts に
  patients 分を追加し、主要表示値が BFF payload 由来になることを検証
- --check の対象に patients が入ること

受け入れ条件は仕様書 §3.4。
```

### PR-4: 再フェッチ contract（日付・店舗切替）

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §5（GAP-3）を読み、
そのとおりに実装してください。

タスク:
1. src/lib/mobile-uiux/bridge-manifest.ts の bridge script に
   window.MobileUiuxBridge.refreshReadData({ date?, clinicId? }) を追加する
   （仕様書 §5.2.1 の 1〜5。read の in-flight 重複は既存 mutation と同様 Map で抑止）
2. hydration adapter に __mobileUiuxHydratedKey（date + clinicId）を持たせ、
   画面の日付切替 UI の既存 onClick から refreshReadData({ date }) を呼ぶ配線を
   generated production asset の DC script patch として追加する（原本非変更）
3. 再フェッチ中は data-mobile-uiux-bridge="loading" を documentElement dataset に出す。
   視覚デザインは変えない
4. 店舗切替は既存 UI がある画面のみ配線する。新規セレクタは追加しない

制約:
- clinicId の client 側チェック（accessibleClinicIds 照合）は UX 目的であり、
  認可はサーバ側 ensureClinicAccess のまま。read BFF の API 変更はしない
- fetch 失敗時に前日付の実データを切替先日付として表示しない（fallback status を出す）

テスト（仕様書 §5.3 / §14）:
- refreshReadData の成功 / 失敗 / スコープ外 clinicId 拒否（false 返却・fetch なし）
- reservations 画面で日付切替後、切替先日付の payload が主要表示値に反映される
- bridge-contract.test.ts の既存 contract を壊さない

受け入れ条件は仕様書 §5.3。production asset の再生成とコミットを忘れないこと。
```

---

## Phase 2（write pilot ライン / P1）

### PR-11: PC/モバイル業務ロジックの共有化（PR-6 より先に実施）

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §11.5（GAP-11）を読み、
そのとおりに実装してください。挙動不変のリファクタリングです。

タスク:
1. src/app/api/reservations/route.ts:265 と
   src/app/api/mobile-uiux/reservations/route.ts:212 に二重定義されている
   hasReservationConflict を src/lib/reservations/conflict.ts（新設）へ抽出し、
   両 route から import する。抽出時に両実装へ差分があれば PC 版を正とし、
   差分内容を PR 説明に明記する
2. モバイル home の summarizeReservationStatuses（確定/未確定/キャンセル分類・
   ステータス正規化）を src/lib/reservations/status.ts または既存 read-model へ抽出し、
   PC ダッシュボード集計と共用する
3. 同一 fixture に対して PC 側 API とモバイル BFF が同じ件数・同じ conflict 判定を
   返す同値性テストを追加する

制約:
- 挙動を変えない。既存の PC 側予約テストとモバイル BFF テストが無変更で pass すること
- clinic_id / role / user_id に触れる変更のためテスト追加必須（AGENTS.md 要件）

受け入れ条件は仕様書 §11.5.4（定義が1箇所 / 共用 / 同値性テスト green / 既存テスト無変更 pass）。
```

### PR-5: mobile BFF レート制限

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §6（GAP-4）を読み、
そのとおりに実装してください。

タスク:
1. src/lib/rate-limiting/middleware.ts に isMobileUiuxApiPath
   （/api/mobile-uiux/ prefix 判定）を追加し、適用パイプラインへ組み込む
2. RateLimitConfig の type を追加する:
   - read（GET）: mobile_uiux_read、userId 優先・IP フォールバック key、60 req/分
   - write（POST/PATCH/PUT）: mobile_uiux_write、userId key、10 req/分
3. 429 応答に Retry-After を付与する（既存規約どおり）
4. Upstash Redis 不達時の挙動は既存 apiRateLimit の fail 方針に合わせる

制約:
- /api/health 等の既存除外パスに影響しない
- middleware.ts の matcher / PROTECTED_ROUTE_PREFIXES は変更しない

テスト（仕様書 §6.3 / §14）:
- read / write それぞれの limit 超過で 429 + Retry-After
- write limit が read より厳しいことをテストで固定
- 既存 rate-limiting テストが pass

受け入れ条件は仕様書 §6.3。limit 値は初期値であり定数として調整可能にしておくこと。
```

### PR-10: API 契約確定の残差修正

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §12 を読み、
全 /api/mobile-uiux/* endpoint を確定 contract に準拠させてください。

タスク:
1. 全 endpoint の JSON レスポンスに content-type: application/json; charset=utf-8 を統一する
2. 全 endpoint のレスポンスに Cache-Control: no-store を明示する
3. エラーコードと HTTP status の対応（BAD_REQUEST=400 / UNAUTHORIZED=401 /
   FORBIDDEN=403 / CONFLICT=409 / INTERNAL=5xx）に逸脱があれば修正する
4. 準拠済みの箇所は変更しない。逸脱箇所のみ差分を出す

テスト:
- 全 endpoint の charset / Cache-Control / エンベロープ形式を検証するテストを
  src/__tests__/api/ の既存 mobile-uiux テストへ追加する

受け入れ条件は仕様書 §12 の 1〜7 に対する準拠。挙動（データ内容・認可）は変えない。
```

### PR-7: entitlement 運用（管理 API + runbook）

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §9（GAP-7）を読み、
そのとおりに実装してください。

タスク:
1. docs/operations/RUNBOOK.md に §9.2.1 の切替 runbook（env allowlist → DB entitlement、
   5ステップ）を追記する
2. 管理 API を追加する（§9.2.2）:
   - GET  /api/admin/mobile-uiux/entitlements?clinic_id=...
   - PUT  /api/admin/mobile-uiux/entitlements（upsert、admin role のみ）
   実装は既存 admin API 規約に従う: verifyAdminAuth + createScopedAdminContext、
   Zod スキーマ（clinic_id UUID + boolean 6種 + rollout_phase）、
   統一エンベロープ、AuditLogger.logAdminAction 記録、updated_by 設定

制約:
- clinic_feature_flags テーブルは既存。migration は追加しない
- 管理画面 UI は作らない（API のみ）
- 監査ログに PII を出さない（対象 clinic_id は許容）

テスト（仕様書 §9.3 / §14）:
- 401 / 403（非admin）/ バリデーション / 成功 / 監査ログ記録
- entitlement 行の変更が GET /api/mobile-uiux/context の publicFlags に反映される

受け入れ条件は仕様書 §9.3。
```

### PR-6: 予約作成（POST）write pilot の UI 配線（PR-2 / PR-4 / PR-11 完了後）

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §8（GAP-6）を読み、
そのとおりに実装してください。前提: PR-2（サンプル遮蔽）/ PR-4（再フェッチ）/
PR-11（競合判定共有化）が main に入っていること。入っていなければ着手前に報告してください。

タスク:
1. reservations 画面の既存「予約作成フォーム」保存 onClick から
   window.MobileUiuxBridge.createReservation(payload) を呼ぶ DC script patch を追加する
   （generated production asset 側。原本非変更）
2. bridge に normalizeReservationPayload を追加し、clinic_id を defaultClinicId で補完する
3. payload の menu_id / staff_id / customer_id は settings-detail 由来の実 ID を使う。
   サンプル ID を payload に載せない
4. 成功時は applyReadScreen: "reservations" で read model を再反映する（PATCH と同挙動）
5. conflict（409）は既存 reservationConflict メッセージ表示

制約:
- BFF（POST /api/mobile-uiux/reservations）は変更しない（実装済み）
- 開放 flag は既存の MOBILE_UIUX_WRITE_ENABLED + MOBILE_UIUX_RESERVATION_WRITE_ENABLED +
  DB entitlement。作成専用 flag は追加しない

テスト（仕様書 §8.3 / §14）:
- flag off で disabled status になり POST が飛ばない
- 実 ID での作成成功 / conflict 409 / スコープ外 clinic 403
- 成功後に一覧 rows へ反映される

受け入れ条件は仕様書 §8.3。production asset 再生成 + --check pass を確認すること。
```

---

## Phase 3（仕上げ / P2）

### PR-8: 観測性（reason code ログ）

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §10（GAP-8）を読み、
そのとおりに実装してください。

タスク:
1. 各 mobile BFF の拒否応答時に reason code
   （flag_disabled / entitlement_denied / clinic_scope_denied / role_denied /
   write_flag_disabled）を server log へ出す
2. src/lib/mobile-uiux/entitlements.ts の fetchMobileUiuxClinicEntitlements で
   DB エラー時に logger.error を記録する（空 Map 返却の fail-closed 挙動は維持）

制約:
- raw clinic_id / patient PII / email / free text を通常ログに出さない（仕様書 §10.1-1）
- クライアント計測（sendBeacon 等）は導入しない（仕様書で不採用と決定済み）

テスト: 主要 reason code のログ出力検証 + PII 非混入の確認。
受け入れ条件は仕様書 §10.2。
```

### PR-9: Playwright smoke + status 最小整形

```md
docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md の §11（GAP-9 / GAP-10）を
読み、そのとおりに実装してください。前提: PR-3 / PR-4 完了後。

タスク:
1. src/__tests__/e2e-playwright/ に mobile-uiux smoke を追加する（仕様書 §11.1 の 5ケース）。
   既存の e2e:validate-fixtures / e2e:seed 規約に従い、viewport は 390x844 / isMobile: true。
   日時は src/lib/jst.ts の JST 基準で seed と期待値を揃える（DoD-06 の既知の落とし穴）
2. production shell CSS（<style data-mobile-uiux-production-shell>）に
   status 要素（[data-mobile-uiux-mutation-status] 等）の最小スタイルを追加する。
   既存デザイントークン（--surface / --fg 等）のみ使用し、新しい色は導入しない

制約:
- role="status" / dataset contract は変更しない
- 既存の dataset ベースのテストが無変更で pass すること

受け入れ条件: smoke 5ケースがローカルでグリーン + 仕様書 §11.2 準拠。
実行手順（npm run e2e:validate-fixtures && npm run e2e:seed → npm run test:e2e:pw →
npm run e2e:cleanup）を PR 説明に記載すること。
```

---

## 運用メモ

- 各 PR 完了ごとに、本仕様書 §2 のギャップ表と `mobile-uiux-hydration-coverage-v1.0.md` の
  該当行を更新する（Codex への指示に含めるか、レビュー時に確認する）
- Phase 1 完了時点で read-only の実践投入判断が可能。write pilot 投入は Phase 2 完了が条件
- 投入判断のチェックリストは本仕様書 §17（受け入れ条件）を使う
