# clinic_admin を予約可能な施術者リソースとして扱う仕様 v0.1

## 背景

予約 UI の担当者列・担当者選択は `resources(type = 'staff')` を正として参照している。一方で、店舗管理者アカウント作成時は `staff` / `profiles` / `user_permissions` の作成に留まり、`resources` に対応行がないため、院長である `clinic_admin` が施術者候補に表示されない。

## 仕様

- `clinic_admin` は店舗管理者であり、院長として施術者候補にも表示できる。
- 新規テナント作成時に `clinic_admin` アカウントを作る場合、同じ UUID で `resources` に `type = 'staff'` の予約可能リソースを作成する。
- 既存データは `staff.role in ('clinic_admin', 'clinic_manager')` かつ `clinic_id is not null` の行を対象に、対応する `resources` 行を補完する。
- 既存データの補完では `staff` 行を変更せず、予約 UI が参照する `resources` のみを追加・更新する。
- テナント境界は `clinic_id` を維持し、RLS ポリシーの変更は行わない。

## 非対象

- `resources` と `staff` の完全統合。
- シフト・勤務可能時間の詳細設定。
- 一般スタッフ作成時のリソース自動同期。

## Rollback Plan

- 追加した `resources.staff_code like 'clinic-admin-%'` のリソースを論理削除する。
- ロールバックにより対象 clinic_admin は予約担当者候補から外れる。
