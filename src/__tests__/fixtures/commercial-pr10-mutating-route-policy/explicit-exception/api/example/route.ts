import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';

export async function POST(request: NextRequest): Promise<Response> {
  const result = await processApiRequest(request);
  if (!result.success) return result.error;

  const { error } = await result.supabase.from('audit_logs').insert({
    event_type: 'fixture_explicit_exception',
    success: true,
    user_id: result.auth.id,
  });
  if (error) return new Response(null, { status: 500 });

  return new Response(null, { status: 204 });
}
