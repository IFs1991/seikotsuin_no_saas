/**
 * セッション管理パフォーマンステスト
 * システム性能要件の検証
 */

import { SessionManager } from '@/lib/session-manager';
import { SecurityMonitor } from '@/lib/security-monitor';
import { createClient } from '@supabase/supabase-js';

// パフォーマンステスト用モック
jest.mock('@supabase/supabase-js');

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  data: null,
  error: null,
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('セッション管理パフォーマンステスト', () => {
  let sessionManager: SessionManager;
  let securityMonitor: SecurityMonitor;

  beforeEach(() => {
    sessionManager = new SessionManager();
    securityMonitor = new SecurityMonitor();
    jest.clearAllMocks();
  });

  describe('セッション検証パフォーマンス', () => {
    const performanceThreshold = {
      sessionValidation: 50, // ms
      sessionCreation: 100, // ms
      threatAnalysis: 200, // ms
      bulkOperations: 500, // ms
    };

    it('単一セッション検証が50ms以内で完了する', async () => {
      const mockSession = {
        id: 'perf-session-1',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        is_active: true,
      };

      // 高速レスポンスをシミュレート
      mockSupabase.single.mockResolvedValue({
        data: mockSession,
        error: null,
      });

      const measurements = [];

      // 10回測定して平均を取る
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();

        await sessionManager.validateSession(`test-token-${i}`);

        const endTime = performance.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);

      expect(averageTime).toBeLessThan(performanceThreshold.sessionValidation);
      expect(maxTime).toBeLessThan(performanceThreshold.sessionValidation * 2); // 最大でも2倍以内
    });

    it('セッション作成が100ms以内で完了する', async () => {
      const mockCreatedSession = {
        id: 'perf-created-session',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        is_active: true,
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: null }) // 既存セッション確認
        .mockResolvedValue({ data: mockCreatedSession, error: null }); // セッション作成

      const startTime = performance.now();

      await sessionManager.createSession('user-123', 'clinic-456', {
        deviceInfo: {
          browser: 'Chrome',
          os: 'Windows',
          device: 'desktop',
          isMobile: false,
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        rememberDevice: false,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(performanceThreshold.sessionCreation);
    });

    it('セキュリティ脅威分析が200ms以内で完了する', async () => {
      const mockSession = {
        id: 'security-perf-session',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        ip_address: '192.168.1.100',
        device_info: { browser: 'Chrome', os: 'Windows' },
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      };

      // 脅威分析用のモックデータ
      mockSupabase.single.mockResolvedValue({
        data: [
          {
            event_type: 'login_failed',
            created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
        ],
        error: null,
      });

      const startTime = performance.now();

      await securityMonitor.analyzeSessionActivity(mockSession, {
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(performanceThreshold.threatAnalysis);
    });
  });

  describe('スケーラビリティテスト', () => {
    it('100並行セッション検証処理', async () => {
      const concurrentCount = 100;
      const mockSessions = Array.from({ length: concurrentCount }, (_, i) => ({
        id: `concurrent-session-${i}`,
        user_id: `user-${i}`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        is_active: true,
      }));

      mockSupabase.single.mockImplementation((index = 0) =>
        Promise.resolve({
          data: mockSessions[index % concurrentCount],
          error: null,
        })
      );

      const startTime = performance.now();

      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        sessionManager.validateSession(`concurrent-token-${i}`)
      );

      await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;
      const averagePerRequest = duration / concurrentCount;

      // 並行処理でも1リクエストあたり平均100ms以内
      expect(averagePerRequest).toBeLessThan(100);
      // 全体処理時間は2秒以内
      expect(duration).toBeLessThan(2000);
    });

    it('大量データでの脅威分析パフォーマンス', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        event_type: i % 2 === 0 ? 'login_failed' : 'suspicious_activity',
        ip_address: `192.168.1.${i % 255}`,
        created_at: new Date(Date.now() - i * 60 * 1000).toISOString(),
        event_details: {
          attempt: i,
          userAgent: `TestAgent/${i}`,
        },
      }));

      mockSupabase.single.mockResolvedValue({
        data: largeDataset,
        error: null,
      });

      const mockSession = {
        id: 'large-data-session',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        ip_address: '192.168.1.100',
        device_info: { browser: 'Chrome', os: 'Windows' },
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      };

      const startTime = performance.now();

      await securityMonitor.analyzeSessionActivity(mockSession, {
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 1000件のデータでも1秒以内で分析完了
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('メモリ使用量テスト', () => {
    it('大量セッション処理でのメモリリーク検証', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 1000回のセッション操作実行
      for (let i = 0; i < 1000; i++) {
        const mockSession = {
          id: `memory-test-session-${i}`,
          user_id: 'user-123',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          is_active: true,
        };

        mockSupabase.single.mockResolvedValue({
          data: mockSession,
          error: null,
        });

        await sessionManager.validateSession(`memory-test-token-${i}`);

        // 100回ごとにガベージコレクション実行
        if (i % 100 === 0) {
          if (global.gc) global.gc();
        }
      }

      // ガベージコレクション実行
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // メモリ増加は50MB以内に抑制
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('データベースクエリ最適化検証', () => {
    it('セッション検索クエリの効率性', async () => {
      const userId = 'user-efficiency-test';
      const mockActiveSessions = Array.from({ length: 50 }, (_, i) => ({
        id: `active-session-${i}`,
        user_id: userId,
        is_active: true,
        last_activity: new Date(Date.now() - i * 60 * 1000).toISOString(),
      }));

      mockSupabase.single.mockResolvedValue({
        data: mockActiveSessions,
        error: null,
      });

      const startTime = performance.now();

      await sessionManager.getUserSessions(userId, 'clinic-efficiency');

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 50件のアクティブセッション検索が100ms以内
      expect(duration).toBeLessThan(100);
    });

    it('セキュリティイベント集計クエリの最適化', async () => {
      const clinicId = 'clinic-efficiency-test';
      const _timeRange = {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24時間前
        to: new Date(),
      };

      const mockSecurityEvents = Array.from({ length: 500 }, (_, i) => ({
        id: `event-${i}`,
        clinic_id: clinicId,
        event_type: [
          'login_failed',
          'suspicious_activity',
          'brute_force_detected',
        ][i % 3],
        severity: ['low', 'medium', 'high', 'critical'][i % 4],
        created_at: new Date(Date.now() - i * 60 * 1000).toISOString(),
      }));

      mockSupabase.single.mockResolvedValue({
        data: mockSecurityEvents,
        error: null,
      });

      const startTime = performance.now();

      await securityMonitor.getSecurityStatistics(clinicId, 1);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 500件のイベント集計が200ms以内
      expect(duration).toBeLessThan(200);
    });
  });

  describe('エラー処理パフォーマンス', () => {
    it('データベースエラー時の適切な応答時間', async () => {
      // データベースエラーをシミュレート
      mockSupabase.single.mockRejectedValue(new Error('Connection timeout'));

      const startTime = performance.now();

      const res = await sessionManager.validateSession('error-test-token');

      const endTime = performance.now();
      const duration = endTime - startTime;

      // エラー処理も含めて300ms以内で応答
      expect(duration).toBeLessThan(300);
      expect(res.isValid).toBe(false);
    });

    it('タイムアウト処理の適切な実装', async () => {
      // 遅延レスポンスをシミュレート
      mockSupabase.single.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve({ data: null, error: null });
            }, 100); // 100ms の遅延
          })
      );

      const startTime = performance.now();

      await sessionManager.validateSession('timeout-test-token');

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 遅延があっても適切に処理される
      expect(duration).toBeGreaterThan(90);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('リアルタイム性能要件', () => {
    it('脅威検知から対応までの時間', async () => {
      const suspiciousSession = {
        id: 'realtime-threat-session',
        user_id: 'user-123',
        clinic_id: 'clinic-456',
        ip_address: '192.168.1.100',
        device_info: { browser: 'Chrome' },
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      };

      // 高脅威データ
      const criticalThreatData = Array.from({ length: 10 }, (_, i) => ({
        event_type: 'login_failed',
        ip_address: '192.168.1.100',
        created_at: new Date(Date.now() - i * 30 * 1000).toISOString(), // 30秒間隔
      }));

      mockSupabase.single.mockResolvedValue({
        data: criticalThreatData,
        error: null,
      });

      const startTime = performance.now();

      // 脅威分析実行
      const threats = await securityMonitor.analyzeSessionActivity(
        suspiciousSession,
        {
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
        }
      );

      // 自動対応実行（高脅威の場合）
      const criticalThreats = threats.filter(t => t.severity === 'critical');
      if (criticalThreats.length > 0) {
        await sessionManager.revokeSession(
          suspiciousSession.id,
          'security_violation'
        );
      }

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      // 脅威検知から対応まで500ms以内
      expect(responseTime).toBeLessThan(500);
    });
  });
});

/**
 * パフォーマンス測定用ヘルパー関数
 */
export class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map();

  startMeasurement(name: string): void {
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(performance.now());
  }

  endMeasurement(name: string): number {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      throw new Error(`No start measurement found for ${name}`);
    }

    const startTime = measurements.pop()!;
    const duration = performance.now() - startTime;

    return duration;
  }

  getAverageTime(name: string, sampleCount: number = 10): Promise<number> {
    return new Promise(resolve => {
      const times: number[] = [];

      const runMeasurement = async (count: number) => {
        if (count <= 0) {
          const average = times.reduce((a, b) => a + b, 0) / times.length;
          resolve(average);
          return;
        }

        this.startMeasurement(name);
        // 測定対象の処理をここに実装
        await new Promise(r => setTimeout(r, 1)); // ダミー処理
        const duration = this.endMeasurement(name);
        times.push(duration);

        await runMeasurement(count - 1);
      };

      runMeasurement(sampleCount);
    });
  }
}
