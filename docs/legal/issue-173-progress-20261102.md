# 共通3ページ最終化 — 途中経過 / Issue #173

- 作業日: 2026-11-02 JST
- 基点: OS main `4f0ca78ad982e0923bee9e15ac1b52a17a1f28c3`
- 対象: `/terms`, `/privacy`, `/legal`（Worksの申請用3ページ、plugin manifest、DB変更は対象外）
- 配信: 未実施。本番の3ページは2026-11-02時点でhold/noindex。未確認の商用条件を勝手に確定しない。

## このブランチで原稿に反映したもの

1. `/terms`: 公開Webにcheckoutはないが、運営者は別途提示した条件で有料契約の申込みを受ける、という事業者確認済みの実態を反映。個別条件/成立を捏造しない。運営者氏名・ブランド・公開用業務メールの承認済みと、窓口については本人完了申告/証跡照合中を分離。
2. `/privacy`: Supabase両projectのTokyo regionを2026-11-02のSupabaseプロジェクト一覧（メタデータのみ）で確認。国内DBリージョンを外国移転ゼロと取り違えない。Worksの本文・画像・動画の実ファイル処理およびコード上の24時間期限/7日延長/Storage削除の違いを明記。受信・通知・返信の本人確認済み申告と、保存期限の証跡確認待ちを分離。
3. `/legal`: Webで直接申込み/決済できないことと、別途条件でWorksの有料申込みを受け付けることを両立して記述。OSの商用契約については断定しない。料金は既存SSOTのまま。

## 絶対に公開確定しない残件
- B07: 実価格と税込/税別、標準/個別契約の支払・期間・更新・解約・返金・提供開始・追加費用・動作環境の実値照合（Works/OS別）。
- B08: 各カテゴリの保持・バックアップ・サポート/監査・国外移転/再委託の実設定と、実ジョブ稼働の証跡。Works DBに存在する削除関数: `cleanup_content_media`, `cleanup_content_line_assets`, `purge_expired_slack_request_data`, `purge_expired_slack_broadcast_data`。これは定期実行・削除成功の証拠ではない。
- B08/B09: OS患者/医療情報、Gemini経路、DPAと責任分界の確定。
- B03: 所在地・電話番号の請求時開示・本人確認の実際の応答フロー。非公開原本をrepoへ置かない。
- B09: 3文書の最終原稿・版・hash・根拠・実施行日と公開承認。OpenAIのプラグイン申請は別工程。

## 初回ドラフト時の記録（以下の検証・マージ指示は後続依頼前の状態）
- `legal-content-snapshot.json` の3変更文書のSHA-256は更新済み。既存mainの3文書の計算値が既存snapshotと完全一致することを先に検証し、変更後のソースを同一フォーマット（legal-source-v2、UTF-8/LF、依存ファイル一覧、画像base64）で再計算した。`unresolvedFields`/入力ファイル一覧に変更はない。ただしリポジトリ本来の `npm run legal:manifest:check` / Jest / build はこの環境では**未実行**であり、CIの実結果を確認する。
- 現状の `LegalReviewRequired`、`LegalPendingValue`、`legalDocumentApprovals`、`getLegalPublication`、`LEGAL_PUBLICATION_MODE` を無理にPASSにしない。3ページだけの文書公開がOS/Works LP全体の商用承認に不必要にブロックされる場合、文書固有の要件を保った別ゲートに設計する。ただしB08等必要なプライバシー/契約の証跡は維持。
- モバイル/SSR/metadata/未承認値非漏洩/Works申請用ページへの回帰テストを実施。type-check、lint:ci、focused Jest、build、`npm run public-site:release-check -- --scan-build .next`、Playwrightを記録。
- プロダクション配信の変更、法務承認、公開、マージはまだ実行しない。自己レビューでは独立レビューを代替できない。

## 確認根拠
- Repo: `docs/legal/issue-167-decisions.md`, `docs/legal/issue-167-data-evidence.md`, `docs/legal/works-submission-data-evidence-20261101.md`, `docs/legal/works-submission-owner-confirmations-20261102.md`
- 既存PR #172の事業者承認と公開保留の記録
- 消費者庁: https://www.no-trouble.caa.go.jp/qa/advertising.html
- 個人情報保護委員会: https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/
- OpenAI: https://developers.openai.com/plugins/plugin-guidelines

**このブランチは「法務3ページ完成」の宣言ではない。** 確認済み事実の原稿反映を先行した作業用成果物である。

## PR #174 レビュー・修正（2026-11-02 JST）

後続の事業者依頼は、安全なsquashマージまでを対象とする。正式公開、承認レコードの更新、本番環境変数の変更、Works private plugin 1.0.1・申請パッケージの変更は含まない。Issue #173の正式公開要件は未完了のまま残す。

- 最新main `4f0ca78ad982e0923bee9e15ac1b52a17a1f28c3` をfetchして照合。元head `c2903ad1c505867d09f2a8ee30b93d99f5761634` はmainを含み、競合・重複実装なし。既存の未追跡作業は保全。
- 元headのCI [41330737911](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/41330737911) はJest 2 suite / 4件失敗。確認済み事実の修正で旧期待値が不整合となった3件と、否定文「必ずしも」を保証表現と検出した1件。ゲートを緩めず、事実に対応する期待値と個別条件の確認を案内する文へ修正。
- 独立read-onlyレビュー2件（事実・契約条件／公開制御・非露出）。共通hold画面の「受付・返信の運用確認も完了していません」という旧説明を、事業者の完了申告・証跡照合中へ訂正。Works側の表示文字列は変更なし。修正後の再レビューでblocking指摘なし。
- 共通部品修正に伴い `npm run legal:manifest` で6文書を正規再生成。各文書の `inputFiles`・`unresolvedFields` はmainと同一。Works専用3ページ・料金SSOT・承認台帳・配信判定は変更なし。hash再生成は法務承認ではない。
- SSRのhold文言と本文非露出を同時検証する負テストを追加し、修正前FAIL→修正後PASSを確認。Playwrightでも同じ確認を追加。掲載承認済み事実・有料申込み・東京region・本番削除時刻の未確認状態を回帰テストで確認。
- ローカル実行: `legal:manifest:check` PASS、`type-check` PASS、`lint:ci` PASS（0 errors / 127 existing warnings）、`scan:secrets` PASS、`git diff --check` PASS。関連Jest 7 suites / 144 tests PASS（legal-pages、public-release-readiness、legal-manifest、legal-publication、legal-production-delivery、works-legal-build、works-legal-publication）。Node.js 24.18.0 / npmを使用。
- マージ前の匿名本番GETは共通3ページ・Works専用3ページともHTTP 200、hold/noindex、検査対象の原稿文字列非露出。マージ対象headのCI、最終build／Playwright／release-checkとマージ後デプロイの実結果はPR最終記録で確認する。`RELEASE_BLOCKED` は正式承認未完了による想定結果として維持する。

### Change DoD / Design

High risk（public/legal）。`docs/quality/change-dod-v1.0.md` のruntime・UI・独立review、歴史的DoD-07/10/11に対応。EXTEND：既存の `LegalPage` / `LegalArticle`、和紙LPのTailwind/CSSとアンカー・レスポンシブ構造を継承。新規トークン・依存・グローバルスタイル変更なし。行動UXパターン追加なし。Ethics Gateでは確認済み事実と未確認事項を区別し、架空の条件・承認や購入誘導を追加しない。成功条件は事実性とholdでの非露出、ガードレールはnoindex・窓口導線・Works非回帰。rollbackは承認ゲートを維持した通常のrevert/forward-fixとし、reset/force pushを使用しない。

正式公開のP0は上記B03/B07/B08/B09のまま。事業者・運用担当・専門家が根拠を確認するまで、本文をhold/noindexで非配信とする。マージを正式公開や法的承認と同一視しない。
