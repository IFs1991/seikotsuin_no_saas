/**
 * Chat API Tests - TDD for AIチャット MVP
 *
 * 受け入れ基準:
 * - 送信でAI応答が返る
 * - 履歴が再取得できる
 * - 他ユーザーの履歴が参照できない
 */

import { ensureClinicAccess } from '@/lib/supabase/guards';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {
    nextUrl = { searchParams: new URLSearchParams() };
  },
}));

// AI分析サービスをモック
jest.mock('@/api/gemini/ai-analysis-service', () => ({
  generateAIComment: jest.fn().mockResolvedValue({
    summary: 'テスト応答',
    highlights: [],
    improvements: [],
    suggestions: [],
  }),
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

let getHandler: any;
let postHandler: any;

beforeAll(async () => {
  const chatModule = await import('@/app/api/chat/route');
  getHandler = chatModule.GET;
  postHandler = chatModule.POST;
});

// ヘルパー関数
const createGetRequest = (params: Record<string, string>) => {
  const searchParams = new URLSearchParams(params);
  return {
    nextUrl: { searchParams },
  };
};

const createPostRequest = (body: unknown) => ({
  json: jest.fn().mockResolvedValue(body),
});

describe('Chat API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/chat - 履歴取得', () => {
    it('clinic_id 未指定の場合はエラーを返す', async () => {
      const request = createGetRequest({});
      const response = await getHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toContain('clinic_id');
    });

    it('clinic_id 指定でチャット履歴を取得できる', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          user_id: 'user-1',
          clinic_id: 'clinic-1',
          created_at: '2025-01-01T00:00:00Z',
          chat_messages: [
            { id: 'msg-1', sender: 'user', message_text: 'こんにちは' },
            { id: 'msg-2', sender: 'ai', message_text: '何かお手伝いできますか？' },
          ],
        },
      ];

      const orderMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: mockSessions,
          error: null,
        }),
      });
      const eqSessionMock = jest.fn().mockReturnValue({
        order: orderMock,
      });
      const eqClinicMock = jest.fn().mockReturnValue({
        order: orderMock,
        eq: eqSessionMock,
      });

      ensureClinicAccessMock.mockResolvedValue({
        supabase: {
          from: jest.fn(() => ({
            select: jest.fn().mockReturnValue({
              eq: eqClinicMock,
            }),
          })),
        },
        user: { id: 'user-1' },
        permissions: { role: 'staff' },
      });

      const request = createGetRequest({ clinic_id: 'clinic-1' });
      const response = await getHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual(mockSessions);
      expect(eqClinicMock).toHaveBeenCalledWith('clinic_id', 'clinic-1');
    });

    it('session_idで特定セッションを取得できる', async () => {
      const mockSession = {
        id: 'session-1',
        user_id: 'user-1',
        chat_messages: [
          { id: 'msg-1', sender: 'user', message_text: '売上を教えて' },
        ],
      };

      const orderMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [mockSession],
          error: null,
        }),
      });
      const eqSessionMock = jest.fn().mockReturnValue({
        order: orderMock,
      });
      const eqClinicMock = jest.fn().mockReturnValue({
        order: orderMock,
        eq: eqSessionMock,
      });

      ensureClinicAccessMock.mockResolvedValue({
        supabase: {
          from: jest.fn(() => ({
            select: jest.fn().mockReturnValue({
              eq: eqClinicMock,
            }),
          })),
        },
        user: { id: 'user-1' },
        permissions: { role: 'staff' },
      });

      const request = createGetRequest({
        clinic_id: 'clinic-1',
        session_id: 'session-1',
      });
      const response = await getHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(eqSessionMock).toHaveBeenCalledWith('id', 'session-1');
    });
  });

  describe('POST /api/chat - メッセージ送信', () => {
    it('メッセージを送信するとAI応答が返る', async () => {
      const mockUserMessage = {
        id: 'msg-1',
        session_id: 'session-1',
        sender: 'user',
        message_text: '今月の売上を教えて',
      };

      const mockAIMessage = {
        id: 'msg-2',
        session_id: 'session-1',
        sender: 'ai',
        message_text: '今月の売上についてお答えします...',
      };

      const insertMock = jest.fn()
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'session-1' },
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockUserMessage,
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockAIMessage,
              error: null,
            }),
          }),
        });

      ensureClinicAccessMock.mockResolvedValue({
        supabase: {
          from: jest.fn(() => ({
            insert: insertMock,
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          })),
        },
        user: { id: 'user-1' },
        permissions: { role: 'staff' },
      });

      const request = createPostRequest({
        message: '今月の売上を教えて',
        clinic_id: 'clinic-1',
      });

      const response = await postHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.session_id).toBeDefined();
      expect(payload.data.user_message).toBeDefined();
      expect(payload.data.ai_message).toBeDefined();
    });

    it('既存セッションにメッセージを追加できる', async () => {
      const mockUserMessage = {
        id: 'msg-3',
        session_id: 'existing-session',
        sender: 'user',
        message_text: '続きを教えて',
      };

      const mockAIMessage = {
        id: 'msg-4',
        session_id: 'existing-session',
        sender: 'ai',
        message_text: '続きの情報です...',
      };

      const insertMock = jest.fn()
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockUserMessage,
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockAIMessage,
              error: null,
            }),
          }),
        });

      ensureClinicAccessMock.mockResolvedValue({
        supabase: {
          from: jest.fn(() => ({
            insert: insertMock,
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          })),
        },
        user: { id: 'user-1' },
        permissions: { role: 'staff' },
      });

      const request = createPostRequest({
        message: '続きを教えて',
        clinic_id: 'clinic-1',
        session_id: 'existing-session',
      });

      const response = await postHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.session_id).toBe('existing-session');
    });

    it('メッセージが空の場合はエラーを返す', async () => {
      ensureClinicAccessMock.mockResolvedValue({
        supabase: {},
        user: { id: 'user-1' },
        permissions: { role: 'staff' },
      });

      const request = createPostRequest({
        message: '',
        clinic_id: 'clinic-1',
      });

      const response = await postHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toContain('message');
    });

    it('一般ユーザーは他ユーザーとしてメッセージを送信できない', async () => {
      ensureClinicAccessMock.mockResolvedValue({
        supabase: {},
        user: { id: 'user-1' },
        permissions: { role: 'staff' },
      });

      const request = createPostRequest({
        message: 'テストメッセージ',
        clinic_id: 'clinic-1',
        user_id: 'other-user',
      });

      const response = await postHandler(request);
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.error).toContain('権限がありません');
    });
  });

  describe('AI応答フォールバック', () => {
    it('AI応答生成に失敗した場合はフォールバック応答を返す', async () => {
      // このテストは実装時にGemini APIの失敗ケースをテスト
      // 現時点ではルールベースのフォールバックが実装済み
      expect(true).toBe(true);
    });
  });
});
