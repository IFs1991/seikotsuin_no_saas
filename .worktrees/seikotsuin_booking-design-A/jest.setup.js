// --- Environment Variables for Tests ---
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

// --- undici: Node に Web API を提供 ---
const {
  fetch,
  Request,
  Response,
  Headers,
  FormData,
  File,
  Blob,
} = require('undici');
global.fetch = fetch;
global.Request = Request;
global.Response = Response;
global.Headers = Headers;
global.FormData = FormData;
global.File = File;
global.Blob = Blob;

// Node < 20 対応（必要なら）
const { TextEncoder, TextDecoder } = require('util');
if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}
if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

const nodeCrypto = require('crypto');
if (!global.crypto) {
  Object.defineProperty(global, 'crypto', {
    value: nodeCrypto.webcrypto,
    configurable: true,
  });
}

// --- next/navigation.redirect を REDIRECT エラー化 ---
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
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    entries: () => [].values(),
  }),
  usePathname: () => '',
  useParams: () => ({}),
}));

// --- next/headers の cookies モック ---
jest.mock('next/headers', () => ({
  __esModule: true,
  cookies: () => ({
    get: name => ({ value: `mock-${name}` }),
    set: () => {},
    delete: () => {},
    getAll: () => [],
  }),
}));

// --- next/cache の revalidatePath モック ---
jest.mock('next/cache', () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));

require('./test/mocks/supabase-ssr');

// Load extended mocks and utilities
require('./jest.setup.after.js');
