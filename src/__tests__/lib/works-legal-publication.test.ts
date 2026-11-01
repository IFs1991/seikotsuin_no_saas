import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LegalPage } from '@/components/legal/legal-page';
import {
  getLegalPublication,
  operatorProfile,
  type OperatorProfile,
} from '@/components/public/release-readiness';
import {
  worksLegalApprovals,
  type WorksLegalDocumentId,
} from '@/components/public/works-legal-approval-records';
import {
  getWorksLegalPublication,
  worksLegalGates,
  type WorksGate,
} from '@/components/public/works-release-readiness';
import { worksDocumentMetadata } from '@/components/legal/works-document';
import type { LegalDocumentApproval } from '@/components/public/legal-approval-records';
import { legalContentManifest } from '@/components/legal/legal-content-manifest';

jest.mock('@/components/public/works-release-readiness', () => {
  const actual = jest.requireActual<
    typeof import('@/components/public/works-release-readiness')
  >('@/components/public/works-release-readiness');
  return {
    ...actual,
    getWorksLegalPublication: jest.fn(actual.getWorksLegalPublication),
  };
});

// すべて合成値。実際の公開承認を付与しない。
const profile: OperatorProfile = {
  businessType: { value: '架空の事業区分', status: 'approved_for_publication' },
  name: { value: '架空の公開者', status: 'approved_for_publication' },
  brand: { value: '架空のブランド', status: 'approved_for_publication' },
  addressAndPhonePolicy: {
    value: '架空の開示方針',
    status: 'approved_for_publication',
  },
  publicEmail: {
    value: 'support@fictional-tiramisu-test.co.jp',
    status: 'approved_for_publication',
  },
};
const origin = {
  value: 'https://lp.fictional-tiramisu-test.co.jp',
  status: 'approved_for_publication',
} as const;
const gates: WorksGate[] = worksLegalGates.map(gate => ({
  ...gate,
  status: 'approved_for_publication',
  evidence: '合成の運用確認証跡',
}));
const content = { sha256: 'b'.repeat(64), unresolvedFields: [] };
const contents = {
  'works/privacy': content,
  'works/terms': content,
  'works/plugin': content,
};
const approval: LegalDocumentApproval = {
  status: 'approved_for_publication',
  contentVersion: 'synthetic-v1',
  reviewedVersion: 'synthetic-v1',
  approvedContentHash: content.sha256,
  reviewedContentHash: content.sha256,
  approvedOn: '2026-10-31',
  revisedOn: '2026-11-01',
  effectiveOn: '2026-11-01',
  reviewedRevisedOn: '2026-11-01',
  reviewedEffectiveOn: '2026-11-01',
  evidence: '合成の承認記録',
  unresolvedDecisions: [],
};
const approvals: Record<WorksLegalDocumentId, LegalDocumentApproval> = {
  'works/privacy': approval,
  'works/terms': approval,
  'works/plugin': approval,
};
const check = (overrides: Partial<LegalDocumentApproval> = {}) =>
  getWorksLegalPublication(
    'works/privacy',
    { ...approvals, 'works/privacy': { ...approval, ...overrides } },
    gates,
    contents,
    profile,
    origin
  );

describe('WorksとOSの法務承認境界', () => {
  afterEach(() => jest.restoreAllMocks());
  it('Worksの正しい承認だけで成立し、OSは保留のまま', () => {
    expect(check().approved).toBe(true);
    for (const id of ['privacy', 'terms', 'legal'] as const)
      expect(getLegalPublication(id).approved).toBe(false);
    expect(getWorksLegalPublication('works/privacy').approved).toBe(false);
    expect(
      Object.values(worksLegalApprovals).every(
        record => record.status === 'draft' && record.approvedOn === null
      )
    ).toBe(true);
  });
  it.each([
    { status: 'draft' },
    { reviewedVersion: 'stale' },
    { approvedContentHash: 'a'.repeat(64) },
    { reviewedContentHash: null },
    { evidence: null },
    { approvedOn: '2026-02-30' },
    { effectiveOn: '2026-11-02' },
    { reviewedRevisedOn: null },
    { approvedOn: '2026-11-02' },
    { unresolvedDecisions: ['pending'] },
  ] satisfies Partial<LegalDocumentApproval>[])(
    '不正・古い承認を拒否: %j',
    changes => expect(check(changes).approved).toBe(false)
  );
  it('原稿変更、未解決マーカー、未承認の実値を拒否', () => {
    expect(
      getWorksLegalPublication(
        'works/privacy',
        approvals,
        gates,
        {
          ...contents,
          'works/privacy': { ...content, sha256: 'c'.repeat(64) },
        },
        profile,
        origin
      ).approved
    ).toBe(false);
    expect(
      getWorksLegalPublication(
        'works/privacy',
        approvals,
        gates,
        legalContentManifest.documents,
        profile,
        origin
      ).approved
    ).toBe(false);
    expect(
      getWorksLegalPublication(
        'works/privacy',
        approvals,
        gates,
        contents,
        operatorProfile,
        origin
      ).approved
    ).toBe(false);
    for (const field of Object.keys(profile) as Array<keyof OperatorProfile>) {
      expect(
        getWorksLegalPublication(
          'works/privacy',
          approvals,
          gates,
          contents,
          {
            ...profile,
            [field]: { value: null, status: 'approved_for_publication' },
          },
          origin
        ).approved
      ).toBe(false);
    }
    for (const value of [
      null,
      '',
      'https://example.com',
      'http://lp.fictional-tiramisu-test.co.jp',
      'https://lp.fictional-tiramisu-test.co.jp/path',
    ])
      expect(
        getWorksLegalPublication(
          'works/privacy',
          approvals,
          gates,
          contents,
          profile,
          { ...origin, value }
        ).approved
      ).toBe(false);
    expect(
      getWorksLegalPublication(
        'works/privacy',
        approvals,
        gates,
        contents,
        {
          ...profile,
          publicEmail: {
            value: 'bad-email',
            status: 'approved_for_publication',
          },
        },
        origin
      ).approved
    ).toBe(false);
  });
  it('ゲートの欠落・重複・未承認・証跡欠落を拒否', () => {
    for (const gate of gates)
      for (const changed of [
        gates.filter(g => g.id !== gate.id),
        [...gates, gate],
        gates.map(g => (g.id === gate.id ? { ...g, evidence: null } : g)),
        gates.map(g =>
          g.id === gate.id ? { ...g, status: 'confirmed' as const } : g
        ),
      ])
        expect(
          getWorksLegalPublication(
            'works/privacy',
            approvals,
            changed,
            contents,
            profile,
            origin
          ).approved
        ).toBe(false);
  });
  it('ProductionではWorksの承認と独立した明示配信設定が必要。OS原稿は非公開', () => {
    const old = {
      vercel: process.env.VERCEL_ENV,
      works: process.env.WORKS_LEGAL_PUBLICATION_MODE,
      os: process.env.LEGAL_PUBLICATION_MODE,
    };
    process.env.VERCEL_ENV = 'production';
    process.env.LEGAL_PUBLICATION_MODE = 'approved';
    const render = (document: 'privacy' | 'works/privacy') =>
      renderToStaticMarkup(
        createElement(LegalPage, {
          title: '合成試験',
          document,
          sections: [{ id: 'scope', title: '範囲', body: 'BODY_SENTINEL' }],
        })
      );
    try {
      process.env.WORKS_LEGAL_PUBLICATION_MODE = 'approved';
      expect(render('works/privacy')).not.toContain('BODY_SENTINEL');
      const approvedPublication = check();
      jest
        .mocked(getWorksLegalPublication)
        .mockReturnValueOnce(approvedPublication);
      expect(render('works/privacy')).toContain('BODY_SENTINEL');
      expect(render('privacy')).not.toContain('BODY_SENTINEL');
      jest
        .mocked(getWorksLegalPublication)
        .mockReturnValueOnce(approvedPublication);
      expect(render('works/privacy')).toContain('/works/terms');
      jest
        .mocked(getWorksLegalPublication)
        .mockReturnValueOnce(approvedPublication);
      expect(render('works/privacy')).toContain(
        '/contact?product=works&amp;intent=support'
      );
      process.env.WORKS_LEGAL_PUBLICATION_MODE = 'hold';
      expect(render('works/privacy')).not.toContain('BODY_SENTINEL');
      expect(worksDocumentMetadata('works/privacy', '合成試験').robots).toEqual(
        { index: false, follow: false }
      );
    } finally {
      for (const [key, value] of [
        ['VERCEL_ENV', old.vercel],
        ['WORKS_LEGAL_PUBLICATION_MODE', old.works],
        ['LEGAL_PUBLICATION_MODE', old.os],
      ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
