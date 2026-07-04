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

function filesContaining(pattern: string): string[] {
  return collectSourceFiles(SRC_DIR).filter(filePath => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.includes(pattern);
  });
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
      const refs = filesContaining('api/database/supabase-client');
      const productionRefs = refs.filter(
        f => !f.includes('supabase-client.ts')
      );
      expect(productionRefs).toHaveLength(0);
    });
  });

  describe('supabase-browser.ts の廃止', () => {
    test('supabase-browser.ts への参照がプロダクションコードに存在しない', () => {
      const refs = filesContaining('supabase-browser');
      const productionRefs = refs.filter(
        f => !f.includes('supabase-browser.ts')
      );
      expect(productionRefs).toHaveLength(0);
    });
  });
});
