# src レビュー指摘修正仕様書 v0.1

## Overview

- Purpose: 2026-07-02 実施の `src` 全体コードレビューで検出された認可・テナント分離・コード規律の問題を修正する。
- DoD: DOD-02（テナント分離）/ DOD-08（認可ロール整合）を維持したまま欠陥を閉じる（docs/stabilization/DoD-v0.1.md）。
- One task = one PR。本仕様は **PR-A / PR-B / PR-C の3分割** を前提とする。
- Priority: **Critical**（FIX-1）、High（FIX-2）、Medium（FIX-3〜5）
- Risk: **認証済み一般ユーザーによる admin 自己昇格・テナントツリー汚染**（FIX-1）

### Related Documents

- **RLS Tenant Boundary Spec**: [spec-rls-tenant-boundary-v0.1.md](./spec-rls-tenant-boundary-v0.1.md) — 親子スコープモデルの正本
- **Auth Role Alignment Spec**: `spec-auth-role-alignment-v0.1.md` — `normalizeRole` 互換層
- 作業規約: `AGENTS.md`（セキュリティ不変条件・型安全・テスト要件）

### レビュー概要（背景）

| # | 重大度 | 対象 | 問題 |
|---|--------|------|------|
| FIX-1 | 