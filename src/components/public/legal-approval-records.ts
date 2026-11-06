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

// 2026-11-06 JSTの本人指示で暫定原稿の採用と本番掲載を承認。
// hashはレビューした原稿の固定値。原稿変更時に自動追従させない。
export const legalDocumentApprovals: Readonly<
  Record<LegalDocumentId, LegalDocumentApproval>
> = {
  privacy: {
    status: 'approved_for_publication',
    contentVersion: 'interim-20261106',
    reviewedVersion: 'interim-20261106',
    reviewedContentHash:
      '6c90560cbf39413ad236c8cf993ca236185aaacb7dc1f0e6f37720a3a705576b',
    approvedContentHash:
      '6c90560cbf39413ad236c8cf993ca236185aaacb7dc1f0e6f37720a3a705576b',
    reviewedRevisedOn: '2026-11-06',
    reviewedEffectiveOn: '2026-11-06',
    approvedOn: '2026-11-06',
    revisedOn: '2026-11-06',
    effectiveOn: '2026-11-06',
    evidence: 'docs/legal/interim-publication-approval-20261106.md',
    unresolvedDecisions: [],
  },
  terms: {
    status: 'approved_for_publication',
    contentVersion: 'interim-20261106',
    reviewedVersion: 'interim-20261106',
    reviewedContentHash:
      '548b2d68309e6c4f520f07cb8202a07e692da9d1b7de5c891da3431d1fe4866a',
    approvedContentHash:
      '548b2d68309e6c4f520f07cb8202a07e692da9d1b7de5c891da3431d1fe4866a',
    reviewedRevisedOn: '2026-11-06',
    reviewedEffectiveOn: '2026-11-06',
    approvedOn: '2026-11-06',
    revisedOn: '2026-11-06',
    effectiveOn: '2026-11-06',
    evidence: 'docs/legal/interim-publication-approval-20261106.md',
    unresolvedDecisions: [],
  },
  legal: {
    status: 'approved_for_publication',
    contentVersion: 'interim-20261106',
    reviewedVersion: 'interim-20261106',
    reviewedContentHash:
      '90ecf56d64dc5080c35ee9160575ccc51c21489028429fb80a69c47a4dc6a50c',
    approvedContentHash:
      '90ecf56d64dc5080c35ee9160575ccc51c21489028429fb80a69c47a4dc6a50c',
    reviewedRevisedOn: '2026-11-06',
    reviewedEffectiveOn: '2026-11-06',
    approvedOn: '2026-11-06',
    revisedOn: '2026-11-06',
    effectiveOn: '2026-11-06',
    evidence: 'docs/legal/interim-publication-approval-20261106.md',
    unresolvedDecisions: [],
  },
};
