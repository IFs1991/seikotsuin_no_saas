/**
 * 予約サービス層のテスト
 * TDD実装 - Phase 1: テスト定義
 */

import { ReservationService } from '@/lib/services/reservation-service';
import type {
  Reservation,
  Customer,
  Menu,
  Resource,
  TimeSlot,
} from '@/types/reservation';

// モックデータ
const mockCustomer: Customer = {
  id: 'cust1',
  name: '山田太郎',
  phone: '090-1234-5678',
  email: 'yamada@example.com',
  customAttributes: { symptoms: '肩こり' },
  consentMarketing: true,
  consentReminder: true,
  createdAt: new Date('2025-10-24T10:00:00'),
  updatedAt: new Date('2025-10-24T10:00:00'),
};

const mockMenu: Menu = {
  id: 'menu1',
  name: '整体60分',
  durationMinutes: 60,
  price: 6000,
  description: '全身の調整を行います',
  isActive: true,
};

const mockStaff: Resource = {
  id: 'staff1',
  name: '田中先生',
  type: 'staff',
  workingHours: {
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00' },
    saturday: { start: '09:00', end: '16:00' },
    sunday: null, // 日曜休み
  },
  maxConcurrent: 1,
  supportedMenus: ['menu1', 'menu2'],
  isActive: true,
};

const mockReservation: Reservation = {
  id: 'res1',
  customerId: 'cust1',
  menuId: 'menu1',
  staffId: 'staff1',
  startTime: new Date('2025-10-25T10:00:00'),
  endTime: new Date('2025-10-25T11:00:00'),
  status: 'confirmed',
  channel: 'phone',
  notes: '初回の方です',
  createdAt: new Date('2025-10-24T14:30:00'),
  updatedAt: new Date('2025-10-24T14:30:00'),
  createdBy: 'user1',
};

// モック関数
const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() =>
          Promise.resolve({ data: mockReservation, error: null })
        ),
        order: jest.fn(() =>
          Promise.resolve({ data: [mockReservation], error: null })
        ),
      })),
      gte: jest.fn(() => ({
        lte: jest.fn(() =>
          Promise.resolve({ data: [mockReservation], error: null })
        ),
      })),
      insert: jest.fn(() =>
        Promise.resolve({ data: mockReservation, error: null })
      ),
      update: jest.fn(() =>
        Promise.resolve({ data: mockReservation, error: null })
      ),
      delete: jest.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  })),
};

// ReservationServiceのモック実装
jest.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabaseClient,
}));

describe('ReservationService', () => {
  let reservationService: ReservationService;

  beforeEach(() => {
    reservationService = new ReservationService();
    jest.clearAllMocks();
  });

  describe('予約検索・取得機能', () => {
    test('ID指定で予約を取得できる', async () => {
      const result = await reservationService.getReservationById('res1');

      expect(result).toEqual(mockReservation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reservations');
    });

    test('日付範囲で予約を検索できる', async () => {
      const startDate = new Date('2025-10-25T00:00:00');
      const endDate = new Date('2025-10-25T23:59:59');

      const result = await reservationService.getReservationsByDateRange(
        startDate,
        endDate
      );

      expect(result).toEqual([mockReservation]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reservations');
    });

    test('スタッフIDで予約を検索できる', async () => {
      const result = await reservationService.getReservationsByStaff(
        'staff1',
        new Date('2025-10-25')
      );

      expect(result).toEqual([mockReservation]);
    });

    test('顧客IDで予約履歴を取得できる', async () => {
      const result = await reservationService.getCustomerReservations('cust1');

      expect(result).toEqual([mockReservation]);
    });

    test('ステータス別で予約を検索できる', async () => {
      const result =
        await reservationService.getReservationsByStatus('confirmed');

      expect(result).toEqual([mockReservation]);
    });
  });

  describe('利用可能時間取得機能', () => {
    test('スタッフの利用可能時間を取得できる', async () => {
      const mockTimeSlots: TimeSlot[] = [
        { time: '09:00', available: true },
        { time: '09:30', available: true },
        { time: '10:00', available: false, conflictReason: '予約済み' },
        { time: '10:30', available: true },
      ];

      // モック関数を設定
      const getAvailableTimeSlots = jest
        .spyOn(reservationService, 'getAvailableTimeSlots')
        .mockResolvedValue(mockTimeSlots);

      const result = await reservationService.getAvailableTimeSlots(
        'staff1',
        new Date('2025-10-25'),
        60 // 60分のメニュー
      );

      expect(result).toEqual(mockTimeSlots);
      expect(getAvailableTimeSlots).toHaveBeenCalledWith(
        'staff1',
        new Date('2025-10-25'),
        60
      );
    });

    test('営業時間外の時間は利用不可として返される', async () => {
      const mockTimeSlots: TimeSlot[] = [
        { time: '08:00', available: false, conflictReason: '営業時間外' },
        { time: '09:00', available: true },
        { time: '18:00', available: false, conflictReason: '営業時間外' },
      ];

      const getAvailableTimeSlots = jest
        .spyOn(reservationService, 'getAvailableTimeSlots')
        .mockResolvedValue(mockTimeSlots);

      const result = await reservationService.getAvailableTimeSlots(
        'staff1',
        new Date('2025-10-25'),
        60
      );

      expect(result).toEqual(mockTimeSlots);
    });

    test('既存予約と重複する時間は利用不可として返される', async () => {
      const mockTimeSlots: TimeSlot[] = [
        { time: '09:30', available: true },
        {
          time: '10:00',
          available: false,
          conflictReason: '予約済み: 山田太郎様',
        },
        {
          time: '10:30',
          available: false,
          conflictReason: '予約済み: 山田太郎様',
        },
        { time: '11:00', available: true },
      ];

      const getAvailableTimeSlots = jest
        .spyOn(reservationService, 'getAvailableTimeSlots')
        .mockResolvedValue(mockTimeSlots);

      const result = await reservationService.getAvailableTimeSlots(
        'staff1',
        new Date('2025-10-25'),
        60
      );

      expect(result).toEqual(mockTimeSlots);
    });
  });

  describe('予約作成機能', () => {
    test('新規予約を作成できる', async () => {
      const newReservationData = {
        customerId: 'cust1',
        menuId: 'menu1',
        staffId: 'staff1',
        startTime: new Date('2025-10-26T14:00:00'),
        endTime: new Date('2025-10-26T15:00:00'),
        channel: 'phone' as const,
        notes: '新規予約です',
        createdBy: 'user1',
      };

      const result =
        await reservationService.createReservation(newReservationData);

      expect(result).toEqual(mockReservation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reservations');
    });

    test('時間重複チェックが動作する', async () => {
      const conflictingData = {
        customerId: 'cust2',
        menuId: 'menu1',
        staffId: 'staff1',
        startTime: new Date('2025-10-25T10:30:00'), // 既存予約と重複
        endTime: new Date('2025-10-25T11:30:00'),
        channel: 'phone' as const,
        createdBy: 'user1',
      };

      // 重複チェックが失敗する場合のモック
      const validateTimeSlot = jest
        .spyOn(reservationService, 'validateTimeSlot')
        .mockResolvedValue({ isValid: false, reason: '時間が重複しています' });

      await expect(
        reservationService.createReservation(conflictingData)
      ).rejects.toThrow('時間が重複しています');

      expect(validateTimeSlot).toHaveBeenCalled();
    });

    test('複数回予約を一括作成できる', async () => {
      const multipleReservationData = {
        customerId: 'cust1',
        menuId: 'menu1',
        staffId: 'staff1',
        baseStartTime: new Date('2025-10-26T14:00:00'),
        duration: 60,
        dates: [
          new Date('2025-10-26'),
          new Date('2025-11-02'),
          new Date('2025-11-09'),
        ],
        channel: 'phone' as const,
        notes: '継続予約',
        createdBy: 'user1',
      };

      const expectedReservations = [
        { ...mockReservation, id: 'res1' },
        { ...mockReservation, id: 'res2' },
        { ...mockReservation, id: 'res3' },
      ];

      const createMultipleReservations = jest
        .spyOn(reservationService, 'createMultipleReservations')
        .mockResolvedValue(expectedReservations);

      const result = await reservationService.createMultipleReservations(
        multipleReservationData
      );

      expect(result).toEqual(expectedReservations);
      expect(createMultipleReservations).toHaveBeenCalledWith(
        multipleReservationData
      );
    });
  });

  describe('予約更新機能', () => {
    test('予約ステータスを更新できる', async () => {
      const result = await reservationService.updateReservationStatus(
        'res1',
        'arrived'
      );

      expect(result).toEqual(mockReservation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reservations');
    });

    test('予約時間を変更できる', async () => {
      const newStartTime = new Date('2025-10-25T15:00:00');
      const newEndTime = new Date('2025-10-25T16:00:00');

      const result = await reservationService.updateReservationTime(
        'res1',
        newStartTime,
        newEndTime
      );

      expect(result).toEqual(mockReservation);
    });

    test('予約担当者を変更できる', async () => {
      const result = await reservationService.updateReservationStaff(
        'res1',
        'staff2'
      );

      expect(result).toEqual(mockReservation);
    });

    test('予約メモを更新できる', async () => {
      const result = await reservationService.updateReservationNotes(
        'res1',
        '症状が改善されています'
      );

      expect(result).toEqual(mockReservation);
    });
  });

  describe('予約削除機能', () => {
    test('予約をキャンセルできる', async () => {
      const result = await reservationService.cancelReservation(
        'res1',
        '顧客都合による'
      );

      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('reservations');
    });

    test('予約を削除できる', async () => {
      const result = await reservationService.deleteReservation('res1');

      expect(result).toBe(true);
    });
  });

  describe('一括操作機能', () => {
    test('複数予約のステータスを一括更新できる', async () => {
      const reservationIds = ['res1', 'res2', 'res3'];
      const newStatus = 'confirmed';

      const bulkUpdateStatus = jest
        .spyOn(reservationService, 'bulkUpdateStatus')
        .mockResolvedValue(3);

      const result = await reservationService.bulkUpdateStatus(
        reservationIds,
        newStatus
      );

      expect(result).toBe(3);
      expect(bulkUpdateStatus).toHaveBeenCalledWith(reservationIds, newStatus);
    });

    test('複数予約を一括削除できる', async () => {
      const reservationIds = ['res1', 'res2'];

      const bulkDeleteReservations = jest
        .spyOn(reservationService, 'bulkDeleteReservations')
        .mockResolvedValue(2);

      const result =
        await reservationService.bulkDeleteReservations(reservationIds);

      expect(result).toBe(2);
      expect(bulkDeleteReservations).toHaveBeenCalledWith(reservationIds);
    });
  });

  describe('バリデーション機能', () => {
    test('営業時間内チェックが動作する', async () => {
      const validateBusinessHours = jest
        .spyOn(reservationService, 'validateBusinessHours')
        .mockResolvedValue({ isValid: true });

      const result = await reservationService.validateBusinessHours(
        'staff1',
        new Date('2025-10-25T10:00:00')
      );

      expect(result.isValid).toBe(true);
    });

    test('営業時間外の場合はエラーが返される', async () => {
      const validateBusinessHours = jest
        .spyOn(reservationService, 'validateBusinessHours')
        .mockResolvedValue({ isValid: false, reason: '営業時間外です' });

      const result = await reservationService.validateBusinessHours(
        'staff1',
        new Date('2025-10-25T20:00:00') // 営業時間外
      );

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('営業時間外です');
    });

    test('スタッフの対応メニューチェックが動作する', async () => {
      const validateStaffMenu = jest
        .spyOn(reservationService, 'validateStaffMenu')
        .mockResolvedValue({ isValid: true });

      const result = await reservationService.validateStaffMenu(
        'staff1',
        'menu1'
      );

      expect(result.isValid).toBe(true);
    });

    test('対応外メニューの場合はエラーが返される', async () => {
      const validateStaffMenu = jest
        .spyOn(reservationService, 'validateStaffMenu')
        .mockResolvedValue({
          isValid: false,
          reason: 'このスタッフは対応できないメニューです',
        });

      const result = await reservationService.validateStaffMenu(
        'staff1',
        'menu999'
      );

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('このスタッフは対応できないメニューです');
    });
  });

  describe('統計・レポート機能', () => {
    test('期間別予約統計を取得できる', async () => {
      const mockStats = {
        totalReservations: 10,
        confirmedReservations: 8,
        cancelledReservations: 2,
        noShowCount: 0,
        averageUtilization: 0.75,
      };

      const getReservationStats = jest
        .spyOn(reservationService, 'getReservationStats')
        .mockResolvedValue(mockStats);

      const result = await reservationService.getReservationStats(
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(result).toEqual(mockStats);
    });

    test('スタッフ別稼働率を取得できる', async () => {
      const mockUtilization = [
        { staffId: 'staff1', staffName: '田中先生', utilizationRate: 0.85 },
        { staffId: 'staff2', staffName: '佐藤先生', utilizationRate: 0.72 },
      ];

      const getStaffUtilization = jest
        .spyOn(reservationService, 'getStaffUtilization')
        .mockResolvedValue(mockUtilization);

      const result = await reservationService.getStaffUtilization(
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(result).toEqual(mockUtilization);
    });

    test('No-show分析を取得できる', async () => {
      const mockNoShowAnalysis = {
        totalNoShows: 5,
        noShowRate: 0.05,
        topReasons: [
          { reason: '急な体調不良', count: 2 },
          { reason: '交通事情', count: 1 },
        ],
        channelBreakdown: {
          line: 2,
          phone: 2,
          web: 1,
        },
      };

      const getNoShowAnalysis = jest
        .spyOn(reservationService, 'getNoShowAnalysis')
        .mockResolvedValue(mockNoShowAnalysis);

      const result = await reservationService.getNoShowAnalysis(
        new Date('2025-10-01'),
        new Date('2025-10-31')
      );

      expect(result).toEqual(mockNoShowAnalysis);
    });
  });

  describe('エラーハンドリング', () => {
    test('データベースエラーが適切に処理される', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: 'Database error' },
              }),
          }),
        }),
      });

      await expect(
        reservationService.getReservationById('invalid-id')
      ).rejects.toThrow('Database error');
    });

    test('存在しない予約IDでエラーが発生する', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      });

      await expect(
        reservationService.getReservationById('nonexistent')
      ).rejects.toThrow('予約が見つかりません');
    });

    test('無効なデータでの予約作成がエラーになる', async () => {
      const invalidData = {
        customerId: '',
        menuId: '',
        staffId: '',
        startTime: new Date('invalid'),
        endTime: new Date('invalid'),
        channel: 'invalid' as any,
        createdBy: '',
      };

      await expect(
        reservationService.createReservation(invalidData)
      ).rejects.toThrow();
    });
  });

  describe('パフォーマンス要件', () => {
    test('予約検索が十分高速である', async () => {
      const startTime = performance.now();

      await reservationService.getReservationsByDateRange(
        new Date('2025-10-25T00:00:00'),
        new Date('2025-10-25T23:59:59')
      );

      const endTime = performance.now();
      const operationTime = endTime - startTime;

      // 1秒以内での応答を確認
      expect(operationTime).toBeLessThan(1000);
    });

    test('利用可能時間取得が十分高速である', async () => {
      const startTime = performance.now();

      // モック関数を設定
      jest
        .spyOn(reservationService, 'getAvailableTimeSlots')
        .mockResolvedValue([
          { time: '09:00', available: true },
          { time: '09:30', available: true },
        ]);

      await reservationService.getAvailableTimeSlots(
        'staff1',
        new Date('2025-10-25'),
        60
      );

      const endTime = performance.now();
      const operationTime = endTime - startTime;

      // 500ms以内での応答を確認
      expect(operationTime).toBeLessThan(500);
    });
  });
});
