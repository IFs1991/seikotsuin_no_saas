export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_comments: {
        Row: {
          clinic_id: string | null;
          comment_date: string;
          created_at: string | null;
          good_points: string | null;
          id: string;
          improvement_points: string | null;
          raw_ai_response: Json | null;
          suggestion_for_tomorrow: string | null;
          summary: string | null;
          updated_at: string | null;
        };
        Insert: {
          clinic_id?: string | null;
          comment_date: string;
          created_at?: string | null;
          good_points?: string | null;
          id?: string;
          improvement_points?: string | null;
          raw_ai_response?: Json | null;
          suggestion_for_tomorrow?: string | null;
          summary?: string | null;
          updated_at?: string | null;
        };
        Update: {
          clinic_id?: string | null;
          comment_date?: string;
          created_at?: string | null;
          good_points?: string | null;
          id?: string;
          improvement_points?: string | null;
          raw_ai_response?: Json | null;
          suggestion_for_tomorrow?: string | null;
          summary?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_ai_comments_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      appointments: {
        Row: {
          appointment_date: string;
          appointment_number: string | null;
          appointment_type: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          duration_minutes: number;
          end_time: string;
          id: string;
          notes: string | null;
          patient_id: string;
          priority: string | null;
          reminder_sent_at: string | null;
          requested_menus: string[] | null;
          special_requests: string | null;
          staff_id: string | null;
          start_time: string;
          status: string;
          symptoms: string | null;
          updated_at: string;
        };
        Insert: {
          appointment_date: string;
          appointment_number?: string | null;
          appointment_type?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number;
          end_time: string;
          id?: string;
          notes?: string | null;
          patient_id: string;
          priority?: string | null;
          reminder_sent_at?: string | null;
          requested_menus?: string[] | null;
          special_requests?: string | null;
          staff_id?: string | null;
          start_time: string;
          status?: string;
          symptoms?: string | null;
          updated_at?: string;
        };
        Update: {
          appointment_date?: string;
          appointment_number?: string | null;
          appointment_type?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number;
          end_time?: string;
          id?: string;
          notes?: string | null;
          patient_id?: string;
          priority?: string | null;
          reminder_sent_at?: string | null;
          requested_menus?: string[] | null;
          special_requests?: string | null;
          staff_id?: string | null;
          start_time?: string;
          status?: string;
          symptoms?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'appointments_cancelled_by_fkey';
            columns: ['cancelled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          clinic_id: string | null;
          created_at: string | null;
          details: Json | null;
          error_message: string | null;
          event_type: string;
          id: string;
          ip_address: unknown;
          success: boolean;
          target_id: string | null;
          target_table: string | null;
          user_agent: string | null;
          user_email: string | null;
          user_id: string | null;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string | null;
          details?: Json | null;
          error_message?: string | null;
          event_type: string;
          id?: string;
          ip_address?: unknown;
          success?: boolean;
          target_id?: string | null;
          target_table?: string | null;
          user_agent?: string | null;
          user_email?: string | null;
          user_id?: string | null;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string | null;
          details?: Json | null;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          ip_address?: unknown;
          success?: boolean;
          target_id?: string | null;
          target_table?: string | null;
          user_agent?: string | null;
          user_email?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      beta_feedback: {
        Row: {
          actual_behavior: string | null;
          affected_feature: string | null;
          assigned_to: string | null;
          attachments: string[] | null;
          category: string;
          clinic_id: string;
          created_at: string | null;
          description: string;
          expected_behavior: string | null;
          id: string;
          priority: string;
          resolution: string | null;
          resolved_at: string | null;
          severity: string;
          status: string;
          steps_to_reproduce: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
          user_name: string;
        };
        Insert: {
          actual_behavior?: string | null;
          affected_feature?: string | null;
          assigned_to?: string | null;
          attachments?: string[] | null;
          category: string;
          clinic_id: string;
          created_at?: string | null;
          description: string;
          expected_behavior?: string | null;
          id?: string;
          priority?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          severity: string;
          status?: string;
          steps_to_reproduce?: string | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
          user_name: string;
        };
        Update: {
          actual_behavior?: string | null;
          affected_feature?: string | null;
          assigned_to?: string | null;
          attachments?: string[] | null;
          category?: string;
          clinic_id?: string;
          created_at?: string | null;
          description?: string;
          expected_behavior?: string | null;
          id?: string;
          priority?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          severity?: string;
          status?: string;
          steps_to_reproduce?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
          user_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'beta_feedback_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      beta_usage_metrics: {
        Row: {
          average_load_time: number;
          average_session_duration: number;
          clinic_id: string;
          created_at: string | null;
          daily_active_rate: number;
          daily_report_completion_rate: number;
          daily_report_submissions: number;
          dashboard_view_count: number;
          data_accuracy: number;
          error_rate: number;
          feature_adoption_rate: Json;
          id: string;
          login_count: number;
          patient_analysis_view_count: number;
          period_end: string;
          period_start: string;
          unique_users: number;
          updated_at: string | null;
        };
        Insert: {
          average_load_time?: number;
          average_session_duration?: number;
          clinic_id: string;
          created_at?: string | null;
          daily_active_rate?: number;
          daily_report_completion_rate?: number;
          daily_report_submissions?: number;
          dashboard_view_count?: number;
          data_accuracy?: number;
          error_rate?: number;
          feature_adoption_rate?: Json;
          id?: string;
          login_count?: number;
          patient_analysis_view_count?: number;
          period_end: string;
          period_start: string;
          unique_users?: number;
          updated_at?: string | null;
        };
        Update: {
          average_load_time?: number;
          average_session_duration?: number;
          clinic_id?: string;
          created_at?: string | null;
          daily_active_rate?: number;
          daily_report_completion_rate?: number;
          daily_report_submissions?: number;
          dashboard_view_count?: number;
          data_accuracy?: number;
          error_rate?: number;
          feature_adoption_rate?: Json;
          id?: string;
          login_count?: number;
          patient_analysis_view_count?: number;
          period_end?: string;
          period_start?: string;
          unique_users?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'beta_usage_metrics_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          block_type: string | null;
          clinic_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          end_time: string;
          id: string;
          is_active: boolean | null;
          is_deleted: boolean | null;
          reason: string | null;
          recurrence_end_date: string | null;
          recurrence_rule: string | null;
          resource_id: string;
          start_time: string;
          updated_at: string;
        };
        Insert: {
          block_type?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          end_time: string;
          id?: string;
          is_active?: boolean | null;
          is_deleted?: boolean | null;
          reason?: string | null;
          recurrence_end_date?: string | null;
          recurrence_rule?: string | null;
          resource_id: string;
          start_time: string;
          updated_at?: string;
        };
        Update: {
          block_type?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          end_time?: string;
          id?: string;
          is_active?: boolean | null;
          is_deleted?: boolean | null;
          reason?: string | null;
          recurrence_end_date?: string | null;
          recurrence_rule?: string | null;
          resource_id?: string;
          start_time?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_resource_id_fkey';
            columns: ['resource_id'];
            isOneToOne: false;
            referencedRelation: 'staff_performance_summary';
            referencedColumns: ['staff_id'];
          },
        ];
      };
      chat_messages: {
        Row: {
          created_at: string | null;
          id: string;
          message_text: string;
          response_data: Json | null;
          sender: string;
          sent_at: string | null;
          session_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          message_text: string;
          response_data?: Json | null;
          sender: string;
          sent_at?: string | null;
          session_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          message_text?: string;
          response_data?: Json | null;
          sender?: string;
          sent_at?: string | null;
          session_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'chat_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_sessions: {
        Row: {
          clinic_id: string | null;
          context_data: Json | null;
          created_at: string | null;
          id: string;
          is_admin_session: boolean | null;
          session_end_time: string | null;
          session_start_time: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          clinic_id?: string | null;
          context_data?: Json | null;
          created_at?: string | null;
          id?: string;
          is_admin_session?: boolean | null;
          session_end_time?: string | null;
          session_start_time?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          clinic_id?: string | null;
          context_data?: Json | null;
          created_at?: string | null;
          id?: string;
          is_admin_session?: boolean | null;
          session_end_time?: string | null;
          session_start_time?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_sessions_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'user_permissions';
            referencedColumns: ['id'];
          },
        ];
      };
      clinic_settings: {
        Row: {
          category: string;
          clinic_id: string;
          created_at: string;
          id: string;
          settings: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category: string;
          clinic_id: string;
          created_at?: string;
          id?: string;
          settings?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string;
          clinic_id?: string;
          created_at?: string;
          id?: string;
          settings?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'clinic_settings_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      clinics: {
        Row: {
          address: string | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          opening_date: string | null;
          phone_number: string | null;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          opening_date?: string | null;
          phone_number?: string | null;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          opening_date?: string | null;
          phone_number?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      critical_incidents: {
        Row: {
          acknowledged_at: string | null;
          affected_clinics: string[] | null;
          affected_users: number;
          assigned_team: string[] | null;
          category: string;
          created_at: string | null;
          description: string;
          detected_at: string;
          id: string;
          impact_description: string;
          incident_commander: string | null;
          mitigation_steps: string[] | null;
          prevention_measures: string[] | null;
          resolved_at: string | null;
          root_cause: string | null;
          severity: string;
          status: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          acknowledged_at?: string | null;
          affected_clinics?: string[] | null;
          affected_users?: number;
          assigned_team?: string[] | null;
          category: string;
          created_at?: string | null;
          description: string;
          detected_at?: string;
          id?: string;
          impact_description: string;
          incident_commander?: string | null;
          mitigation_steps?: string[] | null;
          prevention_measures?: string[] | null;
          resolved_at?: string | null;
          root_cause?: string | null;
          severity: string;
          status?: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          acknowledged_at?: string | null;
          affected_clinics?: string[] | null;
          affected_users?: number;
          assigned_team?: string[] | null;
          category?: string;
          created_at?: string | null;
          description?: string;
          detected_at?: string;
          id?: string;
          impact_description?: string;
          incident_commander?: string | null;
          mitigation_steps?: string[] | null;
          prevention_measures?: string[] | null;
          resolved_at?: string | null;
          root_cause?: string | null;
          severity?: string;
          status?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          clinic_id: string | null;
          consent_date: string | null;
          consent_marketing: boolean | null;
          consent_reminder: boolean | null;
          created_at: string;
          created_by: string | null;
          custom_attributes: Json | null;
          deleted_at: string | null;
          deleted_by: string | null;
          email: string | null;
          id: string;
          is_deleted: boolean | null;
          last_visit_date: string | null;
          lifetime_value: number | null;
          line_display_name: string | null;
          line_user_id: string | null;
          name: string;
          name_kana: string | null;
          notes: string | null;
          phone: string;
          segment: string | null;
          tags: string[] | null;
          total_revenue: number | null;
          total_visits: number | null;
          updated_at: string;
        };
        Insert: {
          clinic_id?: string | null;
          consent_date?: string | null;
          consent_marketing?: boolean | null;
          consent_reminder?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          custom_attributes?: Json | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          last_visit_date?: string | null;
          lifetime_value?: number | null;
          line_display_name?: string | null;
          line_user_id?: string | null;
          name: string;
          name_kana?: string | null;
          notes?: string | null;
          phone: string;
          segment?: string | null;
          tags?: string[] | null;
          total_revenue?: number | null;
          total_visits?: number | null;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string | null;
          consent_date?: string | null;
          consent_marketing?: boolean | null;
          consent_reminder?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          custom_attributes?: Json | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          last_visit_date?: string | null;
          lifetime_value?: number | null;
          line_display_name?: string | null;
          line_user_id?: string | null;
          name?: string;
          name_kana?: string | null;
          notes?: string | null;
          phone?: string;
          segment?: string | null;
          tags?: string[] | null;
          total_revenue?: number | null;
          total_visits?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_reports: {
        Row: {
          clinic_id: string | null;
          created_at: string | null;
          id: string;
          insurance_revenue: number | null;
          new_patients: number | null;
          private_revenue: number | null;
          report_date: string;
          report_text: string | null;
          staff_id: string | null;
          total_patients: number | null;
          total_revenue: number | null;
          updated_at: string | null;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          insurance_revenue?: number | null;
          new_patients?: number | null;
          private_revenue?: number | null;
          report_date: string;
          report_text?: string | null;
          staff_id?: string | null;
          total_patients?: number | null;
          total_revenue?: number | null;
          updated_at?: string | null;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          insurance_revenue?: number | null;
          new_patients?: number | null;
          private_revenue?: number | null;
          report_date?: string;
          report_text?: string | null;
          staff_id?: string | null;
          total_patients?: number | null;
          total_revenue?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_reports_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_reports_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      encryption_keys: {
        Row: {
          algorithm: string;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          key_name: string;
          rotated_at: string | null;
        };
        Insert: {
          algorithm?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          key_name: string;
          rotated_at?: string | null;
        };
        Update: {
          algorithm?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          key_name?: string;
          rotated_at?: string | null;
        };
        Relationships: [];
      };
      improvement_backlog: {
        Row: {
          affected_clinics: string[] | null;
          assigned_to: string | null;
          business_value: number;
          category: string;
          completed_at: string | null;
          created_at: string | null;
          created_by: string;
          description: string;
          estimated_effort: string;
          id: string;
          milestone: string | null;
          priority: string;
          related_feedback_ids: string[] | null;
          started_at: string | null;
          status: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          affected_clinics?: string[] | null;
          assigned_to?: string | null;
          business_value: number;
          category: string;
          completed_at?: string | null;
          created_at?: string | null;
          created_by: string;
          description: string;
          estimated_effort: string;
          id?: string;
          milestone?: string | null;
          priority: string;
          related_feedback_ids?: string[] | null;
          started_at?: string | null;
          status?: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          affected_clinics?: string[] | null;
          assigned_to?: string | null;
          business_value?: number;
          category?: string;
          completed_at?: string | null;
          created_at?: string | null;
          created_by?: string;
          description?: string;
          estimated_effort?: string;
          id?: string;
          milestone?: string | null;
          priority?: string;
          related_feedback_ids?: string[] | null;
          started_at?: string | null;
          status?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      master_categories: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      master_patient_types: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      master_payment_methods: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      menu_categories: {
        Row: {
          color_code: string | null;
          created_at: string;
          description: string | null;
          display_order: number | null;
          icon_name: string | null;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          color_code?: string | null;
          created_at?: string;
          description?: string | null;
          display_order?: number | null;
          icon_name?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          color_code?: string | null;
          created_at?: string;
          description?: string | null;
          display_order?: number | null;
          icon_name?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      menus: {
        Row: {
          body_parts: string[] | null;
          buffer_after_minutes: number | null;
          buffer_before_minutes: number | null;
          category: string | null;
          category_id: string | null;
          clinic_id: string | null;
          code: string | null;
          color: string | null;
          contraindications: string[] | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          display_order: number | null;
          duration_minutes: number;
          equipment_required: string[] | null;
          icon: string | null;
          id: string;
          insurance_points: number | null;
          insurance_type: string | null;
          is_active: boolean | null;
          is_deleted: boolean | null;
          is_insurance_applicable: boolean | null;
          is_public: boolean | null;
          max_concurrent: number | null;
          max_sessions_per_day: number | null;
          name: string;
          options: Json | null;
          price: number;
          required_qualifications: string[] | null;
          requires_device: string | null;
          requires_room: boolean | null;
          treatment_type: string | null;
          updated_at: string;
        };
        Insert: {
          body_parts?: string[] | null;
          buffer_after_minutes?: number | null;
          buffer_before_minutes?: number | null;
          category?: string | null;
          category_id?: string | null;
          clinic_id?: string | null;
          code?: string | null;
          color?: string | null;
          contraindications?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_minutes: number;
          equipment_required?: string[] | null;
          icon?: string | null;
          id?: string;
          insurance_points?: number | null;
          insurance_type?: string | null;
          is_active?: boolean | null;
          is_deleted?: boolean | null;
          is_insurance_applicable?: boolean | null;
          is_public?: boolean | null;
          max_concurrent?: number | null;
          max_sessions_per_day?: number | null;
          name: string;
          options?: Json | null;
          price: number;
          required_qualifications?: string[] | null;
          requires_device?: string | null;
          requires_room?: boolean | null;
          treatment_type?: string | null;
          updated_at?: string;
        };
        Update: {
          body_parts?: string[] | null;
          buffer_after_minutes?: number | null;
          buffer_before_minutes?: number | null;
          category?: string | null;
          category_id?: string | null;
          clinic_id?: string | null;
          code?: string | null;
          color?: string | null;
          contraindications?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          display_order?: number | null;
          duration_minutes?: number;
          equipment_required?: string[] | null;
          icon?: string | null;
          id?: string;
          insurance_points?: number | null;
          insurance_type?: string | null;
          is_active?: boolean | null;
          is_deleted?: boolean | null;
          is_insurance_applicable?: boolean | null;
          is_public?: boolean | null;
          max_concurrent?: number | null;
          max_sessions_per_day?: number | null;
          name?: string;
          options?: Json | null;
          price?: number;
          required_qualifications?: string[] | null;
          requires_device?: string | null;
          requires_room?: boolean | null;
          treatment_type?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'menus_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'menu_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'menus_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      mfa_setup_sessions: {
        Row: {
          backup_codes: Json;
          clinic_id: string;
          completed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          secret_key: string;
          user_id: string;
        };
        Insert: {
          backup_codes?: Json;
          clinic_id: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          secret_key: string;
          user_id: string;
        };
        Update: {
          backup_codes?: Json;
          clinic_id?: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          secret_key?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_mfa_setup_clinic';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      mfa_usage_stats: {
        Row: {
          backup_code_uses: number;
          clinic_id: string;
          created_at: string;
          id: string;
          mfa_enabled_users: number;
          period_end: string;
          period_start: string;
          total_users: number;
          totp_attempts: number;
          totp_successes: number;
        };
        Insert: {
          backup_code_uses?: number;
          clinic_id: string;
          created_at?: string;
          id?: string;
          mfa_enabled_users?: number;
          period_end: string;
          period_start: string;
          total_users?: number;
          totp_attempts?: number;
          totp_successes?: number;
        };
        Update: {
          backup_code_uses?: number;
          clinic_id?: string;
          created_at?: string;
          id?: string;
          mfa_enabled_users?: number;
          period_end?: string;
          period_start?: string;
          total_users?: number;
          totp_attempts?: number;
          totp_successes?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_mfa_stats_clinic';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          clinic_id: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          message: string;
          read_at: string | null;
          related_entity_id: string | null;
          related_entity_type: string | null;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message: string;
          read_at?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          title: string;
          type?: string;
          user_id?: string | null;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          read_at?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      onboarding_states: {
        Row: {
          clinic_id: string | null;
          completed_at: string | null;
          created_at: string;
          current_step: string;
          id: string;
          metadata: Json | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          clinic_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_step?: string;
          id?: string;
          metadata?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          clinic_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_step?: string;
          id?: string;
          metadata?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'onboarding_states_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      patients: {
        Row: {
          address: string | null;
          clinic_id: string | null;
          created_at: string | null;
          date_of_birth: string | null;
          gender: string | null;
          id: string;
          last_visit_date: string | null;
          name: string;
          phone_number: string | null;
          registration_date: string | null;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          clinic_id?: string | null;
          created_at?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          id?: string;
          last_visit_date?: string | null;
          name: string;
          phone_number?: string | null;
          registration_date?: string | null;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          clinic_id?: string | null;
          created_at?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          id?: string;
          last_visit_date?: string | null;
          name?: string;
          phone_number?: string | null;
          registration_date?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'patients_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          clinic_id: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          language_preference: string | null;
          last_login_at: string | null;
          phone_number: string | null;
          role: string;
          timezone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          is_active?: boolean;
          language_preference?: string | null;
          last_login_at?: string | null;
          phone_number?: string | null;
          role?: string;
          timezone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          language_preference?: string | null;
          last_login_at?: string | null;
          phone_number?: string | null;
          role?: string;
          timezone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      registered_devices: {
        Row: {
          auto_trust_after_days: number | null;
          blocked_at: string | null;
          blocked_reason: string | null;
          clinic_id: string;
          created_at: string;
          device_fingerprint: string;
          device_info: Json;
          device_name: string | null;
          id: string;
          last_ip_address: unknown;
          last_seen_at: string;
          trust_level: string;
          trusted_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auto_trust_after_days?: number | null;
          blocked_at?: string | null;
          blocked_reason?: string | null;
          clinic_id: string;
          created_at?: string;
          device_fingerprint: string;
          device_info?: Json;
          device_name?: string | null;
          id?: string;
          last_ip_address?: unknown;
          last_seen_at?: string;
          trust_level?: string;
          trusted_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auto_trust_after_days?: number | null;
          blocked_at?: string | null;
          blocked_reason?: string | null;
          clinic_id?: string;
          created_at?: string;
          device_fingerprint?: string;
          device_info?: Json;
          device_name?: string | null;
          id?: string;
          last_ip_address?: unknown;
          last_seen_at?: string;
          trust_level?: string;
          trusted_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registered_devices_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      reservation_history: {
        Row: {
          action: string;
          change_reason: string | null;
          clinic_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          ip_address: unknown;
          new_value: Json | null;
          old_value: Json | null;
          reservation_id: string;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          change_reason?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          ip_address?: unknown;
          new_value?: Json | null;
          old_value?: Json | null;
          reservation_id: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          change_reason?: string | null;
          clinic_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          ip_address?: unknown;
          new_value?: Json | null;
          old_value?: Json | null;
          reservation_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reservation_history_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservation_history_reservation_id_fkey';
            columns: ['reservation_id'];
            isOneToOne: false;
            referencedRelation: 'reservation_list_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservation_history_reservation_id_fkey';
            columns: ['reservation_id'];
            isOneToOne: false;
            referencedRelation: 'reservations';
            referencedColumns: ['id'];
          },
        ];
      };
      reservations: {
        Row: {
          actual_price: number | null;
          booker_name: string | null;
          booker_phone: string | null;
          cancellation_reason: string | null;
          channel: string;
          clinic_id: string | null;
          confirmation_sent: boolean | null;
          confirmation_sent_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string;
          deleted_at: string | null;
          deleted_by: string | null;
          end_time: string;
          id: string;
          is_deleted: boolean | null;
          is_recurring: boolean | null;
          menu_id: string;
          no_show_reason: string | null;
          notes: string | null;
          payment_status: string | null;
          price: number | null;
          recurrence_parent_id: string | null;
          reminder_sent: boolean | null;
          reminder_sent_at: string | null;
          reservation_group_id: string | null;
          selected_options: Json | null;
          staff_id: string;
          start_time: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          actual_price?: number | null;
          booker_name?: string | null;
          booker_phone?: string | null;
          cancellation_reason?: string | null;
          channel?: string;
          clinic_id?: string | null;
          confirmation_sent?: boolean | null;
          confirmation_sent_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          end_time: string;
          id?: string;
          is_deleted?: boolean | null;
          is_recurring?: boolean | null;
          menu_id: string;
          no_show_reason?: string | null;
          notes?: string | null;
          payment_status?: string | null;
          price?: number | null;
          recurrence_parent_id?: string | null;
          reminder_sent?: boolean | null;
          reminder_sent_at?: string | null;
          reservation_group_id?: string | null;
          selected_options?: Json | null;
          staff_id: string;
          start_time: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          actual_price?: number | null;
          booker_name?: string | null;
          booker_phone?: string | null;
          cancellation_reason?: string | null;
          channel?: string;
          clinic_id?: string | null;
          confirmation_sent?: boolean | null;
          confirmation_sent_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          end_time?: string;
          id?: string;
          is_deleted?: boolean | null;
          is_recurring?: boolean | null;
          menu_id?: string;
          no_show_reason?: string | null;
          notes?: string | null;
          payment_status?: string | null;
          price?: number | null;
          recurrence_parent_id?: string | null;
          reminder_sent?: boolean | null;
          reminder_sent_at?: string | null;
          reservation_group_id?: string | null;
          selected_options?: Json | null;
          staff_id?: string;
          start_time?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reservations_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'patient_visit_summary';
            referencedColumns: ['patient_id'];
          },
          {
            foreignKeyName: 'reservations_menu_id_fkey';
            columns: ['menu_id'];
            isOneToOne: false;
            referencedRelation: 'menus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_performance_summary';
            referencedColumns: ['staff_id'];
          },
        ];
      };
      resources: {
        Row: {
          clinic_id: string | null;
          color: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          display_order: number | null;
          email: string | null;
          id: string;
          is_active: boolean | null;
          is_bookable: boolean | null;
          is_deleted: boolean | null;
          max_concurrent: number | null;
          name: string;
          phone: string | null;
          qualifications: string[] | null;
          specialties: string[] | null;
          staff_code: string | null;
          supported_menus: string[] | null;
          type: string;
          updated_at: string;
          working_hours: Json;
        };
        Insert: {
          clinic_id?: string | null;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          display_order?: number | null;
          email?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_bookable?: boolean | null;
          is_deleted?: boolean | null;
          max_concurrent?: number | null;
          name: string;
          phone?: string | null;
          qualifications?: string[] | null;
          specialties?: string[] | null;
          staff_code?: string | null;
          supported_menus?: string[] | null;
          type: string;
          updated_at?: string;
          working_hours?: Json;
        };
        Update: {
          clinic_id?: string | null;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          display_order?: number | null;
          email?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_bookable?: boolean | null;
          is_deleted?: boolean | null;
          max_concurrent?: number | null;
          name?: string;
          phone?: string | null;
          qualifications?: string[] | null;
          specialties?: string[] | null;
          staff_code?: string | null;
          supported_menus?: string[] | null;
          type?: string;
          updated_at?: string;
          working_hours?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'resources_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      revenues: {
        Row: {
          amount: number;
          category_id: string | null;
          clinic_id: string | null;
          created_at: string | null;
          id: string;
          insurance_revenue: number | null;
          menu_id: string | null;
          patient_id: string | null;
          patient_type_id: string | null;
          payment_method_id: string | null;
          private_revenue: number | null;
          revenue_date: string;
          treatment_menu_id: string | null;
          updated_at: string | null;
          visit_id: string | null;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          insurance_revenue?: number | null;
          menu_id?: string | null;
          patient_id?: string | null;
          patient_type_id?: string | null;
          payment_method_id?: string | null;
          private_revenue?: number | null;
          revenue_date: string;
          treatment_menu_id?: string | null;
          updated_at?: string | null;
          visit_id?: string | null;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          insurance_revenue?: number | null;
          menu_id?: string | null;
          patient_id?: string | null;
          patient_type_id?: string | null;
          payment_method_id?: string | null;
          private_revenue?: number | null;
          revenue_date?: string;
          treatment_menu_id?: string | null;
          updated_at?: string | null;
          visit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'revenues_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'master_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'revenues_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'revenues_menu_id_fkey';
            columns: ['menu_id'];
            isOneToOne: false;
            referencedRelation: 'menus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'revenues_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'revenues_patient_type_id_fkey';
            columns: ['patient_type_id'];
            isOneToOne: false;
            referencedRelation: 'master_patient_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'revenues_payment_method_id_fkey';
            columns: ['payment_method_id'];
            isOneToOne: false;
            referencedRelation: 'master_payment_methods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'revenues_visit_id_fkey';
            columns: ['visit_id'];
            isOneToOne: false;
            referencedRelation: 'visits';
            referencedColumns: ['id'];
          },
        ];
      };
      security_events: {
        Row: {
          actions_taken: Json | null;
          assigned_to: string | null;
          clinic_id: string | null;
          correlation_id: string | null;
          created_at: string;
          event_category: string;
          event_data: Json;
          event_description: string;
          event_type: string;
          geolocation: Json | null;
          id: string;
          ip_address: unknown;
          resolution_notes: string | null;
          resolved_at: string | null;
          session_id: string | null;
          severity_level: string;
          source_component: string | null;
          status: string;
          updated_at: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          actions_taken?: Json | null;
          assigned_to?: string | null;
          clinic_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          event_category: string;
          event_data?: Json;
          event_description: string;
          event_type: string;
          geolocation?: Json | null;
          id?: string;
          ip_address?: unknown;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          session_id?: string | null;
          severity_level?: string;
          source_component?: string | null;
          status?: string;
          updated_at?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          actions_taken?: Json | null;
          assigned_to?: string | null;
          clinic_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          event_category?: string;
          event_data?: Json;
          event_description?: string;
          event_type?: string;
          geolocation?: Json | null;
          id?: string;
          ip_address?: unknown;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          session_id?: string | null;
          severity_level?: string;
          source_component?: string | null;
          status?: string;
          updated_at?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'security_events_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'security_events_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'user_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      session_policies: {
        Row: {
          allowed_ip_ranges: unknown[] | null;
          block_concurrent_different_ips: boolean;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          effective_until: string | null;
          id: string;
          is_active: boolean;
          max_concurrent_sessions: number;
          max_devices_per_user: number;
          max_idle_minutes: number;
          max_session_hours: number;
          notify_new_device_login: boolean;
          notify_suspicious_activity: boolean;
          remember_device_days: number;
          require_device_registration: boolean;
          require_ip_whitelist: boolean;
          role: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          allowed_ip_ranges?: unknown[] | null;
          block_concurrent_different_ips?: boolean;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          is_active?: boolean;
          max_concurrent_sessions?: number;
          max_devices_per_user?: number;
          max_idle_minutes?: number;
          max_session_hours?: number;
          notify_new_device_login?: boolean;
          notify_suspicious_activity?: boolean;
          remember_device_days?: number;
          require_device_registration?: boolean;
          require_ip_whitelist?: boolean;
          role?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          allowed_ip_ranges?: unknown[] | null;
          block_concurrent_different_ips?: boolean;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          is_active?: boolean;
          max_concurrent_sessions?: number;
          max_devices_per_user?: number;
          max_idle_minutes?: number;
          max_session_hours?: number;
          notify_new_device_login?: boolean;
          notify_suspicious_activity?: boolean;
          remember_device_days?: number;
          require_device_registration?: boolean;
          require_ip_whitelist?: boolean;
          role?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'session_policies_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      staff: {
        Row: {
          clinic_id: string | null;
          created_at: string | null;
          email: string;
          hire_date: string | null;
          id: string;
          is_therapist: boolean | null;
          name: string;
          password_hash: string;
          role: string;
          updated_at: string | null;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string | null;
          email: string;
          hire_date?: string | null;
          id?: string;
          is_therapist?: boolean | null;
          name: string;
          password_hash: string;
          role: string;
          updated_at?: string | null;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string | null;
          email?: string;
          hire_date?: string | null;
          id?: string;
          is_therapist?: boolean | null;
          name?: string;
          password_hash?: string;
          role?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          clinic_id: string;
          created_at: string;
          created_by: string;
          email: string;
          expires_at: string;
          id: string;
          role: string;
          token: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          clinic_id: string;
          created_at?: string;
          created_by: string;
          email: string;
          expires_at?: string;
          id?: string;
          role?: string;
          token?: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          clinic_id?: string;
          created_at?: string;
          created_by?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          role?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_invites_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_performance: {
        Row: {
          clinic_id: string | null;
          created_at: string | null;
          id: string;
          notes: string | null;
          patient_count: number | null;
          performance_date: string;
          revenue_generated: number | null;
          satisfaction_score: number | null;
          staff_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          patient_count?: number | null;
          performance_date: string;
          revenue_generated?: number | null;
          satisfaction_score?: number | null;
          staff_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          patient_count?: number | null;
          performance_date?: string;
          revenue_generated?: number | null;
          satisfaction_score?: number | null;
          staff_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_performance_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_performance_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_preferences: {
        Row: {
          clinic_id: string;
          created_at: string;
          id: string;
          is_active: boolean | null;
          preference_text: string;
          preference_type: string | null;
          priority: number | null;
          staff_id: string;
          updated_at: string;
          valid_from: string | null;
          valid_until: string | null;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          preference_text: string;
          preference_type?: string | null;
          priority?: number | null;
          staff_id: string;
          updated_at?: string;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          preference_text?: string;
          preference_type?: string | null;
          priority?: number | null;
          staff_id?: string;
          updated_at?: string;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_preferences_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_preferences_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_preferences_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_performance_summary';
            referencedColumns: ['staff_id'];
          },
        ];
      };
      staff_shifts: {
        Row: {
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          end_time: string;
          id: string;
          notes: string | null;
          staff_id: string;
          start_time: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          end_time: string;
          id?: string;
          notes?: string | null;
          staff_id: string;
          start_time: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          end_time?: string;
          id?: string;
          notes?: string | null;
          staff_id?: string;
          start_time?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_shifts_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_shifts_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_shifts_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_performance_summary';
            referencedColumns: ['staff_id'];
          },
        ];
      };
      treatment_menu_records: {
        Row: {
          created_at: string;
          duration_minutes: number | null;
          id: string;
          insurance_coverage_amount: number | null;
          insurance_points: number | null;
          menu_id: string;
          notes: string | null;
          patient_payment_amount: number | null;
          performed_by: string | null;
          quantity: number;
          total_price: number;
          treatment_id: string;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          duration_minutes?: number | null;
          id?: string;
          insurance_coverage_amount?: number | null;
          insurance_points?: number | null;
          menu_id: string;
          notes?: string | null;
          patient_payment_amount?: number | null;
          performed_by?: string | null;
          quantity?: number;
          total_price: number;
          treatment_id: string;
          unit_price: number;
        };
        Update: {
          created_at?: string;
          duration_minutes?: number | null;
          id?: string;
          insurance_coverage_amount?: number | null;
          insurance_points?: number | null;
          menu_id?: string;
          notes?: string | null;
          patient_payment_amount?: number | null;
          performed_by?: string | null;
          quantity?: number;
          total_price?: number;
          treatment_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'treatment_menu_records_menu_id_fkey';
            columns: ['menu_id'];
            isOneToOne: false;
            referencedRelation: 'menus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'treatment_menu_records_performed_by_fkey';
            columns: ['performed_by'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'treatment_menu_records_treatment_id_fkey';
            columns: ['treatment_id'];
            isOneToOne: false;
            referencedRelation: 'treatments';
            referencedColumns: ['id'];
          },
        ];
      };
      treatments: {
        Row: {
          appointment_id: string | null;
          clinic_id: string;
          created_at: string;
          end_time: string | null;
          id: string;
          patient_id: string;
          primary_staff_id: string;
          start_time: string;
          status: string;
          treatment_date: string;
          updated_at: string;
        };
        Insert: {
          appointment_id?: string | null;
          clinic_id: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          patient_id: string;
          primary_staff_id: string;
          start_time: string;
          status?: string;
          treatment_date: string;
          updated_at?: string;
        };
        Update: {
          appointment_id?: string | null;
          clinic_id?: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          patient_id?: string;
          primary_staff_id?: string;
          start_time?: string;
          status?: string;
          treatment_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'treatments_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: true;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'treatments_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'treatments_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'treatments_primary_staff_id_fkey';
            columns: ['primary_staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      user_mfa_settings: {
        Row: {
          backup_codes: Json | null;
          backup_codes_regenerated_at: string | null;
          clinic_id: string;
          created_at: string;
          disabled_at: string | null;
          disabled_by: string | null;
          id: string;
          is_enabled: boolean;
          last_used_at: string | null;
          secret_key: string;
          setup_completed_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          backup_codes?: Json | null;
          backup_codes_regenerated_at?: string | null;
          clinic_id: string;
          created_at?: string;
          disabled_at?: string | null;
          disabled_by?: string | null;
          id?: string;
          is_enabled?: boolean;
          last_used_at?: string | null;
          secret_key: string;
          setup_completed_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          backup_codes?: Json | null;
          backup_codes_regenerated_at?: string | null;
          clinic_id?: string;
          created_at?: string;
          disabled_at?: string | null;
          disabled_by?: string | null;
          id?: string;
          is_enabled?: boolean;
          last_used_at?: string | null;
          secret_key?: string;
          setup_completed_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_mfa_clinic';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      user_permissions: {
        Row: {
          clinic_id: string | null;
          created_at: string | null;
          hashed_password: string;
          id: string;
          last_login_at: string | null;
          role: string;
          staff_id: string | null;
          updated_at: string | null;
          username: string;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string | null;
          hashed_password: string;
          id?: string;
          last_login_at?: string | null;
          role: string;
          staff_id?: string | null;
          updated_at?: string | null;
          username: string;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string | null;
          hashed_password?: string;
          id?: string;
          last_login_at?: string | null;
          role?: string;
          staff_id?: string | null;
          updated_at?: string | null;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_permissions_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_permissions_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: true;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
      user_sessions: {
        Row: {
          absolute_timeout_at: string | null;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          device_info: Json;
          expires_at: string;
          geolocation: Json | null;
          id: string;
          idle_timeout_at: string | null;
          ip_address: unknown;
          is_active: boolean;
          is_revoked: boolean;
          last_activity: string;
          max_idle_minutes: number;
          max_session_hours: number;
          refresh_token_id: string | null;
          remember_device: boolean;
          revoked_at: string | null;
          revoked_by: string | null;
          revoked_reason: string | null;
          session_token: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          absolute_timeout_at?: string | null;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          device_info?: Json;
          expires_at: string;
          geolocation?: Json | null;
          id?: string;
          idle_timeout_at?: string | null;
          ip_address?: unknown;
          is_active?: boolean;
          is_revoked?: boolean;
          last_activity?: string;
          max_idle_minutes?: number;
          max_session_hours?: number;
          refresh_token_id?: string | null;
          remember_device?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          session_token: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          absolute_timeout_at?: string | null;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          device_info?: Json;
          expires_at?: string;
          geolocation?: Json | null;
          id?: string;
          idle_timeout_at?: string | null;
          ip_address?: unknown;
          is_active?: boolean;
          is_revoked?: boolean;
          last_activity?: string;
          max_idle_minutes?: number;
          max_session_hours?: number;
          refresh_token_id?: string | null;
          remember_device?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          session_token?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sessions_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      visits: {
        Row: {
          clinic_id: string | null;
          created_at: string | null;
          id: string;
          notes: string | null;
          patient_id: string | null;
          therapist_id: string | null;
          updated_at: string | null;
          visit_date: string;
        };
        Insert: {
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          patient_id?: string | null;
          therapist_id?: string | null;
          updated_at?: string | null;
          visit_date: string;
        };
        Update: {
          clinic_id?: string | null;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          patient_id?: string | null;
          therapist_id?: string | null;
          updated_at?: string | null;
          visit_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visits_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visits_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visits_therapist_id_fkey';
            columns: ['therapist_id'];
            isOneToOne: false;
            referencedRelation: 'staff';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      daily_reservation_stats: {
        Row: {
          avg_duration_minutes: number | null;
          cancelled_count: number | null;
          completed_count: number | null;
          no_show_count: number | null;
          reservation_date: string | null;
          staff_id: string | null;
          total_reservations: number | null;
          total_revenue: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reservations_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_performance_summary';
            referencedColumns: ['staff_id'];
          },
        ];
      };
      daily_revenue_summary: {
        Row: {
          average_transaction_amount: number | null;
          clinic_id: string | null;
          clinic_name: string | null;
          insurance_revenue: number | null;
          private_revenue: number | null;
          revenue_date: string | null;
          total_revenue: number | null;
          total_transactions: number | null;
          unique_patients: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reservations_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      patient_visit_summary: {
        Row: {
          average_revenue_per_visit: number | null;
          clinic_id: string | null;
          first_visit_date: string | null;
          last_visit_date: string | null;
          patient_id: string | null;
          patient_name: string | null;
          total_revenue: number | null;
          treatment_period_days: number | null;
          visit_category: string | null;
          visit_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
      reservation_list_view: {
        Row: {
          actual_price: number | null;
          channel: string | null;
          clinic_id: string | null;
          created_at: string | null;
          created_by: string | null;
          customer_email: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          duration_minutes: number | null;
          end_time: string | null;
          id: string | null;
          menu_id: string | null;
          menu_name: string | null;
          menu_price: number | null;
          notes: string | null;
          payment_status: string | null;
          price: number | null;
          reservation_group_id: string | null;
          resource_type: string | null;
          selected_options: Json | null;
          staff_id: string | null;
          staff_name: string | null;
          start_time: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reservations_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'patient_visit_summary';
            referencedColumns: ['patient_id'];
          },
          {
            foreignKeyName: 'reservations_menu_id_fkey';
            columns: ['menu_id'];
            isOneToOne: false;
            referencedRelation: 'menus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'resources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_performance_summary';
            referencedColumns: ['staff_id'];
          },
        ];
      };
      staff_performance_summary: {
        Row: {
          average_satisfaction_score: number | null;
          clinic_id: string | null;
          role: string | null;
          staff_id: string | null;
          staff_name: string | null;
          total_revenue_generated: number | null;
          total_visits: number | null;
          unique_patients: number | null;
          working_days: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'resources_clinic_id_fkey';
            columns: ['clinic_id'];
            isOneToOne: false;
            referencedRelation: 'clinics';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      accept_invite: { Args: { invite_token: string }; Returns: Json };
      aggregate_mfa_stats: {
        Args: { p_clinic_id: string; p_end_date: string; p_start_date: string };
        Returns: undefined;
      };
      analyze_patient_segments: {
        Args: { clinic_uuid: string };
        Returns: {
          avg_ltv: number;
          patient_count: number;
          segment_type: string;
          segment_value: string;
          total_revenue: number;
        }[];
      };
      analyze_staff_efficiency: {
        Args: { analysis_period?: number; clinic_uuid: string };
        Returns: {
          efficiency_score: number;
          patients_per_day: number;
          revenue_per_hour: number;
          satisfaction_trend: string;
          staff_id: string;
          staff_name: string;
        }[];
      };
      belongs_to_clinic: {
        Args: { target_clinic_id: string };
        Returns: boolean;
      };
      calculate_churn_risk_score: {
        Args: { patient_uuid: string };
        Returns: number;
      };
      calculate_patient_ltv: {
        Args: { patient_uuid: string };
        Returns: number;
      };
      check_reservation_conflict: {
        Args: {
          p_end_time: string;
          p_exclude_reservation_id?: string;
          p_staff_id: string;
          p_start_time: string;
        };
        Returns: {
          conflict_reason: string;
          conflict_type: string;
          conflicting_reservation_id: string;
          has_conflict: boolean;
        }[];
      };
      create_clinic_with_admin: {
        Args: {
          p_address?: string;
          p_name: string;
          p_opening_date?: string;
          p_phone_number?: string;
        };
        Returns: Json;
      };
      decrypt_mfa_secret: { Args: { encrypted_text: string }; Returns: string };
      decrypt_patient_data: {
        Args: { encrypted_text: string };
        Returns: string;
      };
      encrypt_mfa_secret: { Args: { secret_text: string }; Returns: string };
      encrypt_patient_data: { Args: { plain_text: string }; Returns: string };
      get_available_time_slots: {
        Args: {
          p_date: string;
          p_duration_minutes: number;
          p_slot_interval_minutes?: number;
          p_staff_id: string;
        };
        Returns: {
          conflict_reason: string;
          is_available: boolean;
          time_slot: string;
        }[];
      };
      get_clinic_settings: {
        Args: { p_category: string; p_clinic_id: string };
        Returns: Json;
      };
      get_current_clinic_id: { Args: never; Returns: string };
      get_current_role: { Args: never; Returns: string };
      get_hourly_revenue_pattern: {
        Args: { clinic_uuid: string };
        Returns: {
          avg_transaction_amount: number;
          hour_of_day: number;
          total_revenue: number;
          transaction_count: number;
        }[];
      };
      get_hourly_visit_pattern: {
        Args: { clinic_uuid: string };
        Returns: {
          avg_revenue: number;
          day_of_week: number;
          hour_of_day: number;
          visit_count: number;
        }[];
      };
      get_invite_by_token: {
        Args: { invite_token: string };
        Returns: {
          accepted_at: string;
          clinic_id: string;
          clinic_name: string;
          email: string;
          expires_at: string;
          id: string;
          role: string;
        }[];
      };
      is_admin: { Args: never; Returns: boolean };
      predict_revenue: {
        Args: { clinic_uuid: string; forecast_days?: number };
        Returns: {
          confidence_level: string;
          forecast_date: string;
          predicted_revenue: number;
        }[];
      };
      refresh_daily_stats: { Args: never; Returns: undefined };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      upsert_clinic_settings: {
        Args: {
          p_category: string;
          p_clinic_id: string;
          p_settings: Json;
          p_user_id: string;
        };
        Returns: Json;
      };
      user_role: { Args: never; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
