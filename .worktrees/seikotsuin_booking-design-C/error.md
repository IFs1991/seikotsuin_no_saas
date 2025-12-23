# エラーログ履歴

## 【解決済み】2025-08-02 依存関係インストールエラー

(base) (base) PS C:\Users\seekf\Desktop\seikotsuin_management_saas> npm install
npm warn deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated domexception@4.0.0: Use your platform's native DOMException instead
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
npm warn cleanup Failed to remove some directories [
npm warn cleanup [
npm warn cleanup '\\\\?\\C:\\Users\\seekf\\Desktop\\seikotsuin_management_saas\\node_modules\\eslint-plugin-jsx-a11y\\node_modules\\aria-query',
npm warn cleanup [Error: EPERM: operation not permitted, rmdir 'C:\Users\seekf\Desktop\seikotsuin_management_saas\node_modules\eslint-plugin-jsx-a11y\node_modules\aria-query'] {
npm warn cleanup errno: -4048,
npm warn cleanup code: 'EPERM',
npm warn cleanup syscall: 'rmdir',
npm warn cleanup path: 'C:\\Users\\seekf\\Desktop\\seikotsuin_management_saas\\node_modules\\eslint-plugin-jsx-a11y\\node_modules\\aria-query'
npm warn cleanup }
npm warn cleanup ],
npm warn cleanup [
npm warn cleanup 'C:\\Users\\seekf\\Desktop\\seikotsuin_management_saas\\node_modules\\next',
npm warn cleanup [Error: EPERM: operation not permitted, rmdir 'C:\Users\seekf\Desktop\seikotsuin_management_saas\node_modules\next\dist\esm\server\future\route-modules'] {
npm warn cleanup errno: -4048,
npm warn cleanup code: 'EPERM',
npm warn cleanup syscall: 'rmdir',
npm warn cleanup path: 'C:\\Users\\seekf\\Desktop\\seikotsuin_management_saas\\node_modules\\next\\dist\\esm\\server\\future\\route-modules'
npm warn cleanup }
npm warn cleanup ]
npm warn cleanup ]
npm error code 1
npm error path C:\Users\seekf\Desktop\seikotsuin_management_saas\node_modules\supabase
npm error command failed
npm error command C:\WINDOWS\system32\cmd.exe /d /s /c node scripts/postinstall.js
npm error node:internal/modules/run_main:122
npm error triggerUncaughtException(
npm error ^
npm error
npm error Error: Cannot find package 'C:\Users\seekf\Desktop\seikotsuin_management_saas\node_modules\node-domexception\index.js' imported from C:\Users\seekf\Desktop\seikotsuin_management_saas\node_modules\fetch-blob\from.js
npm error Did you mean to import "node-domexception/index.js"?
npm error at legacyMainResolve (node:internal/modules/esm/resolve:204:26)
npm error at packageResolve (node:internal/modules/esm/resolve:778:12)
npm error at moduleResolve (node:internal/modules/esm/resolve:854:18)
npm error at defaultResolve (node:internal/modules/esm/resolve:984:11)
npm error at ModuleLoader.defaultResolve (node:internal/modules/esm/loader:685:12)
npm error at #cachedDefaultResolve (node:internal/modules/esm/loader:634:25)
npm error at ModuleLoader.resolve (node:internal/modules/esm/loader:617:38)
npm error at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:273:38)
npm error at ModuleJob.\_link (node:internal/modules/esm/module_job:135:49) {
npm error code: 'ERR_MODULE_NOT_FOUND'
npm error }
npm error
npm error Node.js v22.14.0
npm notice
npm notice New major version of npm available! 10.9.2 -> 11.5.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.5.2
npm notice To update run: npm install -g npm@11.5.2
npm notice
npm error A complete log of this run can be found in: C:\Users\seekf\AppData\Local\npm-cache_logs\2025-08-02T05_50_09_642Z-debug-0.log
(base) (base) PS C:\Users\seekf\Desktop\seikotsuin_management_saas>

**解決方法：** npm run clean + npm install で解決済み

---

## 【解決済み】2025-08-05 15:18 WSL開発サーバー接続エラー

### 発生したエラー

```
このサイトにアクセスできません
192.168.109.172 で接続が拒否されました。
ERR_CONNECTION_REFUSED
```

### 開発サーバー起動ログ

```
⚠ Port 3000 is in use, using available port 3001 instead.
▲ Next.js 15.3.2 (Turbopack)
- Local:        http://localhost:3001
- Network:      http://192.168.109.172:3001
✓ Ready in 3.3s
```

### 実装した解決策

1. **next.config.js修正**: Next.js 15対応、Turbopack最適化
2. **package.json修正**: `"dev": "next dev --turbo --hostname 0.0.0.0"`
3. **Web検索による解決法特定**: WSL2自動ポート転送問題

### 推奨解決手順

1. Windows PowerShellで `wsl --shutdown` 実行
2. WSL再起動後、以下の順でアクセステスト：
   - `http://localhost:3001` （最優先）
   - `http://127.0.0.1:3001` （localhost失敗時）
   - `http://192.168.109.172:3001` （ネットワークアクセス）

**ステータス：** 設定修正完了、ユーザーによるWSLリセット待ち
