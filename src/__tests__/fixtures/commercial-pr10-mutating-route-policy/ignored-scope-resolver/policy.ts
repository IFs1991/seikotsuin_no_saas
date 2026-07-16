export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'ADMIN_SCOPED',
    clinicScope: 'derived',
    billing: 'not-applicable',
    auth: 'supabase-user',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
