/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientsListPage from '@/app/(app)/patients/list/page';
import PatientDetailPage from '@/app/(app)/patients/[id]/page';
import { usePatientsList } from '@/hooks/usePatientsList';
import { useUserProfileContext } from '@/providers/user-profile-context';

jest.mock('@/hooks/usePatientsList');
jest.mock('@/providers/user-profile-context');
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'patient-1' }),
}));

const usePatientsListMock = usePatientsList as jest.MockedFunction<
  typeof usePatientsList
>;
const useUserProfileContextMock = useUserProfileContext as jest.MockedFunction<
  typeof useUserProfileContext
>;
const fetchMock = jest.fn();

describe('manager patient list/detail fail-closed pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    useUserProfileContextMock.mockReturnValue({
      profile: {
        id: 'manager-1',
        email: 'manager@example.com',
        role: 'manager',
        clinicId: 'legacy-clinic',
        isActive: true,
        isAdmin: false,
      },
      loading: false,
      error: null,
    });
    usePatientsListMock.mockReturnValue({
      patients: [],
      isLoading: false,
      error: null,
      searchQuery: '',
      setSearchQuery: jest.fn(),
      createPatient: jest.fn(),
      updatePatient: jest.fn(),
      refetch: jest.fn(),
    });
  });

  it('closes /patients/list for manager before customer list hook runs', () => {
    render(<PatientsListPage />);

    expect(
      screen.getByText('マネージャーは患者一覧を利用できません')
    ).toBeInTheDocument();
    expect(usePatientsListMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('新規登録')).not.toBeInTheDocument();
  });

  it('closes /patients/[id] for manager before customer detail fetch runs', () => {
    render(<PatientDetailPage />);

    expect(
      screen.getByText('マネージャーは患者詳細を利用できません')
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('電話番号')).not.toBeInTheDocument();
    expect(screen.queryByText('メール')).not.toBeInTheDocument();
    expect(screen.queryByText('メモ')).not.toBeInTheDocument();
  });
});
