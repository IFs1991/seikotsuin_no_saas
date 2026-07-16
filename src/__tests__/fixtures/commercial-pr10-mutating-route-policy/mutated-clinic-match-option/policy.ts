export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'AUTH_SCOPED_UNBILLED',
    clinicScope: 'required',
    billing: 'explicit-exception',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    exceptionReason: 'Fixture exercises an unbilled operation.',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
