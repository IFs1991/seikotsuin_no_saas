export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'derived',
    billing: 'explicit-exception',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture exercises a derived-scope operation.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
