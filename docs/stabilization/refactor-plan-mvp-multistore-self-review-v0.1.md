# Self Review: Refactor Plan For Multi-Store MVP v0.1

## Findings

### 1. [High] PR-03 は純粋なリファクタだけでは完結しない可能性がある

- 対象: `src/components/admin/communication-settings.tsx` `smtpSettings.password`, `src/app/api/admin/settings/route.ts` `PUT`
- 問題: SMTP秘密情報の扱いはコード整理だけでなく、運用上の保存先設計が必要
- 影響: 「リファクタ計画」のつもりで着手しても、途中で設計判断待ちになる恐れがある
- 対応: PR-03 は2段階に分けるべき
  - Phase A: `clinic_settings` に保存しない
  - Phase B: 正式な secret 管理方式を別タスクで導入する

### 2. [High] PR-01 は schema drift を含む場合に詰まる可能性がある

- 対象: `src/types/supabase.ts`, `src/lib/supabase/server.ts`, `src/app/api/**`
- 問題: 現在の型エラーの一部はコード修正ではなく schema/typegen 側のズレである可能性が高い
- 影響: 「コードの直し」で終わらず、migration spec が必要になる場合がある
- 対応: PR-01 開始時に「typegen 再生成で解決する範囲」と「schema spec が要る範囲」を切り分けるべき

### 3. [Medium] PR-02 は多店舗仕様の確定なしに進めると手戻りが出る

- 対象: `middleware.ts`, `src/lib/supabase/guards.ts` `ensureClinicAccess`, `src/app/api/admin/tenants/route.ts`
- 問題: HQ ユーザーがどこまで横断閲覧できるかが曖昧だと、guard の統一ができない
- 影響: 一度まとめても、顧客要件で再分岐する可能性がある
- 対応: 着手前に最低限これだけは確定する
  - HQ は全店舗閲覧か、scope 内のみか
  - HQ は更新もできるか、閲覧のみか
  - `/multi-store` と `/api/admin/tenants` の対象者

### 4. [Medium] PR-04 のナビ整理はテスト修正を伴う

- 対象: `src/components/navigation/header.tsx`, `src/components/navigation/sidebar.tsx`, `src/components/navigation/mobile-bottom-nav.tsx`
- 問題: 非MVP導線を消すと、既存のコンポーネントテストやE2Eが落ちる可能性が高い
- 影響: 小さい変更のつもりでも、関連テスト修正が広がる
- 対応: PR-04 では UI 変更とテスト修正を同一PRで閉じるべき

### 5. [Low] PR-05 は検証タスクであり、リファクタというより安定化タスク

- 対象: `src/__tests__/e2e-playwright/**`, `docs/test-runbook.md`
- 問題: 名称が「リファクタ計画」だが、最後のPRは実質的に検証固定化
- 影響: ステークホルダー間で「なぜテスト修正がリファクタに含まれるのか」が曖昧になりうる
- 対応: 実行時は「Refactor + Verification」の束として扱う

## Open Questions

1. 多店舗KPIの MVP 最低要件は何か
2. HQ 権限は閲覧専用か、tenant 作成/更新まで含むか
3. SMTP/通知は MVP で本当に必要か、あるいは一時停止可能か

## Review Summary

計画の方向自体は妥当。

特に良い点:

- 多店舗前提で `tenant boundary` を P0 に上げている
- `build/type-check` を先頭に置いている
- 未接続UIと廃止済み経路を明確に分離している

主な修正ポイント:

- PR-03 は「秘密情報の保存を止める」と「正式なsecret管理を導入する」を分離する
- PR-02 着手前に HQ 権限の最小仕様を固定する
- PR-01 は typegen と schema drift の境界を最初に判定する

## Final Assessment

- 計画の実行可能性: **高い**
- 仕様未確定による手戻りリスク: **中**
- migration/spec 依存に転ぶリスク: **中**

結論:

- この計画はそのまま使える
- ただし、着手順の前に「多店舗仕様の最小確定」を短く挟むべき
