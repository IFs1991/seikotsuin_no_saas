/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSendMessage = jest.fn();
const mockExportChat = jest.fn();
const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const CLINICS = [
  { id: CLINIC_ID, name: '新宿院' },
  { id: '22222222-2222-4222-8222-222222222222', name: '渋谷院' },
] as const;

jest.mock('@/hooks/useAdminChat', () => ({
  useAdminChat: jest.fn(() => ({
    messages: [],
    sendMessage: mockSendMessage,
    isLoading: false,
    exportChat: mockExportChat,
    error: null,
  })),
}));

jest.mock('@/providers/selected-clinic-context', () => ({
  useSelectedClinic: jest.fn(() => ({
    selectedClinicId: null,
    setSelectedClinicId: jest.fn(),
    clinics: CLINICS,
    clinicsLoading: false,
    clinicsError: null,
    currentClinicId: CLINIC_ID,
  })),
}));

import AdminChatPage from '@/app/(app)/admin/(protected)/chat/page';
import { useAdminChat } from '@/hooks/useAdminChat';
import { useSelectedClinic } from '@/providers/selected-clinic-context';

const mockUseAdminChat = useAdminChat as jest.MockedFunction<
  typeof useAdminChat
>;
const mockUseSelectedClinic = useSelectedClinic as jest.MockedFunction<
  typeof useSelectedClinic
>;

describe('AdminChatPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAdminChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      isLoading: false,
      exportChat: mockExportChat,
      error: null,
    });
    mockUseSelectedClinic.mockReturnValue({
      selectedClinicId: null,
      setSelectedClinicId: jest.fn(),
      clinics: CLINICS,
      currentClinicId: CLINIC_ID,
      clinicsLoading: false,
      clinicsError: null,
    });
  });

  it('横断スコープの文言と現在の対象範囲を表示する', () => {
    render(<AdminChatPage />);

    expect(screen.getByText('分析対象スコープ')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '横断スコープ' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('現在の対象範囲: 管理者が参照可能な店舗を横断')
    ).toBeInTheDocument();
    expect(mockUseAdminChat).toHaveBeenCalledWith({
      selectedClinicId: null,
      enabled: true,
    });
    expect(mockUseSelectedClinic).toHaveBeenCalledTimes(1);
  });

  it('選択店舗スコープは店舗名選択後だけhookへ内部IDを渡す', async () => {
    const user = userEvent.setup();
    render(<AdminChatPage />);

    await user.click(screen.getByRole('button', { name: '選択店舗スコープ' }));
    expect(
      screen.getByText('現在の対象範囲: 選択店舗を未確定')
    ).toBeInTheDocument();
    expect(mockUseAdminChat).toHaveBeenLastCalledWith({
      selectedClinicId: null,
      enabled: false,
    });
    expect(mockUseSelectedClinic).toHaveBeenCalled();

    await user.type(screen.getByLabelText('店舗名で検索'), '新宿');
    await user.click(screen.getByRole('button', { name: '新宿院' }));
    expect(mockUseAdminChat).toHaveBeenLastCalledWith({
      selectedClinicId: null,
      enabled: false,
    });

    await user.click(screen.getByRole('button', { name: 'この店舗で開始' }));

    expect(
      screen.getByText('現在の対象範囲: 選択店舗（新宿院）')
    ).toBeInTheDocument();
    expect(mockUseAdminChat).toHaveBeenLastCalledWith({
      selectedClinicId: CLINIC_ID,
      enabled: true,
    });
  });

  it('JSON出力であることが分かる表記にし、PDF/Excel表記を表示しない', () => {
    render(<AdminChatPage />);

    expect(
      screen.getAllByRole('button', { name: 'JSONエクスポート' }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('PDFエクスポート')).not.toBeInTheDocument();
    expect(screen.queryByText('Excelエクスポート')).not.toBeInTheDocument();
  });
});
