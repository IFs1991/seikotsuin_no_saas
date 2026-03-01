# 予約画面 UI/UX 修正計画書 v1.5

**作成日:** 2026-02-20
**対象バージョン:** 現行 main ブランチ
**評価観点:** UI/UXデザイン + 予約機能の動作確認
**文書版:** v1.5（ファイル名は互換性のため v1.0 のまま）

---

## 概要

UI/UXデザイナー視点のコードレビューにより発見された問題を、優先度別に整理した修正計画書。
既存の `Reservation_UI_Integration_MVP_Improvement_Spec.md` と重複しない範囲を対象とする。

---

## DBスキーマ整合性確認（Supabase シニアエンジニアレビュー）

> **このセクションは本計画書をDB層から照合し、不整合を修正した結果を記録する。**
> 参照マイグレーション: `20251104000100_reservation_system_schema.sql`,
> `20251222000100_add_clinic_id_reservation_tables.sql`,
> `20260218000200_rls_reservation_tables_tenant_boundary.sql`,
> `20260218000500_clinic_id_not_null_reservation_tables.sql`

### スキーマ確定事項

#### reservations テーブル（最終形）

| カラム | 型 | 制約 | 備考 |
|--------|----|------|------|
| `id` | UUID | PK | |
| `clinic_id` | UUID | NOT NULL, FK→clinics | マルチテナント境界（v0.2 で NOT NULL 化） |
| `customer_id` | UUID | NOT NULL, FK→customers | |
| `menu_id` | UUID | NOT NULL, FK→menus | |
| `staff_id` | UUID | NOT NULL, FK→resources | スタッフ or 施術室/設備 |
| `start_time` | TIMESTAMPTZ | NOT NULL | |
| `end_time` | TIMESTAMPTZ | NOT NULL, > start_time | |
| `status` | VARCHAR(50) | NOT NULL, DEFAULT 'unconfirmed' | 8値 CHECK 制約（下記参照） |
| `channel` | VARCHAR(50) | NOT NULL, DEFAULT 'phone' | 4値 CHECK 制約 |
| `notes` | TEXT | | |
| `selected_options` | JSONB | DEFAULT '[]' | メニューオプション選択 |
| `price` | DECIMAL(10,2) | | 予約時料金 |
| `actual_price` | DECIMAL(10,2) | | 実請求額 |
| `payment_status` | VARCHAR(50) | DEFAULT 'unpaid' | |
| `is_deleted` | BOOLEAN | DEFAULT false | **論理削除フラグ**（物理削除非推奨） |
| `deleted_at` | TIMESTAMPTZ | | |
| `deleted_by` | UUID | FK→auth.users | |

#### status 有効値（DB CHECK 制約）

```sql
status IN (
  'tentative',     -- 仮予約（UIカラー: pink）
  'confirmed',     -- 確定（UIカラー: blue）
  'arrived',       -- 来院（UIカラー: purple）
  'completed',     -- 完了（UIカラー: purple）
  'cancelled',     -- キャンセル（UIカラー: grey）
  'no_show',       -- 無断欠席（UIカラー: grey）
  'unconfirmed',   -- 未確認（UIカラー: orange）★ DB DEFAULT
  'trial'          -- 体験（UIカラー: pink）
)
```

> **重要**: DB の `DEFAULT 'unconfirmed'` が最重要。新規登録直後の予約は必ず `orange` 表示になる。

#### RLS ポリシー（予約取消に関わる制約）

```sql
-- reservations_update_for_staff
-- 予約更新（status='cancelled' を含む）が可能なロール:
-- admin, clinic_admin, manager, therapist, staff
CREATE POLICY "reservations_update_for_staff"
ON public.reservations FOR UPDATE
USING (
    public.get_current_role() IN ('admin', 'clinic_admin', 'manager', 'therapist', 'staff')
    AND public.can_access_clinic(clinic_id)
);
```

#### 取消方針（キャンセル運用）

`reservation_history` は `REFERENCES reservations(id) ON DELETE CASCADE` で定義されている。
物理 DELETE を実行すると、予約の変更履歴が全て消滅する。

```
物理削除（DELETE）→ reservation_history も CASCADE 削除 → 監査ログ消失 ❌
取消（PATCH status='cancelled'）→ 履歴は保全される ✅
```

**方針: UI からの操作は「削除」ではなく「取消」に統一する。**
実装は `PATCH /api/reservations` で `status = 'cancelled'` を更新する。
予約画面から物理 DELETE を呼び出さない（履歴保全のため）。

---

## 修正対象ファイル一覧

| ファイル | 分類 |
|----------|------|
| `src/app/reservations/page.tsx` | ロジック・状態管理 |
| `src/app/reservations/components/Header.tsx` | UI |
| `src/app/reservations/components/Scheduler.tsx` | UI・ロジック |
| `src/app/reservations/components/AppointmentDetail.tsx` | 機能未実装 |
| `src/app/reservations/components/AppointmentForm.tsx` | UX |
| `src/app/reservations/components/AppointmentSummary.tsx` | UI |
| `src/app/reservations/constants.ts` | 定数管理 |

---

## フェーズ1: Critical Bug 修正（機能が動かない）

### 1-1. 取消ボタンの実装

**問題:**
`AppointmentDetail.tsx:145-150` の取消ボタンに `onClick` ハンドラが存在しない。
現在の業務要件では「削除」ではなく「取消（status='cancelled'）」が正しいため、文言と処理の両方を修正する必要がある。

**現状コード:**
```tsx
// AppointmentDetail.tsx:145-150
<button
  className='p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors'
  title='削除'
>
  <Trash2 className='w-5 h-5' />
</button>
```

**修正方針:**

> ⚠️ **DBスキーマ整合性注意事項**
>
> 1. **取消は `status='cancelled'` の UPDATE で実装すること。**
>    `reservation_history` が `ON DELETE CASCADE` で定義されているため、物理 DELETE は監査ログを消滅させる。
>    予約画面から DELETE API は呼ばず、PATCH 更新のみを使う。
>
> 2. **`staff` / `therapist` も取消可能。**
>    取消は UPDATE 扱いであり、RLS `reservations_update_for_staff` の対象。
>    UI では `admin` / `clinic_admin` / `manager` / `therapist` / `staff` に取消ボタンを表示する。
>
> 3. **APIのロール制約を明示すること（SaaSベストプラクティス）。**
>    `PATCH /api/reservations` では `processApiRequest` に `allowedRoles` を必ず指定し、
>    `admin` / `clinic_admin` / `manager` / `therapist` / `staff` 以外（例: `customer`）を拒否する。
>    UI表示制御だけに依存せず、APIガード + RLS + UI の3層で防御する。

1. `AppointmentDetail.tsx` に `onCancelReservation?: (id: string) => Promise<AppointmentUpdateResult>` props を追加
   - 戻り型は既存の `onUpdate` と同じ `Promise<AppointmentUpdateResult>` に統一する（`Promise<void>` は不可）
2. 確認ダイアログ（インライン表示 or shadcn の `AlertDialog`）を表示してから PATCH API（`status='cancelled'`）を呼ぶ
3. `page.tsx` 側に `handleCancelAppointment` ハンドラを実装し `AppointmentDetail` に渡す
4. `PATCH /api/reservations` に `allowedRoles` を追加し、`STAFF_ROLES` 相当で明示ガードする
5. `api.ts` に `cancelReservation` 関数を追加し、`updateReservation` と同一契約で利用できるようにする
6. 取消成功後: モーダルを閉じ、タイムライン上の色が `grey` に更新されることを確認する
7. 既に `cancelled` の予約では取消ボタンを非活性にする（多重操作防止）

**対象ファイル:**
- `AppointmentDetail.tsx` — props 追加 + 確認ダイアログ実装 + ロール判定による表示制御 + 文言修正（削除→取消）
- `src/app/api/reservations/route.ts` — `PATCH` に `allowedRoles` を明示（SaaSベストプラクティス）
- `api.ts` — `cancelReservation` 関数を新規追加
- `page.tsx` — `handleCancelAppointment` ハンドラ追加

**実装ステータス（2026-02-22）:**
- [x] `AppointmentDetail.tsx` に取消ハンドラ（確認ダイアログ付き）を実装
- [x] `page.tsx` で `admin/clinic_admin/manager/therapist/staff` のときのみ取消を有効化
- [x] `useAppointments.ts` に `cancelAppointment` を追加し `PATCH status='cancelled'` を実行
- [x] `DELETE /api/reservations` を 405 に変更し、物理削除経路を予約画面向けAPIで抑止
- [x] `PATCH /api/reservations` の `allowedRoles` 明示ガード（`STAFF_ROLES` import + 第2 `processApiRequest` に追加）
- [x] `src/app/reservations/api.ts` の `cancelReservation` 関数分離（`updateReservation` を内部利用する薄いラッパーとして実装）

---

### 1-2. ヘッダーアラートの動的化

**問題:**
`Header.tsx` の2つのアラートボタンが常に赤く表示され続ける。
未確認予約が0件でも「未確認の予約があります」と表示される。

**現状コード:**
```tsx
// Header.tsx
<button className='bg-rose-400 hover:bg-rose-500 text-white ...'>
  未確認の予約があります
</button>
```

**修正方針:**
1. `Header.tsx` に `pendingCount: number` と `notificationCount: number` props を追加
2. 件数が0の場合はボタンをグレー（非警告）スタイルに切り替え
3. 件数が1以上の場合はバッジ（数字）を表示する
4. `page.tsx` から `pendingAppointments.length` を渡す

> ⚠️ **DBスキーマ整合性注意事項**
>
> 現在 `useAppointments.ts` の `pendingAppointments` は `status === 'unconfirmed'` のみフィルタしている。
> DB には `tentative`（仮予約）ステータスも存在する。
> 業務上、仮予約も「未確認」扱いでヘッダーに表示するかどうかの仕様決定が必要。
>
> **推奨（MVP段階）:** `status === 'unconfirmed'` のみ（現行維持）。
> 将来的に `tentative` も含める場合は `pendingAppointments` のフィルタ条件を変更する。

**修正後のイメージ:**
```
件数 > 0 → bg-rose-400（赤）+ "未確認 3件" バッジ
件数 = 0 → bg-gray-200（グレー）+ "確認済み" テキスト or ボタン非表示
```

**対象ファイル:**
- `Header.tsx` — props 追加 + 条件スタイル
- `page.tsx` — `pendingAppointments.length` を渡す

**実装ステータス（2026-02-22）:**
- [x] `Header.tsx` に `pendingCount` / `notificationCount` props を追加（デフォルト値 `0`）
- [x] `pendingCount > 0` のとき `rose-400`（赤）ボタン "未確認 N件" を表示
- [x] `pendingCount = 0` のとき `gray-200`（グレー）ボタン "確認済み" を表示
- [x] `notificationCount > 0` のとき `rose-400`（赤）ボタン "未読 N件" を表示
- [x] `notificationCount = 0` のとき `gray-200`（グレー）ボタン "お知らせなし" を表示
- [x] `page.tsx` から `pendingAppointments.length` を渡す

---

### 1-3. お知らせ機能の実装（staff/therapist 対応）

**問題:**
`page.tsx:214` で `const notifications = [] as Notification[]` とハードコーディングされており、
「未確認のお知らせがあります」ボタンを押しても常に空のモーダルが表示される。

**修正方針:**
- `/api/notifications` エンドポイントを新規作成（`staff` / `therapist` を含む）
- `useNotifications` フックを実装
- `page.tsx` でデータ取得し `notifications` に渡す
- `Header.tsx` に `notificationCount` を渡し、0件時はグレー化/非表示を切り替える

> ℹ️ **API設計補足:**
> 既存の `/api/admin/notifications` は `ADMIN_UI_ROLES`（admin/clinic_admin）制約のため、
> 予約画面（staff/therapist含む）ではそのまま使えない。
> 予約画面向けには別API（`/api/notifications`）で `staff` 系ロールを許可する。
>
> **マルチテナント通知スコープ（推奨）:**
> - 子テナント（clinic）: 当該 `clinic_id` の運用通知を表示（staff/therapistを含む）
> - 子テナント間の通知飛び越えは禁止（子Aの通知を子Bへ表示しない）
> - 親テナント（HQ）: 子テナントの予約イベントを「親向け通知」として別ストリームで受信
> - 実装上は、同一イベントを「clinic向け」と「HQ向け」にファンアウトし、閲覧ポリシーを分離する
> - HQ向けは原則としてPII最小化（必要最小限の情報のみ）で通知する

> ℹ️ **DBスキーマ補足:**
> `public.notifications` テーブルは **既に存在する**（`20260102000200_notifications_dedupe_unique.sql` で重複排除が実施済み）。
> ただし予約系マイグレーションとは別ライフサイクルで管理されており、カラム定義は別途確認が必要。
> 実装時は `message`→`content`、`is_read`→`isRead` の変換をAPI層で行うこと。
> テーブルが既存である以上、新規テーブル作成は不要だが、API からの読み書きの前にカラム一覧を確認すること。

**判断:** 本件では通知を staff/therapist まで提供する要件があるため、実装を優先する。

**対象ファイル:**
- `src/app/api/notifications/route.ts` — 予約画面向け通知API（staff/therapist対応）
- `Header.tsx` — 件数表示と0件時の表示制御
- `page.tsx` — 通知データ取得・モーダル連携
- `src/app/reservations/types.ts` — 通知DTOとの型整合（必要なら変換型を追加）

**実装ステータス（2026-02-22）:**
- [x] `Header.tsx` の `notificationCount` prop 追加・0件時グレー化（1-2 と同時実装）
- [x] `page.tsx` で `notifications.length` を `notificationCount` に渡す
- [ ] `/api/notifications` エンドポイント新規作成（**次フェーズ**）
- [ ] `useNotifications` フック実装（**次フェーズ**）
- [ ] 親テナント向け通知ファンアウト実装（**次フェーズ**）

> ℹ️ **現状:** `notifications` は `page.tsx` 内で `[] as Notification[]` のままハードコードされている。
> `notificationCount` が常に `0` のため、お知らせボタンはグレー表示（"お知らせなし"）で固定。
> 通知 API の実装は次フェーズに持ち越し。

---

### 1-4. D&D移動でメモが消える不具合の修正

**問題:**
`useAppointments.ts` の `moveAppointment` は `notes` を送らずに PATCH しており、
API側の `notes: dto.notes ?? null` によって既存メモが `null` 上書きされるリスクがある。

**修正方針:**
1. `moveAppointment` で既存 `memo` を `notes` として送る
2. API側は未指定項目を上書きしない実装へ見直す（`undefined` と `null` を区別）
3. 回帰テストを追加（移動前後で `memo` が保持されること）

**対象ファイル:**
- `src/app/reservations/hooks/useAppointments.ts`
- `src/app/api/reservations/schema.ts`
- `src/__tests__/pages/reservations.test.tsx`（または hooks テスト）

**実装ステータス（2026-02-22）:**
- [x] `moveAppointment` に `notes: current.memo` を追加して PATCH payload に含める
- [x] `mapReservationUpdateToRow` の `notes` フィールドを `if (dto.notes !== undefined)` 条件付き包含に修正（DB への null 上書き防止）
- [x] 回帰テスト追加: `useAppointments.reservations.test.tsx` の "keeps notes in PATCH payload when moving appointment"
- [x] 回帰テスト追加: `reservations-schema.test.ts` の "does not overwrite notes when notes is undefined"

---

## フェーズ2: UX 改善（業務フローの改善）

### 2-1. ネイティブ `alert()` をインライン表示に変更

**問題:**
`Scheduler.tsx:131` でドラッグ&ドロップ競合時にブラウザネイティブの `alert()` を使用。
他のエラー表示はすべてインライン（`<div className='text-red-700'>...`）なのに不統一。

**現状コード:**
```tsx
// Scheduler.tsx:131
if (hasConflict) {
  alert('予約が重複しているため移動できません。');
  return;
}
```

**修正方針:**
- `Scheduler` コンポーネントに `onMoveError?: (message: string) => void` props を追加
- `page.tsx` 側の `updateError` state と統合して一元管理
- または `Scheduler` 内に一時表示用のローカルエラー state を追加（toast 風に3秒で消える）

> ℹ️ **DBスキーマ補足:**
> 重複チェックは DB 側に `check_reservation_conflict()` 関数が存在する。
> API による競合チェックを行う場合はこの関数を呼び出すことが可能。
> D&D 移動時の競合チェックを DB 関数に委ねるかフロントで完結させるか、アーキテクチャ判断が必要。

**対象ファイル:**
- `Scheduler.tsx` — `alert()` を除去
- `page.tsx` — エラーハンドリングの統合

**実装ステータス（2026-02-22）:**
- [x] `Scheduler.tsx` に `onMoveError?: (message: string) => void` props を追加
- [x] `alert('予約が重複しているため移動できません。')` を `onMoveError?.('...')` に置き換え
- [x] `page.tsx` で `setUpdateError(msg)` を `onMoveError` に渡して既存インラインエラーと統合

---

### 2-2. 予約登録フォームのフィールド順序変更

**問題:**
現在の順序が業務フローと一致していない。
受付スタッフは「いつ・誰に・何の施術か」を最初に確認する。

**現在の順序:**
```
電話番号 → お名前 → カスタム属性 → 来店日 → 担当・設備 → メニュー → 時間 → カラー
```

**推奨する順序:**
```
来店日 → 開始時間 → 担当・設備 → メニュー+オプション → 電話番号 → お名前 → カスタム属性 → カラー
```

**理由:**
- 日付・時間・担当者は予約の「枠」を確定させる情報であり最初に入力される
- 電話番号で既存顧客検索が走るため、枠確定後に入力するのが自然な流れ
- カスタム属性（症状・来院目的）は `customers.custom_attributes JSONB` カラムに保存されるため、顧客情報の一部として名前の後に配置

> ℹ️ **DBスキーマ補足:**
> - `メニュー+オプション` は `menus.options JSONB DEFAULT '[]'` に格納される。
>   `options` の要素は `MenuOptionItem` 型（`id, name, priceDelta, durationDeltaMinutes, isActive`）。
> - `担当・設備` の選択肢は `resources` テーブル（type: `staff`, `room`, `bed`, `device`）から取得。
>   UI では `staff` と `facility`（それ以外）の2分類に集約されている。
> - `カスタム属性` は `customers.custom_attributes JSONB` カラムに保存される。
>   スキーマレスなので UI での表示定義は別途必要。

**対象ファイル:**
- `AppointmentForm.tsx` — フィールドの並び替え（ロジックは変更なし）

**実装ステータス（2026-02-22）:**
- [x] `AppointmentForm.tsx` のフィールド順序変更（来店日→開始時間→担当・設備→メニュー+オプション→電話番号→お名前→カスタム属性）

---

### 2-3. カラーラベルとステータス自動色のロジック整理

**問題:**
登録時に手動で選んだカラーラベルが、読み込み時に `statusToColor()` によって上書きされる。
ユーザーが「青」を選んでも、ステータスが `unconfirmed` なら `orange` に変換される。

**現状:**
```
登録時: color = formData.color (手動選択)
読込時: color = statusToColor(row.status) (自動上書き)
```

**修正方針（2択）:**

**Option A: カラーラベル選択 UI を廃止（推奨）**
- ステータスと色を完全に連動させる（現行の自動マッピングを正式仕様とする）
- `AppointmentForm.tsx` からカラーラベル選択 UI（lines 530-559）を削除
- `formData` の `color` フィールドを state から削除し、送信ペイロードに含めない
- `onSuccess` コールバック内の `color: formData.color` を `statusToColor()` 由来に変更

> ⚠️ **修正（旧版からの変更）:**
> 旧版では「`formData.color` を `'red'` に固定」と記載していたが、これは誤り。
> DB の `status` デフォルト値は `'unconfirmed'` であり、`statusToColor('unconfirmed')` は `'orange'` を返す。
> 新規登録直後の予約は `orange` で表示される。これが正しい動作。
> `formData.color` フィールドを UI から消すだけで良い。カラー値は API レスポンスの `status` から毎回導出する。

**Option A の具体的変更箇所（`AppointmentForm.tsx`）:**

```tsx
// ① formData の state から color フィールドを削除（line 87）
// 変更前
const [formData, setFormData] = useState({
  ...
  color: 'red' as const,   // ← 削除
  ...
});

// ② onSuccess コールバック内の color を statusToColor() で導出（lines 259-282）
// statusToColor は 3-M1 で切り出された hooks/statusToColor.ts から import
import { statusToColor } from '../hooks/statusToColor';

// 変更前
onSuccess({
  ...
  color: formData.color,                         // ← 変更
  status: reservation.status ?? 'unconfirmed',
  ...
});

// 変更後
onSuccess({
  ...
  color: statusToColor(reservation.status ?? 'unconfirmed'),  // ← statusToColor で導出
  status: reservation.status ?? 'unconfirmed',
  ...
});

// ③ カラーラベル選択 UI ブロックを削除（lines 530-559）
// {/* Color */} セクションごと削除
```

> ℹ️ **2-2 との依存関係:**
> 2-2（フィールド順序変更）と 2-3 Option A（カラー削除）を同時適用した場合、
> 最終的なフォームフィールド順序は以下になる（カラー項目が消える）:
> ```
> 来店日 → 開始時間 → 担当・設備 → メニュー+オプション → 電話番号 → お名前 → カスタム属性
> ```

**Option B: DB にカスタムカラーを保存**
- `reservations` テーブルに `custom_color VARCHAR(20)` カラムを追加（マイグレーション必要）
- `statusToColor()` はデフォルト色、`custom_color` が設定されていればそれを優先

**判断:** 業務 SaaS としてはステータス=色の方がシンプルで混乱が少ないため Option A を推奨。

**対象ファイル:**
- `AppointmentForm.tsx` — カラーセクション削除（Option A の場合）

**実装ステータス（2026-02-22）:**
- [x] `statusToColor` を `hooks/statusToColor.ts` に切り出し（テスト可能化）
- [x] `AppointmentSummary.tsx` のカラークラス生成を `COLORS_LEFT_BORDER` マップで安全化（文字列 replace 廃止）
- [x] `AppointmentForm.tsx` のカラー選択 UI 削除（Option A）（formData.color 削除・statusToColor 導出に変更）

---

## フェーズ3: コード品質改善

### 3-1. ヘッダーアイコンの修正

**問題:**
- `Header.tsx:16` — `AlignJustify`（ハンバーガーアイコン）をロゴ代わりに使用
- `Header.tsx:37` — 「お知らせ」ボタンも `Calendar` アイコン（`Bell` が適切）

**修正:**
```tsx
// 変更前
import { Calendar, AlignJustify } from 'lucide-react';

// 変更後
import { Calendar, Bell, Stethoscope } from 'lucide-react';

// ロゴ部分: AlignJustify → Stethoscope（または Building2）
// お知らせ: Calendar → Bell
```

**対象ファイル:**
- `Header.tsx`

**実装ステータス（2026-02-22）:**
- [x] `AlignJustify` → `Stethoscope` に変更（ロゴアイコン）
- [x] `Calendar`（お知らせ） → `Bell` に変更（セマンティクス正確化）

---

### 3-2. Scheduler のハードコード修正

**問題1:** スタッフ行の時間表示が `09:00-23:00` とハードコードされているが、
`constants.ts` の `GRID_END_HOUR = 21` と不一致。

**問題2:** `Scheduler.tsx:215` — `${isFacility ? 'bg-slate-600' : 'bg-slate-600'}` — 条件分岐が同値で無意味。

**修正:**
```tsx
// 問題1: Scheduler.tsx:233 — ハードコードを constants に差し替え
// 変更前
<div className='text-[9px] text-gray-400 mt-0.5'>09:00-23:00</div>

// 変更後（constants から取得）
import { GRID_START_HOUR, GRID_END_HOUR } from '../constants';
<div className='text-[9px] text-gray-400 mt-0.5'>
  {String(GRID_START_HOUR).padStart(2, '0')}:00-{String(GRID_END_HOUR).padStart(2, '0')}:00
</div>

// 問題2: Scheduler.tsx:215 — 無意味な条件分岐の削除
// 変更前
className={`sticky left-0 ... ${isFacility ? 'bg-slate-600' : 'bg-slate-600'} text-white ...`}
// 変更後
className='sticky left-0 ... bg-slate-600 text-white ...'
```

> ℹ️ **DBスキーマ補足:**
> `resources.type` の DB 制約は `'staff', 'room', 'bed', 'device'` の4値。
> UI では `page.tsx` で `resource.type === 'staff' ? 'staff' : 'facility'` に集約されており、
> `room`, `bed`, `device` はすべて `facility` 扱いとなる。`isFacility` フラグはこれを表す。
> この集約は現行仕様として妥当。

**対象ファイル:**
- `Scheduler.tsx`

**実装ステータス（2026-02-22）:**
- [x] `GRID_START_HOUR` / `GRID_END_HOUR` を import して動的に時間帯を表示（`09:00-23:00` ハードコード廃止）
- [x] `isFacility ? 'bg-slate-600' : 'bg-slate-600'` の冗長条件を `'bg-slate-600'` に簡略化

---

### 3-3. AppointmentSummary のカラークラス操作改善

**問題:**
`AppointmentSummary.tsx:40` で文字列操作によるクラス生成が脆弱。

```tsx
// 現状（壊れやすい）
const colorClass = COLORS[appointment.color].replace('border-', 'border-l-4 border-');
```

`COLORS` の値の文字列フォーマットが変わると壊れる。

**修正方針:**
`constants.ts` に左ボーダー用のカラーマップを別途定義する。

```tsx
// constants.ts に追加
export const COLORS_LEFT_BORDER: Record<string, string> = {
  red:    'border-l-4 border-rose-500',
  pink:   'border-l-4 border-pink-400',
  blue:   'border-l-4 border-sky-500',
  orange: 'border-l-4 border-orange-500',
  purple: 'border-l-4 border-indigo-700',
  grey:   'border-l-4 border-gray-400',
};

// AppointmentSummary.tsx
// 変更前
const colorClass = COLORS[appointment.color].replace('border-', 'border-l-4 border-');
// 変更後
const colorClass = COLORS_LEFT_BORDER[appointment.color] ?? '';
```

> ℹ️ **DBスキーマ補足:**
> `COLORS_LEFT_BORDER` のキーは `statusToColor()` の戻り値と完全に一致している必要がある。
> DB の全ステータス → カラーキーのマッピングは以下の通り:
> - `unconfirmed` → `orange`
> - `confirmed` → `blue`
> - `arrived` → `purple`
> - `completed` → `purple`
> - `tentative` → `pink`
> - `trial` → `pink`
> - `cancelled` → `grey`
> - `no_show` → `grey`
> - `default`（予期しない値）→ `red`
>
> `COLORS_LEFT_BORDER` には `red`, `pink`, `blue`, `orange`, `purple`, `grey` の6キーが必要。現定義は正しい。

**対象ファイル:**
- `constants.ts`
- `AppointmentSummary.tsx`

**実装ステータス（2026-02-22）:**
- [x] `constants.ts` に `COLORS_LEFT_BORDER` 定数を追加（6キー全定義）
- [x] `AppointmentSummary.tsx` の `.replace('border-', 'border-l-4 border-')` を `COLORS_LEFT_BORDER[appointment.color] ?? ''` に変更
- [x] テスト: `src/__tests__/reservations/constants.test.ts` 7テスト全通過

---

## セルフレビュー修正（2026-02-22）

実装完了後のセルフレビューにより発見された4件の不整合を修正した。
t-wada TDD: 先に失敗するテストを書き（🔴）、その後実装で修正した（🟢）。

### 修正1: `cancelAppointment` の `no_show` ガード漏れ

**問題:** `useAppointments.ts` の `cancelAppointment` が `status === 'cancelled'` のみガードしており、
`no_show` の予約に対しても API を呼び出していた。
`AppointmentDetail.tsx` の `isAlreadyCancelled = cancelled || no_show` と不整合。

**追加テスト:** `"does not call cancelReservation when appointment status is no_show"`

**修正:** `target.status === 'cancelled' || target.status === 'no_show'` でアーリーリターン。

**対象ファイル:** `src/app/reservations/hooks/useAppointments.ts`

---

### 修正2: `statusToColor` の戻り型を `Appointment['color']` に修正

**問題:** `statusToColor.ts` の戻り型注釈が `string` になっており、`Appointment['color']` ユニオン型との型安全性が欠けていた。

**修正:** 戻り型注釈を `string` → `Appointment['color']` に変更（値の変更なし）。

**対象ファイル:** `src/app/reservations/hooks/statusToColor.ts`

---

### 修正3: `mapReservationUpdateToRow` の全フィールドを条件付き包含に統一

**問題:** `schema.ts` の `mapReservationUpdateToRow` で、`notes` のみ条件付き包含（`if !== undefined`）になっており、
`status`・`start_time`・`end_time`・`staff_id`・`selected_options` は `undefined` でも row に含まれていた。
`undefined` フィールドが Supabase の UPDATE に渡されると暗黙的な NULL 上書きのリスクがあった。

**追加テスト:**
- `"does not include optional fields when not provided (status-only update)"`
- `"includes only the fields that are explicitly provided"`

**修正:** 全フィールドを `if (dto.xxx !== undefined) row.xxx = dto.xxx` パターンに統一。

**対象ファイル:** `src/app/api/reservations/schema.ts`

---

### 修正4: `moveAppointment` に `selectedOptions` を明示追加

**問題:** `useAppointments.ts` の `moveAppointment` が `notes: current.memo` を追加した際、
`selectedOptions` が PATCH payload に含まれていなかった。
D&D 移動時にオプション情報が失われるリスクがあった。

**追加テスト:** `"passes selectedOptions to updateReservation when moving appointment"`

**修正:** `selectedOptions: current.selectedOptions` を `updateReservation` 呼び出しに追加。

**対象ファイル:** `src/app/reservations/hooks/useAppointments.ts`

---

## TDD 実装方針（t-wada流）

> "不安をテストに変換する" — 和田卓人
>
> "動作するきれいなコード" — Kent Beck
>
> まず「動作する」を達成し、その後「きれいな」を達成する。

---

### 基本サイクル

```
🔴 Red    → 失敗するテストを書く（コンパイルエラーでもOK）
🟢 Green  → テストを通す最小限の実装（仮実装・ベタ書きでもOK）
🔵 Refactor → テストが通った状態でコードを整理
```

各フェーズ完了後すぐにコミットする。1機能1コミット。

---

### TDDテストリスト（全体）

```markdown
## TODOリスト（2026-02-22 時点）

### フェーズ1: Critical Bug

#### 1-1. cancelReservation（取消機能）
- [x] 取消実行で `status='cancelled'` に更新される
- [x] 取消後にタイムライン上の色が `grey` になる
- [x] 取消中は loading が true になる
- [x] API エラー時は ok: false が返る（既存表示は維持）
- [x] 取消成功後に onClose が呼ばれる
- [x] 確認ダイアログで「キャンセル」を選ぶと更新されない
- [x] `staff` / `therapist` / `manager` / `clinic_admin` / `admin` で取消ボタンが表示される
- [x] `PATCH /api/reservations` が `allowedRoles` で `customer` を拒否する

#### 1-2. Header の pendingCount 表示
- [x] pendingCount = 0 のとき赤いボタンが表示されない
- [x] pendingCount = 1 のとき赤いボタンが表示される
- [x] pendingCount = 3 のとき "未確認 3件" と表示される

#### 1-3. お知らせ取得・表示
- [ ] `staff` / `therapist` で通知一覧を取得できる（**次フェーズ**）
- [x] notificationCount = 0 のときお知らせボタンがグレー表示になる（UI層のみ対応済み）
- [ ] 親テナント向け通知ストリームで子テナント由来イベントを受信できる（権限分離）（**次フェーズ**）

#### 1-4. D&D移動のメモ保持
- [x] 予約移動後も `memo` が消えない
- [x] `moveAppointment` 実行時に `notes` がPATCH payloadへ含まれる

#### セルフレビュー修正（追加 TODOs）
- [x] `cancelAppointment` が `no_show` ステータスでも API を呼ばない（ガード漏れ修正）
- [x] `statusToColor` の戻り型を `Appointment['color']` に変更（型安全性向上）
- [x] `mapReservationUpdateToRow` 全フィールドを条件付き包含に統一（null 上書き防止）
- [x] `moveAppointment` に `selectedOptions` を明示追加（D&D でオプション保持）

### フェーズ2: UX 改善

#### 2-1. Scheduler の競合エラー表示
- [x] 競合時に alert() が呼ばれない
- [x] 競合時に onMoveError が呼ばれる
- [ ] 非競合時に onMoveError が呼ばれない（未確認）

#### 2-2. 予約登録フォームのフィールド順序変更
- [x] `AppointmentForm.tsx` フィールドを業務フロー順に並び替え

#### 2-3. statusToColor のリファクタリング＆マッピング（DB 8ステータス全網羅）
- [x] `statusToColor` を `useAppointments.ts` 内のローカル関数から `hooks/statusToColor.ts` に切り出して export する（テスト可能にするため）
- [x] unconfirmed → 'orange'   ※ DB DEFAULT 値
- [x] confirmed   → 'blue'
- [x] arrived     → 'purple'   ※ 旧版リストに欠落していた
- [x] completed   → 'purple'
- [x] tentative   → 'pink'     ※ 旧版リストに欠落していた
- [x] trial       → 'pink'     ※ 旧版リストに欠落していた
- [x] cancelled   → 'grey'
- [x] no_show     → 'grey'
- [x] undefined   → 'red'（デフォルト）
- [ ] `AppointmentForm.tsx` カラー選択 UI 削除（Option A）（**次フェーズ**）

### フェーズ3: コード品質

#### 3-1. ヘッダーアイコン修正
- [x] `AlignJustify` → `Stethoscope`
- [x] `Calendar`（お知らせ） → `Bell`

#### 3-2. Scheduler ハードコード修正
- [x] 時間帯を `GRID_START_HOUR` / `GRID_END_HOUR` で動的化
- [x] 冗長な `isFacility` 条件分岐を削除

#### 3-3. COLORS_LEFT_BORDER
- [x] 全カラーキーに対して 'border-l-4' を含むクラスが返る
- [x] 未定義のカラーキーに対して undefined が返る
```

---

### フェーズ1-1: `cancelReservation` の TDD サイクル

**不安なところ:** 取消は副作用（API + state変更）を伴うため最初にテストで抑える。  
実装は削除ではなく `status='cancelled'` の UPDATE で統一する。

#### 🔴 Red: テストを書く

```typescript
// src/__tests__/hooks/useAppointments.test.ts
jest.mock('@/app/reservations/api', () => ({
  fetchReservations: jest.fn().mockResolvedValue([]),
  updateReservation: jest.fn().mockResolvedValue({ id: 'appt-1', status: 'cancelled' }),
}));

it('取消時に updateReservation が status=cancelled で呼ばれる', async () => {
  // 実装前は失敗
});
```

#### 🟢 Green: 最小実装

```typescript
const cancelReservation = useCallback(async (id: string) => {
  return updateAppointment({ ...target, status: 'cancelled', color: 'grey' });
}, [updateAppointment]);
```

#### 🔵 Refactor: 役割とUIを整える

```typescript
// therapist/staff を含むスタッフ系ロールに取消ボタンを表示
const canCancel = ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'].includes(role ?? '');

// 既に cancelled の予約は再取消不可
const disableCancel = appointment.status === 'cancelled';
```

> ℹ️ **API 実装ノート（`cancelReservation` 関数）:**
> ```typescript
> export const cancelReservation = async (payload: {
>   clinicId: string;
>   id: string;
> }): Promise<ReservationApiItem> => {
>   return updateReservation({
>     clinicId: payload.clinicId,
>     id: payload.id,
>     status: 'cancelled',
>   });
> };
> ```

```
$ npm test -- --testPathPattern="useAppointments"
✅ PASS
$ git commit -m "feat: implement reservation cancellation via status update"
```

---

### フェーズ1-2: `Header` の pendingCount TDD サイクル

**不安なところ:** 「0件なのに赤く表示」という既存バグ。条件分岐をテストで固定する。

#### 🔴 Red: テストを書く

```typescript
// src/__tests__/components/reservations/Header.test.tsx

import { render, screen } from '@testing-library/react';
import { Header } from '@/app/reservations/components/Header';

describe('Header - pendingCount', () => {
  it('pendingCount = 0 のとき未確認予約ボタンが表示されない', () => {
    render(<Header pendingCount={0} notificationCount={0} />);
    // 🔴 現状は props なしで常に表示されるので失敗する
    expect(screen.queryByText(/未確認/)).not.toBeInTheDocument();
  });

  it('pendingCount = 3 のとき "未確認 3件" と表示される', () => {
    render(<Header pendingCount={3} notificationCount={0} />);
    expect(screen.getByText(/未確認 3件/)).toBeInTheDocument();
  });

  it('notificationCount = 0 のときお知らせボタンが表示されない', () => {
    render(<Header pendingCount={0} notificationCount={0} />);
    expect(screen.queryByTitle('未確認のお知らせ')).not.toBeInTheDocument();
  });
});
```

```
$ npm test -- --testPathPattern="Header"
❌ FAIL: props 'pendingCount' が Header に存在しない
```

#### 🟢 Green → 🔵 Refactor の流れ

```typescript
// Header.tsx — 仮実装
export const Header = ({
  pendingCount = 0,
  notificationCount = 0,
  ...
}) => {
  return (
    <>
      {pendingCount > 0 && (
        <button className='bg-rose-400 ...'>
          未確認 {pendingCount}件
        </button>
      )}
      {/* ... */}
    </>
  );
};
```

```
$ npm test -- --testPathPattern="Header"
✅ PASS: 3 tests passed
$ git commit -m "feat: add pendingCount prop to Header and hide button when 0"
```

---

### フェーズ2-3: `statusToColor` の TDD サイクル（DB全ステータス網羅）

**不安なところ:** DB の8ステータスが全てカラーにマッピングされているか。旧版テストリストは5つしか検証していなかった。

#### 🔴 Red: テストを書く

```typescript
// src/__tests__/hooks/useAppointments.statusToColor.test.ts
// statusToColor は内部関数のため、hooks モジュールから export するか
// または別ファイルに切り出してテストする

import { statusToColor } from '@/app/reservations/hooks/statusToColor';

describe('statusToColor - DB 8ステータス全網羅', () => {
  // DB DEFAULT ステータス
  it('unconfirmed → orange（DB のデフォルトステータス）', () => {
    expect(statusToColor('unconfirmed')).toBe('orange');
  });

  it('confirmed → blue', () => {
    expect(statusToColor('confirmed')).toBe('blue');
  });

  it('arrived → purple', () => {
    // 旧版テストリストに欠落していたケース
    expect(statusToColor('arrived')).toBe('purple');
  });

  it('completed → purple', () => {
    expect(statusToColor('completed')).toBe('purple');
  });

  it('tentative → pink（仮予約）', () => {
    // 旧版テストリストに欠落していたケース
    expect(statusToColor('tentative')).toBe('pink');
  });

  it('trial → pink（体験）', () => {
    // 旧版テストリストに欠落していたケース
    expect(statusToColor('trial')).toBe('pink');
  });

  it('cancelled → grey', () => {
    expect(statusToColor('cancelled')).toBe('grey');
  });

  it('no_show → grey', () => {
    expect(statusToColor('no_show')).toBe('grey');
  });

  it('undefined → red（デフォルト）', () => {
    expect(statusToColor(undefined)).toBe('red');
  });
});
```

---

### フェーズ3-3: `COLORS_LEFT_BORDER` の TDD サイクル

**不安なところ:** 文字列 `.replace()` による脆弱なクラス生成。定数マップに変えることで安全性を保証する。

#### 🔴 Red: テストを書く

```typescript
// src/__tests__/reservations/constants.test.ts

import { COLORS_LEFT_BORDER } from '@/app/reservations/constants';

describe('COLORS_LEFT_BORDER', () => {
  // statusToColor() が返す全カラーキーを検証
  const colorKeys = ['red', 'pink', 'blue', 'orange', 'purple', 'grey'] as const;

  it.each(colorKeys)(
    '%s は border-l-4 を含む',
    (color) => {
      // 🔴 COLORS_LEFT_BORDER はまだ存在しないので失敗する
      expect(COLORS_LEFT_BORDER[color]).toContain('border-l-4');
    }
  );

  it('未定義のカラーキーに対して undefined が返る', () => {
    expect(COLORS_LEFT_BORDER['unknown' as any]).toBeUndefined();
  });
});
```

```
$ npm test -- --testPathPattern="constants"
❌ FAIL: Cannot read properties of undefined (COLORS_LEFT_BORDER)
```

#### 🟢 Green: 定数を追加

```typescript
// constants.ts に追加
export const COLORS_LEFT_BORDER: Record<string, string> = {
  red:    'border-l-4 border-rose-500',
  pink:   'border-l-4 border-pink-400',
  blue:   'border-l-4 border-sky-500',
  orange: 'border-l-4 border-orange-500',
  purple: 'border-l-4 border-indigo-700',
  grey:   'border-l-4 border-gray-400',
};
```

```
$ npm test -- --testPathPattern="constants"
✅ PASS: 7 tests passed
$ git commit -m "feat: add COLORS_LEFT_BORDER constant to replace fragile string replace"
```

---

### コミットルール（本プロジェクト統一）

| タイミング | プレフィックス | 例 |
|-----------|--------------|-----|
| 🔴 テストを書いたとき | `test:` | `test: add failing test for cancelReservation` |
| 🟢 テストを通したとき | `feat:` / `fix:` | `feat: implement cancelReservation with status update` |
| 三角測量テスト追加 | `test:` | `test: add API call assertion for cancelReservation` |
| 一般化実装 | `feat:` / `fix:` | `feat: generalize cancelReservation role checks and error handling` |
| 🔵 リファクタリング後 | `refactor:` | `refactor: extract cancelReservation error handling` |

---

### 避けるべきパターン

```typescript
// ❌ 予約画面から物理削除（Hard DELETE）を行う実装
const cancelReservation = async (id: string) => {
  await fetch(`/api/reservations?clinic_id=${clinicId}&id=${id}`, { method: 'DELETE' });
  // → reservation_history が CASCADE 削除されるため予約画面では禁止
};

// ✅ 取消（status更新）を行う実装
const cancelReservation = async (id: string) => {
  await updateReservation({ clinicId, id, status: 'cancelled' });
  setAppointments(prev =>
    prev.map(a => (a.id === id ? { ...a, status: 'cancelled', color: 'grey' } : a))
  );
};
```

```typescript
// ❌ テストなしでいきなり全実装
const cancelReservation = async (id: string) => {
  await updateReservation({ clinicId, id, status: 'cancelled' });
  setAppointments(prev => prev.map(...));
  // エラーハンドリングも一気に書く...
};

// ✅ 仮実装 → 三角測量 → 一般化
// Step1: return { ok: true } だけ返す仮実装
// Step2: テスト追加で API 呼び出しを要求
// Step3: 本実装（status='cancelled' 更新）に置き換え
```

---

## 実装スケジュール（推奨順序）

```
フェーズ1（Critical）
  ├── 1-1. 取消ボタン実装（status='cancelled' で実装）
  ├── 1-2. ヘッダーアラート動的化
  ├── 1-3. お知らせ実装（staff/therapist 対応）
  └── 1-4. D&D移動のメモ保持修正

フェーズ2（UX改善）
  ├── 2-1. alert() をインライン表示に変更
  ├── 2-2. フォームフィールド順序変更
  └── 2-3. カラーラベルUI廃止（Option A）

フェーズ3（品質改善）
  ├── 3-1. ヘッダーアイコン修正
  ├── 3-2. Scheduler ハードコード修正
  └── 3-3. AppointmentSummary カラークラス改善
```

---

## テスト観点

修正後に以下のシナリオを手動確認する。

### 予約登録フロー
- [ ] 新規顧客で予約が作成できる（status='unconfirmed', color='orange' で表示）
- [ ] 既存顧客（電話番号一致）で重複登録されずに予約が作成できる
- [ ] 競合する時間帯への登録がブロックされる（インライン表示で）
- [ ] 必須項目未入力時にエラーが表示される

### 予約編集フロー
- [ ] 予約詳細モーダルから編集できる
- [ ] 変更保存後にタイムライン上の表示が更新される
- [ ] 編集キャンセルで変更が元に戻る
- [ ] status を変更するとタイムライン上のカラーが正しく変わる（8ステータス確認）

### 予約取消フロー（新規実装）
- [ ] 確認ダイアログが表示される
- [ ] 取消後にタイムライン上の status が `cancelled` になり色が `grey` になる
- [ ] 取消後にモーダルが閉じる
- [ ] 物理DELETEではなく PATCH（`status='cancelled'`）が実行されることを確認
- [ ] `therapist` / `staff` ロールでも取消ボタンが表示されること（要件反映）

### D&D 移動フロー
- [ ] 別のリソース行にドロップして移動できる
- [ ] 競合がある場合にインラインエラーが表示される（alert ではなく）
- [ ] 移動後の時間・担当者がタイムラインに反映される
- [ ] 移動後もメモが保持される（`notes` が消えない）

### ヘッダーアラート
- [ ] 未確認予約が0件のとき赤いアラートが表示されない
- [ ] 未確認予約が1件以上のとき件数と赤いアラートが表示される

---

## 参考：関連ドキュメント

- `docs/Reservation_UI_Integration_MVP_Improvement_Spec.md` — 既存の予約 UI 改善仕様（状態管理・重複顧客問題）
- `docs/予約UI統合_MVP仕様書.md` — 予約 UI 全体の MVP 仕様
- `docs/予約UI_ローカル起動手順まとめ.md` — 開発環境起動手順

---

## 変更ログ

| バージョン | 変更内容 |
|-----------|---------|
| v1.0 (2026-02-20) | 初版作成 |
| v1.0 (2026-02-20 DBレビュー) | Supabase シニアエンジニアによるDBスキーマ整合性レビュー実施。論理削除方針の明確化、statusToColor テスト欠落3ステータスの追加、Option A カラーデフォルト誤記修正、RLS ロール制約の UI 反映要件追加、notifications テーブル既存の注記更新 |
| v1.0 (2026-02-20 セルフレビュー) | セルフレビューによる誤記4件・欠落2件・記述ミス1件を修正。①行番号 148-151→145-150 修正 ②「deleteReservation API 実装済み」→「未実装」に訂正 ③onDelete 戻り型 void→AppointmentUpdateResult に統一 ④deleteReservation 戻り型 void→ReservationApiItem に修正 ⑤statusToColor 切り出しタスクを TODO リストに追加 ⑥useAppointments return object への追記を修正方針に明記 ⑦notifications テーブルが既存であることを正確に記述 |
| v1.0 (2026-02-20 追加レビュー) | ソースコード実査による追加3件の修正。①Header.tsx:32→:37（Calendar アイコンの正確な行番号）②Scheduler.tsx:215 の行番号を isFacility 条件分岐に追記 ③2-3 Option A に AppointmentForm.tsx の具体的変更箇所（state の color 削除・onSuccess の statusToColor 導出・UI ブロック削除）を追記、2-2 との依存関係も追記 |
| v1.1 (2026-02-20 要件反映) | 要件確定に合わせて計画を更新。①「削除」方針を廃止し「取消（status='cancelled'）」へ統一 ②通知機能を staff/therapist 対応で実装前提に変更 ③予約画面でDELETEを呼ばない方針を明記 ④D&D移動時のメモ消失リスクをCritical修正項目に追加 ⑤TDD/テスト観点/実装順序を cancelReservation ベースへ差し替え。 |
| v1.2 (2026-02-20 セルフレビュー反映) | 追加セルフレビューの指摘を反映。①現状コードの記載を実装事実（`title='削除'`）に修正 ②`PATCH /api/reservations` の `allowedRoles` 明示を必須化（APIガード + RLS + UI の3層防御）③マルチテナント通知スコープ（子テナント運用通知 + 親テナント通知ファンアウト）を追記 ④文書版表記を v1.1 に更新。 |
| v1.3 (2026-02-22 実装反映) | High修正の実装状況を反映。①取消導線を `PATCH status='cancelled'` ベースで実装（UI/Hook/API）②`DELETE /api/reservations` を 405 化して物理削除経路を抑止 ③1-1 の未完了項目（`PATCH` の `allowedRoles` 明示、`cancelReservation` 関数分離）をチェックリスト化。 |
| v1.4 (2026-02-22 全フェーズ実装完了) | 残全項目を t-wada TDD で実装・完了。①`PATCH` に `allowedRoles: STAFF_ROLES` を追加（3層防御完成）②`cancelReservation` 関数を `api.ts` に分離 ③`Header.tsx` を `pendingCount`/`notificationCount` props 付きで全面書き直し ④`statusToColor` を `hooks/statusToColor.ts` に切り出し ⑤`COLORS_LEFT_BORDER` 定数追加、`AppointmentSummary` の fragile replace 廃止 ⑥`Scheduler.tsx` の `alert()` → `onMoveError` prop、ハードコード時間帯修正、冗長 isFacility 削除 ⑦`mapReservationUpdateToRow` の `notes` 条件付き包含修正。全 23 テスト通過。 |
| v1.5 (2026-02-22 セルフレビュー修正・文書更新) | セルフレビュー4件の修正を TDD サイクルで実施。①`cancelAppointment` の `no_show` ガード漏れ修正 ②`statusToColor` 戻り型を `Appointment['color']` に変更（型安全性） ③`mapReservationUpdateToRow` の全フィールドを条件付き包含に統一（null 上書き防止） ④`moveAppointment` に `selectedOptions` を明示追加。失敗テスト4件→全 27 テスト通過。「セルフレビュー修正」セクション新設、全フェーズ実装ステータス・TDD TODOリスト更新。 |
| v1.6 (2026-02-22 2-2/2-3 実装・セルフレビュー) | 2-2（フィールド順序変更）・2-3 Option A（カラーUI削除）を TDD で実装。セルフレビューにより①`mt-4` スペーシング不整合バグを発見・修正 ②三角測量テスト追加（`confirmed` → `blue`）③`afterEach(clearAllMocks)` 追加。全 54 テスト通過。 |
