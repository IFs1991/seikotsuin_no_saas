// jest.setup.after.js
// Testing Library のカスタムマッチャーをインポート
require('@testing-library/jest-dom/jest-globals');

// React Testing Library の cleanup を明示的にインポート
// テスト間でのReactコンポーネントの適切なアンマウントを保証
const { cleanup } = require('@testing-library/react');

// Nodeベースの環境でもブラウザ依存コードが安全に動作するように補助グローバルを定義
const globalScope = /** @type {any} */ (globalThis);

if (typeof globalScope.window === 'undefined') {
  globalScope.window = globalScope;
}

if (typeof globalScope.navigator === 'undefined') {
  // 最低限の userAgent 情報を付与
  globalScope.navigator = { userAgent: 'node.js' };
}

if (typeof globalScope.document === 'undefined') {
  globalScope.document = {
    createElement: () => ({ style: {} }),
    createElementNS: () => ({ style: {} }),
    createTextNode: () => ({}),
    body: {
      appendChild: () => {},
      removeChild: () => {},
      classList: { add: () => {}, remove: () => {} },
    },
  };
}

const windowObject = globalScope.window;

const webApiKeys = [
  'fetch',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'File',
];
for (const key of webApiKeys) {
  if (
    typeof windowObject[key] === 'undefined' &&
    typeof globalScope[key] !== 'undefined'
  ) {
    windowObject[key] = globalScope[key];
  }
}

// 簡易インメモリDB（一部のモックで参照）
const __MOCK_DB = {
  registered_devices: [],
  user_sessions: [],
};

// Supabaseのモック設定
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signIn: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: { id: 'mock-user-id', email: 'test@example.com' }, session: {} },
        error: null,
      }),
      signUp: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(() => {
      const result = { data: null, count: 0, error: null };
      const builder = {
        select: jest.fn().mockImplementation((_, opts) => {
          if (opts && typeof opts === 'object' && opts.count === 'exact') {
            result.count = 0;
          }
          return builder;
        }),
        insert: jest.fn().mockReturnThis(),
        upsert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: resolve => Promise.resolve(resolve(result)),
      };
      return builder;
    }),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      send: jest.fn().mockResolvedValue({}),
    })),
  })),
}));

const supa = require('@supabase/supabase-js');

// テストが独自に createClient().mockReturnValue(mock) を呼ぶ場合でも、
// 欠落したチェーン関数（or/gte/lt/order/limit/range）を補完する
const createClientMock = supa.createClient;
if (createClientMock && createClientMock.mock) {
  const originalMockReturnValue =
    createClientMock.mockReturnValue.bind(createClientMock);
  createClientMock.mockReturnValue = clientObj => {
    if (clientObj && typeof clientObj === 'object') {
      const ensureChain = builder => {
        const noop = () => builder;
        builder.select = builder.select || noop;
        builder.insert = builder.insert || noop;
        builder.upsert = builder.upsert || noop;
        builder.update = builder.update || noop;
        builder.delete = builder.delete || noop;
        builder.eq = builder.eq || noop;
        builder.neq = builder.neq || noop;
        builder.in = builder.in || noop;
        builder.contains = builder.contains || noop;
        builder.or = builder.or || noop;
        builder.gte = builder.gte || noop;
        builder.lt = builder.lt || noop;
        builder.order = builder.order || noop;
        builder.limit = builder.limit || noop;
        builder.range = builder.range || noop;
        builder.single = builder.single || jest.fn();
        builder.then =
          builder.then ||
          (resolve =>
            Promise.resolve(resolve({ data: null, count: 0, error: null })));
        return builder;
      };
      if (typeof clientObj.from === 'function') {
        const originalFrom = clientObj.from;
        clientObj.from = (...args) => {
          const builder = originalFrom.apply(clientObj, args) || clientObj;
          return ensureChain(builder);
        };
      } else {
        clientObj.from = () => ensureChain(clientObj);
      }
    }
    return originalMockReturnValue(clientObj);
  };
}

// アプリ内のSupabaseクライアントをテスト用モックに差し替え
const supabaseModule = require('@/lib/supabase');

beforeEach(() => {
  supabaseModule.setSupabaseClientFactory(() => supa.createClient());
});

afterEach(() => {
  supabaseModule.resetSupabaseClientFactory();
});

// Next.js router のモック（redirect を REDIRECT エラー化して Server Actions 対応）
jest.mock('next/navigation', () => ({
  __esModule: true,
  redirect: url => {
    throw new Error(`REDIRECT:${url}`);
  },
  permanentRedirect: url => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// next/headers のモック（cookies をリクエストスコープ外で使う箇所の保護）
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockImplementation(() => ({
    getAll: jest.fn().mockReturnValue([]),
    set: jest.fn(),
    setAll: jest.fn(),
  })),
  headers: jest.fn().mockReturnValue(new Map()),
}));

// @/lib/audit-logger のモック（ensureClinicAccess等で使用）
jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logLogin: jest.fn().mockResolvedValue(undefined),
    logLogout: jest.fn().mockResolvedValue(undefined),
    logFailedLogin: jest.fn().mockResolvedValue(undefined),
    logDataAccess: jest.fn().mockResolvedValue(undefined),
    logDataModification: jest.fn().mockResolvedValue(undefined),
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
    logAdminAction: jest.fn().mockResolvedValue(undefined),
    logSystemEvent: jest.fn().mockResolvedValue(undefined),
  },
  getRequestInfoFromHeaders: jest.fn().mockReturnValue({
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  }),
  getRequestInfo: jest.fn().mockReturnValue({
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  }),
}));

// @supabase/ssr のモック（Server Client / Browser Client をテスト環境で安全に利用）
jest.mock('@supabase/ssr', () => {
  // 共通のクライアントファクトリ
  const createMockClient = () => {
    const makeBuilder = table => {
      const state = {
        table,
        where: [],
        opts: {},
        result: { data: null, count: 0, error: null },
      };
      const applyWhere = rows =>
        state.where.reduce((acc, cond) => {
          const [op, key, val] = cond;
          switch (op) {
            case 'eq':
              return acc.filter(r => String(r?.[key]) === String(val));
            case 'neq':
              return acc.filter(r => String(r?.[key]) !== String(val));
            case 'contains':
              return acc.filter(r => {
                try {
                  const obj = r?.[key];
                  const allMatch = Object.entries(val || {}).every(
                    ([k, v]) => String(obj?.[k]) === String(v)
                  );
                  return allMatch;
                } catch {
                  return false;
                }
              });
            case 'in':
              return acc.filter(
                r => Array.isArray(val) && val.includes(r?.[key])
              );
            default:
              return acc;
          }
        }, rows);

      const builder = {
        select: jest.fn().mockImplementation((_, opts) => {
          state.opts = opts || {};
          return builder;
        }),
        insert: jest.fn().mockImplementation(payload => {
          const arr = Array.isArray(payload) ? payload : [payload];
          __MOCK_DB[state.table] = (__MOCK_DB[state.table] || []).concat(arr);
          return builder;
        }),
        upsert: jest.fn().mockImplementation(payload => {
          const arr = Array.isArray(payload) ? payload : [payload];
          __MOCK_DB[state.table] = (__MOCK_DB[state.table] || []).concat(arr);
          return builder;
        }),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation((k, v) => {
          state.where.push(['eq', k, v]);
          return builder;
        }),
        neq: jest.fn().mockImplementation((k, v) => {
          state.where.push(['neq', k, v]);
          return builder;
        }),
        in: jest.fn().mockImplementation((k, v) => {
          state.where.push(['in', k, v]);
          return builder;
        }),
        contains: jest.fn().mockImplementation((k, v) => {
          state.where.push(['contains', k, v]);
          return builder;
        }),
        or: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        single: jest.fn().mockImplementation(async () => {
          const rows = Array.isArray(__MOCK_DB[state.table])
            ? __MOCK_DB[state.table]
            : [];
          const filtered = applyWhere(rows);
          return { data: filtered[0] || null, error: null };
        }),
        then: resolve => {
          const rows = Array.isArray(__MOCK_DB[state.table])
            ? __MOCK_DB[state.table]
            : [];
          const filtered = applyWhere(rows);
          const out = {
            data: filtered,
            count: state.opts?.count === 'exact' ? filtered.length : 0,
            error: null,
          };
          return Promise.resolve(resolve(out));
        },
      };
      return builder;
    };

    return {
      auth: {
        getUser: jest
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
        getSession: jest
          .fn()
          .mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: jest.fn(),
      },
      from: jest.fn(table => makeBuilder(table)),
      channel: jest.fn(() => ({
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn(),
        send: jest.fn().mockResolvedValue({}),
      })),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      functions: {
        invoke: jest.fn().mockResolvedValue({ data: null, error: null }),
      },
    };
  };

  return {
    createServerClient: jest.fn(() => createMockClient()),
    createBrowserClient: jest.fn(() => createMockClient()),
  };
});

// Web APIのモック（LocalStorage, SessionStorage等）
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(windowObject, 'localStorage', {
  value: localStorageMock,
});

const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(windowObject, 'sessionStorage', {
  value: sessionStorageMock,
});

// matchMedia のモック（レスポンシブデザイン対応）
Object.defineProperty(windowObject, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// ResizeObserver のモック
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// IntersectionObserver のモック
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Console エラーの抑制（テスト時の不要なログを除去）
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
        args[0].includes('Warning: validateDOMNesting'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// テスト間でのクリーンアップ
afterEach(() => {
  // React Testing Library の cleanup を実行
  // これにより React コンポーネントがアンマウントされ、
  // 関連する副作用（タイマー、イベントリスナー等）がクリーンアップされる
  cleanup();

  jest.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
});

// console.warn をモック（警告発生の検証用）
// 一部テストで toHaveBeenCalled を用いるため関数化
console.warn = jest.fn();

// Request の軽量ポリフィル（middleware等のテストで必要になる場合）
if (typeof global.Request === 'undefined') {
  class SimpleRequest {
    url;
    method;
    headers;
    body;
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init.method || 'GET';
      this.headers = init.headers || {};
      this.body = init.body;
    }
  }
  // @ts-expect-error: Simple Request polyfill for test environment
  global.Request = SimpleRequest;
}

// カスタムテストユーティリティ
const mockSupabaseResponse = (data, error = null) => {
  return {
    data,
    error,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
  };
};

// 医療系データのテスト用モックデータ
const mockClinicData = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'テスト整骨院',
  address: '東京都渋谷区テスト1-1-1',
  phone_number: '03-1234-5678',
  is_active: true,
};

const mockPatientData = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  name: 'テスト患者',
  gender: '男性',
  date_of_birth: '1990-01-01',
  clinic_id: '123e4567-e89b-12d3-a456-426614174000',
};

const mockStaffData = {
  id: '123e4567-e89b-12d3-a456-426614174002',
  name: 'テスト施術者',
  role: '施術者',
  is_therapist: true,
  clinic_id: '123e4567-e89b-12d3-a456-426614174000',
};

module.exports = {
  mockSupabaseResponse,
  mockClinicData,
  mockPatientData,
  mockStaffData,
};
