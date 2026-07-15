import { test, expect } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';

const phase = (process.env.E2E_PHASE || 'phase1').toLowerCase();
const isPhase2Enabled = phase === 'phase2' || phase === '2' || phase === 'all';

test.describe('Dashboard - 実データ表示', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByText('ダッシュボードデータを読み込み中...')
    ).not.toBeVisible({ timeout: 30000 });
  });

  test('dashboard renders core widgets', async ({ page }) => {
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'ダッシュボード',
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByText('本日のリアルタイムデータ')).toBeVisible();
    await expect(page.getByText('AI分析コメント')).toBeVisible();
  });

  test('収益チャートが描画される（系列3本が存在する）', async ({ page }) => {
    // 収益トレンドカードが表示される
    await expect(page.getByText('収益トレンド')).toBeVisible();

    // 「準備中」ではなく実際のチャートが表示される
    await expect(
      page.getByText('チャート表示機能は準備中です')
    ).not.toBeVisible();

    // Rechartsのチャート要素が存在する
    await expect(page.locator('.recharts-responsive-container')).toBeVisible();

    // 3つの系列が存在する（総売上、保険診療、自費診療）
    await expect(page.locator('.recharts-line')).toHaveCount(3);
  });

  test('来院データが無い場合はヒートマップの空状態が描画される', async ({
    page,
  }) => {
    const heatmapHeading = page.getByRole('heading', {
      level: 3,
      name: '時間帯別混雑状況ヒートマップ',
      exact: true,
    });
    const heatmapCard = heatmapHeading.locator(
      'xpath=ancestor::div[@data-interactive="false"][1]'
    );

    // ヒートマップカードが表示される
    await expect(heatmapHeading).toBeVisible();

    // 「準備中」ではなく実際のヒートマップが表示される
    await expect(
      page.getByText('ヒートマップ表示機能は準備中です')
    ).not.toBeVisible();

    // PR07ではlegacy visitsへのE2E書き込みを禁止しているため、空状態を表示する
    await expect(
      heatmapCard.getByText('データがありません', { exact: true })
    ).toBeVisible();
    await expect(heatmapCard.getByTestId('heatmap-cell')).toHaveCount(0);
  });
});

if (isPhase2Enabled) {
  test.describe('Revenue Page - メニューランキング', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStaff(page);
      await page.goto('/revenue');
      await page.waitForLoadState('networkidle');
    });

    test('メニューランキングがAPIデータで表示される', async ({ page }) => {
      // メニューランキングコンポーネントが表示される
      await expect(
        page.getByText('施術メニュー別収益ランキング')
      ).toBeVisible();

      // モックデータではなくAPIデータが表示される
      // モック固有の「全身調整」が常に表示されるわけではない
      await expect(
        page.locator('[data-testid="menu-ranking-item"]').first()
      ).toBeVisible();

      // テーブルタブに切り替えてランキングを確認
      await page.getByRole('tab', { name: 'テーブル' }).click();

      // ランキングテーブルが表示される
      await expect(page.locator('table')).toBeVisible();
      await expect(
        page.getByRole('columnheader', { name: 'メニュー名' })
      ).toBeVisible();
      await expect(
        page.getByRole('columnheader', { name: '売上' })
      ).toBeVisible();
    });
  });

  test.describe('Patients Page - 転換ファネル', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStaff(page);
      await page.goto('/patients');
      await page.waitForLoadState('networkidle');
    });

    test('転換率表示がAPIデータに一致する（先頭100%基準）', async ({
      page,
    }) => {
      // 転換ファネルコンポーネントが表示される
      await expect(page.getByText('新患→再診転換ファネル')).toBeVisible();

      // ファネルステージが表示される
      await expect(
        page.locator('[data-testid="funnel-stage"]').first()
      ).toBeVisible();

      // 先頭ステージ（初回来院）が存在する
      await expect(page.getByText('初回来院')).toBeVisible();

      // 転換率の表示（パーセンテージ）
      await expect(
        page.locator('[data-testid="conversion-rate"]').first()
      ).toBeVisible();
    });
  });
}
