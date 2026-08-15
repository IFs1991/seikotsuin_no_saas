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
  provider_identity_verified_at: string | null;
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
      | 'provider_identity_verified_at'
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
      | 'provider_identity_verified_at'
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
  encrypted_verification_payload: string | null;
  expires_at: string;
  id: string;
  provider_identity_verified: boolean;
  public_jwk: Json;
  public_key_kid: string | null;
  push_test_retry_key: string;
  status: LineSetupStatus;
  updated_at: string;
  verification_claim_token: string | null;
  verification_claimed_at: string | null;
  verification_request_digest: string | null;
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
  encrypted_verification_payload?: string | null;
  expires_at?: string;
  id?: string;
  provider_identity_verified?: boolean;
  public_jwk: Json;
  public_key_kid?: string | null;
  push_test_retry_key?: string;
  status?: LineSetupStatus;
  verification_claim_token?: string | null;
  verification_claimed_at?: string | null;
  verification_request_digest?: string | null;
};

export type LineSetupSessionUpdate = Partial<
  Pick<
    LineSetupSessionRow,
    | 'consumed_at'
    | 'encrypted_verification_payload'
    | 'expires_at'
    | 'provider_identity_verified'
    | 'public_key_kid'
    | 'status'
    | 'verification_claim_token'
    | 'verification_claimed_at'
    | 'verification_request_digest'
    | 'verified_at'
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
  unsend_message_id: string | null;
  webhook_event_id: string;
};

export type LineUnsendTombstoneRow = {
  clinic_id: string;
  created_at: string;
  credential_generation_id: string;
  line_message_digest: string;
  unsent_at: string;
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

export type LineIntegrationDatabase = Database;

export type LineIntegrationClient = SupabaseClient<LineIntegrationDatabase>;

export function createLineIntegrationAdminClient(): LineIntegrationClient {
  return createAdminClientForDatabase<LineIntegrationDatabase>();
}

export function toLineIntegrationClient(
  client: SupabaseServerClient
): LineIntegrationClient {
  return client;
}
