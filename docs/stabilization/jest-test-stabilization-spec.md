# 仕様書：Jestテスト崩壊の鎮火（Supabaseモック統一＋連鎖FAIL遮断）

## 1. 背景・問題
現状のJest失敗は、**Supabaseクライアント／Query Builderのモック形状不一致**に起因している可能性が高く、1箇所の破綻で多数テストが連鎖FAILしている。結果としてCIが「信頼できない赤」で固定され、開発速度・品質保証の両方を毀損している。

---

## 2. 目的
- テストを「数」ではなく **信頼性のある品質ゲート**に戻す
- Supabase周りのテストを、**同一のモック基盤**で安定運用できる状態にする
- “1不具合→大量巻き添えFAIL” の構造を断つ

---

## 3. 成功指標（受け入れ基準）
### 3.1 必達
- `pnpm test`（または `npm test`）で **Failed: 0**
- Supabase依存テストが **同一モック実装**を参照している（ローカル実装が残っていない）
- 主要スイート（SecurityMonitor/Reservation系など）で **連鎖FAILが解消**されている

### 3.2 望ましい
- Jest実行時間が **現状比で短縮**（目安：< 60s、相対評価）
- Flaky（再実行で結果が変わる）を **1%未満**に抑制

---

## 4. スコープ
### 4.1 対象
- JestのUnit/Integrationテスト
- Supabase（`@supabase/supabase-js`）を利用しているサービス層・監視/監査ロジック層
- スケジュール/勤務時間ロジック（`workingHours` 等）の入力前提が崩れる箇所

### 4.2 非対象
- Playwright E2E（別系統）
- DB実機接続の統合試験（必要なら後続仕様で分離）

---

## 5. 設計方針（重要）
1. **Supabaseモックを1つに集約**し、全テストがそれを使う  
2. Query Builderモックは **チェーン可能** かつ **await可能(thenable)** であること  
3. テスト側の期待値（`insert` の観測点など）を **実装の呼び出し形に合わせる**  
4. `workingHours` 系は、実装側で **null安全**を担保して連鎖クラッシュを防ぐ

---

## 6. 実装仕様

### 6.1 配置
- `test-utils/supabaseMock.ts`（推奨）
  - ここに **唯一のSupabaseモック生成器**を実装
- 既存の各テストファイル内のSupabaseモックは撤去し、上記へ置換

---

### 6.2 Supabaseモックの公開API
`createSupabaseMock(config?) => { client, from, getBuilder, setResult, enqueueResult, reset }`

- `client`: テスト対象に注入するSupabaseクライアント代替
- `from`: `jest.fn()`（`client.from` の実体）
- `getBuilder(tableName)`: 直近のbuilder参照（table別に管理）
- `setResult({ table, op }, result)`: table/opごとに固定レスポンス設定
- `enqueueResult({ table, op }, result)`: 次回呼び出し分だけ返すキュー（順次消費）
- `reset()`: 呼び出し履歴・キュー・固定レスポンスを初期化

#### `op` の定義
- `select | insert | update | upsert | delete | rpc`
- `single | maybeSingle` は返却形式のフラグとして扱う（`op`自体は変えない）

---

### 6.3 Query Builderモック仕様（最重要）
Supabase v2のPostgrest builderは「チェーンして最後に await される」挙動が多い。  
よってモックは以下を満たす。

#### 6.3.1 チェーンメソッド（最低限）
各メソッドは **builder自身をreturn**（終端以外）:

- フィルタ系：`eq, neq, gt, gte, lt, lte, in, match, contains, overlaps, like, ilike`
- 並び替え/範囲：`order, range, limit`
- 操作系：`select, insert, update, upsert, delete`
- 終端系：`single, maybeSingle`

> 原則：プロジェクトで使っているメソッドを網羅し、**途中で途切れない**ことを最優先にする。

#### 6.3.2 await可能（thenable）
`await supabase.from('x').select().eq(...)` を成立させるために builder は以下を実装する：
- `then(resolve, reject)`（PromiseLike）
- 望ましくは `catch`, `finally` も実装（デバッグ容易性のため）

#### 6.3.3 レスポンス形式
Supabase標準に合わせて **`{ data, error }`** を返す。
- `error` は `null` または `{ message: string, ... }`（テストで使う範囲）

#### 6.3.4 “どのopの結果を返すか” の決定規則
builder内部で `currentOp` を保持し、最後に呼ばれた操作系メソッド（`select/insert/update/delete/...`）に基づき返却する。

- `select()` の後に `single()` が呼ばれた場合  
  - `op = select` のまま返す（`single` はフラグ扱い）
- `insert()` のあとに `select()` をチェーンするパターンがある場合  
  - 推奨：**「最後に呼ばれた操作系をop」として扱う**

---

### 6.4 SecurityMonitor系テストの観測点修正
#### 6.4.1 原則
実装が `supabase.from('table').insert(...)` なら、期待値は **rootではなくbuilder** を見る。

- NG：`expect(mockSupabase.insert).toHaveBeenCalled()`
- OK：`expect(builder.insert).toHaveBeenCalled()`

#### 6.4.2 置換ルール
- `mockSupabase.insert/update/delete` のようなroot直下の期待値は撤去
- `from('table')` の戻り（builder）で期待値を取る

---

### 6.5 `workingHours` null安全（実装修正）
#### 6.5.1 要件
`workingHours` または曜日キーが欠損しても、テスト・本番で **クラッシュしない**。

#### 6.5.2 仕様（推奨）
- 勤務時間が無い＝その日は **稼働なし（空スロット返却）**
- 例：  
  - `const day = workingHours?.[dayKey]; if (!day) return [];`

#### 6.5.3 テスト追加
- `workingHours: undefined` のスタッフを入力しても例外が出ない
- 曜日キー欠損でも例外が出ない

---

## 7. 移行手順（最短で赤→緑）
1. `test-utils/supabaseMock.ts` を追加（chain + thenable + op判定 + set/enqueue/reset）
2. 失敗が多いスイートから置換（SecurityMonitor → Reservation系 → その他）
3. 旧モック（テスト内ローカル実装）を削除し、参照を統一
4. `workingHours` のnull安全を実装＋テスト追加
5. 必要に応じてCIで `jest --runInBand`（または `--maxWorkers=50%`）に寄せて安定化

---

## 8. リスクと対策
- **Supabase SDK更新でAPI差異**
  - 対策：モックは「使っているメソッドだけ」を明示し、未実装呼び出しは即例外（早期検知）
- **builderがPromiseLikeであることを忘れると再発**
  - 対策：モック側で `then` 未実装ならテストが即落ちるようにする（意図的に）

---

## 9. 実装タスク（チェックリスト）
- [ ] `test-utils/supabaseMock.ts` 作成（chain + thenable + op判定 + set/enqueue/reset）
- [ ] SecurityMonitor配下テストの置換（builder観測に修正）
- [ ] Reservation系テストの置換
- [ ] `workingHours` null安全修正＋テスト追加
- [ ] 全体テスト実行で Failed: 0
- [ ] 旧モック残骸の削除（grepで重複定義を潰す）

---

## 補足（肝）
最重要は **thenable builder**。ここを満たすだけで  
`gte is not a function` / `order is not a function` / `from is not a function` 系の連鎖は止まる。  
次に、`insert` の観測点ズレと `workingHours` クラッシュを潰す。
