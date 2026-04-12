/**
 * @jest-environment jsdom
 *
 * reservations/page.tsx クリニックフィルタ配線テスト
 * 仕様: docs/ハードコーディング解消_実装プラン_v1.0.md Task C
 *
 * TODOリスト:
 * [x] selectedClinicId が useAppointments に渡される（profile.clinicId でない）
 * [x] selectedClinicId が useReservationFormData に渡される（profile.clinicId でない）
 * [x] selectedClinicId が null のときは null が渡される
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';

// next/navigation をモック
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn().mockReturnValue(null),
    toString: () => '',
  }),
  usePathname: () => '/reservations',
}));

// SelectedClinicContext をモック（変更可能）
const mockSelectedClinicId = { value: 'clinic-selected' };
jest.mock('@/providers/selected-clinic-context', () => ({
  useSelectedClinic: () => ({
    selectedClinicId: mockSelectedClinicId.value,
    setSelectedClinicId: jest.fn(),
  }),
}));

// UserProfileContext をモック（profile.clinicId は 'clinic-original'）
jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: () => ({
    profile: {
      id: 'user-1',
      email: 'test@example.com',
      role: 'staff',
      clinicId: 'clinic-original',
      isActive: true,
      isAdmin: false,
    },
    loading: false,
    error: null,
  }),
}));

// useReservationFormData をモック（引数を記録）
const mockFormDataFn = jest.fn();
jest.mock('@/hooks/useReservationFormData', () => ({
  useReservationFormData: (clinicId: string | null) => {
    mockFormDataFn(clinicId);
    return {
      menus: [{ id: 'menu1', name: '整体', isActive: true, options: [] }],
      resources: [
        {
          id: 'staff1',
          name: '田中先生',
          isActive: true,
          type: 'staff',
          maxConcurrent: 1,
        },
      ],
      loading: false,
      error: null,
    };
  },
}));

// useAppointments をモック（引数を記録）
const mockAppointmentsFn = jest.fn();
jest.mock('@/app/(app)/reservations/hooks/useAppointments', () => ({
  useAppointments: (clinicId: string | null) => {
    mockAppointmentsFn(clinicId);
    return {
      appointments: [],
      pendingAppointments: [],
      loading: false,
      error: null,
      loadAppointments: jest.fn(),
      addAppointment: jest.fn(),
      updateAppointment: jest.fn().mockResolvedValue({ ok: true }),
      moveAppointment: jest.fn().mockResolvedValue({ ok: true }),
      cancelAppointment: jest.fn().mockResolvedValue({ ok: true }),
    };
  },
}));

// サブコンポーネントをモックして不要な lucide-react 依存を排除
jest.mock('@/app/(app)/reservations/components/ControlBar', () => ({
  ControlBar: () => <div data-testid='control-bar' />,
}));
jest.mock('@/app/(app)/reservations/components/Scheduler', () => ({
  Scheduler: () => <div data-testid='scheduler' />,
}));
jest.mock('@/app/(app)/reservations/components/AppointmentList', () => ({
  AppointmentList: () => <div data-testid='appointment-list' />,
}));
jest.mock('@/app/(app)/reservations/components/AppointmentForm', () => ({
  AppointmentForm: () => <div data-testid='appointment-form' />,
}));
jest.mock('@/app/(app)/reservations/components/AppointmentDetail', () => ({
  AppointmentDetail: () => <div data-testid='appointment-detail' />,
}));
jest.mock('@/app/(app)/reservations/components/UnconfirmedReservationsModal', () => ({
  UnconfirmedReservationsModal: () => <div data-testid='unconfirmed-modal' />,
}));
jest.mock('@/app/(app)/reservations/components/NotificationsModal', () => ({
  NotificationsModal: () => <div data-testid='notifications-modal' />,
}));
jest.mock('@/app/(app)/reservations/components/Header', () => ({
  Header: () => <div data-testid='res-header' />,
}));

// lucide-react (Loader2 のみ必要)
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid='loader' />,
}));

import ReservationsPage from '@/app/(app)/reservations/page';

describe('ReservationsPage クリニックフィルタ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectedClinicId.value = 'clinic-selected';
  });

  // 🔴 Red: Task C 実装前は profile.clinicId ('clinic-original') が渡される

  it('useAppointments に selectedClinicId が渡される（profile.clinicId でない）', async () => {
    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockAppointmentsFn).toHaveBeenCalledWith('clinic-selected');
    });
    // profile.clinicId ('clinic-original') ではない
    expect(mockAppointmentsFn).not.toHaveBeenCalledWith('clinic-original');
  });

  it('useReservationFormData に selectedClinicId が渡される', async () => {
    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockFormDataFn).toHaveBeenCalledWith('clinic-selected');
    });
    expect(mockFormDataFn).not.toHaveBeenCalledWith('clinic-original');
  });

  it('selectedClinicId が null のとき null が各フックに渡される', async () => {
    mockSelectedClinicId.value = null as any;

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockFormDataFn).toHaveBeenCalledWith(null);
      expect(mockAppointmentsFn).toHaveBeenCalledWith(null);
    });
  });
});
