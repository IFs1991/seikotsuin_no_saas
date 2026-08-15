import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LineChatInbox } from '@/components/line/line-chat-inbox';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import { UserProfileProvider } from '@/providers/user-profile-context';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderInbox() {
  return render(
    <SelectedClinicProvider
      initialClinicId={CLINIC_ID}
      currentClinicId={CLINIC_ID}
      clinics={[{ id: CLINIC_ID, name: 'テスト院' }]}
    >
      <UserProfileProvider
        value={{
          error: null,
          loading: false,
          profile: {
            clinicId: CLINIC_ID,
            clinicName: 'テスト院',
            email: 'staff@example.test',
            id: '33333333-3333-4333-8333-333333333333',
            isActive: true,
            isAdmin: false,
            role: 'staff',
          },
        }}
      >
        <LineChatInbox />
      </UserProfileProvider>
    </SelectedClinicProvider>
  );
}

describe('LINE chat inbox', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads an assigned conversation and queues a reply without exposing assignment controls', async () => {
    let postedBody: unknown = null;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async (input: URL | RequestInfo, init?: RequestInit) => {
          const url = String(input);
          if (init?.method === 'POST') {
            postedBody =
              typeof init.body === 'string' ? JSON.parse(init.body) : null;
            return jsonResponse(
              {
                success: true,
                data: { message_id: '55555555-5555-4555-8555-555555555555' },
              },
              201
            );
          }
          if (url.includes('/messages?')) {
            return jsonResponse({
              success: true,
              data: [
                {
                  direction: 'inbound',
                  id: '44444444-4444-4444-8444-444444444444',
                  messageType: 'text',
                  occurredAt: '2026-08-14T01:00:00.000Z',
                  status: 'received',
                  text: '予約時間を相談したいです',
                },
              ],
            });
          }
          return jsonResponse({
            success: true,
            data: {
              assignees: [],
              conversations: [
                {
                  assignedMembershipId: '66666666-6666-4666-8666-666666666666',
                  assignedStaffName: '担当スタッフ',
                  contactName: '山田 花子',
                  id: CONVERSATION_ID,
                  lastMessageAt: '2026-08-14T01:00:00.000Z',
                  status: 'open',
                  unreadCount: 1,
                },
              ],
            },
          });
        }
      );

    renderInbox();
    expect((await screen.findAllByText('山田 花子')).length).toBeGreaterThan(0);
    expect(
      await screen.findByText('予約時間を相談したいです')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('担当者')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('返信内容'), '承知しました');
    await user.click(
      screen.getByRole('button', { name: '返信を送信待ちにする' })
    );

    await waitFor(() =>
      expect(postedBody).toEqual({
        clinic_id: CLINIC_ID,
        text: '承知しました',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/line-chat/conversations/${CONVERSATION_ID}/messages`,
      expect.objectContaining({ method: 'POST' })
    );
  });
});
