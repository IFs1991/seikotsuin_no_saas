import type { LegalDocumentApproval } from './legal-approval-records';

export type WorksLegalDocumentId =
  | 'works/privacy'
  | 'works/terms'
  | 'works/plugin';

function draft(): LegalDocumentApproval {
  return {
    status: 'draft',
    contentVersion: 'works-submission-v1',
    reviewedVersion: null,
    reviewedContentHash: null,
    approvedContentHash: null,
    reviewedRevisedOn: null,
    reviewedEffectiveOn: null,
    approvedOn: null,
    revisedOn: null,
    effectiveOn: null,
    evidence: null,
    unresolvedDecisions: ['OWNER_ACTION_REQUIRED'],
  };
}

// コード完成・テスト成功は事業者の公開承認ではない。実承認だけを別PRで記録する。
export const worksLegalApprovals: Readonly<
  Record<WorksLegalDocumentId, LegalDocumentApproval>
> = {
  'works/privacy': draft(),
  'works/terms': draft(),
  'works/plugin': draft(),
};
