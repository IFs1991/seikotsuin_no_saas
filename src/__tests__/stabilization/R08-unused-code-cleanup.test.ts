/**
 * R-08: 未使用コード清掃の検証テスト
 *
 * 検証項目:
 * 1. error-handler-enhanced.ts の参照がプロダクションコードに存在しない
 * 2. supabase-browser.ts の参照がプロダクションコードに存在しない (R-03 後)
 * 3. src/api/database/supabase-client.ts の参照がプロダクションコードに存在しない (R-03 後)
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../..');

function collectSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function productionRefs(pattern: string, selfFile?: string): string[] {
  return collectSourceFiles(SRC_DIR).filter(filePath => {
    if (selfFile && filePath.includes(selfFile)) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return content.includes(pattern);
  });
}

describe('R-08: 未使用コード清掃', () => {
  test('error-handler-enhanced.ts への参照がプロダクションコードに存在しない', () => {
    const refs = productionRefs(
      'error-handler-enhanced',
      'error-handler-enhanced.ts'
    );
    expect(refs).toHaveLength(0);
  });

  test('SecurityErrorHandler への参照がプロダクションコードに存在しない', () => {
    const refs = productionRefs(
      'SecurityErrorHandler',
      'error-handler-enhanced.ts'
    );
    expect(refs).toHaveLength(0);
  });

  test('GlobalErrorHandler への参照がプロダクションコードに存在しない', () => {
    const refs = productionRefs(
      'GlobalErrorHandler',
      'error-handler-enhanced.ts'
    );
    expect(refs).toHaveLength(0);
  });

  test('supabase-browser.ts への参照がプロダクションコードに存在しない', () => {
    const refs = productionRefs('supabase-browser', 'supabase-browser.ts');
    expect(refs).toHaveLength(0);
  });

  test('api/database/supabase-client.ts への参照がプロダクションコードに存在しない', () => {
    const refs = productionRefs(
      'api/database/supabase-client',
      'supabase-client.ts'
    );
    expect(refs).toHaveLength(0);
  });
});
