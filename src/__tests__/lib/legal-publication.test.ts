import {
  getLegalPublication as checkPublication,
  legalDocumentApprovals,
  releaseCheckItems,
  evaluateReleaseReadiness,
  type LegalDocumentApproval,
  type LegalDocumentId,
  type ReleaseCheckItem,
  type OperatorProfile,
} from '@/components/public/release-readiness';

// 架空の承認証跡だけを使用。実承認を付与しない。
export const approvedDocuments: Record<LegalDocumentId, LegalDocumentApproval> =
  {
    privacy: approvedDocument(),
    terms: approvedDocument(),
    legal: approvedDocument(),
  };
function approvedDocument(): LegalDocumentApproval {
  return {
    status: 'approved_for_publication',
    contentVersion: 'test-v1',
    reviewedVersion: 'test-v1',
    reviewedContentHash: 'a'.repeat(64),
    approvedContentHash: 'a'.repeat(64),
    reviewedRevisedOn: '2026-10-31',
    reviewedEffectiveOn: '2026-11-01',
    approvedOn: '2026-10-31',
    revisedOn: '2026-10-31',
    effectiveOn: '2026-11-01',
    evidence: '架空の承認記録（テスト専用）',
    unresolvedDecisions: [],
  };
}
export const approvedItems: ReleaseCheckItem[] = releaseCheckItems.map(
  item => ({
    ...item,
    status: 'approved_for_publication',
    ...(item.requiredValue
      ? {
          requiredValue: {
            ...item.requiredValue,
            value:
              item.requiredValue.kind === 'origin'
                ? 'https://lp.fictional-tiramisu-test.co.jp'
                : item.requiredValue.kind === 'email'
                  ? 'contact@fictional-tiramisu-test.co.jp'
                  : '架空の承認値',
          },
        }
      : {}),
  })
);

const reviewedContents: Record<
  LegalDocumentId,
  { sha256: string; unresolvedFields: readonly string[] }
> = {
  privacy: { sha256: 'a'.repeat(64), unresolvedFields: [] },
  terms: { sha256: 'a'.repeat(64), unresolvedFields: [] },
  legal: { sha256: 'a'.repeat(64), unresolvedFields: [] },
};
const reviewedProfile: OperatorProfile = {
  businessType: { value: '架空の事業区分', status: 'approved_for_publication' },
  name: { value: '架空の承認氏名', status: 'approved_for_publication' },
  brand: { value: '架空のブランド', status: 'approved_for_publication' },
  addressAndPhonePolicy: {
    value: '架空の開示方針',
    status: 'approved_for_publication',
  },
  publicEmail: {
    value: 'contact@fictional-tiramisu-test.co.jp',
    status: 'approved_for_publication',
  },
};
function getLegalPublication(
  document: LegalDocumentId,
  approvals = legalDocumentApprovals,
  items: readonly ReleaseCheckItem[] = releaseCheckItems
) {
  return checkPublication(
    document,
    approvals,
    items,
    reviewedContents,
    reviewedProfile
  );
}

describe('文書公開承認はfail-closed（Issue #167）', () => {
  it('manual未解決リストを消しても原稿マーカー・販売placeholderが残ると正式承認にしない', () => {
    expect(
      checkPublication(
        'privacy',
        approvedDocuments,
        approvedItems,
        {
          ...reviewedContents,
          privacy: {
            sha256: 'a'.repeat(64),
            unresolvedFields: ['privacy:retention'],
          },
        },
        reviewedProfile
      ).approved
    ).toBe(false);
    expect(
      checkPublication(
        'legal',
        approvedDocuments,
        approvedItems,
        {
          ...reviewedContents,
          legal: {
            sha256: 'a'.repeat(64),
            unresolvedFields: ['legal:sales-placeholder'],
          },
        },
        reviewedProfile
      ).approved
    ).toBe(false);
  });
  it('本文/依存データのhashが変われば版名を据え置いても再承認を要求', () => {
    expect(
      checkPublication(
        'terms',
        approvedDocuments,
        approvedItems,
        {
          ...reviewedContents,
          terms: { sha256: 'b'.repeat(64), unresolvedFields: [] },
        },
        reviewedProfile
      ).approved
    ).toBe(false);
  });
  it('ハッシュ一致だけでは未承認・欠損した事業者情報を公開しない', () => {
    for (const profile of [
      {
        ...reviewedProfile,
        name: { value: null, status: 'approved_for_publication' as const },
      },
      {
        ...reviewedProfile,
        businessType: { value: '架空の区分', status: 'confirmed' as const },
      },
      {
        ...reviewedProfile,
        publicEmail: {
          value: 'invalid',
          status: 'approved_for_publication' as const,
        },
      },
    ])
      expect(
        checkPublication(
          'legal',
          approvedDocuments,
          approvedItems,
          reviewedContents,
          profile
        ).approved
      ).toBe(false);
  });
  it.each<LegalDocumentId>(['privacy', 'terms', 'legal'])(
    '%s: 採用済み暫定版の実台帳・hash・日付が揃っている',
    document => {
      expect(checkPublication(document)).toEqual({
        approved: true,
        revisedOn: '2026-11-06',
        effectiveOn: '2026-11-06',
      });
      expect(
        getLegalPublication(document, approvedDocuments, approvedItems)
      ).toEqual({
        approved: true,
        revisedOn: '2026-10-31',
        effectiveOn: '2026-11-01',
      });
      expect(legalDocumentApprovals[document].approvedOn).toBe('2026-11-06');
      expect(legalDocumentApprovals[document].contentVersion).toBe(
        'interim-20261106'
      );
    }
  );
  const invalid: Partial<LegalDocumentApproval>[] = [
    { reviewedContentHash: null },
    { approvedContentHash: null },
    { reviewedContentHash: 'b'.repeat(64) },
    { approvedContentHash: 'b'.repeat(64) },
    { reviewedRevisedOn: null },
    { reviewedEffectiveOn: null },
    { revisedOn: '2026-10-30' },
    { effectiveOn: '2026-11-02' },
    { status: 'confirmed' },
    { status: 'draft' },
    { status: 'missing' },
    { contentVersion: '' },
    { reviewedVersion: null },
    { reviewedVersion: 'old-v1' },
    { evidence: null },
    { evidence: '  ' },
    { unresolvedDecisions: ['B08'] },
    { approvedOn: null },
    { revisedOn: null },
    { effectiveOn: null },
    { approvedOn: '2026-11-02' },
    { revisedOn: '2026-11-02' },
    { effectiveOn: '2026-02-30' },
    { effectiveOn: '2026-13-01' },
    { effectiveOn: '2026-1-01' },
    { effectiveOn: 'invalid' },
  ];
  it.each(invalid)('承認済みフラグだけでは足りない: %j', override => {
    expect(
      getLegalPublication(
        'privacy',
        {
          ...approvedDocuments,
          privacy: { ...approvedDocuments.privacy, ...override },
        },
        approvedItems
      )
    ).toEqual({ approved: false });
  });
  const marketingOnlyIds = ['works-claims', 'os-migrated-claims'];
  it.each<LegalDocumentId>(['privacy', 'terms', 'legal'])(
    '%s: LP広告の承認待ちを文書承認へ結合せず、サイト全体は拒否を維持',
    document => {
      const items = approvedItems.filter(
        item => !marketingOnlyIds.includes(item.id)
      );
      expect(
        getLegalPublication(document, approvedDocuments, items).approved
      ).toBe(true);
      const pendingMarketing = approvedItems.map(item =>
        marketingOnlyIds.includes(item.id)
          ? { ...item, status: 'draft' as const }
          : item
      );
      expect(
        getLegalPublication(document, approvedDocuments, pendingMarketing)
          .approved
      ).toBe(true);
      expect(evaluateReleaseReadiness(pendingMarketing).ready).toBe(false);
    }
  );
  it.each(
    (['privacy', 'terms', 'legal'] as const).flatMap(document =>
      releaseCheckItems
        .filter(
          item =>
            item.requiredFor === 'release' &&
            !marketingOnlyIds.includes(item.id)
        )
        .map(item => ({ document, id: item.id }))
    )
  )('$document: 法務必須台帳$idの未承認/欠落を拒否', ({ document, id }) => {
    expect(
      getLegalPublication(
        document,
        approvedDocuments,
        approvedItems.map(item =>
          item.id === id ? { ...item, status: 'confirmed' } : item
        )
      ).approved
    ).toBe(false);
    expect(
      getLegalPublication(
        document,
        approvedDocuments,
        approvedItems.filter(item => item.id !== id)
      ).approved
    ).toBe(false);
  });
  it('空の台帳・重複・必須値欠損・台帳種別変更も拒否', () => {
    const name = approvedItems.find(item => item.id === 'operator-name');
    if (!name) throw new Error('fixture missing');
    for (const items of [
      [],
      [...approvedItems, name],
      approvedItems.map(item =>
        item.id === name.id ? { ...item, requiredValue: undefined } : item
      ),
      approvedItems.map(item =>
        item.id === name.id
          ? { ...item, requiredValue: { kind: 'text' as const, value: null } }
          : item
      ),
      approvedItems.map(item =>
        item.id === name.id ? { ...item, ledger: 'B10' as const } : item
      ),
    ])
      expect(
        getLegalPublication('legal', approvedDocuments, items).approved
      ).toBe(false);
  });
  it('B10は別の申請ゲート。未完了を申請承認にも文書承認にも昇格させない', () => {
    const items = approvedItems.map(item =>
      item.ledger === 'B10' ? { ...item, status: 'missing' as const } : item
    );
    const release = evaluateReleaseReadiness(items);
    expect(release.deferred.map(item => item.id)).toEqual([
      'plugin-submission',
    ]);
    expect(
      getLegalPublication(
        'privacy',
        {
          ...approvedDocuments,
          privacy: { ...approvedDocuments.privacy, status: 'draft' },
        },
        items
      ).approved
    ).toBe(false);
    // 文書の正当な承認をしてもB10が承認されたことにはならない。
    expect(
      getLegalPublication('privacy', approvedDocuments, items).approved
    ).toBe(true);
    expect(items.find(item => item.ledger === 'B10')?.status).toBe('missing');
  });
});
