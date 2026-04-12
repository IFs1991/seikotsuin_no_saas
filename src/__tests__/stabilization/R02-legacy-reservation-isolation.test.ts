/**
 * R-02: Legacy Reservation 重複隔離の検証テスト
 *
 * 検証項目:
 * 1. src/legacy/Reservation への参照がプロダクションコードに存在しない
 * 2. tsconfig.json で src/legacy が exclude されている
 * 3. 現行実装 (src/app/reservations) が存在し機能する
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve(__dirname, '../../..');
const SRC_DIR = path.resolve(__dirname, '../..');

describe('R-02: Legacy Reservation 隔離', () => {
  test('src/legacy/Reservation への import 参照がプロダクションコードに存在しない', () => {
    let refs: string[] = [];
    try {
      const result = execSync(
        `grep -rl "legacy/Reservation" "${SRC_DIR}" --include="*.ts" --include="*.tsx"`,
        { encoding: 'utf-8', timeout: 10_000 }
      ).trim();
      refs = result
        ? result
            .split('\n')
            .filter(
              f => f && !f.includes('__tests__') && !f.includes('src/legacy/')
            )
        : [];
    } catch {
      refs = [];
    }
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
      const compPath = path.join(SRC_DIR, 'app/(app)/reservations/components', comp);
      expect(fs.existsSync(compPath)).toBe(true);
    }
  });
});
