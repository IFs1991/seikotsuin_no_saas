import 'server-only';

import { redirect } from 'next/navigation';
import { AppError } from '@/lib/error-handler';

export const AUTHORITY_UNAVAILABLE_PATH = '/auth/authority-unavailable';

/**
 * Preserve the authority layer's safe 503 semantics across Server Components.
 * Other failures remain errors and are handled by Next.js normally.
 */
export async function withAuthorityUnavailableRedirect<T>(
  readAuthority: () => Promise<T>
): Promise<T> {
  try {
    return await readAuthority();
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode !== 503) {
      throw error;
    }

    redirect(AUTHORITY_UNAVAILABLE_PATH);
  }
}
