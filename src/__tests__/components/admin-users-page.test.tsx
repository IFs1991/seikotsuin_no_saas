import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminUsersPage from '@/app/(app)/admin/(protected)/users/page';
import { useAdminUserCandidates, useAdminUsers } from '@/hooks/useAdminUsers';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { useUserProfileContext } from '@/providers/user-profile-context';

jest.mock('@/hooks/useAdminUsers', () => ({
  useAdminUsers: jest.fn(),
  useAdminUserCandidates: jest.fn(),
}));

jest.mock('@/hooks/useAdminTenants', () => ({
  useAdminTenants: jest.fn(),
}));

jest.mock('@/providers/selected-clinic-context', () => ({
  useSelectedClinic: jest.fn(),
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: jest.fn(),
}));

jest.mock('@/components/staff/shift-optimizer', () => ({
  __esModule: true,
  default: () => <div>シフト管理モック</div>,
}));

jest.mock('@/components/ui/select', () => {
  type SelectMockProps = {
    children?: React.ReactNode;
    id?: string;
    className?: string;
    value?: string;
    disabled?: boolean;
    placeholder?: string;
    onValueChange?: (value: string) => void;
  };

  return {
    Select: ({ children }: SelectMockProps) => <div>{children}</div>,
    SelectTrigger: ({ children, id, className }: SelectMockProps) => (
      <button id={id} type='button' className={className}>
        {children}
      </button>
    ),
    SelectContent: ({ children }: SelectMockProps) => <div>{children}</div>,
    SelectItem: ({ children }: SelectMockProps) => <div>{children}</div>,
    SelectValue: ({ placeholder }: SelectMockProps) => (
      <span>{placeholder}</span>
    ),
  };
});

const useAdminUsersMock = jest.mocked(useAdminUsers);
const useAdminUserCandidatesMock = jest.mocked(useAdminUserCandidates);
const useAdminTenantsMock = jest.mocked(useAdminTenants);
const useSelectedClinicMock = jest.mocked(useSelectedClinic);
const useUserProfileContextMock = jest.mocked(useUserProfileContext);

const createAccountOnlyUserMock = jest.fn();
const assignPermissionMock = jest.fn();
const applyPermissionToListMock = jest.fn();

const setupHooks = (role: 'admin' | 'clinic_admin') => {
  createAccountOnlyUserMock.mockResolvedValue({
    id: '22222222-2222-4222-8222-222222222222',
    email: 'profile-only@example.com',
    full_name: '未付与 太郎',
    permission_status: 'unassigned',
    permission_id: null,
    role: null,
    clinic_id: null,
  });
  assignPermissionMock.mockResolvedValue(null);
  applyPermissionToListMock.mockClear();

  useAdminUsersMock.mockReturnValue({
    permissions: [],
    loading: false,
    error: null,
    fetchPermissions: jest.fn(),
    assignPermission: assignPermissionMock,
    createAccountOnlyUser: createAccountOnlyUserMock,
    updatePermission: jest.fn(),
    applyPermissionToList: applyPermissionToListMock,
    removePermissionFromList: jest.fn(),
    revokePermission: jest.fn(),
  });
  useAdminUserCandidatesMock.mockReturnValue({
    candidates: [],
    loading: false,
    error: null,
    clearCandidates: jest.fn(),
    fetchUserCandidates: jest.fn(),
  });
  useAdminTenantsMock.mockReturnValue({
    clinics: [{ id: 'clinic-1', name: '新宿院' }],
    loading: false,
    error: null,
    fetchClinics: jest.fn(),
  });
  useSelectedClinicMock.mockReturnValue({
    selectedClinicId: 'clinic-1',
    selectedClinic: { id: 'clinic-1', name: '新宿院' },
    clinics: [{ id: 'clinic-1', name: '新宿院' }],
    clinicsLoading: false,
    clinicsError: null,
    setSelectedClinicId: jest.fn(),
    refreshClinics: jest.fn(),
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
    refreshProfile: jest.fn(),
  });
};

describe('AdminUsersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHooks('admin');
  });

  it('lets admin create an account-only user without adding it to the permission list', async () => {
    const { container } = render(<AdminUsersPage />);

    expect(
      screen.getByRole('button', { name: '既存ユーザーに権限付与' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '新規店舗ユーザーを作成' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'ユーザーアカウントのみ作成' })
    );

    expect(container.querySelector('#admin-user-role')).toBeNull();
    expect(container.querySelector('#admin-user-clinic')).toBeNull();

    fireEvent.change(screen.getByLabelText('氏名'), {
      target: { value: '未付与 太郎' },
    });
    fireEvent.change(screen.getByLabelText('ログインメールアドレス'), {
      target: { value: 'PROFILE-ONLY@example.com' },
    });
    fireEvent.change(screen.getByLabelText('初期パスワード'), {
      target: { value: 'SafePass123!' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ユーザーアカウントを作成する' })
    );

    await waitFor(() => {
      expect(createAccountOnlyUserMock).toHaveBeenCalledWith({
        full_name: '未付与 太郎',
        email: 'profile-only@example.com',
        password: 'SafePass123!',
      });
    });
    expect(applyPermissionToListMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'ユーザーアカウントのみ作成しました。権限はまだ付与されていません。'
      )
    ).toBeInTheDocument();
  });

  it('lets admin optionally grant role during account-only creation without clinic', async () => {
    const { container } = render(<AdminUsersPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'ユーザーアカウントのみ作成' })
    );
    fireEvent.click(screen.getByLabelText('作成時にロールを付与する'));

    expect(container.querySelector('#admin-user-role')).toBeInTheDocument();
    expect(container.querySelector('#admin-user-clinic')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('氏名'), {
      target: { value: '未所属 管理者' },
    });
    fireEvent.change(screen.getByLabelText('ログインメールアドレス'), {
      target: { value: 'ROLE-ONLY@example.com' },
    });
    fireEvent.change(screen.getByLabelText('初期パスワード'), {
      target: { value: 'SafePass123!' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ユーザーアカウントを作成する' })
    );

    await waitFor(() => {
      expect(createAccountOnlyUserMock).toHaveBeenCalledWith({
        full_name: '未所属 管理者',
        email: 'role-only@example.com',
        password: 'SafePass123!',
        role: 'clinic_admin',
        clinic_id: null,
      });
    });
    expect(
      screen.getByText('ユーザーアカウントを作成し、権限を付与しました。')
    ).toBeInTheDocument();
  });

  it('hides account-only mode for clinic_admin', () => {
    setupHooks('clinic_admin');

    render(<AdminUsersPage />);

    expect(
      screen.queryByRole('button', { name: 'ユーザーアカウントのみ作成' })
    ).not.toBeInTheDocument();
  });
});
