# Phase 3 — 予約・ロスター・空き判定の共通ドメイン

- Tracker: [#138](https://github.com/IFs1991/seikotsuin_no_saas/issues/138)
- Status: **PLANNED**
- Entry: P1契約のpositive/negative tests完了。P0のデータモデルと実行経路が説明できること。

## 現状（main `8e7ab4c`でコードから確認した範囲）
- `reservations/page.tsx` は`staff_shifts`のconfirmedスタッフIDをSetへ変換してタイムライン対象を選ぶ。開始/終了の時間帯はUI判定に未反映。
- `public-availability-service.ts` は店の営業時間、予約、`blocks`を判定するが、`staff_shifts`との時刻単位の統合は別途必要。
- `manager/rosters/assign` は`staff_profile_id`/`staff_id`/`home_clinic_id`を扱う一方、`resources`は`clinic_id`スコープ。ヘルプ時の本人同一性はテストで検証が必要。
- `reservations` 書込にはreservation overlap検出とDB競合制約が存在する。**削除/緩和不可**。

## 正規化する概念
- `staff_profile_id`: 同じ実在スタッフを跨院で同定するキー（必ず存在するか/同定可能かを検証）。
- `resource_id` (= staff_idとして参照されることがある): 院別の予約リソース。プロフィールとの対応関係と例外処理を仕様化する。
- `work_clinic_id`/`home_clinic_id`: 実勤務の場所と所属を混同しない。
- 半開区間`[start, end)`、JST/UTC変換、メニュー施術時間、資格/対応メニュー、confirm/cancel/no_show、`blocks`/休憩を契約化。
- 「予定上空いている」と「別院への応援に移動できる」は異なる判定。MVPでは前者だけ。

## 共通Read Model（案、確定仕様ではない）
入力: `actor scope / target clinic IDs / date / start / duration / optional menu and qualification`。
処理: (1) server-side scope確定 → (2)対象院/有効資源 → (3)確定勤務と場所・時間 → (4)予約+active blocks overlap → (5)資格/対応メニュー → (6)必要ならキャッシュ整合。
出力: `clinic_id, staff display name, resource_id, interval, availability flag, generated_at` と必要最小のreason。**患者氏名、予約内容、住所、電話番号は返さない**。
値が矛盾/未知のスタッフは`unknown/unavailable`。実装時に旧public予約と差異が出ればfeature flag/段階移行で扱い、静かな契約変更をしない。
DBの最終排他・制約はwrite pathの責務として維持する。

## 具体テスト（実装前RED）
- 10:00–17:00勤務、16:45開始30分は不可
- 11:00–12:00予約に対し11:30開始30分は不可、12:00開始30分は可
- 有効blocks/休憩と衝突する時間は不可
- confirmedシフトなし/異院の勤務/unknown IDは可にしない
- 同一profileに異なる院別resource IDsがある場合は同一人物判定・二重表示を防ぐ
- 2組織混在、manager所属院外、無効院で漏洩0、403/拒否
- write競合は既存のDB制約で拒否、読み取り照会直後の更新レースを許容したメッセージ

## PR分解（順序）
1. 純粋なdomain判定と型 + RED tests（実データ未変更）
2. server-side availability read model / scoped API（旧経路は維持）
3. 影響を隔離した既存consumer統合（内部→公開等は別PR）
4. baselineと整合確認後に旧共通化候補を廃止

## Gate
- [ ] staff identityと勤務先の不変条件・例外がテストで説明できる
- [ ] DB write競合制約を維持したread modelで予約/shift/blockが一致
- [ ] tenant/user/clinic scope A/B negative testsとrevert手順が確認済み
- [ ] 公開予約/管理画面に挙動差分があれば明示して別途承認

他院照会のUIは**Phase 5の別feat**。このPhaseに便乗して作らない。
