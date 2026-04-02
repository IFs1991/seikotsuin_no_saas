# 正式版リビルド順メモ

- 作成日: 2026-03-31
- 目的:
  - クローズドベータ運用中に、正式リリース向けの新系統を `pnpm` 前提で作り直すときの叩き台を残す
- 前提:
  - 現行系はクローズドベータ運用に集中する
  - 正式版は現行実装をそのまま延命するのではなく、設計を整理した新系統として組み直す

## 1. 基本方針

- クローズドベータ中は現行系を大きく壊さない
- 正式版は `pnpm` ベースで新規構成する
- browser から tenant table を直接触らない
- DB アクセスは server-side API / server action / service layer に限定する
- `clinic_id` / `clinic_scope_ids` / RLS / guard を最初に固定する
- 1機能ずつ縦に完成させる
- 現行 UI を丸ごと写経しない
- beta の学びを仕様として先に反映する

## 2. 推奨フェーズ順

### Phase 0. リポジトリ土台

- `pnpm` workspace 方針
- Next.js / TypeScript / ESLint / Prettier / test runner
- env 管理方針
- ディレクトリ構成
- server / client 境界ルール
- CI の最小ゲート

完了条件:
- 新系統 repo が空の状態でも build / lint / test が通る
- 実装ルールが README か設計メモに明文化されている

### Phase 1. 認証・権限・テナント境界

- Supabase Auth
- `clinic_id`, `clinic_scope_ids`
- RLS 設計
- middleware
- server guard
- role / permission の共通判定

完了条件:
- 未認証、権限不足、clinic 越境の失敗系が先に固定される
- tenant boundary のテストが通る

### Phase 2. API / service 共通基盤

- route handler / server action の標準形
- validation
- error response
- audit log
- 共通 fetch client
- logging / health check

完了条件:
- 画面から直接 Supabase を触らずに、共通 API 経由でデータを取得できる
- エラー形式と監査ログ形式が統一されている

### Phase 3. 最小業務導線

- ログイン
- ダッシュボード
- 患者一覧
- 予約一覧

方針:
- まずは 1 本の導線を end-to-end で通す
- UI を広げるより、縦に完結させる

完了条件:
- ログインから主要画面まで E2E で通る
- clinic scope 前提の API が成立する

### Phase 4. マスタ / 設定

- メニュー
- リソース
- スタッフ
- clinic settings
- システム設定の最小範囲

完了条件:
- 業務導線がマスタデータに依存していても、設定変更で破綻しない

### Phase 5. 主要ドメイン拡張

- 予約詳細
- 患者詳細
- 売上 / 集計
- 公開予約
- 管理画面の残り

方針:
- schema
- RLS
- API
- UI
- test

を毎回 1 セットで実装する

### Phase 6. 高度機能

- notifications
- security monitor
- multi-device
- AI 分析
- 高度な監視 / 運用補助

方針:
- 正式版の本丸ではあるが、基盤が固まる前に入れない
- とくに `security-monitor`, `AI`, `multi-device` は後段でよい

### Phase 7. データ移行 / 切替

- 現行系からの移行方針
- データ互換
- ロールバック
- スモールカットオーバー計画

完了条件:
- 正式版へ移る条件と戻す条件が文書化されている

## 3. 優先順位の考え方

最優先:
- tenant boundary
- auth / guard
- server-side access 原則
- E2E で通る最小導線

後回しにしてよい:
- 監視 UI の作り込み
- 高機能な管理画面
- AI 補助機能
- 複雑な通知まわり

## 4. 現行系から引き継ぐべきもの

- RLS と tenant boundary の知見
- `clinic_scope_ids` の考え方
- Playwright / fixture 運用知見
- build / test / env で詰まりやすい箇所
- 監査ログや health check の最低限必要な要件

## 5. 現行系から持ち込まない方がよいもの

- client-side Supabase 直アクセス
- hook ごとの独自 fetch 契約の乱立
- 暫定 route の長期温存
- 文書と実装の分離運用
- 「beta では動くから残す」を正式版へ持ち込む判断

## 6. 最初の着手案

1. `pnpm` 前提の新系統 repo / branch を切る
2. Phase 0 の土台を作る
3. Phase 1 の auth / RLS / guard を先に通す
4. ログイン -> ダッシュボード -> 患者一覧 の最小導線を作る
5. その時点で E2E と運用メモを最低限揃える

## 7. 一言まとめ

正式版は、現行系を全部直し続けるよりも、
「クローズドベータは現行系で回し、その間に新系統を `pnpm` で基盤から組み直す」
方が中長期では健全。
