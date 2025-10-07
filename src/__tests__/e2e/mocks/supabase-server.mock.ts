import { jest } from '@jest/globals';

import {
  resetSupabaseClientFactory,
  setSupabaseClientFactory,
  type SupabaseServerClient,
} from '@/lib/supabase/server';

type QueryResult<TData = unknown> = {
  data: TData;
  error: null | { message: string };
};

function createDefaultProfileResult(): QueryResult<{ role: string; is_active: boolean }> {
  return {
    data: { role: 'manager', is_active: true },
    error: null,
  };
}

function createDefaultQueryResult(): QueryResult<unknown[]> {
  return {
    data: [],
    error: null,
  };
}

function createQueryBuilder(table?: string) {
  const result = table === 'profiles' ? createDefaultProfileResult() : createDefaultQueryResult();

  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.single = jest.fn().mockResolvedValue(result);
  builder.insert = jest.fn().mockResolvedValue(result);
  builder.update = jest.fn().mockResolvedValue(result);
  builder.delete = jest.fn().mockResolvedValue(result);
  builder.order = jest.fn(() => builder);
  return builder;
}

export const supabaseMock: any = {
  auth: {
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    getUser: jest.fn(),
  },
  from: jest.fn((table?: string) => createQueryBuilder(table)),
  rpc: jest.fn(),
};

function resetSupabaseMockState() {
  supabaseMock.auth.signInWithPassword.mockResolvedValue({
    data: { user: { id: 'u1', email: 'manager@example.com' } },
    error: null,
  });
  supabaseMock.auth.signOut.mockResolvedValue({ error: null });
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'manager@example.com' } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table?: string) => createQueryBuilder(table));
  supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
}

resetSupabaseMockState();

// Supabase サーバークライアントの Factory を差し替えるセットアップ
export function mockServerClient() {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSupabaseMockState();
    setSupabaseClientFactory(() => supabaseMock as SupabaseServerClient);
  });

  afterEach(() => {
    resetSupabaseClientFactory();
  });

  // Ensure first test run has the mock factory
  setSupabaseClientFactory(() => supabaseMock as SupabaseServerClient);

  return supabaseMock;
}
