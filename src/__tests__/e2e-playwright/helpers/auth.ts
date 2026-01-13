import { Page } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STAFF_EMAIL,
  STAFF_PASSWORD,
} from '../fixtures';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000';

const createCookieClient = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables for E2E auth.');
  }

  const cookieStore = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name);
      },
      set(name: string, value: string) {
        cookieStore.set(name, value);
      },
      remove(name: string) {
        cookieStore.delete(name);
      },
    },
  });

  return { supabase, cookieStore };
};

const applyCookies = async (page: Page, cookieStore: Map<string, string>) => {
  const cookies = Array.from(cookieStore.entries()).map(([name, value]) => ({
    name,
    value,
    url: BASE_URL,
  }));

  if (cookies.length > 0) {
    await page.context().addCookies(cookies);
  }
};

const signInWithCookies = async (
  page: Page,
  email: string,
  password: string,
  destination: string
) => {
  const { supabase, cookieStore } = createCookieClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error('E2E login failed to create a session.');
  }

  await applyCookies(page, cookieStore);
  await page.goto(destination, { waitUntil: 'domcontentloaded' });
};

export async function loginAsAdmin(page: Page) {
  await signInWithCookies(page, ADMIN_EMAIL, ADMIN_PASSWORD, '/admin/settings');
}

export async function loginAsStaff(page: Page) {
  await signInWithCookies(page, STAFF_EMAIL, STAFF_PASSWORD, '/dashboard');
}
