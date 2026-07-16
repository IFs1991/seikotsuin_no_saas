import { z } from 'zod';
import { cspRateLimiter } from '@/lib/rate-limiting/csp-rate-limiter';

const schema = z.object({ value: z.string().min(1) });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const rateLimit = await cspRateLimiter.checkCSPReportLimit(
    crypto.randomUUID()
  );
  if (!rateLimit.allowed) return new Response(null, { status: 429 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert(parsed.data);
  return new Response(null, { status: 204 });
}
