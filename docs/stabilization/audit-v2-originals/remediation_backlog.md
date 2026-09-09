# Tiramisu OS 修正バックログ — 更新版 v2

- 更新日：2026-09-06（Asia/Tokyo）
- 文書ID：`TIRAMISU-OS-BACKLOG-V2-4f77944`
- 現行基準：`4f7794402400790afffb0c41db5538c9f97884a3`
- 対象：`IFs1991/seikotsuin_no_saas`
- 詳細監査：[tiramisu_os_technical_audit_2026-09-06_v2.md](tiramisu_os_technical_audit_2026-09-06_v2.md)
- 旧 `remediation_backlog.md`（beb0978基準）の更新版。内容を混ぜて二重実装しない。

## 0. Codexへの最初の指示

この2文書を読み、現行コード・既存AGENTS/CLAUDE/Design規約・作業ツリー・対象SHAを確認する。旧監査と異なるHEADなら、未解消IDだけ再検証してから進める。**調査だけで終わらず、承認範囲内で明確なコード修正を行う。** ただし本番DB・課金・外部送信・設定・機能停止を無断で実行しない。

本書のF01〜F24は初版技術監査の番号であり、repo内のF-01〜F-20とは別。R1=F06、R2=F09。同じものを別チケットとして直さない。

「CODE_FIXED」は再実装しない。「VERIFY_FIRST」はまず仕様/運用経路/実再現を確認。「ENV_PENDING」はコードを増やしてPASSにせず、実環境の証拠を取りに行く。部分解消は達成範囲を保持する。

### 実行の共通ルール

- [ ] HEAD・作業ブランチ・未commit変更と、監査基準との差分を記録。
- [ ] ID / 現在状態 / 変更ファイル / migration有無 / RED / 受入条件の対応表を更新。
- [ ] 実際の対象API・hook・UI・DB契約に対するREDを先に作る。縮約probeを本体テストの代替にしない。
- [ ] 最小修正→関連回帰→既存CIで検証。依存PRは統合後のSHAでも確認。
- [ ] skip/flaky/blockedとPASSを分離。件数を固定値へ合わせるためにテストを消さない。
- [ ] RLS/認可/課金/service-only ACL/tenant制約/秘密保護を維持。
- [ ] migrationはappend-only。適用済み履歴の編集・削除・squash・無断repairは禁止。
- [ ] merge/push/DB/設定/有料変更/負荷/外部通知は各環境の承認境界に従う。

## 1. 完了済みとして維持するもの

チェック済みは「この文書の基準SHAで対象コード改善を確認」であり、今回の新しい実装や本番試験を実行した印ではない。

- [x] F02：ログイン画面GETと実認証試行枠の分離。
- [x] F05：固定指標の未算出化、前年実額の返却。
- [x] F07：一覧30件と期間summaryの分離。
- [x] F08：特定した収益経路の全ページ取得と予約keyset/UI追従。
- [x] F13：保存成功とprojection取得失敗の分離。
- [x] F21：限定image retry改善と最終mainの型検証完走。
- [x] N01：患者PATCH未指定値の保持。
- [x] N02：email lease/CAS/試行上限とResend HTTP冪等キーのコード改善。

完了済み箇所の詳細：[S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [S15: 日報read model・一覧/集計分離](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/daily-reports/read-model.ts) / [S16: 予約API・ページング/保存/通知/CAS](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/reservations/route.ts) / [S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql) / [S25: email worker・lease回収/CAS/試行上限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/processor.ts) / [S26: Resend HTTP idempotency key](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/notifications/email/resend-provider.ts) / [S41: 患者PATCH schema/mapper](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/customers/schema.ts)。

### 部分解消を壊さない

- [x] F01：middleware入口・nonce伝播・login production CSP試験の追加。
- [ ] F01：認証後のproduction業務CSPはENV-02で確認。
- [x] F12：応答前enqueue待機と「通知claim＋outbox」の同一transaction。
- [ ] F12：予約commitから通知intentまでの欠落窓・端点間保証はPR-U07/ENV-03。
- [x] F14：サーバー読取→UPDATEのraw updated_at CAS。
- [ ] F14：ブラウザ編集開始versionの契約はPR-U08で必要性から確認。

## 2. 全24項目の実装ルーティング

| ID | 状態 | 優先 | 次の単位 |
|---|---|---|---|
| [F01](tiramisu_os_technical_audit_2026-09-06_v2.md#f01) | PARTIAL | P1（認証後の環境試験） | ENV-02 |
| [F02](tiramisu_os_technical_audit_2026-09-06_v2.md#f02) | CODE_FIXED | 維持 | 維持 / ENV-01 |
| [F03](tiramisu_os_technical_audit_2026-09-06_v2.md#f03) | OPEN | P1 | PR-U01 |
| [F04](tiramisu_os_technical_audit_2026-09-06_v2.md#f04) | OPEN | P1 | PR-U01 |
| [F05](tiramisu_os_technical_audit_2026-09-06_v2.md#f05) | CODE_FIXED | 維持 | 維持 |
| [F06](tiramisu_os_technical_audit_2026-09-06_v2.md#f06) | OPEN | P1 | PR-U02 |
| [F07](tiramisu_os_technical_audit_2026-09-06_v2.md#f07) | CODE_FIXED | 維持 / ENV-01 | 維持 / ENV-01 |
| [F08](tiramisu_os_technical_audit_2026-09-06_v2.md#f08) | CODE_FIXED | 維持 / ENV-04 | 維持 / ENV-04 |
| [F09](tiramisu_os_technical_audit_2026-09-06_v2.md#f09) | OPEN | P1 | PR-U03 |
| [F10](tiramisu_os_technical_audit_2026-09-06_v2.md#f10) | OPEN | P1 | PR-U04 |
| [F11](tiramisu_os_technical_audit_2026-09-06_v2.md#f11) | OPEN | P1（公開予約で実患者を扱う前） | PR-U05 |
| [F12](tiramisu_os_technical_audit_2026-09-06_v2.md#f12) | PARTIAL | P1（通知の提供・保証範囲に依存） | PR-U07 / ENV-03 |
| [F13](tiramisu_os_technical_audit_2026-09-06_v2.md#f13) | CODE_FIXED | 維持 | 維持 |
| [F14](tiramisu_os_technical_audit_2026-09-06_v2.md#f14) | PARTIAL | P2（仕様確認） | PR-U08（必要時） |
| [F15](tiramisu_os_technical_audit_2026-09-06_v2.md#f15) | OPEN | P2（複数院から削除を提供する前） | PR-U06 |
| [F16](tiramisu_os_technical_audit_2026-09-06_v2.md#f16) | VERIFY_FIRST | P2 | PERF-01 |
| [F17](tiramisu_os_technical_audit_2026-09-06_v2.md#f17) | CONDITIONAL | P1（チャットを提供）/ P2（対象外） | PR-U09（提供時） |
| [F18](tiramisu_os_technical_audit_2026-09-06_v2.md#f18) | VERIFY_FIRST | P2（有料運用前に復旧経路を確認） | VERIFY-02 |
| [F19](tiramisu_os_technical_audit_2026-09-06_v2.md#f19) | VERIFY_FIRST | P2 | VERIFY-03 |
| [F20](tiramisu_os_technical_audit_2026-09-06_v2.md#f20) | VERIFY_FIRST | P2（F11と依存整理） | VERIFY-04 / PR-U05の必要範囲 |
| [F21](tiramisu_os_technical_audit_2026-09-06_v2.md#f21) | CODE_FIXED | 維持 | 維持 |
| [F22](tiramisu_os_technical_audit_2026-09-06_v2.md#f22) | DEFERRED | P2 | DEFER-01 |
| [F23](tiramisu_os_technical_audit_2026-09-06_v2.md#f23) | ENV_PENDING | P2（配備条件を事前確認） | ENV-01 |
| [F24](tiramisu_os_technical_audit_2026-09-06_v2.md#f24) | DEFERRED | P2 | PERF-01 / DEFER-01 |

## 3. 小さいPRに分けて実装する

推奨順はU01→U02→U03→U04→U05。独立PRの並行作業は可能だが統合回帰を省略しない。U06以降は提供機能・仕様・必要性に応じる。全部を一度に変更しない。

### PR-U01 — 汎用rate limiterの復元・合成を修正

**対象：F03, F04 / 優先：P1 / 最初の独立PR / 規模：S〜M / DB変更：原則不要**

**変更候補**
- `src/lib/rate-limiting/rate-limiter.ts`
- `src/lib/rate-limiting/middleware.ts`
- `middleware.ts`
- `関連unit / production middlewareテスト`

**実装チェック**
- [ ] まず実SDK契約相当のobject返却でJSON.parseが失敗するREDを作る。
- [ ] unknown→shape validationでblock/escalationを復元する。shared Redis設定全体の変更を既定解にしない。
- [ ] 許可と拒否を型で分け、許可時に後続limiterと最終middlewareへ進む。headersを保持する。
- [ ] Core100のauth-attempt-guardのLua、fail-closed、scope/課金guardは変更しない。

**受入チェック**
- [ ] 全許可・第2limiter拒否・whitelist/skip・backend無し・backend障害を区別。
- [ ] block生成→次要求429→TTL後解除、破損値503。
- [ ] production入口経由でCSP/認証/rate headersが期待どおり。

**終了条件：** 実装のRED→GREENと既存8CIを確認。実Redisの閾値証拠はENV-01へ分離。

**やらないこと：** F02を再実装しない。認証基盤の統合、API全体の権限変更はしない。

### PR-U02 — 収益の期間内訳を一意な集計契約へ

**対象：F06 / 優先：P1 / 規模：S〜M / DB変更：取得済み行の集約なら不要**

**変更候補**
- `src/app/api/revenue/route.ts`
- `src/hooks/useRevenue.ts（契約追従が必要な範囲）`
- `src/app/(app)/revenue/page.tsx`
- `収益API / 内訳UI回帰`

**実装チェック**
- [ ] 同一role2日分の100+200で内訳が200になるREDを実UIで追加。
- [ ] APIでamountRole別estimatedAmount/lineCount、code別の金額/件数/要確認件数を期間全体で集約。
- [ ] 空集合と未知区分の扱いを既存契約に合わせて明示。
- [ ] F05/F07/F08の未算出・前年実額・全ページ取得を維持。

**受入チェック**
- [ ] 300円/2件、複数区分、0、許可された調整、別院/期間外除外。
- [ ] カードと対応する内訳が一致し、codeキー重複がない。
- [ ] 1001件・ページ境界・後続page失敗。

**終了条件：** APIと実際の内訳UI双方で期間正解が一致。R1とF06を同時に閉じる。

**やらないこと：** RPC/DB schemaの全面変更やforecast再導入をしない。

### PR-U03 — 院切替時の古い収益応答を無効化

**対象：F09 / 優先：P1 / 規模：S〜M / DB変更：不要**

**変更候補**
- `src/hooks/useRevenue.ts`
- `src/__tests__/hooks/useRevenue.test.tsx 等`

**実装チェック**
- [ ] deferred Promiseを使い、A遅延→B成功→A成功/失敗のREDを実React hookで作る。
- [ ] 要求の世代/identityでsetData、error、loading、inFlightの全変更を制御。
- [ ] abortは補助。古いfinallyは自分のinFlightだけを解除できるようにする。
- [ ] Queryへ寄せる場合も当該hookのclinic/期間/scopeキーを明示し、全hook刷新はしない。

**受入チェック**
- [ ] A→B→A、enabled=false、unmount、同一院background refresh。
- [ ] B未完了中にAのfinallyが走ってもBのinFlightとloadingを維持。
- [ ] Aの遅いerrorがBの成功表示を消さない。

**終了条件：** 実Reactの回帰成功。R2とF09を同時に閉じる。

**やらないこと：** keyで再mountするだけを唯一の対策にせず、要求単位の正しさを試験する。

### PR-U04 — 原文保存と出力時安全処理の分離

**対象：F10 / 優先：P1 / 規模：M / DB変更：通常コード修正は不要。既存データ補正は別承認**

**変更候補**
- `src/lib/api-helpers.ts`
- `src/lib/route-helpers.ts`
- `影響する入力API・メールtemplate・表示経路`

**実装チェック**
- [ ] sanitizeInputの全呼出元を調べ、raw textとHTML入力を分類する。
- [ ] Zod・危険キー対策・origin/認可は保持したまま、raw textの保存前HTML entity化を除く。
- [ ] HTML出力は出力文脈でencode/sanitizeする。
- [ ] 過去の変換済みデータは別のread-only棚卸しへ。無差別decodeはしない。

**受入チェック**
- [ ] A&B、<、>、引用符、既に文字としての&amp;の保存/再読込/再保存。
- [ ] React、メールHTML、CSV等の各経路で実行可能なHTMLを混入させない。
- [ ] N01のPATCH省略保持・明示削除が維持される。

**終了条件：** 変更対象APIのround-trip不変と出力安全性を実証。

**やらないこと：** 全DBの文字列を一括UPDATEしない。HTML防御・入力検証の単純削除をしない。

### PR-U05 — 匿名公開予約の患者識別を安全化

**対象：F11, F20 / 優先：P1はF11。F20の構造変更は必要範囲のみ / 規模：M / DB変更：既存の要照合/仮患者経路次第。必要ならappend-only**

**変更候補**
- `src/lib/services/public-reservation-service.ts`
- `src/app/api/public/reservations/route.ts`
- `既存患者照合・公開予約回帰`

**実装チェック**
- [ ] LINE確認済み経路と通常webを分けて読み、共有電話/メールのREDを作る。
- [ ] 連絡先一致だけで既存の先頭患者へ結合しない。既存の要照合/仮患者経路を優先。
- [ ] 氏名一致追加だけで本人確認済みとしない。匿名クライアントへ既存候補情報を返さない。
- [ ] F20は新規患者→予約失敗→補償の競合を再現し、必要性がある場合に最小transaction/冪等性を追加。

**受入チェック**
- [ ] 家族共有、同名、表記ゆれ、電話変更、確認済みLINE credential世代。
- [ ] 別院の既存患者へ紐付かない。
- [ ] 同時作成と予約競合、補償失敗でも他の正当な予約/患者を壊さない。

**終了条件：** 公開予約で曖昧な連絡先を本人確定に使わない。F20は解消範囲を個別記録。

**やらないこと：** 電話unique化で家族を排除しない。公開予約や通知を無断停止して解決扱いにしない。

### PR-U06 — 複数院の日報削除対象を明確化

**対象：F15 / 優先：P2 / この操作を提供する前 / 規模：S〜M / DB変更：原則不要**

**変更候補**
- `src/app/api/daily-reports/route.ts`
- `日報削除の認可/課金回帰`

**実装チェック**
- [ ] A/B権限・B日報・scope順を入れ替えるREDを追加。
- [ ] 対象日報の実clinicで最終認可と課金確認を行う。
- [ ] 存在有無の情報漏えいと削除の子データ影響を既存契約で確認。

**受入チェック**
- [ ] 対象院成功、対象外院拒否、role拒否、対象院未払拒否、scope順不変。

**終了条件：** 対象clinicに対する決定へ変更し、RLS/role/課金の保護を維持。

**やらないこと：** 削除権限のないmanagerへ新しい権限を与えない。

### PR-U07 — 通知の欠落窓・実停止復帰の確認

**対象：F12, N02 / 優先：P1（通知保証に合わせる） / 規模：M・要検証 / DB変更：予約とeventの同時保存が必要な場合だけappend-only**

**変更候補**
- `予約通常/mobile/publicの通知境界`
- `既存outbox・worker・監視・再投入手順`

**実装チェック**
- [ ] 現在のawaitとclaim+outbox atomic実装を維持。
- [ ] 予約commit直後に停止した場合と、enqueue失敗を分け、既存の永続再処理経路を調べる。
- [ ] 通知保証が必要なら予約＋最小eventを同時保存、または検証可能なdurable reconciliationを最小実装。
- [ ] provider受理後の応答喪失、stale lease、古いworkerの完了拒否を確認。

**受入チェック**
- [ ] 予約だけ・通知intentあり・outboxあり・provider受理済みを分離する。
- [ ] 23時間境界等の手動確認分岐、試行上限、同一idempotencyKeyとpayload。
- [ ] 承認済みtest宛先でLINE/email受信・停止再開・重複なしを確認。

**終了条件：** 保証範囲を文書と実証で一致させる。最低限await達成と完全な通知耐久性を別々に報告。

**やらないこと：** 新queue製品を導入しない。provider障害を保存済み予約の失敗にしない。

### PR-U08 — ブラウザ編集versionの契約確認

**対象：F14 / 優先：P2 / 必要性が確認された場合 / 規模：S〜M / DB変更：既存updated_atを使えるなら不要**

**変更候補**
- `予約GET/read-model/DTO`
- `通常/mobile編集UI`
- `CAS回帰`

**実装チェック**
- [ ] 既存server CASを再実装しない。
- [ ] 古い編集画面から後で送るケースをテストし、上書きを許すか明示する。
- [ ] 防止が必要ならclientのexpected versionをUPDATE条件へ含め、409時は最新値を提示。

**受入チェック**
- [ ] B変更完了後の旧A画面送信、通常同時要求、時刻/担当/取消/通知差分。

**終了条件：** server CASと編集画面versionの適用範囲を区別して完了を記録。

**やらないこと：** 現行timestampをJS Dateで丸めない。全編集画面の汎用lock基盤は作らない。

### PR-U09 — LINEチャット配送量と院別障害隔離

**対象：F17 / 優先：チャット提供時のみP1 / 規模：M / DB変更：既存claim RPCを再利用。必要差分のみ**

**変更候補**
- `src/lib/line/chat-outbox-processor.ts`
- `既存cron route・claim RPC・監視`

**実装チェック**
- [ ] 実行予算と提供上の待ち時間目標を固定。
- [ ] bounded drain・院間の少数並列・院内順序・renew/finalize例外隔離を限定実装。
- [ ] 別起動経路も含めた実効処理量を測る。

**受入チェック**
- [ ] 1院10件と100院各10件、1院障害、Cron重複、provider timeout。

**終了条件：** oldest queued ageと配送p95が承認目標内。

**やらないこと：** 予約LINE workerと混同しない。使わない機能の契約/API/Cronを無断停止しない。

## 4. 仕様/再現の確認後に判断する

### VERIFY-01 — 旧V01/V02/V03/V06の業務データ契約

- [ ] V01：日報手入力と明細triggerの正本・override保護を確認。
- [ ] V02：menu/customer/resourceのsoft deleteが既存予約へ与える影響とguardを照合。
- [ ] V03：公開予約のprice/指名料を、DB default/trigger・来院時処理・UIまで追う。
- [ ] V06：JST・月末/閏日/無効日付・金額丸め・timestamp精度の境界を確認。
- [ ] 実再現がなければ「仕様上必要」「現行充足」「未確認」を分け、確定バグとして一括修正しない。

### VERIFY-02 — F18 Stripe復旧

- [ ] `processing→busy`の通常再送とinternal replay/resyncを別経路で確認。
- [ ] claim直後の強制終了、滞留検出、実行中の処理保護を試験。
- [ ] 手動復旧で要件を満たせるかを先に判断。必要時だけlease/CASを追加。
- [ ] 古いeventと新event、replayとwebhookが並行しても課金状態を巻き戻さない。
- [ ] test mode限定。実課金・契約変更をしない。

根拠：[S33: Stripe webhook claim分類](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/billing/stripe-events.ts) / [S34: Stripe webhook受信route](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/stripe/webhook/route.ts) / [S35: 内部replay・復旧経路の検証対象](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/app/api/internal/billing/replay-webhook-event/route.ts)。

### VERIFY-03 — F19 価格契約

- [ ] catalog選択と任意値引きを区別し、既存の業務仕様を確認。
- [ ] catalogはIDからサーバー価格、任意調整は権限/範囲/理由/監査という最小分離を評価。
- [ ] 顧客の過去料金snapshotを最新master価格で無条件上書きしない。

### VERIFY-04 — F20 公開予約の最小transaction

- [ ] F11のidentity方針確定後、患者作成・予約失敗・補償の競合を実証。
- [ ] 非transactionという理由だけで全面RPC化しない。
- [ ] 既存の空き枠通知予約のatomic経路を保持。

### VERIFY-05 — V05 現行lockfileの依存リスク

- [ ] 対象SHA/lockfileでauditを取得。過去件数を現在値として転記しない。
- [ ] runtime/dev/公開入力からの到達可能性を分類。
- [ ] 到達可能な重大リスクから必要最小限を更新。`npm audit fix --force`や全major更新は禁止。

## 5. 実環境の受入gate（文書作成だけでは閉じない）

### ENV-01 — 配備前提・実Redis・課金/aggregate

- [ ] 専用対象環境ID、origin、project ref、region、plan、外部送信の隔離を確定。
- [ ] 実配備DBのmigration履歴を確認。新通知migrationの必要性・適用順・backup・lock条件を確認。
- [ ] 承認範囲で適用し、trigger/関数権限/生成型/既存RLSとの整合を照合。
- [ ] PostgREST aggregateの有効化と、statement timeout等の保護を確認。既定で無効という仕様を本番値の断定には使わない。
- [ ] F03/F04修正後、実Redisでaccount/IPと汎用制限を別々に確認。
- [ ] 実proxy経路に即した信頼設定、TTL・復帰・429/503、Auth側制限を検証。
- [ ] billingの設定不足503と契約状態402、対象会社だけの利用停止を確認。
- [ ] build時NEXT_PUBLIC flagsとruntime変数を混同しない。

根拠：[S03: Post-Core100修正結果・PR117〜122・未実施事項](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/post-core100-remediation-result.md) / [S24: 通知の追加migration・単調revision/trigger](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/supabase/migrations/20260906003219_post_core100_notification_durability.sql) / [S15: 日報read model・一覧/集計分離](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/daily-reports/read-model.ts) / [S08: 実認証のaccount/IP Lua制限](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/auth/auth-attempt-guard.ts) / [S09: 汎用レート制限・許可/拒否の合成](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/rate-limiting/middleware.ts) / [O03: PostgREST公式 Aggregate Functions](https://docs.postgrest.org/en/stable/references/api/aggregate_functions.html)。

### ENV-02 — production buildで認証後の主要業務

- [ ] `npm run build` / `npm run start`相当の環境を使う。dev E2Eを代用しない。
- [ ] 実Redis/proxyと承認済み検証アカウントで、login→dashboard→患者→予約作成/変更/取消→日報→managerを通す。
- [ ] full-enforceのCSP/Trusted Types/nonce、hydration、client navigation、consoleを検証。
- [ ] 複数role、担当院外・会社外拒否、古いsessionの権限剥奪を検証。
- [ ] 認証やCSPを緩めてPASSにしない。

### ENV-03 — 通知・監視・worker停止復帰

- [ ] 既存通知機能の提供範囲を維持。対象外化する場合は契約/API/enqueue/Cronを含む承認を得る。
- [ ] test宛先だけを使い、LINE/emailの実受信とprovider IDを記録。
- [ ] worker停止、lease期限、再開、古いworker、provider受理後の応答喪失を区別。
- [ ] enqueue失敗・未投入event・stale jobの検出と再処理方針を確認。
- [ ] client/serverの監視イベントと担当者へのalert到達を実確認。DSNがあるだけでPASSにしない。

### ENV-04 — Core100標準容量

- [ ] 既存runbookの標準A/B、500users/10万patients/150万reservationsを使用。
- [ ] 通常sessionで業務APIを操作。service_roleで性能や認可を代用しない。
- [ ] 200/400VU、操作間隔10秒、通常/バースト/回復を区別。
- [ ] read p95≤2秒、write≤3秒、aggregate≤5秒、通常想定外エラー<0.1%を採用。旧監査の1秒/1.5秒提案は追加条件にしない。
- [ ] 既知ID・件数・金額を独立正解と照合し、HTTP200の業務失敗/欠落を検出。
- [ ] endpoint別p50/p95/p99、API要求数、DB CPU/接続/lock/scan、転送量を保存。
- [ ] 50院managerの4カウント/院＝200要求を重点測定。目標内なら維持。
- [ ] 1台共有IPだけの試験と100院相当のネットワーク条件を区別。
- [ ] small/smokeだけのPASSを標準容量PASSにしない。

根拠：[S37: Core100有人運用・負荷試験runbook](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/operations/CORE100_RUNBOOK.md) / [S44: Core100仕様・性能基準](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/docs/stabilization/tiramisu-os-codex-release-spec-10companies-100clinics-v1.0.md) / [S40: manager exact count実装](https://github.com/IFs1991/seikotsuin_no_saas/blob/4f7794402400790afffb0c41db5538c9f97884a3/src/lib/manager-dashboard-counts.ts)。

### ENV-05 — 復元・運用・branch保護

- [ ] 隔離復元先と承認済みbackupで復元。Storage/鍵/Auth設定も対象を確認。
- [ ] 復元後の会社分離、件数/金額、主要業務、実RPO/RTOを記録。
- [ ] RPO/RTO提案と承認値を分離し、費用を伴う方式変更を無断で行わない。
- [ ] 各社窓口、障害owner、監視先、停止/再開、データ返却/削除を明確化。
- [ ] main branch-protection/rulesetsの実設定を再確認。承認後に必要な既存checksを必須化する。
- [ ] 最終merge SHAに結びつくCIを確認。文書mergeのためだけに同じ証跡を永久に追記し続けない。

## 6. 測定後にだけ最適化する

### PERF-01 — F16/F24とmanager集計

- [ ] 同一リクエストのAuth/getUser/authority回数を計測。
- [ ] 対象院判明後の最終scope確認を保持してcontext再利用を評価。
- [ ] 単院/本部/日報は「同一定義」の値だけ比較し、粒度違いを無理に統一しない。
- [ ] 目標未達時だけ一括DB aggregate/RPC・必要index・取得列削減を導入。
- [ ] code行数削減を性能向上の証拠にしない。

### DEFER-01 — F22/F24の保守性

- [ ] 既存export-db-catalog、source/route inventory、ACL行列の不足を確認。
- [ ] 最終schema/RLS/RPC/trigger/indexを生成資料で追えるようにする。
- [ ] 新しい手編集のDDL正本、汎用監査基盤、全hook/全API刷新はしない。

## 7. 各PRの検証・終了条件

まず現行package scriptsとAGENTS規約を読む。最低限、変更に関連するRED→GREENに加え、既存CIの必須条件を維持する。以下は既存コマンドの例であり、環境が承認済みであることを前提とする。

```bash
npm run lint:ci
npm run type-check
npm run type-check:commercial
npm run lint:commercial
npm run test -- --ci --testPathIgnorePatterns e2e red-contracts
npm run build
```

DB変更があるPRは、承認済み使い捨て環境でmigration replay、pgTAP、ACL/tenant契約、deferred upgrade、生成型diffを追加する。既存重要DB制約とrole境界を回帰で確認。UI/認証変更はApp E2E、本番CSP変更はproduction-build Playwrightを対象にする。

**全PRへ無差別に本番resetや負荷試験を走らせない。** テスト不能なら理由と対象をBLOCKEDとして残し、他の実行可能な独立タスクを進める。既存データ、ユーザーの未commit変更、テストやgateを勝手に削除して緑にしない。

## 8. 最終報告テンプレート

```text
対象SHA / branch / PR:
対象ID（F/N/V/ENV）:
現行再確認結果:
原因:
最小修正:
API・UI・DB契約への影響:
migration / 環境変数 / 設定変更（秘密値は出さない）:
REDのテスト名と失敗理由:
GREEN・既存回帰のコマンド/環境/結果:
独立監査（実施した場合のみ、範囲と結果）:
未実行・skip・flaky・BLOCKED:
残る保証範囲:
Code / Data / Security / Capacity / Recovery / Notifications /
Production configuration / Operational readiness の個別判定:
```

## 9. 全体の停止条件

「24項目をすべて同じPRで綺麗にする」を目標にしない。CODE_FIXEDの再設計や、ENV_PENDINGを消すための機能無断停止はしない。

**次に直すのは局所的な正確性と実行境界。出荷の判断はその後の実証で閉じる。** 詳細の原文・留保は [tiramisu_os_technical_audit_2026-09-06_v2.md](tiramisu_os_technical_audit_2026-09-06_v2.md) を参照。
