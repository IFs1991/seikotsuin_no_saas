# Therapist UI/UX Slimming Spec v0.1

- Status: draft
- Date: 2026-06-15
- File: `docs/stabilization/spec-therapist-uiux-slimming-v0.1.md`
- Target repository: `IFs1991/seikotsuin_management_saas`
- Feature: therapist（施術者）ロール向けの導線スリム化 — ダッシュボードを廃し、ログイン直後に予約管理を表示。経営系メニューを非表示にする。
- Related specs:
  - `spec-manager-admin-section-v0.1.md`（ロール別ナビ再設計の先行事例）
  - `spec-auth-role-alignment-v0.1.md`（ロール正規化・ログイン redirect の正本）

---

## 0. Background / Problem Statement

therapist（施術者）は現状、**専用のナビゲーション分岐を持たない**。
`getVisibleNavigationItems()`（`src/lib/navigation/items.ts`）のロジック上、
therapist は HQ admin でも area manager でも clinic admin でもないため、
`showOperationMenus = true` / `showAdminMenus = false` となり、
`OPERATION_MENU_ITEMS` をフルで受け取る。

### 現状の事実（2026-06-15 時点のコード調査結果）

| レイヤー | 現状 |
|---|---|
| ナビゲーション | therapist は `OPERATION_MENU_ITEMS`（ダッシュボード / 日報管理 / 予約管理 / 患者分析 / 収益分析 / スタッフ分析 / 希望シフト / AI分析）をフル表示（`src/lib/navigation/items.ts`） |
| ログイン後 redirect | `clinicLogin()`（`src/app/(public)/login/actions.ts`）は HQ→`/admin`、manager→`/manager`、clinic_id なし→`/onboarding`、それ以外（clinic_admin / **therapist** / staff）→`/dashboard`。therapist 固有の分岐はない |
| 予約→患者導線 | `AppointmentDetail.tsx` に `/patients/${customerId}` への「患者詳細」リンクと、`AppointmentHistoryPanel`（同一患者の過去予約）が**既に存在**（`src/app/(app)/reservations/components/`） |
| 予約書き込み権限 | `RESERVATION_WRITE_ROLES = { admin, clinic_admin, therapist, staff }`（`src/app/(app)/reservations/permissions.ts`）。therapist は予約の閲覧・登録・編集が可能 |
| 患者ルート権限 | `/patients/**` は `(app)` 配下の認証必須画面。`STAFF_ROLES`（admin/clinic_admin/manager/therapist/staff）に therapist を含む |
| クイックアクセス | `QUICK_ACCESS_ITEMS`（日報入力 / 新規予約 / 患者検索 / 収益レポート）も therapist にフル表示 |
| モバイル下部ナビ | `mobile-bottom-nav.tsx` は独自の固定リスト（ホーム / 日報 / 予約 / 患者 / 収益 / AI）を持ち、ロール分岐していない |

### 運用前提（壁打ちで確認した実態）

- 現場の日報入力・予約入力は、多くの店舗で**1台の共有PCを clinic_admin アカウントで操作**して行う（個人のPC・スマホからは入力しない運用が一般的）。
- したがって therapist の個人ログインは「自分の予約・スケジュールを確認する**閲覧寄りの軽量ロール**」と位置づけるのが自然。
- 共有PCで clinic_admin が現場作業する際の「管理者メニューへの簡易パスワードゲート」は**本仕様のスコープ外（後回し）**。

---

## 1. Summary

therapist ロールに**専用の operation メニュー**を割り当て、経営者向けの集計画面を
非表示にする。あわせてログイン後の遷移先を therapist のみ `/reservations` に変更し、
「ログインしたらすぐ予約管理」を実現する。

患者情報は独立メニューを持たず、**予約画面（`AppointmentDetail` の「患者詳細」リンク）
経由でのみ参照**する（既存導線を活用）。

---

## 2. Scope

### 2.1 In scope

1. therapist 専用 operation メニュー `THERAPIST_OPERATION_MENU_ITEMS` の追加と、
   ナビ解決ロジック（`getVisibleNavigationItems` / `getOperationMenuItemsForRole`）への分岐。
2. therapist のログイン後 redirect を `/reservations` に変更。
3. therapist 向けクイックアクセス（`getQuickAccessItemsForRole`）のスリム化。
4. 上記を固定するユニットテスト（TDD）。

### 2.2 Out of scope（follow-up）

- clinic_admin の現場オペレーション動線の最適化（予約＋日報を主に、管理メニューを奥へ）。
- 共有PC運用時の「管理者メニュー簡易パスワードゲート」。
- `mobile-bottom-nav.tsx` のロール分岐対応（→ §6 で扱い方針を明記）。
- 日報機能そのものの縮小・廃止（今回は**メニューに残す**判断）。
- RLS / 認可ロジックの変更（therapist の権限集合は現状維持）。

---

## 3. Design

### 3.1 therapist operation メニュー

`OPERATION_MENU_ITEMS` から以下のみを残した派生リストを定義する。

| メニュー | id | 残す/外す | 備考 |
|---|---|---|---|
| 予約管理 | `reservations` | ✅ 残す | **therapist のホーム**。subItems（タイムライン / 新規予約 / 予約一覧）はそのまま |
| 日報管理 | `daily-reports` | ✅ 残す | 当面残す（運用が固まるまで）。subItems（日報入力 / 日報一覧）も維持 |
| 希望シフト | `shift-requests` | ✅ 残す | 施術者は自分のシフト希望を提出する必要がある |
| ダッシュボード | `dashboard` | ❌ 外す | |
| 患者分析 | `patients` | ❌ 外す | 患者参照は予約画面経由（§3.3） |
| 収益分析 | `revenue` | ❌ 外す | 経営者向け |
| スタッフ分析 | `staff` | ❌ 外す | 経営者向け |
| AI分析 | `ai-insights` | ❌ 外す | 経営者向け |

実装方針: `AREA_MANAGER_OPERATION_MENU_ITEMS` と同様に、`OPERATION_MENU_ITEMS` を
filter/map した `THERAPIST_OPERATION_MENU_ITEMS` を定義する。AI フラグ
（`isAiInsightsEnabled()`）の有無に関わらず therapist は AI分析を出さないため、
`THERAPIST_OPERATION_MENU_ITEMS` は AI を含めず単一定義でよい。

メニュー並び順は **予約管理 → 日報管理 → 希望シフト**（予約をホーム＝最上段）。

### 3.2 ナビ解決ロジックの分岐

`src/lib/navigation/items.ts`:

- `isTherapistRole(role)` を追加（`normalizeRole(role) === 'therapist'`）。
- `getOperationMenuItemsForRole(role)`: area manager 判定の前後で therapist を判定し、
  therapist のときは `THERAPIST_OPERATION_MENU_ITEMS` を返す。
- `getVisibleNavigationItems()`: `showAdminMenus = false` 分岐（therapist は admin ナビ
  を持たない）で、area manager 判定に並べて therapist 判定を追加。
- `getQuickAccessItemsForRole(role)`: therapist には「新規予約」中心の最小セット
  （例: 新規予約 / 日報入力）を返す。収益レポート・患者検索は外す。

> 注: therapist は `canUseAdminNavigation()` が false のままなので
> `showAdminMenus = false`。admin/manager 系の分岐には影響しない。

### 3.3 患者参照の導線（既存活用・新規実装なし）

患者専用メニューは置かない。施術者は予約タイムライン → 予約詳細
（`AppointmentDetail`）の「患者詳細」リンク（`/patients/${customerId}`）と
`AppointmentHistoryPanel`（同一患者の過去予約）で患者情報を参照する。

**検証必須**: 患者分析メニューを外しても、therapist が `/patients/[id]`
（患者詳細）に到達・閲覧できること。
- 該当ルートの layout ガード / middleware が therapist を弾かないこと。
- RLS が therapist の clinic スコープ内で患者を読めること。

→ ここが弾かれる場合は本仕様の前提（「予約画面から患者を見れれば十分」）が崩れるため、
別途ルートガード調整が必要（その場合は本仕様に追記）。

### 3.4 ログイン後 redirect

`src/app/(public)/login/actions.ts` の `clinicLogin()`:

- HQ / area manager / no-clinic の既存分岐の**後**、最終的な `/dashboard` redirect の
  **前**に therapist 分岐を追加:
  ```
  if (isTherapistRole(permissions?.role)) {
    ...record + last_login_at 更新...
    revalidatePath('/', 'layout');
    redirect('/reservations');
  }
  ```
- `isTherapistRole` は `@/lib/constants/roles` に追加するか、ローカルで
  `normalizeRole(role) === 'therapist'` を用いる（既存の `isAreaManagerRole` に倣う）。

> staff ロールの扱いは現状維持（`/dashboard`）。本仕様は therapist のみ対象。

### 3.5 ダッシュボードへの直接リンク

AppShell ロゴ / ホームリンク等が `/dashboard` に固定されている場合、therapist は
ダッシュボード未表示なので「ホーム」=`/reservations` に寄せるのが一貫する。
実装時に AppShell のホームリンク解決を確認し、必要なら therapist のホーム href を
`/reservations` にする（軽微なら本仕様に含める。広範なら follow-up 化）。

---

## 4. Affected files（想定）

| ファイル | 変更内容 |
|---|---|
| `src/lib/navigation/items.ts` | `THERAPIST_OPERATION_MENU_ITEMS` 追加、`isTherapistRole` 追加、`getOperationMenuItemsForRole` / `getVisibleNavigationItems` / `getQuickAccessItemsForRole` に therapist 分岐 |
| `src/app/(public)/login/actions.ts` | therapist の `/reservations` redirect 分岐追加 |
| `src/lib/constants/roles.ts` | （任意）`isTherapistRole` ヘルパー追加 |
| `src/__tests__/lib/navigation-items.test.ts` | therapist ナビ表示のテスト追加 |
| `src/__tests__/...`（login） | therapist redirect のテスト（既存テスト構成に合わせる） |
| AppShell ホームリンク（§3.5 で特定） | 必要時のみ |

---

## 5. Test plan（TDD / t-wada 流）

### 🔴 Red → 🟢 Green の順で 1 ケースずつ

1. `getOperationMenuItemsForRole('therapist')` が
   `[reservations, daily-reports, shift-requests]` の id のみを返す（dashboard /
   patients / revenue / staff / ai-insights を含まない）。
2. AI フラグ ON でも therapist の結果に `ai-insights` が含まれない。
3. `getVisibleNavigationItems({ role: 'therapist', isHqAdmin:false, showOperationMenus:true, showAdminMenus:false })` が therapist operation メニューのみを返す。
4. `reservations` の subItems（タイムライン / 新規予約 / 予約一覧）が therapist でも保持される。
5. `getQuickAccessItemsForRole('therapist')` が収益・患者検索を含まない最小セットを返す。
6. ログイン: therapist の `permissions.role` で `redirect('/reservations')` が呼ばれる
   （既存 login テストのモック手法に合わせる）。
7. リグレッション: clinic_admin / staff / manager / admin のナビ・redirect が不変。

### セキュリティ不変条件

- 本仕様は**表示の出し分けのみ**。therapist の権限集合（`STAFF_ROLES` /
  `RESERVATION_WRITE_ROLES`）は変更しない。メニューを消しても RLS / API 認可は
  最後の砦として従来どおり機能する（クライアント側の非表示だけに依存しない）。

---

## 6. mobile-bottom-nav の扱い

`mobile-bottom-nav.tsx` は独自の固定リスト（ホーム / 日報 / 予約 / 患者 / 収益 / AI）を
持ちロール分岐していない。本仕様（デスクトップ／サイドナビのスリム化）とは別系統のため、
**今回はスコープ外**とし follow-up で同じ方針（予約中心・経営系を外す）を適用する。
ただしモバイルでの therapist 体験が重要なら本仕様に取り込む（→ open question）。

---

## 7. Open questions

1. AppShell の「ホーム/ロゴ」リンク先は therapist でも `/reservations` に寄せるか
   （§3.5）。広範な変更になる場合は別タスク化。
2. therapist が `/patients/[id]` に到達・閲覧できるか（§3.3 の検証）。弾かれる場合は
   ルートガード調整を本仕様に追加。
3. mobile-bottom-nav を今回含めるか（§6）。
4. staff ロールも therapist と同様にスリム化するか（今回は現状維持）。

---

## 8. Rollback

- ナビ・redirect の表示分岐のみのため、コード revert で原状復帰可能（DB マイグレーション
  なし）。`THERAPIST_OPERATION_MENU_ITEMS` 追加と各分岐、login の therapist 分岐、
  関連テストを revert すれば therapist は従来の `OPERATION_MENU_ITEMS` フル表示・
  `/dashboard` redirect に戻る。

---

## 9. Follow-up（別タスク候補）

- clinic_admin の現場オペレーション動線最適化（予約＋日報を主に、管理メニューを奥へ）。
- 共有PC運用時の管理者メニュー簡易パスワードゲート。
- 日報フローの縮小／廃止判断（運用が固まってから）。
- mobile-bottom-nav のロール分岐。
