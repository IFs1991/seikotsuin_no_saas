# Worksロゴの欠け修復と余白調整

## Design Rationale

- Mode: EXTEND。利用者のスクリーンショットにあるWorks末尾の欠けを修復し、元のブランドを保ったまま表示を10–15%小さく見せる依頼。
- 既存のTailwind・`BrandLogo`・`CspSafeImage`を再利用。参照画面はWorks LPのヘッダー／ヒーロー、製品選択カード。CSS・OSロゴ・総称ロゴ・リンク・本文・料金・認証には変更なし。
- 元のラスタ画像内で最後の`s`と白い縁が途切れていたため、単なるCSS縮小では復元できなかった。built-in ImageGenの編集モードで既存画像を参照して再生成。
- 原素材`src/images/brand/tiramisu-works.png`は保持し、`src/images/brand/tiramisu-works-v2.png`を追加。Worksの画像参照だけを変更する。
- 128以上のalphaを持つ画素の水平範囲は、原画像94.59%に対して新画像84.58%。同じCSS幅で見えるロゴ幅は約10.6%小さくなるため、CSSで二重に縮小しない。新画像は2172×724、透過あり、水平範囲x=172–2008で両端に余白がある。
- Ethics Gate: 製品名の判読性向上。選択・キャンセル・料金・提供条件の変更なし。行動UXパターンの追加適用なし。画像参照を戻すことで可逆。
- Metrics: Works末尾5文字と白い縁の完全な表示、PC／スマホの収まり。Guardrails: OS・総称の見え方、代替テキスト、CSP、リンク先の維持。テレメトリー追加なし。
- Blast radius: `BrandLogo`のWorks variantを使うヘッダー・ヒーロー・フッター・製品カード・比較表に適用。グローバルCSS・共有UIの既定値は変えない。
- 法務snapshotは画像参照の変更に合わせて標準コマンドで再生成。法務承認や本文を変更しない。
- Rollback: Worksのimportを元PNGに戻し、`npm run legal:manifest`を再実行。DB変更なし。

## Generation

- Tool: built-in `image_gen.imagegen`（API/CLI fallback未使用）。`transparent_background: true`。
- Edit target: `src/images/brand/tiramisu-works.png`。
- Saved asset: `src/images/brand/tiramisu-works-v2.png`。
- 以下が実際に使用した最終プロンプト。

```text
Use case: precise-object-edit / logo-brand asset repair.
Edit target: the attached existing Tiramisu Works logo, for production website headers and hero sections.
Primary request: repair the clipped final "s" of "Works" and give the complete logo balanced transparent breathing room. This is a faithful restoration of this exact existing logo, NOT a redesign.
Keep invariant: the stacked dessert / letter T icon on the left, rounded heavy dark chocolate-brown "Tiramisu" wordmark, burnt-orange "Works" subtitle aligned under the right side of Tiramisu, the existing white sticker-like outline and restrained gray edge shadow, the existing relative arrangement and character shapes.
Text (verbatim): "Tiramisu" and "Works" (W-o-r-k-s). All five letters of "Works", including the entire right curve of the final lowercase s and its white outline, MUST be fully visible.
Composition: a wide horizontal transparent PNG, approximately 3.2:1 aspect ratio. Keep the mark centered. The entire artwork including the white edge must fit inside the middle 86 percent of the canvas width, with approximately 7 percent truly transparent padding on both left and right, and adequate top and bottom clearance. Do not let any pixel of the lettering or border touch a canvas edge.
Finish: clean sharp professional edges suitable for small website logos; retain the warm brown and orange colors. Do not add decorations, extra words, backgrounds, frames or a watermark. The background must have real alpha transparency, not a painted checkerboard or black/white rectangle.
Deliver ONE repaired logo matching the reference as closely as possible.
```

## Verification

- `npm run legal:manifest:check`: PASS。
- `npm run commercial:inventory:source:check`: PASS（新しいTS/JSファイルの追加なし）。
- `npm run test -- --ci --runTestsByPath src/__tests__/pages/works-landing.test.tsx src/__tests__/pages/home.test.tsx src/__tests__/components/public/product-selector.test.tsx`: 3 suites / 28 tests PASS。
- Playwright CLI / Chromiumで`/works`・`/os`を1280px・375pxで確認。Worksのヘッダー／ヒーローの`s`と白い縁を視認し、両画面幅で横スクロール・表示中画像の破損・画像inline styleなし。OSは既存PNG参照のまま。
- スクリーンショット: `output/playwright/works-logo-v2/works-1280.png`、`works-375.png`。初回devコンパイル中のCLI timeoutは再アクセスで解消。
- `prettier --check src/components/public/brand-logo.tsx` / `git diff --check`: PASS。
- `npm run type-check` / `npm run lint`: PASS。
- マージ前に共通トップの分岐ポップアップも1280px・375pxで確認。`ProductSelectorCards`→`ProductHeading`→`BrandLogo`を通して新しいWorks PNGが使われ、OSは従来PNGのまま。末尾の`s`、余白、画像読み込み、横スクロールなしを確認。両製品への実リンク操作もPASS。スクリーンショットは同ディレクトリの`selector-1280.png`・`selector-375.png`。
- 画像参照のみの変更のため本番ビルド・全体Jestは今回再実行せず、Next devの画像最適化と関連画面を確認。変更していないOS ROIのrange入力のhydration警告は引き続き観測。
- DoD対応: `DoD-v0.1.md` DOD-10 / DOD-11、現行`docs/quality/change-dod-v1.0.md` UI/runtime。今回の残余リスクは生成画像の微細な形状差。認証・DB・RLSに変更なし。
