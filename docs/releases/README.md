# Release governance

変更完了、出荷資格、顧客価値を分離して判断するための索引です。

| 判断               | 正本                                                                         | 役割                                |
| ------------------ | ---------------------------------------------------------------------------- | ----------------------------------- |
| PR completion      | [Change DoD](../quality/change-dod-v1.0.md)                                  | 1変更を完了できるか                 |
| Pilot release      | [Pilot Release Gate](pilot-release-gate-v1.0.md)                             | 2〜3院の有人pilotへ出せるか         |
| Commercial release | [Commercial Release Qualification](commercial-release-qualification-v1.0.md) | 常時介入なしで継続課金提供できるか  |
| Product validation | [Pilot Success Criteria](../product/pilot-success-criteria-v1.0.md)          | 顧客価値と事業性が検証されたか      |
| Current snapshot   | [Current Gate Status](current-gate-status.yaml)                              | 特定branch/commit時点の機械可読評価 |

## 関連文書

- [Historical Stabilization DoD](../stabilization/DoD-v0.1.md): 2026年3月の12/12 PASSを保持する歴史的証跡。現行出荷判定には単独使用しない。
- [Commercial hardening migration spec](../stabilization/spec-commercial-hardening-migration-v1.0.md): PR-00〜PR-12の実装計画。資格判定そのものではない。
- [Operations Runbook](../operations/RUNBOOK.md): incident/運用手順。存在するだけでは実行証跡にならない。

判定時は対象commit/環境の証跡をcurrent statusへ記録する。`NOT_RUN`、期限切れ、証拠なしをPASSにしない。
