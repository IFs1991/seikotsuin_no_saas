import type { PublicationStatus } from './release-readiness';

export type LegalDocumentId = 'privacy' | 'terms' | 'legal';

export interface LegalDocumentApproval {
  status: PublicationStatus;
  /** 掲載原稿の版。原稿変更時は更新し、再承認する。 */
  contentVersion: string;
  reviewedVersion: string | null;
  reviewedContentHash: string | null;
  approvedContentHash: string | null;
  reviewedRevisedOn: string | null;
  reviewedEffectiveOn: string | null;
  approvedOn: string | null;
  revisedOn: string | null;
  effectiveOn: string | null;
  /** 公開可能な承認記録の参照のみ。承認者の個人情報・秘密は入れない。 */
  evidence: string | null;
  unresolvedDecisions: readonly string[];
}

// 実装完了は公開承認ではない。日付は事業者が承認した実値だけを記録する。
export const legalDocumentApprovals: Readonly<
  Record<LegalDocumentId, LegalDocumentApproval>
> = {
  privacy: {
    status: 'draft',
    contentVersion: 'issue-173-draft-20261106',
    reviewedVersion: null,
    reviewedContentHash: null,
    approvedContentHash: null,
    reviewedRevisedOn: null,
    reviewedEffectiveOn: null,
    approvedOn: null,
    revisedOn: null,
    effectiveOn: null,
    evidence: null,
    unresolvedDecisions: [
      'B02-requests',
      'B08-retention-transfers',
      'B09-medical-dpa',
    ],
  },
  terms: {
    status: 'draft',
    contentVersion: 'issue-173-draft-20261106',
    reviewedVersion: null,
    reviewedContentHash: null,
    approvedContentHash: null,
    reviewedRevisedOn: null,
    reviewedEffectiveOn: null,
    approvedOn: null,
    revisedOn: null,
    effectiveOn: null,
    evidence: null,
    unresolvedDecisions: ['B07-subscription', 'B09-liability-jurisdiction'],
  },
  legal: {
    status: 'draft',
    contentVersion: 'issue-173-draft-20261106',
    reviewedVersion: null,
    reviewedContentHash: null,
    approvedContentHash: null,
    reviewedRevisedOn: null,
    reviewedEffectiveOn: null,
    approvedOn: null,
    revisedOn: null,
    effectiveOn: null,
    evidence: null,
    unresolvedDecisions: ['B01-operator', 'B03-disclosure', 'B07-sales-tax'],
  },
};
