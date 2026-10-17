# Phase 4 — 測定に基づくDB/API最適化

- Tracker: [#139](https://github.com/IFs1991/seikotsuin_no_saas/issues/139)
- Status: **PLANNED / baseline NOT_RUN**
- Entry: P0計測プロトコルとP1の安全性契約。

## Hot path候補（遅いと断定しない）
- 予約画面: `useReservationFormData`はmenus/resourcesなどを並行取得し、`useAppointments`はclinic+dateで30秒キャッシュを保持。追加のシフトAPI取得を含めたcritical pathを測る。
- `resources` API: 必要時、`resources`→`staff`→`user_permissions`→`profiles`のfallback呼出。起動条件と実使用を測る。
- 管理集計: 旧監査で50院×4件のexact count計200リクエスト構造を指摘。**実行時のp95は未検証**。
- 認可: 監査F16でauth context再解決の重複が指摘されたが、scope freshness/fail-closed維持が優先。

## 計測仕様
| Metric | 条件 | 判定 |
| --- | --- | --- |
| API calls / DB round trips | cold/warm、院数（1/10/50）、予約数・同時ユーザー固定 | 適用前後で同条件・サンプル記録 |
| p50/p95 latency | 実行環境・リージョン・負荷・ブラウザ別 | 統計的に比較可能な測定がある場合のみ |
| data consistency | キャンセル・変更・他院権限変更・キャッシュ鮮度 | 回帰0を維持 |
| cost | DB/compute/provider料金の測定値 | 円換算推測は不採用 |

## 判断原則
- 顧客に影響するp95/DB負荷/コストが目標未達のときのみ最適化する。目標はP0で利用シナリオと共に定義。
- N+1があっても実計測が許容範囲なら維持してよい。
- 大規模SQL/RPC最適化の前にクエリ集約・index・データ取得範囲を小PRで検証。
- 30秒キャッシュを短縮/廃止する前に、予約・scope変更時のinvalidationsの整合性を確認。
- service_role認可、RLS、課金/監査ログの省略による「高速化」は禁止。

## Gate
- [ ] before/afterの同条件計測とrollback planがある
- [ ] データ正確性/セキュリティ回帰0、High-risk変更は独立review
- [ ] 改善がないものは`NO_CHANGE`として閉じられる
- [ ] 過去CIや静的推定値を今回の実測成果としない
