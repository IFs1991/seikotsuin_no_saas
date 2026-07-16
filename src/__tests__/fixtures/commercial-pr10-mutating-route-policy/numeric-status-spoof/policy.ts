export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'HEALTH_OR_NO_MUTATION',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'public',
    idempotency: 'not-applicable',
    rateLimit: 'not-applicable',
    exceptionReason: 'Fixture verifies a direct fixed denial response.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
