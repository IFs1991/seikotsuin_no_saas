# Plan PR-03: SMTP Secret Separation v0.1

## 1. 目的

`smtpSettings.password` を `clinic_settings` に保存しない状態へ移行し、管理設定 UI で「保存できる公開設定」と「秘密情報」を分離する。

本計画は `docs/stabilization/refactor-plan-mvp-multistore-self-review-v0.1.md` の Finding 1 に対応する。

## 2. 現状

- `src/components/admin/communication-settings.tsx` に SMTP パスワード入力欄がある
- `src/app/api/admin/settings/route.ts` `CommunicationSchema` が `password` を受け付ける
- 同 route の `PUT` が `settings: parseResult.data` を `clinic_settings` へ upsert する
- したがって現状は、SMTP 秘密情報が一般設定 JSON に混入する

## 3. 対象

- `src/components/admin/communication-settings.tsx`
- `src/app/api/admin/settings/route.ts`
- `src/hooks/useAdminSettings.ts`
- `src/app/admin/(protected)/settings/page.tsx`
- 必要に応じて:
  - `docs/stabilization/spec-email-delivery-auth-v0.1.md`
  - 運用用 env / secret 管理手順

## 4. 方針

PR-03 は 2 段階に分ける。

### Phase A: 即時安全化

- `smtpSettings.password` を永続化対象から外す
- 入力を受けても保存しない、または UI から隠す
- `clinic_settings` へ平文が流れないことを最優先にする

### Phase B: 正式運用

- SMTP 資格情報の保存先を env / platform secret に移す
- clinic ごとの認証情報が必要なら、別 spec と運用設計を作成する

## 5. 実行手順

1. `communication-settings.tsx` の UI を以下のいずれかに変更する。
   - パスワード欄を非表示
   - 「現在の接続情報は管理者設定外」の説明に置換
   - マスク表示 + 保存不可
2. `src/app/api/admin/settings/route.ts` `CommunicationSchema` から `password` を外すか、受領しても破棄する。
3. `PUT /api/admin/settings` で `settings` を正規化し、秘密情報を除外してから upsert する。
4. 既存の `clinic_settings` データに SMTP password が混入していないか確認する。
5. 正式 secret 管理が必要なら、別 spec を作る。

## 6. 判断ポイント

以下を先に決める。

1. SMTP 機能を MVP で有効にするか
2. clinic 単位で SMTP を分ける必要があるか
3. 一時的にメール送信機能を停止してよいか

## 7. 受け入れ条件

- `src/components/admin/communication-settings.tsx` から、保存可能な平文パスワード入力として見えない
- `src/app/api/admin/settings/route.ts` が `clinic_settings` へ `smtpSettings.password` を保存しない
- 管理設定画面で「保存される設定」と「別管理の設定」が混在しない
- 既存データクレンジングが必要な場合、別タスクとして明示される

## 8. DoD

- `docs/stabilization/DoD-v0.1.md` `DOD-09`
- `docs/stabilization/DoD-v0.1.md` `DOD-10`

## 9. 非目標

- clinic 別 secret vault の新規実装
- 本格的なメール配信基盤の導入
- 運用監視や再送制御の設計

## 10. リスク

- UI だけ隠して API で受け付け続けると漏洩経路が残る
- 既存 `clinic_settings` に平文が残っている場合、コード修正だけでは不十分
- 正式 secret 管理は migration ではなく運用設計の問題を含む

## 11. 完了証跡

- `src/components/admin/communication-settings.tsx`
- `src/app/api/admin/settings/route.ts`
- 管理設定保存テスト
- 必要に応じて secret 運用手順書
