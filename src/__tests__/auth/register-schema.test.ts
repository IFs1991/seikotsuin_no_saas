/**
 * @file register-schema.test.ts
 * @description 初回オーナー登録専用スキーマのユニットテスト
 * @spec docs/初回ユーザー登録_UIUX機能一体仕様書_v0.2.md Section 6.2
 *
 * TDD: 🔴 Red phase - このテストは schema.ts 実装前に書かれた失敗テスト
 */

describe('registerSchema', () => {
  // スキーマが存在しない間は全テストをスキップせずに失敗させる
  const getSchema = () => require('@/app/(public)/register/schema').registerSchema;

  beforeEach(() => {
    jest.resetModules();
  });

  // ================================================================
  // 正常系
  // ================================================================
  describe('正常系', () => {
    test('有効な email / password / termsAccepted=true で成功する', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'Secure@Pass1',
        termsAccepted: true,
      });
      expect(result.success).toBe(true);
    });

    test('メールアドレスは trim・lowercase される', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: '  OWNER@CLINIC.COM  ',
        password: 'Secure@Pass1',
        termsAccepted: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('owner@clinic.com');
      }
    });
  });

  // ================================================================
  // email バリデーション
  // ================================================================
  describe('email バリデーション', () => {
    test('メールアドレスが空の場合はエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: '',
        password: 'Secure@Pass1',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });

    test('不正なメール形式はエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'not-an-email',
        password: 'Secure@Pass1',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });

    test('254文字超のメールアドレスはエラー', () => {
      const schema = getSchema();
      // emailSchema.max(254) なので 255 文字はエラー
      const longEmail = 'a'.repeat(246) + '@test.com'; // 246+9 = 255 chars
      const result = schema.safeParse({
        email: longEmail,
        password: 'Secure@Pass1',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });
  });

  // ================================================================
  // password バリデーション（signupSchema と同じポリシー）
  // ================================================================
  describe('password バリデーション', () => {
    test('パスワードが空の場合はエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: '',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });

    test('8文字未満のパスワードはエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'S@c1',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });

    test('大文字なしパスワードはエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'secure@pass1',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });

    test('数字なしパスワードはエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'Secure@Pass',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });

    test('特殊文字なしパスワードはエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'SecurePass1',
        termsAccepted: true,
      });
      expect(result.success).toBe(false);
    });
  });

  // ================================================================
  // termsAccepted バリデーション
  // ================================================================
  describe('termsAccepted バリデーション', () => {
    test('termsAccepted=false の場合はエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'Secure@Pass1',
        termsAccepted: false,
      });
      expect(result.success).toBe(false);
    });

    test('termsAccepted 未指定の場合はエラー', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'Secure@Pass1',
      });
      expect(result.success).toBe(false);
    });

    test('termsAccepted エラーメッセージに "利用規約" が含まれる', () => {
      const schema = getSchema();
      const result = schema.safeParse({
        email: 'owner@clinic.com',
        password: 'Secure@Pass1',
        termsAccepted: false,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const termsErrors = result.error.flatten().fieldErrors.termsAccepted;
        expect(termsErrors?.some(e => e.includes('利用規約'))).toBe(true);
      }
    });
  });

  // ================================================================
  // signupSchema との独立性（AC-06 回帰保護）
  // ================================================================
  describe('signupSchema との独立性', () => {
    test('signupSchema は termsAccepted なしで成功する（互換破壊なし）', () => {
      const { signupSchema } = require('@/lib/schemas/auth');
      const result = signupSchema.safeParse({
        email: 'owner@clinic.com',
        password: 'Secure@Pass1',
      });
      expect(result.success).toBe(true);
    });

    test('registerSchema と signupSchema は別オブジェクトである', () => {
      const { registerSchema } = require('@/app/(public)/register/schema');
      const { signupSchema } = require('@/lib/schemas/auth');
      expect(registerSchema).not.toBe(signupSchema);
    });
  });
});
