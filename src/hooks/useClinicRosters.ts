'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import { useManagerAssignedClinics } from '@/hooks/useManagerAssignedClinics';
import {
  resolveShiftPresetRange,
  type ShiftRequestTimePreset,
} from '@/lib/staff/shift-requests/time-presets';
import type {
  ManagerRosterCandidate,
  ManagerRosterDay,
  ManagerRosterShift,
  ManagerRosterTimePreset,
  ManagerRostersResponse,
} from '@/types/manager-rosters';

export type ClinicRosterMessage = {
  type: 'error' | 'success';
  text: string;
};

export type ClinicRosterMatrixRow = {
  staffId: string;
  staffName: string;
  cells: Array<{
    date: string;
    label: string;
    shifts: ManagerRosterShift[];
  }>;
};

export type UseClinicRostersResult = {
  clinics: Array<{ id: string; name: string }>;
  selectedClinicId: string;
  selectedMonth: string;
  selectedDate: string;
  candidates: ManagerRosterCandidate[];
  blockedCandidateCount: number;
  days: ManagerRosterDay[];
  matrixRows: ClinicRosterMatrixRow[];
  totalShifts: number;
  loading: boolean;
  candidateLoading: boolean;
  assigningCandidateId: string | null;
  message: ClinicRosterMessage | null;
  setSelectedClinicId: (clinicId: string) => void;
  setSelectedMonth: (month: string) => void;
  setSelectedDate: (date: string) => void;
  assignCandidate: (
    candidate: ManagerRosterCandidate,
    timePreset: ManagerRosterTimePreset
  ) => Promise<void>;
  refetch: () => Promise<void>;
};

const CLINIC_ROSTERS_ERROR =
  '院別ロスターの取得に失敗しました。時間をおいて再度お試しください。';

function getCurrentMonth(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  });
  return formatter.format(new Date()).slice(0, 7);
}

function getMonthRange(month: string): { start: string; end: string } {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function formatShiftCell(shifts: readonly ManagerRosterShift[]): string {
  if (shifts.length === 0) {
    return '';
  }
  return shifts
    .map(shift => {
      const start = formatTime(shift.start_time);
      const prefix = shift.assignment_type === 'help' ? '援' : '';
      const suffix = shift.time_preset === 'afternoon' ? 'PM' : '';
      return `${prefix}${start}${suffix}`;
    })
    .join(' / ');
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function toJstDateKey(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function toPresetIsoRange(
  candidate: ManagerRosterCandidate,
  timePreset: ManagerRosterTimePreset
): { startTime: string; endTime: string } {
  if (timePreset === 'custom') {
    return {
      startTime: candidate.start_time,
      endTime: candidate.end_time,
    };
  }

  const range = resolveShiftPresetRange(timePreset as ShiftRequestTimePreset);
  const date = toJstDateKey(candidate.start_time);
  return {
    startTime: new Date(`${date}T${range.start}:00.000+09:00`).toISOString(),
    endTime: new Date(`${date}T${range.end}:00.000+09:00`).toISOString(),
  };
}

function buildMatrixRows(days: readonly ManagerRosterDay[]) {
  const staff = new Map<string, { staffId: string; staffName: string }>();
  const shiftsByStaffAndDate = new Map<string, ManagerRosterShift[]>();

  for (const day of days) {
    for (const shift of day.shifts) {
      staff.set(shift.staff_id, {
        staffId: shift.staff_id,
        staffName: shift.staff_name,
      });
      const key = `${shift.staff_id}:${day.date}`;
      shiftsByStaffAndDate.set(key, [
        ...(shiftsByStaffAndDate.get(key) ?? []),
        shift,
      ]);
    }
  }

  return Array.from(staff.values())
    .sort((a, b) => a.staffName.localeCompare(b.staffName, 'ja'))
    .map(row => ({
      staffId: row.staffId,
      staffName: row.staffName,
      cells: days.map(day => {
        const shifts = shiftsByStaffAndDate.get(`${row.staffId}:${day.date}`);
        return {
          date: day.date,
          label: formatShiftCell(shifts ?? []),
          shifts: shifts ?? [],
        };
      }),
    }));
}

export function useClinicRosters(): UseClinicRostersResult {
  const assignedClinics = useManagerAssignedClinics();
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [selectedDate, setSelectedDate] = useState('');
  const [data, setData] = useState<ManagerRostersResponse | null>(null);
  const [candidates, setCandidates] = useState<ManagerRosterCandidate[]>([]);
  const [blockedCandidateCount, setBlockedCandidateCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [assigningCandidateId, setAssigningCandidateId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState<ClinicRosterMessage | null>(null);
  const requestIdRef = useRef(0);
  const candidateRequestIdRef = useRef(0);

  const clinics = useMemo(
    () => assignedClinics.data?.clinics ?? [],
    [assignedClinics.data?.clinics]
  );
  const days = useMemo(() => data?.days ?? [], [data?.days]);
  const matrixRows = useMemo(() => buildMatrixRows(days), [days]);

  useEffect(() => {
    if (!selectedClinicId && clinics[0]) {
      setSelectedClinicId(clinics[0].id);
    }
  }, [clinics, selectedClinicId]);

  useEffect(() => {
    const firstDate = days[0]?.date ?? '';
    if (!selectedDate || !days.some(day => day.date === selectedDate)) {
      setSelectedDate(firstDate);
    }
  }, [days, selectedDate]);

  const refetch = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    if (!selectedClinicId) {
      setData(null);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const range = getMonthRange(selectedMonth);
      const response = await api.managerRosters.get({
        clinicId: selectedClinicId,
        start: range.start,
        end: range.end,
      });

      if (!isCurrentRequest()) {
        return;
      }

      if (isSuccessResponse(response)) {
        setData(response.data);
        return;
      }

      if (isErrorResponse(response)) {
        setData(null);
        setMessage({
          type: 'error',
          text: handleApiError(response.error, CLINIC_ROSTERS_ERROR),
        });
        return;
      }

      setData(null);
      setMessage({ type: 'error', text: CLINIC_ROSTERS_ERROR });
    } catch {
      if (!isCurrentRequest()) {
        return;
      }
      setData(null);
      setMessage({ type: 'error', text: CLINIC_ROSTERS_ERROR });
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [selectedClinicId, selectedMonth]);

  const loadCandidates = useCallback(async () => {
    const requestId = candidateRequestIdRef.current + 1;
    candidateRequestIdRef.current = requestId;
    const isCurrentRequest = () => candidateRequestIdRef.current === requestId;

    if (!selectedClinicId || !selectedDate) {
      setCandidates([]);
      setBlockedCandidateCount(0);
      return;
    }

    setCandidateLoading(true);
    try {
      const response = await api.managerRosters.getCandidates({
        clinicId: selectedClinicId,
        date: selectedDate,
      });
      if (!isCurrentRequest()) {
        return;
      }

      if (isSuccessResponse(response)) {
        setCandidates(response.data.candidates);
        setBlockedCandidateCount(response.data.blocked.length);
        return;
      }

      setCandidates([]);
      setBlockedCandidateCount(0);
      if (isErrorResponse(response)) {
        setMessage({
          type: 'error',
          text: handleApiError(
            response.error,
            'ロスター候補の取得に失敗しました。'
          ),
        });
      }
    } catch {
      if (!isCurrentRequest()) {
        return;
      }
      setCandidates([]);
      setBlockedCandidateCount(0);
      setMessage({
        type: 'error',
        text: 'ロスター候補の取得に失敗しました。',
      });
    } finally {
      if (isCurrentRequest()) {
        setCandidateLoading(false);
      }
    }
  }, [selectedClinicId, selectedDate]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const assignCandidate = useCallback(
    async (
      candidate: ManagerRosterCandidate,
      timePreset: ManagerRosterTimePreset
    ) => {
      if (!selectedClinicId) {
        return;
      }
      setAssigningCandidateId(candidate.candidate_id);
      setMessage(null);
      try {
        const range = toPresetIsoRange(candidate, timePreset);
        const response = await api.managerRosters.assign({
          clinic_id: selectedClinicId,
          staff_id: candidate.staff_id,
          staff_profile_id: candidate.staff_profile_id,
          home_clinic_id: candidate.home_clinic_id,
          assignment_type: candidate.assignment_type,
          source_shift_request_id: candidate.source_shift_request_id,
          time_preset: timePreset,
          start_time: range.startTime,
          end_time: range.endTime,
          notes: candidate.note,
        });

        if (isSuccessResponse(response)) {
          setMessage({ type: 'success', text: 'ロスターへ配置しました。' });
          await refetch();
          await loadCandidates();
          return;
        }

        if (isErrorResponse(response)) {
          setMessage({
            type: 'error',
            text: handleApiError(response.error, '配置に失敗しました。'),
          });
          return;
        }

        setMessage({ type: 'error', text: '配置に失敗しました。' });
      } catch {
        setMessage({ type: 'error', text: '配置に失敗しました。' });
      } finally {
        setAssigningCandidateId(null);
      }
    },
    [loadCandidates, refetch, selectedClinicId]
  );

  return {
    clinics,
    selectedClinicId,
    selectedMonth,
    selectedDate,
    candidates,
    blockedCandidateCount,
    days,
    matrixRows,
    totalShifts: data?.totalShifts ?? 0,
    loading: loading || assignedClinics.loading,
    candidateLoading,
    assigningCandidateId,
    message:
      message ??
      (assignedClinics.error
        ? { type: 'error', text: assignedClinics.error }
        : null),
    setSelectedClinicId,
    setSelectedMonth,
    setSelectedDate,
    assignCandidate,
    refetch,
  };
}
