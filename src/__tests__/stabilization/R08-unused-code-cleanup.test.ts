/**
 * R-08: 未使用コード清掃の検証テスト
 *
 * 検証項目:
 * 1. error-handler-enhanced.ts の参照がプロダクションコードに存在しない
 * 2. supabase-browser.ts の参照がプロダクションコードに存在しない (R-03 後)
 * 3. src/api/database/supabase-client.ts の参照がプロダクションコードに存在しない (R-03 後)
 */
import * as path from 'path';
import { execSync } from 'child_process';

const SRC_DIR = path.resolve(__dirname, '../..');

function grepProductionRefs(pattern: string, selfFile?: string): string[] {
  try {
    const result = execSync(
      `grep -rl "${pattern}" "${SRC_DIR}" --include="*.ts" --include="*.tsx"`,
      { encoding: 'utf-8', timeout: 10_000 }
    ).trim();
    return result
      ? result
          .split('\n')
          .filter(
            f =>
              f &&
              !f.includes('__tests__') &&
              (!selfFile || !f.includes(selfFile))
          )
      : [];
  } catch {
    return [];
  }
}

describe('R-08: 未使用コード清掃', () => {
  test('error-handler-enhanced.ts への参照がプロダクションコードに存在しない', () => {
    const refs = grepProductionRefs(
      'error-handler-enhanced',
      'error-handler-enhanced.ts'
    );
    expect(refs).toHaveLength(0);
  });

  test('SecurityErrorHandler への参照がプロダクションコードに存在しない', () => {
    const refs = grepProductionRefs(
      'SecurityErrorHandler',
      'error-handler-enhanced.ts'
    );
    expect(refs).toHaveLength(0);
  });

  test('GlobalErrorHandler への参照がプロダクションコードに存在しない', () => {
    const refs = grepProductionRefs(
      'GlobalErrorHandler',
      'error-handler-enhanced.ts'
    );
    expect(refs).toHaveLength(0);
  });

  test('supabase-browser.ts への参照がプロダクションコードに存在しない', () => {
    const refs = grepProductionRefs('supabase-browser', 'supabase-browser.ts');
    expect(refs).toHaveLength(0);
  });

  test('api/database/supabase-client.ts への参照がプロダクションコードに存在しない', () => {
    const refs = grepProductionRefs(
      'api/database/supabase-client',
      'supabase-client.ts'
    );
    expect(refs).toHaveLength(0);
  });
});
