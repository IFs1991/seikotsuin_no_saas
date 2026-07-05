/**
 * 管理設定 — カテゴリごとの Zod バリデーションスキーマ
 * PR-05: route.ts から分離
 */

import { z } from 'zod';
import type { SettingsCategory } from './defaults';
import { BookingCalendarRemindersSchema } from '@/lib/booking-calendar/settings';
import { BookingFormSettingsSchema } from '@/lib/booking-form/settings';

const ClinicBasicSchema = z.object({
  name: z.string().min(1, '院名は必須です'),
  zipCode: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z
    .string()
    .email('有効なメールアドレスを入力してください')
    .optional()
    .or(z.literal('')),
  website: z
    .string()
    .url('有効なURLを入力してください')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(500, '紹介文は500文字以内で入力してください')
    .optional(),
  logoUrl: z.string().nullable().optional(),
});

const ClinicHoursSchema = z.object({
  hoursByDay: z.record(z.unknown()).optional(),
  holidays: z.array(z.string()).optional(),
  specialClosures: z.array(z.unknown()).optional(),
});

const BookingCalendarSchema = z.object({
  slotMinutes: z
    .number()
    .min(5, '予約枠は5分以上にしてください')
    .max(180, '予約枠は180分以内にしてください')
    .optional(),
  maxConcurrent: z
    .number()
    .min(1, '同時予約数は1以上にしてください')
    .max(100)
    .optional(),
  weekStartDay: z.number().min(0).max(6).optional(),
  allowOnlineBooking: z.boolean().optional(),
  maxAdvanceBookingDays: z.number().min(1).max(365).optional(),
  minAdvanceBookingHours: z.number().min(0).max(48).optional(),
  allowCancellation: z.boolean().optional(),
  cancellationDeadlineHours: z.number().min(0).max(168).optional(),
  defaultCalendarView: z.enum(['day', 'week', 'month']).optional(),
  reminders: BookingCalendarRemindersSchema.optional(),
});

const CommunicationChannelsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  lineEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
});

const CommunicationSmtpSchema = z.object({
  host: z.string().optional(),
  port: z.number().min(1).max(65535).optional(),
  username: z.string().optional(),
  secure: z.boolean().optional(),
});

const CommunicationSchema = z.object({
  channels: CommunicationChannelsSchema.optional(),
  smtpSettings: CommunicationSmtpSchema.optional(),
  templates: z.array(z.unknown()).optional(),
});

const SystemSecuritySchema = z.object({
  passwordPolicy: z
    .object({
      minLength: z.number().min(4).max(128).optional(),
      requireUppercase: z.boolean().optional(),
      requireNumbers: z.boolean().optional(),
      requireSymbols: z.boolean().optional(),
    })
    .optional(),
  twoFactorEnabled: z.boolean().optional(),
  sessionTimeout: z.number().min(5).max(480).optional(),
  loginAttempts: z.number().min(1).max(10).optional(),
  lockoutDuration: z.number().min(1).max(1440).optional(),
});

const SystemBackupSchema = z.object({
  autoBackup: z.boolean().optional(),
  backupFrequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  backupTime: z.string().optional(),
  retentionDays: z.number().min(1).max(365).optional(),
  cloudStorage: z.boolean().optional(),
  storageProvider: z.enum(['aws', 'gcp', 'azure']).optional(),
});

const ServicesPricingSchema = z.object({
  menus: z.array(z.unknown()).optional(),
  categories: z.array(z.unknown()).optional(),
  insuranceOptions: z.array(z.unknown()).optional(),
});

const InsuranceBillingSchema = z.object({
  insuranceTypes: z.array(z.unknown()).optional(),
  receiptSettings: z.record(z.unknown()).optional(),
  billingCycle: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
});

const DataManagementSchema = z.object({
  importMode: z.enum(['update', 'replace', 'merge']).optional(),
  exportFormat: z.enum(['csv', 'excel', 'pdf', 'json']).optional(),
  retentionDays: z.number().min(30).max(3650).optional(),
});

export const CATEGORY_SCHEMAS: Record<SettingsCategory, z.ZodTypeAny> = {
  clinic_basic: ClinicBasicSchema,
  clinic_hours: ClinicHoursSchema,
  booking_calendar: BookingCalendarSchema,
  booking_form: BookingFormSettingsSchema,
  communication: CommunicationSchema,
  system_security: SystemSecuritySchema,
  system_backup: SystemBackupSchema,
  services_pricing: ServicesPricingSchema,
  insurance_billing: InsuranceBillingSchema,
  data_management: DataManagementSchema,
};
