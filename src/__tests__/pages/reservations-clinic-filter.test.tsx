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
import { act, render, screen, waitFor } from '@testing-library/react';

const mockRouterReplace = jest.fn();
const mockSearchView: { value: string | null } = { value: null };

// next/navigation をモック
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockRouterReplace,
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'view' ? mockSearchView.value : null),
    toString: () =>
      mockSearchView.value
        ? new URLSearchParams({ view: mockSearchView.value }).toString()
        : '',
  }),
  usePathname: () => '/reservations',
}));

// SelectedClinicContext をモック（変更可能）
const mockSelectedClinicId: { value: string | null } = {
  value: 'clinic-selected',
};
jest.mock('@/providers/selected-clinic-context', () => ({
  useSelectedClinic: () => ({
    selectedClinicId: mockSelectedClinicId.value,
    setSelectedClinicId: jest.fn(),
  }),
}));

// UserProfileContext をモック（profile.clinicId は 'clinic-original'）
const mockProfileClinicId: { value: string | null } = {
  value: 'clinic-original',
};
const mockProfileRole: { value: string | null } = { value: 'staff' };
jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: () => ({
    profile: {
      id: 'user-1',
      email: 'test@example.com',
      role: mockProfileRole.value,
      clinicId: mockProfileClinicId.value,
      clinicName: '本院',
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
  useReservationFormData: (
    clinicId: string | null,
    options?: { includeCustomers?: boolean }
  ) => {
    mockFormDataFn(clinicId, options);
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
const mockLoadAppointments = jest.fn();
const mockMoveAppointment = jest.fn();
jest.mock('@/app/(app)/reservations/hooks/useAppointments', () => ({
  useAppointments: (clinicId: string | null) => {
    mockAppointmentsFn(clinicId);
    return {
      appointments: [],
      pendingAppointments: [],
      loading: false,
      error: null,
      loadAppointments: mockLoadAppointments,
      addAppointment: jest.fn(),
      updateAppointment: jest.fn().mockResolvedValue({ ok: true }),
      moveAppointment: mockMoveAppointment,
      cancelAppointment: jest.fn().mockResolvedValue({ ok: true }),
    };
  },
}));

// サブコンポーネントをモックして不要な lucide-react 依存を排除
const mockControlBar = jest.fn(() => <div data-testid='control-bar' />);
jest.mock('@/app/(app)/reservations/components/ControlBar', () => ({
  ControlBar: (props: Record<string, unknown>) => mockControlBar(props),
}));
const mockScheduler = jest.fn(() => <div data-testid='scheduler' />);
jest.mock('@/app/(app)/reservations/components/Scheduler', () => ({
  Scheduler: (props: Record<string, unknown>) => mockScheduler(props),
}));
jest.mock('@/app/(app)/reservations/components/DaySummary', () => ({
  DaySummary: () => <div data-testid='day-summary' />,
}));
jest.mock('@/app/(app)/reservations/components/AppointmentList', () => ({
  AppointmentList: () => <div data-testid='appointment-list' />,
}));
jest.mock('@/app/(app)/reservations/components/AppointmentForm', () => ({
  AppointmentForm: () => <div data-testid='appointment-form' />,
}));
jest.mock('@/app/(app)/reservations/components/AppointmentFormModal', () => ({
  AppointmentFormModal: () => <div data-testid='appointment-form-modal' />,
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

interface AppointmentUpdateResultForTest {
  ok: boolean;
  error?: string;
}

interface SchedulerPropsForTest {
  readOnly: boolean;
  onAppointmentMove: (
    id: string,
    newResourceId: string,
    newStartHour: number,
    newStartMinute: number
  ) => Promise<AppointmentUpdateResultForTest>;
}

function isSchedulerPropsForTest(
  value: unknown
): value is SchedulerPropsForTest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const props = value as {
    readOnly?: unknown;
    onAppointmentMove?: unknown;
  };
  return (
    typeof props.readOnly === 'boolean' &&
    typeof props.onAppointmentMove === 'function'
  );
}

function getLatestSchedulerProps(): SchedulerPropsForTest {
  const props = mockScheduler.mock.calls.at(-1)?.[0];
  if (!isSchedulerPropsForTest(props)) {
    throw new Error('Scheduler props were not captured');
  }

  return props;
}

describe('ReservationsPage クリニックフィルタ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectedClinicId.value = 'clinic-selected';
    mockProfileClinicId.value = 'clinic-original';
    mockProfileRole.value = 'staff';
    mockSearchView.value = null;
    mockMoveAppointment.mockResolvedValue({ ok: true });
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
      expect(mockFormDataFn).toHaveBeenCalledWith('clinic-selected', {
        includeCustomers: false,
      });
    });
    expect(mockFormDataFn).not.toHaveBeenCalledWith(
      'clinic-original',
      expect.anything()
    );
  });

  it('selectedClinicId が null のとき null が各フックに渡される', async () => {
    mockSelectedClinicId.value = null;

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockFormDataFn).toHaveBeenCalledWith(null, {
        includeCustomers: false,
      });
      expect(mockAppointmentsFn).toHaveBeenCalledWith(null);
    });
  });

  it('所属院と異なる店舗を選択中は予約画面を閲覧専用にする', async () => {
    mockSelectedClinicId.value = 'clinic-child-b';
    mockProfileClinicId.value = 'clinic-child-a';
    mockProfileRole.value = 'clinic_admin';

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockAppointmentsFn).toHaveBeenCalledWith('clinic-child-b');
      expect(mockFormDataFn).toHaveBeenCalledWith('clinic-child-b', {
        includeCustomers: false,
      });
    });

    const controlBarProps = mockControlBar.mock.calls.at(-1)?.[0];
    const schedulerProps = mockScheduler.mock.calls.at(-1)?.[0];
    expect(controlBarProps).toEqual(
      expect.objectContaining({ canCreateReservation: false })
    );
    expect(schedulerProps).toEqual(expect.objectContaining({ readOnly: true }));
  });

  it('所属院を選択中は予約作成・移動を許可する', async () => {
    mockSelectedClinicId.value = 'clinic-original';

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockAppointmentsFn).toHaveBeenCalledWith('clinic-original');
    });

    const controlBarProps = mockControlBar.mock.calls.at(-1)?.[0];
    const schedulerProps = mockScheduler.mock.calls.at(-1)?.[0];
    expect(controlBarProps).toEqual(
      expect.objectContaining({ canCreateReservation: true })
    );
    expect(schedulerProps).toEqual(
      expect.objectContaining({ readOnly: false })
    );
  });

  it('manager は所属院と同じ店舗を選択中でも予約画面を書き込めない', async () => {
    mockSelectedClinicId.value = 'clinic-original';
    mockProfileClinicId.value = 'clinic-original';
    mockProfileRole.value = 'manager';

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockAppointmentsFn).toHaveBeenCalledWith('clinic-original');
    });

    const controlBarProps = mockControlBar.mock.calls.at(-1)?.[0];
    const schedulerProps = getLatestSchedulerProps();
    expect(controlBarProps).toEqual(
      expect.objectContaining({ canCreateReservation: false })
    );
    expect(schedulerProps.readOnly).toBe(true);
  });

  it('manager が view=list を直接開いてもタイムラインだけを表示する', async () => {
    mockSelectedClinicId.value = 'clinic-original';
    mockProfileClinicId.value = 'clinic-original';
    mockProfileRole.value = 'manager';
    mockSearchView.value = 'list';

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockScheduler).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('appointment-list')).not.toBeInTheDocument();
    expect(getLatestSchedulerProps().readOnly).toBe(true);
    expect(mockRouterReplace).toHaveBeenCalledWith(
      '/reservations?view=timeline'
    );
  });

  it('manager が view=register を直接開いても予約フォームを開かない', async () => {
    mockSelectedClinicId.value = 'clinic-original';
    mockProfileClinicId.value = 'clinic-original';
    mockProfileRole.value = 'manager';
    mockSearchView.value = 'register';

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockScheduler).toHaveBeenCalled();
    });

    expect(
      screen.queryByTestId('appointment-form-modal')
    ).not.toBeInTheDocument();
    expect(getLatestSchedulerProps().readOnly).toBe(true);
    expect(mockRouterReplace).toHaveBeenCalledWith(
      '/reservations?view=timeline'
    );
  });

  it('manager に担当院がない場合は空状態を表示して予約読み込みを呼ばない', async () => {
    mockSelectedClinicId.value = null;
    mockProfileClinicId.value = 'profile-clinic';
    mockProfileRole.value = 'manager';

    render(<ReservationsPage />);

    expect(
      await screen.findByText('担当院がまだ設定されていません。')
    ).toBeInTheDocument();
    expect(
      screen.getByText('管理者に担当店舗の設定を依頼してください。')
    ).toBeInTheDocument();
    expect(mockAppointmentsFn).toHaveBeenCalledWith(null);
    expect(mockFormDataFn).toHaveBeenCalledWith(null, {
      includeCustomers: false,
    });
    expect(mockLoadAppointments).not.toHaveBeenCalled();
  });

  it('manager の予約移動コールバックは mutation hook を呼ばず読み取り専用エラーを返す', async () => {
    mockSelectedClinicId.value = 'clinic-original';
    mockProfileClinicId.value = 'clinic-original';
    mockProfileRole.value = 'manager';

    render(<ReservationsPage />);

    await waitFor(() => {
      expect(mockScheduler).toHaveBeenCalled();
    });

    let result: AppointmentUpdateResultForTest | null = null;
    await act(async () => {
      result = await getLatestSchedulerProps().onAppointmentMove(
        'appointment-1',
        'resource-1',
        10,
        0
      );
    });

    expect(result).toEqual({
      ok: false,
      error: 'マネージャーは予約タイムラインの閲覧のみ可能です。',
    });
    expect(mockMoveAppointment).not.toHaveBeenCalled();
  });
});
