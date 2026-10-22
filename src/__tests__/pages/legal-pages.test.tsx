import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { OperatorProfileList } from '@/components/legal/operator-profile-list';
import {
  operatorProfile,
  type OperatorProfile,
} from '@/components/public/release-readiness';
import { worksPlans, formatYen } from '@/components/public/works-content';
import { planItems } from '@/components/public/lp-content';
import { setupPublicSiteTestEnvironment } from './public-site-test-utils';

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { href, ...rest }, children);
  MockLink.displayName = 'Link';
  return MockLink;
});

describe('Legal pages', () => {
  setupPublicSiteTestEnvironment();

  test('/terms で利用規約が表示される', async () => {
    const { default: TermsPage } = await import('@/app/(public)/terms/page');

    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { name: '利用規約' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/適用される法令・ガイドライン/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('商用利用前の法務確認が必要です')
    ).toBeInTheDocument();
    expect(screen.getByText(/事業者の正式名称.*未確定/)).toBeInTheDocument();
  });

  test('/privacy でプライバシーポリシーが表示される', async () => {
    const { default: PrivacyPage } =
      await import('@/app/(public)/privacy/page');

    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'プライバシーポリシー' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/医療情報システムの安全管理に関するガイドライン/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('商用利用前の法務確認が必要です')
    ).toBeInTheDocument();
    expect(screen.getByText(/正式窓口.*未確定/)).toBeInTheDocument();
  });

  test('/terms は共通事項と製品別の条件を見出し・アンカーで分ける', async () => {
    const { default: TermsPage } = await import('@/app/(public)/terms/page');
    const { container } = render(<TermsPage />);

    for (const [id, title] of [
      ['common', '共通事項'],
      ['os', 'Tiramisu OS（店舗・本部管理）の条件'],
      ['works', 'Tiramisu Works（既存ツールを活かす業務支援）の条件'],
    ]) {
      const section = container.querySelector(`section#${id}`);
      expect(section).toBeInTheDocument();
      expect(
        within(section as HTMLElement).getByRole('heading', { level: 2 })
      ).toHaveTextContent(title);
      expect(container.querySelector(`a[href="#${id}"]`)).toBeInTheDocument();
    }
    // 法人を前提にした「当社」を使わない
    expect(container.textContent).not.toContain('当社');
    // 法務ページでは製品選択モーダルを出さない（A13）
    expect(screen.queryByRole('button', { name: '製品を選ぶ' })).toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('/privacy は製品・フォームごとに分け、2種類の開示請求を別窓口として案内する（A34）', async () => {
    const { default: PrivacyPage } =
      await import('@/app/(public)/privacy/page');
    const { container } = render(<PrivacyPage />);

    for (const id of ['common', 'os', 'works', 'contact-form', 'requests']) {
      expect(container.querySelector(`section#${id}`)).toBeInTheDocument();
    }
    const requests = container.querySelector('section#requests') as HTMLElement;
    expect(
      within(requests).getByRole('link', {
        name: 'お問い合わせページの「個人情報の取扱い・削除依頼」',
      })
    ).toHaveAttribute('href', '/contact?intent=privacy');
    expect(
      within(requests).getByRole('link', { name: '「事業者情報の開示請求」' })
    ).toHaveAttribute('href', '/contact?intent=operator-disclosure');
    expect(container.textContent).not.toContain('当社');
  });

  test('/legal で運営者情報・販売条件と開示請求の導線が表示される（A33/A35/A40）', async () => {
    const { default: LegalNoticePage } =
      await import('@/app/(public)/legal/page');
    const { container } = render(<LegalNoticePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: '運営者情報・販売条件' })
    ).toBeInTheDocument();
    const operator = container.querySelector('section#operator') as HTMLElement;
    expect(operator).toHaveTextContent('個人事業主');

    const disclosure = container.querySelector(
      'section#operator-disclosure'
    ) as HTMLElement;
    expect(disclosure).toHaveTextContent('お申し込み前にもご請求いただけます');
    expect(
      within(disclosure).getByRole('link', { name: '事業者情報の開示請求へ' })
    ).toHaveAttribute('href', '/contact?intent=operator-disclosure');
    expect(
      within(disclosure).getByRole('link', {
        name: 'プライバシーポリシーの「開示等の請求・お問い合わせ」',
      })
    ).toHaveAttribute('href', '/privacy#requests');

    const works = container.querySelector('section#works') as HTMLElement;
    for (const plan of worksPlans) {
      expect(works).toHaveTextContent(
        `${plan.name}: 月額${formatYen(plan.monthlyFeeYen)}・初期費用${formatYen(plan.initialFeeYen)}`
      );
    }
    const os = container.querySelector('section#os') as HTMLElement;
    for (const plan of planItems) {
      expect(os).toHaveTextContent(
        `${plan.name}: 月額${plan.monthlyPrice}・初期費用${plan.initialCost}`
      );
    }
  });

  test('/legal は未承認の氏名・所在地・電話番号の値を表示しない（A43/A44）', async () => {
    const { default: LegalNoticePage } =
      await import('@/app/(public)/legal/page');
    const { container } = render(<LegalNoticePage />);
    const operator = container.querySelector('section#operator') as HTMLElement;

    const nameRow = within(operator).getByText('事業者の氏名').closest('div');
    expect(nameRow).toHaveTextContent('確定後に掲載します');
    // 電話番号・郵便番号の形をした値を含まない
    expect(container.textContent).not.toMatch(
      /\d{2,4}-\d{2,4}-\d{3,4}|〒\s?\d{3}-?\d{4}/
    );
    expect(operatorProfile.name.value).toBeNull();
  });

  test('公開承認された値だけが運営者情報に表示される', () => {
    const approved: OperatorProfile = {
      ...operatorProfile,
      name: {
        value: '（テスト用）事業者名',
        status: 'approved_for_publication',
      },
    };
    render(<OperatorProfileList profile={approved} />);
    expect(screen.getByText('（テスト用）事業者名')).toBeInTheDocument();
  });
});
