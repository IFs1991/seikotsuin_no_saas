# Tiramisu共通サイト・OS／Works LP 統合 実装記録 v2.0

- Status: implemented-local / release-blocked
- Date: 2026-10-22
- File: `docs/stabilization/spec-public-marketing-site-v2.0.md`
- 正本: 事業者から受領した「Tiramisu 共通サイト・OS／Works LP 統合実装仕様書 v2.0（TIRAMISU-PUBLIC-LP-20261022）」。
  個人情報を含むため原本はリポジトリへ追加しない。本書は実装内容と公開前残件だけを記録する。
- Scope: 公開サイト（`(public)` の静的ページ）だけ。DB・RLS・認証方式・業務アプリ・Worksバックエンドは対象外。

---

## 1. 構成

| URL | 内容 | 自動モーダル |
|---|---|---|
| `/` | Tiramisu共通トップ（製品カード・選び方・相談導線） | 当該タブのセッションで初回のみ |
| `/works` | Tiramisu Works LP（課題・仕組み・できること・統制・OSとの違い・料金・FAQ） | なし（手動のみ） |
| `/os` | 旧 `/` のOS LPを移設（料金・FAQ・計算機・AIデモ・追従CTA・ログイン導線を保全） | なし（手動のみ） |
| `/contact` | 共通問い合わせ（既存Googleフォームへのリンク） | なし |
| `/terms` `/privacy` | 共通事項＋製品別の条件（見出し・アンカーで区別） | なし |
| `/legal` | 運営者情報・販売条件・事業者情報の開示請求 | なし |

- middleware は保護prefixの拒否リスト方式のため、新ルートは変更なしで公開扱いになる。
  `middleware.ts` は変更していない（`src/__tests__/public-app-boundary/middleware-boundary.test.ts` で公開7ルートと保護ルートの両方を固定）。
- マーケティング用ヘッダー・フッター・モーダルは公開ページだけが明示的に描画し、`layout.tsx` には追加していない。

### 主なファイル

- `src/components/public/marketing-header.tsx` / `marketing-footer.tsx`: 公開サイト専用のナビ（ロゴ→`/`、Works、OS、問い合わせ、OSログイン、製品を選ぶ）。
- `src/components/public/product-selector.tsx`: 製品選択モーダル（client境界はここだけ）。
- `src/components/public/product-cards.tsx`: 製品カード・比較表（サーバー描画の実リンク）。
- `src/components/public/phrase-text.tsx` / `csp-safe-image.tsx`: 和文見出しの改行制御、厳格CSP下で inline style を出さない画像。
- `src/components/public/marketing-content.ts` / `works-content.ts`: 表示用の正本。Works料金は `worksPlans` の1か所だけ。
- `src/components/public/marketing-links.ts`: `/contact` の query 許可一覧、旧OSアンカーの許可一覧。
- `src/components/public/lp-links.ts`: 既存 `createCtaLink` / `LP_FORM_URL` の契約は維持し、URL検証付きの `resolveLpFormLink` を追加。
- `src/components/public/release-readiness.ts`: 公開前の承認台帳（値は公開してよいものだけ。未承認は null）。
- `scripts/public-site/check-release-readiness.mjs`: 公開前チェック（`npm run public-site:release-check`）。

## 2. 製品選択モーダル

- 自動表示は `/` だけが `productSelector='auto'` で明示的に許可する。キーは `tiramisu.product-selector.seen.v1`、値は固定値 `1`。
- 表示を決めた時点で表示済みを記録してから開く。記録できない（storageの取得・読取・書込が失敗する）場合は自動表示を省略し、
  手動の「製品を選ぶ」は使える。Strict Mode の二重effectでも二重に開かない。
- `/#problems` `/#features` `/#ai` `/#roi` `/#pricing` `/#faq` `/#contact`（移設前のOS LPに実在したID）は、モーダルの判定より先に
  `location.replace('/os#<id>')` で移す。未知のhashは共通トップに留まる。新しいアンカー `#products` `#compare` `#consult` は旧IDと衝突しない。
- 閉じる: ×、Esc、背景、「あとで選ぶ」。手動起動・自動起動のどちらも「製品を選ぶ」へフォーカスを戻す。
  同じタブで製品リンクへ移動するときは閉じるだけで起動元へは戻さない（修飾キー付きクリックでは閉じない）。
- 既存の `src/components/ui/dialog.tsx`（Radix）ではなく、ネイティブ `<dialog>`（`showModal()`）を使う。理由:
  Radix の scroll lock（react-remove-scroll-bar → react-style-singleton）は nonce なしの `<style>` を注入し、Next.js は
  `__webpack_nonce__` を設定しないため、本番CSP（`CSP_ROLLOUT_PHASE=full-enforce`、`style-src` に `unsafe-inline` なし）で
  初回訪問のたびにCSP違反になる。ネイティブ `<dialog>` は背景の inert 化・Esc・フォーカス移動をブラウザが行い、
  背景スクロールの停止は `lp-styles.css` のクラス（`html.lp-scroll-locked`）で行う。
- JavaScript前（SSR）のHTMLにはモーダルを含めず、「製品を選ぶ」は hydration まで disabled。通常のカード・リンクで両製品へ進める。
- 和文見出しは `PhraseText`（`<wbr>` と `word-break: keep-all`）で読点・句点の後ろでだけ折り返す。ダイアログ見出しは
  `<wbr>` で読み上げ名に区切りが入らないよう、表示と同じ文字列を `aria-label` にしている。

### 画像とCSP

- `next/image` は既定で `style="color:transparent"`（`fill` のときは配置も）を出力し、本番CSPで違反になる。
  ログイン画面の `style={{ color: undefined }}` はクライアントコンポーネントでのみ有効で、サーバーコンポーネントから渡すと
  RSC のシリアライズで `undefined` が落ちる。公開サイトでは `src/components/public/csp-safe-image.tsx`（client境界）で打ち消し、
  `fill` の配置は class で指定する。移設前の `/` には同じ違反があった（ロゴ2か所と創業者写真）。

## 3. 問い合わせ（`/contact`）

- `product` = `works | os | both | undecided`、`intent` = `sales | support | privacy | operator-disclosure`。
  `plan` = `light | standard | pro | custom` は `product=works&intent=sales` のときだけ採用する。未知値・重複指定は未選択に戻す。
- 表示は固定のラベル表からだけ行い、query の文字列をそのまま出さない。query は表示補助であり、契約・価格・権限の根拠にしない。
- 外部フォームURLは `NEXT_PUBLIC_LP_FORM_URL`（空白除去後に値がある場合）→ 既定のGoogleフォームの順。設定値が https 以外・資格情報付きなら
  リンクを出さず安全な案内に切り替える（既定URLへ黙って戻さない）。
- 事前入力の `entry.*` は使わない（実在IDを確認していない）。「フォームを開いただけでは受付にならない」ことと、
  患者・顧客の個人情報・パスワード・認証コード・APIキーを入力しないことを表示する。返信期限は約束しない。
- 既存の計測基盤はないため、計測イベントは追加していない。

## 4. 法務・運営者情報

- `/terms` `/privacy` は既存の暫定文面を「Tiramisu OS」の項へ移し、「当社」を「当事業者」（個人事業主）へ置き換えた。
  共通事項・Tiramisu Works・お問い合わせフォームの項は、確定していない事項を断言せず「確定前」と明示する。
- `/legal` の氏名は回答済みだが公開用原稿への掲載確認前のため、コードに入れず「確定後に掲載します」と表示する。
  所在地・電話番号は実値を扱わず、請求時に個別提供する方針（下書き）と `/contact?intent=operator-disclosure` への導線だけを表示する。
  ご本人の個人データの開示請求（`/privacy#requests`）とは別の窓口として案内する。

## 5. Works の機能・料金

- 料金（税別・暫定固定）: Light 月額19,800円／初期49,800円、Standard（主力プラン）月額29,800円／初期100,000円、Pro 月額49,800円／初期150,000円。
  個別見積もりは別枠。旧PoC・旧実行枠・超過単価・利用者数・接続数・SLA・無制限は表示しない。
- 機能の記述は `release-readiness.ts` の `worksClaims`（機能名・必要な接続・実装根拠・有効化状態・本番E2E確認日・確認者・状態）と claimId で対応させる。
  Works リポジトリ（`IFs1991/TiramisuWorks_setup_module` HEAD 20f38e2）は README と `plugin/skills/setup/SKILL.md` を読んだだけで、
  コードの取込・実行や本番E2Eの確認はしていない。全claimを `draft` とし、公開前チェックで公開不可と判定する。
- Instagram は「対応中（現在は提供していません）」。会計・売上データの参照、Google マップ・Google ビジネス プロフィール、画像・動画の公開、
  決済の作成・返金は「現在提供していないもの」として表示する。

## 6. 公開前チェック

```bash
npm run public-site:release-check
# ビルド出力の確認（非公開文字列はリポジトリ外のファイルで渡し、値は出力しない）
npm run public-site:release-check -- --scan-build .next --private-terms-file <リポジトリ外のファイル>
```

- build・CI・本番リクエスト処理には組み込んでいない。未承認項目があると終了コード1（RELEASE_BLOCKED）。
- 公開判定に含める残件（2026-10-22時点、14件）と、プラグイン申請時の残件（B10）を出力する。

| ID | 残件 | 実装時の扱い |
|---|---|---|
| B01 | 事業者の氏名・屋号表記の公開原稿 | 氏名は null。ブランド表記は下書き |
| B02 | Googleフォームの現物・受信・通知・担当・代替窓口 | 未確認。フォームは変更・送信していない |
| B03 | 所在地・電話の請求時開示の運用と掲載文 | 方針文は下書き。実値はリポジトリに入れない |
| B04 | 正式な本番origin | 未確認。`metadataBase` は設定せず、canonical は相対パス |
| B05 | Works の公開機能の根拠 | 全claimが draft |
| B06 | プランの利用範囲 | 未決定。料金カードは定性的な説明だけ |
| B07 | 料金の掲載承認・サブスク条件 | 金額は確認済み、掲載・販売条件は未承認 |
| B08 | 製品別のデータ取扱い | 未調査。プライバシーポリシーは確定前と明示 |
| B09 | 法務の最終承認、移設したOS LPの既存表現の再承認 | 下書き |
| B10 | プラグイン申請 | 公開判定とは別。今回は申請しない |

## 7. 検証

- Jest: `src/__tests__/pages/{home,os-landing,works-landing,contact-page,legal-pages}.test.tsx`、
  `src/__tests__/components/public/product-selector.test.tsx`、`src/__tests__/lib/public-{marketing-links,release-readiness}.test.ts`、
  `src/__tests__/public-app-boundary/middleware-boundary.test.ts`。
- Playwright（本番ビルド＋full-enforce CSP、DB不要）: `npm run build && npx playwright test --config playwright.public-site.config.ts`。
  既定の `playwright.config.ts` からは除外している（本番ビルド前提のため）。

## 8. Design Rationale（Design.md §1.2）

### Mode
- [x] EXTEND（既存の公開LP・トークン・部品を拡張。業務アプリの見た目は変更しない）

### User problem
- 初見の訪問者が、既存ツールを活かす Works と、店舗・本部管理の OS の違いを理解して選べない。

### Bottleneck diagnosis
- [x] Choice overload（製品が2つになり入口で迷う）
- [x] Pricing uncertainty（Works の料金と条件の確定度が分からない）

### Selected pattern
- P01 Choice Reduction: 初回だけ2択のモーダル、閉じても通常カード・ナビで同じ2択を常設。
- P03 Transparent Defaults / §8.4 Pricing: 3プランを全て表示し、主力（Standard）の理由を「標準的な導入に」と説明。暫定・税別・申込不可を明示。

### Ethics Gate
- User benefit: 目的別に製品を選べる。モーダルは初回のみで、×・Esc・背景・「あとで選ぶ」で閉じられる。
- Reversible: 選択は保存しない。いつでも「製品を選ぶ」・ナビで切り替えられる。
- Factually accurate: 未確認の機能は提供済みとしない（Instagram 対応中、会計等は未提供）。実績・人気表示なし。
- Reject path: 「あとで選ぶ」と×を同じモーダル内に常設。2製品は等幅・同等の重み。
- No hidden cost: 外部サービス利用料等が別途必要になりうることを料金欄・FAQ・運営者情報に記載。
- No artificial urgency/scarcity: なし。
- Long-term trust risk: 未承認の法務・価格・機能は公開前チェックで公開不可と判定する。

### Visual conformance (Section V / C)
- Tokens reused: 既存LPの色（#2B3A3F, #C4956C, #E8B87A, #FAF8F5, #F3EFE8, #E8E4DE, #595959, #1A1A1A, #3F7D5C）、和文明朝見出し、角丸、`lp-root` スコープ。
- New tokens: `.lp-root` に色トークン（`--lp-*`）を追加。Works の深緑 `--lp-works: #264a3e` は既存の緑 #3F7D5C 系を暗くした値。
  `--lp-accent-strong: #8a5a32` は淡色背景上の小さな暖色文字のコントラスト確保用（#C4956C は白背景で約2.7:1）。
  Tailwind 3 は `var()` 色に不透明度修飾子を付けられないため、透過色も個別トークンにした。
- Global styles touched: `html.lp-scroll-locked`（モーダル表示中だけ付与）のみ。他は `.lp-root` 配下。
- Screens outside the task scope visually affected: なし（`LegalFooterLinks` は変更なし。`LegalPage` は `/terms` `/privacy` `/legal` だけが使用）。

### Metrics
- 計測基盤がないため追加しない（フォームを開いた数と送信完了数を混同しない）。

### Rollback plan
- 公開ページの差分だけを revert すればよい。DB・認証・RLS の変更はない。
