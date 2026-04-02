/**
 * R-04: System Settings フック一本化の検証テスト
 *
 * 検証項目:
 * 1. useSystemSettings のエクスポートが正式APIとして1つに統一されている
 * 2. useAdminMaster が useSystemSettings を参照している
 * 3. UseSystemSettingsReturn 型の契約が一貫している
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../..');

describe('R-04: System Settings フック一本化', () => {
  test('useSystemSettings.ts が正式APIとしてエクスポートしている', () => {
    const content = fs.readFileSync(
      path.join(SRC_DIR, 'hooks/useSystemSettings.ts'),
      'utf-8'
    );
    expect(content).toMatch(/export.*useSystemSettings/);
  });

  test('useSystemSettingsV2.ts が useSystemSettings として re-export している', () => {
    const content = fs.readFileSync(
      path.join(SRC_DIR, 'hooks/useSystemSettingsV2.ts'),
      'utf-8'
    );
    expect(content).toMatch(
      /export\s*\{.*useSystemSettingsV2\s+as\s+useSystemSettings.*\}/
    );
  });

  test('useAdminMaster.ts が useSystemSettings を使用している', () => {
    const content = fs.readFileSync(
      path.join(SRC_DIR, 'hooks/useAdminMaster.ts'),
      'utf-8'
    );
    expect(content).toMatch(
      /import.*useSystemSettings.*from.*useSystemSettings/
    );
  });

  test('useAdminMaster.ts に @deprecated 注記がある', () => {
    const content = fs.readFileSync(
      path.join(SRC_DIR, 'hooks/useAdminMaster.ts'),
      'utf-8'
    );
    expect(content).toContain('@deprecated');
  });

  test('両方の useSystemSettings が UseSystemSettingsReturn 型を返す', () => {
    const v1 = fs.readFileSync(
      path.join(SRC_DIR, 'hooks/useSystemSettings.ts'),
      'utf-8'
    );
    const v2 = fs.readFileSync(
      path.join(SRC_DIR, 'hooks/useSystemSettingsV2.ts'),
      'utf-8'
    );
    expect(v1).toContain('UseSystemSettingsReturn');
    expect(v2).toContain('UseSystemSettingsReturn');
  });

  test('admin master page は廃止導線として deprecation メッセージを表示している', () => {
    const adminMasterPage = fs.readFileSync(
      path.join(SRC_DIR, 'app/admin/(protected)/master/page.tsx'),
      'utf-8'
    );
    // useAdminMaster の直接利用は解消済み — 廃止導線として deprecation 案内を表示
    expect(adminMasterPage).toMatch(/MASTER_DATA_DEPRECATION_MESSAGE/);
  });
});
