# Playwright baseURL and Windows EPERM Spec v0.1

## Overview
- Purpose: Eliminate webServer port drift and reduce Windows EPERM failures to stabilize E2E startup.
- DoD: DOD-06, DOD-07, DOD-11 (docs/stabilization/DoD-v0.1.md).
- One task = one PR.
- Priority: Medium
- Risk: CI/CD stability, Developer experience

## Evidence (Current Behavior)
- playwright.config.ts: baseURL is derived from env, but webServer.command is fixed to `npm run dev`, so port mismatch can occur.
- `reuseExistingServer: !process.env.CI` allows fallback ports when 3000 is in use.
- Current webServer.timeout is 120,000ms which may be insufficient for cold starts on Windows.

## Port Resolution Priority

The following precedence should be documented and enforced:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `PLAYWRIGHT_BASE_URL` env | `http://localhost:3001` |
| 2 | `NEXT_PUBLIC_APP_URL` env | `http://localhost:3000` |
| 3 | Default | `http://localhost:3000` |

## Plan

### 1. Single source of truth for baseURL/port
- Derive the port from baseURL and pass it to webServer.command with `-- --port <port>`.
- Implementation in playwright.config.ts:
  ```typescript
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';

  // Extract port from baseURL
  const port = new URL(baseURL).port || '3000';

  webServer: isLocalBaseUrl
    ? {
        command: `npm run dev -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000, // 3 minutes for cold starts
      }
    : undefined,
  ```

### 2. webServer startup stability
- Increase webServer.timeout to 180,000ms (3 minutes) for cold starts on Windows.
- Add explicit port conflict detection:
  ```typescript
  // Add to global-setup.ts
  import net from 'net';

  async function checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  }
  ```
- If port is not available and `reuseExistingServer` is false, fail with clear error message.

### 3. Windows EPERM runbook
Document the following in docs/test-runbook.md:

#### Prerequisites
- Run terminal as Administrator when running E2E tests
- Stop stray node processes: `taskkill /F /IM node.exe`
- Add project folder to Windows Defender exclusions

#### Bundled Chromium usage
```bash
# Force bundled Chromium (avoid PATH conflicts)
npx playwright install chromium
set PLAYWRIGHT_BROWSERS_PATH=0
npm run test:e2e:pw
```

#### Jest EPERM mitigation
- Use `--runInBand` or `--maxWorkers=1` to avoid file locking conflicts
- Add to package.json scripts:
  ```json
  "test:windows": "jest --runInBand --testPathIgnorePatterns=e2e"
  ```

### 4. PowerShell helper script
Create `scripts/fix-windows-eperm.ps1`:
```powershell
# fix-windows-eperm.ps1
# Run as Administrator

Write-Host "Stopping stray Node processes..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Clearing npm cache..."
npm cache clean --force

Write-Host "Reinstalling Playwright browsers..."
npx playwright install chromium

Write-Host "Adding Windows Defender exclusion..."
$projectPath = (Get-Location).Path
Add-MpPreference -ExclusionPath $projectPath -ErrorAction SilentlyContinue

Write-Host "Done! Try running tests again."
```

## Non-goals
- Changing Playwright test content.
- Adding new browser channels.

## Acceptance Criteria (DoD)
- DOD-06: baseURL and webServer start on the same port with no fallback.
- DOD-07: npm run test:e2e:pw -- --project=chromium starts without spawn EPERM on Windows.
- DOD-11: Jest EPERM mitigation steps are documented in docs/test-runbook.md.

## Rollback
- If port enforcement conflicts with local dev, revert to manual PLAYWRIGHT_BASE_URL usage and remove the forced port.
- Rollback steps:
  1. Revert playwright.config.ts changes
  2. Remove port extraction logic
  3. Document manual `PLAYWRIGHT_BASE_URL` usage

## Verification
```bash
# Verify port alignment
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e:pw -- --project=chromium

# Expected output:
# [WebServer] Starting server on port 3000...
# [WebServer] Server ready at http://localhost:3000
```

## Files to Modify
- playwright.config.ts
- src/__tests__/e2e-playwright/global-setup.ts
- docs/test-runbook.md
- scripts/fix-windows-eperm.ps1 (new file)
- package.json (add test:windows script)

## Troubleshooting Guide

| Symptom | Cause | Solution |
|---------|-------|----------|
| `Port 3000 is in use` | Previous dev server running | Run `npx kill-port 3000` or `taskkill /F /IM node.exe` |
| `spawn EPERM` | Windows permission issue | Run as Administrator, add Defender exclusion |
| `ECONNRESET` | Server not ready | Increase webServer.timeout |
| `TypeError: Cannot read properties` | .next build artifacts missing | Run `npm run build` first |
