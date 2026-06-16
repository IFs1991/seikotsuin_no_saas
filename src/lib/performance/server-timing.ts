export function nowMs(): number {
  return performance.now();
}

export function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function shouldLogPerf(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_PERF_LOG === 'true'
  );
}

export function logPerf(
  label: string,
  start: number,
  extra?: Record<string, unknown>
): void {
  if (!shouldLogPerf()) {
    return;
  }

  console.log('[perf]', label, {
    ms: elapsedMs(start),
    ...extra,
  });
}
