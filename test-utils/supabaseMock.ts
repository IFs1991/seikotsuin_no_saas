/**
 * Unified Supabase Mock for Jest Tests
 *
 * Spec: jest-test-stabilization-spec.md
 *
 * Features:
 * - Chainable methods (from, select, insert, update, delete, eq, gte, lte, order, etc.)
 * - Thenable (PromiseLike) - supports await
 * - Per-table/per-operation result configuration
 * - Result queue for sequential calls
 */

type OperationType = 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';

interface SupabaseResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface ResultConfig {
  table: string;
  op: OperationType;
}

interface MockConfig {
  defaultResult?: SupabaseResult;
}

/**
 * Creates a chainable, thenable Supabase mock builder
 */
function createQueryBuilder(
  tableName: string,
  getResult: (table: string, op: OperationType) => SupabaseResult,
  trackCall: (method: string, args: unknown[]) => void
) {
  let currentOp: OperationType = 'select';
  let isSingle = false;

  const builder: Record<string, jest.Mock> & PromiseLike<SupabaseResult> = {
    // Filter methods - return builder for chaining
    eq: jest.fn((...args: unknown[]) => {
      trackCall('eq', args);
      return builder;
    }),
    neq: jest.fn((...args: unknown[]) => {
      trackCall('neq', args);
      return builder;
    }),
    gt: jest.fn((...args: unknown[]) => {
      trackCall('gt', args);
      return builder;
    }),
    gte: jest.fn((...args: unknown[]) => {
      trackCall('gte', args);
      return builder;
    }),
    lt: jest.fn((...args: unknown[]) => {
      trackCall('lt', args);
      return builder;
    }),
    lte: jest.fn((...args: unknown[]) => {
      trackCall('lte', args);
      return builder;
    }),
    in: jest.fn((...args: unknown[]) => {
      trackCall('in', args);
      return builder;
    }),
    match: jest.fn((...args: unknown[]) => {
      trackCall('match', args);
      return builder;
    }),
    contains: jest.fn((...args: unknown[]) => {
      trackCall('contains', args);
      return builder;
    }),
    overlaps: jest.fn((...args: unknown[]) => {
      trackCall('overlaps', args);
      return builder;
    }),
    like: jest.fn((...args: unknown[]) => {
      trackCall('like', args);
      return builder;
    }),
    ilike: jest.fn((...args: unknown[]) => {
      trackCall('ilike', args);
      return builder;
    }),
    is: jest.fn((...args: unknown[]) => {
      trackCall('is', args);
      return builder;
    }),
    or: jest.fn((...args: unknown[]) => {
      trackCall('or', args);
      return builder;
    }),
    not: jest.fn((...args: unknown[]) => {
      trackCall('not', args);
      return builder;
    }),

    // Sort/Range methods
    order: jest.fn((...args: unknown[]) => {
      trackCall('order', args);
      return builder;
    }),
    range: jest.fn((...args: unknown[]) => {
      trackCall('range', args);
      return builder;
    }),
    limit: jest.fn((...args: unknown[]) => {
      trackCall('limit', args);
      return builder;
    }),

    // Operation methods - set currentOp and return builder
    select: jest.fn((...args: unknown[]) => {
      currentOp = 'select';
      trackCall('select', args);
      return builder;
    }),
    insert: jest.fn((...args: unknown[]) => {
      currentOp = 'insert';
      trackCall('insert', args);
      return builder;
    }),
    update: jest.fn((...args: unknown[]) => {
      currentOp = 'update';
      trackCall('update', args);
      return builder;
    }),
    upsert: jest.fn((...args: unknown[]) => {
      currentOp = 'upsert';
      trackCall('upsert', args);
      return builder;
    }),
    delete: jest.fn((...args: unknown[]) => {
      currentOp = 'delete';
      trackCall('delete', args);
      return builder;
    }),

    // Terminal methods - still return builder (for chaining after single)
    single: jest.fn(() => {
      isSingle = true;
      trackCall('single', []);
      return builder;
    }),
    maybeSingle: jest.fn(() => {
      isSingle = true;
      trackCall('maybeSingle', []);
      return builder;
    }),

    // Thenable implementation - makes builder await-able
    then: ((
      resolve?: (value: SupabaseResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => {
      const result = getResult(tableName, currentOp);
      // If single() was called and data is an array, return first element
      let finalData = result.data;
      if (isSingle && Array.isArray(result.data)) {
        finalData = result.data[0] ?? null;
      }
      const finalResult = { ...result, data: finalData };

      return Promise.resolve(finalResult).then(resolve, reject);
    }) as PromiseLike<SupabaseResult>['then'],

    catch: ((onRejected?: (reason: unknown) => unknown) => {
      return Promise.resolve(getResult(tableName, currentOp)).catch(onRejected);
    }) as Promise<SupabaseResult>['catch'],
  } as unknown as Record<string, jest.Mock> & PromiseLike<SupabaseResult>;

  return builder;
}

/**
 * Creates a unified Supabase mock client
 */
export function createSupabaseMock(config: MockConfig = {}) {
  // Storage for results
  const fixedResults = new Map<string, SupabaseResult>();
  const resultQueues = new Map<string, SupabaseResult[]>();
  const builders = new Map<string, ReturnType<typeof createQueryBuilder>>();
  const callHistory: Array<{ table: string; method: string; args: unknown[] }> = [];

  const defaultResult: SupabaseResult = config.defaultResult ?? {
    data: [],
    error: null,
  };

  // Key generator for table+op combinations
  const getKey = (table: string, op: OperationType) => `${table}:${op}`;

  // Result getter - checks queue first, then fixed, then default
  const getResult = (table: string, op: OperationType): SupabaseResult => {
    const key = getKey(table, op);

    // Check queue first
    const queue = resultQueues.get(key);
    if (queue && queue.length > 0) {
      return queue.shift()!;
    }

    // Check fixed result
    const fixed = fixedResults.get(key);
    if (fixed) {
      return fixed;
    }

    // Check table-level default (any op)
    const tableDefault = fixedResults.get(`${table}:*`);
    if (tableDefault) {
      return tableDefault;
    }

    return defaultResult;
  };

  // Track method calls for assertions
  const trackCall = (table: string) => (method: string, args: unknown[]) => {
    callHistory.push({ table, method, args });
  };

  // The from() function that returns a builder
  const from = jest.fn((tableName: string) => {
    const builder = createQueryBuilder(tableName, getResult, trackCall(tableName));
    builders.set(tableName, builder);
    return builder;
  });

  // RPC function
  const rpc = jest.fn((fnName: string, params?: unknown) => {
    const result = getResult(fnName, 'rpc');
    return Promise.resolve(result);
  });

  // Auth mock
  const auth = {
    getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    signInWithPassword: jest.fn(() => Promise.resolve({ data: { user: null, session: null }, error: null })),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  };

  // The mock client
  const client = {
    from,
    rpc,
    auth,
  };

  return {
    client,
    from,
    auth,
    rpc,

    /**
     * Get the builder for a specific table (for assertions)
     */
    getBuilder: (tableName: string) => builders.get(tableName),

    /**
     * Set a fixed result for a table/operation combination
     */
    setResult: (config: ResultConfig | { table: string }, result: SupabaseResult) => {
      const key = 'op' in config ? getKey(config.table, config.op) : `${config.table}:*`;
      fixedResults.set(key, result);
    },

    /**
     * Enqueue a result (consumed once, in order)
     */
    enqueueResult: (config: ResultConfig, result: SupabaseResult) => {
      const key = getKey(config.table, config.op);
      const queue = resultQueues.get(key) ?? [];
      queue.push(result);
      resultQueues.set(key, queue);
    },

    /**
     * Set default result for all operations
     */
    setDefaultResult: (result: SupabaseResult) => {
      fixedResults.set('*:*', result);
    },

    /**
     * Reset all state (call in beforeEach)
     */
    reset: () => {
      fixedResults.clear();
      resultQueues.clear();
      builders.clear();
      callHistory.length = 0;
      from.mockClear();
      rpc.mockClear();
      Object.values(auth).forEach(fn => {
        if (typeof fn === 'function' && 'mockClear' in fn) {
          (fn as jest.Mock).mockClear();
        }
      });
    },

    /**
     * Get call history for debugging
     */
    getCallHistory: () => [...callHistory],

    /**
     * Clear call history
     */
    clearCallHistory: () => {
      callHistory.length = 0;
    },
  };
}

/**
 * Type for the mock returned by createSupabaseMock
 */
export type SupabaseMock = ReturnType<typeof createSupabaseMock>;

/**
 * Type for the mock client
 */
export type MockSupabaseClient = SupabaseMock['client'];
