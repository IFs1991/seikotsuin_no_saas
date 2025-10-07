// --- Environment Variables for Tests ---
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

// --- undici: Node に Web API を提供 ---
const { fetch, Request, Response, Headers, FormData, File, Blob } = require('undici');
global.fetch = fetch;
global.Request = Request;
global.Response = Response;
global.Headers = Headers;
global.FormData = FormData;
global.File = File;
global.Blob = Blob;

// Node < 20 対応（必要なら）
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

// --- next/navigation.redirect を REDIRECT エラー化 ---
jest.mock('next/navigation', () => ({
  __esModule: true,
  redirect: (path) => { throw new Error(`REDIRECT:${path}`); },
}));

// --- next/headers の cookies モック ---
jest.mock('next/headers', () => ({
  __esModule: true,
  cookies: () => ({
    get: (name) => ({ value: `mock-${name}` }),
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
