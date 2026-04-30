export const weekDays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekDay = (typeof weekDays)[number];

export const dayNames: Record<WeekDay, string> = {
  monday: '月曜日',
  tuesday: '火曜日',
  wednesday: '水曜日',
  thursday: '木曜日',
  friday: '金曜日',
  saturday: '土曜日',
  sunday: '日曜日',
};

export interface TimeSlot {
  start: string;
  end: string;
}

export interface DaySchedule {
  isOpen: boolean;
  timeSlots: TimeSlot[];
}

export type WeekSchedule = Record<WeekDay, DaySchedule>;

export interface SpecialDate {
  date: string;
  type: 'holiday' | 'specialHours';
  label: string;
  timeSlots?: TimeSlot[];
}

export interface ClinicHoursData {
  hoursByDay: WeekSchedule;
  holidays: string[];
  specialClosures: SpecialDate[];
}

export type SpecialDateField = keyof SpecialDate;
export type TimeSlotField = keyof TimeSlot;

export type UpdateSpecialDate = <Field extends SpecialDateField>(
  index: number,
  field: Field,
  value: SpecialDate[Field]
) => void;
