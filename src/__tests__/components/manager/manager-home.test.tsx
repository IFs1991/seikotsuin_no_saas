/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ManagerHome } from '@/components/manager/manager-home';
import { useManagerAssignedClinics } from '@/hooks/useManagerAssignedClinics';
import { useManagerDashboard } from '@/hooks/useManagerDashboard';
import type { ManagerAssignedClinicsResponse } from '@/types/manager-assigned-clinics';

jest.mock('@/hooks/useManagerAssignedClinics', () => ({
  useManagerAssignedClinics: jest.fn(),
}));

jest.mock('@/hooks/useManagerDashboard', () => ({
  useManagerDashboard: jest.fn(),
}));

const useManagerAssignedClinicsMock = jest.mocked(useManagerAssignedClinics);
const useManagerDashboardMock = jest.mocked(useManagerDashboard);
const refetch = jest.fn().mockResolvedValue(undefined);

const data: ManagerAssignedClinicsResponse = {
  generatedAt: '2026-06-12T03:00:00.000Z',
  clinics: [
    { id: 'clinic-a', name: '池袋院' },
    { id: 'clinic-b', name: '横浜院' },
  ],
};

describe('ManagerHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useManagerAssignedClinicsMock.mockReturnValue({
      data,
      loading: false,
      error: null,
      refetch,
    });
  });

  it('renders manager home title, assigned clinics, and existing feature cards', () => {
    render(<ManagerHome />);

    expect(
      screen.getByRole('heading', { name: '管理ホーム' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('担当院の管理機能の入口です。')
    ).toBeInTheDocument();
    expect(screen.getByText('池袋院')).toBeInTheDocument();
    expect(screen.getByText('横浜院')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /担当院スタッフ分析/ })
    ).toHaveAttribute('href', '/manager/staff-analysis');
    expect(
      screen.getByRole('link', { name: /担当院スタッフ一覧/ })
    ).toHaveAttribute('href', '/manager/staff');
    expect(
      screen.getByRole('link', { name: /担当院希望シフト/ })
    ).toHaveAttribute('href', '/manager/shift-requests');
    expect(
      screen.getByRole('link', { name: /担当院比較分析/ })
    ).toHaveAttribute('href', '/manager/clinic-comparison');
    expect(useManagerDashboardMock).not.toHaveBeenCalled();
  });

  it('does not render links for admin-only routes', () => {
    render(<ManagerHome />);

    const hrefs = screen
      .getAllByRole('link')
      .map(link => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/manager/staff-analysis',
      '/manager/staff',
      '/manager/shift-requests',
      '/manager/clinic-comparison',
    ]);
    expect(hrefs).not.toContain('/admin');
    expect(hrefs).not.toContain('/admin/users');
    expect(hrefs).not.toContain('/admin/shift-requests');
    expect(hrefs).not.toContain('/admin/settings');
    expect(hrefs).not.toContain('/multi-store');
  });

  it('shows empty assignment state when clinics are empty', () => {
    useManagerAssignedClinicsMock.mockReturnValue({
      data: {
        ...data,
        clinics: [],
      },
      loading: false,
      error: null,
      refetch,
    });

    render(<ManagerHome />);

    expect(
      screen.getByText('担当院がまだ設定されていません。')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '管理者にマネージャー管理から担当店舗の設定を依頼してください。'
      )
    ).toBeInTheDocument();
  });

  it('renders loading and retryable error states', () => {
    useManagerAssignedClinicsMock.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch,
    });

    const { rerender } = render(<ManagerHome />);
    expect(screen.getByText('管理ホームを読み込み中...')).toBeInTheDocument();

    useManagerAssignedClinicsMock.mockReturnValue({
      data: null,
      loading: false,
      error: '取得に失敗しました',
      refetch,
    });
    rerender(<ManagerHome />);

    expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not render write actions', () => {
    render(<ManagerHome />);

    expect(screen.queryByText('スタッフを追加')).not.toBeInTheDocument();
    expect(screen.queryByText('設定を変更')).not.toBeInTheDocument();
    expect(screen.queryByText('期間を作成')).not.toBeInTheDocument();
    expect(screen.queryByText('承認')).not.toBeInTheDocument();
  });
});
