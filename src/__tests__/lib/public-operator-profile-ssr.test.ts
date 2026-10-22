/** @jest-environment node */
/**
 * 運営者情報をサーバー描画したHTMLに、公開承認前の値が含まれないこと（F3）。
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorProfileList } from '@/components/legal/operator-profile-list';
import type { OperatorProfile } from '@/components/public/release-readiness';

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
