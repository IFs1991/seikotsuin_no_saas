export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'ADMIN_SCOPED',
    clinicScope: 'derived',
    billing: 'explicit-exception',
    auth: 'admin-role',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture exercises a scoped Stripe store update.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
