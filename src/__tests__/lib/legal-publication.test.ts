import {
  getLegalPublication,
  legalDocumentApprovals,
  releaseCheckItems,
  evaluateReleaseReadiness,
  type LegalDocumentApproval,
  type LegalDocumentId,
  type ReleaseCheckItem,
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

describe('文書公開承認はfail-closed（Issue #167）', () => {
  it.each<LegalDocumentId>(['privacy', 'terms', 'legal'])(
    '%s: 現在は未承認、承認済みの版・日付・全前提が揃った場合のみ正式表示',
    document => {
      expect(getLegalPublication(document)).toEqual({ approved: false });
      expect(
        getLegalPublication(document, approvedDocuments, approvedItems)
      ).toEqual({
        approved: true,
        revisedOn: '2026-10-31',
        effectiveOn: '2026-11-01',
      });
      expect(legalDocumentApprovals[document].approvedOn).toBeNull();
    }
  );
  const invalid: Partial<LegalDocumentApproval>[] = [
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
  it.each(
    releaseCheckItems
      .filter(item => item.requiredFor === 'release')
      .map(item => item.id)
  )('必須台帳%sの未承認/欠落を拒否', id => {
    expect(
      getLegalPublication(
        'privacy',
        approvedDocuments,
        approvedItems.map(item =>
          item.id === id ? { ...item, status: 'confirmed' } : item
        )
      ).approved
    ).toBe(false);
    expect(
      getLegalPublication(
        'privacy',
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
      getLegalPublication('privacy', legalDocumentApprovals, items).approved
    ).toBe(false);
    // 文書の正当な承認をしてもB10が承認されたことにはならない。
    expect(
      getLegalPublication('privacy', approvedDocuments, items).approved
    ).toBe(true);
    expect(items.find(item => item.ledger === 'B10')?.status).toBe('missing');
  });
});
