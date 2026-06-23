# ログイン時ダッシュボード モバイルUI/UX（情報密度）仕様書 v0.1（素案）

作成日: 2026-06-21
ステータス: **素案 / Draft**（実装着手前のたたき台。未決事項は §12 に集約）
対象リポジトリ: `IFs1991/seikotsuin_management_saas`
対象領域: `(app)/dashboard`（ログイン後ホーム）/ モバイル(<768px)表示 / 対象ロール=`admin`・`manager`・`clinic_admin`
優先度: P2（安定化フェーズ。集計の表示のみ最適化、業務ロジック非変更）

---

## 0. この素案の位置づけ

これまでの予約・日報・患者分析・設定モバイル仕様（[[spec-reservations-mobile-uiux-v0.1]] / [[spec-daily-reports-mobile-uiux-v0.1]] / [[spec-patient-analysis-mobile-uiux-v0.1]] / [[spec-settings-mobile-uiux-v0.1]]）と同じハウススタイルの、チーム実装向けの叩き台。

- 本v0.1は **ログイン直後に見るダッシュボードを「一目で全状況が分かる高情報密度」**にするための最適化（ユーザー要望 2026-06-21）。
- **対象ロールは `admin`・`manager`・`clinic_admin` のみ**。`therapist`・`staff` にはダッシュボードは不要で、運用ホーム（`/reservations`）へ誘導する（既存 [[spec-therapist-uiux-slimming-v0.3]] の方針＝therapist `dashboard` は hide／home は `/reservations` に整合）。
- **データ取得・集計ロジックは非変更（表示の最適化のみ）**。clinic scope・RLS・認可ガードは緩めない。manager の担当院スコープはアプリ層が唯一の保証である点を尊重（[[manager-analytics-rpc-scope]]）。
- TDDで進める（CLAUDE.md）。各フェーズは「失敗するテスト → 最小実装 → リファクタ」。
- 日付・時刻は必ず `src/lib/jst.ts` ／ JST 固定の `Intl`（`timeZone:'Asia/Tokyo'`）を使う（DoD-06、UTC/JST混在禁止）。

---

## 1. 要約

ログイン時ダッシュボードには、ロール別に2系統の実装がある。

- **`ManagerDashboard`（担当エリア／area manager）**: 既に**高密度**。KPIグリッド7枚＋日報提出状況＋要確認＋担当院別カード＋タイムライン＋ショートカット。JSTも正しい。→ **モバイルの密度微調整とトークン色の残課題のみ**。
- **`ClinicDashboard`（単一院／clinic_admin 等が見る）**: ページ内実装。**低密度**で要望と逆行している。具体的には:
  1. **巨大カードの縦積み**（`max-w-4xl`・`text-2xl md:text-4xl` の特大数値）で、1画面に入る情報が少なく**多数スクロール必須**。
  2. **「他ページへ移動して見る」前提**（クイックアクションが日報/予約/AIチャットへ遷移するだけで、当日の要点がその場で分からない）。
  3. **ベタ書き色**（`text-primary-600`・`bg-primary-600 text-white`・`border-red-500`・`text-blue-600`）でダークモード/トークン方針に不整合。

本仕様は、**`ClinicDashboard` を「単一院の当日サマリーを一目で把握できる高密度ダッシュボード」へ作り替え**、`ManagerDashboard` の良い情報設計（KPIグリッド・要確認・状態チップ）を単一院スコープに展開する。あわせて**対象外ロールにはダッシュボードを出さない**よう整える。

---

## 2. 背景・目的

### 2.1 背景

- 院長・マネージャー・本部はログイン直後に「今日どうなっているか」を**最短で**把握したい。施術現場のセラピスト/スタッフは日報・予約が主で、ダッシュボードは不要。
- 現行 `ClinicDashboard` は「大きく1〜2指標を見せる」設計で、当日の予約数・キャンセル・日報提出・異常値などを**1画面に同居させていない**ため、結局あちこちのページを開くことになる。

### 2.2 目的

- 対象ロールが**ログイン直後の1〜2スクロール内**で、当日の主要KPI・状態・要確認を**他ページへ移動せず**把握できる。
- ロール別の意味のある密度（単一院 / 担当エリア / 本部）を、共通の情報設計で提供する。
- 対象外ロールに不要なダッシュボードを表示しない（迷いと負荷の削減）。

### 2.3 非目的（v0.1）

- 集計・KPI算出ロジック、API、データ契約（`DashboardData` / `ManagerDashboardResponse` 等）の変更。
- 新規KPI・新規データソースの追加（既存で取得済みの値の見せ方を最適化するに留める）。
- `/admin` 管理ホーム（`AdminDashboard`）の作り替え（§12-Q1で扱い方針のみ）。
- ネイティブアプリ化・PWA・オフライン。

---

## 3. スコープ

### 3.1 対象（v0.1）

- `(app)/dashboard` のロール分岐とロールゲート（対象3ロール以外を運用ホームへ）。
- `ClinicDashboard`（単一院）の**高密度モバイル再設計**（KPIグリッド・状態チップ・当日要点の同居・ミニ推移）。
- `ManagerDashboard`（担当エリア）の**モバイル密度微調整＋残ベタ書き色のトークン化**。
- 既存取得値の範囲での「他ページに行かなくても分かる」要点の同居（当日売上/患者/予約/キャンセル、日報提出状況、異常値アラート、直近推移）。

### 3.2 対象外（明確に温存・禁止）

- `useDashboard` / `useManagerDashboard` / `useAdminDashboard` の取得仕様・APIの変更。
- KPIの定義・しきい値（キャンセル率25%等）・算出の変更。
- clinic scope/RLS/認可の緩和。`appointments` への書き込み。
- `/admin` の `AdminDashboard` 本体の再設計（別PR/別仕様）。

---

## 4. 現状の実装インベントリ（実装者向け）

| 要素 | ファイル | 状態 / モバイル課題 |
|---|---|---|
| ルート分岐 | `src/app/(app)/dashboard/page.tsx` | `isAreaManagerRole`→`ManagerDashboard`、それ以外→`ClinicDashboard(profile.clinicId)`。**対象外ロールのゲートなし** |
| 単一院ダッシュ | 同上 `ClinicDashboard`/`DailyDataCard`/`AICommentCard`/`QuickActionsCard` | **低密度**・特大数値・縦積み・ベタ書き色・他ページ誘導前提 |
| 単一院データ | `src/hooks/useDashboard.ts`（`api.dashboard.get(clinicId)`、5分間隔/可視化時再取得） | 取得仕様は維持。`window.location.href` 遷移はナビ最適化余地 |
| 収益チャート | `src/components/dashboard/revenue-chart.tsx`（`dynamic ssr:false`） | モバイルで高さ/凡例調整（[[spec-patient-analysis-mobile-uiux-v0.1]] §チャート方針に準拠） |
| 混雑ヒートマップ | `src/components/dashboard/patient-flow-heatmap.tsx`（`dynamic ssr:false`） | モバイルで折返し/可読性 |
| 担当エリアダッシュ | `src/components/dashboard/manager-dashboard.tsx` | **高密度・良好**。残課題=`text-blue-600`/`border-blue-200`/`border-gray-200` 等のトークン化、KPIグリッドのモバイル列調整 |
| 担当エリアデータ | `src/hooks/useManagerDashboard.ts` | 維持 |
| 本部/管理ホーム | `src/components/dashboard/admin-dashboard.tsx`＋`admin-dashboard.utils.ts` | `(app)/dashboard` ではなく管理系で使用。本仕様は対象外（§12-Q1） |
| ロール判定 | `src/lib/constants/roles.ts`（`isAreaManagerRole`/`isTherapistRole`/`isHQRole`/`normalizeRole`） | ゲートと分岐に再利用 |

---

## 5. ロール別 ダッシュボード要件

| ロール | ログイン後ホーム | ダッシュボード内容 | 密度の狙い |
|---|---|---|---|
| `clinic_admin`（院長/店舗管理者） | `/dashboard`（単一院） | 自院の当日KPI・日報提出・予約/キャンセル・異常値・直近推移を**同居** | **最重要**。1〜2スクロールで自院の全状況 |
| `manager`（エリアマネージャー） | `/dashboard`（担当エリア） | 既存 `ManagerDashboard`（担当院横断KPI・要確認・院別カード・タイムライン） | 密度は良好。モバイル微調整のみ |
| `admin`（本部） | `/dashboard` の扱いは §12-Q1 | 当面は既存挙動を踏襲（本部の集約は `/admin`/`/multi-store`） | 別仕様で扱う |
| `therapist`・`staff` | **`/reservations`**（ダッシュボード不要） | — | 表示しない（運用ホームへ誘導） |

- 対象外ロールのゲートは、既存 [[spec-therapist-uiux-slimming-v0.3]]（therapist の login redirect / home = `/reservations`、`dashboard` hide）と整合させる。`staff` も同様に扱う（§12-Q2）。
- **ゲートはサーバ/ルート側で行い**（クライアント非表示だけに依存しない）、直URLアクセス時も対象外ロールは運用ホームへ。

---

## 6. UI/UX設計

### 6.1 情報密度の原則（このページの肝）

- **「一目で全部・移動不要」**: ログイン直後の可視領域に当日の要点を集約する。詳細リンクは残すが、**主要数値・状態はその場で読める**こと（リンク先に行かないと分からない、を避ける）。
- 特大数値（`text-4xl` 単独表示）をやめ、**コンパクトKPIグリッド**（ラベル＋値＋前日比/前週比などの補助値を1枚に）に置換。`ManagerDashboard` の `SummaryKpis` 設計を単一院に展開。
- モバイルKPIは **2列グリッド**を基本（`grid-cols-2`、`xl` で4列）。1枚に「値＋補助（比較/状態）」を収める。
- セクション順（情報の優先度順・上から）: ①当日KPI ②要確認/異常値 ③日報提出状況 ④直近推移（ミニ） ⑤ショートカット（最後・従属）。

### 6.2 ClinicDashboard（単一院）の再設計

- **当日KPIグリッド**（2列）: 本日売上（前日比）/ 本日患者数 / 本日予約数（前週同曜日比）/ キャンセル率 等、**既存 `DashboardData` に存在する値の範囲**で同居。新規KPIは追加しない（無い値はカードを出さない）。
- **要確認/異常値**: 既存 `alerts` をページ下部の独立カードではなく**上部の要確認ブロック**へ。0件時は「異常なし」を明示（不安解消）。
- **日報提出状況**: 当日の自院日報の提出/要確認/未提出をチップで（取得済みの範囲で。無ければ §12-Q3）。
- **直近推移（ミニ）**: `RevenueChart` をモバイルでは**高さ固定・凡例簡素**のミニ表示に（[[spec-patient-analysis-mobile-uiux-v0.1]] のチャート方針に準拠）。ヒートマップは折りたたみ/下部。
- **AIコメント**: 補助情報として簡潔に（高さを取りすぎない。トグルで全文）。
- **クイックアクション**: 最下部の従属要素に降格。**「移動しないと分からない」状態を作らない**（アクションは“次の操作”であって“情報源”ではない）。

### 6.3 ManagerDashboard（担当エリア）の微調整

- KPIグリッドのモバイル列（現 `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`）を**`grid-cols-2` 基本**に寄せ、可視情報量を増やす（折返し・省略の可読性確認）。
- 残ベタ書き色（`text-blue-600`/`border-blue-200`/`text-blue-700`/`border-gray-200` 等）を**トークン化**（[[UI02-pilot-hardcoded-colors]] 方針）。
- 情報設計（要確認・院別カード・タイムライン）は良好なso維持。担当院別カードの密度（4KPI＋導線）も踏襲。

### 6.4 色・トークン・ダークモード

- ベタ書き色を全廃し、デザイントークン（`bg-background`/`bg-card`/`text-foreground`/`text-muted-foreground`/`border-border`、強調は `text-primary`/`bg-primary/10`、警告は `destructive` 系）へ統一。
- KPIの比較値（プラス/マイナス）はセマンティックカラー（増=肯定/減=注意は文脈依存。色だけに意味を持たせずラベル併記）。

### 6.5 レイアウト/ナビ整合

- `p-4 pt-8` 等の上余白と `max-w-*` を見直し、モバイルで**横全幅・縦密度**を活かす（`max-w-4xl` の中央寄せで横が余る問題を解消）。
- 最下部要素がボトムナビ・セーフエリアに隠れない下部余白を確保。
- データ更新は既存の5分間隔＋可視化時再取得を維持。手動「再読み込み」をヘッダに（`ManagerDashboard` に倣う）。

### 6.6 認可・スコープ（不変条件）

- 表示は**自分の clinic scope 内**のデータのみ（RLS/ガードを通った値を描画するだけ。手書きのスコープ判定をしない）。
- manager の担当院横断はアプリ層スコープが唯一の保証（[[manager-analytics-rpc-scope]]）。**集計の絞り込みをUI側で再実装しない**。
- 対象外ロールのゲートはサーバ/ルートで（§5）。`role`/`clinic_id` に触れるためテスト追加必須（§9）。

---

## 7. 段階的実装計画（リスク順・1フェーズ=1PR目安）

| Phase | 内容 | リスク | 主な成果物 |
|---|---|---|---|
| **D1** | 対象ロールゲート（`therapist`/`staff` を `/reservations` へ、対象3ロールのみ表示）＋判定の純関数化 | 低 | `getDashboardAccess({role})` 等＋テスト / page.tsx 分岐 |
| **D2** | `ClinicDashboard` の色トークン化（ベタ書き一掃・ダークモード） | 低 | 表示のみ変更 |
| **D3** | `ClinicDashboard` 高密度再設計（KPIグリッド2列・要確認上部化・密度レイアウト） | 中 | 単一院の情報設計刷新 |
| **D4** | チャート/ヒートマップのモバイル最適化（高さ固定・凡例簡素・折りたたみ） | 中 | ミニ推移表示 |
| **D5** | `ManagerDashboard` モバイル密度微調整＋残ベタ書き色トークン化 | 低〜中 | 担当エリアの仕上げ |

各フェーズ独立リリース可能。D1（ゲート）とD2（色）は単独でも価値があり先行可。

---

## 8. 受け入れ基準（Acceptance Criteria）

- AC-1: `clinic_admin` で375px幅でログインすると、**1〜2スクロール以内**で当日の主要KPI（売上/患者/予約/キャンセル等の取得済み値）・要確認/異常値・日報提出状況が**他ページへ移動せず**読める。
- AC-2: 当日KPIがモバイルで**2列グリッド**で表示され、特大数値1枚だけの低密度表示が解消されている。
- AC-3: `therapist`/`staff` は `/dashboard` 直アクセス時も運用ホーム（`/reservations`）へ誘導され、ダッシュボードが表示されない。
- AC-4: 対象3ロール以外には集計が表示されない（サーバ/ルートゲートが効く。クライアント非表示だけに依存しない）。
- AC-5: `manager` のダッシュボードがモバイルで密度良く表示され、横スクロール/過剰スクロールがない。
- AC-6: ダークモードがダッシュボード全体で破綻しない（ベタ書き色なし）。
- AC-7: 日時・当日判定が全てJST（`src/lib/jst.ts` / `Asia/Tokyo`）で一貫する。
- AC-8: 表示が自分の clinic scope 内に限定され、KPI数値が従来（集計ロジック）と一致する（表示のみ変更）。
- AC-9: 全インタラクティブ要素のタップ領域が44×44pt以上で、最下部要素がボトムナビ/セーフエリアに隠れない。

---

## 9. テスト要件（TDD）

- **単体（純関数）**: `getDashboardAccess({role})`（表示可否＋リダイレクト先）、KPIカード生成（取得値→表示モデル）の網羅。`*.test.ts`（node）。
- **認可/ゲート回帰（必須）**: `role`/`clinic_id` に触れるため、(a) 対象外ロールの非表示＋誘導、(b) clinic scope外データが出ないこと、(c) manager スコープの維持、を追加（CLAUDE.md セキュリティ不変条件）。
- **JST回帰（必須）**: 当日判定・日時表示がJST境界で正しいこと（日跨ぎ）。
- **コンポーネント**: 密度レイアウト（2列KPI）・要確認0件表示・チャートのモバイル表現。`*.test.tsx`（jsdom）。
- **数値不変**: 既存KPIの値が表示変更前後で一致（スナップショット/算出テスト）。
- **E2E(Playwright)**: モバイルviewport（375×812）で「clinic_admin ログイン→当日要点が1〜2スクロールで見える」「therapist ログイン→/reservations へ」。seed前提。
- 既存CI必須ゲート（`test:pr05:focused`）を壊さないこと。**壊れた実装に合わせてテストを変えない**（CLAUDE.md）。

---

## 10. 非機能・アクセシビリティ

- タップ領域44pt・本文16px以上・コントラストAA。比較値は色＋符号/ラベル併記（色覚配慮）。
- KPIグリッドは数値の桁折返し（`break-words`）で崩れない（`ManagerDashboard` に倣う）。
- パフォーマンス: チャート/ヒートマップは `dynamic ssr:false` を維持。5分間隔更新・可視化時再取得を維持。
- フォーカス/`aria-label`（各セクション）を付与（既存 `aria-label='サマリーKPI'` に倣う）。

---

## 11. リスクと緩和

| リスク | 緩和策 |
|---|---|
| 集計値のズレ（表示変更で数値が変わる） | 算出は触らず表示のみ。数値不変テストを先に固定 |
| ロールゲートの取りこぼし（越権/締め出し） | ゲートを純関数化＋サーバ/ルート判定。各ロールのテスト |
| 高密度化による可読性低下（詰め込みすぎ） | 優先度順セクション・2列基準・余白設計。実機（小型端末）確認 |
| ベタ書き色の見落とし | [[UI02-pilot-hardcoded-colors]] のスキャン方針に追従 |
| JST取り違え | 当日判定をJSTユーティリティに一元化、境界テスト |

---

## 12. 未決事項（要判断）

- ~~**Q0a**: ダッシュボードの対象ロール~~ → **決定（2026-06-21）**: `admin`/`manager`/`clinic_admin` のみ。`therapist`/`staff` は不要で運用ホームへ（§5）。
- ~~**Q0b**: 情報密度の方針~~ → **決定（2026-06-21）**: 一目で全状況・他ページ移動不要の高密度（§6.1）。
- **Q1**: `admin`（本部）が `/dashboard` で見るのは何か（単一院ダッシュ／`/admin` の `AdminDashboard` へ誘導／本部集約版）。現状は `ClinicDashboard(profile.clinicId)` に落ちるため要確定。
- **Q2**: `staff` ロールの扱いは `therapist` と完全に同じ（`/reservations` 誘導）で良いか。
- **Q3**: 単一院ダッシュに「日報提出状況」を出すための値が既存取得（`DashboardData`）に含まれるか。無ければ v0.1 では省略し別途検討。
- **Q4**: 当日KPIに含める指標セット（売上/患者/予約/キャンセル＋α）の最終確定（取得済み値の範囲で）。
- **Q5**: AIコメント・ヒートマップの優先度（密度確保のため折りたたみ既定にするか）。

---

## 13. 参考

- 作業規約: `AGENTS.md` / 開発ルール・落とし穴: `CLAUDE.md` / 安定化基準: `docs/stabilization/DoD-v0.1.md`
- 既存実装: `src/app/(app)/dashboard/page.tsx` / `src/components/dashboard/manager-dashboard.tsx` / `admin-dashboard.tsx`
- データ取得: `src/hooks/useDashboard.ts` / `useManagerDashboard.ts` / `useAdminDashboard.ts`
- ロール: `src/lib/constants/roles.ts`
- JST: `src/lib/jst.ts`
- 関連仕様: [[spec-therapist-uiux-slimming-v0.3]] / [[spec-settings-mobile-uiux-v0.1]] / [[spec-reservations-mobile-uiux-v0.1]] / [[spec-daily-reports-mobile-uiux-v0.1]] / [[spec-patient-analysis-mobile-uiux-v0.1]]
