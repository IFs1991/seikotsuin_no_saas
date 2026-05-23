# Phase 3C Plan: 柔道整復・健康保険 令和6年確定料金 Active Master Seed v0.1

## Summary

Phase 3C では、柔道整復・健康保険の令和6年確定現行料金を
`insurance_fee_*` system master に登録する。

方針は **フルマスタ seed + 保守的な自動計算許可** とする。
公式通知に基づく料金項目は広く登録するが、部位数、受傷日、初回後療日、
長期頻回、月1回制限、医師同意などの条件が絡む項目は、当面
`auto_calculation_allowed = false` または warning 付きにして、請求確定額と
誤認される自動計算には使わない。

この Phase は請求確定ロジックではない。既存方針どおり、表示・API・テストでは
次の境界を維持する。

```txt
経営分析用の概算です。請求確定額ではありません。
```

## Evidence

根拠仕様:

- `療養費マスタdocs/Tiramisu_柔道整復_健康保険_令和6年確定現行料金_active_master_spec.md`
- `療養費マスタdocs/tiramisu_judo_hi_fee_master_evidence_2026_revision.md`

一次資料:

- 公式ページ: `https://kouseikyoku.mhlw.go.jp/kyushu/shinsei/shido_kansa/judo/index.html`
- 公式料金PDF: `https://kouseikyoku.mhlw.go.jp/kyushu/shinsei/shido_kansa/judo/000339906.pdf`
- 文書名: `柔道整復師の施術料金の算定方法`
- 最終改正: `令和6年5月29日 保発0529第4号`
- PDF SHA-256: `c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3`
- PDF byte size: `165498`

採用判断:

- 令和6年確定現行料金は `active` + `is_locked = true` で登録可能。
- 2026年改定案は、最終通知取得前のため `active` にしない。
- 2026年改定案を登録する場合は `draft` または `reviewed` までに留める。

## Phase 3C-1: Active Source / Snapshot / Schedule / Full Item Seed

### Goal

令和6年確定通知を、現在以降の経営分析用概算で参照できる active master として登録する。

### DB Migration

追加予定:

```txt
supabase/migrations/20260524000100_seed_judo_hi_r6_active_master.sql
supabase/rollbacks/20260524000100_seed_judo_hi_r6_active_master_rollback.sql
```

Migration は既存 schema を変更しない。データ seed のみを追加する。

登録対象:

- `insurance_fee_sources`
- `insurance_fee_source_snapshots`
- `insurance_fee_schedules`
- `insurance_fee_items`
- 必要最小限の `insurance_fee_warning_definitions`

Schedule:

```txt
schedule_code: JUDO_HI_R6_202410_ACTIVE
profession_type: judo
payer_context_code: insurance
schedule_name: 柔道整復 健康保険 令和6年改定 現行料金
effective_from: 2024-10-01
effective_to: null
schedule_status: active
source_id: MHLW_JUDO_HI_R6_FINAL_20240529
source_snapshot_hash: c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3
is_locked: true
```

### Item Seed Policy

金額が明確な項目は登録する。ただし、自動計算許可は保守的に扱う。

自動計算を当面許可しやすい候補:

- `JUDO_HI_INITIAL_EXAM`
- `JUDO_HI_RE_EXAM`
- `JUDO_HI_FIRST_CONTUSION`
- `JUDO_HI_FIRST_SPRAIN`
- `JUDO_HI_POST_CONTUSION`
- `JUDO_HI_POST_SPRAIN`

ただし `JUDO_HI_RE_EXAM` は初回後療日限定のため、実運用では warning または
calculator 側の条件固定が必要。

根拠表示・手動確認用として登録し、当面 `auto_calculation_allowed = false`
にする候補:

- 骨折・不全骨折・脱臼の部位別整復料 / 固定料 / 後療料
- 往療料、往療距離加算、時間外・休日・深夜加算
- 温罨法料、冷罨法料、電療料
- 金属副子等使用加算 / 交換加算
- 柔道整復運動後療料
- 施術情報提供料
- 明細書発行体制加算

理由:

- 部位数、受傷日、施術日、初回後療日、長期頻回、月内回数、医師同意などの
  入力がない状態で自動計算すると、数字は出ても制度上の妥当性を担保できない。

## Phase 3C-2: Fixture / Resolver / Validation Alignment

### Goal

現行 active master が resolver と validation で安全に扱えることを固定する。

追加予定 fixture:

```txt
fixtures/insurance-fee-cases/judo_hi_r6_current_official.json
```

修正対象:

```txt
fixtures/insurance-fee-cases/judo_hi_202606_boundary.json
```

修正方針:

- `2026-06-01` active boundary として扱わない。
- `1,600円` を根拠値として使わない。
- 2026改定案を fixture 化する場合は `2026-07-01` かつ `draft/reviewed`
  扱いにし、active golden case から外す。

Tests:

- 現行 schedule が `2024-10-01` 以降で resolve される。
- active schedule は source snapshot を必ず参照する。
- duplicate item code を検出する。
- warning code が未定義なら validation が落ちる。
- 2026改定案 schedule が `draft/reviewed` の場合、golden active case に使われない。

## Phase 3C-3: Conservative Calculator Expansion

### Goal

自動計算範囲を、条件をテストで固定できるものから段階的に広げる。

優先実装:

- 初検料
- 再検料の初回後療日限定
- 打撲・捻挫の初回施療料 / 後療料
- 温罨法・冷罨法・電療料の除外期間 warning

後続実装:

- 3部位目 60%
- 4部位目以降は3部位目までに含む
- 5か月超 75%
- 長期頻回 50%
- 長期3部位以上 1回1,200円
- 明細書発行体制加算 月1回
- 往療距離 / 時間外 / 休日 / 深夜 / 難路等の加算

未実装の複雑条件は、UI/API で「要確認」または「手動確認用根拠」として扱う。

## Safety Rules

- 新規 schema 変更は行わない。Phase 3C-1 は seed migration のみ。
- 既存 Phase 3A / 3B migration は書き換えない。
- rollback は Phase 3C seed のみを削除し、既存テーブルや既存見積データは削除しない。
- `traffic_accident` の公式マスタ由来自動単価は禁止を維持する。
- `daily_report_items.fee` を seed migration で書き換えない。
- `revenue_estimates.estimated_total` を seed migration で書き換えない。
- `active` schedule は source snapshot 必須。
- `active` + `is_locked = true` の schedule / items は原則更新せず、新 revision で差し替える。
- `manager`, `staff`, `therapist` に master maintenance 権限を与えない。

## Review Checklist

実装 PR では、最低限これを確認する。

- 公式PDFの URL / SHA-256 / byte size が仕様書と一致する。
- `insurance_fee_sources.reliability = official`。
- `insurance_fee_sources.target_domain = judo_health_insurance`。
- `insurance_fee_schedules.schedule_status = active`。
- `insurance_fee_schedules.is_locked = true`。
- `insurance_fee_schedules.effective_from = 2024-10-01`。
- `insurance_fee_items` の `amount_yen` が公式資料と一致する。
- 複雑条件項目が不用意に `auto_calculation_allowed = true` になっていない。
- 2026改定案が `active` として混入していない。
- 既存 `judo_hi_202606_boundary.json` の誤った active 前提を残していない。

## Verification Commands

```powershell
npm run test -- --runTestsByPath src/__tests__/api/insurance-fee-system-master-phase3a-migration.test.ts src/__tests__/api/insurance-fee-system-master-phase3a2-migration.test.ts src/__tests__/api/revenue-estimate-fee-item-link-phase3b-migration.test.ts
npm run test -- --runTestsByPath src/__tests__/insurance-fees/schedule-resolver.test.ts src/__tests__/insurance-fees/validate-master.test.ts src/__tests__/insurance-fees/golden-cases.test.ts src/__tests__/insurance-fees/revenue-estimate-link.test.ts
npm run type-check
npm run lint
npm run build
```

Migration push 前:

```powershell
supabase db push --dry-run
```

Expected remote dry-run:

```txt
Would push these migrations:
 • 20260524000100_seed_judo_hi_r6_active_master.sql
```

## Rollout

1. Phase 3B UI/API PR を merge する。
2. `main` を pull する。
3. `codex/insurance-fee-master-phase3c-judo-hi-r6-seed` を作る。
4. Phase 3C-1 seed migration / rollback / tests を実装する。
5. local dry-run と focused tests を通す。
6. PR 作成。
7. GitHub checks 通過後に merge。
8. `supabase db push --dry-run` で対象 migration が Phase 3C-1 のみか確認。
9. `supabase db push`。
10. `/revenue` の詳細画面で active schedule / item provenance を手動確認する。

## Non-Scope

- 請求確定額の算出
- レセコン互換
- 保険者別の個別判断
- 交通事故・自賠責の自動単価
- 2026改定案の active 化
- 院管理者向け master maintenance UI
- 既存日報 fee の一括再計算
