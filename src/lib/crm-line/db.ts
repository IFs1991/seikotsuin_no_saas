import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClientForDatabase } from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';

export type PatientIdentityAliasRow = {
  id: string;
  clinic_id: string;
  customer_id: string;
  alias: string;
  normalized_alias: string;
  alias_type: 'name' | 'phonetic_name' | 'other';
  source: 'manual' | 'line_profile' | 'import';
  created_at: string;
  updated_at: string;
};

export type PatientStaffPreferenceRow = {
  id: string;
  clinic_id: string;
  customer_id: string;
  staff_id: string;
  notification_enabled: boolean;
  registered_at: string;
  updated_at: string;
};

export type StaffAvailabilityEventRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  available_datetime: string;
  reward_type: 'priority_booking' | 'points' | 'self_care' | 'option';
  status: 'open' | 'notified' | 'booked' | 'expired' | 'cancelled';
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffAvailabilityNotificationRow = {
  id: string;
  clinic_id: string;
  availability_event_id: string;
  customer_id: string;
  line_user_id: string;
  status: 'pending' | 'sent' | 'failed' | 'booked';
  line_outbox_id: string | null;
  booked_reservation_id: string | null;
  sent_at: string | null;
  booked_at: string | null;
  created_at: string;
};

export type ReservationRewardRow = {
  id: string;
  clinic_id: string;
  reservation_id: string;
  reward_type: 'priority_booking' | 'points' | 'self_care' | 'option';
  status: 'pending' | 'issued' | 'redeemed' | 'void';
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type CrmFunctions = {
  create_staff_availability_event: {
    Args: {
      p_available_datetime: string;
      p_clinic_id: string;
      p_created_by: string | null;
      p_event_id: string;
      p_recipients: Json;
      p_reward_type: StaffAvailabilityEventRow['reward_type'];
      p_staff_id: string;
    };
    Returns: Array<
      StaffAvailabilityEventRow & {
        recipient_count: number;
      }
    >;
  };
  create_staff_availability_reservation: {
    Args: {
      p_campaign_id: string | null;
      p_channel: 'line';
      p_clinic_id: string;
      p_customer_id: string;
      p_end_time: string;
      p_event_id: string;
      p_intake_responses: Json;
      p_is_staff_requested: boolean;
      p_line_user_id: string;
      p_menu_id: string;
      p_notes: string | null;
      p_staff_id: string;
      p_start_time: string;
    };
    Returns: Array<{
      end_time: string;
      id: string;
      start_time: string;
      status: string;
      updated_at: string;
    }>;
  };
  finalize_staff_availability_delivery: {
    Args: {
      p_clinic_id: string;
      p_last_error: string | null;
      p_notification_id: string;
      p_outbox_id: string;
      p_sent_at: string | null;
      p_status: 'sent' | 'failed';
    };
    Returns: undefined;
  };
};

type PublicDatabase = Database['public'];

export type CrmDatabase = Omit<Database, 'public'> & {
  public: Omit<PublicDatabase, 'Functions'> & {
    Functions: Omit<PublicDatabase['Functions'], keyof CrmFunctions> &
      CrmFunctions;
  };
};

export type CrmSupabaseClient = SupabaseClient<CrmDatabase>;

export function createCrmAdminClient(): CrmSupabaseClient {
  return createAdminClientForDatabase<CrmDatabase>();
}
