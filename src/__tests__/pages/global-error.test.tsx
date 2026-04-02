import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('GlobalError', () => {
  it('captures the rendering error and shows a fallback UI', async () => {
    const { captureException } = await import('@sentry/nextjs');
    const GlobalError = (await import('@/app/global-error')).default;
    const error = new Error('render failed');
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(<GlobalError error={error} reset={jest.fn()} />);

    await waitFor(() => {
      expect(captureException).toHaveBeenCalledWith(error);
    });

    expect(screen.getByText('システムエラーが発生しました')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '再読み込み' })
    ).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
