# main + デザイン案（A〜D）を異なるポートで一括dev起動するスクリプト
#
# 使い方:
#   .\scripts\start_booking_design_dev.ps1
#   .\scripts\start_booking_design_dev.ps1 -DesktopPath "C:\Users\seekf\Desktop"
#
# 説明:
#   main（ポート3000）とデザイン案A〜D（ポート3001〜3004）の開発サーバーを
#   別々のPowerShellウィンドウで起動します。
#
# アクセスURL:
#   - http://localhost:3000 → main
#   - http://localhost:3001 → A案
#   - http://localhost:3002 → B案
#   - http://localhost:3003 → C案
#   - http://localhost:3004 → D案

param(
    [string]$DesktopPath = "C:\Users\seekf\Desktop"
)

# カラー出力用のヘルパー関数
function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# プロジェクトとポートの定義
$Projects = @(
    @{Name = "main"; Path = "seikotsuin_management_saas"; Port = 3000},
    @{Name = "design-A"; Path = "seikotsuin_management_saas\.worktrees\seikotsuin_booking-design-A"; Port = 3001},
    @{Name = "design-B"; Path = "seikotsuin_management_saas\.worktrees\seikotsuin_booking-design-B"; Port = 3002},
    @{Name = "design-C"; Path = "seikotsuin_management_saas\.worktrees\seikotsuin_booking-design-C"; Port = 3003},
    @{Name = "design-D"; Path = "seikotsuin_management_saas\.worktrees\seikotsuin_booking-design-D"; Port = 3004}
)

Write-Info "============================================"
Write-Info "開発サーバー一括起動スクリプト"
Write-Info "============================================"
Write-Host ""

$StartedCount = 0
$SkippedCount = 0

foreach ($Project in $Projects) {
    $FullPath = Join-Path $DesktopPath $Project.Path

    # パスの存在確認
    if (-not (Test-Path $FullPath)) {
        Write-Warning "[$($Project.Name)] フォルダが見つかりません。スキップします: $FullPath"
        $SkippedCount++
        continue
    }

    # package.jsonの存在確認（Next.jsプロジェクトかどうか）
    $PackageJsonPath = Join-Path $FullPath "package.json"
    if (-not (Test-Path $PackageJsonPath)) {
        Write-Warning "[$($Project.Name)] package.jsonが見つかりません。スキップします"
        $SkippedCount++
        continue
    }

    Write-Info "[$($Project.Name)] 開発サーバーを起動します..."
    Write-Info "  パス: $FullPath"
    Write-Info "  ポート: $($Project.Port)"
    Write-Info "  URL: http://localhost:$($Project.Port)"

    # 新しいPowerShellウィンドウで npm run dev を実行
    # ウィンドウタイトルに識別情報を設定
    $WindowTitle = "Dev Server - $($Project.Name) (Port: $($Project.Port))"

    $Command = "cd `"$FullPath`"; `$host.ui.RawUI.WindowTitle = '$WindowTitle'; npm run dev -- --port $($Project.Port)"

    try {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $Command
        Write-Success "[$($Project.Name)] 起動コマンドを実行しました"
        $StartedCount++
    } catch {
        Write-Error-Custom "[$($Project.Name)] 起動に失敗しました: $_"
    }

    Write-Host ""
}

# 結果サマリー
Write-Info "============================================"
Write-Info "起動結果サマリー"
Write-Info "============================================"
Write-Success "起動: $StartedCount 件"
if ($SkippedCount -gt 0) {
    Write-Warning "スキップ: $SkippedCount 件"
}
Write-Host ""

# アクセスURL一覧を表示
Write-Info "============================================"
Write-Info "アクセスURL一覧"
Write-Info "============================================"
foreach ($Project in $Projects) {
    $FullPath = Join-Path $DesktopPath $Project.Path
    if (Test-Path $FullPath) {
        Write-Host "  [$($Project.Name)]" -ForegroundColor Yellow -NoNewline
        Write-Host " http://localhost:$($Project.Port)"
    }
}
Write-Host ""

Write-Info "各開発サーバーは別々のPowerShellウィンドウで起動しています。"
Write-Info "停止する場合は、各ウィンドウでCtrl+Cを押してください。"
Write-Host ""

# サーバー起動待ち時間の案内
Write-Info "サーバーの起動には数秒〜数十秒かかる場合があります。"
Write-Info "ブラウザでアクセスする前に、各ウィンドウで起動完了メッセージを確認してください。"
