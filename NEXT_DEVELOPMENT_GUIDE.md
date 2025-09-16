# 🚀 次回開発セッション開始ガイド

## 📋 必読ファイル（開始前5分で確認）

### 1. 進捗確認 📊
```bash
SECURITY_PROGRESS_MEMO.md  # 今回の全作業内容と次回予定
```

### 2. 実装済みコード確認 💻
```bash
# 認証システム
middleware.ts                      # 認証チェック強化済み
src/lib/supabase/server.ts         # サーバーサイド強化済み
src/lib/audit-logger.ts            # 監査ログシステム

# API強化
src/app/api/patients/route.ts      # セキュリティ統合済み（参考実装）

# データベース
src/api/database/schema.sql        # 監査ログテーブル追加済み
src/api/database/rls-policies.sql  # RLSポリシー（実行待ち）
```

### 3. セキュリティ設定 🔒
```bash
.gitignore                         # 機密情報保護済み
.env.local                         # 環境変数（暗号化推奨）
next.config.js                     # セキュリティヘッダー設定済み
```

---

## ⚡ 即座開始コマンド

### 開発環境起動
```bash
cd /path/to/seikotsuin_management_saas
npm run dev
```

### 進捗確認
```bash
# 次回実装ポイントを確認
cat SECURITY_PROGRESS_MEMO.md | grep "次回実装予定" -A 10

# 残タスク確認  
cat SECURITY_PROGRESS_MEMO.md | grep "📋" -A 5
```

---

## 🎯 次回の最初のタスク（30秒で開始）

### 1. RLS有効化完了（優先度: 最高）
```sql
-- Supabaseで実行
\i src/api/database/rls-policies.sql
```

### 2. 動作テスト
```bash
# 認証テスト
curl -X GET http://localhost:3000/api/patients?clinic_id=test
# → 401 Unauthorized が返ればOK
```

### 3. 残りAPIエンドポイント強化
```bash
# 対象ファイル
src/app/api/staff/route.ts
src/app/api/revenue/route.ts  
src/app/api/daily-reports/route.ts
# → patients/route.ts のパターンを適用
```

---

## 📚 参考実装パターン

### 認証チェックテンプレート
```typescript
// 全APIルートの冒頭に追加
const user = await getCurrentUser();
if (!user) {
  await AuditLogger.logUnauthorizedAccess(null, null, path);
  return NextResponse.json(/* 401エラー */);
}

const permissions = await getUserPermissions(user.id);
// 権限チェック + 監査ログ
```

### 監査ログテンプレート
```typescript
// データアクセス時
await AuditLogger.logDataAccess(
  user.id, user.email, 'table_name', targetId, clinicId, ipAddress
);
```

---

## 🔧 開発環境チェックリスト

### 事前確認（2分）
- [ ] Node.js環境が動作中
- [ ] Supabaseプロジェクトが準備済み
- [ ] 環境変数が設定済み（.env.local）
- [ ] MCPサーバーが動作中（Context7）

### 開始時確認（1分）
- [ ] `npm run dev` でローカルサーバー起動
- [ ] `http://localhost:3000` でアクセス確認
- [ ] ブラウザのDevTools > Network でAPIエラー確認

---

## 🎯 Week 1完了基準（残り2-3時間）

### 必須達成項目
- [ ] RLS ポリシー有効化
- [ ] 全APIエンドポイント認証強化
- [ ] 基本認証フロー動作確認

### 達成時の状態
- D評価 → **B評価** レベル到達
- 基本的な医療データ保護要件クリア
- Week 2（暗号化・本格監査ログ）への準備完了

---

## 🚨 緊急時参考情報

### 認証エラー時
```bash
# middleware.ts の認証ロジック確認
# getCurrentUser() 関数の動作確認
# .env.local の SUPABASE_* 設定確認
```

### API エラー時  
```bash
# src/app/api/*/route.ts の認証チェック確認
# RLS ポリシーがSupabaseで有効化されているか確認
```

### データベースエラー時
```bash
# Supabase Dashboard でテーブル・ポリシー確認
# rls-policies.sql の実行状況確認
```

---

**推定作業時間**: 2-3時間でWeek 1完了  
**次回目標**: Row Level Security完全実装 → Week 2（暗号化）開始