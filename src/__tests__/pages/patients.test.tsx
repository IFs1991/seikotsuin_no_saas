import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientsPage from '@/app/patients/page';
import { usePatientAnalysis } from '@/hooks/usePatientAnalysis';

// Mock the custom hook
jest.mock('@/hooks/usePatientAnalysis');
const mockUsePatientAnalysis = usePatientAnalysis as jest.MockedFunction<typeof usePatientAnalysis>;

// Mock data
const mockPatientData = {
  conversionData: {
    stages: [
      { name: '新患', value: 100, percentage: 100 },
      { name: '2回目来院', value: 80, percentage: 80 },
      { name: '継続治療', value: 60, percentage: 60 },
      { name: 'リピーター', value: 40, percentage: 40 }
    ]
  },
  visitCounts: {
    average: 5.2,
    monthlyChange: 12
  },
  riskScores: [
    {
      id: 1,
      name: '田中太郎',
      lastVisit: '2024-08-01',
      riskLevel: 'high' as const,
      score: 85
    },
    {
      id: 2,
      name: '山田花子',
      lastVisit: '2024-08-05',
      riskLevel: 'medium' as const,
      score: 65
    }
  ],
  ltvRanking: [
    { name: '佐藤次郎', ltv: 150000 },
    { name: '鈴木三郎', ltv: 120000 },
    { name: '高橋四郎', ltv: 95000 }
  ],
  segmentData: {
    age: [
      { label: '20-30代', value: 35 },
      { label: '31-50代', value: 45 },
      { label: '51歳以上', value: 20 }
    ],
    symptom: [
      { label: '腰痛', value: 40 },
      { label: '肩こり', value: 30 },
      { label: 'その他', value: 30 }
    ],
    area: [
      { label: '地域A', value: 50 },
      { label: '地域B', value: 30 },
      { label: '地域C', value: 20 }
    ]
  },
  reservations: [],
  satisfactionCorrelation: {},
  followUpList: [
    {
      id: 1,
      name: '田中太郎',
      reason: '最終来院から2週間経過'
    },
    {
      id: 2,
      name: '山田花子',
      reason: '治療完了後のフォローアップ'
    }
  ]
};

describe('PatientsPage', () => {
  beforeEach(() => {
    mockUsePatientAnalysis.mockReturnValue(mockPatientData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render patients page with all sections', async () => {
    render(<PatientsPage />);

    // Check for main headings
    expect(screen.getByText('患者フロー分析')).toBeInTheDocument();
    expect(screen.getByText('平均通院回数')).toBeInTheDocument();
    expect(screen.getByText('患者LTV')).toBeInTheDocument();
    expect(screen.getByText('離脱リスク分析')).toBeInTheDocument();
    expect(screen.getByText('セグメント分析')).toBeInTheDocument();
    expect(screen.getByText('フォローアップ対象')).toBeInTheDocument();
  });

  test('should display average visit count correctly', () => {
    render(<PatientsPage />);

    expect(screen.getByText('5.2回')).toBeInTheDocument();
    expect(screen.getByText('前月比: 12%')).toBeInTheDocument();
  });

  test('should display LTV ranking', () => {
    render(<PatientsPage />);

    expect(screen.getByText('佐藤次郎')).toBeInTheDocument();
    expect(screen.getByText('¥150,000')).toBeInTheDocument();
    expect(screen.getByText('鈴木三郎')).toBeInTheDocument();
    expect(screen.getByText('¥120,000')).toBeInTheDocument();
    expect(screen.getByText('高橋四郎')).toBeInTheDocument();
    expect(screen.getByText('¥95,000')).toBeInTheDocument();
  });

  test('should display follow-up list', () => {
    render(<PatientsPage />);

    expect(screen.getAllByText('田中太郎')).toHaveLength(2); // リスク分析とフォローアップに表示
    expect(screen.getByText('最終来院から2週間経過')).toBeInTheDocument();
    expect(screen.getAllByText('山田花子')).toHaveLength(2); // リスク分析とフォローアップに表示
    expect(screen.getByText('治療完了後のフォローアップ')).toBeInTheDocument();
  });

  test('should have contact buttons for follow-up patients', () => {
    render(<PatientsPage />);

    const contactButtons = screen.getAllByText('連絡する');
    expect(contactButtons).toHaveLength(2);
  });

  test('should display segment analysis tabs', () => {
    render(<PatientsPage />);

    expect(screen.getByText('年齢層')).toBeInTheDocument();
    expect(screen.getByText('症状')).toBeInTheDocument();
    expect(screen.getByText('地域')).toBeInTheDocument();
  });
});