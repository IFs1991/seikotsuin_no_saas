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
    exceptionReason: 'Fixture exercises a CRON guard.',
    owner: 'fixture-owner',
  },
];
