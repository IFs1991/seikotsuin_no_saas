import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAdminClientForDatabase,
  type SupabaseServerClient,
} from '@/lib/supabase';
import type { Database, Json } from '@/types/supabase';

type GeneratedTables = Database['public']['Tables'];
type GeneratedLineCredentials = GeneratedTables['clinic_line_credentials'];
type GeneratedFeatureFlags = GeneratedTables['clinic_feature_flags'];
type GeneratedCustomers = GeneratedTables['customers'];
type GeneratedLineMessageOutbox = GeneratedTables['line_message_outbox'];

export type LineAppType = 'mini_app' | 'liff';
export type LineSetupStatus =
  | 'prepared'
  | 'verified'
  | 'consumed'
  | 'expired'
  | 'revoked';
export type LineConversationStatus = 'open' | 'closed';
export type LineMessageDirection = 'inbound' | 'outbound' | 'system';
export type LineMessageType = 'text' | 'unsupported';
export type LineMessageStatus =
  | 'received'
  | 'queued'
  | 'sent'
  | 'failed'
  | 'unsent';

export type LineCredentialsRow = GeneratedLineCredentials['Row'] & {
  access_token_key_id: string | null;
  app_endpoint_id: string | null;
  app_type: LineAppType;
  bot_display_name: string | null;
  bot_picture_url: string | null;
  bot_user_id: string | null;
  credential_fingerprint: string | null;
  credential_generation_id: string;
  credentials_verified_at: string | null;
  last_metadata_verified_at: string | null;
  last_push_test_error: string | null;
  last_push_test_sent_at: string | null;
  last_token_test_error: string | null;
  last_token_verified_at: string | null;
  last_webhook_received_at: string | null;
  setup_completed_at: string | null;
  webhook_verified_at: string | null;
};

export type LineCredentialsInsert = GeneratedLineCredentials['Insert'] &
  Partial<
    Pick<
      LineCredentialsRow,
      | 'access_token_key_id'
      | 'app_endpoint_id'
      | 'app_type'
      | 'bot_display_name'
      | 'bot_picture_url'
      | 'bot_user_id'
      | 'credential_fingerprint'
      | 'credential_generation_id'
      | 'credentials_verified_at'
      | 'last_metadata_verified_at'
      | 'last_push_test_error'
      | 'last_push_test_sent_at'
      | 'last_token_test_error'
      | 'last_token_verified_at'
      | 'last_webhook_received_at'
      | 'setup_completed_at'
      | 'webhook_verified_at'
    >
  >;

export type LineCredentialsUpdate = GeneratedLineCredentials['Update'] &
  Partial<
    Pick<
      LineCredentialsRow,
      | 'access_token_key_id'
      | 'app_endpoint_id'
      | 'app_type'
      | 'bot_display_name'
      | 'bot_picture_url'
      | 'bot_user_id'
      | 'credential_fingerprint'
      | 'credential_generation_id'
      | 'credentials_verified_at'
      | 'last_metadata_verified_at'
      | 'last_push_test_error'
      | 'last_push_test_sent_at'
      | 'last_token_test_error'
      | 'last_token_verified_at'
      | 'last_webhook_received_at'
      | 'setup_completed_at'
      | 'webhook_verified_at'
    >
  >;

export type LineFeatureFlagsRow = GeneratedFeatureFlags['Row'] & {
  line_chat_enabled: boolean;
  line_notification_enabled: boolean;
};

export type LineFeatureFlagsInsert = GeneratedFeatureFlags['Insert'] & {
  line_chat_enabled?: boolean;
  line_notification_enabled?: boolean;
};

export type LineFeatureFlagsUpdate = GeneratedFeatureFlags['Update'] & {
  line_chat_enabled?: boolean;
  line_notification_enabled?: boolean;
};

export type LineCustomerRow = GeneratedCustomers['Row'] & {
  line_credential_generation_id: string | null;
};

export type LineCustomerInsert = GeneratedCustomers['Insert'] & {
  line_credential_generation_id?: string | null;
};

export type LineCustomerUpdate = GeneratedCustomers['Update'] & {
  line_credential_generation_id?: string | null;
};

export type LineSetupSessionRow = {
  clinic_id: string;
  consumed_at: string | null;
  created_at: string;
  created_by: string;
  credential_fingerprint: string;
  encrypted_private_jwk: string | null;
  expires_at: string;
  id: string;
  public_jwk: Json;
  public_key_kid: string | null;
  status: LineSetupStatus;
  updated_at: string;
  verified_at: string | null;
};

export type LineCredentialGenerationRow = {
  clinic_id: string;
  created_at: string;
  id: string;
  replaced_at: string | null;
  status: 'active' | 'replaced' | 'revoked';
};

export type LineSetupSessionInsert = {
  clinic_id: string;
  created_by: string;
  credential_fingerprint: string;
  encrypted_private_jwk: string;
  expires_at?: string;
  id?: string;
  public_jwk: Json;
  public_key_kid?: string | null;
  status?: LineSetupStatus;
};

export type LineSetupSessionUpdate = Partial<
  Pick<
    LineSetupSessionRow,
    'consumed_at' | 'expires_at' | 'public_key_kid' | 'status' | 'verified_at'
  >
>;

export type LineChatSettingsRow = {
  auto_reply_enabled: boolean;
  auto_reply_message: string;
  clinic_id: string;
  created_at: string;
  retention_days: number;
  updated_at: string;
  updated_by: string | null;
};

export type LineChatSettingsInsert = {
  auto_reply_enabled?: boolean;
  auto_reply_message?: string;
  clinic_id: string;
  retention_days?: number;
  updated_by?: string | null;
};

export type LineChatSettingsUpdate = Partial<
  Pick<
    LineChatSettingsRow,
    | 'auto_reply_enabled'
    | 'auto_reply_message'
    | 'retention_days'
    | 'updated_by'
  >
>;

export type LineContactRow = {
  blocked_at: string | null;
  clinic_id: string;
  created_at: string;
  credential_generation_id: string;
  customer_id: string | null;
  display_name: string | null;
  followed_at: string | null;
  id: string;
  line_user_id: string;
  picture_url: string | null;
  unfollowed_at: string | null;
  updated_at: string;
};

export type LineConversationRow = {
  assigned_membership_id: string | null;
  clinic_id: string;
  closed_at: string | null;
  contact_id: string;
  credential_generation_id: string;
  created_at: string;
  id: string;
  last_inbound_at: string | null;
  last_message_at: string | null;
  last_outbound_at: string | null;
  status: LineConversationStatus;
  unread_count: number;
  updated_at: string;
};

export type LineWebhookEventRow = {
  clinic_id: string;
  contact_id: string | null;
  credential_generation_id: string;
  created_at: string;
  error_code: string | null;
  event_type: string;
  id: string;
  is_redelivery: boolean;
  line_user_id: string | null;
  occurred_at: string | null;
  payload_digest: string;
  processed_at: string | null;
  status: 'received' | 'processed' | 'ignored' | 'failed';
  webhook_event_id: string;
};

export type LineMessageRow = {
  clinic_id: string;
  contact_id: string;
  credential_generation_id: string;
  conversation_id: string;
  created_at: string;
  direction: LineMessageDirection;
  id: string;
  line_message_id: string | null;
  message_type: LineMessageType;
  occurred_at: string;
  sent_by: string | null;
  status: LineMessageStatus;
  text_content: string | null;
  unsent_at: string | null;
  updated_at: string;
  webhook_event_id: string | null;
};

export type LineChatOutboxRow = {
  attempts: number;
  claimed_at: string | null;
  claim_token: string | null;
  clinic_id: string;
  conversation_id: string;
  credential_generation_id: string;
  created_at: string;
  id: string;
  last_error_code: string | null;
  message_id: string;
  next_attempt_at: string;
  sent_at: string | null;
  status: 'pending' | 'processing' | 'sent' | 'failed';
};

export type LineNotificationOutboxRow = GeneratedLineMessageOutbox['Row'] & {
  claimed_at: string | null;
  claim_token: string | null;
  credential_generation_id: string | null;
  customer_id: string | null;
};

export type LineNotificationOutboxInsert =
  GeneratedLineMessageOutbox['Insert'] & {
    claimed_at?: string | null;
    claim_token?: string | null;
    credential_generation_id?: string | null;
    customer_id?: string | null;
  };

export type LineNotificationOutboxUpdate =
  GeneratedLineMessageOutbox['Update'] & {
    claimed_at?: string | null;
    claim_token?: string | null;
    credential_generation_id?: string | null;
    customer_id?: string | null;
  };

export type LineJobHeartbeatRow = {
  clinic_id: string | null;
  id: string;
  job_name: string;
  last_completed_at: string | null;
  last_error_code: string | null;
  last_started_at: string | null;
  last_status: 'never' | 'running' | 'succeeded' | 'failed';
  updated_at: string;
};

type TableContract<Row, Insert, Update, Relationships = []> = {
  Insert: Insert;
  Relationships: Relationships;
  Row: Row;
  Update: Update;
};

type LineIntegrationTables = {
  clinic_feature_flags: TableContract<
    LineFeatureFlagsRow,
    LineFeatureFlagsInsert,
    LineFeatureFlagsUpdate,
    GeneratedFeatureFlags['Relationships']
  >;
  clinic_line_chat_settings: TableContract<
    LineChatSettingsRow,
    LineChatSettingsInsert,
    LineChatSettingsUpdate
  >;
  clinic_line_credential_generations: TableContract<
    LineCredentialGenerationRow,
    Partial<LineCredentialGenerationRow> &
      Pick<LineCredentialGenerationRow, 'clinic_id' | 'id'>,
    Partial<LineCredentialGenerationRow>
  >;
  clinic_line_credentials: TableContract<
    LineCredentialsRow,
    LineCredentialsInsert,
    LineCredentialsUpdate,
    GeneratedLineCredentials['Relationships']
  >;
  clinic_line_setup_sessions: TableContract<
    LineSetupSessionRow,
    LineSetupSessionInsert,
    LineSetupSessionUpdate
  >;
  customers: TableContract<
    LineCustomerRow,
    LineCustomerInsert,
    LineCustomerUpdate,
    GeneratedCustomers['Relationships']
  >;
  line_chat_outbox: TableContract<
    LineChatOutboxRow,
    Partial<LineChatOutboxRow> &
      Pick<
        LineChatOutboxRow,
        | 'clinic_id'
        | 'conversation_id'
        | 'credential_generation_id'
        | 'message_id'
      >,
    Partial<LineChatOutboxRow>
  >;
  line_contacts: TableContract<
    LineContactRow,
    Partial<LineContactRow> &
      Pick<
        LineContactRow,
        'clinic_id' | 'credential_generation_id' | 'line_user_id'
      >,
    Partial<LineContactRow>
  >;
  line_conversations: TableContract<
    LineConversationRow,
    Partial<LineConversationRow> &
      Pick<
        LineConversationRow,
        'clinic_id' | 'contact_id' | 'credential_generation_id'
      >,
    Partial<LineConversationRow>
  >;
  line_job_heartbeats: TableContract<
    LineJobHeartbeatRow,
    Partial<LineJobHeartbeatRow> & Pick<LineJobHeartbeatRow, 'job_name'>,
    Partial<LineJobHeartbeatRow>
  >;
  line_message_outbox: TableContract<
    LineNotificationOutboxRow,
    LineNotificationOutboxInsert,
    LineNotificationOutboxUpdate,
    GeneratedLineMessageOutbox['Relationships']
  >;
  line_messages: TableContract<
    LineMessageRow,
    Partial<LineMessageRow> &
      Pick<
        LineMessageRow,
        | 'clinic_id'
        | 'contact_id'
        | 'conversation_id'
        | 'credential_generation_id'
        | 'direction'
        | 'message_type'
        | 'occurred_at'
        | 'status'
      >,
    Partial<LineMessageRow>
  >;
  line_webhook_events: TableContract<
    LineWebhookEventRow,
    Partial<LineWebhookEventRow> &
      Pick<
        LineWebhookEventRow,
        | 'clinic_id'
        | 'event_type'
        | 'credential_generation_id'
        | 'is_redelivery'
        | 'payload_digest'
        | 'status'
        | 'webhook_event_id'
      >,
    Partial<LineWebhookEventRow>
  >;
};

type LineIntegrationFunctions = {
  enqueue_outreach_campaign: {
    Args: {
      p_campaign_id: string;
      p_clinic_id: string;
      p_deliveries: Json;
      p_expected_message_body: string;
    };
    Returns: Array<{ enqueued_count: number; sent_at: string }>;
  };
  claim_line_notification_outbox: {
    Args: {
      p_clinic_id: string;
      p_expected_attempts: number;
      p_outbox_id: string;
    };
    Returns: string | null;
  };
  quarantine_unverified_line_notification_history: {
    Args: Record<string, never>;
    Returns: undefined;
  };
  claim_line_chat_outbox: {
    Args: { p_clinic_id: string; p_limit?: number };
    Returns: Array<{
      claim_token: string;
      line_user_id: string;
      outbox_id: string;
      text_content: string;
    }>;
  };
  close_line_setup_session: {
    Args: {
      p_clinic_id: string;
      p_setup_session_id: string;
      p_status: 'consumed' | 'revoked';
    };
    Returns: undefined;
  };
  enqueue_line_chat_message: {
    Args: {
      p_clinic_id: string;
      p_conversation_id: string;
      p_sent_by: string;
      p_text: string;
    };
    Returns: string;
  };
  expire_line_setup_sessions: {
    Args: { p_clinic_id?: string | null };
    Returns: number;
  };
  finalize_line_chat_outbox: {
    Args: {
      p_claim_token: string;
      p_clinic_id: string;
      p_error_code?: string | null;
      p_line_message_id?: string | null;
      p_outbox_id: string;
      p_succeeded: boolean;
    };
    Returns: undefined;
  };
  finalize_line_notification_outbox: {
    Args: {
      p_claim_token: string;
      p_clinic_id: string;
      p_last_error: string | null;
      p_next_attempt_at: string;
      p_outbox_id: string;
      p_sent_at: string | null;
      p_status: 'pending' | 'sent' | 'failed';
    };
    Returns: undefined;
  };
  renew_line_notification_claim: {
    Args: {
      p_claim_token: string;
      p_clinic_id: string;
      p_outbox_id: string;
    };
    Returns: boolean;
  };
  purge_expired_line_chat_data: {
    Args: { p_clinic_id?: string | null };
    Returns: Array<{
      deleted_messages: number;
      deleted_webhook_events: number;
    }>;
  };
  rotate_line_credential_generation: {
    Args: {
      p_clinic_id: string;
      p_credentials: Json;
      p_new_generation_id: string;
      p_setup_session_id: string;
      p_updated_by: string;
    };
    Returns: string;
  };
  relink_line_contact_generation: {
    Args: {
      p_clinic_id: string;
      p_customer_id?: string | null;
      p_line_user_id: string;
      p_previous_contact_id: string | null;
    };
    Returns: string;
  };
};

type GeneratedPublic = Database['public'];

export type LineIntegrationDatabase = Omit<Database, 'public'> & {
  public: Omit<GeneratedPublic, 'Functions' | 'Tables'> & {
    Functions: GeneratedPublic['Functions'] & LineIntegrationFunctions;
    Tables: Omit<GeneratedTables, keyof LineIntegrationTables> &
      LineIntegrationTables;
  };
};

export type LineIntegrationClient = SupabaseClient<LineIntegrationDatabase>;

export function createLineIntegrationAdminClient(): LineIntegrationClient {
  return createAdminClientForDatabase<LineIntegrationDatabase>();
}

/** Temporary typed overlay until migration replay regenerates Database. */
export function toLineIntegrationClient(
  client: SupabaseServerClient
): LineIntegrationClient {
  return client as LineIntegrationClient;
}
