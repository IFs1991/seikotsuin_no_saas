# Change DoD v1.0

## 文書情報

- Status: CURRENT / SSOT
- Owner: `UNASSIGNED`
- Applies to: すべてのPR・変更
- Related: [Release governance index](../releases/README.md)

## 目的・適用範囲・非スコープ

1 task = 1 PRで「この変更を完了扱いできるか」を判断する。製品全体のpilot/commercial資格や顧客価値は対象外で、それぞれ別ゲートで判断する。PRにはscope、non-goals、changed behavior、residual riskを明記する。

## 共通status

| Status           | 定義                                                            |
| ---------------- | --------------------------------------------------------------- |
| `PASS`           | 対象commit・環境で要求を実行し、実在する証跡が成功を示す        |
| `FAIL`           | 実行済みで要求を満たさない                                      |
| `NOT_RUN`        | 未実行、証拠なし、期限切れ、対象commit不一致                    |
| `PASS_WITH_RISK` | 要求は満たすが残余riskがあり、owner・期限・mitigationが記録済み |
| `NOT_APPLICABLE` | 根拠を記録して適用外と判断した                                  |

`NOT_RUN`を隠さない。CI PASSは別commitへ、staging PASSはproductionへ継承しない。仕様・計画は実装証跡ではない。

## 変更リスク分類

- Low: docs-only、非挙動変更。
- Medium: UI、内部refactor、限定runtime。
- High: DB/migration、auth/RLS/tenant、billing、public/internal/webhook、患者データ、運用。

Highは独立review必須。実装者の自己承認だけを最終承認にしない。

## 共通DoD

- scope/non-goals、risk分類、影響境界、rollback/forward-fix、residual riskを記録。
- changed behaviorにはpositive/negative testを追加し、コマンド・結果・commit SHAを記録。
- auth、clinic scope、billing、public、internal、webhookの各境界を明示。
- docs/link、秘密情報、生成物、依存・lockfileの意図しない差分を確認。
- reviewerが証跡と差分を確認し、blocking itemを全て`PASS`または根拠付き`NOT_APPLICABLE`にする。

## 変更種別DoD

### docs-only

相対リンク、事実、SSOT、YAML等の構文、`git diff --check`を確認する。runtimeを変えないdocs-only PRにfull Jest/Playwrightを機械的に要求しない。

### runtime

変更範囲に応じ `npm run lint`、`npm run type-check`、focused test、`npm run build`を実行する。関連する現行CI jobは `.github/workflows/ci.yml` の `Quality Checks`、`Build`、`Supabase Types Contract`、`Database Contract`、`Fixture Preflight (Static)`、`Full Jest Regression`、`Security Tests`、`App E2E (Local Supabase + Chromium)`。架空のjob名を使わない。

### DB / migration

履歴はappend-only。仕様書とrollback SQL、またはsecurity-preserving forward-fix方針を用意する。clean replay、migration parity/drift、生成型、seed、pgTAP、negative testを実DB境界で確認する。DB security boundaryをmockだけで完了させない。

### auth / RLS / tenant boundary

fail-closed、RLS/GRANT/function権限、clinic A/Bのread/insert/update/delete拒否、inactive/stale権限、service-role前scope確定を実DBnegative testで確認する。waiver不可。

### billing / webhook / internal route

認証・admin/clinic scope・billing gate・secret/signature・idempotency・重複/順序逆転・他org拒否を確認する。課金整合性へのwaiver不可。

### UI

`Design.md`のEXTEND/REDESIGN、共有component、accessibility、loading/error/empty/recovery、権限別表示を確認する。UIだけで認可を成立させない。

## テスト・証跡形式

```yaml
id: CHANGE-001
title: Example
status: NOT_RUN
blocking: true
environment: ci
commit: '<git sha>'
owner: UNASSIGNED
verified_at: '<ISO-8601>'
expires_at: null
evidence:
  - type: command
    reference: '<real reference only>'
residual_risk: []
notes: 'facts and remaining work'
```

manual testは実行者・日時・環境・手順を記録。operational evidenceは設定変更または有効期限で再検証する。`PASS_WITH_RISK`にはowner、期限、mitigationが必要。

## Review、waiver、再検証

High riskは領域reviewerを含む。security、tenant isolation、data loss、backup/restore、billing integrityはwaiver不可。それ以外のexceptionは理由、owner、期限、mitigation、承認者を記録する。commit変更、対象環境変更、関連設定・依存変更、証跡期限切れ、incident発生時は再検証する。

## PRテンプレート

```markdown
## Scope / Non-goals

## Risk classification and boundaries

## Changed behavior and tests

## Commands / results / commit SHA

## Rollback or forward-fix

## Residual risks (owner / due / mitigation)

## Gate items and reviewer sign-off
```

## GO / NO-GO

全blocking itemが有効な`PASS`または根拠付き`NOT_APPLICABLE`で、独立review済みなら`PASS`。blockingの`FAIL`/`NOT_RUN`/期限切れ/証拠なし、またはwaiver不可riskがあれば`FAIL`。non-blockingだけに適切な`PASS_WITH_RISK`があればChange DoDは`PASS_WITH_RISK`。
