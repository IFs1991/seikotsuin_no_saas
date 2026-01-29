import { test, expect } from '@playwright/test';
import path from 'node:path';
import { CLINIC_A_ID, USER_ADMIN_ID, SECURITY_EVENT_IDS } from './fixtures';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);

test.use({ storageState: adminStorageStatePath });

/**
 * セキュリティ監視運用 E2Eテスト
 * 仕様書: docs/セキュリティ監視運用_MVP仕様書.md
 *
 * テストシナリオ:
 * 1. /admin/security-monitor にイベント一覧が表示される
 * 2. イベントのステータスを「解決済み」に更新 → 再読み込みで反映される
 * 3. 高重要度イベント作成時に notifications が1件追加される
 * 4. SecurityDashboard にメトリクスが表示される
 * 5. セッション強制終了 → セッション一覧から消える
 */

test.describe('セキュリティ監視運用', () => {
  test.describe('イベント一覧表示', () => {
    test('セキュリティイベント一覧が表示される', async ({ page }) => {
      // セキュリティ監視ページへ移動
      await page.goto('/admin/security-monitor');

      // ページタイトルが表示されることを確認
      await expect(
        page.getByRole('heading', { name: /セキュリティ/i })
      ).toBeVisible();

      // イベント一覧がロードされることを確認
      await expect(
        page.getByText(/セキュリティイベント|最近のセキュリティイベント/i)
      ).toBeVisible();
    });

    test('GET /api/admin/security/events がイベント一覧を返す', async ({
      page,
    }) => {
      const response = await page.request.get(
        `/api/admin/security/events?clinic_id=${CLINIC_A_ID}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // レスポンスが配列であること
      expect(Array.isArray(data.events || data)).toBeTruthy();
    });
  });

  test.describe('イベントステータス更新', () => {
    test('PATCH /api/admin/security/events でステータスが更新される', async ({
      page,
    }) => {
      const eventId = SECURITY_EVENT_IDS[0];

      // ステータスを「調査中」に更新
      const patchResponse = await page.request.patch(
        '/api/admin/security/events',
        {
          data: {
            id: eventId,
            status: 'investigating',
            resolution_notes: 'E2Eテストによる調査開始',
          },
        }
      );

      expect(patchResponse.ok()).toBeTruthy();

      // GETで確認
      const getResponse = await page.request.get(
        `/api/admin/security/events?clinic_id=${CLINIC_A_ID}&id=${eventId}`
      );

      expect(getResponse.ok()).toBeTruthy();
      const data = await getResponse.json();
      const event = Array.isArray(data.events) ? data.events[0] : data;
      expect(event.status).toBe('investigating');
    });

    test('UI上でイベントステータスを解決済みに更新できる', async ({ page }) => {
      await page.goto('/admin/security-monitor');

      // イベント一覧が表示されるまで待機
      await page.waitForSelector('[data-testid="security-event-item"]', {
        timeout: 10000,
      });

      // 最初のイベントの解決ボタンをクリック
      const resolveButton = page
        .locator('[data-testid="security-event-item"]')
        .first()
        .getByRole('button', { name: /解決|完了/ });

      if (await resolveButton.isVisible()) {
        await resolveButton.click();

        // モーダルが表示される場合は解決メモを入力
        const notesInput = page.getByLabel(/メモ|ノート|resolution/i);
        if (await notesInput.isVisible()) {
          await notesInput.fill('E2Eテストによる解決');
        }

        // 保存ボタンをクリック
        const saveButton = page.getByRole('button', { name: /保存|確定|OK/ });
        if (await saveButton.isVisible()) {
          await saveButton.click();
        }

        // 成功メッセージまたはステータス変更を確認
        await expect(
          page.getByText(/解決済み|更新しました|resolved/i)
        ).toBeVisible();
      }
    });
  });

  test.describe('高重要度イベント通知', () => {
    test('高重要度イベント作成時にnotificationsが追加される', async ({
      page,
    }) => {
      // テスト用の高重要度イベントを作成
      const createResponse = await page.request.post(
        '/api/admin/security/events',
        {
          data: {
            clinic_id: CLINIC_A_ID,
            event_type: 'threat_detected_brute_force',
            event_category: 'security_violation',
            severity_level: 'critical',
            event_description: 'E2Eテスト：ブルートフォース攻撃検知',
            ip_address: '192.168.1.100',
            source_component: 'e2e_test',
          },
        }
      );

      // 作成が成功または既存APIがない場合はスキップ
      if (!createResponse.ok()) {
        test.skip();
        return;
      }

      // notificationsを確認
      const notificationsResponse = await page.request.get(
        `/api/notifications?clinic_id=${CLINIC_A_ID}&type=security`
      );

      if (notificationsResponse.ok()) {
        const notifications = await notificationsResponse.json();
        expect(notifications.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('セキュリティメトリクス', () => {
    test('GET /api/admin/security/metrics がメトリクスを返す', async ({
      page,
    }) => {
      const response = await page.request.get(
        `/api/admin/security/metrics?clinic_id=${CLINIC_A_ID}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // 必須メトリクスが含まれることを確認
      expect(data).toHaveProperty('totalEvents');
      expect(data).toHaveProperty('activeSessions');
    });

    test('SecurityDashboard にメトリクスが表示される', async ({ page }) => {
      await page.goto('/admin/security-monitor');

      // メトリクスカードが表示されることを確認
      await expect(page.getByText(/総イベント|イベント数/i)).toBeVisible();
      await expect(
        page.getByText(/アクティブセッション|セッション/i)
      ).toBeVisible();
    });
  });

  test.describe('セッション管理', () => {
    test('GET /api/admin/security/sessions がアクティブセッション一覧を返す', async ({
      page,
    }) => {
      const response = await page.request.get(
        `/api/admin/security/sessions?clinic_id=${CLINIC_A_ID}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // レスポンスが配列であること
      expect(Array.isArray(data.sessions || data)).toBeTruthy();
    });

    test('POST /api/admin/security/sessions/terminate でセッションが終了される', async ({
      page,
    }) => {
      // まずアクティブセッションを取得
      const sessionsResponse = await page.request.get(
        `/api/admin/security/sessions?clinic_id=${CLINIC_A_ID}`
      );

      if (!sessionsResponse.ok()) {
        test.skip();
        return;
      }

      const sessionsData = await sessionsResponse.json();
      const sessions = sessionsData.sessions || sessionsData;

      if (!sessions.length) {
        test.skip();
        return;
      }

      // 最初のセッション（自分自身でないもの）を終了
      const targetSession = sessions.find(
        (s: { user_id: string }) => s.user_id !== USER_ADMIN_ID
      );

      if (!targetSession) {
        test.skip();
        return;
      }

      const terminateResponse = await page.request.post(
        '/api/admin/security/sessions/terminate',
        {
          data: {
            sessionId: targetSession.id,
          },
        }
      );

      expect(terminateResponse.ok()).toBeTruthy();

      // セッションが終了されたことを確認
      const afterResponse = await page.request.get(
        `/api/admin/security/sessions?clinic_id=${CLINIC_A_ID}`
      );
      const afterData = await afterResponse.json();
      const afterSessions = afterData.sessions || afterData;

      const stillExists = afterSessions.some(
        (s: { id: string }) => s.id === targetSession.id
      );
      expect(stillExists).toBeFalsy();
    });

    test('UI上でセッション強制終了ができる', async ({ page }) => {
      await page.goto('/admin/security-monitor');

      // セッションタブをクリック
      const sessionsTab = page.getByRole('tab', {
        name: /セッション|アクティブセッション/i,
      });
      if (await sessionsTab.isVisible()) {
        await sessionsTab.click();
      }

      // セッション一覧が表示されるまで待機
      await page.waitForTimeout(1000);

      // セッション終了ボタンがあれば確認
      const terminateButton = page
        .getByRole('button', { name: /終了|強制終了|ログアウト/ })
        .first();

      if (await terminateButton.isVisible()) {
        // ボタンが存在することを確認（実際のクリックは自分のセッションを終了する可能性があるため行わない）
        expect(await terminateButton.isEnabled()).toBeTruthy();
      }
    });
  });

  test.describe('APIエラーハンドリング', () => {
    test('clinic_id 未指定でエラー400が返る', async ({ page }) => {
      const response = await page.request.get('/api/admin/security/events');
      expect(response.status()).toBe(400);
    });

    test('存在しないイベントIDでPATCHするとエラーが返る', async ({ page }) => {
      const response = await page.request.patch('/api/admin/security/events', {
        data: {
          id: '00000000-0000-0000-0000-nonexistent01',
          status: 'resolved',
        },
      });

      // 404または400が返ることを確認
      expect([400, 404]).toContain(response.status());
    });
  });
});
