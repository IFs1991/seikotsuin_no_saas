# モバイル UI/UX 資産台帳 v0.2

作成日: 2026-06-29  
対象仕様: `docs/stabilization/spec-mobile-uiux-static-integration-v0.2.md`

## 取り込み方針

- 原本: `モバイルUIUX設計/`
- 配信用コピー: `private-assets/mobile-uiux/`
- public 配信: なし
- 配信方式: `/mobile-uiux/screens/[resource]` の認証済み Route Handler
- 原本変更: なし
- DB / migration / RLS policy 変更: なし

Phase 0 の public 配信は、合成データ判定の確実性と未認証取得リスクを避けるため採用しない。v0.2 の「判断不能なら Phase 1 を先に実装する」方針に従い、最初から認証済み配信へ寄せる。

## 実行資産

| 原本ファイル                             | 配信用ファイル                                       | public 配信 | サイズ | SHA-256                                                            | 合成データ確認                                               | 変更有無     |
| ---------------------------------------- | ---------------------------------------------------- | ----------: | -----: | ------------------------------------------------------------------ | ------------------------------------------------------------ | ------------ |
| `ホームダッシュボードモバイルUI.dc.html` | `private-assets/mobile-uiux/home.dc.html`            |      しない |  77183 | `EF21B4F837BE30D0FFFB2C59266CEA1DB4E79D27AF6C9B4348F438B26EFD350E` | 未認証 public 配信しないため公開リスクなし。実データ接続なし | 内容変更なし |
| `予約モバイルUI.dc.html`                 | `private-assets/mobile-uiux/reservations.dc.html`    |      しない |  75519 | `1BA6CA03208B1EE49E5370DC20F8C09DC8AC8E0B3DBD9138F14F498EF98C76ED` | 未認証 public 配信しないため公開リスクなし。実データ接続なし | 内容変更なし |
| `患者分析モバイルUI.dc.html`             | `private-assets/mobile-uiux/patients.dc.html`        |      しない |  47617 | `01F8DFE89E2F905E3DEA2DE1FA6E28EE9D3F6A78F645F6DEC747A4748ADD5461` | 未認証 public 配信しないため公開リスクなし。実データ接続なし | 内容変更なし |
| `日報モバイルUI.dc.html`                 | `private-assets/mobile-uiux/daily-reports.dc.html`   |      しない |  43277 | `D60CDBF0F036A45D3814D360B50784002855E94D896FF04579A9B2C4B240CF37` | 未認証 public 配信しないため公開リスクなし。実データ接続なし | 内容変更なし |
| `設定モバイルUI.dc.html`                 | `private-assets/mobile-uiux/settings.dc.html`        |      しない |  74152 | `9F5E4EA565F8B4BB88008405DE3BF2685ED87A47F0F40C8813A2801593D324F1` | 未認証 public 配信しないため公開リスクなし。実データ接続なし | 内容変更なし |
| `設定詳細モバイルUI.dc.html`             | `private-assets/mobile-uiux/settings-detail.dc.html` |      しない |  80908 | `578A801E8759C35AF71C18B0A2CC5B2163014D7A81EA534FD8EA15774F163B73` | 未認証 public 配信しないため公開リスクなし。実データ接続なし | 内容変更なし |
| `clinic-shared.js`                       | `private-assets/mobile-uiux/clinic-shared.js`        |      しない |   3674 | `816A56FA058E17705EB9AEA547876BE84830AE202D3C8A7B9F0E3990988455F3` | 実データなし                                                 | 内容変更なし |
| `support.js`                             | `private-assets/mobile-uiux/support.js`              |      しない |  58047 | `7C923C3F6027E809DCCA3E6B4AE7B6D5BD45576D76894A257EB4607B49BEA005` | 実データなし                                                 | 内容変更なし |

## 除外資産

| 原本ファイル / ディレクトリ | public 配信 | 除外理由                                         |
| --------------------------- | ----------: | ------------------------------------------------ |
| `README.md`                 |      しない | 内部説明資料であり画面実行に不要                 |
| `Design.md`                 |      しない | 内部デザイン仕様であり画面実行に不要             |
| `CLAUDE.md`                 |      しない | AI 作業規約であり画面実行に不要                  |
| `uploads/`                  |      しない | 元資料・設計資料を含む可能性があり画面実行に不要 |
| `screenshots/`              |      しない | 確認画像であり画面実行に不要                     |
| `.thumbnail`                |      しない | 画面実行に不要                                   |

## 確認事項

- `/mobile-uiux` は `(app)` 配下の認証済み入口ページ。
- `/mobile-uiux/screens/*` は Route Handler 内でも認証・role allowlist を確認する。
- `support.js` と `clinic-shared.js` も同じ Route Handler で認証済み配信する。
- `.dc.html` の `./support.js` と `import('./clinic-shared.js')` は `/mobile-uiux/screens/<screen>` からの相対解決で成立する。
- `public/mobile-uiux/` は作成しない。
