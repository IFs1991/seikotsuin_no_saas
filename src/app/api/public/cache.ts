export const PUBLIC_BOOKING_CACHE_HEADERS = {
  'Cache-Control':
    'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
} as const;
