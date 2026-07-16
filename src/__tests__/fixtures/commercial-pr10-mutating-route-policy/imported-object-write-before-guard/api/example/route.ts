import { processApiRequest } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase';

import { ImportedFixtureWriter } from './writer';

const writer = new ImportedFixtureWriter();

export async function POST(request: Request): Promise<Response> {
  const clinicId = '00000000-0000-4000-8000-000000000001';
  await writer.persist(createAdminClient(), clinicId);

  const result = await processApiRequest(request);
  if (!result.success) return result.error;

  return new Response(null, { status: 204 });
}
