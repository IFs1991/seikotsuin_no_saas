# ESLint `lint:fix` を「回る」状態にする修正案（v0.1）

対象: `seikotsuin_management_saas` / ESLint **v9.39.2**（`npx eslint --version` で確認）
現状: `--fix` を回した結果 **561 problems (305 errors, 256 warnings)** が残存。`--fix` は「直せるものだけ」自動修正し、直せないものは残すのが仕様。
（ESLint v9 は `eslint.config.mjs`（Flat Config）がデフォルト。従来の `.eslintrc` は非推奨で自動探索されない）

---

## 実装完了（2026-01-22）

### 結果サマリー

| 項目 | 変更前 | 変更後 | 削減 |
|-----|-------|-------|-----|
| **合計** | 567 | 329 | **-238** |
| **エラー** | 306 | 31 | **-275 (90%減)** |
| **警告** | 261 | 298 | +37 |

### 実施内容

| Phase | 内容 | 状態 |
|-------|------|------|
| P0 | `eslint-plugin-unused-imports` 導入 | 完了 |
| P1 | テスト/legacy override拡張 | 完了 |
| P2 | `lint:fix` にキャッシュ追加 | 完了 |
| P3 | `no-restricted-imports` 置換（16件） | 完了 |
| P3 | jsx-a11y を warn に緩和 | 完了 |
| P3 | `no-case-declarations` 修正 | 完了 |

### `no-restricted-imports` 置換の背景

```
src/lib/supabase/
├── index.ts      ← @/lib/supabase (推奨)
├── server.ts     ← @/lib/supabase/server (非推奨)
├── client.ts
├── guards.ts
└── middleware.ts
```

- `index.ts` は `server.ts` の全exportを再エクスポート
- 機能的には同一だが、以下の理由で `@/lib/supabase` を推奨:
  1. **一貫性**: コードベース全体で統一されたimportパス
  2. **将来性**: client/server分離時のリファクタリング容易化
  3. **可読性**: より短いパスで意図が明確

置換対象ファイル（16件）:
- `src/app/admin/actions.ts`
- `src/app/invite/actions.ts`
- `src/app/login/actions.ts`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/beta/backlog/route.ts`
- `src/app/api/beta/feedback/route.ts`
- `src/app/api/beta/metrics/route.ts`
- `src/app/api/onboarding/clinic/route.ts`
- `src/app/api/onboarding/invites/route.ts`
- `src/app/api/onboarding/profile/route.ts`
- `src/app/api/onboarding/seed/route.ts`
- `src/app/api/onboarding/status/route.ts`
- `src/app/api/public/menus/route.ts`
- `src/app/api/public/reservations/route.ts`
- `src/__tests__/e2e/mocks/supabase-server.mock.ts`

### 変更ファイル

1. `eslint.config.mjs` - plugin追加、override拡張
2. `package.json` - `lint:fix` / `lint:check` スクリプト追加
3. `src/app/reservations/components/AppointmentList.tsx` - switch文修正
4. 上記16ファイル - import置換

### 残存エラー（31件）

| 件数 | ルール | 対応方針 |
|-----|-------|---------|
| 8 | `no-empty` | 空ブロックにコメント追加 |
| 6 | `no-duplicate-imports` | 手動でimport整理 |
| 3 | `@next/next/no-img-element` | Image置換 or 個別disable |
| 3 | `no-script-url` | CSP設定で必要、個別disable |
| 3 | `no-useless-catch` | 不要なcatch削除 |
| 2 | `no-restricted-syntax` | env.tsで必要、個別disable |
| その他 | - | 個別対応 |

---

## ねらい（最小の投資で最大の回収）

- **`lint:fix` を日常運用できる速度/ノイズに落とす**
- 変更のたびに「大量ログで思考停止」にならない状態にする
- **プロダクト本体（`src/app`, `src/components`, `src/lib`）の品質ゲートは維持**しつつ、
  **テスト/legacy は現実的なルールに緩める**
  - ただし現状は `eslint.config.mjs` 側で `src/lib`/`src/components`/`src/hooks` の `no-explicit-any` が緩和されているため、完全な「本体ゲート維持」ではありません（必要なら見直し対象）。

---

## 優先度付き ToDo（ROI順）

### P0: 未使用 import を `--fix` で自動削除できるようにする
いまのエラーの大量派生は **`no-unused-vars`/未使用 import** が中心。  
標準だけだと自動削除が弱いので、`eslint-plugin-unused-imports` を導入して **`--fix` で消える**状態にする。
  - 注意: `npm run lint` は `--max-warnings=0` のため、`warn` でも CI/ビルドで失敗する。警告運用を維持するなら `lint` の警告ポリシーを見直すか、当面は `error` に寄せる必要がある。

- 参考: `eslint-plugin-unused-imports`（公式 npm）
- 参考: ESLint v9 移行（`eslint.config.js` がデフォルト / eslintrc は非推奨）

### P1: テスト / legacy を別ルールへ
`src/__tests__/**` と `src/legacy/**` が指摘の大半を占めている。  
本体と同じ厳格さで走らせると、**lint が常に赤**になりがちで開発速度を落とす。

- テストは `any` を許容（`no-explicit-any` を緩める）
- UIテストでは `jsx-a11y` を一部緩める（誤爆が多い）

### P2: React 17+ の新JSX変換に合わせて「React import 必須」を前提にしない
ログに `React is defined but never used` が多数。React 17+ の新 JSX transform では `import React from 'react'` は必須ではない。

### P3: Next の `no-img-element` は「例外運用」か「Imageへ置換」かを決める
`@next/next/no-img-element` は LCP/帯域の観点で `<Image />` を推奨。  
ただし SVG や特殊ケースは例外運用もあり。

---

## 実装手順（コピペで進む）

### 0) 前提: キャッシュ付きで回す
キャッシュは 2回目以降が大きく効く。

```powershell
npx eslint --cache --cache-location .eslintcache --fix "src/**/*.{js,jsx,ts,tsx}"
```

---

## 1) `eslint-plugin-unused-imports` を導入（P0）

### インストール
```powershell
npm i -D eslint-plugin-unused-imports
```

### 設定（Flat Config: `eslint.config.mjs` の差分例）
> 既存の設定を壊さないため、「追加するブロック」だけ提示します。  
> 既存の `export default [...]` 配列のどこか（TypeScript/React 設定の後）に追加してください。

```js
// eslint.config.mjs
import unusedImports from "eslint-plugin-unused-imports";

export default [
  // ...既存の設定...

  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // 未使用 import は --fix で削除できる
      "unused-imports/no-unused-imports": "error",

      // 未使用変数は警告に落とし、_ prefix は許可
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // 二重報告を避ける（片方に寄せる）
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
```
※ `npm run lint` を通すには `unused-imports/no-unused-vars` を `"error"` にするか、`lint` の `--max-warnings=0` を外す必要があります。  
※ 既存のテスト用 override で `@typescript-eslint/no-unused-vars` が再度有効化されている場合、二重報告になるので片方に寄せてください（`eslint.config.mjs` 参照）。

### （Legacy config の場合）
ESLint v9 では `.eslintrc` は自動探索されません。`.eslintrc` を使い続ける場合は環境変数が必要です。  
（ただし推奨は Flat Config への移行）

```powershell
# PowerShell
$env:ESLINT_USE_FLAT_CONFIG="false"
npx eslint --fix .
```

---

## 2) テスト / legacy を overrides で緩める（P1）

### Flat Config の overrides 例
```js
export default [
  // ...

  {
    files: ["src/__tests__/**/*.{ts,tsx,js,jsx}", "src/legacy/**/*.{ts,tsx,js,jsx}"],
    rules: {
      // テストは any 許容（テストの速度/記述自由度を優先）
      "@typescript-eslint/no-explicit-any": "off",

      // テストで誤爆しやすい a11y を緩める（必要なら後で戻す）
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      // 未使用変数の二重報告を避ける場合はどちらかに寄せる
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
```

---

## 3) 典型エラーの「最短修正パターン」集

### A) `no-case-declarations`（switch/case の const/let）
`case` の中で `const/let` を使うなら `{}` でブロックスコープを作る。

```ts
switch (x) {
  case "a": {
    const y = 1;
    // ...
    break;
  }
  default:
    break;
}
```

### B) `jsx-a11y/label-has-associated-control`
`label` は `htmlFor` と input の `id` を一致させる（または label で input を包む）。

```tsx
<label htmlFor="email">Email</label>
<input id="email" name="email" />
```

### C) `React is defined but never used`
React 17+ の新 JSX transform では `React` import は不要。未使用なら削除。  
（もし古い ESLint ルールが残っているなら `react/react-in-jsx-scope` 等をオフ）

### D) `@next/next/no-img-element`
可能なら `next/image` へ置換。  
例外（SVG、外部要件、特殊レンダリング）は **そのファイル/行だけ disable** の運用に寄せると、進捗を止めない。

```tsx
/* eslint-disable @next/next/no-img-element */
<img src="..." alt="..." />
/* eslint-enable @next/next/no-img-element */
```

### E) `no-restricted-imports`（supabase import の縛り）
ログの通り「禁止 import」を “推奨 import” に置換する（検索置換が最短）。
- `@/lib/supabase/server` → `@/lib/supabase`

---

## 4) 速度とノイズをさらに落とす（任意だが効く）

### `.eslintignore`（生成物を確実に除外）
Flat Config では `.eslintignore` は自動で読まれません。必要なら `eslint.config.mjs` の `ignores` に追加するか、`--ignore-path` を使って明示的に参照してください。

```
.next
dist
build
coverage
node_modules
```

### スクリプト（例）
```json
{
  "scripts": {
    "lint": "eslint \"src/**/*.{js,jsx,ts,tsx}\"",
    "lint:fix": "eslint --cache --cache-location .eslintcache --fix \"src/**/*.{js,jsx,ts,tsx}\""
  }
}
```
※ Windows でも動くように **ダブルクォート** と **glob** を統一。

---

## 5) 推奨ワークフロー（壊さず進める）

1. **P0 を入れて `--fix` を再実行** → 未使用 import の山が消える
2. **P1 でテスト/legacy を緩めて “本体の赤” を見える化**
3. 本体の errors をカテゴリ別に潰す（a11y / switch / restricted-imports など）
4. 余裕が出たらテスト側のルールを段階的に戻す

---

## 参考（一次情報）
- ESLint v9 migration / Flat Config: https://eslint.org/docs/latest/use/migrate-to-9.0.0
- Configuration Migration Guide: https://eslint.org/docs/latest/use/configure/migration-guide
- eslint-plugin-unused-imports: https://www.npmjs.com/package/eslint-plugin-unused-imports
- no-case-declarations: https://eslint.org/docs/latest/rules/no-case-declarations
- jsx-a11y label-has-associated-control: https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/label-has-associated-control.md
- Next.js `no-img-element`: https://nextjs.org/docs/messages/no-img-element
- React New JSX Transform: https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
