/**
 * CSP違反統計API
 * Phase 3B: CSP違反の統計・分析データ提供
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 過去24時間の統計を取得
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // 基本統計の取得
    const [
      totalViolationsResult,
      criticalViolationsResult,
      uniqueClientsResult,
      topDirectivesResult,
    ] = await Promise.all([
      // 総違反数
      supabase
        .from('csp_violations')
        .select('id', { count: 'exact' })
        .gte('created_at', twentyFourHoursAgo.toISOString()),

      // 重大違反数（critical + high）
      supabase
        .from('csp_violations')
        .select('id', { count: 'exact' })
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .in('severity', ['critical', 'high']),

      // ユニーククライアント数
      supabase
        .from('csp_violations')
        .select('client_ip')
        .gte('created_at', twentyFourHoursAgo.toISOString()),

      // よく違反されるディレクティブ
      supabase
        .from('csp_violations')
        .select('violated_directive')
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    // エラーチェック
    if (totalViolationsResult.error) {
      throw totalViolationsResult.error;
    }

    // ユニーククライアントの計算
    const uniqueClients = new Set(
      uniqueClientsResult.data?.map(item => item.client_ip) || []
    ).size;

    // ディレクティブ別集計
    const directiveCount: Record<string, number> = {};
    topDirectivesResult.data?.forEach(item => {
      const directive = item.violated_directive;
      directiveCount[directive] = (directiveCount[directive] || 0) + 1;
    });

    const topDirectives = Object.entries(directiveCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([directive, count]) => ({ directive, count }));

    // 最近の高脅威違反を取得
    const recentThreatsResult = await supabase
      .from('csp_violations')
      .select('*')
      .gte('created_at', twentyFourHoursAgo.toISOString())
      .in('severity', ['critical', 'high'])
      .order('created_at', { ascending: false })
      .limit(10);

    const stats = {
      total_violations: totalViolationsResult.count || 0,
      critical_violations: criticalViolationsResult.count || 0,
      unique_clients: uniqueClients,
      top_directives: topDirectives,
      recent_threats: recentThreatsResult.data || [],
      generated_at: new Date().toISOString(),
      period: '24h',
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('CSP統計取得エラー:', error);

    return NextResponse.json(
      {
        error: 'CSP統計の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
