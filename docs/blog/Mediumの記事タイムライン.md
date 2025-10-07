# Mediumの記事タイムライン

以下は8週間（約50～55日）で進めるMediumシリーズの公開計画です。週3本（キャリア／プロダクト進捗／ドメインインサイト）を基本サイクルとし、執筆→校正→公開を各記事2日サイクルで回します。

| 週 | 日付目安 | カテゴリ | 仮タイトル | 主な内容・参照資料 | 作業メモ |
|----|---------|-----------|------------|---------------------|-----------|
| Week1 | Mon (Day 1) | Career | 鍼灸師から始まった僕のキャリアマップ | キャリア概観、生成AIとの出会い／PHASE1報告など | 月:執筆→火:校正・公開 |
|      | Thu (Day 4) | Build  | M2進捗レポート：クリニック権限で動くダッシュボードまで | docs/MVP実装計画.yaml、src/app/dashboard | 水:下書き→木:公開 |
|      | Sat (Day 6) | Insight| 整骨院・鍼灸院の業務から見えたデータ運用の壁 | 現場課題のエピソード、README類 | 金:執筆→土:公開 |
| Week2 | Mon (Day 8) | Career | クルーズ船で施術した日々と“現場判断”の難しさ | クルーズ船での体験談 | |
|      | Thu (Day 11) | Build | 日報APIにZodバリデーションを入れた理由 | src/app/api/daily-reports/route.ts、テスト | コード断片掲載 |
|      | Sat (Day 13) | Insight | SaaS法人営業で掴んだ「届かないプロダクト」の共通点 | 営業経験の学び | |
| Week3 | Mon (Day 15) | Career | 個人事業主→サラリーマン→再び個人開発へ | 今年の転職背景と50日開発の決意 | |
|      | Thu (Day 18) | Build  | Hooksをクリニックコンテキストに束ねた話 | providers/user-profile-context, hooks/useDashboard | 図解添付 |
|      | Sat (Day 20) | Insight| RLSと監査ログ：整骨院SaaSのセキュリティ基盤 | SECURITY系ドキュメント | |
| Week4 | Mon (Day 22) | Career | 出張鍼灸師として見た患者フォローのリアル | 個人事業時代の顧客対応 | |
|      | Thu (Day 25) | Build | M2後半：統合テストとPlaywright準備 | PHASE3_PLANNING、E2E ToDo | |
|      | Sat (Day 27) | Insight| 整骨院のKPIと可視化の勘所 | KPIs やPHASE1資料 | |
| Week5 | Mon (Day 29) | Career | サラリーマンのバックオフィスで感じた“現場との距離” | 転職後の経験談 | |
|      | Thu (Day 32) | Build | 日報フォームUX改善：エラーの届け方 | src/app/daily-reports/input | Before/After |
|      | Sat (Day 34) | Insight| AI時代に医療職がプログラミングを学ぶ意味 | 生成AI活用術 | |
| Week6 | Mon (Day 36) | Career | 生成AIが押してくれたコードの扉 | 学習に使ったAIツール例 | |
|      | Thu (Day 39) | Build | Supabase + Next.js構成を選んだ理由 | アーキ図・構成メモ | |
|      | Sat (Day 41) | Insight| 現場導入に向けたオンボーディング設計 | PHASE3B_ROADMAP など | |
| Week7 | Mon (Day 43) | Career | 鍼灸師がSaaSを売る：営業再発見の話 | 営業チャレンジ | |
|      | Thu (Day 46) | Build | M2まとめ：統合テスト前の最終チェックリスト | MVP実装計画の進捗 | |
|      | Sat (Day 48) | Insight| 監査ログと法令遵守―ヘルスケアSaaSの最低ライン | SECURITY docs | |
| Week8 | Mon (Day 50) | Career | 開発50日で得た“医療×テック”のヒント | 総括、これからのキャリア | |
|      | Thu (Day 53) | Build | ベータ運用へ：M3/M4で磨くポイント | PHASE3/4資料、進捗 | |
|      | Sat (Day 55) | Insight| 次の50日で磨きたいもの（コミュニティへの呼びかけ） | 改善ロードマップ | |

## 運用メモ
- **日曜夕方**：翌週3本の記事アウトラインをdocs/blog/配下で設計
- **執筆サイクル**：執筆→翌日校正→公開（Mediumで公開し、X/LinkedInでも告知）
- 各記事から関連ドキュメント（MVP実装計画、SECURITY系、PHASE報告書など）へリンクを貼り、Build in Public感を出す
- 途中でM2達成やM3移行の節目があれば、タイムラインに追記して更新した計画を共有
