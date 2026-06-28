# HQ分析 会話クエリ・インターフェース（LINE）仕様書 v0.4（Scope Assertion / DB Backstop / Async Webhook反映版）

作成日: 2026-06-17  
ステータス: **仕様改訂案 / Draft v0.4**  
対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象領域: LINE公式アカウント / 本部分析（HQ Analytics） / Manager階層scope / Supabase RLS / Service Role境界  
優先度: **P2**（コア本部OSの有償実証より後。キュー割り込み禁止）

---

## 0. この仕様書の位置づけ

本仕様は、「LINE公式アカウントからSaaSを会話操作する」構想のうち、**第一段階: 読み取り専用の本部分析クエリ**だけを定義する。

v0.4までの主要修正点は以下。

1. 現リポジトリの実装に合わせ、実行コンテキストを **`LineAnalyticsReadContext` 方式**に寄せる。
2. `createAdminClient` の直接利用を禁止し、**scope確定済みのread-only repository経由**に限定する。
3. LINE入力をLLMへ渡す前に、**PII / 患者情報 / 症状相談 / クレーム等をpre-filter**する。
4. LINE webhookの再送対策として、**idempotency**を必須化する。
5. `daily_reports` の既存read-modelをそのまま使わず、**LINE用 aggregate-only read model**を新設する。
6. v0.1で推奨されていた「短命ユーザートークンでRLS経由」は、既存RPCのgrant設計と不整合があるため、v0.4では採用しない。
7. `resolvedTargetClinicIds ⊆ effectiveClinicIds` の**部分集合アサーション**をP0必須条件に格上げする。
8. full RLS再設計前の中間案として、`security definer` の**DBバックストップRPC**をv0.4候補として追加する。
9. LINE webhookは同期直列処理ではなく、**200即返し + 非同期処理 + reply失敗時push fallback**を採用する。

---

## 1. 要約

本部長・経営者は、店舗横断の数字を「今すぐ・軽く」知りたい場面が多い。  
ダッシュボードを開き、期間・院・指標を選ぶ操作はフロント摩擦になる。

そこで、公式LINEに自然文で質問すると、エージェントが既存の本部分析データを読み取り、要約して返す。

例:

```txt
ユーザー（本部長）:
今月、予測より保険入金が低い院は？

エージェント:
6月（6/1〜6/16）時点で、保険売上の「概算予測 vs 実績」が乖離している院は次の3院です。

1. 新宿院  予測 ¥1,240,000 / 実績 ¥980,000（-21%）
2. 渋谷院  予測 ¥1,110,000 / 実績 ¥920,000（-17%）
3. 池袋院  予測 ¥980,000 / 実績 ¥840,000（-14%）

対象: 12院
※経営分析用の概算です。請求確定額ではありません。
```

設計原則は以下。

1. **読み取り専用**。本仕様では一切書き込まない。
2. **既存のscope判定を正とする**。`resolveEffectiveClinicScope` / `ensureClinicAccess` と同じ考え方に揃える。
3. **LINE userId単独を信頼しない**。LINE Account Linking / Login経由で、検証済みSaaSユーザーへ紐付ける。
4. **LLMに認可判断をさせない**。LLMは自然文→intent、数値→文章化のみ。
5. **PIIをLLMにもLINEにも出さない**。
6. **Service Roleは直接使わせない**。使う場合も `LineAnalyticsReadContext` 内部に閉じ込める。
7. **webhook再送を二重処理しない**。
8. **RPC直前で必ず部分集合アサーションを行う**。`resolvedTargetClinicIds` が `effectiveClinicIds` の部分集合でない場合は実行しない。
9. **webhook handler内でGemini/RPCを直列実行しない**。署名検証・idempotency保存・job enqueue後、速やかにHTTP 200を返す。

---

## 2. 背景・目的

### 2.1 背景

- 整骨院グループのスタッフ・本部はLINE常駐であり、会話UIは導入摩擦が低い。
- 本プロダクトの堀は、本部目線の信頼できる店舗横断分析にある。
- 特に、保険売上予測・店舗比較・日報未提出検知は、単なる予約/日報ツールより強い差別化になり得る。
- ただし、LINEは外部チャネルであり、誤送信・端末共有・再送・PII混入のリスクがある。

### 2.2 目的

- 本部意思決定者が、UI操作なしで主要KPIへ到達できる。
- 有償導入後の利用頻度を上げる。
- 本部OSの価値を「会話」という軽い体験で見せる。
- ソロ運営時のオンボーディング/サポート負荷を一部削減する。

### 2.3 非目的

v0.4では以下を扱わない。

- データ入力・編集・削除。
- 予約作成・予約変更・キャンセル。
- 日報作成・修正・削除。
- 患者個人情報の取得・提示。
- カルテ・施術内容・症状相談。
- 自動実行型CSエージェント。
- 複雑なマルチターン状態管理。
- LINE以外のWeb chat / Slack / Discord連携。

---

## 3. スコープ

### 3.1 対象

- LINE Messaging API Webhook受信。
- LINE Account Linking / LINE Login によるアカウント連携。
- LINE userId → SaaS user_id のbinding解決。
- 自然文 → intent抽出。
- intent allowlist 判定。
- JST期間解釈。
- effective scope解決。
- scope内の本部分析読み取り。
- LINE向け短文回答生成。
- 監査ログ。
- レート制限。
- idempotency。
- fail-closed。

### 3.2 対象外・禁止

以下は明確に禁止する。

- `insert` / `update` / `delete` / `upsert`。
- 副作用のあるRPC実行。
- `createAdminClient` をLINE routeやhandlerから直接呼ぶこと。
- LLMにSQLを生成させること。
- LLMにscopeや権限を判断させること。
- patient-level rowを取得すること。
- `daily_reports.report_text` をLLMへ渡すこと。
- 患者氏名・電話番号・住所・症状・カルテ本文・施術メモをLINEに返すこと。
- scope外clinicの存在を匂わせること。
- Redis障害時にGemini呼び出しをfail-openで続行すること。

---

## 4. 用語

| 用語 | 定義 |
|---|---|
| HQ分析 | 本部向けの店舗横断集計。売上、保険売上予測、来院数、日報ステータスなど |
| Identity binding | LINE userIdを検証済みSaaS user_idへ紐付けること |
| 連携ユーザー | binding済みのSaaSユーザー |
| Effective scope | 当該ユーザーが閲覧可能なclinic集合 |
| Intent | 自然文質問を構造化したクエリ種別とパラメータ |
| QueryType | allowlist化された読み取りクエリ種別 |
| LineAnalyticsReadContext | LINE HQ分析専用の読み取りコンテキスト。scope確定済みでread-only repositoryのみ呼べる |
| Aggregate-only read model | PIIや自由記述を含まない、店舗・期間・KPI単位の最小読み取りモデル |
| PII pre-filter | LLM投入前に患者情報・電話番号・症状相談等を遮断する処理 |
| Idempotency | LINE webhook再送時に同一eventを二重処理しない仕組み |
| Subset assertion | `resolvedTargetClinicIds` が `effectiveClinicIds` の部分集合であることをRPC直前に強制検証する最後のアプリ層ガード |
| DB backstop wrapper | `security definer` RPCで、DB側でも user_id と manager assignment からscopeを再検証する中間防御層 |
| Async webhook processing | webhook routeでは200を速やかに返し、Gemini/RPC/返信処理を非同期jobで行う方針 |

---

## 5. アーキテクチャ概要

v0.4では、LINE webhook route内で Gemini / RPC / 応答整形まで直列実行しない。

LINE公式ドキュメントは webhook event の非同期処理を推奨している。加えて、reply token は使用済みまたは期限切れになると無効化されるため、長時間処理を同期で抱える設計は避ける。

### 5.1 Webhook ingress: 速やかに200を返す

```txt
LINEユーザー
  │
  │ (1) メッセージ送信
  ▼
LINE Messaging API
  │
  │ (2) Webhook POST /api/line/webhook
  ▼
[署名検証]
  - X-Line-Signature
  - HMAC-SHA256
  - LINE_CHANNEL_SECRET
  │
  ▼
[Webhook event idempotency]
  - webhookEventIdを保存
  - unique制約で二重処理を防止
  - 既処理なら200だけ返して終了
  │
  ▼
[低コストevent判定]
  - events[] 空配列なら200
  - unsupported event typeは保存して200
  - message textのみjob化
  │
  ▼
[Job enqueue]
  - line_webhook_events.status = 'queued'
  - replyToken / line_user_id / message_id / event timestampを保存
  - raw textは原則保存しない。必要時も短期TTL + redaction
  │
  ▼
[HTTP 200を即返す]
```

route責務はここまで。  
route内で以下を行わない。

- Gemini呼び出し。
- HQ分析RPC呼び出し。
- 複雑なscope解決。
- 長い応答整形。
- service_role client生成。

### 5.2 Async worker / job handler: 分析と返信

```txt
[Queued job]
  │
  ▼
[PII pre-filter]
  - 患者名 / 電話番号 / 症状相談 / クレームを検知
  - 該当時はGeminiへ渡さず固定応答
  │
  ▼
[レート制限]
  - line_user_id
  - SaaS user_id
  - tenant / clinic group
  - channel
  │
  ▼
[Identity binding解決]
  line_channel_id + line_user_id
    → verifiedかつrevoked_at is nullのSaaS user_id
  │
  ├─ 未連携: 連携導線のみ返す（データなし）
  ▼
[連携ユーザー有効性確認]
  - SaaS user active
  - role有効
  - clinic active
  │
  ▼
[Effective scope解決]
  - resolveEffectiveClinicScope系
  - manager roleはmanager_clinic_assignmentsを正とする
  - inactive clinicは除外
  │
  ▼
[Intent抽出]
  - Gemini
  - allowlist queryTypeのみ
  - JSON出力
  - Zod再検証
  - scope/期間はコード側で確定
  │
  ▼
[Target scope解決]
  - intentのclinic hintをeffectiveClinicIds内へclamp
  - 対象未指定ならeffectiveClinicIdsを使う
  │
  ▼
[LineAnalyticsReadContext生成]
  - user_id
  - role
  - effectiveClinicIds
  - resolvedTargetClinicIds
  - requestId / webhookEventId / jobId
  - readOnly: true
  │
  ▼
[Repository entry]
  - assertLineAnalyticsReadContext
  - assertNonEmptyClinicScope
  - assertAllowedQueryType
  - assertSubsetClinicScope(resolvedTargetClinicIds, effectiveClinicIds)
  │
  ▼
[RPC直前ガード]
  - assertSubsetClinicScopeを再実行
  - p_clinic_idsへ渡す値はresolvedTargetClinicIdsのみ
  │
  ▼
[Aggregate-only repository実行]
  - manager_revenue_period_totals等
  - daily_report_status専用集計
  - revenue_estimates集計
  - patient-level row禁止
  │
  ▼
[応答整形]
  - 数値はコード確定値のみ
  - Geminiは文章化のみ
  - PIIなし
  - 対象期間 / 対象店舗数 / 注記を明示
  │
  ▼
[返信]
  - reply tokenが利用可能ならreply API
  - reply tokenが失効/使用済み/期限超過ならpush APIへfallback
  - push不可なら監査ログのみ残す
  │
  ▼
[監査ログ]
  - who
  - line_channel_id
  - queryType
  - targetClinicIds hash/count
  - period
  - result count
  - blocked reason
  - reply_method: reply | push | failed
```

### 5.3 reply / push 方針

- 原則は reply API を使う。
- ただし、非同期処理でreply tokenが無効になった場合、連携済みの `line_user_id` に push API で送る。
- push fallbackは、userが公式アカウントをブロックしている場合などに失敗し得る。その場合はLINEへ内部エラーを返さず、jobを `reply_failed` として監査ログに残す。
- reply API / push API の失敗レスポンス本文をLINEユーザーへ返さない。
- 同一 `webhookEventId` で二重返信しない。

### 5.4 queue実装の最小案

P2機能なので、初期は重いqueue基盤を入れない。

最小案:

1. `line_webhook_events` に `status = queued` で保存。
2. routeは保存後に200を返す。
3. Vercel Cron / Supabase Edge Function / server action相当のworkerでqueued eventを処理。
4. `status` を `processing` → `completed` / `blocked` / `failed` / `reply_failed` に更新。
5. `locked_at` / `attempt_count` / `last_error_code` で多重workerを制御。

DoD:

- route内でGemini/RPCを呼ばない。
- route内の処理は署名検証・event保存・enqueueまで。
- 同一eventは一度だけ処理される。
- reply失敗時にpush fallbackがある。

---

## 6. セキュリティ不変条件

### 6.1 fail-closed

判断に迷ったらデータを返さない。

以下はすべて固定応答で終了する。

- 未連携user。
- bindingが無効。
- SaaS userが無効。
- scopeが空。
- intent抽出不能。
- allowlist外queryType。
- 書き込み意図。
- 患者情報を含む質問。
- 症状相談。
- クレーム/事故/法務リスク。
- rate limit超過。
- Redis障害時に安全に制御できない場合。
- RPCエラー。
- Geminiエラー。

### 6.2 Identity binding

LINE `userId` 単独を信頼しない。

#### 必須要件

- LINE Account Linking / LINE Login 経由で連携する。
- `line_channel_id + line_user_id` を一意に扱う。
- `verified = true` かつ `revoked_at is null` のbindingのみ有効。
- SaaS側userが無効化されたら即時無効。
- 連携解除時は `revoked_at` を設定。
- 複数公式アカウントをまたいだuserId同一性を仮定しない。

#### 推奨フロー

```txt
1. 未連携LINE userが質問
2. SaaSがlinkToken/nonce付き連携URLを返す
3. ユーザーがSaaSへログイン
4. SaaS側でログイン済みuser_idとnonceを検証
5. LINE userIdとuser_idをbinding
6. verified=true, linked_at=now()
```

#### 注意

`line_account_links.clinic_id` はscope判定の根拠にしない。  
scopeは毎回 `user_id` からライブ解決する。

### 6.3 Scope解決

LINE経由で読める範囲は、連携ユーザーのeffective scopeに限定する。

#### 原則

- scopeはLLM入力で拡張できない。
- ユーザーが「全院」「管理者として」「他社含めて」と書いても無効。
- intentで指定されたtargetClinicHintは、effective scopeとの積集合にclampする。
- scope外clinicは存在を明かさない。
- manager roleは `manager_clinic_assignments` を正とする。
- inactive clinicはLINE応答対象から除外する。

#### 実装方針

```ts
type LineLinkedUserAccessContext = {
  userId: string
  role: UserRole
  effectiveClinicIds: string[]
  activeClinicIds: string[]
  lineChannelId: string
  lineUserId: string
}
```

### 6.4 実行コンテキスト

v0.4では、短命ユーザートークンによるRLS経由案を採用しない。

理由:

- 既存のHQ分析RPCは、現状 `authenticated` ではなく `service_role` 前提のものがある。
- そのため、短命ユーザートークンで既存RPCをそのまま呼ぶ設計は不整合が出る。
- RLS忠実性を優先する場合は、RPC grant / RLS policy / authenticated実行テストまで含めた別設計が必要。

#### 採用案: LineAnalyticsReadContext

LINE HQ分析では、以下の専用コンテキストを作る。

```ts
type LineAnalyticsReadContext = {
  requestId: string
  lineChannelId: string
  lineUserId: string
  userId: string
  role: UserRole
  effectiveClinicIds: string[]
  resolvedTargetClinicIds: string[]
  queryType: LineAnalyticsQueryType
  period: ResolvedJstPeriod
  readOnly: true
}
```

#### 禁止

```ts
// 禁止
const supabase = createAdminClient()
```

#### 許可

```ts
// 許可: handlerからは専用context経由だけ
const context = await createLineAnalyticsReadContext(...)
const result = await lineAnalyticsRepository.getRevenuePeriodTotals(context)
```

#### 内部service_role利用の条件

repository内部でservice_roleを使う場合は、以下を必須とする。

1. `LineAnalyticsReadContext` 経由でしか呼べない。
2. `resolvedTargetClinicIds` が空なら実行しない。
3. queryType allowlistに含まれる読み取りのみ。
4. insert/update/delete/upsert禁止。
5. 副作用ありRPC禁止。
6. 監査ログ必須。
7. テストでscope外clinicが返らないことを確認する。

### 6.5 PII pre-filter

v0.4では、PII対策を「LINE応答に出さない」だけではなく、**Geminiに渡さない**まで引き上げる。

#### LLM投入前に遮断する入力

- 患者氏名らしき文字列。
- 電話番号。
- メールアドレス。
- 住所。
- 症状相談。
- 施術内容の詳細相談。
- カルテ・既往歴・事故・クレーム。
- 「山田さんの予約」「田中さんの症状」など個人粒度の質問。
- 「昨日来た腰痛の人」など個人推定可能な質問。

#### 応答例

```txt
個人情報や患者単位の情報はLINEでは扱えません。
本部ダッシュボード、または院内の正式な管理画面で確認してください。
```

#### 監査ログ

- 原文保存は原則禁止。
- 保存する場合はredaction済み。
- blocked reasonは保存してよい。

例:

```json
{
  "event": "line_analytics_blocked",
  "reason": "pii_detected",
  "queryType": null,
  "rawTextStored": false
}
```

### 6.6 LLMガードレール

LLMの役割は2つだけ。

1. 自然文 → intent JSON。
2. 数値配列 → 短い説明文。

LLMにやらせないこと。

- SQL生成。
- RPC名の自由選択。
- scope判定。
- role判定。
- clinic access判定。
- DB直アクセス。
- 患者情報抽出。
- 数値の推測。
- 書き込み操作。

#### Intent schema

```ts
const LineAnalyticsIntentSchema = z.object({
  queryType: z.enum([
    'revenue_period_totals',
    'insurance_estimate_gap',
    'patient_counts',
    'store_ranking',
    'daily_report_status',
  ]),
  periodHint: z.string().optional(),
  targetClinicHint: z.string().optional(),
  metricHint: z.string().optional(),
  sortHint: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(20).optional(),
})
```

#### 実行前検証

- Zod parse。
- queryType allowlist。
- periodをJST helperで解決。
- clinic hintをeffective scope内で解決。
- limitは最大20。
- 曖昧なら固定応答。

### 6.7 監査ログ

すべての読み取り・遮断・失敗を監査する。

#### 保存するもの

- requestId
- line_channel_id
- line_user_id hash
- user_id
- role
- queryType
- period start/end
- target clinic count
- target clinic ids hash
- result count
- blocked reason
- error category
- created_at
- created_at_jst

#### 保存しないもの

- 患者氏名。
- 電話番号。
- 症状本文。
- LINE入力原文。
- LLM prompt全文。
- LLM response全文。

---

## 7. 機能仕様

### 7.1 QueryType allowlist

| queryType | 自然文例 | 参照元 | 返す内容 | v0.2優先度 |
|---|---|---|---|---|
| `revenue_period_totals` | 今月の売上は？ / 先月の自費売上トップ3は？ | `manager_revenue_period_totals` 等 | 期間×店舗の売上/保険/自費集計 | P0 |
| `insurance_estimate_gap` | 予測より保険入金が低い院は？ | `revenue_estimates` × 実績集計 | 概算 vs 実績の乖離店舗 | P0 |
| `daily_report_status` | 今日まだ日報入力がない院は？ | aggregate-only daily report status | 未入力・未捕捉店舗 | P0 |
| `patient_counts` | 今週の来院数は？店舗別で | daily_reports aggregate / patient analysis RPC | 来院数・新患数 | P1 |
| `store_ranking` | 今月の売上ランキングは？ | 上記集計の並べ替え | scope内店舗ランキング | P1 |

v0.4 MVPでは、P0の3種だけ実装する。

### 7.2 期間解釈

期間は必ずJST基準で解釈する。

対応する自然文:

- 今日
- 昨日
- 今週
- 先週
- 今月
- 先月
- 直近7日
- 直近30日
- 今年
- カスタム期間（将来）

#### ルール

- `src/lib/jst.ts` または既存のJST period helperを使う。
- UTC/JST混在禁止。
- 応答末尾に対象期間を明示する。

例:

```txt
対象期間: 2026/06/01〜2026/06/16（JST）
```

### 7.3 Clinic指定

自然文にclinic名が含まれる場合でも、最終的な対象はeffective scope内にclampする。

#### scope外指定時

- 「その院は権限外です」とは言わない。
- 「確認できる範囲では該当データがありません」と返す。
- auditには `target_clinic_clamped=true` を残す。

### 7.4 回答フォーマット

原則としてLINEでは短く返す。

#### 必須表示

- 結論。
- 上位3〜5件。
- 対象期間。
- 対象店舗数。
- 保険売上の場合は概算注記。

#### 例: revenue_period_totals

```txt
6月の売上合計は ¥12,480,000 です。

上位3院:
1. 新宿院 ¥1,820,000
2. 渋谷院 ¥1,640,000
3. 池袋院 ¥1,510,000

対象: 12院
期間: 2026/06/01〜2026/06/16（JST）
```

#### 例: daily_report_status

```txt
本日の日報が未入力の院は3院です。

- 渋谷院
- 池袋院
- 横浜院

対象: 12院
日付: 2026/06/17（JST）
```

#### 例: PII遮断

```txt
患者個人に関わる情報はLINEでは扱えません。
本部ダッシュボード、または正式な管理画面で確認してください。
```

---

## 8. データ設計

### 8.1 `line_account_links`

```sql
create table if not exists public.line_account_links (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  line_channel_id text not null,
  line_user_id text not null,
  verified boolean not null default false,
  linked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint line_account_links_pkey primary key (id)
);

create unique index if not exists line_account_links_active_line_user_idx
  on public.line_account_links (line_channel_id, line_user_id)
  where revoked_at is null;

create unique index if not exists line_account_links_active_user_idx
  on public.line_account_links (line_channel_id, user_id)
  where revoked_at is null;
```

#### 注意

- `clinic_id` は持たない。
- clinic scopeは毎回 `user_id` から解決する。
- どうしてもtenant識別が必要な場合は、scope計算結果のcacheとして別テーブルに持つ。ただし正準ではない。

### 8.2 `line_link_nonces`

Account Linking / Login用の短命nonce。

```sql
create table if not exists public.line_link_nonces (
  id uuid default extensions.uuid_generate_v4() not null,
  nonce text not null,
  line_channel_id text not null,
  line_user_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint line_link_nonces_pkey primary key (id),
  constraint line_link_nonces_nonce_unique unique (nonce)
);
```

#### 要件

- TTLは10〜15分。
- 一度使ったnonceは再利用不可。
- 期限切れnonceは無効。
- nonce照合なしの連携は禁止。

### 8.3 `line_webhook_events`

idempotency + async job queue用。  
LINEの `webhookEventId` を一意キーとして保存し、同一eventの二重処理・二重返信を防ぐ。

```sql
create table if not exists public.line_webhook_events (
  id uuid default extensions.uuid_generate_v4() not null,
  line_channel_id text not null,
  webhook_event_id text not null,
  line_user_id_hash text,
  line_user_id text,
  event_type text not null,
  message_id text,
  reply_token text,
  is_redelivery boolean not null default false,
  status text not null default 'queued',
  locked_at timestamptz,
  locked_by text,
  attempt_count integer not null default 0,
  processed_at timestamptz,
  reply_sent_at timestamptz,
  push_sent_at timestamptz,
  reply_method text,
  error_category text,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint line_webhook_events_pkey primary key (id),
  constraint line_webhook_events_unique_event
    unique (line_channel_id, webhook_event_id),
  constraint line_webhook_events_status_check
    check (status in ('queued', 'processing', 'ignored', 'blocked', 'completed', 'failed', 'reply_failed')),
  constraint line_webhook_events_reply_method_check
    check (reply_method is null or reply_method in ('reply', 'push', 'failed'))
);

create index if not exists line_webhook_events_status_created_idx
  on public.line_webhook_events (status, created_at);

create index if not exists line_webhook_events_locked_idx
  on public.line_webhook_events (locked_at)
  where status = 'processing';
```

#### status候補

- `queued`: webhook routeで保存済み。未処理。
- `processing`: workerがlock取得済み。
- `ignored`: text以外、空event、standby mode等で処理不要。
- `blocked`: PII / 書き込み意図 / 未連携 / rate limit等で安全停止。
- `completed`: replyまたはpush送信まで完了。
- `failed`: 内部処理失敗。再試行余地あり。
- `reply_failed`: 分析は完了したがreply/push送信に失敗。

#### ルール

- unique制約違反なら既処理として扱う。
- 既処理eventではGemini/RPC/reply API/push APIを再実行しない。
- routeは保存または既処理確認後、LINEには200を返す。
- `reply_token` を保存する場合は暗号化または短期TTL削除を検討する。
- `line_user_id` 生値はpush fallbackのために必要な場合のみ保存し、監査ログにはhashのみ残す。
```

### 8.4 `line_analytics_audit_logs`

既存 `AuditLogger` に寄せる。既存のaudit tableに統合できるなら新規不要。

```sql
create table if not exists public.line_analytics_audit_logs (
  id uuid default extensions.uuid_generate_v4() not null,
  request_id text not null,
  user_id uuid,
  role text,
  line_channel_id text not null,
  line_user_id_hash text,
  query_type text,
  period_start date,
  period_end date,
  target_clinic_count integer,
  target_clinic_ids_hash text,
  result_count integer,
  blocked_reason text,
  error_category text,
  created_at timestamptz not null default now(),

  constraint line_analytics_audit_logs_pkey primary key (id)
);
```

### 8.5 Migration / rollback

AGENTS.md方針に合わせる。

- migrationは `supabase/migrations/`。
- rollback SQLを必ずセットで用意。
- RLS有効化。
- 必要最小限のpolicy。
- service_role前提でも、アプリ側制約テストを必須化。


### 8.6 Migration詳細方針

v0.4では、LINE連携系テーブルは **アプリクライアントからの直接書き込みを原則禁止**する。  
連携・webhook処理・監査ログ記録はすべてサーバーroute / handler経由で行う。

#### Migration配置

```txt
supabase/
  migrations/
    <ts>_create_line_account_links.sql
    <ts>_create_line_link_nonces.sql
    <ts>_create_line_webhook_events.sql
    <ts>_create_line_analytics_audit_logs.sql
  rollbacks/
    <ts>_create_line_account_links_rollback.sql
    <ts>_create_line_link_nonces_rollback.sql
    <ts>_create_line_webhook_events_rollback.sql
    <ts>_create_line_analytics_audit_logs_rollback.sql
```

1ファイルにまとめる場合でも、rollbackは必ず同じ粒度で戻せるようにする。

#### Migration実装ルール

- 過去migrationは編集しない。
- 新規migrationのみ追加する。
- `create table if not exists` を使う。
- indexは `create index if not exists` / `create unique index if not exists` を使う。
- `updated_at` が必要なテーブルには既存のtrigger helperがある場合のみ流用する。
- `line_user_id` は原則として生値保存を許容するが、監査ログにはhashのみ保存する。
- `line_account_links` 以外の運用系テーブルは、クライアントから読ませない。
- `clinic_id` は `line_account_links` に持たせない。scopeの根拠にしない。

---

### 8.7 RLS設計方針

#### 基本方針

LINE連携テーブルはすべてRLSを有効化する。

ただし、本機能の正準アクセス経路は以下とする。

```txt
LINE webhook route
  → server handler
  → binding / nonce / idempotency / audit table
  → LineAnalyticsReadContext
  → read-only repository
```

クライアントSDKから直接、連携作成・nonce消費・webhook event記録・audit記録を行わせない。

#### テーブル別RLS方針

| テーブル | RLS | anon | authenticated | service_role/server | 理由 |
|---|---:|---:|---:|---:|---|
| `line_account_links` | 有効 | 不可 | 自分のlink参照のみ可 | 作成/検証/解除 | ユーザーが自分の連携状態を確認する余地はある |
| `line_link_nonces` | 有効 | 不可 | 不可 | 作成/消費のみ | nonceは連携秘密情報。client露出不要 |
| `line_webhook_events` | 有効 | 不可 | 不可 | 作成/更新のみ | idempotency内部テーブル |
| `line_analytics_audit_logs` | 有効 | 不可 | 不可 | insertのみ原則 | 監査ログ。ユーザー表示は別APIで必要時のみ |

---

### 8.8 RLS / Grant SQL雛形

#### `line_account_links`

```sql
alter table public.line_account_links enable row level security;

revoke all on table public.line_account_links from anon;
revoke all on table public.line_account_links from authenticated;

grant select on table public.line_account_links to authenticated;

drop policy if exists "line_account_links_select_own" on public.line_account_links;

create policy "line_account_links_select_own"
on public.line_account_links
for select
to authenticated
using (
  auth.uid() = user_id
);
```

##### 禁止

authenticatedに対して以下のpolicyを作らない。

```sql
-- 禁止例
create policy "...insert..." on public.line_account_links
for insert to authenticated
with check (...);

create policy "...update..." on public.line_account_links
for update to authenticated
using (...);
```

連携作成・解除は必ずサーバーrouteで行う。

#### `line_link_nonces`

```sql
alter table public.line_link_nonces enable row level security;

revoke all on table public.line_link_nonces from anon;
revoke all on table public.line_link_nonces from authenticated;

-- policyは作らない。
-- server/service_role経由のみ。
```

#### `line_webhook_events`

```sql
alter table public.line_webhook_events enable row level security;

revoke all on table public.line_webhook_events from anon;
revoke all on table public.line_webhook_events from authenticated;

-- policyは作らない。
-- server/service_role経由のみ。
```

#### `line_analytics_audit_logs`

```sql
alter table public.line_analytics_audit_logs enable row level security;

revoke all on table public.line_analytics_audit_logs from anon;
revoke all on table public.line_analytics_audit_logs from authenticated;

-- policyは作らない。
-- server/service_role経由のみ。
```

#### 注意

`service_role` はRLSをバイパスできるため、RLSだけでは安全境界にならない。  
したがって、LINE分析の本当の安全境界は以下の多層防御に置く。

1. route / handler で `createAdminClient` 直接利用禁止。
2. `LineAnalyticsReadContext` 生成時にscope確定。
3. repositoryで `resolvedTargetClinicIds` 必須。
4. `resolvedTargetClinicIds ⊆ effectiveClinicIds` の部分集合アサーション。
5. RPC直前の部分集合アサーション再実行。
6. queryType allowlist。
7. aggregate-only read model。
8. 監査ログ。
9. scope外取得の回帰テスト。

---

### 8.9 Rollback SQL雛形

Rollbackは依存関係の逆順で落とす。

```sql
drop table if exists public.line_analytics_audit_logs;
drop table if exists public.line_webhook_events;
drop table if exists public.line_link_nonces;
drop table if exists public.line_account_links;
```

テーブルを分割migrationにする場合は、各rollbackで自分が作ったtable/index/policyだけを戻す。

例:

```sql
-- <ts>_create_line_account_links_rollback.sql

drop policy if exists "line_account_links_select_own" on public.line_account_links;

drop index if exists public.line_account_links_active_user_idx;
drop index if exists public.line_account_links_active_line_user_idx;

drop table if exists public.line_account_links;
```

---

### 8.10 Migration / RLS テスト要件

RLSは「書いてある」だけでは足りない。必ずテストする。

#### 必須テスト

```txt
src/__tests__/rls/line-account-links-rls.test.ts
src/__tests__/rls/line-link-nonces-rls.test.ts
src/__tests__/rls/line-webhook-events-rls.test.ts
src/__tests__/rls/line-analytics-audit-logs-rls.test.ts
```

#### test case

| 対象 | ケース | 期待 |
|---|---|---|
| `line_account_links` | user A が自分のlinkをselect | 成功 |
| `line_account_links` | user A が user B のlinkをselect | 0件 |
| `line_account_links` | authenticatedがinsert | 失敗 |
| `line_account_links` | authenticatedがupdate/revoke | 失敗 |
| `line_link_nonces` | authenticatedがselect | 失敗または0件 |
| `line_link_nonces` | authenticatedがinsert/update | 失敗 |
| `line_webhook_events` | authenticatedがselect/insert | 失敗 |
| `line_analytics_audit_logs` | authenticatedがselect/insert | 失敗 |
| service/server | handler経由でnonce作成/消費 | 成功 |
| service/server | handler経由でwebhook event記録 | 成功 |
| service/server | handler経由でaudit log作成 | 成功 |

#### 実装上の注意

- RLSテストではanon / authenticated / service role相当を分ける。
- authenticated clientで直接テーブル操作できないことを確認する。
- server handlerの成功テストと、client直操作の失敗テストを分ける。
- 「service_roleならできる」は安全性の証明ではない。scope repositoryテストとセットで見る。

---

### 8.11 既存RPCとRLSの関係

既存HQ分析RPCの一部は、現状 `authenticated` ではなく `service_role` 前提で実行される。  
そのため、v0.4では以下を明確にする。

#### 採用しない

```txt
LINE user
  → Supabase authenticated client
  → manager_revenue_period_totals RPC
  → RLSで制御
```

#### v0.4で採用するアプリ層ガード

```txt
LINE user
  → binding済みSaaS user_id
  → resolveEffectiveClinicScope
  → resolvedTargetClinicIds
  → assertSubsetClinicScope(resolvedTargetClinicIds, effectiveClinicIds)
  → LineAnalyticsReadContext
  → read-only repository
  → service_role RPC call
```

この設計では、DB RLSはLINE分析RPCの最終防衛線にはならない。  
したがって、**アプリ層のscope clamp + repository制約 + RPC直前の部分集合アサーション**が最重要の安全境界になる。

### 8.12 P0: 部分集合アサーション

`resolvedTargetClinicIds` は intent / target clinic hint / clinic name解決 / clamp処理を通過した結果である。  
この値をそのままRPCの `p_clinic_ids` に渡すと、scope解決のどこか1箇所のバグで他テナントを返す可能性がある。

そのため、repository entryとRPC直前の両方で以下を必ず検証する。

```ts
export function assertSubsetClinicScope(
  resolvedTargetClinicIds: readonly string[],
  effectiveClinicIds: readonly string[],
): void {
  const effective = new Set(effectiveClinicIds)

  if (resolvedTargetClinicIds.length === 0) {
    throw new AppError('FORBIDDEN', 'LINE_ANALYTICS_EMPTY_SCOPE')
  }

  const outOfScope = resolvedTargetClinicIds.filter((id) => !effective.has(id))

  if (outOfScope.length > 0) {
    throw new AppError('FORBIDDEN', 'LINE_ANALYTICS_SCOPE_VIOLATION')
  }
}
```

使用箇所:

```ts
function assertLineAnalyticsRepositoryGuard(context: LineAnalyticsReadContext) {
  assertLineAnalyticsReadContext(context)
  assertNonEmptyClinicScope(context.resolvedTargetClinicIds)
  assertAllowedQueryType(context.queryType)
  assertSubsetClinicScope(
    context.resolvedTargetClinicIds,
    context.effectiveClinicIds,
  )
}

async function callManagerRevenuePeriodTotals(context: LineAnalyticsReadContext) {
  // RPC直前で再実行する。repository entryの検証だけに依存しない。
  assertSubsetClinicScope(
    context.resolvedTargetClinicIds,
    context.effectiveClinicIds,
  )

  return supabase.rpc('manager_revenue_period_totals', {
    p_clinic_ids: context.resolvedTargetClinicIds,
    p_start_date: context.period.startDate,
    p_end_date: context.period.endDate,
  })
}
```

DoD:

- すべてのrepository methodで `assertSubsetClinicScope` を通す。
- すべてのRPC呼び出し直前で `assertSubsetClinicScope` を再実行する。
- `p_clinic_ids` には `context.resolvedTargetClinicIds` 以外を渡さない。
- subset violationはLINEに詳細を返さず、安全な固定応答にする。
- 監査ログには `blocked_reason = scope_violation` と、clinic idそのものではなく hash/count を残す。

### 8.13 v0.4候補: DBバックストップRPC

full RLS再設計の前に、より安い中間防御として **security definerのラッパーRPC** を追加する選択肢がある。

狙い:

- アプリ層のscope bugをDB側で止める。
- 既存HQ分析RPCの大規模なgrant/RLS再設計を避ける。
- `p_clinic_ids` を無検証で信用する既存RPCの手前に、DB側のscope検証を1枚置く。

概念:

```txt
LineAnalyticsRepository
  → line_manager_revenue_period_totals_checked(
      p_user_id,
      p_clinic_ids,
      p_start_date,
      p_end_date
    )
  → DB内でuser_idからeffective scope再構成
  → p_clinic_ids ⊆ db_effective_scope を検証
  → OKなら既存 manager_revenue_period_totals を呼ぶ
```

SQL雛形:

```sql
create or replace function public.line_manager_revenue_period_totals_checked(
  p_user_id uuid,
  p_clinic_ids uuid[],
  p_start_date date,
  p_end_date date
)
returns table (
  clinic_id uuid,
  clinic_name text,
  total_revenue numeric,
  insurance_revenue numeric,
  private_revenue numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed_clinic_ids uuid[];
  v_out_of_scope uuid[];
begin
  -- 例: manager roleの場合。admin/clinic_adminの扱いは既存scope仕様に合わせて分岐する。
  select coalesce(array_agg(mca.clinic_id), array[]::uuid[])
    into v_allowed_clinic_ids
  from public.manager_clinic_assignments mca
  join public.clinics c on c.id = mca.clinic_id
  where mca.manager_user_id = p_user_id
    and mca.revoked_at is null
    and c.is_active = true;

  select coalesce(array_agg(x), array[]::uuid[])
    into v_out_of_scope
  from unnest(p_clinic_ids) as x
  where not (x = any(v_allowed_clinic_ids));

  if coalesce(array_length(p_clinic_ids, 1), 0) = 0 then
    raise exception 'LINE_ANALYTICS_EMPTY_SCOPE'
      using errcode = '42501';
  end if;

  if coalesce(array_length(v_out_of_scope, 1), 0) > 0 then
    raise exception 'LINE_ANALYTICS_SCOPE_VIOLATION'
      using errcode = '42501';
  end if;

  return query
  select *
  from public.manager_revenue_period_totals(
    p_clinic_ids,
    p_start_date,
    p_end_date
  );
end;
$$;

revoke all on function public.line_manager_revenue_period_totals_checked(uuid, uuid[], date, date) from public;
revoke all on function public.line_manager_revenue_period_totals_checked(uuid, uuid[], date, date) from anon;
revoke all on function public.line_manager_revenue_period_totals_checked(uuid, uuid[], date, date) from authenticated;
grant execute on function public.line_manager_revenue_period_totals_checked(uuid, uuid[], date, date) to service_role;
```

注意:

- `auth.uid()` はservice_role呼び出しでは期待通りに効かない可能性があるため、v0.4候補では `p_user_id` を明示的に渡す案を基本にする。
- ただし `p_user_id` 自体もアプリから渡されるため、DB wrapper側で `line_account_links` / user active / role / assignment まで検証する拡張が望ましい。
- `security definer` はsearch_path固定が必須。
- wrapper RPC自体もservice_role以外にはgrantしない。
- この中間案を採用しても、アプリ層の `assertSubsetClinicScope` は削らない。

v0.4での扱い:

- MVP実装ではアプリ層subset assertionをP0必須とする。
- DBバックストップRPCは **P1 / hardening candidate** として追加検討。
- ただし、外部有償PoC前には最低1つの主要RPC、特に `manager_revenue_period_totals` でwrapper導入を推奨する。

### 8.14 将来: RLS忠実設計

将来、完全にRLS忠実な設計へ寄せる場合は別specで以下が必要。

1. `authenticated` へのRPC grant再設計。
2. RPC内部のsecurity mode確認。
3. manager assignmentに基づくRLS policy設計。
4. authenticated user tokenでの統合テスト。
5. 既存APIとの互換性確認。


---

## 9. 既存資産の再利用

### 9.1 利用する既存資産

| 領域 | 既存資産 | 方針 |
|---|---|---|
| scope | `resolveEffectiveClinicScope` / `ensureClinicAccess` | 正準経路として利用 |
| manager assignment | `manager_clinic_assignments` | manager roleのscope根拠 |
| 売上分析 | `manager_revenue_period_totals` 等 | P0で利用 |
| 日付 | `src/lib/jst.ts` | JST期間解釈に利用 |
| エラー | `AppError` / `handleRouteError` | 内部エラー処理に利用 |
| rate limit | `src/lib/rate-limiting/` | LINE向けにfail-closed調整 |
| audit | `AuditLogger`思想 | 監査ログに利用 |
| schema | `Zod` | intent validationに利用 |

### 9.2 そのまま流用しないもの

#### daily report read model

既存の日報read-modelは、自由記述やスタッフ情報を含む可能性がある。  
LINE HQ分析ではそのまま使わない。

新設する。

```ts
// src/lib/line/analytics/daily-report-status-read-model.ts
type LineDailyReportStatusRow = {
  clinicId: string
  clinicName: string
  reportDate: string
  hasReport: boolean
  submittedAt?: string | null
}
```

禁止列:

- `report_text`
- `staff.name`
- `patient_name`
- `phone`
- `treatment_detail`
- `memo`
- patient-level row

---

## 10. 実装設計

### 10.1 ディレクトリ案

```txt
src/
  app/
    api/
      line/
        webhook/
          route.ts
        link/
          route.ts
  lib/
    line/
      verify-signature.ts
      webhook-idempotency.ts
      account-linking.ts
      pii-prefilter.ts
      rate-limit.ts
      analytics/
        create-line-analytics-read-context.ts
        intent-schema.ts
        parse-intent.ts
        resolve-line-period.ts
        resolve-target-clinics.ts
        assert-subset-clinic-scope.ts
        line-analytics-repository.ts
        format-line-response.ts
        reply-dispatcher.ts
        audit-line-analytics.ts
      jobs/
        process-line-analytics-job.ts
        claim-line-webhook-job.ts
  __tests__/
    api/
      line-webhook.test.ts
    security/
      line-analytics-scope.test.ts
      line-analytics-pii.test.ts
    rls/
      line-account-links-rls.test.ts
```

### 10.2 Webhook route責務

`/api/line/webhook` は薄く保つ。  
v0.4では、routeは同期で分析処理を完了させない。

責務:

1. 署名検証。
2. event idempotency。
3. event type判定。
4. `line_webhook_events` への保存。
5. 処理対象eventのjob enqueue。
6. 速やかにHTTP 200を返す。

責務外:

- scope判定の直書き。
- DB集計の直呼び。
- Gemini prompt組み立ての直書き。
- service_role直接生成。
- LINE reply API / push API実行。

禁止:

```ts
// route内でこれは禁止
await parseIntentWithGemini(...)
await repository.getRevenuePeriodTotals(...)
await replyMessage(...)
```

### 10.3 Async job handler責務

```ts
async function processLineAnalyticsJob(job: LineAnalyticsJob): Promise<void> {
  // 1. acquire lock / status transition queued -> processing
  // 2. pre-filter
  // 3. account binding
  // 4. rate limit
  // 5. scope resolve
  // 6. intent parse
  // 7. target scope clamp
  // 8. read context
  // 9. repository read with subset assertion
  // 10. response format
  // 11. reply or push fallback
  // 12. audit
  // 13. status transition completed / blocked / failed / reply_failed
}
```

job handlerは冪等であること。  
`webhookEventId` または `jobId` 単位で、同一eventに対するreply/pushを二重実行しない。

### 10.4 Repository責務

repositoryはread-only専用。

```ts
interface LineAnalyticsRepository {
  getRevenuePeriodTotals(
    context: LineAnalyticsReadContext
  ): Promise<RevenuePeriodTotalsResult>

  getInsuranceEstimateGap(
    context: LineAnalyticsReadContext
  ): Promise<InsuranceEstimateGapResult>

  getDailyReportStatus(
    context: LineAnalyticsReadContext
  ): Promise<DailyReportStatusResult>
}
```

repository内で必ず確認する。

```ts
assertLineAnalyticsReadContext(context)
assertNonEmptyClinicScope(context.resolvedTargetClinicIds)
assertAllowedQueryType(context.queryType)
assertSubsetClinicScope(
  context.resolvedTargetClinicIds,
  context.effectiveClinicIds,
)
```

さらに、RPC呼び出し直前でも `assertSubsetClinicScope` を再実行する。  
repository entryで検証済みであっても、内部メソッドで `p_clinic_ids` を組み替えるバグを防ぐため、直前ガードを省略しない。

```ts
private async callRpc(context: LineAnalyticsReadContext) {
  assertSubsetClinicScope(
    context.resolvedTargetClinicIds,
    context.effectiveClinicIds,
  )

  return this.supabase.rpc('manager_revenue_period_totals', {
    p_clinic_ids: context.resolvedTargetClinicIds,
    p_start_date: context.period.startDate,
    p_end_date: context.period.endDate,
  })
}
```

禁止:

```ts
// intent由来のclinicIdsを直接RPCへ渡すのは禁止
p_clinic_ids: intent.targetClinicIds

// effective scopeと比較していない一時配列を渡すのは禁止
p_clinic_ids: candidateClinicIds
```

### 10.5 Reply dispatcher責務

LINE返信は専用dispatcherに集約する。

```ts
async function sendLineAnalyticsResponse(params: {
  lineUserId: string
  replyToken?: string | null
  message: LineMessage
  webhookEventId: string
  preferReply: boolean
}): Promise<'reply' | 'push' | 'failed'> {
  // 1. 既に送信済みなら何もしない
  // 2. replyTokenがあり、未使用・期限内と判断できる場合はreply API
  // 3. Invalid reply token / expired / used の場合はpush APIへfallback
  // 4. push失敗時はfailedを返し、ユーザーには内部詳細を出さない
}
```

要件:

- reply tokenをDBに保存する場合は暗号化または短期TTLを付ける。
- `reply_sent_at` / `push_sent_at` / `reply_method` を `line_webhook_events` に記録する。
- `webhookEventId` uniqueにより、同一eventへ二重返信しない。
- push fallbackは有料メッセージ数・ブロック・friend状態の影響を受けるため、失敗してもシステムエラーをLINEへ出さない。

---

## 11. Rate limit / コスト管理

### 11.1 制限軸

最低限、以下で制限する。

| 軸 | 例 |
|---|---|
| line_user_id | 1分5回、1日100回 |
| SaaS user_id | 1分5回、1日100回 |
| line_channel_id | 1分100回 |
| tenant / clinic group | 1日500回 |
| Gemini calls | 1日上限 |

### 11.2 Redis障害時

既存rate limiterがfail-openであっても、LINE + Geminiではそのまま使わない。

Redis障害時の方針:

- 未連携: 固定文のみ返す。
- PII検知: 固定文のみ返す。
- 連携済み分析: Gemini/RPCを止め、安全な定型応答。
- 監査ログに `rate_limit_unavailable` を残す。

応答例:

```txt
現在、一時的にLINE分析機能を制限しています。
本部ダッシュボードから確認してください。
```

---

## 12. LLM / NLU設計

### 12.1 Intent抽出prompt方針

- system promptでqueryType allowlistを明示。
- 出力はJSONのみ。
- SQL/RPC名/clinic_idを出力させない。
- 分からない場合は `unsupported` を返させる。

### 12.2 応答整形prompt方針

LLMには、コード確定済みの以下だけを渡す。

```json
{
  "queryType": "revenue_period_totals",
  "periodLabel": "2026/06/01〜2026/06/16",
  "clinicCount": 12,
  "rows": [
    {
      "clinicName": "新宿院",
      "revenue": 1820000,
      "insurance": 920000,
      "private": 900000
    }
  ],
  "disclaimer": null
}
```

渡さないもの。

- user raw text。
- patient-level row。
- report_text。
- staff name。
- phone/email/address。
- DBエラー詳細。

### 12.3 数値ハルシネーション対策

- 数値はコード側でformat済みにする。
- LLMには数値の計算をさせない。
- 応答前に、数値が入力JSON内に存在するものだけか検査する。
- 検査が難しい場合は、LLMを使わずテンプレートで返す。

v0.4 MVPでは、**テンプレート応答を推奨**する。  
Gemini利用はintent抽出だけでも十分価値が出る。

---

## 13. テスト方針

`clinic_id` / `role` / `user_id` / scopeに触るため、テスト追加は必須。

### 13.1 必須テスト

#### Webhook

- 正しい署名なら受理。
- 不正署名なら拒否。
- 同一eventIdは二重処理しない。
- text以外は固定応答または無視。
- route内でGemini/RPC/reply APIを呼ばない。
- routeはevent保存/job enqueue後にHTTP 200を返す。
- queued eventがworkerでprocessing/completedへ遷移する。
- reply token失効時にpush fallbackを試みる。
- reply/pushとも失敗した場合は `reply_failed` になり、内部エラーをユーザーへ返さない。
- LINE reply API失敗時に原文や内部エラーを返さない。

#### Identity binding

- 未連携userにデータを返さない。
- `verified=false` は無効。
- `revoked_at is not null` は無効。
- SaaS user inactiveは無効。
- channel違いのline_user_idを混同しない。

#### Scope

- managerは担当院のみ。
- clinic_admin/adminは既存scope通り。
- scope外clinic指定はclamp。
- inactive clinicは除外。
- scope空ならデータを返さない。
- LINE経由結果と既存manager分析APIのscopeが一致する。

#### PII

- 患者名らしき入力をGeminiへ渡さない。
- 電話番号をGeminiへ渡さない。
- 症状相談をGeminiへ渡さない。
- report_textを取得しない。
- 応答にPIIが含まれない。

#### QueryType

- allowlist外は拒否。
- 書き込み意図は拒否。
- 曖昧入力は拒否または質問返しではなく安全応答。
- limit上限が効く。

#### JST

- 今日/昨日/今月/先月がJSTで解釈される。
- UTC日付ズレが起きない。
- 応答に対象期間が出る。

#### Repository

- `createAdminClient` をroute/handlerから直接呼んでいない。
- repositoryはread-onlyだけ。
- insert/update/delete/upsertが存在しない。
- 対象RPC以外を呼ばない。
- 全repository methodで `assertSubsetClinicScope` が呼ばれる。
- 全RPC呼び出し直前で `assertSubsetClinicScope` が再実行される。
- `resolvedTargetClinicIds ⊆ effectiveClinicIds` が偽ならRPCが呼ばれない。
- `p_clinic_ids` にscope外clinicを混ぜた場合、全メソッドで `LINE_ANALYTICS_SCOPE_VIOLATION` になる。
- scope外clinicの結果が返らない。
- queryTypeごとにscope外混入テストを網羅する。

#### DB backstop wrapper（採用する場合）

- `p_clinic_ids` がDB上の許可scope内なら成功。
- `p_clinic_ids` にscope外clinicが1つでも混ざれば失敗。
- `p_clinic_ids` が空なら失敗。
- inactive clinicは失敗または除外。
- `authenticated` から直接executeできない。
- `search_path` が固定されている。

#### Rate limit

- user単位で制限される。
- channel単位で制限される。
- Redis障害時にGemini/RPCを止める。

### 13.2 テスト配置

```txt
src/__tests__/api/line-webhook.test.ts
src/__tests__/security/line-analytics-scope.test.ts
src/__tests__/security/line-analytics-pii.test.ts
src/__tests__/security/line-analytics-idempotency.test.ts
src/__tests__/rls/line-account-links-rls.test.ts
src/__tests__/lib/line-intent-schema.test.ts
src/__tests__/lib/line-period-jst.test.ts
```

---

## 14. 受け入れ条件

### 14.1 セキュリティ

- [ ] Webhook署名検証がある。
- [ ] 不正署名は拒否される。
- [ ] LINE event idempotencyがある。
- [ ] 同一eventは二重処理されない。
- [ ] 未連携ユーザーにデータを返さない。
- [ ] revoked / unverified bindingにデータを返さない。
- [ ] inactive SaaS userにデータを返さない。
- [ ] scope解決が既存認可思想と一致する。
- [ ] manager roleは担当院のみ閲覧できる。
- [ ] inactive clinicが除外される。
- [ ] scope外clinic指定がclampされる。
- [ ] scope外clinicの存在を応答で明かさない。
- [ ] `createAdminClient` をroute/handlerから直接呼んでいない。
- [ ] 書き込み/副作用RPCが存在しない。
- [ ] PIIがGeminiに渡らない。
- [ ] PIIがLINE応答に含まれない。
- [ ] LINE入力原文を監査ログに保存しない。

### 14.2 機能

- [ ] `revenue_period_totals` が動く。
- [ ] `insurance_estimate_gap` が動く。
- [ ] `daily_report_status` が動く。
- [ ] 期間がJSTで解釈される。
- [ ] 回答に対象期間が出る。
- [ ] 回答に対象店舗数が出る。
- [ ] 保険売上回答に概算ディスクレーマが出る。
- [ ] queryType allowlist外は拒否される。
- [ ] 書き込み意図は拒否される。

### 14.3 品質

- [ ] `npm run type-check` 通過。
- [ ] `npm run lint` 通過。
- [ ] `any` / `as any` を増やさない。
- [ ] migrationとrollbackがセット。
- [ ] LINE/Geminiはテストでmock。
- [ ] エラー詳細をLINEに出さない。
- [ ] Geminiコスト上限がある。
- [ ] Redis障害時のfail-closedがある。

---

## 15. 実装フェーズ

| Phase | 内容 | 書き込み | 優先 |
|---|---|---:|---:|
| Phase 0 | LINE基盤: 署名検証、idempotency、Account Linking、binding table | bindingのみ | P0 |
| Phase 1 | 読み取りMVP: `revenue_period_totals`, `insurance_estimate_gap`, `daily_report_status` | なし | P0 |
| Phase 2 | `patient_counts`, `store_ranking` 追加、応答品質改善 | なし | P1 |
| Phase 3 | 軽いマルチターン、ダッシュボードdeep link | なし | P2 |
| Future | 書き込み/自動操作。別spec必須 | あり | 対象外 |

---

## 16. 未決事項

1. **Account Linkingの最終方式**  
   LINE Loginだけで足りるか、LINE Account LinkingのlinkTokenを使うか。推奨はlinkToken/nonce方式。

2. **対象ロール**  
   v0.4 MVPは `admin / clinic_admin / manager` に限定する。staff解放は非推奨。

3. **マルチ公式アカウント**  
   1テナント1公式アカウントか、共通公式アカウントか。v0.4では `line_channel_id` を必ず保存して将来に備える。

4. **Gemini利用範囲**  
   MVPではintent抽出のみGemini、応答はテンプレート推奨。出力整形にも使うかはコストと安全性で判断。

5. **保険売上の概算文言**  
   `revenue_estimates` のDB既定文言と完全一致させるか、LINE向け短縮文言にするか。

6. **監査ログ統合先**  
   既存AuditLogger/tableへ統合するか、`line_analytics_audit_logs` を新設するか。

---

## 17. リスク

| リスク | 致命度 | 内容 | 対策 |
|---|---:|---|---|
| 技術 | 高 | 短命ユーザートークン案が既存RPC grantと不整合 | v0.4ではLineAnalyticsReadContext方式に固定 |
| 技術 | 高 | service_roleの直接利用が広がる | route/handlerで禁止。repository内に閉じる。RPC直前subset assertion必須 |
| 技術 | 中 | daily_reports read-modelから自由記述が混入 | aggregate-only read model新設 |
| 市場 | 中 | コア未実証で会話UIに逃げる | P2維持。有償実証後に着手 |
| 法務 | 高 | 患者情報をGemini/LINEへ出す | PII pre-filter、原文保存禁止 |
| 法務 | 高 | LINE端末共有で数字漏洩 | binding厳格化、unlink、role限定 |
| オペ | 中 | webhook再送で二重返信/二重課金 | event idempotency + job status lock |
| オペ | 中 | Redis障害時にコスト暴走 | LINE分析ではfail-closed |
| 資金 | 中 | Geminiコスト暴走 | rate limit、テンプレート応答、呼び出し上限 |

---

## 18. ペイするか

### 現時点

**今すぐ実装はペイしない。**

理由:

- 本部OSの有償価値検証が先。
- 会話UIは売れる理由というより、売れた後の利用頻度を上げる体験。
- セキュリティ・idempotency・PII対策が必要で、軽く見積もると事故る。
- 実装すると、LINE基盤・連携UX・監査・rate limitまで巻き込むため、P2としては重い。

### 有償実証後

**ペイする可能性は高い。**

刺さる理由:

- 本部長/経営者はLINEに常駐している。
- 「今日まだ日報が出ていない院」「保険売上予測からズレた院」「今月の自費売上トップ院」をLINEで聞けるのは体験価値が高い。
- デモ映えする。
- 導入後の利用頻度を上げやすい。
- 本部OSの堀を会話UIで見せられる。

---

## 19. Codex / Claude 実装指示用メモ

実装時は以下を守ること。

```txt
この機能はLINE公式アカウントから本部分析を読むread-only interfaceである。
書き込み、自動操作、患者情報取得は禁止。

既存のservice role RPCを使う可能性があるが、route/handlerからcreateAdminClientを直接呼んではならない。
必ずLineAnalyticsReadContextを生成し、scope確定済み・queryType allowlist済み・read-only repository経由で実行する。

LLMにscope判定、SQL生成、権限判定をさせてはならない。
LLMへ投入する前にPII pre-filterを通すこと。
患者名、電話番号、症状相談、カルテ、施術内容、クレームはGeminiへ渡さず固定応答にする。

LINE webhookは再送されるため、event idempotencyを必ず実装する。
同一eventIdは二重にGemini/RPC/reply APIを実行してはならない。

daily_reportsの既存read-modelをそのまま使わない。
LINE用にはaggregate-only read modelを作る。
report_text、staff.name、patient-level rowは取得禁止。

MVP queryTypeは以下3つ:
- revenue_period_totals
- insurance_estimate_gap
- daily_report_status

JST期間解釈を必ず使い、応答には対象期間と対象店舗数を含める。
保険売上系には概算ディスクレーマを必ず付ける。
```

---

## 20. 最終判断

この仕様は、Tiramisuの本部OS価値を「LINEで即答される体験」に拡張するための良い追加機能である。  
ただし、現時点ではコア有償実証より優先してはいけない。

実装するなら、v0.1のままではなく、このv0.4の制約を前提にする。

特に絶対に守るべきなのは以下。

1. `LineAnalyticsReadContext` 経由に限定する。
2. PIIをGeminiへ渡さない。
3. webhook idempotencyを入れる。
4. `resolvedTargetClinicIds ⊆ effectiveClinicIds` の部分集合アサーションをrepository entryとRPC直前に入れる。
5. LINE webhookを非同期化し、200即返し + reply/push dispatcherへ分離する。
6. DBバックストップRPCをP1 hardening候補に入れる。
7. aggregate-only read modelにする。
8. route/handlerで `createAdminClient` を直接使わない。
9. staffには解放しない。v0.4は本部/manager以上限定。

この順番を崩すと、便利なLINE分析機能ではなく、クロステナント漏洩とPII流出の入口になる。  
それは絶対に割に合わない。


---

## 21. 外部仕様メモ（LINE）

- LINE Messaging APIは webhook event の非同期処理を推奨している。
- LINE webhook endpointはHTTP POST受信後に `200 OK` を返す必要があり、失敗時には再送される可能性がある。
- reply tokenはmessage eventに含まれる返信用tokenであり、期限切れまたは使用済みの場合は `Invalid reply token` になる。

実装上の帰結:

- webhook routeで長時間処理を抱えない。
- `webhookEventId` によるidempotencyを必須にする。
- reply token失効時のpush fallbackを設ける。
- push fallback失敗時も内部エラーをユーザーに露出しない。
