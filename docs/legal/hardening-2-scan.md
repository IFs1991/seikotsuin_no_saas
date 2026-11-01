# PR-2: 配信成果物と検査定数の分類

基準main `fc23881f4947a1bcc673de59b4fe0bda1bebb211` + PR-1 `b8f5d9f4ce29f18ffa1cb3a46f5f5a415771bc3a`。PR-1依存の別PR。Vercel/Production/承認台帳のstatusは変更しない。

`scripts/public-site/build-scan.ts`へスキャン責務を分離。URLの許可/拒否ルールとPLACEHOLDER_DOMAINSは既存SSOTを維持し、定数文字列の削除・難読化やファイル丸ごとの検知除外は行わない。新規依存なし（既存TypeScriptでAST解析）。

## 判定

| 分類 | 禁止ドメイン | 非公開文字列 |
| --- | --- | --- |
| HTML/RSC/ブラウザJS・map/データ | 常にBLOCK | 常にBLOCK |
| 既知のNext server出力ルートのbundle | 生成ASTがSSOTと同じdenylist配列、完全なsource map、対応する元位置が正本ソースの定数literal範囲の全条件を満たす場合だけVALIDATION_DATA。それ以外BLOCK | 常にBLOCK |
| server map | 正本全文と一致するsourcesContentの定数AST位置だけVALIDATION_DATA。他ソース/metadata/重複キー/壊れたmappingはBLOCK | 常にBLOCK |

server扱いは`server/`と`standalone/.next/server/`のみ。public/static配下は名前にserverがあってもブラウザ資産として扱う。Nextの非配布build cacheである走査root直下のcacheだけは従来どおり対象外で、`server/app/cache`等の配布応答は走査する。

判定結果はfileClass / マスク済み相対パス / 原因 / verdictを記録。私有語は内容だけでなくファイル名でも検出し、すべてのfindingのパスからマスクする。fs例外の生パスも転記しない。非公開原本はrepo外の`--private-terms-file`で指定し、値をログへ出さない。実値の原本は今回取得していない。

source mapのVLQ解釈は[ECMA-426](https://tc39.es/ecma426/)の4/5フィールドに対応。index mapや不明・破損mapを安全分類にしない。source mapを認証/法務承認の証跡とは扱わず、信頼できるbuildと一致する原稿の出所分類にだけ使う。実行時に組み立てる任意URLの全経路を静的文字列検査だけで証明するものではなく、実ページのHTML/RSC・リンク検証も必要。

## 検証

- `npm run type-check` / `npm run lint`: PASS。
- 最終の全関連Jest: **7 suites / 125 tests PASS**。scanner/CLIの23件を含む。
- `npm run build`: PASS（既存warningあり）。
- build完了後の`npm run public-site:release-check -- --scan-build .next`: **5,651ファイル、仮ドメインBLOCK各0件**。旧5655.js/mapとstandaloneコピーの8findingはAST/provenance一致によりVALIDATION_DATAとして記録。
- 法務未承認14項目＋3文書により**exit 1 / RELEASE_BLOCKEDを維持**。スキャンが正常でも公開許可にはならない。
- PR-2のローカルbuildでProduction保留E2Eも**1/1 PASS**。Preview全34件は同じアプリコードのPR-1で実施済み、PR-2はscannerのみ変更。
- 一度build更新と重なった途中スキャンはENOENTとなり、検証結果に採用していない。最終結果はbuild完了後の逐次実行。
- HTML/RSC/staticJS/mapへ禁止URL、各分類へ合成氏名/住所/電話、公開server名、配布cache、壊れ/欠損map、重複JSON key、ファイル名の非公開語を混入する負テストを追加。実値は使用しない。

独立read-onlyレビュー2件を実施。公開資産の分類、cache範囲、mapping全体検証、JSON重複キー、パスの私有語露出を修正し、両レビュー者の再確認で必須残件なし。DOD-10/11に対応。元の事業/法務残件とPR-1の外部設定未実証は継続。
