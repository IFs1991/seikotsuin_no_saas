export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['PATCH'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'not-applicable',
    billing: 'explicit-exception',
    auth: 'supabase-user',
    idempotency: 'not-applicable',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture verifies route-method drift detection.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
