import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getSafeRedirectUrl, getDefaultRedirect } from '@/lib/url-validator';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  
  // セキュアなリダイレクト先を検証
  const safeRedirectUrl = getSafeRedirectUrl(nextParam, origin);
  const redirectPath = safeRedirectUrl ? new URL(safeRedirectUrl).pathname : getDefaultRedirect();
  
  if (code) {
    const supabase = await createClient();
    
    try {
      const { error, data } = await supabase.auth.exchangeCodeForSession(code);
      
      if (!error && data.user) {
        // ユーザー情報を取得して適切なリダイレクト先を決定
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', data.user.id)
          .single();

        const userRole = profile?.role || 'staff';
        const finalRedirectPath = safeRedirectUrl ? 
          new URL(safeRedirectUrl).pathname : 
          getDefaultRedirect(userRole);

        // 成功ログ
        console.info(`[Auth] Successful login: ${data.user.email} -> ${finalRedirectPath}`);
        
        return NextResponse.redirect(`${origin}${finalRedirectPath}`);
      } else {
        // 認証エラーをログに記録
        console.error('[Auth] Exchange code failed:', {
          error: error?.message,
          code: code?.substring(0, 10) + '...', // セキュリティのため一部のみ
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      // 予期しないエラーをログに記録
      console.error('[Auth] Unexpected error during code exchange:', error);
    }
  } else {
    console.warn('[Auth] No authorization code provided in callback');
  }

  // 認証失敗時は安全なエラーメッセージでリダイレクト
  const errorUrl = `${origin}/admin/login?error=auth_failed`;
  
  // セキュリティログ
  console.warn('[Security] Authentication callback failed:', {
    hasCode: !!code,
    nextParam,
    safeRedirectUrl,
    userAgent: request.headers.get('user-agent')?.substring(0, 100),
    timestamp: new Date().toISOString(),
  });
  
  return NextResponse.redirect(errorUrl);
}