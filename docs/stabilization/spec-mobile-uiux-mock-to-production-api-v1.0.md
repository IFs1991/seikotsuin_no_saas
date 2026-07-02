# Mobile UIUX モック→本番実践 API仕様書 v1.0

作成日: 2026-07-02
ステータス: **実装仕様 / Draft v1.0**
対象リポジトリ: `IFs1991/seikotsuin_no_saas`
前提仕様書: `docs/stabilization/spec-mobile-uiux-production-shell-write-rollout-v0.1.md`（v0.9系）
対象領域: `/api/mobile-uiux/*` / `src/lib/mobile-uiux/*` / `private-assets/mobile-uiux-production/*.dc.html` / `.github/workflows/ci.yml` / `middleware.ts`（レート制限）
優先度: **P0〜P2 混在**（各ギャップに個別に付与）

---

## 0. 本仕様書の位置づけ

v0.9 仕様書（production shell / hydration / write rollout）の実装は、現行ブランチ上で **PR-A〜PR-G 相当まで完了している**。本仕様書は、その実装レビュー結果に基づき、「デモ・モックとして成立している状態」から「本番の業務利用（本番実践）に耐える状態」までの **残ギャップを API 周りを中心に** 定義するものである。

v0.9 の非交渉条件はすべて引き継ぐ。

- UI/UX デザインは変更しない
- DC runtime（`<x-dc>` / `script[data-dc-script]` / `DCLogic` / `ref="{{ setRoot }}"`）は壊さない
- 原本 `private-assets/mobile-uiux/*.dc.html` は破壊的に変更しない
- 認可・RLS・clinic scope・テナント分離は緩めない。判断に迷ったら fail-closed
- write は flag + DB entitlement による段階開放を維持する

## 1. 実装済みインベントリ（v0.9 対応状況）

実装レビュー（2026-07-02 時点、ブランチ HEAD `a46cc93`）で確認した v0.9 の消化状況。

| v0.9 PR | 内容 | 状態 |
|---|---|---|
| PR-A | production shell 分離（`html-transform.ts`）+ preview route + Bottom Nav navigation | ✅ 完了 |
| PR-B1 | reservations hydration adapter + generated production asset 基盤 + `--check` | ✅ 完了 |
| PR-B2 | daily-reports hydration | ✅ 完了 |
| PR-B3 | home hydration | ✅ 完了 |
| （追加） | settings / settings-detail hydration | ✅ 完了（v0.9 では「別途判断」だったが実装済み） |
| PR-C | bridge mutation hardening（in-flight Map / status element 再利用） | ✅ 完了 |
| PR-D | daily report write pilot（UI 配線 `submitDailyReport`） | ✅ 完了 |
| PR-E | reservation **update** pilot（UI 配線 `updateReservation`） | ✅ 完了（**create は未配線**、GAP-2 参照） |
| PR-F | settings write pilot（settings-detail からの `updateSettings`、カテゴリ制限あり） | ✅ 完了 |
| PR-G | DB entitlement（`clinic_feature_flags` migration + RLS + rollback + `entitlements.ts`） | ✅ 完了 |
| PR-H | production asset 対象拡張 | ✅ 5画面（home / reservations / daily-reports / settings / settings-detail）。**patients は未対象**（GAP-1） |
| env example | `.env.local.example` への `MOBILE_UIUX_*` 反映 | ✅ 完了 |

### 1.1 API インベントリ（現状）

| Endpoint | Method | 実装状態 | 認可 | 備考 |
|---|---|---|---|---|
| `/api/mobile-uiux/context` | GET | 実DB | requireAuth + principal/rollout + DB entitlement | role / defaultClinicId / accessibleClinicIds / publicFlags |
| `/api/mobile-uiux/home` | GET | 実DB | `ensureClinicAccess` + entitlement | dashboard read model + 予約サマリ + 日報状況 |
| `/api/mobile-uiux/reservations` | GET / POST / PATCH | 実DB | 同上 + write flags | conflict 検出 409 / staff resource guard あり |
| `/api/mobile-uiux/daily-reports` | GET / POST | 実DB | 同上 + write flags | daily-reports read model |
| `/api/mobile-uiux/settings` | GET / PUT | 実DB | 同上 + write flags + カテゴリ制限 | `canRead/canManageAdminSettingsCategory` 併用 |
| `/api/mobile-uiux/settings-detail` | GET | 実DB | 同上 | clinic / menus / resources |
| `/api/mobile-uiux/patient-analysis` | GET | 実DB | 同上 + `AuditLogger.logDataAccess` | **画面 hydration 未接続**（GAP-1） |

**重要な読み替え:** BFF API 層はすでに「モック」ではない。全 endpoint が Supabase 実データを RLS + `ensureClinicAccess` の下で読み書きしている。本番実践までの残ギャップは、(a) API と画面の未接続部分、(b) API 運用面（レート制限・CI・観測性）、(c) 実データとサンプルデータの混在解消、の3系統である。

---

## 2. ギャップ一覧（優先度つき）

| ID | ギャップ | 種別 | 優先度 |
|---|---|---|---:|
| GAP-1 | patients 画面が hydration 未対応（BFF はあるが画面はサンプルデータのまま） | 接続 | P0 |
| GAP-2 | hydration 済み画面にもサンプルデータが残存（詳細シート・タイムライン等）し、実データと混在表示される | 接続/安全 | P0 |
| GAP-3 | 画面内の日付切替・店舗切替が BFF 再フェッチに接続されておらず、hydration が initial load 一回きり | 接続 | P0 |
| GAP-4 | `/api/mobile-uiux/*` にレート制限が適用されていない | 運用/安全 | P1 |
| GAP-5 | `mobile-uiux:check-production-assets` が CI に組み込まれていない | 運用 | P1 |
| GAP-6 | 予約作成（POST）の UI 配線が未実施（bridge 関数と BFF は存在） | 接続 | P1 |
| GAP-7 | DB entitlement の運用導線がない（行管理は SQL 直接、env allowlist→DB 切替手順未定義） | 運用 | P1 |
| GAP-8 | 観測性不足（bridge 側失敗のサーバ可視化なし、entitlement fetch error と not-found の区別なし） | 運用 | P2 |
| GAP-9 | mobile-uiux 系の Playwright E2E smoke が未整備 | テスト | P2 |
| GAP-10 | mutation / fallback status 要素が素の `div` で、本番 UX として最低限の視覚整形がない | UX | P2 |

以降、各ギャップを API 中心に仕様化する。

---

## 3. GAP-1: patients 画面の実データ接続（P0）

### 3.1 現状

- `MOBILE_UIUX_SCREEN_MANIFEST.patients` は `/api/mobile-uiux/patient-analysis` を指し、bridge は read fetch まで行う
- しかし `MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES` に `patients` が含まれず、hydration adapter（`dc-script-patch.ts`）にも `patients` 分岐がない
- 結果: production shell（route-time transform）+ 汎用 status 表示のみで、**患者リスト・分析値はすべてサンプルデータ**が表示される
- 患者情報を扱う医療系システムで「実在しない患者名がそれらしく表示される」状態は、本番実践では誤認リスクが最も高い

### 3.2 方針決定（どちらかを選ぶ。デフォルトは A）

```text
A. patients hydration を実装して実データ表示にする（推奨・本仕様のスコープ）
B. 実装完了まで patients 画面を production route から一時的に閉じる
   （screens/[resource] route で patients のみ 404 or /mobile-uiux/screens/home へ redirect）
```

B を選ぶ場合も「サンプル患者データを本番導線で表示し続ける」選択肢は取らない。

### 3.3 A 案の実装仕様

1. `MOBILE_UIUX_PRODUCTION_ASSET_RESOURCES` に `patients` を追加し、generated production asset を生成する
2. `dc-script-patch.ts` に `patients` 用 hydration adapter を追加する（既存5画面と同じ rename + delegate 方式）
3. BFF read payload の反映最小キー（v0.9 §0.19 と同様に絞る）:
   - 患者数系 KPI（総患者数 / 新規 / 離脱リスク数）
   - 患者リスト rows（表示は既存画面の情報設計範囲に限定。氏名・来院日等、既存カードが表示している項目のみ）
   - 分析タブの主要サマリ値
4. `MobileUiuxPatientAnalysisResponse` が患者リスト行を含まない場合は、contracts / BFF 側に **画面表示に必要な最小の rows を追加する**。その際:
   - PII は既存 patients 画面が表示している項目を超えて返さない
   - `AuditLogger.logDataAccess` の記録は維持する
5. bridge の `summarizePayload` に `patients` 分岐を追加する（件数つきメッセージ）

### 3.4 受け入れ条件

- `/mobile-uiux/screens/patients` を production flags で開いたとき、患者リスト・KPI がサンプルではなく BFF payload 由来である
- 該当テスト（`dc-script-patch.test.ts` / `production-asset.test.ts` / `mobile-uiux-patient-analysis.test.ts`）に patients 分を追加
- `--check` の対象に patients が入る

---

## 4. GAP-2: 残存サンプルデータの棚卸しと遮蔽（P0）

### 4.1 現状

hydration は v0.9 の方針どおり「最小キー」に絞って実装されている。そのため hydration 済み画面でも、以下のような **override 対象外の render values はサンプルデータのまま** DC script 内ハードコード配列（`this.APPTS` / `this.CLINICS` 等）から描画される。

- reservations: 一覧 rows は実データだが、詳細シート / タイムライン / 担当者シート / 予約フォームの選択肢はサンプル
- home: KPI / 予約サマリ / 日報状況は実データだが、それ以外のカード・グラフの一部はサンプル
- daily-reports / settings / settings-detail: 主要値以外の補助表示にサンプル残存の可能性

実データとサンプルが同一画面に混在すると、利用者はどちらが本物か判別できない。read-only 検証段階では許容されたが、write pilot を実クリニックに開放する本番実践では P0 で解消する。

### 4.2 実装仕様

1. **棚卸し**: 6画面 × 各 `renderVals()` の全キーについて「hydrated / sample / static(定数)」の3分類の一覧表を作成し、本仕様書の付録または `docs/stabilization/mobile-uiux-hydration-coverage-v1.0.md` としてコミットする。以後の PR はこの表を更新する
2. **分類ごとの扱い**:

```text
hydrated: そのまま
static:   文言・アイコン等。対応不要
sample:   次のいずれかを画面キーごとに明示的に決める
  (a) hydrateする（BFF payload / contracts を拡張）
  (b) 非表示にする（production transform / generated asset 側で該当ブロックを除去。
      原本 .dc.html は変更しない）
  (c) 「サンプル」ラベルを付与して残す（暫定。write 開放画面では不可）
```

3. **write 開放済み画面の必須条件**: write 導線（日報保存・予約更新・設定更新）が参照・表示するデータに (c) を残さない。書き込みの根拠になる表示値がサンプルである状態を禁止する
4. 詳細シート / 予約フォームの選択肢（メニュー・担当者）は、`/api/mobile-uiux/settings-detail` が返す `menus` / `resources` を流用して hydrate する（新規 BFF を増やさない）

### 4.3 受け入れ条件

- カバレッジ表がリポジトリに存在し、sample 分類の各キーに (a)/(b)/(c) の決定が記録されている
- write 開放画面（daily-reports / reservations / settings-detail）に (c) が残っていない
- (b) を選んだブロックについて、production asset に該当 DOM が含まれないことをテストで検証する

---

## 5. GAP-3: 再フェッチ contract（日付・店舗切替）（P0）

### 5.1 現状

- bridge の `boot()` は initial load で 1 回だけ `context` → read BFF を fetch し、`window.__MOBILE_UIUX_APPLY_READ_DATA__` に渡す
- hydration adapter は `__mobileUiuxHydratedVals` を **無条件で後勝ち merge** する
- したがって、画面内の日付ナビゲーション（前日/翌日）や店舗切替を操作しても BFF は再フェッチされず、hydrated 値が固定表示され続ける。日付を切り替えたのに当日の実データが出続ける、という **本番では明確に誤りとなる表示** が起きる

### 5.2 実装仕様

#### 5.2.1 bridge に再フェッチ API を追加

```js
window.MobileUiuxBridge.refreshReadData = async function(params) {
  // params: { date?: 'YYYY-MM-DD', clinicId?: string }
  // 1. currentContext が無ければ false
  // 2. clinicId は currentContext.accessibleClinicIds に含まれる場合のみ採用（含まれなければ false）
  // 3. 現在 screen の manifest entry から read URL を再構築（date / clinic_id を上書き）
  // 4. fetchJson → 成功時 applyReadData → true / 失敗時 既存 fallback 表示 → false
  // 5. read の in-flight 重複は mutation と同様に Map で抑止する
};
```

- 認可は従来どおりサーバ側（`ensureClinicAccess`）が担う。client 側の accessibleClinicIds チェックは UX 目的であり認可ではない
- read BFF 側は既に `date` / `clinic_id` query を受けるため **API 変更は不要**（reservations / home / daily-reports で date パラメータ名と形式 `YYYY-MM-DD` を確認済みの範囲で使う）

#### 5.2.2 hydration adapter 側

1. `__mobileUiuxHydratedVals` に加えて `__mobileUiuxHydratedKey`（date + clinicId）を保持する
2. 画面の日付切替 UI の既存 onClick から `refreshReadData({ date })` を呼ぶ配線を、generated production asset の DC script patch として追加する（原本非変更、rename + delegate 方式は既存踏襲）
3. 再フェッチ完了までの間、直前の hydrated 値を出し続けるのではなく、`data-mobile-uiux-bridge="loading"` 等の状態を dataset に出す（視覚デザインは変えない）

#### 5.2.3 店舗切替

- multi-clinic ユーザー（`accessibleClinicIds.length > 1`）の店舗切替 UI が既存画面にある場合のみ、同様に `refreshReadData({ clinicId })` へ配線する
- 既存 UI が無い画面に新規セレクタを追加することは本仕様のスコープ外（UI 非改変原則）

### 5.3 受け入れ条件

- reservations 画面で日付を切り替えると、切替先日付の BFF payload が主要表示値に反映される
- 切替先の fetch 失敗時は fallback status を表示し、**前日付の実データを切替先の日付として表示しない**
- スコープ外 clinicId を指定した `refreshReadData` は fetch せず false を返す（テスト）

---

## 6. GAP-4: `/api/mobile-uiux/*` レート制限（P1）

### 6.1 現状

`src/lib/rate-limiting/middleware.ts` の `apiRateLimit` は `/api/public/` のみに適用される。`/api/mobile-uiux/*` は認証必須ではあるが、レート制限は未適用。モバイル実機からの利用が始まると、リトライループや悪意ある認証済みクライアントによる連打を抑止する層がない。

### 6.2 実装仕様

1. `src/lib/rate-limiting/middleware.ts` に mobile BFF 用のパス判定を追加する

```ts
function isMobileUiuxApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/mobile-uiux/');
}
```

2. 適用ポリシー（既存 `RateLimitConfig` の type を追加。値は初期値であり、運用で調整する）:

| 対象 | key | 目安 |
|---|---|---|
| read（GET） | `mobile_uiux_read:{userId or ip}` | 60 req / 分 |
| write（POST/PATCH/PUT） | `mobile_uiux_write:{userId}` | 10 req / 分 |

3. 認証済みユーザー単位の key を優先し、未認証（セッション切れ）リクエストは IP key にフォールバックする
4. 429 応答は既存規約どおり `Retry-After` ヘッダーを付ける
5. Upstash Redis バックエンド不達時の挙動は既存 `apiRateLimit` の fail 方針（production では明示ログ）に合わせる
6. middleware の matcher / `PROTECTED_ROUTE_PREFIXES` との整合を確認する（`/mobile-uiux` は既に保護済み。今回は `/api/mobile-uiux` のレート制限のみ）

### 6.3 受け入れ条件

- read / write それぞれで limit 超過時に 429 + `Retry-After` が返るテスト
- write limit が read より厳しいことをテストで固定する
- `/api/health` 等の除外パスに影響しないこと

---

## 7. GAP-5: generated asset drift check の CI 組み込み（P1）

### 7.1 現状

`npm run mobile-uiux:check-production-assets` は存在するが、`.github/workflows/ci.yml` に含まれていない。原本 `.dc.html` や `dc-script-patch.ts` を変更したのに production asset の再生成を忘れると、**本番配信物だけが古いまま** になる。v0.9 §0.12 が CI 組み込みを要求していたが未実施。

### 7.2 実装仕様

1. CI の既存ゲート（①lint + type-check + scan:secrets）と同じ job または独立 step に追加する:

```yaml
- name: Mobile UIUX production asset drift check
  run: npm run mobile-uiux:check-production-assets
```

2. 失敗時のメッセージに再生成コマンド（`npm run mobile-uiux:generate-production-assets`）が表示されることは実装済みのため、CI 側の追加加工は不要
3. `dc-script-patch.ts` / `html-transform.ts` / `production-asset.ts` の変更も drift として検出されることを確認する（generator がこれらを require しているため自然に検出される）

### 7.3 受け入れ条件

- 原本 asset のみ変更した PR が CI で fail する（ローカルで再現確認）
- 再生成後は pass する

---

## 8. GAP-6: 予約作成（POST）write pilot の UI 配線（P1）

### 8.1 現状

- BFF `POST /api/mobile-uiux/reservations` は実装済み（Zod スキーマ `reservationInsertSchema`、customer/menu/staff の参照整合 guard、conflict 検出 409、staff nomination fee 正規化）
- bridge の `window.MobileUiuxBridge.createReservation` も実装済み
- しかし production asset に `createReservation` を呼ぶ UI 配線が存在しない（`updateReservation` のみ配線済み）

### 8.2 実装仕様

v0.9 §4.4 の段階開放順（作成は更新より慎重）を維持したうえで、次を行う。

1. reservations 画面の既存「予約作成フォーム」の保存 onClick から `createReservation(payload)` を呼ぶ DC script patch を追加する
2. payload adapter:
   - フォーム入力値 → `reservationInsertSchema` 互換の payload へ変換する
   - `clinic_id` は bridge 側で `defaultClinicId` を補完する（`normalizeDailyReportPayload` と同型の `normalizeReservationPayload` を追加）
   - menu_id / staff_id / customer_id は GAP-2 で hydrate した settings-detail 由来の実 ID を使う。**サンプル ID を payload に載せない**（これが GAP-2 を予約作成の前提条件にする理由）
3. 成功時は `applyReadScreen: "reservations"` で read model を再反映する（PATCH と同じ挙動に揃える）
4. conflict（409）は既存 `reservationConflict` メッセージを表示する
5. 開放 flag は既存どおり `MOBILE_UIUX_WRITE_ENABLED` + `MOBILE_UIUX_RESERVATION_WRITE_ENABLED` + DB entitlement。**作成専用の追加 flag は設けない**が、pilot clinic 限定運用（env allowlist または entitlement 行）で開始する

### 8.3 受け入れ条件

- flag off で作成導線が `disabled` status になり、POST が飛ばない
- 実 ID による作成成功 / conflict 409 / スコープ外 clinic 403 のテスト
- 成功後、一覧 rows に作成した予約が反映される

---

## 9. GAP-7: entitlement 運用の本番化（P1）

### 9.1 現状

- `clinic_feature_flags`（RLS + rollback つき）と `entitlements.ts` は実装済み
- fail-closed は確認済み: `useDbEntitlements=true` で行が無い/読めない場合は read/write とも拒否される
- ただし行の投入・更新手段が SQL 直接のみで、env allowlist から DB entitlement へ切り替える運用手順が文書化されていない

### 9.2 実装仕様

#### 9.2.1 切替 runbook（`docs/operations/RUNBOOK.md` に追記）

```text
1. 対象クリニックの clinic_feature_flags 行を投入する（初期は read のみ true）
2. staging で MOBILE_UIUX_USE_DB_ENTITLEMENTS=true にして
   /api/mobile-uiux/context の publicFlags が entitlement 由来になることを確認
3. production で MOBILE_UIUX_USE_DB_ENTITLEMENTS=true に切替
4. 一定期間の並走後、MOBILE_UIUX_ALLOWED_CLINIC_IDS を空にする
   （env allowlist は rollout gate として残置してよいが、entitlement として使わない）
5. write 開放は entitlement 行の write 列を対象クリニックだけ true にする
```

#### 9.2.2 管理 API（最小）

本格的な管理画面は作らない。既存 admin API 規約（`verifyAdminAuth` + `createScopedAdminContext`）に沿って最小の管理口を追加する。

```text
GET  /api/admin/mobile-uiux/entitlements?clinic_id=...   # 行の参照
PUT  /api/admin/mobile-uiux/entitlements                 # 行の upsert（admin roleのみ）
```

- 入力は Zod スキーマ（`clinic_id` UUID + boolean 6種 + `rollout_phase`）
- 変更は `AuditLogger.logAdminAction` に記録する（clinic_id は対象 ID として許容。PII なし）
- レスポンスは統一エンベロープ `{ success, data | error }`
- `updated_by` に操作者 user_id を設定する

### 9.3 受け入れ条件

- runbook 追記
- 管理 API の 401/403/バリデーション/成功/監査ログのテスト
- entitlement 行の変更が `/api/mobile-uiux/context` の publicFlags に反映されるテスト

---

## 10. GAP-8: 観測性（P2）

### 10.1 実装仕様

1. **403 reason logging の粒度統一**: 各 BFF で拒否時に reason code（`flag_disabled` / `entitlement_denied` / `clinic_scope_denied` / `role_denied` / `write_flag_disabled`）を server log へ出す。v0.9 §10.3 のログ方針（raw clinic_id / PII を通常ログに出さない）を維持する
2. **entitlement fetch error の区別**: `fetchMobileUiuxClinicEntitlements` は現在 DB エラー時に空 Map を返す（結果として fail-closed）。挙動は維持しつつ、エラー時は `logger.error` に query 失敗を記録し、「行が無い（未開放）」と「読めない（障害）」を運用ログ上で区別できるようにする
3. **bridge 失敗の可視化（最小）**: bridge の fallback / mutation failed 発生時に `navigator.sendBeacon` 等で新設の軽量 endpoint に通知する方式は **今回は採用しない**。代わりに、production smoke（§12）と Sentry の既存 API エラー捕捉でカバーする。クライアント計測の導入は別仕様とする

### 10.2 受け入れ条件

- 主要 reason code が server log に出ることをテストまたはログ検証で確認
- PII / raw clinic_id が通常ログに含まれないこと（既存 scan と目視レビュー）

---

## 11. GAP-9 / GAP-10: E2E smoke と status UX（P2）

### 11.1 Playwright smoke（GAP-9）

`src/__tests__/e2e-playwright/` に mobile-uiux smoke を追加する。既存の seed / fixture 規約（`e2e:validate-fixtures` / `e2e:seed`）に従う。

最小ケース:

```text
1. 認証済みユーザーで /mobile-uiux/screens/home を開き、
   - iPhone mock frame / stage controls が存在しない
   - data-mobile-uiux-shell="production" が body に付与されている
2. Bottom Nav タップで /mobile-uiux/screens/reservations へ遷移する
3. reservations 画面で seed 由来の予約行（患者名・件数・日付）が表示される
   （サンプルデータ固有の文字列が表示されていないことも確認する）
4. 未認証アクセスは /login?redirectTo=... へリダイレクトされる
5. （write pilot 環境のみ）日報保存 → mutation status success → 再表示
```

viewport は モバイル実機相当（例: 390x844, `isMobile: true`）を使う。日時は `src/lib/jst.ts` の JST ユーティリティ基準で seed と期待値を揃える（DoD-06 の既知の落とし穴）。

### 11.2 status 要素の最小整形（GAP-10）

- 既存の `role="status"` / dataset contract（`data-mobile-uiux-mutation-status` 等）は変更しない
- production shell CSS（`<style data-mobile-uiux-production-shell>`）に status 要素向けの最小スタイル（固定位置 / 背景 / 余白 / 自動非表示は CSS transition の範囲）を追加する
- 既存アプリ UI のデザイントークン（`--surface` / `--fg` 等）を使い、新しい色は導入しない
- テストの dataset ベースの検証はそのまま通ること

---

## 12. API 契約の本番確定事項

本番実践にあたり、以下を mobile BFF の確定 contract として明文化する（実装は概ね準拠済み。逸脱があれば修正対象）。

1. **エンベロープ**: 成功 `{ success: true, data, generatedAt }` / 失敗 `{ success: false, error: { code, message } }`。`generatedAt` は ISO 8601
2. **エラーコード**: `BAD_REQUEST` / `UNAUTHORIZED` / `FORBIDDEN` / `CONFLICT` / `INTERNAL`。HTTP status と一致させる（400/401/403/409/5xx）
3. **charset**: JSON レスポンスは `content-type: application/json; charset=utf-8` を明示する（PR-C で対応済みの箇所を全 endpoint に統一）
4. **キャッシュ**: 全 endpoint `dynamic = 'force-dynamic'` を維持し、レスポンスに `Cache-Control: no-store` を明示する（患者・予約データのブラウザ/中間キャッシュ残留防止）。未設定の endpoint があれば追加する
5. **日付**: query param `date` は `YYYY-MM-DD`（JST 解釈）。応答の `timezone: 'Asia/Tokyo'` を維持する
6. **clinic_id**: query / body の `clinic_id` は UUID 検証 + `ensureClinicAccess` 必須。応答にはスコープ検証済み clinic_id のみ含める。user email / patient PII は context 応答に含めない（現状準拠）
7. **互換性**: 既存フィールドの削除・意味変更はしない。追加は後方互換として扱い、bridge / adapter は未知キーを無視する（現状の isRecord ベース検証を維持）。URL versioning（`/v1/`）は導入しない

---

## 13. 環境変数・ロールアウト計画

### 13.1 フェーズ定義

```text
Phase 1（現状）: env flags 主導・read 有効・write pilot は env で個別開放
Phase 2: GAP-1〜3 完了後、pilot clinic で read の本番実践検証
Phase 3: MOBILE_UIUX_USE_DB_ENTITLEMENTS=true へ切替（GAP-7 runbook）
Phase 4: write を daily-report → reservation update → reservation create → settings の順に
         entitlement 行で clinic 単位開放
Phase 5: MOBILE_UIUX_ALLOWED_CLINIC_IDS を空にし、env は kill switch
         （MOBILE_UIUX_ENABLED / MOBILE_UIUX_WRITE_ENABLED）としてのみ運用
```

### 13.2 production env（Phase 3 以降の定常形）

```env
MOBILE_UIUX_ENABLED=true
MOBILE_UIUX_USE_DB_ENTITLEMENTS=true
MOBILE_UIUX_REAL_DATA_ENABLED=true
MOBILE_UIUX_WRITE_ENABLED=true            # global kill switch。clinic別開放はDB行
MOBILE_UIUX_RESERVATION_WRITE_ENABLED=true
MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED=true
MOBILE_UIUX_SETTINGS_WRITE_ENABLED=true
MOBILE_UIUX_ALLOWED_CLINIC_IDS=
MOBILE_UIUX_ALLOWED_ROLES=admin,clinic_admin,manager,therapist,staff
```

env の AND 条件（env flag && entitlement flag）は現行実装のまま維持する。env=true は「開放可能」を意味し、実際の開放は entitlement 行が決める。

---

## 14. テスト要件（追加分サマリ）

| 対象 | テスト |
|---|---|
| GAP-1 | patients adapter patch / production asset 生成 / 主要値が payload 由来 |
| GAP-2 | write 開放画面にサンプル由来文字列が残らない fixture test / (b) 除去ブロックの非存在 |
| GAP-3 | refreshReadData の成功・失敗・スコープ外 clinicId 拒否 / 日付切替反映 |
| GAP-4 | read/write 別レート制限の 429 + Retry-After |
| GAP-5 | CI 上で drift fail（手元再現で確認） |
| GAP-6 | 予約作成 flag off 403 / 成功 / conflict 409 / スコープ外 403 / 一覧反映 |
| GAP-7 | 管理 API の認可・バリデーション・監査ログ / context への反映 |
| GAP-8 | 403 reason code ログ / PII 非混入 |
| GAP-9 | Playwright smoke 5 ケース |
| 契約 | 全 endpoint の charset / Cache-Control: no-store / エンベロープ形式 |

回帰: 既存 `src/__tests__/mobile-uiux/` と `src/__tests__/api/mobile-uiux-*.test.ts` を全通し、`test:pr05:focused` は非対象のまま維持（mobile-uiux はゲート対象に含めない。CI には GAP-5 の drift check のみ追加する）。

---

## 15. PR 分割案

| PR | 内容 | 依存 | 優先度 |
|---|---|---|---:|
| PR-1 | GAP-5: CI drift check 組み込み | なし | P1（最小・即日） |
| PR-2 | GAP-2: hydration カバレッジ棚卸し表 + write 画面のサンプル遮蔽 | なし | P0 |
| PR-3 | GAP-1: patients hydration（BFF rows 拡張が必要なら同 PR で contracts + route + テスト） | PR-2 の棚卸し表 | P0 |
| PR-4 | GAP-3: bridge refreshReadData + 日付切替配線 | PR-2 | P0 |
| PR-5 | GAP-4: mobile BFF レート制限 | なし | P1 |
| PR-6 | GAP-6: 予約作成 UI 配線 | PR-2 / PR-4 | P1 |
| PR-7 | GAP-7: entitlement 管理 API + runbook | なし | P1 |
| PR-8 | GAP-8: reason code ログ + entitlement エラーログ | なし | P2 |
| PR-9 | GAP-9/10: Playwright smoke + status 最小整形 | PR-3/4 完了後が望ましい | P2 |
| PR-10 | §12 契約確定の残差修正（charset / no-store の全 endpoint 統一） | なし | P1 |

1 task = 1 PR、小さく可逆に（AGENTS.md）。DB を触るのは PR-7 のみ（`clinic_feature_flags` は既存テーブルのため migration 不要。管理 API のみ）。

---

## 16. リスクと対策

| リスク | 致命度 | 対策 |
|---|---:|---|
| サンプル患者名を実在患者と誤認して業務判断する | 高 | GAP-1/2 を write 拡大より先に完了する（P0） |
| 日付切替で当日データが他日付として表示される | 高 | GAP-3 の hydratedKey + 再フェッチ。失敗時は前データを他日付として出さない |
| サンプル ID を含む予約作成 payload が実 DB に書かれる | 高 | GAP-6 は GAP-2 完了を前提条件にする。BFF 側参照整合 guard（実装済み）が最後の砦 |
| 認証済みクライアントからの BFF 連打 | 中 | GAP-4 レート制限。write は user 単位で厳しく |
| production asset の陳腐化に気づかない | 中〜高 | GAP-5 で CI fail に昇格 |
| entitlement 切替時の全クリニック閉塞 | 中 | fail-closed は仕様どおり。runbook の staging 検証 + env allowlist 並走期間で緩和 |
| 管理 API の権限逸脱 | 高 | `verifyAdminAuth` + admin role 限定 + 監査ログ + RLS（write_admin_only ポリシー実装済み） |
| ログへの PII 混入 | 高 | reason code 中心の方針を全 PR のレビュー観点に含める。`scan:secrets` 維持 |

---

## 17. 受け入れ条件（本仕様全体）

1. production flags + DB entitlement 有効状態で、6画面すべての主要表示値および write 導線が参照する値が BFF 実データ由来である（サンプル混在は棚卸し表で (b)/(c) 管理された残差のみ。write 画面は (c) ゼロ）
2. 日付切替・（UI が存在する画面での）店舗切替が BFF 再フェッチに接続されている
3. `/api/mobile-uiux/*` にレート制限が効いている
4. CI が production asset drift で fail する
5. entitlement の投入〜切替〜write 開放が runbook + 管理 API で SQL 直接なしに運用できる
6. Playwright smoke がグリーン
7. 既存の認可・RLS・clinic scope テストがすべて維持されている（緩和ゼロ）

---

## 18. 判断

```text
最優先は「実データとサンプルの混在解消」（GAP-1/2/3）。
API 層自体はすでに本番品質に近く、残作業の本質は
「画面とAPIの未接続部分」と「運用ガード（rate limit / CI / entitlement 運用）」である。

即日やる:   PR-1（CI drift check）
P0 で回す:  PR-2 → PR-3 / PR-4
その後:     PR-5 / PR-10 / PR-7 → PR-6 → PR-8 / PR-9

やらないこと:
- DC runtime の React 置き換え
- URL versioning の導入
- クライアント計測基盤の新設（Sentry + smoke で代替）
- 本格的な entitlement 管理画面（最小 API のみ）
```
