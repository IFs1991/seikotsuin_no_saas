export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'ADMIN_SCOPED',
    clinicScope: 'not-applicable',
    billing: 'explicit-exception',
    auth: 'admin-role',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture exercises an administrative operation.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
