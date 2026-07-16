export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'not-applicable',
    billing: 'explicit-exception',
    auth: 'public',
    idempotency: 'not-applicable',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture verifies class and auth coherence.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
