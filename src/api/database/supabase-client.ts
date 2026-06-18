'server-only';

import {
  createClient,
  type RealtimePostgresChangesPayload,
  type Session,
} from '@supabase/supabase-js';
import { assertEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { Database } from '@/types/supabase';

const supabaseUrl = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceRoleKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
type DailyReportUpdate =
  Database['public']['Tables']['daily_reports']['Update'];

// サーバーサイド専用のクライアント（管理者権限）
export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export const subscribeToTable = async (
  tableName: string,
  callback: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ) => void
) => {
  try {
    const subscription = supabase
      .channel(`${tableName}_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        callback
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  } catch (error) {
    logger.error('サブスクリプションエラー:', error);
    throw error;
  }
};

export const fetchWithRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      retries++;
      if (retries === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }

  throw new Error('Retry operation failed');
};

export const dbHelpers = {
  async getClinics() {
    return await fetchWithRetry(async () => {
      const { data, error } = await supabase.from('clinics').select('*');
      if (error) throw error;
      return data;
    });
  },

  async getStaffMembers(clinicId: string) {
    return await fetchWithRetry(async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('clinic_id', clinicId);
      if (error) throw error;
      return data;
    });
  },

  async getDailyReports(clinicId: string, date: string) {
    return await fetchWithRetry(async () => {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('report_date', date);
      if (error) throw error;
      return data;
    });
  },

  async updateDailyReport(id: string, data: DailyReportUpdate) {
    return await fetchWithRetry(async () => {
      const { data: result, error } = await supabase
        .from('daily_reports')
        .update(data)
        .eq('id', id);
      if (error) throw error;
      return result;
    });
  },
};

export const handleAuthStateChange = (
  callback: (event: string, session: Session | null) => void
) => {
  return supabase.auth.onAuthStateChange(callback);
};

export const getCurrentSession = async () => {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  } catch (error) {
    logger.error('セッション取得エラー:', error);
    return null;
  }
};

export default supabase;
