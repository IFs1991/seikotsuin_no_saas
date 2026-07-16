export const mutatingRoutePolicies = [
  {
    route: '/api/example',
    methods: ['POST'],
    classification: 'SIGNED_WEBHOOK',
    clinicScope: 'not-applicable',
    billing: 'not-applicable',
    auth: 'webhook-signature',
    idempotency: 'recommended',
    rateLimit: 'not-applicable',
    owner: 'fixture-owner',
  },
];
export const sideEffectingGetPolicies = [];
