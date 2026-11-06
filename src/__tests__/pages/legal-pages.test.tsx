import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { OperatorProfileList } from '@/components/legal/operator-profile-list';
import { LegalPage } from '@/components/legal/legal-page';
import * as readiness from '@/components/public/release-readiness';
import {
  operatorProfile,
  type OperatorProfile,
} from '@/components/public/release-readiness';
import { setupPublicSiteTestEnvironment } from './public-site-test-utils';

jest.mock('@/components/public/release-readiness', () => {
  const actual = jest.requireActual<
    typeof import('@/components/public/release-readiness')
  >('@/components/public/release-readiness');
  return {
    ...actual,
    getLegalPublication: jest.fn(actual.getLegalPublication),
  };
});

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

function renderOperatorProfile(profile: OperatorProfile) {
  const previous = { ...operatorProfile };
  Object.assign(operatorProfile, profile);
  try {
    return render(<OperatorProfileList />);
  } finally {
    Object.assign(operatorProfile, previous);
  }
}

describe('Legal pages', () => {
  setupPublicSiteTestEnvironment();
  const savedProfile = { ...operatorProfile };
  beforeEach(() => {
    // 本人が公開用値を承認した台帳とは分け、従来の未承認本文ケースを明示的に検証する。
    Object.assign(operatorProfile, {
      businessType: { value: '（テスト用）未承認の区分', status: 'confirmed' },
      name: { value: null, status: 'confirmed' },
      brand: { value: '（テスト用）未承認のブランド', status: 'draft' },
      addressAndPhonePolicy: {
        value: '（テスト用）未承認の開示方針',
        status: 'draft',
      },
      publicEmail: { value: null, status: 'missing' },
    } satisfies OperatorProfile);
    const actual = jest.requireActual<
      typeof import('@/components/public/release-readiness')
    >('@/components/public/release-readiness');
    jest
      .mocked(readiness.getLegalPublication)
      .mockImplementation(actual.getLegalPublication);
  });
  afterEach(() => {
    Object.assign(operatorProfile, savedProfile);
  });

  test('/terms 共通条項は意味とアンカーを維持して1〜5の順序で表示', async () => {
    const { default: TermsPage } = await import('@/app/(public)/terms/page');
    const { container } = render(<TermsPage />);
    const titles = [...container.querySelectorAll('#common h3')].map(
      heading => heading.textContent
    );
    expect(titles).toEqual([
      '1. 運営者',
      '2. 契約の成立・料金・契約期間',
      '3. アカウント・権限・禁止事項',
      '4. 期間・更新・解約・返金・支払遅延',
      '5. お問い合わせ',
    ]);
    expect(container.querySelector('a[href="#common"]')).toBeInTheDocument();
  });

  test('文書承認後のみ警告を消し、承認された改定日・施行日を表示する', () => {
    const publication = jest.spyOn(readiness, 'getLegalPublication');
    try {
      publication.mockReturnValue({
        approved: true,
        revisedOn: '2026-10-31',
        effectiveOn: '2026-11-01',
      });
      const { container, rerender } = render(
        <LegalPage title='テスト原稿' document='privacy' sections={[]} />
      );
      expect(container).toHaveTextContent(
        '改定日: 2026-10-31 ／ 施行日: 2026-11-01'
      );
      expect(screen.queryByLabelText('法務確認状況')).not.toBeInTheDocument();
      publication.mockReturnValue({ approved: false });
      rerender(
        <LegalPage title='テスト原稿' document='privacy' sections={[]} />
      );
      expect(screen.getByLabelText('法務確認状況')).toHaveTextContent(
        '商用利用前の法務確認が必要です'
      );
      expect(container).not.toHaveTextContent('2026-10-31');
      expect(container).toHaveTextContent('改定日・施行日は未確定');
    } finally {
      publication.mockRestore();
    }
  });

  test('3ページのmetadataと全目次アンカーが本文・承認状態に対応する', async () => {
    const pages = [
      ['privacy', await import('@/app/(public)/privacy/page')],
      ['terms', await import('@/app/(public)/terms/page')],
      ['legal', await import('@/app/(public)/legal/page')],
    ] as const;
    for (const [path, page] of pages) {
      expect(page.metadata.alternates?.canonical).toBe(`/${path}`);
      expect(page.metadata.description).toContain('公開承認待ち');
      const { container, unmount } = render(React.createElement(page.default));
      for (const anchor of container.querySelectorAll(
        'nav[aria-label="このページの目次"] a'
      )) {
        const href = anchor.getAttribute('href');
        expect(href).toMatch(/^#/);
        if (href)
          expect(container.querySelector(`section${href}`)).toBeInTheDocument();
      }
      expect(container).toHaveTextContent('改定日・施行日は未確定');
      expect(container).not.toHaveTextContent('最終更新日: 2026-10-22');
      unmount();
    }
  });

  test('プライバシーの実装事実・保持限界・責任分界と利用規約の必要条項', async () => {
    const { default: PrivacyPage } =
      await import('@/app/(public)/privacy/page');
    const { container, unmount } = render(<PrivacyPage />);
    for (const text of [
      'Gemini',
      'スタッフ名',
      '利用院の指示と利用目的の範囲',
      '国外への個人データの提供',
      '認証情報',
      'OpenAI',
      'Supabase',
      'Trigger.dev',
      'PHI',
      '24時間',
      '7日',
      'バックアップ',
      '自動削除されません',
      '東京リージョン',
      'サーバーから実際に削除される時点は異なります',
      'アカウント・OS・業務記録の保存期間',
      '問い合わせへの回答と関連する対応が完了するまで保存',
      '対象データ、対応方法および完了の見込み',
      '投稿案の保存には別の依頼が必要',
      'Worksで会話から利用するSquare予約の検証用連携',
    ]) {
      expect(container).toHaveTextContent(text);
    }
    unmount();
    const { default: TermsPage } = await import('@/app/(public)/terms/page');
    const terms = render(<TermsPage />);
    for (const text of [
      '契約の成立時点',
      '最低利用期間',
      '自動更新',
      '解約',
      '返金',
      'データ処理契約',
      '実行結果が不明な操作を自動再送しません',
      '新しい依頼として再送する前に',
      '知的財産',
      '秘密保持',
      '損害賠償',
      '準拠法',
      '紛争解決',
    ]) {
      expect(terms.container).toHaveTextContent(text);
    }
    expect(terms.container).not.toHaveTextContent('利用した時点で本規約に同意');
    expect(terms.container).toHaveTextContent(
      '別途提示する条件に基づき申込みを受け付けます'
    );
    expect(terms.container).toHaveTextContent(
      'サイトの閲覧やお問い合わせだけで有料契約は成立しません'
    );
  });

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
    expect(
      screen.getByText(/お申込み前に、利用する製品と提供範囲/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /本規約のみを根拠に、最低利用期間、自動更新又は返金不可の条件を付加/
      )
    ).toBeInTheDocument();
  });

  test('/privacy でプライバシーポリシーが表示される', async () => {
    const { default: PrivacyPage } =
      await import('@/app/(public)/privacy/page');

    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'プライバシーポリシー' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/利用院が預ける情報は、利用院の指示と利用目的の範囲/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('商用利用前の法務確認が必要です')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /ご請求の内容に応じて、ご本人.*管理権限.*利用院と連携して対応/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/当事業者が管理する範囲を手動で確認して対応/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText('確認用原稿に残る未確定事項')
    ).not.toBeInTheDocument();
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
    // 区分は事実確認済みだが公開承認前のため、値ではなく「確定後に掲載します」を表示する（F3）。
    expect(
      within(operator).getByText('事業者の区分').closest('div')
    ).toHaveTextContent('確定後に掲載します');
    expect(
      within(operator).getByText('所在地').closest('div')
    ).toHaveTextContent('ご請求に応じてお知らせします');

    const disclosure = container.querySelector(
      'section#operator-disclosure'
    ) as HTMLElement;
    // 開示方針の掲載文は下書きのため表示せず、開示請求の導線は維持する。
    expect(disclosure).toHaveTextContent('確定後に掲載します');
    expect(
      within(disclosure).getByRole('link', { name: '事業者情報の開示請求へ' })
    ).toHaveAttribute('href', '/contact?intent=operator-disclosure');
    expect(
      within(disclosure).getByRole('link', {
        name: 'プライバシーポリシーの「開示等の請求・お問い合わせ」',
      })
    ).toHaveAttribute('href', '/privacy#requests');

    const works = container.querySelector('section#works') as HTMLElement;
    const os = container.querySelector('section#os') as HTMLElement;
    expect(
      within(works).getByRole('link', { name: 'Tiramisu Worksの料金欄' })
    ).toHaveAttribute('href', '/works#pricing');
    expect(
      within(os).getByRole('link', { name: 'Tiramisu OSの料金欄' })
    ).toHaveAttribute('href', '/os#pricing');
    for (const section of [works, os]) {
      expect(section).toHaveTextContent(
        '掲載額をそのまま契約金額とするものではありません'
      );
      expect(section).toHaveTextContent('税区分');
      for (const label of [
        '支払方法・支払時期',
        '提供開始時期',
        '契約期間・更新',
        '解約・返金',
      ]) {
        const row = within(section).getByText(label).closest('div');
        expect(row).not.toHaveTextContent('確定後に掲載します');
        expect(row).toHaveTextContent(/契約|申込み/);
      }
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

  test('/legal の描画HTMLに未承認の運営者情報の値を含めない（F3）', async () => {
    const { default: LegalNoticePage } =
      await import('@/app/(public)/legal/page');
    const { container } = render(<LegalNoticePage />);
    const html = container.innerHTML;
    for (const field of [
      operatorProfile.businessType,
      operatorProfile.brand,
      operatorProfile.addressAndPhonePolicy,
    ]) {
      expect(field.status).not.toBe('approved_for_publication');
      expect(field.value).not.toBeNull();
      expect(html).not.toContain(field.value as string);
    }
  });

  test('未承認の値は非nullでも運営者情報に描画しない（F3）', () => {
    const unapproved: OperatorProfile = {
      businessType: { value: '（テスト用）未承認の区分', status: 'confirmed' },
      name: { value: '（テスト用）未承認の氏名', status: 'confirmed' },
      brand: { value: '（テスト用）未承認のブランド', status: 'draft' },
      addressAndPhonePolicy: {
        value: '（テスト用）未承認の方針',
        status: 'draft',
      },
      publicEmail: {
        value: 'unapproved@fictional-tiramisu-test.co.jp',
        status: 'missing',
      },
    };
    const { container } = renderOperatorProfile(unapproved);
    expect(container.innerHTML).not.toMatch(/未承認|unapproved@/);
    expect(screen.getAllByText('確定後に掲載します')).toHaveLength(4);
  });

  test('公開承認済みでも空白だけの値は描画しない（F3）', () => {
    const blank: OperatorProfile = {
      ...operatorProfile,
      name: { value: '   ', status: 'approved_for_publication' },
    };
    renderOperatorProfile(blank);
    expect(screen.getByText('事業者の氏名').closest('div')).toHaveTextContent(
      '確定後に掲載します'
    );
  });

  test('公開承認された値だけが運営者情報に表示される', () => {
    const approved: OperatorProfile = {
      ...operatorProfile,
      name: {
        value: '（テスト用）事業者名',
        status: 'approved_for_publication',
      },
    };
    renderOperatorProfile(approved);
    expect(screen.getByText('（テスト用）事業者名')).toBeInTheDocument();
    const email: OperatorProfile = {
      ...operatorProfile,
      publicEmail: {
        value: 'contact@fictional-tiramisu-test.co.jp',
        status: 'approved_for_publication',
      },
    };
    renderOperatorProfile(email);
    expect(
      screen.getByText('contact@fictional-tiramisu-test.co.jp')
    ).toBeInTheDocument();
  });
});
