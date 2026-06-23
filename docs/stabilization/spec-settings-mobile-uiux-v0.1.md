# 設定画面（統合設定ハブ）モバイルUI/UX 仕様書 v0.1（素案）

作成日: 2026-06-20
ステータス: **素案 / Draft**（実装着手前のたたき台。未決事項は §12 に集約）
対象リポジトリ: `IFs1991/seikotsuin_management_saas`
対象領域: `(app)/settings/**`（新設）/ 既存 `(app)/admin/(protected)/settings` / シフト申請（`ShiftRequestsWorkflow`）/ モバイル(<768px)表示 / 全ロール
優先度: P2（安定化フェーズ。認可・ロール境界の回帰リスクが高い領域のため小さく刻む）

---

## 0. この素案の位置づけ

これまでの予約・日報・患者分析モバイル仕様（[[spec-reservations-mobile-uiux-v0.1]] 等）と同じハウススタイルの、チーム実装向けの叩き台。

- 本v0.1は **全ロール共通の「設定ハブ」`(app)/settings` を新設**し、その中に **シフト申請** を1セクションとして組み込む方針（2026-06-20 ユーザー決定、§5・§6.4）。
- 既存の管理者専用設定 `(app)/admin/(protected)/settings`（マスター詳細レイアウト）は、**段階的に統合 or 併存**させる（一度に置換しない。§7-S5）。
- **認可・テナント分離・clinic scope・ロール境界の不変条件は一切緩めない**。設定項目・シフト申請の各操作は**サーバ側（route guard / RLS / API access ガード）で権限判定**し、UIの出し分けは二次的な体験向上に留める（クライアント非表示だけで認可しない。AGENTS.md / CLAUDE.md / [[manager-analytics-rpc-scope]]）。
- TDDで進める（CLAUDE.md）。各フェーズは「失敗するテスト → 最小実装 → リファクタ」。
- 日付・時刻は必ず `src/lib/jst.ts` のJSTユーティリティを使う（DoD-06、UTC/JST混在禁止）。**シフト申請ワークフローは現状 `new Date().toISOString()` 直書きでJST非準拠であり、本仕様で是正する**（§6.5）。
- モバイルのボトムシート／表示器は予約仕様で新設する **共通 `src/components/ui/sheet.tsx` を再利用**し、重複実装しない（[[spec-reservations-mobile-uiux-v0.1]] §6.6）。

---

## 1. 要約

「設定」をスマホで実用化するうえで、現状は次の構造的欠陥がある。

1. **一般スタッフ/セラピスト向けの設定画面が存在しない**。`(app)/settings` は無く、設定は管理者専用 `/admin/settings` だけ。セラピスト/スタッフは自分のアカウント設定もシフト申請も「設定」から触れない。
2. **既存の管理者設定がモバイル非最適**。`/admin/settings` は左サイドバー（7カテゴリ）＋右本文のマスター詳細レイアウト（`xl:flex-row`）で、狭い画面では破綻。ベタ書き色（`bg-white`/`bg-blue-600`/`text-gray-*`/`bg-gray-50`）多数でダークモードも崩れる。
3. **シフト申請（主役＝セラピスト/スタッフ本人）が設定の外に分散**。現在は運用メニューの「希望シフト」(`/staff/shift-requests`)。さらに `ShiftRequestsWorkflow` は `min-w-[820px]` のワイドテーブル＋2カラム(`lg:grid-cols-[...360px]`)で**スマホで横スクロール地獄**、かつ**日時がJST非準拠**（DoD-06違反）。
4. **シフト申請の入口がロール別に4経路へ分散**（self/review/manager/HQ）。動線が分かりにくい。

本仕様は、**全ロール共通の設定ハブを新設し、モバイルでは「カテゴリ一覧 → ドリルダウン」の単一カラム動線**に統一。シフト申請を設定内のロール対応セクションへ集約し、ワイドテーブルのカード化・JST是正・トークン色化を行う。

---

## 2. 背景・目的

### 2.1 背景

- セラピスト/スタッフは施術の合間に**片手・短時間**で自分のアカウントやシフト希望を扱う。管理者は同じ「設定」入口から院・サービス・システム設定に到達したい。
- 現行 `/admin/settings` は管理者前提のPCレイアウト（サイドバー固定）で、モバイルの「上から順にたどる」動線になっていない。
- シフト申請ロールは `therapist`/`staff`（本人申請）と `admin`/`manager`/`clinic_admin`（管理）に分かれ（`src/lib/staff/shift-requests/access.ts`）、入口も4経路に散っている。

### 2.2 目的

- **全ロールが単一の「設定」入口**から、自分の権限で許された設定だけにモバイルで到達できる。
- セラピスト/スタッフが**設定からシフト申請（希望シフト提出）を完遂**できる。
- 管理/確認系のシフトワークフローもモバイルで破綻なく操作できる（テーブルのカード化）。
- シフト関連日時の**JST一貫化**（DoD-06の是正）。

### 2.3 非目的（v0.1）

- 設定**項目そのものの新規追加**（実装済み項目の範囲を変えない。`IMPLEMENTED_SETTINGS_ITEM_IDS` を勝手に増やさない）。
- シフト申請の**業務ロジック変更**（期間ステータス遷移・承認/差戻し・確定変換ロジック・権限境界は不変）。
- `/admin/settings` の即時廃止（段階統合。v0.1では併存を許容、§7-S5）。
- 認可モデル・RLS・clinic scope 解決の変更。ネイティブアプリ化・PWA。

---

## 3. スコープ

### 3.1 対象（v0.1）

- 新設 `(app)/settings`（全ロール、モバイル<768px最適化を主眼にPCも破綻させない）。
- モバイル動線: **設定カテゴリ一覧（縦リスト）→ 項目ドリルダウン**（戻る導線つき）。
- 設定ハブへの**シフト申請セクション**の組み込み（self/review/manager をロールで出し分け、§6.4）。
- `ShiftRequestsWorkflow` のモバイル表現（ワイドテーブル→カード、2カラム→単一カラム、シート化）と**JST是正**（§6.5）。
- 設定/シフト各操作の**サーバ側ロールガード**の明示と、UI出し分けの整合（§6.6）。
- middleware の保護ルート整合（`(app)/settings` の保護、pilot mode 整合、§6.7）。

### 3.2 対象外（明確に温存・禁止）

- 設定項目の機能追加・`UnavailableSettingsCard`（パイロット未提供）項目の実装。
- シフト申請の権限境界・ステータス機械・変換ロジックの変更（`src/lib/staff/shift-requests/*`）。
- `/admin/settings` の削除（段階統合の完了は別PR/別判断、§12-Q1）。
- 認可をクライアント非表示だけで済ませること（**必ずサーバ判定**）。
- `appointments` への書き込み・RLSバイパスの拡大。

---

## 4. 現状の実装インベントリ（実装者向け）

| 要素 | ファイル | モバイル/課題 |
|---|---|---|
| 管理者設定（マスター詳細） | `src/app/(app)/admin/(protected)/settings/page.tsx` | `xl:flex-row` サイドバー＋本文。`bg-white`/`bg-blue-600`/`text-gray-*`/`bg-gray-50` ベタ書き。モバイル動線なし |
| 設定カテゴリ定義 | 同上 `SETTINGS_CATEGORIES` / `IMPLEMENTED_SETTINGS_ITEM_IDS` / `AREA_MANAGER_SETTINGS_ITEM_IDS` | ハブの項目ソースとして再利用（増やさない） |
| 各設定コンポーネント | `src/components/admin/*-settings.tsx`（`dynamic`） | 内容は流用。表示器をモバイル対応 |
| シフトワークフロー（共有） | `src/components/staff/shift-requests-workflow.tsx` | `min-w-[820px]` テーブル / `lg:grid-cols-[...360px]` / ベタ書き色 / **JST非準拠**（`getTodayDate`・`getDefaultEndDate`・`getDefaultDateTime`・`toApiDateTime`・`formatDateTime` が生 `Date`/`toISOString`） |
| シフト申請(self) | `src/app/(app)/staff/shift-requests/page.tsx`（`mode='self'`「希望シフト提出」） | 設定内 self セクションへ集約。ルートは互換維持（リダイレクト可） |
| シフト確認(院長) | `src/app/(app)/staff/shift-requests/admin/page.tsx`（`mode='review'`） | 設定内 review セクション |
| シフト管理(EM/HQ) | `src/app/(app)/manager/shift-requests/page.tsx`・`src/app/(app)/admin/(protected)/shift-requests/page.tsx`（`mode='manager'`） | 設定内 manager セクション |
| シフト権限ガード | `src/lib/staff/shift-requests/access.ts`（`SHIFT_REQUEST_*_ROLES` / `assertShiftRequest*`） | **変更しない**。出し分け・サーバ判定の基準として参照 |
| ナビ定義 | `src/lib/navigation/items.ts`（`shift-requests`「希望シフト」/ 各 admin メニュー） | 設定集約に伴いシフト系導線を整理（§6.7） |
| ロール正規化 | `src/lib/constants/roles.ts`（`normalizeRole`/`isTherapistRole`/`isAreaManagerRole`/`isHQRole` 等） | 出し分けに再利用 |
| ボトムシート | `src/components/ui/sheet.tsx`（[[spec-reservations-mobile-uiux-v0.1]]で新設） | 詳細/フォームのモバイル表示に**再利用** |

---

## 5. ロール別 設定ハブ要件

設定ハブのセクション可視性は、**サーバ側で解決したロール／権限**に基づく（UIはそれを反映するだけ）。

| セクション | 対象ロール | 内容 | 書き込み |
|---|---|---|---|
| アカウント | 全ロール | 自分のプロフィール表示・パスワード/2FA導線（既存機能の範囲） | 本人のみ |
| **シフト申請** | `therapist`/`staff` | 希望シフト提出（`mode='self'`） | 本人分（`SHIFT_REQUEST_SELF_SUBMIT_ROLES`） |
| **シフト確認/管理** | `clinic_admin`(review) / `admin`・`manager`(manager) | 提出確認・承認/差戻し・確定変換 | 各ロール権限（`SHIFT_REQUEST_MANAGER_ROLES`/`_CONVERSION_ROLES`） |
| 院・サービス・保険・予約・通知 | `admin`(テンプレート) / `manager`(担当院サブセット) | 既存 `SETTINGS_CATEGORIES` の実装済み項目 | 既存ガード（clinic scope）に従う |
| データ管理 | `admin` | 既存範囲 | 既存ガード |
| システム | `admin` | 基本/セキュリティ/バックアップ（既存 `SystemSettings`） | 既存ガード |

- エリアマネージャーの設定サブセット（`AREA_MANAGER_SETTINGS_ITEM_IDS` / `AREA_MANAGER_ITEM_COPY`）と clinic 選択前提（`requiresClinicSelection`）は**そのまま踏襲**。
- 「シフト確認/管理」の self/review/manager の出し分けは、既存ルート（self/review/manager）の振り分けと**同じ権限境界**で行う（新たに緩めない）。

---

## 6. UI/UX設計

### 6.1 設定ハブのモバイル動線（一覧 → ドリルダウン）

- **モバイル(<768px)**: 設定トップは**カテゴリの縦リスト**（各行 = アイコン＋タイトル＋`ChevronRight`、44×44pt以上）。タップで項目一覧 → さらにタップで設定本文へ遷移する**1カラムのドリルダウン**。各下層に「戻る」導線（ヘッダ左、またはOS戻る）を置く。
- **PC(`md`以上)**: 既存 `/admin/settings` のマスター詳細（サイドバー＋本文）に相当する2カラムを維持できる。共通の項目定義から両レイアウトを描く。
- 検索（`Search` 入力＋`searchText` フィルタ）は既存ロジックを流用。モバイルでは上部 sticky。
- 表示出し分けの分岐は CSS優先、JS判定が要る箇所のみ `useMediaQuery`（予約仕様 M1 で新設の共通フックを再利用、`window.innerWidth` 直読み禁止＝hydration不整合回避）。

### 6.2 ルーティング構成（新設）

- `(app)/settings`（ハブのトップ）。配下に項目ルート（例 `(app)/settings/[section]` か、状態管理での切替）を置く。**実装方式は §12-Q2 で確定**（URLでの深いリンク可否）。
- middleware の `PROTECTED_ROUTE_PREFIXES` に `/settings` を追加（§6.7）。未認証は `/login?redirectTo=` へ（管理者専用ルートではないので `/admin/login` ではなく `/login`）。

### 6.3 色・トークン・ダークモード

- 既存設定／シフトワークフローの**ベタ書き色を全廃**し、デザイントークン（`bg-background`/`bg-card`/`text-foreground`/`text-muted-foreground`/`border-border`、選択中は `bg-primary/10 text-primary` 等）へ置換。
- バッジ（シフト種別 `bg-emerald-100` 等、ステータス）はトークン化したセマンティックカラーに寄せる（[[UI02-pilot-hardcoded-colors]] の方針に整合）。

### 6.4 設定内シフト申請セクション

- 設定ハブの「シフト申請」項目を開くと、**ロールに応じた `ShiftRequestsWorkflow` のモード**を表示する。
  - `therapist`/`staff` → `mode='self'`（希望シフト提出）。
  - `clinic_admin` → `mode='review'`、`admin`/`manager` → `mode='manager'`。
  - 出し分けは**サーバ解決ロールに基づく**。クライアントは表示のみ。実際の操作可否は API 側 `assertShiftRequest*`（`access.ts`）が最終ガード（緩めない）。
- clinic 選択は既存 `selected-clinic-context` を流用（エリアマネージャーは担当院選択前提）。

### 6.5 シフトワークフローのモバイル化＋JST是正

- **テーブル → カード**: `min-w-[820px]` の希望シフト表を、モバイルでは**1申請=1カード**（種別チップ／時間／優先度／状態／メモ）に置換。`md`以上はテーブル維持可。
- **2カラム → 単一カラム**: `lg:grid-cols-[...360px]` の「一覧＋提出」を、モバイルでは縦積み。提出フォームは**ボトムシート（共通 `sheet.tsx`）＋下部固定の提出バー（セーフエリア考慮）**で起動する案を基本とする。
- **入力**: `type='date'`/`type='datetime-local'`/`inputmode` を適切化し、優先度スライダー等のタップ領域を44pt以上に。
- **JST是正（必須・DoD-06）**: `getTodayDate`/`getDefaultEndDate`/`getDefaultDateTime`/`toApiDateTime`/`formatDateTime` を **`src/lib/jst.ts` ベースに置換**。日付既定値・送信値・表示が全てJSTで一貫すること。サーバ送信のISO化もJST基準の境界で行う。
- 管理/確認系の承認・差戻し・確定変換アクションはカード内に配置（誤操作防止のため確認を挟む）。**ロジック・権限は不変**。

### 6.6 認可の二層化（必須の不変条件）

- **第一層（最終ガード）**: サーバ。設定本文・シフト各操作の API/route が既存ガード（clinic scope `ensureClinicAccess`/`canAccessClinicScope`、`assertShiftRequest*`、`verifyAdminAuth` 等）で判定。
- **第二層（体験）**: クライアントのセクション出し分け。**サーバ判定の代替にしない**。`clinic_id`/`role`/`user_id` に触れる変更のためテスト追加必須（§9、CLAUDE.md）。

### 6.7 ナビ／middleware 整合

- 設定集約に伴い、運用メニューの「希望シフト」(`shift-requests` / `/staff/shift-requests`)・各 admin のシフトメニューは**設定への導線へ整理**（`src/lib/navigation/items.ts`）。**ルート自体は互換維持**（既存ブックマーク向けにリダイレクト可、§12-Q3）。
- middleware: `/settings` を保護ルートへ追加。**pilot mode（`NEXT_PUBLIC_PILOT_MODE`）のリダイレクト対象に設定/シフト申請を含めない**こと（業務上必要なため。現行のpilot redirect一覧と整合確認）。
- モバイルボトムナビ（`mobile-bottom-nav.tsx`）に設定導線を置く場合もトークン色で（既存のベタ書き `bg-white`/`text-gray-500` 問題に追従しない）。

---

## 7. 段階的実装計画（リスク順・1フェーズ=1PR目安）

| Phase | 内容 | リスク | 主な成果物 |
|---|---|---|---|
| **S1** | 設定項目定義の共有化（`SETTINGS_CATEGORIES` 等を再利用可能な形へ抽出）＋ロール別可視セクション解決の純関数化 | 低 | `getVisibleSettingsSections({role,...})` 等＋テスト |
| **S2** | `(app)/settings` ハブ新設（モバイル1カラム動線・トークン色・middleware保護追加） | 中 | 新ルート / レイアウト / middleware整合 |
| **S3** | シフトワークフローのJST是正（`jst.ts`化）＝**DoD-06是正**（先に固定） | 中 | `shift-requests-workflow.tsx` 日時関数置換＋回帰テスト |
| **S4** | シフトワークフローのモバイル化（テーブル→カード／2カラム→単一／提出シート） | 中 | モバイル表現（`sheet.tsx`再利用） |
| **S5** | 設定内シフト申請セクション統合＋ナビ導線整理（旧ルートはリダイレクト互換） | 中 | ハブ内セクション / nav更新 |
| **S6** | 既存 `/admin/settings` のハブへの統合（or 併存方針の確定）・ベタ書き色一掃 | 中〜高 | 統合 or 併存の最終形 |

各フェーズ独立リリース可能。S3（JST是正）は単独でも価値があり、最優先で固定してよい。

---

## 8. 受け入れ基準（Acceptance Criteria）

- AC-1: 375px幅で `(app)/settings` を開くと、横スクロールなしにカテゴリを縦スクロールで把握でき、タップでドリルダウン→戻るができる。
- AC-2: セラピスト/スタッフでログインすると、設定内に「シフト申請（希望シフト提出）」が表示され、設定から提出を完遂できる。
- AC-3: 各ロールで**許可された設定セクションのみ**が表示され、かつ**サーバ側でも非許可操作が拒否**される（クライアント非表示だけに依存しない）。
- AC-4: シフト申請の日付既定値・送信値・表示が全てJST（`src/lib/jst.ts`）で一貫する（現行のJST非準拠が解消）。
- AC-5: シフトの希望一覧がモバイルで横スクロールなしにカードで把握できる（`min-w-[820px]` 依存の解消）。
- AC-6: 全インタラクティブ要素のタップ領域が44×44pt以上。提出/保存バーがボトムナビ・セーフエリアに隠れない。
- AC-7: ダークモードが設定・シフト画面全体で破綻しない（ベタ書き色なし）。
- AC-8: エリアマネージャーの設定サブセット・clinic選択前提・read-only境界が維持される。
- AC-9: 旧シフトルート（`/staff/shift-requests` 等）が互換維持され、既存導線が壊れない。
- AC-10: シフト申請の権限境界・ステータス遷移・確定変換ロジックが不変（数値・遷移が従来と一致）。

---

## 9. テスト要件（TDD）

- **単体（純関数）**: `getVisibleSettingsSections({role, isAreaManager})` / シフトモード解決（role→`self`/`review`/`manager`）の網羅。`*.test.ts`（node）。
- **認可回帰（必須）**: `role`/`clinic_id`/`user_id` に触れるため、(a) ロール別セクション可視性、(b) **サーバガードが非許可操作を拒否**（`assertShiftRequest*`・clinic scope）、(c) エリアマネージャーのサブセット境界、を追加（CLAUDE.md セキュリティ不変条件）。
- **JST是正回帰（必須）**: シフト日時関数がJST境界で正しいこと（日跨ぎ・既定値・送信ISO）。`src/lib/jst.ts` 利用を固定するテスト（DoD-06再発防止）。
- **コンポーネント**: 設定ハブのドリルダウン／戻る、シフトのテーブル→カード切替（`*.test.tsx`、jsdom）。
- **E2E(Playwright)**: モバイルviewport（375×812）で「設定→シフト申請→提出→反映」「ロール別に見えない設定が無いこと」。`src/__tests__/e2e-playwright/`、seed前提。
- 既存CI必須ゲート（`test:pr05:focused`）を壊さないこと。
- **壊れた実装に合わせてテストを変えない**（CLAUDE.md）。JST非準拠は是正する側。

---

## 10. 非機能・アクセシビリティ

- タップ領域44pt（`touch-target-comfortable` 標準化）。本文16px以上・コントラストAA。
- ドリルダウンのフォーカス管理・`aria-current`/`role`、戻る導線のキーボード操作。
- パフォーマンス: 設定本文は既存どおり `dynamic` 遅延ロード。シフト一覧は1期間規模を想定（仮想化不要、大量時は将来検討）。
- 既存 `sheet.tsx`（Radix Dialog ベース）のフォーカストラップ・`aria-modal`・スワイプ閉じを継承。

---

## 11. リスクと緩和

| リスク | 緩和策 |
|---|---|
| ロール境界の回帰（設定/シフトが越権表示・越権操作） | サーバガードを最終防衛線に据え、出し分けは二次。各PRに認可テスト必須 |
| JST是正による日時ずれ再発 | S3で先に回帰テストを固定してから置換。境界（日跨ぎ）を明示テスト |
| 旧導線の破壊 | 旧ルートはリダイレクト互換を維持し、nav整理は段階的。互換テスト先行 |
| `/admin/settings` 二重保守 | S6まで併存を許容しつつ、項目定義を単一ソース化（S1）して乖離を防ぐ |
| pilot mode で設定/シフトが誤ってリダイレクト | middleware の pilot redirect 一覧との整合テスト |
| SSR/hydration不整合 | 出し分けはCSS優先・JSは `useMediaQuery` に一元化 |

---

## 12. 未決事項（要判断）

- ~~**Q0a**: 「設定」の範囲~~ → **決定（2026-06-20）**: 全ロール共通の設定ハブ `(app)/settings` を新設。既存 `/admin/settings` は段階統合 or 併存（§0・§5・S6）。
- ~~**Q0b**: 旧「希望シフト」導線~~ → **決定（2026-06-20）**: 設定へ集約し旧導線は段階統合。旧ルートは互換維持（リダイレクト可、§6.7）。
- **Q1**: `/admin/settings` は最終的に廃止して `(app)/settings` へ一本化するか、管理者専用の深い設定は別ルートで残すか。
- **Q2**: 設定の項目遷移は URL（`(app)/settings/[section]` でディープリンク可）にするか、ハブ内状態のみにするか。
- **Q3**: 旧シフトルートのリダイレクト方式（恒久リダイレクト／導線のみ非表示でルート残置）。
- **Q4**: シフト管理/確認（review/manager）の置き場は設定内に集約で良いか、管理者は管理セクション（`/admin`・`/manager`）側にも残すか。
- **Q5**: アカウント設定セクションで本人が変更できる範囲（プロフィール／パスワード／2FA／通知）の v0.1 スコープ。
- **Q6**: タブレット（`md`〜`lg`）はマスター詳細（PC）扱いで良いか。

---

## 13. 参考

- 作業規約: `AGENTS.md` / 開発ルール・落とし穴: `CLAUDE.md` / 安定化基準: `docs/stabilization/DoD-v0.1.md`
- 既存設定: `src/app/(app)/admin/(protected)/settings/page.tsx` / `src/components/admin/*-settings.tsx`
- シフト: `src/components/staff/shift-requests-workflow.tsx` / `src/lib/staff/shift-requests/access.ts` / 各 `shift-requests` ルート
- ナビ・ロール: `src/lib/navigation/items.ts` / `src/lib/constants/roles.ts`
- 共通シート: `src/components/ui/sheet.tsx`（[[spec-reservations-mobile-uiux-v0.1]] §6.6）
- JST: `src/lib/jst.ts`
- 関連仕様: [[spec-reservations-mobile-uiux-v0.1]] / [[spec-daily-reports-mobile-uiux-v0.1]] / [[spec-patient-analysis-mobile-uiux-v0.1]]
