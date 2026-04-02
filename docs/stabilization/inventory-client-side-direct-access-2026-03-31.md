# Client-side Supabase 直アクセス棚卸し

- 作成日: 2026-03-31
- 根拠: `docs/stabilization/DoD-v0.1.md` DOD-09, `docs/stabilization/diff-instructions-2026-03-30.md` Task 3
- 実行ログ: `docs/stabilization/pilot-go-execution-2026-03-27.md` §21

## スコープ

- **本文書のスコープは「棚卸し（一覧化・リスク評価・PR境界定義）」のみ**
- PR-H1 は **2026-04-01 に完了**（詳細は下記「実施済み PR」参照）
- PR-H2〜H4 は beta 後 hardening として未実施

## 実施済み PR

### PR-H1 完了 (2026-04-01)

- **対象**: `src/lib/ai/analysis-client.ts` + `src/components/dashboard/ai-analysis.tsx`
- **内容**:
  - `src/app/api/clinic/analysis/route.ts` を新設。`ensureClinicAccess()` で認証・認可、`revenues` / `patients` / `staff_performance_summary` を `clinic_id` フィルタ付きでクエリ
  - `fetchAnalysisData()` を `/api/clinic/analysis` API fetch に差し替え（`@/lib/supabase/client` import 削除）
  - `AIAnalysis` コンポーネントに `useSelectedClinic()` から clinicId を取得して渡す形に修正
  - テスト `src/__tests__/api/clinic-analysis.test.ts` 新設（7/7 pass）
- **検証**: `npm run build` green、`rg "supabase/client" src/lib/ai/` → 0 hits

## 概要

主要 tenant CRUD API (`reservations`, `customers`, `menus`, `resources`, `blocks`) は server-side guard 導線を確認済み。
以下 4 ファイルに browser client (`createClient()` from `@/lib/supabase/client`) 経由の直アクセスが残存する。

## 直アクセス一覧

| # | ファイル | 行 | テーブル | 操作 | 分類 | clinic_id フィルタ | beta許容 |
|---|---------|-----|---------|------|------|-------------------|---------|
| 1 | `src/lib/session-manager.ts` | 6, 399 | `user_sessions` | INSERT, SELECT, UPDATE | session系 | user_id + clinic_id | **許容** |
| 2 | `src/lib/session-manager.ts` | 899 | `security_events` | INSERT | session系 | clinic_id あり | **許容** |
| 3 | `src/lib/session-manager.ts` | 259 | `profiles` | SELECT | session系 | user_id スコープ | **許容** |
| 4 | `src/lib/session-manager.ts` | 778 | `session_policies` | SELECT | session系 | clinic_id フィルタ | **許容** |
| 5 | `src/lib/security-monitor.ts` | 6, 71, 238, 283, 361 | `security_events` | SELECT, INSERT | session系 | clinic_id フィルタ | **許容** |
| 6 | `src/lib/security-monitor.ts` | 404, 455 | `user_sessions` | SELECT | session系 | user_id スコープ | **許容** |
| 7 | `src/lib/multi-device-manager.ts` | 6, 70, 89-93 | `registered_devices` | SELECT, UPSERT | session系 | user_id スコープ | **許容** |
| 8 | `src/lib/multi-device-manager.ts` | 142-160, 447, 467, 527, 569, 617 | `user_sessions` | SELECT, UPDATE | session系 | user_id + clinic_id | **許容** |
| 9 | `src/lib/multi-device-manager.ts` | 409 | `session_policies` | SELECT | session系 | clinic_id フィルタ | **許容** |
| 10 | ~~`src/lib/ai/analysis-client.ts`~~ | — | ~~`revenues`~~ | SELECT | tenant | — | **PR-H1 完了** |
| 11 | ~~`src/lib/ai/analysis-client.ts`~~ | — | ~~`patients`~~ | SELECT | tenant | — | **PR-H1 完了** |
| 12 | ~~`src/lib/ai/analysis-client.ts`~~ | — | ~~`staff_performance_summary`~~ | SELECT | tenant | — | **PR-H1 完了** |

## リスク評価

### P0: 本番前に必須修正 — **完了**

| ファイル | 状態 |
|---------|------|
| ~~`src/lib/ai/analysis-client.ts`~~ | **PR-H1 完了 (2026-04-01)** — `src/app/api/clinic/analysis/route.ts` 経由に移行済み |

### P1: beta後 hardening

| ファイル | 理由 |
|---------|------|
| `src/lib/session-manager.ts` | browser client で `user_sessions` INSERT/UPDATE + `security_events` INSERT。RLS + auth で保護されているが、本来は server action / API route 経由が望ましい |
| `src/lib/security-monitor.ts` | browser client で `security_events` INSERT。admin security route は既に service-role 化済みだが、client-side ログ記録パスが残存 |

### P2: beta後 hardening（低優先）

| ファイル | 理由 |
|---------|------|
| `src/lib/multi-device-manager.ts` | browser client で `registered_devices` UPSERT + `user_sessions` UPDATE。RLS + user_id/clinic_id スコープで保護、実害リスク低 |

### 低リスク（対応不要）

| アクセス | 理由 |
|---------|------|
| session-manager → `profiles` SELECT | 自己参照のみ、RLS 保護 |
| session-manager / multi-device → `session_policies` SELECT | read-only、clinic_id フィルタ済み |

## Hardening PR 境界

| PR | 内容 | 優先度 | 対象ファイル |
|----|------|--------|------------|
| PR-H1 | analysis-client server-side 移行 | **P0** | `src/lib/ai/analysis-client.ts`, `src/components/dashboard/ai-analysis.tsx` |
| PR-H2 | session-manager server-side 移行 | P1 | `src/lib/session-manager.ts` |
| PR-H3 | security-monitor server-side 移行 | P1 | `src/lib/security-monitor.ts` |
| PR-H4 | multi-device-manager server-side 移行 | P2 | `src/lib/multi-device-manager.ts` |

## 備考

- session 系 3 ファイルは Phase 3A（セッション管理強化）で導入されたもの。設計時点では browser client 前提だったが、DOD-09 の趣旨に照らすと server-side 移行が望ましい
- `analysis-client.ts` は `supabase` を named export で直接 import しており、`createClient()` パターンとも異なる古い実装
- hardening の際は、各ファイルの React hook（`useMultiDeviceManager` 等）の呼び出しチェーンも合わせて修正が必要
