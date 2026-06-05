import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminManagersPage from '@/app/(app)/admin/(protected)/managers/page';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { useManagerAssignments } from '@/hooks/useManagerAssignments';
import { useUserProfileContext } from '@/providers/user-profile-context';
import {
  MANAGER_ASSIGNMENT_EMPTY_DESCRIPTION,
  MANAGER_ASSIGNMENT_EMPTY_TITLE,
  type ManagerAssignedClinic,
  type ManagerListItem,
} from '@/lib/admin/manager-assignments';

jest.mock('@/hooks/useAdminTenants', () => ({
  useAdminTenants: jest.fn(),
}));

jest.mock('@/hooks/useManagerAssignments', () => ({
  useManagerAssignments: jest.fn(),
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: jest.fn(),
}));

const useAdminTenantsMock = jest.mocked(useAdminTenants);
const useManagerAssignmentsMock = jest.mocked(useManagerAssignments);
const useUserProfileContextMock = jest.mocked(useUserProfileContext);

const fetchManagersMock = jest.fn();
const replaceManagerAssignmentsMock = jest.fn();
const fetchClinicsMock = jest.fn();

const assignedClinic: ManagerAssignedClinic = {
  assignment_id: 'assignment-1',
  clinic_id: 'clinic-1',
  clinic_name: '新宿院',
  assigned_at: '2026-06-01T00:00:00.000Z',
};

const manager: ManagerListItem = {
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'manager@example.com',
  full_name: '山田 太郎',
  primary_clinic_id: 'clinic-primary',
  primary_clinic_name: '本院',
  assigned_clinic_count: 1,
  assigned_clinics: [assignedClinic],
};

function setupHooks({
  role = 'admin',
  managers = [manager],
}: {
  role?: 'admin' | 'clinic_admin' | 'manager' | 'staff';
  managers?: ManagerListItem[];
} = {}) {
  fetchManagersMock.mockResolvedValue(managers);
  replaceManagerAssignmentsMock.mockResolvedValue([
    assignedClinic,
    {
      assignment_id: 'assignment-2',
      clinic_id: 'clinic-2',
      clinic_name: '横浜院',
      assigned_at: '2026-06-02T00:00:00.000Z',
    },
  ]);
  fetchClinicsMock.mockResolvedValue(undefined);

  useManagerAssignmentsMock.mockReturnValue({
    managers,
    loading: false,
    savingManagerUserId: null,
    error: null,
    fetchManagers: fetchManagersMock,
    replaceManagerAssignments: replaceManagerAssignmentsMock,
  });

  useAdminTenantsMock.mockReturnValue({
    clinics: [
      {
        id: 'clinic-1',
        name: '新宿院',
        is_active: true,
        parent_id: 'hq-1',
      },
      {
        id: 'clinic-2',
        name: '横浜院',
        is_active: true,
        parent_id: 'hq-1',
      },
      {
        id: 'hq-1',
        name: '本部',
        is_active: true,
        parent_id: null,
      },
    ],
    loading: false,
    error: null,
    fetchClinics: fetchClinicsMock,
    listClinics: jest.fn(),
    createClinic: jest.fn(),
    updateClinic: jest.fn(),
    setClinics: jest.fn(),
  });

  useUserProfileContextMock.mockReturnValue({
    profile: {
      id: 'actor-1',
      email: `${role}@example.com`,
      role,
      clinicId: role === 'admin' ? null : 'clinic-1',
      isActive: true,
      isAdmin: role === 'admin',
    },
    loading: false,
    error: null,
  });
}

describe('AdminManagersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHooks();
  });

  it('managerロールのユーザーがいない場合は指定のempty stateを表示する', () => {
    setupHooks({ managers: [] });

    render(<AdminManagersPage />);

    expect(screen.getByText(MANAGER_ASSIGNMENT_EMPTY_TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(MANAGER_ASSIGNMENT_EMPTY_DESCRIPTION)
    ).toBeInTheDocument();
  });

  it('admin以外では読み込みを開始しない', () => {
    setupHooks({ role: 'manager' });

    render(<AdminManagersPage />);

    expect(screen.getByText('管理者権限が必要です')).toBeInTheDocument();
    expect(fetchManagersMock).not.toHaveBeenCalled();
    expect(fetchClinicsMock).not.toHaveBeenCalled();
  });

  it('店舗候補は編集開始まで取得しない', () => {
    render(<AdminManagersPage />);

    expect(fetchManagersMock).toHaveBeenCalledTimes(1);
    expect(fetchClinicsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '山田 太郎を編集' }));

    expect(fetchClinicsMock).toHaveBeenCalledWith({ isActive: true });
  });

  it('選択した担当店舗をPUT payloadへ反映する', async () => {
    render(<AdminManagersPage />);

    fireEvent.click(screen.getByRole('button', { name: '山田 太郎を編集' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '横浜院' }));
    fireEvent.change(screen.getByLabelText('解除理由'), {
      target: { value: '担当エリア変更' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(replaceManagerAssignmentsMock).toHaveBeenCalledWith(
        manager.user_id,
        {
          clinic_ids: ['clinic-1', 'clinic-2'],
          revoke_reason: '担当エリア変更',
        }
      );
    });
  });
});
