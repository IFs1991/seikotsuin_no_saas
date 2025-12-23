# M0: Next.js / React バージョン選定・互換性評価

現在リポジトリは `next@15.4.5` / `react@19.0.0` を採用しているが、MVPフェーズでは安定版(LTS)運用とサードパーティ互換性を優先する必要がある。本書では主要依存関係の互換性を評価し、選定方針と移行手順を整理する。

## 1. 主要依存関係との互換性調査
| パッケージ | 現行バージョン | Next15/React19対応状況 | Next14/React18対応状況 | メモ |
| --- | --- | --- | --- | --- |
| `@supabase/auth-helpers-nextjs` | ^0.10.0 | React 19 (RC) 対応未ドキュメント。Issue #1145 でサーバー側型不整合報告 | 公式サポート済 | 認証周りで型崩れリスク |
| `@tanstack/react-query` | ^5.85.3 | React 19 Transition API 対応進行中 | React 18 で成熟 | `useSuspense` の挙動検証が必要 |
| `react-hook-form` | ^7.54.0 | React 19 で warning (Strict Effects) | React 18 で安定 | beta サポート段階 |
| `@supabase/ssr` | ^0.5.2 | App Router + React19 では `cookies` 周りに breaking の報告あり | Next14.2 + React18 は公式サンプルあり | サーバーコンポーネント互換要確認 |
| `jest` / `@testing-library` | 29.x / 16.x | React19 の `acting` 警告が散発 | React18 では安定 | テストの互換層が未整備 |
| `next` | 15.4.5 | 2025Q1リリース予定の stable までβ扱い | 14.2.x がLTS | App Router安定版 |

## 2. 選択肢比較
| 選択肢 | メリット | デメリット | 対応コスト |
| --- | --- | --- | --- |
| A. 現行 (Next15/React19) 継続 | 新機能を先取り、将来移行コスト小 | 依存関係の未対応・本番サポート外、CIで不安定 | 不具合検知/修正コスト中～高 |
| B. Next14.2.x / React18 LTS へダウングレード | サポート情報豊富、Supabase公式サンプル準拠、テスト安定 | 将来再度アップグレードが必要 | 1～1.5日（パッケージダウングレード＋回帰テスト） |
| C. Next15 Canary + Feature flag | App Router最新API | Canaryの破壊的変更で保守不可 | 継続的追随コスト高 |

## 3. 推奨方針
- **MVPフェーズでは選択肢B (Next14.2.5 / React18.3) を採用**
- 理由: M2以降にE2E/統合テストをCIで安定運用する必要があり、現状の主要ライブラリがReact19最適化前。
- 付随対応: `styled-jsx` -> `13.x`、`eslint-config-next` -> `14.x` に合わせる。

## 4. ダウングレード手順（計画）
1. `package.json` の以下依存をダウングレード
   ```json
   {
     "dependencies": {
       "next": "14.2.14",
       "react": "18.3.1",
       "react-dom": "18.3.1"
     },
     "devDependencies": {
       "eslint-config-next": "14.2.14"
     }
   }
   ```
2. `npm install` 実行後、`node_modules/.cache` を削除し `npx react-codemod update-react-imports` で互換確認
3. App Router の `headers()` / `cookies()` API 変更点を再確認（14.2系では既存コード互換）
4. `src/app/api` の `NextRequest` 型を `next/server` から再インポート（React18向け）
5. `npm run lint && npm run type-check && npm run test` を再実行し、警告が無いことを確認

## 5. 再アップグレードのタイミング
- Supabase Auth Helpers が React19/Next15 GAを正式サポート
- React Query v6 (React19最適化) が安定版リリース
- Next.js 15 LTS (想定: 2025-Q2) 公開
  → 上記3条件が揃ったタイミングで、M3完了後に検討

## 6. 補足
- `React Compiler` の利用は React19 前提のため一旦無効化（`next.config.js` の `experimental.reactCompiler` 判定で制御）
- `src/hooks/useServerAction` などをレビューし、React18 `use` API 未採用であることを確認済
- 本ドキュメントは `docs/milestones/M0` ディレクトリに保管し、将来のバージョン変更時に更新

---
**結論:** MVP期間は Next14.2.x / React18 を採用し、安定したCI/CDとSupabase統合を優先する。
