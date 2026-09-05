# core-100 有人運用・検証runbook

対象は10社・100実店舗（組織ルート10件は別）、owner候補 Toshu。手順の存在は実施証明ではない。[結果記録](../stabilization/core100-release-result.md)のBLOCKED解消と既存出荷承認後に使う。秘密値や顧客データをrepoへ保存しない。

## 導入と停止

1. 各社に窓口を1名決め、提供機能・院数・対応時間・契約/データ取扱いの確認をowner記録へ残す。100院からの個別サポートを前提にしない。
2. 既存の本部管理導線で会社ルートと子院を作り、root IDと実店舗数を別々に照合する。既存Stripe契約状態と院数枠を確認する。恒久overrideやガード無効化で通さない。
3. 既存招待からスタッフを追加し、実際の役職・担当院を設定する。担当院の成功と他社/非担当院の拒否を別sessionで確認する。無効化後は古いsessionでも拒否されることを確認する。
4. 初期投入は会社scope付きで承認されたデータだけ扱い、患者/予約/日報件数と既知の金額・IDを投入前後に照合する。テスト予約作成→変更→取消、日報保存→再読込→本部集計で受け入れる。
5. 退職者は既存無効化・担当解除導線を使い、session/JWTの権限復活がないことを確認する。会社停止は対象会社の契約/利用停止だけを操作し、他9社の書込み確認を行う。
6. データ返却/削除は会社・対象期間・保持義務/契約条件・実行者・承認者を記録。返却先を確認し、件数と会社scopeを照合する。削除SQLや全体restoreを無断実行しない。

## 安全なoffline確認（PowerShell / Node 24 / npm）

```powershell
npm run release:preflight
npm run release:seed -- --config scripts/release/core100.example.json
npm run release:load:plan -- --config scripts/release/core100.example.json
npm run test:release-tooling
```

preflightは自動で.envを読み込まない。選んだ非本番設定をprocessへ供給するか `node --env-file=<承認済み設定ファイル> scripts/release/preflight.mjs` を使う。値をコマンド履歴へ直書きしない。空のprocess設定ではBLOCKEDが正しい結果。exampleは `dedicated=false` / `externalDeliveryBlocked=false` のため実投入を許可しない。

## 容量試験（対象・実行承認後だけ）

- 使い捨てlocalまたは専用stagingの許可対象ID、app/Supabase originとproject ref、本番denylistを照合。実患者コピー・共用DB・本番は禁止。メール/LINE/Stripe/Cronの外部送信を隔離した証拠を記録する。
- A/Bで別run ID・別出力先を使用し、`asOfDate`を実行日のJST日付にする（managerの当日集計を照合するため）。standardは500users、100,000customers、1,500,000reservations。Bは50+6×5+5×4院。small/smokeの合格は100院容量の証明にならない。
- 必要秘密値は `SUPABASE_SERVICE_ROLE_KEY`（seed/照合）、`NEXT_PUBLIC_SUPABASE_ANON_KEY`（通常session）、`CORE100_FIXTURE_PASSWORD`（16文字以上）を安全な環境経由で供給。負荷測定の業務APIにservice_roleを使わない。

承認済みファイルとtarget IDを指定して実行する入口:

```powershell
npm run release:seed -- --config <承認済みJSON> --execute --approved-target <target-id> --output <run出力先>
npm run release:verify-data -- --config <承認済みJSON> --execute --approved-target <target-id> --output <run出力先>
npm run release:load -- --config <承認済みJSON> --execute --approved-target <target-id> --output <run出力先> --smoke
npm run release:load -- --config <承認済みJSON> --execute --approved-target <target-id> --output <run出力先>
npm run release:verify-data -- --config <承認済みJSON> --execute --approved-target <target-id> --output <run出力先> --load-result <負荷結果JSON>
```

verify-dataは読取専用だが誤接続防止のため同じ接続先確認を要求する。manifest/journalを保管し、同runの再開を使う。中断後に別runで無断再投入しない。cleanupコマンドは設けていない。削除が必要ならmanifestにある当該run ID一覧だけを対象に別途承認する。

warmup5分、通常200VU/30分、burst400VU/5分、回復200VU/5分。操作間隔10秒。HTTPリクエスト数/秒と業務操作数/秒、VUを分ける。read p95≤2秒、write≤3秒、aggregate≤5秒、通常想定外エラー<0.1%。意図した403/409は通常分母に入れず、200業務失敗・欠落は失敗扱い。endpointごとのp95/p99と回復区間を記録する。

生成機1台の共有IPで100院を再現したと扱わない。院別proxy/IP、Auth側制限、実Redis、app/DBプラン・region・Data API上限・aggregate設定・CPU/接続/ロック/容量/転送量の計測は別の環境証拠が必要。runnerのapplication SLOだけで容量PASSを出さない。

## CI・監視

出荷コミットで既存CI全gateを通す。local E2Eはglobal setupがDB/Authを変更するため、使い捨て環境と実行承認が必要。`CORE100_E2E_ENABLED=true`の専用fixtureで主要業務/manager範囲を確認する。DB replay、pgTAP、生成型、招待競合、GoTrue staleJWT取消を省略しない。

Sentryのserver/edge DSNとビルド時public DSNを設定し、既存の保護された監視テスト導線でclient/serverのテスト例外を確認。実際の担当者通知先でイベントID・受信時刻だけを記録する。設定503・主要API500/503・Cron失敗のalertを設定し、継続的な失敗を通知する。新しい無認証診断APIは公開しない。SDK側の診断情報は制限しているが、通知受信・配信ルールは環境実測待ち。

## 障害・復元

[既存運用手順](PRODUCTION_OPERATIONS-v0.1.md)、[DR計画](DR-PLAN-v0.1.md)、[復元記録テンプレート](RESTORE_DRILL_TEMPLATE.md)を再利用する。

1. 新しい会社/院の展開を止め、影響範囲と復旧責任者を記録。アプリは正常だったデプロイとDB互換性を確認してから承認付きで戻す。DBに変更がある場合は原則forward-fixを評価し、安易な全体巻戻しをしない。
2. 復元点、backup方式/保持期間、復元先、開始/完了時刻を記録。隔離先から実メール・LINE・Stripe webhook・Cronが発生しないよう遮断する。DB以外にStorage実ファイル、暗号鍵、Auth/provider設定も復旧対象として照合する。
3. 患者・予約・日報・売上の件数/ID/金額、ログイン、A/B会社分離、担当院・無効化を確認。実測RPO/RTOを記録してから切替判断する。core-100推奨RPO1時間/RTO4時間はowner未承認。日次backupだけで1時間RPOを満たすとしない。
4. **1社の誤操作は隔離restoreで正しいデータを取り出し、当該会社scopeの修復差分をレビューしてから反映する。共有DB全体を巻き戻して他9社の正常更新を消さない。** 更新時刻・FK・金額・監査履歴を照合し、切替前後に他社データが変わっていないことを確認する。

本番変更・有料backup設定・branch protection・出荷判断はowner承認後。通知の提供範囲と既存商用gateの差分案は [実装差分](../stabilization/core100-release-changes.md)へ集約する。
