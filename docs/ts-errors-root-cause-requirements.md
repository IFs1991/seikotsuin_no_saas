# TypeScriptエラー根治（Root Cause Remediation）要件定義書

作成日: 2025-12-19  
対象リポジトリ: `seikotsuin_management_saas`

## 1. 背景・問題

`docs/ts-errors-summary.md` で TypeScript エラーが大量発生している（数百件規模）。現状のエラーは以下のように複数カテゴリに跨り、場当たり的な `any`/型緩和や `tsconfig` の全体緩和では、長期的に品質と開発速度を毀損する。

- Supabase 型（`src/types/supabase.ts`）と実DB/クエリの不整合
- `createClient()` の非同期戻り値（`Promise`）を同期クライアントとして扱う誤用
- `exactOptionalPropertyTypes` を前提とするモデル設計が未完（`undefined` の扱いが不統一）
- UI コンポーネントの `asChild` 等の Props 設計不整合（Radix互換/独自実装の混在）
- Hooks/サービス層の API 形状が揃っておらず、フロントが `unknown` を受け取っている
- 未定義関数参照・型推論が成立しない箇所が点在

本書は「TypeScript エラーを根治し、型チェックを信頼できる状態に戻す」ための要件を定義する。

## 2. 目的（ゴール）

1. `npm run type-check`（= `tsc --noEmit`）がエラー 0 で完了する
2. `src/types/supabase.ts` を Supabase の公式生成に戻し、DBスキーマと同期する
3. Supabase クライアント生成・利用の同期/非同期境界を統一し、`Promise` 誤用を排除する
4. `exactOptionalPropertyTypes` を前提としたオプショナル設計を揃え、`undefined`/欠落を一貫させる
5. UI コンポーネント（特に `asChild`/`forwardRef`）を型・実装ともに安定させる

## 3. スコープ

### 3.1 対象（含む）

- TypeScript 型チェックにより検出されるコンパイルエラー全般
- Supabase 型生成（`supabase gen types typescript`）とそれに伴う参照側の修正
- `createClient`/`getServerClient` を含む Supabase 接続層の API 整理
- 主要なサービス層/フック/ルートハンドラの型整合（API レスポンス形状の統一）
- UI コンポーネントの Props 型・`forwardRef`/`asChild` 実装の整合

### 3.2 対象外（非ゴール）

- 実行時の機能追加（新規機能開発）
- UI の見た目改善・デザイン刷新（型修正の副作用で必要最小限の変更は除く）
- パフォーマンス最適化（型修正に伴う局所改善は可）
- テスト整備の全面実施（ただし根治に必要な最小限のテスト追加は可）

## 4. 成功条件（Acceptance Criteria）

必須:
- `npm.cmd run -s type-check` が exit code 0
- `tsconfig.json` は `strict: true` を復帰できる（最低でも `strict` を有効化し、主要エラーが再発しない）
- `src/types/supabase.ts` は “暫定の手書き” ではなく、Supabase 生成物に置き換え済み
- Supabase クライアントの扱いが一貫している（`Promise` に `.from()` しない）

望ましい:
- `exactOptionalPropertyTypes: true` を復帰できる（復帰できない場合は、設計上の理由と復帰計画を明記）
- CI で `type-check` が実行され、エラー 0 が継続保証される

## 5. 制約・前提

- ネットワークが制限される環境がある（Supabase CLI での型生成、Supabase プロジェクト参照には認証とネットワーク許可が必要）
- ローカル/CI/本番で Node 実行環境が異なる可能性がある（Windows PowerShell 特有の `npm.ps1` 問題も考慮）
- DB スキーマがコード側の想定とズレている場合、コード修正だけでなく DB 側の変更も必要になる

## 6. 根本原因の仮説（整理）

### 6.1 Supabase 型の破綻

現状の `src/types/supabase.ts` が部分定義/暫定により、実際のクエリ（JOIN/埋め込みselect/カラム）と整合していない。
結果として `SelectQueryError` や `never` が多発し、波及的に多数のエラーを誘発している。

### 6.2 Supabase クライアント非同期境界の不統一

`createClient()` が `Promise` を返す実装（server-only）である一方、呼び出し側が同期クライアントとして扱っている箇所がある。
これが `.from` 不在や型推論崩壊を引き起こす。

### 6.3 optional/nullable の設計不統一

- `undefined` と `null` の使い分け（DBは `null`、アプリは `undefined` など）が混在
- `exactOptionalPropertyTypes` を有効にした前提で、オプショナルプロパティに `undefined` を渡してしまう

### 6.4 UIコンポーネント契約の不整合

`asChild`（Radix パターン）や `forwardRef`/`cloneElement` を持つ独自 UI が、React 19 + TS 5.7 の型定義と合っていない箇所がある。

## 7. 要件（Functional / Non-Functional）

### 7.1 Supabase 型生成の正式化

- Supabase CLI で `src/types/supabase.ts` を生成し、リポジトリにコミット可能な形で保持する
- 生成手順を `docs` に明記する（環境変数、project-id、schema 等）
- DB スキーマとの差分がある場合は、差分リストを出し「DB修正」か「コード修正」かを決める

### 7.2 Supabase クライアント API の統一

要件:
- `createClient()` の戻り値（同期 or 非同期）を利用箇所が誤用しない設計に統一する

方針案（いずれかを選択し、全体に適用）:
- 案A: server-only の `createClient()` は `Promise` のまま維持し、呼び出し側を全て `await` に統一
- 案B: server-only では `getServerClient()` を明確にし、同期的に扱える wrapper（ただし Next の cookies 制約に注意）を導入

### 7.3 Optional/Nullable の統一ルール

最低限のルール:
- DB 永続化: `null` を使用（DBの nullable を表現）
- アプリ内部 DTO: 欠落は “プロパティを省略” を基本（`undefined` を値として渡さない）
- API レスポンス: `null` か省略かをエンドポイント毎に明文化し統一

### 7.4 API クライアント/レスポンス型の統一

- `api-client` の戻り値型を統一し、フロントが `unknown` を受け取らない
- `isSuccessResponse` の型ガードが有効に働く形に整備する

### 7.5 UI コンポーネントの “Radix 互換” を決める

- `asChild` をサポートするコンポーネントとしないコンポーネントを明確化
- サポートする場合は `Slot` 相当の実装（もしくは Radix そのもの）に寄せる
- `cloneElement` を使う場合、`children` を `ReactElement` として扱うガードと型変換を統一する

## 8. 実施計画（推奨の順序）

1) Supabase 型生成の復帰（最優先）
- ネットワーク/認証を通して `npm run supabase:types` を実行
- 生成物を `src/types/supabase.ts` に反映

2) Supabase クライアント API 統一
- `createClient()` の契約を決め、サービス/route/hook の誤用を全て修正
- 同期/非同期が混ざる箇所の “境界” を明文化する

3) `exactOptionalPropertyTypes` 復帰（または復帰計画）
- ドメインモデル/DTO を修正して `undefined` 値注入を排除
- API 入出力の null/省略を揃える

4) UI コンポーネントの型整備
- `asChild`/`forwardRef`/`cloneElement` を一括で見直す

5) 残エラーの個別根治（最後）
- 未定義関数参照、古いモック/未完成機能の整理

## 9. リスクと対策

- リスク: DB スキーマがコード想定と大きく乖離している  
  対策: “DBを合わせる” か “コードを合わせる” の判断基準（運用中データ影響）を先に決める

- リスク: ネットワーク制限で Supabase 型生成ができない  
  対策: 生成はローカル実行（権限許可）で行い、生成物だけをコミットする運用を用意

- リスク: `strict` 復帰に時間が掛かる  
  対策: 段階復帰（`strict`/`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` を順に戻す）を採用

## 10. 付録：運用コマンド

- 型チェック: `npm.cmd run -s type-check`
- Supabase 型生成（要ネットワーク/認証）: `npm.cmd run -s supabase:types`

