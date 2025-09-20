import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Supabase環境変数が設定されていません');
}

// サーバーサイド専用のクライアント（管理者権限）
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
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
});

export const subscribeToTable = async (
  tableName: string,
  callback: (payload: any) => void
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
    console.error('サブスクリプションエラー:', error);
    throw error;
  }
};

export const fetchWithRetry = async (
  operation: () => Promise<any>,
  maxRetries = 3
) => {
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
        .eq('date', date);
      if (error) throw error;
      return data;
    });
  },

  async updateDailyReport(id: string, data: any) {
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
  callback: (event: string, session: any) => void
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
    console.error('セッション取得エラー:', error);
    return null;
  }
};

export default supabase;
