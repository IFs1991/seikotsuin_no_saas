# HQ分析 会話クエリ・インターフェース（LINE）仕様書 v0.1（素案）

作成日: 2026-06-17
ステータス: **素案 / Draft**（実装着手前のたたき台。未決事項は §13 に集約）
対象リポジトリ: `IFs1991/seikotsuin_management_saas`
対象領域: LINE公式アカウント / 本部分析（HQ Analytics） / Manager階層scope / Supabase RLS
優先度: P2（コア本部OSの有償実証より後。キュー割り込み禁止）

---

## 0. この素案の位置づけ

「CSエージェントが公式LINEからSaaSを自動操作する」構想の **第一段階のみ** を仕様化する。

- 本v0.1は **読み取り専用（read-only）の会話クエリ・インターフェース** に限定する。
- **書き込み・自動操作（データ作成/更新/削除）は本仕様の対象外**（§3.2、将来フェーズ §9）。
- 目的は「本部（HQ）の意思決定者が、LINEで自然文質問 → エージェントが本部分析を読み取り → 回答」する体験を、**既存のセキュリティ不変条件を一切緩めずに**提供すること。
- 本機能は **`docs/stabilization/spec-performance-auth-waterfall-fix` 系のコア本部OS価値（日報・店舗比較・保険売上予測）が有償グループで実証された後** に着手する前提（[[go-to-market]] の判断）。

---

## 1. 要約

本部長・経営者は、店舗横断の数字を「今すぐ・軽く」知りたい場面が多い。ダッシュボードを開いて絞り込む操作はフロント摩擦になる。

そこで、**公式LINEに質問を送ると、エージェントが本部分析（既存RPC/集計）を読み取り、要約して返す**読み取り専用インターフェースを提供する。

例:

```txt
ユーザー（本部長）: 今月、予測より保険入金が低い院は？
エージェント: 6月（6/1〜6/16）時点で、保険売上の「概算予測 vs 実績」が乖離している院は次の3院です。
  1. 新宿院  予測 ¥1,240,000 / 実績 ¥980,000（-21%）
  2. ...
  ※「経営分析用の概算」です。請求確定額ではありません。
```

設計の核は以下。

1. **読み取り専用**。本フェーズでは一切書き込まない。
2. **既存の認可境界をそのまま使う**。scope判定は `resolveEffectiveClinicScope` / `ensureClinicAccess` と同一経路。手書きしない。
3. **LINEユーザーを検証済みSaaSアカウントに厳格に紐付ける**（identity binding）。誤紐付け＝クロステナント漏洩のため fail-closed。
4. **service role / RLSバイパスを拡大しない**。エージェントは「連携ユーザーの権限の範囲内」でのみ読む。
5. **LINEチャネルへのPII露出を最小化**する。

---

## 2. 背景・目的

### 2.1 背景

- 整骨院グループのスタッフ・本部は業務上LINE常駐。会話UIは導入摩擦が低い。
- 本プロダクトの堀は「本部目線の、信頼できる店舗横断分析」（[[product-positioning]]）。保険売上予測（`revenue_estimates`）×店舗比較は競合（スプレッドシート/単純集計）にない価値。
- それを「最高の体験（会話）」で届けると差別化が立つ。

### 2.2 目的

- 本部意思決定者が、UI操作なしで主要KPIに到達できる。
- ソロ運営のオンボーディング/サポート負荷を、会話で一部肩代わりする（[[go-to-market]] のボトルネック緩和）。
- **コア分析の堀を、低リスク（読み取り）で会話体験に拡張する**。

### 2.3 非目的（v0.1）

- データ入力・編集・予約操作などの自動実行（書き込み）。
- 患者個人情報（氏名・連絡先・施術内容など）のLINE上での提示。
- LINE以外のチャネル（Web chat等）。
- マルチターンの高度な対話状態管理（v0.1は単発Q&A中心）。

---

## 3. スコープ

### 3.1 対象（v0.1）

- LINE公式アカウント（Messaging API）Webhook受信。
- LINEユーザー ↔ SaaSアカウントのアカウント連携（LINE Login）。
- 自然文 → 意図（intent）+ パラメータ抽出 → **既存の本部分析RPC/集計の読み取り** → 整形回答。
- 対応する読み取りクエリの初期セット（§7）。
- 監査ログ・レート制限・fail-closed。

### 3.2 対象外（v0.1、明確に禁止）

- あらゆる**書き込み系操作**（`insert`/`update`/`delete`/upsert/RPCの副作用あり関数）。
- service role による横断読み取りの新規拡大。
- 患者PII（氏名・電話・住所・症状・カルテ本文）のLINE応答への混入。
- 管理者専用データ（他テナント、`admin/*` 専用集計）の会話経由提供。

---

## 4. 用語

| 用語 | 定義 |
|---|---|
| HQ分析 | 本部向けの店舗横断集計。既存の `manager_revenue_period_totals` 等のRPC・`daily_reports` 集計・`revenue_estimates` を指す |
| Identity binding | LINEの `userId` を、検証済みSaaSユーザー（`user_id` + `clinic_id`/scope + `role`）へ紐付けること |
| 連携ユーザー | binding 済みのSaaSユーザー。エージェントの読み取りは常にこのユーザーの effective scope に限定 |
| Effective scope | `resolveEffectiveClinicScope` が返す、当該ユーザーが閲覧可能なclinic集合 |
| Intent | 自然文から抽出した「何を聞いているか」の構造化表現（クエリ種別＋期間＋対象scope） |

---

## 5. アーキテクチャ概要

```txt
LINEユーザー
  │  (1) メッセージ送信
  ▼
LINE Messaging API
  │  (2) Webhook POST  /api/line/webhook
  ▼
[署名検証 X-Line-Signature (HMAC-SHA256, LINE_CHANNEL_SECRET)]
  │  (3) レート制限（Upstash Redis、既存 rate-limiting 流用）
  ▼
[Identity binding 解決]  line_user_id → 連携ユーザー(user_id, scope, role)
  │   未連携なら → アカウント連携導線(LINE Login)を返して終了（fail-closed）
  ▼
[Effective scope 解決]  resolveEffectiveClinicScope(連携ユーザー)
  │
  ▼
[Intent抽出 (Gemini)]  自然文 → {queryType, period(JST), targetScope ⊆ effective scope}
  │   抽出不能/対象外/書き込み意図 → 安全な定型応答（実行しない）
  ▼
[読み取り実行]  既存HQ分析RPC/集計を「連携ユーザーのscope」で呼ぶ（read-only）
  │
  ▼
[応答整形 (Gemini)]  数値 → 自然文（PII除外、概算ディスクレーマ付与）
  │  (4) reply API で返信
  ▼
[監査ログ記録]  who(連携ユーザー) / what(queryType,scope) / when(JST)
```

要点:

- Webhookは **セッションレス**（Cookie認証がない）。したがって §6.3 の方式で「連携ユーザーとして読み取る」設計を取る。
- Intent抽出・応答整形に **Gemini**（既存スタック）を使う。**認可判定・scope解決はLLMに委ねない**（LLMはあくまで自然文⇄構造化の変換のみ）。

---

## 6. セキュリティ不変条件（最重要）

> 本機能は速度・体験のために RLS / 認可 / テナント分離 / scope を**一切緩めない**。判断に迷ったら fail-closed。

### 6.1 Identity binding（厳格・検証必須）

- LINE `userId` 単独を信頼しない。**LINE Login（OAuth）でSaaSアカウントにログインして初めて連携成立**。
- 連携情報は新規テーブル `line_account_links` に保存（§8.1）。`verified = true` のもののみ有効。
- Webhookで未連携の `userId` から来た場合、**データは一切返さず**、連携導線（LINE Loginリンク）を案内して終了。
- 連携解除（unlink）、SaaS側でのユーザー無効化（`is_active=false`）時は即座に binding を無効化。
- LINEの `userId` は **チャネル単位**で異なる点に注意（複数公式アカウントを跨がない）。

### 6.2 scopeは正準経路のみ（手書き禁止）

- エージェントが読める範囲は、**連携ユーザーの `resolveEffectiveClinicScope` の結果に限定**。
- intentで指定された `targetScope` は **effective scope との積集合**にクランプ。範囲外clinicは黙って除外（情報露出しない）。
- `ensureClinicAccess` / `manager-scope` と**同一の判定**を使う。bootstrap APIと同様、独自scope判定を書かない（[[product-positioning]] の不変条件）。

### 6.3 RLSをバイパスしない（実行コンテキスト）

セッションレスWebからの読み取りをどう「連携ユーザーの権限」で行うか。**2案、いずれも read-only・scope限定・監査必須**。最終決定は §13。

- **案A（推奨・RLS忠実）**: 連携ユーザーの**短命スコープ付きトークン/セッション**をサーバ側で発行し、それで通常の RLS 経路（`createClient` 相当）からRPC/集計を読む。RLSが最後の砦として効く。
- **案B（代替）**: `createScopedAdminContext`（clinic scope検証付き）で **読み取り専用**に限定して呼ぶ。RLSは経由しないが、(1) scopeは §6.2 で正準解決、(2) 対象RPCは `security definer` 側でも scope を検証（多層防御）、(3) read-onlyのみ、を必須条件とする。

いずれの案でも **`createAdminClient`（無制限service role）でのデータアクセスは禁止**。書き込みクライアントは生成しない。

### 6.4 PII露出の最小化

- LINE応答に **患者氏名・連絡先・症状・カルテ本文・個人特定可能情報を含めない**。
- 返すのは**集計値・店舗単位の数字・KPI**まで。個人粒度が必要な問いには「本部ダッシュボードでご確認ください」とUIへ誘導。
- 保険売上は必ず**概算ディスクレーマ**（`revenue_estimates` のDB既定値と同文言）を付す。

### 6.5 LLMガードレール（プロンプトインジェクション対策）

- LLMは**自然文⇄構造化の変換のみ**。DBアクセス権限・scopeを判断させない。
- intentは**allowlist化されたqueryTypeのみ**受理。未知/曖昧/書き込み示唆は実行せず定型応答。
- LLM出力をそのままクエリに使わない。**抽出パラメータをZodで再検証**し、scope/期間の妥当性をコード側で確定。
- ユーザー入力に含まれる「管理者として」「全店を見せろ」等の指示は無効（scopeはbindingで確定済み、入力で昇格不可）。

### 6.6 監査・レート制限・fail-closed

- すべての読み取りを監査ログに記録（連携ユーザー / queryType / 解決scope / JST時刻）。既存 `AuditLogger` 思想に準拠。
- Webhookに既存レート制限（Upstash Redis）を適用。乱用・コスト暴走を抑止。
- 例外時は**情報を返さず**安全な定型応答（「うまく取得できませんでした」）。エラー詳細はLINEに出さない。

---

## 7. 機能仕様（読み取りクエリ初期セット）

v0.1の `queryType` allowlist（すべて read-only、すべて effective scope 内）。

| queryType | 自然文例 | 参照元（既存資産） | 返す内容 |
|---|---|---|---|
| `revenue_period_totals` | 「今月の売上は？」「先月の自費売上トップ3店は？」 | `manager_revenue_period_totals` 等 | 期間×店舗の売上/保険/自費集計 |
| `insurance_estimate_gap` | 「予測より保険入金が低い院は？」 | `revenue_estimates` × 実績 `daily_reports` | 概算 vs 実績の乖離店舗（概算ディスクレーマ付） |
| `patient_counts` | 「今週の来院数は？店舗別で」 | `daily_reports` 集計 / patient analysis RPC | 期間×店舗の来院数・新患数 |
| `store_ranking` | 「今月の売上ランキングは？」 | 上記の並べ替え | scope内店舗のランキング |
| `daily_report_status` | 「今日まだ日報入力がない院は？」 | `daily_reports` / `daily_report_items` | 未入力・未捕捉の検知（堀の中核） |

- 期間は **必ず `src/lib/jst.ts` のJSTユーティリティ**で解釈（「今月」「先週」等）。UTC/JST混在禁止（DoD-06）。
- 各回答末尾に、対象期間・対象店舗数・（保険は）概算注記を明示。

---

## 8. データ / 既存資産

### 8.1 新規テーブル（要migration + rollback）

```sql
-- line_account_links : LINEユーザー ↔ 検証済みSaaSユーザー
-- @rollback supabase/rollbacks/<ts>_line_account_links_rollback.sql
create table if not exists public.line_account_links (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  line_channel_id text not null,
  line_user_id text not null,
  verified boolean not null default false,
  linked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_account_links_pkey primary key (id),
  constraint line_account_links_unique_channel_line_user
    unique (line_channel_id, line_user_id)
);
-- RLS: 本人 + 当該clinicのadmin/managerのみ参照可。service roleは連携処理のみ。
```

- AGENTS.md要件: migration追加時は本仕様書 + ロールバックSQL をセットで用意。SSOTは `supabase/migrations/`。

### 8.2 既存資産の再利用（新規実装を最小化）

- scope解決: `resolveEffectiveClinicScope` / `ensureClinicAccess`（`src/lib/auth/manager-scope.ts`, `src/lib/supabase/guards.ts`）
- 分析: 既存RPC（`manager_revenue_*`, `manager_patient_*`）、`revenue_estimates`、`daily_reports`
- read model: 既存の日報read-model（`src/lib/daily-reports/read-model.ts`）を読み取りに流用検討
- 応答エンベロープ/エラー: `createSuccessResponse` / `handleRouteError` / `AppError`（内部API向け。LINE応答整形は別レイヤ）
- レート制限・監査: `src/lib/rate-limiting/`, `AuditLogger`

---

## 9. 実装フェーズ

| フェーズ | 内容 | 書き込み |
|---|---|---|
| Phase 0 | LINE基盤（Webhook署名検証、Messaging API、LINE Login連携、`line_account_links`） | 連携情報のみ |
| Phase 1 | 読み取りMVP: intent抽出（allowlist 2〜3種：`revenue_period_totals`, `insurance_estimate_gap`, `daily_report_status`）→ scope限定読み取り → 整形回答 | **なし** |
| Phase 2 | queryType拡充（ランキング・来院数）、回答品質・JST期間表現の強化、軽いマルチターン | **なし** |
| 将来（別spec） | 書き込み/自動操作。**allowlist + 実行前確認 + RLSスコープ内 + 監査必須**。本仕様では扱わない | あり（別途厳格設計） |

---

## 10. LLM / NLU設計

- モデル: Gemini（既存スタック）。
- 役割を2点に限定:
  1. **入力理解**: 自然文 → `{ queryType(allowlist), period, targetClinicHint }` の構造化（JSON）。
  2. **出力整形**: コードが取得した数値配列 → 簡潔な自然文（PII除外、注記付与）。
- **やらせないこと**: scope判定、権限判定、SQL生成、テーブル直アクセス。
- 抽出結果は **Zodで再検証**（`src/lib/schemas/`）。allowlist外・必須欠落は実行拒否。
- LLM応答の不確実性に備え、数値は**コード側が確定**し、LLMは文章化のみ（ハルシネーション数値を出さない）。

---

## 11. テスト方針

CLAUDE.md / AGENTS.md準拠。**`clinic_id`/`role`/`user_id`/scope に触れるためテスト追加必須**。

- **テナント分離（必須）**: 連携ユーザーAのLINEから、scope外clinicの数字が一切返らないこと。範囲外clinic指定時のクランプ。
- **未連携 fail-closed**: 未binding `userId` にデータが返らないこと、連携導線を返すこと。
- **scope一致**: エージェント経由の結果が、既存API（`ensureClinicAccess`経由）と**同一scope判定**になる回帰テスト。
- **書き込み不発**: 書き込み示唆入力（「日報を消して」等）で副作用が起きないこと。
- **PII除外**: 患者氏名等が応答に含まれないこと。
- **intent/Zod**: allowlist外・曖昧入力の拒否、JST期間解釈。
- **署名検証**: 不正 `X-Line-Signature` の拒否。
- 配置: `src/__tests__/{api,auth,security,rls}/` 慣行に従う。LINE/Gemini はモック。

---

## 12. 受け入れ条件（v0.1）

- [ ] Webhookが署名検証・レート制限を通過する
- [ ] 未連携LINEユーザーにデータを返さず連携導線を返す（fail-closed）
- [ ] エージェントの読み取りが連携ユーザーの effective scope に厳密に限定される
- [ ] scope判定が `resolveEffectiveClinicScope`/`ensureClinicAccess` と一致（手書きscopeなし）
- [ ] `createAdminClient`（無制限service role）でのデータ読み取りをしていない
- [ ] 書き込み/副作用のある操作を一切行わない
- [ ] 応答に患者PIIが含まれない
- [ ] 保険売上回答に概算ディスクレーマが付く
- [ ] 期間解釈がJSTユーティリティ経由
- [ ] 全読み取りが監査ログに記録される
- [ ] `npm run type-check` / `npm run lint` 通過（`any`/`as any`なし）
- [ ] テナント分離・scope一致・未連携fail-closedの回帰テストがある

---

## 13. 未決事項（要決定）

1. **実行コンテキスト（§6.3）**: 案A（連携ユーザーの短命スコープトークンでRLS経由）か案B（read-only scoped admin context）か。**RLS忠実性の観点では案A推奨**だが、短命トークン発行の実装コストとセッション管理を要評価。
2. **アカウント連携UX**: LINE Login のリンクをどこで発行するか（SaaS内設定画面 / 初回メッセージ応答）。連携の有効期限・再連携フロー。
3. **対象ロール**: v0.1は本部意思決定者（admin/clinic_admin/manager）に限定するか。一般staffに会話クエリを許すかは scope/PII観点で別途判断。
4. **コスト管理**: Gemini呼び出し回数の上限、レート制限の閾値、悪用対策。
5. **マルチ公式アカウント**: テナントごとに公式アカウントを分けるか、1アカウントで複数テナントを binding で振り分けるか（後者は誤紐付けリスクが上がる）。
6. **LINE規約/個人情報**: LINEチャネルへ何を出してよいかの最終線引き、利用規約・プライバシーポリシーへの追記。

---

## 14. リスク

| リスク | 致命度 | 対策 |
|---|---:|---|
| LINEユーザー誤紐付けでクロステナント漏洩 | 高 | LINE Login検証必須、未連携fail-closed、binding一意制約 |
| エージェントがRLS/scopeをバイパス | 高 | service role禁止、正準scope解決、read-only、多層防御 |
| プロンプトインジェクションで想定外取得 | 高 | LLMは変換のみ・allowlist・Zod再検証・scopeは入力で昇格不可 |
| 患者PIIのLINE流出 | 高 | 応答は集計粒度まで、PII除外テスト |
| 検証前の過剰投資（コア未実証で着手） | 中 | コア本部OS有償実証後に着手（キュー割り込み禁止） |
| 概算を確定額と誤認 | 中 | 概算ディスクレーマ必須（DB既定値と同文言） |
| Geminiコスト暴走 | 低 | レート制限・呼び出し上限 |

---

## 15. 判断

会話クエリは、本プロダクトの堀（保険売上予測×店舗横断分析）を**最高の体験で見せる低リスクな拡張**になり得る。ただし価値が出るのは「読み取り専用・scope厳格・PII除外・RLS非バイパス」を守った場合に限る。

着手順は変えない: **コア本部OSを有償グループで実証 → 本v0.1（読み取り会話） → 将来の書き込み（別spec・厳格設計）**。自動操作（書き込み）を先に作るのは、漏洩リスクと検証前深掘りの両面で不可。
