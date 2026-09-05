import { setTimeout as delay } from 'node:timers/promises';

export function isTransientMetaImagePullFailure(error) {
  const stderr =
    error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr ?? '')
      : '';
  return (
    /(?:postgres-meta|supabase\/postgres-meta)/i.test(stderr) &&
    /(?:pull|manifest|download|registry)/i.test(stderr) &&
    /(?:toomanyrequests|\b429\b|TLS handshake timeout|connection reset|i\/o timeout)/i.test(
      stderr
    ) &&
    !/(?:unauthorized|authentication required|manifest unknown|access denied)/i.test(
      stderr
    )
  );
}

// Retry only the CLI's transient container-fetch failure. Output validation and
// schema/type diff run after this returns and must never enter this retry loop.
export async function runWithMetaImagePullRetry(
  run,
  { sleep = delay, warn = message => console.warn(message) } = {}
) {
  const delays = [1000, 3000];
  for (let attempt = 0; ; attempt++) {
    try {
      return run();
    } catch (error) {
      if (attempt >= delays.length || !isTransientMetaImagePullFailure(error))
        throw error;
      warn(
        `[supabase:types] Transient postgres-meta image fetch failure; retry ${attempt + 1}/2.`
      );
      await sleep(delays[attempt]);
    }
  }
}
