# Phase 5 — UI簡素化・他院同時刻空き照会の独立着手判定

- Tracker: [#140](https://github.com/IFs1991/seikotsuin_no_saas/issues/140)
- Status: **PLANNED**
- Entry: UI整理はP1終了後、他院参照はP3 read modelの安全性証拠が揃ってから。

## UI整理（refactor PR）
- `reservations/page.tsx` (約770行)の状態・モーダル・read-only操作を対象に、利用実態と変更頻度を計測して責務を分離。
- `Scheduler.tsx`はクリック位置から時刻を算出している。read-onlyではクリックを抑止する現契約があるため、**「閲覧できる操作」と「更新できる操作」の分離**を画面仕様とサーバー権限双方に反映する。
- 現状空配列のnotification state等は、利用箇所と業務価値が不明なら「削除候補」。安易にUIを隠して業務機能を壊さない。
- `Design.md`のEXTEND、a11y、mobile、権限別表示・loading/error/empty statesを維持。

## 別feat Issue候補 — 他院の空きスタッフを参照
ユーザー操作: 予約タイムラインの時刻/リソースを選択 → メニュー内「他院空きスタッフを参照」→ 担当/所属範囲の院別に「スタッフ名、資格、連続空き区間」を表示。
- 内部read-onlyの最小API。患者名・住所・予約詳細を含まない。
- 対象店舗はログイン主体のeffective scopeに限定。管理者のscope外は403。
- 「同時刻」ではなく**施術所要時間を満たす連続空き区間**で判定。
- 休憩/active blocks/confirmed shift/資格/対応menu/別院ヘルプの同定を含む。
- 空きは検索時点のsnapshot。別院予約確定・スタッフ移動・応援依頼は別機能。
- 既存の他院閲覧read-onlyを破らず、勤務院以外の患者情報を含まない。

## 商用着手ゲート（本機能の優先判断）
- 同一法人の複数院で月何件「取りこぼし→他院紹介」を実際に行うか記録。
- 最小2〜3店舗で受付担当者にクリック導線を見せて運用時間・導入障害を検証。
- 転換率・紹介売上・運用工数の見込みがない状態では、単なる便利機能として優先しない。
- 新機能は`feat`用チケットを別に起票し、同じPRへrefactorを混ぜない。

## Exit
- [ ] 既存予約機能のUX、権限、a11y/mobileが非退行
- [ ] 操作数/状態の整理の前後比較がある
- [ ] 別featのAPI/data contract、negative test、業務KPI、受入条件が揃う
- [ ] Worksの事業活動を圧迫せず、着手を延期しても独立した保留状態で残せる
