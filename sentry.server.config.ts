import * as Sentry from '@sentry/nextjs';

import { initSentry } from '@/lib/monitoring/sentry';

initSentry(Sentry, 'server');
