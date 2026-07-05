import { z } from 'zod';

export const BOOKING_FORM_STANDARD_FIELD_KEYS = [
  'nameKana',
  'phone',
  'email',
  'birthDate',
  'gender',
  'notes',
] as const;

export const BOOKING_FORM_QUESTION_TYPES = [
  'text',
  'textarea',
  'select',
  'multiselect',
  'boolean',
] as const;

export const BOOKING_FORM_STAFF_SELECTION_VALUES = [
  'required',
  'optional',
  'hidden',
] as const;

export type BookingFormStandardFieldKey =
  (typeof BOOKING_FORM_STANDARD_FIELD_KEYS)[number];
export type BookingFormQuestionType =
  (typeof BOOKING_FORM_QUESTION_TYPES)[number];
export type BookingFormStaffSelection =
  (typeof BOOKING_FORM_STAFF_SELECTION_VALUES)[number];
export type BookingFormResponseValue = string | boolean | string[];

export type BookingFormFieldSetting = {
  enabled: boolean;
  required: boolean;
};

export type BookingFormQuestion = {
  id: string;
  label: string;
  type: BookingFormQuestionType;
  options: string[];
  required: boolean;
  active: boolean;
  sortOrder: number;
};

export type BookingFormConsent = {
  id: string;
  label: string;
  required: boolean;
  linkUrl?: string;
};

export type BookingFormSettings = {
  fields: Record<BookingFormStandardFieldKey, BookingFormFieldSetting>;
  staffSelection: BookingFormStaffSelection;
  questions: BookingFormQuestion[];
  consents: BookingFormConsent[];
  completionMessage: string;
};

export type PublicBookingFormSettings = {
  fields: BookingFormSettings['fields'];
  staffSelection: BookingFormStaffSelection;
  questions: BookingFormQuestion[];
  consents: BookingFormConsent[];
  completionMessage: string;
  turnstile_site_key?: string;
  liff_id?: string;
};

export type IntakeResponseSnapshot = {
  id: string;
  label: string;
  value: BookingFormResponseValue;
};

export type BookingFormValidationInput = {
  settings: BookingFormSettings;
  standardFields: Partial<Record<BookingFormStandardFieldKey, string>>;
  responses: { id: string; value: BookingFormResponseValue }[];
  consents: Record<string, boolean>;
};

export type BookingFormValidationResult =
  | { ok: true; snapshots: IntakeResponseSnapshot[] }
  | { ok: false; message: string };

const fieldSettingSchema = z
  .object({
    enabled: z.boolean(),
    required: z.boolean(),
  })
  .required();

export const bookingFormQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(100),
    type: z.enum(BOOKING_FORM_QUESTION_TYPES),
    options: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    required: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(999),
  })
  .required()
  .superRefine((question, ctx) => {
    if (
      (question.type === 'select' || question.type === 'multiselect') &&
      question.options.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: '選択式の質問には選択肢が必要です',
      });
    }
  });

export const bookingFormConsentSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(100),
    required: z.boolean(),
    linkUrl: z
      .string()
      .trim()
      .max(500)
      .refine(
        value => value.length === 0 || isSafePublicLinkUrl(value),
        '同意欄URLは相対パスまたはhttps/http URLで入力してください'
      )
      .optional()
      .or(z.literal('')),
  })
  .required();

export const BookingFormSettingsSchema = z
  .object({
    fields: z.object({
      nameKana: fieldSettingSchema,
      phone: fieldSettingSchema,
      email: fieldSettingSchema,
      birthDate: fieldSettingSchema,
      gender: fieldSettingSchema,
      notes: fieldSettingSchema,
    }),
    staffSelection: z.enum(BOOKING_FORM_STAFF_SELECTION_VALUES),
    questions: z.array(bookingFormQuestionSchema).max(20),
    consents: z.array(bookingFormConsentSchema).max(10),
    completionMessage: z.string().trim().max(500).default(''),
  })
  .required()
  .superRefine((settings, ctx) => {
    const questionIds = new Set<string>();
    settings.questions.forEach((question, index) => {
      if (questionIds.has(question.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['questions', index, 'id'],
          message: '質問IDは重複できません',
        });
      }
      questionIds.add(question.id);
    });

    const consentIds = new Set<string>();
    settings.consents.forEach((consent, index) => {
      if (consentIds.has(consent.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['consents', index, 'id'],
          message: '同意欄IDは重複できません',
        });
      }
      consentIds.add(consent.id);
    });
  });

export const DEFAULT_BOOKING_FORM_SETTINGS: BookingFormSettings = {
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
};

const STANDARD_FIELD_LABELS: Record<BookingFormStandardFieldKey, string> = {
  nameKana: 'ふりがな',
  phone: '電話番号',
  email: 'メールアドレス',
  birthDate: '生年月日',
  gender: '性別',
  notes: '相談内容・メモ',
};

function cloneDefaultSettings(): BookingFormSettings {
  return structuredClone(DEFAULT_BOOKING_FORM_SETTINGS) as BookingFormSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSafePublicLinkUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isQuestionType(value: unknown): value is BookingFormQuestionType {
  return BOOKING_FORM_QUESTION_TYPES.some(type => type === value);
}

function isStaffSelection(value: unknown): value is BookingFormStaffSelection {
  return BOOKING_FORM_STAFF_SELECTION_VALUES.some(option => option === value);
}

function sortQuestions(
  questions: BookingFormQuestion[]
): BookingFormQuestion[] {
  return [...questions].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

export function normalizeBookingFormSettings(
  value: unknown
): BookingFormSettings {
  const defaults = cloneDefaultSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  const fieldsRecord = isRecord(value.fields) ? value.fields : {};
  const fields = BOOKING_FORM_STANDARD_FIELD_KEYS.reduce<
    BookingFormSettings['fields']
  >((acc, field) => {
    const rawField = isRecord(fieldsRecord[field]) ? fieldsRecord[field] : {};
    acc[field] = {
      enabled: readBoolean(rawField.enabled, defaults.fields[field].enabled),
      required: readBoolean(rawField.required, defaults.fields[field].required),
    };
    return acc;
  }, cloneDefaultSettings().fields);

  const rawQuestions = Array.isArray(value.questions)
    ? value.questions
        .map((question, index): BookingFormQuestion | null => {
          if (!isRecord(question)) return null;
          const id = readString(question.id, '');
          const label = readString(question.label, '');
          if (!id || !label || label.length > 100) return null;
          const type = isQuestionType(question.type) ? question.type : 'text';
          const options = Array.isArray(question.options)
            ? question.options
                .filter(
                  (option): option is string =>
                    typeof option === 'string' &&
                    option.trim().length > 0 &&
                    option.trim().length <= 50
                )
                .map(option => option.trim())
                .slice(0, 20)
            : [];
          return {
            id,
            label,
            type,
            options: type === 'select' || type === 'multiselect' ? options : [],
            required: readBoolean(question.required, false),
            active: readBoolean(question.active, true),
            sortOrder: readNumber(question.sortOrder, index + 1),
          };
        })
        .filter(
          (question): question is BookingFormQuestion => question !== null
        )
        .slice(0, 20)
    : defaults.questions;
  const seenQuestionIds = new Set<string>();
  const questions = rawQuestions.filter(question => {
    if (seenQuestionIds.has(question.id)) return false;
    seenQuestionIds.add(question.id);
    return true;
  });

  const rawConsents = Array.isArray(value.consents)
    ? value.consents
        .map((consent): BookingFormConsent | null => {
          if (!isRecord(consent)) return null;
          const id = readString(consent.id, '');
          const label = readString(consent.label, '');
          if (!id || !label || label.length > 100) return null;
          const linkUrl = readString(consent.linkUrl, '');
          return {
            id,
            label,
            required: readBoolean(consent.required, false),
            ...(linkUrl && isSafePublicLinkUrl(linkUrl) ? { linkUrl } : {}),
          };
        })
        .filter((consent): consent is BookingFormConsent => consent !== null)
        .slice(0, 10)
    : defaults.consents;
  const seenConsentIds = new Set<string>();
  const consents = rawConsents.filter(consent => {
    if (seenConsentIds.has(consent.id)) return false;
    seenConsentIds.add(consent.id);
    return true;
  });

  return {
    fields,
    staffSelection: isStaffSelection(value.staffSelection)
      ? value.staffSelection
      : defaults.staffSelection,
    questions: sortQuestions(questions),
    consents,
    completionMessage: readString(
      value.completionMessage,
      defaults.completionMessage
    ).slice(0, 500),
  };
}

export function sanitizeBookingFormSettings(
  settings: BookingFormSettings
): PublicBookingFormSettings {
  return {
    fields: settings.fields,
    staffSelection: settings.staffSelection,
    questions: sortQuestions(settings.questions).filter(
      question => question.active
    ),
    consents: settings.consents.map(consent => ({
      ...consent,
      linkUrl:
        consent.linkUrl && isSafePublicLinkUrl(consent.linkUrl)
          ? consent.linkUrl
          : undefined,
    })),
    completionMessage: settings.completionMessage,
    turnstile_site_key: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
    liff_id: undefined,
  };
}

function hasValue(value: BookingFormResponseValue | undefined): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean') return true;
  return Array.isArray(value) && value.length > 0;
}

function isValidQuestionValue(
  question: BookingFormQuestion,
  value: BookingFormResponseValue
): boolean {
  if (question.type === 'text' || question.type === 'textarea') {
    return typeof value === 'string';
  }

  if (question.type === 'boolean') {
    return typeof value === 'boolean';
  }

  if (question.type === 'select') {
    return typeof value === 'string' && question.options.includes(value);
  }

  return (
    Array.isArray(value) && value.every(item => question.options.includes(item))
  );
}

export function validateBookingFormResponses(
  input: BookingFormValidationInput
): BookingFormValidationResult {
  const snapshots: IntakeResponseSnapshot[] = [];

  for (const field of BOOKING_FORM_STANDARD_FIELD_KEYS) {
    const setting = input.settings.fields[field];
    const value = input.standardFields[field]?.trim() ?? '';
    if (setting.enabled && setting.required && value.length === 0) {
      return {
        ok: false,
        message: `${STANDARD_FIELD_LABELS[field]}は必須です`,
      };
    }
    if (
      setting.enabled &&
      value.length > 0 &&
      field !== 'phone' &&
      field !== 'email' &&
      field !== 'notes'
    ) {
      snapshots.push({
        id: field,
        label: STANDARD_FIELD_LABELS[field],
        value,
      });
    }
  }

  const responseMap = new Map(
    input.responses.map(response => [response.id, response.value])
  );

  for (const question of sortQuestions(input.settings.questions).filter(
    candidate => candidate.active
  )) {
    const value = responseMap.get(question.id);
    if (question.required && !hasValue(value)) {
      return { ok: false, message: `${question.label}は必須です` };
    }

    if (value === undefined || !hasValue(value)) {
      continue;
    }

    if (!isValidQuestionValue(question, value)) {
      return { ok: false, message: `${question.label}の回答形式が不正です` };
    }

    snapshots.push({
      id: question.id,
      label: question.label,
      value,
    });
  }

  for (const consent of input.settings.consents) {
    const accepted = input.consents[consent.id] === true;
    if (consent.required && !accepted) {
      return { ok: false, message: `${consent.label}への同意が必要です` };
    }
    if (accepted) {
      snapshots.push({
        id: consent.id,
        label: consent.label,
        value: true,
      });
    }
  }

  return { ok: true, snapshots };
}
