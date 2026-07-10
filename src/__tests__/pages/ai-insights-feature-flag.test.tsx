import React from 'react';
import { render, screen } from '@testing-library/react';

const useUserProfileContextMock = jest.fn();

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: useUserProfileContextMock,
}));

describe('AI insights page feature visibility', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;

  beforeEach(() => {
    useUserProfileContextMock.mockReturnValue({
      profile: {
        clinicId: 'clinic-1',
      },
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = originalFlag;
    }
  });

  it('flag が無効ならデータを取得せず利用不可を表示する', async () => {
    process.env.NEXT_PUBLIC_ENABLE_AI_INSIGHTS = 'false';
    const fetchMock = jest.spyOn(global, 'fetch');
    const { default: AiInsightsPage } =
      await import('@/app/(app)/ai-insights/page');

    render(<AiInsightsPage />);

    expect(
      screen.getByRole('heading', {
        name: 'AIインサイトは現在利用できません',
      })
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
