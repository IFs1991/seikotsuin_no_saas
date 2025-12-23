# 各worktreeで異なるAIエディタを一括起動するスクリプト
#
# 使い方:
#   .\scripts\start_parallel_ai_editors.ps1
#
# 説明:
#   デザイン案A〜Dのworktreeで、それぞれ異なるAIエディタを起動します。
#   - A案: Cursor
#   - B案: VS Code (Claude Code)
#   - C案: Windsurf
#   - D案: VS Code
#
# 並列実装の流れ:
#   1. このスクリプトで全エディタを起動
#   2. .\scripts\start_booking_design_dev.ps1 で開発サーバーを起動
#   3. 各AIに同じタスクを与えて並列実装
#   4. http://localhost:3001〜3004 で結果を比較

param(
    [string]$BasePath = "C:\Users\seekf\Desktop\seikotsuin_management_saas\.worktrees"
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

# エディタとworktreeの対応定義
$Editors = @(
    @{Name = "A案"; Editor = "Cursor"; Command = "cursor"; Path = "seikotsuin_booking-design-A"},
    @{Name = "B案"; Editor = "VS Code (Claude Code)"; Command = "code"; Path = "seikotsuin_booking-design-B"},
    @{Name = "C案"; Editor = "Windsurf"; Command = "windsurf"; Path = "seikotsuin_booking-design-C"},
    @{Name = "D案"; Editor = "VS Code"; Command = "code"; Path = "seikotsuin_booking-design-D"}
)

Write-Info "============================================"
Write-Info "並列AI開発用エディタ一括起動スクリプト"
Write-Info "============================================"
Write-Host ""

$SuccessCount = 0
$FailureCount = 0

foreach ($Item in $Editors) {
    $FullPath = Join-Path $BasePath $Item.Path

    # パスの存在確認
    if (-not (Test-Path $FullPath)) {
        Write-Warning "[$($Item.Name)] worktreeが見つかりません: $FullPath"
        $FailureCount++
        Write-Host ""
        continue
    }

    Write-Info "[$($Item.Name)] $($Item.Editor)を起動します..."
    Write-Info "  パス: $FullPath"

    try {
        # エディタを起動
        Start-Process $Item.Command -ArgumentList "`"$FullPath`""
        Write-Success "[$($Item.Name)] $($Item.Editor)を起動しました"
        $SuccessCount++

        # 次のエディタ起動まで少し待つ（リソース負荷軽減）
        Start-Sleep -Seconds 1
    } catch {
        Write-Error-Custom "[$($Item.Name)] 起動に失敗しました: $_"
        Write-Error-Custom "  コマンド '$($Item.Command)' が見つからない可能性があります"
        Write-Error-Custom "  エディタがインストールされているか、PATHが通っているか確認してください"
        $FailureCount++
    }

    Write-Host ""
}

# 結果サマリー
Write-Info "============================================"
Write-Info "起動結果サマリー"
Write-Info "============================================"
Write-Success "成功: $SuccessCount 件"
if ($FailureCount -gt 0) {
    Write-Warning "失敗: $FailureCount 件"
}
Write-Host ""

# 次のステップの案内
Write-Info "============================================"
Write-Info "次のステップ"
Write-Info "============================================"
Write-Host ""
Write-Info "1. 各エディタで同じタスクを実装してください"
Write-Host "   例: '予約フォームに日時選択UIを実装して'" -ForegroundColor Yellow
Write-Host ""
Write-Info "2. 開発サーバーを起動して結果を確認："
Write-Host "   .\scripts\start_booking_design_dev.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Info "3. ブラウザで各デザイン案を比較："
Write-Host "   - A案 (Cursor):       http://localhost:3001" -ForegroundColor Yellow
Write-Host "   - B案 (Claude Code):  http://localhost:3002" -ForegroundColor Yellow
Write-Host "   - C案 (Windsurf):     http://localhost:3003" -ForegroundColor Yellow
Write-Host "   - D案 (VS Code):      http://localhost:3004" -ForegroundColor Yellow
Write-Host ""
Write-Info "4. 最も良い実装をmainブランチにマージ"
Write-Host ""

Write-Success "エディタの起動が完了しました！"
Write-Info "各エディタで並列実装を開始してください。"
Write-Host ""
