/** @jest-environment jsdom */
/**
 * 共通の問い合わせページ（/contact）
 * 仕様: Tiramisu共通サイト・LP統合 v2.0（A13, A26〜A34）
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ContactPage from '@/app/(public)/contact/page';
import type { ContactSearchParams } from '@/components/public/marketing-links';
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

const DEFAULT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdDWLJGheg_Qgaxz7p2X45GumchuLIqabYjAmcBV-4h82HQag/viewform?usp=publish-editor';

async function renderContact(params: ContactSearchParams = {}) {
  const element = await ContactPage({ searchParams: Promise.resolve(params) });
  return render(element);
}

describe('ContactPage（/contact）', () => {
  setupPublicSiteTestEnvironment();
  const originalFormUrl = process.env.NEXT_PUBLIC_LP_FORM_URL;

  afterEach(() => {
    if (originalFormUrl === undefined) {
      delete process.env.NEXT_PUBLIC_LP_FORM_URL;
    } else {
      process.env.NEXT_PUBLIC_LP_FORM_URL = originalFormUrl;
    }
  });

  it('既存のGoogleフォームを外部リンクとして開き、受付完了とは表示しない（A29/A31/A32）', async () => {
    delete process.env.NEXT_PUBLIC_LP_FORM_URL;
    const { container } = await renderContact();

    const formLink = screen.getByRole('link', { name: /Googleフォームを開く/ });
    expect(formLink).toHaveAttribute('href', DEFAULT_FORM_URL);
    expect(formLink).toHaveAttribute('target', '_blank');
    expect(formLink.getAttribute('rel')).toMatch(/noopener/);
    expect(
      screen.getByText(/フォームを開いただけでは受付になりません/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /患者・顧客の個人情報、パスワード、認証コード、APIキーは入力しないでください/
      )
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /受け付けました|受付完了|送信完了|営業日以内|24時間/
    );
    // 事前入力の entry ID を推測で付けない
    expect(container.innerHTML).not.toMatch(/entry\.\d+/);
  });

  it('製品・希望プランを表示補助として示し、フォームへの自動転記はしないと明示する（A27/A28/A31）', async () => {
    await renderContact({
      product: 'works',
      intent: 'sales',
      plan: 'standard',
    });

    const selection = screen
      .getByRole('heading', { level: 2, name: '選択中の内容' })
      .closest('section') as HTMLElement;
    expect(selection).toHaveTextContent('Tiramisu Works');
    expect(selection).toHaveTextContent('導入相談');
    expect(selection).toHaveTextContent(
      'Standard（暫定価格: 月額29,800円・初期費用100,000円、税別）'
    );
    expect(selection).toHaveTextContent('フォームには自動で入力されません');
    // 導入相談の説明カードが選択中になる
    expect(
      within(document.getElementById('sales') as HTMLElement).getByText(
        '選択中'
      )
    ).toBeInTheDocument();
  });

  it('OSの相談では希望プランを採用しない（A28）', async () => {
    await renderContact({ product: 'os', intent: 'sales', plan: 'pro' });

    const selection = screen
      .getByRole('heading', { level: 2, name: '選択中の内容' })
      .closest('section') as HTMLElement;
    expect(selection).toHaveTextContent('Tiramisu OS');
    const rowLabels = within(selection)
      .getAllByRole('term')
      .map(term => term.textContent);
    expect(rowLabels).toEqual(['対象の製品', 'ご相談の種類']);
  });

  it('未知の値・重複・HTMLを含むqueryは表示に使わない（A26）', async () => {
    const { container } = await renderContact({
      product: '<script>alert(1)</script>',
      intent: ['sales', 'support'],
      plan: 'javascript:alert(1)',
    });

    expect(
      screen.queryByRole('heading', { level: 2, name: '選択中の内容' })
    ).toBeNull();
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).not.toContain('alert(1)');
  });

  it('不正なフォームURL設定では危険なリンクを出さず、安全な案内にする（A30）', async () => {
    process.env.NEXT_PUBLIC_LP_FORM_URL = 'javascript:alert(document.cookie)';
    const { container } = await renderContact();

    expect(
      screen.queryByRole('link', { name: /Googleフォームを開く/ })
    ).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'お問い合わせフォームへのリンクを表示できません'
    );
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('httpsのフォームURLが設定されていればそれを使う（A29）', async () => {
    process.env.NEXT_PUBLIC_LP_FORM_URL = 'https://forms.gle/example';
    await renderContact();

    expect(
      screen.getByRole('link', { name: /Googleフォームを開く/ })
    ).toHaveAttribute('href', 'https://forms.gle/example');
  });

  it('事業者情報の開示請求を、購入有無を問わない別窓口として案内する（A33/A34）', async () => {
    await renderContact({ intent: 'operator-disclosure' });

    const disclosure = document.getElementById(
      'operator-disclosure'
    ) as HTMLElement;
    expect(disclosure).toHaveTextContent('お申し込みの前でもご請求いただけ');
    expect(disclosure).toHaveTextContent('ご購入・ご契約の有無');
    expect(disclosure).toHaveTextContent(
      'ご本人の個人データの開示請求とは別の窓口'
    );
    expect(within(disclosure).getByText('選択中')).toBeInTheDocument();

    const privacy = document.getElementById('privacy') as HTMLElement;
    expect(privacy).toHaveTextContent('ご本人の個人データの開示・訂正');
    expect(
      within(privacy).getByRole('link', { name: 'プライバシーポリシー' })
    ).toHaveAttribute('href', '/privacy#requests');
  });

  it('製品選択モーダルや認証の導線で妨げない（A13）', async () => {
    const { container } = await renderContact();

    expect(document.querySelector('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: '製品を選ぶ' })).toBeNull();
    expect(container.querySelector('a[href="/works"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/os"]')).toBeInTheDocument();
  });
});
