/** @jest-environment node */
/**
 * 運営者情報をサーバー描画したHTMLに、公開承認前の値が含まれないこと（F3）。
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorProfileList } from '@/components/legal/operator-profile-list';
import type { OperatorProfile } from '@/components/public/release-readiness';
import { operatorProfile } from '@/components/public/release-readiness';
import PrivacyPage, {
  metadata as privacyMetadata,
} from '@/app/(public)/privacy/page';
import TermsPage, {
  metadata as termsMetadata,
} from '@/app/(public)/terms/page';
import LegalPage, {
  metadata as legalMetadata,
} from '@/app/(public)/legal/page';

// Next ImageのpreloadはNextのrequest contextが必要。画像描画のみ置換する。
// 法務本文・運営者情報・共通ヘッダー/フッターは実コンポーネントでSSR検証する。
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string | { src: string }; alt: string }) =>
    createElement('img', { src: typeof src === 'string' ? src : src.src, alt }),
}));

const unapproved: OperatorProfile = {
  businessType: { value: '（テスト用）未承認の区分', status: 'confirmed' },
  name: { value: '（テスト用）未承認の氏名', status: 'confirmed' },
  brand: { value: '（テスト用）未承認のブランド', status: 'draft' },
  addressAndPhonePolicy: { value: '（テスト用）未承認の方針', status: 'draft' },
  publicEmail: {
    value: 'unapproved@fictional-tiramisu-test.co.jp',
    status: 'missing',
  },
};

describe('運営者情報のサーバー描画（F3）', () => {
  it('3文書のSSR・metadataにも未承認値や架空の施行日を含めない', () => {
    const original = { ...operatorProfile };
    Object.assign(operatorProfile, unapproved);
    try {
      for (const [page, metadata] of [
        [PrivacyPage, privacyMetadata],
        [TermsPage, termsMetadata],
        [LegalPage, legalMetadata],
      ] as const) {
        const output =
          renderToStaticMarkup(createElement(page)) + JSON.stringify(metadata);
        for (const field of Object.values(unapproved)) {
          if (field.value) expect(output).not.toContain(field.value);
        }
        expect(output).not.toMatch(/〒\s?\d{3}-?\d{4}|\d{2,4}-\d{2,4}-\d{3,4}/);
        expect(output).toContain('改定日・施行日は未確定');
        expect(output).toContain('商用利用前の法務確認が必要です');
      }
    } finally {
      Object.assign(operatorProfile, original);
    }
  });
  it('未承認の値はサーバー描画HTMLに含まれない', () => {
    const html = renderToStaticMarkup(
      createElement(OperatorProfileList, { profile: unapproved })
    );
    expect(html).toContain('確定後に掲載します');
    expect(html).not.toMatch(/未承認|unapproved@/);
  });

  it('公開承認済みの値はサーバー描画HTMLに含まれる', () => {
    const html = renderToStaticMarkup(
      createElement(OperatorProfileList, {
        profile: {
          ...unapproved,
          name: {
            value: '（テスト用）承認済みの氏名',
            status: 'approved_for_publication',
          },
        },
      })
    );
    expect(html).toContain('（テスト用）承認済みの氏名');
    expect(html).not.toContain('未承認の区分');
  });
});
