import type {
  ShiftRequestPeriodStatus,
  ShiftRequestStatus,
  ShiftRequestType,
} from '@/lib/staff/shift-requests/types';

export type ManagerShiftRequestPeriod = {
  id: string;
  clinic_id: string;
  title: string;
  period_start: string;
  period_end: string;
  submission_deadline: string;
  status: ShiftRequestPeriodStatus;
};

export type ManagerShiftRequest = {
  id: string;
  clinic_id: string;
  period_id: string;
  staff_id: string;
  request_type: ShiftRequestType;
  start_time: string;
  end_time: string;
  priority: number;
  status: ShiftRequestStatus;
  note: string | null;
  rejection_reason: string | null;
  converted_shift_id: string | null;
};

export type ManagerShiftRequestMessage = {
  type: 'success' | 'error';
  text: string;
};
