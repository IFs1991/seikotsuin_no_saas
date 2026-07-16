export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'SIGNED_WEBHOOK',
    clinicScope: 'derived',
    billing: 'not-applicable',
    auth: 'webhook-signature',
    idempotency: 'required',
    rateLimit: 'middleware',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
