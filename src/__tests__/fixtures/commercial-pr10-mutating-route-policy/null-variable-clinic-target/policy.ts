export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'ADMIN_SCOPED',
    clinicScope: 'required',
    billing: 'explicit-exception',
    auth: 'admin-role',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture exercises an administrative exception.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
