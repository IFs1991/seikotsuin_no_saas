# マルチテナント重点修正案（一般的なSaaS準拠）

目的: テナント分離を「DB側のRLSで担保」し、API/クライアントは補助的に整合チェックする設計に揃える。

## 前提・設計方針（一般的なSaaS準拠）
- データ分離の主戦場はRLS。APIでのフィルタは防御の第2層。
- クロステナント権限は「システム管理者のみ」に限定する。
- `clinic_id` はテナントスコープの主キーとして必須（NULL許容は原則なし）。
- ビュー/マテビュー経由でもRLSが適用される設計に統一する。

## 主要な問題点（現状）
1. 予約系テーブルのRLSがロール判定のみで `clinic_id` を見ていない。
2. `clinic_manager` がクロステナント扱いになっている。
3. RLSポリシー定義が `supabase/migrations` と `src/database/policies` で分散しており、適用状況が不明確。
4. クライアントからSupabase直アクセス（BlockServiceなど）があり、RLS不備と組み合わさると他テナント参照が可能。

## 修正案（優先度順）

### 1) 予約系RLSの `clinic_id` 対応（最優先）
対象: `customers / menus / resources / reservations / blocks / reservation_history`

対応方針:
- 既存の予約系RLSを全削除 → `clinic_id` によるスコープ判定を追加したRLSへ置換。
- ロール判定は `auth.get_current_role()`（user_permissions/JWT統一版）へ寄せる。

ポリシー例（概念）:
- SELECT: `auth.belongs_to_clinic(clinic_id)`
- INSERT/UPDATE: `auth.belongs_to_clinic(clinic_id)` かつ `role in ('admin','clinic_manager','staff')`
- DELETE: `role in ('admin','clinic_manager')` かつ `auth.belongs_to_clinic(clinic_id)`

備考:
- 既存の `public.user_role()` は互換維持に留め、最終的には `auth.get_current_role()` を利用。
- テナント内の操作権限は「clinic_manager >= staff」を想定。

### 2) `clinic_manager` のクロステナント権限を廃止
対象: `src/lib/supabase/guards.ts`

方針:
- `CROSS_CLINIC_ROLES` を `admin` のみに変更。
- もし clinic_manager に例外が必要なら「明示的に許可したAPIだけ」個別許可。

理由:
- 一般的なSaaSではテナント管理者は自テナント限定。

### 3) RLSの単一ソース化（supabase/migrationsへ集約）
方針:
- `src/database/policies/auth_policies.sql` を「参考」に留め、実運用は `supabase/migrations` に集約。
- 既存の `auth_policies.sql` 内容を、Supabaseマイグレーションとして追加する（新規migration）。

理由:
- 実際のDBに適用される場所を統一し、RLSの適用漏れを防止。

### 4) `clinic_id` のNOT NULL化（予約系）
対象: `customers / menus / resources / reservations / blocks / reservation_history`

対応方針:
- 既存データを `clinic_id` にバックフィル。
- 以降は `clinic_id NOT NULL` を付与。
- INSERT時に `clinic_id` を必須にするAPI/バリデーションを追加。

理由:
- テナントスコープがNULLだとRLS/フィルタの安全性が落ちる。

### 5) クライアント直アクセスの削減
対象: `BlockService`, `ReservationService` など

方針:
- API経由のCRUDに置き換え、`ensureClinicAccess` でガード。
- どうしても直アクセスを残す場合は `clinic_id` フィルタを必須化し、RLSが完璧であることを前提とする。

理由:
- 一般的なSaaSでは「ブラウザ直アクセスは最小化」する。

### 6) 管理系APIのテナント境界の明確化
対象: `/api/admin/*`, `/api/beta/*`

方針:
- `admin` 以外は自テナント限定に統一。
- `admin` でも「許可済みテーブルのみ」操作可能に固定。

## 具体的な実施タスク案
1. 新規Supabase migrationで予約系RLS置換（clinic_id対応）
2. `ensureClinicAccess` のクロステナントロール見直し（adminのみ）
3. `clinic_id` NOT NULL化 + APIバリデーション強化
4. `BlockService` をAPI経由に移行
5. RLSの適用状態を検証（マルチテナント想定のテスト）

## 検証観点
- 異なる `clinic_id` のユーザーが他テナントデータを取得できない
- `admin` のみが横断検索できる
- `clinic_manager` は自テナント内のみ
- `clinic_id` がNULLのデータが存在しない

## 補足（リスク回避）
- 予約系RLS更新は既存環境に影響が大きいので、段階的に実施する。
- RLS更新後は必ずAPI/画面の主要フローをリグレッション確認する。
