import { jest } from '@jest/globals';
import { mockServerClient, supabaseMock } from './mocks/supabase-server.mock';
import { login } from '@/app/admin/actions';

mockServerClient();

describe('E2E Happy Path: Login → Dashboard → Daily Report', () => {
  test('completes full happy path: login → dashboard → daily report submission', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' }}, error: null });

    const loginFormData = new FormData();
    loginFormData.append('email', 'manager@example.com');
    loginFormData.append('password', 'StrongPass123!');

    await expect(login(null, loginFormData)).rejects.toThrow('REDIRECT:/dashboard');
  });
});
