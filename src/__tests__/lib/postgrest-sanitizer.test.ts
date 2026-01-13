import { sanitizePostgrestValue, buildSafeSearchFilter, isValidSearchInput } from '@/lib/postgrest-sanitizer';

describe('PostgREST Sanitizer (Allowlist方式)', () => {
  describe('sanitizePostgrestValue', () => {
    it('通常の文字列はそのまま返す', () => {
      expect(sanitizePostgrestValue('田中太郎')).toBe('田中太郎');
      expect(sanitizePostgrestValue('tanaka')).toBe('tanaka');
      expect(sanitizePostgrestValue('090-1234-5678')).toBe('090-1234-5678');
    });

    it('PostgREST特殊文字（カンマ）を削除する', () => {
      // カンマはフィルター区切り文字 - Allowlistにないので削除
      expect(sanitizePostgrestValue('test,injection')).toBe('testinjection');
    });

    it('ピリオドは許可する（メールアドレス用）', () => {
      // ピリオドはメールアドレス検索で必要なため許可
      expect(sanitizePostgrestValue('test.injection')).toBe('test.injection');
      expect(sanitizePostgrestValue('user@example.com')).toBe('user@example.com');
    });

    it('パーセント記号を削除する', () => {
      // パーセントはワイルドカード - 削除
      expect(sanitizePostgrestValue('100%')).toBe('100');
    });

    it('括弧を削除する', () => {
      expect(sanitizePostgrestValue('test(injection)')).toBe('testinjection');
      expect(sanitizePostgrestValue('test[injection]')).toBe('testinjection');
    });

    it('複合的なインジェクション試行から危険な文字を削除する', () => {
      const malicious = '%,is_deleted.eq.true,name.ilike.%';
      const sanitized = sanitizePostgrestValue(malicious);
      // カンマとパーセントが削除される
      expect(sanitized).not.toContain('%');
      expect(sanitized).not.toContain(',');
      // 安全な文字のみ残る
      expect(sanitized).toBe('is_deleted.eq.truename.ilike.');
    });

    it('空文字列を処理する', () => {
      expect(sanitizePostgrestValue('')).toBe('');
    });

    it('null/undefinedを安全に処理する', () => {
      expect(sanitizePostgrestValue(null as unknown as string)).toBe('');
      expect(sanitizePostgrestValue(undefined as unknown as string)).toBe('');
    });

    it('Unicode文字を正しく処理する', () => {
      expect(sanitizePostgrestValue('佐藤花子')).toBe('佐藤花子');
      expect(sanitizePostgrestValue('カタカナ')).toBe('カタカナ');
      expect(sanitizePostgrestValue('ひらがな')).toBe('ひらがな');
    });

    it('全角文字を正しく処理する', () => {
      expect(sanitizePostgrestValue('０９０ー１２３４ー５６７８')).toBe('０９０ー１２３４ー５６７８');
    });
  });

  describe('isValidSearchInput', () => {
    it('許可された文字のみの入力はtrueを返す', () => {
      expect(isValidSearchInput('田中太郎')).toBe(true);
      expect(isValidSearchInput('tanaka')).toBe(true);
      expect(isValidSearchInput('090-1234-5678')).toBe(true);
      expect(isValidSearchInput('user@example.com')).toBe(true);
    });

    it('危険な文字を含む入力はfalseを返す', () => {
      expect(isValidSearchInput('test,injection')).toBe(false);
      expect(isValidSearchInput('100%')).toBe(false);
      expect(isValidSearchInput('test()')).toBe(false);
    });

    it('空文字列はtrueを返す', () => {
      expect(isValidSearchInput('')).toBe(true);
    });
  });

  describe('buildSafeSearchFilter', () => {
    it('単一カラムの検索フィルターを構築する', () => {
      const filter = buildSafeSearchFilter('田中', ['name']);
      expect(filter).toBe('name.ilike.%田中%');
    });

    it('複数カラムの検索フィルターを構築する', () => {
      const filter = buildSafeSearchFilter('田中', ['name', 'phone']);
      expect(filter).toBe('name.ilike.%田中%,phone.ilike.%田中%');
    });

    it('特殊文字を含むクエリから危険な文字を削除して処理する', () => {
      const filter = buildSafeSearchFilter('test,injection', ['name']);
      // カンマが削除されて安全に処理
      expect(filter).toBe('name.ilike.%testinjection%');
    });

    it('空のクエリでnullを返す', () => {
      expect(buildSafeSearchFilter('', ['name'])).toBeNull();
      expect(buildSafeSearchFilter('   ', ['name'])).toBeNull();
    });

    it('clinic_idインジェクション試行を防ぐ', () => {
      const maliciousQuery = '%,clinic_id.neq.550e8400,name.ilike.%';
      const filter = buildSafeSearchFilter(maliciousQuery, ['name']);
      // カンマとパーセントが削除されるため、インジェクションは成立しない
      expect(filter).not.toContain(',clinic_id');
      expect(filter).not.toContain('%,');
    });

    it('メールアドレス検索が正しく動作する', () => {
      const filter = buildSafeSearchFilter('user@example.com', ['email']);
      expect(filter).toBe('email.ilike.%user@example.com%');
    });
  });
});
