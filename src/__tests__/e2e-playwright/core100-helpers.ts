import { expect, type APIResponse, type Page } from '@playwright/test';
import { z } from 'zod';

export const idSchema = z.object({ id: z.string().uuid() });
export const customerSchema = idSchema.extend({ name: z.string() });
export const reservationSchema = idSchema.extend({
  customerId: z.string().uuid(),
  staffId: z.string().uuid(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.string(),
  notes: z.string().nullable().optional(),
});

export function requireLocalCore100Environment(baseURL: string | undefined) {
  if (!baseURL || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(
      'Core100 E2E requires explicit local app and Supabase URLs.'
    );
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const value of [baseURL, process.env.NEXT_PUBLIC_SUPABASE_URL]) {
    const url = new URL(value);
    if (!localHosts.has(url.hostname)) {
      throw new Error(
        'Core100 mutation tests require disposable local fixtures.'
      );
    }
  }
  return new URL(baseURL).origin;
}

export async function readSuccess<Output>(
  response: APIResponse,
  schema: z.ZodType<Output>,
  status = 200
): Promise<Output> {
  expect(response.status(), response.url()).toBe(status);
  const body: unknown = await response.json();
  const envelope = z
    .object({ success: z.literal(true), data: z.unknown() })
    .parse(body);
  return schema.parse(envelope.data);
}

export async function loginThroughForm(
  page: Page,
  account: {
    email: string;
    password: string;
    id: string;
    clinicId: string;
    role: string;
  }
) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill(account.email);
  await page.getByLabel('パスワード', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(
    /\/(dashboard|reservations|admin|manager)(?:\/|\?|$)/
  );
  const profile = await readSuccess(
    await page.request.get('/api/auth/profile'),
    z.object({
      id: z.string().uuid(),
      clinicId: z.string().uuid(),
      role: z.string(),
      isActive: z.boolean(),
    })
  );
  expect(profile).toEqual({
    id: account.id,
    clinicId: account.clinicId,
    role: account.role,
    isActive: true,
  });
}
