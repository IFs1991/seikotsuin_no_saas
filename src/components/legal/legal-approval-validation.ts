import type { LegalDocumentApproval } from '../public/legal-approval-records';
import type { LegalContentState } from './legal-review-fields';

export type LegalPublication =
  | { approved: false }
  | { approved: true; revisedOn: string; effectiveOn: string };

function hasText(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** 原稿の完全性と実承認の照合。製品別の前提条件は呼出側で別途検証する。 */
export function validateLegalApproval(
  approval: LegalDocumentApproval,
  content: LegalContentState
): LegalPublication {
  if (
    !/^[a-f0-9]{64}$/.test(content.sha256) ||
    approval.reviewedContentHash !== content.sha256 ||
    approval.approvedContentHash !== content.sha256 ||
    approval.reviewedRevisedOn !== approval.revisedOn ||
    approval.reviewedEffectiveOn !== approval.effectiveOn ||
    content.unresolvedFields.length > 0 ||
    approval.status !== 'approved_for_publication' ||
    !hasText(approval.contentVersion) ||
    approval.reviewedVersion !== approval.contentVersion ||
    !hasText(approval.evidence) ||
    approval.unresolvedDecisions.length > 0 ||
    !isCalendarDate(approval.approvedOn) ||
    !isCalendarDate(approval.revisedOn) ||
    !isCalendarDate(approval.effectiveOn) ||
    approval.approvedOn > approval.effectiveOn ||
    approval.revisedOn > approval.effectiveOn
  )
    return { approved: false };
  return {
    approved: true,
    revisedOn: approval.revisedOn,
    effectiveOn: approval.effectiveOn,
  };
}
