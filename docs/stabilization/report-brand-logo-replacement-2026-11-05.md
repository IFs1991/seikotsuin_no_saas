# Tiramisu 製品ロゴ差し替え

## Design Rationale

### Mode

- EXTEND。`Design.md` Section Cに従い、既存のTailwind・公開LPトークン・`CspSafeImage`を再利用。
- 参照した既存画面: 共通トップ `/`、製品LP `/works`・`/os`、`ProductSelectorCards`。

### User problem / Bottleneck diagnosis

- 文字だけの製品名・W/Oのモノグラムでは、提供されたブランドロゴとの対応が伝わりにくい。
- Other: ブランドと製品の識別。行動UXパターンP01–P11の追加適用はない。

### Selected pattern / UI change

- 公開サイト用`BrandLogo`に総称・Works・OSを集約。画像の縦横比・代替テキスト・厳格CSPを維持。
- 製品LPのヘッダー・ヒーロー・フッター、共通トップの説明図、製品カード・初回の製品選択モーダル、PCの比較表見出しを製品ロゴに変更。
- OS業務画面の`Header`はOSロゴに変更。
- 共通トップ・問い合わせ・法務の共通ヘッダー／フッターは総称ロゴと従来の表示寸法を維持。
- ナビゲーション、CTA、本文、スマホの比較表、小さな機能図のラベルは読みやすい文字のまま。

### Copy change

- 説明文・料金・相談／予約の導線の変更なし。Worksの製品名バッジを同じ名前のロゴに置換。

### Ethics Gate

- User benefit: 製品識別の一貫性。
- Reversible: 画像参照と局所的なマークアップのみ。
- Factually accurate: 利用者提供の透過PNGをバイト単位でそのまま使用。
- 拒否・閉じる・キャンセル、料金、提供条件、選択状態は変更なし。
- 隠れコスト・人工的な緊急性・希少性の追加なし。
- Long-term trust risk: 素材自体の縁の品質。Worksは右端の余白が少なく、OSは白い点が残る。

### Visual conformance

- 既存Tailwindの幅・余白と、`CspSafeImage`による画像最適化／CSP対策を再利用。
- グローバルCSS・テーマ・共有UIのデフォルト・依存関係・lockfileの変更なし。
- `MarketingHeader`と`MarketingFooter`の利用箇所を確認し、製品ごとの表示だけを指定。総称ロゴの既存寸法を維持。
- 認証・認可・clinic scope・DB・RLS・課金ロジックの変更なし。
- 共通ヘッダー／フッターの依存グラフ変更に伴い`legal-content-snapshot.json`を標準コマンドで再生成。法務承認は変更しない。

### Metrics

- Primary: 対象箇所で正しい製品ロゴが表示される。
- Guardrails: スマホの横スクロールなし、リンク先・モーダル操作・代替テキスト・CSPの維持。
- 行動変更・実験ではないため新規テレメトリーなし。

### Rollback plan

- この変更で導入したロゴ参照と局所マークアップを元に戻し、`npm run legal:manifest`で法務依存hashを再生成する。DB変更なし。

## Verification

- `npm run type-check`: PASS。
- `npm run lint`: PASS。
- `npm run test -- --ci --runTestsByPath src/__tests__/pages/home.test.tsx src/__tests__/pages/works-landing.test.tsx src/__tests__/pages/os-landing.test.tsx src/__tests__/components/public/product-selector.test.tsx src/__tests__/components/navigation/header-logout.test.tsx`: 5 suites / 37 tests PASS。OS LPのdynamic componentに既存の`act`警告あり。
- `npm run legal:manifest:check`: PASS（法務承認ではない）。
- `git diff --check`: PASS。
- Playwright CLI / Chromium: 375px・1280pxで `/`・`/works`・`/os`・`/contact`・`/privacy`を確認。横スクロール・読み込み済み画像の破損・画像のinline style・エラーoverlayはいずれもなし。各ヘッダーの総称／製品ロゴを確認。
- 製品選択モーダル: PC・スマホのスクリーンショットを確認。画像を含む製品見出しのaccessible nameが保持され、Works・OS両方の実リンクでそれぞれのページに移動できることを確認。Escapeで閉じる操作も確認。
- スクリーンショット: `output/playwright/brand-logo/`（`selector-375.png`、`selector-1280.png`、各LPの375px・1280pxなど）。
- ブラウザの残余警告: 変更していない`/os`のROI計算欄の`input type="range"`に空のstyle属性のhydration差分を観測。ロゴ画像にinline styleはない。認証が必要なOS業務画面の実ブラウザ表示は未実施（`Header`の既存Jestを実行）。
- 原素材と追加資産のSHA-256一致を確認。画像編集・再生成なし。
- React best-practicesスキルのチェックリストで、変更したTSXの型・セマンティクス・代替テキスト・画像最適化・既存コンポーネント再利用を確認。
- `npm run build`: PASS（183/183ページ生成、exit 0）。Windowsサンドボックス内の実行は中断し、通常のローカル実行環境で完走。変更していないRedis/Edge Runtime・既存の色指定やフォームなどに警告あり。ロゴ表示の新規エラーなし。
- `prettier --check`（変更した8つのTSX）: PASS。
- 歴史的DoDとの対応: `DoD-v0.1.md` DOD-10（型・lint・ビルド）、DOD-11（関連Jest回帰）。全体DoD・出荷資格のPASSを意味しない。
- 現行基準: `docs/quality/change-dod-v1.0.md` UI/runtime。リスクはMedium（ブランド表示のみ）。

## 2026-11-06 マージ前の確認

- PR #177。最新main `67f264e76f58a2a65585a8fb9f0397674f508fd3`を取り込み、mainの法務文書3件との差分ゼロを確認。法務snapshotは標準コマンドで再生成し、承認状態は変更しない。
- head `f3bcd3333a21394cb1d2050b7502cccec700bb1f`で既存5 suitesに`src/__tests__/lib/legal-manifest.test.ts`を加えて再実行し、6 suites / 54 tests PASS。`npm run legal:manifest:check`と`git diff --check`もPASS。
- 同headのVercel PreviewはREADY。CI run `42056729650`は`Verify commercial source inventory drift`でFAILし、後続jobはSKIPPEDだったため、全CI成功とは扱わない。
- 原因は`BrandLogo`の新規ファイルに対する生成台帳の更新漏れ。`npm run commercial:inventory:source`による差分は`scannedSourceFiles: 689 → 690`の1行のみ。DB参照・RPC・権限の変更なし。`npm run commercial:inventory:source:check`はPASS。
- この台帳修正を追加したheadでGitHub checksを再実行する。マージ結果はPRを参照。
