Tiramisu v2 バックエンド仕様書 v0.2
0. 文書情報
項目	内容
文書名	Tiramisu v2 バックエンド仕様書
版数	v0.2
対象	Tiramisu v2
作成目的	Tiramisu v2 の基盤再設計、AI/Swarm 統合、LINE 再活性導線、院別独自性を持つ業務OS設計
想定読者	Founder / Backend実装担当 / AI実装担当 / 将来の共同開発者
コンセプト	院の売上を伸ばす「儲かるSaaS」
主要技術方針	Core Backend = TypeScript、Agent Backend = Python + Strands、DB/Auth = Supabase
1. 要約

Tiramisu v2 は、整骨院・鍼灸院向けの単なる予約SaaSではなく、予約・顧客・売上・再来・施策実行・多店舗比較を一気通貫で扱う業務OS として再設計する。

v2 の中心思想は以下。

予約は売上の入口である
経営分析は結果の可視化で終わらず、次の施策実行に戻るべきである
LINE通知・再来促進・特典付与・予約直送までを閉ループにする
AIは画面の置き換えではなく、役割分担した業務実行補助として使う
AIは提案するが、実行権限は Core Backend が握る
院ごとにメニュー・価格・特典の独自性を持てるが、分析軸は共通化する

Tiramisu v2 は、予約SaaS ではなく、再来売上を作るSaaS を目指す。

2. 目的

本仕様の目的は以下。

Tiramisu v2 のバックエンド基盤を再設計する
TypeScript と Python の責務分離を明確にする
Strands を安全に組み込む
Supabase を SaaS 基盤として正しく利用する
LINE を活用した休眠患者の掘り起こしと予約転換導線を標準機能として設計する
院ごとの独自メニュー / 院ごとの特典 / HQ 比較の両立を実現する
3. コンセプト
3.1 Tiramisu v2 の本質

Tiramisu v2 は、予約データ、来院データ、売上データ、再来施策、HQ比較を一気通貫で扱う。
価値の中心は「機能数」ではなく、利益改善の閉ループ にある。

3.2 閉ループ

Tiramisu v2 が閉じるべきループは以下。

予約
来院
売上
分析
施策立案
LINE通知
予約復帰
特典適用
来院
ROI計測
3.3 v2 の二層構造
Core Transaction Plane
認証 / 認可
予約
顧客
売上
スタッフ
設定
課金
承認
監査
TypeScript で実装
Agent Intelligence Plane
分析
推論
LINE文面生成
特典提案
再来候補抽出
多店舗要約
Swarm orchestration
Python + Strands で実装
4. 公式技術方針に基づく判断
4.1 Strands 採用方針

Strands 公式の方向性から、v2 では以下を採用する。

Python SDK を使う
model-driven で構築する
model provider は固定しない
MCP 対応余地を残す
multi-agent / swarm は役割分離前提
本番では tool を明示列挙し、自動ロードを使わない
production では timeout / step limit / observability を必須化する
4.2 Supabase 採用方針

Supabase 公式の方向性から、v2 では以下を採用する。

Auth
SSR auth
Postgres
Storage
RLS
Edge Functions optional
user-management starter の基本構造
service_role はサーバー専用
認可判定に getSession() を使わず、getUser() か getClaims() を使う
4.3 課金基盤

Vercel の subscription starter は sunset 済みなので、そのまま土台にはしない。
ただし、以下の考え方は参考にする。

pricing table
customer mapping
subscription status sync
webhook での状態同期

つまり、billing の構造だけ参考にして、実装は独自に組む。

5. 技術スタック
5.1 Core Backend
Language: TypeScript
Runtime: Node.js
Framework: Fastify 推奨
Validation: Zod
DB/Auth: Supabase
Monitoring: Sentry
Rate limiting: Upstash Redis
Queue trigger: DB-backed queue / internal events
5.2 Agent Backend
Language: Python
Framework: FastAPI
Agent runtime: Strands
Model provider: Gemini を第一候補、将来差し替え可能
Queue execution: background worker
Monitoring: Sentry + structured logs
5.3 Frontend
Next.js
React
TypeScript
5.4 Infra
Supabase Postgres
Supabase Auth
Supabase Storage
Upstash Redis
LINE Messaging API
LIFF / deep link
Sentry
6. リポジトリ構成
/apps
  /web
  /core-api
  /agent-api
/packages
  /contracts
  /core-domain
  /shared
  /sdk
/supabase
  /migrations
  /seed
/docs
7. バックエンド責務分離
7.1 Core Backend の責務
認証
認可
tenant / clinic scope 管理
CRUD
予約ロジック
顧客ロジック
売上ロジック
メニュー管理
特典管理
承認フロー
監査ログ
webhook 受信
Agent run 受付
Agent action 実行
7.2 Agent Backend の責務
KPI 分析
dormant patient 抽出
スコアリング
LINE文面生成
特典提案
HQ比較要約
Swarm orchestration
action request 作成
8. Supabase SaaS 基盤の利用方針
8.1 利用する土台

Supabase の starter / primitive として以下を採用する。

Auth
Profile
Membership
Invite
Storage
RLS
SSR auth
hosted Postgres
8.2 Tiramisu独自で実装するもの
clinic_groups
clinics
clinic_memberships
menu_templates
clinic_menus
offer_templates
clinic_offers
reservations
reservation_history
revenues
daily_reports
campaign attribution
LINE outreach
AI runtime tables
approval policies
8.3 原則

SaaS 基盤をそのまま業務ドメインに流用しすぎない。
SaaS の共通部品は Supabase、利益を生むドメインは Tiramisu 独自設計 とする。

9. マルチテナント設計
9.1 階層
organization
clinic_group
clinic
9.2 ロール
org_owner
hq_admin
clinic_admin
manager
therapist
staff
viewer
9.3 スコープ
organization scope
group scope
clinic scope
9.4 原則
user は scope を超えて参照できない
agent run も scope を持つ
HQ scope を持つユーザーのみ group-level 比較可能
service role は backend 限定
10. 認証・認可
10.1 認証
Supabase Auth を使う
Core Backend は access token を検証
custom access token hook で scope claim を持たせる
10.2 JWT claim

最低限以下。

user_id
organization_id
role
clinic_scope_ids
group_scope_ids
10.3 SSR 認可ルール
getSession() は認可に使わない
getUser() または getClaims() を使う
session cookie の内容をそのまま信用しない
10.4 service role の扱い
Core Backend / Agent Backend のみ保持
browser / public client には絶対に出さない
11. RLS 方針
11.1 原則

全 tenant table に RLS を必須適用。

11.2 基本 policy
clinic 系: can_access_clinic(clinic_id)
group 系: can_access_group(group_id)
org 系: can_access_org(organization_id)
11.3 agent runtime

agent runtime tables も actor scope に応じた RLS を持つ。

11.4 禁止
browser で service_role 使用
agent から raw SQL 直接実行
tenant table への無制限横断参照
12. コアドメイン
12.1 業務ドメイン
顧客
予約
来院
売上
スタッフ
メニュー
設備 / リソース
ブロック
日報
設定
12.2 収益改善ドメイン
再来
休眠患者
LINE outreach
特典 / 割引 / クーポン
campaign attribution
ROI
HQ比較
13. データモデル
13.1 SaaS基盤テーブル
organizations
organization_memberships
subscriptions
billing_customers
invites
profiles
13.2 業務ドメインテーブル
clinic_groups
clinics
clinic_memberships
customers
resources
reservation_blocks
reservations
reservation_history
revenues
daily_reports
clinic_settings
13.3 メニュー / 特典
menu_templates
clinic_menus
offer_templates
clinic_offers
booking_offer_tokens
offer_redemptions
13.4 分析 read models
daily_revenue_summary
staff_performance_summary
patient_visit_summary
reservation_funnel_summary
clinic_kpi_snapshot
group_kpi_snapshot
13.5 outreach / LINE
patient_outreach_campaigns
patient_outreach_recipients
line_identities
message_templates
13.6 AI / Agent runtime
agent_sessions
agent_runs
agent_tasks
agent_messages
agent_artifacts
agent_action_requests
agent_approvals
agent_tool_logs
approval_policies
14. メニュー設計
14.1 背景

院ごとに、施術内容・売り方・価格・所要時間・導線は異なる。
そのため、メニューは全院共通マスタ1枚では運用に耐えない。

一方で、完全自由にすると HQ比較と経営分析が壊れる。

14.2 設計原則

メニューは 共通テンプレ + 院別実体 の二層構造とする。

14.3 menu_templates

グループ全体の共通軸。

主なカラム:

id
organization_id
group_id nullable
canonical_name
canonical_category
default_description
default_duration_minutes
default_price
base_cost_estimate
kpi_bucket
is_active
14.4 clinic_menus

院ごとに患者へ見せる実体。

主なカラム:

id
clinic_id
menu_template_id nullable
display_name
description
duration_minutes
price
tax_category
target_segment_rules jsonb
booking_enabled
line_promo_enabled
sort_order
approval_status
approved_by
approved_at
is_active
14.5 院ごとに変更可能なもの
表示名
説明文
価格
所要時間
掲載順
予約可否
LINE施策対象か
特典対象か
14.6 HQが握るもの
KPI分類
canonical category
原価分類
比較用 bucket
15. 特典 / Offer 設計
15.1 背景

特典は院ごとに最適解が違う。
ただし、完全自由にすると粗利とブランドが壊れる。

15.2 設計原則

特典も 共通テンプレ + 院別実体 の二層構造にする。

15.3 offer_templates

HQ / 組織が持つ共通方針。

主なカラム:

id
organization_id
title
description
offer_type
default_discount_type
default_discount_value
policy_notes
is_active
15.4 clinic_offers

院が運用する実体。

主なカラム:

id
clinic_id
offer_template_id nullable
title
description
offer_type
discount_type
discount_value
benefit_payload jsonb
valid_from
valid_until
max_redemptions
per_customer_limit
eligible_menu_ids
eligible_segment_rules
requires_approval
approval_status
approved_by
approved_at
is_active
15.5 特典の優先順位
先に使うもの
姿勢チェック
再評価
短時間オプション
優先予約枠
指名優先
回数券相談導線
深い休眠層だけで使うもの
固定額割引
パーセント割引
再来限定クーポン
15.6 booking_offer_tokens

LINE導線や予約直送で使う token。

主なカラム:

id
offer_id
customer_id
campaign_id
token
status
expires_at

status:

issued
opened
booked
redeemed
expired
cancelled
15.7 offer_redemptions

特典使用実績。

主なカラム:

id
offer_id
offer_token_id
reservation_id
customer_id
redeemed_at
benefit_value
revenue_impact
gross_margin_impact
16. 承認ポリシー
16.1 背景

院ごとに作成できるようにするが、全部HQ承認だと遅い。
逆に全部自由だと壊れる。

16.2 原則

院内承認で足りるもの と HQ承認が必要なもの を分ける。

16.3 院内承認で完結できるもの
軽微な文言修正
小額特典
単院限定
少人数配信
粗利影響が軽微

承認者:

clinic_admin
manager
16.4 HQ承認が必要なもの
高割引率
固定額割引が閾値超え
recipient 数が大きい
複数院横断施策
グループ共通テンプレの大幅改変
想定粗利影響が大きい

承認者:

hq_admin
org_owner
16.5 approval_policies

ルールをコードで持つ。

例:

discount_value > 1000 → HQ承認
discount_percent >= 20 → HQ承認
recipient_count >= 100 → HQ承認
multi_clinic = true → HQ承認
estimated_margin_impact >= threshold → HQ承認
17. Agent runtime 仕様
17.1 agent_runs

1回の agent 実行単位。

主なカラム:

id
agent_type
organization_id
clinic_id
requested_by_user_id
trigger_type
status
input_payload
output_summary
risk_level
started_at
completed_at

status:

queued
running
waiting_approval
completed
failed
cancelled
17.2 agent_action_requests

agent が提案したアクションの承認待ち単位。

主なカラム:

id
agent_run_id
action_type
target_type
target_id
proposed_payload
diff_payload
risk_level
approval_status
approved_by
approved_at
executed_at
17.3 agent_artifacts

AIサマリ・レポート・比較表・施策案。

主なカラム:

id
agent_run_id
artifact_type
title
content jsonb
visibility_scope
created_at
18. エージェント構成
18.1 Reservation Agent

責務:

空き枠提案
予約変更候補
当日キャンセル枠埋め提案
リソース衝突検知
18.2 Retention Agent

責務:

休眠患者抽出
再来可能性スコアリング
セグメント生成
campaign draft 作成
18.3 Analytics Agent

責務:

売上要因分析
スタッフ差分
メニュー差分
異常検知
優先施策提案
18.4 HQ Operations Agent

責務:

多店舗比較
HQサマリ
院別ボトルネック抽出
HQ視点の改善優先度付け
18.5 Offer Agent

責務:

特典選定
割引条件提案
粗利影響評価
token 発行候補作成
18.6 Messaging Agent

責務:

LINE文面生成
CTA生成
deep link 生成
セグメント別文面最適化
19. Strands 利用方針
19.1 原則

Strands は Agent Plane の実行基盤として使う。
ただし、本番では tool を明示列挙し、自動ツールロードは使わない。

19.2 tool 設計

Strands が使う tool はホワイトリスト方式。

例:

get_clinic_kpis
get_group_kpis
get_customer_segment
get_reservation_snapshot
get_dormant_candidates
generate_offer_preview
generate_line_message
create_action_request
write_agent_artifact
19.3 禁止
raw SQL 実行
reservations 直接更新
revenues 直接更新
membership 直接更新
scope 無視の参照
19.4 swarm 設計原則

Strands 公式の swarm パターンは共有文脈・handoff・step limit・timeout を持つ。
Tiramisu v2 ではそれをそのまま全面採用するのではなく、以下の制約をかける。

shared context は持ってよい
ただし DB 真実は共有メモリではなく Core の read model
max handoffs を明示
timeout を明示
ping-pong handoff 検出を入れる
final write は Core 経由のみ
19.5 production 原則
tools は明示指定
load_tools_from_directory は使わない
input validation 必須
output sanitization 必須
conversation window 制御
streaming は UX のために利用可
observability 必須
20. LINE 再活性フロー
20.1 目的

休眠患者を再来へ戻す。

20.2 フロー
Retention Agent が休眠患者を抽出
セグメント別に優先度を付ける
Offer Agent が特典候補を作る
Messaging Agent が LINE 文面を作る
campaign draft を保存
manager / clinic_admin / HQ が承認
LINE送信
患者が deep link をクリック
特典付き. 特典付き予約フォームへ遷移
予約成立
来院時に redemption 確定
revenue / ROI に反映
20.3 セグメント例
30〜60日未再来
60〜120日未再来
120日超
自費中心
高LTV
前回メニュー別
前回担当者別
21. 予約フォーム直送
21.1 deep link

例:
https://book.tiramisu.app/r/{offer_token}

21.2 token で復元する値
clinic_id
customer_id
campaign_id
offer_id
推奨メニュー
担当候補
有効期限
適用条件
21.3 フォームで自動反映
患者名
院
メニュー
特典
候補日時
担当候補
21.4 バリデーション
token 有効性
期限切れ
対象患者本人か
使用済みか
対象メニューに適用可能か
併用可否
21.5 予約成立時保存
reservations.offer_token_id
reservations.campaign_id
reservations.acquisition_channel = 'line_reactivation'
22. LINE 連携仕様
22.1 line_identities

主なカラム:

id
customer_id
line_user_id
oa_channel_id
linked_at
consent_status
last_contact_at
opt_out_at
22.2 message_templates

主なカラム:

id
clinic_id
channel
template_type
body
cta_label
cta_url_pattern
active
22.3 webhook

Core Backend で受信し、以下を反映。

click
delivery failure
opt-out
identity link / unlink
23. campaign 仕様
23.1 patient_outreach_campaigns

主なカラム:

id
organization_id
clinic_id
campaign_type
status
created_by
approved_by
approved_at
message_template_id
offer_policy_id
scheduled_at
sent_at

status:

draft
waiting_approval
approved
scheduled
sent
partially_failed
cancelled
23.2 patient_outreach_recipients

主なカラム:

id
campaign_id
customer_id
line_user_id
segment_label
delivery_status
clicked_at
booked_at
visited_at
24. API 仕様
24.1 Core Backend API
認証 / スコープ
GET /v1/me
GET /v1/me/scopes
GET /v1/organizations/current
GET /v1/clinics/accessible
顧客
GET /v1/customers
POST /v1/customers
PATCH /v1/customers/:id
GET /v1/customers/:id/history
予約
GET /v1/reservations
POST /v1/reservations
PATCH /v1/reservations/:id
POST /v1/reservations/:id/cancel
GET /v1/reservations/availability
メニュー / 特典
GET /v1/menu-templates
GET /v1/clinic-menus
POST /v1/clinic-menus
PATCH /v1/clinic-menus/:id
GET /v1/offer-templates
GET /v1/clinic-offers
POST /v1/clinic-offers
PATCH /v1/clinic-offers/:id
分析
GET /v1/analytics/dashboard
GET /v1/analytics/clinic-kpis
GET /v1/analytics/group-kpis
Agent
POST /v1/agents/runs
GET /v1/agents/runs
GET /v1/agents/runs/:id
GET /v1/agents/action-requests
POST /v1/agents/action-requests/:id/approve
POST /v1/agents/action-requests/:id/reject
Campaign / LINE / Offer
POST /v1/campaigns/dormant-reactivation/draft
GET /v1/campaigns/:id
POST /v1/campaigns/:id/approve
POST /v1/campaigns/:id/send
GET /v1/offers/:token
POST /v1/offers/:token/validate
POST /v1/public/reservations/with-offer
POST /v1/offers/:token/redeem
POST /v1/line/webhooks
24.2 Agent Backend API
POST /internal/agent-runs/execute
POST /internal/agent-runs/:id/cancel
POST /internal/retention-runs/execute
POST /internal/offer-selection/preview
POST /internal/line-message/generate
GET /health
GET /metrics
25. KPI
25.1 基本KPI
売上
粗利
来院数
再来率
稼働率
自費比率
スタッフ別売上
25.2 campaign KPI
送信数
到達数
クリック率
予約率
来院率
特典利用率
粗利差分
ROI
セグメント別CVR
担当者別再活性率
25.3 menu / offer KPI
menu_template 別売上
clinic_menu 別売上
offer 別利用率
特典別粗利影響
院別特典効率
26. 監査ログ
26.1 必須記録
actor_id
organization_id
clinic_id
agent_run_id
action_type
target_type
before / after diff
approved_by
executed_at
request_id
26.2 特に重要
予約変更
LINE送信
特典発行
オファー適用
権限変更
売上補正
27. 非機能要件
27.1 性能
CRUD p95 300ms
analytics p95 1.5s
agent run 受付 2s 以内
async 実行通常 30s 以内
27.2 可用性
Agent Backend 障害時も Core は継続
LINE 送信失敗は retry
model failure 時は fallback
27.3 観測性
request_id
correlation_id
agent_run_id
token usage
tool execution time
error rate
Sentry
structured logs
27.4 セキュリティ
service_role は backend 限定
token は期限付き
opt-out 管理
PII を過剰に prompt へ入れない
least privilege tool policy
output sanitization
28. エラー処理
28.1 Core
400 validation
401 unauthenticated
403 forbidden
404 not found
409 conflict
422 business rule violation
500 internal error
28.2 Agent
model failure
tool failure
timeout
approval rejection
delivery failure
execution conflict
29. MVP 優先順位
29.1 まずやる
Core API 分離
Supabase SaaS基盤
organizations / clinics / memberships
reservations / customers / revenues
menu_templates / clinic_menus
offer_templates / clinic_offers
RLS
agent_runs / action_requests
Retention Agent
Analytics Agent
LINE draft
offer token
予約フォーム直送
approval flow
29.2 後回し
完全自律実行
高度な swarm chaining
音声
複雑な multi-model routing
dynamic pricing
30. 開発フェーズ
Phase 1

Core Backend / Auth / Scope / RLS / clinics / memberships / reservations / customers / revenues

Phase 2

menu_templates / clinic_menus / offer_templates / clinic_offers / approval policies

Phase 3

agent runtime / Strands / Analytics Agent / Retention Agent

Phase 4

LINE / campaign / offer token / booking with offer / attribution

Phase 5

HQ agent / group KPI / multi-store orchestration

Phase 6

swarm最適化 / chained actions / execution automation

31. 結論

Tiramisu v2 のバックエンドは、以下の方針で再設計する。

Core Backend は TypeScript
Agent Backend は Python + Strands
Supabase を SaaS 基盤として採用
認可は Supabase + RLS + Core policy で守る
Strands は tool whitelist + production hardening 前提
LINE通知と予約導線を利益改善ループに組み込む
院ごとのメニューと特典の独自性を認める
ただし分析軸は共通化し、承認閾値で統制する

Tiramisu v2 は、予約管理ツールではなく、
院別の販売力を持ちながら、再来売上と多店舗経営を回す業務OS として設計する。