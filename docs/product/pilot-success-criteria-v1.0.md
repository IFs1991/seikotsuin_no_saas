# Pilot Success Criteria v1.0

## 文書情報

- Status: CURRENT / PRODUCT VALIDATION SSOT
- Technical release gate: [Pilot Release Gate](../releases/pilot-release-gate-v1.0.md)
- Decision owner: `UNASSIGNED`

これは技術DoDではなく、顧客価値と事業成立を判定する文書である。安全に出せることと、使われ価値があり支払われることを混同しない。

## 仮説と対象

- 問題仮説: 予約・患者・日報・収益の分断を減らし、治療院の日常業務時間と転記負担を削減できる。
- 対象顧客: 整骨院・治療院。詳細segmentは`OWNER_DECISION_REQUIRED`。
- 初期提案値: 2〜3院、30日運用。既存pilot仕様の2〜3院を採用し、30日は未確定の提案値。
- 対象ユーザー/期間開始日/終了日: `OWNER_DECISION_REQUIRED`。
- Core workflow: スタッフlogin→予約→患者→日報→収益反映を実営業日に継続利用。
- Activation: clinicがonboardingを完了し、core workflowを1回end-to-end完了。確定条件は`OWNER_DECISION_REQUIRED`。

## 測定指標

| ID                | 指標                     | 初期基準                                                            |
| ----------------- | ------------------------ | ------------------------------------------------------------------- |
| SUCCESS-USE-001   | weekly active clinic     | 目標値 `OWNER_DECISION_REQUIRED`                                    |
| SUCCESS-USE-002   | weekly active staff      | 目標値 `OWNER_DECISION_REQUIRED`                                    |
| SUCCESS-USE-003   | 予約利用率               | 分母/目標 `OWNER_DECISION_REQUIRED`                                 |
| SUCCESS-USE-004   | 患者管理利用率           | 分母/目標 `OWNER_DECISION_REQUIRED`                                 |
| SUCCESS-USE-005   | 日報利用率               | 分母/目標 `OWNER_DECISION_REQUIRED`                                 |
| SUCCESS-RET-001   | 30日継続                 | 初期提案: 30日、目標率 `OWNER_DECISION_REQUIRED`                    |
| SUCCESS-OPS-001   | onboarding工数           | 必ず実測、上限 `OWNER_DECISION_REQUIRED`                            |
| SUCCESS-OPS-002   | 週次support工数          | 必ず実測、上限 `OWNER_DECISION_REQUIRED`                            |
| SUCCESS-OPS-003   | 問い合わせ件数           | 実測、上限 `OWNER_DECISION_REQUIRED`                                |
| SUCCESS-RISK-001  | P0/P1 incident           | tenant boundary P0は初期提案0件、他閾値 `OWNER_DECISION_REQUIRED`   |
| SUCCESS-RISK-002  | データ修復件数           | 実測、上限 `OWNER_DECISION_REQUIRED`                                |
| SUCCESS-VALUE-001 | 業務時間削減             | baseline/測定法/目標 `OWNER_DECISION_REQUIRED`                      |
| SUCCESS-BIZ-001   | 支払意思                 | interview根拠を記録                                                 |
| SUCCESS-BIZ-002   | 実入金                   | 初期提案: 最低1院の実入金、または明示的な有償契約commit             |
| SUCCESS-BIZ-003   | 月額価格への反応         | 価格/合格基準 `OWNER_DECISION_REQUIRED`                             |
| SUCCESS-BIZ-004   | 継続理由、解約・停止理由 | 定性codingして記録                                                  |
| SUCCESS-BIZ-005   | gross margin簡易proxy    | 売上−決済費−hosting−変動support工数、閾値 `OWNER_DECISION_REQUIRED` |

vanity metricではなく継続利用、core workflow、時間削減を優先する。各測定は期間、分母、source、ownerを持ち、個人/患者情報を不要に集計しない。

## Statusと判定

項目statusは`PASS`/`FAIL`/`NOT_RUN`/`PASS_WITH_RISK`/`NOT_APPLICABLE`を使い、実データ証跡なしは`NOT_RUN`。全主要仮説が設定済み期間の実測で支持されれば`VALIDATED`、一部のみなら`PARTIALLY_VALIDATED`、未実測または反証なら`NOT_VALIDATED`。

- Continue: 安全性を満たし、継続利用・時間削減・支払の主要仮説を支持。
- Improve: 価値の兆候はあるがactivation/工数/品質に明確な改善余地。
- Pivot: 問題またはworkflow/segment/価格仮説が反証。
- Stop: 安全性重大incident、継続利用なし、支払意思なし、またはsupport economics不成立。

最終決定にはdecision、根拠、反証、owner、日付、次回reviewを記録する。
