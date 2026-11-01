# Issue #167 実装・検証・独立レビュー記録

確認日: 2026-11-01 JST。OS基準main `cc1803744e12da7c8ef161956515f860c0091fd2`。Works読み取り基準main `de74853be6f4f9171df776f28f2c64893233c35d`。

## 変更内容

- `/privacy`: 共通/OS/Works/フォーム/本人請求を分離。院と委託処理、医療DPA、Geminiへの送信経路、ChatGPT/MCP、OAuth/Vault、禁止入力、委託/第三者/国外提供、分類ごとの保持・解除・削除・バックアップの境界を明記。
- `/terms`: 成立/価格/支払/期間/更新/解約/返金、OS医療責任、Worksの依頼/保存/認可/承認/送信、結果不明時の照合、AIの限界、データ/知財/秘密保持/責任/変更/準拠法を整理。未決定条件は未確定のまま。
- `/legal`: 運営者情報の既存承認制御を維持。Works `worksPlans`、OS `planItems`と追加店舗料金を再利用。税・販売条件を独断で確定しない。
- `release-readiness.ts`: 文書別の版・承認証跡・実日付・未解決事項とB01〜B09の完全性を純粋関数`getLegalPublication`で判定。現在の承認statusは引き上げない。B10申請は別ゲート。
- `LegalPage`: 未承認時の警告と日付保留を維持。正当な文書承認時だけ警告を消し、承認された改定日・施行日を表示。metadataも同じ判定。
- 公開チェック: 文書承認も最終判定に加算。フォーム等の確認エラーとは別集計。例外・バイパスなし。

## 実行結果

| 検証 | 結果 | 範囲・制約 |
| --- | --- | --- |
| `npm run type-check` | PASS（exit 0） | `tsc --noEmit` |
| `npm run lint` | PASS（exit 0） | 既存npm script。build時の既存warningは別途残る |
| 指定5スイートのJest回帰（最終実行） | PASS: 99/99 | `legal-pages.test.tsx`, `legal-publication.test.ts`, `public-release-readiness.test.ts`, `public-operator-profile-ssr.test.ts`, `public-release-check-env.test.ts` |
| 合成ビルド漏えいスキャンの追加後、`public-release-check-env.test.ts`再実行 | PASS: 8/8 | 未公開文字列を合成HTMLへ混入→検出、除去→0件。実値はログ非表示。安全なスキャン結果でも承認待ちはブロック |
| `npm run build` | PASS（exit 0） | Next.js 15.5.24。既存UpstashのEdge Runtime警告、既存UIのlint warningあり。180ページ生成、本番デプロイは未実施 |
| `npm run public-site:release-check` | EXPECTED_BLOCK（exit 1） | 未承認14項目、法務3文書の承認未完了。B10は既存の申請用deferred |
| `npm run public-site:release-check -- --scan-build .next` | BLOCK（exit 1） | 5,624ファイル検査。未承認に加え、禁止リスト自体の文字列を含むサーバーchunk/map（standaloneコピー含む）各4ファイルを検出。確認エラー2件。除外例外なし |
| `npm run test:e2e:pw -- --config playwright.public-site.config.ts` | PASS: 34/34 | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3121`。ローカル本番ビルド・full-enforce CSP。法務3ページ375/1280px、200応答/目次/アンカー/窓口/横はみ出し/既存全導線。実フォーム送信・DB fixture書込みなし |
| `git -c core.longpaths=true diff --check` | PASS（exit 0） | whitespace検査 |

実行したJestコマンド:

```powershell
npm test -- --ci --runInBand --runTestsByPath src/__tests__/pages/legal-pages.test.tsx src/__tests__/lib/legal-publication.test.ts src/__tests__/lib/public-release-readiness.test.ts src/__tests__/lib/public-operator-profile-ssr.test.ts src/__tests__/lib/public-release-check-env.test.ts
```

初回JestでCLI集計の衝突、Jest/SWCのexport spy制限、SSRのNext Image request-context依存を検出した。CLIの文書集計を分離し、テストのmodule mockを明示リセット、SSRは画像描画のみ置換して法務・運営者・ヘッダー/フッターを実コンポーネントで検証するよう修正した。認可や非公開値の期待値は弱めていない。

E2Eの初回実行はサンドボックスがlocalhostソケットを拒否したため中断し、許可されたローカル実行で再実行して全件通過。スクリーンショット6枚を`output/playwright/issue-167/`に出力し、モバイルprivacyとデスクトップlegalの警告・目次・非公開値保留表示を目視確認した（生成画像はコミット対象外）。

ビルドスキャン検出ファイルは`.next/server/chunks/5655.js`/`.map`と`.next/standalone/.next/server/chunks/5655.js`/`.map`。source mapの`sourcesContent`で該当文字列の出所が`src/components/public/release-readiness.ts`であることを確認。`getLegalPublication`から既存のorigin検証を利用するため、禁止ドメインの検査用定数もサーバービルドに含まれる。スキャン自体は正しく検出している。実ページの仮URLとして利用しているという意味ではないが、公開前チェックはこの2件も含めてブロックする。文字列の難読化・検知除外・例外による通過は行わない。

## 独立レビューとセルフレビュー

実装後、独立read-only subagentを2つ実施。両者とも編集・外部書込みなし。

1. `legal_data_review`: 法務と実コード、OS/Works責任、Gemini送信、価格、保持/削除/解除/バックアップを監査。P2: エビデンス表の誤った関数名・不存在パスを指摘。実在するroute内の`buildInsightInput` / `requestAiInsights` / `createInsightsPrompt`へ修正し、再レビューで解消を確認。
2. `publication_security_review`: 公開判定、版・日付・必須値、B10、SSR/metadata、既存導線を監査。P1: 未承認3文書をフォーム検証エラー数へ混在させた点を指摘。`documentBlockers`として分離し、最終ブロックに両方を渡すよう修正、CLIテストで確認。再レビューで解消。

両監査とも静的確認の範囲で追加の重大/必須修正残件なし。監査者はテスト・build・ブラウザ・本番運用や法務承認を検証したものではない。

ビルドスキャンの検出後、`publication_security_review`が追加read-only監査を実施。一致はserver chunk/mapとstandaloneコピーのみで、HTML/RSC/client staticには一致を確認しなかった。重大な情報漏えいやゲート回避とは判定せず、承認待ち実装PRのP1公開前技術残件として記録する方針を確認。事業者承認だけではこの技術ブロッカーは解消しない。スキャン無変更・無除外で再検証する作業が残る。

セルフレビュー: 価格/個人情報のSSOT、既存section id/目次、`/privacy#requests`、2つのcontact intent、canonicalとmetadata、未承認値の非表示、既存共有UIの利用範囲を確認。EXTENDとし、グローバルCSS・テーマ・ヘッダー/フッターに変更なし。React Best Practicesの観点でServer Componentのまま保持し、秘密をclient propsへ渡す経路や不要なeffect/ネットワークを追加していない。

## 残作業・公開判断

**本番公開不可（RELEASE_BLOCKED）**。技術的な掲載基盤の実装を法務承認・法令適合・本番稼働証明としない。

P0は[決定台帳](issue-167-decisions.md)のB01〜B09、P1はMeta/外部削除・禁止情報の受付防止の運用確認および上記ビルド検出。各担当と解消方法は同台帳に記録。B10のプラグイン申請は別手続。実フォームの受信/返信、Worksの実プロバイダ・削除タスク、保存先リージョン/契約、非公開原本による実値スキャン、本番E2Eは未実施。

本番DB/設定・Auth/OAuth・Worksリポジトリへの書込み、本番デプロイ、法務承認の代行、プラグイン申請は実施していない。既存未追跡ファイルは保全。Windows長パスによりブランチ切替時に作成できなかった4追跡ファイルは`core.longpaths=true`で復元し、タスク差分に削除がないことを確認。
