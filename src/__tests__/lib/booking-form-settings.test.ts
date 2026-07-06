import {
  BookingFormSettingsSchema,
  DEFAULT_BOOKING_FORM_SETTINGS,
  isSafePublicLinkUrl,
  normalizeBookingFormSettings,
  sanitizeBookingFormSettings,
  validateBookingFormResponses,
  type BookingFormSettings,
} from '@/lib/booking-form/settings';

const buildSettings = (
  overrides: Partial<BookingFormSettings> = {}
): BookingFormSettings => ({
  ...DEFAULT_BOOKING_FORM_SETTINGS,
  ...overrides,
});

describe('booking form settings', () => {
  it('未保存設定はデフォルトに正規化する', () => {
    expect(normalizeBookingFormSettings(null)).toEqual(
      DEFAULT_BOOKING_FORM_SETTINGS
    );
  });

  it('公開API向けsanitizeはactiveな質問だけを返す', () => {
    const settings = buildSettings({
      questions: [
        {
          id: 'q_active',
          label: '来院理由',
          type: 'text',
          options: [],
          required: true,
          active: true,
          sortOrder: 2,
        },
        {
          id: 'q_inactive',
          label: '内部メモ',
          type: 'text',
          options: [],
          required: false,
          active: false,
          sortOrder: 1,
        },
      ],
    });

    expect(sanitizeBookingFormSettings(settings).questions).toEqual([
      settings.questions[0],
    ]);
  });

  it('質問数・ラベル長・選択肢数を検証する', () => {
    const tooManyQuestions = buildSettings({
      questions: Array.from({ length: 21 }, (_, index) => ({
        id: `q_${index}`,
        label: '質問',
        type: 'text',
        options: [],
        required: false,
        active: true,
        sortOrder: index + 1,
      })),
    });

    expect(BookingFormSettingsSchema.safeParse(tooManyQuestions).success).toBe(
      false
    );

    const tooLongLabel = buildSettings({
      questions: [
        {
          id: 'q_long',
          label: 'あ'.repeat(101),
          type: 'text',
          options: [],
          required: false,
          active: true,
          sortOrder: 1,
        },
      ],
    });

    expect(BookingFormSettingsSchema.safeParse(tooLongLabel).success).toBe(
      false
    );

    const tooManyOptions = buildSettings({
      questions: [
        {
          id: 'q_options',
          label: '選択',
          type: 'select',
          options: Array.from({ length: 21 }, (_, index) => `選択${index}`),
          required: false,
          active: true,
          sortOrder: 1,
        },
      ],
    });

    expect(BookingFormSettingsSchema.safeParse(tooManyOptions).success).toBe(
      false
    );
  });

  it('質問IDと同意欄IDの重複を拒否する', () => {
    const duplicateIds = buildSettings({
      questions: [
        {
          id: 'q_same',
          label: '質問1',
          type: 'text',
          options: [],
          required: false,
          active: true,
          sortOrder: 1,
        },
        {
          id: 'q_same',
          label: '質問2',
          type: 'text',
          options: [],
          required: false,
          active: true,
          sortOrder: 2,
        },
      ],
      consents: [
        {
          id: 'c_same',
          label: '同意1',
          required: true,
          linkUrl: '/privacy',
        },
        {
          id: 'c_same',
          label: '同意2',
          required: false,
          linkUrl: '/terms',
        },
      ],
    });

    expect(BookingFormSettingsSchema.safeParse(duplicateIds).success).toBe(
      false
    );
  });

  it('同意欄URLは危険なスキームを拒否する', () => {
    const unsafeUrl = buildSettings({
      consents: [
        {
          id: 'c_privacy',
          label: '個人情報の取り扱いに同意する',
          required: true,
          linkUrl: 'javascript:alert(1)',
        },
      ],
    });

    expect(BookingFormSettingsSchema.safeParse(unsafeUrl).success).toBe(false);

    const safeUrl = buildSettings({
      consents: [
        {
          id: 'c_privacy',
          label: '個人情報の取り扱いに同意する',
          required: true,
          linkUrl: '/privacy',
        },
      ],
    });

    expect(BookingFormSettingsSchema.safeParse(safeUrl).success).toBe(true);
  });

  it.each([
    ['/privacy', true],
    ['/terms', true],
    ['https://example.com/privacy', true],
    ['http://example.com/privacy', false],
    ['//example.com/privacy', false],
    ['/\\example.com/privacy', false],
    ['javascript:alert(1)', false],
  ])('isSafePublicLinkUrl(%s) は %s を返す', (url, expected) => {
    expect(isSafePublicLinkUrl(url)).toBe(expected);
  });

  it('同意欄URLはhttp URLをschema validation errorにする', () => {
    const settings = buildSettings({
      consents: [
        {
          id: 'c_privacy',
          label: '個人情報の取り扱いに同意する',
          required: true,
          linkUrl: 'http://example.com/privacy',
        },
      ],
    });

    expect(BookingFormSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it('sanitizeは不正な同意欄URLを公開API向けレスポンスから落とす', () => {
    const settings = buildSettings({
      consents: [
        {
          id: 'c_privacy',
          label: '個人情報の取り扱いに同意する',
          required: true,
          linkUrl: 'http://example.com/privacy',
        },
      ],
    });

    expect(sanitizeBookingFormSettings(settings).consents).toEqual([
      {
        id: 'c_privacy',
        label: '個人情報の取り扱いに同意する',
        required: true,
      },
    ]);
  });

  it('required未回答は失敗する', () => {
    const settings = buildSettings({
      questions: [
        {
          id: 'q_visit_reason',
          label: '来院のきっかけ',
          type: 'select',
          options: ['紹介', 'Web検索'],
          required: true,
          active: true,
          sortOrder: 1,
        },
      ],
      consents: [],
    });

    const result = validateBookingFormResponses({
      settings,
      standardFields: { phone: '09012345678' },
      responses: [],
      consents: {},
    });

    expect(result).toEqual({
      ok: false,
      message: '来院のきっかけは必須です',
    });
  });

  it('未知の質問IDは無視し、labelをスナップショットとして保存する', () => {
    const settings = buildSettings({
      questions: [
        {
          id: 'q_visit_reason',
          label: '来院のきっかけ',
          type: 'select',
          options: ['紹介', 'Web検索'],
          required: true,
          active: true,
          sortOrder: 1,
        },
      ],
      consents: [],
    });

    const result = validateBookingFormResponses({
      settings,
      standardFields: { phone: '09012345678' },
      responses: [
        { id: 'unknown', value: '保存しない' },
        { id: 'q_visit_reason', value: '紹介' },
      ],
      consents: {},
    });

    expect(result).toEqual({
      ok: true,
      snapshots: [
        { id: 'q_visit_reason', label: '来院のきっかけ', value: '紹介' },
      ],
    });
  });

  it('型不一致は失敗する', () => {
    const settings = buildSettings({
      questions: [
        {
          id: 'q_multi',
          label: '気になる症状',
          type: 'multiselect',
          options: ['肩', '腰'],
          required: false,
          active: true,
          sortOrder: 1,
        },
      ],
      consents: [],
    });

    const result = validateBookingFormResponses({
      settings,
      standardFields: { phone: '09012345678' },
      responses: [{ id: 'q_multi', value: '肩' }],
      consents: {},
    });

    expect(result).toEqual({
      ok: false,
      message: '気になる症状の回答形式が不正です',
    });
  });
});
