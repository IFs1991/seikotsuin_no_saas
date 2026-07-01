# Mobile UIUX 本番シェル分離・書き込みロールアウト仕様書 v0.1

作成日: 2026-07-01  
ステータス: **実装前仕様 / Draft**  
対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象領域: `/mobile-uiux` / `/mobile-uiux/screens/*` / `/api/mobile-uiux/*`  
優先度: **P0**（本番スマホ検証のブロッカー解消）

---

## 1. 要約

現状の Mobile UIUX は、認証済み Route Handler から `private-assets/mobile-uiux/*.dc.html` を配信し、`MOBILE_UIUX_REAL_DATA_ENABLED=true` のときに bridge script を注入して BFF API へ接続する構成である。

ただし、現在配信している `.dc.html` は **Design Component の確認用ステージ**をそのまま含んでいるため、実スマホで開くと次の構造になる。

```text
実スマホ画面
└── ブラウザ
    └── Design Component stage
        └── iPhone mock frame
            └── Mobile UI
```

これは開発確認・LP表示には有効だが、業務プロダクトとしては使えない。表示領域が縮み、実端末ステータスバー・ブラウザバー・モック端末枠が二重化し、Bottom Nav の操作性も落ちる。

本仕様では、**既存UI/UXデザインは変更せず**、Design Component の **preview chrome** だけを分離する。

- 本番スマホ: iPhone mock / stage controls / fake status bar / dynamic island を表示しない
- プレビュー: 既存の iPhone mock 表示を残す
- UI部品: 既存のカード、文字、色、余白、情報設計は原則変更しない
- 書き込み: 既存の mobile BFF write API を、本番段階的ロールアウトできる状態まで仕様化する
- SaaS化: `MOBILE_UIUX_ALLOWED_CLINIC_IDS` を恒久運用に使わず、DB feature entitlement へ移行する

---

## 2. 現状実装インベントリ

| 領域 | ファイル | 現状 |
|---|---|---|
| Mobile UIUX入口 | `src/app/(app)/mobile-uiux/page.tsx` | 認証・access gate 後、各 `.dc.html` 画面へのリンクを表示する確認用ページ |
| Static screen配信 | `src/app/(app)/mobile-uiux/screens/[resource]/route.ts` | `private-assets/mobile-uiux/*.dc.html` / JS を認証済み配信。HTMLには bridge script 注入あり |
| 静的資産 | `private-assets/mobile-uiux/*.dc.html` | Design Component の stage controls + iPhone mock + app UI を含む |
| 資産台帳 | `docs/stabilization/mobile-uiux-asset-manifest-v0.2.md` | private 配信・原本非変更・public配信なし方針 |
| Context API | `src/app/api/mobile-uiux/context/route.ts` | role / clinic scope / public flags / defaultClinicId を返す |
| Access gate | `src/lib/mobile-uiux/access.ts` | role allowlist + clinic scope + clinic allowlist で判定 |
| Flags | `src/lib/mobile-uiux/flags.ts` | global/read/write/category write flags と env allowlist を解釈 |
| Bridge manifest | `src/lib/mobile-uiux/bridge-manifest.ts` | screen→BFF endpoint対応、bridge script生成、read/write bridge関数を公開 |
| 予約BFF | `src/app/api/mobile-uiux/reservations/route.ts` | GET/POST/PATCH。writeは global + reservation flag で閉じる |
| 日報BFF | `src/app/api/mobile-uiux/daily-reports/route.ts` | GET/POST。writeは global + daily report flag で閉じる |
| 設定BFF | `src/app/api/mobile-uiux/settings/route.ts` | GET/PUT。writeは global + settings flag で閉じる。初回更新カテゴリ制限あり |
| 契約型 | `src/lib/mobile-uiux/contracts.ts` | context/read/write response型 |

---

## 3. 問題定義

### 3.1 本番表示の問題

現状は実スマホで `phone-in-phone` 表示になる。

原因は `.dc.html` の中に次が含まれているため。

- Stage controls: ロール・テーマ切替などの確認用UI
- iPhone mock frame: 幅390px / 高さ812px / 角丸 / 影 / ベゼル
- Fake device chrome: dynamic island / fake status bar
- App UI: 実際に使いたいモバイル画面本体

本番で必要なのは **App UIのみ**。ただし、UIデザイン自体を作り直す必要はない。

### 3.2 clinic allowlist の問題

`MOBILE_UIUX_ALLOWED_CLINIC_IDS` は本番βの安全弁としては有効だが、正式SaaS運用で clinic_id を Vercel env に追加し続ける設計は破綻する。

本番SaaSでは以下を分離する。

```text
1. Auth             = 誰か
2. Role             = 何ができるか
3. Clinic Scope     = どのclinic/orgに属するか
4. Feature Entitlement = そのclinic/orgがMobile UIUXを使える契約・設定か
5. Rollout Gate     = 一時的な全体/限定開放
```

現状の `MOBILE_UIUX_ALLOWED_CLINIC_IDS` は 5 の rollout gate であり、4 の entitlement として使い続けない。

### 3.3 書き込みの問題

既存BFFには以下の書き込み口がある。

- `POST /api/mobile-uiux/reservations`
- `PATCH /api/mobile-uiux/reservations`
- `POST /api/mobile-uiux/daily-reports`
- `PUT /api/mobile-uiux/settings`

ただし、現状は production env で write flags を false にする read-only rollout である。書き込みを本番化するには、API gate だけでなく、UIからの mutation導線、二重送信防止、失敗時表示、監査・ログ、rollback方針まで揃える必要がある。

---

## 4. 非交渉条件

### 4.1 UI/UXデザインは変更しない

本仕様で禁止する変更:

- カードデザインの作り直し
- 色・角丸・フォントサイズ・余白の再設計
- 情報設計の大幅変更
- 文言・ラベルの大幅変更
- 既存 `.dc.html` の原本破壊的変更

許可する変更:

- 本番routeで stage controls を出さない
- 本番routeで iPhone mock frame を出さない
- 本番routeで fake status bar / dynamic island を出さない
- 実スマホ viewport に app UI を直接載せる
- safe-area / browser chrome対策の wrapper CSS を追加する
- bridge script 連携に必要な `data-*` / non-visual hook を追加する

ここでいう「デザイン非変更」は、**モバイルアプリ本体のUIを変えない**という意味であり、preview用の端末枠を本番から外すことはデザイン変更ではなく **presentation shell の分離** と扱う。

### 4.2 認可は緩めない

- client-side表示制御だけで認可しない
- Route Handler / BFF の server-side gate を維持する
- clinic scope / tenant boundary を弱めない
- raw `clinic_id` / tenant情報 / patient PII を不要にログ・レスポンスへ出さない

### 4.3 writeは段階開放

- `MOBILE_UIUX_WRITE_ENABLED=true` だけで全writeを開けない
- category別 flag が true のものだけ開く
- 初回は reservation OR daily-report のどちらか1系統から開放する
- settings write は影響範囲が大きいため最後にする

---

## 5. 目標状態

### 5.1 本番スマホ表示

`/mobile-uiux/screens/home` を実スマホで開いたとき、以下になる。

```text
実スマホ画面
└── ブラウザ
    └── Mobile Production Shell
        └── App UI
```

表示されないもの:

- ロール/テーマ切替のstage controls
- iPhone mock bezel
- fake dynamic island
- fake status bar

表示されるもの:

- 既存の App Header
- KPIカード
- 要対応カード
- 予約/日報/設定などの既存画面本体
- Bottom Nav
- 既存の色・余白・カード表現

### 5.2 Preview表示

開発確認用として、既存の iPhone mock 表示は残す。

推奨route:

```text
/mobile-uiux/preview/screens/home
/mobile-uiux/preview/screens/reservations
/mobile-uiux/preview/screens/patients
/mobile-uiux/preview/screens/daily-reports
/mobile-uiux/preview/screens/settings
/mobile-uiux/preview/screens/settings-detail
```

Preview routeは `.dc.html` を従来通り stage込みで表示する。

---

## 6. 実装方針: Production Shell分離

### 6.1 新規モジュール

追加:

```text
src/lib/mobile-uiux/html-transform.ts
src/__tests__/mobile-uiux/html-transform.test.ts
```

責務:

- Design Component HTML を production shell に変換する
- stage controls / iPhone mock / fake device chrome を除去する
- app UI本体は非改変で残す
- preview mode では変換しない

### 6.2 変換API

```ts
export type MobileUiuxHtmlShellMode = 'production' | 'preview';

export function transformMobileUiuxHtml(
  html: string,
  options: {
    mode: MobileUiuxHtmlShellMode;
    resource: MobileUiuxScreenResource;
  }
): string;
```

### 6.3 production変換ルール

production modeでは以下を行う。

1. `<helmet>...</helmet>` 内の font / style を維持する
2. `data-screen-label` を持つ app screen container を抽出する
3. stage controls を除外する
4. iPhone mock outer frame を除外する
5. fake dynamic island を除外する
6. fake status bar を除外する
7. app header以下のUIを保持する
8. bridge script の注入位置は維持する
9. `<meta name="viewport">` は `viewport-fit=cover` を含める
10. bodyには production shell marker を付与する

出力イメージ:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <script src="./support.js"></script>
  <!-- existing fonts/styles from helmet -->
  <style>
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body[data-mobile-uiux-shell="production"] {
      width: 100%;
      min-height: 100svh;
      background: var(--screen-bg, #f3f5f4);
      overflow: hidden;
    }
    [data-mobile-uiux-production-root] {
      width: 100%;
      min-height: 100svh;
      height: 100svh;
      overflow: hidden;
      background: var(--screen-bg, #f3f5f4);
    }
    .scrl { -webkit-overflow-scrolling: touch; }
  </style>
</head>
<body data-mobile-uiux-shell="production">
  <div data-mobile-uiux-production-root>
    <!-- existing app UI only -->
  </div>
</body>
</html>
```

### 6.4 実装注意

HTML parser dependencyを増やすかどうかは実装時判断。ただし、現状ファイル構造が安定しているため、まずは以下で足りる可能性が高い。

- marker-based extraction
- `data-screen-label="..."` container抽出
- `<!-- dynamic island -->` block除去
- `<!-- status bar -->` block除去

ただし string replace だけで壊れやすい場合は、軽量HTML parser導入を検討する。

### 6.5 route handler変更

`src/app/(app)/mobile-uiux/screens/[resource]/route.ts` を以下に変更する。

- HTML resourceのとき:
  - read file
  - production transform
  - bridge injection
  - return no-store HTML
- JS resourceのとき:
  - 現状維持

擬似コード:

```ts
const rawContent = await readFile(filePath, 'utf-8');
const shellContent = definition.contentType.startsWith('text/html')
  ? transformMobileUiuxHtml(rawContent, { mode: 'production', resource })
  : rawContent;
const responseContent =
  flags.realDataEnabled && isMobileUiuxScreenResource(resource)
    ? injectMobileUiuxBridgeScript(shellContent, resource)
    : shellContent;
```

### 6.6 preview route追加

新規:

```text
src/app/(app)/mobile-uiux/preview/screens/[resource]/route.ts
```

または既存handlerを共有化:

```text
src/lib/mobile-uiux/screen-route-handler.ts
```

`preview` modeでは `transformMobileUiuxHtml(..., { mode: 'preview' })` として、現状のstage込みHTMLを返す。

---

## 7. 実装方針: context / access / entitlement

### 7.1 短期: allowlistは残すが、production blockerとして扱う

短期では `MOBILE_UIUX_ALLOWED_CLINIC_IDS` を本番βの安全弁として残す。

ただし、正式SaaS運用では使わない。

### 7.2 中期: DB feature entitlement を追加

追加候補:

```sql
create table public.clinic_feature_flags (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  mobile_uiux_enabled boolean not null default false,
  mobile_uiux_real_data_enabled boolean not null default false,
  mobile_uiux_write_enabled boolean not null default false,
  mobile_uiux_reservation_write_enabled boolean not null default false,
  mobile_uiux_daily_report_write_enabled boolean not null default false,
  mobile_uiux_settings_write_enabled boolean not null default false,
  rollout_phase text not null default 'off',
  updated_at timestamptz not null default now(),
  updated_by uuid null
);
```

最初は admin/service role read でよい。RLSを入れる場合は別PRで明示する。

### 7.3 entitlement判定

新規:

```text
src/lib/mobile-uiux/entitlements.ts
```

```ts
export type MobileUiuxEntitlement = {
  enabled: boolean;
  realDataEnabled: boolean;
  writeEnabled: boolean;
  reservationWriteEnabled: boolean;
  dailyReportWriteEnabled: boolean;
  settingsWriteEnabled: boolean;
  reason?: 'global_disabled' | 'clinic_disabled' | 'not_entitled';
};
```

判定順:

1. global kill switch: `MOBILE_UIUX_ENABLED`
2. role/access: `evaluateMobileUiuxAccess`
3. clinic scope: accessible clinic ids
4. DB entitlement: target clinic enabled
5. rollout override: env allowlistがある場合のみ pilot clinic に限定

注意:

- env allowlistは DB entitlement を置き換えない
- env allowlistが空でも、DB entitlement が true なら正式運用では通す
- ただし移行期間中は fail closed を維持し、明示的に `MOBILE_UIUX_USE_DB_ENTITLEMENTS=true` を追加して切り替える

### 7.4 flagsの整理

Vercel envに残すもの:

```env
MOBILE_UIUX_ENABLED=true
MOBILE_UIUX_USE_DB_ENTITLEMENTS=false
MOBILE_UIUX_REAL_DATA_ENABLED=true
MOBILE_UIUX_WRITE_ENABLED=false
MOBILE_UIUX_RESERVATION_WRITE_ENABLED=false
MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED=false
MOBILE_UIUX_SETTINGS_WRITE_ENABLED=false
```

正式運用後:

```env
MOBILE_UIUX_ENABLED=true
MOBILE_UIUX_USE_DB_ENTITLEMENTS=true
```

clinic別のread/write開放はDBへ移す。

---

## 8. 実装方針: 書き込みロールアウト

### 8.1 既存write BFFを使う

新規にPC側APIを直接叩かない。Mobile BFFを経由する。

| 操作 | Endpoint | Method | Gate |
|---|---|---:|---|
| 予約作成 | `/api/mobile-uiux/reservations` | POST | `MOBILE_UIUX_WRITE_ENABLED` + `MOBILE_UIUX_RESERVATION_WRITE_ENABLED` |
| 予約更新 | `/api/mobile-uiux/reservations` | PATCH | 同上 |
| 日報保存 | `/api/mobile-uiux/daily-reports` | POST | `MOBILE_UIUX_WRITE_ENABLED` + `MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED` |
| 設定更新 | `/api/mobile-uiux/settings` | PUT | `MOBILE_UIUX_WRITE_ENABLED` + `MOBILE_UIUX_SETTINGS_WRITE_ENABLED` |

### 8.2 write rollout順

推奨順:

1. **日報保存**: 影響範囲が比較的限定的。upsertで検証しやすい
2. **予約更新**: 既存予約のステータス/担当/メモ更新など限定操作から
3. **予約作成**: conflict検出・参照整合性・通知enqueueあり。慎重に
4. **設定更新**: 営業時間/予約カレンダー/通信のみ。最後にする

### 8.3 UIからのmutation導線

現状 bridge script は `window.MobileUiuxBridge` を公開している。

```js
window.MobileUiuxBridge = {
  createReservation(payload) { ... },
  updateReservation(payload) { ... },
  submitDailyReport(payload) { ... },
  updateSettings(payload) { ... }
};
```

本番write対応では、既存 `.dc.html` の見た目を変えず、以下のいずれかで mutation を接続する。

- 既存ボタンの `onClick` handler 内から bridge を呼ぶ
- non-visual `data-mobile-uiux-action` を付与し、bridge側で event delegation する
- Design Componentの状態変数から payload を組み立てる adapter を追加する

禁止:

- UIを別コンポーネントで作り直す
- ボタン配置・ラベル・カード構成を変える
- client側だけで権限制御する

### 8.4 payload adapter

新規候補:

```text
src/lib/mobile-uiux/mutation-adapters.ts
```

ただし `.dc.html` 内で動く JS は browser script であるため、server TSを直接importしない。bridge script生成時に、必要最低限の adapter JS を埋め込むか、`mobile-bridge.js` 内に閉じる。

最初は adapter を bridge script に内包し、テストで契約を固定する。

### 8.5 二重送信防止

bridge側でmutation中は以下を行う。

- `document.documentElement.dataset.mobileUiuxMutation = 'pending'`
- 同一actionの二重送信を無視する
- 成功時 `succeeded`
- 失敗時 `failed`

最低限:

```js
let mutationInFlight = false;
if (mutationInFlight) return false;
mutationInFlight = true;
try { ... } finally { mutationInFlight = false; }
```

### 8.6 失敗時UX

既存UIデザインを変えないため、初回は非侵襲のstatus要素でよい。

- unauthorized: login redirect
- forbidden: fallback status
- conflict: mutation statusで表示
- validation: mutation statusで表示
- server error: mutation statusで表示

将来的にtoast UIへ寄せる場合は別仕様。

---

## 9. 認可・安全性

### 9.1 read gate

readは既存方針を維持。

- `flags.enabled`
- `flags.realDataEnabled`
- auth session
- role allowlist
- clinic scope match
- BFF endpointごとの role制御

### 9.2 write gate

writeは以下を全て満たす場合のみ許可。

1. `MOBILE_UIUX_ENABLED=true`
2. `MOBILE_UIUX_REAL_DATA_ENABLED=true`
3. `MOBILE_UIUX_WRITE_ENABLED=true`
4. 対象別write flag=true
5. 認証済み
6. role許可
7. clinic scope一致
8. DB entitlement有効（DB entitlement移行後）
9. APIごとのdomain validation成功

### 9.3 ログ方針

本番403の切り分けに必要な情報だけ出す。

出してよい:

- reason code
- role
- allowedClinicCount
- scopedClinicCount
- feature entitlement enabled/disabled
- write target

出さない:

- raw clinic_id
- patient/customer name
- email
- free text notes
- reservation details

例:

```ts
console.warn('[mobile-uiux] access denied', {
  reason: accessDecision.reason,
  role: accessContext.normalizedRole,
  scopedClinicCount,
  allowedClinicCount: flags.allowedClinicIds.length,
});
```

---

## 10. 環境変数

### 10.1 read-only production shell確認

```env
MOBILE_UIUX_ENABLED=true
MOBILE_UIUX_REAL_DATA_ENABLED=true
MOBILE_UIUX_WRITE_ENABLED=false
MOBILE_UIUX_RESERVATION_WRITE_ENABLED=false
MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED=false
MOBILE_UIUX_SETTINGS_WRITE_ENABLED=false
```

pilot allowlistを使う場合のみ:

```env
MOBILE_UIUX_ALLOWED_CLINIC_IDS=<pilot clinic ids>
MOBILE_UIUX_ALLOWED_ROLES=admin,clinic_admin,manager,therapist,staff
```

### 10.2 write pilot

日報だけ開ける例:

```env
MOBILE_UIUX_ENABLED=true
MOBILE_UIUX_REAL_DATA_ENABLED=true
MOBILE_UIUX_WRITE_ENABLED=true
MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED=true
MOBILE_UIUX_RESERVATION_WRITE_ENABLED=false
MOBILE_UIUX_SETTINGS_WRITE_ENABLED=false
```

予約更新まで開ける例:

```env
MOBILE_UIUX_WRITE_ENABLED=true
MOBILE_UIUX_RESERVATION_WRITE_ENABLED=true
```

設定writeは最終段階まで false を推奨。

---

## 11. テスト要件

### 11.1 html transform

追加テスト:

```text
src/__tests__/mobile-uiux/html-transform.test.ts
```

ケース:

- production modeで stage controls が除去される
- production modeで iPhone mock frame が除去される
- production modeで dynamic island が除去される
- production modeで fake status bar が除去される
- production modeで app header / KPIカード / bottom nav 相当の文字列は残る
- preview modeではHTMLを変換しない
- bridge script注入後も `data-mobile-uiux-bridge` が1つだけ存在する
- viewportに `viewport-fit=cover` が含まれる

### 11.2 route handler

既存 `src/__tests__/api/mobile-uiux-access.test.ts` を拡張。

ケース:

- `/mobile-uiux/screens/home` はproduction shellを返す
- `/mobile-uiux/preview/screens/home` はpreview shellを返す
- unauthenticated HTML resourceはlogin redirect
- JS resourceも認証必須
- resource allow role は維持
- `MOBILE_UIUX_ENABLED` falseでは404

### 11.3 write flags

既存テストに加える。

- global write off -> 全write 403
- reservation write off -> POST/PATCH reservations 403
- daily report write off -> POST daily reports 403
- settings write off -> PUT settings 403
- target flag on + valid scope + valid payload -> success
- target flag on + invalid clinic scope -> 403
- reservation conflict -> 409
- settings disallowed category -> 403
- manager reservation create/update denied -> 403

### 11.4 production smoke

最低限の本番確認:

```text
GET /api/mobile-uiux/context
GET /mobile-uiux/screens/home
GET /mobile-uiux/screens/reservations
GET /api/mobile-uiux/home?clinic_id=<clinic>
GET /api/mobile-uiux/reservations?clinic_id=<clinic>
```

write pilot時:

```text
POST /api/mobile-uiux/daily-reports
PATCH /api/mobile-uiux/reservations
```

ただし実データに影響するため、pilot clinic / test reservation に限定する。

---

## 12. 受け入れ条件

### 12.1 本番表示

- iPhoneで `/mobile-uiux/screens/home` を開いたとき、iPhone mock frame が表示されない
- stage controls が表示されない
- fake dynamic island / fake status bar が表示されない
- App UI本体の見た目は既存デザインから変わらない
- Bottom Navが実ブラウザバーに極端に隠れない
- 横幅390px固定ではなく、実端末viewportに追従する
- `.dc.html` 原本は破壊的に変更しない

### 12.2 Preview

- `/mobile-uiux/preview/screens/home` では従来通り mock frame で確認できる
- preview routeでも認証・role gate は維持する
- preview routeは public 配信しない

### 12.3 API/read

- `GET /api/mobile-uiux/context` が認証済み・許可済みユーザーで success true を返す
- unauthorized は401
- forbidden は403
- responseに user id / email / patient PII を含めない

### 12.4 API/write

- write flags false では全writeが403
- target write flag true のAPIだけ書き込み可能
- 書き込み後のresponseは read model を返し、UIが即時再表示できる
- 予約作成/更新時の conflict 検出が効く
- 日報は write scope validation が効く
- 設定更新は許可カテゴリだけ通る

---

## 13. 実装PR分割案

### PR-A: Production shell extraction

対象:

- `html-transform.ts`
- `screens/[resource]/route.ts`
- preview route
- html transform tests

write/APIは触らない。

### PR-B: access reason logging / charset

対象:

- `context/route.ts`
- `route-utils.ts`
- `screens/[resource]/route.ts`

内容:

- 403 reasonをserver logに出す
- JSON responseに `content-type: application/json; charset=utf-8` を明示
- PIIは出さない

### PR-C: DB entitlement design / migration

対象:

- `clinic_feature_flags` migration
- generated types
- `entitlements.ts`
- context responseのpublic flags反映

### PR-D: daily report write pilot

対象:

- bridge mutation wiring
- daily report POST UI hook
- tests

### PR-E: reservation update/write pilot

対象:

- reservation PATCH UI hook
- optional POST create hook
- conflict UX
- tests

### PR-F: settings write pilot

対象:

- allowed categories only
- settings PUT UI hook
- audit/redaction確認
- tests

---

## 14. リスクと対策

| リスク | 種別 | 致命度 | 対策 |
|---|---|---:|---|
| HTML string transformが壊れる | 技術 | 高 | fixture testで固定。preview routeを残す |
| UIデザインを意図せず変える | 技術/市場 | 高 | production shellで除去するのはpreview chromeのみ。app UI差分をsnapshotで確認 |
| clinic allowlistを恒久運用してしまう | オペ/事業 | 高 | DB entitlement移行をPR-Cに明示 |
| write flagを一括開放して事故る | オペ/法務 | 高 | target別flag必須。段階開放 |
| 設定writeで業務設定を壊す | オペ | 高 | settings writeは最後。カテゴリ制限維持 |
| 予約writeで重複予約 | オペ | 高 | conflict check維持。pilot clinic限定 |
| ログにtenant/PIIを出す | 法務/評判 | 高 | reason code中心。raw clinic_id禁止 |

---

## 15. 実装者向け最短指示

```md
Mobile UIUX を本番スマホで使える形にしてください。

絶対条件:
- UI/UXデザインは変えない
- 変更するのは preview shell と production shell の分離のみ
- 本番routeでは iPhone mock / stage controls / fake status bar / dynamic island を出さない
- app UI本体のカード/色/余白/文言は原則変更しない
- preview routeでは従来のmock表示を残す
- 認証/認可/clinic scopeは緩めない
- writeは既存 mobile BFF を使い、flagsで段階開放する
- DB/RLSを触るPRと、shell分離PRは分ける

まずやるPR:
1. html-transform.ts を追加
2. /mobile-uiux/screens/[resource] を production shell にする
3. /mobile-uiux/preview/screens/[resource] を追加して現行表示を残す
4. testsを追加
5. write APIはまだ開けない
```

---

## 16. 判断

この仕様の本質は、UIの作り直しではない。

```text
Design Component previewを、本番業務画面として使える shell に載せ替える。
```

本番で使うための最短価値は、次の順で出る。

1. phone-in-phone を消す
2. read-only実データを正しく出す
3. access denial reasonを観測可能にする
4. daily report write から段階開放する
5. reservation / settings writeへ広げる
6. clinic allowlistをDB entitlementへ移行する

現時点で大規模デザイン改修に入るのはペイしない。既存UIの完成度は活かし、preview chromeだけを剥がす。