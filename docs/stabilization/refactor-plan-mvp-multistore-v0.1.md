# Refactor Plan For Multi-Store MVP v0.1

## 1. 目的

この計画は、初期顧客が多店舗運営である前提で、MVPリリースに必要な最小限のリファクタリングを定義する。

目的は次の4点に限定する。

1. `build` / `type-check` を通す
2. 多店舗の tenant boundary と HQ 権限を安定化する
3. 未接続UIと廃止済み経路を整理して MVP 面積を縮小する
4. 最小導線を E2E / DoD で検証可能な状態にする

## 2. 前提

- 1 task = 1 PR
- migration 変更は本計画の対象外
- migration が必要な場合は別 spec + rollback plan を作成する
- 既存の `docs/stabilization/DoD-v0.1.md` を検証基準とする
- 多店舗顧客前提のため、`/multi-store` と tenant 管理は削除対象ではない

## 3. 非目標

- 全面リネーム
- UIデザイン刷新
- セキュリティ監視機能の完成
- ベータ運用機能の拡張
- AIチャット品質の改善
- 課金/契約機能の新規実装

## 4. 問題の要約

### 4.1 型と Supabase 実装の収束不足

- `package.json` `scripts.type-check` と `scripts.build` が現時点で失敗している
- 中心は `src/types/supabase.ts` と API / service 層の型不整合
- 特に `security_events`, `user_mfa_settings`, `mfa_setup_sessions`, `staff_invites`, `clinic_settings`, `reservations`, `blocks` 付近の不整合が支配的

関連ファイル:

- `package.json` `scripts.type-check`
- `package.json` `scripts.build`
- `src/types/supabase.ts`
- `src/lib/supabase/server.ts` `createAdminClient`, `getUserPermissions`
- `src/app/api/**`
- `src/lib/services/block-service.ts`
- `src/lib/services/reservation-service.ts`
- `src/lib/mfa/mfa-manager.ts`
- `src/lib/mfa/backup-codes.ts`

関連DoD:

- `DOD-10`
- `DOD-12`

### 4.2 tenant boundary の判定が複数箇所に分散

- `middleware.ts`
- `src/app/admin/(protected)/layout.tsx` `resolveRole`
- `src/lib/supabase/guards.ts` `ensureClinicAccess`
- `src/lib/api-helpers.ts` `processApiRequest`, `verifyAdminAuth`
- `src/lib/supabase/server.ts` `getUserPermissions`, `canAccessClinicScope`

問題:

- 権限判定ロジックが散っており、HQ と clinic の境界不整合を起こしやすい
- 初期顧客が多店舗のため、ここは機能ではなく基盤

関連DoD:

- `DOD-08`
- `DOD-09`

### 4.3 管理設定に「保存される設定」と「保存されない設定」が混在

代表例:

- `src/components/admin/booking-calendar-settings.tsx`
  - `Online/notification settings remain local until API support is added.`
- `src/components/admin/communication-settings.tsx`
  - `smtpSettings.password`
- `src/app/api/admin/settings/route.ts` `PUT`
  - `clinic_settings` へ `settings: parseResult.data` を upsert
- `src/app/admin/(protected)/settings/page.tsx`
  - `componentMap` 未接続項目が多い
  - `設定画面を準備中`

問題:

- ユーザーにとっては「保存されたように見えるが、実際は未接続」の状態が残る
- SMTP秘密情報を一般設定テーブルに保存する設計は MVP 運用上危険

関連DoD:

- `DOD-09`
- `DOD-10`

### 4.4 廃止済み経路の残存

関連ファイル:

- `src/app/api/admin/master-data/route.ts` `GONE_RESPONSE`
- `src/app/master-data/page.tsx`
- `src/hooks/queries/useSystemSettingsQuery.ts`

問題:

- 410 を返す API をまだ hook が参照する
- MVP面積の整理と逆方向

関連DoD:

- `DOD-10`

## 5. リファクタ戦略

### 方針

- ビジネス仕様を広げない
- 既存の画面・API の意味を変えずに、境界と整合性を収束させる
- 変更は server / guard / API / settings / tests の順で進める
- 多店舗顧客に効く部分だけ残し、それ以外の管理機能は隠す

### 成功条件

1. `npm run type-check` が通る
2. `npm run build` が通る
3. 多店舗の tenant boundary がコード上と E2E で説明できる
4. 未接続設定が MVP 導線に残らない
5. 廃止済み経路を新規コードが参照しない

## 6. PR単位の実行計画

### PR-01 型・Supabase整合の収束

目的:

- `type-check` / `build` の最大ボトルネックを潰す

対象:

- `src/types/supabase.ts`
- `src/lib/supabase/server.ts` `createAdminClient`, `getUserPermissions`
- `src/app/api/admin/security/**`
- `src/app/api/admin/settings/route.ts`
- `src/app/api/admin/staff/invites/route.ts`
- `src/lib/mfa/mfa-manager.ts`
- `src/lib/mfa/backup-codes.ts`
- `src/lib/services/block-service.ts`
- `src/lib/services/reservation-service.ts`

作業:

1. `never` 化しているテーブル参照箇所を棚卸しする
2. `src/types/supabase.ts` の利用前提を統一する
3. `createAdminClient` / `getServerClient` の返り型の揺れを止める
4. `select/insert/update/upsert` の payload 型を `Database['public']['Tables'][...]['Insert'|'Update'|'Row']` に寄せる
5. `null` / `undefined` の扱いを API ごとに揃える

受け入れ条件:

- `npm run type-check` の主要 failing cluster が解消する
- `DOD-10`, `DOD-12` に直接効く変更のみで完結する

DoD:

- `DOD-10`
- `DOD-12`

### PR-02 tenant / HQ ガードの一本化

目的:

- 多店舗MVPで最重要の tenant boundary を一本化する

対象:

- `middleware.ts`
- `src/lib/supabase/guards.ts` `ensureClinicAccess`
- `src/lib/api-helpers.ts` `processApiRequest`, `verifyAdminAuth`
- `src/lib/supabase/server.ts` `getUserPermissions`, `canAccessClinicScope`
- `src/app/admin/(protected)/layout.tsx` `resolveRole`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[clinic_id]/route.ts`
- `src/app/api/chat/route.ts`

作業:

1. 権限の source of truth を `user_permissions` + `clinic_scope_ids` に寄せる
2. HQ横断閲覧と clinic 限定閲覧の条件を `ensureClinicAccess` に集約する
3. `middleware.ts` と `layout.tsx` は guard の結果に従う薄い層へ寄せる
4. `requireClinicMatch: false` を使っている API を再点検する
5. `/multi-store`, `/api/admin/tenants`, `/api/chat` の cross-clinic アクセスを仕様化する

受け入れ条件:

- HQ と clinic の許可条件が 1 系統で説明できる
- cross-clinic を許可する API と禁止する API が明文化される
- 多店舗顧客向けの最小要件に対応する

DoD:

- `DOD-08`
- `DOD-09`

### PR-03 管理設定のMVP収束

目的:

- 保存されない設定と危険な設定保存を整理する

対象:

- `src/components/admin/booking-calendar-settings.tsx`
- `src/components/admin/communication-settings.tsx`
- `src/components/admin/services-pricing-settings.tsx`
- `src/components/admin/insurance-billing-settings.tsx`
- `src/app/api/admin/settings/route.ts`
- `src/hooks/useAdminSettings.ts`
- `src/app/admin/(protected)/settings/page.tsx`

作業:

1. `booking-calendar-settings.tsx` の local state 項目を保存対象外として隠すか、明確に「未提供」にする
2. `communication-settings.tsx` の `smtpSettings.password` を永続化対象から外す設計に変える
3. `settings page` の `componentMap` とメニュー表示を MVP 実装済みカテゴリのみに寄せる
4. 「準備中」表示のカテゴリをナビから外すか feature-flag 化する

受け入れ条件:

- ユーザーに「保存できる設定」と「保存できない設定」が混在しない
- SMTP秘密情報が `clinic_settings` に流れない
- 管理設定画面の表示面積が MVP スコープと一致する

DoD:

- `DOD-09`
- `DOD-10`

### PR-04 廃止済み経路と非MVP経路の掃除

目的:

- 旧経路と非MVP経路を残したままの事故を減らす

対象:

- `src/app/api/admin/master-data/route.ts`
- `src/app/master-data/page.tsx`
- `src/hooks/queries/useSystemSettingsQuery.ts`
- `src/components/navigation/header.tsx`
- `src/components/navigation/sidebar.tsx`
- `src/components/navigation/mobile-bottom-nav.tsx`

作業:

1. `useSystemSettingsQuery.ts` から 410 API 依存を除去する
2. 非MVP経路を navigation から外す
3. 廃止済みページが残る場合は導線を完全に閉じる

受け入れ条件:

- 410 API を通常導線が叩かない
- 非MVPページが営業用導線に残らない

DoD:

- `DOD-10`

### PR-05 最小E2Eとリリース検証の固定

目的:

- 多店舗MVPとして必要な最低導線を固定する

対象:

- `src/__tests__/e2e-playwright/auth-context.spec.ts`
- `src/__tests__/e2e-playwright/cross-clinic-isolation.spec.ts`
- `src/__tests__/e2e-playwright/admin-tenants.spec.ts`
- `src/__tests__/e2e-playwright/public-menus-api.spec.ts`
- `src/__tests__/e2e-playwright/reservations.spec.ts`
- `docs/stabilization/DoD-v0.1.md`
- `docs/test-runbook.md`

作業:

1. HQ が scope 内店舗を横断閲覧できること
2. clinic ユーザーが他店舗を見られないこと
3. 公開予約が作成できること
4. 管理設定が MVP 対象カテゴリのみ正常保存できること
5. `build` / `type-check` / `Playwright` の実行順を runbook 化する

受け入れ条件:

- 多店舗MVPの最小導線をE2Eで説明できる
- `DOD-05` 〜 `DOD-11` のうち対象フローに必要なものが埋まる

DoD:

- `DOD-05`
- `DOD-06`
- `DOD-07`
- `DOD-08`
- `DOD-09`
- `DOD-10`
- `DOD-11`

## 7. 実行順

1. PR-01 型・Supabase整合の収束
2. PR-02 tenant / HQ ガードの一本化
3. PR-03 管理設定のMVP収束
4. PR-04 廃止済み経路と非MVP経路の掃除
5. PR-05 最小E2Eとリリース検証の固定

理由:

- PR-01 が通らないと以降の検証コストが高い
- PR-02 は多店舗MVPの基盤
- PR-03 / PR-04 は面積圧縮
- PR-05 は最後に固定化

## 8. リスク

### R-01 型不整合の一部が schema drift に起因する可能性

- `src/types/supabase.ts` の再生成だけで解消しない場合、migration/spec の話になる
- その場合は本計画から切り離す

### R-02 SMTP秘密情報は純粋なリファクタでは終わらない可能性

- 保存先を変えるには運用設計が要る
- 最低限の回避策は「UIから保存させない」

### R-03 多店舗KPIの定義が曖昧だと `/multi-store` を収束できない

- 初期顧客が必要とするKPIを先に固定する必要がある

## 9. 完了条件

この計画の完了条件は次のとおり。

1. `npm run type-check` 成功
2. `npm run build` 成功
3. tenant boundary と HQ 閲覧権限の説明が `guards.ts` / `middleware.ts` / E2E で一致
4. 非MVP経路がナビに残らない
5. 管理設定の未接続項目が MVP 導線に出ない
6. 多店舗MVPの最小導線が Playwright で再現できる
