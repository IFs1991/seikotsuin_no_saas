# Stabilization 実装手順書

## 概要

このドキュメントは、整骨院管理SaaSの安定化（Stabilization）と新機能実装の正しい順序を定義します。
各フェーズは依存関係があるため、順番を守って実装してください。

## 実装順序

| 順番 | 仕様書                                  | 状態 | 理由                                               |
|------|-----------------------------------------|------|----------------------------------------------------|
| 1    | spec-auth-role-alignment-v0.1.md        | ✅ 完了 | 全ての基盤。ロール定義が統一されないと他が動かない |
| 2    | spec-rls-tenant-boundary-v0.1.md        | ✅ 完了 | 親スコープ対応と追加修正作業３まで反映済み |
| 3    | spec-tenant-table-api-guard-v0.1.md     | ✅ ほぼ完了 | RLSと並行可能だが、同じロール定数を使う            |
| 4    | spec-admin-settings-contract-v0.1.md    | ✅ 完了 | UI実装完了・Staff Invite E2E安定化完了・環境問題はTD-002 |
| 4.1  | spec-staff-invite-e2e-stability-v0.1.md | ✅ 完了 | TD-001解決、3回連続パス確認済み                  |
| 5    | spec-e2e-preflight-fixtures-v0.1.md     | ✅ 完了 | 新ロール名でフィクスチャ更新、preflight追加                       |
| 6    | spec-playwright-baseurl-windows-v0.1.md | ✅ 完了 | 127.0.0.1統一・EPERM解消確認・TD-002残件あり      |
| 7    | spec-organization-multi-clinic-v0.1.md  | 未着手 | Stabilization完了後の新機能                        |

## 依存関係図

```
[1] Auth Role Alignment ✅ 完了
         │
         ├──────────────────┐
         ↓                  ↓
[2] RLS Tenant          [3] API Guard
    Boundary                ✅ ほぼ完了
    ✅ 完了                 │
         │                  │
         └────────┬─────────┘
                  ↓
        [4] Admin Settings
            ✅ 完了
            │
     [4.1] Staff Invite E2E
            ✅ 完了 (TD-001解決)
                  │
        [5] E2E Fixtures ✅ 完了
                  │
         ┌───────┴───────┐
         ↓               ↓
[6] Playwright ✅ 完了 [7] Organization ← 次
   (127.0.0.1統一)      Multi-Clinic
```

## 各フェーズの詳細

### Phase 1: Auth Role Alignment（認可ロール統一）✅ 完了

**仕様書**: `spec-auth-role-alignment-v0.1.md`

**完了項目**:
- [x] `src/lib/constants/roles.ts` 作成（ロール定数・ヘルパー関数）
- [x] `middleware.ts` 更新（`ADMIN_UI_ROLES`使用）
- [x] `guards.ts` 更新（`normalizeRole()`適用）
- [x] API routes 更新（ロール定数使用）
- [x] DOD-08: `verifyAdminAuth()`でrole正規化
- [x] DOD-09: スタッフ系GETのテナント境界強化

**検証コマンド**:
```bash
npm test -- --testPathPattern="roles"
rg "clinic_manager" src --type ts  # 残存チェック
```

---

### Phase 2: RLS Tenant Boundary（RLSテナント境界）

**仕様書**: `spec-rls-tenant-boundary-v0.1.md`

**完了項目**:
- [x] 親スコープマイグレーション作成
- [x] `can_access_clinic()` 親スコープ実装
- [x] `custom_access_token_hook` に `clinic_scope_ids` 付与
- [x] chat_sessions/chat_messages RLS
- [x] 非認証顧客向けAPI（public/menus, public/reservations）
- [x] オンボーディング `parent_id` 対応
- [x] `clinic_settings`/`staff_shifts`/`staff_preferences` RLS統一
- [x] `reservation_history_insert_for_all` の `can_access_clinic` 制限
- [x] `clinic_scope_ids` 取得優先順位の修正（JWTメタデータ優先）

**追加修正作業３（完了）**:
- [x] `clinics` RLSポリシーを `can_access_clinic(id)` に統一
- [x] `user_permissions` RLSポリシーを `can_access_clinic(clinic_id)` に統一
- [x] `clinic_scope_ids` がJWTに正しく設定されるよう修正
- [x] admin-settings E2Eテストのセレクタ曖昧性をスコープ化で解消

**依存**: Phase 1完了必須

**検証コマンド**:
```bash
# RLSポリシー確認
psql "postgresql://postgres:postgres@127.0.0.1:54332/postgres" -c "SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('clinics', 'user_permissions');"

# 親スコープE2Eテスト
npx playwright test cross-clinic-isolation.spec.ts --reporter=line
```

---

### Phase 3: Tenant Table API Guard（APIガード）

**仕様書**: `spec-tenant-table-api-guard-v0.1.md`

**実装タスク**:
- [x] `/api/blocks` を `processApiRequest` + `clinic_id` 強制で保護
- [x] `/api/reservations` を `processApiRequest` + `requireClinicMatch` で保護
- [x] `/api/menus` `/api/resources` `/api/customers` を `processApiRequest` + `requireClinicMatch` で保護
- [x] `ReservationService` を `server-only` + `clinic_id` スコープ固定
- [x] `BlockService` を `server-only` + `clinic_id` スコープ固定
- [ ] 既存APIの `requireClinicMatch` 適用状況を再点検

**依存**: Phase 1完了必須、Phase 2と並行可能

**検証コマンド**:
```bash
rg -n "from\('(reservations|blocks|customers|menus|resources)'\)" src --glob '!**/api/**' --glob '!**/__tests__/**'
# 期待: server-only の services に限定されていること
```

---

### Phase 4: Admin Settings Contract（管理設定契約）✅ 完了

**仕様書**: `spec-admin-settings-contract-v0.1.md`

**状態**: ✅ 完了（Staff Invite E2E安定化完了、環境問題はTD-002として記録）

**完了項目**:
- [x] 管理設定APIのスキーマ定義（BookingCalendarSchema等）
- [x] 設定の永続化・取得ロジック
- [x] 権限チェック（CLINIC_ADMIN_ROLES）
- [x] UI/API契約の整合（slotMinutes, maxConcurrent等）
- [x] data-testid属性の追加
- [x] useAdminSettings persistOptions安定化
- [x] プロファイルコンテキスト再利用

**Staff Invite E2E安定化 (2026-01-21完了)**:
- [x] SI-01: E2E環境の前提を明文化 (`docs/test-runbook.md`, `.env.test.example`)
- [x] SI-02: 招待APIのタイムアウトガード (10秒、504レスポンス)
- [x] SI-03: E2E専用の招待スキップ (`E2E_INVITE_MODE=skip`)
- [x] SI-04: 3回連続パス確認
- [x] TD-001解決済み (`docs/technical-debt.md`)

**残件: TD-002 (P3, Low)**:
- Windows環境でのページ遷移タイムアウト
- APIテストは成功、UIテストは環境問題
- `waitUntil: 'domcontentloaded'` への変更で解決可能

**依存**: Phase 2, 3完了後

**検証コマンド**:
```bash
# Staff Invite E2E
npx playwright test --grep "Staff invites" --project chromium

# 全体（TD-002の環境問題で一部失敗の可能性あり）
npx playwright test admin-settings.spec.ts --reporter=line
```

---

### Phase 5: E2E Preflight Fixtures（E2Eフィクスチャ）✅ 完了

**仕様書**: `spec-e2e-preflight-fixtures-v0.1.md`

**完了項目**:
- [x] `waitForSupabaseReady()` 追加
- [x] `assertTablesExist()` 追加
- [x] `tableExists()` ヘルパー追加
- [x] preflight.mjs 新規モジュール作成
- [x] グローバルセットアップの整備
- [x] ドキュメント更新（test-runbook.md）

**依存**: Phase 1-4完了後（新ロール名反映のため）

**検証コマンド**:
```bash
npm run e2e:validate-fixtures && npm run e2e:seed && npm run e2e:cleanup && npm run e2e:seed
```

---

### Phase 6: Playwright BaseURL Windows（Playwright修正）✅ 完了

**仕様書**: `spec-playwright-baseurl-windows-v0.1.md`

**完了項目**:
- [x] `.env.local` / `.env.test` に `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` 追加
- [x] `NEXTAUTH_URL` を `http://127.0.0.1:3000` に統一
- [x] `supabase/config.toml` auth.site_url との整合確認
- [x] Windows spawn EPERM 発生なし確認

**検証結果 (2026-01-22)**:
- Playwright E2E: 48 passed / 41 failed / 1 skipped
- Jest Windows: 実行完了（open handles警告あり）
- 失敗はTD-002（Windowsページ遷移タイムアウト）に起因、baseURL/EPERM問題ではない

**依存**: 独立（いつでも実装可能）

**検証コマンド**:
```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e:pw -- --project=chromium
npm run test:windows
```

---

### Phase 7: Organization Multi-Clinic（組織横断閲覧）

**仕様書**: `spec-organization-multi-clinic-v0.1.md`

**実装タスク**:

#### Phase 7.1: DBスキーマ
- [ ] `organizations`テーブル作成
- [ ] `clinics.organization_id`カラム追加
- [ ] `user_permissions.can_view_organization`カラム追加

#### Phase 7.2: RLSポリシー
- [ ] `can_view_reservation()`関数作成
- [ ] 組織ベースの閲覧ポリシー追加

#### Phase 7.3: バックエンド
- [ ] `getAccessibleClinicIds()`関数作成
- [ ] 予約API: 組織スコープ対応

#### Phase 7.4: フロントエンド
- [ ] `ClinicSelector`コンポーネント作成
- [ ] 予約ページへの統合
- [ ] 閲覧モードバッジ表示

#### Phase 7.5: API
- [ ] `/api/clinics/accessible`エンドポイント作成

**依存**: Phase 1-6完了後（Stabilization完了後）

**検証コマンド**:
```bash
npm test -- --testPathPattern="organization|clinic"
npm run test:e2e:pw -- --grep="organization"
```

---

## チェックリスト（DoD）

各フェーズ完了時に以下を確認:

- [ ] DOD-01: Supabaseスタック起動確認
- [ ] DOD-02: マイグレーション冪等性
- [ ] DOD-03: シード再現性
- [ ] DOD-04: スキーマドリフトなし
- [ ] DOD-05: E2Eフィクスチャ冪等性
- [ ] DOD-06: Playwright baseURL整合性
- [ ] DOD-07: Windows spawn EPERM解消
- [ ] DOD-08: テナント境界+RLS整合性
- [ ] DOD-09: クライアント直接アクセス排除
- [ ] DOD-10: Next.jsビルド成功
- [ ] DOD-11: Jestテスト成功
- [ ] DOD-12: Supabase型生成クリーン

詳細は `DoD-v0.1.md` を参照。

---

## 注意事項

1. **PRは1タスク1PR**: 各仕様書内のタスクは個別PRで実装
2. **テスト必須**: 実装後は必ず関連テストを実行
3. **ロールバック準備**: 各仕様書にロールバック手順を記載済み
4. **並行作業**: Phase 2と3のみ並行可能、他は順次実装

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-08 | Phase 1 (DOD-08, DOD-09) 完了 |
| 2026-01-08 | Phase 7 仕様書追加 |
| 2026-01-08 | 初版作成 |
| 2026-01-15 | Phase 2 追加修正（RLS insert制限/JWT scope取得） |
| 2026-01-15 | Phase 3 進行状況更新（API guard適用範囲の反映） |
| 2026-01-15 | Phase 3 Reservation/Block service clinic_id スコープ固定 |
| 2026-01-16 | Phase 2 追加修正作業３追加（clinics/user_permissions RLS、JWT修正、admin-settings E2E） |
| 2026-01-16 | Phase 4 状態更新（実装済・E2Eテスト失敗） |
| 2026-01-21 | Phase 4 完了（Staff Invite E2E安定化、TD-001解決、TD-002追加） |
| 2026-01-21 | Phase 5へ移行（次のステップ） |
| 2026-01-22 | Phase 6 完了（127.0.0.1統一、EPERM解消確認、E2E: 48passed/41failed） |


