# Manager Dashboard 過不足補完仕様書 v3

作成日: 2026-06-14  
対象: `manager` role 向け `/dashboard`  
方針: **migration-free / read-only command center**  
更新理由: レビュー指摘反映 + リポジトリ再精査セルフレビュー版

---

## 0. v2での重要修正

レビュー指摘を受け、v1から以下を修正する。

### 修正必須

1. **比較率表示の100倍スケールを維持する**
   - 実データの変化率は `0.123 = 12.3%` の比率値。
   - 表示時は必ず `value * 100` する。
   - v1の `formatComparisonText()` 例は誤り。使用しない。

2. **`cancellationRate` と比較値を同じ formatter で扱わない**
   - `cancellationRate === null` は「比較不能」ではなく「実績なし」。
   - `比較データなし` は、前日比・前週同曜日比などの comparison 系に限定する。

3. **ClinicCard の実型に合わせる**
   - `reportStatus` ではなく `dailyReportStatus` を使う。
   - `links.reports` ではなく `links.dailyReports` を使う。
   - 日報件数は `summary.submittedDailyReportCount` / `summary.missingDailyReportCount` / `summary.needsReviewCount` を優先する。

4. **予約0件 alert の severity は baseline 有無で分岐する**
   - 前週同曜日の予約数がある院で本日0件なら `critical`。
   - 前週同曜日も0件または比較不能なら `warning`。
   - 既存の重大な `low_reservations` シグナルを弱めない。

5. **`/admin/users` shortcut は `/manager/staff` に差し替える**
   - `/manager/staff` が実在し、manager guard 済みである前提。
   - `/multi-store` は削除しない。

---

## 1. 要約

現在の manager dashboard は、パイロット投入可能な水準まで到達している。

ただし、日常運用画面として見ると、以下が不足している。

1. 日報提出状況が独立した管理パネルになっていない
2. 店舗カード単体で「正常 / 注意 / 緊急」が判断できない
3. 予約0件のような明確な異常の扱いが弱い
4. 比較不能時の表示が `-` に近く、初期導入時に壊れて見える
5. manager dashboard から `/admin/users` に飛ぶ shortcut は、ルート上は許可されているが、read-only command center の導線としては過剰で目的がズレやすい

本仕様では、DBマイグレーションを一切追加せず、既存API・既存テーブル・既存型を活かして、manager dashboard の完成感を 80〜85% から 90%超へ引き上げる。

---

## 2. 前提

### 2.1 対象ユーザー

- `manager`
- 複数院を横断して見るエリアマネージャー / 本部寄り管理者
- 日々の入力者ではなく、異常検知と介入判断をするユーザー

### 2.2 非対象ユーザー

- `admin`
- `clinic_admin`
- `staff`
- `therapist`
- `customer`

### 2.3 ハード制約

本仕様では以下を禁止する。

- Supabase migration 追加
- 新規テーブル追加
- 新規カラム追加
- RLS policy 追加/変更
- DB function / RPC 追加
- 通知・タスク・メモ・承認などの保存系機能追加
- 新しい詳細ページの追加

### 2.4 設計思想

manager dashboard は「入力する画面」ではなく、**日次の司令塔**である。

答えるべき問いは以下。

1. 今日、どの院を見るべきか
2. どの院の日報が未提出・要確認か
3. どの院が正常で、どの院が注意・緊急か
4. 次にどの既存詳細画面へ飛べばよいか

---

## 3. 現状評価

### 3.1 できていること

- `manager` 専用 dashboard 分岐がある
- `GET /api/manager/dashboard` がある
- 担当院スコープを server-side で解決している
- 新規 migration なしで既存データを集約している
- summary KPI がある
- attention items がある
- clinic cards がある
- timeline がある
- shortcuts がある
- manager 向け `/manager/staff` route が存在する
- `/multi-store` は manager にとって有効な分析導線である

### 3.2 不足

| 項目 | 現状 | 問題 |
|---|---|---|
| 日報提出状況 | KPIと店舗カードに分散 | 未提出院・要確認院を一覧で判断しづらい |
| 店舗状態 | attentionItems を見れば分かる | 店舗カード単体で正常/注意/緊急が判断できない |
| 予約0件 | 低予約数 alert と競合し得る | baseline ありの予約0件を弱く扱うと重大異常を見落とす |
| 比較不能表示 | `-` など | 初期導入時に壊れて見える |
| shortcut | `/admin/users` あり | 現mainではmanagerもアクセス可能。ただし権限管理・作成系を含むため、read-only dashboard の導線としては過剰/目的ズレ |

### 3.3 過剰または優先度低

- timeline は残してよいが主役ではない
- task / memo / notification / approval は不要
- AIコメントは不要
- KPIカスタムや widget 配置は不要

---

## 4. 実装対象 P0: Daily Report Status Panel

### 4.1 目的

manager が日報提出状況を一目で把握できるようにする。

現在は日報状況が summary KPI と clinic card に分散しているため、未提出院・要確認院の一覧性が弱い。

### 4.2 配置

`ManagerDashboard` 内で以下の順序にする。

1. Summary KPI
2. **Daily Report Status Panel** ← 追加
3. Attention Section
4. Clinic Cards
5. Timeline
6. Shortcuts

### 4.3 表示内容

```txt
日報提出状況
- 提出済み: N院
- 要確認: N院
- 未提出: N院

未提出院
- 渋谷院
- 新宿院

要確認院
- 池袋院
- 横浜院
```

### 4.4 データソース

API shape は原則変更しない。

件数は既存の summary を優先して使う。

```ts
data.summary.submittedDailyReportCount
data.summary.missingDailyReportCount
data.summary.needsReviewCount
```

院名リストは `data.clinicCards` から導出する。

実型に合わせて以下を使う。

```ts
type ManagerDashboardClinicCard = {
  clinicId: string
  clinicName: string
  dailyReportStatus: 'submitted' | 'needs_review' | 'missing'
  links: {
    dailyReports: string
  }
}
```

注意:

- `reportStatus` という仮名を使わない。
- `links.reports` という仮名を使わない。
- 実装時は既存の `src/types/manager-dashboard.ts` の型を正とする。

### 4.5 UI要件

- submitted / needs_review / missing を明確に分ける
- missing と needs_review はクリック可能にする
- クリック先は `card.links.dailyReports`
- 0件の場合は空状態を出す

例:

```txt
未提出の日報はありません
要確認の日報はありません
```

### 4.6 KPIとの重複整理

Summary KPI に既に「日報提出状況」がある場合は、以下のどちらかにする。

#### 推奨: KPIは残す

- KPI: 全体の提出率を一目で見せる
- Panel: 未提出院/要確認院の具体名を見せる

つまり役割を分ける。

#### 非推奨: KPI削除

日報は整骨院本部にとって管理価値が高いため、KPIから完全に消す必要はない。

### 4.7 受け入れ条件

- 担当院が0件でもクラッシュしない
- summary 件数と panel 件数が矛盾しない
- 未提出院のみ一覧表示される
- 要確認院のみ一覧表示される
- migration が追加されていない
- API shape が過剰に変更されていない

---

## 5. 実装対象 P0: Clinic Health Badge

### 5.1 目的

各店舗カード単体で、manager が状態を判断できるようにする。

現在は attention items を見れば異常は分かるが、店舗カードだけを見ると、その院が正常か注意か緊急かが分かりにくい。

### 5.2 表示ラベル

| 表示 | 内部値 | 条件 |
|---|---|---|
| 緊急 | `critical` | clinic に critical attention item が1件以上ある |
| 注意 | `warning` | clinic に warning attention item が1件以上あり、critical がない |
| 正常 | `normal` | clinic に attention item がない |

### 5.3 導出方法

`data.attentionItems` を `clinicId` ごとに集約して UI 側で導出する。

DB保存しない。  
API shape を変えず、component 内で完結させる。

```ts
type ClinicHealthStatus = 'critical' | 'warning' | 'normal'

function getClinicHealthStatus(
  clinicId: string,
  attentionItems: ManagerDashboardAttentionItem[],
): ClinicHealthStatus {
  const items = attentionItems.filter((item) => item.clinicId === clinicId)
  if (items.some((item) => item.severity === 'critical')) return 'critical'
  if (items.some((item) => item.severity === 'warning')) return 'warning'
  return 'normal'
}
```

### 5.4 UI要件

店舗カード上部、院名の近くに health badge を表示する。

例:

```txt
渋谷院    緊急
新宿院    注意
池袋院    正常
```

既存の `dailyReportStatus` badge との棲み分け:

- health badge: 店舗全体の状態
- daily report badge: 日報提出状態

同じ header に2つ並べる場合、視覚的な主従をつける。

推奨:

```txt
[緊急] 渋谷院        日報: 未提出
```

または、日報状態を Daily Report Status Panel に寄せ、店舗カードでは health badge を主役にする。

### 5.5 受け入れ条件

- critical がある院は必ず「緊急」
- warning のみの院は「注意」
- attention item がない院は「正常」
- 状態は保存されない
- migration なし
- `dailyReportStatus` badge と意味が重複しすぎない

---

## 6. 実装対象 P1: Zero Reservation Attention

### 6.1 目的

本日の予約が0件の院を manager が見落とさないようにする。

予約0件は、前週比や前日比では拾えない場合がある。  
特に比較元も0件の場合、変化率が `null` になり alert が出ない。

ただし、前週同曜日に予約実績がある院で本日0件の場合は、既存の `low_reservations` critical 相当の重大異常として扱うべきである。

### 6.2 判定条件

```ts
todayReservationCount === 0
```

### 6.3 severity

severity は baseline 有無で分岐する。

```ts
if (todayReservationCount === 0 && previousWeekdayReservationCount > 0) {
  severity = 'critical'
} else if (todayReservationCount === 0) {
  severity = 'warning'
}
```

理由:

- 前週同曜日に予約があった院で本日0件なら、予約システム障害・入力漏れ・営業異常の可能性が高い
- 前週同曜日も0件なら、定休日・休診日・開業前・データ未整備の可能性がある
- 既存の重大な `low_reservations` シグナルを warning に弱めない

### 6.4 表示内容

```txt
本日の予約がまだありません
{clinicName} の本日の予約がまだ登録されていません。
```

severity に応じて UI 表示は以下。

| severity | 表示ニュアンス |
|---|---|
| critical | 緊急確認 |
| warning | 要確認 |

### 6.5 重複排除

同一 clinic に対して、以下が同時発火する場合は、予約0件 alert を優先する。

- zero reservation alert
- low reservation drop-rate alert

理由:

予約0件の方が具体的で分かりやすい。  
ただし、severity は §6.3 の baseline 分岐で決める。

### 6.6 attention type の扱い

実装方針は2択。

#### Option A: 既存 `low_reservations` type を再利用する

推奨。  
理由は型変更が少なく、timeline mapping の追加が不要なため。

注意:

- 同じ clinic で通常の低予約 alert と zero-reservation alert が重複しないようにする
- id 生成や dedup key が `type + clinicId` 相当の場合は、zero-reservation を優先する

#### Option B: `zero_reservations` type を新設する

型としては綺麗だが、影響範囲が増える。

新設する場合は必ず以下も更新する。

- `ManagerDashboardAttentionType`
- `ManagerDashboardTimelineType`
- `TIMELINE_TYPE_BY_ATTENTION_TYPE`
- timeline 変換ロジック
- 関連テスト

TypeScript strict で `Record<ManagerDashboardAttentionType, ...>` が網羅性を強制するため、未更新ならコンパイルエラーになる想定。

### 6.7 受け入れ条件

- 本日予約0件の clinic に alert が出る
- 前週同曜日の予約実績がある本日0件は `critical`
- 前週同曜日も0件、または比較不能なら `warning`
- 同じ clinic に低予約数 alert が重複しない
- 予約数が1件以上なら zero reservation alert は出ない
- migration なし

---

## 7. 実装対象 P1: Null Comparison Copy 改善

### 7.1 目的

比較不能なデータを `-` で表示すると、初期導入時に壊れて見える。

これを「比較データなし」と明示して、プロダクトの信頼感を上げる。

### 7.2 重要な注意

変化率は **比率値** として扱う。

```txt
0.123  = +12.3%
-0.3   = -30.0%
```

表示時は必ず `value * 100` する。

v1のような以下の実装は禁止。

```ts
// NG: -0.3 を -0.3% と表示してしまう
return `${value.toFixed(1)}%`
```

### 7.3 対象範囲

`比較データなし` を出す対象は comparison 系のみ。

対象例:

- `revenueChangeRateFromPreviousDay`
- `reservationChangeRateFromPreviousWeekday`
- 今後追加する `salesVsPreviousWeekSameDayRate`
- 今後追加する `visitsVsPreviousWeekSameDayRate`

対象外:

- `cancellationRate`
- `reportSubmissionRate`
- その他、比較ではない実績率

`cancellationRate === null` は「比較データなし」ではなく、以下のどちらか。

```txt
実績なし
-
```

推奨は `実績なし`。

### 7.4 実装方針

既存の `formatPercent` が `value * 100` している場合、数値計算は壊さない。

推奨は helper を分ける。

```ts
function formatRatePercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}%`
}

function formatComparisonPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '比較データなし'
  }
  const sign = value >= 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}%`
}

function formatActualRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '実績なし'
  }
  return `${(value * 100).toFixed(1)}%`
}
```

注意:

- `formatComparisonPercent` を `cancellationRate` に使わない。
- `formatActualRate` は符号を付けない。
- 既存UIで `+0.0%` 表示をしている場合は、符号ルールを既存に合わせる。原則 `value >= 0 ? '+' : ''` を維持する。

### 7.5 受け入れ条件

- `-0.3` が `-30.0%` と表示される
- `0.123` が `+12.3%` と表示される
- comparison null が `比較データなし` になる
- `cancellationRate` null が `比較データなし` にならない
- 既存の数値表示を壊さない

---

## 8. 実装対象 P1: Shortcuts Review

### 8.1 目的

manager dashboard から read-only command center の意図に合わない遷移を消す。

`/admin/users` は現mainでは manager にもアクセス可能な admin route として扱われている。  
ただし画面実体はアカウント・権限管理であり、作成/更新/権限付与/権限解除などの write 系導線を含む。manager dashboard を read-only command center として保つなら、ショートカット先としては `/manager/staff` の方が安全で意図が明確である。

つまり、これはアクセス不能バグではなく、**プロダクト意図と導線設計の問題**として扱う。

### 8.2 方針

`スタッフ管理` shortcut は削除ではなく、以下へ差し替える。

```txt
/manager/staff
```

表示名は以下のどちらか。

```txt
スタッフ管理
担当院スタッフ
```

推奨は `担当院スタッフ`。

### 8.3 残す shortcut

現状の有効な manager 導線は残す。

残す:

- 日報
- 予約
- 売上分析
- 患者分析
- 店舗比較分析: `/multi-store`
- 担当院スタッフ: `/manager/staff`

追加候補:

- シフト申請/シフト確認: `/manager/shift-requests`

ただし、シフト導線追加は今回の必須ではない。  
今回の必須 scope は **`/admin/users` の差し替え** に限定する。

### 8.4 受け入れ条件

- manager dashboard に `/admin/users` shortcut が出ない
- `スタッフ管理` または `担当院スタッフ` が `/manager/staff` に飛ぶ
- `/multi-store` は削除されない
- 存在しない route に飛ばさない
- manager がアクセスできない route に飛ばさない

---

## 9. 実装対象 P2: Timeline の優先度調整

### 9.1 目的

timeline は有用だが、manager dashboard の主役ではない。

主役は以下。

1. 日報提出状況
2. 要確認院
3. 店舗状態

### 9.2 方針

- timeline は残してよい
- 初期表示は最新5件程度
- 長くなる場合は折りたたみ/展開
- attention section より上には置かない

### 9.3 受け入れ条件

- timeline が画面の主役にならない
- 担当院数が多くても縦に伸びすぎない

---

## 10. 非目標

以下は今回やらない。

```txt
- manager task management
- manager notes
- notifications
- approval workflow
- comments
- AI-generated recommendations
- custom KPI storage
- widget customization
- new detail pages
- new migrations
```

理由:

- 保存系機能は schema 変更を誘発する
- 初期導入で仕様がズレやすい
- manager dashboard の価値は入力ではなく異常検知にある

---

## 11. 実装対象ファイル

想定対象:

```txt
src/components/dashboard/manager-dashboard.tsx
src/lib/manager-dashboard.ts
src/app/api/manager/dashboard/route.ts
src/types/manager-dashboard.ts
```

テスト対象:

```txt
src/lib/__tests__/manager-dashboard.test.ts
src/components/dashboard/manager-dashboard.test.tsx
src/app/api/manager/dashboard/route.test.ts
```

ただし、API shape を変えずに UI 側で導出できるものは UI 側で完結する。

---

## 12. 実装順序

### Step 1: Shortcuts Review

先に dashboard の意図からズレる導線を直す。

- `/admin/users` shortcut を `/manager/staff` に差し替え
- `/multi-store` は残す
- `/manager/shift-requests` 追加は任意

理由:

- 影響範囲が小さい
- デモ時に権限管理画面へ迷い込む事故を即座に減らせる
- テストも安い

### Step 2: Daily Report Status Panel

- summary 件数を利用
- `clinicCards` から `dailyReportStatus` 別に group
- submitted / needs_review / missing を算出
- dashboard に専用 section を追加

### Step 3: Clinic Health Badge

- `attentionItems` を clinicId ごとに集約
- clinic card に health badge を表示
- `dailyReportStatus` badge との表示重複を調整

### Step 4: Zero Reservation Attention

- `generateAttentionItems()` に rule 追加
- baseline 有無で severity 分岐
- low reservation alert と重複排除

### Step 5: Null Comparison Copy

- comparison 用 formatter と actual rate 用 formatter を分ける
- `value * 100` を維持
- `cancellationRate` に `比較データなし` を出さない

### Step 6: Tests

- shortcut 差し替え
- daily report panel grouping
- clinic health badge
- zero reservation alert
- no duplicate low-reservation alert
- comparison formatter

---

## 13. テスト観点

### 13.1 Unit Test: zero reservation

#### baseline あり

```txt
Given todayReservationCount = 0
And previousWeekdayReservationCount > 0
When generateAttentionItems is called
Then critical alert "本日の予約がまだありません" is returned
And low-reservation drop alert is not duplicated for the same clinic
```

#### baseline なし

```txt
Given todayReservationCount = 0
And previousWeekdayReservationCount = 0 or null
When generateAttentionItems is called
Then warning alert "本日の予約がまだありません" is returned
```

#### 予約あり

```txt
Given todayReservationCount > 0
When generateAttentionItems is called
Then zero-reservation alert is not returned
```

### 13.2 Unit Test: clinic health

```txt
Given clinic has critical item
Then health = critical

Given clinic has only warning item
Then health = warning

Given clinic has no item
Then health = normal
```

### 13.3 Component Test: report panel

fixture に以下を含める。

```txt
submitted clinic
needs_review clinic
missing clinic
```

期待:

```txt
submitted / needs_review / missing の件数と院名リストが正しく表示される
```

### 13.4 Component Test: shortcuts

```txt
ManagerDashboard should not render href="/admin/users"
ManagerDashboard should render href="/manager/staff"
ManagerDashboard should still render href="/multi-store"
```

### 13.5 Formatter Test

```txt
formatComparisonPercent(-0.3) => "-30.0%"
formatComparisonPercent(0.123) => "+12.3%"
formatComparisonPercent(null) => "比較データなし"
formatActualRate(null) => "実績なし" or "-"
```

### 13.6 Role / Access Test

既存 route test がある場合は重複しすぎない範囲で確認する。

```txt
manager can access /dashboard and see ManagerDashboard
clinic_admin cannot see ManagerDashboard
admin uses /admin, not ManagerDashboard
```

---

## 14. 完了条件 Definition of Done

- [ ] migration が追加されていない
- [ ] manager dashboard が read-only のまま
- [ ] manager dashboard の `/admin/users` shortcut が `/manager/staff` に置換されている
- [ ] `/multi-store` shortcut が残っている
- [ ] Daily Report Status Panel が追加されている
- [ ] panel が `dailyReportStatus` / `links.dailyReports` を使っている
- [ ] Clinic Health Badge が追加されている
- [ ] 予約0件 alert が出る
- [ ] 前週同曜日予約あり + 本日0件は `critical`
- [ ] 前週同曜日予約なし/不明 + 本日0件は `warning`
- [ ] low reservation alert と重複しない
- [ ] comparison 表示で `value * 100` が維持されている
- [ ] `cancellationRate` null が `比較データなし` になっていない
- [ ] TypeScript strict で通る
- [ ] 既存の role guard を壊していない
- [ ] 担当院0件でもクラッシュしない
- [ ] 最低限のテストが追加/更新されている

---

## 15. Codex 用実装プロンプト v2

```md
# Goal

Improve the existing manager dashboard UX without adding migrations.

The manager dashboard should remain a read-only command center for area managers.
It should help the manager quickly identify which assigned clinics need attention today.

# Hard constraints

Do not add or modify Supabase migrations.
Do not add new tables, columns, RLS policies, database functions, or RPCs.
Do not add task management, notes, notifications, approvals, comments, AI recommendations, custom KPI storage, widget customization, or new detail pages.

# Files to inspect

- src/components/dashboard/manager-dashboard.tsx
- src/lib/manager-dashboard.ts
- src/app/api/manager/dashboard/route.ts
- src/types/manager-dashboard.ts
- existing tests around manager dashboard

# Important implementation notes

## Percent display

Change-rate values are ratios, not already-percent values.
For example:

- -0.3 means -30.0%
- 0.123 means +12.3%

Do not introduce a helper that renders value.toFixed(1) directly as a percent.
Always preserve value * 100 for percent display.

Do not use the comparison copy for cancellationRate.
When cancellationRate is null, show "実績なし" or "-", not "比較データなし".

## Current type names

Use the existing manager dashboard types.
In clinic cards, use:

- dailyReportStatus
- links.dailyReports

Do not invent reportStatus or links.reports.

# Required changes

## 1. Replace broken shortcut

Replace the manager dashboard shortcut that points to /admin/users.
Use /manager/staff instead.

Keep the /multi-store shortcut.
Do not delete it.

Optional: add /manager/shift-requests only if the route is safe and already exists.

## 2. Add Daily Report Status Panel

Add a dedicated Daily Report Status Panel to ManagerDashboard.
Place it after Summary KPI and before Attention Section.

It should show:

- submitted count
- needs review count
- missing count
- missing clinic list
- needs review clinic list

Use existing summary counts where available:

- summary.submittedDailyReportCount
- summary.needsReviewCount
- summary.missingDailyReportCount

Use data.clinicCards only to derive clinic name lists.
Use dailyReportStatus and links.dailyReports.
Avoid API shape changes unless necessary.

## 3. Add Clinic Health Badge

Each clinic card should display an overall health badge:

- 緊急: at least one critical attention item for the clinic
- 注意: at least one warning attention item and no critical item
- 正常: no attention items

Derive this from data.attentionItems by clinicId.
Do not persist this status.

Keep the meaning separate from the daily report status badge.

## 4. Add Zero Reservation Attention

In the manager dashboard attention generation logic, add an alert when today's reservation count is 0.

Text:

- title: 本日の予約がまだありません
- description: `${clinicName} の本日の予約がまだ登録されていません。`
- href: card.links.reservations

Severity:

- critical if previousWeekdayReservationCount > 0
- warning if previousWeekdayReservationCount is 0, null, or unavailable

Avoid duplicate low-reservation alerts for the same clinic.
If zero-reservation and low-reservation-drop both trigger, prefer zero-reservation while preserving the severity rule above.

Prefer reusing the existing low_reservations attention type unless a new type is clearly worth the extra type/timeline updates.
If a new zero_reservations type is added, update:

- ManagerDashboardAttentionType
- ManagerDashboardTimelineType
- TIMELINE_TYPE_BY_ATTENTION_TYPE
- tests

## 5. Improve null comparison copy

Where comparison values are null or unavailable, display:

- 比較データなし

Use compact "データなし" only where space is tight.
Do not show only "-" for missing comparison data.

Apply this only to comparison fields.
Do not apply it to cancellationRate or other actual-rate fields.

# Tests

Add or update tests for:

- no /admin/users shortcut is rendered
- /manager/staff shortcut is rendered
- /multi-store shortcut remains rendered
- daily report panel grouping and rendering
- clinic health badge rendering
- zero reservation attention item with baseline > 0 => critical
- zero reservation attention item with baseline 0/null => warning
- no duplicate low-reservation alert when reservation count is 0
- comparison formatter preserves value * 100
- cancellationRate null does not render "比較データなし"

# Quality

- Keep TypeScript strict-compatible
- Keep existing role guard behavior intact
- No hardcoded clinic IDs
- No mock data in production path
- Graceful empty state for no assigned clinics
- Graceful display for missing comparison data
```

---


---

## 16. リポジトリ精査後セルフレビュー

### 16.1 精査対象

2026-06-14時点の `main` 相当で、以下を再確認した。

```txt
src/components/dashboard/manager-dashboard.tsx
src/lib/manager-dashboard.ts
src/types/manager-dashboard.ts
src/app/api/manager/dashboard/route.ts
src/app/(app)/dashboard/page.tsx
src/app/(app)/manager/staff/page.tsx
src/app/(app)/manager/shift-requests/page.tsx
src/lib/admin/routes.ts
src/app/(app)/admin/(protected)/users/page.tsx
src/__tests__/lib/manager-dashboard.test.ts
src/__tests__/components/dashboard/manager-dashboard.test.tsx
src/__tests__/api/manager-dashboard-route.test.ts
```

### 16.2 仕様の妥当性チェック

| 項目 | 判定 | コメント |
|---|---|---|
| migration-free 方針 | OK | 現行の manager dashboard は既存 `daily_reports` / `daily_report_items` / `reservation_list_view` の集約で成立している。今回も追加DB不要。 |
| read-only command center 方針 | OK | UIは詳細導線中心で、書き込みボタンは現状テストでも禁止されている。 |
| Daily Report Status Panel | OK | API shape 変更なしで `summary` と `clinicCards` から導出可能。 |
| Clinic Health Badge | OK | `attentionItems` に `clinicId` と `severity` があるためUI導出で十分。 |
| Zero Reservation Attention | OK | `previousWeekdayReservationCount` は `ManagerDashboardClinicCard` に既に存在するため実装可能。 |
| Null Comparison Copy | OK。ただし実装注意 | 既存 `formatPercent` は `value * 100` を正しく行っているため、一括置換は禁止。comparison/actual rate を分けるべき。 |
| `/admin/users` shortcut 置換 | 方針OK。ただし理由修正 | 現mainでは manager も `/admin/users` にアクセス可能。リンク切れではない。ただし画面がアカウント・権限管理で重いため、dashboard shortcut としては `/manager/staff` の方が安全。 |
| `/multi-store` 維持 | OK | manager 向け分析導線として残すべき。 |
| `/manager/shift-requests` 追加 | Optionalのまま | route は実在し manager guard もある。ただし今回の必須scopeにはしない。 |

### 16.3 自分のv1/v2仕様の修正点

#### 修正1: `/admin/users` の評価を訂正

v2では `/admin/users` を「実質リンク切れ」と強めに扱ったが、現在の実装では正確ではない。

`src/lib/admin/routes.ts` では area manager がアクセスできる admin route prefix に `/admin/users` が含まれており、`shouldRedirectAreaManagerAdminHome()` も常に `false` を返す。そのため、少なくとも route guard レベルでは manager が `/admin/users` に入れる。

ただし、`/admin/users` の実体は「アカウント・権限管理」で、既存ユーザーへの権限付与、新規店舗ユーザー作成、権限更新、権限解除などの write 系導線を持つ。manager dashboard のショートカットは日次確認用であるべきなので、`/manager/staff` への置換方針は維持する。

**結論:** 置換は必要。ただし理由は「アクセス不能」ではなく「dashboard の意図と権限管理画面の重さが合わない」。

#### 修正2: Daily Report Status Panel の重複リスクを明記

日報は現在すでに以下の3箇所に出る可能性がある。

```txt
Summary KPI
Daily Report Status Panel
Clinic Card dailyReportStatus badge
```

三重表示自体は悪ではないが、視覚的な主従を決めないとノイズになる。

推奨:

```txt
Summary KPI: 全体率だけ
Daily Report Panel: 未提出/要確認の具体リスト
Clinic Card: 小さな状態補足。health badgeを主役にする
```

#### 修正3: Zero Reservation は定休日/休診日の誤検知に弱い

現schemaだけでは営業日・休診日を完全判定できない可能性がある。

そのため本仕様では、予約0件を保存系の重大イベントとして扱わず、あくまで dashboard 上の一時alert とする。

重要:

```txt
本日0件 + 前週同曜日>0件 => critical
本日0件 + 前週同曜日0件/不明 => warning
```

この分岐は妥当だが、将来的に営業カレンダーがあるならそちらを優先すべき。

#### 修正4: 売上比較の前週同曜日化は今回scope外

リポジトリ上、売上比較は `previousDay` の `daily_reports` を使っている。一方、予約比較は `previousWeekday` を使っている。

整骨院の業務特性だけ見れば売上も前週同曜日比が望ましい。しかし現在の API は daily reports を `previousDay`〜`today` で取得しているため、売上前週同曜日比を入れるには取得範囲・summary・テストの変更が増える。

今回の目的は「migration-freeで過不足を埋める」なので、売上比較の前週同曜日化は別タスクに分ける。

#### 修正5: Formatter テストは component test か export helper 化が必要

現状の `formatPercent` は `manager-dashboard.tsx` 内の非export helper。`formatComparisonPercent` / `formatActualRate` を追加しても非exportのままだと単体テストしづらい。

選択肢:

```txt
Option A: component test で表示文字列を検証する
Option B: formatter を小さな util に切り出して unit test する
```

推奨は Option A。今回の変更はUI表示目的であり、util分割は過剰になりやすい。

### 16.4 実装者への注意点

#### 注意1: `formatPercent` の一括置換は禁止

現状の `formatPercent` は comparison と actual rate の両方に使われている。

```txt
revenueChangeRateFromPreviousDay              => comparison
reservationChangeRateFromPreviousWeekday      => comparison
cancellationRate                              => actual rate
```

したがって、`formatPercent(null)` を単純に `比較データなし` に変えると、`cancellationRate` まで誤表示になる。

#### 注意2: `lowReservationClinicCount` の意味が変わる可能性

Zero Reservation を `low_reservations` として再利用すると、`summary.lowReservationClinicCount` との意味整合を考える必要がある。

現状の `lowReservationClinicCount` は `getDropSeverity(card.reservationChangeRateFromPreviousWeekday)` ベースで算出されている。Zero Reservation alert を追加しても summary 側を変えない場合、attention item 数と summary 件数がズレる可能性がある。

推奨:

```txt
今回のUIでは summary.lowReservationClinicCount を新規に主役化しない
Zero Reservation は attentionItems 側だけで扱う
summary の再定義は別タスクにする
```

#### 注意3: `zero_reservation` type新設は避ける

新typeを足すと `ManagerDashboardAttentionType` / `ManagerDashboardTimelineType` / `TIMELINE_TYPE_BY_ATTENTION_TYPE` / test の更新が必要になる。

今回は追加価値に対して影響範囲が大きい。

推奨:

```txt
既存 low_reservations を再利用
id は `${clinicId}:low_reservations` のまま
title/description で zero reservation を表現
通常の低予約alertは同clinicで出さない
```

### 16.5 最終セルフ評価

この仕様は実装ゴーでよい。

ただし、実装者へ渡すなら以下の補足を強調する。

```txt
1. /admin/users はアクセス不能ではない。dashboard shortcutとして置換するだけ。
2. formatPercent は一括変更しない。comparison/actual rate を分ける。
3. zero reservation は low_reservations type再利用が最小変更。
4. Daily Report Panel は追加するが、日報KPI/card badgeと視覚的に棲み分ける。
5. 売上前週同曜日比は今回やらない。
```

この5点を守れば、仕様は現リポジトリと整合している。

## 17. 最終判断

v1の方針は正しかったが、実装指示としては危険な曖昧さがあった。

特に以下は必ず守る。

```txt
比較率は value * 100 を維持する
cancellationRate と comparison を混ぜない
zero reservation は baseline 有無で severity を分ける
/admin/users は dashboard shortcut では /manager/staff に置換する
/multi-store は残す
実型は dailyReportStatus / links.dailyReports を使う
```

この v3 なら、migration-free のまま、実装事故の可能性をかなり下げられる。
