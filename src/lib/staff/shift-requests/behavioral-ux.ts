import {
  formatShortDate,
  type PeriodEditability,
  type ShiftRequestCalendarDay,
  type ShiftRequestCalendarPeriod,
  type ShiftRequestCalendarSummary,
  type ShiftRequestDraftDay,
} from './calendar-model';

export interface ShiftRequestTaskAlert {
  priority: 1 | 2 | 3 | 4 | 5;
  tone: 'warning' | 'info' | 'danger';
  title: string;
  description: string;
}

export function buildTaskAlerts({
  period,
  editability,
  summary,
}: {
  period: ShiftRequestCalendarPeriod | null;
  editability: PeriodEditability;
  summary: ShiftRequestCalendarSummary;
}): ShiftRequestTaskAlert[] {
  const alerts: ShiftRequestTaskAlert[] = [];

  if (!period) {
    alerts.push({
      priority: 1,
      tone: 'warning',
      title: '提出期間を選択してください',
      description: '受付中の提出期間がある場合は自動選択されます。',
    });
  } else if (!editability.canEdit) {
    alerts.push({
      priority: 1,
      tone: 'danger',
      title: '本人編集できません',
      description: editability.reason ?? 'この提出期間は編集できません。',
    });
  } else if (editability.isDeadlineNear) {
    alerts.push({
      priority: 1,
      tone: 'warning',
      title: '提出期限が近づいています',
      description: '期限を過ぎると本人編集できません。',
    });
  }

  if (summary.rejectedDays > 0) {
    alerts.push({
      priority: 2,
      tone: 'warning',
      title: '差戻しがあります',
      description: `${summary.rejectedDays}日分を確認して再提出してください。`,
    });
  }

  if (summary.missingDays > 0) {
    alerts.push({
      priority: 3,
      tone: 'info',
      title: '未入力日があります',
      description: `未入力が${summary.missingDays}日あります。未入力日は希望なしとして扱われる可能性があります。`,
    });
  }

  if (summary.dirtyDays > 0) {
    alerts.push({
      priority: 4,
      tone: 'info',
      title: '保存前の変更があります',
      description: `${summary.dirtyDays}日分の変更はまだ提出されていません。`,
    });
  }

  return alerts.sort((left, right) => left.priority - right.priority);
}

export function getSubmitDisabledReason({
  clinicId,
  period,
  editability,
  dirtyDays,
  isLoading,
  isSubmitting,
}: {
  clinicId: string | null;
  period: ShiftRequestCalendarPeriod | null;
  editability: PeriodEditability;
  dirtyDays: number;
  isLoading: boolean;
  isSubmitting: boolean;
}): string | null {
  if (!clinicId) return '院を選択してください';
  if (!period) return '提出期間を選択してください';
  if (isLoading) return '読み込み中です';
  if (isSubmitting) return '提出中です';
  if (!editability.canEdit) return editability.reason;
  if (dirtyDays === 0) return '保存前の変更がありません';

  return null;
}

export function formatDraftSavedMessage(draft: ShiftRequestDraftDay): string {
  const label = draft.action === 'clear' ? '未入力' : '希望';
  return `${formatShortDate(draft.date)} を${label}として保存しました。提出するまでは画面内の変更です。`;
}

export function formatBulkAppliedMessage({
  count,
  label,
}: {
  count: number;
  label: string;
}): string {
  return `${count}日分を${label}にしました。提出前に内容を確認してください。`;
}

export function formatFailureDates(
  days: readonly ShiftRequestCalendarDay[],
  dates: readonly string[]
): string {
  const dayByDate = new Map(days.map(day => [day.date, day]));
  return dates
    .map(date => {
      const day = dayByDate.get(date);
      return day ? formatShortDate(day.date) : formatShortDate(date);
    })
    .join(', ');
}
