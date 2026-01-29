import { NextRequest, NextResponse } from 'next/server';

import { createLogger } from '@/lib/logger';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';

const log = createLogger('SecurityStatsAPI');

const RANGE_TO_DAYS: Record<string, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

type Severity = 'low' | 'medium' | 'high' | 'critical';

function mapSeverity(level: string): Severity {
  switch (level) {
    case 'critical':
      return 'critical';
    case 'error':
    case 'high':
      return 'high';
    case 'warning':
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

function pickHighestSeverity(values: Severity[]): Severity {
  const order: Severity[] = ['low', 'medium', 'high', 'critical'];
  let maxIndex = 0;
  for (const value of values) {
    const idx = order.indexOf(value);
    if (idx > maxIndex) {
      maxIndex = idx;
    }
  }
  return order[maxIndex] ?? 'low';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get('range')?.toLowerCase() ?? '24h';
  const clinicId = searchParams.get('clinic_id');

  const days = RANGE_TO_DAYS[range] ?? 1;
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (DOD-08)
    const { supabase, permissions } = await ensureClinicAccess(
      request,
      '/api/admin/security/stats',
      clinicId,
      {
        requireClinicMatch: clinicId !== null,
        allowedRoles: Array.from(ADMIN_UI_ROLES),
      }
    );

    const resolvedClinicId = clinicId ?? permissions.clinic_id ?? undefined;

    if (!resolvedClinicId) {
      return NextResponse.json(
        {
          error: '参照可能なclinic_idを特定できませんでした',
        },
        { status: 400 }
      );
    }

    const baseEventQuery = supabase
      .from('security_events')
      .select(
        'id, event_type, severity_level, event_description, created_at, user_id, clinic_id, ip_address'
      )
      .eq('clinic_id', resolvedClinicId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    const [eventsResult, auditResult] = await Promise.all([
      baseEventQuery,
      supabase
        .from('audit_logs')
        .select('event_type, user_id, clinic_id, success, created_at')
        .eq('clinic_id', resolvedClinicId)
        .gte('created_at', since.toISOString())
        .limit(500),
    ]);

    if (eventsResult.error) {
      throw eventsResult.error;
    }
    if (auditResult.error) {
      throw auditResult.error;
    }

    const events = eventsResult.data ?? [];
    const auditLogs = auditResult.data ?? [];

    const eventsByDay = new Map<
      string,
      { count: number; severities: Severity[] }
    >();

    const mappedEvents = events.map(event => {
      const severity = mapSeverity(event.severity_level);
      const dateKey = event.created_at.split('T')[0];
      const entry = eventsByDay.get(dateKey) ?? { count: 0, severities: [] };
      entry.count += 1;
      entry.severities.push(severity);
      eventsByDay.set(dateKey, entry);

      return {
        id: event.id,
        event_type: event.event_type,
        severity,
        user_id: event.user_id ?? undefined,
        clinic_id: event.clinic_id ?? undefined,
        ip_address: event.ip_address ?? undefined,
        created_at: event.created_at,
        event_description: event.event_description,
      };
    });

    const trend = Array.from(eventsByDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, value]) => ({
        date,
        count: value.count,
        severity: pickHighestSeverity(value.severities),
      }));

    const failedLogins = auditLogs.filter(
      log => log.event_type === 'failed_login'
    ).length;
    const unauthorizedAccess = auditLogs.filter(
      log => log.event_type === 'unauthorized_access'
    ).length;
    const dataModifications = auditLogs.filter(log =>
      ['data_modify', 'data_delete', 'data_access'].includes(
        log.event_type ?? ''
      )
    ).length;

    const uniqueUsers = new Set([
      ...auditLogs
        .map(log => log.user_id)
        .filter((id): id is string => Boolean(id)),
      ...events
        .map(event => event.user_id)
        .filter((id): id is string => Boolean(id)),
    ]).size;

    const payload = {
      events: mappedEvents,
      summary: {
        total_events: events.length,
        failed_logins: failedLogins,
        unauthorized_access: unauthorizedAccess,
        data_modifications: dataModifications,
        unique_users: uniqueUsers,
      },
      trend,
    };

    return NextResponse.json(payload);
  } catch (error) {
    log.error('セキュリティ統計取得で例外が発生', error);
    return NextResponse.json(
      {
        error: 'セキュリティ統計の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
