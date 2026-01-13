# 認証と権限制御_MVP仕様書（詳細版）

## 目的
- HQと院のログインを分離し、未認証アクセスを遮断する。
- profilesのrole/clinic_idで権限制御を統一する。
- 並列実装の衝突を避けるため、境界とインターフェースを明示する。

## 範囲
- 新規: /login, /invite
- 既存: /admin/login, middleware.ts
- 保護対象: /reservations /daily-reports /chat /ai-insights /master-data

## 依存テーブル
- auth.users
- public.profiles
- public.staff_invites
- public.onboarding_states
- public.user_sessions, public.security_events

## 仕様
### ログイン
- HQ: /admin/login -> /admin
- 院: /login -> /dashboard
- 成功時に profiles.last_login_at を更新
- profiles.is_active=false は拒否

### 招待
- /invite?token=... で受諾
- accept_invite RPC を使用
- 受諾後に clinic_id と role を付与

### ルート保護
- /admin/** は admin/clinic_manager/manager のみ
- その他の保護対象は院ロールも許可
- 未認証時の遷移先は /admin/login と /login を分岐

## 競合回避
- APIの詳細実装は各機能仕様に委譲
- 本仕様は認証UIとmiddlewareの変更のみ

## 受け入れ基準
- 未認証で保護ルートに入るとログインへ遷移
- 院ユーザーは /admin/** に入れない
- 招待リンクから登録できる

---

## 実装状況（2025-12-30更新）

### 完了項目

| 項目 | ファイル | 状態 |
|------|----------|------|
| middleware更新 | `middleware.ts` | 完了 |
| 院向けログインページ | `src/app/login/page.tsx` | 完了 |
| 院向けログインactions | `src/app/login/actions.ts` | 完了 |
| 招待受諾ページ | `src/app/invite/page.tsx` | 完了 |
| 招待受諾actions | `src/app/invite/actions.ts` | 完了 |
| last_login_at更新 | `clinicLogin` action内 | 完了 |
| テスト作成 | `src/__tests__/auth/` | 完了 |

### 実装詳細

#### middleware.ts
```typescript
// 保護対象ルート
const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard', '/admin', '/staff', '/patients', '/revenue',
  '/reservations', '/daily-reports', '/chat', '/ai-insights', '/master-data',
];

// 公開ルート
const ADMIN_PUBLIC_ROUTES = ['/admin/login', '/admin/callback'];
const CLINIC_PUBLIC_ROUTES = ['/login', '/invite'];

// HQロール（/admin/**アクセス可）
const HQ_ROLES = ['admin', 'clinic_manager', 'manager'];

// リダイレクト分岐
// /admin/** → /admin/login
// その他 → /login
```

#### /login（院向け）
- Email/Password認証
- profiles.is_active チェック
- profiles.clinic_id チェック（所属クリニック必須）
- ログイン成功時に last_login_at 更新
- 成功後 `/dashboard` へリダイレクト

#### /invite（招待受諾）
- トークンで招待情報取得（`get_invite_by_token` RPC）
- 認証済み: 直接受諾
- 未認証: サインアップ/ログインフォーム表示
- 受諾時に `accept_invite` RPC 呼び出し
- clinic_id と role がプロファイルに付与される

### テスト結果
```
Test Suites: 3 passed, 3 total
Tests:       39 passed, 39 total
```

### 受け入れ基準の達成状況
- [x] 未認証で保護ルートに入るとログインへ遷移
- [x] 院ユーザーは /admin/** に入れない
- [x] 招待リンクから登録できる

---

## 次のステップ（残作業）

### 優先度: 高

1. **E2Eテストの追加**
   - 実際のブラウザでのログインフロー検証
   - 招待フローのE2Eテスト
   - ファイル: `src/__tests__/e2e/auth-flow.e2e.test.ts`

2. **エラーハンドリングの強化**
   - ネットワークエラー時のUI表示
   - セッションタイムアウト時の処理

3. **ログアウト処理の統一**
   - `/login` と `/admin/login` のログアウト後リダイレクト先統一
   - ヘッダーのログアウトボタン対応

### 優先度: 中

4. **パスワードリセット機能**
   - `/forgot-password` ページ
   - メール送信フロー

5. **招待メール送信機能**
   - 招待作成時のメール送信
   - Edge Functions または外部メールサービス連携

6. **セッション管理UI**
   - 複数デバイスログイン時の管理画面
   - 強制ログアウト機能

### 優先度: 低

7. **OAuth連携（Google/LINE）**
   - ソーシャルログイン対応
   - 既存アカウントとの紐付け

8. **MFA（多要素認証）**
   - TOTP対応
   - SMS認証

---

## 関連ドキュメント
- `supabase/migrations/20251225000100_onboarding_tables.sql` - staff_invites, accept_invite RPC
- `src/lib/schemas/auth.ts` - バリデーションスキーマ
- `src/lib/url-validator.ts` - リダイレクトURL検証
