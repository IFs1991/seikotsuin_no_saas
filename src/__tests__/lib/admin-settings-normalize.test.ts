/**
 * PR-05: admin-settings normalize / defaults / schemas 抽出テスト
 *
 * 先に固定する観点:
 *   - communication category の normalize 結果
 *   - GET default 値（全カテゴリにデフォルトがある）
 *   - PUT schema validation
 *   - smtpSettings.password 非保存契約
 */

import {
  normalizeCommunicationSettings,
} from '@/lib/admin-settings/normalize';
import {
  DEFAULT_SETTINGS,
  VALID_CATEGORIES,
  type SettingsCategory,
} from '@/lib/admin-settings/defaults';
import { CATEGORY_SCHEMAS } from '@/lib/admin-settings/schemas';

// ─── defaults ────────────────────────────────────────────────────────

describe('DEFAULT_SETTINGS', () => {
  it('全カテゴリにデフォルト値がある', () => {
    for (const cat of VALID_CATEGORIES) {
      expect(DEFAULT_SETTINGS[cat]).toBeDefined();
    }
  });

  it('communication デフォルトは channels / smtpSettings / templates を持つ', () => {
    const comm = DEFAULT_SETTINGS.communication;
    expect(comm.channels).toEqual({
      emailEnabled: false,
      smsEnabled: false,
      lineEnabled: false,
      pushEnabled: false,
    });
    expect(comm.smtpSettings).toEqual({
      host: '',
      port: 587,
      username: '',
      secure: true,
    });
    expect(comm.templates).toEqual([]);
  });

  it('booking_calendar デフォルトに slotMinutes=30 がある', () => {
    expect(DEFAULT_SETTINGS.booking_calendar.slotMinutes).toBe(30);
  });
});

// ─── schemas ─────────────────────────────────────────────────────────

describe('CATEGORY_SCHEMAS', () => {
  it('全カテゴリにスキーマが対応している', () => {
    for (const cat of VALID_CATEGORIES) {
      expect(CATEGORY_SCHEMAS[cat]).toBeDefined();
      expect(typeof CATEGORY_SCHEMAS[cat].safeParse).toBe('function');
    }
  });

  it('clinic_basic: name 空文字はバリデーション失敗', () => {
    const result = CATEGORY_SCHEMAS.clinic_basic.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('clinic_basic: 正常値はバリデーション成功', () => {
    const result = CATEGORY_SCHEMAS.clinic_basic.safeParse({ name: 'テスト院' });
    expect(result.success).toBe(true);
  });

  it('booking_calendar: slotMinutes が負値でバリデーション失敗', () => {
    const result = CATEGORY_SCHEMAS.booking_calendar.safeParse({
      slotMinutes: -10,
    });
    expect(result.success).toBe(false);
  });

  it('booking_calendar: slotMinutes=30 は成功', () => {
    const result = CATEGORY_SCHEMAS.booking_calendar.safeParse({
      slotMinutes: 30,
    });
    expect(result.success).toBe(true);
  });
});

// ─── normalizeCommunicationSettings ──────────────────────────────────

describe('normalizeCommunicationSettings', () => {
  it('null / undefined 入力にデフォルトを返す', () => {
    expect(normalizeCommunicationSettings(null)).toEqual(
      DEFAULT_SETTINGS.communication
    );
    expect(normalizeCommunicationSettings(undefined)).toEqual(
      DEFAULT_SETTINGS.communication
    );
  });

  it('legacy flat 形式（channels なし）を正規化する', () => {
    const legacy = {
      emailEnabled: true,
      smsEnabled: false,
      lineEnabled: true,
      pushEnabled: false,
      smtpSettings: {
        host: 'smtp.example.com',
        port: 2525,
        user: 'legacy-user',
        password: 'stored-secret',
      },
      templates: [],
    };

    const result = normalizeCommunicationSettings(legacy);

    expect(result).toEqual({
      channels: {
        emailEnabled: true,
        smsEnabled: false,
        lineEnabled: true,
        pushEnabled: false,
      },
      smtpSettings: {
        host: 'smtp.example.com',
        port: 2525,
        username: 'legacy-user',
        secure: true, // デフォルト
      },
      templates: [],
    });
    // password は結果に含まれない
    expect((result.smtpSettings as Record<string, unknown>).password).toBeUndefined();
  });

  it('nested channels 形式をそのまま正規化する', () => {
    const nested = {
      channels: {
        emailEnabled: true,
        smsEnabled: true,
        lineEnabled: false,
        pushEnabled: true,
      },
      smtpSettings: {
        host: 'smtp.secure-off.example.com',
        port: 587,
        user: 'legacy-user-2',
        secure: false,
        password: 'should-not-return',
      },
      templates: [],
    };

    const result = normalizeCommunicationSettings(nested);

    expect(result.channels).toEqual({
      emailEnabled: true,
      smsEnabled: true,
      lineEnabled: false,
      pushEnabled: true,
    });
    expect(result.smtpSettings.secure).toBe(false);
    expect(result.smtpSettings.username).toBe('legacy-user-2');
    expect((result.smtpSettings as Record<string, unknown>).password).toBeUndefined();
  });

  it('username が存在する場合は user より username を優先する', () => {
    const input = {
      smtpSettings: {
        host: 'smtp.example.com',
        port: 587,
        username: 'new-user',
        user: 'old-user',
        secure: true,
      },
    };

    const result = normalizeCommunicationSettings(input);
    expect(result.smtpSettings.username).toBe('new-user');
  });

  it('templates が配列でなければデフォルト（空配列）にフォールバックする', () => {
    const input = {
      templates: 'not-an-array',
    };

    const result = normalizeCommunicationSettings(input);
    expect(result.templates).toEqual([]);
  });
});
