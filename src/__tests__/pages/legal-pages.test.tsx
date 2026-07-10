import React from 'react';
import { render, screen } from '@testing-library/react';

describe('Legal pages', () => {
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
});
