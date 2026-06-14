# UI/UX デザインシステム統一 Spec v0.1

- Status: draft
- Date: 2026-06-14
- File: `docs/stabilization/spec-ui-ux-design-system-unification-v0.1.md`
- Owner: (未割当)
- Phase: `0.1.0-pilot`（安定化。新機能ではなく既存UIの一貫性回復）

## Summary

現状のUIは「設計思想は良いが実装で守られていない」状態にある。デザイントークン（医療系パレット・WCAG 2.2 タッチターゲット・focus管理）は筋が良いが、実装が **3つの競合するスタイリング戦略** に分裂しており、ダークモードの破綻・色のハードコード・variant API の肥大化を招いている。

本 spec は **機能・挙動・認可・RLS を一切変えず**、スタイリングの一貫性のみを回復する。最重要は「ダークモードCSS変数の欠落」という根本原因の修正であり、これを直すと派生的なハードコードの大半が不要になる。

## 根本原因（調査結果）

### RC-1: `.dark` が shadcn CSS変数を上書きしていない（最重要）

`src/app/globals.css` の `:root`（L9–51）は `--background` / `--card` / `--foreground` / `--muted` / `--border` / `--popover` / `--secondary` / `--accent` などの shadcn 変数をライト値で定義している。しかし `.dark` ブロック（L53–58）が上書きするのは **legacy なカスタム変数4つ（`--bg-color` / `--text-color` / `--surface-color` / `--border-color`）のみ**で、shadcn 変数は上書きしていない。

結果として **ダークモードでも `bg-card` / `bg-background` / `text-foreground` が白系のまま** になる。これが「`bg-white dark:bg-gray-800` をベタ書きせざるを得なかった」直接の原因（= RC-2 / RC-3 の上流）。`tailwind.config.ts` は `darkMode: ['class']` で `.dark` クラス方式は正しく設定されているのに、変数側が片肺になっている。

### RC-2: 色のハードコード hex が散在（92件）

`bg-[#...]` / `text-[#...]` / `border-[#...]` が **22ファイル・79件**、加えて主要画面に `bg-[#1e3a8a]` / `dark:bg-[#10b981]` 等のベタ書き。`#1e3a8a` は `primary-600`、`#10b981` は `medical-green-500` と**同値**であり、トークンがあるのに迂回している。

多い順（hex）:
| 件数 | ファイル |
|---|---|
| 30 | `src/components/staff/shift-optimizer.tsx` |
| 21 | `src/app/(app)/chat/page.tsx` |
| 19 | `src/components/staff/performance-metrics.tsx` |
| 7 | `src/components/master/admin-master-form.tsx` |
| 7 | `src/app/(app)/patients/[id]/page.tsx` |
| 6 | `sidebar.tsx` / `patient-flow-heatmap.tsx` / `admin-chat-interface.tsx` / `staff/page.tsx` / `ai-insights/page.tsx` |
| 5 | `menu-ranking.tsx` / `patients/page.tsx` / `multi-store/page.tsx` / `admin/(protected)/chat/page.tsx` |
| 3–4 | `conversion-funnel.tsx` / `header.tsx` / `admin-clinic-scope-selector.tsx` / `patients/list/page.tsx` / `dashboard/page.tsx` |
| 1–2 | `manager-revenue-analysis.tsx` / `chat-interface.tsx` / `admin-dashboard.utils.ts` |

> Pilot mode で隠れている画面（`/chat`, `/ai-insights`）の hex が多い点に注意。優先度はパイロットで実際に表示される画面を上にする（後述の Phase 順）。

### RC-3: `dark:` ベタ書きペアが 39 ファイルに分散

`dark:bg-gray-*` / `dark:bg-slate-*` / `dark:text-gray-*` が **39ファイル**。RC-1 を直せば、これらは順次 `bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` に置換でき、`dark:` 接頭辞自体を削除できる。

### RC-4: variant API の肥大化と低使用

- **Button**: 17 variant。医療/admin/patient 系の実使用は `medical-primary`(8) / `medical-urgent`(4) / `medical-success`(2) / `admin-primary`(2) / `admin-secondary`(2) / `patient-primary`(2) / `patient-gentle`(1) のみ。`medical-safety`(1) / `medical-caution`(1) / `medical-neutral`(1) は実質未使用。さらに `priority` / `role` prop による派生スタイル（`getPriorityStyles` / `getRoleStyles`）はほぼ装飾でしか効いておらず、複雑性に見合っていない。
- **Card**: 10 variant + `elevation` + `priority` + `interactive`。card.tsx 定義の中で実使用は `medical`(16) / `admin`(5) / `emergency`(4) / `clinical`(2) / `patient`(2) / `security`(1) / `default`(1) / `dashboard`。`report` / `analytics` は使用 0。
- shadcn の `bg-card` を当てた Card の中で、`CardHeader` / `CardContent` に再度 `bg-card` を付けるカーゴカルトが `dashboard/page.tsx` ほかに存在。

### RC-5: ダークモードの状態管理が二重

`app-shell.tsx` は `useState(isDarkMode)` + 条件分岐クラス文字列（`isDarkMode ? 'bg-gray-800' : 'bg-gray-50'`）で描画する一方、`document.documentElement` に `.dark` クラスも付けている。`.dark` + CSS変数で完結できるのに、JSの条件分岐が二重管理になっている。

### RC-6: レイアウトの二重 min-height

`app-shell.tsx` の `<main>` が `min-h-[calc(100vh-4rem)]`、その内側の `dashboard/page.tsx` の `ClinicDashboard` も `min-h-screen` を持ち、余白・スクロールが崩れる。

### RC-7: 未完成プレースホルダの本番表示

`dashboard/page.tsx:250` の「ウィジェット配置 (開発中)」カードがユーザーに表示されている。

### RC-8: `linkButtonClassName` の手書き再現

`manager-dashboard.tsx:54` で Button のスタイルを文字列で再現している。Link 用に Button を流用する正式な手段（`asChild`）が無いため。

## Goals

- ライト/ダーク両方で `bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` / `border-border` が正しく機能する（RC-1）。
- アプリ画面から色のハードコード hex を排除し、Tailwind トークン or CSS変数に統一する（RC-2）。
- `dark:` ベタ書きペアを CSS変数トークンへ置換し、原則 `dark:` 接頭辞を使わない（RC-3）。
- Button / Card の variant を実使用分へ集約し、API を縮小する（RC-4）。
- ダークモード制御を `.dark` クラス + CSS変数の一系統に統一する（RC-5）。
- レイアウトの二重 min-height を解消する（RC-6）。
- 未完成プレースホルダをパイロット表示から除外する（RC-7）。
- Link を Button 見た目で扱う正式手段を用意する（RC-8）。

## Non-Goals

- 画面の **情報設計・導線・機能の変更はしない**（ボタンの位置・文言・遷移先は維持）。
- 新規ページ・新規コンポーネント（showcase 以外）・新規依存の追加はしない。
- 認可・RLS・テナント分離・clinic scope に関わるコードは触らない。`clinic_id` / `role` / `user_id` を扱うロジックは変更対象外。
- DB migration / Supabase 型生成物（`src/types/supabase.ts`）は変更しない。
- `src/legacy/` は対象外（lint/型対象外のため流用も禁止）。
- ブランドカラーそのものの再設計（パレットの色値変更）はしない。既存トークン値を維持したまま「使い方」を直す。
- Pilot mode で常時非表示の画面（`/chat`, `/ai-insights`, `/blocks`, `/master-data` 等）の hex 除去は Phase 5（任意）に後置し、必須ゲートにしない。

## Current State（対象ファイル）

トークン定義:
- `tailwind.config.ts`（色・spacing・shadow・radius トークン）
- `src/app/globals.css`（CSS変数・`@layer components` ユーティリティ）

コンポーネント基盤:
- `src/components/ui/button.tsx`（17 variant）
- `src/components/ui/card.tsx`（10 variant + elevation/priority/interactive）
- `src/components/ui/alert.tsx` / `badge.tsx`（variant 参照の互換確認用）
- `src/components/examples/design-system-showcase.tsx`（トークンの参照ショーケース。統一後の正となる）

レイアウト/ダークモード:
- `src/app/(app)/app-shell.tsx`
- `src/app/(app)/dashboard/page.tsx`

色ハードコード/ダークペアの分散（RC-2 / RC-3 の22+39ファイル。詳細は上表と `grep` 再現コマンド参照）。

### 現状の再現コマンド（着手前にベースライン取得）

```bash
# hex ハードコード件数（ベースライン）
grep -rn "bg-\[#\|text-\[#\|border-\[#" src/app src/components | wc -l   # 期待: 79

# dark: ベタ書きペアのファイル数（ベースライン）
grep -rln "dark:bg-gray\|dark:bg-slate\|dark:text-gray" src/app src/components | wc -l   # 期待: 39

# .dark が上書きする変数（現状: legacy 4変数のみ）
grep -n "\.dark" src/app/globals.css
```

## 設計方針

### D-1: 単一の真実 = CSS変数トークン

色は次の優先順で表現する。**hex 直書きと `dark:` ペアは原則禁止**にする（lint で段階的に締める / Phase 6）。

1. 役割が決まっている UI 面: `bg-background` / `bg-card` / `bg-muted` / `bg-popover` / `text-foreground` / `text-muted-foreground` / `border-border` / `bg-primary` / `bg-destructive` / `bg-accent`
2. 医療セマンティクス: `medical-blue-*` / `medical-green-*` / `admin-*`（tailwind.config のスケール）
3. 上記で表現できない一過性の色: 必ずコメントで理由を残し、新規追加は禁止（既存のみ許容）

### D-2: `.dark` に shadcn 変数のダーク値を追加（RC-1 の核）

`globals.css` の `.dark` に shadcn ダークパレットを追加する。値は shadcn 標準のダークテーマ（slate 系）を採用し、医療系の `--primary` はライトと同系の視認性を保つ。

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

  /* legacy 互換（既存参照を壊さない） */
  --bg-color: #1f2937;
  --text-color: #f3f4f6;
  --surface-color: #374151;
  --border-color: #4b5563;
}
```

> 既存 legacy 4変数の上書きは残す（後方互換）。新規参照では使わない。

### D-3: 色トークンの置換マッピング（RC-2 / RC-3）

| 現状（ベタ書き） | 置換後 |
|---|---|
| `bg-[#1e3a8a]` / `bg-[#1e3a8a]/90` | `bg-primary` / `bg-primary/90`（hover）|
| `dark:bg-[#10b981]` | 削除（`bg-primary` がダーク対応するため不要）|
| `bg-white dark:bg-gray-800` | `bg-card` |
| `bg-gray-50 dark:bg-gray-900` | `bg-background` |
| `bg-gray-50 dark:bg-gray-700`（小カード）| `bg-muted` |
| `text-gray-900 dark:text-gray-100` | `text-foreground` |
| `text-gray-600 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-slate-200` | `border-border` |
| アクセント `#059669` 系 | `text-medical-green-600` / `bg-medical-green-600` |
| admin 紫 `#7c3aed` 系 | `admin-*` スケール |

### D-4: Button variant 集約（RC-4）

維持する variant:
- shadcn 標準: `default` / `destructive` / `outline` / `secondary` / `ghost` / `link`
- 医療: `medical-primary` / `medical-urgent` / `medical-success`
- 管理: `admin-primary` / `admin-secondary`
- 患者公開導線: `patient-primary` / `patient-gentle`

廃止して移行する variant:
- `medical-safety` → `medical-success`
- `medical-caution` → 新規不要。`secondary` か `medical-urgent` のいずれか意味に近い方へ各使用箇所で個別移行（1件）
- `medical-neutral` → `secondary`

`priority` / `role` prop と `getPriorityStyles` / `getRoleStyles`:
- `priority='urgent'` の視覚効果（pulse + ring）は **`medical-urgent` variant に内包**して prop を廃止。`aria-label` の緊急プレフィックスは variant 側に移す。
- `role` prop（左ボーダー等の装飾）は削除（実使用ほぼ無し）。

> 破壊的 API 変更になるため、削除する variant/prop は **まず使用箇所を移行 → 次に定義削除** の順（Phase 3）。

### D-5: Card variant 集約（RC-4）

維持: `default` / `medical` / `dashboard` / `emergency` / `admin` / `patient`
廃止して移行:
- `clinical` → `medical`（2件）
- `security` → `admin`（1件）
- `report` / `analytics` → 使用 0、定義削除のみ

`CardHeader` / `CardContent` の冗長な `bg-card` を削除（Card ルートが既に付与）。

### D-6: ダークモード制御の一系統化（RC-5）

`app-shell.tsx`:
- `isDarkMode` state とトグルの「`.dark` クラス付与＋localStorage」ロジックは残す（ユーザー操作の保存先として必要）。
- ただし **条件分岐クラス文字列（`isDarkMode ? 'bg-gray-800' : 'bg-gray-50'`）を全廃**し、`bg-background` / `bg-card` / `text-foreground` に置換。`<main>` / コンテナ / ラッパの色は変数任せにする。
- FOUC 対策として、`<html>` への `.dark` 初期付与を `app/layout.tsx` の `<head>` 内インラインスクリプト（localStorage + prefers-color-scheme 判定）へ前出しする（任意・Phase 4 で評価）。

### D-7: レイアウト二重 min-height 解消（RC-6）

`dashboard/page.tsx` の `ClinicDashboard` 直下 `<div className='min-h-screen ...'>` から `min-h-screen` を除去（`app-shell` の `<main>` が高さを担保）。ローディング/エラー時の中央寄せは `min-h-[50vh]` 程度の局所指定に変更。

### D-8: プレースホルダ除外（RC-7）

`dashboard/page.tsx` の「ウィジェット配置 (開発中)」Card を削除（将来再導入時は feature flag 下で）。

### D-9: Link-as-Button の正式化（RC-8）

`button.tsx` に `asChild`（Radix Slot 相当の最小実装、または既存 Slot があれば利用）を追加し、`<Button asChild><Link/></Button>` を可能にする。`manager-dashboard.tsx` の `linkButtonClassName` を撤去して `Button variant='outline' asChild` に置換。
> Slot 依存を増やしたくない場合は、`buttonClassName(variant,size)` を export するヘルパに留め、`linkButtonClassName` をそれで生成する縮退案も可（D-9 は任意）。

## 実装フェーズ（TDD・小さく可逆に）

各 Phase 末で `npm run lint` / `npm run type-check` / 該当テストが green。1 Phase = 1 PR を基本とする（CLAUDE.md「1 task = 1 PR」）。

### Phase 0: ベースライン & 回帰テスト土台 🔴
- 上記「再現コマンド」で hex=79 / darkペア=39 を記録（PR 説明に貼る）。
- `src/__tests__/stabilization/` に静的テストを追加（jsdom 不要、node 実行の `*.test.ts`）:
  - `UI01-dark-theme-variables.test.ts`: `globals.css` を読み、`.dark` ブロック内に `--background` / `--card` / `--foreground` / `--muted` / `--border` が含まれることを assert（RC-1 のレッド→グリーン）。
  - `UI02-no-hardcoded-hex.test.ts`: パイロット表示対象ファイル群（許可リスト方式）に `bg-\[#` / `text-\[#` が無いことを assert。初期は許可リストを広く取り、Phase ごとに縮める。
- コミット: `test: add failing UI design-system unification guards`

### Phase 1: ダークテーマ変数の補完（RC-1）🟢 最優先・最小リスク
- `globals.css` の `.dark` に D-2 の shadcn ダーク変数を追加。
- `UI01` を green に。
- 目視確認: ダークトグルで Card/背景/テキストが反転すること（`/dashboard`, `/manager`, `/reservations`）。
- コミット: `feat: complete dark theme css variables for shadcn tokens`

### Phase 2: パイロット主要画面の色トークン置換（RC-2 / RC-3）
対象（パイロットで表示される画面を優先）:
- `app-shell.tsx`（D-6 の条件分岐クラス撤去含む）
- `dashboard/page.tsx`（hex 3件 + dark ペア + RC-6 + RC-7 も同 PR で可）
- `manager-dashboard.tsx` 周辺、`sidebar.tsx`(6) / `header.tsx`(4)
- `patients/page.tsx`(5) / `patients/[id]/page.tsx`(7) / `patients/list/page.tsx`(3) / `conversion-funnel.tsx`(4)
- `staff/page.tsx`(6) / `performance-metrics.tsx`(19) / `shift-optimizer.tsx`(30)
- `multi-store/page.tsx`(5) / `menu-ranking.tsx`(5) / `manager-revenue-analysis.tsx`(1) / `patient-flow-heatmap.tsx`(6)
- `master/admin-master-form.tsx`(7)

D-3 マッピングに従い機械的に置換。各ファイル置換後にその画面を目視（ライト/ダーク両方）。
- コミット例: `refactor: replace hardcoded colors with design tokens in <area>`（ファイル群ごとに分割）
- `UI02` 許可リストを段階的に縮小。

### Phase 3: Button / Card variant 集約（RC-4）
1. 🔴 `UI03-variant-surface.test.ts`: `button.tsx` / `card.tsx` の variant キー集合が「維持リスト」と一致することを assert（先にレッド）。
2. 使用箇所移行（D-4 / D-5 の移行表どおり）→ 定義削除。
3. `CardHeader`/`CardContent` の冗長 `bg-card` 削除。
4. `priority`/`role` prop 廃止に伴う呼び出し側修正（`grep "priority='" ` の7+件、`role='staff|admin|patient'`）。
- コミット: `refactor: consolidate button variants and migrate callers` 等、移行と削除を分離。

### Phase 4: ダークモード制御の一系統化 & レイアウト（RC-5 / RC-6）
- `app-shell.tsx` 残りのクリーンアップ、FOUC 対策スクリプト（任意）。
- 二重 min-height の最終確認。
- コミット: `refactor: unify dark mode control via css variables`

### Phase 5（任意・必須ゲート外）: Pilot 非表示画面の hex 除去
- `/chat`(21) / `ai-insights`(6) / `admin chat`(6) / chat 系コンポーネント。
- パイロットで表示されないため後回し。完了後 `UI02` 許可リストを空にできる。

### Phase 6（任意）: lint で再発防止
- ESLint ルール（`no-restricted-syntax` か Tailwind プラグイン）で `className` 内 `\[#[0-9a-fA-F]` と `dark:` 接頭辞を warn → error へ段階導入。
- `design-system-showcase.tsx` を「正しい使い方の唯一の参照」に更新。

### Phase 7（任意）: Link-as-Button（RC-8）
- D-9 実装、`linkButtonClassName` 撤去。

## Acceptance Criteria（DoD）

機能・回帰:
- [ ] `npm run lint` / `npm run type-check` green。
- [ ] `npm run test:pr05:focused` green（既存 CI 必須ゲートを壊さない）。
- [ ] E2E（`npm run test:e2e:pw`）の既存スイートが緑（視覚変更のみで挙動不変）。
- [ ] 認可・RLS・clinic scope 関連テストに変更なし（差分が `clinic_id`/`role`/`user_id` に触れていないことをレビューで確認）。

デザイン統一:
- [ ] `UI01`（`.dark` に shadcn 変数あり）green。
- [ ] ダークトグルで `/dashboard`・`/manager`・`/reservations`・`/patients`・`/staff` の背景/カード/テキスト/境界が破綻なく反転（目視・スクショ添付）。
- [ ] Phase 2 対象ファイルの `grep "bg-\[#"` が 0。
- [ ] `UI03`：Button/Card の variant が維持リストと一致。
- [ ] `dashboard/page.tsx` から `min-h-screen` 二重と「開発中」カードが消えている。

数値ターゲット（最終形）:
- [ ] hex ハードコード: 79 → Phase 2 完了時にパイロット対象 0 / Phase 5 完了時に全体 0。
- [ ] `dark:` ベタ書きペアのファイル: 39 → Phase 2 完了時にパイロット対象 0。

## テスト計画

- 配置: `src/__tests__/stabilization/UI01..UI03*.test.ts`（node 環境 = `*.test.ts`）。
- 方針: 視覚そのものは単体テストで担保しきれないため、(a) 静的構造テスト（変数・variant 集合・hex 不在）+ (b) 既存 E2E の回帰 + (c) 目視スクショ、の3層で守る。
- 「壊れた実装に合わせてテストを変えない」原則を厳守。トークン置換でスナップショットが落ちた場合、意味的に等価かを確認してから更新。

## リスクと緩和

| リスク | 緩和 |
|---|---|
| ダーク変数追加で既存のダーク見た目が一括変化し、想定外コントラスト低下 | Phase 1 を単独 PR にし主要画面を全目視。WCAG AA（4.5:1）をスポット計測 |
| variant 削除で参照漏れ → 実行時 undefined class（無装飾） | 「移行 → 削除」の順を厳守。`UI03` と `grep` で全参照を事前洗い出し |
| `priority`/`role` prop 廃止が広範囲に波及 | prop 使用は `grep` で7+件と限定的。Phase 3 内で閉じる |
| 大量機械置換でのデグレ | D-3 の固定マッピング表に限定。ファイル単位で小さく PR、各 PR で該当画面を目視 |
| Pilot 非表示画面の置換コスト | Phase 5 として必須ゲート外に分離 |

## Rollback

- 本 spec は DB/RLS/migration を含まないため、ロールバックは **git revert**（Phase 単位 PR なので局所復旧可能）。
- `globals.css` の `.dark` 追加（Phase 1）は単独 commit にし、ダークモードに問題が出た場合はその commit のみ revert すれば全変数がライト挙動（= 現状）へ戻る。
- variant 削除（Phase 3）は「定義削除 commit」を分離し、問題時に定義のみ復活できるようにする。

## 関連

- `CLAUDE.md`（TDD・型安全・セキュリティ不変条件・1 task=1 PR）
- `docs/stabilization/DoD-v0.1.md`（DoD 12項目維持）
- `tailwind.config.ts` / `src/app/globals.css`（トークン正本）
- `src/components/examples/design-system-showcase.tsx`（統一後の参照ショーケース）
