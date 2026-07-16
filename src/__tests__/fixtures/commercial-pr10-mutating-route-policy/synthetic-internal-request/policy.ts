export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'INTERNAL_SECRET',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'internal-secret',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
