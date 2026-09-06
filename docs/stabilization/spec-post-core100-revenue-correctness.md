# PR-B 日報・収益のデータ正確性

基準main: `c028573d089cb6085ab3e29121fa9fe4d2f923c0`。対象はpost-Core100指示§4。

## 原因と修正

- 日報read modelの一覧30件を、そのまま累計・平均・月別トレンドにも使用していた。一覧は最新30件を維持し、summaryは同じclinic/date条件でDB aggregateする。月別用の必要列だけを既存`fetchAllRows`で順序付きページ取得し、1,000行上限による欠落を防ぐ。
- Revenue APIの6データソースも、clinic/date条件を全ページで保持し、既存の順序付きrange取得へ接続する。`daily_reports`は院内で一意の日付、明細はID、日別viewは日付とgroup keyで順序を固定する。途中のエラーでは部分集計を返さない。
- 根拠のない売上110%予測・固定人件費率32.5%は`null`を返し、UIは「未算出」と表示する。
- 前年売上は実データの合計を`lastYearRevenue`として返す。前年の日報がない場合は`null`、0円の日報が存在する場合は`0`。前年売上が正でない場合の成長率は`null`とし、丸めた成長率からの前年逆算を廃止する。

認可・RLS・Core100 manager exact count・本部aggregateは維持。migration、生成DB型の手編集、新規依存、本番/Preview設定変更はない。

## API契約

`RevenueAnalysisData`の既存`revenueForecast`/`costAnalysis`/`growthRate`はnullableにする。`lastYearRevenue: number | null`を追加する。hookは0円と未算出を区別し、欠損も未算出として扱う。既存の実績集計フィールドとレスポンスenvelopeは維持する。

日報`reports`の上限と`summary`/`monthlyTrends`の形は維持する。サマリーの対象は指定期間全件（期間未指定なら院内全件）。PostgREST aggregate設定が無効な環境ではエラーとし、30件の数字へフォールバックしない。Core100で記録した環境設定確認の必要性は残る。

ページングは既存`src/lib/manager-fetch.ts`を再利用し、repoの`max_rows=1000`に合わせる。各リクエストはRLS付きclientと同じscopeを使用する。複数ページは同一DB transactionのsnapshotではないため、取得中の過去日報・明細編集の厳密なsnapshot整合性は今回の保証対象外。

## REDと回帰

`reporting-correctness.test.ts`は実Supabase JS clientのfetchをローカルfixtureへ接続し、filter/order/offset/limitと1,000行上限を評価する。DB/RLSの実検証の代替とはしない。

- 初回server RED: 8 failed / 1 passed。31件40,000円が30件30,000円になること、月別欠落、1,001件目の欠落、固定予測/人件費、前年実額欠落、後続page失敗の見落としを確認してから実装した。
- 初回client RED: 4 failed / 37 passed。nullでの画面クラッシュ、hookの取得失敗、前年売上逆算を確認してから実装した。
- REDログ: `%TEMP%/post-core100-pr-b-red-server.log`、`%TEMP%/post-core100-pr-b-red-client.log`（ローカル検証ログ）。
- 31件・1,001件、他院/期間外除外、空集合、集計無効、後続ページ失敗、前年なし/0円/333円、UI未算出を検証する。既存fixtureはaggregate/range応答へ追従し、業務期待値は弱めない。

ローカル検証結果:

- server focused: 7 suites / 43 tests PASS。新規正確性11件と既存revenue API、staging data、daily reports manager認可、dashboard bootstrap、mobile daily reports/homeを含む。
- client focused: 2 suites / 41 tests PASS。`useRevenue.test.tsx`と`pages/revenue.test.tsx`。
- `npm run type-check`、`npm run type-check:commercial`、`npm run lint:commercial`、`npm run scan:secrets`: PASS。
- `npm run lint:ci`: PASS（0 errors / 129 warnings、既存のwarning許容値内）。
- source/route inventoryを再生成し、両`check`と`npm run security:verify-mutating-routes`もPASS（132 mutation / 9 side-effecting GET、分類は維持）。
- Jestは既存`npm run test -- --ci`にserver/client projectと対象パスを指定した。nested testを列挙するため、serverは`--testMatch '**/src/__tests__/**/*.test.ts'`、clientは同`.test.tsx`を使用した。

DoD: DOD-09（clinic scope維持）、DOD-10（build）、DOD-11（Jest）。full Jest/buildと実DB・Previewはローカル未実行で、PRの既存CIとPreview検証へ引き継ぐ。容量・実通知・本番設定・復旧・運用準備を本変更のPASSに含めない。

参照: [Supabase aggregate](https://supabase.com/blog/postgrest-aggregate-functions)、[PostgREST JS rangeの順序・両端inclusive仕様](https://supabase.github.io/postgrest-js/v2/classes/PostgrestTransformBuilder.html)。

## Design Rationale

- Mode: EXTEND。既存`revenue/page.tsx`のカードとTailwindクラスを保持する。
- User problem / diagnosis: 根拠のない数字と実績が区別できず、経営判断を誤る可能性がある。
- Selected pattern: P07の事実・前提を隠さない説明方針のみ。誘導や新規導線は追加しない。
- UI / copy: 既存の数値枠に「未算出」を表示。前年実額0円は0として表示する。
- Ethics Gate: 事実の正確性と判断のしやすさを改善する。費用・同意・キャンセル導線に影響しない。希少性・緊急性・仮の実績を作らない。変更はコード差分で可逆。
- Visual conformance: 既存Card/文字色/余白を再利用し、token・global style・共有defaultは変更しない。他画面のスタイル差分はない。
- Metrics: 未算出を数値として表示する誤り0件、実額0円の保持、API/UI回帰成功。新たな計測イベントは不要。
- Rollback: PR差分のみをrevertする。データ移行・DB変更はない。
