# Lint Warning 修正案 Canvas v1

## 要約

現状の warning は「95種類の問題」ではなく、主に以下の少数パターンが複数ファイルに横展開されているだけです。

- `jsx-a11y/label-has-associated-control`
- `jsx-a11y/click-events-have-key-events`
- `jsx-a11y/no-static-element-interactions`
- `@typescript-eslint/no-explicit-any`
- `react-hooks/exhaustive-deps`
- `no-console`
- `unused-imports/no-unused-vars`
- `The Next.js plugin was not detected in your ESLint configuration`
- `@supabase/auth-helpers-nextjs` deprecated

したがって、件数ではなく**修正パターン単位**で潰すべきです。

---

## 前提

- 対象 repo: `IFs1991/seikotsuin_no_saas`
- warning 一覧の基準: `build_errors.txt`
- 現行 `main` と `build_errors.txt` には一部ズレがあるため、**現行コードを優先**して修正する

---

## 結論

最初にやるべきは以下の3本です。

1. `src/app/reservations/components/AppointmentEditForm.tsx`
2. `src/app/reservations/components/AppointmentForm.tsx`
3. `src/app/reservations/components/AppointmentBlock.tsx`

理由は単純で、**warning 数を大きく減らせるうえに UI/UX 改善にも直結する**からです。

次点で:

4. `src/app/login/page.tsx`
5. `src/hooks/useMasterData.ts`
6. `eslint.config.mjs`

---

## 優先順位A: 予約フォーム系の a11y 修正

### 対象

- `src/app/reservations/components/AppointmentEditForm.tsx`
- `src/app/reservations/components/AppointmentForm.tsx`
- 関連するフォームコンポーネント全般

### 問題

`label` が `input` / `select` / `textarea` に紐付いていません。
これは lint のためだけではなく、以下の実害があります。

- ラベルクリックで入力にフォーカスしない
- スクリーンリーダーで意味が取りにくい
- 複合入力で構造が曖昧

### 修正方針

#### パターン1: 単純な input/select は `htmlFor` + `id`

**修正前**

```tsx
<label className='block text-xs font-bold text-gray-500 uppercase mb-1'>
  来店日
</label>
<input
  type='date'
  value={formData.date}
  onChange={e => onChange('date', e.target.value)}
/>
```

**修正後**

```tsx
<label
  htmlFor='appointment-edit-date'
  className='block text-xs font-bold text-gray-500 uppercase mb-1'
>
  来店日
</label>
<input
  id='appointment-edit-date'
  type='date'
  value={formData.date}
  onChange={e => onChange('date', e.target.value)}
/>
```

#### パターン2: 姓・名、時・分のような複合入力は `fieldset` + `legend`

**修正前の構造**

- お名前
  - 姓 input
  - 名 input

この形だと親ラベルはあるのに、各入力の意味が曖昧です。

**修正後**

```tsx
<fieldset>
  <legend className='block text-sm font-medium text-gray-700 mb-1'>お名前</legend>
  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
    <div>
      <label htmlFor='appointment-last-name' className='sr-only'>姓</label>
      <input
        id='appointment-last-name'
        type='text'
        required
        value={formData.lastName}
        onChange={e => handleInputChange('lastName', e.target.value)}
        placeholder='姓 (例: 山田)'
      />
    </div>
    <div>
      <label htmlFor='appointment-first-name' className='sr-only'>名</label>
      <input
        id='appointment-first-name'
        type='text'
        required
        value={formData.firstName}
        onChange={e => handleInputChange('firstName', e.target.value)}
        placeholder='名 (例: 太郎)'
      />
    </div>
  </div>
</fieldset>
```

### このフェーズで直すべき項目

- `来店日`
- `開始時間`
- `終了時間`
- `担当スタッフ / 担当・設備`
- `メニュー`
- `オプション`
- `電話番号`
- `お名前`
- `カスタム属性`
- `メモ`
- `カラー`

### 期待効果

- warning 数が大きく減る
- クリックしやすくなる
- フォームの構造が整理される
- 予約画面の UX 改善と一致

---

## 優先順位A: 予約ブロックの keyboard 対応

### 対象

- `src/app/reservations/components/AppointmentBlock.tsx`

### 問題

`div` に `onClick` と `draggable` が付いているが、キーボード操作対応がありません。

### 修正方針

`div` を維持するなら、最低限以下を付与します。

```tsx
const handleActivate = () => onClick(appointment);

const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    handleActivate();
  }
};

<div
  draggable
  role='button'
  tabIndex={0}
  aria-label={`${appointment.title} ${timeString}`}
  onDragStart={handleDragStart}
  onClick={e => {
    e.stopPropagation();
    handleActivate();
  }}
  onKeyDown={handleKeyDown}
>
```

### 判断

理想は「ドラッグ」と「詳細表示」を別UIに分離することです。
ただし今はそこまでやらず、**アクセシビリティと操作可能性を最低限担保**する方がコスパが高いです。

---

## 優先順位A: `any` の除去（フォーム境界から着手）

### 対象

- `src/app/reservations/components/AppointmentEditForm.tsx`
- `src/app/reservations/components/AppointmentForm.tsx`
- `src/app/login/page.tsx`

### 問題

フォーム系で `any` が使われており、型安全が崩れています。

### 修正方針1: `AppointmentEditForm.tsx`

**現状の問題**

```tsx
onChange: (field: keyof Appointment, value: any) => void;
```

**修正案**

```tsx
onChange: <K extends keyof Appointment>(
  field: K,
  value: Appointment[K]
) => void;
```

### 修正方針2: `AppointmentForm.tsx`

フォーム専用の draft 型を切ります。

```tsx
type AppointmentDraft = {
  resourceId: string;
  lastName: string;
  firstName: string;
  date: string;
  startHour: number;
  startMinute: number;
  menuId: string;
  optionId: string;
  phone: string;
  type: 'normal';
  customAttributes: Record<string, string>;
};
```

```tsx
const [formData, setFormData] = useState<AppointmentDraft>(...);

const handleInputChange = <K extends keyof AppointmentDraft>(
  field: K,
  value: AppointmentDraft[K]
) => {
  setFormData(prev => ({ ...prev, [field]: value }));
};
```

### 修正方針3: `login/page.tsx`

`catch (error: any)` は捨てて `safeParse` に寄せます。

```tsx
const validateClientSide = () => {
  const result = loginSchema.safeParse({ email, password });

  if (result.success) {
    setClientErrors({});
    return true;
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  setClientErrors({
    email: fieldErrors.email?.[0] ?? '',
    password: fieldErrors.password?.[0] ?? '',
  });

  return false;
};
```

### 判断

`any` は全廃ではなく、**フォーム境界・公開インターフェースから先に潰す**のが正解です。

---

## 優先順位B: hook dependency warning 修正

### 対象

- `src/hooks/useMasterData.ts`
- 他の `react-hooks/exhaustive-deps` 警告ファイル

### 問題

`useMemo` / `useEffect` の依存関係が render ごとに不安定になっている箇所があります。

### 具体例

`useMasterData.ts`

```tsx
const allItems = query.data?.items ?? [];
```

この `[]` は毎回新規生成されるため、memo の前提を壊しやすいです。

### 修正案

```tsx
const EMPTY_ITEMS: MasterDataItem[] = [];
const allItems = query.data?.items ?? EMPTY_ITEMS;
```

または

```tsx
const allItems = useMemo(
  () => query.data?.items ?? [],
  [query.data?.items]
);
```

### 判断

前者の定数化のほうが軽くて読みやすいです。

---

## 優先順位B: `no-console` の扱い整理

### 問題

`console` が広範囲に残っています。

### 判断

全部消す必要はありません。

#### 消すべきもの

- デバッグ残骸
- 本番で意味の薄い `console.log`
- 機密情報やユーザー情報を出しうるもの

#### 残してもいいもの

- 明確なエラー出力
- 一時的な切り分けログ（短命なら可）

### 推奨

- UI層: 基本削除
- サーバー/監視系: `logger` / Sentry へ寄せる

---

## 優先順位B: `unused-vars` は機械的に掃除

### 問題

未使用変数・未使用引数・未使用 import が散在しています。

### 方針

- 本当に不要なら削除
- 将来使う予定だけなら、今は予定ではなく不要コード
- 意図的に使わない引数は `_name` へ統一

### 例

```tsx
const handleSomething = (_event: Event) => {
  ...
};
```

---

## 優先順位B: ESLint 設定の正常化

### 対象

- `eslint.config.mjs`

### 問題

`build_errors.txt` では以下が出ています。

- `The Next.js plugin was not detected in your ESLint configuration`

現状は `FlatCompat` ベースで `plugin:@next/next/core-web-vitals` を読み込んでいますが、**Next が期待する flat config の形とズレている可能性**があります。

### 修正方針

公式寄りの構成へ寄せます。

例:

```tsx
import nextVitals from 'eslint-config-next/core-web-vitals';
import js from '@eslint/js';

export default [
  ...nextVitals,
  js.configs.recommended,
  ...
];
```

### 判断

ルールをいじる前に、**lint 基盤の検出状態を正常化**した方がよいです。

---

## 優先順位C: Supabase auth helper の負債回収

### 対象

- `package.json`
- 認証関連コード

### 問題

以下が共存しています。

- `@supabase/auth-helpers-nextjs`
- `@supabase/ssr`

これは移行途中の状態です。

### 方針

- 新規実装は `@supabase/ssr` に統一
- 旧 helper を参照している import を洗い出す
- 認証ユーティリティを一本化する

### 判断

今すぐ最優先ではないが、認証層なので後回しにしすぎないこと。

---

## ファイル別の着手順

### Sprint 1

- `src/app/reservations/components/AppointmentEditForm.tsx`
- `src/app/reservations/components/AppointmentForm.tsx`
- `src/app/reservations/components/AppointmentBlock.tsx`

### Sprint 2

- `src/app/login/page.tsx`
- `src/hooks/useMasterData.ts`
- `src/app/reservations/components/AppointmentDetail.tsx`
- `src/app/reservations/components/AppointmentSummary.tsx`
- `src/app/reservations/components/NotificationsModal.tsx`

### Sprint 3

- `eslint.config.mjs`
- `package.json`
- 認証関連の helper 移行

---

## 最小実行手順

### 1. 予約フォーム系の a11y を直す

- label → htmlFor/id
- 複合入力 → fieldset/legend
- その場で動作確認

### 2. 予約ブロックの keyboard 操作を追加

- role='button'
- tabIndex={0}
- onKeyDown 実装

### 3. login の `any` を `safeParse` に置換

- ついでに label 接続も直す

### 4. unstable dependency を1本ずつ潰す

- `EMPTY_ITEMS` のような安定参照定数を導入

### 5. lint 再実行

```bash
pnpm lint:check
```

---

## 成果判定

この修正が成功したとみなせる状態:

- 予約フォーム系の `label-has-associated-control` が大幅減少
- 予約ブロック系の `click-events-have-key-events` が解消
- `Appointment*` 系から `any` が減る
- `useMasterData.ts` の memo warning が消える
- Next.js plugin 検出 warning の扱い方針が明確になる

---

## やらないこと

- warning 95件を1件ずつバラバラに潰す
- UI改善と無関係な細部から入る
- 全 `console` を思想的に全廃する
- `any` を全域で一気に消そうとして速度を落とす

---

## 最終判断

この warning 群は「壊れている」のではなく、**設計の雑さが局所でなく面で広がっている状態**です。

だから対処法も同じで、1件ずつではなく**修正パターンを定義して面で潰す**べきです。

最初の一手は予約画面です。
それが最も warning 削減効率が高く、UI/UX 改善にも直接効きます。
