'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquareText, RefreshCw, Send, UserRound } from 'lucide-react';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { normalizeRole } from '@/lib/constants/roles';
import { cn } from '@/lib/utils';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { useUserProfileContext } from '@/providers/user-profile-context';

const ConversationSchema = z.object({
  assignedMembershipId: z.string().uuid().nullable(),
  assignedStaffName: z.string().nullable(),
  contactName: z.string(),
  id: z.string().uuid(),
  lastMessageAt: z.string().nullable(),
  status: z.enum(['open', 'closed']),
  unreadCount: z.number().int().nonnegative(),
});
const AssigneeSchema = z.object({
  displayName: z.string(),
  membershipId: z.string().uuid(),
});
const ConversationsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    assignees: z.array(AssigneeSchema),
    conversations: z.array(ConversationSchema),
  }),
});
const MessageSchema = z.object({
  direction: z.enum(['inbound', 'outbound', 'system']),
  id: z.string().uuid(),
  messageType: z.enum(['text', 'unsupported']),
  occurredAt: z.string(),
  status: z.enum(['received', 'queued', 'sent', 'failed', 'unsent']),
  text: z.string().nullable(),
});
const MessagesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(MessageSchema),
});

type Conversation = z.infer<typeof ConversationSchema>;
type Assignee = z.infer<typeof AssigneeSchema>;
type Message = z.infer<typeof MessageSchema>;

export function LineChatInbox() {
  const { selectedClinicId } = useSelectedClinic();
  const { profile } = useUserProfileContext();
  const clinicId = selectedClinicId ?? profile?.clinicId ?? null;
  const role = normalizeRole(profile?.role);
  const canAssign = role === 'clinic_admin' || role === 'manager';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find(item => item.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async () => {
    if (!clinicId) {
      setConversations([]);
      setAssignees([]);
      setSelectedId(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/line-chat/conversations?clinic_id=${encodeURIComponent(clinicId)}`,
        { credentials: 'include' }
      );
      const payload: unknown = await response.json().catch(() => null);
      const parsed = ConversationsResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        throw new Error(
          readErrorMessage(payload, '会話一覧を取得できませんでした')
        );
      }
      setConversations(parsed.data.data.conversations);
      setAssignees(parsed.data.data.assignees);
      setSelectedId(current =>
        parsed.data.data.conversations.some(item => item.id === current)
          ? current
          : (parsed.data.data.conversations[0]?.id ?? null)
      );
    } catch (requestError) {
      setError(toErrorMessage(requestError));
      setConversations([]);
      setAssignees([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  const loadMessages = useCallback(async () => {
    if (!clinicId || !selectedId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/line-chat/conversations/${selectedId}/messages?clinic_id=${encodeURIComponent(clinicId)}`,
        { credentials: 'include' }
      );
      const payload: unknown = await response.json().catch(() => null);
      const parsed = MessagesResponseSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        throw new Error(
          readErrorMessage(payload, 'メッセージを取得できませんでした')
        );
      }
      setMessages(parsed.data.data);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, [clinicId, selectedId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function sendReply() {
    const text = reply.trim();
    if (!clinicId || !selectedId || !text || text.length > 5000) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/line-chat/conversations/${selectedId}/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ clinic_id: clinicId, text }),
        }
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          readErrorMessage(payload, '返信を送信待ちにできませんでした')
        );
      }
      setReply('');
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function changeAssignee(value: string) {
    if (!clinicId || !selectedId || !canAssign) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/line-chat/conversations/${selectedId}/assignment`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            assigned_membership_id: value === 'unassigned' ? null : value,
            clinic_id: clinicId,
          }),
        }
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          readErrorMessage(payload, '担当者を変更できませんでした')
        );
      }
      await loadConversations();
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <PageHeader
        title='LINEチャット'
        description='店舗に届いたLINEメッセージの確認と返信ができます。施術者・スタッフには担当会話だけが表示されます。'
        actions={
          <Button
            type='button'
            variant='outline'
            onClick={() => void loadConversations()}
            disabled={loading || !clinicId}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', loading && 'animate-spin')}
            />
            更新
          </Button>
        }
      />

      {!clinicId ? (
        <Card>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            ヘッダーから店舗を選択してください。
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]'>
          <Card className='min-h-[28rem]'>
            <CardHeader>
              <CardTitle className='text-lg'>会話一覧</CardTitle>
              <CardDescription>
                新しいメッセージ順に表示します。
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 px-3'>
              {loading ? (
                <p className='py-8 text-center text-sm text-muted-foreground'>
                  読み込み中です…
                </p>
              ) : conversations.length === 0 ? (
                <div className='py-10 text-center'>
                  <MessageSquareText className='mx-auto mb-3 h-8 w-8 text-muted-foreground' />
                  <p className='text-sm font-medium'>
                    表示できる会話はありません
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    未担当の会話は担当スタッフには表示されません。
                  </p>
                </div>
              ) : (
                conversations.map(conversation => (
                  <button
                    type='button'
                    key={conversation.id}
                    onClick={() => setSelectedId(conversation.id)}
                    className={cn(
                      'w-full rounded-md border px-3 py-3 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedId === conversation.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/60'
                    )}
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <span className='truncate text-sm font-semibold'>
                        {conversation.contactName}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <Badge>{conversation.unreadCount}</Badge>
                      )}
                    </div>
                    <p className='mt-1 truncate text-xs text-muted-foreground'>
                      {conversation.assignedStaffName
                        ? `担当: ${conversation.assignedStaffName}`
                        : '担当者未設定'}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {formatDateTime(conversation.lastMessageAt)}
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='min-h-[36rem]'>
            {!selectedConversation ? (
              <CardContent className='flex min-h-[36rem] items-center justify-center text-sm text-muted-foreground'>
                左の一覧から会話を選択してください。
              </CardContent>
            ) : (
              <>
                <CardHeader className='border-b'>
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div>
                      <CardTitle className='text-lg'>
                        {selectedConversation.contactName}
                      </CardTitle>
                      <CardDescription>
                        {selectedConversation.status === 'open'
                          ? '対応中の会話'
                          : '終了した会話'}
                      </CardDescription>
                    </div>
                    {canAssign && (
                      <div className='w-full sm:w-56'>
                        <Select
                          value={
                            selectedConversation.assignedMembershipId ??
                            'unassigned'
                          }
                          onValueChange={value => void changeAssignee(value)}
                          disabled={submitting}
                        >
                          <SelectTrigger aria-label='担当者'>
                            <SelectValue placeholder='担当者を選択' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='unassigned'>未設定</SelectItem>
                            {assignees.map(assignee => (
                              <SelectItem
                                key={assignee.membershipId}
                                value={assignee.membershipId}
                              >
                                {assignee.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className='space-y-4 pt-4'>
                  <div
                    className='max-h-[28rem] min-h-72 space-y-3 overflow-y-auto rounded-md bg-muted/30 p-3'
                    aria-live='polite'
                  >
                    {messagesLoading ? (
                      <p className='py-10 text-center text-sm text-muted-foreground'>
                        メッセージを読み込み中です…
                      </p>
                    ) : messages.length === 0 ? (
                      <p className='py-10 text-center text-sm text-muted-foreground'>
                        メッセージはありません。
                      </p>
                    ) : (
                      messages.map(message => (
                        <MessageBubble key={message.id} message={message} />
                      ))
                    )}
                  </div>

                  <div className='space-y-2'>
                    <Textarea
                      value={reply}
                      onChange={event => setReply(event.target.value)}
                      maxLength={5000}
                      rows={3}
                      placeholder='返信内容を入力してください'
                      disabled={
                        submitting || selectedConversation.status !== 'open'
                      }
                      aria-label='返信内容'
                    />
                    <div className='flex items-center justify-between gap-3'>
                      <span className='text-xs text-muted-foreground'>
                        {reply.length} / 5000文字
                      </span>
                      <Button
                        type='button'
                        variant='medical-primary'
                        onClick={() => void sendReply()}
                        disabled={
                          submitting ||
                          reply.trim().length === 0 ||
                          selectedConversation.status !== 'open'
                        }
                      >
                        <Send className='mr-2 h-4 w-4' />
                        {submitting ? '処理中…' : '返信を送信待ちにする'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}

      {error && (
        <div
          role='alert'
          className='rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'
        >
          {error}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === 'outbound';
  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg border px-3 py-2 text-sm shadow-sm',
          outbound
            ? 'border-medical-blue-200 bg-medical-blue-50'
            : 'border-border bg-background'
        )}
      >
        <div className='mb-1 flex items-center gap-2 text-xs text-muted-foreground'>
          {outbound ? (
            <Send className='h-3 w-3' />
          ) : (
            <UserRound className='h-3 w-3' />
          )}
          <span>{outbound ? '店舗' : 'LINE利用者'}</span>
          <span>{formatDateTime(message.occurredAt)}</span>
        </div>
        <p className='whitespace-pre-wrap break-words'>
          {message.status === 'unsent'
            ? '送信取消済み'
            : message.messageType === 'unsupported'
              ? 'この種類のメッセージは表示できません'
              : (message.text ?? '')}
        </p>
        {outbound && (
          <p className='mt-1 text-right text-xs text-muted-foreground'>
            {statusLabel(message.status)}
          </p>
        )}
      </div>
    </div>
  );
}

function statusLabel(status: Message['status']): string {
  switch (status) {
    case 'queued':
      return '送信待ち';
    case 'sent':
      return '送信済み';
    case 'failed':
      return '送信失敗';
    case 'unsent':
      return '送信取消済み';
    default:
      return '受信済み';
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '日時なし';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

function readErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : fallback;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '処理に失敗しました';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
