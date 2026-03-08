/**
 * F-04: daily_reports の report_date 参照テスト
 * spec: docs/stabilization/spec-schema-frontend-alignment-v0.2.md
 *
 * daily_reports テーブルの SSOT (baseline migration):
 *   report_date date NOT NULL
 *
 * 受け入れ条件:
 * - .eq('date', ...) を使っていないこと
 * - .eq('report_date', ...) を使っていること
 */

import * as fs from 'fs';
import * as path from 'path';

const TARGET_FILE = 'src/api/database/supabase-client.ts';

function readFile(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

describe('F-04: daily_reports report_date 参照', () => {
  it('supabase-client.ts の getDailyReports で .eq("date", ...) を使っていないこと', () => {
    const content = readFile(TARGET_FILE);
    // daily_reports 関連の .eq('date', ...) パターンを検出
    const dailyReportsSection = content.match(
      /getDailyReports[\s\S]*?(?=\n\s*(?:async\s+\w+|\w+\s*\(|},))/
    );
    if (dailyReportsSection) {
      expect(dailyReportsSection[0]).not.toMatch(/\.eq\(\s*['"]date['"]/);
    }
  });

  it('supabase-client.ts の getDailyReports で .eq("report_date", ...) を使っていること', () => {
    const content = readFile(TARGET_FILE);
    const dailyReportsSection = content.match(
      /getDailyReports[\s\S]*?(?=\n\s*(?:async\s+\w+|\w+\s*\(|},))/
    );
    if (dailyReportsSection) {
      expect(dailyReportsSection[0]).toMatch(/\.eq\(\s*['"]report_date['"]/);
    }
  });
});
