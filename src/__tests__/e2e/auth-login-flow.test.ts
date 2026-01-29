import { mockServerClient, supabaseMock } from './mocks/supabase-server.mock';
import { login, logout } from '@/app/admin/actions';

// モック適用
mockServerClient();

describe('Auth E2E flow (login/logout)', () => {
  test('completes login success path and redirects to dashboard', async () => {
    const formData = new FormData();
    formData.append('email', 'manager@example.com');
    formData.append('password', 'StrongPass123!');

    supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });

    await expect(login(null, formData)).rejects.toThrow('REDIRECT:/dashboard');
    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalled();
  });

  test('returns validation error when Supabase rejects credentials', async () => {
    const formData = new FormData();
    formData.append('email', 'bad@example.com');
    formData.append('password', 'wrong');

    supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid' },
    });

    await expect(login(null, formData)).resolves.toMatchObject({
      success: false,
      errors: expect.objectContaining({
        password: expect.arrayContaining([
          expect.stringContaining('パスワード'),
        ]),
      }),
    });
  });

  test('logs user out and redirects to login screen', async () => {
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });
    await expect(logout()).rejects.toThrow(
      'REDIRECT:/admin/login?message=ログアウトしました'
    );
    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
  });

  test('forces logout error path when signOut fails', async () => {
    supabaseMock.auth.signOut.mockResolvedValue({ error: { message: 'boom' } });
    await expect(logout()).rejects.toThrow(
      'REDIRECT:/admin/login?error=logout_failed'
    );
  });
});
