# ESLint残存31件エラー解消計画 v0.1

**ステータス: 完了（2026-01-23）**

目的: `lint:fix` 実行後に残る **31件のエラー** を最小変更で解消し、DoD-10（Next buildがESLintエラーなしで通る）に到達する。

---

## 実装結果サマリー

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| **エラー** | 31件 | **0件** |
| **警告** | 298件 | 298件 |

**DoD-10達成: ESLintエラー0件**

関連ドキュメント:
- 既存提案: `docs/eslint_lint_fix_proposal_v0.1.md`
- DoD: `docs/stabilization/DoD-v0.1.md`（DOD-10）

スコープ:
- **小さく決定的な修正のみ**（行動が明確な修正で収束させる）
- ルール別に **必要最小限の対応** を適用
- マイグレーション変更は行わない

---

## 作業計画

1. **現状の31件を確定**
   - `eslint` の出力を採取し、**rule / file / line** を一覧化
   - `docs/eslint_lint_fix_proposal_v0.1.md` の「残存エラー」表と突合
   - DOD-10（`docs/stabilization/DoD-v0.1.md`）に紐づけて記録

2. **ルール別に最小修正**
   - ルールごとの標準対応パターンを用い、**例外は局所disable**で明示
   - すべての修正で **ファイルパス + ルール名** を記録（Evidence要件）

3. **再実行と記録**
   - ESLint再実行で **エラー0件** を確認
   - `docs/eslint_lint_fix_proposal_v0.1.md` に結果更新
   - DoD-10の達成証跡を明記

---

## Step 1: ESLintエラー一覧（確定）

実行コマンド: `npx eslint -f json "src/**/*.{js,jsx,ts,tsx}"`

集計:
- Error count: 31
- ルール別: `no-empty` 8 / `no-duplicate-imports` 6 / `no-script-url` 3 / `@next/next/no-img-element` 3 / `no-useless-catch` 3 / `no-restricted-syntax` 2 / その他 1件ずつ

詳細一覧:
| # | Rule | File | Line | Column | Message |
|---|---|---|---|---|---|
| 1 | @next/next/no-img-element | src/components/admin/clinic-basic-settings.tsx | 237 | 15 | Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element |
| 2 | @next/next/no-img-element | src/components/mfa/MFASetupWizard.tsx | 275 | 23 | Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element |
| 3 | @next/next/no-img-element | src/components/ui/avatar.tsx | 36 | 5 | Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element |
| 4 | @typescript-eslint/ban-ts-comment | src/lib/table-metadata.ts | 1 | 1 | Do not use "@ts-nocheck" because it alters compilation errors. |
| 5 | @typescript-eslint/no-empty-object-type | src/types/index.ts | 256 | 18 | An interface declaring no members is equivalent to its supertype. |
| 6 | jsx-a11y/alt-text | src/components/ui/avatar.tsx | 36 | 5 | img elements must have an alt prop, either with meaningful text, or an empty string for decorative images. |
| 7 | no-case-declarations | src/components/admin/data-form-dialog.tsx | 106 | 9 | Unexpected lexical declaration in case block. |
| 8 | no-control-regex | src/lib/schemas/auth.ts | 185 | 14 | Unexpected control character(s) in regular expression: \x00, \x1f. |
| 9 | no-duplicate-imports | src/app/admin/login/page.tsx | 14 | 1 | '@/lib/schemas/auth' import is duplicated. |
| 10 | no-duplicate-imports | src/app/invite/page.tsx | 20 | 1 | '@/lib/schemas/auth' import is duplicated. |
| 11 | no-duplicate-imports | src/app/login/page.tsx | 11 | 1 | '@/lib/schemas/auth' import is duplicated. |
| 12 | no-duplicate-imports | src/app/master-data/page.tsx | 4 | 1 | 'react' import is duplicated. |
| 13 | no-duplicate-imports | src/components/onboarding/InvitesStep.tsx | 20 | 1 | '@/types/onboarding' import is duplicated. |
| 14 | no-duplicate-imports | src/hooks/useQualityAssurance.ts | 221 | 1 | 'react' import is duplicated. |
| 15 | no-empty | src/__tests__/session-management/penetration-test-prep.ts | 386 | 15 | Empty block statement. |
| 16 | no-empty | src/__tests__/session-management/penetration-test-prep.ts | 393 | 15 | Empty block statement. |
| 17 | no-empty | src/__tests__/session-management/penetration-test-prep.ts | 603 | 21 | Empty block statement. |
| 18 | no-empty | src/__tests__/session-management/penetration-test-prep.ts | 639 | 21 | Empty block statement. |
| 19 | no-empty | src/app/admin/login/page.tsx | 156 | 27 | Empty block statement. |
| 20 | no-empty | src/app/admin/login/page.tsx | 186 | 29 | Empty block statement. |
| 21 | no-empty | src/app/login/page.tsx | 121 | 27 | Empty block statement. |
| 22 | no-empty | src/app/login/page.tsx | 149 | 29 | Empty block statement. |
| 23 | no-restricted-syntax | src/__tests__/security/failsafe.test.ts | 72 | 5 | Do not reference SUPABASE_SERVICE_ROLE_KEY directly; use server-side helpers instead. |
| 24 | no-restricted-syntax | src/lib/env.ts | 22 | 30 | Do not reference SUPABASE_SERVICE_ROLE_KEY directly; use server-side helpers instead. |
| 25 | no-script-url | src/app/api/security/csp-report/route.ts | 159 | 27 | Script URL is a form of eval. |
| 26 | no-script-url | src/app/api/security/csp-report/route.ts | 216 | 29 | Script URL is a form of eval. |
| 27 | no-script-url | src/lib/security/csp-config.ts | 302 | 29 | Script URL is a form of eval. |
| 28 | no-useless-catch | src/hooks/useSystemSettingsV2.ts | 94 | 7 | Unnecessary try/catch wrapper. |
| 29 | no-useless-catch | src/hooks/useSystemSettingsV2.ts | 106 | 7 | Unnecessary try/catch wrapper. |
| 30 | no-useless-catch | src/hooks/useSystemSettingsV2.ts | 117 | 7 | Unnecessary try/catch wrapper. |
| 31 | prefer-const | src/lib/multi-device-manager.ts | 96 | 19 | 'error' is never reassigned. Use 'const' instead. |

---

## ルール別の対応方針

| ルール | 原因 | 対応方針 |
|---|---|---|
| `no-empty` | 空ブロックが残存 | 最小コメント追加 |
| `no-duplicate-imports` | import重複 | import統合 |
| `@next/next/no-img-element` | `<img>` 使用 | `next/image` 置換 or 局所disable |
| `no-script-url` | `javascript:` 使用 | 局所disable（CSP理由を注記） |
| `no-useless-catch` | 冗長な `catch` | 不要な `catch` 削除 |
| `no-restricted-syntax` | `env.ts` で必要 | `env.ts` に局所disable |
| その他 | 未分類 | eslint出力で特定し個別対応 |

---

## 成果物

- 修正一覧（file / rule / line / 対応内容）
- `docs/eslint_lint_fix_proposal_v0.1.md` の更新（残件0件）
- DOD-10達成の記録（`docs/stabilization/DoD-v0.1.md` に準拠）

---

## 実施した修正一覧（2026-01-23）

### 1. no-empty (8件) - 空ブロックにコメント追加

| ファイル | 行 | 修正内容 |
|----------|-----|----------|
| `src/app/admin/login/page.tsx` | 156, 186 | `catch {}` → `catch { // Zod validation error intentionally ignored }` |
| `src/app/login/page.tsx` | 121, 149 | 同上 |
| `src/__tests__/session-management/penetration-test-prep.ts` | 386, 393, 607, 643 | `catch {}` → `catch { // Expected error for timing/performance measurement }` |

### 2. no-duplicate-imports (6件) - import統合

| ファイル | 修正内容 |
|----------|----------|
| `src/app/admin/login/page.tsx` | `import type { AuthResponse }` を既存importに統合 |
| `src/app/invite/page.tsx` | 同上 |
| `src/app/login/page.tsx` | 同上 |
| `src/app/master-data/page.tsx` | `import { useEffect }` を既存react importに統合 |
| `src/components/onboarding/InvitesStep.tsx` | `import { ROLE_LABELS }` を既存type importに統合 |
| `src/hooks/useQualityAssurance.ts` | 重複 `import { useMemo }` を削除、先頭importに統合 |

### 3. no-useless-catch (3件) - 冗長try-catch削除

| ファイル | 修正内容 |
|----------|----------|
| `src/hooks/useSystemSettingsV2.ts` | `createMasterData`, `updateMasterData`, `deleteMasterData` の冗長なtry-catchを削除 |

### 4. @next/next/no-img-element (3件) + jsx-a11y/alt-text (1件) - 局所disable

| ファイル | 修正内容 |
|----------|----------|
| `src/components/admin/clinic-basic-settings.tsx` | `/* eslint-disable-next-line @next/next/no-img-element */` 追加 |
| `src/components/mfa/MFASetupWizard.tsx` | 同上 |
| `src/components/ui/avatar.tsx` | `/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */` 追加（propsでalt渡す設計） |

### 5. no-script-url (3件) - CSP検証用に局所disable

| ファイル | 修正内容 |
|----------|----------|
| `src/app/api/security/csp-report/route.ts` | `// eslint-disable-next-line no-script-url` 追加（2箇所） |
| `src/lib/security/csp-config.ts` | 同上（1箇所） |

### 6. no-restricted-syntax (2件) - 環境変数アクセス用に局所disable

| ファイル | 修正内容 |
|----------|----------|
| `src/__tests__/security/failsafe.test.ts` | `// eslint-disable-next-line no-restricted-syntax` 追加 |
| `src/lib/env.ts` | 同上（サーバーサイドヘルパーとして必要） |

### 7. その他個別エラー (5件)

| ルール | ファイル | 修正内容 |
|--------|----------|----------|
| `no-case-declarations` | `src/components/admin/data-form-dialog.tsx` | case 'uuid' にブロックスコープ `{}` 追加 |
| `prefer-const` | `src/lib/multi-device-manager.ts` | `// eslint-disable-next-line prefer-const` 追加（dataは後で再代入されるため） |
| `@typescript-eslint/ban-ts-comment` | `src/lib/table-metadata.ts` | `/* eslint-disable/enable @typescript-eslint/ban-ts-comment */` で囲む |
| `@typescript-eslint/no-empty-object-type` | `src/types/index.ts` | `// eslint-disable-next-line` 追加（将来拡張用プレースホルダー） |
| `no-control-regex` | `src/lib/schemas/auth.ts` | `// eslint-disable-next-line no-control-regex` 追加（制御文字除去は意図的） |

---

## 検証コマンド

```bash
npx eslint "src/**/*.{js,jsx,ts,tsx}"
# 結果: ✖ 298 problems (0 errors, 298 warnings)
```
