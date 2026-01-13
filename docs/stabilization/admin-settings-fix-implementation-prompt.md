# 役割
あなたは Next.js(App Router) + Supabase(Postgres/RLS) + Playwright(E2E) のシニアフルスタックエンジニアです。
目的は「管理設定(Admin Settings)の永続化E2Eを安定して全パスさせる」こと。推測で作らず、テスト→原因特定→最小修正で通してください。

# コンテキスト / 参照すべき仕様書（必読）
- docs/stabilization/spec-admin-settings-contract-v0.1.md  （契約・data-testid・API contractの正）
- docs/stabilization/admin-settings-fix-spec-v0.2.md       （今回の修正優先順位。特に“永遠loading”の芽を摘む）

# 現在の失敗状況（最新E2Eログ要約）
`npm run test:e2e:pw -- src/__tests__/e2e-playwright/admin-settings.spec.ts` の結果：
- 9 tests / 6 failed / 2 passed / 1 skipped
- 失敗の内訳：
  - UI系 5本：すべて `page.goto('/admin/settings')` が `waitUntil: "load"` のまま 60s timeout
    - つまり `/admin/settings` のHTTPレスポンス or SSR/ミドルウェア/認証周りで “loadが来ない”
  - API系 1本：`PUT /api/admin/settings` で `response.ok()` が false（2xxではない）
- cleanup warning（FK制約）も出ているが、まずはテストを落としている主原因を潰す（余力があれば後で整える）

# 成功条件（Definition of Done）
1) `src/__tests__/e2e-playwright/admin-settings.spec.ts` が全パス（skippedはそのままでOK）
2) `/admin/settings` への遷移がPlaywrightで安定する（毎回60sで詰まらない）
3) `PUT /api/admin/settings` が upsert として 2xx を返し、GETで同一値が返る
4) v0.1/v0.2 の contract を破らない（data-testid、API入出力、非目標に反する変更をしない）
5) “対症療法だけ”は禁止：タイムアウト待ちやsleepで誤魔化さず、ロードが詰まる根因を潰す

# 作業手順（この順で実行）
## A. 再現と観測を固める
1) `npm run dev`（もしくはE2Eが前提とする起動手順）で `http://localhost:3000/admin/settings` を手で開き、表示されるか確認
2) Playwrightを同条件で実行：
   - `npm run test:e2e:pw -- src/__tests__/e2e-playwright/admin-settings.spec.ts`
3) HTMLレポート確認：
   - `npx playwright show-report`
4) 失敗5本の `page.goto('/admin/settings')` で止まっている時に、以下を必ずログで取る（テスト側の一時ログ追加OK、最後に消す）：
   - `page.on('console', ...)` / `page.on('pageerror', ...)`
   - `page.on('requestfailed', ...)`
   - `page.on('response', ...)` で `/admin/settings` と `/api/**` のステータス
   - `await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' })` に変えると進むか（※“進むなら”根因はloadイベントを阻害するSSR/長いリソース待ち）
   - 302/307でログインへ飛ばされていないか（認証未注入ならテスト基盤修正が必要）

## B. UIが詰まる根因の修正（優先）
観測結果に応じて最小修正を入れる。狙いは「/admin/settings のレスポンスが確実に完了し、Playwrightのgotoが解決する」こと。

- もし `/admin/settings` がSSRで外部/DBフェッチを待って固まっているなら：
  - サーバー側の fetch に必ずタイムアウト（AbortController）を入れる
  - “UIを止めない”方向に倒す（v0.2の指示通り、プロフィール/APIが詰まっても画面骨格は描画する）
- v0.2のP1を実装：
  1) `src/hooks/useAdminSettings.ts`
     - `persistOptions` をプリミティブ分解して依存配列に入れる（オブジェクト参照差分でeffectループしない）
     - 初回fetchと保存中stateを分離（ロード中にSave永続disableにしない）
  2) `src/hooks/useUserProfile.ts` と `UserProfileProvider`（存在する場合）
     - Providerがあるなら二重fetchをやめる
     - profile fetchにタイムアウトを入れる（無限loading禁止）
     - cookie/session metadata から初期値を立て、E2Eで `/api/auth/profile` が詰まってもUIを止めない

※ テスト側で `waitUntil: 'domcontentloaded'` に変えるだけで“通った風”にするのは最後の手段。
どうしてもNext.jsの仕様で `load` が不安定な場合のみ、理由をコメントで明記し、`goto`の待ち条件を切り替える。

## C. PUT /api/admin/settings の失敗を潰す（次点）
- `src/pages/api/admin/settings.ts` もしくは `src/app/api/admin/settings/route.ts`（実体を探索して特定）を確認
- 失敗時のステータス/レスポンスボディをテストログで取得し、原因を断定
- よくある原因と対策：
  - RLS/権限：E2Eの認証コンテキストで upsert できていない → service roleの使用範囲を見直す or RLSポリシー調整（ただし過剰権限は禁止）
  - `clinic_id` の取り扱い：クエリ/ボディのどちらを正とするかをv0.1契約に合わせる
  - upsertキー不一致：`clinic_id` のユニーク制約/ON CONFLICT対象がズレている
- v0.1 contractに沿って「未登録ならinsert、登録済みならupdate」になっていることを確認し、2xxを返す

## D. FK cleanup warning（余力があれば）
- 今はwarningでテスト落ちていないが、E2E安定化のために削除順やCASCADEを整える
- ただしスキーマ変更が大きくなるなら後回し（まずDoDを満たす）

# 変更の出力（あなたが返すべきもの）
1) 根因の短い説明（なぜgotoがtimeoutしていたか / なぜPUTが2xxでなかったか）
2) 修正内容の箇条書き（ファイル単位）
3) 実行コマンドと結果（テストが全部パスしたログ要約）
4) 重要：不要になった一時ログ/デバッグコードは消してコミット可能状態にする

# 制約
- v0.1のdata-testid契約を破らない
- スリープ/リトライ地獄で誤魔化さない
- セキュリティ劣化（RLS無効化や全許可）は禁止。必要なら最小範囲で説明付きで行う
- コード規模は最小。修正の焦点は「/admin/settings ロードの詰まり」と「PUT upsert」を潰すこと
