# Vercel Build Warning 解消仕様書

## 1. 目的

Vercelビルド時に大量発生している npm / ESLint / React Hooks / a11y 警告を整理し、以下を達成する。

- Vercelデプロイの安定化
- Lint警告の段階的削減
- 商用導入前に保守性・アクセシビリティ・型安全性を最低ラインまで引き上げる
- AI生成コード由来の技術負債を可視化し、継続的に増えない状態を作る

---

## 2. 現状

Vercelビルドログでは、以下の警告が確認されている。

### 2.1 npm deprecated warning

例：

```txt
npm warn deprecated whatwg-encoding@2.0.0
npm warn deprecated inflight@1.0.6
npm warn deprecated glob@7.2.3
npm warn deprecated domexception@4.0.0
npm warn deprecated abab@2.0.6
```

これは直接のアプリコードではなく、依存パッケージの依存ツリー内で古いライブラリが使われている可能性が高い。

### 2.2 ESLint / TypeScript warning

代表例：

```txt
Warning: Unexpected any. Specify a different type.  @typescript-eslint/no-explicit-any
Warning: Unexpected console statement.  no-console
Warning: 'xxx' is assigned a value but never used.  unused-imports/no-unused-vars
```

### 2.3 React Hooks warning

代表例：

```txt
Warning: React Hook useMemo has a missing dependency: 'appointments'.
Warning: The 'clinics' logical expression could make the dependencies of useEffect Hook change on every render.
```

### 2.4 jsx-a11y warning

代表例：

```txt
Warning: A form label must be associated with a control.
Warning: Visible, non-interactive elements with click handlers must have at least one keyboard listener.
Warning: Avoid non-native interactive elements.
Warning: Headings must have content.
```

---

## 3. 原因分類

| 区分 | 原因 | 影響度 | 優先度 |
|---|---|---:|---:|
| React Hooks | useEffect / useMemo / useCallback の依存配列不足・不安定参照 | 高 | P0 |
| unused vars | 未使用変数・未使用引数・未使用import | 中 | P0 |
| jsx-a11y | label紐付け不備、divクリック、空heading | 中〜高 | P1 |
| no-explicit-any | `any` の過多 | 中 | P1 |
| no-console | `console.log` の残存 | 低〜中 | P2 |
| deprecated package | 依存パッケージの古さ | 中 | P2 |

---

## 4. 対応方針

### 4.1 基本方針

いきなり全警告ゼロを目指さない。

理由：

- 警告数が多く、全修正を一括で行うと回帰バグが入りやすい
- `any` の除去は型設計に踏み込むため、雑に直すと逆に壊れる
- a11y修正はUI構造変更を伴う場合がある
- MVP/PoCフェーズでは速度も重要

したがって、以下の順に処理する。

1. ビルド失敗要因の特定
2. 実バグ化しやすい警告を先に除去
3. UI品質に直結するa11y警告を除去
4. 型安全性を段階的に改善
5. CIで新規警告を増やさない

---

## 5. 対応ステップ

## Phase 0: ビルド失敗条件の確認

### 5.1 package.json の確認

以下を確認する。

```json
{
  "scripts": {
    "build": "next build",
    "lint": "eslint ."
  }
}
```

特に以下が入っている場合、警告でもCI失敗する。

```json
"lint": "eslint . --max-warnings 0"
```

### 5.2 Vercel Build Command の確認

Vercel管理画面で以下を確認する。

- Project Settings
- Build & Development Settings
- Build Command

確認対象：

```bash
npm run build
```

または

```bash
npm run lint && npm run build
```

### 5.3 一時回避策

デモ・検証・営業用に即時デプロイが必要な場合のみ、以下を許可する。

```js
// next.config.js

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
```

ただし、これは恒久対応ではない。

### Phase 0 完了条件

- Vercelが失敗している直接原因が `lint` か `build` か判明している
- `--max-warnings 0` の有無が確認済み
- 一時回避策を使う場合、Issueに技術負債として記録済み

---

## Phase 1: P0警告の除去

対象：

- `react-hooks/exhaustive-deps`
- `unused-imports/no-unused-vars`

---

### 6. React Hooks警告対応

### 6.1 missing dependency

#### 修正前

```tsx
const result = useMemo(() => {
  return appointments.filter((a) => a.status === 'active')
}, [])
```

#### 修正後

```tsx
const result = useMemo(() => {
  return appointments.filter((a) => a.status === 'active')
}, [appointments])
```

### 6.2 不安定な論理式

#### 修正前

```tsx
const clinics = data?.clinics || []

useEffect(() => {
  // clinics を使う処理
}, [clinics])
```

#### 修正後

```tsx
const clinics = useMemo(() => {
  return data?.clinics ?? []
}, [data?.clinics])

useEffect(() => {
  // clinics を使う処理
}, [clinics])
```

### 6.3 判断基準

依存配列に追加して無限ループする場合、依存先の値が毎renderで再生成されている可能性が高い。  
その場合は以下のいずれかで安定化する。

- `useMemo`
- `useCallback`
- state構造の見直し
- fetch / subscribe 処理の分離

---

### 7. 未使用変数・未使用import対応

### 7.1 原則

- 本当に不要なら削除
- 将来使う予定だけなら削除
- 型定義として必要なら `type` import に変更
- 引数として必要だが未使用なら `_` prefix を付ける

### 7.2 修正例

#### 修正前

```tsx
const userId = user.id
```

#### 修正後

```tsx
// 使用していないなら削除
```

#### 引数の場合

```tsx
function handleSubmit(_event: SubmitEvent) {
  executeSubmit()
}
```

### 7.3 完了条件

以下がゼロになること。

```bash
npm run lint -- --rule 'unused-imports/no-unused-vars:error'
```

または通常のlintで未使用系warningが出ないこと。

---

## Phase 2: jsx-a11y警告の除去

対象：

- `jsx-a11y/label-has-associated-control`
- `jsx-a11y/click-events-have-key-events`
- `jsx-a11y/no-static-element-interactions`
- `jsx-a11y/heading-has-content`

---

### 8. label紐付け不備

### 8.1 原則

`label` には必ず `htmlFor` を付け、対象inputに同じ `id` を付ける。

#### 修正前

```tsx
<label>患者名</label>
<input value={patientName} onChange={handleChange} />
```

#### 修正後

```tsx
<label htmlFor="patient-name">患者名</label>
<input
  id="patient-name"
  value={patientName}
  onChange={handleChange}
/>
```

### 8.2 コンポーネント化

フォーム項目が多い場合は共通コンポーネント化する。

```tsx
type FieldProps = {
  id: string
  label: string
  children: React.ReactNode
}

export function Field({ id, label, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}
```

---

### 9. divクリックの修正

### 9.1 原則

クリック可能な要素は原則 `button` を使う。

#### 修正前

```tsx
<div onClick={handleClick}>
  詳細を見る
</div>
```

#### 修正後

```tsx
<button type="button" onClick={handleClick}>
  詳細を見る
</button>
```

### 9.2 どうしてもdivを使う場合

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleClick()
    }
  }}
>
  詳細を見る
</div>
```

ただし、基本は `button` を使う。

---

### 10. 空headingの修正

#### 修正前

```tsx
<h2 />
```

#### 修正後

```tsx
<h2>売上分析</h2>
```

装飾目的ならheadingを使わず `div` に変更する。

---

## Phase 3: TypeScript any の段階的削減

対象：

- `@typescript-eslint/no-explicit-any`

---

### 11. 修正方針

`any` を一括で潰さない。  
以下の順で処理する。

1. APIレスポンス
2. Supabaseレスポンス
3. Form state
4. Chart / table data
5. event handler
6. 一時的に型が不明な外部データ

---

### 12. unknown への置換

#### 修正前

```ts
function parseData(data: any) {
  return data.name
}
```

#### 修正後

```ts
function parseData(data: unknown) {
  if (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    typeof data.name === 'string'
  ) {
    return data.name
  }

  return null
}
```

---

### 13. Supabase型の導入

Supabase CLIで型生成する。

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/database.types.ts
```

利用例：

```ts
import type { Database } from '@/types/database.types'

type Clinic = Database['public']['Tables']['clinics']['Row']
type ClinicInsert = Database['public']['Tables']['clinics']['Insert']
type ClinicUpdate = Database['public']['Tables']['clinics']['Update']
```

Supabase clientに型を渡す。

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
```

---

## Phase 4: console.log の整理

対象：

- `no-console`

---

### 14. 方針

本番に不要な `console.log` は削除する。  
必要なログはloggerに集約する。

### 14.1 logger作成

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (!isProduction()) console.debug(...args)
  },
  info: (...args: unknown[]) => {
    if (!isProduction()) console.info(...args)
  },
  warn: (...args: unknown[]) => {
    console.warn(...args)
  },
  error: (...args: unknown[]) => {
    console.error(...args)
  },
}
```

### 14.2 使用例

```ts
logger.debug('appointment payload', payload)
logger.error('failed to save appointment', error)
```

---

## Phase 5: deprecated package 対応

---

### 15. 調査コマンド

```bash
npm outdated
npm audit
npm ls glob
npm ls inflight
npm ls whatwg-encoding
npm ls domexception
npm ls abab
```

### 16. 対応方針

1. 直接依存ならアップデート
2. 間接依存なら親パッケージを特定
3. 親パッケージが古ければ更新
4. 更新不可なら現時点では記録のみ
5. security high / critical がある場合のみ即対応

### 17. lockfile更新

```bash
rm -rf node_modules
npm install
npm run build
npm run lint
```

---

## 6. CI / Vercel 運用仕様

---

### 18. 推奨スクリプト

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:strict": "eslint . --max-warnings 0",
    "build": "next build",
    "verify": "npm run typecheck && npm run lint && npm run build"
  }
}
```

---

### 19. 開発フェーズ別ルール

| フェーズ | Vercel build | lint | 方針 |
|---|---|---|---|
| MVP開発 | 警告許容 | `npm run lint` | 速度優先 |
| 社内PoC | 新規警告禁止 | `lint:strict` を任意実行 | 品質固定 |
| 商用前 | 警告ゼロ | `lint:strict` 必須 | 保守性優先 |
| 商用後 | 警告ゼロ維持 | CI必須 | 回帰防止 |

---

### 20. Pull Request基準

PRごとに以下を必須にする。

```bash
npm run typecheck
npm run lint
npm run build
```

商用前は以下も必須。

```bash
npm run lint:strict
```

---

## 7. Claude Code / Cursor 用タスク分割

---

## Task 1: ビルド失敗条件の確認

### 指示

```txt
Vercelビルドログと package.json を確認し、ビルド失敗の直接原因が lint warning なのか build error なのか判定してください。
--max-warnings 0 の有無、Vercel Build Command、next.config.js の eslint.ignoreDuringBuilds の有無を確認してください。
修正はまだ行わず、原因と推奨対応だけを報告してください。
```

### 成果物

- 原因レポート
- 変更なし

---

## Task 2: unused vars / unused imports の削除

### 指示

```txt
unused-imports/no-unused-vars の警告を対象に、未使用変数・未使用importを削除してください。
引数としてシグネチャ維持が必要なものは _ prefix に変更してください。
機能変更は行わないでください。
修正後に npm run lint を実行し、該当警告数を報告してください。
```

### 成果物

- 未使用変数・import削除PR
- 該当warning数のBefore/After

---

## Task 3: React Hooks依存配列の修正

### 指示

```txt
react-hooks/exhaustive-deps の警告をすべて確認してください。
単純な依存漏れは依存配列に追加してください。
依存追加で無限再renderになりそうな箇所は useMemo / useCallback で参照を安定化してください。
挙動変更の可能性がある箇所はコメントで理由を残してください。
修正後に npm run lint と npm run build を実行してください。
```

### 成果物

- hooks warning解消PR
- 挙動変更リスク一覧

---

## Task 4: label/input のa11y修正

### 指示

```txt
jsx-a11y/label-has-associated-control の警告を修正してください。
すべての label に htmlFor を付け、対応する input/select/textarea に id を付与してください。
id は画面内で重複しない命名にしてください。
UIの見た目とフォーム挙動は変更しないでください。
```

### 成果物

- label warning解消PR
- 主要フォーム画面の手動確認

---

## Task 5: divクリックのbutton化

### 指示

```txt
jsx-a11y/click-events-have-key-events と jsx-a11y/no-static-element-interactions の警告を修正してください。
クリック可能な div/span は原則 button に置き換えてください。
CSS崩れがある場合のみ role="button" tabIndex={0} onKeyDown を追加する方式を許可します。
```

### 成果物

- 非buttonクリック要素の修正PR
- キーボード操作確認

---

## Task 6: any の段階的削減

### 指示

```txt
@typescript-eslint/no-explicit-any の警告を分類してください。
APIレスポンス、Supabaseレスポンス、フォーム、チャート、イベントハンドラ、外部データに分けて一覧化してください。
まずSupabase型生成と主要データモデルの型付けから対応してください。
不明データは any ではなく unknown + type guard にしてください。
```

### 成果物

- any分類表
- 主要モデル型定義
- no-explicit-any警告数のBefore/After

---

## 8. 完了条件

### 8.1 最低完了条件

以下を満たすこと。

```bash
npm run build
```

がVercel/ローカル両方で成功する。

かつ、以下の警告がゼロ。

- `react-hooks/exhaustive-deps`
- `unused-imports/no-unused-vars`

---

### 8.2 PoC前完了条件

以下を満たすこと。

- P0警告ゼロ
- 主要フォームの `label-has-associated-control` 警告ゼロ
- クリック可能UIのa11y警告ゼロ
- `console.log` が本番重要経路に残っていない
- Vercel buildが安定して通る

---

### 8.3 商用前完了条件

以下を満たすこと。

```bash
npm run typecheck
npm run lint:strict
npm run build
```

すべて成功。

かつ：

- ESLint warningゼロ
- TypeScript errorゼロ
- Supabase主要テーブル型付け済み
- logger導入済み
- deprecated warning の直接依存有無確認済み
- high / critical 脆弱性ゼロ

---

## 9. 優先順位

### 今すぐやる

1. `package.json` と Vercel Build Command 確認
2. `react-hooks/exhaustive-deps` 修正
3. `unused-imports/no-unused-vars` 修正

### 次にやる

4. `label-has-associated-control` 修正
5. `click-events-have-key-events` / `no-static-element-interactions` 修正
6. `console.log` 削除またはlogger化

### 最後でよい

7. `no-explicit-any` の全面修正
8. deprecated package の親依存特定と更新

---

## 10. リスク

| リスク | 内容 | 対策 |
|---|---|---|
| 技術 | hooks修正で挙動が変わる | 修正単位を小さくし、画面ごとに確認 |
| 市場 | 品質改善に時間を使いすぎて検証が止まる | P0/P1のみ先に潰し、P2は後回し |
| 法務 | a11y不備が業務システム導入時の品質懸念になる | 商用前にa11y警告を最低限ゼロへ |
| オペ | 警告が多すぎてレビュー不能になる | 警告種別ごとにPR分割 |
| 資金 | 技術負債返済で開発速度が落ちる | デモ前は一時回避可、商用前に完済 |

---

## 11. 推奨PR分割

| PR | 内容 | 目安 |
|---|---|---:|
| PR-1 | build/lint設定確認・CI整理 | 小 |
| PR-2 | unused vars/imports削除 | 小 |
| PR-3 | React Hooks依存修正 | 中 |
| PR-4 | label/input a11y修正 | 中 |
| PR-5 | click要素のbutton化 | 中 |
| PR-6 | logger導入・console整理 | 小〜中 |
| PR-7 | Supabase型導入 | 中 |
| PR-8 | any削減 | 大 |

---

## 12. 最終判断

このログは「Vercelが悪い」のではなく、アプリ側のLint品質が追いついていない状態。

ただし、現時点でプロダクト価値を否定する問題ではない。  
AI/LLMを使って高速開発したプロダクトでは自然に発生する技術負債であり、今やるべきことは全面リファクタではなく、商用リスクに直結する順で潰すこと。

優先順位は以下。

```txt
1. build失敗条件の特定
2. hooks警告
3. unused警告
4. a11y警告
5. console整理
6. any削減
7. deprecated依存の整理
```

---

## 13. 実行コマンド一覧

```bash
# 依存確認
npm outdated
npm audit

# deprecated親依存確認
npm ls glob
npm ls inflight
npm ls whatwg-encoding
npm ls domexception
npm ls abab

# 型チェック
npm run typecheck

# lint
npm run lint

# strict lint
npm run lint:strict

# build
npm run build

# 総合検証
npm run verify
```
