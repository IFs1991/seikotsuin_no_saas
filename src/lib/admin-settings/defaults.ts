import { DEFAULT_BOOKING_CALENDAR_REMINDERS } from '@/lib/booking-calendar/settings';

/**
 * 管理設定 — カテゴリ定義とデフォルト値
 * PR-05: route.ts から分離
 */

export const VALID_CATEGORIES = [
  'clinic_basic',
  'clinic_hours',
  'booking_calendar',
  'booking_form',
  'communication',
  'system_security',
  'system_backup',
  'services_pricing',
  'insurance_billing',
  'data_management',
] as const;

export type SettingsCategory = (typeof VALID_CATEGORIES)[number];

export type SettingsRecord = Record<string, unknown>;

export const DEFAULT_SETTINGS: Record<
  SettingsCategory,
  Record<string, unknown>
> = {
  clinic_basic: {
    name: '',
    zipCode: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    website: '',
    description: '',
    logoUrl: null,
  },
  clinic_hours: {
    hoursByDay: {},
    holidays: [],
    specialClosures: [],
  },
  booking_calendar: {
    slotMinutes: 30,
    maxConcurrent: 3,
    weekStartDay: 1,
    allowOnlineBooking: false,
    maxAdvanceBookingDays: 30,
    minAdvanceBookingHours: 2,
    allowCancellation: true,
    cancellationDeadlineHours: 24,
    defaultCalendarView: 'week',
    reminders: DEFAULT_BOOKING_CALENDAR_REMINDERS,
  },
  booking_form: {
    fields: {
      nameKana: { enabled: true, required: false },
      phone: { enabled: true, required: true },
      email: { enabled: true, required: false },
      birthDate: { enabled: false, required: false },
      gender: { enabled: false, required: false },
      notes: { enabled: true, required: false },
    },
    staffSelection: 'optional',
    questions: [],
    consents: [],
    completionMessage: '',
  },
  communication: {
    channels: {
      emailEnabled: false,
      smsEnabled: false,
      lineEnabled: false,
      pushEnabled: false,
    },
    smtpSettings: {
      host: '',
      port: 587,
      username: '',
      secure: true,
    },
    templates: [],
  },
  system_security: {
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSymbols: false,
    },
    twoFactorEnabled: false,
    sessionTimeout: 30,
    loginAttempts: 5,
    lockoutDuration: 15,
  },
  system_backup: {
    autoBackup: false,
    backupFrequency: 'daily',
    backupTime: '03:00',
    retentionDays: 30,
    cloudStorage: false,
    storageProvider: 'aws',
  },
  services_pricing: {
    menus: [],
    categories: [],
    insuranceOptions: [],
  },
  insurance_billing: {
    insuranceTypes: [],
    receiptSettings: {},
    billingCycle: 'monthly',
  },
  data_management: {
    importMode: 'update',
    exportFormat: 'csv',
    retentionDays: 365,
  },
};
