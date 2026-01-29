const createQueryChain = (final = { data: null, error: null }) => {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    range: jest.fn(() => chain),
    single: jest.fn(async () => final),
    maybeSingle: jest.fn(async () => final),
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    upsert: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    contains: jest.fn(() => chain),
    then: jest.fn(resolve => Promise.resolve(resolve(final))),
  };
  return chain;
};

const mockSupabase = {
  from: jest.fn(() => createQueryChain()),
  rpc: jest.fn(async () => ({ data: null, error: null })),
  auth: {
    signOut: jest.fn(async () => ({ error: null })),
    signInWithPassword: jest.fn(async () => ({
      data: { session: null, user: null },
      error: null,
    })),
    getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
  },
  channel: jest.fn(() => {
    const subscription = {
      on: jest.fn(() => subscription),
      subscribe: jest.fn(),
      send: jest.fn(async () => ({ status: 'ok' })),
    };
    return subscription;
  }),
  insert: jest.fn(),
  update: jest.fn(),
};

jest.mock('@supabase/ssr', () => ({
  __esModule: true,
  createServerClient: jest.fn(() => mockSupabase),
  createBrowserClient: jest.fn(() => mockSupabase),
}));

global.__SUPABASE_MOCK__ = mockSupabase;

module.exports = {
  mockSupabase,
  createQueryChain,
};
