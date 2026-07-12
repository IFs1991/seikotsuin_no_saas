# 仕様: モバイルUI/UX 日付ピッカー (予約/日報/ホーム)

- 対象ブランチ: `claude/pc-screen-design-improvements-r6jhn5`(PR #84マージ後にorigin/mainから再スタート)
- 関連: `docs/stabilization/spec-mobile-uiux-role-wiring.md`

## 目的

モバイル3画面(予約・日報・ホーム)のヘッダー日付ラベルをタップするとOS標準の日付ピッカー(カレンダー)が開き、選んだ日付のデータに同一画面で切り替わる。あわせて未来日での新規予約作成を有効化する(過去日は入口で遮断)。

## アノテーション契約 (html-transform)

transform時にデザインHTMLのテキスト完全一致(`{{ dateLabel }}` / `{{ todayLabel }}`)のリーフ保持要素へ以下を付与する。厳密に1件でなければ生成が失敗する(デザイン改変の検知):

- `data-mobile-uiux-date-picker="<resource>"` / `role="button"` / `tabindex="0"` / `aria-label="日付を選択"`
- 対象: reservations・daily-reports(standardビューのピルのみ。managerは期間タブでピル自体なし)・home
- 資産バリデータ(`production-asset.ts`)が3画面=1件・他画面=0件を検証

## ピッカー機構 (bridge)

- 隠し `<input type="date">` をページに1つ遅延生成(fixed・1px・opacity 0.01。`display:none` は showPicker 不可のため使用しない)
- `[data-mobile-uiux-date-picker]` への documentレベル click / Enter / Space 委譲で起動。初期値は `currentReadParams.date`、なければJST今日
- `showPicker()` を try/catch で呼び、未対応環境(iOS15以前等)は `focus()+click()` フォールバック
- `change` で `YYYY-MM-DD` 検証 → ディスパッチ

## ディスパッチ契約

| 経路 | 挙動 |
|---|---|
| `window.__MOBILE_UIUX_ON_DATE_PICKED__(dateKey)` 登録あり | hookへ委譲(予約adapterが登録。owner-tagパターンでmount/unmount) |
| 登録なし | `MobileUiuxBridge.refreshReadData({date})`(ホーム・日報) |

## 日付パラメータ表 (bridge manifest `dateParamKeys`)

| 画面 | クエリ展開 |
|---|---|
| reservations / home | `date=YYYY-MM-DD` |
| daily-reports | `start_date=X&end_date=X`(単日読み) |
| 補足read | `forwardDate: true` の entry のみ転送(ホーム→予約のみ)。boot時・設定系readへは転送しない |

## 画面別挙動

**予約**: dateIndexの0..2クランプを撤廃し、JST今日との比較で past(0)/today(1)/future(2) を導出。‹›矢印は任意日から連続動作。**過去日はFAB(新規予約)非表示**(requested key基準なので切替中も出ない)。今日・未来日はデザインの `canWrite` のまま → **未来日の新規予約が有効**(作成ペイロードは表示中日付、サーバーは競合チェックのみで日付制限なし=意図的)。空状態文言は past「過去の予約はありません」/today「本日の予約はありません」/future「この日の予約はまだありません」。

**日報**: 単日読み(start=end)で今日以外を表示中は「本日の日報は未提出です/提出済みです」バナー(静的コピー)を抑止し、入力/編集は今日専用の入口に保つ。選択日の当日サマリー・一覧は追従。フォームを開いた時点の日付キーをスナップショットし、表示中のバックグラウンド日付切替で `report_date` がすり替わらない。

**ホーム**: エンドポイントは `date` 完全対応(KPI/予約サマリ/日報状況/担当院カードRPC)。補足の予約アジェンダにも日付が転送され不一致が起きない。今日以外の表示では「本日の売上/来院/数値」「本日合計」を選択日ラベル(例: 6/30（火）の売上)に置換。

## 既知の限界(意図した挙動)

- デザイン静的見出し「本日の予約」「本日予約」(ホーム)・「日報一覧（直近）」(日報)は資産非改変のため文言固定
- 予約のrefresh失敗時のフォールバック日付ラベルはデザインの `DAYS[dateIndex]` サンプル(既存挙動)
- 連続で日付を切り替えた場合、ホーム/日報は最後に解決したペイロードが勝つ(予約はrequested-key guardで防御)
- URLに日付は乗らない(同一画面のデータ差し替え。ブラウザバックで日付は戻らない)
- Playwrightはネイティブピッカーを操作できないため、ピッカーUIはE2E対象外(配線はユニットテストで担保)

## テスト

- `html-transform.test.ts`: 3画面のアノテート1件+属性、他画面0件、日報はバナーでなくピル
- `bridge-contract.test.ts`: input生成/再利用・showPicker/フォールバック・hook/refreshディスパッチ・不正値無視・Enter/Space、daily-reportsの `start_date&end_date` 展開、ホーム補足readへの日付転送(boot時は非転送)
- `dc-script-patch.test.ts`: hook登録/解除、複数日ジャンプ、矢印の±1超え連続動作、FAB past/today/future、pending中FAB非表示、emptyTitle3態、日報バナー抑止/boot不変/フォーム日付スナップショット、ホームの選択日ラベル
- `production-asset.test.ts`: 資産内アノテート件数検証
