'use client';

import { CalendarDays, RefreshCw, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useClinicRosters } from '@/hooks/useClinicRosters';
import { SHIFT_REQUEST_TIME_PRESET_LABELS } from '@/lib/staff/shift-requests/time-presets';
import type {
  ManagerRosterCandidate,
  ManagerRosterDay,
  ManagerRosterShift,
  ManagerRosterTimePreset,
} from '@/types/manager-rosters';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${value}T00:00:00.000+09:00`));
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
  }).format(new Date(`${value}-01T00:00:00.000+09:00`));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShiftTime(shift: ManagerRosterShift): string {
  return `${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`;
}

function hasAfternoonShift(shift: ManagerRosterShift): boolean {
  if (shift.time_preset === 'afternoon') {
    return true;
  }
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      hour12: false,
    }).format(new Date(shift.start_time))
  );
  return hour >= 12;
}

function shiftBadge(shift: ManagerRosterShift) {
  if (shift.assignment_type === 'help') {
    return <Badge variant='secondary'>ヘルプ</Badge>;
  }
  if (hasAfternoonShift(shift)) {
    return <Badge variant='outline'>午後</Badge>;
  }
  return null;
}

function DayRoster({
  day,
  selected,
  onSelect,
}: {
  day: ManagerRosterDay;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  return (
    <article
      className={
        selected
          ? 'rounded-md border border-primary bg-card p-4 ring-2 ring-primary/20'
          : 'rounded-md border border-border bg-card p-4'
      }
    >
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-sm font-semibold text-foreground'>
            {formatDate(day.date)}
          </h3>
          <p className='mt-1 text-xs text-muted-foreground'>
            {day.shifts.length}名確定
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          variant={selected ? 'default' : 'outline'}
          onClick={() => onSelect(day.date)}
        >
          候補
        </Button>
      </div>

      {day.shifts.length === 0 && (
        <Badge className='mt-3' variant='outline'>
          未配置
        </Badge>
      )}

      {day.shifts.length === 0 ? (
        <p className='mt-4 text-sm text-muted-foreground'>
          確定済みスタッフはありません。
        </p>
      ) : (
        <ul className='mt-4 space-y-3'>
          {day.shifts.map(shift => (
            <li
              key={shift.shift_id}
              className='flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between'
            >
              <div>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium text-foreground'>
                    {shift.staff_name}
                  </span>
                  {shiftBadge(shift)}
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {formatShiftTime(shift)}
                  {shift.home_clinic_name &&
                  shift.home_clinic_name !== shift.work_clinic_name
                    ? ` / 所属: ${shift.home_clinic_name}`
                    : ''}
                </p>
              </div>
              {shift.notes && (
                <p className='max-w-[260px] text-xs text-muted-foreground'>
                  {shift.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function CandidateActions({
  candidate,
  assigning,
  onAssign,
}: {
  candidate: ManagerRosterCandidate;
  assigning: boolean;
  onAssign: (
    candidate: ManagerRosterCandidate,
    preset: ManagerRosterTimePreset
  ) => void;
}) {
  const presets: ManagerRosterTimePreset[] = [
    'full_day',
    'morning',
    'afternoon',
    'custom',
  ];

  return (
    <div className='flex flex-wrap gap-2'>
      {presets.map(preset => (
        <Button
          key={preset}
          type='button'
          size='sm'
          variant={preset === 'custom' ? 'outline' : 'default'}
          disabled={assigning}
          onClick={() => onAssign(candidate, preset)}
        >
          {SHIFT_REQUEST_TIME_PRESET_LABELS[preset]}
        </Button>
      ))}
    </div>
  );
}

function CandidatePanel({
  selectedDate,
  loading,
  blockedCount,
  candidates,
  assigningCandidateId,
  onAssign,
}: {
  selectedDate: string;
  loading: boolean;
  blockedCount: number;
  candidates: ManagerRosterCandidate[];
  assigningCandidateId: string | null;
  onAssign: (
    candidate: ManagerRosterCandidate,
    preset: ManagerRosterTimePreset
  ) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>候補パネル</CardTitle>
        <CardDescription>
          {selectedDate
            ? `${formatDate(selectedDate)} の配置候補`
            : '日付未選択'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className='text-sm text-muted-foreground'>候補を読み込み中...</p>
        ) : candidates.length === 0 ? (
          <div className='space-y-2 text-sm text-muted-foreground'>
            <p>配置できる同一院候補はありません。</p>
            {blockedCount > 0 && (
              <p>
                {blockedCount}
                件は休み希望・不可・既存シフト重複で除外されました。
              </p>
            )}
          </div>
        ) : (
          <div className='space-y-3'>
            {blockedCount > 0 && (
              <p className='text-xs text-muted-foreground'>
                {blockedCount}
                件は休み希望・不可・既存シフト重複で除外されました。
              </p>
            )}
            {candidates.map(candidate => (
              <article
                key={candidate.candidate_id}
                className='rounded-md border border-border p-3'
              >
                <div className='mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
                  <div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>
                        {candidate.staff_name}
                      </span>
                      <Badge
                        variant={
                          candidate.request_type === 'preferred'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {candidate.request_type === 'preferred'
                          ? '優先希望'
                          : '勤務可能'}
                      </Badge>
                      <Badge variant='outline'>
                        優先度 {candidate.priority}
                      </Badge>
                      {candidate.assignment_type === 'help' && (
                        <Badge variant='secondary'>ヘルプ可</Badge>
                      )}
                    </div>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {formatTime(candidate.start_time)}-
                      {formatTime(candidate.end_time)}
                      {candidate.home_clinic_name &&
                      candidate.home_clinic_name !== candidate.clinic_name
                        ? ` / 所属: ${candidate.home_clinic_name}`
                        : ''}
                      {candidate.note ? ` / ${candidate.note}` : ''}
                    </p>
                  </div>
                </div>
                <CandidateActions
                  candidate={candidate}
                  assigning={assigningCandidateId === candidate.candidate_id}
                  onAssign={onAssign}
                />
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ClinicRosters() {
  const state = useClinicRosters();

  return (
    <main className='min-h-screen bg-background p-4 pt-8 text-foreground'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <header className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>院別日別ロスター</h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              確定済みシフトをもとに、担当院ごとの日別稼働スタッフを確認します。
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => void state.refetch()}
            disabled={state.loading || !state.selectedClinicId}
          >
            <RefreshCw className='mr-2 h-4 w-4' />
            再読み込み
          </Button>
        </header>

        {state.message && (
          <Card>
            <CardContent
              className={
                state.message.type === 'error'
                  ? 'p-4 text-sm text-destructive'
                  : 'p-4 text-sm text-emerald-700'
              }
            >
              {state.message.text}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>表示条件</CardTitle>
            <CardDescription>担当院と対象月を選択します。</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-2'>
            <label className='space-y-1 text-sm' htmlFor='roster-clinic'>
              <span className='font-medium'>院</span>
              <select
                id='roster-clinic'
                className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                value={state.selectedClinicId}
                onChange={event =>
                  state.setSelectedClinicId(event.target.value)
                }
                disabled={state.loading || state.clinics.length === 0}
              >
                {state.clinics.map(clinic => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </label>
            <label className='space-y-1 text-sm' htmlFor='roster-month'>
              <span className='font-medium'>対象月</span>
              <input
                id='roster-month'
                className='h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                type='month'
                value={state.selectedMonth}
                onChange={event => state.setSelectedMonth(event.target.value)}
                disabled={state.loading}
              />
            </label>
          </CardContent>
        </Card>

        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between gap-3'>
              <div>
                <CardTitle className='text-base'>対象月</CardTitle>
                <CardDescription>
                  {formatMonth(state.selectedMonth)}
                </CardDescription>
              </div>
              <CalendarDays className='h-5 w-5 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold'>{state.days.length}</p>
              <p className='mt-1 text-sm text-muted-foreground'>表示日数</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between gap-3'>
              <div>
                <CardTitle className='text-base'>確定スタッフ</CardTitle>
                <CardDescription>confirmed staff_shifts</CardDescription>
              </div>
              <Users className='h-5 w-5 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold'>{state.totalShifts}</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                確定シフト件数
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>スタッフ別マトリクス</CardTitle>
            <CardDescription>
              日別の確定稼働をスタッフ単位で確認します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.loading ? (
              <p className='text-sm text-muted-foreground'>読み込み中...</p>
            ) : state.matrixRows.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                表示できる確定シフトがありません。
              </p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[960px] text-sm'>
                  <thead>
                    <tr className='border-b text-left text-muted-foreground'>
                      <th className='sticky left-0 bg-card py-2 pr-4'>
                        スタッフ
                      </th>
                      {state.days.map(day => (
                        <th key={day.date} className='min-w-24 px-2 py-2'>
                          {formatDate(day.date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.matrixRows.map(row => (
                      <tr key={row.staffId} className='border-b align-top'>
                        <th className='sticky left-0 bg-card py-3 pr-4 text-left font-medium'>
                          {row.staffName}
                        </th>
                        {row.cells.map(cell => (
                          <td key={cell.date} className='px-2 py-3'>
                            {cell.label ? (
                              <span className='rounded bg-muted px-2 py-1 text-xs'>
                                {cell.label}
                              </span>
                            ) : (
                              <span className='text-muted-foreground'>-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <CandidatePanel
          selectedDate={state.selectedDate}
          loading={state.candidateLoading}
          blockedCount={state.blockedCandidateCount}
          candidates={state.candidates}
          assigningCandidateId={state.assigningCandidateId}
          onAssign={(candidate, preset) =>
            void state.assignCandidate(candidate, preset)
          }
        />

        <section className='grid gap-4 lg:grid-cols-2'>
          {state.days.map(day => (
            <DayRoster
              key={day.date}
              day={day}
              selected={day.date === state.selectedDate}
              onSelect={state.setSelectedDate}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
