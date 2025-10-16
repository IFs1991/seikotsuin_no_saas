// This file should be regenerated via `supabase gen types typescript`
// See `npm run supabase:types` for details.
// Supabaseの型定義（自動生成されるファイルの代替）
type GenericTableDefinition = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
};

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
      profiles: {
        Row: {
          id: string;
          user_id: string;
          clinic_id: string | null;
          role: string;
          is_active: boolean;
          is_approved: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          clinic_id?: string | null;
          role: string;
          is_active?: boolean;
          is_approved?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          clinic_id?: string | null;
          role?: string;
          is_active?: boolean;
          is_approved?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      user_permissions: {
        Row: {
          id: string;
          staff_id: string;
          clinic_id: string | null;
          role: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          staff_id: string;
          clinic_id?: string | null;
          role: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          staff_id?: string;
          clinic_id?: string | null;
          role?: string;
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
      user_sessions: {
        Row: {
          id: string;
          user_id: string;
          clinic_id: string;
          session_token: string;
          refresh_token_id: string | null;
          device_info: Record<string, unknown>;
          ip_address: string | null;
          user_agent: string | null;
          geolocation: Record<string, unknown> | null;
          created_at: string;
          last_activity: string;
          expires_at: string;
          idle_timeout_at: string | null;
          absolute_timeout_at: string | null;
          is_active: boolean;
          is_revoked: boolean;
          revoked_at: string | null;
          revoked_by: string | null;
          revoked_reason: string | null;
          max_idle_minutes: number;
          max_session_hours: number;
          remember_device: boolean;
          created_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          clinic_id: string;
          session_token: string;
          refresh_token_id?: string | null;
          device_info?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          geolocation?: Record<string, unknown> | null;
          created_at?: string;
          last_activity?: string;
          expires_at: string;
          idle_timeout_at?: string | null;
          absolute_timeout_at?: string | null;
          is_active?: boolean;
          is_revoked?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          max_idle_minutes?: number;
          max_session_hours?: number;
          remember_device?: boolean;
          created_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          clinic_id?: string;
          session_token?: string;
          refresh_token_id?: string | null;
          device_info?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          geolocation?: Record<string, unknown> | null;
          created_at?: string;
          last_activity?: string;
          expires_at?: string;
          idle_timeout_at?: string | null;
          absolute_timeout_at?: string | null;
          is_active?: boolean;
          is_revoked?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          max_idle_minutes?: number;
          max_session_hours?: number;
          remember_device?: boolean;
          created_by?: string | null;
          updated_at?: string;
        };
      };
      security_events: {
        Row: {
          id: string;
          user_id: string | null;
          clinic_id: string | null;
          session_id: string | null;
          event_type: string;
          event_category: string;
          severity_level: string;
          event_description: string;
          event_data: Record<string, unknown>;
          ip_address: string | null;
          user_agent: string | null;
          geolocation: Record<string, unknown> | null;
          created_at: string;
          source_component: string | null;
          correlation_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          clinic_id?: string | null;
          session_id?: string | null;
          event_type: string;
          event_category: string;
          severity_level?: string;
          event_description: string;
          event_data?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          geolocation?: Record<string, unknown> | null;
          created_at?: string;
          source_component?: string | null;
          correlation_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          clinic_id?: string | null;
          session_id?: string | null;
          event_type?: string;
          event_category?: string;
          severity_level?: string;
          event_description?: string;
          event_data?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          geolocation?: Record<string, unknown> | null;
          created_at?: string;
          source_component?: string | null;
          correlation_id?: string | null;
        };
      };
      registered_devices: {
        Row: {
          id: string;
          user_id: string;
          clinic_id: string;
          device_fingerprint: string;
          device_name: string | null;
          device_info: Record<string, unknown>;
          trust_level: string;
          last_seen_at: string;
          last_ip_address: string | null;
          auto_trust_after_days: number | null;
          trusted_at: string | null;
          blocked_at: string | null;
          blocked_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          clinic_id: string;
          device_fingerprint: string;
          device_name?: string | null;
          device_info?: Record<string, unknown>;
          trust_level?: string;
          last_seen_at?: string;
          last_ip_address?: string | null;
          auto_trust_after_days?: number | null;
          trusted_at?: string | null;
          blocked_at?: string | null;
          blocked_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          clinic_id?: string;
          device_fingerprint?: string;
          device_name?: string | null;
          device_info?: Record<string, unknown>;
          trust_level?: string;
          last_seen_at?: string;
          last_ip_address?: string | null;
          auto_trust_after_days?: number | null;
          trusted_at?: string | null;
          blocked_at?: string | null;
          blocked_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    } & Record<string, GenericTableDefinition>;
    Views: Record<string, unknown>;
    Functions: {
      get_table_columns: {
        Args: { table_name_param: string };
        Returns: Array<{
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
        }>;
      };
    };
    Enums: Record<string, unknown>;
  };
}
