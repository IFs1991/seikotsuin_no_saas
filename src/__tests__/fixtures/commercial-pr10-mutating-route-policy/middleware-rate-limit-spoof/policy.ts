export const mutatingRoutePolicies = [
  {
    route: '/api/stripe/webhook',
    methods: ['POST'],
    classification: 'SIGNED_WEBHOOK',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'webhook-signature',
    idempotency: 'recommended',
    rateLimit: 'middleware',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
