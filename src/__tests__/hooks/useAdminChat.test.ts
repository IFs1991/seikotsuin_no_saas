/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useAdminChat } from '@/hooks/useAdminChat';

const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

const createJsonResponse = (payload: unknown, ok = true): Response =>
  ({
    ok,
    json: async () => payload,
  }) as unknown as Response;

describe('useAdminChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('GETでadmin chat endpointを呼び出す', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
        data: [],
      })
    );

    const { result } = renderHook(() => useAdminChat());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/chat', {
      method: 'GET',
      credentials: 'include',
    });
  });

  it('selectedClinicIdをGET queryとPOST bodyに含める', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: [],
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            session_id: SESSION_ID,
            user_message: {
              id: 'user-message-1',
              message_text: '売上を分析して',
              created_at: '2026-04-22T01:00:00.000Z',
            },
            ai_message: {
              id: 'ai-message-1',
              message_text: '分析結果です',
              created_at: '2026-04-22T01:00:01.000Z',
            },
          },
        })
      );

    const { result } = renderHook(() =>
      useAdminChat({ selectedClinicId: CLINIC_ID })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `/api/admin/chat?clinic_id=${CLINIC_ID}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    await act(async () => {
      await result.current.sendMessage('売上を分析して');
    });

    const [, postInit] = mockFetch.mock.calls[1];
    expect(postInit?.method).toBe('POST');
    expect(postInit?.body).toBe(
      JSON.stringify({
        message: '売上を分析して',
        clinic_id: CLINIC_ID,
        session_id: null,
      })
    );
  });

  it('enabled=falseでは初期GETと送信POSTを実行しない', async () => {
    const { result } = renderHook(() => useAdminChat({ enabled: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('売上を分析して');
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.error).toBe('分析対象スコープを確定してください');
  });

  it('POST成功後にユーザーとAIのメッセージを追加する', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: [],
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            session_id: SESSION_ID,
            user_message: {
              id: 'user-message-1',
              message_text: '患者数を教えて',
              created_at: '2026-04-22T02:00:00.000Z',
            },
            ai_message: {
              id: 'ai-message-1',
              message_text: '患者数の分析結果です',
              created_at: '2026-04-22T02:00:01.000Z',
              response_data: { total: 10 },
            },
          },
        })
      );

    const { result } = renderHook(() => useAdminChat());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('患者数を教えて');
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/chat',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(result.current.messages).toEqual([
      {
        id: 'user-message-1',
        content: '患者数を教えて',
        role: 'user',
        createdAt: '2026-04-22T02:00:00.000Z',
      },
      {
        id: 'ai-message-1',
        content: '患者数の分析結果です',
        role: 'assistant',
        createdAt: '2026-04-22T02:00:01.000Z',
      },
    ]);
  });

  it('POST成功後は同じsession_idで次のメッセージを送信する', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: [],
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            session_id: SESSION_ID,
            user_message: {
              id: 'user-message-1',
              message_text: '売上を教えて',
              created_at: '2026-04-22T02:00:00.000Z',
            },
            ai_message: {
              id: 'ai-message-1',
              message_text: '売上分析です',
              created_at: '2026-04-22T02:00:01.000Z',
            },
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            session_id: SESSION_ID,
            user_message: {
              id: 'user-message-2',
              message_text: '続けて患者数',
              created_at: '2026-04-22T02:01:00.000Z',
            },
            ai_message: {
              id: 'ai-message-2',
              message_text: '患者数分析です',
              created_at: '2026-04-22T02:01:01.000Z',
            },
          },
        })
      );

    const { result } = renderHook(() => useAdminChat());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('売上を教えて');
      await result.current.sendMessage('続けて患者数');
    });

    const [, secondPostInit] = mockFetch.mock.calls[1];
    const [, thirdPostInit] = mockFetch.mock.calls[2];
    expect(secondPostInit?.body).toBe(
      JSON.stringify({
        message: '売上を教えて',
        clinic_id: null,
        session_id: null,
      })
    );
    expect(thirdPostInit?.body).toBe(
      JSON.stringify({
        message: '続けて患者数',
        clinic_id: null,
        session_id: SESSION_ID,
      })
    );
  });
});
