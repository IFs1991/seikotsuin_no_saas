# UI/UX デザインシステム統一 Spec v0.3 Role-Guarded

- Status: draft / revised / role-guarded
- Date: 2026-06-14
- File: `docs/stabilization/spec-ui-ux-design-system-unification-v0.3-role-guarded.md`
- Owner: 未割当
- Phase: `0.1.0-pilot`（安定化。新機能ではなく既存UIの一貫性回復）
- Scope: UI styling stabilization + role-based UI/UX guardrails

---

## 0. Revision Notes from v0.2

v0.2 の内容を維持しつつ、Tiramisu が多店舗・複数権限の業務SaaSであることを前提に、**ロール別UI/UXのガードレール**を明文化する。

主な修正点:

1. ロール別UI/UXの保護対象を追加する。
2. `role` prop とユーザー権限ロールを明確に分離する。
3. Admin / Owner、Manager、Staff / Practitioner、Patient / Public の主導線・視覚階層・確認観点を定義する。
4. Phase 0 にロール別UI/UXベースライン確認を追加する。
5. Phase 2A〜2D の各PRに、ロール別スクリーンショット確認を追加する。
6. Acceptance Criteria に Role-based UI/UX を追加する。
7. AIエージェント実装時の禁止事項を強化する。

---

## 1. Summary

現状のUIは「設計思想は良いが、実装で守られていない」状態にある。

デザイントークン、医療系パレット、WCAG 2.2 を意識したタッチターゲット、focus管理の方向性は悪くない。しかし実装が複数のスタイリング戦略に分裂しており、以下の問題を生んでいる。

- ダークモードで shadcn 系CSS変数が正しく反転しない。
- `bg-white dark:bg-gray-800` のような局所対応が増えている。
- `bg-[#...]` / `text-[#...]` / `border-[#...]` のハードコードが残っている。
- Button / Card の variant API が肥大化している。
- ダークモード制御が CSS変数とJS条件分岐の二重管理になっている。
- UI統一の過程で、ロール別の主導線・視覚階層・情報密度が平均化されるリスクがある。

本 spec は、**機能・挙動・認可・RLS・DB を一切変えず**、UI styling の一貫性を回復する。さらに、Tiramisu の本質が multi-tenant / multi-role SaaS であることを前提に、ロール別UI/UXの破綻を防ぐ。

最重要は `.dark` に shadcn CSS変数のダーク値が欠落している問題を直すこと。ここを直せば、派生的な `dark:` ベタ書きや hex ハードコードの多くを安全に削減できる。

---

## 2. Goals

### 2-1. Design System Goals

- ライト/ダーク両方で `bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` / `border-border` が正しく機能する。
- アプリ主要画面から `bg-[#...]` / `text-[#...]` / `border-[#...]` を排除し、Tailwind token またはCSS変数へ統一する。
- `dark:` ベタ書きペアを原則削除し、CSS変数トークンへ置換する。
- ダークモード制御を `.dark` クラス + CSS変数の一系統へ寄せる。
- レイアウトの二重 `min-height` を解消する。
- 未完成プレースホルダをパイロット表示から除外する。
- Button / Card variant を実使用分へ集約する。ただしこれは Phase 1〜2 完了後の後段タスクとする。
- 再発防止のため、静的テストと lint 方針を用意する。

### 2-2. Role-based UI/UX Goals

- Admin / Owner、Manager、Staff / Practitioner、Patient / Public の主導線を維持する。
- styling変更によって、ロールごとの重要CTAが埋もれないようにする。
- styling変更によって、ロールごとの情報密度が不適切に変わらないようにする。
- styling変更によって、本来見えてはいけない情報が見える状態を作らない。
- styling変更によって、緊急・警告・成功・管理系の意味が消えないようにする。
- role-based auth / RLS / clinic scope には触らず、UI presentation だけを修正する。

---

## 3. Non-Goals

- 画面の情報設計・導線・機能変更はしない。
- ボタンの位置、文言、遷移先は原則維持する。
- ロールごとの権限設計を変更しない。
- ロールごとの表示データ範囲を変更しない。
- 新規ページは追加しない。
- 新規コンポーネントは原則追加しない。ただしテスト・showcase 更新・必要最小限のhelperは許容する。
- 認可、RLS、テナント分離、clinic scope に関わるコードは触らない。
- `clinic_id` / `role` / `user_id` を扱うロジックは変更対象外。
- DB migration / Supabase 型生成物（`src/types/supabase.ts`）は変更しない。
- `src/legacy/` は対象外。lint/型対象外のため流用も禁止。
- ブランドカラーそのものの再設計はしない。既存トークン値を維持したまま「使い方」を直す。
- Pilot mode で常時非表示の画面（`/chat`, `/ai-insights`, `/blocks`, `/master-data` 等）の hex 除去は後段に回す。

---

## 4. Role-based UI/UX Guardrails

### 4-1. Why this section exists

このspecは styling stabilization が主目的であり、情報設計の全面刷新ではない。

ただし、Tiramisu は多店舗・複数権限の Vertical SaaS である。UIを単純に統一すると、以下の事故が起きる。

- 本部向け画面が現場向けのように薄くなる。
- スタッフ向け画面が本部向けのように重くなる。
- 患者向け画面に管理画面の硬さが出る。
- 管理系・緊急系・患者導線の意味が色統一で消える。
- `role` prop の削除作業が、ユーザー権限ロールの変更と混同される。

そのため、v0.3 では role-based UI/UX を明示的に守る。

### 4-2. Role Definitions

| Role | Description | Primary Need | UX Priority |
|---|---|---|---|
| Admin / Owner | 本部・経営・全店舗横断管理 | 全体俯瞰、異常検知、設定、監査 | 情報密度・比較・管理感 |
| Manager | 店舗責任者・エリア責任者 | 店舗運営判断、売上、予約、スタッフ把握 | 今日/今週の意思決定 |
| Staff / Practitioner | 施術者・受付・現場スタッフ | 今日の勤務、予約、患者対応、日報 | 迷わない、速い、押し間違えない |
| Patient / Public | 患者・公開予約導線 | 予約、問診、来院導線、安心感 | 明快さ、安心感、CTAの強さ |

> Note: 実装上の role 名が `admin` / `manager` / `staff` / `patient` と完全一致しない場合でも、この表はUX上の分類として扱う。

### 4-3. Role prop と User Role を混同しない

`button.tsx` 等に存在する `role` prop は、装飾・variant制御のための presentation API である。

一方、認可・RLS・表示範囲を決める user role は security / domain logic である。

このspecで削除・整理対象になる可能性があるのは、前者の **presentation用 `role` prop** のみ。

以下は禁止する。

- user role の enum を変更する。
- `clinic_id` / `role` / `user_id` に基づく表示条件を変更する。
- RLSやSupabase queryの条件を変更する。
- styling整理のついでに role-based navigation を変更する。

### 4-4. Role × Surface 確認表

| Role | Primary Surfaces | Must Preserve |
|---|---|---|
| Admin / Owner | dashboard, multi-store, master, admin forms | 全体俯瞰、店舗横断性、設定導線、監査・管理の印象 |
| Manager | manager dashboard, revenue analysis, patient flow, conversion funnel | 店舗運営判断、売上/予約/スタッフ導線、異常値の見つけやすさ |
| Staff / Practitioner | staff page, shift optimizer, performance metrics, reservations | 今日の行動、勤務、担当患者、日報導線、押し間違えにくさ |
| Patient / Public | patient pages, reservation-related surfaces, public forms | 予約/来院導線、安心感、迷わないCTA、医療系サービスとしての信頼感 |

### 4-5. Role-specific UI Principles

#### Admin / Owner

- 情報密度はある程度高くてよい。
- 店舗比較、全体KPI、例外検知が埋もれてはいけない。
- `admin-*` token は管理系の意味を持つ場合に使う。
- 美しさより、比較・俯瞰・管理感を優先する。

#### Manager

- 売上、予約、スタッフ稼働、キャンセル、患者流入などの判断材料を優先する。
- primary CTA は「今日/今週の運営判断」に直結するものを維持する。
- dashboardカードの階層が平坦になりすぎないようにする。
- 重要KPI、注意、改善余地は色やbadgeで意味が残るようにする。

#### Staff / Practitioner

- 情報密度を上げすぎない。
- 今日やること、予約、勤務、患者対応、日報が主導線。
- タッチターゲットは小さくしない。
- 警告/緊急/成功の状態表現を消さない。
- 施術現場での短時間確認を想定し、視線移動を増やさない。

#### Patient / Public

- 管理画面の硬さを持ち込まない。
- 予約CTA、来院導線、安心感を優先する。
- 医療系サービスとして、過度に派手・不安を煽る色は避ける。
- テキストコントラストと読みやすさを優先する。
- 患者向けCTAは `patient-*` token または意味の近い token を使う。

### 4-6. Color and Variant Semantics by Role

| Semantics | Preferred Token / Variant | Notes |
|---|---|---|
| General background | `bg-background` | ロール共通 |
| Surface / card | `bg-card` | ロール共通 |
| Secondary surface | `bg-muted` | 小カード・補助領域 |
| General text | `text-foreground` | ロール共通 |
| Secondary text | `text-muted-foreground` | ロール共通 |
| Admin emphasis | `admin-*`, `admin-primary` | 本部・管理・設定 |
| Medical trust | `medical-blue-*`, `medical-primary` | 医療系の主導線 |
| Success / completed | `medical-green-*`, `medical-success` | 完了・成功・改善 |
| Urgent / warning | `medical-urgent`, `destructive` | 緊急・注意・危険。意味を消さない |
| Patient CTA | `patient-primary`, `patient-gentle` | 公開/患者向け導線 |

### 4-7. Role-based Screenshot Gate

各 Phase 2 PR では、最低限以下のスクリーンショットをPR本文に添付する。

| Phase | Required Screenshots |
|---|---|
| Phase 2A | dashboard light/dark, navigation light/dark |
| Phase 2B | manager light/dark, patients light/dark |
| Phase 2C | staff light/dark, shift/performance light/dark |
| Phase 2D | multi-store light/dark, master/admin form light/dark |

患者向け公開画面が pilot 対象に含まれる場合は、Patient / Public の light/dark も追加する。

### 4-8. Role-based Anti-Regression Checklist

各PRで以下を確認する。

- [ ] Admin / Owner の全体俯瞰・店舗横断性が弱くなっていない。
- [ ] Manager の売上/予約/スタッフ判断導線が埋もれていない。
- [ ] Staff / Practitioner の今日の行動導線が重くなっていない。
- [ ] Patient / Public の予約CTA・安心感が弱くなっていない。
- [ ] 緊急・警告・成功・管理系の意味が token 置換で消えていない。
- [ ] styling変更によって表示範囲・認可条件が変わっていない。

---

## 5. Root Causes

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

v0.1 では `92件` と `79件` が混在していたため、v0.3 では以下のように定義する。

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

| 現状 | 置換後 |
|---|---|
| `bg-white dark:bg-gray-800` | `bg-card` |
| `bg-gray-50 dark:bg-gray-900` | `bg-background` |
| `bg-gray-50 dark:bg-gray-700` | `bg-muted` |
| `text-gray-900 dark:text-gray-100` | `text-foreground` |
| `text-gray-600 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-slate-200` | `border-border` |

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

---

## 6. Design Principles

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

### D-3: 色トークン置換マッピング

| 現状 | 置換後 |
|---|---|
| `bg-[#1e3a8a]` | `bg-primary` |
| `bg-[#1e3a8a]/90` | `bg-primary/90` |
| `dark:bg-[#10b981]` | 削除。`bg-primary` のダーク値に任せる |
| `bg-white dark:bg-gray-800` | `bg-card` |
| `bg-gray-50 dark:bg-gray-900` | `bg-background` |
| `bg-gray-50 dark:bg-gray-700` | `bg-muted` |
| `text-gray-900 dark:text-gray-100` | `text-foreground` |
| `text-gray-600 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-slate-200` | `border-border` |
| `#059669` 系 | `text-medical-green-600` / `bg-medical-green-600` |
| `#7c3aed` 系 | `admin-*` スケール |

### D-4: `dark:` 接頭辞の扱い

原則として `dark:` は使わない。

理由:

- `.dark` + CSS変数で解決する方が一貫性が高い。
- JSX側にライト/ダーク分岐を残すと再び二重管理になる。
- UI統一後の保守コストが上がる。

ただし、以下は例外として許可する。

- chart color の視認性調整
- brand / media / image background の局所補正
- warning / success / destructive の明度補正
- CSS変数では意味が保持できない特殊ケース

例外を追加する場合は、コメントに理由を書く。

### D-5: Button variant 集約

維持候補:

- shadcn標準: `default` / `destructive` / `outline` / `secondary` / `ghost` / `link`
- 医療: `medical-primary` / `medical-urgent` / `medical-success`
- 管理: `admin-primary` / `admin-secondary`
- 患者公開導線: `patient-primary` / `patient-gentle`

廃止候補:

- `medical-safety` → `medical-success`
- `medical-caution` → `secondary` または `medical-urgent`
- `medical-neutral` → `secondary`

`priority` / presentation用 `role` prop は、使用箇所移行後に廃止する。

### D-6: Card variant 集約

維持候補:

- `default`
- `medical`
- `dashboard`
- `emergency`
- `admin`
- `patient`

廃止候補:

- `clinical` → `medical`
- `security` → `admin`
- `report` → 使用0なら削除
- `analytics` → 使用0なら削除

`CardHeader` / `CardContent` に冗長な `bg-card` がある場合は削除する。Card ルートが背景を持つ。

### D-7: ダークモード制御の一系統化

`app-shell.tsx` では以下を維持する。

- `isDarkMode` state
- localStorage保存
- `document.documentElement.classList.toggle('dark')`

ただし、以下は撤去する。

- `isDarkMode ? 'bg-gray-800' : 'bg-gray-50'`
- `isDarkMode ? 'text-white' : 'text-gray-900'`
- その他 JSX内のダーク分岐クラス

styleは `bg-background` / `bg-card` / `text-foreground` に任せる。

### D-8: レイアウト二重 min-height 解消

`app-shell.tsx` の `<main>` が高さを担保する。

内側ページの `min-h-screen` は原則削除する。

ローディング/エラー中央寄せは、局所的に `min-h-[50vh]` 程度で扱う。

### D-9: Link-as-Button

`manager-dashboard.tsx` のように、Button style を文字列で再現する実装は避ける。

優先順:

1. 既に `@radix-ui/react-slot` が入っている場合: `<Button asChild><Link /></Button>` を採用する。
2. 依存がない場合: `buttonClassName({ variant, size })` helper を export する。
3. 新規依存追加はこのspecの範囲外。

---

## 7. Implementation Phases

全 Phase の共通ゲート:

```bash
npm run lint
npm run type-check
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
   - Phase 4 で有効化。
   - Button / Card variant key が維持リストと一致することを assert。
4. `UI04-role-logic-guard.test.ts` またはレビュー用script
   - `clinic_id` / `role` / `user_id` を扱うファイル差分を検出する。
   - 差分がある場合はPRで理由を明記する。
   - styling stabilization のPRでは原則差分なし。

#### 0-3. Role-based baseline screenshots

以下の代表画面について、light/dark の現状スクリーンショットを取得する。

- Admin / Owner: dashboard or multi-store
- Manager: manager dashboard
- Staff / Practitioner: staff page or shift optimizer
- Patient / Public: patient/reservation surface if pilot-visible

Commit:

```bash
git commit -m "test: add role-guarded UI stabilization baseline"
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
- role別代表画面の light/dark

確認項目:

- 背景が白のまま残っていない。
- Card がダーク背景へ反転する。
- 文字色が読める。
- border が浮きすぎない。
- ロールごとの主CTAが埋もれていない。

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

Role確認:

- Admin / Owner のdashboardで、全体俯瞰と管理導線が弱くなっていない。
- Navigationで、ロールごとの表示項目・強調状態が変わっていない。
- 主CTAが背景/カードに埋もれていない。

目視確認:

- `/dashboard`
- navigation
- dark toggle
- loading/error state
- dashboard light/dark screenshot
- navigation light/dark screenshot

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

Role確認:

- Manager の売上・予約・患者流入判断導線が弱くなっていない。
- Patient系画面の予約/来院導線が弱くなっていない。
- 患者向けUIに管理画面の硬さが出ていない。
- 警告、成功、注意、キャンセル等の意味が消えていない。

目視確認:

- `/patients`
- patient detail
- manager dashboard
- conversion funnel
- manager light/dark screenshot
- patients light/dark screenshot

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
- Staffの「今日やること」が重くなっていないか。

作業:

- D-3 の置換表に従って color token 化する。
- 状態色は medical/admin semantic token を優先する。
- `UI02` の allowlist から対象ファイルを外す。

Role確認:

- Staff / Practitioner の勤務・予約・患者対応導線が埋もれていない。
- タッチターゲットや視認性が悪化していない。
- 施術現場で短時間確認しやすい状態が維持されている。

目視確認:

- `/staff`
- shift optimizer
- performance metrics
- staff light/dark screenshot
- shift/performance light/dark screenshot

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

Role確認:

- Admin / Owner の店舗横断性、設定導線、管理感が弱くなっていない。
- Manager のランキング/分析から判断しやすい状態が維持されている。
- master form の入力・保存・注意表示が埋もれていない。

目視確認:

- multi-store dashboard
- menu ranking
- patient flow heatmap
- admin master form
- multi-store light/dark screenshot
- master/admin form light/dark screenshot

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
- role-based screenshot gate が通っていること。

作業順:

1. `UI03-variant-surface.test.ts` を red にする。
2. Button の使用箇所を移行する。
3. Card の使用箇所を移行する。
4. 未使用variantを削除する。
5. presentation用 `priority` / `role` prop を削除する。
6. user role / auth role / RLS role には触っていないことを確認する。
7. `UI03` を green にする。

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

---

## 8. Acceptance Criteria

### 8-1. Functionality / Regression

- [ ] `npm run lint` green。
- [ ] `npm run type-check` green。
- [ ] `npm run test:pr05:focused` green。
- [ ] 既存 E2E がある場合、対象画面のスモークテストが green。
- [ ] 認可・RLS・clinic scope 関連テストに変更なし。
- [ ] 差分が `clinic_id` / `role` / `user_id` のロジックを変更していない。
- [ ] Supabase query / RLS policy / tenant boundary に関する変更がない。

### 8-2. Design System

- [ ] `UI01` が green。
- [ ] `.dark` に shadcn 系変数が追加されている。
- [ ] `/dashboard` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/manager` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/reservations` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/patients` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `/staff` の背景/カード/テキスト/境界がライト/ダークで破綻しない。
- [ ] `dashboard/page.tsx` から二重 `min-h-screen` が消えている。
- [ ] `dashboard/page.tsx` から「ウィジェット配置（開発中）」Card が消えている。

### 8-3. Role-based UI/UX

- [ ] Admin / Owner の全体俯瞰、店舗横断性、管理導線が弱くなっていない。
- [ ] Manager の売上・予約・スタッフ・患者流入の判断導線が埋もれていない。
- [ ] Staff / Practitioner の今日の行動、勤務、患者対応、日報導線が重くなっていない。
- [ ] Patient / Public の予約CTA、来院導線、安心感が弱くなっていない。
- [ ] 緊急・警告・成功・管理系の状態表現が意味を失っていない。
- [ ] role-based screenshot gate を満たしている。
- [ ] styling変更によって表示データ範囲が変わっていない。
- [ ] presentation用 `role` prop と user role / auth role を混同していない。

### 8-4. Numeric Targets

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

---

## 9. Test Plan

### 9-1. Static Tests

配置:

```txt
src/__tests__/stabilization/UI01..UI04*.test.ts
```

テスト方針:

- 視覚そのものは単体テストだけでは担保しない。
- 静的構造テスト + 既存E2E + ロール別スクリーンショット確認の3層で守る。
- 壊れた実装に合わせてテストを緩めない。

### 9-2. Manual Visual Checks

最低限、以下をライト/ダークで確認する。

| Role | Surface | Check |
|---|---|---|
| Admin / Owner | dashboard / multi-store | KPI、比較、設定導線、管理感 |
| Manager | manager dashboard / revenue analysis | 売上、予約、患者流入、判断導線 |
| Staff / Practitioner | staff / shift optimizer | 今日の行動、勤務、予約、患者対応 |
| Patient / Public | patient / reservation | 予約CTA、安心感、読みやすさ |

### 9-3. Security / Scope Checks

以下の差分がある場合は、styling stabilization PR としては原則 reject する。

- RLS policy
- Supabase migration
- `src/types/supabase.ts`
- tenant / clinic scope query
- auth guard
- role-based routing
- visibility condition

例外的に差分が必要な場合は、別PRに分離する。

---

## 10. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| `.dark` 変数追加で既存ダーク見た目が一括変化する | 中 | Phase 1を単独PR。主要画面とrole別代表画面を目視 |
| Phase 2 が肥大化してレビュー不能になる | 高 | 2A〜2Dに分割する |
| role別UIが平均化される | 高 | Role-based screenshot gate と checklist を必須化 |
| Manager/Staff/Patient の主CTAが埋もれる | 中〜高 | 各PhaseのRole確認をPR本文に記録 |
| variant削除で参照漏れが出る | 中 | 移行 → 削除の順。UI03で検出 |
| presentation用 `role` prop と user role を混同する | 高 | Phase 4で明示チェック。auth/RLS差分を禁止 |
| `dark:` 完全禁止で例外が扱えなくなる | 中 | コメント付き例外を許可。最初はlint warn |
| `asChild` で新規依存が増える | 低〜中 | 既存依存がある場合のみ採用。なければ helper export |

---

## 11. Rollback

- DB / RLS / migration を含まないため、原則 `git revert` で戻せる。
- Phase 1 は単独commitにし、問題時は `.dark` 変数追加だけを revert する。
- Phase 2A〜2D は画面群ごとに分ける。
- Phase 4 の variant削除は、移行commitと削除commitを分ける。
- role-based UXが悪化した場合、該当Phaseのみ revert し、role screenshot baseline と比較する。

---

## 12. AI Agent Implementation Rules

Codex / Claude Code / Cursor agent に投げる場合は、以下を厳守する。

### 12-1. Must Do

- Phase単位で作業する。
- Phase 2 は必ず 2A〜2D に分割する。
- 変更前に baseline grep を取得する。
- 各Phase後に `npm run lint` / `npm run type-check` / `npm run test:pr05:focused` を実行する。
- role別の主導線を維持する。
- styling変更と認可変更を混ぜない。

### 12-2. Must Not Do

- DB migration を作らない。
- Supabase型生成物を変更しない。
- RLS policy を変更しない。
- `clinic_id` / `role` / `user_id` のロジックを変更しない。
- 画面導線、文言、遷移先を勝手に変えない。
- `role` prop 整理を user role 整理と解釈しない。
- Phase 1〜2D 完了前に Button/Card variant 削除へ進まない。
- hardcoded color を別の hardcoded color に置き換えない。

### 12-3. Recommended Agent Prompt

```md
You are implementing UI styling stabilization for Tiramisu.

Read `docs/stabilization/spec-ui-ux-design-system-unification-v0.3-role-guarded.md` first.

Work only on the requested phase.
Do not change business logic, auth, RLS, clinic scope, role-based visibility, Supabase migrations, or generated types.

For this phase:
1. Collect baseline grep numbers if Phase 0.
2. Make the smallest possible styling-only changes.
3. Replace hardcoded UI colors with design tokens.
4. Preserve role-based UI/UX for Admin/Owner, Manager, Staff/Practitioner, and Patient/Public.
5. Run lint, type-check, and focused tests.
6. Summarize changed files, grep deltas, and role-based visual checks.
```

---

## 13. Implementation Priority

今すぐ実装する範囲:

1. Phase 0
2. Phase 1
3. Phase 2A

その後に判断する範囲:

4. Phase 2B
5. Phase 2C
6. Phase 2D
7. Phase 3

後回し:

8. Phase 4 Button/Card variant集約
9. Phase 5 non-pilot cleanup
10. Phase 6 Link-as-Button

この順番にする理由:

- Phase 1 は根本原因に対して小さく効く。
- Phase 2A はPoC時の第一印象に効く。
- Phase 2B〜2D は価値があるが、画面ごとの確認が必要。
- Phase 4以降は綺麗になるが、初期PoCの価値に直結しにくい。

---

## 14. Related Files

- `CLAUDE.md`
- `docs/stabilization/DoD-v0.1.md`
- `tailwind.config.ts`
- `src/app/globals.css`
- `src/app/(app)/app-shell.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/examples/design-system-showcase.tsx`

---

## 15. Final Principle

このspecの目的は、Tiramisuを「綺麗なUI」にすることではない。

目的は、PoCで触られたときに以下を満たすこと。

- 本部には、管理できそうに見える。
- Managerには、判断できそうに見える。
- Staffには、迷わず使えそうに見える。
- Patientには、安心して予約できそうに見える。

UI統一は手段であり、ロール別の業務体験を潰してはいけない。
