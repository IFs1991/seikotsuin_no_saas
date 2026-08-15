# Onboarding Clinic 権限境界 修正仕様 v0.1

## Overview

- **Purpose**: `/api/onboarding/clinic` の自己昇格（privilege escalation）およびテナントツリー汚染（tenant tree poisoning）脆弱性を修正する。あわせて `/api/beta/metrics` のスコープ判定を共通ヘルパーに揃える。
- **DoD**: DOD-02（テナント分離）, DOD-08（ロール整合）。[docs/stabilization/DoD-v0.1.md](./DoD-v0.1.md)
- **Related**: [spec-rls-tenant-boundary-v0.1.md](./spec-rls-tenant-boundary-v0.1.md), [spec-auth-role-alignment-v0.1.md](./spec-auth-role-alignment-v0.1.md)
- **Priority**: **Critical**（Issue 1）/ **Medium**（Issue 2）
- **Risk**: 認証済みユーザーによる admin 自己昇格・他テナントへの子クリニック接続（テナント分離違反、医療情報系での重大リスク）
- **Rule**: 1 task = 1 PR。RLS/認可の不変条件を「テストを通すため」に弱めない。`clinic_id`/`role`/`user_id` に触れる変更はテスト追加が必須（AGENTS.md）。

---

## Issue 1 (Critical): `/api/onboarding/clinic` の自己昇格 + テナントツリー汚染

### 対象

`src/app/api/onboarding/clinic/route.ts`（`POST`）

### 現状の問題

`POST /api/onboarding/clinic` は認証（`getCurrentUser`）のみを確認し、以下を**無条件**で実行する。

1. **admin 自己昇格 (privilege escalation)**
   - `user_permissions` を `onConflict: 'staff_id'` で upsert し `role: 'admin'` を設定（現状 200-211 行目）。
   - `profiles.role` を `admin` に更新（現状 183-190 行目）。
   - `staff.role` を `admin` に同期（現状 247-256 行目）。
   - → **クリニックA に `staff` として招待されたユーザーが本APIを直接叩くだけで、新規クリニックの `admin` に昇格できる。** 「まだオンボーディング中で、どのクリニックにも所属していない」ことのガードが存在しない。

2. **テナントツリー汚染 (tenant tree poisoning)**
   - リクエストボディの `parent_id` は「存在するか」しか検証されない（現状 136-157 行目）。
   - → **他テナントのクリニックIDを `parent_id` に指定し、自分のクリニックをそのテナント配下の子として接続できる。** `resolveHierarchicalClinicScopeIds`（`src/lib/supabase/server.ts`）は親→子方向に展開するため、被害側テナントの admin スコープに攻撃者クリニックが混入し、集計・課金・多店舗表示に影響する。

### 期待仕様

#### 1-A. オンボーディング適格性ガード（自己昇格の遮断）

`admin` を付与する前に、リクエストユーザーが「新規オンボーディング中で、まだクリニックに所属していない」ことを検証する。以下を **fail-closed** で判定する。

- **既存の有効な `user_permissions` を持つユーザーは拒否する。**
  - `user_permissions` に当該 `staff_id` のレコードが既に存在し、かつ `clinic_id` が非 null の場合は `409 Conflict`（または `403 Forbidden`）を返し、admin 付与処理を一切実行しない。
  - 「オンボーディング中」の判定は `onboarding_states` を正とする。当該ユーザーの `onboarding_states.current_step` が `clinic` 作成前の状態（例: `profile` / 初期状態）であることを要求し、`clinic_id` が既に確定済みの `onboarding_states` レコードがある場合は再作成を拒否する（冪等でない admin 昇格を防ぐ）。
- 上記を満たさない場合、`clinics` / `profiles` / `user_permissions` / `staff` への書き込みを一切行わない。

> 実装メモ: 判定は service role (`createAdminClient`) で `user_permissions` と `onboarding_states` を読む。既存レコードの有無で分岐し、`upsert(..., { onConflict: 'staff_id' })` による無条件上書きは**行わない**（`insert` に切り替え、衝突時はエラーとして扱う）。

#### 1-B. `parent_id` のスコープ検証（テナントツリー汚染の遮断）

`parent_id` が指定された場合、次を必須とする。

- **`parent_id` はリクエストユーザーがアクセス可能なスコープ内でなければならない。**
  - ユーザーの `user_permissions` から `resolveScopedClinicIds()`（`src/lib/supabase/server.ts`）でスコープを解決し、`parent_id` がそのスコープに含まれることを `canAccessClinicScope()` で検証する。
  - スコープ外の `parent_id` は `403 Forbidden`。
- **新規オンボーディング（既存所属なし）のユーザーは、原則 `parent_id` を指定できない。**
  - 新規ユーザーはまだどのテナントにも属さないため、他テナントを親に指定する正当な理由がない。`parent_id` が指定され、かつユーザーがどのスコープにも属していない場合は `403 Forbidden`。
  - 親子（本部→子）作成フローが必要な場合は、Issue 1-A を通過した「既存テナントの admin」のみが自テナントスコープ内の `parent_id` を指定できる、と限定する。

#### 1-C. ロール正規化の一貫性

- 付与・比較するロールは `normalizeRole()`（`src/lib/constants/roles.ts`）を通す。ハードコードした `'admin'` 文字列比較を避け、既存の定型（`ensureClinicAccess` / `canAccessClinicScope`）に合わせる。

### 受け入れ条件（Issue 1）

- [ ] 既存の有効な `user_permissions`（`clinic_id` 非 null）を持つユーザーが `POST /api/onboarding/clinic` を呼ぶと、admin 昇格が発生せず 4xx が返る。
- [ ] スコープ外の `parent_id` を指定すると `403` が返り、`clinics` に行が作られない。
- [ ] 新規（未所属）ユーザーが `parent_id` を指定すると `403`。
- [ ] 正規のオンボーディング（未所属・`parent_id` なし）は従来どおり成功し、`clinic` + `admin` 権限が付与される（後方互換）。
- [ ] `console.error` を `logger` + 既存のエラーハンドリング（`handleRouteError` 等）に統一する。

---

## Issue 2 (Medium): `/api/beta/metrics` のスコープ判定を共通化

### 対象

`src/app/api/beta/metrics/route.ts`（`GET` / `POST`）

### 現状の問題

- 共通ヘルパー（`processApiRequest` / `verifyAdminAuth` / `ensureClinicAccess`）を使わず生の Supabase クエリを組んでいる。
- GET は `profile.role !== 'admin'` の場合に単一 `profile.clinic_id` でのみ絞り込み、**`clinic_scope_ids`（複数店舗 manager）を考慮しない**。
- `role` 判定に `normalizeRole` を通していないため、`clinic_manager` 互換が効かない。
- POST は `createAdminClient` で RLS をバイパスしつつ、`clinicId` をスコープ検証なしで書き込む（admin チェックはあるが、admin も親スコープに限定される設計方針に反する）。

### 期待仕様

- **GET**: `processApiRequest`（または `verifyAdminAuth`）で認証・ロール解決を行い、スコープ絞り込みは `resolveScopedClinicIds()` / `canAccessClinicScope()` を使う。単一 `clinic_id` 直接比較を廃止し、`clinic_scope_ids` 対応にする。
- **POST**: `clinicId` を書き込む前に `canAccessClinicScope()` でユーザースコープ内であることを検証する。admin であってもスコープ外 `clinic_id` への書き込みは `403`。
- `role` 判定は `normalizeRole()` 経由に統一。
- （任意）本ルートが Pilot mode で無効化対象かを確認し、不要なら `410 Gone` 化も検討。

### 受け入れ条件（Issue 2）

- [ ] 複数店舗 manager が自スコープ内の全クリニックのメトリクスを取得できる。
- [ ] スコープ外 `clinicId` での GET/POST が `403` になる。
- [ ] `clinic_manager`（互換ロール）が正しく `clinic_admin` として扱われる。

---

## 非対象（Out of Scope）

- RLS ポリシー自体の変更（本修正はアプリ層の認可ガード追加が主眼。RLS は最後の砦として既存のまま維持）。
- `/api/onboarding/invites` / `/api/onboarding/seed`（別途 `onboarding_states.clinic_id` を正としてスコープ確定しており、本修正の直接対象外。ただし Issue 1 の適格性ガード追加後は挙動を回帰確認する）。
- `console.*` の全面 `logger` 移行（Issue 1 の対象ファイルのみ実施。全体移行は別タスク）。

---

## テスト計画

配置: `src/__tests__/api/` および `src/__tests__/security/`（`*.test.ts` → node 環境）。

1. **自己昇格の遮断**（Issue 1-A）
   - 既存 `user_permissions`（`role: 'staff'`, `clinic_id` 非 null）を持つユーザーで `POST /api/onboarding/clinic` → 4xx、DB に新 admin 権限が作られないこと。
2. **テナントツリー汚染の遮断**（Issue 1-B）
   - 他テナントの `clinic_id` を `parent_id` に指定 → `403`、`clinics` 未作成。
   - 未所属ユーザーが `parent_id` 指定 → `403`。
3. **後方互換**（Issue 1）
   - 未所属・`parent_id` なしの正規フロー → `201`、`clinic` + admin 付与。
4. **beta/metrics スコープ**（Issue 2）
   - 複数店舗 manager が自スコープ全件取得できる。
   - スコープ外 `clinicId` の GET/POST が `403`。

---

## ロールバック

- 本修正はマイグレーションを含まない（アプリ層ガードのみ）ため、コード revert で完全に戻せる。
- 万一オンボーディング正規フローに回帰が出た場合は、Issue 1-A の適格性ガードのみを一時的に緩和できるよう、判定ロジックを単一関数（例: `assertOnboardingEligible()`）に切り出しておくこと。

---

## 実装順序

1. Issue 1-A（適格性ガード）→ 1-B（`parent_id` スコープ検証）→ 1-C（ロール正規化）→ テスト。
2. Issue 2（`beta/metrics` 共通化）→ テスト。
3. `npm run type-check` / `npm run lint` / `npm run test:pr05:focused` をローカルで通す（CI 必須ゲート）。
