import {
  customersQuerySchema,
  decodeCustomerCursor,
  encodeCustomerCursor,
  searchQuerySchema,
} from '@/app/api/customers/schema';

describe('customersQuerySchema', () => {
  describe('検索クエリ (q) バリデーション', () => {
    it('有効な検索クエリを受け入れる', () => {
      const validCases = [
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000', q: '田中' },
        {
          clinic_id: '550e8400-e29b-41d4-a716-446655440000',
          q: '090-1234-5678',
        },
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000', q: 'tanaka' },
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000', q: '田中 太郎' },
        { clinic_id: '550e8400-e29b-41d4-a716-446655440000' }, // qはオプション
      ];

      validCases.forEach(testCase => {
        const result = customersQuerySchema.safeParse(testCase);
        expect(result.success).toBe(true);
      });
    });

    it('長すぎる検索クエリを拒否する（100文字超）', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('q');
      }
    });

    it('100文字ちょうどの検索クエリを受け入れる', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: 'a'.repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it('空白のみの検索クエリをundefinedに変換する', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: '   ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBeUndefined();
      }
    });

    it('前後の空白をトリムする', () => {
      const result = customersQuerySchema.safeParse({
        clinic_id: '550e8400-e29b-41d4-a716-446655440000',
        q: '  田中  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe('田中');
      }
    });
  });

  describe('ページング', () => {
    const clinicId = '550e8400-e29b-41d4-a716-446655440000';

    it('limitを省略すると50件、最大100件まで受け入れる', () => {
      const defaultResult = customersQuerySchema.safeParse({
        clinic_id: clinicId,
      });
      expect(defaultResult.success).toBe(true);
      if (defaultResult.success) {
        expect(defaultResult.data.limit).toBe(50);
      }

      const maxResult = customersQuerySchema.safeParse({
        clinic_id: clinicId,
        limit: '100',
      });
      expect(maxResult.success).toBe(true);
      if (maxResult.success) {
        expect(maxResult.data.limit).toBe(100);
      }
    });

    it('上限超過・小数・非数のlimitを拒否する', () => {
      for (const limit of ['101', '1.5', 'not-a-number']) {
        expect(
          customersQuerySchema.safeParse({ clinic_id: clinicId, limit }).success
        ).toBe(false);
      }
    });

    it('不透明カーソルを往復し、改ざんされた値を拒否する', () => {
      const cursorPayload = {
        createdAt: '2026-07-10T01:02:03.000Z',
        id: '123e4567-e89b-12d3-a456-426614174001',
      };
      const cursor = encodeCustomerCursor(cursorPayload);

      expect(decodeCustomerCursor(cursor)).toEqual(cursorPayload);
      expect(
        customersQuerySchema.safeParse({
          clinic_id: clinicId,
          cursor,
        }).success
      ).toBe(true);
      expect(
        customersQuerySchema.safeParse({
          clinic_id: clinicId,
          cursor: `${cursor}tampered`,
        }).success
      ).toBe(false);
    });
  });
});

describe('searchQuerySchema', () => {
  it('日本語文字を許可する', () => {
    expect(searchQuerySchema.safeParse('漢字ひらがなカタカナ').success).toBe(
      true
    );
  });

  it('英数字を許可する', () => {
    expect(searchQuerySchema.safeParse('abc123').success).toBe(true);
  });

  it('電話番号形式を許可する', () => {
    expect(searchQuerySchema.safeParse('090-1234-5678').success).toBe(true);
    expect(searchQuerySchema.safeParse('03-1234-5678').success).toBe(true);
  });

  it('スペースを許可する', () => {
    expect(searchQuerySchema.safeParse('田中 太郎').success).toBe(true);
  });

  it('特殊文字を含む入力もバリデーションを通過する（サニタイザーで処理）', () => {
    // 特殊文字はスキーマレベルでは許可し、サニタイザーでエスケープする
    const cases = ['%%%', '...', ',,,', '()'];
    cases.forEach(testCase => {
      const result = searchQuerySchema.safeParse(testCase);
      expect(result.success).toBe(true);
    });
  });

  it('空文字列はundefinedに変換される', () => {
    const result = searchQuerySchema.safeParse('');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });
});
