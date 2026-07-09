# spec-mobile-uiux-manager-scope-v0.1

## 背景 / 問題

モバイル UI/UX の principal 判定（`evaluateMobileUiuxPrincipal`）は
`resolveScopedClinicIds()`（`user_permissions.clinic_id` / `clinic_scope_ids`）のみで
店舗スコープを解決していた。manager の店舗スコープの正は
`manager_clinic_assignments`（`revoked_at is null`）であり、`user_permissions` 側には
スコープを持たないため、manager は常に `clinic_scope_empty` で 403 になっていた。

本番ログ（2026-07-09, `/api/mobile-uiux/context` 403）:

```
reasonCode: 'clinic_scope_denied', role: 'manager', scopedClinicCount: 0
```

この 403 により `MobileUiuxEntryPrompt`（ヘッダー「スマホ版で開く」/ モバイル導線バナー）も
manager には表示されなかった（リンクは context API の成功にゲートされているため、
アクセス修正がそのままリンク表示の修正になる）。

## 変更内容

### `src/lib/mobile-uiux/access.ts`

非同期の `resolveMobileUiuxPrincipal()` を追加:

1. ロール判定（`allowedRoles`）— 既存と同一。拒否時は DB を参照しない
2. `role !== 'manager'` → 既存の `evaluateMobileUiuxPrincipal()` に委譲（挙動不変）
3. `role === 'manager'` → `resolveManagerAssignedClinicIds(adminClient, userId)`
   （`src/lib/auth/manager-scope.ts`）で有効な担当店舗を解決
   - 担当店舗ゼロ / 参照失敗は fail-closed（`clinic_scope_empty` 403）
   - `user_permissions.clinic_id` / `clinic_scope_ids` へはフォールバックしない
     （`resolveEffectiveClinicScope` および RLS `app_private.can_access_clinic` の
     manager 分岐と整合させるため）

### 呼び出し側（sync → async 差し替え）

- `src/app/api/mobile-uiux/context/route.ts`
- `src/lib/mobile-uiux/screen-route-handler.ts`
- `src/app/(app)/mobile-uiux/page.tsx`

rollout / entitlement 判定（`resolveMobileUiuxRolloutWithEntitlements`）は
principal の `clinicIds`（= manager は担当店舗）を受けるため変更なし。
データ系 API（home / reservations 等）は `ensureClinicAccess()` が既に
manager 分岐を持つため変更なし。

## 影響しないこと

- UI 変更なし（`navigation.ts` / `MobileUiuxEntryPrompt` は既に manager 対応済み）
- 他ロールの判定は完全に既存挙動（`evaluateMobileUiuxPrincipal` 委譲）
- DB マイグレーションなし

## テスト

- `src/__tests__/lib/mobile-uiux-access.test.ts`
  - manager: assignments からスコープ解決 / assignments ゼロで拒否 /
    ロール除外時は DB 不参照 / 非 manager は assignments 不参照 / 参照例外で fail-closed
- `src/__tests__/api/mobile-uiux-access.test.ts`
  - screen ルート: assignments のみの manager が 200 /
    assignments ゼロの manager は `clinic_scope_ids` があっても 403

## 運用

- RUNBOOK「5. Mobile UI/UX のアクセス拒否」に manager の切り分け・通過条件を追記
