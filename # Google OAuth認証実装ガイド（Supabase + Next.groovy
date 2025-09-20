# Google OAuth認証実装ガイド（Supabase + Next.js）

## 🚀 セットアップ手順

### 1. Google Cloud Console設定

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新規プロジェクト作成または既存プロジェクト選択
3. **APIs & Services > Credentials** に移動
4. **Create Credentials > OAuth client ID** を選択
5. 以下を設定：
   - Application type: `Web application`
   - Name: `Your App Name`
   - Authorized JavaScript origins:
     - `http://localhost:3000` (開発用)
     - `https://your-domain.com` (本番用)
   - Authorized redirect URIs:
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
     - `http://localhost:54321/auth/v1/callback` (ローカル開発用)

### 2. Supabase Dashboard設定

1. Supabase Dashboard > **Authentication > Providers**
2. **Google** を有効化
3. **Client ID** と **Client Secret** を入力（Google Consoleから取得）
4. **Save** をクリック

### 3. 環境変数設定

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 📦 必要なパッケージ

```bash
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install @supabase/ssr  # Server-side rendering対応
```

## 💻 実装コード

### 1. Supabaseクライアント設定

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Componentでは無視
          }
        },
      },
    }
  )
}
```

### 2. 認証コールバック処理

```typescript
// app/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session) {
      // カスタム処理：プロファイル情報を処理
      const { data: profileData } = await supabase.rpc('process_google_login', {
        p_user_id: session.user.id,
        p_email: session.user.email!,
        p_full_name: session.user.user_metadata.full_name || session.user.email!,
        p_avatar_url: session.user.user_metadata.avatar_url || null,
        p_provider: 'google'
      })

      // 承認待ちの場合は待機画面へ
      if (profileData && !profileData.is_approved) {
        return NextResponse.redirect(`${origin}/auth/pending-approval`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
```

### 3. ログインコンポーネント

```tsx
// components/auth/GoogleLoginButton.tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export function GoogleLoginButton() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    setLoading(true)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      console.error('Login error:', error)
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleGoogleLogin}
      disabled={loading}
      className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
    >
      <GoogleIcon />
      {loading ? 'ログイン中...' : 'Googleでログイン'}
    </button>
  )
}

// Googleアイコン
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
```

### 4. 認証フック

```typescript
// hooks/useAuth.ts
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

interface UserProfile {
  clinic_id: string
  role: string
  is_active: boolean
  is_approved: boolean
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // 初回読み込み
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        // プロファイル情報を取得
        supabase
          .from('profiles')
          .select('clinic_id, role, is_active, is_approved')
          .eq('user_id', user.id)
          .single()
          .then(({ data }) => {
            setProfile(data)
          })
      }
      setLoading(false)
    })

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)

        if (session?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('clinic_id, role, is_active, is_approved')
            .eq('user_id', session.user.id)
            .single()

          setProfile(data)
        } else {
          setProfile(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  return {
    user,
    profile,
    loading,
    isAuthenticated: !!user,
    isApproved: profile?.is_approved ?? false,
    isActive: profile?.is_active ?? false,
    role: profile?.role ?? null,
    clinicId: profile?.clinic_id ?? null,
    signOut: () => supabase.auth.signOut(),
  }
}
```

### 5. 保護されたルート（middleware）

```typescript
// middleware.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 未認証ユーザーをログインページへ
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 認証済みユーザーの権限チェック
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_approved')
      .eq('user_id', user.id)
      .single()

    // 未承認ユーザーは待機画面へ
    if (!profile?.is_approved && !request.nextUrl.pathname.startsWith('/auth/pending')) {
      return NextResponse.redirect(new URL('/auth/pending-approval', request.url))
    }

    // 管理者ページの権限チェック
    if (request.nextUrl.pathname.startsWith('/admin') && profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/api/:path*',
  ],
}
```

### 6. ユーザー管理画面（管理者用）

```tsx
// app/admin/users/page.tsx
import { createClient } from '@/lib/supabase/server'

export default async function UsersManagement() {
  const supabase = await createClient()

  // 未承認ユーザー一覧を取得
  const { data: pendingUsers } = await supabase.rpc('get_pending_users')

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">ユーザー管理</h1>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">承認待ちユーザー</h2>
        </div>

        <div className="p-6">
          {pendingUsers?.length === 0 ? (
            <p className="text-gray-500">承認待ちのユーザーはいません</p>
          ) : (
            <div className="space-y-4">
              {pendingUsers?.map((user) => (
                <UserApprovalCard key={user.user_id} user={user} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ユーザー承認カード
function UserApprovalCard({ user }: { user: any }) {
  async function approveUser(userId: string, role: string) {
    'use server'
    const supabase = await createClient()
    await supabase.rpc('approve_user', {
      target_user_id: userId,
      assign_role: role,
    })
  }

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center space-x-4">
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt={user.full_name}
            className="w-10 h-10 rounded-full"
          />
        )}
        <div>
          <p className="font-medium">{user.full_name}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <form action={approveUser.bind(null, user.user_id, 'staff')}>
          <button className="px-3 py-1 bg-green-600 text-white rounded">
            スタッフとして承認
          </button>
        </form>
        <form action={approveUser.bind(null, user.user_id, 'therapist')}>
          <button className="px-3 py-1 bg-blue-600 text-white rounded">
            施術者として承認
          </button>
        </form>
      </div>
    </div>
  )
}
```

## 🔒 セキュリティベストプラクティス

### 1. JWT検証
- すべてのAPIリクエストでJWTトークンを検証
- `raw_app_meta_data`に権限情報を保存（ユーザーが変更不可）

### 2. RLS（Row Level Security）
- データベースレベルでアクセス制御
- JWTクレームを使用した動的なポリシー

### 3. 権限管理
```sql
-- 権限チェック例
SELECT * FROM patients
WHERE clinic_id = (auth.jwt()->>'clinic_id')::uuid
AND (auth.jwt()->>'is_active')::boolean = true;
```

## 📊 トラブルシューティング

### よくある問題と解決策

1. **「Callback URL mismatch」エラー**
   - Google ConsoleとSupabaseの両方で同じCallback URLを設定
   - 開発環境と本番環境で別々のOAuthクライアントを使用

2. **プロファイルが作成されない**
   - `handle_new_user()`トリガーが正しく動作しているか確認
   - `auth.users`へのトリガーが権限エラーの場合は、Edge Functionを使用

3. **ログイン後にリダイレクトされない**
   - `/auth/callback`ルートが正しく実装されているか確認
   - `redirectTo`パラメータが正しく設定されているか確認

4. **承認待ち画面から進めない**
   - 管理者アカウントで`approve_user`関数を実行
   - profilesテーブルの`is_approved`フラグを確認

## 🚀 本番環境へのデプロイ

1. **環境変数の設定**
   - Vercel/Netlify等のダッシュボードで環境変数を設定

2. **Google OAuth設定の更新**
   - 本番URLをAuthorized JavaScript originsに追加
   - 本番のCallback URLを追加

3. **Supabase設定**
   - Site URLを本番URLに更新
   - 追加のRedirect URLsを設定

4. **セキュリティ強化**
   - Rate limitingの設定
   - IPホワイトリストの検討
   - 監査ログの定期確認

## 📚 参考リンク

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Next.js Authentication Patterns](https://nextjs.org/docs/app/building-your-application/authentication)