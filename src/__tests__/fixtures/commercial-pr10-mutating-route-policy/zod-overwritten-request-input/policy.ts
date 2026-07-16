export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'PUBLIC_VALIDATED',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'public',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
