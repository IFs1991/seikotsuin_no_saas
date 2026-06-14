# UI/UX デザインシステム統一 Spec v0.2

- Status: draft / revised
- Date: 2026-06-14
- File: `docs/stabilization/spec-ui-ux-design-system-unification-v0.2.md`
- Owner: 未割当
- Phase: `0.1.0-pilot`（安定化。新機能ではなく既存UIの一貫性回復）
- Scope: UI styling stabilization only

## 0. Revision Notes from v0.1

v0.1 の設計思想は維持しつつ、実装事故を避けるために以下を修正する。

1. `hex 92件` と `grep対象79件` の表記矛盾を解消する。
2. Phase 2 を 2A〜2D に分割し、1 PR あたりの変更量を小さくする。
3. `dark:` 接頭辞の全面禁止ではなく、例外条件付きの原則禁止にする。
4. DoD と grep コマンドを `bg-[#]` / `text-[#]` / `border-[#]` で統一する。
5. `asChild` は既存依存がある場合のみ採用し、なければ `buttonClassName()` export に縮退する。
6. Button / Card variant 集約は必須安定化の後段に移し、Phase 1〜2 の成功を優先する。

## 1. Summary

現状のUIは「設計思想は良いが、実装で守られていない」状態にある。

デザイントークン、医療系パレット、WCAG 2.2 を意識したタッチターゲット、focus管理の方向性は悪くない。しかし実装が複数のスタイリング戦略に分裂しており、以下の問題を生んでいる。

- ダークモードで shadcn 系のCSS変数が正しく反転しない。
- `bg-white dark:bg-gray-800` のような局所対応が増えている。
- `bg-[#...]` / `text-[#...]` / `border-[#...]` のハードコードが残っている。
- Button / Card の variant API が肥大化している。
- ダークモード制御が CSS変数とJS条件分岐の二重管理になっている。

本 spec は、**機能・挙動・認可・RLS・DB を一切変えず**、UI styling の一貫性だけを回復する。

最重要は `.dark` に shadcn CSS変数のダーク値が欠落している問題を直すこと。ここを直せば、派生的な `dark:` ベタ書きや hex ハードコードの多くを安全に削減できる。

## 2. Goals

- ライト/ダーク両方で `bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` / `border-border` が正しく機能する。
- アプリ主要画面から `bg-[#...]` / `text-[#...]` / `border-[#...]` を排除し、Tailwind token またはCSS変数へ統一する。
- `dark:` ベタ書きペアを原則削除し、CSS変数トークンへ置換する。
- ダークモード制御を `.dark` クラス + CSS変数の一系統へ寄せる。
- レイアウトの二重 `min-height` を解消する。
- 未完成プレースホルダをパイロット表示から除外する。
- Button / Card variant を実使用分へ集約する。ただしこれは Phase 1〜2 完了後の後段タスクとする。
- 再発防止のため、静的テストと lint 方針を用意する。

## 3. Non-Goals

- 画面の情報設計・導線・機能変更はしない。
- ボタンの位置、文言、遷移先は原則維持する。
- 新規ページは追加しない。
- 新規コンポーネントは原則追加しない。ただしテスト・showcase 更新・必要最小限のhelperは許容する。
- 認可、RLS、テナント分離、clinic scope に関わるコードは触らない。
- `clinic_id` / `role` / `user_id` を扱うロジックは変更対象外。
- DB migration / Supabase 型生成物（`src/types/supabase.ts`）は変更しない。
- `src/legacy/` は対象外。lint/型対象外のため流用も禁止。
- ブランドカラーそのものの再設計はしない。既存トークン値を維持したまま「使い方」を直す。
- Pilot mode で常時非表示の画面（`/chat`, `/ai-insights`, `/blocks`, `/master-data` 等）の hex 除去は後段に回す。

## 4. Root Causes

### RC-1: `.dark` が shadcn CSS変数を上書きしていない

`src/app/globals.css` の `:root` は、以下の shadcn 系CSS変数をライト値で定義している。

- `--background`
- `--card`
- `--foreground`
- `--muted`
- `--border`
- `--popover`
- `--secondary`
- `--accent`

一方で `.dark` ブロックは legacy なカスタム変数のみを上書きしている。

- `--bg-color`
- `--text-color`
- `--surface-color`
- `--border-color`

その結果、ダークモードでも `bg-card` / `bg-background` / `text-foreground` がライト値のままになり、画面側で `bg-white dark:bg-gray-800` のような局所対応が必要になっている。

これは最上流の原因であり、最初に直す。

### RC-2: 色のハードコードが散在している

v0.1 では `92件` と `79件` が混在していたため、v0.2 では以下のように定義する。

- `grep` で直接検出する対象: `bg-[#...]` / `text-[#...]` / `border-[#...]`
- 現時点の grep ベースライン期待値: `79件`
- 広義の色ハードコード候補: `92件`
  - `style={{ color: '#...' }}`
  - chart config の hex
  - utility外の直接 hex
  - コメント内・サンプル内の色指定
  - 上記を含む可能性があるため、Phase 0 で再取得して確定する

必須ゲートでは、まず `grep対象79件` を管理対象とする。広義の92件は Phase 5 以降の任意クリーンアップ対象とする。

### RC-3: `dark:` ベタ書きペアが増えている

`dark:bg-gray-*` / `dark:bg-slate-*` / `dark:text-gray-*` のようなクラスが複数ファイルに分散している。

RC-1 を直せば、以下のような置換が可能になる。

- `bg-white dark:bg-gray-800` → `bg-card`
- `bg-gray-50 dark:bg-gray-900` → `bg-background`
- `text-gray-900 dark:text-gray-100` → `text-foreground`
- `text-gray-600 dark:text-gray-400` → `text-muted-foreground`
- `border-gray-200 dark:border-gray-700` → `border-border`

ただし、`dark:` を完全禁止にはしない。

例外として以下はコメント付きで許容する。

- ブランド表現
- チャート色
- 画像・メディア背景の明度調整
- warning / success / destructive など状態色の視認性補正
- CSS変数だけでは意味を保持できない局所的な例外

### RC-4: Button / Card variant API が肥大化している

Button は variant が多く、実使用されていないものがある。

Card も variant / elevation / priority / interactive の組み合わせが増え、実装者が正しい使い方を判断しにくい。

ただし、variant集約は呼び出し側に波及するため、Phase 1〜2 の UI基盤修正が終わってから実施する。

### RC-5: ダークモード状態管理が二重になっている

`app-shell.tsx` で `isDarkMode` state による条件分岐クラスを持ちつつ、`document.documentElement` に `.dark` クラスも付けている。

理想は以下。

- state: トグル状態と localStorage 保存にのみ使う
- style: `.dark` + CSS変数に任せる
- JSX内の `isDarkMode ? 'bg-gray-800' : 'bg-gray-50'` は撤去する

### RC-6: レイアウトの二重 `min-height`

`app-shell.tsx` の `<main>` と、内側の `dashboard/page.tsx` の `ClinicDashboard` がそれぞれ高さを持っている。

これにより余白・スクロール・中央寄せが崩れやすい。

### RC-7: 未完成プレースホルダが本番表示されている

`dashboard/page.tsx` に「ウィジェット配置（開発中）」カードが表示されている。

PoC前のプロダクト信用を落とすため、パイロット表示から除外する。

### RC-8: Link-as-Button の正式手段がない

`manager-dashboard.tsx` で Button の見た目を文字列で再現している。

正式対応は以下のどちらか。

1. 既に `@radix-ui/react-slot` が依存にある場合: `asChild` を採用する。
2. 依存がない場合: 新規依存追加は避け、`buttonClassName()` helper を export する。

## 5. Design Principles

### D-1: 単一の真実は CSS変数トークン

色指定の優先順位は以下。

1. 役割が明確なUI面
   - `bg-background`
   - `bg-card`
   - `bg-muted`
   - `bg-popover`
   - `text-foreground`
   - `text-muted-foreground`
   - `border-border`
   - `bg-primary`
   - `bg-destructive`
   - `bg-accent`
2. 医療・管理系セマンティックトークン
   - `medical-blue-*`
   - `medical-green-*`
   - `admin-*`
3. 例外的な色指定
   - コメント付きで許可
   - 新規追加は原則禁止

### D-2: `.dark` に shadcn 変数のダーク値を追加する

`src/app/globals.css` の `.dark` に以下を追加する。

```css
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 224.3 76.3% 48%;

  /* legacy compatibility. Do not use for new code. */
  --bg-color: #1f2937;
  --text-color: #f3f4f6;
  --surface-color: #374151;
  --border-color: #4b5563;
}
```

既存 legacy 4変数は後方互換のため残す。ただし新規参照では使わない。

### D-3: 色トークン置換マッピング

| Current | Replace with |
|---|---|
| `bg-[#1e3a8a]` | `bg-primary` |
| `bg-[#1e3a8a]/90` | `bg-primary/90` |
| `dark:bg-[#10b981]` | 削除。`bg-primary` に寄せる |
| `bg-white dark:bg-gray-800` | `bg-card` |
| `bg-gray-50 dark:bg-gray-900` | `bg-background` |
| `bg-gray-50 dark:bg-gray-700` | `bg-muted` |
| `text-gray-900 dark:text-gray-100` | `text-foreground` |
| `text-gray-600 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-slate-200` | `border-border` |
| `#059669` 系 | `text-medical-green-600` / `bg-medical-green-600` |
| admin purple `#7c3aed` 系 | `admin-*` scale |

置換は意味単位で行う。見た目が近いだけで意味が違う場合は、無理に機械置換しない。

### D-4: Button variant 集約方針

維持する variant:

- shadcn 標準
  - `default`
  - `destructive`
  - `outline`
  - `secondary`
  - `ghost`
  - `link`
- 医療
  - `medical-primary`
  - `medical-urgent`
  - `medical-success`
- 管理
  - `admin-primary`
  - `admin-secondary`
- 患者公開導線
  - `patient-primary`
  - `patient-gentle`

廃止候補:

| Current | Migrate to |
|---|---|
| `medical-safety` | `medical-success` |
| `medical-caution` | 使用箇所の意味に応じて `secondary` or `medical-urgent` |
| `medical-neutral` | `secondary` |

`priority` / `role` prop は、使用箇所移行後に廃止する。

`priority='urgent'` の視覚効果は `medical-urgent` variant に内包する。

### D-5: Card variant 集約方針

維持する variant:

- `default`
- `medical`
- `dashboard`
- `emergency`
- `admin`
- `patient`

廃止候補:

| Current | Migrate to |
|---|---|
| `clinical` | `medical` |
| `security` | `admin` |
| `report` | 使用0なら定義削除 |
| `analytics` | 使用0なら定義削除 |

`CardHeader` / `CardContent` に冗長な `bg-card` がある場合は削除する。Card root が背景を持つ。

### D-6: ダークモード制御の一系統化

`app-shell.tsx` では以下を維持する。

- `isDarkMode` state
- localStorage 保存
- `document.documentElement.classList.toggle('dark')`

ただし、描画スタイルは CSS変数へ寄せる。

削除対象:

```tsx
isDarkMode ? 'bg-gray-800' : 'bg-gray-50'
isDarkMode ? 'text-gray-100' : 'text-gray-900'
```

置換先:

```tsx
bg-background
bg-card
text-foreground
text-muted-foreground
border-border
```

FOUC 対策は Phase 4 で任意評価する。

### D-7: レイアウト二重 min-height 解消

`dashboard/page.tsx` の `ClinicDashboard` 直下から `min-h-screen` を除去する。

`app-shell` の `<main>` が高さを担保する。

ローディング・エラー時の中央寄せは局所指定にする。

```tsx
min-h-[50vh]
```

### D-8: 未完成プレースホルダ除外

`dashboard/page.tsx` の「ウィジェット配置（開発中）」Card は削除する。

将来再導入する場合は feature flag 下に置く。

### D-9: Link-as-Button 正式化

まず依存を確認する。

```bash
npm ls @radix-ui/react-slot
```

既に依存がある場合:

```tsx
<Button asChild variant="outline">
  <Link href="/manager">管理画面へ</Link>
</Button>
```

依存がない場合:

- 新規依存は追加しない。
- `buttonClassName({ variant, size })` を export する。
- `linkButtonClassName` の手書き再現をやめる。

## 6. Implementation Phases

各 Phase 末で以下を確認する。

```bash
npm run lint
npm run type-check
```

既存の必須テストがある場合は併せて実行する。

```bash
npm run test:pr05:focused
```

原則は 1 Phase = 1 PR。ただし Phase 2 は分割PRとする。

### Phase 0: ベースライン & 回帰テスト土台

目的: 現状を固定し、修正が意図通り進んでいることを静的に検証できるようにする。

#### 0-1. ベースライン取得

```bash
# grep対象 hex ハードコード件数
# 期待: 79。ただし実装前に必ず再取得してPR本文に記録する。
grep -rn "bg-\[#\|text-\[#\|border-\[#" src/app src/components | wc -l

# dark: ベタ書きペアのファイル数
# 期待: 39。ただし実装前に必ず再取得してPR本文に記録する。
grep -rln "dark:bg-gray\|dark:bg-slate\|dark:text-gray" src/app src/components | wc -l

# .dark が上書きする変数確認
grep -n "\.dark" src/app/globals.css
```

#### 0-2. 静的テスト追加

配置:

```txt
src/__tests__/stabilization/
```

追加するテスト:

1. `UI01-dark-theme-variables.test.ts`
   - `globals.css` を読む。
   - `.dark` ブロック内に以下が含まれることを assert。
     - `--background`
     - `--card`
     - `--foreground`
     - `--muted`
     - `--border`
2. `UI02-no-hardcoded-hex.test.ts`
   - パイロット対象ファイル群に `bg-[#]` / `text-[#]` / `border-[#]` がないことを assert。
   - 初期は allowlist を広く取り、Phase ごとに縮める。
3. `UI03-variant-surface.test.ts`
   - Phase 3 で有効化。
   - Button / Card variant key が維持リストと一致することを assert。

Commit:

```bash
git commit -m "test: add UI design-system stabilization guards"
```

### Phase 1: ダークテーマ変数の補完

目的: RC-1 を最小差分で修正する。

作業:

- `src/app/globals.css` の `.dark` に D-2 の shadcn ダーク変数を追加する。
- legacy 4変数は残す。
- `UI01` を green にする。

目視確認:

- `/dashboard`
- `/manager`
- `/reservations`

確認項目:

- 背景が白のまま残っていない。
- Card がダーク背景へ反転する。
- 文字色が読める。
- border が浮きすぎない。

Commit:

```bash
git commit -m "feat: complete dark theme css variables"
```

### Phase 2A: Shell / Dashboard / Navigation の token 化

目的: もっとも広く効く layout 系の色指定を先に直す。

対象:

- `src/app/(app)/app-shell.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `sidebar.tsx`
- `header.tsx`

作業:

- `isDarkMode ? ... : ...` による条件分岐クラスを撤去する。
- `bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` / `border-border` に置換する。
- `dashboard/page.tsx` の二重 `min-h-screen` を解消する。
- 「ウィジェット配置（開発中）」Card を削除する。
- `UI02` の allowlist から対象ファイルを外す。

目視確認:

- `/dashboard`
- ナビゲーション
- ダークトグル
- ローディング/エラー状態

Commit:

```bash
git commit -m "refactor: tokenize shell dashboard and navigation colors"
```

### Phase 2B: Patients / Manager 周辺の token 化

目的: パイロット導線で触られやすい業務画面の見た目を安定させる。

対象例:

- `patients/page.tsx`
- `patients/[id]/page.tsx`
- `patients/list/page.tsx`
- `manager-dashboard.tsx`
- `conversion-funnel.tsx`
- `manager-revenue-analysis.tsx`

作業:

- D-3 の置換表に従って color token 化する。
- hex 置換は意味単位で行う。
- `UI02` の allowlist から対象ファイルを外す。

目視確認:

- `/patients`
- 患者詳細
- manager dashboard
- conversion funnel 表示

Commit:

```bash
git commit -m "refactor: tokenize patients and manager colors"
```

### Phase 2C: Staff / Shift / Performance 周辺の token 化

目的: 件数が多く事故りやすい staff 系を独立PRで処理する。

対象例:

- `staff/page.tsx`
- `performance-metrics.tsx`
- `shift-optimizer.tsx`

注意:

`shift-optimizer.tsx` と `performance-metrics.tsx` は hardcoded color 件数が多い。機械置換だけで終わらせず、以下を確認する。

- 状態色の意味が消えていないか。
- 成功/警告/緊急の区別が維持されているか。
- chart / badge / heatmap 相当の色が token 化で破綻していないか。

作業:

- D-3 の置換表に従って color token 化する。
- 状態色は medical/admin semantic token を優先する。
- `UI02` の allowlist から対象ファイルを外す。

目視確認:

- `/staff`
- shift optimizer
- performance metrics
- ライト/ダーク両方

Commit:

```bash
git commit -m "refactor: tokenize staff shift and performance colors"
```

### Phase 2D: Multi-store / Ranking / Master 周辺の token 化

目的: 残りのパイロット対象UIを token 化する。

対象例:

- `multi-store/page.tsx`
- `menu-ranking.tsx`
- `patient-flow-heatmap.tsx`
- `master/admin-master-form.tsx`

作業:

- D-3 の置換表に従って color token 化する。
- `UI02` の allowlist をさらに縮小する。

目視確認:

- multi-store dashboard
- menu ranking
- patient flow heatmap
- admin master form

Commit:

```bash
git commit -m "refactor: tokenize multi-store ranking and master colors"
```

### Phase 3: 再発防止 lint の warn 導入

目的: 直した後にまた hardcoded color が増えるのを防ぐ。

最初は error ではなく warn とする。

検出対象:

- `className` 内の `bg-[#...]`
- `className` 内の `text-[#...]`
- `className` 内の `border-[#...]`
- 原則禁止対象の `dark:bg-gray-*`
- 原則禁止対象の `dark:bg-slate-*`
- 原則禁止対象の `dark:text-gray-*`

例外:

- chart color
- brand color
- media background
- destructive/warning/success の視認性補正
- コメントで理由が明記されているもの

Commit:

```bash
git commit -m "chore: warn on hardcoded UI colors"
```

### Phase 4: Button / Card variant 集約

目的: variant API を実使用分へ縮小し、今後の実装判断を単純化する。

前提:

- Phase 1〜2D が完了していること。
- 主要画面のライト/ダーク表示が安定していること。

作業順:

1. `UI03-variant-surface.test.ts` を red にする。
2. Button の使用箇所を移行する。
3. Card の使用箇所を移行する。
4. 未使用variantを削除する。
5. `priority` / `role` prop を削除する。
6. `UI03` を green にする。

Commitは移行と削除を分ける。

```bash
git commit -m "refactor: migrate button variant callers"
git commit -m "refactor: remove deprecated button variants"
git commit -m "refactor: consolidate card variants"
```

### Phase 5: Pilot 非表示画面の任意クリーンアップ

目的: 必須ゲート外の画面も整理し、最終的に全体の hardcoded color を減らす。

対象例:

- `/chat`
- `/ai-insights`
- `admin chat`
- chat系コンポーネント
- `/blocks`
- `/master-data`

完了後、`UI02` allowlist を空に近づける。

Commit:

```bash
git commit -m "refactor: tokenize non-pilot screen colors"
```

### Phase 6: Link-as-Button 正式化

目的: Button style の手書き再現をやめる。

作業:

1. `npm ls @radix-ui/react-slot` で依存確認。
2. 依存がある場合は `asChild` を実装。
3. 依存がない場合は `buttonClassName()` helper を export。
4. `manager-dashboard.tsx` の `linkButtonClassName` を撤去。

Commit:

```bash
git commit -m "refactor: formalize link as button styling"
```

## 7. Acceptance Criteria

### 7-1. Functionality / Regression

- [ ] `npm run lint` green。
- [ ] `npm run type-check` green。
- [ ] `npm run test:pr05:focused` green。
- [ ] 既存 E2E がある場合、対象画面のスモークテストが green。
- [ ] 認可・RLS・clinic scope 関連テストに変更なし。
- [ ] 差分が `clinic_id` / `role` / `user_id` のロジックを変更していない。

### 7-2. Design System

- [ ] `UI01` が green。
- [ ] `.dark` に shadcn 系変数が追加されている。
- [ ] `/dashboard` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/manager` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/reservations` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/patients` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/staff` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `dashboard/page.tsx` から二重 `min-h-screen` が消えている。
- [ ] `dashboard/page.tsx` から「ウィジェット配置（開発中）」Card が消えている。

### 7-3. Numeric Targets

Phase 0 で再取得した数値をPR本文に記録する。

必須ゲート:

- [ ] grep対象 hardcoded hex: Phase 2D 完了時点で pilot対象 0。
- [ ] `dark:bg-gray` / `dark:bg-slate` / `dark:text-gray`: Phase 2D 完了時点で pilot対象 0。

最終目標:

- [ ] grep対象 hardcoded hex: Phase 5 完了時点で全体 0。
- [ ] `dark:` ベタ書きペア: Phase 5 完了時点で全体最小化。
- [ ] Button/Card variant: Phase 4 完了時点で維持リストと一致。

確認コマンド:

```bash
# grep対象 hex ハードコード
grep -rn "bg-\[#\|text-\[#\|border-\[#" src/app src/components

# dark: ベタ書きペア
grep -rn "dark:bg-gray\|dark:bg-slate\|dark:text-gray" src/app src/components
```

## 8. Test Plan

### 8-1. Static Tests

配置:

```txt
src/__tests__/stabilization/
```

テスト:

- `UI01-dark-theme-variables.test.ts`
- `UI02-no-hardcoded-hex.test.ts`
- `UI03-variant-surface.test.ts`

方針:

- 視覚そのものは単体テストで担保しきれない。
- 静的構造テスト + 既存E2E + 目視スクショの3層で守る。
- 壊れた実装に合わせてテストを変えない。

### 8-2. Manual Visual Checks

各対象画面で以下を確認する。

- light mode
- dark mode
- hover state
- focus-visible state
- disabled state
- loading state
- empty state
- error state

主要画面:

- `/dashboard`
- `/manager`
- `/reservations`
- `/patients`
- `/staff`
- multi-store / ranking / heatmap 系

### 8-3. Screenshot Evidence

各 Phase のPRに最低限以下を添付する。

- Before light
- Before dark
- After light
- After dark

対象は Phase ごとに絞る。

## 9. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| `.dark` 変数追加で既存ダーク見た目が一括変化する | 中 | Phase 1を単独PRにし、主要画面を目視確認する |
| 機械置換で状態色の意味が消える | 中 | D-3の固定マッピングに限定し、staff/shift系は独立Phaseにする |
| Phase 2が肥大化してレビュー不能になる | 高 | 2A〜2Dに分割する |
| variant削除で参照漏れが起きる | 中 | 「使用箇所移行 → 定義削除」の順にする。UI03で防ぐ |
| `dark:` を完全禁止して例外ケースが詰まる | 中 | 例外をコメント付きで許可する |
| Link-as-Buttonで新規依存が増える | 低〜中 | 既存依存がない場合は `buttonClassName()` helper に縮退する |
| Pilot非表示画面まで同時に直して工数膨張する | 中 | Phase 5に後置する |

## 10. Rollback

この spec は DB / RLS / migration を含まない。

ロールバックは Phase 単位の `git revert` で行う。

方針:

- Phase 1 の `.dark` 変数追加は単独commitにする。
- Phase 2A〜2D は画面群ごとに分ける。
- Phase 4 の variant削除は「移行commit」と「削除commit」を分離する。
- 問題時は該当Phaseだけ revert できる構成にする。

## 11. Suggested Codex / Claude Execution Prompt

以下をそのまま実装エージェントに投げてよい。

```md
あなたは Tiramisu の UI/UX デザインシステム安定化を担当する実装エージェントです。

目的は新機能追加ではありません。既存UIの styling 一貫性を回復することです。

絶対に守ること:
- 認可・RLS・tenant scope・clinic scope に触らない。
- `clinic_id` / `role` / `user_id` のロジックを変更しない。
- DB migration を作らない。
- Supabase 型生成物を変更しない。
- UIの情報設計・導線・文言・遷移先を原則変えない。
- 1 Phase = 1 PR、Phase 2は 2A〜2D に分割する。

最初にやること:
1. grepで hardcoded color と dark pair のベースラインを再取得する。
2. `src/__tests__/stabilization/` に UI01 / UI02 の静的テストを追加する。
3. Phase 1として `globals.css` の `.dark` に shadcn CSS変数を追加する。
4. `npm run lint` / `npm run type-check` を通す。

変更後は、必ず対象画面を light/dark の両方で確認する。
```

## 12. Related Files

- `CLAUDE.md`
- `docs/stabilization/DoD-v0.1.md`
- `tailwind.config.ts`
- `src/app/globals.css`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/examples/design-system-showcase.tsx`
- `src/app/(app)/app-shell.tsx`
- `src/app/(app)/dashboard/page.tsx`

## 13. Final Judgment

この安定化は実施する価値がある。

ただし、優先順位は明確にする。

最優先:

1. `.dark` CSS変数補完
2. Shell / Dashboard / Navigation の token 化
3. Patients / Manager / Staff の主要画面 token 化
4. hardcoded color 再発防止

後回し:

1. Button / Card variant集約
2. Pilot非表示画面の完全掃除
3. Link-as-Button 正式化

Tiramisu の12月試験導入を考えるなら、これは「見た目のこだわり」ではなく、PoCで触られた瞬間の信用を落とさないための基盤整備である。
