# spec-mobile-uiux-performance-v0.1 — モバイルUI/UX 読み込み・書き込み速度改善

- ステータス: 実装対象(P1〜P3)/ フォローアップ(P4〜P5)
- 対象ブランチ: codex/mobile-uiux-manager-scope
- 関連: spec-mobile-uiux-production-shell-write-rollout-v0.9, spec-mobile-uiux-mock-to-production-api-v1.0

## 背景(計測外コストの棚卸し)

モバイル画面を1回表示(Bottom Nav遷移含む)するたびに発生しているコスト:

1. 画面HTML取得(`src/lib/mobile-uiux/screen-route-handler.ts`)
   - サーバ側で `auth.getUser()` → `getUserAccessContext` → `resolveMobileUiuxPrincipal`(manager時は追加DB)→ エンタイトルメント照会、と直列3〜5往復
   - 60〜110KBのHTMLを `no-store` で毎回フル転送
2. JSアセット4本(`support.js` 58KB / `clinic-shared.js` 4KB / `react-runtime.js` 約540KB / `mobile-bridge.js`)
   - 各リクエストが同じ認可チェーンをフル実行、全て `no-store` で毎回再ダウンロード
3. ブリッジ boot(`src/lib/mobile-uiux/bridge-manifest.ts`)
   - `/api/mobile-uiux/context` 取得(認可チェーン再実行+表示名+クリニック名DB)
   - 完了後に画面データAPI、さらに完了後に supplemental reads を for ループで直列取得
4. Bottom Nav 遷移は `location.assign()` のフルリロードで上記を毎回繰り返す

合計: 1遷移 ≈ 7〜8リクエスト / 約800KB転送 / 直列DB往復20回前後。

## 変更内容

### P1: JSアセット・画面HTMLのキャッシュ化(ETag + Cache-Control)

- 対象: `src/lib/mobile-uiux/screen-route-handler.ts`
- JSアセット(`support.js` / `clinic-shared.js` / `react-runtime.js` / `mobile-bridge.js`)
  - ユーザー固有情報を含まない(`mobile-bridge.js` はenvフラグのみに依存)
  - `Cache-Control: private, max-age=3600, must-revalidate` + `ETag`(sha256)を付与
  - `If-None-Match` 一致時は 304 を返す(認可チェックは従来どおり通過後)
- 画面HTML
  - `Cache-Control: private, no-cache` + `ETag`(最終応答内容のsha256)
  - 内容はユーザー・フラグ依存(P2のcontextインライン後)だが、ETagは内容ハッシュなので
    同一ユーザー・同一内容の再訪時のみ304になる。ブラウザキャッシュは `private` でユーザー端末に閉じる
- 不変条件: 304を返す場合も認可判定(401/403/404)は完全に通過した後。判定に失敗した応答は従来どおり `no-store`

### P2: context ペイロードの画面HTMLインライン化

- 対象: `screen-route-handler.ts`, `bridge-manifest.ts`
- 画面HTML配信時、サーバは context API と同一形状のエンベロープを計算済みのため、
  `<script data-mobile-uiux-inline-context>window.__MOBILE_UIUX_CONTEXT__ = {...}</script>` として応答に注入する
  - `displayName` / `accessibleClinics` の2クエリは資産ファイル読み込みと並列実行
  - JSON文字列は `<` を `<` にエスケープ(script要素内XSS防止)
- ブリッジ boot(): `window.__MOBILE_UIUX_CONTEXT__` が成功エンベロープとして妥当なら
  `/api/mobile-uiux/context` の fetch をスキップ。妥当でなければ従来どおり fetch(フォールバック)
- 効果: 遷移ごとに1往復(認可チェーン込み)削減。boot完了待ちでブロックされる早期書き込み
  (`mutateMobileBff` の `await bootPromise`)も短縮

### P3: 直列往復の並列化

- 読み込み系ルート(home / reservations / daily-reports / settings / settings-detail / patient-analysis):
  `ensureClinicAccess` とエンタイトルメント照会を並列実行。**アクセス判定を先に評価**し、
  拒否時はエンタイトルメント結果を使わず即時エラー(fail-closed維持)
- `daily-reports` POST: エンタイトルメント照会と `validateDailyReportWriteScope` を並列実行。
  両方の判定が通ってから upsert
- ブリッジ `hydrateSupplementalReadData`: for-await直列 → `Promise.all` 並列

## フォローアップ(本specでは実装しない)

- P4: JSアセット配信の認可軽量化(JWTローカル検証のみへ縮退、またはビルド時に `public/` へ移設)。
  認可セマンティクスの変更を伴うため別spec化
- P5: 書き込み応答の再読込スリム化(upsert returning + DTOからの応答合成)。
  dcアダプタが消費するAPI契約の変更を伴うため別spec化

## テスト

- `src/__tests__/api/mobile-uiux-access.test.ts`: ETag/304/Cache-Controlの検証を追加
- `src/__tests__/mobile-uiux/bridge-contract.test.ts`: インラインcontext時にcontext fetchをスキップ、
  不正なインラインcontext時はfetchへフォールバック、supplemental reads並列化後の適用結果維持
- 既存の read/write ルートテストは並列化後もグリーンであること(挙動契約は不変)

## ロールバック

- 本specの変更はアプリ層のみ(マイグレーションなし)。`git revert` で完結
