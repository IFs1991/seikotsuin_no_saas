export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'not-applicable',
    billing: 'explicit-exception',
    auth: 'supabase-user',
    idempotency: 'not-applicable',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture verifies guard ordering.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
