# Phase 1 — 安全性・業務契約ゲート

- Tracker: [#136](https://github.com/IFs1991/seikotsuin_no_saas/issues/136)
- Status: **PLANNED**（実装・試験未実施）
- Entry: P0の依存関係/旧監査差分・高リスク一覧が存在する。

## 守るべき不変条件
- A院とB院および別組織間の読み書きを、権限のない利用者に許さない（RLS・API・実DB negative tests）。
- 権限/ロール/clinic scopeを認証contextからサーバー側で導出する。`admin` / `manager` / `clinic_admin` 等の差分を曖昧にしない。
- 個人情報・患者履歴は、他院「空き」照会でAPI出力しない。公開予約の顧客識別と通知を含めプライバシー契約を保つ。
- 書込時はDBの競合制約と再検証を維持。読み取った空き枠を予約確定と扱わない。
- キャンセル/No-show、LINE/メールの送信冪等、課金/監査ログ、復旧可能性を検証対象から落とさない。
- 認可やシフト読取が不明/失敗の場合は、成功をでっち上げず閉じる（fail-closed）。

## 既存監査の取り扱い
- [2026-09 Audit v2](../../stabilization/audit-v2-originals/tiramisu_os_technical_audit_2026-09-06_v2.md) のF03/04, F06, F09, F10/11/12, F14, F16, F18/20, F23などは**古いHEADの診断**。
- [audit-v2 integration status](../../stabilization/audit-v2-integration-status.md) の実装履歴・PRを確認し、現行mainのコードと突合。`CODE_FIXED`でも環境側の`ENV_PENDING`を消さない。
- security/billing/data correctnessは「軽量化のために削る」対象にしない。

## 最小テスト行列
| ケース | Expected |
| --- | --- |
| 異組織A→Bの予約/シフト参照 | HTTP 403またはRLSで拒否 |
| 権限剥奪・無効スタッフ/店舗・失効認証 | 拒否、キャッシュから漏洩しない |
| 予約の境界/重複/同時更新 | 重複登録不可。取消状態は現行契約どおり |
| 休憩・ブロック・シフト外 | 利用可能と誤判定しない |
| 通知失敗/リトライ/重複 | 二重送信・欠落の保証レベルを明示 |
| 変更前後の予約API/UI/料金 | 実装が守るべき数値/挙動で比較 |

## Gate
- [ ] 変更対象ごとにpositive+negative testと期待契約がある
- [ ] High riskには独立review・実DB試験・rollback/forward-fixがある
- [ ] 不足項目は他フェーズPRと混ぜず別issueにする
- [ ] 全証拠をcommit / 環境 / 日時にひも付け、未実施は`NOT_RUN`

禁止: migration履歴の再squash/編集、service-roleでscope検証を飛ばす、テストを通すための権限緩和。
