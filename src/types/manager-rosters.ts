export type ManagerRosterClinic = {
  id: string;
  name: string;
};

export type ManagerRosterShiftStatus =
  | 'draft'
  | 'proposed'
  | 'confirmed'
  | 'cancelled';

export type ManagerRosterAssignmentType = 'regular' | 'help';

export type ManagerRosterTimePreset =
  | 'full_day'
  | 'morning'
  | 'afternoon'
  | 'late'
  | 'custom';

export type ManagerRosterShift = {
  shift_id: string;
  staff_id: string;
  staff_profile_id: string | null;
  staff_name: string;
  home_clinic_id: string | null;
  home_clinic_name: string | null;
  work_clinic_id: string;
  work_clinic_name: string;
  assignment_type: ManagerRosterAssignmentType;
  time_preset: ManagerRosterTimePreset | null;
  start_time: string;
  end_time: string;
  status: ManagerRosterShiftStatus;
  notes: string | null;
};

export type ManagerRosterDay = {
  date: string;
  shifts: ManagerRosterShift[];
};

export type ManagerRostersResponse = {
  generatedAt: string;
  clinic_id: string;
  start: string;
  end: string;
  clinics: ManagerRosterClinic[];
  days: ManagerRosterDay[];
  totalShifts: number;
};

export type ManagerRostersQuery = {
  clinicId: string;
  start: string;
  end: string;
};

export type ManagerRosterCandidateRequestType = 'available' | 'preferred';

export type ManagerRosterCandidate = {
  candidate_id: string;
  staff_id: string;
  staff_name: string;
  clinic_id: string;
  clinic_name: string;
  source_shift_request_id: string;
  request_type: ManagerRosterCandidateRequestType;
  priority: number;
  start_time: string;
  end_time: string;
  note: string | null;
  conflict_messages: string[];
};

export type ManagerRosterCandidatesResponse = {
  generatedAt: string;
  clinic_id: string;
  date: string;
  period_id: string | null;
  candidates: ManagerRosterCandidate[];
  blocked: Array<{
    staff_id: string;
    staff_name: string;
    reason: string;
  }>;
};

export type ManagerRosterCandidatesQuery = {
  clinicId: string;
  date: string;
  periodId?: string | null;
};

export type ManagerRosterAssignRequest = {
  clinic_id: string;
  staff_id: string;
  source_shift_request_id?: string | null;
  time_preset: ManagerRosterTimePreset;
  start_time: string;
  end_time: string;
  notes?: string | null;
};

export type ManagerRosterAssignResponse = {
  shift: ManagerRosterShift;
};
