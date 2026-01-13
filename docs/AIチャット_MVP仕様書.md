# AIチャット_MVP仕様書（詳細版）

## 目的
- 静的UI/ダミー応答を排除し、AI相談をMVPとして成立させる。
- チャット履歴の永続化と、権限に応じた参照制御を担保する。

## 担当範囲
- チャットUI/フック/API接続/履歴保存/権限制御

## 依存テーブル
- public.chat_sessions
- public.chat_messages
- public.daily_revenue_summary
- public.staff_performance_summary
- public.patient_visit_summary

## 仕様
### UI
- src/app/chat/page.tsx を動的チャットUIに変更
- 送信/履歴/編集状態を連動

### フック
- src/hooks/useChat.ts
- ローカル保存は廃止
- API経由で送信/履歴取得

### API
- GET /api/chat: session_id or user_id
- POST /api/chat: message, clinic_id, session_id
- 権限: admin/clinic_manager のみ他ユーザー参照可

### AI応答
- MVPはルールベースとGeminiの切り替えを許容
- 失敗時はフォールバック応答

## 競合回避
- 認証導線は認証仕様の担当
- 集計APIは多店舗仕様の担当

## 受け入れ基準
- 送信でAI応答が返る
- 履歴が再取得できる
- 他ユーザーの履歴が参照できない

---

## 実装状況（2025-12-30更新）

### 完了項目

| 項目 | ファイル | 状態 |
|------|----------|------|
| チャットUI | `src/app/chat/page.tsx` | 完了 |
| useChatフック（API連携版） | `src/hooks/useChat.ts` | 完了 |
| Chat API | `src/app/api/chat/route.ts` | 完了（既存） |
| APIクライアント統合 | `src/lib/api-client.ts` | 完了（既存） |

### テスト

| テストファイル | テスト数 | 状態 |
|---------------|---------|------|
| `src/__tests__/api/chat-api.test.ts` | 12 | PASS |
| `src/__tests__/hooks/useChat.test.ts` | 17 | PASS |
| `src/__tests__/components/ChatPage.test.tsx` | 17 | PASS |

**合計: 46テスト全てPASS**

### 実装された機能

1. **動的チャットUI**
   - メッセージ送信/表示
   - ローディング/エラー状態表示
   - クイック質問ボタン（売上分析/患者動向/スタッフ評価/経営アドバイス）
   - 新規チャット開始
   - チャット有効/無効切り替え

2. **useChatフック**
   - API経由でのメッセージ送受信
   - チャット履歴取得
   - セッション管理
   - localStorageは完全廃止

3. **権限制御**
   - 一般ユーザー: 自分の履歴のみ参照可
   - admin/clinic_manager: 他ユーザーの履歴も参照可

4. **AI応答**
   - ルールベース応答（売上/患者/スタッフ/アドバイスのキーワード判定）
   - コンテキストデータ取得（clinic_idがある場合）

---

## 残タスク（Phase 2以降）

### 優先度: 高

| タスク | 詳細 | 見積り |
|--------|------|--------|
| 認証コンテキスト統合 | `src/app/chat/page.tsx`の`clinicId`を認証コンテキストから取得 | 小 |
| Gemini API統合強化 | ルールベースからGemini AIへの切り替えロジック実装 | 中 |

### 優先度: 中

| タスク | 詳細 | 見積り |
|--------|------|--------|
| 履歴検索機能 | 「履歴を検索」ボタンの実装 | 中 |
| エクスポート機能 | 「エクスポート」ボタンの実装 | 中 |
| セッション一覧表示 | 過去のセッション一覧からの選択機能 | 中 |

### 優先度: 低

| タスク | 詳細 | 見積り |
|--------|------|--------|
| 音声入力 | `startVoiceInput`のUI統合 | 小 |
| レート制限UI | 送信頻度制限時のユーザーフィードバック | 小 |
| タイピングインジケータ | AI応答生成中のアニメーション強化 | 小 |

---

## 関連ファイル一覧

```
src/
├── app/
│   ├── chat/
│   │   └── page.tsx          # チャットページUI
│   └── api/
│       └── chat/
│           └── route.ts      # Chat API (GET/POST)
├── hooks/
│   └── useChat.ts            # チャットフック（API連携版）
├── lib/
│   └── api-client.ts         # APIクライアント（chat API定義含む）
└── __tests__/
    ├── api/
    │   └── chat-api.test.ts  # APIテスト
    ├── hooks/
    │   └── useChat.test.ts   # フックテスト
    └── components/
        └── ChatPage.test.tsx # UIテスト
```

---

## 変更履歴

| 日付 | 変更内容 | 担当 |
|------|----------|------|
| 2025-12-30 | TDDでMVP実装完了（UI/フック/テスト） | Claude |
