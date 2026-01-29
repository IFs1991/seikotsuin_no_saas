import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import {
  AppError,
  createApiError,
  ERROR_CODES,
  normalizeSupabaseError,
  logError,
} from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';

const PATH = '/api/staff/demand-forecast';

// クエリパラメータのスキーマ
const demandForecastQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id は有効なUUIDである必要があります'),
  start: z.string().optional(),
  end: z.string().optional(),
});

const formatDateJst = (value: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

const formatHourJst = (value: Date): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      hour12: false,
    }).format(value)
  );

// 需要レベルを計算する関数
function getDemandLevel(count: number): 'low' | 'medium' | 'high' {
  if (count <= 2) return 'low';
  if (count <= 4) return 'medium';
  return 'high';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const parsedQuery = demandForecastQuerySchema.safeParse({
      clinic_id: searchParams.get('clinic_id'),
      start: searchParams.get('start'),
      end: searchParams.get('end'),
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id, start, end } = parsedQuery.data;

    const { supabase } = await ensureClinicAccess(request, PATH, clinic_id, {
      requireClinicMatch: true,
    });

    // デフォルトの日付範囲（過去30日〜今後7日）
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);
    const defaultEnd = new Date();
    defaultEnd.setDate(defaultEnd.getDate() + 7);

    const startDate = start || formatDateJst(defaultStart);
    const endDate = end || formatDateJst(defaultEnd);

    // 予約データを取得
    const { data: reservations, error: reservationsError } = await supabase
      .from('reservations')
      .select('id, start_time, end_time, status')
      .eq('clinic_id', clinic_id)
      .gte('start_time', `${startDate}T00:00:00Z`)
      .lte('start_time', `${endDate}T23:59:59Z`)
      .in('status', ['confirmed', 'completed']);

    if (reservationsError) {
      throw normalizeSupabaseError(reservationsError, PATH);
    }

    // 日付・時間帯別に予約数を集計
    const forecastMap: Map<
      string,
      { date: string; hour: number; count: number }
    > = new Map();

    (reservations || []).forEach(reservation => {
      const startTime = new Date(reservation.start_time);
      const date = formatDateJst(startTime);
      const hour = formatHourJst(startTime);
      const key = `${date}-${hour}`;

      const existing = forecastMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        forecastMap.set(key, { date, hour, count: 1 });
      }
    });

    // 需要予測データを作成
    const forecasts = Array.from(forecastMap.values())
      .map(item => ({
        date: item.date,
        hour: item.hour,
        count: item.count,
        level: getDemandLevel(item.count),
      }))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.hour - b.hour;
      });

    // 時間帯別の集計（全期間）
    const hourlyAggregate: Record<number, number> = {};
    forecasts.forEach(f => {
      hourlyAggregate[f.hour] = (hourlyAggregate[f.hour] || 0) + f.count;
    });

    const hourlyDistribution = Object.entries(hourlyAggregate)
      .map(([hour, count]) => ({
        hour: parseInt(hour),
        totalCount: count,
        averageCount: forecasts.filter(f => f.hour === parseInt(hour)).length
          ? count / forecasts.filter(f => f.hour === parseInt(hour)).length
          : 0,
        level: getDemandLevel(
          forecasts.filter(f => f.hour === parseInt(hour)).length
            ? count / forecasts.filter(f => f.hour === parseInt(hour)).length
            : 0
        ),
      }))
      .sort((a, b) => a.hour - b.hour);

    // ピーク時間帯を特定
    const peakHours = [...hourlyDistribution]
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 3)
      .map(h => h.hour);

    // 閑散時間帯を特定（営業時間内で予約が少ない時間帯）
    const lowDemandHours = hourlyDistribution
      .filter(h => h.hour >= 9 && h.hour <= 18 && h.level === 'low')
      .map(h => h.hour);

    return createSuccessResponse({
      forecasts,
      hourlyDistribution,
      summary: {
        totalReservations: reservations?.length || 0,
        peakHours,
        lowDemandHours,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      },
    });
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = error;
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        '需要予測データの取得に失敗しました',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
