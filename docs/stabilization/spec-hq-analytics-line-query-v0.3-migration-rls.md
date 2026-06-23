# HQ分析 会話クエリ・インターフェース（LINE）仕様書 v0.3（Migration / RLS詳細反映版）

作成日: 2026-06-17  
ステータス: **仕様改訂案 / Draft v0.3**  
対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象領域: LINE公式アカウント / 本部分析（HQ Analytics） / Manager階層scope / Supabase RLS / Service Role境界  
優先度: **P2**（コア本部OSの有償実証より後。キュー割り込み禁止）

---

## 0. この仕様書の位置づけ

本仕様は、「LINE公式アカウントからSaaSを会話操作する」構想のうち、**第一段階: 読み取り専用の本部分析クエリ**だけを定義する。

v0.1からの主要修正点は以下。

1. 現リポジトリの実装に合わせ、実行コンテキストを **`LineAnalyticsReadContext` 方式**に寄せる。
2. `createAdminClient` の直接利用を禁止し、**scope確定済みのread-only repository経由**に限定する。
3. LINE入力をLLMへ渡す前に、**PII / 患者情報 / 症状相談 / クレーム等をpre-filter**する。
4. LINE webhookの再送対策として、**idempotency**を必須化する。
5. `daily_reports` の既存read-modelをそのまま使わず、**LINE用 aggregate-only read model**を新設する。
6. v0.1で推奨されていた「短命ユーザートークンでRLS経由」は、既存RPCのgrant設計と不整合があるため、v0.3では採用しない。

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

v0.3では以下を扱わない。

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

---

## 5. アーキテクチャ概要

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
  - eventId / webhookEventId を保存
  - 既処理なら200だけ返して終了
  │
  ▼
[低コストpre-filter]
  - 未対応event typeを拒否
  - テキスト以外を拒否
  - PII / 患者情報 / 症状相談 / クレームを検知
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
[LineAnalyticsReadContext生成]
  - user_id
  - role
  - effectiveClinicIds
  - resolvedTargetClinicIds
  - requestId
  - readOnly: true
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
[LINE reply API]
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
  - JST timestamp
```

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

v0.3では、短命ユーザートークンによるRLS経由案を採用しない。

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

v0.3では、PII対策を「LINE応答に出さない」だけではなく、**Geminiに渡さない**まで引き上げる。

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

v0.3 MVPでは、P0の3種だけ実装する。

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

idempotency用。

```sql
create table if not exists public.line_webhook_events (
  id uuid default extensions.uuid_generate_v4() not null,
  line_channel_id text not null,
  event_id text not null,
  line_user_id_hash text,
  event_type text not null,
  status text not null default 'received',
  processed_at timestamptz,
  error_category text,
  created_at timestamptz not null default now(),

  constraint line_webhook_events_pkey primary key (id),
  constraint line_webhook_events_unique_event
    unique (line_channel_id, event_id)
);
```

#### status候補

- `received`
- `ignored`
- `blocked`
- `processed`
- `failed`

#### ルール

- unique制約違反なら既処理として扱う。
- 既処理eventではGemini/RPC/reply APIを再実行しない。
- LINEには200を返す。

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

v0.3では、LINE連携系テーブルは **アプリクライアントからの直接書き込みを原則禁止**する。  
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
4. queryType allowlist。
5. aggregate-only read model。
6. 監査ログ。
7. scope外取得の回帰テスト。

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
そのため、v0.3では以下を明確にする。

#### 採用しない

```txt
LINE user
  → Supabase authenticated client
  → manager_revenue_period_totals RPC
  → RLSで制御
```

#### 採用する

```txt
LINE user
  → binding済みSaaS user_id
  → resolveEffectiveClinicScope
  → resolvedTargetClinicIds
  → LineAnalyticsReadContext
  → read-only repository
  → service_role RPC call
```

この設計では、DB RLSはLINE分析RPCの最終防衛線にはならない。  
したがって、**アプリ層のscope clampとrepository制約が安全境界**になる。

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
        line-analytics-repository.ts
        format-line-response.ts
        audit-line-analytics.ts
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

責務:

1. 署名検証。
2. event idempotency。
3. event type判定。
4. handlerへ委譲。
5. 常にLINE仕様に沿ったHTTP response。

責務外:

- scope判定の直書き。
- DB集計の直呼び。
- Gemini prompt組み立ての直書き。
- service_role直接生成。

### 10.3 Handler責務

```ts
async function handleLineTextMessage(event: LineTextMessageEvent): Promise<void> {
  // 1. pre-filter
  // 2. account binding
  // 3. rate limit
  // 4. scope resolve
  // 5. intent parse
  // 6. read context
  // 7. repository read
  // 8. response format
  // 9. reply
  // 10. audit
}
```

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
```

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

v0.3 MVPでは、**テンプレート応答を推奨**する。  
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
- scope外clinicの結果が返らない。

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
   v0.3 MVPは `admin / clinic_admin / manager` に限定する。staff解放は非推奨。

3. **マルチ公式アカウント**  
   1テナント1公式アカウントか、共通公式アカウントか。v0.3では `line_channel_id` を必ず保存して将来に備える。

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
| 技術 | 高 | 短命ユーザートークン案が既存RPC grantと不整合 | v0.3ではLineAnalyticsReadContext方式に固定 |
| 技術 | 高 | service_roleの直接利用が広がる | route/handlerで禁止。repository内に閉じる |
| 技術 | 中 | daily_reports read-modelから自由記述が混入 | aggregate-only read model新設 |
| 市場 | 中 | コア未実証で会話UIに逃げる | P2維持。有償実証後に着手 |
| 法務 | 高 | 患者情報をGemini/LINEへ出す | PII pre-filter、原文保存禁止 |
| 法務 | 高 | LINE端末共有で数字漏洩 | binding厳格化、unlink、role限定 |
| オペ | 中 | webhook再送で二重返信/二重課金 | event idempotency |
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

実装するなら、v0.1のままではなく、このv0.3の制約を前提にする。

特に絶対に守るべきなのは以下。

1. `LineAnalyticsReadContext` 経由に限定する。
2. PIIをGeminiへ渡さない。
3. webhook idempotencyを入れる。
4. aggregate-only read modelにする。
5. route/handlerで `createAdminClient` を直接使わない。
6. staffには解放しない。v0.3は本部/manager以上限定。

この順番を崩すと、便利なLINE分析機能ではなく、クロステナント漏洩とPII流出の入口になる。  
それは絶対に割に合わない。
