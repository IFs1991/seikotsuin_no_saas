# Post-Core100 監査再分類

確認日: 2026-09-06 JST。修正前の基準main: `c028573d089cb6085ab3e29121fa9fe4d2f923c0`。
この初版はアプリコードを変更する前に作成した。CONFIRMEDは現行コードの原因確認を意味し、修正完了・実環境PASSを意味しない。各修正はRED、最小修正、回帰、CIの順で別PRにする。

参照: 今回の添付プロンプト、`core100-release-result.md`、`core100-release-changes.md`、`commercial-hardening-pr00-audit.md`、作業元にある未追跡の `spec-saas-review-findings-remediation-v0.1.md`。添付内の「以前の技術監査」「最新のCore100再確認レポート」の独立した原本は保存先未特定であり、全原本照合は未完了。過去の指摘を現在の未修正項目へ一括転記しない。

## 修正前の再確認

| Finding | 状態 | 現行コード根拠・再現条件 | 修正要否 | 優先度 | 推奨PR |
| --- | --- | --- | --- | --- | --- |
| 患者PATCHが省略email/notesを消去 | CONFIRMED | `src/app/api/customers/schema.ts:140` `mapCustomerUpdateToRow` が両方を `?? null` へ変換。nameまたはphoneだけのPATCHでもnullを送る | 必要。未指定は保持、明示削除の契約を定義 | P1 | A |
| 日報一覧30件を全期間集計に流用 | CONFIRMED | `src/lib/daily-reports/read-model.ts` の `.limit(30)` と同じreportsからsummary/monthlyTrendsを作る。31件目が集計・月別推移から欠落 | 必要。一覧と期間集計を分離 | P1 | B |
| 収益予測・人件費率の仮定値 | PARTIALLY_CONFIRMED | `src/app/api/revenue/route.ts` の `totalRevenue * 1.1` と `32.5%`。予測UIには既にシミュレーション表記があるが、仮定の根拠と人件費データはない | 必要。算出不能は未算出へ | P1 | B |
| 予約保存後のprojection失敗で500 | CONFIRMED | `src/app/api/reservations/route.ts:727,747,926,986`。mobile BFFの同名routeも同構造。保存成功後にviewだけ失敗すると操作全体を失敗表示 | 必要。保存成功と表示再取得の失敗を区別 | P1 | C |
| 予約PATCH lost update | CONFIRMED | 両予約routeの既存行SELECTにupdated_atがなくUPDATEはid/clinic_idのみ。並行PATCHが同じ旧状態を読むと後発が上書き | 必要。既存updated_atによる条件付き更新と409 | P1 | C |
| 予約通知のawaitされないenqueue | CONFIRMED | `src/app/api/reservations/route.ts` のenqueue catch。response終了までの永続化完了を待たず、serverless終了で欠落し得る | 必要。保存と通知失敗を区別し、永続enqueueをresponse前に待つ | P1 | D |
| email processing stuck | CONFIRMED | `src/lib/notifications/email/processor.ts` はpendingをprocessingへ更新し、worker中断後のstale claim回収がない | 必要。lease・古いworkerの完了拒否・再試行上限 | P1 | D |
| production CSP nonce SSR | NEEDS_ENVIRONMENT_VERIFICATION | `middleware.ts:146` 以降はresponseへnonce/CSPを設定。request側伝播とSSR script nonceを本番buildで未確認 | 再現後のみ。現在は変更しない | P1 | E |
| manager 50院のData API往復数 | NEEDS_ENVIRONMENT_VERIFICATION | `src/lib/manager-dashboard-counts.ts` は1院4 HEAD exact count、同時最大16。50院ならcount部分は200要求というコード上の算定。p50/p95/p99、CPU、接続数、PostgREST latencyは未計測 | 実測で目標未達時のみ最適化 | P2 | 性能試験後の別PR |
| release resultの古いcommit/CI記載 | CONFIRMED | `docs/stabilization/core100-release-result.md` に未push時点の806a/7dcaと旧失敗CIが現状として残る | 必要。歴史的ログと最新main実績を分離 | P2 | F |
| main保護未設定 | CONFIRMED | 2026-09-06 GitHub branches/main: protected=false、rulesets=[] | 推奨required checksのみ文書化。設定変更なし | P1 | F |

## Core100対応の維持

| Finding | 状態 | 現行コード根拠 | 修正要否 | 優先度 | 推奨PR |
| --- | --- | --- | --- | --- | --- |
| 認証入口の試行制限・account/IP原子性 | RESOLVED | `src/lib/auth/auth-attempt-guard.ts` のRedis Lua evalと実認証入口のguard。実Redisの実測は別の未検証事項 | 再実装不要 | 維持 | なし |
| 予約一覧の切断・ページング・JST | RESOLVED | `src/app/api/reservations/schema.ts`、同routeのkeyset、`src/app/(app)/reservations/api.ts` の全ページ取得、`src/lib/jst.ts`。Core100 E2Eあり | 再設計不要 | 維持 | なし |
| manager件数・本部集計 | RESOLVED | `src/lib/manager-dashboard-counts.ts` のexact HEAD、`src/app/api/admin/dashboard/route.ts` のPostgREST avg | 既存ロジック維持。本番aggregate設定は未確認 | 維持 | なし |
| 課金設定共通化 | RESOLVED | `src/lib/billing/configuration-policy.ts`、`src/lib/billing/config.ts` | 再実装不要 | 維持 | なし |
| Sentry監視・リリース試験ツール | RESOLVED | `src/lib/monitoring/sentry.ts`、`scripts/release/`、Core100 E2E。実通知受信・容量はこの分類に含めない | 維持 | 維持 | なし |
| Next.js直接脆弱性修正 | RESOLVED | package.json / package-lock.jsonのNext15.5.21 | 更新や一括upgrade不要 | 維持 | なし |
| migration replay・pgTAP・生成型・GoTrue | RESOLVED | `.github/workflows/ci.yml` のDatabase Contractが基準mainで成功。配備済みDBの一致は未検証 | gate維持 | 維持 | なし |

## 先行SaaS監査の再分類

先行仕様のF番号と今回の指摘は別物として扱う。以下は現行コードと既存回帰テストの確認であり、今回新しい実DB試験を行ったとの主張ではない。

| Finding | 状態 | 現行コード根拠 | 修正要否 | 優先度 | 推奨PR |
| --- | --- | --- | --- | --- | --- |
| F-01 LINE identityの電話/emailによる紐付け | RESOLVED | `src/lib/services/public-reservation-service.ts:490,585` LINE IDとcredential generation一致に限定。my-pageも同条件 | 不要 | 維持 | なし |
| F-02 manager患者CRUD | RESOLVED | `src/app/api/customers/route.ts` GET/POST/PATCHのdeniedRoles | 不要 | 維持 | なし |
| F-03 予約PATCH全列公開 | RESOLVED | reservations routeの更新select列限定とread-model変換。projection障害は今回別Finding | 維持 | 維持 | Cで回帰維持 |
| F-04 患者modal検証 | RESOLVED | `src/components/patients/patient-modal.tsx:101,134,177` 必須・長さ・JSON object・trim | 不要 | 維持 | なし |
| F-05 stale manager scope | RESOLVED | `src/lib/route-helpers.ts:172` のensureClinicAccess、supabase/serverのDB/JWT積集合 | 不要 | 維持 | なし |
| F-06 選択院とAPI対象院 | RESOLVED | `src/hooks/useActiveClinicId.ts` とdashboard/revenue/daily-reports/patientsの利用 | 不要 | 維持 | なし |
| F-07 security dashboard clinic欠落 | RESOLVED | `src/components/admin/SecurityDashboard.tsx:193` body clinic、security/events routeのguard/UPDATE scope | 不要 | 維持 | なし |
| F-08 onboarding任意tenant作成 | RESOLVED | onboarding/clinic routeの既存所属・完了state拒否とparent指定禁止 | 不要 | 維持 | なし |
| F-09 staff ICS他院漏洩 | RESOLVED | calendar/feed-tokensでclinic必須、calendar/staff/[token]でstaff+clinic限定・旧unscoped拒否 | 不要 | 維持 | なし |
| F-10 billing CRON_SECRET混用 | RESOLVED | `src/lib/billing/internal-auth.ts:95` INTERNAL_API_SECRET限定、cronSecret空 | 不要 | 維持 | なし |
| F-11 billing audit不足 | RESOLVED | checkout/portal/tenants route、stripe-eventsに対象event、billing-audit-events.test.tsあり | 不要 | 維持 | なし |
| F-12 CSP report無制限 | RESOLVED | csp-report routeの32KB上限・Zod・typed insert、csp-rate-limiter production fail-closed | 不要 | 維持 | なし |
| F-13 managerのadmin CSP権限 | RESOLVED | stats/violations routeのADMIN_UI_ROLES | 不要 | 維持 | なし |
| F-14 admin security rate limit除外 | RESOLVED | rate-limiting/middlewareのuser+clinicキー、read30/write10 | 不要 | 維持 | なし |
| F-15 Sentry release/source-map | RESOLVED | monitoring/sentry、next.config.js、SENTRY_RELEASE_AND_SOURCEMAPS.md。実受信・artifactは別途未検証 | コード再実装不要 | 維持 | Fで境界記録 |
| F-20 API client型安全 | PARTIALLY_CONFIRMED | 対象ファイルのanyは除去済み。ただし `src/lib/api-client.ts:466,491` のgeneric成功payloadはas Tのまま | 広範囲の全API再設計は今回対象外。変更対象の契約で必要な検証を維持 | P2 | 別途対象を限定 |
| 収益の前年値逆算・月次item上限 | CONFIRMED | `src/hooks/useRevenue.ts:122` は丸めた成長率から前年額逆算。revenue routeの月間daily_report_items等は未ページング | 経営数字の正確性としてB内で再現し最小対応 | P1 | B |

## 確認済みCIと未検証の境界

[CI run 33996399702](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/33996399702) は基準SHAで8ジョブSUCCESS。Quality Checks / Build / Database Contract / Security Tests / Supabase Types Contract / Fixture Preflight (Static) / Full Jest Regression / App E2E (Local Supabase + Chromium)。

ログを読み取り確認: Full Jest 444 suites、3733 passed、2既存skipped。App E2Eは9 passed、3 flaky（retryで成功）、1既存skipped。E2Eのskipやretryを初回成功へ読み替えない。今回追加する修正のCI証拠ではない。

100院の大規模容量・200/400VU・実Redis・production configuration・backup restore・LINE/email実通知・Stripe test environment・monitoring alert delivery・operational readinessは **BLOCKED / NOT VERIFIED** のまま。`scripts/release/core100.example.json` の専用環境・外部送信遮断はfalseであり、実負荷を無断実行しない。

Next.js最新公式CSPガイドと[Next15版](https://nextjs.org/docs/15/app/guides/content-security-policy)を確認。nonce利用はrequest CSPからのSSR伝播と動的renderingを必要とする。実測前にCSPを弱めたり構成を変更しない。

DoD対応: DOD-06/07=E2E、DOD-08/09=認可・clinic境界維持、DOD-10=build、DOD-11=Jest、DB変更時DOD-02/04/12=replay・drift・型。歴史的 `DoD-v0.1.md` のPASSを今回の出荷証拠へ流用しない。
