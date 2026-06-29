# モバイル UI/UX 静的統合仕様書 v0.2

作成日: 2026-06-29  
対象: `モバイルUIUX設計/` 配下の Design Component 画面を、既存 SaaS にデザイン非改変で組み込む  
方針: **添付フォルダ内のコンポーネント、寸法、配色、デザイン、ランタイムには一切手を入れない**  
改訂元: `docs/stabilization/spec-mobile-uiux-static-integration-v0.1.md`

---

## 0. v0.2 での改訂点

v0.1 のレビューで見つかった以下の問題を解消する。

- public 配信対象を実行に必要な最小ファイルへ限定する。
- `README.md`, `Design.md`, `CLAUDE.md`, `uploads/*.md`, `screenshots/*` は初期 public 配信から除外する。
- `support.js` が `unpkg.com` から React / ReactDOM を動的ロードし、`new Function` を使う前提を CSP 仕様へ明記する。
- Phase 0 の public 配信前に、添付 HTML 内の氏名・メール・電話・住所などが合成データであることを確認する。
- `/mobile-uiux` 入口ページと `.dc.html` 本体の認証境界を明確に分ける。
- Phase 1 は `page.tsx` ではなく Route Handler を正とし、HTML を認証済みレスポンスとして返す。
- Phase 2 の実データ接続は本仕様のスコープ外にし、別仕様で API 契約・注入方式・認可テストを定義する。
- 既存アプリの canonical role とデモ UI 内ロールの対応を明記する。

---

## 1. 目的

`モバイルUIUX設計/` に含まれるモバイル画面プロトタイプを、既存の `seikotsuin-management-saas` から確認できるようにする。

この統合の主目的は、添付フォルダ内の Design Component 画面を **非改変の静的デモ画面** として SaaS 内から到達可能にすることである。既存 SaaS の認証・認可・ルーティング・配信基盤は利用するが、添付 UI 資産の React/Next.js 化、Tailwind 化、既存コンポーネント化、デザイントークン統合は行わない。

Phase 0 では実データ接続を行わない。患者・予約・日報・設定データを既存 API / Supabase と接続する作業は、Phase 2 の別仕様で扱う。

---

## 2. 入力資産

原本ディレクトリ:

- `モバイルUIUX設計/`

### 2.1 実行に必要な原本ファイル

Phase 0 で配信対象にできるのは、以下の実行に必要なファイルだけとする。

- `ホームダッシュボードモバイルUI.dc.html`
- `予約モバイルUI.dc.html`
- `患者分析モバイルUI.dc.html`
- `日報モバイルUI.dc.html`
- `設定モバイルUI.dc.html`
- `設定詳細モバイルUI.dc.html`
- `clinic-shared.js`
- `support.js`

`support.js` は DC ランタイムであり、自動生成・編集禁止として扱う。`clinic-shared.js` は配色とテーマ適用ロジックの単一の真実の源として扱う。

### 2.2 初期 public 配信から除外するファイル

以下は原本として参照するが、Phase 0 では `public/mobile-uiux/` へコピーしない。

- `README.md`
- `Design.md`
- `CLAUDE.md`
- `uploads/*.md`
- `screenshots/*`

理由:

- public asset は未ログインユーザーでも取得できるため、内部仕様・元 PRD・AI 作業規約・確認画像を無条件公開しない。
- 画面実行に必要な依存ではない。
- 必要な場合は、認証済み Route Handler または SaaS 内ドキュメント画面で別途扱う。

---

## 3. 既存 SaaS 側の前提

既存アプリは以下を前提にする。

- Next.js 15 App Router
- React 19
- TypeScript 5
- npm
- Supabase SSR / Supabase JS
- `next.config.js` で全体セキュリティヘッダーを付与
- `X-Frame-Options: DENY` が全ルートへ付与されている
- `middleware.ts` が CSP をレスポンスへ付与している
- CSP は `src/lib/security/csp-config.ts` 経由で管理されている
- `(app)/layout.tsx` はログイン済みユーザーだけを許可する
- `middleware.ts` の `PROTECTED_ROUTE_PREFIXES` は prefix ベースで保護対象を判定する

重要な制約:

- iframe 組み込みは `X-Frame-Options: DENY` と `frame-ancestors 'none'` と衝突するため採用しない。
- 添付 HTML 内のテンプレート、インライン style、script、ランタイム仕様は変更しない。
- 既存 SaaS 側の RLS、認可、tenant/clinic スコープは緩めない。
- 新しい npm dependency は追加しない。
- DB、Supabase migration、RLS policy は Phase 0 / Phase 1 では変更しない。

---

## 4. 統合方式

### 4.1 Phase 0 の採用方式

初期統合は **最小静的資産配信 + 認証済み Next.js 入口ページ** とする。

構成案:

```text
public/
  mobile-uiux/
    clinic-shared.js
    support.js
    home.dc.html
    reservations.dc.html
    patients.dc.html
    daily-reports.dc.html
    settings.dc.html
    settings-detail.dc.html

src/app/(app)/mobile-uiux/
  page.tsx
```

`public/mobile-uiux/` は配信用コピーであり、原本は `モバイルUIUX設計/` に残す。

コピー時の原則:

- HTML / JS の内容は変更しない。
- 配信用ファイル名は ASCII 化してよい。
- ASCII 化によりファイル名は変わるため、byte-level 同一性の検証対象は「ファイル内容」とする。
- 原本名、配信用名、サイズ、ハッシュ、取り込み日時を台帳に記録する。

### 4.2 Phase 1 の採用方式

Phase 1 は **認証済み Route Handler による HTML 配信** とする。

構成案:

```text
src/app/(app)/mobile-uiux/
  page.tsx
  screens/
    [screen]/
      route.ts
    support.js/
      route.ts
    clinic-shared.js/
      route.ts

private-assets/
  mobile-uiux/
    clinic-shared.js
    support.js
    home.dc.html
    reservations.dc.html
    patients.dc.html
    daily-reports.dc.html
    settings.dc.html
    settings-detail.dc.html
```

補足:

- `private-assets/mobile-uiux/` は構成例であり、実装時はリポジトリ内の適切な非 public ディレクトリ名を確定する。
- Route Handler は `Content-Type: text/html; charset=utf-8` で対象 `.dc.html` を返す。
- `support.js` と `clinic-shared.js` も Route Handler 配下で認証済み配信するか、Phase 0 の public 静的配信を継続するかを Phase 1 実装前に決める。
- `.dc.html` は `./support.js` と `import('./clinic-shared.js')` を相対参照するため、Phase 1 の URL は相対解決を壊さない形にする。推奨は `/mobile-uiux/screens/home` のような no-trailing-slash URL とし、`/mobile-uiux/screens/support.js` と `/mobile-uiux/screens/clinic-shared.js` を同じ認証境界で返す方式である。
- 本番で患者本名や実データを扱う画面は public asset として配信しない。

### 4.3 非採用方式

以下は Phase 0 / Phase 1 では行わない。

- `.dc.html` を TSX に変換する
- DC テンプレートを React コンポーネントへ分解する
- インライン style を Tailwind / CSS Modules / globals.css へ移植する
- `clinic-shared.js` を既存デザイントークンへ統合する
- `support.js` を編集する
- iframe による埋め込み
- デザインやコンポーネント寸法の調整
- 既存 SaaS の通常画面に DC UI を混在させる

---

## 5. ルーティング仕様

### 5.1 SaaS 内入口

追加ルート:

- `/mobile-uiux`

実装:

- `src/app/(app)/mobile-uiux/page.tsx`

役割:

- 認証済みユーザーにだけモバイル UI/UX 画面一覧を表示する。
- 各 `.dc.html` へのリンクを提供する。
- 画面本体は静的ファイルまたは Route Handler の別 URL で開く。
- 既存 SaaS の共通ナビ・既存 UI コンポーネントと DC 画面本体を混在させない。

Phase 0 の画面リンク:

| 表示名 | 静的 URL |
|---|---|
| ホーム / ダッシュボード | `/mobile-uiux/home.dc.html` |
| 予約 | `/mobile-uiux/reservations.dc.html` |
| 患者分析 | `/mobile-uiux/patients.dc.html` |
| 日報 | `/mobile-uiux/daily-reports.dc.html` |
| 設定 | `/mobile-uiux/settings.dc.html` |
| 設定詳細 | `/mobile-uiux/settings-detail.dc.html` |

### 5.2 Phase 0 の静的ファイル配信

`public/mobile-uiux/*.dc.html` は Next.js の public asset として配信する。

注意:

- public asset は App Router の layout 認証を通らない。
- public asset は `middleware.ts` の保護対象 prefix に入れても、静的ファイル配信の扱いによっては期待通り保護されない可能性がある。
- Phase 0 では、未ログインでも `.dc.html` 本体を取得できることを許容する代わりに、配信内容を合成デモデータ限定にする。
- 実患者データ、実スタッフ情報、実院情報、実メールアドレス、実電話番号、実住所を含む状態で public 配信してはならない。

### 5.3 Phase 1 の認証済み HTML 配信

Phase 1 では public asset ではなく、Route Handler で対象 HTML を返す。

候補 URL:

| 表示名 | 認証済み URL |
|---|---|
| ホーム / ダッシュボード | `/mobile-uiux/screens/home` |
| 予約 | `/mobile-uiux/screens/reservations` |
| 患者分析 | `/mobile-uiux/screens/patients` |
| 日報 | `/mobile-uiux/screens/daily-reports` |
| 設定 | `/mobile-uiux/screens/settings` |
| 設定詳細 | `/mobile-uiux/screens/settings-detail` |

Route Handler では以下を行う。

- Supabase SSR client でログイン状態を検証する。
- 必要に応じて profile / role / clinic scope を取得する。
- 許可された screen だけを返す。
- 未ログインは `/login?redirectTo=...` へ誘導するか、HTML 取得用途では `401` を返す。
- 権限外は `403` を返す。
- `screen` パラメータは allowlist で検証し、任意パス読み込みを許可しない。
- `Cache-Control: no-store, no-cache, must-revalidate` を付与する。

---

## 6. PC / モバイル表示モード切替

### 6.1 基本方針

PC 画面とモバイル画面の切替は、ユーザーが任意で選べる設計を基本とする。

Phase 0 / Phase 1 では、モバイル画面は静的デモまたは認証済み HTML 表示であり、既存 PC 画面を置き換えない。既存 SaaS の PC 画面はそのまま維持し、`/mobile-uiux` 入口から「モバイル UI/UX を確認する」導線として扱う。

Phase 2 以降で実データ接続を行う場合も、最初からスマホ幅で強制的にモバイル画面へ遷移させない。既存 PC 画面へ戻れる導線を残し、段階的に実運用へ移行する。

### 6.2 Phase 0 / Phase 1 の切替

Phase 0 / Phase 1 では以下とする。

- 既存 PC 画面から `/mobile-uiux` 入口へ任意で移動できる。
- `/mobile-uiux` 入口から 6 つのモバイル UI 画面を開ける。
- モバイル UI 画面は実操作画面ではなく、静的デモまたは認証済み HTML 表示として扱う。
- 既存 PC 画面への戻り導線を入口ページに置く。
- 画面幅による自動リダイレクトは行わない。

### 6.3 Phase 2 以降の切替

Phase 2 以降でモバイル画面を実操作可能にする場合は、別仕様で以下を定義する。

- PC 版とモバイル版の対応ルート。
- PC 版から「モバイル版で開く」導線。
- モバイル版から「PC 版で開く」導線。
- ユーザーが選んだ表示モードの保存方式。
- 保存した表示モードを端末幅より優先するかどうか。
- 画面幅による自動提案または自動切替の条件。
- 表示モードを切り替えても同一の server guard / RLS / clinic scope を使うこと。

表示モード保存の候補:

- user profile preference
- cookie
- localStorage

選定条件:

- 認証・認可には使わない。
- clinic scope や role 判定には使わない。
- 端末間で同期したい場合は user profile preference を検討する。
- ブラウザ単位の軽い UI 設定でよい場合は cookie または localStorage を検討する。

### 6.4 禁止事項

- スマホ幅という理由だけで、既存 PC 画面からモバイル実操作画面へ強制遷移させること。
- 表示モードを認可判定に使うこと。
- `mobile` 表示なら権限を緩める、または `desktop` 表示なら別の clinic scope を使うこと。
- PC 版とモバイル版で API の認可条件を分岐させること。
- 既存 PC 導線を削除してからモバイル実操作画面を十分に検証すること。

---

## 7. 認証・認可仕様

### 7.1 Phase 0

`/mobile-uiux` の入口ページは既存の `(app)` 配下に配置し、ログイン済みユーザーだけが画面一覧へ到達できるようにする。

静的 `.dc.html` は合成デモ UI として扱う。Phase 0 では実データ API へ接続しない。

Phase 0 で必須:

- `/mobile-uiux` 入口ページは未ログイン時に `/login` へリダイレクトされる。
- `public/mobile-uiux/` 配下には実行に必要な最小ファイルだけを置く。
- public 配信される HTML / JS に実データが含まれていないことを確認する。

### 7.2 Phase 1

Phase 1 では `.dc.html` 本体も認証済み Route Handler から返す。

必須:

- 未ログインでは screen HTML を取得できない。
- 権限外 screen は `403` になる。
- `support.js` と `clinic-shared.js` の配信方式を決め、必要に応じて同じ認証境界へ入れる。
- `middleware.ts` の `PROTECTED_ROUTE_PREFIXES` に `/mobile-uiux` を追加するか、Route Handler 内認証を唯一の認証境界として明記し、テストする。

### 7.3 Phase 2

実データ連携は本仕様の実装スコープ外とする。

Phase 2 へ進む前に、別仕様で以下を定義する。

- 画面別 API 契約
- デモデータを置き換える方式
- 原本非改変を維持するか、配信用変換を許すか
- `support.js` / `.dc.html` の CSP 例外を本番で許容するか
- 患者本名・スタッフ情報・院情報の PII 取り扱い
- role と clinic scope のサーバ側認可
- RLS / tenant isolation 回帰テスト

Phase 2 の禁止事項:

- public 配信のまま実患者データを注入すること
- UI 側ロール切替を本当の権限として扱うこと
- `clinic_id`, `tenant_id`, `organization_id`, `user_id`, `staff_id`, `role`, `permissions` を client-only 判定にすること
- RLS / authorization / tenant isolation / clinic scope を緩めること

---

## 8. ロール対応

既存アプリの canonical role は `src/lib/constants/roles.ts` を正とする。

| 既存 role | 既存ラベル | DC UI 内の呼称 | Phase 1 / 2 の扱い |
|---|---|---|---|
| `admin` | 本部管理者 | 本部管理者 / 管理者 | 全社・テンプレート操作。実データ接続時も server guard 必須 |
| `clinic_admin` | 店舗管理者 | 店舗管理者 / 院長 | 所属院スコープ。設定承認・院内管理は server guard 必須 |
| `manager` | マネージャー | マネージャー / エリアマネージャー | 担当院スコープ。全社ではなく割当院だけ |
| `therapist` | 施術者 | セラピスト | 自分または許可された所属院範囲 |
| `staff` | スタッフ | 受付スタッフ / スタッフ | 所属院範囲 |
| `customer` | 顧客 | 対象外 | Phase 0 / 1 の入口では原則対象外 |

注意:

- DC UI 内のロール切替はデモ用であり、既存 SaaS の認可判定ではない。
- Phase 0 ではロール切替を触ってもサーバ権限は変わらない。
- Phase 1 / 2 では canonical role を server side で取得し、UI 表示とは別に判定する。

---

## 9. CSP / セキュリティヘッダー仕様

初期統合では iframe を使わないため、`X-Frame-Options: DENY` と `frame-ancestors 'none'` は維持する。

### 9.1 添付ランタイムの CSP 前提

現物の `support.js` は以下を行う。

- `https://unpkg.com/react@18.3.1/umd/react.production.min.js` を動的 script として読み込む。
- `https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js` を動的 script として読み込む。
- `x-import` 利用時に `https://unpkg.com/@babel/standalone@7.26.4/babel.min.js` を動的 script として読み込む可能性がある。
- `<script data-dc-script>` の中身を `new Function` で評価する。
- `<style>` 要素を runtime 側で挿入する。
- 各 `.dc.html` は Google Fonts を読み込む。
- 各 `.dc.html` は `import('./clinic-shared.js')` を使う。

したがって、CSP では少なくとも以下の観点を確認する。

- `script-src` が `support.js` 自体を許可するか。
- `script-src` が `https://unpkg.com` を許可する必要があるか。
- `script-src` に `'unsafe-eval'` が必要か。
- `style-src` が inline style / runtime style 挿入を許可する必要があるか。
- `style-src` が `https://fonts.googleapis.com` を許可するか。
- `font-src` が `https://fonts.gstatic.com` を許可するか。
- `clinic-shared.js` の dynamic import が CSP と MIME type の両方で成功するか。

### 9.2 Phase 0 の CSP 方針

Phase 0 は表示確認が目的であり、CSP 調整が必要な場合でも全体 CSP を弱めない。

許可する場合:

- `/mobile-uiux/:path*` のみに限定した CSP 例外を追加する。
- 例外は `middleware.ts` または `next.config.js` のどちらで適用するかを実装前に決める。
- 例外追加時は、既存 CSP テストを更新し、全ルートへ波及していないことを確認する。

禁止:

- 全ルートで `script-src 'unsafe-inline'` を広げる。
- 全ルートで `script-src 'unsafe-eval'` を広げる。
- 全ルートで `https://unpkg.com` を追加する。
- 全ルートで `style-src 'unsafe-inline'` を新規に広げる。
- `X-Frame-Options` を全体削除する。
- `frame-ancestors 'none'` を全体削除する。

### 9.3 CSP 例外を避ける代替案

実装時に CSP 例外が過大になる場合は、以下を検討する。ただし、添付原本は変更しない。

- Phase 0 を開発環境限定の確認ルートにする。
- Phase 1 へ前倒しし、認証済み HTML 配信のみで扱う。
- `support.js` の外部依存を vendor 化した配信用コピーを作る案を別仕様化する。

vendor 化は `support.js` 改変に近い扱いになるため、本仕様では採用しない。必要になった場合は、ランタイム所有者と rollback 方針を含む別仕様を作る。

---

## 10. データ公開ゲート

Phase 0 で public 配信する前に、以下を確認して台帳へ記録する。

### 10.1 確認対象

- 患者名
- スタッフ名
- メールアドレス
- 電話番号
- FAX
- 住所
- URL
- 予約内容
- 売上・LTV・患者数などの業務数値
- 院名
- スクリーンショット内の表示内容

### 10.2 判定

Phase 0 で public 配信してよいのは、以下を満たす場合だけとする。

- 実在患者を識別できる情報ではない。
- 実スタッフの個人メールや連絡先ではない。
- 実院の非公開情報ではない。
- 外部公開されても業務上問題のない合成デモデータである。

判定ができない場合:

- Phase 0 の public 配信を行わない。
- Phase 1 の認証済み Route Handler 方式を先に実装する。
- 原本の値を書き換えて解決しない。

---

## 11. ファイル取り込みルール

### 11.1 原本保護

`モバイルUIUX設計/` は原本として扱う。

禁止:

- 原本 `.dc.html` の直接編集
- 原本 `clinic-shared.js` の直接編集
- 原本 `support.js` の直接編集
- 原本 `Design.md` と矛盾する実装

### 11.2 配信用コピー

Phase 0 の配信用コピーは `public/mobile-uiux/` に置く。

許可:

- ファイル名の ASCII 化
- 実行に必要なファイルだけの選別
- 原本との差分確認のためのハッシュ記録

禁止:

- HTML 内部の編集
- style 属性の編集
- script の編集
- コンポーネント構造の編集
- 色・寸法・フォントの編集
- `support.js` の外部 URL 書き換え
- `clinic-shared.js` の分割

### 11.3 資産台帳

取り込み時に以下を作成する。

```text
docs/stabilization/mobile-uiux-asset-manifest-v0.2.md
```

台帳に記録する項目:

- 原本ファイル名
- 配信用ファイル名
- public 配信対象かどうか
- 除外理由
- サイズ
- SHA-256 ハッシュ
- 取り込み日時
- 合成データ確認結果
- 変更有無

---

## 12. 画面別統合要件

### 12.1 ホーム / ダッシュボード

Phase 0 URL:

- `/mobile-uiux/home.dc.html`

Phase 1 URL 候補:

- `/mobile-uiux/screens/home`

将来接続するデータ:

- 本日の予約タイムライン
- KPI
- スタッフ別予約
- 日報提出状況
- 自院 / 担当エリア / 全社スコープ

認可:

- `clinic_admin`: 自院
- `manager`: 担当院 / 担当エリア
- `admin`: 全社

### 12.2 予約

Phase 0 URL:

- `/mobile-uiux/reservations.dc.html`

Phase 1 URL 候補:

- `/mobile-uiux/screens/reservations`

将来接続するデータ:

- 予約タイムライン
- 日付切替
- 担当者フィルタ
- 新規予約登録
- 指名チェック
- 予約詳細

認可:

- `therapist`: 自分または許可された担当予約
- `staff`: 所属院
- `clinic_admin`: 所属院
- `manager`: 担当院の閲覧中心
- `admin`: 全社、ただし clinic scope 指定必須

### 12.3 患者分析

Phase 0 URL:

- `/mobile-uiux/patients.dc.html`

Phase 1 URL 候補:

- `/mobile-uiux/screens/patients`

将来接続するデータ:

- 患者セグメント
- 来院トレンド
- 離脱リスク
- フォロー対象
- LTV
- 期間 / 院フィルタ

認可:

- `staff`: 所属院
- `clinic_admin`: 所属院
- `manager`: 担当院
- `admin`: 全社、ただし clinic scope 指定必須

患者本名と個人情報は clinic scope のサーバ側検証を通過した場合のみ返す。

### 12.4 日報

Phase 0 URL:

- `/mobile-uiux/daily-reports.dc.html`

Phase 1 URL 候補:

- `/mobile-uiux/screens/daily-reports`

将来接続するデータ:

- 当日の施術明細
- 保険 / 自費売上
- 日報提出
- 過去日報
- ステータス管理

認可:

- `therapist`: 自身または所属院の入力許可範囲
- `staff`: 所属院
- `clinic_admin`: 所属院
- `manager`: 担当院の閲覧中心
- `admin`: 全社、ただし clinic scope 指定必須

### 12.5 設定

Phase 0 URL:

- `/mobile-uiux/settings.dc.html`

Phase 1 URL 候補:

- `/mobile-uiux/screens/settings`

将来接続するデータ:

- アカウント設定
- 2FA
- シフト申請
- 出勤申請
- 他院ヘルプ勤務
- 申請修正 / 削除

認可:

- 本人申請: 本人のみ
- 承認 / 差戻し: `clinic_admin`, `admin`, 許可された `manager`
- 削除: 本人または管理権限を持つユーザーのみ

### 12.6 設定詳細

Phase 0 URL:

- `/mobile-uiux/settings-detail.dc.html`

Phase 1 URL 候補:

- `/mobile-uiux/screens/settings-detail`

将来接続するデータ:

- 院情報
- 施術メニュー
- 保険設定

認可:

- `manager`: 担当院サブセット
- `clinic_admin`: 所属院
- `admin`: テンプレートまたは全体設定

設定変更は監査ログ対象にする。

---

## 13. 実装タスク

### Task 1: 資産確認

- `モバイルUIUX設計/` の実行必要ファイル一覧を確定する。
- public 配信除外ファイルを台帳に記録する。
- ASCII 配信用ファイル名を確定する。
- SHA-256 ハッシュ記録方式を決める。
- 合成データ確認を行う。

### Task 2: Phase 0 静的資産配置

- `public/mobile-uiux/` を作る。
- 実行に必要な 8 ファイルだけをコピーする。
- 内容差分がないことをハッシュで確認する。
- `README.md`, `Design.md`, `CLAUDE.md`, `uploads/`, `screenshots/` を public 配下へ置かない。

### Task 3: SaaS 入口ページ追加

- `src/app/(app)/mobile-uiux/page.tsx` を追加する。
- 既存の認証済みレイアウト内で画面一覧を表示する。
- 各画面の Phase 0 URL へリンクする。
- 入口ページ内に、静的デモであり実データ接続ではないことを明記する。
- 入口ページに既存 PC 画面へ戻る導線を置く。

### Task 4: CSP 動作確認

- `npm run dev` で起動する。
- `/mobile-uiux` から各画面を開く。
- Console に CSP / import / script / runtime boot エラーがないことを確認する。
- `support.js` が React / ReactDOM を読み込めていることを確認する。
- `clinic-shared.js` の dynamic import が成功することを確認する。
- ライト / ダーク切替が動作することを確認する。

### Task 5: Phase 1 移行準備

Phase 0 を本番公開しない、または public 配信を避ける必要がある場合に実施する。

- `src/app/(app)/mobile-uiux/screens/[screen]/route.ts` または同等の Route Handler を設計する。
- screen allowlist を定義する。
- 認証、role、clinic scope の取得方法を決める。
- `support.js` / `clinic-shared.js` の認証済み配信方式と相対 URL 解決を決める。
- `middleware.ts` の `/mobile-uiux` 保護方針を決める。

### Task 6: 表示モード切替方針の確認

- Phase 0 / Phase 1 では画面幅による自動リダイレクトを入れない。
- 既存 PC 画面から `/mobile-uiux` 入口へ任意で移動する導線に留める。
- Phase 2 で実操作化する前に、PC 版 / モバイル版の対応ルートと表示モード保存方式を別仕様で定義する。

### Task 7: 検証

必須コマンド:

```powershell
npm run type-check
npm run lint
npm run build
```

必要に応じて:

```powershell
npm run test:e2e:pw -- --project=chromium
```

セキュリティヘッダーや middleware を変更した場合:

```powershell
npm run test -- --ci --testPathIgnorePatterns=e2e
```

---

## 14. 受け入れ条件

Phase 0 の受け入れ条件:

- 添付フォルダ内の原本ファイルを編集していない。
- `support.js` を編集していない。
- `clinic-shared.js` を編集していない。
- `.dc.html` の内部構造、style、script、デザイン寸法、配色を編集していない。
- public 配信対象が実行に必要な 8 ファイルだけである。
- 内部仕様書、元 PRD、AI 作業規約、スクリーンショットを public 配信していない。
- 合成データ確認結果を台帳に記録している。
- 6 画面すべてに SaaS 内入口から到達できる。
- 6 画面すべてで DC runtime boot エラーが出ない。
- `support.js` が React / ReactDOM を読み込める。
- `clinic-shared.js` の dynamic import が成功する。
- ライト / ダークテーマ切替が壊れていない。
- 既存 SaaS の認証導線を壊していない。
- 既存 PC 画面から任意で `/mobile-uiux` 入口へ移動できる。
- `/mobile-uiux` 入口から既存 PC 画面へ戻れる。
- 画面幅による強制的な自動リダイレクトを追加していない。
- RLS、authorization、tenant isolation、clinic scope を緩めていない。
- 新しい npm dependency を追加していない。
- 追加の lockfile を作っていない。
- `npm run type-check`, `npm run lint`, `npm run build` が成功する。

Phase 1 の追加受け入れ条件:

- 未ログインでは screen HTML を取得できない。
- 権限外 screen へのアクセスが拒否される。
- `screen` パラメータは allowlist 以外を受け付けない。
- 認証済み HTML レスポンスに `Cache-Control: no-store, no-cache, must-revalidate` が付与されている。
- public asset と認証済み Route Handler の責務が混在していない。

---

## 15. リスクと対策

| リスク | 内容 | 対策 |
|---|---|---|
| CSP ブロック | `support.js` の dynamic script、`new Function`、inline style、Google Fonts がブロックされる | `/mobile-uiux/:path*` 限定で CSP 例外を検討し、全体 CSP は弱めない |
| CSP 例外過大 | `unsafe-eval` や `unpkg.com` の許可が医療 SaaS 全体へ波及する | 例外を route 限定し、テストで他ルートへ波及していないことを確認する |
| public 配信 | 静的 HTML が未ログインでも取得できる | Phase 0 は合成デモデータ限定。実データ化前に Phase 1 へ移行する |
| 内部文書公開 | `uploads/*.md` や `CLAUDE.md` を public に置く | 実行に不要な文書・画像は public 配信しない |
| 合成データ誤認 | デモ内の氏名・メール・住所が実データか判断できない | 判断不能なら public 配信せず Phase 1 を先に実装する |
| デザイン改変 | Next.js コンポーネント化でデザインが崩れる | 初期統合では変換しない。原本コピーを静的配信する |
| 権限誤認 | UI ロール切替を本当の権限として扱う | UI は補助。server guard と RLS を最終判定にする |
| 表示モード誤認 | モバイル画面を開けることを実操作可能と誤認する | Phase 0 / 1 の入口で静的デモであることを明記し、実操作化は Phase 2 別仕様にする |
| 強制切替による業務停止 | スマホ幅で既存 PC 導線へ戻れなくなる | 任意切替を基本にし、PC 版へ戻る導線を残す |
| 患者情報漏えい | 患者本名や分析データが他院に表示される | Phase 2 別仕様で clinic scope、RLS、PII テストを必須にする |

---

## 16. ロールバック方針

Phase 0 のロールバックは以下で完了する。

- `/mobile-uiux` 入口ページを削除する。
- `public/mobile-uiux/` 配信用コピーを削除する。
- `docs/stabilization/mobile-uiux-asset-manifest-v0.2.md` を削除するか、ロールバック済みとして追記する。
- `next.config.js` または `middleware.ts` に `/mobile-uiux` 専用 CSP 例外を追加していた場合は該当差分を戻す。

DB、Supabase migration、RLS policy は変更しないため、データロールバックは不要。

Phase 1 のロールバックは以下を追加する。

- `/mobile-uiux/screens/*` の Route Handler を削除する。
- private asset 配置を削除する。
- `middleware.ts` に `/mobile-uiux` 保護 prefix を追加していた場合は、他用途で使われていないことを確認して戻す。

---

## 17. 実装時の禁止事項

- 原本ファイルの直接編集
- `.dc.html` の TSX 変換
- Tailwind 化
- 既存デザインシステムへの吸収
- `support.js` の変更
- `clinic-shared.js` の分割
- 新規 dependency の追加
- RLS / authorization / tenant isolation の緩和
- public 配信のまま実患者データを注入すること
- 全体 CSP の安易な弱体化
- `X-Frame-Options` の全体削除
- `frame-ancestors 'none'` の全体削除
- `README.md`, `Design.md`, `CLAUDE.md`, `uploads/*.md`, `screenshots/*` の Phase 0 public 配信
- 合成データ確認なしで public 配信すること
- スマホ幅を理由に既存 PC 画面からモバイル画面へ強制遷移させること
- 表示モードを認可、role、clinic scope 判定に使うこと
- PC 版へ戻る導線を用意せずにモバイル版を実操作化すること

---

## 18. DoD との対応

この仕様は、既存 stabilization DoD のうち以下に影響する。

- DOD-06: Playwright baseURL と画面表示の安定性
- DOD-09: tenant table への client-side direct access 回避
- DOD-10: Next build 再現性
- DOD-11: Windows 上の Jest 回帰安定性

Phase 0 / Phase 1 は DB / Supabase / RLS を変更しない。

Phase 2 で実データ API を接続する場合は、少なくとも以下を再確認する。

- DOD-08: Tenant boundary + RLS source-of-truth
- DOD-09: Client paths do not bypass server-side clinic guards
- DOD-10: Next build reproducibility
- DOD-11: Jest regression stability on Windows

---

## 19. 未決事項

Phase 0 実装前に決めること:

- Phase 0 を本番にも置くか、開発・検証環境限定にするか。
- `support.js` の `unpkg.com` 依存を本番 CSP で route 限定許可するか。
- `unsafe-eval` が必要な場合、Phase 0 の表示確認だけに限定するか。
- 合成データ確認で判断不能な値があった場合、Phase 1 を先に実装するか。

Phase 1 実装前に決めること:

- `support.js` / `clinic-shared.js` も認証済み Route Handler で返すか。
- `./support.js` と `import('./clinic-shared.js')` の相対参照をどの URL 構造で成立させるか。
- `/mobile-uiux` を `middleware.ts` の `PROTECTED_ROUTE_PREFIXES` に追加するか。
- screen 別の role 制限を Phase 1 から入れるか、ログイン済み全ロールに公開するか。

Phase 2 は本仕様では着手しない。実データ接続は別仕様で扱う。

Phase 2 実装前に決めること:

- PC 版 / モバイル版の対応ルートをどう定義するか。
- 表示モードを user profile preference、cookie、localStorage のどれで保存するか。
- 端末幅による自動提案を入れるか。
- 自動提案を入れる場合、ユーザーの明示選択をどちらが優先するか。
