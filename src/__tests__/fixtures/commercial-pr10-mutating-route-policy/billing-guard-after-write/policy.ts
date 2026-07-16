export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'AUTH_SCOPED_BILLED',
    clinicScope: 'required',
    billing: 'required',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
