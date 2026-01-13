// --- Environment Variables for Tests ---
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

// Node < 20 対応 - undiciより前に定義が必要
const { TextEncoder, TextDecoder } = require('util');
if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}
if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

// Web Streams API - undiciより前に定義が必要
const { ReadableStream, TransformStream, WritableStream } = require('stream/web');
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream;
}
if (!global.TransformStream) {
  global.TransformStream = TransformStream;
}
if (!global.WritableStream) {
  global.WritableStream = WritableStream;
}

// Node環境向け: undiciのためにMessagePortを定義（jsdomは別設定で無効化）
if (!globalThis.__DISABLE_MESSAGEPORT__ && !global.MessagePort) {
  const { MessageChannel, MessagePort } = require('worker_threads');
  global.MessageChannel = MessageChannel;
  global.MessagePort = MessagePort;
  Object.defineProperty(globalThis, 'MessageChannel', {
    value: MessageChannel,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'MessagePort', {
    value: MessagePort,
    configurable: true,
    writable: true,
  });
  // undici がグローバル識別子として参照するため
  // eslint-disable-next-line no-eval
  eval('var MessageChannel = global.MessageChannel; var MessagePort = global.MessagePort;');
}

// NOTE: MessageChannel/MessagePort は jest.setup.messagechannel.ts で
// 意図的に undefined に設定されています。React scheduler が setTimeout
// フォールバックを使用するようにするため、ここでは再定義しません。

// BroadcastChannel のみ必要に応じて定義
const { BroadcastChannel } = require('worker_threads');
if (!global.BroadcastChannel) {
  global.BroadcastChannel = BroadcastChannel;
}

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
