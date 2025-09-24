// This file should be regenerated via `supabase gen types typescript`
// See `npm run supabase:types` for details.
// Supabaseの型定義（自動生成されるファイルの代替）
export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          phone_number: string | null;
          opening_date: string | null;
          is_active: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          phone_number?: string | null;
          opening_date?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string | null;
          phone_number?: string | null;
          opening_date?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      staff: {
        Row: {
          id: string;
          clinic_id: string | null;
          name: string;
          role: string;
          hire_date: string | null;
          is_therapist: boolean | null;
          email: string;
          password_hash: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          clinic_id?: string | null;
          name: string;
          role: string;
          hire_date?: string | null;
          is_therapist?: boolean | null;
          email: string;
          password_hash: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string | null;
          name?: string;
          role?: string;
          hire_date?: string | null;
          is_therapist?: boolean | null;
          email?: string;
          password_hash?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      patients: {
        Row: {
          id: string;
          clinic_id: string | null;
          name: string;
          gender: string | null;
          date_of_birth: string | null;
          phone_number: string | null;
          address: string | null;
          registration_date: string | null;
          last_visit_date: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          clinic_id?: string | null;
          name: string;
          gender?: string | null;
          date_of_birth?: string | null;
          phone_number?: string | null;
          address?: string | null;
          registration_date?: string | null;
          last_visit_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string | null;
          name?: string;
          gender?: string | null;
          date_of_birth?: string | null;
          phone_number?: string | null;
          address?: string | null;
          registration_date?: string | null;
          last_visit_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      daily_ai_comments: {
        Row: {
          id: string;
          clinic_id: string | null;
          comment_date: string; // ISO date string
          summary: string | null;
          good_points: string | null;
          improvement_points: string | null;
          suggestion_for_tomorrow: string | null;
          raw_ai_response: Record<string, unknown> | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          clinic_id?: string | null;
          comment_date: string;
          summary?: string | null;
          good_points?: string | null;
          improvement_points?: string | null;
          suggestion_for_tomorrow?: string | null;
          raw_ai_response?: Record<string, unknown> | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          clinic_id?: string | null;
          comment_date?: string;
          summary?: string | null;
          good_points?: string | null;
          improvement_points?: string | null;
          suggestion_for_tomorrow?: string | null;
          raw_ai_response?: Record<string, unknown> | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
