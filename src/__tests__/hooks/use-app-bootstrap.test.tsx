/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import {
  APP_BOOTSTRAP_STALE_TIME_MS,
  useAppBootstrap,
} from '@/hooks/queries/useAppBootstrap';
import type { AppBootstrapData } from '@/lib/app-bootstrap/types';
import { queryKeys } from '@/providers/query-provider';

function createBootstrap(generatedAt: string): AppBootstrapData {
  return {
    profile: {
      id: 'user-1',
      email: 'staff@example.com',
      role: 'staff',
      clinicId: 'clinic-1',
      clinicName: '本院',
      isActive: true,
      isAdmin: false,
    },
    clinics: [{ id: 'clinic-1', name: '本院' }],
    currentClinicId: 'clinic-1',
    errors: { profile: null, clinics: null },
    generatedAt,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useAppBootstrap', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
    jest.restoreAllMocks();
  });

  it('SSR initialDataはexact query keyでhydrateし、初回mountでfetchしない', () => {
    const generatedAt = new Date().toISOString();
    const initialBootstrap = createBootstrap(generatedAt);
    const queryClient = new QueryClient();
    const fetchSpy = jest.spyOn(global, 'fetch');

    const { result } = renderHook(() => useAppBootstrap(initialBootstrap), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.data).toEqual(initialBootstrap);
    expect(result.current.loading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.appBootstrap.all)).toEqual(
      initialBootstrap
    );
    expect(
      queryClient.getQueryState(queryKeys.appBootstrap.all)?.dataUpdatedAt
    ).toBe(Date.parse(generatedAt));
  });

  it('5分を超えたfocus refreshでbootstrap endpointを1回だけ取得する', async () => {
    focusManager.setFocused(false);
    const initialBootstrap = createBootstrap(
      new Date(Date.now() - APP_BOOTSTRAP_STALE_TIME_MS - 1_000).toISOString()
    );
    const refreshedBootstrap: AppBootstrapData = {
      ...initialBootstrap,
      clinics: [
        { id: 'clinic-1', name: '本院' },
        { id: 'clinic-2', name: '新宿院' },
      ],
      generatedAt: new Date().toISOString(),
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: refreshedBootstrap }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAppBootstrap(initialBootstrap), {
      wrapper: createWrapper(queryClient),
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => {
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(refreshedBootstrap);
    });

    const requestedPath = new URL(
      String(fetchSpy.mock.calls[0]?.[0]),
      'http://localhost'
    ).pathname;
    expect(requestedPath).toBe('/api/app/bootstrap');
    expect(requestedPath).not.toBe('/api/auth/profile');
    expect(requestedPath).not.toBe('/api/clinics/accessible');
  });

  it('clinicだけが失敗したrefreshはprofile errorへ誤伝播しない', async () => {
    focusManager.setFocused(false);
    const initialBootstrap = createBootstrap(
      new Date(Date.now() - APP_BOOTSTRAP_STALE_TIME_MS - 1_000).toISOString()
    );
    const clinicFailureBootstrap: AppBootstrapData = {
      ...initialBootstrap,
      clinics: [],
      currentClinicId: null,
      errors: {
        profile: null,
        clinics: '利用可能なクリニック一覧の取得に失敗しました',
      },
      generatedAt: new Date().toISOString(),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: clinicFailureBootstrap }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAppBootstrap(initialBootstrap), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(clinicFailureBootstrap);
      expect(result.current.profileError).toBeNull();
      expect(result.current.clinicsError).toBe(
        '利用可能なクリニック一覧の取得に失敗しました'
      );
    });
  });

  it('bootstrap transport自体の失敗は両resourceの取得失敗として伝える', async () => {
    focusManager.setFocused(false);
    const initialBootstrap = createBootstrap(
      new Date(Date.now() - APP_BOOTSTRAP_STALE_TIME_MS - 1_000).toISOString()
    );
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: '認証情報を確認できません。時間をおいて再度お試しください',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useAppBootstrap(initialBootstrap), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(initialBootstrap);
      expect(result.current.profileError).toBe(
        '認証情報を確認できません。時間をおいて再度お試しください'
      );
      expect(result.current.clinicsError).toBe(
        '認証情報を確認できません。時間をおいて再度お試しください'
      );
    });
  });
});
