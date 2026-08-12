# Tiramisu CRM Data Foundation & LINE Growth Features Specification v0.1

## Part 1. Patient Identity Resolution（患者名寄せ基盤）

## 1. Purpose

予約・LINE・来院・売上・担当スタッフ履歴を正しく同一患者へ結合するための基盤仕様。

名前の表記揺れを解決することが目的ではなく、patient_idを中心に全データを結合し、CRM・分析精度を向上させる。

## 2. Identity Priority

優先順位:

1.  LINE User ID
2.  電話番号
3.  補助属性

患者名は識別キーとして利用しない。

## 3. Data Model

### patients

-   id UUID
-   clinic_id
-   line_user_id
-   phone_number
-   created_at

### patient_profiles

-   patient_id
-   display_name
-   phonetic_name

display_nameは表示用途。

## 4. Manual Reservation Auto Matching

受付による手動予約時に既存患者候補を提示する。

入力: - 名前 - 電話番号 - メニュー - 担当履歴

候補: - 過去来院履歴 - 担当スタッフ - メニュー履歴 - 来院周期

を利用してスコアリング。

## 5. Candidate Scoring

例:

-   LINE User ID一致: 最重要
-   電話番号一致: 高信頼
-   名前一致: 補助
-   担当履歴一致: 補助
-   メニュー履歴一致: 補助

AIは自動確定ではなく候補提示に利用する。

## 6. Alias Management

patient_identity_aliasesを保持する。

例:

山田太郎 山田さん やまだ

を同一patient_idへ紐付ける。

------------------------------------------------------------------------

# Part 2. 指名リマインダー & Relationship CRM

## 1. Purpose

患者が希望するスタッフとの関係性データを活用し、空き枠を適切な患者へ届ける。

## 2. User Flow

公式LINE ↓ 指名スタッフ登録 ↓ patient × staff relationship生成 ↓
スタッフ空き枠発生 ↓ 対象患者抽出 ↓ LINE Push通知 ↓ 予約 ↓ 特典付与

## 3. Required Tables

### patient_staff_preferences

-   patient_id
-   staff_id
-   notification_enabled
-   registered_at

### staff_availability_events

-   staff_id
-   clinic_id
-   available_datetime

### reservation_rewards

-   reservation_id
-   reward_type
-   status

## 4. Notification Logic

対象:

-   過去担当履歴あり
-   LINE連携済み
-   通知許可済み
-   条件を満たした患者

## 5. Reward Design

値引きより関係性強化を優先。

例: - 優先予約 - ポイント - セルフケア提供 - オプション提供

## 6. Strategic Value

指名リマインダー単体は模倣可能。

価値は蓄積される関係性データ。

蓄積:

-   patient_id
-   staff_id
-   来院周期
-   担当履歴
-   売上
-   再来率

## 7. Implementation Priority

Phase 1: 患者ID統合、LINE連携、名寄せ

Phase 2: 指名登録、空き枠通知

Phase 3: CRM分析、AI来院予測

## Definition of Done

-   同一患者が分裂しない
-   LINE予約と手動予約が統合される
-   指名履歴が蓄積される
-   通知から予約まで追跡できる
