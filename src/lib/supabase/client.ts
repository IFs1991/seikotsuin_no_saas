import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ブラウザ用のSupabaseクライアント（クライアントコンポーネント用）
export const supabase = createClient();
