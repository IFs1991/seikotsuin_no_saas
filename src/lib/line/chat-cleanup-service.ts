import 'server-only';

import type { LineIntegrationClient } from '@/lib/line/integration-db';

export type LineChatCleanupResult = {
  deletedMessages: number;
  deletedWebhookEvents: number;
  skipped: boolean;
};

export async function cleanupLineChatData(
  client: LineIntegrationClient
): Promise<LineChatCleanupResult> {
  const { data, error } = await client.rpc('run_line_chat_cleanup_if_due');
  if (error) throw error;
  const result = data?.[0];
  return {
    deletedMessages: result?.deleted_messages ?? 0,
    deletedWebhookEvents: result?.deleted_webhook_events ?? 0,
    skipped: result?.skipped ?? true,
  };
}
