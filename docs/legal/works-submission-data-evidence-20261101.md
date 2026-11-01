# Works申請 データ取扱い監査（2026-11-01 JST）

## 範囲と証拠の限界

OS main: `b9e3907f160482ee3ed0dab2a4d0c845f9c73379`。Works main: `f02d5cdcba8d7a2dfeb58131b7c7bf9dee3a5437`。両方を作業開始時に取得し、前回確認SHAと一致。OSの元checkoutは別ブランチ・既存未追跡物あり、tracked treeはmainと差分なし。独立checkoutで変更し、既存物は変更していない。

Worksのコード・SQL履歴を読み取った監査であり、Production DB、OAuth、実顧客、Providerには接続していない。コードの存在は本番適用・flag・Worker稼働・削除成功の証拠ではない。以下のUNKNOWNは公開文言で保証しない。OSはカルテ管理システムと見なさず、OSの予約・顧客情報をWorksの処理と同一視しない。

## 分類別の保持・送信

「運営基盤」は、Works構成のSupabase、Vercel Web、Railway MCP、Trigger.dev Workerを指す。各社の実設定、リージョン、再委託、ログ・バックアップ、外国提供の法的整理はUNKNOWN。OS Deploymentの`iad1`をWorksのDB保管国に転用しない。

| 分類 | 実項目・保存有無 | 保存先 | 用途 | 受信者・処理者 | 保持期間／削除条件 | 利用者の解除・削除手段 | 根拠 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A 利用者・組織・店舗・認可 | あり。認証主体、ログイン用email・表示名、組織、店舗、membership、role、scope、招待、設定・onboarding状態 | Supabase Auth、`organizations`、`locations`、`organization_memberships`、setup関連テーブル | 本人・組織・店舗の認可、設定再開 | 運営基盤。許可された範囲のsafe DTOはChatGPT/MCPへ | 全体のTTL・退会時消去・バックアップ期限UNKNOWN。セッションや招待の有効期限とレコード消去は別 | 権限に応じた設定変更、連携解除、窓口への開示・訂正・削除等請求。全情報のself-service削除は未確認 | W1、W2、W3、W17 |
| B OAuth接続・Vault | あり。Provider account ID、scope/grant、接続世代・状態・期限、credential reference。秘密自体もVaultで扱う | `connections`、authorization/setup session、Supabase Vault。業務テーブルの参照とVaultの実データを区別 | OAuth完了、Providerの許可された操作、refresh、再接続・解除 | 正規Studio、Supabase/Vault、Web/Worker、該当Provider。MCPへProvider秘密を返す契約ではない | 解除で対象Vault secret削除・credential reference消去を行う経路あり。OAuth一時情報は別条件。接続記録・監査・Provider失効・全バックアップ消去の一括保証はなし | Studioの連携解除、Provider側許可取消、必要に応じ窓口。Works内削除とProviderのrevokeは別確認 | W2、W4、W5 |
| C Workflow・Run・Approval・監査・hash | あり。immutable version、実行・step状態、idempotency、policy、payload hash、利用量。Approval previewやsealed payloadに本文が含まれる経路もある | `workflow_*`、`approvals`、`audit_events`、`usage_records`、private outbox/ledger、Vault参照 | 承認対象固定、重複防止、結果照会、セキュリティ・障害調査 | 運営基盤、認可された利用者。承認カードはSlack。safe結果はOpenAIへ | 一般記録のTTL UNKNOWN。Audit append-only。個別purgeが本文を消しても最小ID/hash/tombstone等は残る。hashを自動的に匿名情報としない | 窓口へ範囲を特定して請求。停止・連携解除だけで監査を消すとは説明しない | W1、W6、W7、W8 |
| D1 Slack→LINE依頼本文・宛先 | あり。本文・宛先・署名検証後の依頼、Actor mapping、preview、Run/Approval参照 | `private.slack_line_requests`、`private.slack_line_recipients`、Vault、Approval/Slack delivery | 本人の依頼・同意と承認付きLINE操作 | 運営基盤、Slack承認先、許可されたLINE宛先。本人の素材依頼readではOpenAIにも本文が返り得る | `purge_at`初期値1日。`purge_expired_slack_request_data`は期限対象Vault、preview、recipient等を消去/縮退しID/hashを残す。`slackRequestRetention`は毎時17分、requestまたはretention flagが必要。本番実行はUNKNOWN | 連携解除・承認拒否は後続利用の停止。既存本文・外部Slack/LINEの削除は別途請求・外部管理 | W6、W7、W9 |
| D2 その他LINE・Slack一時データ | あり。LINE inquiry receipt、Slack broadcastのsource/context、承認、配信用参照。D1とは別の処理 | webhook receipt/Vault、`private.slack_broadcast_*`等 | 受付・本人確認・投稿案の準備、承認・送信 | 運営基盤、各Provider、許可された応答はOpenAI | LINE inquiry、broadcast、素材は別purge。broadcast proposal初期24時間、送信素材は試行後7日延長あり。全データをD1の「24時間削除」にまとめない。実際の稼働・最終期限UNKNOWN | 対象操作IDを添えて窓口。各Provider側の履歴はその管理手段も利用 | W8、W10、W11 |
| E1 MCP本文・Instagram投稿案 | あり。`mcp_content_proposals.body`に本文/caption、operation ID、request version、payload hash、対象接続・店舗・環境 | Supabase privateテーブル。LINE/Instagram handoffは別テーブル・sealed payloadにも関係 | 保存・素材と本文の固定、元IDで復帰、承認準備 | 運営基盤、OpenAI（get/read）、承認先Slack、許可成立時のLINE/Meta | proposal初期`expires_at`24時間。`cleanup_content_media`で期限後bodyをnull化する実装あり。hash/metadata/別sealed copyまで同じ期限で全消去される保証ではない。本番cleanupとバックアップはUNKNOWN | 期限後read制限、窓口への削除依頼。投稿案保存は送信・公開ではない | W9、W12、W13 |
| E2 画像・動画・送信用コピー | あり。選択ファイルの実bytes、hash、形式・サイズ・検査状態、プレビューと参照 | private Storage `mcp-content-assets`、`line-broadcast-assets`、`instagram-publication-assets`、関連privateテーブル/Vault URL | 取込・検査・プレビュー、承認・許可された公開 | 運営基盤、OpenAI（画像base64/動画resource）、Slack preview、LINE/Metaへの配信素材。任意の全ファイルの常時取得ではない | MCP素材初期24時間。`cleanupContentMedia`は期限対象最大100件を選択しStorage remove成功後ack。`instagramAssetCleanup`毎時37分のfinallyで`MCP_CONTENT_RETENTION_ENABLED=true`時にMCP/LINEコピーcleanup。LINEコピー・既存Instagram素材には試行後7日延長あり。外部キャッシュ・バックアップ・本番成功はUNKNOWN | 期限で利用停止、窓口へ請求。Instagram lifecycle callbackの対象限定削除あり、Worksの全データ削除とは別 | W10、W12、W13、W14、W15 |
| F 問い合わせ | 利用者入力を外部フォームが取得。公開サイト自身に独自のフォーム保存APIなし | 既存Googleフォーム。回答保存先・通知メール・転記先はUNKNOWN | support、privacy、operator-disclosure（salesも同じフォーム） | Google、運営者・担当者。実通知先・権限は未確認 | 回答・通知・サポート記録のTTL・削除手順UNKNOWN | `/contact?product=works&intent=...`と公開承認後のメール。queryは表示補助で、Googleフォームへ自動転記しない。本人確認手順・返信はOWNER_ACTION_REQUIRED | O1、O2、O3 |
| G ChatGPT/MCP・外部Provider送信 | あり。tool argsの対象/操作/本文/選択素材、safe result、状態、依頼本文、画像/動画resource。外部実行は宛先・本文・画像等 | Worksの前記記録とは別にOpenAI・各Providerが処理。会話全体をWorksで一律保存する契約ではない | 利用者が依頼した状態照会・案作成・承認と許可された実行 | OpenAI、該当するLINE/Slack/Meta。基盤会社は前記。直接のResponses API生成は現時点で非提供 | OpenAI/各Provider側の保持・削除は各サービスとの契約・設定による。Works側解除で過去会話が消えるとは約束しない。受信者別設定・国外処理・ログはUNKNOWN | 利用者のOpenAI設定、Provider許可の取消、Works窓口。各管理範囲の区分を案内 | W3、W9、W12、W14、W16 |

## 根拠ファイル（W=Works固定SHA、O=OSの本PR）

Works根拠は[固定main](https://github.com/IFs1991/TiramisuWorks_setup_module/tree/f02d5cdcba8d7a2dfeb58131b7c7bf9dee3a5437)にある。

- W1 `docs/ARCHITECTURE.md` §Product boundary / §AI、`supabase/migrations/202608250001_initial_control_plane.sql`（tenant table、audit/usage）。
- W2 `supabase/migrations/20260826161501_production_control_plane.sql`（招待、setup、Vault credential、`private.disconnect_connector_connection`）。
- W3 `plugin/skills/setup/SKILL.md`、`apps/mcp-server/src/mcp-app.ts`（本人・組織・既存Case、safe projection、content/retention条件）。
- W4 `packages/supabase-adapter/src/credentials.ts`（`SupabaseConnectorCredentialRepository`、`stageInstagramCredential`、`claim_connector_credential_refresh`、世代固定）。
- W5 `supabase/migrations/20260829113000_close_pilot_connector_legacy_bypasses.sql`、`20261005000132_instagram_login_setup.sql`（解除・Vault・refresh）。
- W6 `supabase/migrations/20261008163001_slack_line_requests.sql`（`purge_at`、Vault、Approval preview）。
- W7 `supabase/migrations/20261020232150_slack_request_retention_owner.sql`（現行`purge_expired_slack_request_data`）。
- W8 `supabase/migrations/20261010052204_slack_line_broadcast_proposals.sql`（`purge_expired_slack_broadcast_data`、`retain_until`）。
- W9 `apps/mcp-server/src/content-tools.ts`（`submit_content_proposal`、request read、media/resource応答）。
- W10 `supabase/migrations/20260921172027_line_approval_e2e.sql`、`apps/runtime-worker/src/slack-broadcast-tasks.ts`、`slack-broadcast-schedule.ts`。
- W11 `apps/runtime-worker/src/slack-request-tasks.ts`（`slackRequestRetention`）、`tasks.ts`（`lineInquiryMaintenance`）。
- W12 `supabase/migrations/20261011000519_mcp_content_proposals.sql`（private body、Storage、`cleanup_content_media`）、`20261011014900_mcp_line_content_handoff.sql`（sealed handoffとcleanup wrapper）。
- W13 `supabase/migrations/20261018000100_mcp_line_image_handoff.sql`（試行後7日保持、`cleanup_content_line_assets`）、`20261018000300_mcp_instagram_publication.sql`（caption hash、handoff、Vault URL）。
- W14 `packages/application/src/content-proposals.ts`（schema、hash、submitとread、受付済み復帰）、`packages/supabase-adapter/src/content-proposal-repository.ts`（Storage、transfer、preview、request read）。
- W15 `supabase/migrations/20261005000135_instagram_image_publishing.sql`（Instagram asset/publication、7日延長、lifecycle receipt/cleanup）、`apps/runtime-worker/src/content-media.ts`（remove→ack）、`tasks.ts`（`instagramAssetCleanup`）。
- W16 `docs/ARCHITECTURE.md`（現在ChatGPT/Codexが推論レイヤー、`ai.generate`は`MODEL_PROVIDER_NOT_CONFIGURED`で拒否）。
- W17 `apps/web/src/app/login/page.tsx`（Supabase Auth `signInWithPassword`）、`packages/supabase-adapter/src/row-mappers.ts`（`display_name`）。Studio認証と、MCPへ認証秘密を入力することは区別する。
- O1 `src/app/(public)/contact/page.tsx`、`src/components/public/lp-links.ts`（既存フォーム、queryとフォーム転記の区別）。
- O2 `src/components/public/marketing-links.ts`（support/privacy/operator-disclosureの目的別導線）。
- O3 `src/components/public/release-readiness.ts`（`operatorProfile`、公開用email未設定）。

## 申請範囲の分離

現manifestはsetup/statusと条件付きcontent準備を含む。contentは単なるread-onlyではなく、DB保存、取込、Outboxや承認カードに至り得る。保持・送信・素材削除を未検証のまま「個人情報を保存しない」として申請できない。

最短候補は、実運用で完成したsetup案内・保存済み状態readを申請対象として確認し、未検証content経路を**実際の公開tool inventory・skills・review casesから分離できるか**をWorks別PRで判断すること。OS側の文章だけでcontentを非提供扱いにしない。現manifestのP05はcontent準備を含むため、現状のままread-only限定申請とも呼べない。今回Worksソース・flag・Provider・DBは変更せず、範囲決定を`submission-scope`に残す。
