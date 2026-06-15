# Therapist UI/UX Slimming Spec v0.2

- Status: draft
- Date: 2026-06-15
- File: `docs/stabilization/spec-therapist-uiux-slimming-v0.2.md`
- Target repository: `IFs1991/seikotsuin_no_saas`
- Feature: therapist（施術者）ロール向けの導線スリム化
- Primary goal:
  - therapist はログイン直後に予約管理へ遷移する
  - therapist には経営・分析系メニューを表示しない
  - desktop / mobile / header home 導線で体験を揃える
- Related specs:
  - `spec-manager-admin-section-v0.1.md`
  - `spec-auth-role-alignment-v0.1.md`

---

## 0. Background / Problem Statement

therapist（施術者）は現状、専用のナビゲーション分岐を持たない。

`getVisibleNavigationItems()` / `getOperationMenuItemsForRole()` のロジック上、therapist は HQ admin / area manager / clinic admin のいずれでもないため、実質的に通常の `OPERATION_MENU_ITEMS` をフルで受け取る。

その結果、therapist にとって不要な以下の導線が表示される。

- ダッシュボード
- 患者分析
- 収益分析
- スタッフ分析
- AI分析
- 収益レポート系 quick access
- mobile bottom nav 上の患者 / 収益 / AI 導線

これは現場ロールの UI としてノイズが多い。

therapist の主要ユースケースは、経営状況の分析ではなく、以下である。

1. 自分または所属院の予約・スケジュール確認
2. 必要に応じた予約登録・編集
3. 日報入力・確認
4. 希望シフト提出
5. 予約詳細から患者情報を参照

したがって therapist のホームは `/dashboard` ではなく `/reservations` とする。

---

## 1. Current Facts from Repository

### 1.1 Desktop / side navigation

`OPERATION_MENU_ITEMS` は以下を含む。

| id | label | therapist での扱い |
|---|---|---|
| `dashboard` | ダッシュボード | 非表示 |
| `daily-reports` | 日報管理 | 表示 |
| `reservations` | 予約管理 | 表示・ホーム扱い |
| `patients` | 患者分析 | 非表示 |
| `revenue` | 収益分析 | 非表示 |
| `staff` | スタッフ分析 | 非表示 |
| `shift-requests` | 希望シフト | 表示 |
| `ai-insights` | AI分析 | 非表示 |

現状 `getOperationMenuItemsForRole()` は manager 系のみ特別扱いし、therapist 専用分岐を持たない。

### 1.2 Quick access

`QUICK_ACCESS_ITEMS` は以下を含む。

- 日報入力
- 新規予約
- 患者検索
- 収益レポート

現状 therapist 専用分岐がないため、therapist にも患者検索・収益レポートが表示される。

### 1.3 Login redirect

`clinicLogin()` は現状、概ね以下の順で redirect する。

1. HQ admin → `/admin`
2. area manager → `/manager`
3. `clinic_id` なし → `/onboarding`
4. その他 → `/dashboard`

therapist は最後の「その他」に含まれるため `/dashboard` に遷移する。

### 1.4 Patient access path

予約詳細 UI には既に以下がある。

- `AppointmentDetail` から `/patients/${customerId}` への「患者詳細」リンク
- 同一患者の過去予約を表示する `AppointmentHistoryPanel`

したがって、患者専用メニューを therapist に表示しなくても、予約文脈から患者詳細へ到達する導線は既に存在する。

ただし、実装前に以下を必ず確認する。

- `/patients/[id]` の page / layout / middleware が therapist を弾かないこと
- `/api/customers` 系 API が therapist の所属 clinic scope 内で読めること
- RLS が therapist の clinic scope 内 customer read を許可していること

### 1.5 Mobile bottom nav

`mobile-bottom-nav.tsx` は desktop navigation とは別に固定リストを持つ。

現状の mobile nav には以下が含まれる。

- ホーム
- 日報
- 予約
- 患者
- 収益
- AI

therapist 専用分岐がないため、desktop 側だけをスリム化しても、mobile では患者 / 収益 / AI 導線が残る。

これは本仕様の目的と矛盾するため、v0.2 では mobile bottom nav も scope に含める。

### 1.6 Header / home link

Header / AppShell のロゴ・ホーム導線が `/` または `/dashboard` に固定されている場合、therapist が `/reservations` に redirect された後でも、ロゴクリックで dashboard 系導線に戻る可能性がある。

そのため、therapist の home href は `/reservations` に寄せる。

---

## 2. Summary

therapist ロールに専用の operation menu / quick access / mobile bottom nav / home href を割り当てる。

therapist の UI は「予約中心・経営分析非表示」に統一する。

- ログイン直後: `/reservations`
- Desktop side nav: `予約管理 / 日報管理 / 希望シフト`
- Quick access: `新規予約 / 日報入力`
- Mobile bottom nav: `予約 / 日報 / シフト`
- Header home href: `/reservations`
- 患者詳細: 予約詳細画面経由で到達
- 権限/RLS: 現状維持

---

## 3. Scope

### 3.1 In scope

1. `isTherapistRole()` helper の追加
2. therapist 専用 desktop operation menu の追加
3. `getOperationMenuItemsForRole()` の therapist 分岐
4. `getVisibleNavigationItems()` の therapist 分岐
5. therapist 専用 quick access の追加
6. therapist の login redirect を `/reservations` に変更
7. mobile bottom nav の therapist 分岐
8. Header / AppShell の home href を therapist だけ `/reservations` に変更
9. 予約詳細 → 患者詳細導線が therapist で成立することの確認
10. 上記を固定する unit / integration test

### 3.2 Out of scope

- clinic_admin の現場オペレーション導線最適化
- 共有PC運用時の管理者メニュー簡易パスワードゲート
- 日報機能そのものの縮小・廃止
- therapist の DB 権限 / RLS / API 認可の縮小
- staff ロールのスリム化
- 予約 write 権限の削除

---

## 4. Role Policy

### 4.1 therapist の位置づけ

therapist は UI 上は「予約確認中心の軽量ロール」として扱う。

ただし、既存運用との互換性を優先し、所属 clinic scope 内での予約登録・編集権限は現状維持する。

つまり、本仕様の対象は「表示導線の整理」であり、「認可の縮小」ではない。

### 4.2 表示と認可の分離

メニュー非表示は UX の整理であって、セキュリティ境界ではない。

- UI: therapist には経営系メニューを見せない
- API / RLS: 従来どおり最後の砦として機能させる
- 直接 URL アクセス: 各 route / API / RLS の guard で制御する

---

## 5. Design

### 5.1 `isTherapistRole()` helper

`src/lib/constants/roles.ts` に helper を追加する。

```ts
export function isTherapistRole(role: unknown): boolean {
  return normalizeRole(role) === 'therapist';
}
```

既に role helper の置き場が別にある場合は既存設計に合わせる。

### 5.2 Therapist desktop operation menu

therapist には以下のみ表示する。

| order | id | label | reason |
|---:|---|---|---|
| 1 | `reservations` | 予約管理 | therapist の home |
| 2 | `daily-reports` | 日報管理 | 現場入力・確認用途 |
| 3 | `shift-requests` | 希望シフト | 施術者本人の希望提出用途 |

以下は非表示。

- `dashboard`
- `patients`
- `revenue`
- `staff`
- `ai-insights`

#### Important: order must be explicit

`OPERATION_MENU_ITEMS.filter(...)` だけで実装してはいけない。

現状 `OPERATION_MENU_ITEMS` は `daily-reports` が `reservations` より前にあるため、単純 filter では仕様どおりの順序にならない。

実装例:

```ts
const THERAPIST_OPERATION_MENU_ITEM_IDS = [
  'reservations',
  'daily-reports',
  'shift-requests',
] as const;

function pickNavigationItemsById(
  items: NavigationItem[],
  ids: readonly string[]
): NavigationItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is NavigationItem => Boolean(item));
}

export const THERAPIST_OPERATION_MENU_ITEMS = pickNavigationItemsById(
  OPERATION_MENU_ITEMS,
  THERAPIST_OPERATION_MENU_ITEM_IDS
);
```

### 5.3 AI insights handling

AI feature flag が ON でも、therapist には `ai-insights` を表示しない。

理由:

- AI分析は現状、経営・分析文脈の機能
- therapist の予約確認導線に混ぜると UI が肥大化する
- therapist 向け AI は別途「予約要約」「患者メモ補助」などの現場支援として設計すべき

### 5.4 `getOperationMenuItemsForRole(role)`

therapist を manager 系とは独立して判定する。

推奨順:

1. therapist
2. area manager
3. default

例:

```ts
export function getOperationMenuItemsForRole(role: unknown): NavigationItem[] {
  if (isTherapistRole(role)) {
    return THERAPIST_OPERATION_MENU_ITEMS;
  }

  if (isAreaManagerRole(role)) {
    return AREA_MANAGER_OPERATION_MENU_ITEMS;
  }

  return isAiInsightsEnabled()
    ? OPERATION_MENU_ITEMS
    : OPERATION_MENU_ITEMS_WITHOUT_AI;
}
```

### 5.5 `getVisibleNavigationItems(...)`

therapist は admin navigation を持たない。

`showAdminMenus = false` の operation menu 分岐で therapist 専用 menu が返ること。

期待:

```ts
getVisibleNavigationItems({
  role: 'therapist',
  isHqAdmin: false,
  showOperationMenus: true,
  showAdminMenus: false,
})
// => THERAPIST_OPERATION_MENU_ITEMS
```

### 5.6 Therapist quick access

therapist の quick access は最小化する。

表示するもの:

| id | label | href |
|---|---|---|
| `new-reservation` | 新規予約 | `/reservations/new` |
| `daily-report-input` | 日報入力 | `/daily-reports/new` または既存の日報入力 href |

非表示:

- 患者検索
- 収益レポート

理由:

- 患者情報は予約詳細経由に寄せる
- 収益レポートは経営者・管理者向け

実装例:

```ts
export const THERAPIST_QUICK_ACCESS_ITEMS = QUICK_ACCESS_ITEMS.filter((item) =>
  ['new-reservation', 'daily-report-input'].includes(item.id)
);
```

quick access の id が現コードと異なる場合は、既存 id に合わせる。

### 5.7 Login redirect

`src/app/(public)/login/actions.ts` の `clinicLogin()` に therapist 分岐を追加する。

既存順序は維持し、以下の位置に入れる。

1. HQ admin
2. area manager
3. no clinic
4. therapist
5. default

期待:

```ts
if (isTherapistRole(permissions?.role)) {
  await recordSuccessfulLogin(...);
  await updateLastLoginAt(...);
  revalidatePath('/', 'layout');
  redirect('/reservations');
}
```

#### Refactor note

現状 login action は `recordSuccessfulLogin` / `last_login_at` 更新 / `revalidatePath` が複数分岐で重複している。

今回の main scope は therapist redirect 追加だが、可能なら以下の helper に寄せる。

```ts
async function completeLoginAndRedirect(path: string) {
  await recordSuccessfulLogin(...);
  await updateLastLoginAt(...);
  revalidatePath('/', 'layout');
  redirect(path);
}
```

広範な変更になる場合は、helper 化は別 PR に分ける。

### 5.8 Patient access route

therapist には患者専用メニューを出さない。

患者情報の参照は以下に限定する。

```text
/reservations
  → AppointmentDetail
    → 患者詳細リンク
      → /patients/[id]
```

実装前に以下を確認する。

- `/patients/[id]` が therapist を明示的に拒否していない
- customer API が clinic scope で therapist に read を許可している
- RLS が therapist の clinic scope 内 customer read を許可している

弾かれる場合は、患者メニューを戻すのではなく、予約詳細経由の患者詳細到達だけを許可する方向で route guard / API guard を調整する。

### 5.9 Mobile bottom nav

`mobile-bottom-nav.tsx` に therapist 専用分岐を追加する。

therapist には以下のみ表示する。

| order | id | label | href |
|---:|---|---|---|
| 1 | `reservations` | 予約 | `/reservations` |
| 2 | `daily-reports` | 日報 | `/daily-reports` |
| 3 | `shift-requests` | シフト | `/staff/shift-requests` または既存 href |

非表示:

- ホーム
- 患者
- 収益
- AI

実装例:

```ts
const THERAPIST_MOBILE_ITEMS = [
  {
    id: 'reservations',
    label: '予約',
    href: '/reservations',
    icon: Calendar,
  },
  {
    id: 'daily-reports',
    label: '日報',
    href: '/daily-reports',
    icon: FileText,
  },
  {
    id: 'shift-requests',
    label: 'シフト',
    href: '/staff/shift-requests',
    icon: Users,
  },
] as const;
```

`shift-requests` の href は現コードの実ルートに合わせる。

#### Preferred direction

可能であれば、desktop navigation と mobile navigation の定義を将来的に統合する。

現状のように二重定義を続けると、今回のように role policy がズレる。

ただし、今回の scope では therapist 分岐追加まででよい。

### 5.10 Header / AppShell home href

Header / AppShell の logo click / home link が `/` または `/dashboard` に固定されている場合、therapist のみ `/reservations` にする。

実装方針:

```ts
function getHomeHrefForRole(role: unknown): string {
  return isTherapistRole(role) ? '/reservations' : '/';
}
```

もしくは既存の route resolver があるならそこへ統合する。

期待:

- therapist がロゴを押す → `/reservations`
- clinic_admin がロゴを押す → 既存挙動
- manager がロゴを押す → 既存挙動
- admin がロゴを押す → 既存挙動

---

## 6. Affected Files

| file | change |
|---|---|
| `src/lib/constants/roles.ts` | `isTherapistRole()` 追加 |
| `src/lib/navigation/items.ts` | therapist menu / quick access / resolver 分岐追加 |
| `src/app/(public)/login/actions.ts` | therapist redirect を `/reservations` に変更 |
| `src/components/layout/mobile-bottom-nav.tsx` | therapist 専用 mobile nav 追加 |
| `src/components/layout/header.tsx` | therapist home href を `/reservations` に変更 |
| `src/components/layout/app-shell.tsx` or equivalent | header に role / homeHref を渡す必要があれば変更 |
| `src/__tests__/lib/navigation-items.test.ts` | therapist menu / quick access tests |
| `src/__tests__/components/mobile-bottom-nav.test.tsx` | therapist mobile nav tests |
| `src/__tests__/components/header.test.tsx` | therapist home href tests |
| `src/__tests__/app/login-actions.test.ts` or equivalent | therapist redirect tests |
| patient route / API tests | therapist が予約詳細経由で患者詳細を読めることの確認 |

ファイル名は現リポジトリの実構成に合わせて調整する。

---

## 7. Test Plan

TDD で 1 ケースずつ進める。

### 7.1 Navigation unit tests

#### Case 1: therapist operation menu

`getOperationMenuItemsForRole('therapist')` は以下の id のみをこの順番で返す。

```ts
['reservations', 'daily-reports', 'shift-requests']
```

含んではいけない id:

```ts
[
  'dashboard',
  'patients',
  'revenue',
  'staff',
  'ai-insights',
]
```

#### Case 2: AI flag ON

AI flag が ON でも therapist menu に `ai-insights` が含まれない。

#### Case 3: visible navigation

`getVisibleNavigationItems(...)` に therapist context を渡すと、therapist operation menu のみ返る。

#### Case 4: reservations subItems preserved

therapist の `reservations` menu は既存 subItems を保持する。

想定:

- タイムライン
- 新規予約
- 予約一覧

実際の label / href は現コードに合わせる。

#### Case 5: daily reports subItems preserved

therapist の `daily-reports` menu は既存 subItems を保持する。

#### Case 6: regression for existing roles

以下の role は既存挙動から変えない。

- `admin`
- `clinic_admin`
- `manager`
- `staff`

### 7.2 Quick access tests

#### Case 7: therapist quick access

`getQuickAccessItemsForRole('therapist')` は以下のみを返す。

- 新規予約
- 日報入力

含んではいけないもの:

- 患者検索
- 収益レポート

#### Case 8: regression for other roles

`clinic_admin` / `staff` / `manager` の quick access は既存挙動から変えない。

### 7.3 Login redirect tests

#### Case 9: therapist redirect

`permissions.role = 'therapist'` のログイン成功時、`redirect('/reservations')` が呼ばれる。

#### Case 10: clinic_admin unchanged

`permissions.role = 'clinic_admin'` は既存どおり `/dashboard`。

#### Case 11: staff unchanged

`permissions.role = 'staff'` は既存どおり `/dashboard`。

#### Case 12: manager unchanged

area manager は既存どおり `/manager`。

#### Case 13: hq admin unchanged

HQ admin は既存どおり `/admin`。

#### Case 14: no clinic unchanged

clinic 未設定は既存どおり `/onboarding`。

### 7.4 Mobile bottom nav tests

#### Case 15: therapist mobile nav

therapist の mobile bottom nav は以下のみを表示する。

```ts
['reservations', 'daily-reports', 'shift-requests']
```

表示してはいけないもの:

```ts
['home', 'patients', 'revenue', 'ai']
```

#### Case 16: AI flag ON

AI flag が ON でも therapist mobile nav に AI を表示しない。

#### Case 17: regression for admin / clinic_admin / staff

既存 role の mobile nav は既存挙動から変えない。

### 7.5 Header / home tests

#### Case 18: therapist home href

therapist が Header logo / home をクリックすると `/reservations` に遷移する。

#### Case 19: non-therapist home unchanged

clinic_admin / staff / manager / admin の home href は既存挙動のまま。

### 7.6 Patient access tests

#### Case 20: therapist can open patient detail from appointment detail

前提:

- therapist user
- same clinic の appointment
- appointment に `customerId` が存在する

期待:

- `AppointmentDetail` に患者詳細リンクが表示される
- `/patients/[id]` へ到達できる
- customer API が 200 を返す

#### Case 21: therapist cannot read cross-clinic patient

前提:

- therapist user
- different clinic の customer id

期待:

- API / RLS / route guard のいずれかで拒否
- 少なくとも UI 非表示だけに依存しない

---

## 8. Acceptance Criteria

### UX

- therapist はログイン直後に `/reservations` に着地する
- therapist の desktop nav には以下のみ表示される
  - 予約管理
  - 日報管理
  - 希望シフト
- therapist の quick access には以下のみ表示される
  - 新規予約
  - 日報入力
- therapist の mobile bottom nav には以下のみ表示される
  - 予約
  - 日報
  - シフト
- therapist が Header logo / home を押しても `/dashboard` に戻らない
- therapist は予約詳細から患者詳細へ到達できる

### Security / authorization

- therapist の DB/RLS/API 権限は本仕様では変更しない
- 経営系メニュー非表示を認可境界として扱わない
- cross-clinic customer access は従来どおり拒否される

### Regression

以下の role の既存挙動を壊さない。

- admin
- clinic_admin
- manager
- staff

---

## 9. Implementation Notes

### 9.1 Avoid filter-only ordering bug

therapist menu は `reservations` を最上段にする必要がある。

現行配列から単純 filter すると順序がズレるため、id list から明示順で pick する。

### 9.2 Do not remove therapist write permission

本仕様は「閲覧中心の UI」にするが、予約 write permission は維持する。

理由:

- 既存運用の互換性
- 現場で therapist が予約登録・修正する可能性
- 権限縮小は影響範囲が UI 変更より大きい

### 9.3 Do not expose patient search as a top-level therapist path

患者検索を top-level menu / quick access に戻すと、therapist UI が再び分析・管理寄りに膨らむ。

患者参照は予約詳細文脈に寄せる。

### 9.4 Mobile nav is not optional

mobile nav を後回しにすると、desktop と mobile で role policy が分裂する。

今回必ず含める。

---

## 10. Rollback

DB migration は不要。

rollback は以下を revert する。

- `isTherapistRole()` helper
- `THERAPIST_OPERATION_MENU_ITEMS`
- `THERAPIST_QUICK_ACCESS_ITEMS`
- `getOperationMenuItemsForRole()` therapist 分岐
- `getVisibleNavigationItems()` therapist 分岐
- `getQuickAccessItemsForRole()` therapist 分岐
- login redirect の therapist 分岐
- mobile bottom nav の therapist 分岐
- Header / AppShell home href の therapist 分岐
- 関連 tests

rollback 後は therapist は従来どおり `/dashboard` redirect / full operation menu 表示に戻る。

---

## 11. Follow-up Candidates

### 11.1 clinic_admin 現場導線最適化

共有 PC では clinic_admin アカウントで現場入力されることが多い。

clinic_admin についても将来的には以下を検討する。

- 予約
- 日報
- 患者
- 管理メニューを奥に畳む
- 管理メニュー簡易 password gate

ただし therapist とは目的が違うため、本仕様には混ぜない。

### 11.2 therapist 向け AI

現在の AI分析は経営分析寄りなので非表示にする。

将来的に therapist 向け AI を作るなら、以下のような現場支援に限定する。

- 今日の予約要約
- 患者メモ要約
- 前回施術内容の要点表示
- 注意事項の抽出
- 次回来院提案文の下書き

### 11.3 staff role slimming

staff も therapist と同様にスリム化すべき可能性がある。

ただし staff の運用実態が未確定なら、今回は現状維持。

---

## 12. Codex Implementation Prompt

```md
You are working in `IFs1991/seikotsuin_no_saas`.

Implement `docs/stabilization/spec-therapist-uiux-slimming-v0.2.md`.

Goal:
- therapist users should land on `/reservations` after login.
- therapist desktop navigation should only show:
  1. reservations
  2. daily-reports
  3. shift-requests
- therapist quick access should only show:
  - new reservation
  - daily report input
- therapist mobile bottom nav should only show:
  1. reservations
  2. daily-reports
  3. shift-requests
- therapist header/home link should resolve to `/reservations`.
- Do not change DB schema, RLS, or reservation write permissions.
- Do not change behavior for admin, clinic_admin, manager, or staff.

Important constraints:
- Add `isTherapistRole()` using `normalizeRole(role) === 'therapist'`.
- Do not build therapist menu with filter-only if it preserves the wrong order.
- AI insights must never appear for therapist, even when AI feature flag is enabled.
- Patient top-level menu/search should remain hidden for therapist.
- Therapist should still be able to reach `/patients/[id]` from `AppointmentDetail` for same-clinic appointments.
- Add tests before implementation where practical.

Suggested test coverage:
1. therapist operation menu ids are exactly:
   `['reservations', 'daily-reports', 'shift-requests']`
2. therapist operation menu excludes:
   `dashboard`, `patients`, `revenue`, `staff`, `ai-insights`
3. AI flag ON still excludes `ai-insights` for therapist
4. reservation subItems are preserved
5. therapist quick access excludes patient search and revenue report
6. therapist login redirects to `/reservations`
7. clinic_admin / staff / manager / admin redirects are unchanged
8. therapist mobile bottom nav shows only reservations / daily-reports / shift-requests
9. therapist header home href is `/reservations`
10. non-therapist header home behavior is unchanged
11. therapist can open same-clinic patient detail from appointment detail
12. therapist cannot read cross-clinic customer data

Keep the change small and role-scoped.
```

---

## 13. Final Decision

Implement this as v0.2.

v0.1 のままだと desktop だけスリム化され、mobile / header home から経営系導線に戻る穴が残る。

v0.2 では以下を同時に潰す。

- desktop nav
- quick access
- login redirect
- mobile bottom nav
- header home href
- patient detail access verification

この粒度なら小さく、DB 変更もなく、rollback も容易。
