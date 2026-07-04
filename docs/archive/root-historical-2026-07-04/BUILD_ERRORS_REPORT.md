# Build Errors Report - Vercel Deploy Fix

**Date**: 2026-01-31
**Build Command**: `npm run build`
**Result**: **SUCCESS** (修正完了)

---

## Executive Summary

Next.js 15プロジェクトでVercelデプロイをブロックしていた4つの問題を修正しました。
すべての問題の根本原因は「モジュールレベルでのシングルトンインスタンス化」と「Next.js 15の新しいSSR制約」でした。

---

## 修正した問題一覧

### Issue 1: QueryClient Not Found (CRITICAL) - 修正完了

```
Error: No QueryClient set, use QueryClientProvider to set one
Location: /master-data page
```

**原因**: `QueryProvider`が`ClientLayout`でラップされていなかった

**修正ファイル**: `src/app/client-layout.tsx`

**修正内容**:
```tsx
// Before
return (
  <UserProfileProvider value={...}>
    ...
  </UserProfileProvider>
);

// After
return (
  <QueryProvider>
    <UserProfileProvider value={...}>
      ...
    </UserProfileProvider>
  </QueryProvider>
);
```

---

### Issue 2: cookies() Outside Request Scope (CRITICAL) - 修正完了

```
Error: `cookies` was called outside a request scope
```

**原因**: MFAクラスがモジュールレベルでインスタンス化され、コンストラクタで`createClient()`（内部で`cookies()`を呼ぶ）が実行されていた

**修正ファイル**:
- `src/lib/mfa/backup-codes.ts`
- `src/lib/mfa/mfa-manager.ts`

**修正パターン**:
```typescript
// Before
export class BackupCodeManager {
  private supabase;
  constructor() {
    this.supabase = createClient(); // ビルド時に実行される
  }
}
export const backupCodeManager = new BackupCodeManager();

// After
export class BackupCodeManager {
  private async getSupabase() {
    return await createClient(); // リクエスト時に実行される
  }
}

let _backupCodeManager: BackupCodeManager | null = null;
export function getBackupCodeManager(): BackupCodeManager {
  if (!_backupCodeManager) _backupCodeManager = new BackupCodeManager();
  return _backupCodeManager;
}

// 後方互換性のためのProxy
export const backupCodeManager: BackupCodeManager = new Proxy(
  {} as BackupCodeManager,
  {
    get(_, prop: keyof BackupCodeManager) {
      const instance = getBackupCodeManager();
      return (instance as unknown as Record<string, unknown>)[prop as string];
    },
  }
);
```

---

### Issue 3: Redis Environment Variables (WARNING) - 修正完了

```
[Upstash Redis] Unable to find environment variable: UPSTASH_REDIS_REST_URL
```

**原因**: RateLimiterがモジュールレベルでインスタンス化され、コンストラクタで環境変数を参照していた

**修正ファイル**:
- `src/lib/rate-limiting/rate-limiter.ts`
- `src/lib/rate-limiting/csp-rate-limiter.ts`

**修正パターン**: Issue 2と同様の遅延初期化パターン

```typescript
// Before
export class RateLimiter {
  private redis: Redis;
  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });
  }
}
export const rateLimiter = new RateLimiter();

// After
export class RateLimiter {
  private redis: Redis | null = null;
  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
      });
    }
    return this.redis;
  }
}
// + 遅延初期化パターン（Proxy + getter関数）
```

---

### Issue 4: useSearchParams() Suspense Boundary (CRITICAL) - 修正完了

```
Error: useSearchParams() should be wrapped in a suspense boundary at page "/reservations"
```

**原因**: Next.js 15では`useSearchParams()`をSuspense境界でラップする必要がある

**修正ファイル**:
- `src/app/reservations/page.tsx`
- `src/app/admin/login/page.tsx`
- `src/app/login/page.tsx`
- `src/app/invite/page.tsx`

**修正パターン**:
```tsx
// Before
export default function ReservationsPage() {
  const searchParams = useSearchParams();
  // ...
}

// After
function ReservationsPageContent() {
  const searchParams = useSearchParams();
  // ...
}

export default function ReservationsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ReservationsPageContent />
    </Suspense>
  );
}
```

---

## 失敗の傾向分析

### パターン1: モジュールレベルのインスタンス化

| 問題 | 原因 | 解決策 |
|------|------|--------|
| cookies() outside request scope | コンストラクタで`cookies()`を呼ぶクラスをモジュールトップレベルでnew | 遅延初期化パターン（getter関数）に変更 |
| 環境変数が見つからない | コンストラクタで`process.env`を参照するクラスをモジュールトップレベルでnew | 遅延初期化パターンに変更 |

**根本原因**: Next.jsのビルド時にモジュールがインポートされると、トップレベルの`export const xxx = new Class()`が即時実行される。この時点ではリクエストコンテキストがないため、`cookies()`などのリクエスト依存APIは失敗する。

**ベストプラクティス**:
```typescript
// 避けるべきパターン
export const instance = new MyClass(); // ビルド時に実行される

// 推奨パターン
let _instance: MyClass | null = null;
export function getInstance(): MyClass {
  if (!_instance) _instance = new MyClass();
  return _instance;
}
```

---

### パターン2: Next.js 15のSSR制約

| 問題 | 原因 | 解決策 |
|------|------|--------|
| useSearchParams() Suspense error | Next.js 15でSSR時にuseSearchParams()がSuspense境界外 | コンポーネント分離 + Suspenseラップ |

**根本原因**: Next.js 15では、クライアントサイドのみで利用可能なフック（`useSearchParams`など）がSSR時に呼ばれると、Suspense境界でフォールバックを表示する必要がある。

**ベストプラクティス**:
```tsx
// 避けるべきパターン
export default function Page() {
  const searchParams = useSearchParams(); // SSR時にエラー
}

// 推奨パターン
function PageContent() {
  const searchParams = useSearchParams();
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PageContent />
    </Suspense>
  );
}
```

---

### パターン3: TypeScript型キャスト

| 問題 | 原因 | 解決策 |
|------|------|--------|
| Type conversion error | クラスインスタンスを`Record<string, unknown>`に直接キャストできない | `as unknown as Record<string, unknown>`に変更 |

**根本原因**: TypeScriptの型システムでは、インデックスシグネチャがないクラスを`Record<string, unknown>`に直接変換できない。

**ベストプラクティス**:
```typescript
// 避けるべきパターン
(instance as Record<string, unknown>)[prop];

// 推奨パターン
(instance as unknown as Record<string, unknown>)[prop];
```

---

## 修正したファイル一覧

| ファイル | 修正内容 |
|----------|----------|
| `src/app/client-layout.tsx` | QueryProviderラップ追加 |
| `src/lib/mfa/backup-codes.ts` | 遅延初期化パターン + 型修正 |
| `src/lib/mfa/mfa-manager.ts` | 遅延初期化パターン + 型修正 |
| `src/lib/rate-limiting/rate-limiter.ts` | 遅延初期化パターン + 型修正 |
| `src/lib/rate-limiting/csp-rate-limiter.ts` | 遅延初期化パターン + 型修正 |
| `src/app/reservations/page.tsx` | Suspenseラップ追加 |
| `src/app/admin/login/page.tsx` | Suspenseラップ追加 |
| `src/app/login/page.tsx` | Suspenseラップ追加 |
| `src/app/invite/page.tsx` | Suspenseラップ追加 |

---

## 検証コマンド

```bash
# ローカルビルドテスト
npm run build
# Expected: Build succeeds without errors

# 開発サーバーテスト
npm run dev
# Test: http://localhost:3000/master-data
# Expected: Page loads, React Query DevTools visible

# Vercelプレビューデプロイ
git push origin feature/vercel-deploy-fix
# Expected: Vercel preview build succeeds
```

---

## ESLint Warnings (既存問題 - 今回の修正対象外)

ビルドには影響しないWarningsが多数存在します。将来的な改善対象として記載:

| カテゴリ | 件数 | 対応優先度 |
|---------|------|-----------|
| `no-console` | 多数 | 低（本番ではlogger使用） |
| `@typescript-eslint/no-explicit-any` | 多数 | 中（段階的に型付け） |
| `jsx-a11y/label-has-associated-control` | 多数 | 中（a11y改善） |
| `unused-imports/no-unused-vars` | 多数 | 低（--fixで自動削除可） |
| `react-hooks/exhaustive-deps` | 10+ | 中（依存配列修正） |

---

## 結論

すべてのビルドブロッキングエラーを修正し、`npm run build`が成功するようになりました。
Vercelへのデプロイが可能です。
