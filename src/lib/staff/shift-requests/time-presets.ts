export const SHIFT_REQUEST_TIME_PRESETS = [
  'full_day',
  'morning',
  'afternoon',
  'late',
  'custom',
] as const;

export type ShiftRequestTimePreset =
  (typeof SHIFT_REQUEST_TIME_PRESETS)[number];

export type ShiftRequestDefaultTimePreset = Exclude<
  ShiftRequestTimePreset,
  'custom'
>;

export interface ShiftRequestTimeRange {
  start: string;
  end: string;
}

export const DEFAULT_SHIFT_PRESETS: Record<
  ShiftRequestDefaultTimePreset,
  ShiftRequestTimeRange
> = {
  full_day: { start: '10:45', end: '22:30' },
  morning: { start: '10:45', end: '15:00' },
  afternoon: { start: '15:00', end: '22:30' },
  late: { start: '17:00', end: '22:30' },
};

export const SHIFT_REQUEST_TIME_PRESET_LABELS: Record<
  ShiftRequestTimePreset,
  string
> = {
  full_day: '終日',
  morning: '午前のみ',
  afternoon: '午後から',
  late: '遅番',
  custom: 'カスタム',
};

export function isDefaultShiftPreset(
  preset: ShiftRequestTimePreset
): preset is ShiftRequestDefaultTimePreset {
  return preset !== 'custom';
}

export function resolveShiftPresetRange(
  preset: ShiftRequestTimePreset,
  customRange?: ShiftRequestTimeRange
): ShiftRequestTimeRange {
  if (isDefaultShiftPreset(preset)) {
    return DEFAULT_SHIFT_PRESETS[preset];
  }

  return customRange ?? DEFAULT_SHIFT_PRESETS.full_day;
}
