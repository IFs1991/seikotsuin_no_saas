/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { usePatientsList } from '@/hooks/usePatientsList';

const clinicA = '00000000-0000-0000-0000-0000000000a1';
const clinicB = '00000000-0000-0000-0000-0000000000b2';
let mockActiveClinicId = clinicA;

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: () => ({
    profile: {
      id: 'user-1',
      email: 'staff@example.com',
      role: 'staff',
      clinicId: clinicA,
      isActive: true,
      isAdmin: false,
    },
    loading: false,
    error: null,
  }),
}));

jest.mock('@/hooks/useActiveClinicId', () => ({
  useActiveClinicId: () => ({
    activeClinicId: mockActiveClinicId,
    activeClinicLoading: false,
  }),
}));

const fetchMock = jest.fn();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const customer1 = {
  id: '00000000-0000-0000-0000-00000000c001',
  name: '患者1',
  phone: '090-0000-0001',
  email: null,
  notes: null,
};

const customer2 = {
  id: '00000000-0000-0000-0000-00000000c002',
  name: '患者2',
  phone: '090-0000-0002',
  email: null,
  notes: null,
};

describe('usePatientsList cursor pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveClinicId = clinicA;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads the next page with the opaque cursor and removes duplicate rows', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer1], nextCursor: 'opaque-cursor' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer1, customer2], nextCursor: null },
        })
      );

    const { result } = renderHook(() => usePatientsList());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.patients).toEqual([
      expect.objectContaining({ id: customer1.id }),
    ]);
    expect(result.current.hasMore).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=50');

    await act(async () => {
      await result.current.loadMore();
    });

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      'cursor=opaque-cursor'
    );
    expect(result.current.patients.map(patient => patient.id)).toEqual([
      customer1.id,
      customer2.id,
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it('resets the cursor when the active clinic changes', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer1], nextCursor: 'clinic-a-cursor' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer2], nextCursor: null },
        })
      );

    const { result, rerender } = renderHook(() => usePatientsList());
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    mockActiveClinicId = clinicB;
    rerender();

    await waitFor(() => {
      expect(result.current.patients.map(patient => patient.id)).toEqual([
        customer2.id,
      ]);
    });
    const secondUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(secondUrl).toContain(`clinic_id=${clinicB}`);
    expect(secondUrl).not.toContain('cursor=');
  });

  it('resets the cursor when the debounced search changes', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer1], nextCursor: 'first-cursor' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer2], nextCursor: null },
        })
      );

    const { result } = renderHook(() => usePatientsList());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.setSearchQuery('患者2');
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const searchUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(searchUrl).toContain('q=%E6%82%A3%E8%80%852');
    expect(searchUrl).not.toContain('cursor=');
    expect(result.current.patients.map(patient => patient.id)).toEqual([
      customer2.id,
    ]);
  });

  it('refreshes the first page after create and update mutations', async () => {
    const updatedCustomer = { ...customer1, phone: '090-9999-9999' };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer1], nextCursor: 'stale-cursor' },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: customer2 }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer2, customer1], nextCursor: null },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: updatedCustomer }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { items: [customer2, updatedCustomer], nextCursor: null },
        })
      );

    const { result } = renderHook(() => usePatientsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createPatient({
        name: customer2.name,
        phone: customer2.phone,
      });
    });
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' })
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).not.toContain('cursor=');

    await act(async () => {
      await result.current.updatePatient({
        id: customer1.id,
        phone: updatedCustomer.phone,
      });
    });
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(String(fetchMock.mock.calls[4]?.[0])).not.toContain('cursor=');
    expect(
      result.current.patients.find(patient => patient.id === customer1.id)
        ?.phone
    ).toBe(updatedCustomer.phone);
  });
});
