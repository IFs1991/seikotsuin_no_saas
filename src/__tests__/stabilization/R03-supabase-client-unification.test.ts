/**
 * R-03: Supabase Client 実装統一の検証テスト
 *
 * 検証項目:
 * 1. Browser client が Database 型を使用している
 * 2. Server client が Database 型を使用している
 * 3. 未使用クライアント (src/api/database/supabase-client.ts) が参照されていない
 * 4. supabase-browser.ts の参照が 0 件（廃止後）
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SRC_DIR = path.resolve(__dirname, '../..');

function grepFiles(pattern: string): string[] {
  try {
    const result = execSync(
      `grep -rl "${pattern}" "${SRC_DIR}" --include="*.ts" --include="*.tsx"`,
      { encoding: 'utf-8', timeout: 10_000 }
    ).trim();
    return result
      ? result.split('\n').filter(f => f && !f.includes('__tests__'))
      : [];
  } catch {
    return [];
  }
}

describe('R-03: Supabase Client 統一', () => {
  describe('Browser client (src/lib/supabase/client.ts)', () => {
    test('Database 型をインポートしている', () => {
      const content = fs.readFileSync(
        path.join(SRC_DIR, 'lib/supabase/client.ts'),
        'utf-8'
      );
      expect(content).toMatch(/import.*Database.*from.*supabase/);
    });

    test('createBrowserClient<Database> を使用している', () => {
      const content = fs.readFileSync(
        path.join(SRC_DIR, 'lib/supabase/client.ts'),
        'utf-8'
      );
      expect(content).toMatch(/createBrowserClient<Database>/);
    });
  });

  describe('Server client (src/lib/supabase/server.ts)', () => {
    test('Database 型をインポートしている', () => {
      const content = fs.readFileSync(
        path.join(SRC_DIR, 'lib/supabase/server.ts'),
        'utf-8'
      );
      expect(content).toMatch(/import.*Database.*from.*supabase/);
    });

    test('createServerClient<Database> を使用している', () => {
      const content = fs.readFileSync(
        path.join(SRC_DIR, 'lib/supabase/server.ts'),
        'utf-8'
      );
      expect(content).toMatch(/createServerClient<Database>/);
    });
  });

  describe('未使用クライアントの排除', () => {
    test('src/api/database/supabase-client.ts への参照がプロダクションコードに存在しない', () => {
      const refs = grepFiles('api/database/supabase-client');
      const productionRefs = refs.filter(
        f => !f.includes('supabase-client.ts')
      );
      expect(productionRefs).toHaveLength(0);
    });
  });

  describe('supabase-browser.ts の廃止', () => {
    test('supabase-browser.ts への参照がプロダクションコードに存在しない', () => {
      const refs = grepFiles('supabase-browser');
      const productionRefs = refs.filter(
        f => !f.includes('supabase-browser.ts')
      );
      expect(productionRefs).toHaveLength(0);
    });
  });
});
