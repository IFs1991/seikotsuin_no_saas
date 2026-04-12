import React from 'react';
import { render, screen } from '@testing-library/react';

describe('Legal pages', () => {
  test('/terms で利用規約が表示される', async () => {
    const { default: TermsPage } = await import('@/app/(public)/terms/page');

    render(<TermsPage />);

    expect(screen.getByRole('heading', { name: '利用規約' })).toBeInTheDocument();
    expect(
      screen.getByText(/個人情報保護法|医療情報ガイドライン/)
    ).toBeInTheDocument();
  });

  test('/privacy でプライバシーポリシーが表示される', async () => {
    const { default: PrivacyPage } = await import('@/app/(public)/privacy/page');

    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'プライバシーポリシー' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/個人情報保護法|医療情報ガイドライン/)
    ).toBeInTheDocument();
  });
});
