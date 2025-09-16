import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createClient } from '@/lib/supabase/server';
import { SessionManager } from '@/lib/session-manager';
import { SecurityMonitor } from '@/lib/security-monitor';
import { applyRateLimits, getPathRateLimit } from '@/lib/rate-limiting/middleware';
import { CSPConfig } from '@/lib/security/csp-config';

export async function middleware(request: NextRequest) {
  // Phase 3B Refactoring: Nonce生成（すべてのリクエストで実行）
  const nonce = CSPConfig.generateNonce();
  
  // Phase 3B: レート制限チェック（最優先）
  const pathname = request.nextUrl.pathname;
  const rateLimitMiddlewares = getPathRateLimit(pathname);
  
  if (rateLimitMiddlewares.length > 0) {
    const rateLimitResponse = await applyRateLimits(request, rateLimitMiddlewares);
    if (rateLimitResponse) {
      return rateLimitResponse; // レート制限に引っかかった場合は即座に返す
    }
  }

  // Supabaseセッションの更新
  const response = await updateSession(request);
  
  // Phase 3B Refactoring: Nonceをレスポンスヘッダーに設定
  response.headers.set('x-nonce', nonce);
  response.headers.set('x-nonce-timestamp', Date.now().toString());

  // CSP適用（段階導入に対応）
  try {
    const phaseEnv = (process.env.CSP_ROLLOUT_PHASE as 'report-only' | 'partial-enforce' | 'full-enforce' | undefined) ?? 'report-only';
    const rollout = CSPConfig.getGradualRolloutCSP(phaseEnv, nonce);
    if (rollout.csp) {
      response.headers.set('Content-Security-Policy', rollout.csp);
    }
    if (rollout.cspReportOnly) {
      response.headers.set('Content-Security-Policy-Report-Only', rollout.cspReportOnly);
    }
  } catch (e) {
    // 失敗時はCSP設定をスキップ（フェイルオープン）
    console.warn('CSP header application failed:', e);
  }

  // 認証が必要なルートの保護
  const protectedRoutes = ['/dashboard', '/admin', '/staff', '/patients', '/revenue'];
  const adminOnlyRoutes = ['/admin'];
  const isProtectedRoute = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );
  const isAdminRoute = adminOnlyRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtectedRoute) {
    // セッションからユーザー情報を取得
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    // 未認証ユーザーをログインページにリダイレクト
    if (error || !user) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 拡張セッション管理の実行
    const sessionManager = new SessionManager();
    const securityMonitor = new SecurityMonitor();
    
    // リクエスト情報の取得
    const ipAddress = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    
    // カスタムセッション検証（既存のSupabaseセッションと連携）
    try {
      // セッショントークンをクッキーから取得（カスタム実装）
      const customSessionToken = request.cookies.get('session-token')?.value;
      
      if (customSessionToken) {
        // カスタムセッション検証
        const validation = await sessionManager.validateSession(customSessionToken);
        
        if (!validation.isValid) {
          // カスタムセッションが無効な場合
          console.warn(`Invalid custom session: ${validation.reason}`);
          
          // セキュリティイベント記録
          await securityMonitor.handleSecurityThreat({
            threatType: 'suspicious_login',
            severity: 'low',
            description: 'セッション検証に失敗しました',
            evidence: { reason: validation.reason, sessionToken: customSessionToken },
            userId: user.id,
            ipAddress,
            timestamp: new Date(),
          });
        } else if (validation.session) {
          // セッションアクティビティ分析
          const threats = await securityMonitor.analyzeSessionActivity(validation.session, {
            ipAddress,
            userAgent,
          });
          
          // 検出された脅威の処理
          for (const threat of threats) {
            await securityMonitor.handleSecurityThreat(threat);
            
            // 高リスクの場合はセッションを強制終了
            if (threat.severity === 'high' || threat.severity === 'critical') {
              await sessionManager.revokeSession(validation.session.id, 'security_violation');
              
              const loginUrl = new URL('/admin/login', request.url);
              loginUrl.searchParams.set('error', 'security_violation');
              loginUrl.searchParams.set('message', 'セキュリティ上の理由によりログアウトされました');
              return NextResponse.redirect(loginUrl);
            }
          }
          
          // セッション情報の更新（最終アクティビティ等）
          await sessionManager.refreshSession(customSessionToken, ipAddress);
        }
      }
    } catch (sessionError) {
      console.error('拡張セッション管理エラー:', sessionError);
      // エラーが発生してもメインの認証フローは継続
    }

    // 管理者専用ルートの権限チェック
    if (isAdminRoute) {
      // ユーザーの権限を確認（profilesテーブルから - 更新されたスキーマに合わせる）
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, clinic_id, is_active')
        .eq('user_id', user.id)
        .single();

      // 管理者権限がない場合はアクセス拒否
      if (!profile || !profile.is_active || !['admin', 'manager'].includes(profile.role)) {
        // アクセス拒否のセキュリティイベント記録
        try {
          const securityMonitor = new SecurityMonitor();
          await securityMonitor.handleSecurityThreat({
            threatType: 'suspicious_login',
            severity: 'medium',
            description: '権限不足によるアクセス拒否',
            evidence: { 
              requestedPath: request.nextUrl.pathname,
              userRole: profile?.role || 'unknown',
              isActive: profile?.is_active || false,
            },
            userId: user.id,
            clinicId: profile?.clinic_id,
            ipAddress,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error('権限チェックエラーログ記録失敗:', error);
        }
        
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }

      // 管理者アクセスの成功ログ
      try {
        const securityMonitor = new SecurityMonitor();
        await securityMonitor.handleSecurityThreat({
          threatType: 'suspicious_login', // イベントタイプを適切に設定
          severity: 'low',
          description: '管理者ルートへのアクセス成功',
          evidence: { 
            requestedPath: request.nextUrl.pathname,
            userRole: profile.role,
          },
          userId: user.id,
          clinicId: profile.clinic_id,
          ipAddress,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('管理者アクセスログ記録失敗:', error);
      }
    }

    // セキュリティヘッダーを追加（強化版）
    response.headers.set('X-User-ID', user.id);
    response.headers.set('X-Auth-Time', new Date().toISOString());
    response.headers.set('X-Client-IP', ipAddress);
    response.headers.set('X-Session-ID', user.id + '-' + Date.now()); // セッション追跡用
    
    // セキュリティヘッダーの追加
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  return response;
}

/**
 * クライアントIPアドレスを取得
 */
function getClientIP(request: NextRequest): string {
  // プロキシ経由の場合のヘッダーをチェック
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    const first = forwarded.split(',')[0];
    return first ? first.trim() : '127.0.0.1';
  }
  
  if (realIp) {
    return realIp;
  }
  
  // フォールバック（開発環境など）
  return '127.0.0.1';
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
