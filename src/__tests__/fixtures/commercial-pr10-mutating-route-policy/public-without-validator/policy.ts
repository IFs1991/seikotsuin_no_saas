export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'PUBLIC_VALIDATED',
    clinicScope: 'derived',
    billing: 'not-applicable',
    auth: 'public',
    idempotency: 'recommended',
    rateLimit: 'required',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
