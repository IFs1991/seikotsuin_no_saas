/**
 * R-02: Legacy Reservation 再導入防止の検証テスト
 *
 * 検証項目:
 * 1. src/legacy/Reservation の tracked 実装が再導入されていない
 * 2. tsconfig.json で src/legacy が exclude されている
 * 3. 現行実装 (src/app/reservations) が存在し機能する
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../..');
const SRC_DIR = path.resolve(__dirname, '../..');

function collectSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'legacy') {
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

describe('R-02: Legacy Reservation 再導入防止', () => {
  test('src/legacy/Reservation の TypeScript 実装が存在しない', () => {
    const legacyDir = path.join(SRC_DIR, 'legacy/Reservation');
    const sourceFiles = collectSourceFiles(legacyDir);
    expect(sourceFiles).toHaveLength(0);
  });

  test('src/legacy/Reservation への import 参照がプロダクションコードに存在しない', () => {
    const refs = collectSourceFiles(SRC_DIR).filter(filePath => {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.includes('legacy/Reservation');
    });
    expect(refs).toHaveLength(0);
  });

  test('tsconfig.json で src/legacy が exclude されている', () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, 'tsconfig.json'), 'utf-8')
    );
    expect(tsconfig.exclude).toContain('src/legacy');
  });

  test('現行実装 src/app/(app)/reservations/page.tsx が存在する', () => {
    const pagePath = path.join(SRC_DIR, 'app/(app)/reservations/page.tsx');
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  test('現行実装にコアコンポーネントが存在する', () => {
    const components = [
      'AppointmentBlock.tsx',
      'AppointmentList.tsx',
      'Scheduler.tsx',
    ];
    for (const comp of components) {
      const compPath = path.join(
        SRC_DIR,
        'app/(app)/reservations/components',
        comp
      );
      expect(fs.existsSync(compPath)).toBe(true);
    }
  });
});
