/**
 * @file password-recovery-schema.test.ts
 * @description パスワードリカバリー用スキーマのユニットテスト
 * @spec docs/パスワードリセット_実装タスクリスト_v0.1.md PR-01
 */

describe('passwordRecoverySchema', () => {
  const getAuthSchemas = () => require('@/lib/schemas/auth');

  beforeEach(() => {
    jest.resetModules();
  });

  describe('正常系', () => {
    test('有効な password / confirmPassword の一致で成功する', () => {
      const { passwordRecoverySchema } = getAuthSchemas();
      const result = passwordRecoverySchema.safeParse({
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass1',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('異常系', () => {
    test('confirmPassword が不一致の場合はエラーになる', () => {
      const { passwordRecoverySchema } = getAuthSchemas();
      const result = passwordRecoverySchema.safeParse({
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass2',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.confirmPassword).toContain(
          'パスワードが一致しません'
        );
      }
    });

    test('弱いパスワードは passwordSchema に従ってエラーになる', () => {
      const { passwordRecoverySchema } = getAuthSchemas();
      const result = passwordRecoverySchema.safeParse({
        password: 'weakpass',
        confirmPassword: 'weakpass',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.password?.length).toBeGreaterThan(
          0
        );
      }
    });
  });

  describe('既存スキーマとの分離', () => {
    test('passwordChangeSchema と別オブジェクトであり currentPassword を要求しない', () => {
      const { passwordRecoverySchema, passwordChangeSchema } = getAuthSchemas();

      expect(passwordRecoverySchema).not.toBe(passwordChangeSchema);

      const result = passwordRecoverySchema.safeParse({
        password: 'Secure@Pass1',
        confirmPassword: 'Secure@Pass1',
      });

      expect(result.success).toBe(true);
    });
  });
});
