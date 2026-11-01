import { legalContentManifest } from '../legal/legal-content-manifest';
import {
  validateLegalApproval,
  type LegalPublication,
} from '../legal/legal-approval-validation';
import type { LegalContentState } from '../legal/legal-review-fields';
import type { LegalDocumentApproval } from './legal-approval-records';
import { legalDeliveryEnvironment } from './legal-delivery';
import {
  isProductionOrigin,
  isPublishableEmail,
  isPublishableText,
  publishableValue,
  operatorProfile,
  publicSiteOrigin,
  type OperatorProfile,
  type PublicationStatus,
  type PublishableField,
} from './release-readiness';
import {
  worksLegalApprovals,
  type WorksLegalDocumentId,
} from './works-legal-approval-records';

export type WorksGateId =
  | 'support-operation'
  | 'operator-disclosure'
  | 'origin-verification'
  | 'data-practices'
  | 'sales-conditions'
  | 'submission-scope';
export interface WorksGate {
  id: WorksGateId;
  status: PublicationStatus;
  evidence: string | null;
}
const requiredGateIds: readonly WorksGateId[] = [
  'support-operation',
  'operator-disclosure',
  'origin-verification',
  'data-practices',
  'sales-conditions',
  'submission-scope',
];
// 本人の完了申告は記録するが、実値・公開可能な証跡と原稿の照合前にapprovedへ移行しない。
export const worksLegalGates: readonly WorksGate[] = [
  {
    id: 'support-operation',
    status: 'confirmed',
    evidence:
      'docs/legal/works-submission-owner-confirmations-20261102.md#operator',
  },
  {
    id: 'operator-disclosure',
    status: 'confirmed',
    evidence:
      'docs/legal/works-submission-owner-confirmations-20261102.md#operator',
  },
  {
    id: 'origin-verification',
    status: 'confirmed',
    evidence: 'docs/legal/works-submission-readiness-20261101.md',
  },
  {
    id: 'data-practices',
    status: 'draft',
    evidence: 'docs/legal/works-submission-data-evidence-20261101.md',
  },
  {
    id: 'sales-conditions',
    status: 'confirmed',
    evidence:
      'docs/legal/works-submission-owner-confirmations-20261102.md#sales',
  },
  {
    id: 'submission-scope',
    status: 'confirmed',
    evidence:
      'docs/legal/works-submission-owner-confirmations-20261102.md#scope',
  },
];

/** OSの価格・医療・正式公開承認は参照しない。Works固有の未確認事項は省略不可。 */
export function getWorksLegalPublication(
  document: WorksLegalDocumentId,
  approvals: Readonly<
    Record<WorksLegalDocumentId, LegalDocumentApproval>
  > = worksLegalApprovals,
  gates: readonly WorksGate[] = worksLegalGates,
  contents: Readonly<
    Record<WorksLegalDocumentId, LegalContentState>
  > = legalContentManifest.documents,
  profile: OperatorProfile = operatorProfile,
  origin: PublishableField = publicSiteOrigin
): LegalPublication {
  const operatorReady =
    [
      profile.businessType,
      profile.name,
      profile.brand,
      profile.addressAndPhonePolicy,
    ].every(field => publishableValue(field) !== null) &&
    profile.publicEmail.status === 'approved_for_publication' &&
    isPublishableEmail(profile.publicEmail.value);
  if (
    !operatorReady ||
    origin.status !== 'approved_for_publication' ||
    !isProductionOrigin(origin.value) ||
    !requiredGateIds.every(id => {
      const matches = gates.filter(gate => gate.id === id);
      const gate = matches[0];
      return (
        matches.length === 1 &&
        gate !== undefined &&
        gate.status === 'approved_for_publication' &&
        isPublishableText(gate.evidence)
      );
    })
  )
    return { approved: false };
  return validateLegalApproval(approvals[document], contents[document]);
}

export function worksLegalDeliveryEnvironment() {
  return {
    ...legalDeliveryEnvironment(),
    publicationMode: process.env.WORKS_LEGAL_PUBLICATION_MODE,
  };
}

export const worksSubmissionPaths = {
  websiteURL: '/works/plugin',
  supportURL: '/contact?product=works&intent=support',
  privacyPolicyURL: '/works/privacy',
  termsOfServiceURL: '/works/terms',
} as const;
