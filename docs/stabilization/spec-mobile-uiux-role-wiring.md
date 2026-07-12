# 仕様: モバイルUI/UX ロール配線の完成 (role wiring)

- 対象ブランチ: `claude/pc-screen-design-improvements-r6jhn5` (PR #84)
- 関連: `docs/stabilization/spec-pc-screen-design-improvements.md`(PC側)、`Design.md`(EXTENDモード)

## 背景 / 問題

`/mobile-uiux` は本番稼働していたが、ロールごとのUI出し分けに5つの断線があった:

1. **ロール未注入**: 各画面のDCスクリプトに5ロール分のバリアント(閲覧専用バナー・承認UI・全社サマリ等)が設計済みだが、実ユーザーのロール(`context.role.canonical`)が `state.role` に届かず、全員がハードコードされた既定バリアント(予約=セラピスト、日報=セラピスト等)を見ていた。マネージャーには編集UIが見え、保存時にサーバー拒否エラーになる
2. **偽動作機能**: 設定ハブのシフト申請・出勤申請はAPI未接続で、提出が成功したように見えてローカルstateにしか残らなかった
3. **死にタブ**: therapist/staff に権限のないホームタブが表示され、タップしても無反応だった
4. **403導線**: ランチャーが全ロールに6枚のカードを表示し、therapist/staff がホーム/設定詳細で403に突き当たった
5. **不足配線**: manager/admin ホームの担当院カード(院別比較)がデータソース不在で非表示だった

## 決定事項

- シフト申請系はデータテーブル未実装のため**バックエンドは今回スコープ外**。UIは「準備中」バッジ+タップ時トーストで残す(完全非表示にしない)
- 担当院カードは既存RPC `manager_revenue_period_totals` で実データ接続する
- デザイン資産 `private-assets/mobile-uiux/*.dc.html` は非改変。すべて生成層(`html-transform.ts` / `dc-script-patch.ts` / `bridge-manifest.ts`)で実現し、生産資産を再生成する

## canonical → DC ロールマッピング(サーバー write allowlist と1:1)

| 画面 (DC既定) | admin | clinic_admin | manager | therapist | staff |
|---|---|---|---|---|---|
| home (`store`) | `manager`† | `store` | `manager` | (サーバー403) | (サーバー403) |
| reservations (`therapist`) | `manager` | `manager` | `area`(閲覧専用) | `therapist` | `staff` |
| patients (`staff`) | 注入なし | 注入なし | 注入なし | 注入なし | 注入なし |
| daily-reports (`therapist`) | `store` | `store` | `manager`(閲覧) | `therapist` | `staff` |
| settings (`therapist`) | `admin` | `clinic_admin` | `manager` | `therapist` | `staff` |
| settings-detail (`manager`) | 注入なし(ロールピルのみ実名) | 同左 | 同左 | (サーバー403) | (サーバー403) |

根拠(サーバー側):

- 予約 write: `STAFF_ROLES` + `deniedRoles: ['manager']` → manager のみ `area`(閲覧専用)
- 日報 write: `DAILY_REPORT_MUTATION_ROLES = [admin, clinic_admin, therapist, staff]` → manager のみ閲覧ビュー
- 設定 write: `ADMIN_SETTINGS_MUTATION_ROLES = {admin, clinic_admin, manager}` → clinic_admin に院・サービス系カテゴリを開放

†DC `admin` バリアントはデータソースのないセクション(経営シグナル・院別パフォーマンス・偽の管理アクショングリッド)を有効化するため使用しない。admin は DC `manager` レイアウト+ラベルのみ「全社サマリ」「要注意院」(canonical role から導出)。

**fail-closed 方針**: マップ外ロール・context欠落・スコープ解決失敗時は DC 既定の最小権限バリアントに留まる。ロール分岐は `state.role` でなく `__mobileUiuxContext.role.canonical` を直読み(setStateバッチングの順序依存回避)。

## 実装内容

1. **下部ナビのロール別非表示** (`html-transform.ts`): `MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE`(bridge-manifest から export)から `html[data-mobile-uiux-canonical-role="…"] [data-mobile-uiux-nav-target="…"] { display: none !important; }` を生成し本番シェルCSSに追加。ブリッジが boot 時(画面が visibility:hidden の間)にロールを `<html>` に刻印するためフラッシュなし。ナビDOMは5項目のまま(資産検証が要求)。navigation.ts との表の同期は deep-equal テストで担保
2. **ランチャーフィルタ** (`launcher.ts` 新設): `canRoleAccessMobileUiuxScreen` でカードをフィルタ。therapist/staff は4枚(ホーム・設定詳細なし)
3. **ロール注入** (`dc-script-patch.ts` 各adapter): `applyReadData('context')` 時に上表のマッピングで `setState({role})`。予約は `selfOnly: role==='therapist'` を同期。日報は manager 時に標準バリアントの未提出/提出済みバナーを強制抑止
4. **シフト系の準備中化** (settings adapter): `openCat` をラップし shift_self/attendance/shift_review/shift_manage のタップを「この機能は準備中です」トーストに差し替え(nav遷移なし)。偽の下書き/未確認バッジ用サンプル状態(`shiftReqs`/`shiftSubs`/`attReqs`)をクリアし、カテゴリ行に「準備中」バッジを付与
5. **担当院カード** (`/api/mobile-uiux/home` + home adapter): manager/admin のとき `resolveMobileUiuxPrincipal` + `evaluateMobileUiuxEnvRollout` で解決した clinic id **のみ**を `manager_revenue_period_totals`(service_role・p_clinic_ids 無検証)に渡す — これがテナント分離の唯一の保証で、route テストで契約化。院名は RLSクライアントの `fetchClinicNames` で join し、引けない院は出さない。カードは売上・来院数のみ実数、前日比は空欄・キャンセル率は `—`。カード存在時は KPI の売上・来院を担当院合計に置換

## シフト申請スタブの復活条件

シフト申請のバックエンド(テーブル+API)実装時に:

1. settings adapter の `__mobileUiuxPrimeShiftStubs` / `__mobileUiuxApplyShiftStubBadges` を撤去(または対象idを絞る)
2. モバイルBFFに `shiftRequestWriteEnabled` フラグを既存3系統(reservation/dailyReport/settings)と同じパターンで追加
3. 生産資産を再生成し、`production-asset.ts` の準備中スタブ存在チェックを撤去

## テスト

- `src/__tests__/mobile-uiux/dc-script-patch.test.ts`: 画面×ロールの注入・帰結(閲覧専用バナー、カテゴリ出し分け、準備中スタブ、担当院カード整形、KPI集計、fail-closed)
- `src/__tests__/api/mobile-uiux-home.test.ts`: RPC が principal 解決済み id と完全一致で呼ばれること(テナント境界)、staff等でRPC不呼出、RPC失敗時のfail-soft
- `src/__tests__/mobile-uiux/html-transform.test.ts` / `production-asset.test.ts`: ナビ非表示CSS・準備中スタブの資産内存在、ナビ5項目維持
- `src/__tests__/mobile-uiux/navigation-contract.test.ts`: ロール表の bridge/navigation 同期
- `src/__tests__/mobile-uiux/launcher.test.ts`: ロール別カードセット・fail-closed
