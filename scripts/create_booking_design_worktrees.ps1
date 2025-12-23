# 予約管理UI/UXデザイン案（A〜D案）用のgit worktreeを一括作成するスクリプト
#
# 使い方:
#   .\scripts\create_booking_design_worktrees.ps1
#   .\scripts\create_booking_design_worktrees.ps1 -BasePath "C:\Users\seekf\Desktop\seikotsuin_management_saas"
#
# 説明:
#   ベースリポジトリの親ディレクトリに、A〜D案用の4つのworktreeを作成します。
#   各worktreeは独立したブランチ（feature/booking-design-{A,B,C,D}）で管理されます。

param(
    [string]$BasePath = "C:\Users\seekf\Desktop\seikotsuin_management_saas"
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

# ベースパスの存在確認
if (-not (Test-Path $BasePath)) {
    Write-Error-Custom "ベースリポジトリが見つかりません: $BasePath"
    exit 1
}

Write-Info "ベースリポジトリ: $BasePath"

# ベースリポジトリに移動
Set-Location $BasePath

# Gitリポジトリかどうか確認
if (-not (Test-Path ".git")) {
    Write-Error-Custom "指定されたパスはGitリポジトリではありません"
    exit 1
}

# 親ディレクトリパスを取得
$ParentPath = Split-Path -Parent $BasePath

# デザイン案の定義（A〜D）
$Designs = @(
    @{Name = "A"; Folder = "seikotsuin_booking-design-A"; Branch = "feature/booking-design-A"},
    @{Name = "B"; Folder = "seikotsuin_booking-design-B"; Branch = "feature/booking-design-B"},
    @{Name = "C"; Folder = "seikotsuin_booking-design-C"; Branch = "feature/booking-design-C"},
    @{Name = "D"; Folder = "seikotsuin_booking-design-D"; Branch = "feature/booking-design-D"}
)

Write-Info "============================================"
Write-Info "デザイン案 A〜D 用のworktreeを作成します"
Write-Info "============================================"
Write-Host ""

$SuccessCount = 0
$FailureCount = 0

foreach ($Design in $Designs) {
    $FullPath = Join-Path $ParentPath $Design.Folder

    Write-Info "[$($Design.Name)案] 作成開始..."
    Write-Info "  フォルダ: $FullPath"
    Write-Info "  ブランチ: $($Design.Branch)"

    # 既にフォルダが存在する場合はスキップ
    if (Test-Path $FullPath) {
        Write-Warning "[$($Design.Name)案] フォルダが既に存在します。スキップします: $FullPath"
        $FailureCount++
        Write-Host ""
        continue
    }

    # worktreeを作成
    try {
        $Output = git worktree add $FullPath -b $Design.Branch 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Success "[$($Design.Name)案] worktreeを作成しました"
            $SuccessCount++
        } else {
            Write-Error-Custom "[$($Design.Name)案] worktree作成に失敗しました"
            Write-Error-Custom "  エラー内容: $Output"
            $FailureCount++
        }
    } catch {
        Write-Error-Custom "[$($Design.Name)案] 予期しないエラーが発生しました: $_"
        $FailureCount++
    }

    Write-Host ""
}

# 結果サマリー
Write-Info "============================================"
Write-Info "作成結果サマリー"
Write-Info "============================================"
Write-Success "成功: $SuccessCount 件"
if ($FailureCount -gt 0) {
    Write-Warning "失敗/スキップ: $FailureCount 件"
}
Write-Host ""

# worktreeリストを表示
Write-Info "============================================"
Write-Info "現在のworktree一覧"
Write-Info "============================================"
git worktree list

Write-Host ""
Write-Info "スクリプトが完了しました。"
Write-Info "次のステップ: .\scripts\start_booking_design_dev.ps1 を実行して開発サーバーを起動できます"
