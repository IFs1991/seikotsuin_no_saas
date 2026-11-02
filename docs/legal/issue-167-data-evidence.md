# データ取扱い・保持/削除エビデンス別表

> 後続照合は[Issue #173 最新残件](issue-173-remaining-actions-20261102.md)と[Works最新分類別表](works-submission-data-evidence-20261101.md)を参照。以下の古い固定SHA・窓口未実施記載は当時の記録。2026-11-02の事業者完了申告と区別する。

確認日 2026-11-01 JST。OS main `cc1803744e12da7c8ef161956515f860c0091fd2`、Works main `de74853be6f4f9171df776f28f2c64893233c35d`に固定したコード参照。実データは取得しない。**コード確認≠本番運用確認≠法務/公開承認**。すべて公開承認前。責任者欄は担当する役割であり、個人の就任承認ではない。

| 製品 | データ分類 | 保存先・第三者 | 発生契機 | 保持根拠 | 削除契機とTTL | バックアップの取扱い | コードまたは運用の根拠 | 確認状態 | 責任者 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 共通/OS | 氏名・メール・所属院・権限 | Supabase Auth/DB | 登録/認証/招待 | 認証・スコープ管理 | アカウント停止/削除と履歴の保持期限は未確認 | 世代/地域/削除反映未確認 | OS `src/lib/supabase/guards.ts`, `src/lib/auth/manager-scope.ts`, `src/types/supabase.ts` | コード確認、運用未確認 | 事業者/認証運用担当 |
| OS | 患者識別・連絡先・問診/施術関連・予約/来院 | Supabase DB | 院による登録/予約 | 院からの業務委託。DPA未確定 | 院の保有方針・法令・個別合意を要確認。返却30日/削除30日は確約なし | 未確認 | OS `src/app/api/patients/route.ts`, `src/app/api/reservations/route.ts`, `supabase/migrations/` | コード上のデータ分類確認。全文医療フロー/契約未承認 | 利用院/事業者 |
| OS | 日報・売上・スタッフ・シフト | Supabase DB | 業務記録 | 業務提供/集計 | 業務・会計上の根拠/TTL/返却条件未確認 | 未確認 | OS `src/types/supabase.ts`, `src/app/api/daily-reports/route.ts` | コード確認、保有方針未承認 | 利用院/事業者 |
| OS | AI分析用売上/患者集計・スタッフ名と実績 | Google Gemini API、OS DB | AI insights有効化、GEMINI_API_KEY設定時の要求 | 経営分析。送信/学習利用の契約と根拠は未確認 | Google側の保持・削除/学習条件、分析結果のTTL未確認 | 双方未確認 | OS `src/app/api/ai-insights/route.ts` `buildInsightInput` / `requestAiInsights` / `createInsightsPrompt` | HTTP送信コード確認。本番flag/契約未確認 | 事業者/AI運用担当 |
| OS | チャット入力・出力 | Supabase DB | chat POST | 応答/履歴 | TTL未確認 | 未確認 | OS `src/app/api/chat/route.ts` `generateAIResponse` は現行ローカル簡易応答。コメントのみでGemini送信と推定しない | コード確認、本番公開範囲未確認 | 事業者 |
| 共通/OS | IP・操作・監査・障害/レート制限 | OS DB、Upstash、Sentry（設定時） | アクセス・エラー・監査 | 不正対策/障害対応 | 90日ログ/365日監査は未確定提案値。各TTLを要調査 | 未確認 | OS `src/lib/rate-limiting/`, `src/lib/monitoring/sentry.ts`, `sentry.server.config.ts` | コード上の経路確認。全送信項目/マスキング/保持未確認 | セキュリティ運用担当 |
| 共通 | 問い合わせ/返信先・契約/請求・サポート | Googleフォーム/通知先。請求保存先未確定 | 導入相談・本人請求・契約 | 問い合わせ/契約履行・会計上の義務 | 回答・通知・請求記録の保存根拠と期限未確認 | Google等の条件/運用未確認 | OS `src/components/public/lp-links.ts`, `src/app/(public)/contact/` | URL導線のみ確認。現物/受信/返信試験未実施 | 事業者/窓口担当 |
| Works | Organization/Location/Membership/Role、Connection metadata/scopes | Supabase DB | 組織作成/接続 | 認可・業務提供 | 退会/解除後のメタデータTTL未確認 | 未確認 | Works `docs/ARCHITECTURE.md`, `packages/supabase-adapter/src/credentials.ts` | コード/設計確認。本番実態未確認 | Works運用担当 |
| Works | OAuth access/refresh token・scope・有効期限 | Supabase Vault参照、接続プロバイダ | 認可コード交換/refresh | 許可scope内の接続 | disconnect、プロバイダ失効、Vault削除は別。全処理とTTL未確認 | 未確認 | Works `packages/supabase-adapter/src/credentials.ts` `completeAuthorizationSession` / `resolve` / `refresh` | Vault参照・接続世代/組織bindingのコード確認 | Works認証運用担当 |
| Works | Workflow/Run/Approval/Hash/Audit/Usage/Cost | Supabase、Trigger.dev、structured logs/Sentry | 依頼/承認/実行 | 承認証跡・重複防止・利用量 | 監査identity/hashは残存。汎用TTL未確認 | 未確認 | Works `docs/ARCHITECTURE.md` §§2/5/8/10/11 | 設計・実装の境界確認。地域/再委託/全送信先未確認 | Works運用担当 |
| Works | Slack経由LINE依頼/承認本文・宛先 | Vault、承認preview、Slack/LINE | Slack依頼受付・承認・配送 | 依頼処理 | 24h期限後purge対象。毎時処理のため厳密24h消去ではない。最小ID/hash残存。全素材へ一律適用しない | 未確認 | Works `supabase/migrations/20261008163001_slack_line_requests.sql`, `20261020232150_slack_request_retention_owner.sql`, `docs/reviews/2026-10-21-issue74-b5-slack-request-retention.md` | purge関数を確認。期限/スケジュールの本番実行証跡未確認 | Works Runtime担当 |
| Works | Square入力/承認/step結果/Webhookキャッシュ | Vault/DB、Square | 予約の参照/実行/Webhook | 予約処理・重複防止 | 入力復号/公開7日失効、物理削除は保守処理。予約ID/status/version等削除、イベントID/hash等残存 | 未確認 | Works `docs/SQUARE_BOOKINGS_MVP.md`, `supabase/migrations/20260918181237_contain_square_booking_webhook_retention.sql` `purge_expired_square_booking_data` | 関数確認。docsでは毎日実行が必要、遠隔スケジュール未実施と記載 | Works Runtime担当 |
| Works | Instagram削除通知・状態 | DB、Meta | Meta削除通知/状態照会 | 接続先の削除要求対応 | pending/completed照会のみでは全削除・外部/backup消去を証明しない。対象とTTL未確認 | 未確認 | Works `apps/web/src/app/api/instagram/deletion-status/[code]/route.ts` `instagram_deletion_status` | 状態照会コード確認 | Works/Meta連携担当 |
| Works | 投稿案本文・一時画像/動画素材 | Works保存先・外部素材/配信サービスは要追加照合 | 明示的な投稿案保存依頼 | 投稿準備 | 投稿経路別TTL/削除/権利未確認。Slackの24hを流用しない | 未確認 | Works main commit `de74853` のcontent tool description/Instagram復帰実装。認証は保存許可ではない | 最新差分確認、全素材経路は未確認 | Worksコンテンツ運用担当 |
| Works | ChatGPT入力・MCP応答・承認表示、連携先送信 | ChatGPT/OpenAI、利用機能に応じSlack/LINE/Instagram/Google/予約サービス | ツール呼出/確認/実行 | 依頼遂行に必要な最小限。PHI等の禁止情報を対象外とする必要 | 外部側は各社条件。Works退会で外部履歴は自動削除されない | 各社/アカウント設定を要確認 | Works `docs/ARCHITECTURE.md` §§3/6/8/10。OpenAI推論API直接呼出なし、MCP通信は存在 | 設計確認、全DTO/地域/規約適用未承認 | 事業者/Works担当 |

## 公開別表へ確定する際の必須作業

保存先の法人・役割（委託/第三者/利用者接続先）、所在国・実リージョン、送信項目、法的根拠、再委託、バックアップ、削除例外を実設定と契約で確定する。この表の「未確認」をそのまま全件確認済みに変えない。責任者と事業者の承認証跡を別途残す。公開前の決定事項は[判断台帳](issue-167-decisions.md)を参照。
