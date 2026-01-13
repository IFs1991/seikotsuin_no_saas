# 修正仕様書：Admin Settings Contract / E2E 安定化 v0.2（LLM実装用）

> この仕様書は、`spec-admin-settings-contract-v0.1.md` を前提に「修正実装を確実に通す」ための v0.2 です。  
> LLMに実装を任せる場合は **v0.1 → v0.2 の順で必ず読ませる** こと。

---

## 0. 必読（LLMに最初に読ませる）

- `spec-admin-settings-contract-v0.1.md`
  - 目的・証拠・非目標・data-testid契約・検証手順のベース（Contract）

---

## 1. 目的（今回の修正で達成すること）

- Admin Settings の **保存失敗（データ破棄）** と **E2Eの不安定** を解消する
- UI/API の設定ペイロードを **契約（Contract）** として固定し、UI変更でテストが壊れない状態にする
- **API を source of truth** として、UI側のキー・型・保存payloadを揃える

---

## 2. 背景（何が壊れていたか）

- **UI/API Schema mismatch**
  - UIが `slotDuration` 等で送っていたが、APIは `slotMinutes` 等を期待
  - スキーマに弾かれて保存時にデータロス
- **E2Eセレクタ不安定**
  - role/ラベルに依存してテストが壊れる
  - `data-testid` に統一が必要
- **ロード待ち不足**
  - dynamic import + settings fetch のタイミングで Save が一時disabled → Playwrightがタイムアウト
  - ロード完了を明示的に待つ
- **useAdminSettingsのループ**
  - render毎に persistOptions が新規生成 → autoLoad が再発火 → `isLoading` が解除されず Save 不能
- **profile fetchスタック**
  - `/api/auth/profile` がPlaywrightで止まり、画面が永遠に「設定を読み込み中...」

---

## 3. スコープ

### In-scope

- Booking Calendar / System / Communication 設定画面の
  - UIキーとAPIスキーマの整合
  - `data-testid` 付与と維持
  - Playwright E2E の安定化（待機・セレクタ）
  - `useAdminSettings` のロード/保存の状態管理安定化
  - `useUserProfile` の再フェッチ抑制 + タイムアウト/フォールバック

### Out-of-scope（Non-goals）

- `online.*` / `notifications.*` の永続化（現状 local-only のまま）
- DBスキーマ変更（settings は JSONB のまま）

---

## 4. 契約（Contract：ここを破ったら失敗）

### 4.1 Booking Calendar persisted keys（APIが正）

UIは下記キーで保存し、APIスキーマも同キーを受ける。

- `slotMinutes`
- `maxConcurrent`
- `weekStartDay`
- `maxAdvanceBookingDays`
- `minAdvanceBookingHours`
- `allowCancellation`
- `cancellationDeadlineHours`
- `defaultCalendarView`
- `allowOnlineBooking`

> 注意：**旧キー（例：slotDuration 等）を送らない**。UI側で完全撤去すること。

### 4.2 Required data-testid（E2E契約）

削除・改名は破壊的変更。必要ならUIとE2Eを同一PRで更新。

- `booking-calendar-settings-card`
- `booking-calendar-slot-minutes-select`
- `booking-calendar-max-concurrent-input`
- `booking-calendar-week-start-select`
- `booking-calendar-max-advance-days-input`
- `booking-calendar-min-advance-hours-input`
- `booking-calendar-cancellation-allowed-checkbox`
- `booking-calendar-cancellation-deadline-input`
- `booking-calendar-default-view-select`
- `booking-calendar-online-booking-checkbox`
- `save-settings-button`
- `success-message`
- `error-message`

---

## 5. 実装タスク（LLMが迷わない粒度）

### P0：UI/API Contract確定（保存失敗をゼロにする）

1) `src/components/admin/booking-calendar-settings.tsx`
- UI state / submit payload を persisted keys に統一（旧キー撤去）
- `online.*` / `notifications.*` は local state に留め、保存payloadに含めない

2) `src/app/api/admin/settings/route.ts`
- `BookingCalendarSchema` を persisted keys に合わせて拡張（min/max/enum/optional）
- `DEFAULT_SETTINGS.booking_calendar` も同じキー集合へ（欠けがあると初期表示がズレる）

3) `src/types/admin.ts`
- UI/API の型を契約に一致させる（片側だけ直しても再発する）

---

### P1：E2Eを契約ベースに固定（壊れないテスト）

4) UIに `data-testid` を付与（一覧を厳守）
- Saveボタンは `save-settings-button` を共通化
- `AdminMessage` は `success-message` / `error-message` を必須

5) `src/__tests__/e2e-playwright/admin-settings.spec.ts`
- role/ラベル依存を廃止し、`getByTestId()` に統一
- 操作前に「ロード完了」を待つ
  - loading文言が消える
  - heading表示確認（例：`管理者設定`）
  - Saveが enabled になる

---

### P1：ロードループ/スタック除去（“永遠loading”の芽を摘む）

6) `src/hooks/useAdminSettings.ts`
- `persistOptions` を **プリミティブに分解**して依存配列に入れる（オブジェクト参照差分でeffectを走らせない）
- 初回fetchと保存中の状態を分離（ロード中にSaveを永久disableにしない）

7) `src/hooks/useUserProfile.ts` + `UserProfileProvider`
- Providerがある場合は context を再利用して二重fetchを止める
- profile fetch はタイムアウトを入れて無限loadingを防ぐ
- cookie/session metadata から初期値を立て、E2E中に `/api/auth/profile` が詰まってもUIを止めない

---

### P2：既存データ互換（必要な場合のみ）

8) 旧キーがDBに残っている場合の one-time SQL を適用（任意）
- `slotDuration -> slotMinutes` 等のマイグレーション（既存のv0.1案に従う）

---

## 6. 受け入れ基準（DoD）

- `admin-settings.spec.ts` が selector/validation/timeouts なしで完走
- Booking Calendar が保存 → リロードで保持される
- Required data-testid 一覧がUIに存在する
- 初回ロード後に Save が押せる（永久disabledにならない）

---

## 7. 検証手順

### 自動（E2E）

```bash
npm run test:e2e:pw -- src/__tests__/e2e-playwright/admin-settings.spec.ts
```

### 手動（UI）

1. `/admin/settings` を開く
2. `slotMinutes` 相当のUI（セレクト）を変更
3. Save
4. リロード
5. 変更が保持されることを確認

---

## 8. LLMに渡す「実装プロンプト」雛形（コピペ用）

- 入力：**v0.1 → v0.2 の順で貼り付け**
- 制約：
  - 1タスク=1PR（v0.1の原則）
  - In-scope外を触らない（文言/レイアウト変更最小）
  - `data-testid` の改名禁止（必要ならテストと同一PRで）
- 出力要件：
  - 変更ファイル一覧
  - E2E実行結果の要点
  - 追加/維持した `data-testid` 一覧（差分）
