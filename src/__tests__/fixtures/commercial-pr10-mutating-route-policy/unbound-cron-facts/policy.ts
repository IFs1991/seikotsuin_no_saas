export const mutatingRoutePolicies = [];
export const sideEffectingGetPolicies = [
  {
    route: '/api/example',
    methods: ['GET'],
    classification: 'INTERNAL_SECRET',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'cron-secret',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    exceptionReason: 'Fixture verifies a bound CRON secret denial guard.',
    owner: 'fixture-owner',
  },
];
