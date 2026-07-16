const policy = {
  route: '/api/example',
  methods: ['POST'],
  classification: 'AUTH_SCOPED_UNBILLED',
  clinicScope: 'not-applicable',
  billing: 'explicit-exception',
  auth: 'supabase-user',
  idempotency: 'not-applicable',
  rateLimit: 'middleware',
  exceptionReason: 'Fixture verifies duplicate detection.',
  owner: 'fixture-owner',
};

export const mutatingRoutePolicies = [policy, policy];
export const sideEffectingGetPolicies = [];
