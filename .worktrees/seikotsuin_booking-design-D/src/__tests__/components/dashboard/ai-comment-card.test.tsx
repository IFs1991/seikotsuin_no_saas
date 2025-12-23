/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { AICommentCard } from '@/components/dashboard/ai-comment-card';

// TDDアプローチ：まずテストを書く
describe('AICommentCard', () => {
  const mockComment = {
    id: '1',
    date: '2025-01-01',
    summary: 'Today was a great day with high patient satisfaction.',
    highlights: ['High patient volume', 'Excellent service quality'],
    improvements: ['Reduce waiting time', 'Update equipment'],
    suggestions: ['Implement appointment reminders'],
    created_at: '2025-01-01T10:00:00Z',
  };

  beforeEach(() => {
    // 各テスト前のセットアップ
  });

  it('should render AI comment card with all required elements', () => {
    render(<AICommentCard comment={mockComment} />);

    // 基本要素の存在確認
    expect(
      screen.getByText('Today was a great day with high patient satisfaction.')
    ).toBeInTheDocument();
    expect(screen.getByText('好調だった点')).toBeInTheDocument();
    expect(screen.getByText('改善が必要な点')).toBeInTheDocument();
    expect(screen.getByText('明日への提案')).toBeInTheDocument();
  });

  it('should display highlights correctly', () => {
    render(<AICommentCard comment={mockComment} />);

    expect(screen.getByText('High patient volume')).toBeInTheDocument();
    expect(screen.getByText('Excellent service quality')).toBeInTheDocument();
  });

  it('should display improvements correctly', () => {
    render(<AICommentCard comment={mockComment} />);

    expect(screen.getByText('Reduce waiting time')).toBeInTheDocument();
    expect(screen.getByText('Update equipment')).toBeInTheDocument();
  });

  it('should display suggestions correctly', () => {
    render(<AICommentCard comment={mockComment} />);

    expect(
      screen.getByText('Implement appointment reminders')
    ).toBeInTheDocument();
  });

  it('should handle empty data gracefully', () => {
    const emptyComment = {
      ...mockComment,
      highlights: [],
      improvements: [],
      suggestions: [],
    };

    render(<AICommentCard comment={emptyComment} />);

    // エラーが発生しないことを確認
    expect(screen.getByText(mockComment.summary)).toBeInTheDocument();
  });

  it('should be accessible', () => {
    render(<AICommentCard comment={mockComment} />);

    // アクセシビリティ要件の確認
    expect(screen.getByRole('article')).toBeInTheDocument();
    // ARIAラベルの確認
    expect(screen.getByLabelText(/AI分析コメント/)).toBeInTheDocument();
  });

  it('should apply correct styling for medical system', () => {
    const { container } = render(<AICommentCard comment={mockComment} />);

    // 医療系システムに適した色合いの確認
    const card = container.firstChild;
    expect(card).toHaveClass('bg-white', 'border', 'rounded-lg');
  });
});

// 注意：このテストを実行するには、まず対応するコンポーネントを実装する必要があります
// TDDアプローチでは、テストファーストで開発を進めます
